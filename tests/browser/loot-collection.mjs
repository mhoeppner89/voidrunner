import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/loot-collection';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?revision=0.8.2jv`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const press=async locator=>device.isMobile?locator.tap():locator.click();
  await press(page.locator('[data-ui-command="new"]'));await press(page.locator('[data-ui-command="skip-new-career"]'));await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.save.player.credits=20000;r.ui.openMarketPoint('equipment');});
  await press(page.locator('[data-inventory-mount="wayfarer-utility-0"]'));
  const tabs=page.locator('[data-inventory-tab]');if(await tabs.isVisible())await tabs.selectOption('shop');else await press(page.locator('[data-inventory-action="tab"][data-tab="shop"]'));
  await press(page.locator('[data-inventory-id="shop-loot-collector-1"]'));
  assert.match(await page.locator('[data-stat="lootRange"]').innerText(),/150.*km/s);assert.match(await page.locator('.inventory-identity h3').innerText(),/Traktorstrahl.*I/);
  const art=page.locator('.inventory-detail-art');assert.equal(await art.getAttribute('data-icon'),'loot-collector');
  const layout=await page.locator('.equipment-inventory').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,overflow:e.scrollWidth>e.clientWidth+1};});assert.ok(layout.x>=-1&&layout.y>=-1&&layout.right<=layout.w+1&&layout.bottom<=layout.h+1&&!layout.overflow,JSON.stringify(layout));
  const readouts=await page.locator('.inventory-readouts > div').evaluateAll(rows=>rows.map(row=>({width:row.clientWidth,scroll:row.scrollWidth})));assert.ok(readouts.every(r=>r.scroll<=r.width+1),JSON.stringify(readouts));
  await page.screenshot({path:`${out}/${name}-shop.png`});await press(page.locator('[data-inventory-action="buy"]'));await press(page.locator('[data-inventory-action="install"]'));
  const run=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;const {createEquipmentRecord,equipmentAction}=await import('/src/game/equipmentInventory.js'),{combatWreckNode}=await import('/src/game/careerLoot.js');
   const collector=Object.values(p.inventory.items).find(i=>i.baseId==='loot-collector');if(collector?.location.kind!=='installed')throw Error('Shop purchase was not installed');
   // Stow it to exercise the base mechanic through the real simulation loop.
   if(!equipmentAction(p,'remove',{id:collector.id}).ok)throw Error('Cannot stow collector');r._statsDirty=true;
   r.ui.closeMarketPoint?.();await r.launch();cancelAnimationFrame(r.frameId);r.ships=[];p.position.splice(0,3,0,100000,0);p.velocity.splice(0,3,0,0,-400);p.angularVelocity.fill(0);p.rotation.splice(0,4,0,0,0,1);p.throttle=1;r.autopilot=false;r.clearTarget();r.updateActiveInstance(true);r.resetPlayerInterpolation(true);
   const drop=(id,point)=>{const item=createEquipmentRecord('seeker-launcher',{tier:1,rarity:'uncommon',affixes:['efficient']});const w={id:`wreck-browser-${id}`,name:'Test loot',systemId:p.systemId,position:point,contents:[{id:item.id,kind:'equipment',item}],radius:3,scanned:false};r.save.world.combatWrecks??={};r.save.world.combatWrecks[w.id]=w;const n=combatWreckNode(w);r.wreckNodes.push(n);r.renderer.addCombatLootNode(n);return{w,n,item};};
   const contact=drop('flyby',[0,100000,-25]),ore=r.spawnPickup('ore',[0,100000,-25],'combat');r.pickupStore.setPos(ore.slot,0,100000,-25);
   for(let i=0;i<30;i++)r.updateSimulation(1/60,{});
   if(!p.inventory.items[contact.item.id]||r.save.world.combatWrecks[contact.w.id]||ore.life>0)throw Error('Normal flight failed to collect drops');
   const contactZ=p.position[2],results=[];p.velocity.fill(0);p.throttle=0;r.resetPlayerInterpolation(true);
   for(const tier of [1,2,3]){
    p.dockedAt=tier===1?'helix':'rook';if(tier===1){if(!equipmentAction(p,'install',{id:collector.id,mountId:'wayfarer-utility-0'}).ok)throw Error('Refit failed');}
    else {p.credits=50000;const b=equipmentAction(p,'buy',{baseId:'loot-collector',tier});if(!b.ok||!equipmentAction(p,'install',{id:b.id,mountId:'wayfarer-utility-0'}).ok)throw Error('Tier fit failed');}
    p.dockedAt=undefined;r._statsDirty=true;const range=[150,200,250][tier-1],d=drop(`tier-${tier}`,[range+.1,100000,p.position[2]]);r.updatePickups(1/60);if(!r.save.world.combatWrecks[d.w.id])throw Error('Range too large');
    d.w.position[0]=range;d.n.position[0]=range;r.updatePickups(1/60);if(!p.inventory.items[d.item.id])throw Error('Exact range missed');results.push({tier,range:r.playerStats().lootRange});
   }
   // A full hold leaves a selected crate visible with the fly-over hint.
   p.cargo.ore=1000;const blocked=drop('full-hold',[0,100000,p.position[2]-180]);r.selectTarget('wreck',blocked.w.id);r.updatePickups(1/60);if(!r.save.world.combatWrecks[blocked.w.id])throw Error('Full hold lost loot');
   const beforeBeam=r.renderer.combatBeams?.size??0;r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();
   return{collector:collector.id,contactZ,contact:true,looseCargo:true,tiers:results,fullHold:true,beamPool:beforeBeam,target:r.buildHudModel().target};
  });assert.deepEqual(run.tiers.map(t=>t.range),[150,200,250]);assert.ok(run.beamPool>0);await page.screenshot({path:`${out}/${name}-flight.png`});
  // The selected drop should not turn the phone's missile control into SALVAGE.
  if(device.isMobile)assert.notEqual(await page.locator('.touch-missile').getAttribute('data-touch-action'),'utility');
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({name,layout,run,errors},null,2));console.log(name,'normal shop purchase/fit, simulation fly-over, exact tier ranges, full hold and beam reuse passed');
 }catch(e){if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{await browser.close();}
}
