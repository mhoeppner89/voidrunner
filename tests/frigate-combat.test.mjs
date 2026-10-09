import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {equipFrigate,updateFrigateBatteries,updateFrigateAttack,frigateMountPosition,damageFrigateMount,frigateSubsystemExplosionScale,FRIGATE_GUN,FRIGATE_BOSS_GUN,FRIGATE_EXTENTS,visibleFrigateBatteries} from '../src/game/capitalCombat.js';
import {WEAPON_DAMAGE_SCALE} from '../src/game/weapons.js';
import {FRIGATE_MOUNTS,FRIGATE_ENGINE_MOUNTS,FRIGATE_TORPEDO_LAYOUT} from '../src/game/frigateMounts.js';
import {clearTurretArc,updateAutomaticTurrets,FRIGATE_PDC_TURRET,PDC_TURRET} from '../src/game/turrets.js';
import {cockpitDamageStage} from '../src/game/cockpitDamage.js';
import {fixture} from './combat-variety.test.mjs';
function stage(){const s=fixture();s.tmpAvoidance=new THREE.Vector3();s.save.player.dockedAt=undefined;s.save.player.position=[180,0,0];s.save.player.velocity=[0,0,0];s.save.player.hull=185;const ship=s.spawnCapitalShip('concord-frigate',[0,0,0],'rook','Boss');equipFrigate(ship,true);ship.rotation=[0,0,0,1];ship.targetId='player';ship.hostile=true;ship.holdFire=false;return {s,ship};}
test('live ship updates route frigate combat in career, arena, arena run, and spectator modes',()=>{
 for(const mode of ['career','arena','arena-run','spectator']){
  const {s,ship}=stage();s.save.player.position=[440,0,0];
  s.arena=mode==='career'?undefined:mode==='spectator'?{observer:true,environment:'open',started:true}:mode==='arena-run'?{run:true}:{environment:'open',started:true};
  if(mode==='arena-run')s.save.arenaRun={phase:'combat',countdown:0};
  ship.playerAwareness=1;
  s.resolveNpcCollisions=()=>{};s.playerStats=()=>({radarRange:1000});
  s.maybeRecognitionLine=()=>{};s.maybeProximityLine=()=>{};s.maybePilotLine=()=>{};s.maybeNeutralChatter=()=>{};
  s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
  let attackUpdates=0,mainShots=0;const updateAttack=s.updateAttackAI.bind(s);
  s.updateAttackAI=(...args)=>{attackUpdates++;return updateAttack(...args);};
  s.spawnGunProjectile=(_owner,weapon)=>{if(weapon===FRIGATE_BOSS_GUN)mainShots++;};
  if(mode==='spectator'){
   const opponent=s.spawnCapitalShip('concord-frigate',[0,0,-420],'rook','Opponent');equipFrigate(opponent,true);
   s.arena.observer=true;s.observerStarted=true;s.observerAimError=1;s.tmpObserverDirection=new THREE.Vector3();
   s.applyObserverShipState(ship,{id:'blue-boss',shipType:'frigate',team:'blue'});
   s.applyObserverShipState(opponent,{id:'red-boss',shipType:'frigate',team:'red'});
   ship.targetId=opponent.id;opponent.targetId=ship.id;opponent.hostile=true;
  }
  for(let tick=0;tick<8*60;tick++){s.save.world.time+=1/60;s.updateShips(1/60);}
  assert.ok(attackUpdates>0,`${mode}: frigate AI receives a live attack update`);
  assert.ok(ship.capitalRuntime?.navigation,`${mode}: frigate navigation state is initialized`);
  assert.ok(ship.capitalRuntime.navigation.desired.toArray().every(Number.isFinite),`${mode}: desired motion stays finite`);
  assert.ok(mainShots>0,`${mode}: frigate broadside completes its warning and fires`);
  if(mode==='spectator')assert.equal(ship.targetId,s.ships.find(other=>other!==ship).id,'observer frigates keep an opposing-team target');
 }
});
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
test('hostile patrols keep the player target; friendly patrols still defend against hostiles',()=>{const {s,ship}=stage();ship.playerAwareness=1;s.shipTracksPlayer=()=>true;s.resolveShipTarget(ship);assert.equal(ship.targetId,'player');ship.faction='pirates';const friend=s.spawnShip('patrol',[0,0,50]);friend.hostile=false;s.resolveShipTarget(friend);assert.equal(friend.targetId,ship.id);});
test('all four frigate PDC mounts share one missile recovery channel',()=>{const {s,ship}=stage();ship.targetId=null;s.save.player.position=[900,900,900];s.pdcAssignments=new Map();let launches=0;const fire=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...args)=>{launches++;return fire(...args);};for(let i=0;i<4;i++){const slot=s.projStore.alloc();s.projStore.setPos(slot,0,170+i*2,-36);s.projStore.setVel(slot,0,-260,0);s.projectiles.push({id:'incoming'+i,slot,kind:'missile',ownerId:'player',targetId:ship.id,life:4,damage:42});}for(let i=0;i<30;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60);}assert.equal(launches,1);});
test('frigate main batteries cover both flanks but leave stern and small top/bottom blind spots',()=>{
 const sides=FRIGATE_MOUNTS.slice(0,4).map(m=>m.side);assert.deepEqual(sides,[-1,-1,1,1]);
 const actor={capitalClass:'frigate',position:[0,0,0],rotation:[0,0,0,1]},state={local:new THREE.Vector3(),scratch:new THREE.Vector3(),inverse:new THREE.Quaternion(),clearance:new Float32Array(73*37).fill(1e6)};
 const covers=(mount,point)=>clearTurretArc(actor,mount,FRIGATE_EXTENTS,new THREE.Vector3(...point),state);
 assert.ok(covers(FRIGATE_MOUNTS[0],[-350,0,-350]),'port battery covers a forward port approach');
 assert.ok(covers(FRIGATE_MOUNTS[2],[350,0,-350]),'starboard battery covers a forward starboard approach');
 assert.ok(!covers(FRIGATE_MOUNTS[0],[0,0,400]),'main batteries cannot cover directly aft');
 assert.ok(!covers(FRIGATE_MOUNTS[2],[0,500,-30]),'main batteries cannot bear straight above');
 assert.ok(!covers(FRIGATE_MOUNTS[0],[0,-500,-30]),'main batteries cannot bear straight below');
 assert.ok(covers(FRIGATE_MOUNTS[2],[100,200,-200]),'the dorsal blind spot stays narrow');
});
test('frigate anti-fighter PDC hits harder and less precisely while interception stays standard',()=>{
 assert.equal(FRIGATE_PDC_TURRET.damageFlat,PDC_TURRET.damageFlat*16,'frigate ship-target damage is 4x its previous 4x baseline');
 assert.equal(FRIGATE_PDC_TURRET.damageFlat*FRIGATE_PDC_TURRET.shieldMul,PDC_TURRET.damageFlat*PDC_TURRET.shieldMul*32);
 assert.ok(FRIGATE_PDC_TURRET.aimSpread>(PDC_TURRET.aimSpread??.020));
 assert.ok(FRIGATE_PDC_TURRET.turnRate<4.5);
});
test('frigate PDCs keep engaging during main-battery recovery with the heavy ship-target round',()=>{
 const {s,ship}=stage();ship.capitalAttack='RECOVERING';s.lineBlocked=()=>false;const fired=[];
 s.spawnGunProjectile=(owner,weapon)=>{fired.push(weapon);};
 for(let i=0;i<10*60;i++){s.save.world.time=i/60;updateAutomaticTurrets(s,ship,ship.id,1/60);}
 assert.ok(fired.length>0,'PDCs should remain active during main-gun recovery');
 assert.ok(fired.every(weapon=>weapon===FRIGATE_PDC_TURRET));
});
test('a real beam hit destroys an exposed assembly only after shields are down and scales its blast to that module',()=>{const {s,ship}=stage(),blasts=[];s.renderer.spawnExplosion=(_position,_hostile,scale)=>blasts.push(scale);const pos=frigateMountPosition(ship,2,new THREE.Vector3()),start=pos.clone().add(new THREE.Vector3(100,0,0)),dir=new THREE.Vector3(-1,0,0),beam={id:'beam',kind:'beam',range:250,damageFlat:110};s.fireBeam('player',beam,start,dir,'test');assert.equal(ship.capitalMountHull[2],100);assert.equal(blasts.length,0);ship.shield=0;s.fireBeam('player',beam,start,dir,'test');assert.equal(ship.capitalMountHull[2],0);assert.ok(ship.hull<1400);assert.deepEqual(blasts,[frigateSubsystemExplosionScale(2)]);});
test('frigate subsystem blast scales follow each module envelope',()=>{
 const scales=FRIGATE_MOUNTS.map((_,index)=>frigateSubsystemExplosionScale(index));
 assert.equal(scales.length,14);assert.ok(scales.every(scale=>scale>=.35&&scale<=2.5));
 assert.ok(scales[8]>scales[11]&&scales[11]>scales[9]&&scales[9]>scales[0]&&scales[0]>scales[4]);
 assert.equal(frigateSubsystemExplosionScale(-1),.45);
});
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

