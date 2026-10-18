import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/tutorial-departure',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gs`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await page.locator('[data-ui-command="close-story"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);});page.setDefaultTimeout(20000);
  const ship=page.locator('.concourse-hover-ship'),close=page.locator('[data-ui-command="close-story"]');
  // The docked ship bobs continuously; use a real pointer at its current position.
  const clickShip=async()=>{await ship.waitFor({state:'visible'});const box=await ship.boundingBox();assert.ok(box);const x=box.x+box.width/2,y=box.y+box.height/2;if(device.isMobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
  const healthy=async()=>{
   const state=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),s=document.querySelector('.concourse-hover-ship');return{dock:r.save.player.dockedAt,transition:r.ui.vesperLaunchTransition,launching:!!document.querySelector('.is-launching,.is-departing'),disabled:s.getAttribute('aria-disabled'),tab:s.getAttribute('tabindex'),hidden:document.querySelector('.scene-pointers')?.getAttribute('aria-hidden'),inert:document.querySelector('#dock-screen').inert};});
   assert.equal(state.dock,'helix');assert.ok(!state.transition&&!state.launching&&!state.disabled&&!state.hidden&&!state.inert);assert.equal(state.tab,'0');
   assert.ok(await page.locator('[data-dock-hotspot="bar"]').isVisible());
  };
  for(let i=0;i<2;i++){
   await clickShip();await page.locator('#story-panel').waitFor({state:'visible'});assert.equal(await page.locator('#story-panel p').innerText(),'Du hast noch keinen Schlüssel für dieses Schiff.');
   if(!i){await page.waitForTimeout(400);await page.screenshot({path:`${out}/${name}-keys.png`});}
   if(i===1&&name==='desktop')await page.keyboard.press('Escape');else await close.click();await healthy();
  }
  const finish=async()=>{for(let i=0;await page.locator('#adventure-panel').isVisible();i++){assert.ok(i<12);await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().click();}};
  await page.locator('[data-dock-hotspot="bar"]').click();
  for(const id of ['mara-vek','rin-vek']){await page.locator(`[data-person-id="${id}"]`).click();await finish();}
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'buy-supplies');
  const concourse=async()=>{for(let i=0;i<3&&await page.locator('.dock-header .dock-back-button').count();i++)await page.locator('.dock-header .dock-back-button').click();};
  await concourse();await clickShip();assert.match(await page.locator('#story-panel p').innerText(),/Protein/);await close.click();await healthy();
  await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.locator('[data-commodity-id="food"]').click();await page.locator('[data-trade="buy:food:999"]').click();await finish();await concourse();
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'launch-helix');
  // A rejected preparation or thrown action must undo departure visuals as well.
  await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;window.realDeparture=u.actions.launch;u.actions.launch=async()=>false;});
  await clickShip();await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);await healthy();
  await page.emulateMedia({reducedMotion:'reduce'});await clickShip();await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);await healthy();await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().ui.actions.launch=async()=>{throw Error('Expected departure failure');};});await clickShip();
  await page.locator('#story-panel').waitFor({state:'visible'});assert.match(await page.locator('#story-panel p').innerText(),/Start nicht möglich/);await close.click();await healthy();
  // Cancelling must detach animation callbacks, so a stale animation cannot launch later.
  await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;window.departureCalls=0;u.actions.launch=()=>{window.departureCalls++;return false;};u.startVesperLaunchTransition();u.cancelVesperLaunchTransition();document.querySelector('.concourse-hover-ship-flight').dispatchEvent(new AnimationEvent('animationend',{animationName:'vesper-launch-ship'}));});
  assert.equal(await page.evaluate(()=>window.departureCalls),0);await healthy();
  await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().ui.actions.launch=window.realDeparture;});await clickShip();
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt&&!__VOID_PRIVATEER__.getRuntime().launchPreparing);
  assert.ok(await page.locator('#dock-screen').isHidden());assert.ok(await page.locator('#hud').isVisible());await page.screenshot({path:`${out}/${name}-departed.png`});
  assert.deepEqual(errors,[]);report.push({name,keysMessage:true,repeatedClicks:true,conversations:true,normalPurchase:true,failedLaunchRecovery:true,cancelledAnimation:true,normalDeparture:true,errors});console.log(name,'departure checks passed');
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
