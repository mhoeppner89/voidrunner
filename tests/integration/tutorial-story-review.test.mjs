import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {GameSession} from '../../src/game/game.js';
import {GameUI} from '../../src/game/ui.js';
import {ADVENTURE_DIALOGUES} from '../../src/game/adventureDialogues.js';
import {tutorialConversation,tutorialDialogue} from '../../src/game/tutorialCampaign.js';
import {hydrateSave} from '../../src/game/save.js';

test('additional Protein purchases update the entire tutorial delivery without auto-selling it',()=>{
 const {session,quest,save}=tutorialFixture('buy-supplies');
 assert.equal(session.trade('buy','food',16).quantity,16);assert.equal(quest.stepId,'launch-helix');
 assert.equal(session.trade('buy','food',1).quantity,1);assert.equal(quest.flags.deliveryRequired,17);
 save.player.dockedAt='vesper';quest.stepId='sell-supplies';
 session.trade('sell','food',16);assert.equal(quest.stepId,'sell-supplies');assert.equal(save.player.cargo.food,1);
 session.trade('sell','food',1);assert.equal(quest.stepId,'fit-upgrade');
});
test('launch, fitted-reactor and mining-return introductions wait for their real screen and only appear once',()=>{
 for(const [step,port,id]of [['launch-helix','helix','cargo-ready'],['mining-contract','vesper','reactor-ready'],['salvage-briefing','vesper','mining-return']]){
  const {session,save,quest}=tutorialFixture(step),calls=[];save.player.dockedAt=port;session.ui.dockLocation=port;session.playTutorialBriefing=id=>calls.push(id);
  session.ui.isModalOpen=true;session.showTutorialDockBriefing();assert.equal(calls.length,0);
  session.ui.isModalOpen=false;save.world.missionSettlements=[{id:'pending'}];session.showTutorialDockBriefing();assert.equal(calls.length,0);
  save.world.missionSettlements=[];session.showTutorialDockBriefing();session.showTutorialDockBriefing();assert.deepEqual(calls,[id]);
  const resumed=tutorialFixture(step,hydrateSave(JSON.parse(JSON.stringify(save))));resumed.session.ui.dockLocation=port;resumed.session.playTutorialBriefing=()=>assert.fail('repeated introduction');resumed.session.showTutorialDockBriefing();
  assert.equal(quest.stepId,step,'dialogue does not complete the actual task');
 }
});
test('a heard mining/salvage lesson and an accepted escort offer become short reminders',()=>{
 const {save,quest}=tutorialFixture('mining-contract');assert.equal(tutorialConversation(save,'rin-vek','vesper'),'mining');quest.flags.miningExplained=true;assert.equal(tutorialConversation(save,'rin-vek','vesper'),undefined);assert.match(tutorialDialogue(save,'rin-vek'),/mission board.*accept/);
 quest.stepId='fit-pdc';assert.equal(tutorialConversation(save,'rin-vek','vesper'),undefined);assert.match(tutorialDialogue(save,'rin-vek'),/EQUIPMENT.*PDC drone.*Drone bay 1/);
 quest.stepId='launch-black-box';quest.flags.paulInvited=true;assert.equal(tutorialConversation(save,'paul','cairn'),undefined);assert.match(tutorialDialogue(save,'paul'),/repair drones are ready/);
});
test('story dialogue teaches normal interfaces and automatic recall without trading/fitting/contract shortcuts',()=>{
 for(const [id,script]of Object.entries(ADVENTURE_DIALOGUES))for(const node of Object.values(script.nodes))for(const c of node.choices??[]){assert.equal(c.action,undefined,id);assert.ok(!c.tutorialChoice||c.tutorialChoice==='invite-paul',id);}
 assert.doesNotMatch(JSON.stringify(ADVENTURE_DIALOGUES),/Recall every drone|Drohnen zurückrufen/);
 assert.match(ADVENTURE_DIALOGUES.rin.nodes.trade.text.en,/MARKET.*COMMODITY MARKET.*BUY MAX/);
 assert.match(ADVENTURE_DIALOGUES.mining.nodes.contract.text.en,/MISSION BOARD.*ACCEPT/);
 assert.match(ADVENTURE_DIALOGUES.salvage.nodes.fitting.text.en,/EQUIPMENT.*PDC drone.*Drone bay 1/);
 assert.doesNotMatch(ADVENTURE_DIALOGUES.mara.nodes.work.text.en,/BUY MAX/);
});
test('Mara’s milestone dialogue is visible docked and is queued until danger passes in flight',()=>{
 const {session,save,quest}=tutorialFixture('earn-standing'),calls=[];save.player.credits=100000;
 session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;
 session.ui.showStoryLine=(...a)=>calls.push(a);session.queueTutorialMaraCall();assert.equal(quest.stepId,'meet-cairn');assert.equal(calls[0][0],'Mara Vek');assert.equal(calls[0][3],'tutorial-mara-cairn');
 const f=tutorialFixture('earn-standing');f.save.player.credits=100000;f.save.player.dockedAt=undefined;f.session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;f.session.hostilesVisibleNear=()=>true;
 f.session.queueTutorialMaraCall();assert.equal(f.session.pendingStoryConversations[0].conversationId,'tutorial-mara-cairn');
 // Landing before the queued call clears allows the dock introduction to recover it.
 f.save.player.dockedAt='helix';f.session.ui.dockLocation='helix';f.session.refreshStoryLine();f.session.hostilesVisibleNear=()=>false;f.session.ui.showStoryLine=(...a)=>calls.push(a);f.session.refreshStoryLine();assert.equal(calls.at(-1)[3],'tutorial-mara-cairn');
});
test('mining coaching respects the real drone deployment range before asking for input',()=>{
 const {session,save,quest}=tutorialFixture('mine-shardbelt');save.player.dockedAt=undefined;session.activeInstanceId='shardbelt';
 const node=session.asteroids.find(n=>n.remaining>0);quest.flags.oreTargetId=node.id;node.scanned=true;save.player.currentTargetId=node.id;save.player.position=[node.position[0]+200,node.position[1],node.position[2]];
 session.miningDroneActionState=()=>({code:'out-of-range',range:100});assert.match(session.tutorialFlightGuidance().text,/within 100 km/);
 session.miningDroneActionState=()=>({code:'can-deploy',range:100});assert.match(session.tutorialFlightGuidance().text,/press M on desktop/);
});
test('re-entering Equipment clears a stale item detail without auto-selecting or installing another item',()=>{
 const ui=Object.create(GameUI.prototype),{save}=tutorialFixture('fit-pdc');ui.save=save;ui.dockLocation=save.player.dockedAt='vesper';ui.inventoryItemId='old-reactor';ui.inventoryMountId='old-mount';ui.inventoryFitExplicit=true;ui.renderDock=()=>{};
 ui.openMarketPoint('equipment');assert.equal(ui.inventoryItemId,undefined);assert.equal(ui.inventoryMountId,undefined);assert.equal(ui.inventoryFitExplicit,false);
});

