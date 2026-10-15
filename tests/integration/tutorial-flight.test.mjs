import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {tutorialWreckPoint} from '../../src/game/tutorialRuntime.js';
import {LOCATIONS} from '../../src/game/data.js';
import {graveyardWreckInteriorAt} from '../../src/game/worldData.js';

test('flight inputs and both cockpit monitor actions complete the flight lesson',()=>{
 const {save,quest,session}=tutorialFixture('flight-checks');save.player.dockedAt=undefined;save.player.velocity=[0,0,-session.playerStats().maxSpeed];save.player.throttle=1;
 session.updateTutorialFlightChecks(1,{yaw:.4});session.afterburning=true;session.updateTutorialFlightChecks(2,{});assert.ok(!quest.flags['learned-boost']);session.handleTutorialEvent('flight-lesson',{id:'target-monitor'});session.handleTutorialEvent('flight-lesson',{id:'ship-monitor'});assert.equal(quest.stepId,'fly-vesper');
});
test('afterburner learning starts only during the Vesper approach, and does not block landing',()=>{
 const {save,quest,session}=tutorialFixture('fly-vesper'),p=save.player,v=LOCATIONS.vesper;p.dockedAt=undefined;p.navTargetId=p.currentTargetId='vesper';p.position=[v.position[0],v.position[1],v.position[2]+v.radius+70000];p.velocity=[0,0,-session.playerStats().maxSpeed];session.afterburning=true;
 session.updateTutorialFlightChecks(3,{});assert.ok(!quest.flags['learned-boost']);p.position[2]=v.position[2]+v.radius+7000;session.autopilot=true;session.updateTutorialFlightChecks(3,{});assert.ok(!quest.flags['learned-boost']);session.autopilot=false;
 session.updateTutorialFlightChecks(1,{});session.afterburning=false;session.updateTutorialFlightChecks(1,{});assert.ok(!quest.flags['learned-boost'],'two seconds must be continuous');session.afterburning=true;session.updateTutorialFlightChecks(2,{});assert.ok(quest.flags['learned-boost']);assert.equal(quest.stepId,'fly-vesper');
 session.handleTutorialEvent('docked',{locationId:'vesper'});assert.equal(quest.stepId,'sell-supplies');
});
test('flight lessons remain in the ordinary comms field and never open a modal',()=>{
 const {save,session,lines}=tutorialFixture('flight-checks');save.player.dockedAt=undefined;session.playStoryLine=()=>assert.fail('flight instruction must not open a conversation');session.updateTutorialCampaignRuntime();assert.ok(lines.some(l=>/thrust slider/.test(l[1])));assert.equal(session.ui.isModalOpen,false);
});
test('survey coordinates reach the cruiser rescue, and no generic wreck visit counts as the recorder',()=>{
 const {save,quest,session}=tutorialFixture('survey-graveyard');save.player.dockedAt=undefined;session.activeInstanceId='mourning-line';
 for(let i=0;i<3;i++){const marker=session.tutorialFieldTarget();save.player.position=[...marker.position];session.updateTutorialCampaignRuntime();}
 assert.equal(quest.stepId,'rescue-paul');assert.equal(session.ships.filter(s=>s.tutorialEncounter==='rescue').length,2);assert.ok(session.ships.some(s=>s.storyPersonId==='paul'&&s.hullId==='torsas'));assert.ok(!session.ships.some(s=>s.storyPersonId==='rin'));
});
test('hiding requires the real carrier interior, transponder off, low speed and blocked sight lines',()=>{
 const {save,quest,session}=tutorialFixture('hide-patrol');save.player.dockedAt=undefined;quest.flags.encounterStartedAt=0;session.ensureTutorialEnemy();assert.equal(session.ships.filter(s=>s.tutorialPatrol).length,5);
 const inside=tutorialWreckPoint('concord-carrier-wreck',true);assert.equal(graveyardWreckInteriorAt(inside.map((v,i)=>v-LOCATIONS['mourning-line'].position[i]),5),'concord-carrier-wreck');save.player.position=inside;save.world.time=1;
 session.updateTutorialCampaignRuntime();assert.equal(quest.flags.hiddenSince,undefined,'transponder alone matters');save.player.transponder=false;session.updateTutorialCampaignRuntime();assert.equal(quest.flags.hiddenSince,undefined,'open sight line still reveals the ship');
 session.lineBlocked=()=>true;session.updateTutorialCampaignRuntime();assert.equal(quest.flags.hiddenSince,1);save.world.time=15;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'hide-patrol');save.world.time=22;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'return-helix');
});
test('defeating the five-ship patrol is a valid alternative to hiding',()=>{const {save,quest,session}=tutorialFixture('hide-patrol');save.player.dockedAt=undefined;for(let i=0;i<5;i++)quest.flags[`defeated-patrol-${i}`]=true;session.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'return-helix');});

test('carrier hiding uses actual narrow collision surfaces and actual occlusion across different debris seeds',async()=>{
 const {GameSession}=await import('../../src/game/game.js'),{generateGraveyardPieces,generateWreckNodes}=await import('../../src/game/worldData.js'),T=await import('../../vendor/three.module.min.js');
 for(const seed of [1,91,73201]){
  const {save,quest,session}=tutorialFixture('hide-patrol');save.world.seed=seed;save.player.dockedAt=undefined;save.player.position=tutorialWreckPoint('concord-carrier-wreck');session.activeInstanceId='mourning-line';session.graveyard=generateGraveyardPieces(seed);session.wreckNodes=generateWreckNodes(seed,{},[]);session.obstacleCellSize=256;
  for(const method of ['activeFieldObstacles','lineBlocked','forEachObstacleAlongSegment','forEachObstacleInBox'])session[method]=GameSession.prototype[method];
  session.ensureTutorialEnemy();const hiding=session.ensureTutorialHidePosition();assert.ok(hiding,`seed ${seed} has a hiding spot`);assert.ok(session.tutorialHidingPositionClear(new T.Vector3(...hiding)),`seed ${seed} fits the current player hull`);
  const pirates=session.ships.filter(s=>s.tutorialPatrol);assert.ok(pirates.every(s=>session.lineBlocked(new T.Vector3(...s.position),new T.Vector3(...hiding),s.id)),`seed ${seed} is hidden behind actual wreck geometry`);
  save.player.position=hiding;save.player.transponder=false;session.updateTutorialCampaignRuntime();assert.notEqual(quest.flags.hiddenSince,undefined);
 }
});

test('a resumed departure waiting only for the old boost lesson can continue',()=>{
 const {save,quest,session}=tutorialFixture('flight-checks');save.player.dockedAt=undefined;
 for(const id of ['thrust','steering','target-monitor','ship-monitor'])quest.flags['learned-'+id]=true;
 session.updateTutorialFlightChecks(1/60,{});assert.equal(quest.stepId,'fly-vesper');assert.ok(!quest.flags['learned-boost']);
});