test('frigate rolls its broadside onto an off-plane target with turn-rate-limited attitude changes',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(250,300,100).normalize().multiplyScalar(414),velocity=new THREE.Vector3();
 let previous=new THREE.Quaternion(...ship.rotation);
 for(let i=0;i<1800;i++){
  s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);
  const rotation=new THREE.Quaternion(...ship.rotation);
  assert.ok(previous.angleTo(rotation)<=ship.turnRate/60+1e-5,'capital attitude must obey its authored turn rate');
  previous.copy(rotation);
 }
 const radial=point.clone().sub(new THREE.Vector3(...ship.position)).normalize();
 const right=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...ship.rotation));
 assert.ok(Math.abs(right.dot(radial))>.995,`broadside alignment ${right.dot(radial)}`);
 assert.ok(Math.hypot(...ship.velocity)<=ship.speed+.001);
});

test('frigate cannot translate sideways to match a target and uses a slow assisted turn',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(600,0,0),lateralVelocity=new THREE.Vector3(18,0,0);
 ship.velocity=[0,0,0];
 for(let i=0;i<60;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,lateralVelocity,1/60);}
 const desired=ship.capitalRuntime.navigation.desired;
 assert.ok(desired.length()<=ship.speed+.001);
 const q=new THREE.Quaternion(...ship.rotation),facing=new THREE.Vector3(0,0,-1).applyQuaternion(q);
 const velocity=new THREE.Vector3(...ship.velocity),forwardSpeed=velocity.dot(facing);
 const lateral=velocity.addScaledVector(facing,-forwardSpeed);
 assert.equal(ship.turnRate,.12,'intact frigates should turn like heavy capital ships');
 assert.ok(lateral.length()<.5,`the frigate should not copy sideways target velocity: ${lateral.length()}`);
 assert.ok(ship.position[0]<1,`it should not translate sideways before turning: ${ship.position[0]}`);
});

