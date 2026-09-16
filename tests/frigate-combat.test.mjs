import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {equipFrigate,updateFrigateBatteries,updateFrigateAttack,frigateMountPosition,damageFrigateMount,FRIGATE_GUN,FRIGATE_BOSS_GUN,FRIGATE_EXTENTS,visibleFrigateBatteries} from '../src/game/capitalCombat.js';
import {WEAPON_DAMAGE_SCALE} from '../src/game/weapons.js';
import {FRIGATE_MOUNTS} from '../src/game/frigateMounts.js';
import {cockpitDamageStage} from '../src/game/cockpitDamage.js';
import {fixture} from './combat-variety.test.mjs';
function stage(){const s=fixture();s.tmpAvoidance=new THREE.Vector3();s.save.player.position=[180,0,0];s.save.player.velocity=[0,0,0];s.save.player.hull=185;const ship=s.spawnCapitalShip('concord-frigate',[0,0,0],'rook','Boss');equipFrigate(ship,true);ship.rotation=[0,0,0,1];ship.targetId='player';ship.hostile=true;ship.holdFire=false;return {s,ship};}
test('cockpit stages have exact boundaries and repair without permanent corruption',()=>{for(const [f,stage] of [[1,0],[.75,0],[.749,1],[.5,1],[.499,2],[.25,2],[.249,3],[.1,3],[.099,4],[1,0]])assert.equal(cockpitDamageStage(f),stage);});
test('frigate main batteries get a capital-only damage lift without changing weapon scaling',()=>{
 assert.equal(FRIGATE_GUN,FRIGATE_BOSS_GUN);
 assert.equal(FRIGATE_GUN.damageFlat,72*WEAPON_DAMAGE_SCALE);
 assert.equal(FRIGATE_GUN.energyCost,12);
});
test('frigate charges, fires finite physical salvos, and does not use forward fighter fire',()=>{const {s,ship}=stage();const rounds=[];s.spawnGunProjectile=(owner,w,start,dir)=>{rounds.push({time:s.save.world.time,w,pos:start.toArray(),dir:dir.toArray()});};s.fireNpcGun=()=>assert.fail('legacy forward fire');
 const target=new THREE.Vector3(180,0,0),velocity=new THREE.Vector3();
 for(let i=0;i<1200;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,target,velocity,1/60);}
 const main=rounds.filter(r=>r.w===FRIGATE_BOSS_GUN);assert.ok(main.length>3);assert.ok(main[0].time>=1.6);assert.ok(main.length<50);assert.ok(main.every(r=>r.pos.every(Number.isFinite)&&r.dir.every(Number.isFinite)));assert.ok(ship.energy>=0);assert.ok(Math.hypot(...ship.velocity)<=18.001);
});
test('cover and stand-offs prevent main battery fire',()=>{for(const held of [false,true]){const {s,ship}=stage();ship.holdFire=held;s.lineBlocked=()=>!held;let shots=0;s.spawnGunProjectile=()=>shots++;
 for(let i=0;i<600;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}assert.equal(shots,0);}});
test('exposed turret damage disables only the hit assembly',()=>{const {s,ship}=stage();const pos=frigateMountPosition(ship,2,new THREE.Vector3()).toArray();assert.equal(damageFrigateMount(ship,pos,100),2);assert.equal(ship.capitalMountHull[2],0);assert.equal(ship.capitalMountHull[0],100);assert.equal(damageFrigateMount(ship,[0,0,0],20),-1);let shown=[];s.renderer.showTurret=(id)=>shown.push(id);updateFrigateBatteries(s,ship,1/60);assert.ok(!shown.includes(`${ship.id}-main-2`));assert.equal(shown.length,7);});
test('hostile patrols keep the player target; friendly patrols still defend against hostiles',()=>{const {s,ship}=stage();ship.playerAwareness=1;s.shipTracksPlayer=()=>true;s.resolveShipTarget(ship);assert.equal(ship.targetId,'player');const friend=s.spawnShip('patrol',[0,0,50]);friend.hostile=false;s.resolveShipTarget(friend);assert.equal(friend.targetId,ship.id);});
test('all four frigate PDC mounts share one missile recovery channel',()=>{const {s,ship}=stage();ship.targetId=null;s.save.player.position=[900,900,900];s.pdcAssignments=new Map();let launches=0;const fire=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...args)=>{launches++;return fire(...args);};for(let i=0;i<4;i++){const slot=s.projStore.alloc();s.projStore.setPos(slot,0,170+i*2,-36);s.projStore.setVel(slot,0,-260,0);s.projectiles.push({id:'incoming'+i,slot,kind:'missile',ownerId:'player',targetId:ship.id,life:4,damage:42});}for(let i=0;i<30;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60);}assert.equal(launches,1);});
test('a real beam hit destroys an exposed assembly only after shields are down',()=>{const {s,ship}=stage();const pos=frigateMountPosition(ship,2,new THREE.Vector3()),start=pos.clone().add(new THREE.Vector3(100,0,0)),dir=new THREE.Vector3(-1,0,0),beam={id:'beam',kind:'beam',range:250,damageFlat:110};s.fireBeam('player',beam,start,dir,'test');assert.equal(ship.capitalMountHull[2],100);ship.shield=0;s.fireBeam('player',beam,start,dir,'test');assert.equal(ship.capitalMountHull[2],0);assert.ok(ship.hull<1400);});
test('frigate approach remains continuous across the old range threshold and keeps its broadside',()=>{
 const {s,ship}=stage();ship.holdFire=true;let previous;
 for(const distance of [649.99,650.01,649.99,650.01]){
  ship.position.fill(0);ship.rotation=[0,0,0,1];
  updateFrigateAttack(s,ship,new THREE.Vector3(0,0,-distance),new THREE.Vector3(),0);
  const goal=ship.capitalRuntime.goal.clone();if(previous)assert.ok(goal.angleTo(previous)<.001);previous=goal;
 }
 const side=ship.capitalRuntime.attackSide;
 for(let i=0;i<900;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,new THREE.Vector3(0,0,-650),new THREE.Vector3(),1/60);assert.equal(ship.capitalRuntime.attackSide,side);assert.ok(ship.rotation.every(Number.isFinite));}
});

