import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {TUTORIAL_STEPS,TUTORIAL_FLIGHT_LESSONS,tutorialPeople,tutorialConversation,tutorialCardContent} from '../../src/game/tutorialCampaign.js';
import {DE_CATALOG} from '../../src/game/i18n-de.js';
import {GameUI} from '../../src/game/ui.js';
import {hydrateSave} from '../../src/game/save.js';

test('every campaign objective, chapter and control lesson has German copy',()=>{for(const step of Object.values(TUTORIAL_STEPS))for(const key of ['objective','detail','chapterTitle'])assert.ok(DE_CATALOG[step[key]],step[key]);for(const lesson of TUTORIAL_FLIGHT_LESSONS)for(const key of ['objective','detail'])assert.ok(DE_CATALOG[lesson[key]],lesson[key]);});
test('story contacts are present at their actual teaching ports, including optional Paul at Cairn',()=>{const {save,quest}=tutorialFixture('mining-contract');assert.deepEqual(tutorialPeople(save,'vesper').map(p=>p.id),['rin-vek']);assert.equal(tutorialConversation(save,'rin-vek','vesper'),'mining');quest.stepId='rin-cairn';assert.deepEqual(tutorialPeople(save,'cairn').map(p=>p.id),['rin-vek','paul']);assert.equal(tutorialConversation(save,'paul','cairn'),'paul-offer');quest.stepId='earn-standing';assert.equal(tutorialPeople(save,'vesper').length,0);});
test('the black-box marker is beside the frigate, remains selectable outside sensor range and survives reload',()=>{
 const {save,quest,session}=tutorialFixture('salvage-black-box');save.player.dockedAt=undefined;const node=session.ensureTutorialFieldTarget();assert.ok(node);assert.equal(node.zone,'frigate-alpha');assert.equal(node.insideWreckId,undefined);assert.equal(save.player.currentTargetId,node.id);
 const other=tutorialFixture('salvage-black-box',hydrateSave(JSON.parse(JSON.stringify(save))));const restored=other.session.ensureTutorialFieldTarget();assert.equal(restored.id,node.id);assert.equal(other.quest.flags.blackBoxTargetId,quest.flags.blackBoxTargetId);
});
test('the recorder becomes sealed mission cargo and only Mara consumes it',()=>{
 const {save,quest,session}=tutorialFixture('black-box-fight');const node=session.wreckNodes.find(n=>n.zone==='frigate-alpha');quest.flags.blackBoxTargetId=node.id;save.player.cargo[node.salvage]=1;
 session.applyTutorialTransition({stepId:'black-box-fight'});assert.equal(save.player.sealedCargo.filter(c=>c.missionId==='tutorial-black-box').length,1);session.applyTutorialTransition({stepId:'black-box-fight'});assert.equal(save.player.sealedCargo.length,1);
 quest.stepId='decode-black-box';save.player.dockedAt='helix';session.talkToNpc('mara-vek');assert.equal(quest.stepId,'complete');assert.equal(save.player.sealedCargo.length,0);assert.equal(quest.flags.blackBoxDelivered,true);
});
test('the mission board shows the normal training contract and offers ordinary work during the earning break',()=>{
 const {save,quest,session}=tutorialFixture('mining-contract');save.player.dockedAt='vesper';session.ensureTutorialMiningContract();const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation='vesper';assert.deepEqual(ui.missionBoardSource().map(m=>m.id),['tutorial-vesper-mining']);assert.equal(ui.missionBoardCounts().offers.length,1);assert.equal((ui.renderMissions().match(/data-mission-select=/g)??[]).length,1);quest.stepId='earn-standing';quest.flags.openWorld=true;assert.ok(ui.missionBoardSource().length>1);
});


test('all Story cards have concise translated present-task copy; the opening contains only the requested two lines',()=>{
 const {save,quest}=tutorialFixture();
 for(const id of Object.keys(TUTORIAL_STEPS)){quest.stepId=id;const card=tutorialCardContent(save);assert.equal(card.stepId,id);assert.ok(DE_CATALOG[card.objective],id);if(card.instruction)assert.ok(DE_CATALOG[card.instruction],id);assert.notEqual(card.objective,card.instruction,id);assert.ok((card.objective+' '+card.instruction).split(/\s+/).length<=30,id);}
 quest.stepId='meet-family';const card=tutorialCardContent(save);assert.equal(DE_CATALOG[card.objective],'Triff Mara und Rin in der Bar.');assert.equal(DE_CATALOG[card.instruction],"Tippe auf STORY, um diese Hinweise zu sehen.");
 const ui=Object.create(GameUI.prototype);ui.save=save;const html=ui.renderShipTutorial();assert.doesNotMatch(html,/CHAPTER|chapter-track|before buying|Spare Key|FAMILY PROLOGUE/);assert.match(html,/Meet Mara and Rin in the bar/);
});
test('mining and hiding cards expose the current action without announcing the next task',()=>{
 const {save,quest}=tutorialFixture('mining-contract');assert.match(tutorialCardContent(save).objective,/Talk to Rin/);assert.doesNotMatch(tutorialCardContent(save).objective+' '+tutorialCardContent(save).instruction,/accept|contract/i);quest.flags.miningExplained=true;assert.match(tutorialCardContent(save).objective,/Accept the marked/);
 quest.stepId='hide-patrol';save.player.transponder=true;assert.match(tutorialCardContent(save).objective,/transponder/);assert.doesNotMatch(tutorialCardContent(save).instruction,/hangar/);save.player.transponder=false;assert.match(tutorialCardContent(save).objective,/hangar/);
});
