import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stationModel} from './helpers/station-model.mjs';
import {GameSession} from '../src/game/game.js';
import {SHIPS,LOCATIONS} from '../src/game/data.js';
import {STATION_DOCKS} from '../src/game/stationDocks.js';
import {reserveStationDock,updateStationDock,stationBerth,clearParkedBerth} from '../src/game/stationTraffic.js';
import {buildStationCollider,hullVsStation} from '../src/game/stationCollision.js';
import {shipVsStation} from '../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../src/game/render.js';

for(const id of Object.keys(STATION_DOCKS))test(`${id}: every traffic lane clears its GLB for every flyable hull`,()=>{
 const collider=buildStationCollider(stationModel(id),LOCATIONS[id].position),pos=new THREE.Vector3(),inv=new THREE.Quaternion(),contact={};
 for(const [hullId,def] of Object.entries(SHIPS))for(let lane=0;lane<STATION_DOCKS[id].lanes.length;lane++){
  const variant=def.variant??hullId,hull=GameSession.prototype.npcHullExtents.call({}, {variant}),berth=stationBerth(id,lane,hull[1]);
  const ship={hull:100,maxHull:100,variant,position:berth.gate.map((v,i)=>v+(i===2?40:0)),velocity:[0,0,0],rotation:[0,Math.sin(.7),0,Math.cos(.7)]};
  // Occupy the preceding lanes so reservation chooses the tested one.
  const occupied=Array.from({length:lane},(_,i)=>({hull:100,stationDock:{id,lane:i}}));
  const session={ships:[...occupied,ship],save:{player:{systemId:LOCATIONS[id].systemId},world:{time:0}},npcHullExtents:()=>hull};
  assert.ok(reserveStationDock(session,ship,id));assert.equal(ship.stationDock.lane,lane);
  const phases=new Set();let docked=false;
  for(let n=0;n<20000&&ship.stationDock;n++) {
   session.save.world.time+=1/60;updateStationDock(session,ship,1/60);phases.add(ship.stationDock?.phase??'complete');
   pos.fromArray(ship.position);inv.fromArray(ship.rotation);
   assert.equal(shipVsStation(pos,inv,variant,npcShipScaleForVariant(variant),collider,contact),false,`${hullId}/lane ${lane}/${ship.stationDock?.phase}: fitted hull clips station`);
   if(ship.stationDock?.phase==='docked'){docked=true;assert.deepEqual(ship.velocity,[0,0,0]);}
   if(['landing','docked','launch','outbound'].includes(ship.stationDock?.phase))assert.ok(Math.abs(ship.rotation[1])<1e-5,'no turn inside the station');
  }
  assert.ok(docked);assert.equal(ship.stationDockCompleted,id);for(const phase of ['orient','landing','docked','launch','outbound','turnout'])assert.ok(phases.has(phase));
  assert.ok(new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().fromArray(ship.rotation)).z>.999,'normal flight receives an outward heading');
 }
});

test('traffic stops ahead of parked ship bounds and waits when a lane cannot fit',()=>{
 const hull=[4,3,12],parked=[{min:[-5,-3,-18],max:[5,3,10]}],berth={pad:[0,1,0],gate:[0,1,100]};
 assert.ok(clearParkedBerth(berth,hull,parked));assert.equal(berth.pad[2],24);assert.deepEqual(berth.gate,[0,1,100]);
 assert.equal(clearParkedBerth({pad:[0,1,0],gate:[0,1,35]},hull,parked),false);
 const offset={pad:[25,1,0],gate:[25,1,100]};assert.ok(clearParkedBerth(offset,hull,parked));assert.equal(offset.pad[2],0);
});

test('live traffic waits for station geometry and parked bounds to load',()=>{
 const ship={hull:100,position:[0,0,0],velocity:[0,0,0],rotation:[0,0,0,1]},s={ships:[ship],save:{world:{time:0}},npcHullExtents:()=>[3,2,5],renderer:{stationModelLoads:new Map(),stationColliders:new Map()}};
 assert.equal(reserveStationDock(s,ship,'helix'),false);assert.equal(ship.stationQueue,'helix');assert.equal(ship.stationDock,undefined);
 s.renderer.stationColliders.set('helix',{});assert.ok(reserveStationDock(s,ship,'helix'));assert.equal(ship.stationQueue,undefined);
});

test('NPC hard collisions use visible station surfaces without a docking exemption',()=>{
 const model=new THREE.Mesh(new THREE.BoxGeometry(20,20,20)),collider=buildStationCollider(model,LOCATIONS.helix.position),p=LOCATIONS.helix.position;
 const ship={variant:'kestrel',hull:100,maxHull:100,position:[p[0]+10.8,p[1],p[2]],velocity:[-1,0,0],rotation:[0,0,0,1],stationDock:{id:'helix',phase:'landing'}};
 const s=Object.create(GameSession.prototype);Object.assign(s,{save:{player:{systemId:LOCATIONS.helix.systemId}},tmpA:new THREE.Vector3(),tmpB:new THREE.Vector3(),tmpQ:new THREE.Quaternion(),tmpQ2:new THREE.Quaternion(),tmpCollide:new THREE.Vector3(),npcHullExtents:()=>[1,1,1],renderer:{stationColliders:new Map([['helix',collider]])},forEachObstacleInBox(){},damageShip(){throw Error('slow contact should not damage');}});
 s.resolveNpcCollisions(ship);assert.ok(ship.position[0]>p[0]+11);assert.ok(ship.velocity[0]>0);assert.equal(ship.stationDock.phase,'landing');
});
