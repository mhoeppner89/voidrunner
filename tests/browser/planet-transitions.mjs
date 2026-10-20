import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/planet-transitions',reports=[];await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);const errors=[],shots=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2iw`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  const ready=()=>page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});await ready();
  const renderer=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();window.originalDockRenderer=r.ui.concourseShip.renderer;return !!r.ui.concourseShip.renderer;});assert.ok(renderer);
  const cases=(process.env.VR_RECOVERY_ONLY?[]:process.env.VR_CAPTURE_ONLY?[['vesper','wayfarer']]:[['vesper','wayfarer'],['azure','atlas'],['meridian-prime','scrapper'],['boreal','torsas']]).filter(([location])=>!process.env.VR_TRANSIT_LOCATIONS||process.env.VR_TRANSIT_LOCATIONS.split(',').includes(location));
  for(const[location,hull]of cases){
   console.log(name,location,hull);
   await page.evaluate(async({location,hull})=>{const r=__VOID_PRIVATEER__.getRuntime();const {createOutfittingState}=await import('/src/game/outfitting.js');r.save.player.shipId=hull;r.save.player.outfitting=createOutfittingState([hull]);r.save.player.shipPaints??={};r.save.player.shipPaints[hull]=hull==='wayfarer'?'independent-bands':'independent-surveyor';r.ui.refreshDock(r.save);},{location,hull});
   await page.waitForFunction(id=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.loadedShipId===id,hull);await ready();
   await page.evaluate(async location=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();const {LOCATIONS}=await import('/src/game/data.js');r.renderer.setSystem(LOCATIONS[location].systemId);await Promise.all(r.renderer.worldTextureLoads??[]);r.dockAt(location,true);},location);
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='entry');
   assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.dockedAt),location);
   assert.ok(await page.locator('.scene-pointers').evaluate(e=>e.inert));
   for(const t of [.18,.58,.86]){
    const state=await page.evaluate(t=>{const u=__VOID_PRIVATEER__.getRuntime().ui,v=u.concourseShip;v.stop();const pose=v.transit.update(t);v.applyPose(pose);v.finish.uniforms.uFade.value=pose.fade;v.render();v.bounds.setFromObject(v.pivot);const size=v.target;let extent=0;for(let i=0;i<8;i++){v.point.set(i&1?v.bounds.max.x:v.bounds.min.x,i&2?v.bounds.max.y:v.bounds.min.y,i&4?v.bounds.max.z:v.bounds.min.z).project(v.transit.camera);extent=Math.max(extent,Math.abs(v.point.x),Math.abs(v.point.y));}return{phase:v.phase,hull:v.loadedShipId,paint:v.model.userData.livery,rendererReused:v.renderer===originalDockRenderer,meshInShot:v.pivot.parent===v.transit.scene,w:size.width,h:size.height,draws:v.renderer.info.render.calls,hasSurface:v.transit.uniforms.uHasSurface.value,surface:v.transit.uniforms.uSurface.value?.image?.src??'generated',extent};},t);
    assert.equal(state.phase,'entry');assert.ok(state.rendererReused&&state.meshInShot);assert.ok(state.w<=768&&state.h<=480);assert.equal(state.hull,hull);assert.equal(state.paint,hull==='wayfarer'?'independent-bands':'independent-surveyor');assert.ok(state.draws>0);shots.push({location,hull,t,...state});
    assert.equal(state.hasSurface,1,'borrow the loaded planet texture');assert.ok(state.extent<.92,`hull remains framed: ${state.extent}`);
    await page.screenshot({path:`${out}/${name}-${location}-entry-${Math.round(t*100)}.png`});
   }
   if(name==='iphone'&&location==='vesper'){
    // WebKit viewport emulation needs a paint + resize event, like a real rotation.
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${name}-rotation-pending.png`});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.locator('#rotate-notice').waitFor({state:'visible',timeout:10000});await page.waitForTimeout(150);const paused=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return{time:v.elapsed,draws:v.renderCount};});await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return{time:v.elapsed,draws:v.renderCount};}),paused);await page.screenshot({path:`${out}/${name}-portrait.png`});await page.setViewportSize({width:844,height:390});await page.screenshot({path:`${out}/${name}-rotation-return.png`});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.locator('#rotate-notice').waitFor({state:'hidden',timeout:10000});await page.waitForFunction(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return Math.abs(v.transit.camera.aspect-v.host.clientWidth/v.host.clientHeight)<.01;});
   }
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.resume());
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='landing');assert.equal(await page.locator('.planet-transit').count(),0);await ready();
   assert.ok(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return v.pivot.parent===v.scene&&v.host.classList.contains('concourse-model-stage')&&v.renderer.shadowMap.enabled&&v.backdropKey?.startsWith(v.location+':')&&!v.pendingBackdrop&&v.finish.uniforms.uExposure.value===v.profile.exposure;}));
   await page.screenshot({path:`${out}/${name}-${location}-landed.png`});
   await page.locator('.concourse-hover-ship').click({force:true});await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='takeoff');
   assert.equal(await page.locator('.planet-transit').count(),0,'pad takeoff precedes atmosphere');
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='exit');assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.dockedAt),location,'cockpit waits for ascent');
   for(const t of [.18,.5,.86]){const departure=await page.evaluate(t=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const p=v.transit.update(t);v.applyPose(p);v.finish.uniforms.uFade.value=p.fade;v.render();const shot=v.transit;v.bounds.setFromObject(v.pivot);let extent=0;for(let i=0;i<8;i++){v.point.set(i&1?v.bounds.max.x:v.bounds.min.x,i&2?v.bounds.max.y:v.bounds.min.y,i&4?v.bounds.max.z:v.bounds.min.z).project(shot.camera);extent=Math.max(extent,Math.abs(v.point.x),Math.abs(v.point.y));}return{outbound:shot.uniforms.uDeparture.value,globeMapping:shot.background.fragmentShader.includes('angles.y/3.14159265+.5'),radius:shot.uniforms.uPlanetRadius.value,center:shot.uniforms.uPlanetCenter.value.toArray(),extent};},t);assert.equal(departure.outbound,1);assert.ok(departure.globeMapping,'capture the current corrected globe shader');assert.ok(departure.extent<.92,`outbound hull remains framed: ${departure.extent}`);shots.push({location,hull,t,phase:'exit',...departure});await page.screenshot({path:`${out}/${name}-${location}-exit-${Math.round(t*100)}.png`});}
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.resume());await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
   assert.ok(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return !v.transit&&v.paused&&!v.raf&&v.renderer===originalDockRenderer;}));assert.equal(await page.locator('.planet-transit').count(),0);
   assert.ok(await page.evaluate(async location=>{const r=__VOID_PRIVATEER__.getRuntime(),THREE=await import('three'),{LOCATIONS}=await import('/src/game/data.js'),p=r.save.player,forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().fromArray(p.rotation)),toPlanet=new THREE.Vector3(...LOCATIONS[location].position).sub(new THREE.Vector3(...p.position));return forward.dot(toPlanet)<0;},location),'cockpit heading continues away from the planet');
   // Restore an already-docked save, rather than a fresh landing: no entry shot.
   await page.evaluate(location=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt=location;r.ui.showDock(r.save,location);},location);await ready();assert.equal(await page.locator('.planet-transit').count(),0);
  }
  if(!process.env.VR_CAPTURE_ONLY&&!process.env.VR_CINEMATICS_ONLY){
   await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='vesper';r.ui.showDock(r.save,'vesper');});await ready();
   // A refused planetary launch and a cancelled ascent both return a usable port.
   await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;window.realLaunch=u.actions.launch;u.actions.launch=async()=>false;u.startVesperLaunchTransition();});
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='exit');
   const beforeHidden=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;Object.defineProperty(document,'hidden',{value:true,configurable:true});v.onVisibility();return{time:v.elapsed,draws:v.renderCount};});
   await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return{time:v.elapsed,draws:v.renderCount};}),beforeHidden,'hidden shots do no frame work');
   await page.evaluate(()=>{delete document.hidden;__VOID_PRIVATEER__.getRuntime().ui.concourseShip.onVisibility();});
   await page.locator('.planet-transit-skip').click();
   await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);assert.ok(await page.locator('.concourse-hover-ship').isEnabled());assert.ok(!await page.locator('.scene-pointers').evaluate(e=>e.inert));
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.startVesperLaunchTransition());await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='exit');
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.cancelVesperLaunchTransition());await page.waitForTimeout(100);assert.equal(await page.locator('.planet-transit').count(),0);assert.ok(await page.locator('.concourse-hover-ship').isEnabled());
   // Reusing the same shot never accumulates geometry or textures.
   const memory=await page.evaluate(async()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,host=v.host,memories=[];for(let i=0;i<3;i++){const done=v.playAtmosphere(host,'entry','vesper',undefined);while(v.transitPreparing)await new Promise(resolve=>setTimeout(resolve,10));v.stop();v.applyPose(v.transit.update(.5));v.render();memories.push({...v.renderer.info.memory});v.skipAtmosphere();await done;}v.resume();return memories;});
   assert.deepEqual(memory[1],memory[2],'repeat shots reuse GPU resources');
   if(name==='desktop'){
    await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.startVesperLaunchTransition());await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='exit');
    await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;window.lostContext=v.renderer.getContext().getExtension('WEBGL_lose_context');lostContext.loseContext();});
    await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);assert.equal(await page.locator('.planet-transit').count(),0);assert.ok(await page.locator('.concourse-hover-ship').isEnabled());
    await page.waitForTimeout(250);await page.evaluate(()=>lostContext.restoreContext());await page.waitForFunction(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return !v.contextLost&&v.host.classList.contains('has-model');});
   }
   await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.actions.launch=realLaunch;r.ui.showDock(r.save,'vesper',{arrival:true});});await ready();assert.equal(await page.locator('.planet-transit').count(),0);
   await page.locator('.concourse-hover-ship').click({force:true});await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);assert.equal(await page.locator('.planet-transit').count(),0);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.dockAt('helix',true);});await ready();assert.equal(await page.locator('.planet-transit').count(),0,'station exterior finishes before the concourse becomes ready');
   await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();r.dockAt('vesper',true);});await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='entry');
   await page.keyboard.press('Escape');await ready();assert.ok(!await page.locator('.scene-pointers').evaluate(e=>e.inert));assert.equal(await page.locator('.planet-transit').count(),0);
  }
  assert.deepEqual(errors,[]);reports.push({name,shots,errors});await writeFile(`${out}/${process.env.VR_RECOVERY_ONLY?'recovery-report':process.env.VR_CAPTURE_ONLY?'capture-report':'report'}.json`,JSON.stringify(reports,null,2));console.log(name,'passed');
 }finally{await browser.close();}
}
