import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {npcTriggerReady} from '../../src/game/npcGunnery.js';
import {WEAPONS} from '../../src/game/weapons.js';

function engagement(tier='veteran') {
 const s=fixture();s.arena={observer:true};
 const pilot=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier,temperament:'steady'},{hullId:'talon'});
 pilot.observerTeam='red';pilot.faction='pirates';pilot.rotation=[0,0,0,1];
 const first=s.spawnShip('patrol',[0,0,-250]);
 const second=s.spawnShip('patrol',[0,0,-251]);
 for(const attacker of [first,second]){attacker.observerTeam='blue';attacker.faction='concord';attacker.targetId=pilot.id;}
 pilot.targetId=first.id;
 return {s,pilot,first,second};
}

test('near-equal attackers do not reset a trained pilot’s lock or precision shot settling',()=>{
 const {s,pilot,first,second}=engagement();
 const fit=pilot.combatFit;
 fit.guns=['gauss-cannon'];fit.gunIndices=[0];fit.weapons=['gauss'];fit.weaponDefinitions=[WEAPONS.gauss];fit.fireAt=[0];fit.attackOrder=[0];
 pilot.combatWeaponIndex=0;pilot.energy=100;
 const forward=new THREE.Vector3(0,0,-1);
 let readyAt;
 for(let tick=0;tick<30;tick++){
  s.save.world.time=tick/60;
  first.position[2]=-250-(tick%2);second.position[2]=-251+(tick%2);
  s.resolveShipTarget(pilot);
  assert.equal(pilot.targetId,first.id,'a one-unit range change is not a useful reason to abandon the shot');
  if(npcTriggerReady(pilot,WEAPONS.gauss,1,s.save.world.time)){
   readyAt??=s.save.world.time;s.fireNpcGun(pilot,forward);
  }
 }
 assert.ok(readyAt>=.12&&readyAt<.15,'the normal veteran settling time still applies');
 assert.equal(s.projectiles.length,1);
 assert.equal(s.projectiles[0].weaponId,'gauss');
 assert.equal(s.projectiles[0].targetId,first.id);
});

test('a materially closer attacker or a real recent threat overrides the old lock',()=>{
 const {s,pilot,first,second}=engagement();
 second.position[2]=-150;s.resolveShipTarget(pilot);
 assert.equal(pilot.targetId,second.id);
 first.position[2]=-600;pilot.combatThreatId=first.id;pilot.combatThreatUntil=s.save.world.time+2;
 s.resolveShipTarget(pilot);
 assert.equal(pilot.targetId,first.id);assert.equal(pilot.npcTargetReason,'threat');
});

test('a destroyed or surrendered attacker is replaced immediately',()=>{
 for(const state of ['destroyed','surrendered']){
  const {s,pilot,first,second}=engagement();
  s.resolveShipTarget(pilot);
  if(state==='destroyed')first.hull=0;else first.surrendered=true;
  s.resolveShipTarget(pilot);
  assert.equal(pilot.targetId,second.id,state);
 }
});

test('target snapshots reuse their objects without aliasing live transforms or other pilots',()=>{
 const {s,pilot,first}=engagement();
 first.velocity=[2,3,4];
 const initial=s.resolveShipTarget(pilot),position=initial.position,velocity=initial.velocity;
 const peer=s.spawnShip('pirate',[40,0,0],undefined,undefined,{tier:'veteran'});
 peer.observerTeam='red';peer.faction='pirates';peer.targetId=first.id;
 const other=s.resolveShipTarget(peer);
 assert.notEqual(other,initial);assert.notEqual(other.position,position);assert.notEqual(other.velocity,velocity);
 position.set(900,800,700);velocity.set(600,500,400);
 assert.deepEqual(first.position,[0,0,-250]);assert.deepEqual(first.velocity,[2,3,4]);
 assert.deepEqual(pilot.position,[0,0,0]);assert.deepEqual(other.position.toArray(),[0,0,-250]);
 first.position[0]=3;first.velocity[1]=8;
 const refreshed=s.resolveShipTarget(pilot);
 assert.equal(refreshed,initial);assert.equal(refreshed.position,position);assert.equal(refreshed.velocity,velocity);
 assert.deepEqual(position.toArray(),[3,0,-250]);assert.deepEqual(velocity.toArray(),[2,8,4]);
 assert.deepEqual(other.position.toArray(),[0,0,-250],'another pilot keeps its own snapshot until sampled again');
});

test('player and hired-wingmate target paths use reusable isolated snapshots',()=>{
 const s=fixture(),pilot=s.spawnShip('pirate',[0,0,200],undefined,undefined,{tier:'veteran'});
 s.save.player.dockedAt=undefined;s.shipTracksPlayer=()=>true;pilot.targetId='player';
 const initial=s.resolveShipTarget(pilot);
 s.save.player.position[0]=50;s.save.player.velocity[0]=12;
 assert.equal(s.resolveShipTarget(pilot),initial);assert.equal(initial.position.x,50);assert.equal(initial.velocity.x,12);
 initial.position.set(0,0,0);initial.velocity.set(0,0,0);
 assert.equal(s.save.player.position[0],50);assert.equal(s.save.player.velocity[0],12);
 const wing=s.spawnShip('patrol',[0,20,0]);wing.arenaRunWingman=true;wing.wingmanTargetId=pilot.id;
 const wingTarget=s.resolveShipTarget(wing);pilot.position[0]=25;
 assert.equal(s.resolveShipTarget(wing),wingTarget);assert.equal(wingTarget.position.x,25);
 assert.notEqual(wingTarget,initial);assert.notEqual(wingTarget.position,initial.position);
});

test('patrol last-seen snapshots clear velocity and never reveal the hidden target’s new position',()=>{
 const s=fixture(),patrol=s.spawnShip('patrol',[0,0,0]),enemy=s.spawnShip('pirate',[0,0,100]);
 patrol.hostile=false;enemy.hostile=true;enemy.velocity=[3,2,1];s.canSee=()=>true;
 const visible=s.resolveShipTarget(patrol);
 assert.deepEqual(visible.velocity.toArray(),[3,2,1]);
 s.canSee=()=>false;s.shipTracksPlayer=()=>false;s.save.world.time+=.2;
 enemy.position=[500,400,300];enemy.velocity=[100,50,25];
 const remembered=s.resolveShipTarget(patrol);
 assert.equal(remembered,visible);assert.equal(patrol.patrolMemoryActive,true);
 assert.deepEqual(remembered.position.toArray(),[0,0,100]);assert.deepEqual(remembered.velocity.toArray(),[0,0,0]);
 remembered.position.set(900,900,900);
 assert.deepEqual(patrol.patrolMemory.position,[0,0,100]);assert.deepEqual(enemy.position,[500,400,300]);
});
