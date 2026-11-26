import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {aceManeuver,maneuverHeading,maneuverSpeed,maneuverBank} from '../../src/game/aceManeuvers.js';
import {SHIPS} from '../../src/game/data.js';
import {fixture} from '../helpers/session.mjs';
import {regenerateCombatResources} from '../../src/game/combatResources.js';

function setup(kind,hull='talon',tier='ace') {
 const stats=SHIPS[hull],s={targetId:'foe',pilot:{tier},combatFit:{stats},speed:stats.maxSpeed,energy:stats.energyCapacity,velocity:[0,0,-stats.maxSpeed],combatIntent:'hunt',aiRng:()=>.3,
  combatPlan:{visible:true,right:new THREE.Vector3(1,0,0),up:new THREE.Vector3(0,1,0),escape:new THREE.Vector3(1,0,0),offset:new THREE.Vector3(),targetVelocity:new THREE.Vector3(0,0,-70),clearance:50},
  gunAim:{visible:true,targetId:'foe',acceleration:new THREE.Vector3(15,0,0)}};
 const a={time:1,distance:160,nose:.8,travel:.8,closing:25};
 if(kind==='high-yo-yo'){s.combatPlan.pursuit='lag';s.combatPlan.overshoot=true;}
 if(kind==='lead-cut'){s.combatPlan.pursuit='lead';a.distance=290;a.closing=-30;}
 if(kind==='scissors'){s.combatIntent='evade';s.combatThreatUntil=4;a.nose=-.8;a.travel=-.8;}
 return {s,a};
}
const choose=(s,a,field=false)=>aceManeuver(s,a.time,a.distance,a.nose,a.travel,235,true,field,a.nose,a.travel,a.closing);

test('open-space turns respond to observed curved pursuit and a faster rear attacker',()=>{
 for(const kind of ['high-yo-yo','lead-cut','scissors']){
  const {s,a}=setup(kind);assert.equal(choose(s,a)?.kind,kind);
  for(const mode of ['field','heavy','novice','no-context']){
   const other=setup(kind,mode==='heavy'?'wayfarer':'talon',mode==='novice'?'novice':'ace');
   if(mode==='no-context'){other.s.gunAim.visible=false;other.s.combatThreatUntil=0;}
   assert.notEqual(choose(other.s,other.a,mode==='field')?.kind,kind,`${kind}: ${mode}`);
  }
 }
 const {s,a}=setup('lead-cut');s.gunAim.acceleration.set(0,0,-20);
 assert.notEqual(choose(s,a)?.kind,'lead-cut','straight acceleration is not a turn');
});

test('S-turns change direction once; pursuit moves converge and trim speed without granting thrust',()=>{
 const lead=new THREE.Vector3(0,0,-1),out=new THREE.Vector3();
 for(const kind of ['high-yo-yo','lead-cut','scissors']){
  const {s,a}=setup(kind),move=choose(s,a);
  const first=maneuverHeading(move,1.4,lead,a.distance,235,out).toArray();
  assert.ok(Math.abs(out.length()-1)<1e-9);
  if(kind==='high-yo-yo'){assert.ok(first[0]<0,'outside the target turn');assert.ok(Math.abs(first[1])>.3);}
  if(kind==='lead-cut')assert.ok(first[0]>.3,'inside the observed target turn');
  if(kind==='scissors'){maneuverHeading(move,2.2,lead,a.distance,235,out);assert.ok(first[0]*out.x<0,'reverse the break before returning to aim');}
  maneuverHeading(move,move.until,lead,a.distance,235,out);assert.ok(out.dot(lead)>.999);
  assert.ok(Math.abs(maneuverBank(move,1.4))<1);assert.ok(maneuverSpeed(move,1.4,110,80)<=110);
  assert.equal(maneuverSpeed(move,move.until,110,80),110);
  choose(s,{...a,time:move.until+.01});
  assert.equal(s.aceMove,undefined);assert.notEqual(choose(s,{...a,time:s.aceMoveReadyAt+.01})?.kind,kind,'avoid immediate repeats');
 }
});

test('an offensive cut yields to the physical close-pass separation route',()=>{
 for(const kind of ['high-yo-yo','lead-cut']){
  const {s,a}=setup(kind);assert.equal(choose(s,a)?.kind,kind);
  s.combatPlan.passUntil=3;
  assert.equal(choose(s,{...a,time:1.1}),undefined);
  const fresh=setup(kind);fresh.s.combatPlan.passUntil=3;
  assert.notEqual(choose(fresh.s,fresh.a)?.kind,kind);
 }
});

test('real open-space flights execute each move, keep bounded motion and return to firing',()=>{
 const forward=new THREE.Vector3(0,0,-1),q=new THREE.Quaternion(),target=new THREE.Vector3(),velocity=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3();
 for(const kind of ['high-yo-yo','lead-cut','scissors']){
  const s=fixture(),ship=s.spawnShip('pirate',[0,0,kind==='high-yo-yo'?195:kind==='lead-cut'?110:-125],undefined,undefined,{tier:'ace',temperament:'steady'},{hullId:'talon'});
  ship.targetId='player';ship.velocity=[0,0,kind==='high-yo-yo'?-110:-75];ship.rotation=[0,0,0,1];ship.fireCommitReadyAt=100;
  ship.combatFit.turrets=[];ship.combatFit.missiles=0;ship.combatFit.racks?.forEach(r=>r.missiles=0);s.npcFlightStats(ship);
  if(kind==='scissors'){ship.evasiveUntil=3;ship.evasiveLatencyUntil=0;ship.combatThreatUntil=5;ship.combatThreatId='player';ship.combatPressure=40;ship.combatPressureAt=0;ship.fireCommitDamageLimit=20;}
  target.set(0,0,0);let sawMove=false,moveEnded=0,shotAt=0;
  const fire=s.fireNpcGun;s.fireNpcGun=function(...args){const count=this.projectiles.length;fire.apply(this,args);if(this.projectiles.length>count)shotAt=this.save.world.time;};
  for(let i=0;i<1200;i++){
   const t=s.save.world.time=i/60,phase=kind==='scissors'?Math.max(0,t-2)*.55:t*.3,speed=kind==='high-yo-yo'?70:kind==='lead-cut'?120:t<2?125:70;
   velocity.set(Math.sin(phase)*speed,0,-Math.cos(phase)*speed);target.addScaledVector(velocity,1/60);target.toArray(s.save.player.position);velocity.toArray(s.save.player.velocity);
   q.setFromUnitVectors(forward,after.copy(velocity).normalize()).toArray(s.save.player.rotation);
   ship.fireCooldown-=1/60;regenerateCombatResources(ship,ship.combatFit.resources,1/60,100);before.fromArray(ship.position);s.updateAttackAI(ship,target,velocity,1/60);
   if(ship.aceMove?.kind===kind){sawMove=true;moveEnded=t;}
   assert.ok(before.distanceTo(after.fromArray(ship.position))<Math.max(110,ship.afterburnSpeed)*1.08/60,'ordinary finite flight, no teleport');
   assert.ok([...ship.position,...ship.velocity,...ship.rotation].every(Number.isFinite));
  }
  assert.ok(sawMove,kind);assert.ok(shotAt>moveEnded+1,`${kind} must resume a real projectile attack`);
 }
});
