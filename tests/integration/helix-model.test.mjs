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

test('Helix source, shipping budget, berths and parked ships agree',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../fixtures/station-models.json',import.meta.url))).helix,dock=STATION_DOCKS.helix,occupants=STATION_OCCUPANTS.helix;
 assert.equal(dock.radius,report.sourceRadius);assert.equal(occupants.radius,report.sourceRadius);assert.deepEqual(dock.playerPads,report.playerPads);assert.deepEqual(dock.lanes,report.lanes);assert.deepEqual(occupants.ships,report.occupants);
 assert.ok(report.portalWidth>=12&&report.portalHeight>=8,'a broad side portal opens to the atrium');assert.ok(report.concourse.hall.width>report.portalWidth&&report.concourse.hall.back-report.concourse.hall.front>=30);
 const b=fs.readFileSync(new URL('../../assets/models/stations/helix.glb',import.meta.url)),g=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 const triangles=g.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);
 assert.equal(triangles,report.triangles);assert.ok(triangles<40000);assert.equal(g.materials.length,10);assert.equal(g.images.length,1,'one shared panel atlas');assert.ok(b.length<2_500_000);
 const model=stationModel('helix'),p=new THREE.Vector3();let max=0;model.updateMatrixWorld(true);model.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++)max=Math.max(max,p.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld).length());});
 assert.ok(Math.abs(max-LOCATIONS.helix.radius*.95)<.01,'normalized model retains the existing station radius');
});
test('every player hull retains a private collision-free Helix berth in both flight directions',()=>{
 const collider=buildStationCollider(stationModel('helix'),LOCATIONS.helix.position);
 for(const [id,def]of Object.entries(SHIPS)){
  const berths=fittedPlayerBerths('helix',def.variant,collider);
  assert.equal(berths.length,1,`${id} fits its authored private berth`);assert.equal(berths[0].sharedNpcLaneIndex,undefined,`${id} does not consume an NPC lane`);
 }
});
