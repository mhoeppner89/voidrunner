import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {pilotJudgment,judgmentSpeed} from '../../src/game/pilotJudgment.js';
import {seededRandom} from '../../src/game/random.js';
import {fixture} from '../helpers/session.mjs';

const heading=()=>new THREE.Vector3(.7,0,-.7).normalize();
function pilot(tier='novice',rng=()=>0){
 return {role:'pirate',targetId:'player',pilot:{tier},aiRng:rng,speed:80,velocity:[0,0,-80],
  fieldNav:{safeForManeuver:true,active:false},
  combatPlan:{visible:true,nose:new THREE.Vector3(0,0,-1),clearance:35},
  combatThreatUntil:1000,combatPressureAt:0};
}
function start(ship,closing=0){
 pilotJudgment(ship,0,heading(),240,closing);
 ship.combatPressureAt=.5;
 return pilotJudgment(ship,.5,heading(),240,closing);
}

test('pressure errors are sustained and recover, rather than random steering jitter',()=>{
 for(const kind of ['late-turn','overcorrect','late-brake']){
  let n=0;const ship=pilot('novice',()=>n++===1&&kind==='overcorrect'?.9:0);
  if(kind==='late-brake')ship.combatPlan.overshoot=true;
  const s=start(ship,kind==='late-brake'?30:0);assert.equal(s?.kind,kind);
  const until=s.until,entry=s.entry,turn=s.turn,ideal=heading();
  let previous=ideal.clone(),largestDelta=0,maximumError=0;
  for(let time=.5;time<until;time+=1/60){
   const out=heading(),active=pilotJudgment(ship,time,out,240,30);
   assert.equal(active,s);assert.equal(s.entry,entry);assert.equal(s.turn,turn);
   assert.ok(Math.abs(out.length()-1)<1e-9);assert.ok(out.toArray().every(Number.isFinite));
   if(time>.52)largestDelta=Math.max(largestDelta,previous.angleTo(out));
   maximumError=Math.max(maximumError,ideal.angleTo(out));previous.copy(out);
  }
  assert.ok(largestDelta<.04,'continuous correction, no per-step random wobble');
  if(kind!=='late-brake')assert.ok(maximumError>.1,'a visible heading error');
  assert.equal(pilotJudgment(ship,until+.01,heading(),240,30),undefined);assert.equal(s.active,false);
  assert.ok(s.readyAt>until+7);assert.equal(pilotJudgment(ship,until+1,heading(),240,30),undefined);
 }
});

test('mistakes become rarer and shorter with skill and only roll at 2 Hz',()=>{
 for(const temperament of ['timid','steady','aggressive','flamboyant']){
  const counts=[],durations=[];
  for(const tier of ['novice','veteran','ace']){
   const ship=pilot(tier,seededRandom('same-pressure-history'));ship.pilot.temperament=temperament;
   let totalDuration=0,previousErrors=0;
   for(let frame=0;frame<600*60;frame++){
    const time=frame/60;ship.combatPressureAt=time;
    const s=pilotJudgment(ship,time,heading(),240,0);
    if(s&&s.errors!==previousErrors){totalDuration+=s.until-s.started;previousErrors=s.errors;}
   }
   counts.push(ship.pilotJudgment.errors);durations.push(totalDuration/ship.pilotJudgment.errors);
   assert.ok(ship.pilotJudgment.decisions<=1200,'no frame-rate random roll');
  }
  assert.ok(counts[0]>counts[1]&&counts[1]>counts[2],`${temperament}: ${counts.join('/')}`);
  assert.ok(durations[0]>durations[1]&&durations[1]>durations[2],`${temperament}: ${durations.join('/')}`);
  assert.ok(counts[2]>0,'aces still make occasional mistakes');
 }
});

test('late braking retains only existing speed and yields entirely when recovered',()=>{
 const ship=pilot();ship.combatPlan.overshoot=true;const s=start(ship,30);
 assert.equal(judgmentSpeed(s,.5,40,80),80);
 assert.equal(judgmentSpeed(s,.5,95,80),95,'never reduce a requested safe speed or manufacture extra speed');
 assert.ok(judgmentSpeed(s,s.started+(s.until-s.started)*.7,40,80)>40);
 assert.equal(judgmentSpeed(s,s.until,40,80),40);
 s.active=false;assert.equal(judgmentSpeed(s,.6,40,80),40);
});

