import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {aceManeuver,maneuverHeading} from '../../src/game/aceManeuvers.js';
import {SHIPS} from '../../src/game/data.js';
import {fixture} from '../helpers/session.mjs';
import {regenerateCombatResources} from '../../src/game/combatResources.js';

function pilot(tier='veteran',hull='talon') {
 const stats=SHIPS[hull];
 return {id:'pilot',targetId:'target',pilot:{tier},combatFit:{stats},speed:stats.maxSpeed,fuel:40,velocity:[0,0,-stats.maxSpeed],combatIntent:'hunt',aiRng:()=>.3,
  combatPlan:{visible:true,right:new THREE.Vector3(1,0,0),up:new THREE.Vector3(0,1,0),escape:new THREE.Vector3(.9,.3,.1).normalize(),offset:new THREE.Vector3(),overshoot:false}};
}
function choose(ship,{time=1,distance=160,nose=1,travel=1,range=235,safe=true,closing=0}={}) {
 return aceManeuver(ship,time,distance,nose,travel,range,safe,false,nose,travel,closing);
}
function setupMove(kind){
 const ship=pilot(kind==='boost-reversal'||kind==='rolling-break'?'ace':'veteran');
 let args={};
 if(kind==='break-turn'||kind==='rolling-break'){ship.combatIntent='evade';ship.combatThreatUntil=3;args={nose:kind==='rolling-break'?-.8:.4,travel:.2};}
 if(kind==='climbing-turn'){ship.velocity=[0,0,-110];ship.combatPlan.overshoot=true;ship.combatPlan.movingEngagement=true;args={closing:110};}
 if(kind==='oblique-intercept'){ship.combatPlan.teamRole='flank';ship.combatPlan.offset.set(90,40,0);args={distance:300,nose:.7};}
 if(kind==='boost-reversal')args={nose:-.8,travel:-.8};
 if(kind==='drift-pass'){ship.velocity=[60,0,-45];args={travel:.6};}
 return {ship,args,move:choose(ship,args)};
}

test('six maneuver choices answer distinct combat geometry rather than a random timer',()=>{
 for(const kind of ['break-turn','rolling-break','climbing-turn','oblique-intercept','boost-reversal','drift-pass']){
  const {move}=setupMove(kind);assert.equal(move?.kind,kind);assert.ok(move.until-move.started<=3.41);
 }
 const steady=pilot();assert.equal(choose(steady),undefined,'a good direct firing pass is already useful');
 const noThreat=pilot('novice');noThreat.combatIntent='evade';
 assert.equal(choose(noThreat,{nose:.4,travel:.2}),undefined,'no decorative break without an observed attacker');
});

test('pilot skill and hull handling limit the maneuver repertoire',()=>{
 const novice=pilot('novice');novice.combatIntent='evade';novice.combatThreatUntil=3;
 assert.equal(choose(novice,{nose:-.8,travel:-.8})?.kind,'break-turn');
 const heavy=pilot('ace','wayfarer');
 assert.equal(choose(heavy,{nose:-.8,travel:-.8}),undefined,'a heavy freighter does not attempt the interceptor reversal');
 heavy.velocity=[30,0,-20];assert.equal(choose(heavy,{travel:.4}),undefined,'heavy hulls keep controlled thrust instead of fighter drift shots');
 heavy.combatIntent='evade';heavy.combatThreatUntil=3;
 assert.equal(choose(heavy,{nose:.3,travel:.3})?.kind,'break-turn','a heavy hull can still make a deliberate defensive turn');
 const fieldPilot=pilot('ace');
 assert.equal(aceManeuver(fieldPilot,1,160,-.8,-.8,235,true,true)?.kind,'rolling-break','a clear field return stays powered instead of coasting into terrain');
});

test('unsafe corridors, hidden targets, recovery and authored actors cancel a commitment immediately',()=>{
 for(const flag of ['unsafe','hidden','recovery','tutorialEnemy','tutorialCompanion','capitalClass','race','holdFire']){
  const {ship}=setupMove('drift-pass');
  if(flag==='hidden')ship.combatPlan.visible=false;
  else if(flag==='recovery')ship.combatPlan.recovery={active:true};
  else if(flag!=='unsafe')ship[flag]=true;
  assert.equal(choose(ship,{time:1.1,safe:flag!=='unsafe'}),undefined,flag);
  assert.ok(ship.aceMoveReadyAt>1.1);
 }
});

