import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const out='output/pixel-style-review';await mkdir(out,{recursive:true});
const scenes=[
 {id:'concourse',name:'Concourse',note:'Painted background, fitted ship, shadow and controls.'},
 {id:'planet',name:'Distant planet',note:'Azure in the background; four ships from 90 to 1,300 km.'},
 {id:'asteroids',name:'Asteroid field',note:'Fracture edges, rock shadows and four ships from 90 to 1,300 km.'},
 {id:'graveyard',name:'Graveyard',note:'Battleship wreck, loose debris and four ships from 90 to 1,300 km.'},
 {id:'station',name:'Station traffic',note:'Helix, illuminated bays and four ships from 90 to 1,300 km.'},
];
if(!process.env.VR_SKIP_CAPTURE){
 // Keep the pre-change game captures as the noise reference across reruns.
 for(const scene of scenes)try{await copyFile(`${out}/${scene.id}-current.png`,`${out}/${scene.id}-previous.png`,constants.COPYFILE_EXCL);}catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw error;}
 let shell=await readFile('game.html','utf8');
 shell=shell.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/main.js"></script>',`<script>
 // The review never reads or writes a real career or settings record.
 const reviewMemory=new Map();Storage.prototype.getItem=function(key){return reviewMemory.get(String(key))??null;};Storage.prototype.setItem=function(key,value){reviewMemory.set(String(key),String(value));};Storage.prototype.removeItem=function(key){reviewMemory.delete(String(key));};Storage.prototype.clear=function(){reviewMemory.clear();};
 localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));
 </script><script type="module" src="/src/main.js"></script>`);
 await writeFile(`${out}/capture.html`,shell);
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/${out}/capture.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.save.world.time=240;
   await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);
   // No palette, sprite conversion or filters to undo in the current runtime.
   // Keep both filenames for comparison with the earlier review proposals.
   window.reviewFinish=async()=>{
    const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,view=r.ui.concourseShip;
    await Promise.all([...document.images].filter(e=>e.getClientRects().length).map(e=>e.decode().catch(()=>{})));
    if(r.save.player.dockedAt)view.render();else ren.render();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   };
  });
  const states=[];
  for(const scene of scenes){
   console.log('capture',scene.id);
   const state=await page.evaluate(async id=>{
    const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,T=await import('three'),{LOCATIONS}=await import('/src/game/data.js');cancelAnimationFrame(r.frameId);
    delete window.reviewDom;
    if(id==='concourse'){
     const v=r.ui.concourseShip;v.stop();v.applyPose({x:0,y:.14,z:0,yaw:0,pitch:0,roll:0,scale:1,thrust:.08});v.render();return {id,dockedAt:r.save.player.dockedAt};
    }
    if(r.save.player.dockedAt)await r.launch();cancelAnimationFrame(r.frameId);r.ui.concourseShip.pause();r.ships=[];
    const p=r.save.player;p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;p.currentTargetId=undefined;p.navTargetId='shardbelt';r.autopilot=false;r.afterburning=false;r.save.world.time=240;
    let eye,target,location;
    if(id==='planet'){location='azure';target=new T.Vector3(...LOCATIONS.azure.position);eye=target.clone().add(new T.Vector3(85000,40000,110000));}
    if(id==='asteroids'){location='shardbelt';target=new T.Vector3(...LOCATIONS.shardbelt.position).add(new T.Vector3(0,-70,0));eye=new T.Vector3(...LOCATIONS.shardbelt.position).add(new T.Vector3(-1700,580,2050));}
    if(id==='graveyard'){location='mourning-line';const {GRAVEYARD_MODEL_WRECKS}=await import('/src/game/worldData.js'),w=GRAVEYARD_MODEL_WRECKS.find(w=>w.class==='battleship');target=new T.Vector3(...LOCATIONS[location].position).add(new T.Vector3(...w.local));eye=target.clone().add(new T.Vector3(1700,1000,1850));target.y-=500;await ren.ensureGraveyardModels();}
    if(id==='station'){location='helix';target=new T.Vector3(...LOCATIONS.helix.position);eye=target.clone().add(new T.Vector3(1500,450,1700));target.y-=220;await ren.ensureStationModels(p.systemId);}
    p.position.splice(0,3,...eye.toArray());r.resetPlayerInterpolation(true);r.updateActiveInstance(true);if(id==='asteroids'||id==='graveyard'){r.activeInstanceId=location;ren.setActiveInstance(location);}
    ren.camera.position.copy(eye);ren.camera.lookAt(target);if(id==='planet'){ren.camera.rotateY(.23);ren.camera.rotateX(-.10);}ren.camera.updateMatrixWorld();const heading=ren.camera.quaternion.clone();heading.toArray(p.rotation);
    const traffic=[['wayfarer',85,-.24,.10,'independent-bands'],['talon',240,.24,.18,'concord'],['atlas',620,-.08,.27,'independent-surveyor'],['lancer',1200,.36,.28,'alliance']];
    for(const [hull,d,x,y,livery]of traffic){const pos=new T.Vector3(x*d,y*d,-d).applyQuaternion(heading).add(eye),ship=r.spawnShip('patrol',pos.toArray(),undefined,`Review ${hull}`,{tier:'veteran',temperament:'steady'},{hullId:hull,faction:hull==='lancer'?'alliance':hull==='talon'?'concord':'independents',livery});ship.rotation=new T.Quaternion().copy(heading).multiply(new T.Quaternion().setFromEuler(new T.Euler(.10,.45+hull.length*.09,-.12))).toArray();ship.velocity.fill(0);ship.throttle=.24;ship.hostile=false;ship.instanceId=location;ship.playerSensorAwareness=1;ship.identifiedByPlayer=true;ship.playerIdentified=true;ship.scanned=true;}
    ren.syncShips(r.ships);await Promise.allSettled([...ren.glbShipLoading.values()]);ren.syncShips(r.ships);
    p.currentTargetId=r.ships[0].id;r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());ren.camera.position.copy(eye);ren.camera.quaternion.copy(heading);ren.camera.updateMatrixWorld();ren.render();
    return {id,location,eye:eye.toArray(),ships:r.ships.map(s=>({hull:s.hullId,distance:Math.round(eye.distanceTo(new T.Vector3(...s.position))),projected:ren.projectToScreen(s.position),model:ren.shipMeshes.get(s.id)?.userData?.glb}))};
   },scene.id);
   if(scene.id!=='concourse')assert.ok(state.ships.length===4&&state.ships.every(s=>s.model&&s.projected.visible),'All four traffic hulls must be loaded and in view.');
   await page.waitForTimeout(180);
   await page.evaluate(()=>reviewFinish(false));await page.screenshot({path:`${out}/${scene.id}-current.png`});
   await page.evaluate(()=>reviewFinish(true));await page.screenshot({path:`${out}/${scene.id}-source.png`});
   await page.evaluate(()=>reviewFinish(false));states.push(state);
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/capture-report.json`,JSON.stringify({states,errors},null,2));
 }finally{await browser.close();}
}

await copyFile(new URL('./pixel-style-review/styles.mjs',import.meta.url),`${out}/styles.mjs`);
await copyFile(new URL('./pixel-style-review/gallery.html',import.meta.url),`${out}/index.html`);
await writeFile(`${out}/scenes.json`,JSON.stringify(scenes,null,2));
if(!process.env.VR_CAPTURE_ONLY){
 const previousAvailable=(await Promise.allSettled(scenes.map(s=>access(`${out}/${s.id}-previous.png`)))).every(r=>r.status==='fulfilled');
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
 try{const page=await browser.newPage();page.setDefaultTimeout(120000);await page.goto(`${base}/${out}/index.html?build=1`);const result=await page.evaluate(async previousAvailable=>{const {buildStyles}=await import('./styles.mjs');return buildStyles(await(await fetch('./scenes.json')).json(),previousAvailable);},previousAvailable);for(const file of result.files)await writeFile(`${out}/${file.name}`,Buffer.from(file.data.split(',')[1],'base64'));await writeFile(`${out}/manifest.json`,JSON.stringify(result.manifest,null,2));console.log('Review ready:',`${base}/${out}/index.html`);}finally{await browser.close();}
}
