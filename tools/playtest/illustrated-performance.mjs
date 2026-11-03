// Reproducible before/after diagnostic. SwiftShader runs on the host CPU;
// results are relative and are not a physical phone performance measurement.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const label=process.env.VR_LABEL??'current',out=`output/illustrated-performance/${label}`;
await mkdir(out,{recursive:true});
// Serve the isolated harness through Playwright so the benchmark works against
// either the source tree or a packaged build without pre-generated output/.
let harness=await readFile('game.html','utf8');
harness=harness.replace('<head>','<head><base href="/">')
 .replace('<script type="module" src="./src/main.js"></script>',`<script>
 const memory=new Map([['void-privateer-settings-v1',JSON.stringify({music:0,effects:0})]]);
 Storage.prototype.getItem=function(k){return memory.get(String(k))??null;};
 Storage.prototype.setItem=function(k,v){memory.set(String(k),String(v));};
 Storage.prototype.removeItem=function(k){memory.delete(String(k));};
 Storage.prototype.clear=function(){memory.clear();};
 </script><script type="module" src="/src/main.js"></script><script type="module" src="/__illustrated-performance-capture.js"></script>`);
const capture=await readFile('tools/playtest/pixel-grid-review/capture.js','utf8');
assert.ok(harness.includes('/__illustrated-performance-capture.js'),'game entry point changed');
const profiles=[
 {name:'desktop',viewport:{width:1440,height:810},isMobile:false,hasTouch:false},
 {name:'phone',viewport:{width:932,height:430},isMobile:true,hasTouch:true},
];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 for(const profile of profiles){
  if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(profile.name))continue;
  const {name,...device}=profile;
  const context=await browser.newContext({...device,deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/__illustrated-performance-capture.html*',route=>route.fulfill({contentType:'text/html',body:harness}));
  await context.route('**/__illustrated-performance-capture.js',route=>route.fulfill({contentType:'text/javascript',body:capture}));
  await context.addInitScript(()=>{let seed=0x519bc821;Math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/__illustrated-performance-capture.html?startup-probe=1`);
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame&&window.pixelGridCapture);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);});
  const scenes={};
  for(const scene of ['concourse','asteroids','graveyard','station']){
   if(process.env.VR_SCENES&&!process.env.VR_SCENES.split(',').includes(scene))continue;
   console.log(profile.name,scene);
   const state=await page.evaluate(async id=>{const state=await pixelGridCapture.prepare(id);pixelGridCapture.setGrid(null);return state;},scene);
   if(scene!=='concourse')assert.ok(state.ships?.every(s=>s.model&&s.visible),JSON.stringify(state));
   const timing=await page.evaluate(async id=>{
    const rt=__VOID_PRIVATEER__.getRuntime(),sceneView=id==='concourse'?rt.ui.concourseShip:rt.renderer;
    const renderer=sceneView.renderer,gl=renderer.getContext(),previous=renderer.info.autoReset;
    if(gl.isContextLost()||sceneView.contextLost)throw new Error('Rendering context was lost during performance capture');
    renderer.info.autoReset=false;
    const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const draw=()=>{sceneView.render();gl.finish();};
    for(let i=0;i<6;i++)draw();
    const samples=[];let calls,triangles;
    for(let i=0;i<24;i++){
     renderer.info.reset();const start=performance.now();draw();samples.push(performance.now()-start);
     calls=renderer.info.render.calls;triangles=renderer.info.render.triangles;
    }
    samples.sort((a,b)=>a-b);
    let gpu=null;
    if(timer){
     const queries=[];
     for(let i=0;i<12;i++){
      const query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
      sceneView.render();gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);
     }
     gl.flush();const deadline=performance.now()+15000;
     while(!queries.every(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))&&performance.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,20));
     if(!gl.getParameter(timer.GPU_DISJOINT_EXT)&&queries.every(q=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))){
      const gpuSamples=queries.map(q=>gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6).sort((a,b)=>a-b);
      gpu={medianMs:gpuSamples[6],p90Ms:gpuSamples[10],samples:gpuSamples};
     }
     queries.forEach(q=>gl.deleteQuery(q));
    }
    renderer.info.autoReset=previous;
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {medianMs:samples[12],p90Ms:samples[21],p95Ms:samples[22],samples,calls,triangles,
     textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,
     width:renderer.domElement.width,height:renderer.domElement.height,
     renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpu,
     sceneVisible:id==='concourse'?!!sceneView.model:rt.renderer.instanceRoots.get(rt.activeInstanceId)?.visible??true};
   },scene);
   assert.ok(timing.calls>0&&timing.triangles>0&&timing.sceneVisible,JSON.stringify({profile:profile.name,scene,timing}));
   scenes[scene]=timing;console.log(JSON.stringify({profile:profile.name,scene,...timing}));
   await page.screenshot({path:`${out}/${profile.name}-${scene}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${profile.name}.json`,JSON.stringify({environment:'Chrome SwiftShader on host, not a physical phone',scenes,errors},null,2));
  await context.close();
 }
}finally{await browser.close();}
