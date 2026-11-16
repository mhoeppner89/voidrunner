import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/interface-font-sort';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2nk`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.locator('#title-screen .title-actions button').first().evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);
  await page.locator('#title-screen [data-ui-command="options"]').click();
  assert.match(await page.locator('#pause-panel .settings-tabs button').first().evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);
  await page.screenshot({path:`${out}/${name}-options.png`});await page.locator('[data-ui-command="close-options"]').click();
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);r.ui.switchToTerminal('market');r.ui.openMarketPoint('equipment');});
  await page.locator('.equipment-inventory').waitFor();await page.locator('[data-inventory-action="tab"][data-tab="shop"]').click();
  assert.equal(await page.locator('select[data-inventory-sort]').count(),0);
  const summary=page.locator('.inventory-sort > summary');assert.ok(await summary.isVisible());
  assert.match(await page.locator('.inventory-item b').first().evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);
  await summary.click();assert.ok(await page.locator('.inventory-sort[open] .inventory-sort-menu').isVisible());
  await page.screenshot({path:`${out}/${name}-sort-open.png`});
  await page.locator('[data-inventory-action="sort"][data-sort="tier"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.inventorySort),'tier');
  assert.equal(await page.locator('.inventory-sort[open]').count(),0);assert.equal(await summary.textContent(),'Technikstufe▾');
  const tiers=await page.evaluate(async()=>{const {OUTFIT_ITEMS}=await import('/src/game/outfitting.js');return [...document.querySelectorAll('.inventory-items [data-inventory-id]')].map(e=>OUTFIT_ITEMS[e.dataset.inventoryId]?.tier??1);});
  assert.ok(tiers.length>1&&tiers.every((n,i)=>i===0||tiers[i-1]>=n),'tier sort orders the actual items');
  await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.inventory-sort[open]').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.inventory-sort[open]').count(),0);assert.ok(await summary.evaluate(e=>e===document.activeElement));
  await summary.click();await page.locator('[data-inventory-action="sort"][data-sort="mass"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.inventorySort),'mass');
  const masses=await page.evaluate(async()=>{const {OUTFIT_ITEMS}=await import('/src/game/outfitting.js');return [...document.querySelectorAll('.inventory-items [data-inventory-id]')].map(e=>OUTFIT_ITEMS[e.dataset.inventoryId]?.mass??0);});assert.ok(masses.every((n,i)=>i===0||masses[i-1]<=n),'mass sort orders the actual items');
  if(name!=='desktop'){
   await page.setViewportSize({width:568,height:320});await summary.click();const fit=await page.locator('.inventory-sort-menu').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});assert.ok(fit,'menu fits a small landscape phone');
   const lines=await page.locator('.inventory-sort-menu button').evaluateAll(buttons=>buttons.map(b=>{const range=document.createRange();range.selectNodeContents(b);return range.getClientRects().length;}));assert.ok(lines.every(n=>n===1),`sort labels must not wrap: ${lines}`);await page.screenshot({path:`${out}/${name}-small-sort.png`});
   await page.locator('[data-inventory-action="sort"][data-sort="tier"]').click();const summaryFits=await summary.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1;});assert.ok(summaryFits,'the longest selected sort label fits the small phone');
   await page.setViewportSize(device.viewport);
  }
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.switchToTerminal('concourse');r.ui.showStory('Pilot, prüfe die Instrumente.');});
  assert.match(await page.locator('#story-panel p[role="status"]').evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);await page.screenshot({path:`${out}/${name}-story.png`});
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideStory();await r.launch();if(r.save.player.dockedAt)throw Error('Launch was blocked');r.openMap();});
  await page.locator('#map-panel .map-node b').first().waitFor();assert.match(await page.locator('#map-panel .map-node b').first().evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);await page.screenshot({path:`${out}/${name}-map.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideMap();r.ui.inventoryView=true;r.openShipMenu();});
  const flightSort=page.locator('#ship-panel .inventory-sort > summary');await flightSort.waitFor();await flightSort.click();await page.locator('#ship-panel [data-inventory-action="sort"][data-sort="name"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.inventorySort),'name');
  assert.match(await page.locator('#ship-panel .ship-console-header h2').evaluate(e=>getComputedStyle(e).fontFamily),/Void VGA Text/);await page.screenshot({path:`${out}/${name}-flight-inventory.png`});
  assert.match(await page.locator('#screen-own-speed').evaluate(e=>getComputedStyle(e).fontFamily),/Courier New/,'cockpit telemetry retains its instrument font');
  assert.deepEqual(errors,[]);console.log(name,'interface fonts and equipment sorting passed');
 }finally{await browser.close();}
}
