import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/exploration';await mkdir(out,{recursive:true});const report=await readFile(`${out}/report.json`,'utf8').then(JSON.parse).catch(()=>[]);
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?revision=0.8.2ky`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const press=async locator=>device.isMobile?locator.tap():locator.click();
  await press(page.locator('[data-ui-command="new"]'));await press(page.locator('[data-ui-command="skip-new-career"]'));await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);r.ships=[];window.exData=await import('/src/game/explorationData.js');window.exThree=await import('/vendor/three.module.min.js');window.exCollision=await import('/src/game/shipCollision.js');r.save.player.velocity.fill(0);r.save.player.throttle=0;r.save.player.cargo={};r.playerShieldDelay=0;});
  console.log(name,'checking placements');
  const placement=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;return [...exData.FREIGHTER_LOGS,...exData.GRAVEYARD_CACHES].map(def=>{
   p.position.splice(0,3,...def.position);r.resetPlayerInterpolation(true);r.updateActiveInstance(true);
   const obstacles=r.activeFieldObstacles();const point=new exThree.Vector3(...def.position),rotation=new exThree.Quaternion().fromArray(p.rotation);const clear=!obstacles.some(ob=>exCollision.shipVsObstacle(point,rotation,'wayfarer',r.playerHullScale(),ob,{}));
   const before=point.clone();r.resolvePlayerCollisions(point,new exThree.Vector3());const displacement=point.distanceTo(before);
   return{id:def.id,clear,displacement,instance:r.activeInstanceId};
  });});
  await writeFile(`${out}/${name}-placement.json`,JSON.stringify(placement,null,2));assert.ok(placement.every(p=>p.clear&&p.displacement<.01),JSON.stringify(placement));
  console.log(name,'checking log recovery');
  const caches=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return exData.GRAVEYARD_CACHES.map(def=>{r.save.player.position.splice(0,3,...def.position);r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.updatePickups(1/60);return{id:def.id,collected:r.save.world.exploration.recovered.includes(def.id)};});});assert.ok(caches.every(c=>c.collected));
  await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().save.player.cargo={};});
  // Real fly-over collection; no story-specific remote collect action.
  for(const log of ['wake','silence','last-light']){
   await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime(),def=exData.FREIGHTER_LOGS.find(p=>p.id===id);r.ui.closeAdventure();r.save.player.position.splice(0,3,...def.position);r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.updatePickups(1/60);r.ui.updateHud(r.buildHudModel());},log);
   await page.waitForFunction(id=>__VOID_PRIVATEER__.getRuntime().save.world.exploration.recovered.includes(id),log);
   assert.ok(await page.locator('#adventure-panel:not(.is-hidden)').isVisible());assert.ok((await page.locator('.adventure-speech').innerText()).length>40);
   const box=await page.locator('#adventure-panel').evaluate(e=>({w:e.scrollWidth,c:e.clientWidth}));assert.ok(box.w<=box.c+1);
   if(log==='last-light')await page.screenshot({path:`${out}/${name}-log.png`});
   await press(page.locator('[data-ui-command="adventure-choice"]').first());
  }
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.shipMenuTab='journal';r.ui.showShipMenu();});
  assert.equal(await page.locator('[data-exploration-action="navigate"]').count(),1);
  await page.locator('[data-exploration-action="navigate"]').evaluate(e=>e.closest('details').open=true);
  await press(page.locator('[data-exploration-action="navigate"]'));
  const nav=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{id:r.save.player.currentTargetId,kind:r.hyperdriveDestination().kind,radar:r.radarContacts().some(c=>c.type==='wreck'&&c.selected)};});assert.deepEqual(nav,{id:'wreck-exploration-kestrel-nine',kind:'waypoint',radar:true});
  const jump=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;p.position.splice(0,3,...exData.FREIGHTER_POSITION.map((v,i)=>v+(i===2?5000:0)));p.rotation.splice(0,4,0,0,0,1);p.velocity.fill(0);p.angularVelocity.fill(0);r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.maintainTargetLock();r.hyperdriveFx='none';const reason=r.hyperdriveBlockReason();r.toggleHyperdrive();const engaged=r.autopilot;for(let i=0;i<2400&&r.autopilot;i++){r.save.world.time+=1/60;r.updatePlayer(1/60,{pitch:0,yaw:0,roll:0,throttleDelta:0});}return{engaged,reason,arrived:!r.autopilot,distance:Math.hypot(...p.position.map((v,i)=>v-exData.FREIGHTER_POSITION[i])),finite:p.position.every(Number.isFinite)};});assert.ok(jump.engaged&&jump.arrived&&jump.finite&&jump.distance>490&&jump.distance<530,JSON.stringify(jump));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;p.rotation.splice(0,4,0,0,0,1);p.position.splice(0,3,...exData.FREIGHTER_POSITION.map((v,i)=>v+(i===2?340:0)));r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.save.world.time+=1;r.updateExploration();r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();});
  assert.match(await page.locator('#adventure-panel').innerText(),/Driftglass/);const choicesFit=await page.locator('.adventure-choices button').evaluateAll(buttons=>buttons.every(b=>{const r=b.getBoundingClientRect(),p=b.closest('.adventure-dialogue').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1&&r.right<=innerWidth;}));assert.ok(choicesFit,'Salvage choices must both fit without scrolling');await page.screenshot({path:`${out}/${name}-claim.png`});
  await press(page.locator('[data-ui-command="adventure-choice"]').first());
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.exploration.finale),'shared');
  if(await page.locator('#adventure-panel:not(.is-hidden) [data-ui-command="adventure-choice"]').count())await press(page.locator('[data-ui-command="adventure-choice"]').first());
  const claimed=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.position.splice(0,3,...exData.FREIGHTER_POSITION);r.resetPlayerInterpolation(true);r.updatePickups(1/60);return{gold:r.save.player.cargo.gold,reactor:Object.values(r.save.player.inventory.items).some(i=>i.id==='eq-exploration-kestrel-reactor'),remaining:r.save.world.combatWrecks[exData.FREIGHTER_WRECK_ID].contents.length};});assert.equal(claimed.gold,3);assert.ok(claimed.reactor);assert.equal(claimed.remaining,0);
  console.log(name,'checking derelict model');
  // Let the idle fracture job finish and verify the full ship wreck is present.
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.renderer.updateCombatLootNodes();return Boolean(r.renderer.combatLootMeshes.get(exData.FREIGHTER_WRECK_ID)?.userData.derelictEffect);},{timeout:90000});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;p.rotation.splice(0,4,0,0,0,1);p.position.splice(0,3,...exData.FREIGHTER_POSITION.map((v,i)=>v+(i===2?340:0)));r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.renderer.render();});await page.screenshot({path:`${out}/${name}-derelict.png`});
  // The recurring convoy signal starts actual civilian/hostile ships and
  // resolves through the same distress lifecycle as a live career.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ships=[];r.save.player.position.splice(0,3,...exData.CONVOY_POSITION);r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.debugStartDistress('convoy',0,{phase:'signal',position:exData.CONVOY_POSITION});r.save.world.time++;r.distressTickAt=0;r.updateDistress();r.distressJournalAction('answer');});
  assert.match(await page.locator('#adventure-panel').innerText(),/Lantern/);await page.screenshot({path:`${out}/${name}-distress.png`});await press(page.locator('[data-ui-command="adventure-choice"]').first());
  const convoy=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),before=r.save.player.credits;for(let i=0;i<120;i++)r.updateSimulation(1/60,{});r.updateDynamicEncounters();const ships=r.ships.filter(a=>a.distressEventId&&a.distressVariant==='convoy');const finite=ships.every(a=>[...a.position,...a.velocity,a.hull].every(Number.isFinite));const targeting=ships.filter(a=>a.distressRole==='pirate').every(a=>a.targetId&&a.targetId!=='player');for(const a of ships.filter(a=>a.distressRole==='pirate'))r.damageShip(a,1e6,'player');r.save.world.time++;r.distressTickAt=0;r.updateDistress();const reward=r.save.player.credits-before;r.save.world.time++;r.distressTickAt=0;r.updateDistress();return{state:r.save.world.distress.history[0]?.outcome,finite,targeting,reward,twice:r.save.player.credits-before,active:Boolean(r.save.world.distress.active)};});
  assert.ok(convoy.finite&&convoy.targeting);assert.equal(convoy.state,'rescued');assert.equal(convoy.active,false);assert.ok(convoy.reward>=4000);assert.equal(convoy.reward,convoy.twice);
  assert.deepEqual(errors,[]);const previous=report.findIndex(row=>row.name===name);if(previous>=0)report.splice(previous,1);report.push({name,placement,caches,nav,jump,claimed,convoy,errors});console.log(name,'exploration checks passed');
 }catch(e){await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors},null,2));if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
