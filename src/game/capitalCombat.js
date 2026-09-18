import {combatTargetEligible} from './combatTargeting.js';
import {WEAPON_DAMAGE_SCALE} from './weapons.js';
import * as THREE from 'three';
import {FRIGATE_MOUNTS,FRIGATE_CLEARANCE} from './frigateMounts.js';
import {clearTurretArc,shipBlocksRay,updateAutomaticTurrets} from './turrets.js';
import {disruptionFactor} from './weaponDamage.js';
import {relativeIntercept} from './weaponFlight.js';
// Live capital hulls render at twice their authored scale. PDCs use the same
// extents through npcHullExtents; main batteries and assembly hits must agree.
export const FRIGATE_EXTENTS=[37.46,44.92,112.9];
export const FRIGATE_GUN=Object.freeze({id:'frigate-battery',kind:'laser',speed:520,range:600,life:600/520,damageFlat:72*WEAPON_DAMAGE_SCALE,energyCost:12});
export const FRIGATE_BOSS_GUN=FRIGATE_GUN;
const forward=new THREE.Vector3(0,0,-1);
export function equipFrigate(ship,boss=false){
 ship.capitalBoss=boss;
 ship.combatFit={hullId:'concord-frigate',turrets:[null,null,null,null,'pdc','pdc','pdc','pdc'],stats:{energyCapacity:240},weapons:[],guns:[],attackOrder:[],fireAt:[],missiles:0};
 ship.energy=240;ship.capitalMountHull=FRIGATE_MOUNTS.map((_,i)=>i<4?100:65);
 {ship.maxShield=650;ship.shield=650;ship.maxHull=1400;ship.hull=1400;ship.shieldRegen=0;ship.turnRate=.24;}
}
function stateFor(ship){
 return ship.capitalRuntime??={position:new THREE.Vector3(),normal:new THREE.Vector3(),direction:new THREE.Vector3(),scratch:new THREE.Vector3(),local:new THREE.Vector3(),inverse:new THREE.Quaternion(),q:new THREE.Quaternion(),goal:new THREE.Quaternion(),target:new THREE.Vector3(),velocity:new THREE.Vector3(),lead:new THREE.Vector3(),turn:new THREE.Quaternion(),mounts:FRIGATE_MOUNTS.map(()=>({direction:new THREE.Vector3(),fireAt:0,chargeAt:0,rounds:0}))};
}
export function frigateMountPosition(ship,index,out){
 const s=stateFor(ship),m=FRIGATE_MOUNTS[index];s.q.fromArray(ship.rotation);
 return out.fromArray(m.position).multiply(s.scratch.fromArray(FRIGATE_EXTENTS)).applyQuaternion(s.q).add(s.scratch.fromArray(ship.position));
}
// Hull collision proxies sit outside recessed decks. Match the impact's two
// panel coordinates to the exposed assembly, never damage one through the hull.
export function damageFrigateMount(ship,position,damage){
 if(ship.capitalClass!=='frigate'||!position||damage<=0||!ship.capitalMountHull)return -1;
 const s=stateFor(ship);s.local.fromArray(position).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse.fromArray(ship.rotation).invert());
 let nearest=14,index=-1;
 for(let i=0;i<FRIGATE_MOUNTS.length;i++){
  if(ship.capitalMountHull[i]<=0)continue;
  const m=FRIGATE_MOUNTS[i];if(s.local.getComponent(m.axis)*m.side<0)continue;
  let squared=0;for(let a=0;a<3;a++)if(a!==m.axis)squared+=(s.local.getComponent(a)-m.position[a]*FRIGATE_EXTENTS[a])**2;
  if(Math.sqrt(squared)<nearest){nearest=Math.sqrt(squared);index=i;}
 }
 if(index>=0)ship.capitalMountHull[index]=Math.max(0,ship.capitalMountHull[index]-damage);
 return index;
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
  const armed=ship.capitalMountHull[0]>0||ship.capitalMountHull[1]>0||ship.capitalMountHull[2]>0||ship.capitalMountHull[3]>0;
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
 updateAutomaticTurrets(session,ship,ship.id,dt);
 for(let i=4;i<8;i++)if(ship.capitalMountHull[i]<=0){frigateMountPosition(ship,i,s.position);session.renderer.showDisabledCapitalMount?.(`${ship.id}-${i}`,s.position,s.q,ship,i);}
 for(let i=0;i<4;i++){
  if(ship.capitalMountHull[i]<=0){frigateMountPosition(ship,i,s.position);session.renderer.showDisabledCapitalMount?.(`${ship.id}-main-${i}`,s.position,s.q,ship,i);continue;}
  const m=FRIGATE_MOUNTS[i],gun=s.mounts[i];
  frigateMountPosition(ship,i,s.position);s.normal.set(0,0,0).setComponent(m.axis,m.side).applyQuaternion(s.q);
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
 return stateFor(ship).navigation??={radial:new THREE.Vector3(),tangent:new THREE.Vector3(),axis:new THREE.Vector3(),other:new THREE.Vector3(),desired:new THREE.Vector3(),heading:new THREE.Vector3(),velocity:new THREE.Vector3(),position:new THREE.Vector3(),q:new THREE.Quaternion(),goal:new THREE.Quaternion(),until:0};
}
function secondaryEnemy(session,ship,actor){
 const probe=stateFor(ship).enemyProbe??={ownerId:ship.id};probe.faction=ship.faction;probe.targetId=ship.targetId;
 return actor!==ship&&actor.id!==ship.targetId&&combatTargetEligible(actor)
  &&actor.instanceId===ship.instanceId
  &&session.projectileCanHitShip(probe,actor);
}
export function updateFrigateAttack(session,ship,targetPosition,targetVelocity,dt){
 const s=stateFor(ship),n=navigationFor(ship),now=session.save.world.time;
 n.position.fromArray(ship.position);n.q.fromArray(ship.rotation);
 n.radial.copy(targetPosition).sub(n.position);const distance=n.radial.length();
 if(distance<1e-6)n.radial.set(1,0,0);else n.radial.multiplyScalar(1/distance);
 if(s.attackSide===undefined||s.attackTarget!==ship.targetId){
  s.attackTarget=ship.targetId;s.local.copy(n.radial).applyQuaternion(s.inverse.copy(n.q).invert());
  s.attackSide=s.local.x>=0?-1:1;n.until=0;
 }
 const preferred=FRIGATE_GUN.range*.69,band=FRIGATE_GUN.range*.06;
 // Re-evaluate headings slowly. Opposite threats can use both broadsides;
 // clustered threats do not tempt the frigate into the middle of the group.
 if(now>=n.until){
  n.axis.copy(n.radial);let best=0,opponent;
  for(const actor of session.ships){
   if(!secondaryEnemy(session,ship,actor))continue;
   n.other.fromArray(actor.position).sub(n.position);const d=n.other.length();
   if(d<1||d>FRIGATE_GUN.range||session.lineBlocked(n.position,n.other.fromArray(actor.position),ship.id))continue;
   n.other.fromArray(actor.position).sub(n.position).normalize();const opposition=-n.radial.dot(n.other);
   if(opposition>Math.max(.35,best)){best=opposition;opponent=actor;}
  }
  if(opponent){n.other.fromArray(opponent.position).sub(n.position).normalize();n.axis.sub(n.other).normalize();}
  n.tangent.crossVectors(worldUp,n.axis);
  if(n.tangent.lengthSq()<.001)n.tangent.set(1,0,0);else n.tangent.normalize();
  n.tangent.multiplyScalar(s.attackSide);
  n.heading.copy(n.tangent);n.goal.setFromUnitVectors(forward,n.heading);n.until=now+2;
 }
 // Keep a dead band instead of a threshold-driven forward/reverse throttle.
 // Lateral station-keeping lets the hull stay broadside without ramming the target.
 const error=distance-preferred;
 const radialSpeed=Math.max(-ship.speed,Math.min(ship.speed,(Math.abs(error)>band?error-Math.sign(error)*band:0)*.12));
 if(targetVelocity?.isVector3)n.desired.copy(targetVelocity);else n.desired.fromArray(targetVelocity??zeroVelocity);
 n.desired.clampLength(0,ship.speed*.65).addScaledVector(n.radial,radialSpeed);
 const blocked=session.lineBlocked(n.position,targetPosition,ship.id);
 if(blocked)n.desired.addScaledVector(n.tangent,ship.speed*.7);
 n.desired.clampLength(0,ship.speed);
 if(session.getAvoidanceVector){
  n.other.copy(n.desired);if(n.other.lengthSq()<.001)n.other.copy(n.heading);else n.other.normalize();
  const avoid=session.getAvoidanceVector(n.position,n.other,FRIGATE_EXTENTS[2]+20,ship.speed);
  if(avoid.lengthSq()>.001)n.desired.addScaledVector(avoid,ship.speed).clampLength(0,ship.speed);
 }
 n.q.rotateTowards(n.goal,ship.turnRate*dt);n.q.toArray(ship.rotation);
 n.velocity.fromArray(ship.velocity).lerp(n.desired,1-Math.exp(-dt*.3));n.position.addScaledVector(n.velocity,dt);
 n.velocity.toArray(ship.velocity);n.position.toArray(ship.position);
 s.goal.copy(n.goal);ship.capitalPreferredRange=preferred;
 updateFrigateBatteries(session,ship,dt,targetPosition,targetVelocity);
}
const zeroVelocity=[0,0,0];
const worldUp=new THREE.Vector3(0,1,0);

