import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/startup-recovery';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const context=await browser.newContext({...devices['Pixel 7 landscape'],serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:class extends Event{static requestPermission(){return new Promise(()=>{});}}});});
 const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let releaseRequest;const pending=new Promise(resolve=>{releaseRequest=resolve;});
 const intercept=async route=>{await pending;try{await route.continue();}catch{/* The aborted page is already gone. */}};
 await page.route('**/src/game/game.js',intercept);
 await page.goto(`${base}/game.html`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
 await page.locator('[data-ui-command="new"]').tap();await page.locator('[data-ui-command="confirm-new-career"]').tap();
 await page.locator('#loading-screen:not(.is-hidden)').waitFor();
 await page.locator('#title-startup-error:not(.is-hidden)').waitFor({timeout:35000});
 assert.ok(await page.locator('#loading-screen').isHidden());assert.ok(await page.locator('#title-screen').isVisible());
 assert.match(await page.locator('#title-startup-error').innerText(),/Internetverbindung.*neu/i);assert.ok(await page.locator('[data-ui-command="reload-page"]').isVisible());
 await page.screenshot({path:`${out}/android-stalled-download.png`});
 releaseRequest();await page.unroute('**/src/game/game.js',intercept);
 await page.locator('[data-ui-command="reload-page"]').tap();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.resume);
 await page.locator('[data-ui-command="resume"]').tap();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'),null,{timeout:120000});
 assert.ok(await page.locator('#title-startup-error').isHidden());assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/android-recovered.png`});
 console.log('Android stalled flight download and motion permission: visible recovery and successful career resume passed');
}finally{await browser.close();}