test('a completed move reuses pilot state, avoids immediate repetition and ends on a usable firing line',()=>{
 const {ship,move}=setupMove('drift-pass'),entry=move.entry;
 assert.equal(choose(ship,{time:1.6,travel:.6}),undefined,'useful aim ends the drift before its time limit');
 assert.ok(ship.aceMoveRepeatAt>ship.aceMoveReadyAt);
 const later=ship.aceMoveReadyAt+.1;
 assert.equal(choose(ship,{time:later,travel:.6}),undefined,'same drift is not immediately repeated');
 ship.combatPlan.overshoot=true;ship.combatPlan.movingEngagement=true;ship.velocity=[0,0,-110];
 const climb=choose(ship,{time:later,closing:110});assert.equal(climb.kind,'climbing-turn');
 assert.equal(climb,move);assert.equal(climb.entry,entry,'no vector/array replacement on another maneuver');
 ship.targetId='different';assert.equal(choose(ship,{time:later+.1}),undefined,'do not finish a script against the wrong opponent');
});

test('maneuver headings produce distinct normalized paths and converge to the firing line',()=>{
 const lead=new THREE.Vector3(0,0,-1),out=new THREE.Vector3(),paths=[];
 for(const kind of ['break-turn','rolling-break','climbing-turn','oblique-intercept','boost-reversal','drift-pass']){
  const {move}=setupMove(kind),distance=kind==='oblique-intercept'?300:160;
  const head=maneuverHeading(move,move.started+.45,lead,distance,235,out);
  assert.equal(head,out);assert.ok(Math.abs(out.length()-1)<1e-9);assert.deepEqual(lead.toArray(),[0,0,-1]);
  paths.push(out.toArray());
  maneuverHeading(move,move.until,lead,distance,235,out);assert.ok(out.dot(lead)>.999,'end the short maneuver on a firing solution');
 }
 assert.ok(paths[0][0]>.5,'hard break crosses the incoming firing line');
 assert.ok(Math.abs(paths[2][1])>.4,'climbing turn leaves the attack plane');
 assert.ok(paths[3][0]>.2,'wingman keeps its assigned flank');
 assert.ok(Math.abs(paths[1][1])>.1,'rolling break bends through a second plane');
});

test('real flight executes the climbing turn with bounded displacement and returns to shooting',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,180],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'talon'});
 ship.targetId='player';ship.rotation=[0,0,0,1];ship.velocity=[0,0,-110];ship.fireCommitReadyAt=100;
 ship.combatFit.turrets=[];ship.combatFit.missiles=0;ship.combatFit.racks?.forEach(r=>r.missiles=0);
 s.npcFlightStats(ship);
 const target=new THREE.Vector3(),velocity=new THREE.Vector3(0,0,25),before=new THREE.Vector3();
 let sawClimb=false,vertical=0,shots=0;
 const fire=s.fireNpcGun;s.fireNpcGun=function(...args){shots++;return fire.apply(this,args);};
 for(let i=0;i<900;i++){
  s.save.world.time=i/60;target.addScaledVector(velocity,1/60);target.toArray(s.save.player.position);velocity.toArray(s.save.player.velocity);
  before.fromArray(ship.position);ship.fireCooldown-=1/60;regenerateCombatResources(ship,ship.combatFit.resources,1/60,100);
  s.updateAttackAI(ship,target,velocity,1/60);
  sawClimb ||= ship.aceMove?.kind==='climbing-turn';vertical=Math.max(vertical,Math.abs(ship.position[1]));
  assert.ok(before.distanceTo(new THREE.Vector3(...ship.position))<Math.max(110,ship.afterburnSpeed)*1.08/60,'maneuvers cannot teleport the hull');
  assert.ok([...ship.position,...ship.velocity,...ship.rotation].every(Number.isFinite));
 }
 assert.ok(sawClimb);assert.ok(vertical>5);assert.ok(shots>0,'the return must produce another attack opportunity');
});
