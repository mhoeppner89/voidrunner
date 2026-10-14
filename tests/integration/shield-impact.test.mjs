import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {SpaceRenderer} from '../../src/game/render.js';
const actor={position:[10,20,30],rotation:[0,0,0,1],shield:100};
const extents=[2,3,4];
test('oblique and inside-shell rays place the impact on the incoming shield surface',()=>{
 const r=Object.create(SpaceRenderer.prototype);
 for(const origin of [[-100,20,30],[9,20,30],[5,25,50]]){
  const p=r.shieldImpactPoint(actor,extents,[10,20,30],origin).clone();
  const local=p.sub(new THREE.Vector3(...actor.position));
  assert.ok(Math.abs((local.x/3.6)**2+(local.y/5.4)**2+(local.z/7.2)**2-1)<1e-10);
  const incoming=new THREE.Vector3(...origin).sub(new THREE.Vector3(...actor.position));
  assert.ok(local.dot(incoming)>0);
  assert.ok(local.clone().cross(incoming).length()<1e-8);
 }
});
test('shield impact placement respects ship rotation and does not mutate gameplay hits',()=>{
 const r=Object.create(SpaceRenderer.prototype),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
 const ship={...actor,rotation:q.toArray()},point=new THREE.Vector3(...actor.position),origin=new THREE.Vector3(10,20,100);
 const p=r.shieldImpactPoint(ship,extents,point,origin).clone().sub(point).applyQuaternion(q.clone().invert());
 assert.ok(Math.abs(p.length()-3.6)<1e-10);assert.deepEqual(point.toArray(),actor.position);
});
test('weapon impacts use the shield while bypassing shots and depleted shields hit hull',()=>{
 const r=Object.create(SpaceRenderer.prototype);let impact;
 r.spawnImpact=p=>impact=[...p];
 r.weaponImpact(actor,extents,actor.position,[-100,20,30],{},0);
 assert.ok(Math.abs(impact[0]-6.4)<1e-9);
 r.weaponImpact(actor,extents,actor.position,[-100,20,30],{shieldBypass:1},0);assert.deepEqual(impact,actor.position);
 r.weaponImpact({...actor,shield:0},extents,actor.position,[-100,20,30],{},0);assert.deepEqual(impact,actor.position);
});
