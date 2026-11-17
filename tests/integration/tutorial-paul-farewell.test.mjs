import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {GameSession} from '../../src/game/game.js';
import {hydrateSave} from '../../src/game/save.js';
import {ADVENTURE_DIALOGUES,dialogueText} from '../../src/game/adventureDialogues.js';

function finale(invited=true){
 const f=tutorialFixture('black-box-fight'),s=f.session;f.save.player.dockedAt=undefined;f.quest.flags.paulInvited=invited;
 s.storyLineActive=GameSession.prototype.storyLineActive;s.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;s.hostilesVisibleNear=()=>false;
 const conversations=[];s.ui.showStoryLine=(...args)=>conversations.push(args);s.ensureTutorialEnemy();
 const paul=s.ships.find(ship=>ship.storyPersonId==='paul');if(paul)paul.position[0]+=137;
 for(const enemy of s.ships.filter(ship=>ship.tutorialEncounter==='black-box')){enemy.hull=0;f.quest.flags[`defeated-black-box-${enemy.tutorialIndex}`]=true;}
 return {...f,paul,conversations};
}

test('the final fight keeps Paul in place until his protected goodbye has been read',()=>{
 const {session:s,quest,paul,conversations}=finale(),position=[...paul.position];s.updateTutorialCampaignRuntime();
 assert.equal(quest.stepId,'deliver-black-box');assert.ok(paul.hull>0,'Paul must not disappear at the step change');assert.deepEqual(paul.position,position,'victory must not teleport the wing');
 assert.equal(conversations.at(-1)?.[3],'tutorial-paul-farewell');assert.equal(conversations.at(-1)?.[2],'story-friend');
 s.save.world.time+=30;s.ensureTutorialCompanion();s.updateTutorialCompanion(paul,1/60);assert.ok(paul.hull>0);assert.equal(paul.tutorialDepartureAt,undefined,'he waits for the actual conversation');
 assert.equal(conversations.length,1,'runtime updates cannot repeat the farewell');
});

test('after the goodbye Paul flies away, then leaves one jump streak and stays gone after reload',()=>{
 const {session:s,quest,paul,save}=finale(),streaks=[];s.renderer.spawnHyperdriveStreak=(...args)=>streaks.push(args);s.updateTutorialCampaignRuntime();
 s.finishTutorialBriefing('tutorial-paul-farewell',true);assert.equal(quest.flags['briefingRead-paul-farewell'],true);
 let travel=0;s.updateTravelAI=()=>travel++;s.updateTutorialCompanion(paul,1/60);assert.ok(travel>0);assert.ok(paul.hull>0);assert.equal(paul.repairDronesHeld,true);
 save.world.time+=5;s.updateTutorialCompanion(paul,1/60);assert.ok(paul.hull>0,'departure has visible flight time');assert.equal(streaks.length,0);
 save.world.time+=2;s.updateTutorialCompanion(paul,1/60);assert.ok(paul.hull<0);assert.equal(streaks.length,1);assert.equal(quest.flags.paulDeparted,true);
 s.ensureTutorialCompanion();assert.equal(s.ships.filter(ship=>ship.storyPersonId==='paul'&&ship.hull>0).length,0);
 const loaded=tutorialFixture('deliver-black-box',hydrateSave(JSON.parse(JSON.stringify(save))));loaded.session.ensureTutorialCompanion();assert.ok(!loaded.session.ships.some(ship=>ship.storyPersonId==='paul'&&ship.hull>0));
});

test('a queued farewell and an older return save retain Paul until the briefing is available',()=>{
 const {session:s,paul,save,quest}=finale();s.flightDialogueAfter=save.world.time+12;s.updateTutorialCampaignRuntime();
 assert.ok(paul.hull>0);assert.equal(s.pendingStoryConversations[0].conversationId,'tutorial-paul-farewell');assert.ok(!quest.flags['briefingRead-paul-farewell']);
 const loaded=tutorialFixture('deliver-black-box',hydrateSave(JSON.parse(JSON.stringify(save)))),calls=[];
 loaded.session.playTutorialBriefing=id=>calls.push(id);loaded.session.restoreTutorialRuntime();assert.ok(loaded.session.ships.some(ship=>ship.storyPersonId==='paul'&&ship.hull>0));assert.ok(calls.includes('paul-farewell'));
});

test('declining Paul creates neither a farewell nor a replacement escort',()=>{
 const {session:s,conversations}=finale(false);s.updateTutorialCampaignRuntime();assert.equal(s.tutorialSummary().stepId,'deliver-black-box');assert.ok(!s.ships.some(ship=>ship.storyPersonId==='paul'));assert.equal(conversations.length,0);
});

test('Paul’s closing dialogue uses the existing goodbye in both languages',()=>{
 const script=ADVENTURE_DIALOGUES['paul-farewell'];assert.ok(script);
 for(const language of ['de','en']){const text=dialogueText(script.nodes[script.start].text,language);assert.match(text,language==='de'?/Rekorder.*Mara.*quitt/:/recorder.*Mara.*even/);}
});
