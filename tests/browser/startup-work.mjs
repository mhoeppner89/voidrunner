// Real browser event-loop check: loading-time terrain work must allow paints.
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1280,height:720}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/__startup-work.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>'}));
  await page.goto(`${base}/__startup-work.html`);
  const result=await page.evaluate(async()=>{
   const {prepareAsteroidTerrain}=await import('/src/game/asteroidTerrain.js');
   let frames=0,maxGap=0,previous=performance.now(),running=true;
   const tick=now=>{frames++;maxGap=Math.max(maxGap,now-previous);previous=now;if(running)requestAnimationFrame(tick);};
   requestAnimationFrame(tick);const start=performance.now();
   const terrain=await prepareAsteroidTerrain();running=false;
   return {frames,maxGap,ms:performance.now()-start,fragments:terrain.fragments.length,triangles:terrain.triangles,tiles:terrain.obstacles.length};
  });
  assert.ok(result.frames>2,`${name}: loading work must allow browser paints: ${JSON.stringify(result)}`);
  assert.equal(result.fragments,10);assert.equal(result.triangles,134540);assert.equal(result.tiles,2246);assert.deepEqual(errors,[]);
  console.log(name,JSON.stringify(result));await page.close();
 }finally{await browser.close();}
}
