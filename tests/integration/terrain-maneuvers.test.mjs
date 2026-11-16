import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {terrainCombatManeuver,continueTerrainManeuver} from '../../src/game/terrainManeuvers.js';
import {SHIPS} from '../../src/game/data.js';
import {regenerateCombatResources} from '../../src/game/combatResources.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const asteroid=(id,x,z,r=45)=>({id,x,y:0,z,radius:r,losRadius:r,collisionRadius:r,shape:'asteroid'});
function setup(position=[0,0,180],target=[0,0,-200],obstacles=[]){
 const s=fixture();s.obstacles=obstacles;s.save.world.time=1;
 const ship=s.spawnShip('pirate',position,undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'talon'});
 s.npcFlightStats(ship);
 const t=new THREE.Vector3(...target),direction=t.clone().sub(new THREE.Vector3(...position)).normalize();
 ship.rotation=new THREE.Quaternion().setFromUnitVectors(V(0,0,-1),direction).toArray();ship.velocity=direction.clone().multiplyScalar(SHIPS.talon.maxSpeed).toArray();
 ship.targetId='player';ship.fireCommitUntil=0;ship.combatIntent='hunt';ship.fieldNav={obstacles,active:false,recovering:false};
 ship.combatPlan={visible:true,right:V(1,0,0),threatPosition:t.clone(),supportApproach:false};
 s.save.player.position=[...target];return {s,ship,t,lead:direction,out:V(0,0,0)};
}
function step(f,dt=.3){f.s.save.world.time+=dt;return terrainCombatManeuver(f.s,f.ship,f.t,f.lead,f.out);}

test('an asteroid shoulder wrap breaks an observed line of fire with two hull-clear legs',()=>{
 const f=setup([-120,0,50],[0,0,200],[asteroid('shoulder',0,0)]),p=f.ship;
 // Already crossing the shoulder; a pursuer is firing from the open side.
 p.rotation=new THREE.Quaternion().setFromUnitVectors(V(0,0,-1),V(.4,0,-1).normalize()).toArray();p.velocity=[30,0,-65];
 p.combatIntent='evade';p.combatThreatUntil=4;p.combatPressureAt=1;
 const move=step(f);assert.equal(move?.kind,'asteroid-wrap');assert.ok(move.hasSecond);
 assert.equal(f.s.lineBlocked(p.combatPlan.threatPosition,move.second,p.id),true,'finish actually breaks the observed firing line');
 assert.equal(f.s.lineBlocked(V(...p.position),move.waypoint,p.id),false);
 assert.equal(f.s.lineBlocked(move.waypoint,move.second,p.id),false);
 assert.ok(move.until-move.started<=4.2);assert.ok(f.out.dot(V(0,0,-1))>.4);
});

test('rear pressure can prompt cover, but an old combat memory cannot',()=>{
 for(const recent of [true,false]){
  const f=setup([-120,0,50],[0,0,200],[asteroid('shoulder',0,0)]),p=f.ship;
  p.rotation=new THREE.Quaternion().setFromUnitVectors(V(0,0,-1),V(.4,0,-1).normalize()).toArray();p.velocity=[30,0,-65];
  p.combatIntent='hunt';p.combatThreatUntil=40;p.combatPressureAt=recent?1:-30;
  assert.equal(step(f)?.kind,recent?'asteroid-wrap':undefined);
 }
});

test('a wreck pop-out exposes the last observed target without knowing hidden motion',()=>{
 const wreck={id:'plate',x:0,y:0,z:0,radius:80,shape:'debris-mesh',box:{hx:40,hy:60,hz:30,qx:0,qy:0,qz:0,qw:1}};
 const f=setup([0,0,160],[0,0,-200],[wreck]);
 assert.equal(step(f),undefined,'a visible firing line needs no decorative detour');
 f.ship.combatPlan.visible=false;f.ship.fieldNav.active=true;
 f.t.set(900,700,600);const move=step(f);assert.equal(move?.kind,'wreck-popout');
 assert.deepEqual(move.target.toArray(),[0,0,-200],'only prior observation informs the route');
 assert.equal(f.s.lineBlocked(move.waypoint,move.target,f.ship.id),false);
 assert.equal(f.s.lineBlocked(V(...f.ship.position),move.waypoint,f.ship.id),false);
});

