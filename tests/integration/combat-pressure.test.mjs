import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture,session} from '../helpers/session.mjs';
import {npcPlayerAttackWindow} from '../../src/game/combatAwareness.js';
import {WEAPONS} from '../../src/game/weapons.js';

function group(count=3){
 const s=fixture();s.save.player.dockedAt=undefined;s.save.player.position=[0,0,0];s.save.player.velocity=[0,0,0];
 const pilots=[];
 for(let i=0;i<count;i++){
  const ship=s.spawnShip('pirate',[i*25,0,180+i*25],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
  ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...ship.position).negate().normalize()).toArray();
  ship.targetId='player';ship.combatIntent='hunt';pilots.push(ship);
 }
 return {s,pilots};
}

test('a lone opponent and NPC-versus-NPC fights retain their full firing opportunities',()=>{
 const {s,pilots:[pilot]}=group(1);s.save.player.velocity=[80,0,0];
 for(let i=0;i<300;i++){s.save.world.time=i/60;assert.equal(npcPlayerAttackWindow(s,pilot),true);}
 const swarm=group(3);for(const ship of swarm.pilots){ship.targetId='other-npc';assert.equal(npcPlayerAttackWindow(swarm.s,ship),true);}
});

test('outnumbering fighters overlap brief support bursts with a continuous pressure pilot',()=>{
 const {s,pilots}=group(),counts=[0,0,0];
 for(let i=0;i<600;i++){
  s.save.world.time=i/60;let ready=0;
  pilots.forEach((p,j)=>{if(npcPlayerAttackWindow(s,p)){counts[j]++;ready++;}});
  assert.ok(ready>=1,'the player is never granted a group-wide ceasefire');
 }
 assert.equal(counts[0],600);
 for(const count of counts.slice(1))assert.ok(count>140&&count<300,counts.join('/'));
});

test('crossing flight makes supporting attackers reacquire; stationary flight remains more exposed',()=>{
 const sampled=[];
 for(const speed of [0,70]){
  const {s,pilots}=group();s.save.player.velocity=[speed,0,0];let supportShots=0;
  for(let i=0;i<600;i++){s.save.world.time=i/60;for(const p of pilots.slice(1))supportShots+=Number(npcPlayerAttackWindow(s,p));}
  sampled.push(supportShots);
 }
 assert.ok(sampled[1]<sampled[0]*.8,JSON.stringify(sampled));assert.ok(sampled[1]>0);
});

test('allied support widens passes while an outnumbered 2v3 retains pacing',()=>{
 const measure=allies=>{
  const {s,pilots}=group();
  for(let i=0;i<allies;i++){const ally=s.spawnShip('patrol',[20+i*25,0,100]);ally.hostile=false;ally.targetId=pilots[0].id;}
  let ready=0;
  for(let i=0;i<600;i++){s.save.world.time=i/60;for(const p of pilots.slice(1))ready+=Number(npcPlayerAttackWindow(s,p));assert.equal(npcPlayerAttackWindow(s,s.playerAttackGroup.lead),true);}
  return ready;
 };
 const solo=measure(0),supported=measure(1),equal=measure(2);
 assert.ok(supported>solo&&supported<equal,`${solo}/${supported}/${equal}`);
 assert.equal(equal,1200,'equal numbers have ordinary firing opportunities');
 const {s,pilots}=group();npcPlayerAttackWindow(s,pilots[0]);
 const leader=s.playerAttackGroup.lead;leader.surrendered=true;
 npcPlayerAttackWindow(s,pilots[1]);assert.notEqual(s.playerAttackGroup.lead,leader);
 assert.equal(npcPlayerAttackWindow(s,s.playerAttackGroup.lead),true);
});

test('a supporting pilot holds gun energy and missile ammunition until its attack pass',()=>{
 const {s,pilots}=group(),ship=pilots[1],fit=ship.combatFit;
 s.lineBlocked=()=>false;ship.energy=100;ship.combatWeaponIndex=0;
 fit.guns=['pulse-cannon'];fit.gunIndices=[0];fit.weapons=['pulse'];fit.weaponDefinitions=[WEAPONS.pulse];fit.fireAt=[0];fit.attackOrder=[0];
 const direction=new THREE.Vector3(...ship.position).negate().normalize();
 s.fireNpcGun(ship,direction);assert.equal(s.projectiles.length,0);assert.equal(ship.energy,100);assert.equal(fit.fireAt[0],0);
 fit.racks=undefined;fit.launcher='swarm';fit.missiles=2;fit.lockTarget='player';fit.lock=5;fit.warned=true;fit.warnedAt=-5;fit.launchAt=-1;
 s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);assert.equal(fit.missiles,2);assert.equal(ship.energy,100);
 // At one second this support pilot's window opens; the acquired lock remains valid.
 s.save.world.time=1.05;s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);
 assert.equal(fit.missiles,1);assert.ok(s.projectiles.some(p=>p.kind==='missile'));
});

test('supporting offensive turrets respect the pass window while missile defense remains available',()=>{
 const s=session();s.save.player.position=[0,150,0];
 const lead=s.spawnShip('pirate',[0,150,100],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
 const support=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'wayfarer'});
 for(const p of [lead,support]){p.targetId='player';p.hostile=true;p.rotation=[0,0,0,1];p.velocity=[0,0,0];p.combatIntent='hunt';}
 support.combatFit.turrets=['pdc'];
 for(let i=0;i<45;i++){s.save.world.time=i/60;support.energy=100;s.updateTurrets(support,support.id,1/60);}
 assert.equal(s.projectiles.length,0,'support pass has not opened');
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,-150,0);s.projStore.setVel(slot,0,260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'player',targetId:support.id,life:3});
 // A fresh closed window gives the physical turret time to slew to the missile.
 for(let i=0;i<60;i++){s.save.world.time=3.2+i/60;support.energy=100;s.updateTurrets(support,support.id,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetMissile?.id==='incoming'));
 assert.ok(s.projectiles.every(p=>p.id==='incoming'||p.targetMissile),'no offensive shot leaks through the defense exception');
});

test('offensive turrets wait for sensor reacquisition after a cover maneuver',()=>{
 const s=session(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'wayfarer'});
 ship.targetId='player';ship.hostile=true;ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
 ship.combatFit.turrets=['tracking-turret'];ship.terrainManeuver={active:true,targetHidden:true};
 s.save.player.position=[0,-100,0];let shots=0;s.fireBeam=()=>shots++;
 for(let i=0;i<120;i++){s.save.world.time=i/60;ship.energy=100;s.updateTurrets(ship,ship.id,1/60);}
 assert.equal(shots,0,'physical line of sight alone does not restore a firing-quality track');
 ship.terrainManeuver.targetHidden=false;
 for(let i=0;i<120;i++){s.save.world.time=2+i/60;ship.energy=100;s.updateTurrets(ship,ship.id,1/60);}
 assert.ok(shots>0,'the same turret resumes once its opponent is reacquired');
});
