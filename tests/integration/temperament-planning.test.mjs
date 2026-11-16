import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {planCombatFlight} from '../../src/game/combatPlanning.js';
import {WEAPONS,weaponRange} from '../../src/game/weapons.js';

const zero=new THREE.Vector3(),forward=new THREE.Vector3(0,0,-1);
function setup(temperament){
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,200],undefined,undefined,{tier:'veteran',temperament},{hullId:'talon'});
 s.save.world.time=1;ship.targetId='player';ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
 s.npcFlightStats(ship);ship.combatFit.profile.range=150;ship.combatFit.weapons=['pulse'];
 ship.combatFit.weaponDefinitions=[WEAPONS.pulse];ship.combatFit.fireAt=[0];ship.combatWeaponIndex=0;ship.fireRange=450;
 return {s,ship};
}
const plan=(f,velocity=zero)=>planCombatFlight(f.s,f.ship,zero,velocity,forward,Math.hypot(...f.ship.position),0);

test('personality changes engagement and shot commitment without changing hull capabilities',()=>{
 const results={};
 for(const nature of ['timid','steady','aggressive','flamboyant']){
  const f=setup(nature),stats=JSON.stringify(f.ship.combatFit.stats),p=plan(f);
  results[nature]={range:p.preferredRange,commit:f.ship.fireCommitUntil-1,risk:f.ship.fireCommitDamageLimit,clearance:p.clearance};
  assert.equal(JSON.stringify(f.ship.combatFit.stats),stats);
  assert.ok(results[nature].commit>0,'all temperaments take an available safe shot');
 }
 assert.ok(results.timid.range>results.steady.range&&results.steady.range>results.aggressive.range);
 assert.ok(results.timid.commit<results.steady.commit&&results.steady.commit<results.aggressive.commit);
 assert.ok(results.timid.risk<results.steady.risk&&results.steady.risk<results.aggressive.risk);
 assert.ok(Math.max(...Object.values(results).map(r=>r.clearance))-Math.min(...Object.values(results).map(r=>r.clearance))<1,'nature does not remove hull separation');
});

test('cautious pursuit remains inside its own effective firing range against a moving target',()=>{
 const f=setup('timid');f.ship.combatFit.profile.range=320;f.ship.fireRange=350;
 const p=plan(f,new THREE.Vector3(80,0,-20));
 const effective=Math.min(weaponRange(WEAPONS.pulse),f.ship.fireRange*f.ship.pilot.fireRangeMul);
 assert.ok(p.engagementRange<effective&&p.preferredRange<=effective*.82+1e-8);
 assert.ok(p.preferredRange>p.clearance,'still leaves useful room to turn');
});

test('timid pilots protect shields sooner, prefer nearby cover, and retain the bounded recovery rules',()=>{
 for(const nature of ['timid','steady','aggressive']){
  const f=setup(nature);f.ship.shield=f.ship.maxShield*.3;f.ship.rotation=[0,1,0,0];f.ship.velocity=[0,0,60];
  const p=plan(f);assert.equal(p.recovery.active,nature==='timid',nature);
 }
 for(const nature of ['timid','steady','aggressive']){
  const f=setup(nature);f.ship.shield=8;f.ship.shieldDelay=4.5;f.ship.rotation=[0,1,0,0];f.ship.velocity=[0,0,60];
  f.s.obstacles=[{id:'cover',x:120,y:0,z:160,radius:60,collisionRadius:60,losRadius:60}];
  const p=plan(f),r=p.recovery;assert.equal(r.active,true);
  assert.equal(r.mode,nature==='timid'?'cover':'range');assert.ok(r.until-r.started<=14);
  f.s.save.world.time=r.until+.3;plan(f);assert.equal(r.active,false);
  f.s.save.world.time=r.readyAt+1;plan(f);assert.equal(r.active,false,'a veteran cannot endlessly reset the same fight');
 }
});
