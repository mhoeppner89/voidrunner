import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/station-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
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
  if(name==='desktop'&&!process.env.VR_VIEWS_ONLY){
   const traffic=await page.evaluate(async id=>{
    const T=await import('three'),{LOCATIONS,SHIPS}=await import('/src/game/data.js'),{STATION_DOCKS}=await import('/src/game/stationDocks.js'),{stationBerth,clearParkedBerth,stationModelOffsetZ}=await import('/src/game/stationTraffic.js'),{buildStationCollider}=await import('/src/game/stationCollision.js'),{GameSession}=await import('/src/game/game.js'),{shipVsStation}=await import('/src/game/shipCollision.js'),{npcShipScaleForVariant}=await import('/src/game/render.js');
    const root=stationReview.model.clone(true),origin=LOCATIONS[id].position;root.scale.setScalar(LOCATIONS[id].radius*(id==='blackglass'?.2:.95)/100);root.position.z=stationModelOffsetZ(id);root.updateMatrixWorld(true);
    const dock=root.getObjectByName('station-docked-ships'),obstacles=dock.children.filter(n=>n.userData.stationOccupant).map(n=>{const b=new T.Box3().setFromObject(n);return{min:b.min.toArray().map((v,i)=>v+origin[i]),max:b.max.toArray().map((v,i)=>v+origin[i])};});dock.removeFromParent();
    const collider=buildStationCollider(root,origin),rotation=new T.Quaternion(),position=new T.Vector3(),contact={},failures=[];let routes=0;
    for(const [hullId,def]of Object.entries(SHIPS))for(let lane=0;lane<STATION_DOCKS[id].lanes.length;lane++){
     const hull=GameSession.prototype.npcHullExtents.call({}, {variant:def.variant}),b=stationBerth(id,lane,hull[1]);if(!clearParkedBerth(b,hull,obstacles)){failures.push(`${hullId}/${lane} blocked by parked hull`);continue;}
     for(let i=0;i<=60;i++){position.fromArray(b.gate).lerp(new T.Vector3(...b.pad),i/60);if(shipVsStation(position,rotation,def.variant,npcShipScaleForVariant(def.variant),collider,contact)){failures.push(`${hullId}/${lane} clips station after parked-ship adjustment`);break;}for(const o of obstacles)if(position.x+hull[0]>o.min[0]&&position.x-hull[0]<o.max[0]&&position.y+hull[1]>o.min[1]&&position.y-hull[1]<o.max[1]&&position.z+hull[2]>o.min[2]&&position.z-hull[2]<o.max[2])failures.push(`${hullId}/${lane} clips parked hull`);}
     routes++;
    }return{routes,parked:obstacles.length,failures};
   },id);assert.equal(traffic.routes,30);assert.ok(traffic.parked>=2);assert.deepEqual(traffic.failures,[]);
  }
  const show=async view=>name==='iphone'?page.locator('#view-select').selectOption(view):page.locator(`[data-view=${view}]`).click();
  for(const view of process.env.VR_VIEWS_ONLY?['overview','concourse']:['overview','concourse','terminal','habitat','engineering']){await show(view);await page.screenshot({path:`${out}/${name}-${id}-${view}.png`});}
  await show('concourse');await page.locator('#artwork').click();await page.locator('#reference-image').evaluate(img=>img.decode());await page.screenshot({path:`${out}/${name}-${id}-reference.png`});await page.locator('#artwork').click();
  await show('overview');if(!process.env.VR_VIEWS_ONLY&&await page.locator('#before').isEnabled()){await page.locator('#before').click();await page.waitForFunction(()=>window.ready);await page.screenshot({path:`${out}/${name}-${id}-before.png`});await page.locator('#before').click();await page.waitForFunction(()=>window.ready);}
  await page.locator('#ships').click();assert.equal(await page.evaluate(()=>stationReview.model.getObjectByName('station-docked-ships').visible),false);await page.locator('#ships').click();assert.equal(await page.evaluate(()=>stationReview.model.getObjectByName('station-docked-ships').visible),true);
  assert.deepEqual(errors,[]);reports.push({id,stats});console.log(name,id,'station views, traffic and controls passed',stats);
  }
  await writeFile(`${out}/${name}-${process.env.VR_STATIONS?'selected-':''}report.json`,JSON.stringify({reports,errors},null,2));
 }finally{await browser.close();}
}
