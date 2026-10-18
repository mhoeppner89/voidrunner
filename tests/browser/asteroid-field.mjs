import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/asteroid-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',reports=[];await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2ij`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const setup=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);window.afT=await import('/vendor/three.module.min.js');window.afLayout=await import('/src/game/asteroidFieldLayout.js');window.afOrigin=(await import('/src/game/data.js')).LOCATIONS.shardbelt.position;
   const p=r.save.player;p.position.splice(0,3,...afOrigin);p.velocity.fill(0);p.throttle=0;r.ships=[];r.autopilot=false;r.updateActiveInstance(true);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());
   return {active:r.activeInstanceId,fragments:r.renderer.asteroidTerrain.children.length,obstacles:r.activeFieldObstacles().length,deposits:r.asteroids.length,shadows:r.renderer.renderer.shadowMap.enabled,shadowSize:r.renderer.sunLight.shadow.mapSize.x,shadowCached:!r.renderer.renderer.shadowMap.autoUpdate,casters:r.renderer.asteroidTerrain.children.every(m=>m.castShadow&&m.receiveShadow),shadowAllocated:!!r.renderer.sunLight.shadow.map};
  });assert.equal(setup.active,'shardbelt');assert.equal(setup.fragments,10);assert.equal(setup.deposits,560);assert.ok(setup.shadows&&setup.shadowCached&&setup.casters&&setup.shadowAllocated);assert.equal(setup.shadowSize,name==='desktop'?1024:512);
  const routes=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),origin=new afT.Vector3(...afOrigin),results=[];
   for(const route of afLayout.SHARDBELT_PASSAGES){
    let maxPush=0;for(let j=1;j<route.points.length;j++){
     const from=new afT.Vector3(...route.points[j-1]),to=new afT.Vector3(...route.points[j]),direction=to.clone().sub(from).normalize();
     r.save.player.rotation.splice(0,4,...new afT.Quaternion().setFromUnitVectors(new afT.Vector3(0,0,-1),direction).toArray());
     for(let k=0;k<=4;k++){const p=from.clone().lerp(to,k/4).add(origin),before=p.clone();r.resolvePlayerCollisions(p,new afT.Vector3());maxPush=Math.max(maxPush,p.distanceTo(before));}
    }results.push({id:route.id,maxPush});
   }return results;
  });assert.ok(routes.every(r=>r.maxPush<.001),JSON.stringify(routes));
  for(const [label,route,index]of [['approach','heart',0],['tunnel','heart',9],['gallery','crosscut',13],['chimney','chimney',13]]){
   await page.evaluate(({route,index})=>{const r=__VOID_PRIVATEER__.getRuntime(),points=afLayout.SHARDBELT_PASSAGES.find(p=>p.id===route).points,p=new afT.Vector3(...points[index]).add(new afT.Vector3(...afOrigin)),target=new afT.Vector3(...points[index+1]).add(new afT.Vector3(...afOrigin)),dir=target.sub(p).normalize();r.save.player.position.splice(0,3,...p.toArray());r.save.player.rotation.splice(0,4,...new afT.Quaternion().setFromUnitVectors(new afT.Vector3(0,0,-1),dir).toArray());r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.syncRender(0,performance.now());r.renderer.render();},{route,index});
   await page.screenshot({path:`${out}/${name}-${label}.png`});
  }
  const perf=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),timings=[];
   for(let i=0;i<90;i++){
    const t=performance.now();r.save.world.time+=1/60;r.ensureObstacleGrid();r.resolvePlayerCollisions(new afT.Vector3(...r.save.player.position),new afT.Vector3());timings.push(performance.now()-t);
   }
   const before={...r.renderer.renderer.info.memory};for(let i=0;i<12;i++){r.syncRender(1/60,performance.now());r.renderer.render();}const after={...r.renderer.renderer.info.memory};timings.sort((a,b)=>a-b);
   const shadowRenderer=r.renderer,deadline=shadowRenderer.asteroidShadowRefreshAt;
   shadowRenderer.render();const cached=shadowRenderer.asteroidShadowRefreshAt===deadline;
   shadowRenderer.skyTime=deadline+.001;shadowRenderer.render();const refreshed=shadowRenderer.asteroidShadowRefreshAt>deadline;
   shadowRenderer.setActiveInstance(undefined);const disabledOutside=!shadowRenderer.renderer.shadowMap.enabled&&!shadowRenderer.sunLight.castShadow;
   return {cached,refreshed,disabledOutside,p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1),before,after,draws:r.renderer.renderer.info.render.calls};
  });assert.deepEqual(perf.after,perf.before);assert.ok(perf.cached&&perf.refreshed&&perf.disabledOutside);assert.ok(perf.p95<20,JSON.stringify(perf));assert.deepEqual(errors,[]);
  reports.push({name,setup,routes,perf,errors});await writeFile(`${out}/game-checks.json`,JSON.stringify(reports,null,2));console.log(name,JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}
}
process.exit(0);
