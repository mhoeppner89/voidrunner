import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {stationModel} from '../helpers/station-model.mjs';
import {STATION_DOCKS} from '../../src/game/stationDocks.js';
import {STATION_OCCUPANTS} from '../../src/game/stationOccupants.js';
import {LOCATIONS,SHIPS} from '../../src/game/data.js';
import {buildStationCollider} from '../../src/game/stationCollision.js';
import {fittedPlayerBerths} from '../../src/game/shipLanding.js';
import {addStationActivity} from '../../src/game/stationActivity.js';
import {SHIP_LIVERIES} from '../../src/game/shipLivery.js';
const reports=JSON.parse(fs.readFileSync(new URL('../fixtures/station-models.json',import.meta.url)));
for(const id of Object.keys(STATION_DOCKS))test(`${id}: concourse architecture, berths, source and resource budget agree`,()=>{
 const report=reports[id],dock=STATION_DOCKS[id],occupants=STATION_OCCUPANTS[id];
 assert.equal(dock.radius,report.sourceRadius);assert.equal(occupants.radius,report.sourceRadius);assert.deepEqual(dock.playerPads,report.playerPads);assert.deepEqual(dock.lanes,report.lanes);assert.deepEqual(occupants.ships,report.occupants);
 assert.ok(report.windowSizeAudit.panes>50);assert.ok(report.windowSizeAudit.maximumShortEdgeWorld<1.401,'actual ordinary panes stay smaller than capital-ship windows');
 assert.ok(report.crewDoorHeight*report.detailScale.sourceToWorld<3.001);
 const concourse=report.concourse;assert.ok(concourse&&fs.existsSync(concourse.reference),'concourse has its actual artwork reference');
 assert.ok(['interior','sheltered','exterior','courtyard'].includes(concourse.kind));
 if(concourse.kind==='interior'){assert.ok(concourse.hall.width>report.portalWidth,'portal opens into a larger shared hall');assert.ok(concourse.hall.back-concourse.hall.front>24,'hall has genuine depth');}
 assert.equal(concourse.roofOverPlayer,['interior','sheltered'].includes(concourse.kind));
 assert.ok(report.detailParts>0&&report.surfaceCleanup.coplanarSubtractions>0);assert.ok(report.packing.verticesAfter<report.packing.verticesBefore);assert.ok(report.contactOcclusion.minimum>=.57);
 assert.deepEqual(report.detachedGroups,[],'no wholly unsupported authoring groups');
 assert.deepEqual(report.physicalDetachedGroups,[],'mesh contact also connects each structural group, including hollow profiles');
 {
  assert.ok(report.practicalClearance?.checks.length>=2,'actual source-mesh checks cover unrelated structure clearances and intentional mounts');
  assert.equal(report.practicalClearance.frame,'source Z-up');
 }
 const b=fs.readFileSync(`assets/models/stations/${id}.glb`),g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 const tris=g.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);
 for(const m of g.meshes)for(const p of m.primitives){
  const a=g.accessors[p.attributes.COLOR_0];assert.ok(a&&a.normalized&&a.componentType===5121,'baked shading is compact vertex data');
  const textured=Boolean(g.materials[p.material].pbrMetallicRoughness?.baseColorTexture);
  assert.equal(p.attributes.TEXCOORD_0!==undefined,textured,'only materials that sample the panel atlas carry UV data');
 }
 assert.equal(tris,report.triangles);assert.ok(tris<40000&&tris>3000);assert.ok(g.materials.length<=10);assert.equal(g.images.length,1);assert.ok(b.length<2_500_000);
 const model=stationModel(id),p=new THREE.Vector3();let max=0;model.updateMatrixWorld(true);model.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++)max=Math.max(max,p.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld).length());});
 // Blackglass is translated onto its host moon; subtract that offset for normalization.
 if(id!=='blackglass')assert.ok(max<=LOCATIONS[id].radius*.95+.02&&max>=LOCATIONS[id].radius*.55,'occupied architecture stays within the approved envelope without preserving obsolete ornamental extremities');
 const collider=buildStationCollider(model,LOCATIONS[id].position);
 for(const [hull,def]of Object.entries(SHIPS)){
  const berths=fittedPlayerBerths(id,def.variant,collider);
  assert.equal(berths.length,1,`${hull} fits its private berth`);assert.equal(berths[0].sharedNpcLaneIndex,undefined,`${hull} does not need an NPC berth`);
 }
});

