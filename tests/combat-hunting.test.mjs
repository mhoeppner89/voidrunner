import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {fixture} from './combat-variety.test.mjs';
import {session} from './weapon-overhaul.test.mjs';
import {registerHitReaction,steerFlightTurn} from '../src/game/flightDynamics.js';
import {observeIncomingFire,updateCombatIntent,combatThrottle,combatTrackingRate} from '../src/game/combatPiloting.js';
import {SHIPS} from '../src/game/data.js';
import {WEAPONS} from '../src/game/weapons.js';
import {loadoutFor} from '../src/game/outfitting.js';
function pilot(tier){return {pilot:{tier},shield:75,maxShield:75,hull:138,energy:58,combatFit:{stats:SHIPS.talon},speed:76,afterburnSpeed:128,fuel:40,velocity:[0,0,50],aiRng:()=>.5};}

test('novices break on grazing PDC fire; trained pilots tolerate it but react to a dangerous burst',()=>{
 for(const tier of ['novice','veteran','ace']){
  const p=pilot(tier);for(let i=0;i<8;i++)registerHitReaction(p,i*.14,.33);
  updateCombatIntent(p,1.2,180,10);assert.equal(p.combatIntent,tier==='novice'?'evade':'hunt');
  registerHitReaction(p,2,45);const first=p.evasiveLatencyUntil;registerHitReaction(p,2.05,45);assert.equal(p.evasiveLatencyUntil,first);
  updateCombatIntent(p,2.4,180,10);assert.equal(p.combatIntent,tier==='novice'?'hunt':'evade');
 }
});
test('nearby unthreatened pilots hunt, use speed matching, and reserve breaks for clearance',()=>{
 const p=pilot('veteran');updateCombatIntent(p,0,90,10);assert.equal(p.attackPhase,'approach');
 const speed=combatThrottle(p,0,90,10,0,.95,235,true);assert.ok(speed>=p.speed*.6);assert.equal(p.burning,false);
 updateCombatIntent(p,1,600,5);assert.ok(combatThrottle(p,1,600,5,60,1,235,true)>p.speed);assert.equal(p.burning,true);
 combatThrottle(p,1.2,600,5,60,1,235,false);assert.equal(p.burning,false);
 updateCombatIntent(p,3,20,50);assert.equal(p.combatIntent,'reposition');updateCombatIntent(p,4.1,150,10);assert.equal(p.combatIntent,'hunt');
});
test('incoming fire is visible geometry: harmless flybys and covered shots do not trigger evasions',()=>{
 for(const covered of [false,true])for(const miss of [false,true]) {
  const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'});ship.velocity=[0,0,0];
  const slot=s.projStore.alloc();s.projStore.setPos(slot,miss?80:0,0,-100);s.projStore.setVel(slot,0,0,200);s.projectiles=[{id:'incoming',ownerId:'player',targetId:ship.id,slot,life:2,damage:90,weaponId:'mortar'}];s.lineBlocked=()=>covered;
  observeIncomingFire(s,ship);assert.equal(Boolean(ship.evasiveUntil),!covered&&!miss);
  if(!covered&&!miss){const pressure=ship.combatPressure;s.save.world.time=.21;observeIncomingFire(s,ship);assert.equal(ship.combatPressure,pressure,'same projectile is not counted on every scan');}
 }
});
test('NPC hits invoke the same damage-aware response as player hits',()=>{
 const s=fixture(),a=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'novice'}),b=s.spawnShip('patrol',[0,0,100]);a.noSurrender=true;
 s.damageShip(a,2.2,b.id,undefined,{id:'pdc',shieldMul:.15});assert.ok(a.evasiveUntil>0);
});
test('tracking anticipates moving firing solutions without exceeding normal turn authority',()=>{
 const stats=SHIPS.talon;let oldError=0,newError=0;
 const a=new THREE.Quaternion(),b=new THREE.Quaternion(),wa=new THREE.Vector3(),wb=new THREE.Vector3(),desired=new THREE.Quaternion(),ship={};
 for(let i=0;i<300;i++){
  desired.setFromAxisAngle(new THREE.Vector3(0,1,0),i/60*.3);
  const before=wb.clone();steerFlightTurn(a,wa,desired,stats,true,false,1/60);steerFlightTurn(b,wb,desired,stats,true,false,1/60,combatTrackingRate(ship,b,desired,1/60));
  const acceleration=wb.clone().multiplyScalar(Math.exp(stats.angularDamping/60)).sub(before);
  assert.ok(Math.max(Math.abs(acceleration.x),Math.abs(acceleration.y),Math.abs(acceleration.z))<=stats.angularAcceleration/60+1e-10);
  if(i>180){oldError+=a.angleTo(desired);newError+=b.angleTo(desired);}
 }
 assert.ok(newError<oldError*.5,{oldError,newError});
});
test('Sunlance costs half the energy and a paired salvo cannot erase a fresh Talon',()=>{
 const s=session(),p=s.save.player;p.shipId='vanguard';p.ownedShips=['vanguard'];const fit=loadoutFor(p);fit.guns=['mortar','mortar'];fit.fireGroups.activeGroup='ALL';p.outfitting.loadouts.vanguard=fit;p.energy=100;
 const victim={tutorialCompanion:true,position:[0,0,-100],hull:137,shield:58};let impacts=0;
 s.spawnPlayerGunProjectile=w=>{impacts++;s.damageShip(victim,w.damageFlat,'enemy',undefined,w);};
 s.fireMountedPlayerGuns();assert.equal(impacts,2);assert.equal(p.energy,68);assert.equal(victim.hull,137+58-2*WEAPONS.mortar.damageFlat);assert.equal(victim.shield,0);
 assert.equal(WEAPONS.mortar.cooldown,1.5);assert.equal(WEAPONS.mortar.energyCost,16);
});
