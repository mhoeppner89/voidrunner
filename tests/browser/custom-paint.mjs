import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/repaint',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[],requests=[];page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('.glb'))requests.push(r.url());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2ko&debug-shaders`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const hulls=process.env.VR_HULLS?.split(',')??(name==='desktop'?await page.evaluate(async()=>Object.keys((await import('/src/game/data.js')).SHIPS)):['wayfarer','talon','demon','lancer','atlas']);
  const cases=[];
  const ready=async()=>{await page.waitForFunction(()=>{const p=__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0];return p?.container?.isConnected&&p.renderer.domElement.isConnected&&p.model?.paintSources&&!p.dirty;});};
  const paintReady=async()=>{await page.waitForFunction(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui,p=u.shipPreviews[0];return !u.paintPreviewPending&&p?.model?.userData.livery==='custom'&&p.model.customPaintState?.uniforms.length>0&&!p.dirty;});};
  for(const hull of hulls){
   await page.evaluate(async hull=>{const r=__VOID_PRIVATEER__.getRuntime(),{createOutfittingState}=await import('/src/game/outfitting.js');cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.save.player.shipId=hull;r.save.player.credits=10000;r.save.player.outfitting=createOutfittingState([hull]);r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');r.ui.switchToTerminal('services');},hull);
   await ready();assert.equal(await page.locator('.service-grid > article').count(),3);
   await page.locator('[data-ui-command="paint-open"]').click();await ready();
   if(name!=='desktop'){
    const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,apply:document.querySelector('[data-ui-command="repaint"]').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('.paint-controls button,.paint-colors input')].map(e=>e.getBoundingClientRect().toJSON())}));
    await page.screenshot({path:`${out}/${name}-initial-layout.png`});
    assert.ok(layout.apply.bottom<=layout.height&&layout.apply.right<=layout.width,`apply stays visible without scrolling: ${JSON.stringify(layout)}`);
    for(const b of layout.controls)assert.ok(b.width>=44&&b.height>=44&&b.x>=0&&b.right<=layout.width,'phone controls retain 44px hit targets');
   }
   const initial=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.ui.shipPreviews[0];window.paintProbe={model:p.model,canvas:p.renderer.domElement,calls:p.renderer.info.render.calls};return r.save.player.credits;});
   assert.equal(await page.locator('[data-pattern]').count(),4);assert.equal(await page.locator('[data-paint-color]').count(),3);
   await page.locator('[data-ui-command="paint-palette"][data-palette="2"]').click();await paintReady();
   const baseline=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].renderer.info.programs.length),beforeRequests=requests.length;
   for(const pattern of ['panels','stripes','blocks','asymmetric']){
    await page.locator(`[data-pattern="${pattern}"]`).click();await paintReady();
    assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.credits),initial);
    const state=await page.evaluate(()=>{const p=__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0],root=p.model;let painted=0,glass=0,paintedGlass=0;root.traverse(n=>{if(!n.isMesh)return;for(const m of Array.isArray(n.material)?n.material:[n.material]){if(m.userData.customPaint)painted++;if(/canopy|glass|glazing/i.test(m.name)){glass++;paintedGlass+=!!m.userData.customPaint;}}});return{sameModel:root===paintProbe.model,sameCanvas:p.renderer.domElement===paintProbe.canvas,sameCalls:p.renderer.info.render.calls===paintProbe.calls,painted,glass,paintedGlass,programs:p.renderer.info.programs.length,design:root.userData.paintDesign};});
    assert.ok(state.sameModel&&state.sameCanvas&&state.sameCalls&&state.painted>0);assert.equal(state.paintedGlass,0);assert.equal(state.programs,baseline);assert.equal(state.design.pattern,pattern);
    await page.screenshot({path:`${out}/${name}-${hull}-${pattern}.png`});
   }
   assert.equal(requests.length,beforeRequests,'pattern changes must not reload GLBs');
   const idle=await page.evaluate(async()=>{const p=__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0],frame=p.renderer.info.render.frame;await new Promise(r=>setTimeout(r,250));return frame===p.renderer.info.render.frame;});assert.ok(idle,'idle paint preview must not keep drawing');
   await page.locator('[data-paint-color="0"]').fill('#267e91');await paintReady();
   await page.locator('[data-paint-color="1"]').fill('#e0c487');await paintReady();
   await page.locator('[data-paint-color="2"]').fill('#a7335c');await paintReady();
   const canvas=page.locator('.paint-editor-preview canvas'),box=await canvas.boundingBox();
   const rotation=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].pivot.rotation.y);
   await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.65,{steps:8});await page.mouse.up();
   assert.notEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].pivot.rotation.y),rotation);
   await page.locator('[data-ui-command="paint-factory"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].model.userData.livery==='original');
   assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.credits),initial);
   await page.locator('[data-pattern="stripes"]').click();await paintReady();
   for(const[i,c]of ['#267e91','#e0c487','#a7335c'].entries()){await page.locator(`[data-paint-color="${i}"]`).fill(c);await paintReady();}
   const design=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.paintDraft);
   assert.deepEqual(design.colors,['#267e91','#e0c487','#a7335c']);
   await page.locator('[data-ui-command="repaint"]').click();await ready();await paintReady();
   const saved=await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{repaintCost}=await import('/src/game/shipStats.js'),{hydrateSave}=await import('/src/game/save.js');return{credits:r.save.player.credits,cost:repaintCost(r.save.player),paint:r.save.player.shipPaints[r.save.player.shipId],restored:hydrateSave(JSON.parse(JSON.stringify(r.save))).player.shipPaints[r.save.player.shipId]};});
   assert.equal(saved.credits,initial-saved.cost);assert.deepEqual(saved.paint,design);assert.deepEqual(saved.restored,design);assert.ok(await page.locator('[data-ui-command="repaint"]').isDisabled());
   assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].renderer.domElement===paintProbe.canvas),'applying paint retains the service renderer');
   if(hull==='wayfarer'||hull==='lancer'){
    const flight=await page.evaluate(async()=>{
     const r=__VOID_PRIVATEER__.getRuntime(),T=await import('three'),{GLB_SHIP_CONFIG}=await import('/src/game/render.js'),{SHIPS}=await import('/src/game/data.js'),h=r.save.player.shipId,variant=SHIPS[h].variant;
     r.renderer.ensureGlbShipModel(variant);await r.renderer.glbShipLoading.get(variant);
     const design=r.save.player.shipPaints[h],mesh=r.renderer.createGlbShipMesh({id:'paint-flight-check',faction:'player',role:'escort',variant,livery:design},r.renderer.glbShipModels.get(variant),GLB_SHIP_CONFIG[variant],variant);
     const scene=new T.Scene();scene.add(mesh,new T.HemisphereLight());r.renderer.renderer.compile(scene,new T.PerspectiveCamera());
     const body=mesh.children[0],state=body.customPaintState,result={livery:mesh.userData.livery,design:body.userData.paintDesign,colors:state.uniforms[0]?[state.uniforms[0].cpMain.value.getHexString(),state.uniforms[0].cpSecond.value.getHexString(),state.uniforms[0].cpAccent.value.getHexString()]:[]};
     const materials=new Set();mesh.traverse(n=>{for(const m of [n.material].flat())if(m)materials.add(m);if(n.paintSources)for(const source of n.paintSources.values())for(const m of [source].flat())materials.add(m);});for(const m of materials)m.dispose();scene.clear();return result;
    });assert.equal(flight.livery,'custom');assert.deepEqual(flight.design,design);assert.deepEqual(flight.colors,design.colors.map(c=>c.slice(1)));
   }
   await page.locator('[data-pattern="blocks"]').click();await paintReady();await page.locator('[data-ui-command="paint-reset"]').click();await paintReady();assert.deepEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.paintDraft),design);
   await page.locator('[data-pattern="blocks"]').click();await paintReady();
   await page.locator('[data-ui-command="paint-back"]').click();await ready();assert.deepEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.shipPaints[__VOID_PRIVATEER__.getRuntime().save.player.shipId]),design);
   assert.deepEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.shipPreviews[0].model.userData.paintDesign),design);
   cases.push({hull,...saved});console.log(name,hull,'patterns, colors, fixed glass, rotation, uniform reuse, billing and save passed');
  }
  // The same saved design reaches the real docked model and departure shot.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.switchToTerminal('concourse');});
  await page.waitForFunction(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui,v=u.concourseShip;return v?.model?.userData.livery==='custom'&&v.host?.classList.contains('has-model')&&!u.concourseArrivalPending&&!document.querySelector('.concourse-hover-ship')?.disabled;});
  assert.deepEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.model.userData.paintDesign),cases.at(-1).paint);
  await page.screenshot({path:`${out}/${name}-concourse.png`});
  await page.locator('.concourse-hover-ship').click();
  try{await page.waitForFunction(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return v.phase==='exit'&&v.transit;},null,{timeout:30000});}catch(error){
   console.log('departure state',await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),u=r.ui,v=u.concourseShip;return{docked:r.save.player.dockedAt,launching:u.vesperLaunchTransition,phase:v.phase,paused:v.paused,elapsed:v.elapsed,frames:v.renderCount,contextLost:v.contextLost,gpuLost:v.renderer.getContext().isContextLost(),transit:!!v.transit,preparing:!!v.transitPreparing,hidden:document.hidden,story:document.querySelector('#story-panel')?.textContent};}));throw error;
  }
  const departure=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();v.applyPose(v.transit.update(.4));v.render();return v.model.userData.paintDesign;});assert.deepEqual(departure,cases.at(-1).paint);
  await page.screenshot({path:`${out}/${name}-departure.png`});await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.skipAtmosphere());
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
  if(name==='iphone'){
   // The game deliberately requires landscape. Its standalone workshop also
   // supports portrait. Use a real portrait device context: resizing a WebKit
   // landscape context can retain its old CSS layout viewport and only shrink
   // the visual viewport, which is not a device rotation.
   const portrait=await browser.newPage({...devices['iPhone 13'],serviceWorkers:'block'});
   portrait.on('pageerror',e=>errors.push(e.message));await portrait.goto(`${base}/output/repaint/index.html?revision=0.8.2ko`);
   await portrait.waitForFunction(()=>window.paintReview?.shipPreviews[0]?.model?.paintSources);
   const layout=await portrait.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
   assert.equal(layout.doc>layout.width,false);assert.equal(await portrait.locator('#review-hull option').count(),15);
   await portrait.locator('[data-ui-command="repaint"]').scrollIntoViewIfNeeded();await portrait.screenshot({path:`${out}/iphone-portrait-editor.png`});await portrait.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-report.json`,JSON.stringify({cases,errors},null,2));
 }finally{await browser.close();}
}