test('frigate checks secondary-target cover with world-space vectors before splitting broadsides',()=>{
 const {s,ship}=stage();ship.holdFire=true;ship.speed=0;ship.turnRate=0;
 const enemy=s.spawnShip('pirate',[-300,240,0]);enemy.instanceId=ship.instanceId;enemy.pendingMug=false;
 s.projectileCanHitShip=()=>true;
 let checkedSecondary=false;
 s.lineBlocked=(start,end)=>{
  assert.ok(end?.isVector3,'line-of-sight endpoints must be Three.js vectors');
  if(Math.abs(end.x-enemy.position[0])<1e-6&&Math.abs(end.y-enemy.position[1])<1e-6)checkedSecondary=true;
  return false;
 };
 const point=new THREE.Vector3(380,0,0);
 updateFrigateAttack(s,ship,point,new THREE.Vector3(),1/60);
 const targetAxis=point.clone().normalize(),otherAxis=new THREE.Vector3(...enemy.position).normalize();
 const expected=targetAxis.sub(otherAxis).normalize();
 assert.ok(checkedSecondary,'opposite hostile should be evaluated for a split firing posture');
 assert.ok(ship.capitalRuntime.navigation.axis.dot(expected)>.999);
});

test('physical asteroid cover blocks battery fire and breaking cover restarts the warning',()=>{
 const {s,ship}=stage();s.lineBlocked=Object.getPrototypeOf(s).lineBlocked.bind(s);
 s.obstacles=[{id:'cover',x:90,y:0,z:0,radius:45,losRadius:45}];let shots=0;s.spawnGunProjectile=(id,w)=>{if(w===FRIGATE_BOSS_GUN)shots++;};
 for(let i=0;i<300;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}
 assert.equal(shots,0);s.obstacles=[];
 for(let i=300;i<360;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}assert.equal(shots,0);
 for(let i=360;i<600;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}assert.ok(shots>0);
});
test('subtarget cycling reaches every frigate component without visibility or line of sight',()=>{
 const {s,ship}=stage();s.save.settings.aimAssist=true;s.save.player.currentTargetId=ship.id;
 s.lineBlocked=()=>{throw new Error('subtarget cycling must not check line of sight');};
 const selected=[];
 for(let i=0;i<FRIGATE_MOUNTS.length;i++){s.cycleCapitalSubtarget();selected.push(s.getTargetRef().mount);}
 assert.deepEqual(selected,FRIGATE_MOUNTS.map((_,index)=>index));
 assert.equal(FRIGATE_MOUNTS[9].label,'UPPER SHIELD GENERATOR');assert.equal(FRIGATE_MOUNTS[10].label,'LOWER SHIELD GENERATOR');
 s.lineBlocked=()=>false;
 const target=s.getTargetRef();
 const point=frigateMountPosition(ship,target.mount,new THREE.Vector3()),muzzle=point.clone().add(new THREE.Vector3(-100,0,0));
 const aim=s.weaponAimDirection(muzzle,[0,0,0],{kind:'beam',range:500},target,new THREE.Vector3(1,0,0),new THREE.Vector3());
 assert.ok(aim.distanceTo(point.clone().sub(muzzle).normalize())<1e-8);
});

test('main battery extents match the live capital hull and PDC scale',()=>{const {s,ship}=stage();assert.deepEqual(FRIGATE_EXTENTS,s.npcHullExtents(ship));});

