import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const out='output/graveyard-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=process.env.VR_PROFILES?await readFile(`${out}/game-checks.json`,'utf8').then(JSON.parse).catch(()=>[]):[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 const errors=[];let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+JSON.stringify(m.location()));});page.on('requestfailed',r=>console.log(name,'request failed',r.url(),r.failure()));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2hh`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);window.gyData=await import('/src/game/worldData.js');window.gyT=await import('/vendor/three.module.min.js');window.gyOrigin=(await import('/src/game/data.js')).LOCATIONS['mourning-line'].position;const p=r.save.player;p.position.splice(0,3,...gyOrigin);p.velocity.fill(0);p.throttle=0;r.ships=[];r.autopilot=false;r.updateActiveInstance(true);await r.renderer.ensureGraveyardModels();r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());});
  const checks=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,wrecks=ren.graveyardModelMeshes,frigates=wrecks.filter(w=>w.name.includes('frigate'));const materials=[],geometry=[];for(const w of frigates)w.traverse(m=>{if(m.isMesh){geometry.push(m.geometry.id);materials.push(...(Array.isArray(m.material)?m.material:[m.material]).map(m=>m.id));}});const all=ren.graveyardBatches.flatMap(b=>b.pieces);return {wrecks:wrecks.length,sharedFrigateGeometries:new Set(geometry).size,sharedFrigateMaterials:new Set(materials).size,totalFrigateMeshes:geometry.length,pieces:all.length,clouds:new Set(all.map(p=>p.debrisCloud).filter(Boolean)).size,batches:ren.graveyardBatches.length,structure:all.filter(p=>p.attachedWreckId).length,legacy:all.filter(p=>p.id.startsWith('route-')||p.render===false).length,nodes:r.wreckNodes.filter(n=>!n.combatLoot).length};});
  assert.equal(checks.wrecks,14);assert.equal(checks.clouds,4);assert.ok(checks.sharedFrigateGeometries<checks.totalFrigateMeshes/2);assert.ok(checks.sharedFrigateMaterials<checks.totalFrigateMeshes/2);assert.equal(checks.legacy,0);assert.ok(checks.batches<=16);assert.ok(checks.structure>=16);assert.equal(checks.nodes,100);
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
  assert.deepEqual(errors,[]);const prior=report.findIndex(r=>r.name===name);if(prior>=0)report.splice(prior,1);report.push({name,checks,passages,npcFlights,retention,errors});await writeFile(`${out}/game-checks.json`,JSON.stringify(report,null,2));console.log(name,JSON.stringify(report.at(-1)));
 }catch(e){await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors},null,2));if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}}
}

// All assertions and report writes finish before terminating the CLI. Some
// desktop automation transports retain an idle handle after Chrome exits.
process.exit(0);
