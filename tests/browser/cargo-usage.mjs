import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/cargo-usage';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});await context.addInitScript(()=>{const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/output/exploration-review/index.html?scene=feedback');await page.waitForFunction(()=>window.discoveryReview?.ready&&discoveryReview.scene==='feedback');
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.save.player.cargo={ore:4,gold:2};r._statsDirty=true;});
  const own=page.locator('.cockpit-screen-own');if(device.isMobile)await own.tap({position:{x:10,y:10}});else await own.click({position:{x:10,y:10}});
  const equipment=page.locator('[data-ship-section="equipment"]');if(device.isMobile)await equipment.tap();else await equipment.click();
  const usage=page.locator('.inventory-cargo-usage'),bar=usage.locator('[role="progressbar"]');assert.ok(await usage.isVisible());
  const expected=await page.evaluate(async()=>{const {cargoMass,cargoCapacity}=await import('/src/game/economy.js'),p=__VOID_PRIVATEER__.getRuntime().save.player;return{mass:cargoMass(p),capacity:cargoCapacity(p)};});
  assert.equal(Number(await bar.getAttribute('aria-valuenow')),expected.mass);assert.equal(Number(await bar.getAttribute('aria-valuemax')),expected.capacity);assert.match(await usage.innerText(),new RegExp(`${Math.round(expected.mass/expected.capacity*100)}%`));
  const fit=await usage.evaluate(e=>{const b=e.getBoundingClientRect(),panel=e.closest('.ship-console').getBoundingClientRect();return{inside:b.left>=panel.left&&b.right<=panel.right&&b.top>=panel.top&&b.bottom<=panel.bottom,horizontal:e.scrollWidth<=e.clientWidth+1};});assert.ok(fit.inside&&fit.horizontal,JSON.stringify(fit));
  await page.screenshot({path:`${out}/${name}-cargo.png`});
  await page.locator('[data-inventory-mount]').first().click();assert.ok(await usage.isVisible());
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{cargoCapacity}=await import('/src/game/economy.js');r.save.player.cargo={food:cargoCapacity(r.save.player)};r.ui.showShipMenu();});assert.ok(await usage.isVisible());assert.equal(await usage.locator('.inventory-cargo-meter i').evaluate(e=>e.style.width),'100%');
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({expected,fit,errors},null,2));console.log(name,'cargo capacity, full hold and detail-view visibility passed');
 }catch(error){if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw error;}finally{await browser.close();}
}
