import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {advanceTutorialCampaign,getTutorialQuest,tutorialContentUnlocked,tutorialGateOpen,tutorialLaunchBlock,TUTORIAL_FLIGHT_LESSONS,TUTORIAL_STEPS,skipTutorialCampaign,migrateTutorialCampaign} from '../../src/game/tutorialCampaign.js';
const fixture=()=>{const save=createNewSave(91,{tutorial:true});return {save,q:getTutorialQuest(save),go:event=>advanceTutorialCampaign(save,event)};};
for(const invite of [false,true])test(`complete campaign follows the agreed sequence (Paul invited: ${invite})`,()=>{
 const {save,q,go}=fixture();const step=expected=>assert.equal(q.stepId,expected);
 go({type:'talked',personId:'rin-vek',locationId:'helix'});step('meet-family');go({type:'talked',personId:'mara-vek',locationId:'helix'});step('buy-supplies');
 go({type:'traded',kind:'buy',commodityId:'food',locationId:'helix',cargoAfter:16});step('launch-helix');
 go({type:'launched',fromLocationId:'helix',foodCargo:16});go({type:'map-selected',kind:'location',id:'vesper'});step('flight-checks');
 for(const lesson of TUTORIAL_FLIGHT_LESSONS)go({type:'flight-lesson',id:lesson.id});step('fly-vesper');go({type:'docked',locationId:'vesper'});
 go({type:'traded',kind:'sell',commodityId:'food',locationId:'vesper',quantity:16});step('fit-upgrade');go({type:'outfitted',locationId:'vesper',reactorInstalled:true});step('mining-contract');
 assert.equal(go({type:'mission-accepted',missionId:'tutorial-vesper-mining'}).changed,false);go({type:'talked',personId:'rin-vek',locationId:'vesper'});go({type:'mission-accepted',missionId:'tutorial-vesper-mining'});step('mine-shardbelt');
 q.flags.oreTargetId='training';go({type:'extracted',source:'mining',nodeId:'training',instanceId:'shardbelt',amount:6});step('return-mining');go({type:'hyperdrive-intercept'});step('raider-standoff');go({type:'standoff-ended'});step('defeat-raider');
 go({type:'ship-defeated',tutorialEncounter:'mining'});step('land-mining');go({type:'docked',locationId:'vesper'});go({type:'talked',personId:'rin-vek',locationId:'vesper'});step('fit-pdc');
 go({type:'drone-configured',locationId:'vesper',mode:'pdc',loaded:true});step('survey-graveyard');assert.equal(q.flags.rinDeparted,true);
 go({type:'waypoint-reached'});go({type:'waypoint-reached'});go({type:'waypoint-reached',rescue:true});step('rescue-paul');go({type:'encounter-cleared',encounter:'rescue'});step('talk-paul');go({type:'conversation-completed',id:'paul-rescue'});
 go({type:'waypoint-reached'});go({type:'waypoint-reached',last:true});step('carrier-wait');go({type:'patrol-arrived'});step('hide-patrol');go({type:'patrol-passed'});go({type:'docked',locationId:'helix'});step('mara-debrief');
 go({type:'talked',personId:'mara-vek',locationId:'helix'});step('earn-standing');assert.equal(tutorialContentUnlocked(save),true);assert.equal(tutorialGateOpen(save),false);
 go({type:'mara-call'});step('meet-cairn');go({type:'docked',locationId:'cairn'});go({type:'talked',personId:'rin-vek',locationId:'cairn'});step('launch-black-box');assert.equal(tutorialGateOpen(save),true);
 if(invite)go({type:'choice',choiceId:'invite-paul'});assert.equal(Boolean(q.flags.paulInvited),invite);
 go({type:'launched',fromLocationId:'cairn'});q.flags.blackBoxTargetId='recorder';go({type:'extracted',source:'salvage',instanceId:'mourning-line',nodeId:'recorder',amount:1});step('black-box-fight');
 go({type:'encounter-cleared',encounter:'black-box'});go({type:'docked',locationId:'helix'});step('decode-black-box');go({type:'talked',personId:'mara-vek',locationId:'helix'});step('complete');assert.equal(q.flags.blackBoxDelivered,true);assert.ok(q.completedAt!==undefined);
 assert.equal(getTutorialQuest(hydrateSave(JSON.parse(JSON.stringify(save)))).stepId,'complete');
});
test('wrong ports, unrelated topics, ordinary extraction and empty PDC bays never skip lessons',()=>{
 const {save,q,go}=fixture();go({type:'talked',personId:'mara-vek',locationId:'cairn'});assert.ok(!q.flags.metMara);
 q.stepId='mine-shardbelt';q.flags.oreTargetId='a';assert.equal(go({type:'extracted',nodeId:'b',source:'mining',instanceId:'shardbelt',amount:3}).changed,false);
 q.stepId='fit-pdc';assert.equal(go({type:'drone-configured',mode:'pdc',loaded:false,locationId:'vesper'}).changed,false);assert.ok(tutorialLaunchBlock({...save,player:{...save.player,dockedAt:'vesper'}}));
});
test('skip opens the career and gate without paying an unearned completion reward',()=>{const {save,q}=fixture(),credits=save.player.credits;skipTutorialCampaign(save);assert.equal(save.player.credits,credits);assert.equal(tutorialContentUnlocked(save),true);assert.equal(tutorialGateOpen(save),true);assert.equal(q.flags.skipped,true);});
test('legacy prologues migrate once without repeating trade purchases or changing finished careers',()=>{
 const {save,q}=fixture();q.flags={suppliesBought:2};q.stepId='service-ship';migrateTutorialCampaign(save);assert.equal(q.stepId,'fit-upgrade');assert.equal(q.flags.deliveryRequired,2);migrateTutorialCampaign(save);assert.equal(q.stepId,'fit-upgrade');
 const {save:done,q:completed}=fixture();completed.flags={};completed.completedAt=20;completed.stepId='complete';migrateTutorialCampaign(done);assert.equal(completed.completedAt,20);assert.ok(tutorialGateOpen(done));
 for(const step of Object.values(TUTORIAL_STEPS))assert.ok(step.chapter<=6);
});
