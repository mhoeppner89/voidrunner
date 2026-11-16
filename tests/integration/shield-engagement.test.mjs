import test from 'node:test';
import assert from 'node:assert/strict';
import {weaponDamage} from '../../src/game/weaponDamage.js';
import {session} from '../helpers/session.mjs';
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
test('clustered and spaced hits apply identical damage through both live handlers',()=>{
 for(const kind of ['player','npc'])for(const times of [[0,0,0],[0,.1,.24],[0,1,2]]){
  const s=session();s.save.settings.easyMode=false;s.save.world.time=0;
  s.onExplorationActorHit=()=>{};s.onDistressActorHit=()=>{};
  const actor=kind==='player'?s.save.player:{id:'test',position:[0,0,0],captured:true,surrendered:true};
  Object.assign(actor,{shield:100,maxShield:100,hull:200,maxHull:200});
  for(const time of times){s.save.world.time=time;
   if(kind==='player')s.damagePlayer(20,'weapons fire',false,{kind:'laser'});
   else s.damageShip(actor,20,'npc',undefined,{kind:'laser'});
  }
  assert.equal(actor.shield,40,kind+': every hit costs its full shield damage');
  assert.equal(actor.hull,200);
 }
});
test('mixed simultaneous weapons preserve shield bypass and hull overflow',()=>{
 const run=(amounts)=>{
  const actor={shield:100,hull:200};
  for(const amount of amounts){const h=weaponDamage(actor.shield,amount);actor.shield-=h.shield;actor.hull-=h.hull;}
  return actor;
 };
 assert.deepEqual(run([20,100,40]),{shield:0,hull:140});
 assert.deepEqual(run([100,40,20]),run([20,100,40]));
 assert.deepEqual(weaponDamage(1,100),{shield:1,hull:99});
 assert.deepEqual(weaponDamage(100,20,{shieldBypass:.15}),{shield:17,hull:3});
 assert.deepEqual(weaponDamage(10,20,{hullMul:2}),{shield:10,hull:20});
});