test('boss recovery is a shared, three-and-a-half-second anti-ship ceasefire',()=>{
 const {s,ship}=stage(),shots=[],phases=[];
 s.spawnGunProjectile=(id,w)=>shots.push({phase:ship.capitalAttack,time:s.save.world.time,main:w===FRIGATE_BOSS_GUN,pdc:w?.id==='pdc'});
 for(let i=0;i<1200;i++){
  s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());
  if(phases.at(-1)?.phase!==ship.capitalAttack)phases.push({phase:ship.capitalAttack,time:i/60});
 }
 assert.ok(shots.some(x=>x.main));assert.ok(shots.filter(x=>x.main).every(x=>x.phase!=='RECOVERING'));
 assert.ok(shots.some(x=>x.pdc&&x.phase==='RECOVERING'),'PDCs cover the main battery recovery window');
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
 const {s,ship}=stage();ship.capitalMountHull.fill(0,0,4);let mainShots=0,pdcShots=0;s.spawnGunProjectile=(owner,weapon)=>{if(weapon===FRIGATE_GUN)mainShots++;else if(weapon?.id==='pdc')pdcShots++;};
 for(let i=0;i<900;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(180,0,0),new THREE.Vector3());}
 assert.equal(ship.capitalDisarmed,true);assert.equal(ship.capitalAttack,'RECOVERING');assert.equal(mainShots,0);assert.ok(pdcShots>0,'working PDCs remain independent of destroyed main batteries');
});

test('frigate closes from outside battery range then holds distance without running down its target',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(800,0,0),velocity=new THREE.Vector3();let minimum=Infinity;
 for(let i=0;i<90*60;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);minimum=Math.min(minimum,point.distanceTo(new THREE.Vector3(...ship.position)));}
 const range=point.distanceTo(new THREE.Vector3(...ship.position));assert.ok(range>370&&range<470,`range ${range}`);assert.ok(minimum>350);
 const facing=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...ship.rotation)),finalVelocity=new THREE.Vector3(...ship.velocity);
 const slip=finalVelocity.addScaledVector(facing,-finalVelocity.dot(facing));assert.ok(slip.length()<2,`assisted flight should damp sideways slip: ${slip.length()}`);
 const right=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...ship.rotation));assert.ok(Math.abs(right.dot(point.clone().sub(new THREE.Vector3(...ship.position)).normalize()))>.95);
});
test('frigate opens distance from a close target and pursues a retreating one without exceeding hull speed',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(130,0,0),velocity=new THREE.Vector3();
 for(let i=0;i<1800;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);}
 assert.ok(point.distanceTo(new THREE.Vector3(...ship.position))>150,'it should turn away and open the range under engine thrust');
 velocity.set(8,0,0);const start=ship.position[0];
 for(let i=1800;i<5400;i++){point.addScaledVector(velocity,1/60);s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);assert.ok(Math.hypot(...ship.velocity)<=ship.speed+.001);}
 assert.ok(ship.position[0]>start+100);assert.ok(point.distanceTo(new THREE.Vector3(...ship.position))<500);
});
test('opposite broadsides shoot distinct active enemies and respect shared recovery',()=>{
 const {s,ship}=stage();s.lineBlocked=()=>false;const enemy=s.spawnShip('pirate',[-380,0,0]);enemy.instanceId=ship.instanceId;enemy.pendingMug=false;enemy.holdFire=false;enemy.targetId=ship.id;enemy.velocity=[0,0,0];
 s.save.player.position=[380,0,0];const shots=[];s.spawnGunProjectile=(owner,w,p,d,v,target)=>{if(w===FRIGATE_GUN)shots.push({target,phase:ship.capitalAttack});};
 for(let i=0;i<1200;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(...s.save.player.position),new THREE.Vector3());}
 assert.ok(shots.some(x=>x.target==='player'));assert.ok(shots.some(x=>x.target===enemy.id));assert.ok(shots.every(x=>x.phase==='SALVO'));
});
test('secondary batteries do not acquire stand-offs, surrendered ships, allies or another instance',()=>{
 for(const mode of ['stand-off','surrendered','ally','instance']){
  const {s,ship}=stage();const enemy=s.spawnShip('pirate',[-380,0,0]);enemy.instanceId=ship.instanceId;enemy.pendingMug=false;enemy.holdFire=false;
  if(mode==='stand-off')enemy.pendingMug=true;if(mode==='surrendered')enemy.surrendered=true;if(mode==='ally')enemy.faction=ship.faction;if(mode==='instance')enemy.instanceId='elsewhere';
  const shots=[];s.spawnGunProjectile=(o,w,p,d,v,t)=>{if(w===FRIGATE_GUN)shots.push(t);};
  for(let i=0;i<900;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(380,0,0),new THREE.Vector3());}
  assert.ok(!shots.includes(enemy.id),mode);
 }
});
test('frigate repositions around blocked firing lanes without firing through cover',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.lineBlocked=()=>true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(414,0,0);
 for(let i=0;i<300;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,new THREE.Vector3(),1/60);}
 assert.ok(Math.abs(ship.position[2])>10);assert.ok(ship.position.every(Number.isFinite));
});

