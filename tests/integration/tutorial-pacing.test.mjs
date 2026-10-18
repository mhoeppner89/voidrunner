import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {isTutorialGuided,tutorialContentUnlocked,tutorialGateOpen,TUTORIAL_STEPS} from '../../src/game/tutorialCampaign.js';
import {playerStrengthValue} from '../../src/game/playerStrength.js';
import {LOCATIONS} from '../../src/game/data.js';

test('guided stages suppress ambient combat, while the earning interval restores normal career encounters',()=>{
 for(const step of Object.keys(TUTORIAL_STEPS).filter(s=>s!=='earn-standing'&&s!=='complete')){const {save,session}=tutorialFixture(step);assert.equal(isTutorialGuided(save),true);assert.equal(session.combatEncounterScale(),0);assert.equal(session.spawnHyperdriveIntercept(),false);}
 const {save,quest,session}=tutorialFixture('earn-standing');quest.flags.openWorld=true;session.combatCalmFactor=()=>1;assert.equal(tutorialContentUnlocked(save),true);assert.equal(session.combatEncounterScale(),1);assert.equal(tutorialGateOpen(save),false);
});
test('Mara’s call uses the existing equipment/full-ship/half-cash metric and waits for quiet flight',()=>{
 const {save,quest,session}=tutorialFixture('earn-standing');const calls=[];session.playTutorialBriefing=id=>calls.push(id);quest.flags.openWorld=true;assert.ok(playerStrengthValue(save.player)<50000);session.queueTutorialMaraCall();assert.equal(quest.stepId,'earn-standing');
 save.player.credits=100000;assert.ok(playerStrengthValue(save.player)>=50000);session.ui.isModalOpen=true;session.queueTutorialMaraCall();assert.equal(quest.stepId,'earn-standing');session.ui.isModalOpen=false;
 session.activeRace={state:'running'};session.queueTutorialMaraCall();assert.equal(quest.stepId,'earn-standing','story waits until the borrowed race hull is returned');session.activeRace=null;
 session.ships=[{hostile:true,hull:100,position:[...save.player.position]}];session.queueTutorialMaraCall();assert.equal(quest.stepId,'earn-standing');session.ships=[];session.queueTutorialMaraCall();assert.equal(quest.stepId,'meet-cairn');assert.deepEqual(calls,['mara-cairn']);session.queueTutorialMaraCall();assert.equal(calls.length,1);
});
test('both gate entry paths stay closed until Rin’s Cairn conversation',()=>{
 const {save,quest,session}=tutorialFixture('earn-standing');session.setHyperdriveStatus=()=>{};
 const gate=LOCATIONS['verge-meridian-point'];assert.equal(session.startGalaxyJump(gate),false);assert.equal(session.beginGalaxyGateTransition(gate),false);
 quest.flags.gateOpen=true;session.requestDroneDeparture=()=>false;assert.equal(tutorialGateOpen(save),true);assert.equal(session.startGalaxyJump(gate),false,'the normal drone-recall gate still applies');
});
test('docked preparation cannot be bypassed by launching',async()=>{
 const {save,session}=tutorialFixture('mining-contract');save.player.dockedAt='vesper';assert.equal(await session.launch(),false);
});
test('opening departure reports missing keys without changing the quest or preparing flight',async()=>{
 const {save,quest,session}=tutorialFixture();const messages=[];
 session.ui.showLaunchBlocked=message=>messages.push(message);
 session.prepareDockedFlightRuntime=()=>{throw Error('Blocked launch prepared flight');};
 for(let i=0;i<2;i++)assert.equal(await session.launch(),false);
 assert.equal(messages.length,2);assert.match(messages[0],/keys|Schlüssel/);
 assert.equal(save.player.dockedAt,'helix');assert.equal(quest.stepId,'meet-family');assert.ok(!session.launchPreparing);
});
test('failed flight preparation releases the launch lock for another attempt',async()=>{
 const {session}=tutorialFixture('launch-helix');session.save.player.cargo.food=16;session.flightPrepared=false;
 session.prepareDockedFlightRuntime=async()=>{throw Error('Expected preparation failure');};
 await assert.rejects(session.launch(),/Expected preparation failure/);assert.equal(session.launchPreparing,false);
 session.prepareDockedFlightRuntime=async()=>false;assert.equal(await session.launch(),false);assert.equal(session.launchPreparing,false);
});