test('a clear side waypoint is rejected when momentum would first carry the hull into a plate',()=>{
 const wreck={id:'plate',x:0,y:0,z:0,radius:80,shape:'debris-mesh',box:{hx:40,hy:60,hz:30,qx:0,qy:0,qz:0,qw:1}};
 const f=setup([0,0,90],[0,0,-200],[wreck]);step(f);f.ship.combatPlan.visible=false;f.ship.fieldNav.active=true;
 assert.equal(step(f),undefined,'the pilot cannot erase forward momentum to reach a clear corner');
});

test('a supporting fighter crosses a real gap only when both legs fit the hull',()=>{
 const f=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40)]);
 f.ship.combatPlan.supportApproach=true;const move=step(f);assert.equal(move?.kind,'gap-dash');
 assert.ok(Math.abs(move.waypoint.x)<.01);assert.ok(move.second.z<move.waypoint.z-60);
 const blocked=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40),asteroid('exit',0,-75,25)]);
 blocked.ship.combatPlan.supportApproach=true;assert.equal(step(blocked),undefined,'a gap with a blocked exit is rejected');
 const narrow=setup([0,0,180],[0,0,-200],[asteroid('left',-50,0,40),asteroid('right',50,0,40)]);
 narrow.ship.combatPlan.supportApproach=true;assert.equal(step(narrow),undefined,'center-ray visibility alone cannot approve a narrow slit');
});

test('terrain commitments finish, reuse state and stop for new obstructions or recovery',()=>{
 const make=()=>{const f=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40)]);f.ship.combatPlan.supportApproach=true;return f;};
 const f=make(),move=step(f),waypoint=move.waypoint;
 move.waypoint.toArray(f.ship.position);step(f);assert.equal(move.stage,1);
 move.second.toArray(f.ship.position);assert.equal(step(f),undefined);assert.equal(move.active,false);assert.ok(move.readyAt>f.s.save.world.time);
 f.ship.position=[0,0,180];f.s.save.world.time=move.repeatAt+1;assert.equal(step(f),move);assert.equal(move.waypoint,waypoint);
 f.s.obstacles.push(asteroid('new-wall',0,95,25));assert.equal(step(f),undefined,'recheck aborts a newly obstructed approach');
 const recovery=make();step(recovery);recovery.ship.fieldNav.recovering=true;assert.equal(step(recovery),undefined);
});

test('terrain planning stays sampled and does not interrupt shots or authored actors',()=>{
 for(const flag of ['tutorialEnemy','tutorialCompanion','capitalClass','race','fleeing','holdFire']){
  const f=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40)]);f.ship[flag]=true;f.ship.combatPlan.supportApproach=true;assert.equal(step(f),undefined,flag);
 }
 const f=setup([0,0,180],[0,0,-200],[asteroid('one',100,0,40)]);
 for(let i=0;i<120;i++)step(f,1/60);assert.ok(f.ship.terrainManeuver.plans<=9);
 f.ship.fireCommitUntil=100;const before=f.ship.terrainManeuver.plans;for(let i=0;i<60;i++)step(f,1/60);assert.equal(f.ship.terrainManeuver.plans,before);
 const novice=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40)]);novice.ship.pilot.tier='novice';assert.equal(step(novice),undefined);
});

