import {CORVETTES} from './corvetteMounts.js';
import {segmentShipColliderHit} from './shipCollision.js';
import {t} from './i18n.js';
import {friendlyFiringLaneBlocked} from './combatPlanning.js';
import {combatTargetEligible, tracksActivePlayer} from './combatTargeting.js';
import {WEAPON_DAMAGE_SCALE,LAUNCHERS,CORVETTE_BROADSIDE} from './weapons.js';
import * as THREE from 'three';
import {integrateFlightVelocity} from './flightDynamics.js';
import {FRIGATE_MOUNTS,FRIGATE_CLEARANCE,FRIGATE_TORPEDO_MOUNTS,FRIGATE_TORPEDO_LAYOUT} from './frigateMounts.js';
import {FRIGATE_COLLISION_TRIANGLES} from './frigateCollisionData.js';
import {clearTurretArc,shipBlocksRay,updateAutomaticTurrets} from './turrets.js';
import {disruptionFactor} from './weaponDamage.js';
import {relativeIntercept,beginRackLock,rackLockProgress,torpedoMobilityFactor} from './weaponFlight.js';
// Live capital hulls render at twice their authored scale. PDCs use the same
// extents through npcHullExtents; main batteries and assembly hits must agree.
import {capitalHull,capitalMountPosition,FRIGATE_EXTENTS,CAPITAL_HULLS} from './capitalHulls.js';
export {FRIGATE_EXTENTS,capitalMountPosition as frigateMountPosition};
const frigateMountPosition=capitalMountPosition;
export const FRIGATE_GUN=Object.freeze({id:'frigate-battery',kind:'laser',speed:520,range:600,life:600/520,damageFlat:72*WEAPON_DAMAGE_SCALE,energyCost:12});
export const FRIGATE_BOSS_GUN=FRIGATE_GUN;
const FRIGATE_FLIGHT_ACCELERATION=4.8;
const FRIGATE_LATERAL_DAMPING=1.5;
export const FRIGATE_HULL=2600;
const FRIGATE_SHIELD_CAPACITY=650;
const FRIGATE_GENERATOR_REGEN=16;
const forward=new THREE.Vector3(0,0,-1);
export function equipFrigate(ship,boss=false){
 ship.capitalClass='frigate';ship.capitalBoss=boss;
 ship.combatFit={hullId:'concord-frigate',turrets:CAPITAL_HULLS['concord-frigate'].weapons.map(m=>m.kind==='pdc'?'pdc':null),stats:{energyCapacity:240},weapons:[],guns:[],attackOrder:[],fireAt:[],missiles:0};
 ship.energy=240;ship.capitalMountHull=CAPITAL_HULLS['concord-frigate'].mounts.map(m=>m.hull);
 {ship.maxShield=FRIGATE_SHIELD_CAPACITY;ship.shield=ship.maxShield;ship.maxHull=FRIGATE_HULL;ship.hull=ship.maxHull;ship.shieldRegen=FRIGATE_GENERATOR_REGEN*2;ship.turnRate=.12;ship.capitalBaseSpeed??=ship.speed;ship.speed=ship.capitalBaseSpeed;ship.capitalTorpedoes=LAUNCHERS.torpedo.capacity;}
}
export function equipCorvette(ship){
 const spec=CORVETTES[ship.variant],mounts=capitalHull(ship).mounts;
 ship.hullId=ship.variant;ship.capitalBaseSpeed=ship.speed=spec.speed;ship.afterburnSpeed=0;ship.turnRate=.25;ship.engineThrust=1;
 ship.shield=ship.maxShield=ship.capitalShieldCapacity=spec.shield;ship.hull=ship.maxHull=spec.hull;ship.shieldRegen=10;
 ship.capitalMountHull=mounts.map(m=>m.hull);ship.noSurrender=true;ship.mugCapable=false;
 ship.combatFit={hullId:ship.variant,fitId:ship.variant+'-standard',stats:{energyCapacity:200},turrets:mounts.map(m=>m.kind==='pdc'?'pdc':m.kind==='laser'?'tracking-turret':null),guns:[],weapons:[],attackOrder:[],fireAt:[],missiles:0};
 ship.energy=200;
}
function stateFor(ship){
 return ship.capitalRuntime??={position:new THREE.Vector3(),normal:new THREE.Vector3(),direction:new THREE.Vector3(),scratch:new THREE.Vector3(),local:new THREE.Vector3(),inverse:new THREE.Quaternion(),q:new THREE.Quaternion(),goal:new THREE.Quaternion(),target:new THREE.Vector3(),velocity:new THREE.Vector3(),lead:new THREE.Vector3(),torpedoStarts:[new THREE.Vector3(),new THREE.Vector3()],torpedoRay:new THREE.Vector3(),turn:new THREE.Quaternion(),mounts:capitalHull(ship).mounts.map(()=>({direction:new THREE.Vector3(),fireAt:0,chargeAt:0,rounds:0}))};
}
export function frigateMountHitPosition(ship,index,out){
 const s=stateFor(ship);s.q.fromArray(ship.rotation);
 return out.fromArray(capitalHull(ship).mounts[index].hitCenter).applyQuaternion(s.q).add(s.scratch.fromArray(ship.position));
}
// Work in the live pitch frame so the barrel volumes follow both turret axes.
function broadsideBarrelHit(s, mount, segment, padding) {
 const b = mount.barrels;
 const frame = s.barrelFrame ??= {forward:new THREE.Vector3(), right:new THREE.Vector3(),
  up:new THREE.Vector3(), origin:new THREE.Vector3(), start:new THREE.Vector3(), delta:new THREE.Vector3()};
 const {forward, right, up, origin, start, delta} = frame;
 forward.copy(s.mounts[mount.index].direction).applyQuaternion(s.inverse);
 if (!forward.lengthSq()) forward.set(mount.bearing,0,0);
 right.set(-forward.z,0,forward.x).normalize();
 up.crossVectors(right,forward);
 origin.copy(s.local).sub(s.scratch.fromArray(mount.localPosition));
 origin.y -= b.pivotHeight;
 start.set(origin.dot(right),origin.dot(up)-b.height,origin.dot(forward)-b.reach);
 if (segment) delta.set(s.direction.dot(right),s.direction.dot(up),s.direction.dot(forward));
 else delta.set(0,0,0);
 let nearest = Infinity;
 for (let side=-1; side<=1; side+=2) {
  let near=0, far=1;
  for (let axis=0; axis<3; axis++) {
   const o=start.getComponent(axis)-(axis===0?side*b.offset:0), d=delta.getComponent(axis), h=b.half[axis]+padding;
   if (Math.abs(d)<1e-10) {
    if (Math.abs(o)>h) {far=-1; break;}
   } else {
    const t0=(-h-o)/d, t1=(h-o)/d;
    near=Math.max(near,Math.min(t0,t1));
    far=Math.min(far,Math.max(t0,t1));
   }
  }
  if (near<=far) nearest=Math.min(nearest,near);
 }
 return nearest;
}
// Damage is localized in three dimensions; a hit on the opposite side or
// another deck cannot leak through the hull into a nearby component.
export function damageCapitalMount(ship,position,damage){
 if(!ship.capitalMountHull||!position||damage<=0)return -1;
 const s=stateFor(ship);s.local.fromArray(position).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse.fromArray(ship.rotation).invert());
 let nearest=1,index=-1;
 for(const m of capitalHull(ship).mounts){
  const i=m.index;if(ship.capitalMountHull[i]<=0)continue;
  s.lead.fromArray(m.hitCenter);
  const half=m.hitHalfExtents;
  let normalized;
  if(m.hitShape==='cylinder'){
   const dx=s.local.x-s.lead.x,dy=s.local.y-s.lead.y,dz=s.local.z-s.lead.z;
   normalized=Math.max(Math.hypot(dx,dy)/(m.hitRadius+.9),Math.abs(dz)/(m.hitHalfLength+.9));
  }else if(m.hitShape==='box'){
   normalized=Math.max(Math.abs(s.local.x-s.lead.x)/(half[0]+.9),Math.abs(s.local.y-s.lead.y)/(half[1]+.9),Math.abs(s.local.z-s.lead.z)/(half[2]+.9));
  }else normalized=half?Math.hypot((s.local.x-s.lead.x)/(half[0]+.9),(s.local.y-s.lead.y)/(half[1]+.9),(s.local.z-s.lead.z)/(half[2]+.9)):s.local.distanceTo(s.lead)/(m.radius+.9);
  if(m.barrels && broadsideBarrelHit(s,m,false,.9)===0)normalized=0;
  if(normalized<nearest){nearest=normalized;index=i;}
 }
 if(index>=0){
  const minimum=ship.arenaFriendlyObjective&&capitalHull(ship).mounts[index].kind==='engine'?1:0;
  ship.capitalMountHull[index]=Math.max(minimum,ship.capitalMountHull[index]-damage);
  applyCapitalSubsystemEffects(ship);
 }
 return index;
}
export function applyCapitalSubsystemEffects(ship){
 const hull=ship.capitalMountHull;if(!hull)return;
 let thrust=0,engineCount=0,regen=0,booster=true;
 for(const m of capitalHull(ship).mounts){
  const fraction=Math.max(0,Math.min(1,hull[m.index]/m.hull));
  if(m.kind==='engine'){thrust+=fraction;engineCount++;}
  if(m.kind==='generator')regen+=fraction;
  if(m.kind==='booster')booster=fraction>0;
 }
 thrust/=engineCount;
 if(ship.capitalClass==='corvette'){
  if(ship.arenaJumpPoint&&thrust>0)thrust=Math.max(.5,thrust);
  ship.engineThrust=thrust;ship.speed=(booster?ship.capitalBaseSpeed:25)*thrust;
  ship.turnRate=.25*thrust;ship.maxShield=regen>0?ship.capitalShieldCapacity:0;ship.shieldRegen=10*regen;
 }else{
  ship.speed=(ship.capitalBaseSpeed??18)*(.15+.85*thrust);ship.turnRate=.12*(.12+.88*thrust);
  ship.maxShield=regen>0?FRIGATE_SHIELD_CAPACITY:0;ship.shieldRegen=FRIGATE_GENERATOR_REGEN*regen;
 }
 ship.shield=Math.min(Math.max(0,ship.shield??0),ship.maxShield);
}
export function frigateSubsystemLabel(index){return CAPITAL_HULLS['concord-frigate'].mounts[index]?.labelKey??'HULL';}
export function capitalSubsystemExplosionScale(index,hull=CAPITAL_HULLS['concord-frigate']){
 const mount=hull.mounts[index];if(!mount)return .45;
 const radius=mount.hitShape==='cylinder'?Math.max(mount.hitRadius??0,mount.hitHalfLength??0)
  :mount.hitHalfExtents?Math.max(...mount.hitHalfExtents)
  :mount.radius;
 return Math.max(.35,Math.min(2.5,radius*1.18/6.5));
}
// Both launch cells must see a clear shot before the rack commits the pair.
export function frigateTorpedoLaneClear(session,ship,target,targetId){
 const s=stateFor(ship),layout=FRIGATE_TORPEDO_LAYOUT;
 s.q.fromArray(ship.rotation);
 const z=(s.torpedoCell??0)%2===0?-layout.cellZ:layout.cellZ;
 for(let i=0;i<Math.min(2,ship.capitalTorpedoes);i++){
  const muzzle=frigateMountPosition(ship,FRIGATE_TORPEDO_MOUNTS[0],s.torpedoStarts[i]);
  muzzle.add(s.scratch.set(i===0?-layout.cellX:layout.cellX,layout.muzzleHeight,z).applyQuaternion(s.q));
  const ray=s.torpedoRay.subVectors(target,muzzle),distance=ray.length();
  if(!distance||session.lineBlocked(muzzle,target,ship.id)||
   friendlyFiringLaneBlocked(session,ship,muzzle,ray.multiplyScalar(1/distance),distance,targetId))return false;
 }
 return true;
}
// The frigate announces its lock before opening the two-cell launcher.
function updateFrigateTorpedoes(session,ship,dt,targetPosition){
 const s=stateFor(ship),fit=ship.combatFit,now=session.save.world.time;
 if(!targetPosition||!ship.targetId||ship.holdFire||ship.pursuitHoldFire||ship.fleeing||ship.patrolMemoryActive||ship.capitalTorpedoes<1||!FRIGATE_TORPEDO_MOUNTS.some(i=>ship.capitalMountHull[i]>0)||now<(s.torpedoReadyAt??12)){fit.lock=0;return;}
 const launcher=LAUNCHERS.torpedo;
 const primary=ship.targetId==='player'?session.save.player:session.ships.find(actor=>actor.id===ship.targetId);
 s.position.fromArray(ship.position);s.direction.copy(forward).applyQuaternion(s.q.fromArray(ship.rotation));
 const targetActor=session.preferredTorpedoTarget(ship,primary,targetPosition,launcher,s.position,s.direction,120);
 if(!targetActor){fit.lock=0;return;}
 const targetId=targetActor===session.save.player?'player':targetActor.id;
 if(targetActor!==primary)targetPosition=s.target.fromArray(targetActor.position);
 beginRackLock(fit,targetId,'torpedo',now,dt);
 s.direction.copy(targetPosition).sub(s.position);
 const distance=s.direction.length();
 if(distance<120 || distance>launcher.lockRange || session.lineBlocked(s.position,targetPosition,ship.id)){fit.lock=0;return;}
 s.direction.normalize();
 const facing=s.scratch.set(0,0,-1).applyQuaternion(s.q.fromArray(ship.rotation)).dot(s.direction);
 const aspect=targetActor.rotation?s.scratch.set(0,0,-1).applyQuaternion(s.turn.fromArray(targetActor.rotation)).dot(s.direction):0;
 const previous=fit.lock??0;
 const mobility=torpedoMobilityFactor(launcher,ship.velocity,targetActor.velocity,s.direction,distance);
 fit.lock=rackLockProgress(previous,launcher,ship.pilot?.tier,distance,facing,aspect,dt,mobility);
 if(!fit.lock)return;
 if(targetId==='player')session.warnPlayerLock?.(t('TORPEDO LOCK · EVADE'),!previous);
 if(fit.lock<1||mobility===0||(!ship.capitalDisarmed&&ship.capitalAttack!=='SALVO'))return;
 if(!frigateTorpedoLaneClear(session,ship,targetPosition,targetId)){fit.lock=0;return;}
 s.q.fromArray(ship.rotation);
 const salvo=session.projectileCounter+1;
 for(let i=0;i<2;i++){
  if(ship.capitalTorpedoes<=0)continue;
  const slot=session.projStore.alloc();session.projStore.setPosV(slot,s.torpedoStarts[i]);
  s.velocity.copy(forward).applyQuaternion(s.q).multiplyScalar(launcher.speed).add(s.scratch.fromArray(ship.velocity));session.projStore.setVelV(slot,s.velocity);
  session.projectiles.push({id:`p-${++session.projectileCounter}`,slot,salvo,kind:'missile',ownerId:ship.id,targetId,faction:ship.faction,launcherId:'torpedo',hitWeapon:launcher,damage:launcher.damage,life:launcher.life,homingSpeed:launcher.homingSpeed,homingTurn:launcher.homingTurn,acceleration:launcher.acceleration,shield:launcher.projectileShield,splashRadius:launcher.splashRadius,splashMin:launcher.splashMin});
  ship.capitalTorpedoes--;
 }
 if(targetId==='player')session.audio?.playCockpit?.('missileLaunch',.9);
 s.torpedoCell=((s.torpedoCell??0)+1)%2;
 fit.lock=0;s.torpedoReadyAt=now+16;
}
export function updateFrigateBatteries(session,ship,dt,targetPosition,targetVelocity){
 if(!ship.capitalMountHull)equipFrigate(ship,!!ship.capitalBoss);
 ship.energy=Math.min(240,ship.energy+18*dt);

 const s=stateFor(ship),now=session.save.world.time;ship.capitalBatteriesAt=now;
 s.q.fromArray(ship.rotation);s.inverse.copy(s.q).invert();
 const target=targetPosition&&ship.targetId&&!ship.holdFire&&!ship.fleeing&&!ship.patrolMemoryActive;
 if(target)s.target.copy(targetPosition);
 const weapon=FRIGATE_GUN;
 let cycle;
 {
  cycle=s.cycle??={phase:'RECOVERING',until:now+4,serial:0};
  const armed=capitalHull(ship).mounts.some(m=>m.kind==='battery'&&ship.capitalMountHull[m.index]>0);
  ship.capitalDisarmed=!armed;
  let visible=armed&&target&&s.target.distanceTo(s.position.fromArray(ship.position))<=weapon.range&&!session.lineBlocked(s.position,s.target,ship.id);
  if(armed&&target&&!visible){
   for(const actor of session.ships){
    if(!secondaryEnemy(session,ship,actor))continue;
    s.target.fromArray(actor.position);
    if(s.target.distanceTo(s.position)<=weapon.range&&!session.lineBlocked(s.position,s.target,ship.id)){visible=true;break;}
   }
   s.target.copy(targetPosition);
  }
  if(!visible&&cycle.phase!=='RECOVERING'){cycle.phase='RECOVERING';cycle.until=now+3.5;}
  if(now>=cycle.until){
   if(cycle.phase==='RECOVERING'&&visible){cycle.phase='CHARGING';cycle.until=now+2.5;cycle.serial++;}
   else if(cycle.phase==='CHARGING'){cycle.phase='SALVO';cycle.until=now+2.6;cycle.salvoAt=now;}
   else if(cycle.phase==='SALVO'){cycle.phase='RECOVERING';cycle.until=now+3.5;}
  }
  ship.capitalAttack=cycle.phase;ship.capitalAttackRemaining=Math.max(0,cycle.until-now);
 }
 updateFrigateTorpedoes(session,ship,dt,targetPosition);
 ship.capitalTorpedoWarning=ship.combatFit.lock>0;
 ship.combatFit.warned=ship.capitalTorpedoWarning && ship.combatFit.lockTarget==='player';
 updateAutomaticTurrets(session,ship,ship.id,dt);
 for(const {kind,index:i} of capitalHull(ship).mounts)if(kind==='pdc'&&ship.capitalMountHull[i]<=0){frigateMountPosition(ship,i,s.position);session.renderer.showDisabledCapitalMount?.(`${ship.id}-${i}`,s.position,s.q,ship,i);}
 for(const {kind,index:i} of capitalHull(ship).mounts){
  if(kind!=='battery')continue;
  if(ship.capitalMountHull[i]<=0){frigateMountPosition(ship,i,s.position);session.renderer.showDisabledCapitalMount?.(`${ship.id}-main-${i}`,s.position,s.q,ship,i);continue;}
  const m=FRIGATE_MOUNTS[i],gun=s.mounts[i];
  frigateMountPosition(ship,i,s.position);if(m.normal)s.normal.fromArray(m.normal);else s.normal.set(0,0,0).setComponent(m.axis,m.side);s.normal.applyQuaternion(s.q);
  if(gun.direction.lengthSq()<.1)gun.direction.copy(s.normal);
  s.clearance=FRIGATE_CLEARANCE[i];let solution=false;
  let batteryId=ship.targetId,batteryVelocity=targetVelocity;
  if(target){
   s.target.copy(targetPosition);
   // Each broadside may engage a different active enemy, while preserving
   // the shared warning/recovery cycle and the committed salvo solution.
   if(!clearTurretArc(ship,m,FRIGATE_EXTENTS,s.target,s)||session.lineBlocked(s.position,s.target,ship.id)){
    let nearest=weapon.range;
    for(const actor of session.ships){
     if(!secondaryEnemy(session,ship,actor))continue;
     s.target.fromArray(actor.position);const d=s.position.distanceTo(s.target);
     if(d<nearest&&clearTurretArc(ship,m,FRIGATE_EXTENTS,s.target,s)&&!session.lineBlocked(s.position,s.target,ship.id)){
      nearest=d;batteryId=actor.id;batteryVelocity=actor.velocity;
     }
    }
    if(batteryId===ship.targetId)s.target.copy(targetPosition);
    else s.target.fromArray(session.ships.find(actor=>actor.id===batteryId).position);
   }
   if(gun.lockSerial===cycle.serial&&cycle.phase!=='RECOVERING'&&gun.lockedId){
    batteryId=gun.lockedId;
    const actor=batteryId==='player'?session.save.player:session.ships.find(actor=>actor.id===batteryId);
    if(!actor||actor.hull<=0||(batteryId!=='player'&&!combatTargetEligible(actor)))continue;
    if(batteryId===ship.targetId)s.target.copy(targetPosition);else s.target.fromArray(actor.position);
    batteryVelocity=actor.velocity;
   }

   // Commit to the observed course before firing; do not read new player
   // velocity throughout the salvo. A deliberate turn can defeat the solution.
   const offset=(i%2)*1.1,fireAt=cycle.phase==='CHARGING'?cycle.until+offset:(cycle.salvoAt??now)+offset;
   if(cycle.phase!=='RECOVERING'&&now>=fireAt-.6&&gun.lockSerial!==cycle.serial){
    gun.lockSerial=cycle.serial;gun.lockedId=batteryId;gun.lockedAt=now;gun.lockedTarget??=new THREE.Vector3();gun.lockedVelocity??=new THREE.Vector3();
    gun.lockedTarget.copy(s.target);gun.lockedVelocity.copy(batteryVelocity?.isVector3?batteryVelocity:s.velocity.fromArray(batteryVelocity??zeroVelocity));gun.rounds=4;gun.fireAt=fireAt;
   }
   const locked=cycle&&gun.lockSerial===cycle.serial&&cycle.phase!=='RECOVERING';
   const aimTarget=locked?(s.bossAim??=new THREE.Vector3()).copy(gun.lockedTarget).addScaledVector(gun.lockedVelocity,now-gun.lockedAt):s.target;
   const aimVelocity=locked?gun.lockedVelocity:batteryVelocity;
   const flight=relativeIntercept(s.position,aimTarget.toArray(s.targetTuple??=[]),ship.velocity,aimVelocity?.toArray?.(s.velocityTuple??=[])??aimVelocity??[0,0,0],weapon.speed,s.lead);
   s.lead.add(s.position);
   const error=s.position.distanceTo(s.target)*(.003);
   s.lead.x+=Math.sin(now*1.1+i)*error;s.lead.y+=Math.cos(now*.9+i)*error;
   s.direction.copy(s.lead).sub(s.position).normalize();
   solution=Number.isFinite(flight)&&flight<=weapon.life&&clearTurretArc(ship,m,FRIGATE_EXTENTS,s.lead,s)&&!session.lineBlocked(s.position,s.lead,ship.id);
   if(solution){s.turn.setFromUnitVectors(gun.direction,s.direction);s.turn.slerp(newIdentity,1-Math.min(1,1.5*dt/Math.max(.00001,gun.direction.angleTo(s.direction))));gun.direction.applyQuaternion(s.turn).normalize();}
  }
  // Physically return barrels outward if rolling or traversing would bury them.
  s.lead.copy(s.position).addScaledVector(gun.direction,5);
  if(!clearTurretArc(ship,m,FRIGATE_EXTENTS,s.lead,s))gun.direction.copy(s.normal);
  session.renderer.showTurret?.(`${ship.id}-main-${i}`,s.position,gun.direction,'M','laser',s.q,m.side,0,FRIGATE_EXTENTS[2]/m.hullHalfLength,m.axis,ship);
  if(solution){const actor=batteryId==='player'?session.save.player:session.ships.find(x=>x.id===batteryId);if(shipBlocksRay(session,ship,ship.id,actor,s.target,s))solution=false;}
  if(cycle){
   const groupFireAt=cycle.phase==='CHARGING'?cycle.until+(i%2)*1.1:(cycle.salvoAt??now)+(i%2)*1.1;
   if(cycle.phase==='CHARGING'||cycle.phase==='SALVO'&&now<groupFireAt){
    if(solution)session.renderer.showCapitalCharge?.(`${ship.id}-${i}`,s.position,Math.max(0,1-(groupFireAt-now)/2.5),ship);
    continue;
   }
   if(cycle.phase!=='SALVO'||!solution||gun.rounds<=0)continue;
  }
  if(now<gun.fireAt||gun.direction.dot(s.direction)<.998)continue;
  const factor=disruptionFactor(ship,now),cost=weapon.energyCost*factor;
  if(ship.energy<cost)continue;
  s.lead.copy(s.position).addScaledVector(gun.direction,8.6);
  if(session.lineBlocked(s.position,s.lead,ship.id))continue;
  ship.energy-=cost;
  session.spawnGunProjectile(ship.id,weapon,s.lead,gun.direction,ship.velocity,batteryId,`${ship.id}-main-${i}`);
  session.renderer.spawnMuzzleFlash?.(s.lead.x,s.lead.y,s.lead.z,0xffb366);
  gun.rounds--;gun.fireAt=now+(gun.rounds?.42:5)*factor;
  if(!gun.rounds)gun.chargeAt=0;
 }
}
const newIdentity=new THREE.Quaternion();
// Separate steering scratch from battery scratch: battery transforms overwrite stateFor vectors.
function navigationFor(ship){
 return stateFor(ship).navigation??={radial:new THREE.Vector3(),tangent:new THREE.Vector3(),axis:new THREE.Vector3(),other:new THREE.Vector3(),desired:new THREE.Vector3(),heading:new THREE.Vector3(),right:new THREE.Vector3(),velocity:new THREE.Vector3(),position:new THREE.Vector3(),q:new THREE.Quaternion(),goal:new THREE.Quaternion(),roll:new THREE.Quaternion()};
}
function secondaryEnemy(session,ship,actor){
 const probe=stateFor(ship).enemyProbe??={ownerId:ship.id};probe.faction=ship.faction;probe.targetId=ship.targetId;
 return actor!==ship&&actor.id!==ship.targetId&&combatTargetEligible(actor)
  &&actor.instanceId===ship.instanceId
  &&session.projectileCanHitShip(probe,actor);
}
export function updateCorvetteWeapons(session,ship,dt,targetPosition,targetVelocity){
 const s=stateFor(ship),now=session.save.world.time;
 ship.capitalBatteriesAt=now;ship.energy=Math.min(200,ship.energy+15*dt);
 if(ship.targetId==='player' && !tracksActivePlayer(session,ship))targetPosition=undefined;
 if(targetPosition)s.target.copy(targetPosition);
 updateAutomaticTurrets(session,ship,ship.id,dt);
 s.q.fromArray(ship.rotation);
 for(const m of capitalHull(ship).mounts){
  if(m.kind==='laser'||m.kind==='pdc'){
   if(ship.capitalMountHull[m.index]<=0){
    capitalMountPosition(ship,m.index,s.position);
    session.renderer.showDisabledCapitalMount?.((s.mounts[m.index].disabledKey??=ship.id+'-'+m.index),s.position,s.q,ship,m.index);
   }
   continue;
  }
  if(m.kind!=='broadside')continue;
  const gun=s.mounts[m.index],weapon=CORVETTE_BROADSIDE;
  capitalMountPosition(ship,m.index,s.position);
  s.normal.set(m.bearing,0,0).applyQuaternion(s.q);
  if(!gun.direction.lengthSq())gun.direction.copy(s.normal);
  let aim=false;
  if(ship.capitalMountHull[m.index]>0&&targetPosition&&!ship.surrendered&&!ship.poweredDown&&!ship.captured&&!ship.holdFire&&!ship.pursuitHoldFire&&!ship.patrolMemoryActive){
   const flight=relativeIntercept(s.position,s.target.toArray(s.targetTuple??=[]),ship.velocity,targetVelocity?.isVector3?targetVelocity.toArray(s.velocityTuple??=[]):targetVelocity??zeroVelocity,weapon.speed,s.lead);
   s.direction.copy(s.lead).normalize();
   aim=flight<=weapon.life&&s.direction.dot(s.normal)>.5;
   if(aim){
    s.lead.add(s.position);s.scratch.copy(s.position).addScaledVector(s.direction,2);s.scratch.addScaledVector(s.local.set(0,1,0).applyQuaternion(s.q),1.3);
    aim=segmentShipColliderHit(s.scratch,s.lead,ship.position,ship.rotation,ship.variant,2)===undefined&&!session.lineBlocked(s.position,s.lead,ship.id)
      &&!friendlyFiringLaneBlocked(session,ship,s.position,s.direction,s.position.distanceTo(s.lead),ship.targetId);
   }
  }
  if(!aim)s.direction.copy(s.normal);
  s.turn.setFromUnitVectors(gun.direction,s.direction);
  s.turn.slerp(newIdentity,1-Math.min(1,dt/Math.max(.00001,gun.direction.angleTo(s.direction))));
  gun.direction.applyQuaternion(s.turn).normalize();
  session.renderer.showTurret?.((gun.key??=ship.id+'-main-'+m.index),s.position,gun.direction,'S','broadside',s.q,1,0,1,1,ship,m.index);
  if(!aim||now<gun.fireAt||gun.direction.dot(s.direction)<.998||ship.energy<weapon.energyCost)continue;
  s.lead.copy(s.position).addScaledVector(s.local.set(0,1,0).applyQuaternion(s.q),1.3).addScaledVector(gun.direction,6);
  session.spawnGunProjectile(ship.id,weapon,s.lead,gun.direction,ship.velocity,ship.targetId,gun.key);
  session.renderer.spawnMuzzleFlash?.(s.lead.x,s.lead.y,s.lead.z,0xffb366);
  ship.energy-=weapon.energyCost;gun.fireAt=now+weapon.cooldown;
 }
}
export function updateCapitalBroadsideAttack(session,ship,targetPosition,targetVelocity,dt){
 const s=stateFor(ship),n=navigationFor(ship);
 n.position.fromArray(ship.position);n.q.fromArray(ship.rotation);
 n.radial.copy(targetPosition).sub(n.position);const distance=n.radial.length();
 if(distance<1e-6)n.radial.set(1,0,0);else n.radial.multiplyScalar(1/distance);
 if(s.attackSide===undefined||s.attackTarget!==ship.targetId){
  s.attackTarget=ship.targetId;s.local.copy(n.radial).applyQuaternion(s.inverse.copy(n.q).invert());
  s.attackSide=s.local.x>=0?1:-1;
 }
 const corvette=ship.capitalClass==='corvette';
 const preferred=corvette?520:FRIGATE_GUN.range*.69,band=corvette?20:FRIGATE_GUN.range*.06;
 // Aim a broadside at the primary. If a valid enemy is substantially
 // opposite it, bisect the pair so one can fall on each side of the hull.
 n.axis.copy(n.radial);
 let best=.35,opponent;
 for(const actor of session.ships){
  if(!secondaryEnemy(session,ship,actor))continue;
  n.other.fromArray(actor.position);const d=n.other.distanceTo(n.position);
  if(d<1||d>FRIGATE_GUN.range||session.lineBlocked(n.position,n.other,ship.id))continue;
  n.other.sub(n.position).multiplyScalar(1/d);
  const opposition=-n.radial.dot(n.other);
  if(opposition>best){best=opposition;opponent=actor;}
 }
 if(opponent){
  n.other.fromArray(opponent.position).sub(n.position).normalize();
  n.axis.sub(n.other);
  if(n.axis.lengthSq()>.001)n.axis.normalize();else n.axis.copy(n.radial);
 }
 n.axis.multiplyScalar(s.attackSide);

 // Preserve the current flight heading where possible instead of selecting a
 // new world-up orbit direction every few seconds.
 n.heading.copy(forward).applyQuaternion(n.q);
 n.heading.addScaledVector(n.axis,-n.heading.dot(n.axis));
 if(n.heading.lengthSq()<.001){
  n.heading.crossVectors(worldUp,n.axis);
  if(n.heading.lengthSq()<.001){
   n.heading.set(Math.abs(n.axis.x)<.8?1:0,Math.abs(n.axis.x)<.8?0:1,0);
   n.heading.addScaledVector(n.axis,-n.heading.dot(n.axis));
  }
 }
 n.heading.normalize();
 const error=distance-preferred;
 const correction=Math.max(-ship.speed,Math.min(ship.speed,(Math.abs(error)>band?error-Math.sign(error)*band:0)*.12));
 // Approach or open range more directly when far outside the firing band,
 // then flatten into a broadside pass. The hull turns toward this path before
 // its engines build speed; no lateral velocity is commanded.
 const rangeBias=correction===0?0:Math.sign(correction)*(.22+.58*Math.min(1,Math.max(0,(Math.abs(error)-band)/200)));
 n.heading.multiplyScalar(Math.sqrt(1-rangeBias*rangeBias)).addScaledVector(n.radial,rangeBias).normalize();
 if(targetVelocity?.isVector3)n.other.copy(targetVelocity);else n.other.fromArray(targetVelocity??zeroVelocity);
 n.desired.copy(n.other).addScaledVector(n.heading,Math.abs(correction));
 // Keep a dead band for range control without strafing to hold a firing lane.
 const blocked=session.lineBlocked(n.position,targetPosition,ship.id);
 if(blocked)n.desired.addScaledVector(n.heading,ship.speed*.8);
 n.desired.clampLength(0,ship.speed);
 if(session.getAvoidanceVector){
  n.other.copy(n.desired);if(n.other.lengthSq()<.001)n.other.copy(n.heading);else n.other.normalize();
  const avoid=session.getAvoidanceVector(n.position,n.other,FRIGATE_EXTENTS[2]+20,ship.speed);
  if(avoid.lengthSq()>.001)n.desired.addScaledVector(avoid,ship.speed).clampLength(0,ship.speed);
 }

 const trafficAvoidance=corvette&&session.getShipAvoidance?.(n.position,n.velocity.fromArray(ship.velocity),ship);
 if(trafficAvoidance)n.desired.addScaledVector(trafficAvoidance,ship.speed).clampLength(0,ship.speed);

 // Aim the bow along the requested flight path, then roll one broadside onto
 // the target. Inertial side slip is damped by the same assisted-flight model
 // used by other ships rather than being commanded every combat step.
 if(n.desired.lengthSq()>.001&&(!corvette||trafficAvoidance||distance>600||distance<400))n.heading.copy(n.desired).normalize();
 n.goal.setFromUnitVectors(forward,n.heading);
 n.right.set(1,0,0).applyQuaternion(n.goal);
 n.tangent.crossVectors(n.right,n.axis);
 n.roll.setFromAxisAngle(
  n.heading,
  Math.atan2(n.tangent.dot(n.heading),n.right.dot(n.axis))
 );
 n.goal.premultiply(n.roll);
 n.q.rotateTowards(n.goal,ship.turnRate*dt);n.q.toArray(ship.rotation);
 n.tangent.copy(forward).applyQuaternion(n.q).normalize();
 n.velocity.fromArray(ship.velocity);
 const targetSpeed=Math.max(0,Math.min(ship.speed,n.desired.dot(n.tangent)));
 const engineFraction=Math.max(.15,Math.min(1,ship.speed/Math.max(1,ship.capitalBaseSpeed??18)));
 integrateFlightVelocity(n.velocity,n.tangent,targetSpeed,ship.speed,FRIGATE_FLIGHT_ACCELERATION*engineFraction,true,false,targetSpeed>0?1:0,dt,FRIGATE_LATERAL_DAMPING);
 n.position.addScaledVector(n.velocity,dt);
 n.velocity.toArray(ship.velocity);n.position.toArray(ship.position);
 s.goal.copy(n.goal);ship.capitalPreferredRange=preferred;
 if(corvette)updateCorvetteWeapons(session,ship,dt,targetPosition,targetVelocity);
 else updateFrigateBatteries(session,ship,dt,targetPosition,targetVelocity);
}
const zeroVelocity=[0,0,0];
const worldUp=new THREE.Vector3(0,1,0);