// Exercise physical impacts, not only metadata: the same projectile path is
// used by career, arena, arena run, and observer actors.
function projectileStage(){
 const {s,ship}=stage();s.save.player.position=[500,500,500];
 s.tmpAudioOrientation=new THREE.Quaternion();s.tmpAudioLocal=new THREE.Vector3();
 s.audio={playAtDirection(){}};s.renderer.spawnExplosion=()=>{};
 s.playerCollisionRadius=()=>2;s.playerStats=()=>({radarRange:1000});
 return {s,ship};
}
test('rear torpedo impacts bypass shields and progressively cripple the engines',async()=>{
 const {LAUNCHERS}=await import('../src/game/weapons.js');const {s,ship}=projectileStage();
 const shield=ship.shield,originalSpeed=ship.speed;
 for(let shot=0;shot<2;shot++){
  const slot=s.projStore.alloc();const enginePoint=frigateMountPosition(ship,8,new THREE.Vector3());s.projStore.setPos(slot,enginePoint.x,enginePoint.y,enginePoint.z+37);s.projStore.setVel(slot,0,0,-115);
  s.projectiles.push({id:`tor-${shot}`,slot,kind:'missile',ownerId:'player',launcherId:'torpedo',damage:LAUNCHERS.torpedo.damage,life:2,targetId:ship.id,targetMount:8,homingSpeed:115,homingTurn:.28,acceleration:140,shield:12});
  s.updateProjectiles(.5);
  assert.equal(ship.shield,shield);assert.ok(ship.speed<originalSpeed);
 }
 assert.equal(ship.capitalMountHull[8],0);assert.ok(ship.speed<originalSpeed*.8,'one destroyed drive reduces thrust');
 for(const i of FRIGATE_ENGINE_MOUNTS)damageFrigateMount(ship,frigateMountPosition(ship,i,new THREE.Vector3()).toArray(),160);
 assert.ok(ship.speed<=originalSpeed*.16);assert.ok(ship.turnRate<.03);
 assert.equal(ship.capitalMountHull[0],100);assert.equal(ship.shieldRegen,32);
});
test('two shield generators double recharge to 32 per second and remain independently damageable',()=>{
 const {s,ship}=stage();ship.shield=234;const speed=ship.speed;
 assert.equal(ship.shieldRegen,32,'the doubled full rate is 32 shield per second');
 assert.equal(ship.maxShield,650);
 for(const [index,regen] of [[9,16],[10,0]]){
  const point=frigateMountPosition(ship,index,new THREE.Vector3()).toArray();
  assert.equal(damageFrigateMount(ship,point,95),index);assert.equal(ship.shieldRegen,regen);
  if(index===9){assert.equal(ship.maxShield,650);assert.equal(ship.shield,234,'one surviving generator keeps the existing shield pool');}
 }
 assert.equal(ship.maxShield,0,'both destroyed generators remove the shield pool');
 assert.equal(ship.shield,0,'remaining shield energy is lost with the final generator');
 s.maybePilotLine=()=>{};s.save.world.time+=1/60;s.updateShips(1/60);assert.equal(ship.shield,0,'the ship cannot passively regain shields without a generator');
 assert.equal(ship.speed,speed);assert.equal(ship.capitalMountHull[8],160);assert.equal(ship.capitalMountHull[2],100);
 assert.equal(damageFrigateMount(ship,[0,0,-110],200),-1,'a bow strike cannot damage rear engines');
});
test('frigate shields begin recharging immediately after a hit',()=>{
 const {s,ship}=stage();ship.shield=ship.maxShield;
 s.damageShip(ship,10,'player',undefined,{id:'pulse'});
 assert.equal(ship.shieldDelay,0);
 const afterHit=ship.shield;s.maybePilotLine=()=>{};s.updateShips(1/60);
 assert.ok(ship.shield>afterHit,'shield starts recharging on the next simulation step');
});
test('PDC intercept rounds kill ordinary missiles but only chip a torpedo shield',()=>{
 for(const shield of [0,12]){
  const {s}=projectileStage();s.ships=[];
  const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,0,0,0);
  const missile={id:'incoming',slot,kind:'missile',ownerId:'enemy',life:10,damage:30,shield};s.projectiles.push(missile);
  const round=s.projStore.alloc();s.projStore.setPos(round,-5,0,0);s.projStore.setVel(round,100,0,0);
  s.projectiles.push({id:'intercept',slot:round,kind:'pdc',ownerId:'player',life:1,damage:1.76,targetMissile:missile});
  s.updateProjectiles(.1);
  if(shield){assert.ok(missile.life>0);assert.equal(missile.shield,10.24);}else assert.equal(missile.life,0);
 }
});
test('frigate PDC salvo pressure materially cuts a stationary player shield during main recovery',()=>{
 const {s,ship}=projectileStage();s.save.player.position=[180,0,0];s.save.player.shield=80;s.save.player.maxShield=80;s.save.player.hull=10000;s.audio.play=()=>{};ship.capitalAttack='RECOVERING';s.maybeHitTaunt=()=>{};
 for(let i=0;i<20*60;i++){s.save.world.time=i/60;updateAutomaticTurrets(s,ship,ship.id,1/60);s.updateProjectiles(1/60);}
 assert.ok(s.save.player.shield<65,`frigate PDCs should apply meaningful shield pressure, remaining ${s.save.player.shield}`);
});
test('frigate torpedoes have a finite magazine, warning, cooldown, and cover interruption',()=>{
 const {s,ship}=stage(),point=new THREE.Vector3(380,0,0);s.spawnGunProjectile=()=>{};
 assert.equal(ship.capitalTorpedoes,40);
 let warnings=0,launches=[];for(let i=0;i<430*60;i++){s.save.world.time=i/60;const before=s.projectiles.length;updateFrigateBatteries(s,ship,1/60,point,new THREE.Vector3());if(ship.capitalTorpedoWarning)warnings++;if(s.projectiles.length>before)launches.push(s.projectiles.length-before);}
 assert.ok(warnings>180);assert.deepEqual(launches,Array(20).fill(2));assert.equal(ship.capitalTorpedoes,0);assert.equal(s.projectiles.length,40);
 const mount=frigateMountPosition(ship,11,new THREE.Vector3()),l=FRIGATE_TORPEDO_LAYOUT;
 for(let i=0;i<s.projectiles.length;i+=2){const a=s.projStore.getPos(s.projectiles[i].slot,new THREE.Vector3()),b=s.projStore.getPos(s.projectiles[i+1].slot,new THREE.Vector3());assert.ok(Math.abs(a.y-(mount.y+l.muzzleHeight))<1e-6,'salvo starts above the modeled launch cells');assert.equal(a.y,b.y);assert.ok(Math.abs(a.x+l.cellX)<1e-6&&Math.abs(b.x-l.cellX)<1e-6,'paired rounds leave opposite cells of one launcher');assert.ok(Math.abs(a.z-(mount.z+(i/2%2===0?-l.cellZ:l.cellZ)))<2e-6,'salvos alternate cell rows');}
 const other=stage();other.s.lineBlocked=()=>true;
 for(let i=0;i<1800;i++){other.s.save.world.time=i/60;updateFrigateBatteries(other.s,other.ship,1/60,point,new THREE.Vector3());}
 assert.equal(other.s.projectiles.length,0);assert.equal(other.ship.capitalTorpedoWarning,false);
});
test('frigate torpedoes reserve salvos for capital ships and slower hulls',()=>{
 const {s,ship}=stage(),point=new THREE.Vector3(380,0,0);s.spawnGunProjectile=()=>{};s.save.player.shipId='talon';
 for(let i=0;i<45*60;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,point,new THREE.Vector3());}
 assert.equal(s.projectiles.filter(projectile=>projectile.launcherId==='torpedo').length,0);assert.equal(ship.capitalTorpedoWarning,false);
 s.save.player.shipId='atlas';ship.capitalTorpedoes=2;ship.capitalRuntime.torpedoReadyAt=0;ship.capitalRuntime.torpedoLock=0;
 for(let i=0;i<35*60&&s.projectiles.filter(projectile=>projectile.launcherId==='torpedo').length<2;i++){s.save.world.time=45+i/60;updateFrigateBatteries(s,ship,1/60,point,new THREE.Vector3());}
 assert.equal(s.projectiles.filter(projectile=>projectile.launcherId==='torpedo').length,2,'a slow industrial hull should draw a paired salvo');
 const capital=s.spawnCapitalShip('concord-frigate',[380,0,0],'rook','Capital target');ship.targetId=capital.id;ship.capitalTorpedoes=2;ship.capitalRuntime.torpedoReadyAt=0;ship.capitalRuntime.torpedoLock=0;
 for(let i=0;i<35*60&&s.projectiles.filter(projectile=>projectile.launcherId==='torpedo').length<4;i++){s.save.world.time=80+i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(...capital.position),new THREE.Vector3());}
 assert.equal(s.projectiles.filter(projectile=>projectile.launcherId==='torpedo').length,4,'capital hulls should draw paired salvos regardless of speed');
});
test('stern and generator aim points remain selectable after destruction to show effects',()=>{
 const {s,ship}=stage();s.save.player.currentTargetId=ship.id;s.save.player.position=[0,0,300];
 assert.ok(visibleFrigateBatteries(s,ship,s.save.player.position).includes(8));
 assert.ok(!visibleFrigateBatteries(s,ship,[0,0,-300]).includes(8));
 s.capitalSubtarget={id:ship.id,index:8};damageFrigateMount(ship,frigateMountPosition(ship,8,new THREE.Vector3()).toArray(),160);
 assert.equal(s.getTargetRef().mount,8);assert.deepEqual(s.getTargetRef().position,frigateMountPosition(ship,8,new THREE.Vector3()).toArray());
});
test('torpedo guidance cannot follow a fighter across a sharp crossing turn',async()=>{
 const {guideMissile}=await import('../src/game/weaponFlight.js');const {LAUNCHERS}=await import('../src/game/weapons.js');
 const velocity=new THREE.Vector3(0,0,-115),before=velocity.clone();
 guideMissile(velocity,new THREE.Vector3(100,0,0),LAUNCHERS.torpedo,1);
 assert.ok(before.angleTo(velocity)<=.280001);assert.ok(velocity.x<33);assert.ok(velocity.z<-100);
});
test('final-wave crown pocket has reachable real rock cover and a pursuing frigate',async()=>{
 const {generateAsteroidField}=await import('../src/game/worldData.js');const {LOCATIONS}=await import('../src/game/data.js');
 for(const seed of [718,42,2026]){
  const {s,ship}=stage(),proto=Object.getPrototypeOf(s);
  s.asteroids=generateAsteroidField(seed,[],[]);s.obstacles=s.asteroidFieldObstacles(s.asteroids);
  for(const key of ['tmpEntryAnchor','tmpEntryCandidate','tmpEntryPreferredDirection','tmpEntryDirection'])s[key]=new THREE.Vector3();
  const origin=new THREE.Vector3(...LOCATIONS.shardbelt.position);s.setFieldArenaPosition(origin,'shardbelt',90);
  assert.ok(s.entryPositionClear(origin,s.obstacles,90),'player starts in a usable pocket');
  let cover;
  for(const rock of s.obstacles){
   const center=new THREE.Vector3(rock.x,rock.y,rock.z),distance=center.distanceTo(origin);
   if(distance>600||distance<100)continue;
   const towards=center.clone().sub(origin).normalize(),near=center.clone().addScaledVector(towards,-rock.radius-25),far=center.clone().addScaledVector(towards,rock.radius+200);
   if(!s.lineBlocked(origin,near)&&s.lineBlocked(near,far)){cover=rock;break;}
  }
  assert.ok(cover,`seed ${seed}: a short clear route reaches real mesh cover`);
  const target=origin.clone();ship.position=origin.clone().add(new THREE.Vector3(0,0,-1000)).toArray();
  // Use the final-wave spawn search against the generated field, then the
  // ordinary navigation/avoidance. No fixture rock replaces the level data.
  s.save.player.position=origin.toArray();s.save.arenaRun={entry:null};s.runEntryPosition=()=>ship.position;
  s.ui.setRunInbound=()=>{};s.selectTarget=()=>{};
  assert.equal(s.spawnRunEnemy(['frigate','ace',0,0],0),true);const boss=s.ships.at(-1);boss.holdFire=true;
  const initial=target.distanceTo(new THREE.Vector3(...boss.position));
  for(let tick=0;tick<1200;tick++){s.save.world.time+=1/60;updateFrigateAttack(s,boss,target,new THREE.Vector3(),1/60);assert.ok(boss.position.every(Number.isFinite));}
  assert.ok(target.distanceTo(new THREE.Vector3(...boss.position))<initial-100,'frigate follows the lure toward the field');
  assert.ok(s.entryPositionClear(new THREE.Vector3(...boss.position),s.obstacles,35),'pursuit does not end inside a rock');
 }
});

