import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {fixture} from './combat-variety.test.mjs';
import {planCombatFlight,combatPursuitDirection,friendlyFiringLaneBlocked} from '../src/game/combatPlanning.js';
import {combatThrottle,updateCombatIntent,holdingFiringWindow} from '../src/game/combatPiloting.js';
import {registerHitReaction} from '../src/game/flightDynamics.js';
import {aceManeuver} from '../src/game/aceManeuvers.js';
import {SHIPS} from '../src/game/data.js';
import {regenerateCombatResources} from '../src/game/combatResources.js';

const origin=new THREE.Vector3(),forward=new THREE.Vector3(0,0,-1);
function setup(tier='ace',position=[0,0,240]){
 const s=fixture(),ship=s.spawnShip('pirate',position,undefined,undefined,{tier,temperament:'steady'});
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,-76];ship.targetId='player';ship.combatIntent='hunt';
 ship.combatFit.profile.range=235;ship.combatFit.weapons=['pulse'];ship.combatFit.fireAt=[0];ship.combatWeaponIndex=0;
 s.npcFlightStats(ship);return {s,ship};
}
function plan(s,ship,velocity=origin,lead=forward){
 const distance=Math.hypot(...ship.position),closing=-ship.velocity[2]+velocity.z;
 return planCombatFlight(s,ship,origin,velocity,lead,distance,closing);
}
test('braking uses hull acceleration and future turning room, and cuts an active boost before overshoot',()=>{
 const {s,ship}=setup();ship.velocity=[0,0,-120];ship.combatBoostUntil=2;
 const p=plan(s,ship);assert.equal(p.overshoot,true);
 const fastHull=p.brakingDistance;
 const speed=combatThrottle(ship,0,240,120,0,1,235,true);
 assert.equal(ship.burning,false);assert.ok(speed>=ship.speed*.45&&speed<ship.speed);
 ship.combatFit.stats=SHIPS.lancer;s.save.world.time=.3;plan(s,ship);assert.ok(p.brakingDistance>fastHull);
 ship.position[2]=1000;s.save.world.time=.6;plan(s,ship);assert.equal(p.overshoot,false);
});
test('pursuit cuts off distant targets and records lag pursuit without spoiling an available firing line',()=>{
 const {s,ship}=setup('ace',[0,0,450]),out=new THREE.Vector3(),gunLead=new THREE.Vector3(.4,0,-1).normalize();
 const p=plan(s,ship,new THREE.Vector3(50,0,-40),gunLead);assert.equal(p.pursuit,'lead');
 combatPursuitDirection(ship,origin,gunLead,450,out);assert.ok(out.x>0);
 ship.position[2]=160;s.save.world.time=.3;plan(s,ship,new THREE.Vector3(50,0,-40),gunLead);assert.equal(p.pursuit,'lag');
 combatPursuitDirection(ship,origin,gunLead,160,out);assert.ok(out.dot(gunLead)>.99999);assert.ok(Math.abs(gunLead.x-.4/Math.sqrt(1.16))<1e-10);
 ship.position[2]=300;s.save.world.time=.6;plan(s,ship,origin,forward);assert.equal(p.pursuit,'direct');
});
test('trained hunters match range while guns cool down and keep their heading during an energy recharge',()=>{
 for(const tier of ['veteran','ace']){
  const {s,ship}=setup(tier,[0,0,200]);ship.energy=0;ship.combatWeaponIndex=-1;
  const lead=new THREE.Vector3(.1,0,-1).normalize(),p=plan(s,ship,new THREE.Vector3(30,0,-20),lead);
  assert.equal(p.aimingRun,true,'cooling guns still have the same firing geometry');
  assert.ok(p.preferredRange>235&&p.preferredRange<400);
  updateCombatIntent(ship,0,200,50);assert.equal(ship.combatIntent,'hunt');assert.ok(ship.energyRecoverUntil>0&&ship.energyRecoverUntil<=1.2);
  const out=new THREE.Vector3();combatPursuitDirection(ship,origin,lead,200,out);assert.ok(out.dot(lead)>.99999);
  const speed=combatThrottle(ship,0,200,50,20,1,235,true);assert.ok(speed<ship.speed*.65&&speed>=ship.speed*.25);assert.equal(ship.burning,false);
 }
});
test('trained pilots choose the open vertical escape when both sides and the lower corridor are blocked',()=>{
 const {s,ship}=setup('veteran',[0,0,180]);ship.evasiveUntil=3;s.save.player.rotation=[0,1,0,0];
 s.lineBlocked=(a,b)=>b.z>80&&(Math.abs(b.x)>.01||b.y<-.01);
 const p=plan(s,ship);assert.equal(p.escapeChoice,2);assert.ok(p.escape.y>.7);
 const direction=p.escape.toArray();s.save.world.time=.3;plan(s,ship);assert.deepEqual(p.escape.toArray(),direction,'commit instead of changing direction on every plan');
});
test('trained pilots briefly finish an affordable shot, but heavy fire and novice reflexes still cause a break',()=>{
 for(const tier of ['novice','veteran','ace']){
  const {s,ship}=setup(tier,[0,0,235]);ship.velocity=[0,0,0];plan(s,ship);
  registerHitReaction(ship,0,tier==='novice'?.33:14);
  updateCombatIntent(ship,.31,235,0);
  assert.equal(holdingFiringWindow(ship,.31),tier!=='novice');
  assert.equal(ship.combatIntent,tier==='novice'?'evade':'hunt');
  registerHitReaction(ship,.32,90);updateCombatIntent(ship,.6,235,0);assert.equal(ship.combatIntent,'evade');
 }
});
test('drifts end after recovering a useful firing attitude, and unsafe paths cancel immediately',()=>{
 const {ship}=setup();ship.aceMove={kind:'drift-pass',started:0,until:2};
 assert.equal(aceManeuver(ship,.5,150,1,.5,235,true,false,1,.7),undefined);
 assert.ok(ship.aceMoveReadyAt>.5);
 ship.aceMove={kind:'boost-reversal',started:0,until:3.4};ship.combatPlan={overshoot:true};
 assert.equal(aceManeuver(ship,1.2,150,1,.5,235,true,false,1,.7)?.kind,'boost-reversal');
 assert.equal(aceManeuver(ship,1.3,150,1,.5,235,false,false,1,.7),undefined);
});
test('unproductive circling gets a bounded new approach; firing, cover and target changes reset that decision',()=>{
 for(const mode of ['stalled','firing','cover','navigation']){
  const {s,ship}=setup('ace',[0,0,300]);ship.rotation=[0,1,0,0];ship.velocity=[0,0,0];ship.combatWeaponIndex=-1;
  if(mode==='cover')s.lineBlocked=()=>true;
  if(mode==='navigation')ship.fieldNav={active:true};
  for(let i=0;i<30;i++){s.save.world.time=i*.25;if(mode==='firing')ship.lastCombatShotAt=s.save.world.time;plan(s,ship);}
  assert.equal(Boolean(ship.combatPlan.reapproachCount),mode==='stalled');
  if(mode==='stalled')assert.ok(ship.combatPlan.reapproachUntil<ship.combatPlan.reapproachReadyAt);
  ship.targetId='different';s.save.world.time+=.25;plan(s,ship);assert.equal(ship.combatPlan.reapproachUntil,0);
 }
});
test('allies share one pressure pilot, choose different flanks, and withhold rounds through an ally',()=>{
 const {s,ship:leader}=setup('ace',[0,0,150]);
 const wings=[];
 for(let i=0;i<2;i++){
  const wing=s.spawnShip('pirate',[0,0,450],undefined,undefined,{tier:'veteran'});wing.rotation=[0,0,0,1];wing.velocity=[0,0,-60];wing.targetId='player';wing.combatIntent='hunt';wing.combatFit.profile.range=235;s.npcFlightStats(wing);wings.push(wing);
 }
 for(const ship of [leader,...wings])plan(s,ship);
 assert.equal(leader.combatPlan.teamRole,'pressure');assert.ok(wings.every(w=>w.combatPlan.teamLeaderId===leader.id&&w.combatPlan.teamRole==='flank'));
 assert.ok(wings[0].combatPlan.offset.dot(wings[1].combatPlan.offset)<0);
 assert.equal(friendlyFiringLaneBlocked(s,wings[0],new THREE.Vector3(...wings[0].position),forward,450),true);
 leader.position[0]=100;wings[1].position[0]=-100;
 assert.equal(friendlyFiringLaneBlocked(s,wings[0],new THREE.Vector3(...wings[0].position),forward,450),false);
 leader.combatIntent='evade';s.save.world.time=.6;plan(s,wings[0]);assert.notEqual(wings[0].combatPlan.teamLeaderId,leader.id);
});
test('moving-target pursuit retains forward firing opportunities through turns and capacitor recovery',()=>{
 for(const tier of ['veteran','ace']){
  const {s,ship}=setup(tier,[0,0,300]);ship.velocity=[0,0,-60];ship.combatFit.turrets=[];ship.combatFit.missiles=0;
  const fit=ship.combatFit;fit.attackOrder=[0];ship.energy=fit.stats.energyCapacity;
  const target=new THREE.Vector3(),velocity=new THREE.Vector3(),nose=new THREE.Vector3(),q=new THREE.Quaternion();let aligned=0,close=0,error=0,samples=0;
  for(let i=0;i<1800;i++){
   const t=i/60;s.save.world.time=t;target.set(160*Math.sin(t*.375),20*Math.sin(t*.55),160*(1-Math.cos(t*.375)));velocity.set(60*Math.cos(t*.375),11*Math.cos(t*.55),60*Math.sin(t*.375));
   target.toArray(s.save.player.position);velocity.toArray(s.save.player.velocity);
   ship.fireCooldown-=1/60;regenerateCombatResources(ship,fit.resources,1/60,100);s.updateAttackAI(ship,target,velocity,1/60);
   if(i>=300){samples++;nose.set(0,0,-1).applyQuaternion(q.fromArray(ship.rotation));const angle=nose.angleTo(s.tmpG);error+=angle;if(angle<Math.PI/45)aligned++;if(target.distanceTo(nose.fromArray(ship.position))<120)close++;}
  }
  assert.ok(aligned/samples>.8,`${tier} aligned ${aligned/samples}`);assert.ok(error/samples<3*Math.PI/180,`${tier} mean angle ${error/samples}`);assert.ok(close/samples<.3,`${tier} close fraction ${close/samples}`);assert.ok(s.projectiles.length>30);
 }
});
