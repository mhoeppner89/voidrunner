import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {createOfflineTestOrigin} from '../helpers/offline-origin.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const out='output/graveyard-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=process.env.VR_PROFILES?await readFile(`${out}/game-checks.json`,'utf8').then(JSON.parse).catch(()=>[]):[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 const origin=await createOfflineTestOrigin(base.replace(/\/$/,''));
 const errors=[];let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+JSON.stringify(m.location()));});page.on('requestfailed',r=>console.log(name,'request failed',r.url(),r.failure()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${origin.url}/game.html?revision=0.8.2hh`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  // Simulate the carrier being absent from a partial offline cache on the first visit.
  if(name==='desktop')await page.evaluate(()=>{
   const network=window.fetch.bind(window);
   window.restoreWreckNetwork=()=>{window.fetch=network;};
   window.fetch=(url,options)=>String(url).includes('concord-carrier-wreck-v4.glb')
    ? Promise.reject(new TypeError('Offline carrier')) : network(url,options);
  });
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);window.gyData=await import('/src/game/worldData.js');window.gyT=await import('/vendor/three.module.min.js');window.gyOrigin=(await import('/src/game/data.js')).LOCATIONS['mourning-line'].position;const p=r.save.player;p.position.splice(0,3,...gyOrigin);p.velocity.fill(0);p.throttle=0;r.ships=[];r.autopilot=false;r.updateActiveInstance(true);await r.renderer.ensureGraveyardModels();r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());});
  if(name==='desktop'){
   const recovery=await page.evaluate(async()=>{
    const renderer=__VOID_PRIVATEER__.getRuntime().renderer;
    const partial=renderer.graveyardModelMeshes.filter(w=>!w.userData.collisionWreck);
    const fallback=renderer.graveyardModelMeshes.find(w=>w.userData.collisionWreck);
    if(fallback?.name!=='concord-carrier-wreck' || !fallback.visible || !fallback.children[0].geometry.index.count)
     throw Error('Missing visible carrier collision hull');
    window.restoreWreckNetwork();
    const delayed=renderer.ensureGraveyardModels()===undefined;
    const requested=[],network=window.fetch;
    window.fetch=(url,options)=>{if(String(url).includes('/wrecks/'))requested.push(String(url));return network(url,options);};
    try{
     renderer.graveyardRetryAt=performance.now()-1;
     renderer.updateDistantInstanceVisibility();
     await renderer.graveyardModelLoading;
    }finally{window.fetch=network;}
    return {count:partial.length,delayed,retained:partial.every(w=>renderer.graveyardModelMeshes.includes(w)),requested};
   });
   assert.equal(recovery.count,13);assert.ok(recovery.delayed&&recovery.retained);
   assert.equal(recovery.requested.length,1);assert.match(recovery.requested[0],/concord-carrier-wreck-v4\.glb(?:\.gz)?$/);
  }
  if(name==='desktop'){
   // Drive a real Three draw through WebGL, fail after culling chose one
   // triangle, then hit the omitted triangle and draw both from a second view.
   const check=await page.evaluate(async()=>{
    const T=window.gyT, {clipWreckSections,installWreckDrawRanges}=await import('/src/game/graveyardArt.js');
    const gl=new T.WebGLRenderer(),camera=new T.PerspectiveCamera(50,1,.1,100),scene=new T.Scene();
    const geometry=new T.BufferGeometry(), material=new T.MeshBasicMaterial({side:T.DoubleSide});
    geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,0,1,0,9,-1,0,11,-1,0,10,1,0],3));
    geometry.setIndex([0,1,2,3,4,5]);
    const mesh=new T.Mesh(geometry,material);
    mesh.userData.graveyardSections=[0,10].map((x,i)=>({min:[x-1,-1,0],max:[x+1,1,0],
     matrix:new T.Matrix4().toArray(),startIndex:i*3,endIndex:i*3+3}));
    scene.add(mesh);camera.position.z=5;clipWreckSections(mesh,camera);installWreckDrawRanges(gl,camera);
    const context=gl.getContext(), original=context.drawElements;
    let clipped, full, threw=false;
    try{
     context.drawElements=(_mode,count)=>{clipped=count;throw Error('interrupted wreck draw');};
     try{gl.render(scene,camera);}catch(e){if(e.message!=='interrupted wreck draw')throw e;threw=true;}
     const hits=new T.Raycaster(new T.Vector3(10,0,1),new T.Vector3(0,0,-1)).intersectObject(mesh).length;
     context.drawElements=function(...args){full=args[1];return original.apply(this,args);};
     gl.render(scene,camera.clone());
     return {clipped,full,hits,threw};
    }finally{context.drawElements=original;geometry.dispose();material.dispose();gl.dispose();}
   });
   assert.deepEqual(check,{clipped:3,full:6,hits:1,threw:true});
  }
  const checks=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,wrecks=ren.graveyardModelMeshes,frigates=wrecks.filter(w=>w.name.includes('frigate'));const materials=[],geometry=[],templates=new Map();let sharedCopies=0;
   for(const w of frigates){
    const ids=[];
    w.traverse(m=>{if(m.isMesh){geometry.push(m.geometry.id);const mats=(Array.isArray(m.material)?m.material:[m.material]).map(m=>m.id);materials.push(...mats);ids.push([m.geometry.id,...mats]);}});
    const def=gyData.GRAVEYARD_MODEL_WRECKS.find(x=>x.id===w.name),key=def.file+'|'+(def.variant??0);
    if(templates.has(key)){if(templates.get(key)===JSON.stringify(ids))sharedCopies++;}else templates.set(key,JSON.stringify(ids));
   }
   const all=ren.graveyardBatches.flatMap(b=>b.pieces);return {wrecks:wrecks.length,sharedCopies,sharedFrigateGeometries:new Set(geometry).size,sharedFrigateMaterials:new Set(materials).size,totalFrigateMeshes:geometry.length,pieces:all.length,clouds:new Set(all.map(p=>p.debrisCloud).filter(Boolean)).size,batches:ren.graveyardBatches.length,structure:all.filter(p=>p.attachedWreckId).length,legacy:all.filter(p=>p.id.startsWith('route-')||p.render===false).length,nodes:r.wreckNodes.filter(n=>!n.combatLoot).length};});
  assert.equal(checks.wrecks,14);assert.equal(checks.clouds,4);assert.equal(checks.sharedCopies,4);assert.ok(checks.sharedFrigateGeometries<=12);assert.ok(checks.sharedFrigateMaterials<checks.totalFrigateMeshes/2);assert.equal(checks.legacy,0);assert.ok(checks.batches<=16);assert.ok(checks.structure>=16);assert.equal(checks.nodes,100);
  const ids=name==='desktop'?await page.evaluate(()=>gyData.GRAVEYARD_MODEL_WRECKS.map(w=>w.id)):['concord-carrier-wreck','concord-battleship-wreck'];
  for(const id of ids){
   await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,w=gyData.GRAVEYARD_MODEL_WRECKS.find(w=>w.id===id),target=new gyT.Vector3(...gyOrigin).add(new gyT.Vector3(...w.local)),d=w.clearanceRadius*1.5;const camera=target.clone().add(new gyT.Vector3(-d,d*.5,d*.85));r.save.player.position.splice(0,3,...camera.toArray());r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.syncRender(0,performance.now());ren.camera.position.copy(camera);ren.camera.lookAt(target.clone().add(new gyT.Vector3(0,-d*.25,0)));ren.camera.updateMatrixWorld();ren.updateGraveyardModelVisibility();ren.updateGraveyardInstances();ren.renderer.render(ren.scene,ren.camera);},id);
   if(name!=='desktop'||['concord-carrier-wreck','concord-battleship-wreck','concord-cruiser-alpha-wreck'].includes(id))await page.screenshot({path:`${out}/${name}-${id}.png`});
  }
  // Drive the real player collider all the way through each hull, including
  // the entrance/exit approaches and ordinary salvage-node obstacles.
  const passages=[];
  for(const entry of await page.evaluate(()=>gyData.GRAVEYARD_MODEL_WRECKS.flatMap(w=>(w.passages??[]).map((route,index)=>({id:w.id,index,routeId:route.id}))))){const {id,index,routeId}=entry;
   const route=await page.evaluate(({id,index})=>{
    const r=__VOID_PRIVATEER__.getRuntime(),w=gyData.GRAVEYARD_MODEL_WRECKS.find(w=>w.id===id),route=w.passages[index],rotation=new gyT.Quaternion().setFromEuler(new gyT.Euler(...w.rotation)),offset=new gyT.Vector3(...gyOrigin).add(new gyT.Vector3(...w.local));
    const point=t=>new gyT.Vector3(...route.center).add(new gyT.Vector3(0,0,route.halfLength*(2*t-1))).multiplyScalar(w.scale).applyQuaternion(rotation).add(offset);
    const orientation=rotation.clone().multiply(new gyT.Quaternion().setFromAxisAngle(new gyT.Vector3(0,1,0),Math.PI));r.save.player.rotation.splice(0,4,...orientation.toArray());
    r.save.player.position.splice(0,3,...point(0).toArray());r.updateActiveInstance(true);
    const steps=Math.ceil(2*route.halfLength*w.scale/8),velocity=new gyT.Vector3(0,0,80).applyQuaternion(rotation);let maxPush=0;
    for(let i=0;i<=steps;i++){const p=point(i/steps),before=p.clone();r.resolvePlayerCollisions(p,velocity);maxPush=Math.max(maxPush,p.distanceTo(before));}
    return {id,routeId:route.id,steps,maxPush};
   },entry);
   assert.ok(route.maxPush<.001,`${name}: ${id} passage blocked, collision pushed player ${route.maxPush}`);passages.push(route);
   if(name==='desktop'||id==='concord-carrier-wreck')for(const [label,t]of [['entrance',.24],['inside',.5],['exit',.76]]){
    await page.evaluate(({id,index,t})=>{const r=__VOID_PRIVATEER__.getRuntime(),w=gyData.GRAVEYARD_MODEL_WRECKS.find(w=>w.id===id),route=w.passages[index],rotation=new gyT.Euler(...w.rotation),p=new gyT.Vector3(...route.center).add(new gyT.Vector3(0,0,route.halfLength*(2*t-1))).multiplyScalar(w.scale).applyEuler(rotation).add(new gyT.Vector3(...w.local)).add(new gyT.Vector3(...gyOrigin));r.save.player.position.splice(0,3,...p.toArray());r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.renderer.render();},{id,index,t});
    await page.screenshot({path:`${out}/${name}-${id}-${routeId}-${label}.png`});
   }
  }
  const npcFlights=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),w=gyData.GRAVEYARD_MODEL_WRECKS.find(w=>w.class==='battleship'),route=w.passages[1],q=new gyT.Quaternion().setFromEuler(new gyT.Euler(...w.rotation)),anchor=new gyT.Vector3(...gyOrigin).add(new gyT.Vector3(...w.local));
   const point=t=>new gyT.Vector3(...route.center).add(new gyT.Vector3(0,0,t*route.halfLength)).multiplyScalar(w.scale).applyQuaternion(q).add(anchor),from=point(-1),to=point(1),direction=to.clone().sub(from).normalize(),results=[];
   r.save.player.position.splice(0,3,...gyOrigin);r.updateActiveInstance(true);
   for(const hullId of ['scrapper','wayfarer','torsas']){
    r.ships=[];const ship=r.spawnShip('patrol',from.toArray(),undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId});
    ship.instanceId='mourning-line';ship.destination=to.toArray();ship.task={kind:'patrol'};ship.rotation=new gyT.Quaternion().setFromUnitVectors(new gyT.Vector3(0,0,-1),direction).toArray();ship.velocity=direction.clone().multiplyScalar(40).toArray();
    const health=ship.hull+ship.shield;let arrived=false,crossed=false,contacts=0,i=0;
    for(;i<10800;i++){
     r.save.world.time+=1/60;r.updateTravelAI(ship,1/60);const before=[...ship.position];r.resolveNpcCollisions(ship);if(ship.position.some((v,j)=>Math.abs(v-before[j])>.001))contacts++;
     const p=new gyT.Vector3(...ship.position),local=p.clone().sub(anchor).applyQuaternion(q.clone().invert()).multiplyScalar(1/w.scale).sub(new gyT.Vector3(...route.center));
     if(Math.abs(local.z)<.04&&Math.abs(local.x)<route.openingHalfWidth&&Math.abs(local.y)<route.openingHalfHeight)crossed=true;
     if(p.distanceTo(to)<45){arrived=true;break;}
    }
    results.push({hullId,arrived,crossed,contacts,damage:health-ship.hull-ship.shield,seconds:i/60});
   }r.ships=[];return results;
  });
  for(const result of npcFlights)assert.ok(result.arrived&&result.crossed&&result.contacts===0&&result.damage===0,JSON.stringify(result));
  // Repeated site changes must reuse the same shared assets and batches.
  const retention=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer;for(let i=0;i<2;i++){r.save.player.position.splice(0,3,...gyOrigin.map((v,j)=>v+(j===0?i%2*7000:0)));r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.syncRender(1/60,performance.now());ren.render();}const before={...ren.renderer.info.memory};for(let i=0;i<8;i++){r.save.player.position.splice(0,3,...gyOrigin.map((v,j)=>v+(j===0?i%2*7000:0)));r.resetPlayerInterpolation(true);r.updateActiveInstance(true);r.syncRender(1/60,performance.now());ren.render();}return {before,after:{...ren.renderer.info.memory},programs:ren.renderer.info.programs.length};});assert.equal(retention.before.geometries,retention.after.geometries);assert.equal(retention.before.textures,retention.after.textures);
  // After visiting the field the installed worker can serve the packed
  // hulls offline. Read through the same decompressor as live streaming.
  const cached=await page.evaluate(async()=>{
   const {fieldModelURL}=await import('/src/game/modelDelivery.js');
   const files=[...new Set(gyData.GRAVEYARD_MODEL_WRECKS.map(w=>fieldModelURL(w.file)))];
   return {files,stored:await Promise.all(files.map(async url=>Boolean(await caches.match(url))))};
  });
  assert.equal(cached.files.length,9);assert.ok(cached.stored.every(Boolean));
  await origin.disconnect();
  try{
   const magic=await page.evaluate(async url=>{
    const {fetchModelBytes}=await import('/src/game/modelDelivery.js');
    return new DataView(await fetchModelBytes(url)).getUint32(0,true);
   },cached.files[0]);
   assert.equal(magic,0x46546c67);
  }finally{await origin.reconnect();}
  assert.deepEqual(errors,[]);const prior=report.findIndex(r=>r.name===name);if(prior>=0)report.splice(prior,1);report.push({name,checks,passages,npcFlights,retention,errors});await writeFile(`${out}/game-checks.json`,JSON.stringify(report,null,2));console.log(name,JSON.stringify(report.at(-1)));
 }catch(e){await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors},null,2));if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);await origin.disconnect();}}
}

// All assertions and report writes finish before terminating the CLI. Some
// desktop automation transports retain an idle handle after Chrome exits.
process.exit(0);
