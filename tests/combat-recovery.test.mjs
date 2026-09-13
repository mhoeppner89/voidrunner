import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {fixture} from './combat-variety.test.mjs';
import {session} from './weapon-overhaul.test.mjs';
import {createEnemyLoadout} from '../src/game/enemyLoadouts.js';
import {regenerateCombatResources} from '../src/game/combatResources.js';
import {combatThrottle} from '../src/game/combatPiloting.js';
import {planCombatFlight} from '../src/game/combatPlanning.js';
import {continueShieldRecovery} from '../src/game/combatRecovery.js';
import {aceManeuver} from '../src/game/aceManeuvers.js';
import {updateShipAI} from '../src/game/shipAI.js';

const zero=new THREE.Vector3(),forward=new THREE.Vector3(0,0,-1);
function setup(tier='veteran',role='pirate'){
 const s=fixture(),ship=s.spawnShip(role,[0,0,180],undefined,undefined,{tier,temperament:'steady'});
 ship.combatFit=createEnemyLoadout(ship,3);ship.combatFit.missiles=0;ship.combatFit.turrets=[];
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,-40];ship.shield=8;ship.shieldDelay=4.5;ship.targetId='player';ship.noSurrender=true;
 s.npcFlightStats(ship);return {s,ship};
}
function plan(s,ship){return planCombatFlight(s,ship,zero,zero,forward,Math.hypot(...ship.position),0);}
function step(s,ship){
 s.save.world.time+=1/60;ship.fireCooldown-=1/60;ship.shieldDelay-=1/60;
 regenerateCombatResources(ship,ship.combatFit.resources,1/60,ship.shieldDelay);
 s.updateAttackAI(ship,zero,zero,1/60);
}
test('a faster fighter reaches boost speed, recovers partially and returns to firing without endless resets',()=>{
 for(const tier of ['novice','veteran','ace']){
  const {s,ship}=setup(tier);const fuel=ship.fuel;let maxSpeed=0,attempts=0,recoveryTime=0,lastShot=0;
  const fire=s.fireNpcGun;s.fireNpcGun=function(...args){lastShot=this.save.world.time;return fire.apply(this,args);};
  for(let i=0;i<2400;i++){
   step(s,ship);const r=ship.combatPlan.recovery;attempts=Math.max(attempts,r.attempts);
   if(r.active){recoveryTime+=1/60;assert.equal(ship.combatIntent,'disengage');assert.equal(ship.aceMove,undefined);}
   maxSpeed=Math.max(maxSpeed,Math.hypot(...ship.velocity));
   if(s.save.world.time<4.5)assert.equal(ship.shield,8,'ordinary post-hit delay must apply');
  }
  const r=ship.combatPlan.recovery;
  assert.ok(maxSpeed>ship.afterburnSpeed*.9,`${tier} speed ${maxSpeed}`);
  assert.equal(attempts,1);assert.ok(recoveryTime>4.5&&recoveryTime<=14.4);assert.equal(r.lastResult,'recovered');
  assert.ok(ship.shield>=r.shieldGoal);assert.ok(lastShot>r.finishedAt,'must resume attacking');assert.ok(ship.fuel<fuel);
 }
});
test('hull speed advantage, a winnable finish and finite attempt limits govern withdrawal',()=>{
 const {s,ship}=setup();let r=plan(s,ship).recovery;assert.equal(r.active,true);assert.equal(r.mode,'range');
 ship.shield=0;ship.shieldDelay=4.5;s.save.world.time=r.until+.1;r=plan(s,ship).recovery;assert.equal(r.active,false);
 s.save.world.time=r.readyAt+1;plan(s,ship);assert.equal(r.active,false,'same veteran cannot reset this duel repeatedly');
 const other=setup();other.s.save.player.shield=0;other.s.save.player.hull=40;
 assert.equal(plan(other.s,other.ship).recovery.active,false,'finish a wounded exposed target when reserves allow it');
 for(const observedSpeed of [128,160]){
  const {s,ship}=setup();s.save.player.shipId='talon';s.save.player.velocity=[0,0,observedSpeed];
  const p=planCombatFlight(s,ship,zero,new THREE.Vector3(0,0,observedSpeed),forward,180,0);
  assert.equal(p.recovery.active,false,'do not race an equal or faster hull');
 }
});
test('recovery limits stop a pursued ace repeating unsuccessful escapes indefinitely',()=>{
 const {s,ship}=setup('ace');const r=plan(s,ship).recovery;
 for(let attempt=1;attempt<=2;attempt++){
  assert.equal(r.active,true);assert.equal(r.attempts,attempt);
  s.save.world.time=r.started+7.1;ship.shield=0;ship.shieldDelay=4.5;plan(s,ship);
  assert.equal(r.active,false);assert.equal(r.lastResult,'pursued');assert.ok(r.readyAt>=s.save.world.time+18);
  s.save.world.time=r.readyAt+1;plan(s,ship);
 }
 assert.equal(r.active,false);assert.equal(r.attempts,2);
});
test('a slower hull can seek real cover; losing sight does not cancel recovery or reveal hidden movement',()=>{
 const {s,ship}=setup('veteran','bounty');s.save.player.shipId='talon';
 s.obstacles=[{id:'cover',x:120,y:0,z:160,radius:60,collisionRadius:60,losRadius:60}];
 const r=plan(s,ship).recovery;assert.equal(r.active,true);assert.equal(r.mode,'cover');
 assert.equal(s.lineBlocked(zero,r.cover),true);const seen=r.targetPosition.toArray();
 s.arena=undefined;ship.playerAwareness=0;s.save.player.position=[700,400,-900];let searched=false,calls=0;
 s.updateSensorAwareness=()=>{};s.updateSearchAI=()=>{searched=true;return true;};
 s.updateAttackAI=(actor,pos,velocity)=>{calls++;assert.equal(actor.recoveryTargetHidden,true);assert.deepEqual(pos.toArray(),seen);assert.equal(velocity.length(),0);};
 updateShipAI(s,ship,1/60);assert.equal(calls,1);assert.equal(searched,false);assert.equal(ship.recoveryTargetHidden,false);
 ship.holdFire=true;assert.equal(continueShieldRecovery(s,ship,1/60),false);assert.equal(r.active,false);
});
test('boost allows acceleration and a turn, but obstacles and empty fuel still veto it',()=>{
 const {s,ship}=setup();ship.shield=ship.maxShield;ship.combatIntent='evade';
 combatThrottle(ship,0,180,0,0,-1,240,true,Math.PI);
 assert.ok(ship.combatBoostUntil>=2.5);assert.equal(ship.burning,true);
 combatThrottle(ship,1,180,0,0,-1,240,false,Math.PI);assert.equal(ship.burning,false);
 ship.shield=8;plan(s,ship);combatThrottle(ship,2,180,0,0,-1,240,false);assert.equal(ship.burning,false);
 ship.fuel=.4;combatThrottle(ship,3,180,0,0,-1,240,true);assert.equal(ship.burning,false);
});
test('under fire, slow coasting is rejected and a shield withdrawal cancels a drift',()=>{
 const {ship}=setup('ace');ship.combatIntent='evade';ship.velocity=[45,0,0];
 assert.equal(aceManeuver(ship,0,180,1,0,240,true),undefined);
 ship.velocity=[76,0,0];assert.equal(aceManeuver(ship,0,180,1,0,240,true)?.kind,'drift-pass');
 ship.combatPlan={recovery:{active:true}};assert.equal(aceManeuver(ship,.2,180,1,0,240,true),undefined);
});
test('withdrawing NPC turrets conserve offensive energy but still intercept a missile',()=>{
 const s=session(),ship=s.spawnShip('escort',[0,0,0],undefined,undefined,{tier:'veteran'});
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.hostile=true;ship.targetId='player';ship.combatFit.turrets=['pdc'];ship.combatPlan={recovery:{active:true}};
 s.save.player.position=[0,200,0];
 for(let i=0;i<90;i++){s.save.world.time=i/60;ship.energy=70;s.updateTurrets(ship,ship.id,1/60);}
 assert.equal(s.projectiles.length,0);
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,150,0);s.projStore.setVel(slot,0,-260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'player',targetId:ship.id,life:3});s.save.player.position=[1000,1000,0];
 for(let i=0;i<90;i++){s.save.world.time=2+i/60;ship.energy=70;s.updateTurrets(ship,ship.id,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetMissile?.id==='incoming'));
});