test('all fourteen visible frigate components register real beams in rotated and translated poses',()=>{
 for(const rotated of [false,true])for(let i=0;i<FRIGATE_MOUNTS.length;i++){
  const {s,ship}=stage();ship.captured=true;ship.shield=0;
  if(rotated){ship.position=[41700,-90,210];ship.rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.43,1.12,-.38)).toArray();}
  const m=FRIGATE_MOUNTS[i],q=new THREE.Quaternion().fromArray(ship.rotation),point=frigateMountPosition(ship,i,new THREE.Vector3());
  if(m.kind==='generator'||m.kind==='torpedo')point.add(new THREE.Vector3(0,m.side*(m.hitOffset??3),0).applyQuaternion(q));
  const normal=new THREE.Vector3().setComponent(m.axis,m.side).applyQuaternion(q),start=point.clone().addScaledVector(normal,80),direction=normal.negate();
  const before=[...ship.capitalMountHull];s.fireBeam('inspection',{id:'beam',kind:'beam',range:90,damageFlat:25},start,direction,'hit');
  assert.equal(ship.capitalMountHull[i],before[i]-25,`${rotated?'rotated':'identity'} ${m.label} registers a beam`);
  assert.deepEqual(ship.capitalMountHull.filter((_,j)=>j!==i),before.filter((_,j)=>j!==i),'neighboring components keep their health');
  s.fireBeam('inspection',{id:'beam',kind:'beam',range:90,damageFlat:180},start,direction,'destroy');assert.equal(ship.capitalMountHull[i],0);
 }
});
test('intact shields and actual cover protect frigate attachments from beams',()=>{
 const {s,ship}=stage();ship.captured=true;const m=FRIGATE_MOUNTS[11],point=frigateMountPosition(ship,11,new THREE.Vector3()).add(new THREE.Vector3(0,m.hitOffset,0)),start=point.clone().add(new THREE.Vector3(0,80,0)),dir=new THREE.Vector3(0,-1,0),beam={id:'beam',kind:'beam',range:100,damageFlat:25};
 s.fireBeam('inspection',beam,start,dir,'shield');assert.equal(ship.capitalMountHull[11],m.hull);assert.equal(ship.shield,625);
 ship.shield=0;s.firstObstacleHit=()=>.1;s.fireBeam('inspection',beam,start,dir,'cover');assert.equal(ship.capitalMountHull[11],m.hull);
 s.firstObstacleHit=()=>undefined;s.fireBeam('inspection',beam,start,dir,'clear');assert.equal(ship.capitalMountHull[11],m.hull-25);
});
test('destroying the single torpedo launcher disables paired salvos without spending its magazine',()=>{
  const {s,ship}=stage();ship.capitalMountHull[0]=ship.capitalMountHull[1]=ship.capitalMountHull[2]=ship.capitalMountHull[3]=0;s.save.player.shipId='atlas';s.spawnGunProjectile=()=>{};
  damageFrigateMount(ship,frigateMountPosition(ship,11,new THREE.Vector3()).toArray(),90);
  for(let i=0;i<120*60;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,new THREE.Vector3(380,0,0),new THREE.Vector3());}
  const shots=s.projectiles.filter(p=>p.launcherId==='torpedo');
  assert.equal(shots.length,0);assert.equal(ship.capitalTorpedoes,40);assert.equal(ship.capitalTorpedoWarning,false);
});

