import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {makeCareerWreck,combatWreckNode,recoverWreckEntry,equipCareerItems} from '../../src/game/careerLoot.js';
import {OUTFIT_ITEMS} from '../../src/game/outfitting.js';
import {hydrateSave} from '../../src/game/save.js';
import {GameSession} from '../../src/game/game.js';

const pirate=seed=>{const f=tutorialFixture('defeat-raider');f.save.world.seed=seed;f.save.player.dockedAt=undefined;f.enemy=f.session.ensureTutorialEnemy();return f;};
test('the first pirate carries a real green tier I missile launcher that always survives, independent of kill credit',()=>{
 for(let seed=1;seed<=12;seed++){
  const {session,enemy,save,quest}=pirate(seed),record=enemy.equipmentRecords.find(e=>e.item.id===enemy.guaranteedLootId);
  assert.ok(record);assert.equal(record.key,'launchers');assert.equal(record.item.baseId,'seeker-launcher');assert.equal(enemy.combatFit.launchers[record.index],record.item.id);
  assert.equal(record.item.tier,1);assert.equal(record.item.rarity,'uncommon');assert.equal(record.item.affixes.length,1);
  assert.equal(OUTFIT_ITEMS[record.item.id].rarity,'uncommon');
  const wreck=makeCareerWreck(session,enemy),entry=wreck.contents.find(e=>e.id===record.item.id);assert.ok(entry);assert.equal(entry.item.factory,false);assert.equal(wreck.contents.length,1,'only the launcher survives this tutorial encounter');
  assert.equal(makeCareerWreck(session,enemy),null,'destruction resolves only once');enemy.hull=0;
  const briefings=[];session.playTutorialBriefing=id=>briefings.push(id);
  session.handleTutorialEvent('ship-defeated',{tutorialEncounter:'mining',tutorialIndex:0,attackerId:seed%2?'player':'rin',wreckId:wreck.id});
  assert.equal(quest.stepId,'land-mining');assert.equal(quest.flags.tutorialLootWreckId,wreck.id);assert.deepEqual(briefings,['loot']);
  const restored=hydrateSave(JSON.parse(JSON.stringify(save))),saved=restored.world.combatWrecks[wreck.id].contents.find(e=>e.id===entry.id);
  assert.deepEqual(saved.item,entry.item);assert.equal(restored.quests.find(q=>q.id===quest.id).flags['defeated-mining-0'],true);
 }
});
test('guaranteed loot uses unscanned, capacity-limited, one-time wreck recovery',()=>{
 const {session,enemy,save}=pirate(91),wreck=makeCareerWreck(session,enemy),entry=wreck.contents.find(e=>e.id===enemy.guaranteedLootId),node=combatWreckNode(wreck);
 session.wreckNodes.push(node);save.player.position.splice(0,3,...wreck.position);
 assert.equal(node.scanned,false,'fly-over recovery does not require selection or scanning');
 save.player.cargo.ore=1000;assert.equal(recoverWreckEntry(session,wreck.id,entry.id).ok,false);assert.ok(wreck.contents.includes(entry));
 save.player.cargo.ore=0;assert.equal(recoverWreckEntry(session,wreck.id,entry.id).ok,true);
 assert.equal(save.player.inventory.items[entry.id].location.kind,'cargo');assert.equal(save.player.inventory.items[entry.id].tier,1);assert.equal(save.player.inventory.items[entry.id].rarity,'uncommon');
 assert.equal(recoverWreckEntry(session,wreck.id,entry.id).ok,false);
});
test('non-career modes cannot receive the tutorial guarantee',()=>{
 for(const arena of [{},{run:true},{observer:true}]){
  const {session}=tutorialFixture('defeat-raider');session.arena=arena;
  const ship={combatFit:{guns:['pulse-cannon']},position:[0,0,0]};equipCareerItems(session,ship,{tutorialMiningPirate:true});
  assert.equal(ship.guaranteedLootId,undefined);assert.equal(makeCareerWreck(session,ship),null);
 }
});
test('Rin’s loot lesson restores while its wreck exists and does not repeat once read',()=>{
 const {session,enemy,save,quest}=pirate(31),wreck=makeCareerWreck(session,enemy),calls=[];enemy.hull=0;
 session.handleTutorialEvent('ship-defeated',{tutorialEncounter:'mining',tutorialIndex:0,wreckId:wreck.id});
 session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;session.ui.showStoryLine=(...a)=>calls.push(a);
 session.restoreTutorialRuntime();session.restoreTutorialRuntime();assert.equal(calls.length,1);assert.equal(calls[0][3],'tutorial-loot');
 session.finishTutorialBriefing('tutorial-loot',true);session.restoreTutorialRuntime();assert.equal(calls.length,1);assert.equal(quest.flags['briefingRead-loot'],true);
 assert.ok(save.world.combatWrecks[wreck.id]);
});