test('Paul introduces sensor cover at the carrier without waiting for the approaching patrol to disappear',()=>{
 const {session,quest}=tutorialFixture('hide-patrol'),calls=[];session.save.player.dockedAt=undefined;session.hostilesVisibleNear=()=>true;session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;session.ui.showStoryLine=(...a)=>calls.push(a);session.playTutorialBriefing('paul-hide');assert.equal(calls[0][0],'Paul');assert.equal(calls[0][3],'tutorial-paul-hide');assert.equal(session.pendingStoryConversations,undefined);assert.equal(quest.flags['briefingShown-paul-hide'],true);
});

test('investing while docked can trigger Mara’s call, but it waits for a settlement receipt to close',()=>{
 const {session,save,quest}=tutorialFixture('earn-standing'),calls=[];save.player.credits=100000;session.ui.dockLocation=save.player.dockedAt='helix';session.playTutorialBriefing=id=>calls.push(id);save.world.missionSettlements=[{id:'receipt'}];session.refreshStoryLine();assert.equal(quest.stepId,'earn-standing');save.world.missionSettlements=[];session.refreshStoryLine();assert.equal(quest.stepId,'meet-cairn');assert.deepEqual(calls,['mara-cairn']);
});

test('Rin’s combat lesson opens immediately beside the pirate and is remembered after completion',()=>{
 const {session,save,quest}=tutorialFixture('defeat-raider'),calls=[];save.player.dockedAt=undefined;
 session.hostilesVisibleNear=()=>true;session.flightDialogueAfter=1000;
 session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;session.ui.showStoryLine=(...args)=>calls.push(args);
 session.playTutorialBriefing('combat');session.playTutorialBriefing('combat');
 assert.equal(calls.length,1);assert.equal(calls[0][3],'tutorial-combat');assert.equal(session.storyLineUntil,Infinity);
 assert.equal(session.pendingStoryConversations,undefined,'the nearby pirate cannot delay his own combat lesson');
 assert.match(ADVENTURE_DIALOGUES.combat.nodes.weapons.text.en,/Space.*fire pad.*energy/);
 for(const phrase of [/Y.*wing card/,/defensive.*covering fire/i,/aggressive.*more help/i,/break off/])assert.match(ADVENTURE_DIALOGUES.combat.nodes.wing.text.en,phrase);
 session.finishTutorialBriefing('tutorial-combat',true);assert.equal(quest.flags['briefingRead-combat'],true);
 session.playTutorialBriefing('combat');assert.equal(calls.length,1);assert.equal(quest.stepId,'defeat-raider');
 const resumed=tutorialFixture('defeat-raider',hydrateSave(JSON.parse(JSON.stringify(save))));resumed.session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;resumed.session.ui.showStoryLine=()=>assert.fail('completed combat lesson repeated');resumed.session.playTutorialBriefing('combat');
});

test('resuming an unfinished first-combat briefing restores it once, including older stuck saves',()=>{
 for(const alreadyShown of [false,true]){
  const {save,quest}=tutorialFixture('defeat-raider');save.player.dockedAt=undefined;quest.flags['briefingShown-combat']=alreadyShown;
  const resumed=tutorialFixture('defeat-raider',hydrateSave(JSON.parse(JSON.stringify(save)))),calls=[];
  resumed.session.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;resumed.session.ui.showStoryLine=(...a)=>calls.push(a);
  resumed.session.hostilesVisibleNear=()=>true;resumed.session.restoreTutorialRuntime();resumed.session.restoreTutorialRuntime();
  assert.equal(calls.length,1);assert.equal(calls[0][3],'tutorial-combat');assert.equal(resumed.session.ships.filter(s=>s.tutorialEncounter==='mining').length,1);
  resumed.session.finishTutorialBriefing('tutorial-combat',true);resumed.session.restoreTutorialRuntime();assert.equal(calls.length,1);
 }
});
