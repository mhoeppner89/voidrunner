import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './combat-variety.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
const {npcForwardCone,npcShotDirection,npcTriggerReady,recordNpcShot}=await import('../src/game/npcGunnery.js');
import {WEAPONS,weaponAssistCone} from '../src/game/weapons.js';
import {seededRandom} from '../src/game/random.js';
const dir=degrees=>new THREE.Vector3(Math.sin(degrees*Math.PI/180),0,-Math.cos(degrees*Math.PI/180));
function pilot(tier){return {rotation:[0,0,0,1],pilot:{tier},aiRng:seededRandom('gunnery-'+tier)};}
test('forward aim correction stays narrow, while beams share player assistance',()=>{
 for(const tier of ['novice','veteran','ace']){
  const ship=pilot(tier),out=new THREE.Vector3();
  assert.ok(npcShotDirection(ship,WEAPONS.pulse,dir(3.9),out));
  assert.equal(npcShotDirection(ship,WEAPONS.pulse,dir(4.1),out),tier==='novice');
  for(const angle of [30,90,180])assert.equal(npcShotDirection(ship,WEAPONS.pulse,dir(angle),out),false);
  assert.equal(npcForwardCone(WEAPONS.beam),weaponAssistCone(WEAPONS.beam));
  assert.ok(npcShotDirection(ship,WEAPONS.beam,dir(14),out));assert.ok(out.angleTo(dir(14))<1e-7);
  assert.equal(npcShotDirection(ship,WEAPONS.beam,dir(15),out),false);
 }
});
test('novices fire four-shot bursts with clear pauses',()=>{
 const ship=pilot('novice'),w=WEAPONS.pulse;
 assert.equal(npcTriggerReady(ship,w,1,0),false);assert.equal(npcTriggerReady(ship,w,1,.1),false);assert.equal(npcTriggerReady(ship,w,1,.13),true);
 recordNpcShot(ship,.13);recordNpcShot(ship,.4);recordNpcShot(ship,.7);recordNpcShot(ship,1);assert.equal(npcTriggerReady(ship,w,1,1.5),false);assert.equal(npcTriggerReady(ship,w,1,2.21),true);
 assert.equal(npcTriggerReady(ship,w,0,2.3),false);assert.equal(npcTriggerReady(ship,w,1,2.4),false);
});
test('novice forward shots miss much more often even when aligned; dispersion rotates with the hull',()=>{
 const hits={};for(const tier of ['novice','veteran','ace']){const ship=pilot(tier);let count=0;for(let i=0;i<1000;i++){const shot=new THREE.Vector3();npcShotDirection(ship,WEAPONS.pulse,dir(0),shot);if(Math.hypot(shot.x,shot.y)*180<3)count++;}hits[tier]=count;}
 assert.ok(hits.novice<hits.veteran*.4);assert.ok(hits.ace>=hits.veteran);
 const a=pilot('novice'),b=pilot('novice'),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),1.4);b.rotation=rotation.toArray();
 const x=new THREE.Vector3(),y=new THREE.Vector3();npcShotDirection(a,WEAPONS.pulse,dir(2),x);npcShotDirection(b,WEAPONS.pulse,dir(2).applyQuaternion(rotation),y);assert.ok(x.applyQuaternion(rotation).distanceTo(y)<1e-8);
});
test('actual NPC firing rejects sideways shots without spending energy and uses a fixed muzzle position',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'ace'});ship.rotation=[0,0,0,1];ship.combatWeaponIndex=0;ship.combatFit.weapons[0]='pulse';ship.combatFit.fireAt[0]=0;s.save.world.time=1;
 const energy=ship.energy;s.fireNpcGun(ship,dir(30));assert.equal(s.projectiles.length,0);assert.equal(ship.energy,energy);
 s.fireNpcGun(ship,dir(3));assert.equal(s.projectiles.length,1);const first=s.projStore.getPos(s.projectiles[0].slot,new THREE.Vector3()).clone();
 s.save.world.time=2;s.fireNpcGun(ship,dir(-3));const second=s.projStore.getPos(s.projectiles[1].slot,new THREE.Vector3());assert.deepEqual(second.toArray(),first.toArray());
});

test('NPC beam assistance aims from the physical mount and refuses a target outside the shared cone',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'novice'});ship.rotation=[0,0,0,1];ship.targetId='player';ship.combatWeaponIndex=0;ship.combatFit.weapons[0]='beam';ship.combatFit.fireAt[0]=0;s.save.world.time=1;
 s.save.player.position=dir(8).multiplyScalar(150).toArray();let shots=0;
 s.fireBeam=(owner,w,start,ray)=>{shots++;assert.ok(ray.angleTo(new THREE.Vector3().fromArray(s.save.player.position).sub(start))<1e-7);};
 s.fireNpcGun(ship,dir(8));assert.equal(shots,1);
 s.save.world.time=2;s.save.player.position=dir(25).multiplyScalar(150).toArray();s.fireNpcGun(ship,dir(25));assert.equal(shots,1);
});


test('novice spray starts early but flies along the nose rather than toward an off-axis target',()=>{
 const ship=pilot('novice'),out=new THREE.Vector3();for(let i=0;i<200;i++){assert.ok(npcShotDirection(ship,WEAPONS.pulse,dir(11),out));assert.ok(out.angleTo(dir(0))<=2.5*Math.PI/180+1e-8);assert.ok(out.angleTo(dir(11))>8*Math.PI/180);}
 assert.equal(npcShotDirection(pilot('veteran'),WEAPONS.pulse,dir(11),out),false);
});