test('physical asteroid cover blocks battery fire and breaking cover restarts the warning',()=>{
 const {s,ship}=stage();s.lineBlocked=Object.getPrototypeOf(s).lineBlocked.bind(s);
 s.obstacles=[{id:'cover',x:90,y:0,z:0,radius:45,losRadius:45}];let shots=0;s.spawnGunProjectile=(id,w)=>{if(w===FRIGATE_BOSS_GUN)shots++;};
 for(let i=0;i<300;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}
 assert.equal(shots,0);s.obstacles=[];
 for(let i=300;i<360;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}assert.equal(shots,0);
 for(let i=360;i<600;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}assert.ok(shots>0);
});
test('subtarget selection moves beam assistance to the battery and skips destroyed mounts',()=>{
 const {s,ship}=stage();s.save.settings.aimAssist=true;s.save.player.currentTargetId=ship.id;
 s.cycleCapitalSubtarget();const target=s.getTargetRef();assert.ok(visibleFrigateBatteries(s,ship,s.save.player.position).includes(target.mount));
 const point=frigateMountPosition(ship,target.mount,new THREE.Vector3()),muzzle=point.clone().add(new THREE.Vector3(-100,0,0));
 const aim=s.weaponAimDirection(muzzle,[0,0,0],{kind:'beam',range:500},target,new THREE.Vector3(1,0,0),new THREE.Vector3());
 assert.ok(aim.distanceTo(point.clone().sub(muzzle).normalize())<1e-8);
 ship.capitalMountHull[target.mount]=0;s.cycleCapitalSubtarget();const next=s.getTargetRef();assert.ok(next.mount===undefined||ship.capitalMountHull[next.mount]>0);
});

test('main battery extents match the live capital hull and PDC scale',()=>{const {s,ship}=stage();assert.deepEqual(FRIGATE_EXTENTS,s.npcHullExtents(ship));});

test('boss recovery is a shared, three-and-a-half-second anti-ship ceasefire',()=>{
 const {s,ship}=stage(),shots=[],phases=[];
 s.spawnGunProjectile=(id,w)=>shots.push({phase:ship.capitalAttack,time:s.save.world.time,main:w===FRIGATE_BOSS_GUN});
 for(let i=0;i<1200;i++){
  s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());
  if(phases.at(-1)?.phase!==ship.capitalAttack)phases.push({phase:ship.capitalAttack,time:i/60});
 }
 assert.ok(shots.some(x=>x.main));assert.ok(shots.every(x=>x.phase!=='RECOVERING'));
 assert.ok(shots.filter(x=>x.main).every(x=>x.phase==='SALVO'));
 for(let i=1;i<phases.length-1;i++)if(phases[i].phase==='RECOVERING')assert.ok(phases[i+1].time-phases[i].time>=3.49);
});

test('boss commits to the observed course before its salvo and cover cancels it',()=>{
 const {s,ship}=stage(),point=new THREE.Vector3(180,0,0),velocity=new THREE.Vector3(0,0,10);
 for(let i=0;i<=360;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,point,velocity);}
 const gun=ship.capitalRuntime.mounts[0],locked=gun.lockedTarget.toArray();
 assert.deepEqual(gun.lockedVelocity.toArray(),[0,0,10]);
 point.z=50;velocity.z=-30;
 for(let i=361;i<420;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,point,velocity);}
 assert.deepEqual(gun.lockedTarget.toArray(),locked);assert.deepEqual(gun.lockedVelocity.toArray(),[0,0,10]);
 s.lineBlocked=()=>true;s.save.world.time=7;updateFrigateBatteries(s,ship,1/60,point,velocity);
 assert.equal(ship.capitalAttack,'RECOVERING');assert.ok(ship.capitalAttackRemaining>=3.49);
});

test('ion shield damage does not multiply the fitted hull shield capacity',async()=>{
 const {getEffectiveShipStats}=await import('../src/game/shipStats.js');
 const {defaultLoadoutFor}=await import('../src/game/outfitting.js');
 const p={shipId:'vanguard',outfitting:{loadouts:{vanguard:defaultLoadoutFor('vanguard')}}};
 p.outfitting.loadouts.vanguard.guns.fill(null);const shield=getEffectiveShipStats(p).shield;
 p.outfitting.loadouts.vanguard.guns[0]='ion-blaster';assert.equal(getEffectiveShipStats(p).shield,shield);
});

test('destroying all main batteries ends attack warnings and anti-ship salvos',()=>{
 const {s,ship}=stage();ship.capitalMountHull.fill(0,0,4);let shots=0;s.spawnGunProjectile=()=>shots++;
 for(let i=0;i<900;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}
 assert.equal(ship.capitalDisarmed,true);assert.equal(ship.capitalAttack,'RECOVERING');assert.equal(shots,0);
});