// Exposed mount envelopes supplement the ordinary ellipsoid hull collision.
export function segmentFrigateMountHit(start,end,ship,padding=0){
 if(ship.capitalClass!=='frigate'||!ship.capitalMountHull)return undefined;
 const s=stateFor(ship);s.inverse.fromArray(ship.rotation).invert();
 s.local.copy(start).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse);
 s.direction.copy(end).sub(start).applyQuaternion(s.inverse);const a=s.direction.lengthSq();if(a<1e-14)return undefined;
 let nearest=Infinity;
 for(let i=0;i<FRIGATE_MOUNTS.length;i++){
  if(ship.capitalMountHull[i]<=0)continue;
  const m=FRIGATE_MOUNTS[i];s.lead.fromArray(m.position).multiply(s.scratch.fromArray(FRIGATE_EXTENTS));
  s.scratch.copy(s.local).sub(s.lead);const b=2*s.scratch.dot(s.direction),radius=(i<4?6.2:4)+padding,c=s.scratch.lengthSq()-radius*radius,disc=b*b-4*a*c;
  if(disc<0)continue;const t=(-b-Math.sqrt(disc))/(2*a);if(t>=0&&t<=1)nearest=Math.min(nearest,t);
 }
 return Number.isFinite(nearest)?nearest:undefined;
}

export function visibleFrigateBatteries(session,ship,observer){
 const s=stateFor(ship),indices=[];s.inverse.fromArray(ship.rotation).invert();
 const point=new THREE.Vector3().fromArray(observer);
 for(let i=0;i<4;i++){if(ship.capitalMountHull[i]<=0)continue;frigateMountPosition(ship,i,s.position);s.clearance=FRIGATE_CLEARANCE[i];
  if(clearTurretArc(ship,FRIGATE_MOUNTS[i],FRIGATE_EXTENTS,point,s)&&!session.lineBlocked(s.position,point,ship.id))indices.push(i);
 }
 return indices;
}

// Capital hull plating resists light guns; exposed assemblies remain vulnerable.
// Shields retain ordinary weapon interactions, including ion's specialist role.
const lightCapitalWeapons=new Set(['pulse','pulse-mk2','beam','ripper','pdc','tracking-turret']);
export const frigateHullDamageScale=weapon=>weapon?.id==='gauss'?.6:lightCapitalWeapons.has(weapon?.id)?.08:1;
