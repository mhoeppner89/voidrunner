import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {aceManeuver,maneuverHeading,maneuverSpeed} from '../../src/game/aceManeuvers.js';
import {SHIPS} from '../../src/game/data.js';
import {fixture} from '../helpers/session.mjs';
import {regenerateCombatResources} from '../../src/game/combatResources.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),styles=['timid','steady','aggressive','flamboyant'];
function pilot(temperament,tier='veteran'){
 const stats=SHIPS.talon;
 return {targetId:'player',pilot:{tier,temperament},combatFit:{stats},speed:stats.maxSpeed,velocity:[0,0,-stats.maxSpeed],fuel:50,aiRng:()=>.3,combatIntent:'hunt',
  combatPlan:{visible:true,right:V(1),up:V(0,1),escape:V(1,.2,.2).normalize(),offset:V(),clearance:45,targetVelocity:V(0,0,-70)},
  gunAim:{visible:true,targetId:'player',acceleration:V(15)}};
}
function choose(p,{time=1,nose=.1,travel=.1,closing=0,distance=180,safe=true}={}){
 return aceManeuver(p,time,distance,nose,travel,235,safe,false,nose,travel,closing);
}

test('temperament chooses an appropriate defensive move while skill still limits capability',()=>{
 const choices=[];
 for(const temperament of styles){
  const p=pilot(temperament);p.combatIntent='evade';p.combatThreatUntil=4;
  choices.push(choose(p)?.kind);
 }
 assert.deepEqual(choices,['break-turn','break-turn','break-turn','rolling-break']);
 for(const temperament of styles){
  const p=pilot(temperament,'novice');p.combatIntent='evade';p.combatThreatUntil=4;
  assert.equal(choose(p)?.kind,'break-turn','flamboyance does not grant novice acrobatics');
 }
 const timid=pilot('timid');timid.combatIntent='evade';timid.combatThreatUntil=4;
 assert.equal(choose(timid,{nose:.8,travel:1})?.kind,'break-turn','timid pilots break before the threat reaches their tail');
 const pressing=pilot('aggressive');pressing.combatIntent='evade';pressing.combatThreatUntil=4;
 assert.equal(choose(pressing,{nose:.8,travel:1}),undefined,'an aggressive pilot keeps the still-useful attack angle');
 const calm=pilot('flamboyant','ace');assert.equal(choose(calm,{nose:1,travel:1}),undefined,'no performance in place of a good shot');
});

test('risk appetite changes pursuit cuts, commitment and path width without extra thrust',()=>{
 const moves=[];
 for(const temperament of styles){
  const p=pilot(temperament,'ace');p.combatPlan.pursuit='lead';
  const move=choose(p,{nose:.8,travel:.8,closing:-30,distance:290});
  assert.equal(move?.kind,'lead-cut');moves.push(move);
  const heading=maneuverHeading(move,1.35,V(0,0,-1),290,235,V());
  assert.ok(heading.x>0&&Math.abs(heading.length()-1)<1e-9);
  assert.ok(maneuverSpeed(move,1.35,110,80)<=110);
  assert.ok(maneuverHeading(move,move.until,V(0,0,-1),290,235,V()).z<-.999);
 }
 assert.ok(moves[2].until<moves[1].until&&moves[0].until>moves[1].until,'aggressive cuts finish sooner; timid cuts leave more room');
 const cautiousCut=maneuverHeading(moves[0],1.3,V(0,0,-1),290,235,V());
 const directCut=maneuverHeading(moves[2],1.3,V(0,0,-1),290,235,V());
 assert.ok(directCut.x>cautiousCut.x+.08,'aggressive pilot takes a stronger inside line');
 const timid=pilot('timid','ace');timid.combatPlan.pursuit='lead';
 const aggressive=pilot('aggressive','ace');aggressive.combatPlan.pursuit='lead';
 assert.notEqual(choose(timid,{nose:.45,travel:.8,closing:-16,distance:320})?.kind,'lead-cut');
 assert.equal(choose(aggressive,{nose:.45,travel:.8,closing:-16,distance:320})?.kind,'lead-cut');
});