// The small structural mesh is exported from Blender in the gameplay frame.
// Möller–Trumbore intersection runs on numeric buffers, without per-shot objects.
export function segmentFrigateHullHit(start,end,ship){
 if(ship.capitalClass!=='frigate')return undefined;
 const s=stateFor(ship);s.inverse.fromArray(ship.rotation).invert();
 s.local.copy(start).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse);
 s.direction.copy(end).sub(start).applyQuaternion(s.inverse);
 const ox=s.local.x,oy=s.local.y,oz=s.local.z,dx=s.direction.x,dy=s.direction.y,dz=s.direction.z;
 if(Math.max(ox,ox+dx)<-38||Math.min(ox,ox+dx)>38||Math.max(oy,oy+dy)<-45||Math.min(oy,oy+dy)>44||Math.max(oz,oz+dz)<-102||Math.min(oz,oz+dz)>114)return undefined;
 const v=FRIGATE_COLLISION_TRIANGLES;let nearest=Infinity;
 for(let i=0;i<v.length;i+=9){
  const e1x=v[i+3]-v[i],e1y=v[i+4]-v[i+1],e1z=v[i+5]-v[i+2],e2x=v[i+6]-v[i],e2y=v[i+7]-v[i+1],e2z=v[i+8]-v[i+2];
  const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x,det=e1x*px+e1y*py+e1z*pz;
  if(Math.abs(det)<1e-9)continue;
  const tx=ox-v[i],ty=oy-v[i+1],tz=oz-v[i+2],u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
  const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,w=(dx*qx+dy*qy+dz*qz)/det;if(w<0||u+w>1)continue;
  const t=(e2x*qx+e2y*qy+e2z*qz)/det;if(t>=0&&t<=1&&t<nearest)nearest=t;
 }
 return Number.isFinite(nearest)?nearest:undefined;
}

