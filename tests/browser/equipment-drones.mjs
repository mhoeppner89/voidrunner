import{chromium,webkit,devices}from'playwright';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
import{isolateBrowserProfiles}from'../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/equipment-drones',report=[];await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2js`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const starter=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.ui.openMarketPoint('equipment');const p=r.save.player;return{lasers:p.outfitting.loadouts.wayfarer.guns.filter(Boolean),launchers:p.outfitting.loadouts.wayfarer.launchers,miners:Object.keys(p.droneFleet.unitsById)};});assert.ok(starter.launchers.every(id=>id===null));assert.equal(starter.miners.length,1);
  const overview=async()=>{const b=page.locator('[data-inventory-action="close-detail"]');if(await b.isVisible())await b.click();};
  const mount=async id=>{await overview();await page.locator(`[data-inventory-mount="${id}"]`).click();};
  const tab=async id=>{await overview();const s=page.locator('[data-inventory-tab]');if(await s.isVisible())await s.selectOption(id);else await page.locator(`[data-inventory-action="tab"][data-tab="${id}"]`).click();};
  const layout=async label=>{const state=await page.locator('.equipment-inventory').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:e.scrollWidth>e.clientWidth+1};});assert.ok(state.x>=-1&&state.y>=-1&&state.right<=state.width+1&&state.bottom<=state.height+1&&!state.overflow,`${label}: ${JSON.stringify(state)}`);};
  await page.locator('[data-inventory-mount="wayfarer-drone-1"]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}-overview.png`});
  await mount('wayfarer-drone-1');await layout('installed drone');await page.screenshot({path:`${out}/${name}-installed.png`});
  assert.equal(await page.locator('[data-inventory-action="tab"][data-tab="drones"]').count(),0);await tab('shop');assert.equal(await page.locator('.inventory-item').count(),3);
  for(const type of ['mining','pdc','repair'])assert.equal(await page.locator(`.inventory-item [data-icon="${type}-drone"]`).count(),1);
  await page.locator('[data-inventory-id="shop-pdc-drone-1"]').click();await page.locator('[data-inventory-action="buy"]').click();
  await page.locator('[data-inventory-action="fit-mount"][data-mount-id="wayfarer-drone-1"]').click();await page.locator('[data-inventory-action="install"]').click();
  const drone=await page.evaluate(()=>{const p=__VOID_PRIVATEER__.getRuntime().save.player,b=p.outfitting.loadouts.wayfarer.droneBays[0];return{mode:b.mode,installed:b.unitIds.length,miner:Object.values(p.inventory.items).find(i=>i.baseId==='mining-drone')};});assert.equal(drone.mode,'pdc');assert.equal(drone.installed,1);assert.equal(drone.miner.location.kind,'cargo');
  await tab('cargo');await page.locator(`[data-inventory-id="${drone.miner.id}"]`).click();await page.locator('[data-inventory-action="store"]').click();assert.equal(await page.evaluate(id=>__VOID_PRIVATEER__.getRuntime().save.player.inventory.items[id].location.kind,drone.miner.id),'station');await page.locator('[data-inventory-action="carry"]').click();await layout('drone cargo');await page.screenshot({path:`${out}/${name}-cargo.png`});
  await mount('wayfarer-weapon-0');await page.locator('[data-inventory-action="remove"]').click();assert.equal(await page.locator('[data-inventory-action="sell"]').isEnabled(),true);await page.locator('[data-inventory-action="sell"]').click();
  await mount('wayfarer-weapon-1');await page.locator('[data-inventory-action="remove"]').click();assert.equal(await page.locator('[data-inventory-action="sell"]').isDisabled(),true);await layout('laser safeguard');await page.screenshot({path:`${out}/${name}-laser-safeguard.png`});
  await mount('wayfarer-weapon-0');await tab('shop');await page.locator('[data-inventory-id="shop-pulse-cannon-1"]').click();await page.locator('[data-inventory-action="buy"]').click();await page.locator('[data-inventory-action="install"]').click();
  await tab('storage');await page.locator(`[data-inventory-id="${starter.lasers[1]}"]`).click();assert.equal(await page.locator('[data-inventory-action="sell"]').isEnabled(),true);await page.locator('[data-inventory-action="sell"]').click();
  await tab('shop');await mount('wayfarer-drone-1');await overview();
  assert.match(await page.locator('[data-inventory-action="clear-mount"]').innerText(),/^Alle Teile$/i);
  await page.locator('[data-inventory-action="clear-mount"]').click();assert.ok(await page.locator('[data-inventory-id="shop-pulse-cannon-1"]').count());
  assert.equal(await page.locator('[data-inventory-tab] option[value="remote"]').count(),0);
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{createEquipmentRecord}=await import('/src/game/equipmentInventory.js');const item=createEquipmentRecord('pulse-cannon',{id:'eq-browser-remote-gun',location:{kind:'station',stationId:'vesper'}});r.save.player.inventory.items[item.id]=item;r.ui.refreshDock(r.save);});
  await mount('wayfarer-drone-1');await tab('remote');
  assert.match(await page.locator('[data-inventory-tab] option[value="remote"]').innerText(),/^Andere Stationen$/i);
  const remote=page.locator('[data-inventory-id="eq-browser-remote-gun"]');assert.match(await remote.innerText(),/Vesper/i);
  await layout('remote stock');const choice=page.locator('[data-inventory-tab]');if(await choice.isVisible())assert.equal(await choice.evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');await page.screenshot({path:`${out}/${name}-other-stations.png`});await remote.click();
  for(const action of ['install','sell','carry'])assert.equal(await page.locator(`[data-inventory-action="${action}"]`).count(),0);
  assert.deepEqual(errors,[]);report.push({name,starter,drone,menu:true,laserGuard:true,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'shared drone equipment, storage and laser sale safeguard passed');
 }catch(e){if(page){await page.screenshot({path:`${out}/${name}-failure.png`});await writeFile(`${out}/${name}-failure.txt`,String(e));}throw e;}finally{await browser.close();}
}
process.exit(0);
