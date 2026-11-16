import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const out='output/controller-setup',base=process.env.VR_BASE_URL??'http://127.0.0.1:4212';
await mkdir(out,{recursive:true});const report=[];
for(const [profile,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name))){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']}:{})});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('void-privateer-settings-v1',localStorage.getItem('void-privateer-settings-v1')??JSON.stringify({music:0,effects:0}));
   window.pad={index:0,id:'Setup test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:64},()=>({pressed:false,value:0}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[pad.connected?pad:null]});
   const Audio=window.AudioContext??window.webkitAudioContext;if(Audio)Audio.prototype.resume=async function(){await this.suspend();};
  });
  await page.goto(`${base}/game.html?revision=0.8.2of`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const set=async(buttons=[])=>{await page.evaluate(ids=>pad.buttons.forEach((b,i)=>{b.pressed=ids.includes(i);b.value=b.pressed?1:0;}),buttons);await page.waitForTimeout(120);};
  const tap=async button=>{await set([button]);await set();};
  const open=async()=>{await page.locator('[data-ui-command="options"]').click();await page.locator('[data-settings-tab="controls"]').click();await page.locator('.controller-binding-editor > summary').click();};
  const bind=(context,action)=>page.locator(`[data-ui-command="controller-bind"][data-binding-context="${context}"][data-binding-action="${action}"]`);
  const assign=async(context,action,button)=>{await bind(context,action).click();await set();await set([button]);await set();};
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('void-privateer-settings-v1')).controllerBindings);
  await open();
  await assign('flight','fire',7);let maps=await saved();assert.equal(maps.flight.fire,7);assert.equal(maps.flight.afterburner,0);assert.match(await page.locator('[data-controller-binding-status]').textContent(),/getauscht/);
  await set([7]);await bind('flight','targetNext').click();await page.waitForTimeout(200);assert.match(await bind('flight','targetNext').textContent(),/drücken/,'held button is not captured');
  await set();await set([11]);await set();maps=await saved();assert.equal(maps.flight.targetNext,11);
  await bind('flight','map').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#pause-panel').isVisible(),true);assert.equal((await saved()).flight.map,8);
  await page.locator('[data-ui-command="controller-unbind"][data-binding-action="rollLeft"]').click();assert.equal((await saved()).flight.rollLeft,null);
  await page.locator('[data-ui-command="controller-binding-context"][data-binding-context="menus"]').click();
  assert.equal(await page.locator('[data-ui-command="controller-unbind"][data-binding-action="confirm"]').isDisabled(),true);
  await assign('menus','confirm',42);assert.equal((await saved()).menus.confirm,42);
  await page.locator('[data-ui-command="controller-binding-test"]').click();await set();await set([42]);
  assert.equal(await page.locator('[data-ui-command="controller-binding-test"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-ui-command="controller-bind"].is-capturing').count(),0,'testing confirm does not activate a control');
  assert.equal(await page.locator('.controller-bind-row.is-pressed').count(),1);
  await set();await tap(1);assert.equal(await page.locator('[data-ui-command="controller-binding-test"]').getAttribute('aria-pressed'),'false');
  await page.screenshot({path:`${out}/${profile}-menus.png`});
  // The remapped confirm must work immediately, including indices above 31.
  await page.locator('[data-ui-command="close-options"]').evaluate(e=>e.focus());await tap(42);await page.locator('#pause-panel').waitFor({state:'hidden'});
  await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await open();assert.match(await bind('flight','fire').textContent(),/RT/);
  assert.equal((await saved()).menus.confirm,42);
  await page.locator('[data-ui-command="close-options"]').click();
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.settings.controllerBindings.flight.fire),7,'new career inherits global buttons');
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();r.ui.concourseShip?.skipAtmosphere();r.ui.concourseShip?.skipLanding();});
  for(let i=0;i<8;i++){const skip=page.locator('.planet-transit-skip:visible');if(await skip.count())await skip.first().click();await page.waitForTimeout(160);}
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.planetTransitOverlay&&!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.position=[0,90000,0];r.save.player.velocity.fill(0);r.save.player.throttle=0;r.ships=[];r.resetPlayerInterpolation(true);});
  await set();await set([7]);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().fire),true);
  await set();await tap(9);await page.locator('#pause-panel:not(.is-hidden)').waitFor();await page.locator('[data-settings-tab="controls"]').click();await page.locator('.controller-binding-editor > summary').click();
  await bind('flight','weaponCycle').click();await set();await page.evaluate(()=>{pad.connected=false;});await page.waitForTimeout(200);
  assert.match(await page.locator('[data-controller-binding-status]').textContent(),/getrennt/);
  await page.evaluate(()=>{pad.connected=true;});await set();
  await page.locator('[data-ui-command="controller-binding-reset"]').click();maps=await saved();assert.equal(maps.flight.fire,0);assert.equal(maps.menus.confirm,0);assert.equal(maps.flight.afterburner,7);
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.settings.controllerBindings.flight.fire),0);
  await assign('flight','fire',7);await set([7]);await page.locator('[data-ui-command="resume-flight"]').click();await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().fire),false,'a held new binding does not fire on resume');
  await set();await set([7]);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().fire),true);await set();
  await tap(9);await page.locator('[data-settings-tab="controls"]').click();await page.locator('.controller-binding-editor > summary').click();await page.locator('[data-ui-command="controller-bind"][data-binding-action="fire"]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/${profile}-flight.png`});
  assert.deepEqual(errors,[]);report.push({profile,swapping:true,captureAndCancel:true,extraMenuButton:true,testMode:true,persistence:true,newCareer:true,reset:true,heldResume:true,errors});console.log(profile,'in-game controller setup passed');
 }catch(error){await page?.screenshot({path:`${out}/${profile}-failure.png`}).catch(()=>{});throw error;}
 finally{let timer;try{await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(r,5000);})]);}finally{clearTimeout(timer);}}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
