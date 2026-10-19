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
const reports=JSON.parse(fs.readFileSync(new URL('../fixtures/station-models.json',import.meta.url)));
for(const id of Object.keys(STATION_DOCKS))test(`${id}: concourse architecture, berths, source and resource budget agree`,()=>{
 const report=reports[id],dock=STATION_DOCKS[id],occupants=STATION_OCCUPANTS[id];
 assert.equal(dock.radius,report.sourceRadius);assert.equal(occupants.radius,report.sourceRadius);assert.deepEqual(dock.playerPads,report.playerPads);assert.deepEqual(dock.lanes,report.lanes);assert.deepEqual(occupants.ships,report.occupants);
 const concourse=report.concourse;assert.ok(concourse&&fs.existsSync(concourse.reference),'concourse has its actual artwork reference');
 assert.ok(['interior','sheltered','exterior','courtyard'].includes(concourse.kind));
 if(concourse.kind==='interior'){assert.ok(concourse.hall.width>report.portalWidth,'portal opens into a larger shared hall');assert.ok(concourse.hall.back-concourse.hall.front>24,'hall has genuine depth');}
 assert.equal(concourse.roofOverPlayer,['interior','sheltered'].includes(concourse.kind));
 assert.ok(report.detailParts>0&&report.surfaceCleanup.coplanarSubtractions>0);assert.ok(report.packing.verticesAfter<report.packing.verticesBefore);assert.ok(report.contactOcclusion.minimum>=.57);
 assert.deepEqual(report.detachedGroups,[],'no wholly unsupported authoring groups');
 assert.deepEqual(report.physicalDetachedGroups,[],'mesh contact also connects each structural group, including hollow profiles');
 const b=fs.readFileSync(`assets/models/stations/${id}.glb`),g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 const tris=g.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);
 for(const m of g.meshes)for(const p of m.primitives){const a=g.accessors[p.attributes.COLOR_0];assert.ok(a&&a.normalized&&a.componentType===5121,'baked shading is compact vertex data');}
 assert.equal(tris,report.triangles);assert.ok(tris<40000&&tris>3000);assert.ok(g.materials.length<=10);assert.equal(g.images.length,1);assert.ok(b.length<2_500_000);
 const model=stationModel(id),p=new THREE.Vector3();let max=0;model.updateMatrixWorld(true);model.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++)max=Math.max(max,p.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld).length());});
 // Blackglass is translated onto its host moon; subtract that offset for normalization.
 if(id!=='blackglass')assert.ok(Math.abs(max-LOCATIONS[id].radius*.95)<.02);
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
