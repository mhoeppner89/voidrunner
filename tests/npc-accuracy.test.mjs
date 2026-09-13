import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {fixture} from './combat-variety.test.mjs';
import {WEAPONS} from '../src/game/weapons.js';
import {seededRandom} from '../src/game/random.js';
import {npcShotDirection,npcTriggerReady,observeNpcTargetMotion,applyNpcTurnLead} from '../src/game/npcGunnery.js';

const DEG=Math.PI/180,tiers=['novice','veteran','ace'];
const direction=degrees=>new THREE.Vector3(Math.sin(degrees*DEG),0,-Math.cos(degrees*DEG));
function pilot(tier){return {id:'accuracy',pilot:{tier},rotation:[0,0,0,1],targetId:'player',aiRng:seededRandom('accuracy-'+tier)};}
function firingSample(tier,id,range,count=2000){
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier});
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.targetId='player';ship.combatWeaponIndex=2;ship.combatFit.weapons[2]=id;ship.aiRng=seededRandom(`sample-${tier}-${id}`);
 s.save.player.shipId='talon';s.save.player.position=[0,0,-range];let shots=0,hits=0;
 const delta=new THREE.Vector3(),closest=new THREE.Vector3();
 function measure(owner,w,start,ray){shots++;delta.fromArray(s.save.player.position).sub(start);const along=delta.dot(ray);closest.copy(delta).addScaledVector(ray,-along);if(along>=0&&along<=w.range&&closest.length()<=s.playerCollisionRadius()+(w.kind==='beam'?0:.25))hits++;}
 s.spawnGunProjectile=measure;s.fireBeam=measure;
 for(let i=0;i<count;i++){s.save.world.time=i*4+1;ship.energy=100;s.fireNpcGun(ship,direction(0));}
 assert.equal(shots,count);return hits/count;
}
test('real beam rays miss occasionally, with novice < veteran < ace accuracy',()=>{
 const hits=tiers.map(tier=>firingSample(tier,'beam',250));
 assert.ok(hits[0]>.6&&hits[0]<.95,`novice ${hits[0]}`);assert.ok(hits[1]>hits[0]+.08&&hits[1]<1,`veteran ${hits[1]}`);assert.ok(hits[2]>hits[1]&&hits[2]>.98&&hits[2]<1,`ace ${hits[2]}`);
 console.log('Beam 250 km hit fractions:',hits);
});
test('Magrail accuracy falls with range, while novices miss regularly and trained pilots improve',()=>{
 const near=tiers.map(tier=>firingSample(tier,'gauss',100)),far=tiers.map(tier=>firingSample(tier,'gauss',550));
 assert.ok(near[0]>.1&&near[0]<.8);assert.ok(near[1]>near[0]&&near[2]>=near[1]);
 for(let i=0;i<3;i++)assert.ok(far[i]<near[i],`${tiers[i]} ${near[i]} -> ${far[i]}`);
 assert.ok(far[0]<far[1]&&far[1]<far[2]);console.log('Magrail 100/550 km hit fractions:',{near,far});
});
test('pulse and Ripper get short speculative bursts without bending rounds into the wider trigger cone',()=>{
 for(const tier of tiers)for(const id of ['pulse','pulse-mk2','ripper']){
  const p=pilot(tier),w=WEAPONS[id],angle=id==='ripper'?8.5:6.5;
  assert.equal(npcTriggerReady(p,w,Math.cos((angle+1.5)*DEG),0),false);
  assert.equal(npcTriggerReady(p,w,Math.cos(angle*DEG),.2),true);
  const out=new THREE.Vector3();p.aiRng=()=>0;
  assert.ok(npcShotDirection(p,w,direction(angle),out,.2,100));assert.ok(out.angleTo(direction(0))<1*DEG,'speculative barrel stays forward');
  assert.equal(npcTriggerReady(p,w,Math.cos(angle*DEG),.6),false);assert.equal(npcShotDirection(p,w,direction(angle),out,.6,100),false);
  p.gunBurstPauseUntil=2;assert.equal(npcTriggerReady(p,w,1,.7),false);
 }
 for(const id of ['ion','gauss','mortar']){const p=pilot('ace'),w=WEAPONS[id];npcTriggerReady(p,w,Math.cos(8*DEG),0);assert.equal(npcTriggerReady(p,w,Math.cos(6.5*DEG),.2),false);}
});
test('target changes and lost alignment cannot keep a speculative burst alive',()=>{
 const p=pilot('ace'),w=WEAPONS.pulse;npcTriggerReady(p,w,1,0);assert.equal(npcTriggerReady(p,w,Math.cos(6*DEG),.1),true);
 p.targetId='other';assert.equal(npcTriggerReady(p,w,Math.cos(6*DEG),.15),false);
 assert.equal(npcShotDirection(p,w,direction(30),new THREE.Vector3(),.15),false);
});
test('a speculative shot is held when an ally crosses the actual barrel line',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'});
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.targetId='player';ship.aiRng=()=>0;ship.combatWeaponIndex=2;ship.combatFit.weapons[2]='pulse';ship.energy=100;
 s.save.player.position=direction(6).multiplyScalar(100).toArray();npcTriggerReady(ship,WEAPONS.pulse,1,0);npcTriggerReady(ship,WEAPONS.pulse,Math.cos(6*DEG),.1);
 const ally=s.spawnShip('pirate',[0,0,-50]);ally.faction=ship.faction;s.save.world.time=.1;
 s.fireNpcGun(ship,direction(6));assert.equal(s.projectiles.length,0);assert.equal(ship.energy,100);
 ally.position[0]=50;s.fireNpcGun(ship,direction(6));assert.equal(s.projectiles.length,1);assert.ok(ship.energy<100);
});
test('observed turn compensation reduces curved-path lead error, remains bounded, and forgets hidden targets',()=>{
 const p=pilot('ace'),velocity=new THREE.Vector3();
 for(let i=0;i<=10;i++){const t=i*.2;observeNpcTargetMotion(p,velocity.set(60*Math.cos(.375*t),60*Math.sin(.375*t),0),t,true);}
 const position=new THREE.Vector3(160*Math.sin(.75),160*(1-Math.cos(.75)),-250),future=new THREE.Vector3(160*Math.sin(.9375),160*(1-Math.cos(.9375)),-250);
 const linear=position.clone().addScaledVector(velocity,.5),adjusted=applyNpcTurnLead(p,linear.clone(),.5,2);
 assert.ok(adjusted.distanceTo(future)<linear.distanceTo(future)*.5);
 const extreme=applyNpcTurnLead(p,linear.clone(),20,2);assert.ok(extreme.distanceTo(linear)<=12);
 const stale=applyNpcTurnLead(p,linear.clone(),.5,2.5);assert.deepEqual(stale.toArray(),linear.toArray());
 observeNpcTargetMotion(p,velocity.set(900,500,0),2.2,false);assert.deepEqual(applyNpcTurnLead(p,linear.clone(),.5,2.2).toArray(),linear.toArray());
 observeNpcTargetMotion(p,velocity,2.4,true);assert.equal(p.gunAim.acceleration.length(),0);
 p.targetId='other';observeNpcTargetMotion(p,velocity.set(-900,0,0),2.6,true);assert.equal(p.gunAim.acceleration.length(),0);
});
test('ace pointing error changes over time without changing the requested firing solution',()=>{
 const p=pilot('ace'),lead=direction(0),a=new THREE.Vector3(),b=new THREE.Vector3();p.aiRng=()=>0;
 npcShotDirection(p,WEAPONS.pulse,lead,a,0,250);npcShotDirection(p,WEAPONS.pulse,lead,b,1,250);
 assert.ok(a.angleTo(b)>.02*DEG);assert.ok(a.angleTo(lead)<.2*DEG&&b.angleTo(lead)<.2*DEG);assert.deepEqual(lead.toArray(),[0,0,-1]);
});

