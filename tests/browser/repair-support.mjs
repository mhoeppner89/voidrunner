import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/repair-support',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
const report=[];
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2ge`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await page.locator('[data-ui-command="close-story"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);
   const p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='launch-survey';if(!await r.launch())throw Error('Could not launch tutorial ship');cancelAnimationFrame(r.frameId);p.position=[0,90000,0];p.velocity.fill(0);p.throttle=0;p.hull=r.playerStats().hull;p.rotation=[0,0,0,1];r.ships=[];q.stepId='talk-paul';r.activeInstanceId='mourning-line';r.activeFieldObstacles=()=>[];r.lineBlocked=()=>false;r.firstObstacleHitInfo=()=>undefined;
   const paul=r.ensureTutorialCompanion();paul.position=[0,90000,-55];paul.velocity.fill(0);paul.rotation=[0,0,0,1];paul.hull=paul.maxHull-10;paul.prevPosition?.set?.(paul.position);if(Array.isArray(paul.prevPosition))paul.prevPosition.splice(0,3,...paul.position);window.testPaulId=paul.id;
   await r.renderer.ensureGlbShipModel('torsas');await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);
   r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();r.ui.openStoryAdventure('Paul','Thank you','ally','tutorial-paul-rescue');
  });
  await page.locator('[data-ui-command="adventure-choice"]').first().click();
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.adventure.nodeId),'repairs');assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.adventure.space),'Repair introduction must be an in-flight transmission');
  await page.locator('[data-ui-command="adventure-choice"]').first().click();
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.adventure.nodeId),'support');
  assert.ok((await page.locator('.adventure-panel').innerText()).includes('200 km'));
  await page.screenshot({path:`${out}/${name}-repair-introduction.png`});
  const bounds=await page.locator('.adventure-choices button').first().boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=device.viewport.height+1,'reply remains visible on phone');
  await page.locator('[data-ui-command="adventure-choice"]').first().click();await page.locator('[data-ui-command="adventure-choice"]').first().click();
  const repair=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,paul=r.ships.find(s=>s.id===testPaulId),{updateNpcDrones}=await import('/src/game/npcDrones.js');
   p.hull-=20;const initial=p.hull;
   for(let i=0;i<14400&&p.hull===initial;i++){r.save.world.time+=1/60;paul.energy=paul.combatFit.stats.energyCapacity;updateNpcDrones(r,1/60);}
   r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();
   return{playerHull:p.hull,initial,paulHull:paul.hull,paulMax:paul.maxHull,drones:Object.values(paul.droneFleet.unitsById).map(u=>({type:u.type,repairing:u.repairing,target:u.repairTargetId,state:u.state})),visibleRepair:Object.values(paul.droneFleet.unitsById).some(u=>u.repairing),renderedRepair:Object.values(paul.droneFleet.unitsById).some(u=>u.repairing&&r.renderer.droneVisuals[u.id]?.root.visible&&r.renderer.droneVisuals[u.id]?.root.userData.repairSparks?.visible)};
  });
  assert.ok(repair.playerHull>repair.initial);assert.equal(repair.paulHull,repair.paulMax);assert.equal(repair.drones.length,2);assert.ok(repair.visibleRepair);assert.ok(repair.renderedRepair,'Repair contact must render the working drone and sparks');
  await page.screenshot({path:`${out}/${name}-active-repair.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),u=Object.values(r.ships.find(s=>s.id===testPaulId).droneFleet.unitsById).find(u=>u.repairing),v=r.renderer.droneVisuals[u.id];r.renderer.setCockpitVisible(false);r.renderer.camera.position.fromArray(u.position).add({x:5,y:-8,z:5});r.renderer.camera.lookAt(v.root.position);r.renderer.render();});await page.screenshot({path:`${out}/${name}-repair-closeup.png`});assert.deepEqual(errors,[]);report.push({name,repair,errors});console.log(name,'repair support and dialogue passed');
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
