import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {GameSession} from '../../src/game/game.js';
import {LOCATIONS} from '../../src/game/data.js';
import {generateAsteroidField} from '../../src/game/worldData.js';
import {tutorialMiningQuantity,TUTORIAL_MINING_CONTRACT_ID} from '../../src/game/tutorialCampaign.js';
import {hydrateSave} from '../../src/game/save.js';

test('the six-ore handoff preserves the selected asteroid, flight controls, working miners and escort position',()=>{
 const {session,save,quest}=tutorialFixture('mine-shardbelt'),p=save.player;const node=session.asteroids.find(n=>n.remaining>0);quest.flags.oreTargetId=node.id;p.dockedAt=undefined;p.currentTargetId=node.id;p.navTargetId='shardbelt';p.throttle=.25;p.droneFleet.controller.phase='running';
 const rin={id:'rin',storyPersonId:'rin',tutorialCompanion:true,hull:100,shield:30,position:[500,600,700],velocity:[1,2,3],rotation:[0,0,0,1]};session.ships=[rin];
 session.handleTutorialEvent('extracted',{source:'mining',nodeId:node.id,instanceId:'shardbelt',amount:5});assert.equal(quest.stepId,'mine-shardbelt');
 session.handleTutorialEvent('extracted',{source:'mining',nodeId:node.id,instanceId:'shardbelt',amount:1});assert.equal(quest.stepId,'return-mining');assert.equal(p.currentTargetId,node.id);assert.equal(p.navTargetId,'shardbelt');assert.equal(p.throttle,.25);assert.equal(p.droneFleet.controller.phase,'running');assert.deepEqual(rin.position,[500,600,700]);
});
test('new contracts pay 3000 for six ore and choose a static deposit around 1000 km from the real Vesper arrival',()=>{
 for(const seed of [1,91,73201,314159]){
  const {session,save,quest}=tutorialFixture('mining-contract');save.world.seed=seed;session.asteroids=generateAsteroidField(seed,{},[]);session.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;
  session.ensureTutorialMiningContract();const node=session.asteroids.find(n=>n.id===quest.flags.oreTargetId),offer=save.world.offers.vesper.find(m=>m.id===TUTORIAL_MINING_CONTRACT_ID),entry=quest.flags.miningEntryPosition;
  assert.equal(offer.quantity,6);assert.equal(offer.reward,3000);assert.equal(node.moving,false);assert.ok(node.remaining>=12);
  const range=Math.hypot(...node.position.map((v,i)=>v-entry[i]));assert.ok(range>=750&&range<=1250,`seed ${seed}: ${range} km`);
  const id=node.id;session.ensureTutorialMiningContract();assert.equal(quest.flags.oreTargetId,id);assert.equal(save.world.offers.vesper.filter(m=>m.id===offer.id).length,1);
 }
});
test('already accepted three-ore contracts retain their agreed goal and progress after loading',()=>{
 const {save,session,quest}=tutorialFixture('mine-shardbelt');save.activeMissions.push({id:TUTORIAL_MINING_CONTRACT_ID,kind:'mining',quantity:3,mined:2,reward:1800});quest.flags.oreTargetId='saved-rock';quest.flags.oreRecovered=2;
 const restored=tutorialFixture('mine-shardbelt',hydrateSave(JSON.parse(JSON.stringify(save))));assert.equal(tutorialMiningQuantity(restored.save),3);restored.session.handleTutorialEvent('extracted',{source:'mining',nodeId:'saved-rock',instanceId:'shardbelt',amount:1});assert.equal(restored.quest.stepId,'return-mining');
});
test('learned travel instructions remain silent for a minute, nudge once and reset when useful progress resumes',()=>{
 const {session,save,lines}=tutorialFixture('return-mining');save.player.dockedAt=undefined;const v=LOCATIONS.vesper;save.player.position=[v.position[0]+10000,v.position[1],v.position[2]];const g={key:'return-mining:route',speaker:'Rin Vek',text:'Select Vesper'};
 const messages=()=>lines.filter(a=>a[1]==='Select Vesper').length;
 session.updateTutorialGuidance(g);save.world.time+=59;session.updateTutorialGuidance(g);assert.equal(messages(),0);save.world.time++;session.updateTutorialGuidance(g);assert.equal(messages(),1);save.world.time+=120;session.updateTutorialGuidance(g);assert.equal(messages(),1);
 session.tutorialNudge=undefined;session.updateTutorialGuidance(g);save.world.time+=50;save.player.position[0]-=500;session.updateTutorialGuidance(g);save.world.time+=59;session.updateTutorialGuidance(g);assert.equal(messages(),1);save.world.time++;session.updateTutorialGuidance(g);assert.equal(messages(),2);
 session.updateTutorialGuidance({...g,key:'return-mining:drive'});save.world.time+=59;session.updateTutorialGuidance({...g,key:'return-mining:drive'});assert.equal(messages(),2);
});
test('automatic cruising, scanning and drone work do not produce instructional nudges',()=>{
 const {session,save,lines}=tutorialFixture('mine-shardbelt');save.player.dockedAt=undefined;for(const stage of ['cruise','recover-drones','mining','scan']){session.updateTutorialGuidance({key:`mine-shardbelt:${stage}`,speaker:'Rin',text:'No action needed'});save.world.time+=120;session.updateTutorialGuidance({key:`mine-shardbelt:${stage}`,speaker:'Rin',text:'No action needed'});}assert.ok(!lines.some(a=>a[1]==='No action needed'));
});
test('Rin opens the paused combat lesson four seconds after the pirate arrives',()=>{
 const {session,save,quest}=tutorialFixture('raider-standoff');save.player.dockedAt=undefined;
 quest.flags.standoffStartedAt=save.world.time;
 session.ensureTutorialCompanion=()=>{};session.ensureTutorialEnemy=()=>{};
 let briefings=0;session.playTutorialBriefing=id=>{assert.equal(id,'combat');briefings++;session.ui.isModalOpen=true;quest.flags['briefingShown-combat']=true;};
 save.world.time+=3.99;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'raider-standoff');assert.equal(briefings,0);
 save.world.time+=.01;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'defeat-raider');assert.equal(briefings,1);assert.equal(session.ui.isModalOpen,true);assert.equal(save.wingOrder,'defensive');
 session.updateTutorialCampaignRuntime();assert.equal(briefings,1,'the lesson does not reopen');
});