test('NPC PDC and laser turret fire both improve with pilot skill',()=>{
 for(const item of ['pdc','tracking-turret']){
  const rates=[];
  for(const tier of tiers){
   const s=fixture(),ship=s.spawnShip('escort',[0,0,0],undefined,undefined,{tier});
   ship.id='turret-accuracy';ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.targetId='player';ship.hostile=true;ship.combatFit.turrets=[item];
   s.save.player.position=[0,250,0];let shots=0,hits=0,firstShot;
   const delta=new THREE.Vector3();
   function measure(owner,w,start,ray){firstShot??=s.save.world.time;shots++;delta.fromArray(s.save.player.position).sub(start);if(delta.addScaledVector(ray,-delta.dot(ray)).length()<1.5+(item==='pdc'?.25:0))hits++;}
   s.fireBeam=measure;s.spawnGunProjectile=measure;
   for(let i=0;i<3600;i++){s.save.world.time=i/60;ship.energy=100;s.updateTurrets(ship,ship.id,1/60);}
   assert.ok(shots>50);rates.push(hits/shots);
   assert.ok(firstShot>0,'target acquisition and turret traverse take time');
  }
  assert.ok(rates[0]<rates[1]&&rates[1]<rates[2],`${item}: ${rates}`);console.log('NPC turret 250 km hit fractions:',item,rates);
 }
});

test('NPC pilot skill does not degrade the precise missile-interception solution or shared recovery',()=>{
 const shots=[];
 for(const tier of tiers){
  const s=fixture(),ship=s.spawnShip('escort',[0,0,0],undefined,undefined,{tier});
  ship.id='defender';ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.combatFit.turrets=['pdc'];s.save.player.position=[1000,0,0];
  const slot=s.projStore.alloc();s.projStore.setPos(slot,0,280,0);s.projStore.setVel(slot,0,-260,0);
  s.projectiles.push({id:'incoming',slot,kind:'missile',life:8,ownerId:'enemy',targetId:ship.id});
  let first;
  s.spawnGunProjectile=(owner,w,start,ray)=>{first??={at:s.save.world.time,ray:ray.toArray(),position:start.toArray()};return {};};
  for(let i=0;i<90&&!first;i++){s.save.world.time=i/60;ship.energy=100;s.updateTurrets(ship,ship.id,1/60);}
  assert.ok(first);const channel=s.pdcDefenseChannels.get(ship.id);assert.ok(Math.abs(channel.readyAt-first.at-2.5)<1e-9);shots.push(first);
 }
 assert.deepEqual(shots[0],shots[1]);assert.deepEqual(shots[1],shots[2]);
});
