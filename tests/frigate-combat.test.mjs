import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {equipFrigate,updateFrigateBatteries,updateFrigateAttack,frigateMountPosition,damageFrigateMount,FRIGATE_GUN,FRIGATE_BOSS_GUN,FRIGATE_EXTENTS,visibleFrigateBatteries} from '../src/game/capitalCombat.js';
import {WEAPON_DAMAGE_SCALE} from '../src/game/weapons.js';
import {FRIGATE_MOUNTS} from '../src/game/frigateMounts.js';
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
test('hostile patrols keep the player target; friendly patrols still defend against hostiles',()=>{const {s,ship}=stage();ship.playerAwareness=1;s.shipTracksPlayer=()=>true;s.resolveShipTarget(ship);assert.equal(ship.targetId,'player');ship.faction='red-talons';const friend=s.spawnShip('patrol',[0,0,50]);friend.hostile=false;s.resolveShipTarget(friend);assert.equal(friend.targetId,ship.id);});
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

test('frigate reserves speed for range control before matching lateral target motion',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(600,0,0),lateralVelocity=new THREE.Vector3(0,0,18);
 updateFrigateAttack(s,ship,point,lateralVelocity,1/60);
 const desired=ship.capitalRuntime.navigation.desired;
 assert.ok(desired.x>17.9,`frigate should close at hull speed outside its firing band: ${desired.x}`);
 assert.ok(desired.length()<=ship.speed+.001);
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

test('frigate closes from outside battery range then holds distance without running down its target',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(800,0,0),velocity=new THREE.Vector3();let minimum=Infinity;
 for(let i=0;i<90*60;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);minimum=Math.min(minimum,point.distanceTo(new THREE.Vector3(...ship.position)));}
 const range=point.distanceTo(new THREE.Vector3(...ship.position));assert.ok(range>370&&range<470,`range ${range}`);assert.ok(minimum>350);assert.ok(Math.hypot(...ship.velocity)<1);
 const right=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...ship.rotation));assert.ok(Math.abs(right.dot(point.clone().sub(new THREE.Vector3(...ship.position)).normalize()))>.95);
});
test('frigate opens distance from a close target and pursues a retreating one without exceeding hull speed',()=>{
 const {s,ship}=stage();ship.holdFire=true;s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);
 const point=new THREE.Vector3(130,0,0),velocity=new THREE.Vector3();
 for(let i=0;i<1800;i++){s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);}
 assert.ok(point.distanceTo(new THREE.Vector3(...ship.position))>340);
 velocity.set(8,0,0);const start=ship.position[0];
 for(let i=1800;i<5400;i++){point.addScaledVector(velocity,1/60);s.save.world.time=i/60;updateFrigateAttack(s,ship,point,velocity,1/60);assert.ok(Math.hypot(...ship.velocity)<=ship.speed+.001);}
 assert.ok(ship.position[0]>start+100);assert.ok(point.distanceTo(new THREE.Vector3(...ship.position))<500);
});
test('opposite broadsides shoot distinct active enemies and respect shared recovery',()=>{
 const {s,ship}=stage();const enemy=s.spawnShip('pirate',[-380,0,0]);enemy.instanceId=ship.instanceId;enemy.pendingMug=false;enemy.holdFire=false;enemy.targetId=ship.id;
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
  const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,150);s.projStore.setVel(slot,0,0,-115);
  s.projectiles.push({id:`tor-${shot}`,slot,kind:'missile',ownerId:'player',launcherId:'torpedo',damage:LAUNCHERS.torpedo.damage,life:2,targetId:ship.id,targetMount:8,homingSpeed:115,homingTurn:.28,acceleration:140,shield:12});
  s.updateProjectiles(.5);
  assert.equal(ship.shield,shield);assert.ok(ship.speed<originalSpeed);
 }
 assert.equal(ship.capitalMountHull[8],0);assert.ok(ship.speed<=originalSpeed*.16);assert.ok(ship.turnRate<.03);
 assert.equal(ship.capitalMountHull[0],100);assert.equal(ship.shieldRegen,8);
});
test('each generator removes half the recharge without disabling guns or engines',()=>{
 const {s,ship}=stage();ship.shield=0;const speed=ship.speed;
 for(const [index,regen] of [[9,4],[10,0]]){
  const point=frigateMountPosition(ship,index,new THREE.Vector3()).toArray();
  assert.equal(damageFrigateMount(ship,point,95),index);assert.equal(ship.shieldRegen,regen);
 }
 assert.equal(ship.speed,speed);assert.equal(ship.capitalMountHull[8],160);assert.equal(ship.capitalMountHull[2],100);
 assert.equal(damageFrigateMount(ship,[0,0,-110],200),-1,'a bow strike cannot damage rear engines');
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
test('frigate torpedoes have a finite magazine, warning, cooldown, and cover interruption',()=>{
 const {s,ship}=stage(),point=new THREE.Vector3(380,0,0);s.spawnGunProjectile=()=>{};
 let warnings=0;for(let i=0;i<120*60;i++){s.save.world.time=i/60;updateFrigateBatteries(s,ship,1/60,point,new THREE.Vector3());if(ship.capitalTorpedoWarning)warnings++;}
 assert.ok(warnings>180);assert.ok(s.projectiles.length>2&&s.projectiles.length<=6);assert.equal(ship.capitalTorpedoes+s.projectiles.length,6);
 const other=stage();other.s.lineBlocked=()=>true;
 for(let i=0;i<1800;i++){other.s.save.world.time=i/60;updateFrigateBatteries(other.s,other.ship,1/60,point,new THREE.Vector3());}
 assert.equal(other.s.projectiles.length,0);assert.equal(other.ship.capitalTorpedoWarning,false);
});
test('stern and generator aim points remain selectable after destruction to show effects',()=>{
 const {s,ship}=stage();s.save.player.currentTargetId=ship.id;s.save.player.position=[0,0,300];
 assert.ok(visibleFrigateBatteries(s,ship,s.save.player.position).includes(8));
 assert.ok(!visibleFrigateBatteries(s,ship,[0,0,-300]).includes(8));
 s.capitalSubtarget={id:ship.id,index:8};damageFrigateMount(ship,[0,0,112.9],160);
 assert.equal(s.getTargetRef().mount,8);assert.deepEqual(s.getTargetRef().position,[0,0,112.9]);
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