test('one launcher preserves its paired cell positions through rotation, blocks obstructed salvos and handles one remaining round',()=>{
 for(const mode of ['rotated','blocked','last-round']){
  const {s,ship}=stage();ship.capitalMountHull.fill(0,0,4);s.save.player.shipId='atlas';s.spawnGunProjectile=()=>{};
  ship.rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.8,-.2)).toArray();
  const q=new THREE.Quaternion().fromArray(ship.rotation),inverse=q.clone().invert(),l=FRIGATE_TORPEDO_LAYOUT;
  if(mode==='last-round')ship.capitalTorpedoes=1;
  if(mode==='blocked')s.lineBlocked=origin=>origin.clone().applyQuaternion(inverse).x>1;
  s.save.world.time=20;updateFrigateBatteries(s,ship,3.1,new THREE.Vector3(380,0,0),new THREE.Vector3());
  const shots=s.projectiles.filter(p=>p.launcherId==='torpedo'),expected=mode==='blocked'?0:mode==='last-round'?1:2;
  assert.equal(shots.length,expected);assert.equal(ship.capitalTorpedoes,mode==='last-round'?0:40-expected);
  const center=new THREE.Vector3().fromArray(FRIGATE_MOUNTS[11].position).multiply(new THREE.Vector3(...FRIGATE_EXTENTS));
  for(let i=0;i<shots.length;i++){
   const point=s.projStore.getPos(shots[i].slot,new THREE.Vector3()).applyQuaternion(inverse),target=center.clone().add(new THREE.Vector3(i===0?-l.cellX:l.cellX,l.muzzleHeight,-l.cellZ));
   assert.ok(point.distanceTo(target)<1e-5,'round emerges from its visible cell after hull rotation');
  }
 }
});

