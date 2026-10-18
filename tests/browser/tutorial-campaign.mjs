import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='output/tutorial-campaign';await mkdir(output,{recursive:true});
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}},false],['android',chromium,devices['Pixel 7 landscape'],true],['iphone',webkit,devices['iPhone 13 landscape'],false]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
const report=[];
for(const [name,engine,device,invitePaul] of profiles){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?revision=0.8.2gc&startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);
   window.tutorialCheck={step(expected){const actual=r.tutorialSummary().stepId;if(actual!==expected)throw Error(`Expected ${expected}, got ${actual}`);},finish(){let n=0;while(r.ui.adventure&&n++<20){const node=r.ui.adventureNode();const choices=node.choices;const i=choices?Math.max(0,choices.findIndex(c=>c.complete)):0;r.ui.advanceAdventure(i);}r.refreshStoryLine();},talk(id){r.ui.talkToPerson(id);this.finish();},land(id){r.ships=r.ships.filter(s=>s.tutorialCompanion||s.tutorialEnemy);r.save.player.position.splice(0,3,...(window.tutorialLocations[id].position));r.save.player.currentTargetId=id;r.save.player.navTargetId=id;r.dockAt(id,true);},paint(){r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();}};
   window.tutorialLocations=(await import('/src/game/data.js')).LOCATIONS;
   r.ui.setDockTab?.('bar');r.ui.talkToPerson('mara-vek');
  });await page.screenshot({path:`${output}/${name}-helix-dialogue.png`});
  const opening=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck;c.finish();c.talk('rin-vek');c.step('buy-supplies');const credits=r.save.player.credits;
   const bought=r.trade('buy','food',999);window.tutorialPurchased=bought.quantity;if(!bought.ok||bought.total!==bought.quantity*80)throw Error('First purchase failed');c.step('launch-helix');c.finish();await r.launch();cancelAnimationFrame(r.frameId);c.step('plot-vesper');
   r.selectTarget('location','vesper','map');c.step('flight-checks');r.save.player.position.splice(0,3,...r.save.player.position.map((v,i)=>v+(i===1?1500:0)));r.save.player.throttle=1;r.save.player.velocity.splice(0,3,0,0,-r.playerStats().maxSpeed);r.updateTutorialFlightChecks(1,{yaw:.4});r.afterburning=true;r.updateTutorialFlightChecks(2,{});r.afterburning=false;r.cycleTarget();r.openShipMenu();r.ui.hideShipMenu();c.step('fly-vesper');r.save.world.time+=2;r.updateTutorialCampaignRuntime();c.paint();return {credits,purchase:bought.total,step:r.tutorialSummary().stepId};
  });await page.screenshot({path:`${output}/${name}-flight-instructions.png`});
  const reactorCredits=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck;c.land('vesper');c.step('sell-supplies');c.finish();const sale=r.trade('sell','food',999);if(sale.total!==window.tutorialPurchased*175)throw Error('First profit not guaranteed');c.step('fit-upgrade');c.finish();return r.save.player.credits;
  });
  await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="equipment"]').click();
  if(await page.locator('[data-inventory-tab]').isVisible())await page.locator('[data-inventory-tab]').selectOption('storage');else await page.locator('[data-inventory-action="tab"][data-tab="storage"]').click();
  const gift=await page.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='sustained-reactor'&&i.location.kind==='station').id);
  await page.locator(`[data-inventory-id="${gift}"]`).click();await page.locator('[data-inventory-action="install"]').click();
  const equipment=await page.evaluate(money=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck;if(r.save.player.credits!==money)throw Error('Gifted reactor charged credits');c.step('mining-contract');c.finish();c.finish();c.talk('rin-vek');r.ui.dockTab='bar';r.ui.dockTerminal='bar';r.ui.barPanel='missions';r.ui.missionMobileDetail=true;r.ui.renderDock();if(r.ui.missionBoardCounts().offers.length!==1)throw Error('Training board is cluttered by unrelated contracts');return {profit:window.tutorialPurchased*95,credits:money,reactor:true};
  },reactorCredits);await page.screenshot({path:`${output}/${name}-mining-contract.png`});
  const mining=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck;if(!r.acceptMission('tutorial-vesper-mining').ok)throw Error('Training contract unavailable');c.step('mine-shardbelt');await r.launch();cancelAnimationFrame(r.frameId);
   const node=r.asteroids.find(n=>n.id===r.save.quests.find(q=>q.id==='the-spare-key').flags.oreTargetId);
   if(!node)throw Error('Mining deposit missing');const {asteroidCollisionRadius}=await import('/src/game/worldData.js');r.activeInstanceId='shardbelt';r.save.player.position.splice(0,3,...node.position.map((v,i)=>v+(i===1?asteroidCollisionRadius(node)+40:0)));r.save.player.velocity.fill(0);r.save.player.throttle=0;r.selectTarget('asteroid',node.id);r.scanTarget();const deployed=r.toggleMiningDrones();if(!deployed.ok)throw Error('Miners cannot deploy: '+deployed.code);
   for(let i=0;i<10800&&r.tutorialSummary().stepId==='mine-shardbelt';i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);}c.step('return-mining');if((r.save.player.cargo.ore??0)<6)throw Error('Drone ore did not reach cargo');r.recallMiningDrones('tutorial-return');for(let i=0;i<3600&&r.save.player.droneFleet.controller.phase==='recalling';i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);}if(r.save.player.droneFleet.controller.phase==='recalling')throw Error('Miners cannot return');
   r.autopilot=true;r.hyperdriveFx='active';r.save.player.navTargetId='vesper';r.updateTutorialCampaignRuntime();c.step('raider-standoff');const enemy=r.ships.find(s=>s.tutorialEncounter==='mining');if(!enemy.holdFire)throw Error('No standoff');r.save.world.time+=9;r.updateTutorialCampaignRuntime();c.step('defeat-raider');if(r.ui.adventure?.conversationId!=='tutorial-combat')throw Error('No paused combat briefing');c.finish();
   r.damageShip(enemy,100000,'player',enemy.position);c.step('land-mining');c.finish();c.land('vesper');c.step('salvage-briefing');r.acknowledgeMissionSettlements();r.refreshStoryLine();c.finish();if(r.save.activeMissions.some(m=>m.id==='tutorial-vesper-mining'))throw Error('Mining contract did not pay');c.talk('rin-vek');c.step('fit-pdc');r.ui.openMarketPoint('equipment');return {contractPaid:true,standoff:true,oreFromDrones:true};
  });await page.screenshot({path:`${output}/${name}-drone-switch.png`});
  const survey=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck,fit=r.save.player.outfitting.loadouts[r.save.player.shipId],miners=fit.droneBays[0].unitIds.filter(Boolean);if(!r.setDroneBayMode(fit.droneBays[0].bayId,'pdc').ok)throw Error('PDC fitting failed');c.step('survey-graveyard');if(!miners.every(id=>r.save.player.droneFleet.lockerIds.includes(id)))throw Error('Mining drones lost');await r.launch();cancelAnimationFrame(r.frameId);
   r.save.player.position.splice(0,3,...tutorialLocations['mourning-line'].position);r.updateActiveInstance(true);r.save.player.velocity.fill(0);
   for(let i=0;i<3;i++){const marker=r.tutorialFieldTarget();r.save.player.position.splice(0,3,...marker.position);r.updateActiveInstance(true);r.updateTutorialCampaignRuntime();}c.step('rescue-paul');const paul=r.ships.find(s=>s.storyPersonId==='paul'&&s.hull>0);if(paul.hullId!=='torsas')throw Error('Paul has wrong hull');
   r.damageShip(paul,100000,'pirate',paul.position);if(paul.hull!==1||!paul.poweredDown)throw Error('Paul protection missing');
   for(const enemy of r.ships.filter(s=>s.tutorialEncounter==='rescue'))r.damageShip(enemy,100000,'player',enemy.position);r.updateTutorialCampaignRuntime();c.step('talk-paul');r.ui.openStoryAdventure('Paul','Thank you','ally','tutorial-paul-rescue');c.finish();c.step('survey-carrier');
   for(let i=0;i<2;i++){const marker=r.tutorialFieldTarget();r.save.player.position.splice(0,3,...marker.position);r.updateActiveInstance(true);r.updateTutorialCampaignRuntime();}c.step('carrier-wait');r.save.world.time+=11;r.updateTutorialCampaignRuntime();c.step('hide-patrol');c.paint();return {paulHull:paul.hull,patrol:r.ships.filter(s=>s.tutorialPatrol&&s.hull>0).length,minersInCargo:miners.length};
  });await page.screenshot({path:`${output}/${name}-carrier-patrol.png`});
  const hiding=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck,T=await import('/vendor/three.module.min.js'),{tutorialWreckPoint}=await import('/src/game/tutorialRuntime.js');const goal=r.ensureTutorialHidePosition()??tutorialWreckPoint('concord-carrier-wreck',true),p=r.save.player;
   // Check the real collision proxies and real occlusion; no mocked sight checks.
   r.updateTutorialCampaignRuntime();c.finish();const clear=r.tutorialHidingPositionClear(new T.Vector3(...goal));
   p.position.splice(0,3,...goal);r.updateActiveInstance(true);p.velocity.fill(0);p.throttle=0;p.transponder=false;r.playerEmissionHeat=0;r.utilityActive=false;r.updateTutorialCampaignRuntime();
   const q=r.save.quests.find(q=>q.id==='the-spare-key');if(q.flags.hiddenSince===undefined)throw Error(`Carrier hiding rejected (collision-clear=${clear}, goal=${goal}, blocked=${r.ships.filter(s=>s.tutorialPatrol).map(s=>r.lineBlocked(new T.Vector3(...s.position),new T.Vector3(...goal),s.id))})`);r.save.world.time+=21;r.updateTutorialCampaignRuntime();c.step('return-helix');p.transponder=true;c.land('helix');c.talk('mara-vek');c.step('earn-standing');return {clear,hidden:true};
  });
  const ending=await page.evaluate(async invite=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=tutorialCheck;r.save.player.credits=100000;r.queueTutorialMaraCall();c.step('meet-cairn');c.finish();c.land('cairn');c.talk('rin-vek');c.step('launch-black-box');
   if(invite){r.ui.talkToPerson('paul');r.ui.advanceAdventure(0);}c.step('launch-black-box');await r.launch();cancelAnimationFrame(r.frameId);c.step('salvage-black-box');const q=r.save.quests.find(q=>q.id==='the-spare-key'),node=r.wreckNodes.find(n=>n.id===q.flags.blackBoxTargetId);if(node.zone!=='frigate-alpha')throw Error('Recorder at wrong wreck');
   r.save.player.position.splice(0,3,...node.position.map((v,i)=>v+(i===1?15:0)));r.activeInstanceId='mourning-line';r.extractWreck(node,4,1);c.step('black-box-fight');const enemies=r.ships.filter(s=>s.tutorialEncounter==='black-box'&&s.hull>0);if(enemies.length!==4||enemies.filter(s=>s.hullId==='demon').length!==1)throw Error('Black-box ambush has wrong fleet');
   const paulPresent=r.ships.some(s=>s.storyPersonId==='paul'&&s.hull>0);if(paulPresent!==invite)throw Error('Optional escort ignored');const rin=r.ships.find(s=>s.storyPersonId==='rin'&&s.hull>0);r.damageShip(rin,100000,'pirate',rin.position);if(!rin.poweredDown||rin.hull!==1)throw Error('Rin can die');
   for(const enemy of enemies)r.damageShip(enemy,100000,'player',enemy.position);r.updateTutorialCampaignRuntime();c.step('deliver-black-box');c.land('helix');c.talk('mara-vek');c.step('complete');if(r.save.player.sealedCargo.some(c=>c.missionId==='tutorial-black-box'))throw Error('Recorder not handed in');return {completed:true,paulPresent,gateOpen:q.flags.gateOpen,blackBoxDelivered:q.flags.blackBoxDelivered};
  },invitePaul);await page.screenshot({path:`${output}/${name}-complete.png`});
  assert.deepEqual(errors,[]);report.push({name,invitePaul,opening,equipment,mining,survey,hiding,ending,errors});await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(name,JSON.stringify(report.at(-1)));
 }finally{await browser.close();}
}