test('a bounded terrain move survives occlusion using only its last observed opponent',()=>{
 const f=setup([0,0,180],[0,0,-200],[asteroid('left',-100,0,40),asteroid('right',100,0,40)]);
 f.ship.combatPlan.supportApproach=true;const move=step(f);f.s.save.player.dockedAt=undefined;
 f.s.shipTracksPlayer=()=>false;f.s.save.player.position=[900,800,700];f.s.save.player.velocity=[90,80,70];
 let calls=0;f.s.updateAttackAI=(ship,position,velocity)=>{calls++;assert.deepEqual(position.toArray(),[0,0,-200]);assert.equal(velocity.length(),0);assert.equal(ship.recoveryTargetHidden,true);};
 assert.equal(continueTerrainManeuver(f.s,f.ship,1/60),true);assert.equal(calls,1);assert.equal(f.ship.recoveryTargetHidden,false);assert.equal(move.targetHidden,true,'later automatic weapons retain the actual perception state');
 f.ship.recoveryTargetHidden=true;f.ship.combatPlan.visible=true;
 terrainCombatManeuver(f.s,f.ship,V(900,800,700),f.lead,f.out);
 assert.equal(move.targetHidden,true,'cached plan visibility cannot override a fresh occlusion');assert.deepEqual(move.target.toArray(),[0,0,-200]);f.ship.recoveryTargetHidden=false;
 f.s.shipTracksPlayer=()=>true;f.s.lineBlocked=()=>false;
 f.s.updateAttackAI=(ship,position,velocity)=>{assert.deepEqual(position.toArray(),[900,800,700]);assert.deepEqual(velocity.toArray(),[90,80,70]);assert.equal(ship.recoveryTargetHidden,false);};
 continueTerrainManeuver(f.s,f.ship,1/60);assert.equal(move.targetHidden,false);
 f.s.save.world.time=move.until+.01;assert.equal(continueTerrainManeuver(f.s,f.ship,1/60),false);assert.equal(move.active,false);
});

test('real flight anticipates a wreck crossing, reaches its outside edge and resumes firing without contact',()=>{
 const s=fixture(),target=V(220,0,-200),velocity=V(-120,0,0);
 s.save.player.dockedAt=undefined;s.tmpCollide=V(0,0,0);s.tmpEuler=new THREE.Euler();
 s.obstacles=[{id:'plate',x:0,y:0,z:0,radius:80,collisionRadius:80,shape:'debris-mesh',box:{hx:40,hy:60,hz:30,qx:0,qy:0,qz:0,qw:1}}];
 const p=s.spawnShip('pirate',[0,0,180],undefined,undefined,{tier:'ace',temperament:'steady'},{hullId:'talon'});
 p.targetId='player';p.hostile=true;p.rotation=[0,0,0,1];p.velocity=[0,0,-65];p.fireCommitReadyAt=100;
 p.combatFit.turrets=[];p.combatFit.missiles=0;p.combatFit.racks?.forEach(r=>r.missiles=0);s.npcFlightStats(p);
 let contacts=0,shotsAfter=0,endedAt=0,sawApproach=false,sawEdge=false,sawHidden=false,sawExposed=false;
 s.damagePlayer=()=>{};s.damageShip=()=>contacts++;
 const fire=s.fireNpcGun;
 s.fireNpcGun=function(...args){const count=s.projectiles.length,result=fire.apply(this,args);if(endedAt&&s.projectiles.length>count)shotsAfter++;return result;};
 for(let i=0;i<1200;i++){
  s.save.world.time=i/60;target.set(Math.max(0,220-i/60*120),0,-200);velocity.set(i/60<220/120?-120:0,0,0);
  target.toArray(s.save.player.position);velocity.toArray(s.save.player.velocity);p.fireCooldown-=1/60;
  regenerateCombatResources(p,p.combatFit.resources,1/60,100);
  if(!continueTerrainManeuver(s,p,1/60))s.updateAttackAI(p,target,velocity,1/60);
  s.resolveNpcCollisions(p);
  const move=p.terrainManeuver;
  if(move?.active&&move.kind==='wreck-popout'){
   sawApproach=true;sawEdge ||= move.stage===1;sawHidden ||= move.targetHidden;
   if(move.stage===1&&!move.targetHidden)sawExposed=true;
  }else if(sawApproach&&!endedAt)endedAt=s.save.world.time;
  assert.ok([...p.position,...p.velocity,...p.rotation].every(Number.isFinite));
  for(const round of s.projectiles)s.projStore.free(round.slot);s.projectiles.length=0;
 }
 assert.ok(sawApproach&&sawEdge&&sawHidden&&sawExposed,'the pilot physically clears the shoulder and sees the enemy again');
 assert.ok(endedAt>1&&endedAt<4,'clear sight ends the maneuver before its timeout');
 assert.equal(contacts,0);assert.ok(shotsAfter>20,'the outside route produces real attack opportunities');
});
