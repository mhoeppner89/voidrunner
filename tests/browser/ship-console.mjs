import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/ship-console',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([n])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(n));
const report=[];
for(const [name,engine,device] of profiles){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html`);await page.waitForFunction(()=>__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);cancelAnimationFrame(r.frameId);r.skipTutorial();await r.launch();cancelAnimationFrame(r.frameId);r.save.player.position=[0,90000,0];r.save.player.velocity.fill(0);r.save.player.throttle=0;r.ships=[];r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());
   const {createDroneUnit}=await import('/src/game/droneData.js'),f=r.save.player.droneFleet;for(const type of ['pdc','repair']){const id=`drone-unit-${f.nextUnitId++}`;f.unitsById[id]=createDroneUnit(id,type);f.lockerIds.push(id);}
  });
  assert.equal(await page.locator('#toast-stack,.toast').count(),0);await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;for(const t of ['info','success','warning','danger'])u.showToast('Notification test '+t,t);if(u.recentEvents.at(-1).message!=='Notification test danger')throw Error('Status notice missing from event log');});assert.equal(await page.locator('#toast-stack,.toast').count(),0);
  const open=()=>page.locator('.cockpit-screen-own').click({position:{x:10,y:10}});
  const layout=async label=>{const result=await page.locator('.ship-console').evaluate(e=>{const b=e.getBoundingClientRect(),body=e.querySelector('.ship-console-body');return{width:innerWidth,height:innerHeight,x:b.x,y:b.y,right:b.right,bottom:b.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,bodyOverflow:body.scrollHeight>body.clientHeight+1,bodyWidth:body.scrollWidth,bodyClientWidth:body.clientWidth};});assert.ok(result.x>=0&&result.y>=0&&result.right<=result.width+1&&result.bottom<=result.height+1,`${name} ${label}: console outside viewport`);assert.ok(result.scrollWidth<=result.clientWidth+1&&result.scrollHeight<=result.clientHeight+1,`${name} ${label}: outer console overflow`);assert.ok(result.bodyWidth<=result.bodyClientWidth+1,`${name} ${label}: horizontal content overflow`);return result;};
  await open();await page.locator('.ship-console').waitFor();const flight=await layout('flight');assert.equal(await page.locator('.ship-console-tabs [aria-current="page"]').getAttribute('data-ship-section'),'flight');
  await page.locator('[data-ui-command="transponder-toggle"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder),false);await page.screenshot({path:`${out}/${name}-flight.png`});
  await page.locator('[data-ship-section="equipment"]').click();await layout('equipment');assert.equal(await page.locator('.equipment-inventory > header').count(),0);await page.locator('[data-inventory-mount]').first().click();await layout('equipment detail');await page.screenshot({path:`${out}/${name}-equipment.png`});
  const chooseDrone=async(type,hull='wayfarer')=>{
   await page.locator('[data-ship-section="equipment"]').click();
   const close=page.locator('[data-inventory-action="close-detail"]');if(await close.isVisible())await close.click();
   await page.locator(`[data-inventory-mount="${hull}-drone-1"]`).click();
   await page.locator('[data-inventory-action="close-detail"]').click();
   const selector=page.locator('[data-inventory-tab]');if(await selector.isVisible())await selector.selectOption('cargo');else await page.locator('[data-inventory-action="tab"][data-tab="cargo"]').click();
   await page.locator('.inventory-item').filter({has:page.locator(`[data-icon="${type}-drone"]`)}).click();
   await page.locator(`[data-inventory-action="fit-mount"][data-mount-id="${hull}-drone-1"]`).click();
   await page.locator('[data-inventory-action="install"]').click();
  };
  assert.equal(await page.locator('[data-ship-section="drones"]').count(),0);
  await chooseDrone('pdc');await layout('drones in equipment');await page.screenshot({path:`${out}/${name}-drones.png`});
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.wayfarer.droneBays[0].mode==='pdc');
  await page.locator('[data-ui-command="close-ship"]').click();
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<600;i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);r.updatePdcDrones(1/60);}r.syncRender(0,performance.now());});
  await open();await chooseDrone('repair');
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.wayfarer.droneBays[0].pendingInventoryDrone?.action==='install');assert.ok(await page.locator('.inventory-stat-block [role="status"]').isVisible());assert.ok(await page.locator('[data-inventory-action="install"]').isDisabled());await page.screenshot({path:`${out}/${name}-switching.png`});
  await page.locator('[data-ui-command="close-ship"]').click();
  const switching=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,startHull=p.hull-=15;for(let i=0;i<7200&&p.hull<=startHull;i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);r.updatePdcDrones(1/60);}return{mode:p.outfitting.loadouts.wayfarer.droneBays[0].mode,repaired:p.hull>startHull,miners:Object.values(p.droneFleet.unitsById).filter(u=>u.type==='mining').length};});assert.equal(switching.mode,'repair');assert.ok(switching.repaired);assert.equal(switching.miners,1);
  await open();await page.locator('[data-ship-section="journal"]').click();await layout('journal');await page.screenshot({path:`${out}/${name}-journal.png`});
  // Stress the same panel with the largest player drone carrier and two wingmen.
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.recallAllDrones('test-berth-change');for(let i=0;i<7200&&!r.dronesSafelyStowed();i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);r.updatePdcDrones(1/60);}if(!r.dronesSafelyStowed())throw Error('Drone return did not finish before switching hulls');const {normalizeOutfitting}=await import('/src/game/outfitting.js'),{normalizeDroneFleet}=await import('/src/game/droneData.js');r.save.player.shipId='atlas';r.save.player.outfitting=normalizeOutfitting(r.save.player);r.save.player.droneFleet=normalizeDroneFleet(r.save.player.droneFleet,r.save.player.outfitting.loadouts,{activeShipId:'atlas'});r._statsDirty=true;r.ui.wingTacticsCrew=[{name:'Rin',index:0,order:'support'},{name:'Paul',index:1,order:'support'}];r.ui.shipMenuTab='flight';r.ui.showShipMenu();});
  await layout('Atlas flight');await page.screenshot({path:`${out}/${name}-atlas-flight.png`});await page.locator('[data-ship-section="equipment"]').click();if(await page.locator('[data-inventory-action="close-detail"]').isVisible())await page.locator('[data-inventory-action="close-detail"]').click();
  assert.equal(await page.locator('[data-inventory-mount^="atlas-drone-"]').count(),4);await layout('Atlas drones in equipment');
  await page.locator('[data-inventory-mount="atlas-drone-4"]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}-atlas-drones.png`});
  // Docked roles use the same controls and never require a manual recall button.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideShipMenu();r.save.player.transponder=true;r.dockAt('helix',true);r.ui.openMarketPoint('equipment');r.ui.inventoryTab='cargo';r.ui.renderDock();});
  await page.locator('[data-inventory-mount="atlas-drone-1"]:visible').click();if(await page.locator('[data-inventory-action="close-detail"]:visible').count())await page.locator('[data-inventory-action="close-detail"]:visible').click();
  const dockTab=page.locator('[data-inventory-tab]:visible');if(await dockTab.count())await dockTab.selectOption('cargo');else await page.locator('[data-inventory-action="tab"][data-tab="cargo"]:visible').click();
  await page.locator('.inventory-item:visible').filter({has:page.locator('[data-icon="repair-drone"]')}).click();
  await page.locator('[data-inventory-action="install"]:visible').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.atlas.droneBays[0].mode),'repair');
  await page.screenshot({path:`${out}/${name}-docked-drones.png`});
  await page.evaluate(async()=>{await __VOID_PRIVATEER__.startArenaRun(false);const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.arenaRunAction('hull','wayfarer');for(let i=0;i<2;i++){r.arenaRunAction('reward',r.save.arenaRun.offers.find(x=>x!=='repair')??r.save.arenaRun.offers[0]);r.arenaRunAction('accept');}r.ui.showShipMenu();await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);});
  await layout('Arena Run');await page.screenshot({path:`${out}/${name}-arena-run.png`});
  assert.deepEqual(errors,[]);report.push({name,flight,switching,atlasBays:4,arenaRun:true,dockedSwitch:true,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'own-monitor sections, layout, automatic PDC/repair switching, docked controls and Arena Run passed');
 }finally{await browser.close();}
}
