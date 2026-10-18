import test from 'node:test';
import assert from 'node:assert/strict';
import {activationWeaponDamage,weaponDamage} from '../../src/game/weaponDamage.js';
import {SHIPS} from '../../src/game/data.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {SHIELD_RECHARGE_RATE,regenerateCombatResources} from '../../src/game/combatResources.js';
test('player and NPC use the same explicit capacities and hull regeneration',()=>{
 assert.equal(SHIELD_RECHARGE_RATE,5);
 for(const hull of Object.keys(SHIPS)){
  const p=getEffectiveShipStats({shipId:hull,equipment:[]}),npc=createEnemyLoadout({hullId:hull},0,{guns:[],turrets:[]});
  assert.equal(npc.stats.shield,p.shield,hull);
 }
 const p={shield:0,energy:100};regenerateCombatResources(p,{shield:100,energyCapacity:100,reactorOutput:0},1);assert.equal(p.shield,5);
});
test('first hit costs full energy; equal follow-ups cost a quarter within a fixed window',()=>{
 const actor={shield:100};
 const first=activationWeaponDamage(actor,100,20,{},0);actor.shield-=first.shield;
 const second=activationWeaponDamage(actor,100,20,{},.1);actor.shield-=second.shield;
 const third=activationWeaponDamage(actor,100,20,{},.24);actor.shield-=third.shield;
 assert.deepEqual([first.shield,second.shield,third.shield],[20,5,5]);
 assert.ok(Math.abs(third.activationRemaining-.01)<1e-9);
 assert.equal(activationWeaponDamage(actor,100,20,{},.25).shield,20);
});
test('stronger hits pay the upgrade; ordering simultaneous volleys gives identical cost',()=>{
 const cost=hits=>{const actor={shield:1000};return hits.reduce((sum,amount)=>{const hit=activationWeaponDamage(actor,1000,amount,{},0);actor.shield-=hit.shield;return sum+hit.shield;},0);};
 assert.equal(cost([20,100,40]),115);assert.equal(cost([100,40,20]),115);assert.equal(cost([40,20,100]),115);
 const actor={shield:1000};activationWeaponDamage(actor,1000,20,{},0);
 assert.equal(activationWeaponDamage(actor,1000,100,{},.1).shield,85);
});
test('sustained fire starts new full-cost windows; later hits never extend activation',()=>{
 const actor={shield:1000};
 const times=[0,.1,.2,.3,.4,.5,.6];
 assert.deepEqual(times.map(now=>activationWeaponDamage(actor,1000,20,{},now).shield),[20,5,5,20,5,5,20]);
 assert.equal(activationWeaponDamage(actor,1000,20,{},1).shield,20);
 assert.equal(activationWeaponDamage(actor,1000,20,{},0).shield,20,'clock reset clears transient state');
});
test('bypass, hull multipliers, capital shields and physical collisions stay unchanged',()=>{
 for(const weapon of [{shieldBypass:1},{shieldBypass:.5,hullMul:2},{shieldMul:2,hullMul:3}]){
  const actor={shield:100};
  const hit=activationWeaponDamage(actor,100,30,weapon,0);
  assert.deepEqual({shield:hit.shield,hull:hit.hull},weaponDamage(100,30,weapon));
 }
 const capital={shield:100,capitalClass:'frigate'};
 activationWeaponDamage(capital,100,20,{},0);
 assert.equal(activationWeaponDamage(capital,100,20,{},.1).shield,20);
 const actor={shield:100};activationWeaponDamage(actor,100,20,{},0);
 assert.deepEqual(activationWeaponDamage(actor,0,20,{},.1),weaponDamage(100,20));
 assert.deepEqual(activationWeaponDamage({shield:0},100,20,{},0),weaponDamage(0,20));
});
test('depleted shields stop protection and cannot hide a strong hit behind one shield point',()=>{
 const actor={shield:100};activationWeaponDamage(actor,100,50,{},0);actor.shield=1;
 const hit=activationWeaponDamage(actor,100,100,{},.1);
 assert.equal(hit.shield,1);assert.equal(hit.reduced,1);assert.equal(hit.hull,98);
 actor.shield=100;
 assert.equal(activationWeaponDamage(actor,100,20,{},.11).shield,20,'shield collapse ended the field');
});
test('shield multipliers affect activation strength; fully bypassing hits do not activate it',()=>{
 const actor={shield:1000};
 activationWeaponDamage(actor,1000,100,{shieldBypass:1},0);
 assert.equal(activationWeaponDamage(actor,1000,20,{shieldMul:2},.1).shield,40);
 assert.equal(activationWeaponDamage(actor,1000,20,{},.2).shield,5);
});