// Exposed mount envelopes supplement the ordinary ellipsoid hull collision.
export function segmentCapitalMountHit(start,end,ship,padding=0){
 if(!ship.capitalMountHull||ship.capitalClass==='cruiser')return undefined;
 const s=stateFor(ship);s.inverse.fromArray(ship.rotation).invert();
 s.local.copy(start).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse);
 s.direction.copy(end).sub(start).applyQuaternion(s.inverse);const a=s.direction.lengthSq();if(a<1e-14)return undefined;
 let nearest=Infinity;
 for(const m of capitalHull(ship).mounts){
  const i=m.index;if(ship.capitalMountHull[i]<=0)continue;
  if(m.barrels)nearest=Math.min(nearest,broadsideBarrelHit(s,m,true,padding));
  s.lead.fromArray(m.hitCenter);
  s.scratch.copy(s.local).sub(s.lead);const half=m.hitHalfExtents;
  if(m.hitShape==='cylinder'){
   const {x:ox,y:oy,z:oz}=s.scratch,{x:dx,y:dy,z:dz}=s.direction,r=m.hitRadius+padding,h=m.hitHalfLength+padding;
   const radialStart=ox*ox+oy*oy;
   if(radialStart<=r*r&&Math.abs(oz)<=h){nearest=0;continue;}
   let hit=Infinity;const aa=dx*dx+dy*dy,bb=2*(ox*dx+oy*dy),cc=radialStart-r*r,disc=bb*bb-4*aa*cc;
   if(aa>1e-14&&disc>=0){const root=Math.sqrt(disc),inv=1/(2*aa),t0=(-bb-root)*inv,t1=(-bb+root)*inv;if(t0>=0&&t0<=1&&Math.abs(oz+dz*t0)<=h)hit=Math.min(hit,t0);if(t1>=0&&t1<=1&&Math.abs(oz+dz*t1)<=h)hit=Math.min(hit,t1);}
   if(Math.abs(dz)>1e-14){let t=-h-oz;t/=dz;if(t>=0&&t<=1){const x=ox+dx*t,y=oy+dy*t;if(x*x+y*y<=r*r)hit=Math.min(hit,t);}t=h-oz;t/=dz;if(t>=0&&t<=1){const x=ox+dx*t,y=oy+dy*t;if(x*x+y*y<=r*r)hit=Math.min(hit,t);}}
   nearest=Math.min(nearest,hit);continue;
  }
  if(m.hitShape==='box'){
   let near=0,far=1;
   for(let axis=0;axis<3;axis++){
    const o=s.scratch.getComponent(axis),d=s.direction.getComponent(axis),h=half[axis]+padding;
    if(Math.abs(d)<1e-10){if(Math.abs(o)>h){far=-1;break;}continue;}
    const a=(-h-o)/d,b=(h-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
   }
   if(near<=far)nearest=Math.min(nearest,near);
   continue;
  }
  const rx=(half?.[0]??m.radius)+padding,ry=(half?.[1]??m.radius)+padding,rz=(half?.[2]??m.radius)+padding;
  const dx=s.direction.x/rx,dy=s.direction.y/ry,dz=s.direction.z/rz,ox=s.scratch.x/rx,oy=s.scratch.y/ry,oz=s.scratch.z/rz;
  const aa=dx*dx+dy*dy+dz*dz,b=2*(ox*dx+oy*dy+oz*dz),c=ox*ox+oy*oy+oz*oz-1,disc=b*b-4*aa*c;
  if(disc<0)continue;const t=(-b-Math.sqrt(disc))/(2*aa);if(t>=0&&t<=1)nearest=Math.min(nearest,t);
 }
 return Number.isFinite(nearest)?nearest:undefined;
}

