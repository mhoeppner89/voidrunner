import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {terrainCombatManeuver,continueTerrainManeuver} from '../../src/game/terrainManeuvers.js';
import {fieldCombatSteering} from '../../src/game/fieldCombatNav.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function setup(){
 const s=session();s.save.world.time=1;s.tmpCollide=V();s.tmpEuler=new THREE.Euler();
 const rock={id:'cover',x:0,y:0,z:0,radius:45,losRadius:45,collisionRadius:45,shape:'asteroid'};
 s.obstacles=[rock];
 const p=s.spawnShip('pirate',[53.5,0,40],undefined,undefined,{tier:'ace',temperament:'aggressive'},{hullId:'talon'});
 s.npcFlightStats(p);p.aiRng=()=>0;p.targetId='player';p.rotation=[0,0,0,1];p.velocity=[0,0,-45];p.fireCommitUntil=0;p.fireCommitReadyAt=100;p.combatIntent='evade';p.combatThreatUntil=4;p.combatPressureAt=1;
 const target=V(-100,0,60),lead=V(0,0,-1),out=V();target.toArray(s.save.player.position);
 fieldCombatSteering(s,p,target,lead,1/60,out);p.fieldNav.active=false;p.fieldNav.recovering=false;p.fieldNav.until=0;
 p.combatPlan={visible:true,right:V(1),threatPosition:target.clone()};
 return {s,p,target,lead,out,rock};
}
function select(f){return terrainCombatManeuver(f.s,f.p,f.target,f.lead,f.out);}

test('a healthy trained pilot accepts an affordable shallow scrape to break a real firing line',()=>{
 const f=setup(),move=select(f);assert.equal(move?.kind,'cover-graze');
 assert.equal(move.grazeObstacle,f.rock);assert.ok(move.expectedDamage>0&&move.expectedDamage<f.p.shield*.1);
 assert.equal(f.s.lineBlocked(f.target,move.waypoint,f.p.id),true);
 assert.ok(move.until-move.started<=1.8);assert.equal(move.canBoost,false);
 assert.equal(move.speedFactor*f.p.speed,45);
});

test('risk is refused for wrong angles, deep impacts, speed, damage and unsuitable pilots',()=>{
 const edits=[
  p=>{p.velocity=[0,0,-100];},p=>{p.hull=p.maxHull*.7;},p=>{p.shield=p.maxShield*.4;},
  p=>{p.position[0]=49;},p=>{p.velocity=[-30,0,-35];},p=>{p.pilot.tier='novice';},
  p=>{p.pilot.temperament='timid';},p=>{p.combatBumpAt=0;},p=>{p.storyPersonId='rin';},
  p=>{p.role='miner';},p=>{p.role='trader';},p=>{p.tutorialEnemy=true;},p=>{p.race=true;},
  p=>{p.pilotJudgment={active:true};},p=>{p.combatThreatUntil=0;},p=>{p.variant='unknown';},
 ];
 for(const edit of edits){const f=setup();edit(f.p);assert.notEqual(select(f)?.kind,'cover-graze',edit.toString());}
 const noBenefit=setup();noBenefit.p.combatPlan.threatPosition.set(150,0,60);assert.notEqual(select(noBenefit)?.kind,'cover-graze');
});

test('only the selected skin gets reduced clearance; neighbouring obstacles still veto the route',()=>{
 const f=setup(),move=select(f);assert.equal(move.kind,'cover-graze');
 f.p.fieldNav.nextPlan=0;fieldCombatSteering(f.s,f.p,move.waypoint,f.out,1/60,V());
 assert.equal(f.p.fieldNav.grazeObstacle,f.rock);assert.equal(f.p.fieldNav.roundField,false);
 const blocked=setup();blocked.s.obstacles.push({id:'wall',shape:'debris-mesh',x:53.5,y:0,z:-30,radius:30,losRadius:30,box:{hx:20,hy:20,hz:5,qx:0,qy:0,qz:0,qw:1}});
 blocked.p.fieldNav.obstacles.push(blocked.s.obstacles.at(-1));assert.notEqual(select(blocked)?.kind,'cover-graze','the accepted brush cannot waive a second solid object');
 const station=setup();station.rock.shape='station';assert.notEqual(select(station)?.kind,'cover-graze');
});

test('contact or deviation cancels clearance and applies a long retry cooldown',()=>{
 for(const change of [p=>{p.combatBumpAt=1.1;},p=>{p.velocity[2]=-55;},p=>{p.velocity[0]=12;},p=>{p.rotation=new THREE.Quaternion().setFromAxisAngle(V(0,1),.2).toArray();}]){
  const f=setup(),move=select(f);change(f.p);f.s.save.world.time=1.1;
  assert.equal(select(f),undefined);assert.equal(move.active,false);assert.equal(move.grazeObstacle,undefined);assert.ok(move.riskReadyAt>=21.1);
  fieldCombatSteering(f.s,f.p,f.target,f.lead,1/60,f.out);assert.equal(f.p.fieldNav.grazeObstacle,undefined);
 }
});

test('real flight pays one small shield scrape, clears cover and returns to combat',()=>{
 const f=setup(),{s,p,target}=f,move=select(f);assert.equal(move.kind,'cover-graze');p.combatPlan=undefined;
 const shield=p.shield,hull=p.hull,velocity=V();let contacts=0,damage=0,hidden=false,shots=0;
 const apply=s.damageShip.bind(s);s.damageShip=(ship,amount,...args)=>{contacts++;damage+=amount;return apply(ship,amount,...args);};
 for(let i=0;i<600;i++){
  s.save.world.time=1+i/60;p.fireCooldown-=1/60;
  if(!continueTerrainManeuver(s,p,1/60))s.updateAttackAI(p,target,velocity,1/60);
  s.resolveNpcCollisions(p);hidden ||=s.lineBlocked(target,V(...p.position),p.id);
  shots+=s.projectiles.length;for(const projectile of s.projectiles)s.projStore.free(projectile.slot);s.projectiles.length=0;
  assert.ok([...p.position,...p.velocity,...p.rotation].every(Number.isFinite));
 }
 assert.equal(contacts,1,'one brush, never grinding along the rock');assert.ok(damage>5&&damage<25);
 assert.equal(p.hull,hull);assert.ok(p.shield<shield);assert.ok(hidden,'the route reaches cover from the observed pursuer');
 assert.equal(move.active,false);assert.ok(move.riskReadyAt>s.save.world.time);assert.ok(shots>0,'ordinary combat resumes after the escape');
 assert.ok(Math.hypot(...p.velocity)>p.speed*.5,'the pilot leaves the surface instead of stalling');
});