test('capital service lifts stand on the drydock deck rather than floating beside the keel',()=>{
 for(const id of ['argent','league-yard']){
  const berth=STATION_OCCUPANTS[id].ships.find(s=>s.capital),station=new THREE.Group(),dock=new THREE.Group();dock.name='station-docked-ships';dock.scale.setScalar(100/STATION_DOCKS[id].radius);station.add(dock);
  const ship=new THREE.Mesh(new THREE.BoxGeometry(20,8,50),new THREE.MeshBasicMaterial());ship.name=`berthed-${berth.hull}`;ship.userData.stationOccupant=true;ship.position.set(berth.at[0],berth.at[2]+6,-berth.at[1]);dock.add(ship);station.updateMatrixWorld(true);
  const activity=addStationActivity(station,id);assert.equal(activity.lifts.length,2);
  for(const lift of activity.lifts)assert.ok(Math.abs(lift.bottom-(berth.deck+.3))<1e-8);
  for(const foot of dock.children.filter(n=>n.name==='Service lift foot'))assert.ok(Math.abs(foot.position.y-.3-berth.deck)<1e-8);
  station.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 }
});

// Test the actual shipped mesh at the authored touchdown, not just metadata.
test('landing spaces have solid floors and the expected open sky or enclosing roof',()=>{
 for(const [id,r]of Object.entries(reports)){
  const model=stationModel(id);model.updateMatrixWorld(true);model.traverse(o=>{if(o.isMesh)o.material.side=THREE.DoubleSide;});
  const scale=LOCATIONS[id].radius*(id==='blackglass'?.2:.95)/r.sourceRadius,offset=id==='blackglass'?LOCATIONS[id].radius*.835:0;
  const convert=([x,y,z])=>new THREE.Vector3(x*scale,z*scale,-y*scale+offset);
  const [x,y,z]=r.concourse.touchdowns[0],base=convert([x,y,z]);
  const ray=new THREE.Raycaster(base.clone().add(new THREE.Vector3(0,scale,0)),new THREE.Vector3(0,-1,0),0,scale*2);
  assert.ok(ray.intersectObject(model,true).length,`${id}: landing floor is solid`);
  ray.set(base.clone().add(new THREE.Vector3(0,scale*2,0)),new THREE.Vector3(0,1,0));ray.far=scale*80;
  const ceiling=ray.intersectObject(model,true)[0];assert.equal(Boolean(ceiling),r.concourse.roofOverPlayer,`${id}: ${r.concourse.kind} has the right roof/sky`);
  // All pads connect laterally through the same landing space, without garage partitions.
  for(const p of r.concourse.touchdowns.slice(1)){
   const start=base.clone().add(new THREE.Vector3(0,scale*1.5,0)),end=convert(p).add(new THREE.Vector3(0,scale*1.5,0)),delta=end.sub(start);
   ray.set(start,delta.clone().normalize());ray.far=delta.length();assert.equal(ray.intersectObject(model,true).length,0,`${id}: shared landing floor connects to traffic apron`);
  }
 }
});

test('the inspection doorway and factory rear opening continue into the larger station',()=>{
 for(const [id,a,b]of [['gatehouse-twelve',[-9,-9,-10.5],[-9,8,-10.5]],['league-yard',[0,-67,-11],[0,-48,-11]]]){
  const model=stationModel(id);model.updateMatrixWorld(true);model.traverse(o=>{if(o.isMesh)o.material.side=THREE.DoubleSide;});
  const s=LOCATIONS[id].radius*.95/reports[id].sourceRadius,convert=([x,y,z])=>new THREE.Vector3(x*s,z*s,-y*s),start=convert(a),end=convert(b),direction=end.sub(start);
  const ray=new THREE.Raycaster(start,direction.clone().normalize(),0,direction.length());
  assert.equal(ray.intersectObject(model,true).length,0,`${id}: doorway leads through the real body`);
 }
});