test('all temperaments yield immediately to clearance, lost targets and recovery',()=>{
 for(const temperament of styles){
  for(const cause of ['unsafe','hidden','recovery','new-target']){
   const p=pilot(temperament);p.combatIntent='evade';p.combatThreatUntil=4;const move=choose(p);assert.ok(move);
   if(cause==='hidden')p.combatPlan.visible=false;
   if(cause==='recovery')p.combatPlan.recovery={active:true};
   if(cause==='new-target')p.targetId='other';
   assert.equal(choose(p,{time:1.1,safe:cause!=='unsafe'}),undefined);
   assert.equal(p.aceMove,undefined);assert.ok(p.aceMoveReadyAt>1.1);
  }
 }
});

test('personality-shaped turns produce distinct real flight paths and return to shooting',()=>{
 const paths=[];
 for(const temperament of styles){
  const s=fixture(),p=s.spawnShip('pirate',[0,0,180],undefined,undefined,{tier:'veteran',temperament},{hullId:'talon'});
  p.targetId='player';p.rotation=[0,0,0,1];p.velocity=[0,0,-100];p.fireCommitReadyAt=100;
  p.combatFit.turrets=[];p.combatFit.missiles=0;p.combatFit.racks?.forEach(r=>r.missiles=0);s.npcFlightStats(p);
  // The same valid high-closure situation, interpreted by each personality.
  p.combatPlan={visible:true,right:V(1),up:V(0,1),escape:V(1,.2,.2),offset:V(),overshoot:true,movingEngagement:true};
  const move=choose(p,{distance:160,nose:1,travel:1,closing:100});assert.equal(move.kind,'climbing-turn');
  const pos=V(),vel=V(),q=new THREE.Quaternion(),wanted=new THREE.Quaternion(),forward=V(0,0,-1),out=V(),target=V(),targetVelocity=V(),lead=V(0,0,-1);
  let vertical=0,shots=0;
  for(let i=0;i<Math.ceil((move.until-move.started)*60);i++){
   const time=1+i/60;pos.fromArray(p.position);vel.fromArray(p.velocity);q.fromArray(p.rotation);
   maneuverHeading(move,time,lead,160,235,out);wanted.setFromUnitVectors(forward,out);
   s.integrateNpcFlight(p,pos,vel,q,wanted,maneuverSpeed(move,time,p.speed,p.speed),false,true,1/60,false);
   pos.toArray(p.position);vel.toArray(p.velocity);q.toArray(p.rotation);vertical=Math.max(vertical,Math.abs(pos.y));
   assert.ok([...p.position,...p.velocity,...p.rotation].every(Number.isFinite));
  }
  paths.push({vertical,position:p.position.slice()});p.aceMove=undefined;p.combatPlan=undefined;
  const fire=s.fireNpcGun;s.fireNpcGun=function(...args){const before=s.projectiles.length,result=fire.apply(s,args);if(s.projectiles.length>before)shots++;return result;};
  for(let i=0;i<600;i++){
   s.save.world.time=5+i/60;p.fireCooldown-=1/60;regenerateCombatResources(p,p.combatFit.resources,1/60,100);
   s.updateAttackAI(p,target,targetVelocity,1/60);
   for(const round of s.projectiles)s.projStore.free(round.slot);s.projectiles.length=0;
  }
  assert.ok(shots>0,`${temperament} returns to a projectile attack`);
 }
 assert.ok(paths[3].vertical>paths[2].vertical+5,'flamboyant turn changes more altitude than the compact aggressive turn');
 for(let i=1;i<paths.length;i++)assert.ok(V(...paths[i].position).distanceTo(V(...paths[i-1].position))>3,'different lines alter actual position');
});
