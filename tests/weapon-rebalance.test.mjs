import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
import {WEAPONS,LAUNCHERS,TRACKING_LASER,weaponRange} from '../src/game/weapons.js';
import {OUTFIT_ITEMS,loadoutFor} from '../src/game/outfitting.js';
import {TURRET_LAYOUTS} from '../src/game/turretLayouts.js';
const {relativeIntercept,guideMissile,closestHullPoint}=await import('../src/game/weaponFlight.js');
const V=(...n)=>new THREE.Vector3(...n);

test('weapon ranges end exactly at their limit, including a partial final simulation step',()=>{
 for(const [id,range] of Object.entries({beam:300,pdc:300,ripper:350,pulse:400,'pulse-mk2':400,ion:400,mortar:450,gauss:600})){
  const w=WEAPONS[id];assert.equal(weaponRange(w),range);
  if(w.kind==='beam')continue;
  const s=session(),velocity=[30,15,70],shot=s.spawnGunProjectile('player',w,V(),V(0,0,-1),velocity);
  for(let i=0;i<100;i++)s.updateProjectiles(.07);
  const displacement=s.projStore.getPos(shot.slot,V()).sub(V(...velocity).multiplyScalar(w.life));
  assert.ok(Math.abs(displacement.length()-range)<.002,`${id}: ${displacement.length()}`);
 }
 assert.equal(TRACKING_LASER.range,300);
});

test('normal rounds share exact lead and platform velocity; Gauss leads less and plasma more',()=>{
 const s=session();s.save.settings.aimAssist=true;
 const target=s.spawnShip('pirate',[0,0,-200]);target.velocity=[70,0,-60];s.getTargetRef=()=>({kind:'ship',id:target.id});
 const origin=V(),velocity=[20,0,0],directions=[];
 for(const id of ['pulse','pulse-mk2','ion','ripper','pdc']){
  const out=V(),w=WEAPONS[id];const t=relativeIntercept(origin,target.position,velocity,target.velocity,w.speed,out);
  const projectile=out.clone().normalize().multiplyScalar(w.speed).add(V(...velocity)).multiplyScalar(t);
  const movingTarget=V(...target.position).addScaledVector(V(...target.velocity),t);
  assert.ok(projectile.distanceTo(movingTarget)<1e-6);directions.push(out.normalize());
 }
 for(const d of directions)assert.ok(d.distanceTo(directions[0])<1e-10);
 const angles=['gauss','pulse','mortar'].map(id=>{const out=V();relativeIntercept(origin,target.position,velocity,target.velocity,WEAPONS[id].speed,out);return out.angleTo(V(0,0,-1));});
 assert.ok(angles[0]<angles[1]&&angles[1]<angles[2]);
 for(const id of ['pulse','pulse-mk2','ion','ripper']){
  const aim=s.weaponAimDirection(origin,velocity,WEAPONS[id],s.getTargetRef(),V(0,0,-1),V(),origin);
  const reference=s.weaponAimDirection(origin,velocity,WEAPONS.pulse,s.getTargetRef(),V(0,0,-1),V(),origin);
  assert.ok(aim.distanceTo(reference)<1e-9);
 }
});

test('per-gun damage is identical on different hulls and NPCs; plasma rewards direct hits',()=>{
 for(const hull of ['wayfarer','talon','vanguard','lancer','atlas']){
  const s=session();s.save.player.shipId=hull;
  for(const w of Object.values(WEAPONS).filter(w=>w.kind!=='beam')){
   assert.equal(s.spawnGunProjectile('player',w,V(),V(0,0,-1),[0,0,0]).damage,w.damageFlat);
   assert.equal(s.spawnGunProjectile('enemy',w,V(),V(0,0,-1),[0,0,0]).damage,w.damageFlat);
  }
 }
 assert.ok(WEAPONS.mortar.damageFlat/WEAPONS.mortar.energyCost>2*WEAPONS['pulse-mk2'].damageFlat/WEAPONS['pulse-mk2'].energyCost);
 assert.equal(OUTFIT_ITEMS.mortar.energyCost,WEAPONS.mortar.energyCost);
 const s=session(),large={id:'large',hull:1000,role:'pirate',position:[0,0,-170],rotation:[0,0,0,1]};s.ships=[large];s.npcHullExtents=()=>[70,40,90];
 const hits=[];s.damageShip=(ship,n)=>hits.push(n);s.spawnGunProjectile('player',WEAPONS.mortar,V(),V(0,0,-1),[0,0,0]);
 for(let i=0;i<60;i++)s.updateProjectiles(1/60);
 assert.deepEqual(hits,[WEAPONS.mortar.damageFlat],'impact on a hull larger than the blast radius still applies one full direct hit');
 const nearest=closestHullPoint(V(0,0,-65),large,[70,40,90],V());assert.ok(Math.abs(nearest.z+80)<1e-5);
});