test('orbital architecture preserves the authored station envelopes and uses distinct structural designs',()=>{
 const strategies=new Set();
 for(const r of Object.values(reports)){
  assert.equal(r.architecture.originalRadius,r.sourceRadius,`${r.id}: existing world/berth scale is preserved`);
  strategies.add(r.architecture.strategy);
  if(r.id==='helix'){
   assert.equal(r.architecture.restoredFrom,'febb5f8');assert.ok(r.architecture.partsAdded>0);
   assert.ok(r.architecture.cityBlocks.length+r.architecture.parks.length>=83);assert.equal(r.architecture.enclosedFreightHolds,2);
  }else{
   assert.ok(r.architecture.partsAdded>0);
   assert.ok(r.architecture.silhouettePartsAdded>0,'other stations retain their structural designs');
  }
  assert.ok(r.packing.unusedUvBytesRemoved>0,'unused UV channels free space for structural geometry');
 }
 assert.equal(strategies.size,Object.keys(reports).length,'ports retain individual structures rather than one shared hull');
});

test('former platform stations have substantial real surfaces below their landing decks',()=>{
 const triangle=new THREE.Triangle();
 for(const id of ['cairn','torchwell','gatehouse-twelve','shepherd','cinder']){
  const r=reports[id],floor=r.playerPads[0][2],scale=LOCATIONS[id].radius*.95/r.sourceRadius,model=stationModel(id);
  model.updateMatrixWorld(true);let lowest=Infinity,deepSurfaceArea=0;
  model.traverse(mesh=>{
   if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;
   for(let i=0;i<indices.count;i+=3){
    triangle.a.fromBufferAttribute(p,indices.getX(i)).applyMatrix4(mesh.matrixWorld).divideScalar(scale);
    triangle.b.fromBufferAttribute(p,indices.getX(i+1)).applyMatrix4(mesh.matrixWorld).divideScalar(scale);
    triangle.c.fromBufferAttribute(p,indices.getX(i+2)).applyMatrix4(mesh.matrixWorld).divideScalar(scale);
    lowest=Math.min(lowest,triangle.a.y,triangle.b.y,triangle.c.y);
    if((triangle.a.y+triangle.b.y+triangle.c.y)/3<floor-8)deepSurfaceArea+=triangle.getArea();
   }
  });
  assert.ok(floor-lowest>22,`${id}: lower structure has depth, not just a thin slab`);
  assert.ok(deepSurfaceArea>4000,`${id}: the lower body contains substantial surfaces, not a long antenna`);
 }
});

test('Helix preserves its circular decks and Rook closes the marked underside gap',()=>{
 assert.equal(reports.helix.sourceRadius,84.42890708589043);
 for(const id of ['helix','rook']){
  const model=stationModel(id),scale=reports[id].detailScale.sourceToWorld;
  model.updateMatrixWorld(true);
  const rayAt=(x,z)=>{
   const ray=new THREE.Raycaster(new THREE.Vector3(x*scale,z*scale,80*scale),new THREE.Vector3(0,0,-1));
   return ray.intersectObject(model,true)[0];
  };
  if(id==='helix'){
   const decks=[-24,-5,17].map(z=>rayAt(14,z));assert.ok(decks.every(Boolean));
   const reach=decks.map(h=>h.point.z/scale);
   assert.ok(reach[1]>reach[0]+7&&reach[1]>reach[2]+5,'three pressure decks have their original distinct radii');
  }else{
   const underside=rayAt(0,-19);assert.ok(underside&&underside.point.z/scale>31,'closed keel fills the marked underside gap');
  }
 }
 assert.equal(reports.rook.portalWidth,5.25);assert.equal(STATION_DOCKS.rook.sharedEntry.width,5.25);
});