test('equally skilled personalities make recognizably different mistakes',()=>{
 const observed={};
 for(const temperament of ['timid','steady','aggressive','flamboyant']){
  const ship=pilot('veteran',seededRandom('shared-personality-test'));ship.pilot.temperament=temperament;
  const counts={};let seen=0;
  for(let frame=0;frame<1200*60;frame++){
   const time=frame/60;ship.combatPressureAt=time;ship.combatThreatUntil=time+1;
   ship.combatPlan.overshoot=time%10<5;
   const state=pilotJudgment(ship,time,heading(),240,ship.combatPlan.overshoot?30:0);
   if(state&&state.errors!==seen){seen=state.errors;counts[state.kind]=(counts[state.kind]??0)+1;}
  }
  observed[temperament]=counts;
 }
 assert.ok(observed.timid.hesitate>(observed.timid['late-brake']??0),JSON.stringify(observed));
 assert.ok(observed.steady['late-turn']>observed.steady.overcorrect,JSON.stringify(observed));
 assert.ok(observed.aggressive.fixation>0&&observed.aggressive['late-brake']>0,JSON.stringify(observed));
 assert.ok(observed.flamboyant.overcorrect>observed.flamboyant['late-turn'],JSON.stringify(observed));
 assert.equal(observed.steady.hesitate,undefined);assert.equal(observed.flamboyant.fixation,undefined);
 const steady=pilot(),flamboyant=pilot();flamboyant.pilot.temperament='flamboyant';
 const regular=start(steady),showy=start(flamboyant);
 assert.ok(showy.strength>regular.strength&&showy.until-showy.started>regular.until-regular.started);
});

test('hesitation lifts throttle; fixation follows an old bearing only until correction',()=>{
 const timid=pilot();timid.pilot.temperament='timid';const hesitation=start(timid);
 assert.equal(hesitation.kind,'hesitate');
 assert.ok(judgmentSpeed(hesitation,.5,80,80)<65);assert.ok(judgmentSpeed(hesitation,.5,30,80)<30);
 assert.equal(judgmentSpeed(hesitation,hesitation.until,80,80),80);
 const aggressive=pilot();aggressive.pilot.temperament='aggressive';const fixation=start(aggressive);
 assert.equal(fixation.kind,'fixation');
 const targetTurn=new THREE.Vector3(-.7,0,-.7).normalize(),out=targetTurn.clone();
 pilotJudgment(aggressive,.6,out,240,0);
 assert.ok(out.dot(heading())>targetTurn.dot(heading()),'holds the former firing bearing after the target turns');
 assert.equal(judgmentSpeed(fixation,.6,80,80),80,'fixation grants no thrust advantage');
 assert.equal(pilotJudgment(aggressive,fixation.until+.01,out.copy(targetTurn),240,0),undefined);
 assert.ok(out.distanceTo(targetTurn)<1e-9);
 for(const ship of [timid,aggressive]){
  ship.combatPlan.visible=false;assert.equal(pilotJudgment(ship,.7,heading(),240,0),undefined);
  assert.equal(ship.pilotJudgment.active,false,'neither personality follows a hidden opponent');
 }
});

test('safe routes, close passes and authored actors cancel mistakes immediately',()=>{
 const mutations=[
  s=>s.fieldNav.active=true,s=>s.fieldNav.recovering=true,s=>s.fieldNav.safeForManeuver=false,
  s=>s.combatPlan.recovery={active:true},s=>s.combatPlan.passUntil=3,s=>s.combatPlan.crossfire={active:true},
  s=>s.targetId='other',s=>s.combatPlan.visible=false,s=>s.combatBumpAt=.5,s=>s.fleeing=true,
  s=>s.terrainManeuver={active:true},s=>s.tutorialEnemy=true,s=>s.tutorialCompanion=true,
  s=>s.storyPersonId='paul',s=>s.role='trader',s=>s.role='miner',s=>s.race=true,s=>s.capitalClass='frigate',
 ];
 for(const mutate of mutations){
  const ship=pilot(),s=start(ship);assert.ok(s?.active);mutate(ship);
  const out=heading();assert.equal(pilotJudgment(ship,.6,out,240,0),undefined);assert.equal(s.active,false);
  assert.ok(out.distanceTo(heading())<1e-9,'safety control gets the untouched heading');
 }
 const ship=pilot(),s=start(ship);assert.equal(pilotJudgment(ship,.6,heading(),70,0),undefined);assert.equal(s.active,false);
 const stale=pilot();stale.combatThreatUntil=0;assert.equal(start(stale),undefined);
});

test('lapses never start or continue within two seconds of nearby cover',()=>{
 for(const box of [false,true]){
  const ship=pilot();ship.position=[0,0,0];
  const rock={x:0,y:0,z:-100,radius:40,...box?{box:{hx:30,hy:20,hz:40}}:{}};
  ship.fieldNav.obstacles=[rock];
  assert.equal(start(ship),undefined,'a clear current heading is not permission to err beside cover');
  ship.fieldNav.obstacles=[];ship.combatPressureAt=1;
  pilotJudgment(ship,1,heading(),240,0);const lapse=pilotJudgment(ship,1.5,heading(),240,0);assert.ok(lapse?.active);
  ship.fieldNav.obstacles=[rock];const out=heading();
  assert.equal(pilotJudgment(ship,1.55,out,240,0),undefined);assert.equal(lapse.active,false);
  assert.ok(out.distanceTo(heading())<1e-9);
 }
 const ship=pilot();ship.position=[0,0,0];ship.fieldNav.obstacles=[{x:2000,y:0,z:0,radius:40}];
 assert.ok(start(ship)?.active,'distant cover does not suppress ordinary combat decisions');
});