export function visibleFrigateBatteries(session,ship,observer){
 const s=stateFor(ship),indices=[];s.inverse.fromArray(ship.rotation).invert();
 const point=new THREE.Vector3().fromArray(observer);
 for(let i=0;i<FRIGATE_MOUNTS.length;i++){frigateMountPosition(ship,i,s.position);s.clearance=FRIGATE_CLEARANCE[i];
  const m=FRIGATE_MOUNTS[i];
  const exposed=m.size?clearTurretArc(ship,m,FRIGATE_EXTENTS,point,s):s.local.copy(point).sub(s.position).applyQuaternion(s.inverse).getComponent(m.axis)*m.side>0;
  if(exposed&&!session.lineBlocked(s.position,point,ship.id))indices.push(i);
 }
 return indices;
}

// Capital hull plating resists light guns; exposed assemblies remain vulnerable.
// Shields retain ordinary weapon interactions, including ion's specialist role.
const lightCapitalWeapons=new Set(['pulse','pulse-mk2','beam','ripper','pdc','tracking-turret']);
export const frigateHullDamageScale=weapon=>weapon?.id==='gauss'?.6:lightCapitalWeapons.has(weapon?.id)?.08:1;

// Existing frigate callers share the same subsystem and broadside simulation.
export {damageCapitalMount as damageFrigateMount, segmentCapitalMountHit as segmentFrigateMountHit, applyCapitalSubsystemEffects as applyFrigateSubsystemEffects, capitalSubsystemExplosionScale as frigateSubsystemExplosionScale, updateCapitalBroadsideAttack as updateFrigateAttack};
