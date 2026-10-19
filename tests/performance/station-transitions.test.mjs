import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StationTransit,STATION_TRANSIT_DURATION} from '../../src/game/stationTransit.js';
import {STATION_DOCKS} from '../../src/game/stationDocks.js';
import {playerBerth} from '../../src/game/playerDocking.js';

test('all station shots follow authored berths, face their travel direction and keep each hull framed',()=>{
 const shot=new StationTransit(),hull=new THREE.Group(),environment=new THREE.Texture();
 try{
  for(const id of Object.keys(STATION_DOCKS))for(const[extents,hullLength,hullHeight]of [[[8,6,12],4,1],[[25,10,30],6,2],[[12,3,10],3.6,.5]])for(const direction of ['entry','exit'])for(const aspect of [1.6,2.16]){
   const berth=playerBerth(id,extents[1]);shot.configure(hull,environment,id,direction,{berth,height:extents[1],extents,hullLength,hullHeight});shot.resize(aspect);
   assert.equal(shot.duration,STATION_TRANSIT_DURATION[direction]);const expected=shot.out.clone().multiplyScalar(direction==='entry'?-1:1);let previous,scale;
   for(let i=0;i<=30;i++){
    const p=shot.update(i/30);assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.fade>=0&&p.fade<=1);scale??=p.scale;assert.equal(p.scale,scale);
    const position=new THREE.Vector3(p.x,p.y,p.z),f=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(p.pitch,p.yaw,p.roll));assert.ok(f.dot(expected)>.9999);
    if(previous)assert.ok(position.clone().sub(previous).dot(expected)>=0,'no reversal during the shot');previous=position;
    const q=position.clone().add(new THREE.Vector3(0,hullHeight*p.scale*.5,0)).project(shot.camera);assert.ok(Math.abs(q.x)<.1&&(id==='blackglass'&&direction==='entry'?q.y>-.85&&q.y<.1:Math.abs(q.y)<.1)&&q.z>-1&&q.z<1,`${id} focus stays on the hull`);
   }
  }
 }finally{shot.dispose();environment.dispose();}
});
test('the station scene releases its own resources without disposing the borrowed hull or environment',()=>{
 const shot=new StationTransit(),hull=new THREE.Group(),environment=new THREE.Texture(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());hull.add(mesh);let hullDisposed=false,envDisposed=false,own=0;
 mesh.geometry.addEventListener('dispose',()=>hullDisposed=true);environment.addEventListener('dispose',()=>envDisposed=true);
 for(const r of [shot.geometry,shot.background,shot.moon.geometry,shot.moon.material])r.addEventListener('dispose',()=>own++);
 shot.configure(hull,environment,'blackglass','exit');assert.ok(shot.moon.visible);shot.configure(hull,environment,'helix','entry');assert.equal(shot.moon.visible,false);shot.release();assert.equal(shot.scene.environment,null);shot.dispose();assert.equal(own,4);assert.equal(hullDisposed,false);assert.equal(envDisposed,false);environment.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('tracking cameras keep a clear view through the actual station geometry',async()=>{
 const {stationModel}=await import('../helpers/station-model.mjs'),{buildStationCollider}=await import('../../src/game/stationCollision.js'),{fittedPlayerBerths}=await import('../../src/game/shipLanding.js'),{SHIP_COLLIDERS,PLAYER_CONTACT_SCALE}=await import('../../src/game/shipCollision.js'),{LOCATIONS,SHIPS}=await import('../../src/game/data.js');
 const shot=new StationTransit(),hull=new THREE.Group(),ray=new THREE.Raycaster(),target=new THREE.Vector3(),direction=new THREE.Vector3();
 try{for(const id of Object.keys(STATION_DOCKS)){
  const model=stationModel(id),collider=buildStationCollider(model,LOCATIONS[id].position);model.scale.setScalar(.18);model.position.set(0,0,0);model.updateMatrixWorld(true);
  for(const hullId of ['wayfarer','atlas','talon']){
   const variant=SHIPS[hullId].variant,extents=SHIP_COLLIDERS[variant].extent.map(n=>n*PLAYER_CONTACT_SCALE),berth=fittedPlayerBerths(id,variant,collider)[0];assert.ok(berth,`${id}/${hullId} has a clear berth`);
   for(const phase of ['entry','exit']){
    shot.configure(hull,null,id,phase,{berth,height:extents[1],extents,hullLength:4,hullHeight:4*extents[1]/Math.max(...extents)});shot.resize(1.6);
    for(let i=1;i<20;i++){
     const p=shot.update(i/20);target.set(p.x,p.y+shot.shipHeight*.5,p.z);direction.subVectors(target,shot.camera.position);const distance=direction.length();ray.set(shot.camera.position,direction.normalize());const hit=ray.intersectObject(model,true)[0];
     assert.ok(!hit||hit.distance>=distance-shot.shipLength*.3,`${id}/${hullId}/${phase} camera is obstructed at ${i/20}`);
    }
   }
  }
  model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 }}finally{shot.dispose();}
});
