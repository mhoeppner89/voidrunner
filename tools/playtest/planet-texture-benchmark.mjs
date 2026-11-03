// Compare generated planet pixels on the same browser engine. Both servers
// must serve their own game source; no save or audio context is created.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
const baseline=process.env.VR_BASELINE_URL??'http://127.0.0.1:4207',candidate=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const out='output/planet-texture-benchmark';await mkdir(out,{recursive:true});const reports=[];
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']}:{})});
 try{
  const run=async (base,prepared=false)=>{
   const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/__planet-texture-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>'}));
   await page.goto(`${base}/__planet-texture-test.html`);
   const result=await page.evaluate(async prepared=>{
    const {SpaceRenderer,preparePlanetSurfaceTextures}=await import('/src/game/render.js'),r=Object.create(SpaceRenderer.prototype);
    r.pixelTextures=new Set();r.renderer={capabilities:{getMaxAnisotropy:()=>1}};const cases=[];
    let ticks=0,preparationMs=0;
    if(prepared){let running=true;const tick=()=>{ticks++;if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);const start=performance.now();try{await preparePlanetSurfaceTextures();preparationMs=performance.now()-start;}finally{running=false;}}
    for(const [id,base,accent,water] of [['vesper',0xa85f36,0xd78a54,false],['azure',0x1e5d8f,0x79c8ea,true]]){
     const start=performance.now(),texture=r.createPixelPanelTexture(id+'-surface',base,accent,'planet',1024,water),ms=performance.now()-start;
     const canvas=texture.image,bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
     const digest=await crypto.subtle.digest('SHA-256',bytes.buffer),hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
     cases.push({id,ms,hash});texture.dispose();
    }return {cases,ticks,preparationMs};
   },prepared);
   assert.deepEqual(errors,[]);await page.close();return result;
  };
  const before=await run(baseline),after=await run(candidate),prepared=await run(candidate,true);
  for(let i=0;i<before.cases.length;i++){
   assert.equal(after.cases[i].hash,before.cases[i].hash,`${name}/${before.cases[i].id} pixels changed`);
   assert.equal(prepared.cases[i].hash,before.cases[i].hash,`${name}/${before.cases[i].id} prepared pixels changed`);
  }
  assert.ok(prepared.ticks>2,`${name}: loading must allow the browser to paint: ${JSON.stringify(prepared)}`);
  reports.push({name,before,after,prepared});console.log(name,JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