test('Rook central upper slot is covered by a continuous armored roof',()=>{
 const r=reports.rook,s=r.detailScale.sourceToWorld,model=stationModel('rook');model.updateMatrixWorld(true);
 for(const y of [-28,-12,4]){
  const ray=new THREE.Raycaster(new THREE.Vector3(0,70*s,-y*s),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(model,true)[0];
  assert.ok(hit&&hit.point.y/s>35,`central roof covers the former open slot at ${y}`);
 }
 assert.ok(r.centralRoof.thickness>=1);
 assert.ok(r.practicalClearance.checks.includes('Central armored roof seats in both bastions'));
});

test('Helix roof districts are bilateral and use both marked decks',()=>{
 const r=reports.helix,blocks=r.architecture.cityBlocks;
 assert.ok(blocks.some(b=>b.roof==='middle')&&blocks.some(b=>b.roof==='upper'));
 for(const b of blocks){
  const mirror=blocks.find(a=>a.roof===b.roof&&Math.abs(a.center[0]+b.center[0])<1e-6&&Math.abs(a.center[1]-b.center[1])<1e-6&&Math.abs(a.height-b.height)<1e-6);
  assert.ok(mirror,`${b.name}: matching opposite district`);
 }
 assert.ok(r.practicalClearance.checks.includes('City pressure buildings clear elevator and engineering structures'));
 assert.ok(r.practicalClearance.checks.includes('Every housing foundation corner embeds in a real pressure deck'));
 assert.equal(r.architecture.parks.length,6);assert.equal(r.architecture.exteriorStreetDoors,false);
 assert.equal(blocks.length+r.architecture.parks.length,83,'courtyards replace housing sites without thinning the urban layout');
 assert.ok(r.practicalClearance.checks.includes('All six glazed conservatories seal against their deck foundations'));
 assert.ok(r.practicalClearance.checks.includes('Reflector bowls clear Command pressure cylinder'));
 assert.equal(r.architecture.cityConnections.length,8);
 assert.ok(r.practicalClearance.checks.includes('Enclosed housing wings join two blocks and clear engineering corridors'));
 assert.ok(r.architecture.cityWindowCount>25_000,'full residential facades replace sparse window strips');
 assert.ok(r.practicalClearance.checks.includes('City window atlas stays isolated from structural and roof panels'));
 for(const [roof,radius]of [['middle',32.2],['upper',25.4]]){
  const row=blocks.filter(b=>b.roof===roof&&Math.abs(Math.hypot(...b.center.slice(0,2))-radius)<.01);
  const gaps=row.map(b=>Math.min(...row.filter(a=>a!==b).map(a=>Math.hypot(a.center[0]-b.center[0],a.center[1]-b.center[1])-(a.width+b.width)/2))).sort((a,b)=>a-b);
  assert.ok(gaps[Math.floor(gaps.length/2)]<1.2,`${roof}: neighboring housing forms a close urban row`);
 }
});

test('Rook has connected capital ports, two visiting frigates and broader defense coverage',()=>{
 const r=reports.rook;
 assert.equal(r.capitalPorts.length,3);assert.equal(r.capitalPorts.filter(p=>p.occupied).length,2);
 const ships=STATION_OCCUPANTS.rook.ships.filter(s=>s.moored);
 assert.equal(ships.length,2);assert.ok(ships.every(s=>s.hull==='concord-frigate'&&s.capital));
 assert.equal(new Set(ships.map(s=>s.id)).size,2);
 assert.equal(r.armament.batteries,8);assert.equal(r.armament.pdcs,16);
 assert.ok(r.capitalPorts.every(p=>p.position[2]<-26&&p.outward[2]===-1&&p.collarLength<=1.8),'short capital collars face down beneath the pressure hulls');
 assert.ok(ships.every(s=>s.at[2]<s.dockPort[2]&&s.at[2]>-38&&s.roll===Math.PI),'frigates dock closely with their ventral hull facing the station');
 assert.ok(r.practicalClearance.checks.includes('Heavy ventral port joins the reactor keel'));
 const bytes=fs.readFileSync('assets/models/stations/rook.glb'),g=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 for(const [material,paint]of [['hull','main'],['armor','neutral'],['ochre','accent']]){
  const actual=g.materials.find(m=>m.name===`rook · ${material}`).pbrMetallicRoughness.baseColorFactor;
  const expected=new THREE.Color(SHIP_LIVERIES.concord[paint]).toArray();
  assert.ok(expected.every((v,i)=>Math.abs(v-actual[i])<1e-6),`Rook ${material} uses Concord fleet paint`);
 }
});
