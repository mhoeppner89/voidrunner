import test from 'node:test';
import assert from 'node:assert/strict';
import {RUN_WAVES} from '../../src/game/arenaRun.js';
import {battleState} from '../../src/game/arenaBattle.js';

test('each level stays within its authored group budget',()=>{
 for(const [index,wave] of RUN_WAVES.entries()){
  const level=index+1;
  const cap=level===1?2:3;
  assert.ok(wave.groups.length<=cap,`Level ${level} has ${wave.groups.length} groups (maximum ${cap})`);
 }
});

test('every authored group fits its act, including hard-mode promotions',()=>{
 for(const [index,wave] of RUN_WAVES.entries())for(const hard of [false,true]){
  const battle=battleState(wave,index,hard);
  for(const group of battle.groups){
   const fighters=group.enemies.filter(e=>!e.capital);
   assert.ok(fighters.length<=battle.limit,wave.name);
   assert.ok(fighters.filter(e=>e.tier==='ace').length<=battle.aceLimit,wave.name);
  }
 }
 assert.equal(RUN_WAVES.at(-1).enemies[0].role,'frigate');
});
