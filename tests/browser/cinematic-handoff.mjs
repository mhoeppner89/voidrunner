import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/cinematic-handoff',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[],report=[];
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push(`${r.failure()?.errorText}: ${r.url()}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${m.location().url??''}`.trim());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2jp`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  const ready=()=>page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime(),u=r?.ui,v=u?.concourseShip;return r?.flightPrepared&&!u.concourseArrivalPending&&v?.model&&!v.dockPreparing&&v.host.classList.contains('has-model')&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await ready();await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);window.handoffAttaches=[];const v=r.ui.concourseShip,attach=v.attach;v.attach=function(...args){const result=attach.apply(this,args);if(this.transit)handoffAttaches.push({direction:this.transit.direction??this.transit.phase,visibility:getComputedStyle(this.canvas).visibility});return result;};});
  for(const location of ['helix','vesper']){
   console.log(name,location,'handoffs');
   // Hold model preparation for a real painted frame: arrival must not reveal
   // the location plate before its exterior shot, even on a cold phone.
   await page.evaluate(location=>{const r=__VOID_PRIVATEER__.getRuntime(),u=r.ui,v=u.concourseShip,configure=v.configure;r.save.player.dockedAt=location;v.configure=async function(...args){await new Promise(resolve=>window.releaseArrival=resolve);return configure.apply(this,args);};window.restoreConfigure=()=>v.configure=configure;u.showDock(r.save,location,{arrival:true});},location);
   await page.waitForFunction(()=>!!window.releaseArrival);
   assert.equal(await page.locator('#dock-screen > .dock-backdrop').evaluate(e=>getComputedStyle(e).opacity),'0');
   await page.screenshot({path:`${out}/${name}-${location}-arrival-wait.png`});
   await page.evaluate(()=>{releaseArrival();delete window.releaseArrival;restoreConfigure();});
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='entry');
   await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const p=v.transit.update(.5);v.applyPose(p);v.finish.uniforms.uFade.value=p.fade;v.render();});
   assert.equal(await page.locator('.planet-transit canvas').evaluate(e=>getComputedStyle(e).visibility),'visible');
   await page.screenshot({path:`${out}/${name}-${location}-entry.png`});
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.resume());await ready();
   assert.equal(await page.locator('#dock-screen > .dock-backdrop').evaluate(e=>getComputedStyle(e).opacity),'1');
   await page.screenshot({path:`${out}/${name}-${location}-landed.png`});
   // Delay the genuine launch transaction, then separately delay the first
   // flight draw. Neither interval may uncover the dock artwork.
   await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;window.realHandoffLaunch=u.actions.launch;window.launchReached=false;u.actions.launch=async()=>{launchReached=true;await new Promise(resolve=>window.releaseLaunch=resolve);return realHandoffLaunch();};});
   await page.locator('.concourse-hover-ship').click({force:true});
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='exit');
   await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const p=v.transit.update(.5);v.applyPose(p);v.finish.uniforms.uFade.value=p.fade;v.render();});
   await page.screenshot({path:`${out}/${name}-${location}-exit.png`});
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.resume());await page.waitForFunction(()=>window.launchReached);
   assert.ok(await page.locator('.planet-transit[data-awaiting-flight="true"]').isVisible());
   await page.screenshot({path:`${out}/${name}-${location}-launch-wait.png`});
   // Escape must not open a pause menu behind the retained handoff cover.
   await page.keyboard.press('Escape');assert.ok(await page.locator('#pause-panel').evaluate(e=>e.classList.contains('is-hidden')));
   await page.evaluate(()=>releaseLaunch());await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
   assert.ok(await page.locator('.planet-transit[data-awaiting-flight="true"]').isVisible());
   assert.ok(await page.locator('#dock-screen').evaluate(e=>e.classList.contains('is-hidden')));
   await page.screenshot({path:`${out}/${name}-${location}-flight-wait.png`});
   const flight=await page.evaluate(location=>{const r=__VOID_PRIVATEER__.getRuntime(),before=r.renderFrameCount??0,time=r.save.world.time;
    if(location==='vesper'){
     r.ui.showPause();r.lastRenderRevision=r.renderer.renderRevision;r.lastFrame=performance.now();r.frameBody(performance.now());
     if(!r.ui.isModalOpen||r.save.world.time!==time)throw Error('The departure modal did not keep simulation paused');r.ui.hidePause();
    }else r.syncRender(0,performance.now());
    r.ui.actions.launch=realHandoffLaunch;return{drawn:r.renderFrameCount>before,docked:r.save.player.dockedAt??null,overlay:!!r.ui.planetTransitOverlay};
   },location);
   assert.deepEqual(flight,{drawn:true,docked:null,overlay:false});assert.equal(await page.locator('.planet-transit').count(),0);
   await page.screenshot({path:`${out}/${name}-${location}-cockpit.png`});
   report.push({location,flight});
  }
  // A refusal or explicit cancellation must restore the same usable dock.
  for(const cancel of [false,true]){
   await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='vesper';r.ui.showDock(r.save,'vesper');});await ready();
   await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.actions.launch=async()=>false;u.startVesperLaunchTransition();});await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='exit');
   if(cancel)await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.cancelVesperLaunchTransition());else await page.locator('.planet-transit-skip').click();
   await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);
   assert.equal(await page.locator('.planet-transit').count(),0);assert.ok(await page.locator('.concourse-hover-ship').isEnabled());
   await page.waitForFunction(()=>getComputedStyle(__VOID_PRIVATEER__.getRuntime().ui.concourseShip.canvas).visibility==='visible');
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.actions.launch=realHandoffLaunch;r.ui.showDock(r.save,'vesper',{arrival:true});});await ready();
  assert.equal(await page.locator('.planet-transit').count(),0);assert.equal(await page.locator('#dock-screen > .dock-backdrop').evaluate(e=>getComputedStyle(e).opacity),'1');
  await page.locator('.concourse-hover-ship').click({force:true});await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);assert.equal(await page.locator('.planet-transit').count(),0);
  const attaches=await page.evaluate(()=>handoffAttaches);assert.ok(attaches.length>=6);assert.ok(attaches.every(a=>a.visibility==='hidden'),`A reused canvas revealed its previous shot: ${JSON.stringify(attaches)}`);
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-report.json`,JSON.stringify({report,attaches,errors},null,2));console.log(name,'covered arrivals, fresh film frames, launch/flight holds, refusal, cancellation and reduced motion passed');
 }finally{await browser.close();}
}