test('a missed turn produces a real temporary positional disadvantage through ordinary flight',()=>{
 function run(mistake){
  const session=fixture(),ship=session.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'novice',temperament:'steady'},{hullId:'talon'});
  session.npcFlightStats(ship);ship.velocity=[0,0,-ship.speed];ship.rotation=[0,0,0,1];
  ship.targetId='player';ship.aiRng=()=>0;ship.fieldNav={safeForManeuver:true,active:false};
  ship.combatPlan={visible:true,nose:new THREE.Vector3(0,0,-1),clearance:35};ship.combatThreatUntil=5;
  const position=new THREE.Vector3(),velocity=new THREE.Vector3(),rotation=new THREE.Quaternion(),targetRotation=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1);
  let maximumError=0;
  for(let frame=0;frame<5*60;frame++){
   const time=frame/60;session.save.world.time=time;ship.combatPressureAt=time;
   position.fromArray(ship.position);velocity.fromArray(ship.velocity);rotation.fromArray(ship.rotation);
   const desired=heading();ship.combatPlan.nose.copy(forward).applyQuaternion(rotation);
   if(mistake)pilotJudgment(ship,time,desired,240,0);
   targetRotation.setFromUnitVectors(forward,desired);
   session.integrateNpcFlight(ship,position,velocity,rotation,targetRotation,ship.speed,false,true,1/60,false);
   position.toArray(ship.position);velocity.toArray(ship.velocity);rotation.toArray(ship.rotation);
   maximumError=Math.max(maximumError,forward.clone().applyQuaternion(rotation).angleTo(heading()));
   assert.ok([...ship.position,...ship.velocity,...ship.rotation].every(Number.isFinite));
  }
  return {position:position.clone(),nose:forward.applyQuaternion(rotation),count:ship.pilotJudgment?.errors??0,maximumError};
 }
 const clean=run(false),mistake=run(true);
 assert.equal(mistake.count,1);assert.ok(clean.position.distanceTo(mistake.position)>2,'the missed turn costs position');
 assert.ok(mistake.nose.dot(heading())>.999,'pilot corrects and flies the desired course again');
});

test('timid hesitation and aggressive fixation cost real position and then recover',()=>{
 function run(temperament,enabled){
  const session=fixture(),ship=session.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'novice',temperament},{hullId:'talon'});
  session.npcFlightStats(ship);ship.velocity=[0,0,-ship.speed];ship.rotation=[0,0,0,1];
  ship.targetId='player';ship.aiRng=()=>0;ship.fieldNav={safeForManeuver:true,active:false};
  ship.combatPlan={visible:true,nose:new THREE.Vector3(0,0,-1),clearance:35};ship.combatThreatUntil=5;
  const position=new THREE.Vector3(),velocity=new THREE.Vector3(),rotation=new THREE.Quaternion(),targetRotation=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),desired=new THREE.Vector3();
  for(let frame=0;frame<6*60;frame++){
   const time=frame/60;session.save.world.time=time;ship.combatPressureAt=time;
   position.fromArray(ship.position);velocity.fromArray(ship.velocity);rotation.fromArray(ship.rotation);
   desired.set(time>.6?-.7:.7,0,-.7).normalize();ship.combatPlan.nose.copy(forward).applyQuaternion(rotation);
   const lapse=enabled?pilotJudgment(ship,time,desired,240,0):undefined;
   targetRotation.setFromUnitVectors(forward,desired);
   const requested=judgmentSpeed(lapse,time,ship.speed,ship.speed);
   session.integrateNpcFlight(ship,position,velocity,rotation,targetRotation,requested,false,true,1/60,false);
   position.toArray(ship.position);velocity.toArray(ship.velocity);rotation.toArray(ship.rotation);
   assert.ok([...ship.position,...ship.velocity,...ship.rotation].every(Number.isFinite));
  }
  return {position:position.clone(),nose:forward.applyQuaternion(rotation),kind:ship.pilotJudgment?.kind,errors:ship.pilotJudgment?.errors};
 }
 for(const temperament of ['timid','aggressive']){
  const clean=run(temperament,false),lapse=run(temperament,true);
  assert.equal(lapse.kind,temperament==='timid'?'hesitate':'fixation');assert.equal(lapse.errors,1);
  assert.ok(lapse.position.distanceTo(clean.position)>2,`${temperament}: an actual cost in position`);
  assert.ok(lapse.nose.dot(new THREE.Vector3(-.7,0,-.7).normalize())>.999,'corrects without changing hull handling');
 }
});
