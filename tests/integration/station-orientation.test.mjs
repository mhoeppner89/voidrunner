import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {LOCATIONS} from '../../src/game/data.js';import {STATION_DOCKS} from '../../src/game/stationDocks.js';import {stationYaw,stationRotatePoint} from '../../src/game/stationOrientation.js';import {playerBerth,preparePlayerLaunch} from '../../src/game/playerDocking.js';import {stationSurfaceDistance,stationModelOffsetZ,stationVisualSurfaceRadius,clearParkedBerth} from '../../src/game/stationTraffic.js';import {StationTransit} from '../../src/game/stationTransit.js';
const exceptions=new Set(['rook:verge-meridian-point','league-yard:acheron-pale-point','argent:verge-pale-point']);
test('all normal intra-system destinations approach the hangar side; only three surrounding jump routes remain behind',()=>{
 let front=0,total=0;const behind=[];
 for(const id of Object.keys(STATION_DOCKS)){const l=LOCATIONS[id],b=playerBerth(id),out=new T.Vector3(...b.gate).sub(new T.Vector3(...b.pad)).normalize();
 for(const p of Object.values(LOCATIONS).filter(p=>p.id!==id&&p.systemId===l.systemId)){const dot=out.dot(new T.Vector3(...p.position).sub(new T.Vector3(...l.position)).normalize()),key=id+':'+p.id;total++;if(dot>0){front++;assert.ok(!exceptions.has(key),key+' exception is obsolete');}else{behind.push(key);assert.ok(exceptions.has(key),key+' arrives from behind');assert.equal(p.kind,'jump-point');}}
 }assert.deepEqual(new Set(behind),exceptions);assert.ok(front/total>.95,`${front}/${total}`);
});
test('films and departure use the same rotated berth and station frame in every system',()=>{
 const shot=new StationTransit();shot.model=new T.Group();shot.model.matrixAutoUpdate=false;shot.scene.add(shot.model);
 for(const id of Object.keys(STATION_DOCKS)){const origin=LOCATIONS[id].position,berth=playerBerth(id,6),offset=stationRotatePoint(id,[0,0,stationModelOffsetZ(id)]),scale=18/stationVisualSurfaceRadius(id);
 for(const direction of ['entry','exit']){shot.configure(new T.Group(),null,id,direction,{berth,height:6});assert.equal(shot.model.rotation.y,stationYaw(id));const world=shot.pad.clone().multiplyScalar(1/scale).add(new T.Vector3(...origin)).add(new T.Vector3(...offset));world.y+=6;assert.ok(world.distanceTo(new T.Vector3(...berth.pad))<1e-8,id);}
 const s={save:{player:{stationPadIndex:0,position:[0,0,0],velocity:[0,0,0],rotation:[0,0,0,1],angularVelocity:[0,0,0]}},playerHullExtents:()=>[12,6,22],renderer:{setLandingGuide(){}}};preparePlayerLaunch(s,id);const heading=new T.Vector3(0,0,-1).applyQuaternion(new T.Quaternion(...s.save.player.rotation));assert.ok(heading.dot(new T.Vector3(...berth.gate).sub(new T.Vector3(...berth.pad)).normalize())>.999999,id);assert.ok(stationSurfaceDistance(id,s.save.player.position)>0,id);
 }shot.dispose();
});
test('parked-ship clearance rotates its adjustment back into the correct world lane',()=>{const id='rook',o=LOCATIONS[id].position,p=[o[0],o[1],o[2]],b={id,pad:stationRotatePoint(id,p,o),gate:stationRotatePoint(id,[o[0],o[1],o[2]+100],o)};assert.ok(clearParkedBerth(b,[4,3,12],[{min:[o[0]-5,o[1]-3,o[2]-18],max:[o[0]+5,o[1]+3,o[2]+10]}]));const local=stationRotatePoint(id,b.pad,o,true);assert.ok(Math.abs(local[2]-o[2]-24)<1e-8);assert.ok(Math.abs(local[0]-o[0])<1e-8);});