test('each missile catches a sprint-engine Talon in a straight chase and obeys turn and acceleration limits',()=>{
 const s=session(),p=s.save.player;p.shipId='talon';p.ownedShips=['talon'];const fit=loadoutFor(p);fit.drive=['engine-mk2'];p.outfitting.loadouts.talon=fit;
 const targetSpeed=s.playerStats().afterburnSpeed;assert.ok(targetSpeed>114);
 for(const m of Object.values(LAUNCHERS)){
  assert.ok(m.homingSpeed>targetSpeed);
  const target=V(0,0,-300),position=V(),velocity=V(0,0,-m.speed);let caught=false;
  for(let time=0;time<m.life;time+=1/120){target.z-=targetSpeed/120;guideMissile(velocity,target.clone().sub(position),m,1/120);position.addScaledVector(velocity,1/120);if(position.distanceTo(target)<4){caught=true;break;}}
  assert.ok(caught,m.id);
  const old=V(0,0,-m.speed),turn=old.clone();guideMissile(turn,V(100,0,100),m,1/60);
  assert.ok(old.angleTo(turn)<=m.homingTurn/60+1e-7);assert.ok(Math.abs(turn.length()-m.speed)<1e-7);
  const slow=V(0,0,-20);guideMissile(slow,V(0,0,-300),m,1/60);assert.ok(slow.length()<=20+m.acceleration/60+1e-7);
 }
});

test('NPC swarm launch consumes one canister and emits four warheads after the full novice warning',()=>{
 const s=session(),ship=s.spawnShip('pirate',[0,0,250],undefined,undefined,{tier:'novice',temperament:'steady'});
 ship.rotation=[0,0,0,1];ship.velocity=[10,0,0];ship.targetId='player';ship.combatFit.launcher='swarm';ship.combatFit.missiles=1;
 for(let i=0;i<245;i++){s.save.world.time=i/60;s.updateNpcOrdnance(ship,V(),1/60);}
 assert.equal(ship.combatFit.missiles,0);assert.equal(s.projectiles.length,4);
 for(const p of s.projectiles){assert.equal(p.launcherId,'swarm');assert.ok(Math.abs(s.projStore.getVel(p.slot,V()).sub(V(...ship.velocity)).length()-300)<.001);}
});

test('PDC intercepts a full-speed seeker before impact while preserving its gun energy reserve',()=>{
 const s=session(),p=s.save.player;p.mode='mining';p.outfitting.loadouts.wayfarer.turrets=['pdc'];
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,-285);s.projStore.setVel(slot,0,0,LAUNCHERS.seeker.speed);
 const missile={...LAUNCHERS.seeker,slot,kind:'missile',ownerId:'enemy',targetId:'player'};s.projectiles.push(missile);
 let hits=0;s.damagePlayer=()=>hits++;
 for(let i=0;i<180;i++){s.save.world.time+=1/120;s.updateTurrets(p,'player',1/120);s.updateProjectiles(1/120);}
 assert.equal(missile.life,0);assert.equal(hits,0);assert.ok(s.projectiles.some(p=>p.targetMissile===missile));assert.ok(p.energy>=s.playerStats().energyCapacity*.25);
});

test('turret pivots retain the original deck anchors and only non-rear mounts gain a ten-degree forward cone',()=>{
 const original={wayfarer:[[0,1.12,.15]],vanguard:[[0,1.12,.1],[0,-1.12,.1]],prospector:[[0,1.12,.5]],lancer:[[0,1.12,.2]],atlas:[[0,1.12,.55],[0,-1.12,-.55]]};
 for(const [hull,points] of Object.entries(original))assert.deepEqual(TURRET_LAYOUTS[hull].map(m=>m.position),points);
 assert.ok(!TURRET_LAYOUTS.prospector[0].forwardCone&&!TURRET_LAYOUTS.atlas[0].forwardCone);
 for(const mounts of Object.values(TURRET_LAYOUTS))for(const mount of mounts)if(mount.forwardCone)assert.equal(mount.forwardCone,10);
});
