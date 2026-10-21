import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url);
const out='output/station-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});await mkdir(`${out}/renders`,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:1000}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/output/station-review/index.html?station=helix`);await page.waitForFunction(()=>window.ready);
  const ids=await page.locator('#station option').evaluateAll(ns=>ns.map(n=>n.value)),reports=[];
  for(const id of ids){
  if(process.env.VR_STATIONS&&!process.env.VR_STATIONS.split(',').includes(id))continue;
  await page.locator('#station').selectOption(id);await page.waitForFunction(()=>window.ready);
  const stats=await page.evaluate(()=>{let triangles=0,meshes=0;stationReview.model.traverse(n=>{if(!n.isMesh)return;let p=n,parked=false;while(p){parked||=p.name==='station-docked-ships';p=p.parent;}if(!parked){meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;}});return {triangles,meshes};});
  assert.ok(stats.triangles>3000&&stats.triangles<40000);assert.ok(stats.meshes<=10);
  if(id==='helix'){
   const park=await page.evaluate(async()=>{
    const T=await import('three'),r=stationReview;r.setView('habitat');r.model.updateMatrixWorld(true);
    const hit=new T.Raycaster(r.camera.position,r.camera.getWorldDirection(new T.Vector3())).intersectObject(r.model,true)[0];
    return{material:hit?.object.material.name,transparent:hit?.object.material.transparent,depthWrite:hit?.object.material.depthWrite};
   });assert.ok(park.material?.endsWith(' · canopy'),'park inspection camera has an unobstructed view through the glass dome');assert.ok(park.transparent&&!park.depthWrite);
   await page.screenshot({path:`${out}/${name}-${id}-park.png`});
  }
  if(id==='rook'){
   const moorings=await page.evaluate(async()=>{
    const T=await import('three'),r=stationReview,root=r.model,dock=root.getObjectByName('station-docked-ships'),ships=dock.children.filter(n=>n.userData.stationBerth?.moored),report=await fetch('./models.json').then(r=>r.json());
    root.updateMatrixWorld(true);const s=100/report.rook.sourceRadius,failures=[];
    const solids=root.clone(true);solids.getObjectByName('station-docked-ships').removeFromParent();solids.updateMatrixWorld(true);
    const triangle=new T.Triangle();
    const crossesHull=box=>{
     let overlap=false;solids.traverse(mesh=>{
      if(!mesh.isMesh||overlap)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,n=index?.count??p.count;
      for(let i=0;i<n;i+=3){
       triangle.a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
       triangle.b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
       triangle.c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
       if(triangle.intersectsBox(box)){overlap=true;break;}
      }
     });return overlap;
    };
    for(const ship of ships){
     const b=new T.Box3().setFromObject(ship),contact=ship.userData.dockingContact;
     if(crossesHull(b))failures.push(`${ship.name} overlaps the station hull`);
     if(!contact||contact.length<.35||contact.length>2)failures.push(`${ship.name} pressure connection length ${contact?.length}`);
    }
    const gangways=dock.children.filter(n=>n.isInstancedMesh).flatMap(n=>n.userData.fixtures??[]).filter(f=>f.name==='Sealed capital docking gangway');
    if(gangways.length!==2||gangways.some(f=>f.size[1]>2.24||f.size[0]!==2.3||f.size[2]!==2.3))failures.push('Capital hull seals must be short, wide connections beneath the station');
    const convert=p=>new T.Vector3(p[0]*s,p[2]*s,-p[1]*s);
    for(const m of report.rook.armament.mounts)for(const p of m.muzzles){
     const d=convert(m.direction).normalize(),origin=convert(p).addScaledVector(d,.04*s);
     if(new T.Raycaster(origin,d,0,200*s).intersectObjects(ships,true).length)failures.push(`${m.name} aims through a berthed frigate`);
    }
    return{count:ships.length,failures};
   });assert.equal(moorings.count,2);assert.deepEqual(moorings.failures,[]);
  }
  if(name==='desktop'&&!process.env.VR_VIEWS_ONLY){
   const traffic=await page.evaluate(async id=>{
    const T=await import('three'),{LOCATIONS,SHIPS}=await import('/src/game/data.js'),{STATION_DOCKS}=await import('/src/game/stationDocks.js'),{stationBerth,stationDockRoute,clearParkedBerth,stationModelOffsetZ}=await import('/src/game/stationTraffic.js'),{buildStationCollider}=await import('/src/game/stationCollision.js'),{GameSession}=await import('/src/game/game.js'),{shipVsStation}=await import('/src/game/shipCollision.js'),{npcShipScaleForVariant}=await import('/src/game/render.js');
    const root=stationReview.model.clone(true),origin=LOCATIONS[id].position;root.scale.setScalar(LOCATIONS[id].radius*(id==='blackglass'?.2:.95)/100);root.position.z=stationModelOffsetZ(id);root.updateMatrixWorld(true);
    const dock=root.getObjectByName('station-docked-ships'),obstacles=dock.children.filter(n=>n.userData.stationOccupant).map(n=>{const b=new T.Box3().setFromObject(n);return{min:b.min.toArray().map((v,i)=>v+origin[i]),max:b.max.toArray().map((v,i)=>v+origin[i])};});dock.removeFromParent();
    const collider=buildStationCollider(root,origin),rotation=new T.Quaternion(),position=new T.Vector3(),contact={},failures=[];let routes=0;
    for(const [hullId,def]of Object.entries(SHIPS))for(let lane=0;lane<STATION_DOCKS[id].lanes.length;lane++){
     const hull=GameSession.prototype.npcHullExtents.call({}, {variant:def.variant}),b=stationBerth(id,lane,hull[1]);if(!clearParkedBerth(b,hull,obstacles)){failures.push(`${hullId}/${lane} blocked by parked hull`);continue;}
     const route=stationDockRoute(b);for(let segment=1;segment<route.length;segment++)for(let i=0;i<=60;i++){position.fromArray(route[segment-1]).lerp(new T.Vector3(...route[segment]),i/60);if(shipVsStation(position,rotation,def.variant,npcShipScaleForVariant(def.variant),collider,contact)){failures.push(`${hullId}/${lane} clips station after parked-ship adjustment`);break;}for(const o of obstacles)if(position.x+hull[0]>o.min[0]&&position.x-hull[0]<o.max[0]&&position.y+hull[1]>o.min[1]&&position.y-hull[1]<o.max[1]&&position.z+hull[2]>o.min[2]&&position.z-hull[2]<o.max[2])failures.push(`${hullId}/${lane} clips parked hull`);}
     routes++;
    }return{routes,parked:obstacles.length,failures};
   },id);assert.equal(traffic.routes,30);assert.ok(traffic.parked>=2);assert.deepEqual(traffic.failures,[]);
  }
  const show=async view=>name==='iphone'?page.locator('#view-select').selectOption(view):page.locator(`[data-view=${view}]`).click();
  for(const view of process.env.VR_VIEWS_ONLY?['overview','underside','rear','concourse']:['overview','underside','rear','concourse','terminal','habitat','engineering']){
   await show(view);await page.screenshot({path:`${out}/${name}-${id}-${view}.png`});
   if(name==='desktop'&&['overview','underside','rear'].includes(view)){
    // Export the rendered scene directly; element screenshots also capture the
    // HTML footer over the canvas and bake those controls into gallery cards.
    const png=await page.evaluate(async()=>{
     const T=await import('three'),r=stationReview,center=new T.Box3().setFromObject(r.model).getCenter(new T.Vector3()),
      right=new T.Vector3(1,0,0).applyQuaternion(r.camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(r.camera.quaternion),
      outward=r.camera.getWorldDirection(new T.Vector3()).negate(),point=new T.Vector3(),tan=Math.tan(T.MathUtils.degToRad(r.camera.fov/2));let distance=0;
     // Frame the gallery image tightly, while the workshop's before/current
     // views retain their shared fixed camera for an honest size comparison.
     r.model.updateMatrixWorld(true);r.model.traverse(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).sub(center);const z=point.dot(outward);
      distance=Math.max(distance,z+Math.abs(point.dot(right))/(tan*r.camera.aspect*.87),z+Math.abs(point.dot(up))/(tan*.87));
     }});
     r.setOrbit(center.toArray(),distance,Math.atan2(outward.x,outward.z),Math.asin(outward.y));r.renderer.render(r.scene,r.camera);
     return r.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await writeFile(`${out}/renders/${id}-${view==='overview'?'front':view==='underside'?'bottom':'rear'}.png`,Buffer.from(png,'base64'));
   }
  }
  await show('concourse');await page.locator('#artwork').click();await page.locator('#reference-image').evaluate(img=>img.decode());await page.screenshot({path:`${out}/${name}-${id}-reference.png`});await page.locator('#artwork').click();
  await show('overview');if(!process.env.VR_VIEWS_ONLY&&await page.locator('#before').isEnabled()){await page.locator('#before').click();await page.waitForFunction(()=>window.ready);await page.screenshot({path:`${out}/${name}-${id}-before.png`});await page.locator('#before').click();await page.waitForFunction(()=>window.ready);}
  await page.locator('#ships').click();assert.equal(await page.evaluate(()=>stationReview.model.getObjectByName('station-docked-ships').visible),false);await page.locator('#ships').click();assert.equal(await page.evaluate(()=>stationReview.model.getObjectByName('station-docked-ships').visible),true);
  assert.deepEqual(errors,[]);reports.push({id,stats});console.log(name,id,'station views, traffic and controls passed',stats);
  }
  await writeFile(`${out}/${name}-${process.env.VR_STATIONS?'selected-':''}report.json`,JSON.stringify({reports,errors},null,2));
 }finally{await browser.close();}
}
