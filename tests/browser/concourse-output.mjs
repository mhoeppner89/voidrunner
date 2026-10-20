// Compare the retained canvas allocation with the former exact-size output,
// in the same stopped scene. This catches pixel-scale and CSS crop shifts.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/concourse-output';await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);
  page.on('requestfailed',request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?concourse-output`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&r.ui.concourseShip?.model&&!r.ui.concourseArrivalPending&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.ui.concourseShip.stop();});const reports=[];
  for(const scene of ['dock','station','planet']){
   if(scene!=='dock'){
    await page.evaluate(scene=>{const r=__VOID_PRIVATEER__.getRuntime(),v=r.ui.concourseShip;window.outputShot=scene==='station'?v.playStation(v.host,'entry','helix',undefined,r.stationTransitData('helix')):v.playAtmosphere(v.host,'entry','azure');},scene);
    await page.waitForFunction(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return v.transit&&!v.transitPreparing&&v.phase==='entry';});
    await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const p=v.transit.update(.5);v.applyPose(p);v.finish.uniforms.uFade.value=p.fade;});
   }
   const report=await page.evaluate(()=>{
    const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,resize=v.resizeOutput,gl=v.renderer.getContext();v.resize();v.render();
    const width=v.sceneViewport.z,height=v.sceneViewport.w;
    const read=()=>{const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const rect=v.canvas.getBoundingClientRect(),sx=rect.width/v.canvas.width,sy=rect.height/v.canvas.height;return{pixels,rect:{x:rect.left,y:rect.bottom-height*sy,w:width*sx,h:height*sy}};};
    const retained=read(),capacity=[v.canvas.width,v.canvas.height];
    try{
     v.resizeOutput=function(w,h,scale){this.renderer.setSize(w,h,false);this.target.setSize(w,h);Object.assign(this.canvas.style,{width:`${w*scale}px`,height:`${h*scale}px`,transform:'none'});};
     v.resize();v.render();const legacy=read();let changed=0,max=0,sum=0;
     for(let i=0;i<legacy.pixels.length;i++){const d=Math.abs(legacy.pixels[i]-retained.pixels[i]);if(d)changed++;max=Math.max(max,d);sum+=d;}
     return{width,height,capacity,changedChannels:changed,maxDifference:max,meanDifference:sum/legacy.pixels.length,retained:retained.rect,legacy:legacy.rect,canvasDepth:gl.getContextAttributes().depth};
    }finally{v.resizeOutput=resize;v.resize();v.render();}
   });
   assert.equal(report.canvasDepth,false);assert.equal(report.maxDifference,0,`${name}/${scene}: pixel output changed`);for(const key of ['x','y','w','h'])assert.ok(Math.abs(report.retained[key]-report.legacy[key])<.01,`${name}/${scene}: ${key} shifted`);
   await page.screenshot({path:`${out}/${name}-${scene}.png`});reports.push({scene,...report});
   if(scene!=='dock')await page.evaluate(async()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.skipAtmosphere();await outputShot;v.stop();});
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({reports,errors},null,2));console.log(name,JSON.stringify(reports));
 }finally{await browser.close();}
}
