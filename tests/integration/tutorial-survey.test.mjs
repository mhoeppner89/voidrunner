import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {GameSession} from '../../src/game/game.js';
import {SpaceRenderer} from '../../src/game/render.js';
import {AudioManager} from '../../src/game/audio.js';
import {LOCATIONS,hyperdriveArrivalRadius} from '../../src/game/data.js';
import {generateGraveyardPieces} from '../../src/game/worldData.js';
import {tutorialWreckPoint} from '../../src/game/tutorialRuntime.js';
import {ADVENTURE_DIALOGUES,dialogueText} from '../../src/game/adventureDialogues.js';
const axes={pitch:0,yaw:0,roll:0,throttleDelta:0};
function surveyFlight(range=3000){
 const f=tutorialFixture('survey-graveyard'),s=f.session,p=f.save.player;s.activeInstanceId='mourning-line';p.dockedAt=undefined;p.navTargetId='mourning-line';
 s.ensureTutorialFieldTarget();const marker=s.tutorialFieldTarget();p.position=marker.position.map((v,i)=>v+(i===2?range:0));p.rotation=[0,0,0,1];p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=.35;
 Object.assign(s,{hyperdriveEncounterAt:null,hyperdriveFx:'none',playerEmissionHeat:0,hyperdriveReturnThrottle:.35});
 Object.assign(s,{readyJumpPoint:()=>undefined,resolvePlayerCollisions(){},ensurePlayerEntryClearance(){},resetPlayerInterpolation(){},getAvoidanceVector:()=>s.tmpAvoidance.set(0,0,0),setHyperdriveStatus(message){s.hyperdriveStatus=message;},requestDroneDeparture:()=>true,recallMiningDrones(){},hyperdriveCooldownRemaining:()=>0});
 return {...f,marker};
}
test('survey jumps use normal charge, preserve real navigation and stop about 500 km away',()=>{
 const {session:s,save,marker,quest}=surveyFlight();const start=[...save.player.position];
 assert.equal(s.hyperdriveBlockReason(),null);assert.equal(hyperdriveArrivalRadius(s.tutorialLocalWaypoint()),500);s.toggleHyperdrive();assert.equal(s.hyperdriveFx,'spooling');
 for(let i=0;i<60;i++){save.world.time+=1/60;s.updatePlayer(1/60,axes);s.updateTutorialSurveyProgress();}
 assert.deepEqual(save.player.position,start);assert.equal(s.hyperdriveEncounterAt,null);
 for(let i=0;i<600&&s.autopilot;i++){save.world.time+=1/60;s.updatePlayer(1/60,axes);s.updateTutorialSurveyProgress();}
 assert.equal(s.autopilot,false);assert.equal(s.hyperdriveWaypoint,undefined);assert.equal(save.player.navTargetId,'mourning-line');assert.ok(LOCATIONS[save.player.navTargetId]);assert.equal(quest.flags.surveyIndex??0,0);
 const distance=Math.hypot(...save.player.position.map((v,i)=>v-marker.position[i]));assert.ok(distance>=490&&distance<=525,`${distance} km`);
});
test('short jumps enforce the strict 2000 km boundary, alignment, real cover and target changes',()=>{
 const {session:s,save,marker}=surveyFlight(2000);assert.equal(s.hyperdriveBlockReason().kind,'info');save.player.position[2]+=.1;assert.equal(s.hyperdriveBlockReason(),null);
 save.player.rotation=[0,1,0,0];assert.equal(s.hyperdriveBlockReason().kind,'warning');save.player.rotation=[0,0,0,1];s.lineBlocked=()=>true;assert.equal(s.hyperdriveBlockReason().kind,'danger');s.lineBlocked=()=>false;
 s.toggleHyperdrive();assert.equal(s.autopilot,true);s.selectTarget('location','vesper');assert.equal(s.autopilot,false);assert.equal(s.hyperdriveWaypoint,undefined);assert.equal(save.player.currentTargetId,'vesper');
 save.player.currentTargetId=marker.id;s.activeInstanceId='shardbelt';assert.equal(s.tutorialLocalWaypoint(),undefined);
});
test('a stalled pilot who changed target is nudged to reselect the survey star before jumping',()=>{
 const {session:s,save,marker}=surveyFlight(3000);save.player.currentTargetId='paul';assert.match(s.tutorialFlightGuidance().text,/Select the highlighted marker/);
 save.player.currentTargetId=marker.id;assert.match(s.tutorialFlightGuidance().text,/engage HYPERDRIVE/);
});
test('active survey drive follows its validated line even from an imperfect initial heading',()=>{
 const {session:s,save,marker}=surveyFlight(6000);save.player.rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.45).toArray();
 s.getAvoidanceVector=()=>{throw Error('Local jumps must not bend their validated line');};s.toggleHyperdrive();assert.equal(s.autopilot,true);
 for(let i=0;i<600&&s.autopilot;i++){save.world.time+=1/60;s.updatePlayer(1/60,axes);}
 assert.equal(s.autopilot,false);assert.ok(Math.abs(save.player.position[0]-marker.position[0])<.001);assert.ok(Math.abs(save.player.position[1]-marker.position[1])<.001);
});
test('entering the survey field during a location jump does not silently retarget it',()=>{
 const {session:s,save}=surveyFlight();s.autopilot=true;s.hyperdriveWaypoint=undefined;
 assert.equal(s.hyperdriveDestination(),LOCATIONS['mourning-line']);s.autopilot=false;assert.equal(s.hyperdriveDestination().kind,'waypoint');assert.equal(save.player.navTargetId,'mourning-line');
});
test('survey visits need less than 100 km, accept speed and catch swept flybys once',()=>{
 const {session:s,save,quest,marker}=surveyFlight();const p=save.player;p.position=marker.position.map((v,i)=>v+(i===0?100:0));p.velocity=[900,0,0];
 assert.equal(s.updateTutorialSurveyProgress(),false);p.position[0]-=.1;assert.equal(s.updateTutorialSurveyProgress(),true);assert.equal(quest.flags.surveyIndex,1);assert.equal(s.updateTutorialSurveyProgress(),false);
 const next=s.tutorialFieldTarget();p.position=next.position.map((v,i)=>v+(i===0?-180:0));s.tutorialSurveyTrack=undefined;assert.equal(s.updateTutorialSurveyProgress(),false);p.position[0]+=360;
 assert.equal(s.updateTutorialSurveyProgress(),true);assert.equal(quest.flags.surveyIndex,2);
 const third=s.tutorialFieldTarget();p.position=[...third.position];s.autopilot=true;assert.equal(s.updateTutorialSurveyProgress(),false);assert.equal(quest.stepId,'survey-graveyard');
});
test('all survey stars and their 500 km drop points are clear of actual wreck collision surfaces',()=>{
 const {session:s,save,quest}=surveyFlight();s.graveyard=generateGraveyardPieces(save.world.seed);s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;const obstacles=s.activeFieldObstacles();s.forEachObstacleAlongSegment=(a,b,fn)=>{for(const obstacle of obstacles)if(fn(obstacle))break;};s.lineBlocked=GameSession.prototype.lineBlocked;
 let previous;
 for(let i=0;i<5;i++){
  quest.stepId=i<3?'survey-graveyard':'survey-carrier';quest.flags.surveyIndex=i;const marker=s.tutorialFieldTarget(),end=new THREE.Vector3(...marker.position);assert.ok(s.tutorialHidingPositionClear(end,obstacles),marker.name);
  if(previous){let clear=false;for(const radius of [0,200,400]){
   for(let j=0;j<48;j++){const y=1-2*(j+.5)/48,a=j*2.39996,from=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)).multiplyScalar(radius).add(previous),drop=from.clone().sub(end).normalize().multiplyScalar(508).add(end);
    if(s.tutorialHidingPositionClear(from,obstacles)&&s.tutorialHidingPositionClear(drop,obstacles)&&!s.lineBlocked(from,drop)){clear=true;break;}
   }if(clear)break;
  }assert.ok(clear,`No safe departure around survey ${i-1}`);}
  previous=end;
 }
});
test('Paul explains the transponder immediately when the patrol arrives',()=>{
 const {session:s,quest,save}=tutorialFixture('carrier-wait'),shown=[];save.player.dockedAt=undefined;s.ensureTutorialHidePosition=()=>tutorialWreckPoint('concord-carrier-wreck',true);s.hostilesVisibleNear=()=>true;s.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;s.ui.showStoryLine=(...args)=>shown.push(args);
 s.handleTutorialEvent('patrol-arrived');assert.equal(quest.stepId,'hide-patrol');assert.equal(shown.length,1);assert.equal(shown[0][3],'tutorial-paul-hide');
});
test('resuming an unread transponder lesson restores it once, then respects completion',()=>{
 for(const [step,id]of [['hide-patrol','paul-hide'],['return-helix','paul-clear']]){
  const {session:s,quest,save}=tutorialFixture(step),shown=[];save.player.dockedAt=undefined;s.activeInstanceId='mourning-line';quest.flags['briefingShown-'+id]=true;
  s.ensureTutorialHidePosition=()=>tutorialWreckPoint('concord-carrier-wreck',true);s.hostilesVisibleNear=()=>true;s.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;s.ui.showStoryLine=(...args)=>shown.push(args);
  s.restoreTutorialRuntime();s.restoreTutorialRuntime();assert.equal(shown.length,1);assert.equal(shown[0][3],'tutorial-'+id);
  s.finishTutorialBriefing('tutorial-'+id,true);s.restoreTutorialRuntime();assert.equal(shown.length,1);
 }
});
test('hidden Paul chatter is spaced, one-off, and the post-patrol briefing opens despite nearby pirates',()=>{
 const {session:s,save,quest,lines}=tutorialFixture('hide-patrol'),p=save.player;p.dockedAt=undefined;p.position=tutorialWreckPoint('concord-carrier-wreck',true);p.velocity.fill(0);p.transponder=false;s.playerEmissionHeat=0;
 s.ensureTutorialCompanion=()=>{};s.queueTutorialMaraCall=()=>{};s.lineBlocked=()=>true;s.ships=[{id:'patrol',tutorialPatrol:true,tutorialEncounter:'patrol',hull:100,position:[...p.position],holdFire:true}];quest.flags['briefingShown-paul-hide']=true;
 const shown=[];s.ui.showStoryLine=(...args)=>shown.push(args);s.hostilesVisibleNear=()=>true;s.playTutorialBriefing=GameSession.prototype.playTutorialBriefing;const start=save.world.time;
 assert.equal(s.tutorialMusicContext(),'stealth');
 for(const elapsed of [0,1,6,7,8,13,14,15,19]){save.world.time=start+elapsed;s.updateTutorialCampaignRuntime();}
 const chatter=lines.filter(l=>l[0]==='Paul');assert.equal(chatter.length,3);assert.match(chatter[1][1],/every berth was full/);assert.match(chatter[2][1],/Thanks/);
 save.world.time=start+21;s.updateTutorialCampaignRuntime();assert.equal(quest.stepId,'return-helix');assert.equal(s.tutorialMusicContext(),undefined);assert.equal(shown.at(-1)[3],'tutorial-paul-clear');assert.ok(quest.flags['briefingShown-paul-clear']);
 const count=shown.length;s.updateTutorialCampaignRuntime();assert.equal(shown.length,count);
});
test('Paul resumes formation after a real scenery contact clears his route',()=>{
 const {session:s,save}=tutorialFixture('hide-patrol');save.player.dockedAt=undefined;const paul=s.ensureTutorialCompanion(true);
 s.currentDockLocationIds=()=>[];const panel={id:'carrier-panel',x:paul.position[0]+35,y:paul.position[1],z:paul.position[2],radius:50,collisionRadius:50,losRadius:50};
 s.forEachObstacleInBox=(...args)=>args.at(-1)(panel);paul.velocity.splice(0,3,25,0,0);s.resolveNpcCollisions(paul);assert.equal(paul.destination,undefined);assert.equal(paul.poweredDown,false);
 const goal=s.tutorialFormationGoal().clone().addScaledVector(s.tmpTutorialRight,-96);paul.position.splice(0,3,goal.x+80,goal.y,goal.z);paul.velocity.fill(0);
 let travel=0;s.updateTravelAI=()=>travel++;s.updateTutorialCompanion(paul,1/60);assert.equal(travel,1);assert.deepEqual(paul.destination,goal.toArray());
});
test('stealth score yields to actual aggression and uses the audio context transition',()=>{
 const {session:s,save}=tutorialFixture('hide-patrol');save.player.dockedAt=undefined;s.ships=[{tutorialPatrol:true,hull:50,holdFire:true,targetId:undefined}];assert.equal(s.tutorialMusicContext(),'stealth');
 s.ships[0].targetId='player';s.ships[0].holdFire=false;assert.equal(s.tutorialMusicContext(),'combat');
 const a=Object.create(AudioManager.prototype),changes=[];Object.assign(a,{context:{currentTime:0},enabled:true,musicContext:'graveyard',currentContext:'graveyard',dangerLevel:.8,musicTimer:100,musicVolume:0,effectsVolume:0,swapMusicBus(){},crossfadeContext(){changes.push(this.currentContext);},stopDrones(){},startDrones(){},updateCombatTier(){}});
 a.update(1/60,0,false,0,0,'stealth');assert.equal(a.currentContext,'stealth');a.update(1/60,0,false,0,1,'stealth');assert.equal(a.currentContext,'combat');a.dangerLevel=0;a.update(1/60,0,false,0,0,'graveyard');assert.deepEqual(changes,['stealth','combat','graveyard']);
 const notes=[];a.musicNote=(...args)=>notes.push(args);for(let bar=0;bar<4;bar++)a.playStealthBar(0,bar);assert.ok(notes.length>=10);for(const args of notes)for(const value of Object.values(args[0]))if(typeof value==='number')assert.ok(Number.isFinite(value));
});
test('both languages explain genuine transponder controls and station access matches the lesson',()=>{
 for(const language of ['de','en']){
  const hide=Object.values(ADVENTURE_DIALOGUES['paul-hide'].nodes).map(n=>dialogueText(n.text,language)).join(' '),clear=Object.values(ADVENTURE_DIALOGUES['paul-clear'].nodes).map(n=>dialogueText(n.text,language)).join(' ');
  assert.match(hide,/TRANSPONDER (AN|ON)/);assert.match(hide,/\bB\b/);assert.match(clear,/TRANSPONDER (AUS|OFF)/);assert.match(clear,/Patrouillen|patrols/);assert.match(clear,/mit oder ohne|with or without/);
 }
 const {session:s}=tutorialFixture();for(const location of Object.values(LOCATIONS).filter(l=>l.kind==='station'))assert.notEqual(s.darkDockPolicy(location.id),'deny',location.id);assert.equal(s.darkDockPolicy('helix'),'syndicate');
});
test('survey star faces the camera, pulses without allocating again and respects reduced motion',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();r.camera=new THREE.PerspectiveCamera(70,1.6,.1,20000);r.viewportHeight=800;r.skyTime=0;r.setMissionMarker({position:[0,0,-1000]});const mesh=r.missionMarker.children[0],geometry=mesh.geometry,scale=r.missionMarker.scale.x,opacity=mesh.material.opacity;
 assert.equal(mesh.geometry.type,'ShapeGeometry');r.skyTime=.35;r.camera.rotation.set(.2,.3,0);r.updateMissionMarker();assert.notEqual(r.missionMarker.scale.x,scale);assert.notEqual(mesh.material.opacity,opacity);assert.ok(r.missionMarker.quaternion.equals(r.camera.quaternion));
 r.reducedHyperdriveMotion=true;r.updateMissionMarker();const still=r.missionMarker.scale.x;r.skyTime=9;r.updateMissionMarker();assert.equal(r.missionMarker.scale.x,still);r.setMissionMarker({position:[0,0,-2000]});assert.equal(mesh.geometry,geometry);assert.equal(r.missionMarker.scale.x,still*2);r.setMissionMarker();assert.equal(r.missionMarker.visible,false);
 geometry.dispose();mesh.material.dispose();
});
