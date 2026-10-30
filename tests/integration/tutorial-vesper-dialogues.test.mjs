import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {GameSession} from '../../src/game/game.js';
import {hydrateSave} from '../../src/game/save.js';
import {normalizeEquipmentInventory} from '../../src/game/equipmentInventory.js';
import {ADVENTURE_DIALOGUES,dialogueText} from '../../src/game/adventureDialogues.js';

function dockFixture(step,save){
 const f=tutorialFixture(step,save),{session}=f,calls=[];
 session.save.player.dockedAt='vesper';session.ui.dockLocation='vesper';
 session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;
 session.ui.showStoryLine=(...args)=>{calls.push(args);session.ui.isModalOpen=true;};
 return {...f,calls,close(completed=true){session.finishTutorialBriefing(calls.at(-1)[3],completed);session.ui.isModalOpen=false;}};
}
test('Vesper arrival opens Rin once after the dock is ready, without performing a sale',()=>{
 const {session,quest,save,calls,close}=dockFixture('fly-vesper');save.player.cargo.food=16;
 session.handleTutorialEvent('docked',{locationId:'vesper'});assert.equal(quest.stepId,'sell-supplies');
 session.ui.dockLocation=undefined;session.showTutorialDockBriefing();assert.equal(calls.length,0);
 session.ui.dockLocation='vesper';session.ui.isModalOpen=true;session.refreshStoryLine();assert.equal(calls.length,0);
 session.ui.isModalOpen=false;session.refreshStoryLine();assert.equal(calls[0][3],'tutorial-vesper-arrival');
 session.refreshStoryLine();assert.equal(calls.length,1);assert.equal(save.player.cargo.food,16);
 close();session.refreshStoryLine();session.handleTutorialEvent('docked',{locationId:'vesper'});session.refreshStoryLine();assert.equal(calls.length,1);
 const resumed=dockFixture('sell-supplies',hydrateSave(JSON.parse(JSON.stringify(save))));resumed.session.refreshStoryLine();assert.equal(resumed.calls.length,0);
});
test('only the completed sale triggers the reactor dialogue and one owned gift in normal storage',()=>{
 const {session,quest,save,calls,close}=dockFixture('sell-supplies');save.player.cargo.food=16;
 session.showTutorialDockBriefing();close(false);session.refreshStoryLine();assert.equal(calls.length,1,'leaving a conversation does not loop it');
 session.trade('sell','food',1);assert.equal(quest.stepId,'sell-supplies');assert.equal(calls.length,1);assert.equal(quest.flags.reactorProvided,undefined);
 session.trade('sell','food',999);assert.equal(quest.stepId,'fit-upgrade');assert.equal(calls.length,2);assert.equal(calls[1][3],'tutorial-reactor-gift');
 normalizeEquipmentInventory(save.player);const gifts=()=>Object.values(save.player.inventory.items).filter(i=>i.baseId==='sustained-reactor');
 assert.equal(gifts().length,1);assert.deepEqual(gifts()[0].location,{kind:'station',stationId:'vesper'});
 assert.ok(!save.player.outfitting.loadouts[save.player.shipId].utility.includes(gifts()[0].id),'dialogue cannot install equipment');
 close();session.ensureTutorialEquipment();session.refreshStoryLine();assert.equal(calls.length,2);assert.equal(gifts().length,1);
 const resumed=dockFixture('fit-upgrade',hydrateSave(JSON.parse(JSON.stringify(save))));resumed.session.refreshStoryLine();assert.equal(resumed.calls.length,0);
});
test('pending Vesper lessons resume once, wait behind other modals and never appear elsewhere or in skipped careers',()=>{
 for(const step of ['sell-supplies','fit-upgrade']){
  const {session,quest,calls}=dockFixture(step);session.ui.dockLocation='helix';session.refreshStoryLine();assert.equal(calls.length,0);
  session.ui.dockLocation='vesper';session.ui.isModalOpen=true;session.refreshStoryLine();assert.equal(calls.length,0);
  session.ui.isModalOpen=false;session.refreshStoryLine();assert.equal(calls.length,1);
  session.ui.isModalOpen=false;quest.flags.skipped=true;delete quest.flags['briefingShown-'+(step==='sell-supplies'?'vesper-arrival':'reactor-gift')];session.refreshStoryLine();assert.equal(calls.length,1);
 }
});
test('the arrival and gift dialogues explain normal controls without transaction or navigation actions',()=>{
 for(const id of ['vesper-arrival','reactor-gift'])for(const node of Object.values(ADVENTURE_DIALOGUES[id].nodes))for(const c of node.choices??[]){assert.equal(c.action,undefined);assert.equal(c.tutorialChoice,undefined);}
 assert.match(dialogueText(ADVENTURE_DIALOGUES['vesper-arrival'].nodes.market.text,'en'),/Trade.*Protein.*SELL ALL/);
 assert.match(dialogueText(ADVENTURE_DIALOGUES['reactor-gift'].nodes.fitting.text,'en'),/Equipment.*STORAGE.*reactor upgrade.*INSTALL/i);
});
