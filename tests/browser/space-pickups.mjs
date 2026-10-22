import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/space-pickups';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});await context.addInitScript(()=>{const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(base+'/output/exploration-review/index.html');await page.waitForFunction(()=>window.discoveryReview?.ready);
  const press=async selector=>device.isMobile?page.locator(selector).first().tap():page.locator(selector).first().click();
  const select=async scene=>{if(await page.locator('#discovery-review').getAttribute('hidden')!==null)await press('#review-menu');await press(`[data-scene="${scene}"]`);await page.waitForFunction(scene=>discoveryReview.ready&&discoveryReview.scene===scene,scene);await page.evaluate(()=>cancelAnimationFrame(__VOID_PRIVATEER__.getRuntime().frameId));};
  await select('salvage');
  const expectedSalvage=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),{OUTFIT_ITEMS}=await import('/src/game/outfitting.js'),{equipmentName}=await import('/src/game/equipmentCatalog.js'),{COMMODITIES}=await import('/src/game/data.js'),{t}=await import('/src/game/i18n.js');
   const wreck=r.save.world.combatWrecks['wreck-exploration-kestrel-nine'];
   const expected=wreck.contents.map(e=>({name:e.kind==='cargo'?t(COMMODITIES[e.commodity].name):equipmentName(OUTFIT_ITEMS[e.item.id]),quantity:e.quantity??1}));
   r.save.player.throttle=.7;for(let i=0;i<900&&!r.save.world.exploration.recovered.includes('finale');i++)r.updateSimulation(1/60,{});r.save.player.throttle=0;r.save.player.velocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());
   if(!r.save.world.exploration.recovered.includes('finale'))throw Error('Final salvage was not collected');
   return expected;
  });
  for(const [index,receipt]of expectedSalvage.entries()){
   if(index)await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.world.time+=6;r.ui.updateHud(r.buildHudModel());});
   const label=await page.locator('#space-pickup-receipt').getAttribute('aria-label');
   assert.equal(label,`+${receipt.quantity} ${receipt.name}`);assert.doesNotMatch(label,/undefined|\[object Object\]/);
   if(index)await page.screenshot({path:`${out}/${name}-salvage-receipt-${index}.png`});
  }
  if(process.env.VR_RECEIPTS_ONLY){assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-salvage-receipts.json`,JSON.stringify({expectedSalvage,errors},null,2));console.log(name,'final salvage names, quantities and equipment icons passed');continue;}
  await select('pod-0');
  const collected=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.throttle=.7;for(let i=0;i<900&&!r.save.world.exploration.recovered.includes('wake');i++)r.updateSimulation(1/60,{});r.save.player.throttle=0;r.save.player.velocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());return{cargo:r.save.player.cargo.electronics,dialogue:!!r.ui.adventure,pending:r.ui.spacePickupQueue.length};});
  assert.deepEqual(collected,{cargo:1,dialogue:true,pending:1});assert.ok(!await page.locator('#space-pickup-receipt').isVisible());
  await press('[data-ui-command="adventure-choice"]');await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.updateHud(r.buildHudModel());});
  assert.ok(await page.locator('#space-pickup-receipt [data-commodity-icon="electronics"]').isVisible());assert.match(await page.locator('#space-pickup-receipt').innerText(),/\+1/);await page.screenshot({path:`${out}/${name}-log-receipt.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.clearSpacePickups();r.spawnPickup('gold',r.save.player.position,'salvage',3);for(const p of r.pickups)p.collectAfter=0;r.updatePickups(1/60);r.ui.updateHud(r.buildHudModel());});
  assert.ok(await page.locator('#space-pickup-receipt [data-commodity-icon="gold"]').isVisible());assert.match(await page.locator('#space-pickup-receipt').innerText(),/\+3/);
  const hulls=await page.evaluate(async()=>Object.keys((await import('/src/game/data.js')).SHIPS));const layouts=[];
  for(const hull of hulls){
   await page.evaluate(hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.setCockpitShip(hull);r.ui.updateSpacePickup();},hull);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const bounds=await page.evaluate(()=>{const own=document.querySelector('.cockpit-screen-own').getBoundingClientRect(),p=document.querySelector('#space-pickup-receipt').getBoundingClientRect(),bar=document.querySelector('#screen-own-shield').closest('.screen-bars').getBoundingClientRect(),icon=document.querySelector('#space-pickup-receipt svg').getBoundingClientRect();return{inside:p.left>=own.left-1&&p.right<=own.right+1&&p.top>=own.top-1&&p.bottom<=own.bottom+1,noOverlap:p.right<=bar.left+1,icon:[icon.width,icon.height]};});
   assert.ok(bounds.inside&&bounds.noOverlap&&bounds.icon.every(v=>v>=6),JSON.stringify({hull,...bounds}));layouts.push({hull,...bounds});
  }
  await select('feedback'); // Warm the real LaserFx cache before another reset.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.renderer.spawnMuzzleFlash(...r.save.player.position,0xffaa33);});
  await select('convoy');await press('[data-ui-command="adventure-choice"]');
  const effects=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),renderer=r.renderer;const shared=renderer.laserFx.effects===renderer.effects;
   // Run actual combat after the scene reset, presenting effects each step.
   for(let i=0;i<900;i++){r.updateSimulation(1/60,{});renderer.updateWorldVisuals();}
   const battleEffects=renderer.effects.length;
   r.ships=[];r.projectiles.forEach(p=>p.life=0);r.cleanupEntities();renderer.syncShips([]);renderer.syncProjectiles([],r.projStore);
   for(let i=0;i<900;i++){renderer.updateWorld(1/60);renderer.updateWorldVisuals();}
   const transient=renderer.effects.filter(e=>!e.combatWreck).length;
   renderer.spawnMuzzleFlash(...r.save.player.position,0xffaa33);const flash=renderer.effects.at(-1).object;
   renderer.updateEffects(.1);renderer.updateEffects(.1);
   return{shared,battleEffects,transient,flashExpired:flash.parent===null,queueCount:r.ui.spacePickupQueue.length};
  });assert.ok(effects.shared&&effects.transient===0&&effects.flashExpired,JSON.stringify(effects));
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({collected,layouts,effects,errors},null,2));console.log(name,'pickup receipts, all-hull fitting and combat effect expiry passed');
 }catch(error){if(page)await page.screenshot({path:`${out}/${name}-failure.png`});await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(error),errors},null,2));throw error;}finally{await browser.close();}
}
