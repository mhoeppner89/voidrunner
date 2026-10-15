import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/tutorial-guidance';
await mkdir(out,{recursive:true});
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
const report=[];
for(const [name,engine,device] of profiles){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html`);await page.waitForFunction(()=>__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.reload();await page.waitForFunction(()=>__VOID_PRIVATEER__?.newGame);await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await page.locator('[data-ui-command="close-story"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);cancelAnimationFrame(r.frameId);const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='fit-upgrade';r.save.player.dockedAt='vesper';r.save.player.systemId=(await import('/src/game/data.js')).LOCATIONS.vesper.systemId;r.ensureTutorialEquipment();r.ui.showDock(r.save,'vesper');});
  await page.locator('[data-ui-command="story"]').click();
  assert.equal(await page.locator('[data-ui-command="tutorial-reactor"]').count(),0);
  assert.ok(await page.locator('.tutorial-equipment-explainer').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1),'Reactor explanation is clipped');
  await page.screenshot({path:`${out}/${name}-reactor-explained.png`});
  const before=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{regen:r.playerStats().reactorOutput,credits:r.save.player.credits};});
  await page.locator('[data-ui-command="close-story"]').click();
  await page.locator('[data-dock-hotspot="market"]').click();
  await page.locator('[data-market-point="equipment"]').click();
  if(await page.locator('[data-inventory-tab]').isVisible())await page.locator('[data-inventory-tab]').selectOption('storage');else await page.locator('[data-inventory-action="tab"][data-tab="storage"]').click();
  const gift=await page.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='sustained-reactor'&&i.location.kind==='station').id);
  await page.locator(`[data-inventory-id="${gift}"]`).click();
  const install=page.locator('[data-inventory-action="install"]');await install.waitFor();assert.ok(await install.isEnabled());
  assert.ok(await page.locator('.inventory-stat[data-stat="reactorOutput"]').count());
  await page.screenshot({path:`${out}/${name}-reactor-install.png`});
  const fittingLayout=await page.evaluate(()=>{const b=document.querySelector('[data-inventory-action="install"]').getBoundingClientRect(),s=document.querySelector('.inventory-detail-scroll');return{install:{x:b.x,y:b.y,width:b.width,height:b.height},width:innerWidth,height:innerHeight,detailScroll:s.scrollHeight>s.clientHeight+2};});
  assert.ok(fittingLayout.install.y>=0&&fittingLayout.install.y+fittingLayout.install.height<=fittingLayout.height,`${name}: install action is outside the screen`);
  await install.click();
  const after=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{regen:r.playerStats().reactorOutput,credits:r.save.player.credits,step:r.tutorialSummary().stepId};});
  assert.ok(after.regen>before.regen);assert.equal(after.credits,before.credits);assert.equal(after.step,'mining-contract');
  // Exercise the same item-first flow through the regular shop, outside the tutorial.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.quests.find(q=>q.id==='the-spare-key').stepId='complete';r.save.player.credits=100000;r.ui.inventoryItemId=undefined;r.ui.inventoryMountId=undefined;r.ui.inventoryTab='shop';r.ui.renderDock();});
  await page.locator('[data-inventory-id="shop-sustained-reactor-1"]').click();await page.locator('[data-inventory-action="buy"]').click();
  await page.locator('[data-inventory-action="install"]').waitFor();await page.locator('[data-inventory-action="install"]').click();
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.inventory.items[__VOID_PRIVATEER__.getRuntime().ui.inventoryItemId].location.kind),'installed');
  // A full fit must show a replacement choice and never overwrite equipment implicitly.
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),m=await import('/src/game/equipmentInventory.js');for(const slot of m.inventoryMounts(r.save.player.shipId).filter(s=>s.key==='utility'))if(!m.mountItemId(r.save.player.outfitting.loadouts[r.save.player.shipId],slot)){const item=m.createEquipmentRecord('recovery-shield',{location:{kind:'station',stationId:'vesper'}});r.save.player.inventory.items[item.id]=item;const result=m.equipmentAction(r.save.player,'install',{id:item.id,mountId:slot.mount.id});if(!result.ok)throw Error(result.code);}
   const spare=m.createEquipmentRecord('sustained-reactor',{location:{kind:'station',stationId:'vesper'}});r.save.player.inventory.items[spare.id]=spare;r.ui.inventoryItemId=spare.id;r.ui.inventoryMountId=undefined;r.ui.inventoryFitExplicit=false;r.ui.inventoryTab='storage';r.ui.renderDock();});
  assert.equal(await page.locator('[data-inventory-action="install"]').count(),0);assert.ok(await page.locator('.inventory-mount-picker').getAttribute('open')!==null);
  await page.locator('[data-inventory-action="fit-mount"]').first().click();await page.locator('[data-inventory-action="install"]').waitFor();
  await page.screenshot({path:`${out}/${name}-replacement.png`});
  // Deterministic live-state checks: elapsed time alone cannot advance a flight task.
  const coaching=await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key'),{LOCATIONS}=await import('/src/game/data.js'),v=LOCATIONS.vesper,p=r.save.player;
   await r.launch();cancelAnimationFrame(r.frameId);q.stepId='fly-vesper';p.dockedAt=undefined;p.navTargetId=p.currentTargetId='vesper';p.rotation=[0,0,0,1];p.position.splice(0,3,v.position[0],v.position[1],v.position[2]+v.radius+70000);p.velocity.fill(0);r.activeInstanceId=undefined;r.autopilot=false;r.ui.hideDock();r.selectTarget('location','vesper');
   const messages=[],show=()=>{const g=r.tutorialFlightGuidance();messages.push(g);r.ui.setTutorialHint(g.speaker,g.text,g.key);};show();r.autopilot=true;show();r.save.world.time+=500;show();r.autopilot=false;p.position[2]=v.position[2]+v.radius+7000;show();p.position[2]=v.position[2]+v.radius+4990;p.throttle=.5;p.velocity[2]=-30;show();
   r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();return messages;
  });
  assert.match(coaching[0].key,/:drive$/);assert.equal(coaching[1].key,coaching[2].key);assert.match(coaching[3].key,/:boost-thrust$/);assert.match(coaching[4].key,/:brake$/);
  await page.waitForFunction(()=>{const i=document.querySelector('#comms-bar .comms-portrait');return i?.complete&&i.naturalWidth>0;});
  await page.screenshot({path:`${out}/${name}-flight-portrait.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.clearPilotLine();});
  assert.equal(await page.locator('#comms-bar .comms-portrait').count(),1);
  assert.deepEqual(errors,[]);report.push({name,before,after,fittingLayout,coaching:coaching.map(g=>({key:g.key,text:g.text})),shopInstall:true,replacementExplicit:true,portraitDecoded:true,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'guided flight, portrait, free reactor install, shop install and explicit replacements passed');
 }finally{await browser.close();}
}
