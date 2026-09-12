import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {GRAVEYARD_MODEL_WRECKS, WRECK_SECTION_VARIANTS, wreckSectionDelta, generateWreckNodes} from '../src/game/missionWorldData.js';
import {GRAVEYARD_MODEL_COLLIDERS} from '../src/game/worldData.js';
import {GRAVEYARD_COLLISION_PROFILES} from '../src/game/graveyardCollisionProfiles.js';
import {LOCATIONS} from '../src/game/data.js';

test('repeated wrecks use four frigate arrangements and two cruiser arrangements without extra assets',()=>{
 for(const [kind,count] of [['frigate',4],['cruiser',2]]){
  const wrecks=GRAVEYARD_MODEL_WRECKS.filter(w=>w.class===kind);
  assert.equal(new Set(wrecks.map(w=>w.variant??0)).size,count);
  assert.equal(new Set(wrecks.map(w=>w.file)).size,1);
 }
 for(const w of GRAVEYARD_MODEL_WRECKS){
  if(w.interior)assert.equal(wreckSectionDelta(w,w.interior.sectionName),undefined);
  for(const key of Object.keys(WRECK_SECTION_VARIANTS[w.class]?.[w.variant??0]??{}))
   assert.ok(GRAVEYARD_COLLISION_PROFILES[w.class].some(p=>p.name===key));
 }
});

test('each collider follows the same section delta as the rendered mesh and stays inside the salvage exclusion sphere',()=>{
 const origin=new THREE.Vector3(...LOCATIONS['mourning-line'].position);
 for(const w of GRAVEYARD_MODEL_WRECKS){
  const whole=new THREE.Matrix4().compose(origin.clone().add(new THREE.Vector3(...w.local)),new THREE.Quaternion().setFromEuler(new THREE.Euler(...w.rotation)),new THREE.Vector3().setScalar(w.scale));
  for(const p of GRAVEYARD_COLLISION_PROFILES[w.class]){
   const delta=wreckSectionDelta(w,p.name);
   const part=new THREE.Matrix4().compose(new THREE.Vector3(...(delta?.position??[0,0,0])),new THREE.Quaternion().setFromEuler(new THREE.Euler(...(delta?.rotation??[0,0,0]))),new THREE.Vector3(1,1,1));
   const collider=GRAVEYARD_MODEL_COLLIDERS.find(c=>c.modelWreckId===w.id&&c.sectionName===p.name);
   assert.ok(collider);
   const expectedCenter=new THREE.Vector3(...p.center).applyMatrix4(part).applyMatrix4(whole);
   assert.ok(expectedCenter.distanceTo(new THREE.Vector3(...collider.position))<1e-7);
   for(let i=0;i<p.vertices.length;i+=3){
    const local=new THREE.Vector3(...p.vertices.slice(i,i+3)).add(new THREE.Vector3(...p.center)).applyMatrix4(part);
    assert.ok(local.length()*w.scale<w.clearanceRadius,`${w.id}: section exceeds salvage exclusion sphere`);
    const expected=local.applyMatrix4(whole);
    const actual=new THREE.Vector3(...collider.meshVerts.slice(i,i+3)).applyQuaternion(new THREE.Quaternion(...collider.quaternion)).add(new THREE.Vector3(...collider.position));
    assert.ok(expected.distanceTo(actual)<.001,`${w.id}: collision transform mismatch`);
   }
  }
 }
});

test('arrangements and salvage remain fixed across reloads and depletion',()=>{
 const a=generateWreckNodes('variant-check',{}),b=generateWreckNodes('variant-check',{[a[0]?.id]:0});
 assert.deepEqual(a.map(n=>[n.id,n.position,n.insideWreckId]),b.map(n=>[n.id,n.position,n.insideWreckId]));
 const frigates=GRAVEYARD_MODEL_COLLIDERS.filter(c=>c.modelClass==='frigate');
 for(const a of frigates)for(const b of frigates)if(a.sectionName===b.sectionName){assert.equal(a.meshVerts,b.meshVerts);assert.equal(a.meshIndices,b.meshIndices);}
});

test('section arrangements introduce no new intersections on authored race centerlines',async()=>{
 const {RACE_COURSES}=await import('../src/game/racing.js');
 const origin=new THREE.Vector3(...LOCATIONS['mourning-line'].position);
 const ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
 const routes=Object.values(RACE_COURSES).filter(course=>course.zone==='mourning-line');
 let checked=0;
 for(const w of GRAVEYARD_MODEL_WRECKS.filter(w=>w.variant))for(const p of GRAVEYARD_COLLISION_PROFILES[w.class]){
  const delta=wreckSectionDelta(w,p.name);if(!delta)continue;
  const world=new THREE.Matrix4().compose(origin.clone().add(new THREE.Vector3(...w.local)),new THREE.Quaternion().setFromEuler(new THREE.Euler(...w.rotation)),new THREE.Vector3().setScalar(w.scale));
  const part=new THREE.Matrix4().compose(new THREE.Vector3(...delta.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...delta.rotation)),new THREE.Vector3(1,1,1));
  const before=world.clone().invert(),after=world.clone().multiply(part).invert();
  const intersects=(start,end,inverse)=>{
   const from=start.clone().applyMatrix4(inverse).sub(new THREE.Vector3(...p.center)),to=end.clone().applyMatrix4(inverse).sub(new THREE.Vector3(...p.center)),distance=from.distanceTo(to);
   ray.set(from,to.sub(from).normalize());
   if(ray.distanceSqToPoint(new THREE.Vector3())>p.radius*p.radius)return false;
   for(let i=0;i<p.indices.length;i+=3){a.fromArray(p.vertices,p.indices[i]*3);b.fromArray(p.vertices,p.indices[i+1]*3);c.fromArray(p.vertices,p.indices[i+2]*3);
    if(ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceTo(from)<=distance)return true;
   }return false;
  };
  for(const course of routes){
   const paths=[course.localPoints,...(course.shortcuts??[]).map(s=>[course.localPoints[s.entryIndex],...s.gates.map(g=>g.localPosition),course.localPoints[Math.min(course.localPoints.length-1,s.exitIndex+1)]])];
   for(const points of paths)for(let i=1;i<points.length;i++){
    const from=new THREE.Vector3(...points[i-1]).add(origin),to=new THREE.Vector3(...points[i]).add(origin);checked++;
    assert.ok(!intersects(from,to,after)||intersects(from,to,before),`${w.id} blocks ${course.id} segment ${i}`);
   }
  }
 }
 assert.ok(checked>0);
});
