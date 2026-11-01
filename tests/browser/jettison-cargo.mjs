import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/jettison-cargo';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});await context.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(`${base}/output/exploration-review/index.html?scene=feedback`);await page.waitForFunction(()=>window.discoveryReview?.ready&&discoveryReview.scene==='feedback');
  const ids=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.ships=[];p.dockedAt=undefined;p.position.splice(0,3,0,100000,0);p.velocity.fill(0);p.rotation.splice(0,4,0,0,0,1);p.cargo={ore:8};r.autopilot=false;r.galaxyJump=false;r.playerDocking=false;r.hyperdriveFx=undefined;r.save.world.combatWrecks={};r.wreckNodes=[];
   const {createEquipmentRecord,refreshInventoryProjection}=await import('/src/game/equipmentInventory.js'),{createDroneUnit}=await import('/src/game/droneData.js');
   const item=createEquipmentRecord('pulse-cannon',{tier:2,rarity:'uncommon',affixes:['efficient']});p.inventory.items[item.id]=item;
   const drone=createDroneUnit(`drone-unit-${p.droneFleet.nextUnitId++}`,'repair');drone.hull=11;p.droneFleet.unitsById[drone.id]=drone;p.droneFleet.lockerIds.push(drone.id);refreshInventoryProjection(p);
   r.ui.inventoryMountId=undefined;r.ui.inventoryItemId=undefined;r.ui.inventoryTab='cargo';r.ui.shipMenuTab='equipment';r.ui.showShipMenu();return{item:item.id,drone:drone.id};
  });
  const press=locator=>device.isMobile?locator.tap():locator.click();
  const cargo=page.locator('[data-jettison-commodity="ore"]').locator('..');
  await cargo.locator('[data-jettison-quantity]').fill('3');await page.screenshot({path:`${out}/${name}-amount.png`});await press(cargo.locator('[data-inventory-action="jettison-cargo"]'));
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.cargo.ore),5);
  await press(page.locator(`[data-inventory-id="${ids.item}"]`));await page.screenshot({path:`${out}/${name}-equipment.png`});await press(page.locator(`[data-inventory-action="jettison"][data-item-id="${ids.item}"]`));
  assert.equal(await page.evaluate(id=>Boolean(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items[id]),ids.item),false);
  const droneId=await page.evaluate(id=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.droneUnitId===id)?.id,ids.drone);
  await press(page.locator(`[data-inventory-id="${droneId}"]`));await press(page.locator(`[data-inventory-action="jettison"][data-item-id="${droneId}"]`));
  const result=await page.evaluate(async({ids,droneId})=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,{hydrateSave}=await import('/src/game/save.js');
   const drops=Object.values(r.save.world.combatWrecks),saved=hydrateSave(JSON.parse(JSON.stringify(r.save)));
   const ore=drops.find(w=>w.contents[0].commodity==='ore'),item=drops.find(w=>w.id===`wreck-${ids.item}`),drone=drops.find(w=>w.id===`wreck-${droneId}`);
   if(!ore||!item||!drone)throw Error('Missing physical drop');if(!saved.world.combatWrecks[ore.id]||!saved.world.combatWrecks[item.id]||!saved.world.combatWrecks[drone.id])throw Error('Drops did not survive hydration');
   r.save.world.time+=10;r.updatePickups(1/60);if(!r.save.world.combatWrecks[ore.id])throw Error('Drop recollected before flying clear');
   p.position[0]=400;r.updatePickups(1/60);p.position.splice(0,3,...ore.position);r.resetPlayerInterpolation(true);r.updatePickups(1/60);
   return{ore:p.cargo.ore,item:!!p.inventory.items[ids.item],drone:Object.values(p.droneFleet.unitsById).some(u=>u.type==='repair'&&u.hull===11),remaining:Object.keys(r.save.world.combatWrecks),stored:drops.length};
  },{ids,droneId});
  assert.deepEqual(result,{ore:8,item:true,drone:true,remaining:[],stored:3});assert.deepEqual(errors,[]);console.log(name,JSON.stringify(result));
 }catch(e){await page?.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{await browser.close();}
}