test('the shallow launcher hit envelope follows its body rather than an invisible tall sphere',async()=>{
 const {segmentFrigateMountHit}=await import('../src/game/capitalCombat.js');
 const {ship}=stage();ship.capitalMountHull.fill(0);ship.capitalMountHull[11]=90;
 const center=frigateMountPosition(ship,11,new THREE.Vector3());
 const above=center.clone().add(new THREE.Vector3(-20,6,0)),across=center.clone().add(new THREE.Vector3(20,6,0));
 assert.equal(segmentFrigateMountHit(above,across,ship),undefined,'a shot well above the flat launcher misses it');
 const hit=segmentFrigateMountHit(center.clone().add(new THREE.Vector3(0,20,0)),center,ship);
 assert.ok(hit>0&&hit<1,'a direct downward shot hits the shallow body');
 assert.equal(damageFrigateMount(ship,center.clone().add(new THREE.Vector3(0,6,0)).toArray(),25),-1,'nearby air cannot damage the launcher');
});

test('moving gun rounds and missiles hit each fitted component without damaging neighbors',()=>{
 for(const kind of ['laser','missile'])for(let i=0;i<FRIGATE_MOUNTS.length;i++){
  const {s,ship}=projectileStage();ship.captured=true;ship.shield=0;
  const m=FRIGATE_MOUNTS[i],point=frigateMountPosition(ship,i,new THREE.Vector3());if(m.kind==='generator'||m.kind==='torpedo')point.y+=m.side*(m.hitOffset??3);
  const normal=new THREE.Vector3().setComponent(m.axis,m.side),start=point.clone().addScaledVector(normal,80),slot=s.projStore.alloc();s.projStore.setPosV(slot,start);s.projStore.snapshot(slot);s.projStore.setVelV(slot,normal.clone().multiplyScalar(-200));
  s.projectiles.push({id:`component-${kind}-${i}`,slot,kind,ownerId:'inspection',targetId:ship.id,weaponId:'pulse',damage:25,life:2,homingTurn:0,homingSpeed:200,acceleration:0});
  const before=[...ship.capitalMountHull];s.updateProjectiles(.6);
  assert.equal(ship.capitalMountHull[i],before[i]-25,`${kind} hits ${m.label}`);assert.deepEqual(ship.capitalMountHull.filter((_,j)=>j!==i),before.filter((_,j)=>j!==i));
 }
});
