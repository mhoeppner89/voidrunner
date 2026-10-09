import * as THREE from 'three';
import {CRUISER_MOUNTS,CRUISER_ARMAMENT_COUNT} from './cruiserModelData.js';
import {CRUISER_COLLISION_TRIANGLES} from './cruiserCollisionData.js';
import {relativeIntercept} from './weaponFlight.js';
import {integrateFlightVelocity} from './flightDynamics.js';
import {PDC_TURRET} from './turrets.js';
import {getPdcDefenseChannel} from './pdcFireControl.js';
export const CRUISER_GUN=Object.freeze({id:'cruiser-heavy-battery',kind:'gauss',speed:900,range:1900,life:1900/900,damageFlat:160,energyCost:45,shieldMul:.8,hullMul:1.3,visualScale:2});
export const CRUISER_PDC_RANGE=180;
const forward=new THREE.Vector3(0,0,-1);
function state(ship){return ship.cruiserRuntime??={q:new THREE.Quaternion(),inverse:new THREE.Quaternion(),turn:new THREE.Quaternion(),position:new THREE.Vector3(),pivot:new THREE.Vector3(),origin:new THREE.Vector3(),direction:new THREE.Vector3(),normal:new THREE.Vector3(),target:new THREE.Vector3(),lead:new THREE.Vector3(),velocity:new THREE.Vector3(),local:new THREE.Vector3(),end:new THREE.Vector3(),scratch:new THREE.Vector3(),barrelDirection:new THREE.Vector3(),barrelRight:new THREE.Vector3(),barrelStart:new THREE.Vector3(),barrelOffset:new THREE.Vector3(),mounts:CRUISER_MOUNTS.map(()=>({direction:new THREE.Vector3(),fireAt:0,lockedAt:0,point:new THREE.Vector3(),velocity:new THREE.Vector3()}))};}
export function equipCruiser(ship){
 ship.capitalMountHull=CRUISER_MOUNTS.map(m=>m.hull);ship.capitalBaseSpeed=ship.speed;ship.energy=650;
 ship.combatFit={hullId:'concord-cruiser',stats:{energyCapacity:650},guns:[],weapons:[],turrets:[],missiles:0};
 ship.turnRate=.06;ship.capitalAttack='RECOVERING';
}
export function cruiserMountPosition(ship,index,out){return out.fromArray(CRUISER_MOUNTS[index].position).applyQuaternion(state(ship).q.fromArray(ship.rotation)).add(state(ship).scratch.fromArray(ship.position));}
export function cruiserSubsystemLabel(index){return CRUISER_MOUNTS[index]?.label??'HULL';}
export function cruiserSubsystemExplosionScale(index){const m=CRUISER_MOUNTS[index];return Math.max(1,(m.kind==='engine'?Math.hypot(m.halfLength,m.radius):(m.explosionRadius??m.radius))*1.18/6.5);}
// The long twin barrels use tight capsules in their current aiming direction.
// The housing retains its existing broad component sphere.
function barrelFrame(ship,m,s,side){
 const aim=s.mounts[m.index].direction;
 s.barrelDirection.copy(aim.lengthSq()>.1?aim:forward);
 if(aim.lengthSq()>.1)s.barrelDirection.applyQuaternion(s.inverse);
 s.barrelRight.set(0,0,0).setComponent(m.axis,m.side).cross(s.barrelDirection);
 if(s.barrelRight.lengthSq()<1e-8)s.barrelRight.set(1,0,0);
 s.barrelRight.normalize();
 s.barrelStart.fromArray(m.position).setComponent(m.axis,m.position[m.axis]+m.side*m.size*.72).addScaledVector(s.barrelDirection,m.size*.75).addScaledVector(s.barrelRight,side*m.size*.34);
}
function barrelPointScore(ship,m,s,point){
 let score=Infinity;
 for(let side=-1;side<=1;side+=2){barrelFrame(ship,m,s,side);s.barrelOffset.copy(point).sub(s.barrelStart);const t=THREE.MathUtils.clamp(s.barrelOffset.dot(s.barrelDirection),0,m.size*1.9);s.barrelOffset.addScaledVector(s.barrelDirection,-t);score=Math.min(score,s.barrelOffset.length()/(m.size*.15+1));}
 return score;
}
function barrelSegmentHit(ship,m,s,padding){
 let nearest=Infinity;const d=s.direction,a=d.lengthSq(),length=m.size*1.9,r=m.size*.15+padding;
 if(a<1e-14)return nearest;
 for(let side=-1;side<=1;side+=2){
  barrelFrame(ship,m,s,side);const o=s.barrelOffset.copy(s.local).sub(s.barrelStart),along=o.dot(s.barrelDirection),travel=d.dot(s.barrelDirection);
  const qa=a-travel*travel,qb=2*(o.dot(d)-along*travel),qc=o.lengthSq()-along*along-r*r,disc=qb*qb-4*qa*qc;
  if(qc<=0&&along>=0&&along<=length)nearest=0;
  if(qa>1e-14&&disc>=0)for(let sign=-1;sign<=1;sign+=2){const t=(-qb+sign*Math.sqrt(disc))/(2*qa),z=along+t*travel;if(t>=0&&t<=1&&z>=0&&z<=length)nearest=Math.min(nearest,t);}
  for(let cap=0;cap<=1;cap++){o.copy(s.local).sub(s.barrelStart).addScaledVector(s.barrelDirection,-cap*length);const b=2*o.dot(d),c=o.lengthSq()-r*r,dis=b*b-4*a*c;if(c<=0)nearest=0;else if(dis>=0){const t=(-b-Math.sqrt(dis))/(2*a);if(t>=0&&t<=1)nearest=Math.min(nearest,t);}}
 }
 return nearest;
}
export function damageCruiserMount(ship,point,damage){
 if(!point||damage<=0||ship.capitalClass!=='cruiser')return -1;
 const s=state(ship);s.local.fromArray(point).sub(s.scratch.fromArray(ship.position)).applyQuaternion(s.inverse.fromArray(ship.rotation).invert());
 let best=1,index=-1;
 for(const m of CRUISER_MOUNTS){if(ship.capitalMountHull[m.index]<=0)continue;
  s.scratch.copy(s.local).sub(s.lead.fromArray(m.position));let score=m.kind==='engine'?Math.max(Math.hypot(s.scratch.x,s.scratch.y)/(m.radius+1),Math.abs(s.scratch.z)/(m.halfLength+1)):s.scratch.length()/(m.radius+1);
  if(m.kind==='battery')score=Math.min(score,barrelPointScore(ship,m,s,s.local));
  if(score<best){best=score;index=m.index;}
 }
 if(index>=0){ship.capitalMountHull[index]=Math.max(0,ship.capitalMountHull[index]-damage);let engines=0;for(let i=CRUISER_ARMAMENT_COUNT;i<CRUISER_MOUNTS.length;i++)engines+=ship.capitalMountHull[i]/CRUISER_MOUNTS[i].hull/4;ship.speed=ship.capitalBaseSpeed*(.12+.88*engines);ship.turnRate=.06*(.2+.8*engines);}
 return index;
}
function localSegment(start,end,ship){const s=state(ship);s.inverse.fromArray(ship.rotation).invert();s.origin.fromArray(ship.position);s.local.copy(start).sub(s.origin).applyQuaternion(s.inverse);s.end.copy(end).sub(s.origin).applyQuaternion(s.inverse);s.direction.copy(s.end).sub(s.local);return s;}
export function segmentCruiserMountHit(start,end,ship,padding=0){
 if(ship.capitalClass!=='cruiser'||!ship.capitalMountHull)return undefined;
 const s=localSegment(start,end,ship);let nearest=Infinity;
 for(const m of CRUISER_MOUNTS){if(ship.capitalMountHull[m.index]<=0)continue;if(m.kind==='battery')nearest=Math.min(nearest,barrelSegmentHit(ship,m,s,padding));s.scratch.copy(s.local).sub(s.lead.fromArray(m.position));
  const {x:ox,y:oy,z:oz}=s.scratch,{x:dx,y:dy,z:dz}=s.direction,r=m.radius+padding;
  if(m.kind==='engine'){
   const h=m.halfLength+padding;if(ox*ox+oy*oy<=r*r&&Math.abs(oz)<=h){nearest=0;continue;}
   const a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),c=ox*ox+oy*oy-r*r,disc=b*b-4*a*c;
   if(a>1e-14&&disc>=0){const root=Math.sqrt(disc);for(let sign=-1;sign<=1;sign+=2){const t=(-b+sign*root)/(2*a);if(t>=0&&t<=1&&Math.abs(oz+dz*t)<=h)nearest=Math.min(nearest,t);}}
   if(Math.abs(dz)>1e-14)for(let sign=-1;sign<=1;sign+=2){const t=(sign*h-oz)/dz;if(t>=0&&t<=1&&(ox+dx*t)**2+(oy+dy*t)**2<=r*r)nearest=Math.min(nearest,t);}
  }else{
   const a=dx*dx+dy*dy+dz*dz,b=2*(ox*dx+oy*dy+oz*dz),c=ox*ox+oy*oy+oz*oz-r*r,disc=b*b-4*a*c;
   if(c<=0){nearest=0;continue;}if(a>1e-14&&disc>=0){const t=(-b-Math.sqrt(disc))/(2*a);if(t>=0&&t<=1)nearest=Math.min(nearest,t);}
  }
 }
 return Number.isFinite(nearest)?nearest:undefined;
}
export function segmentCruiserHullHit(start,end,ship){
 const s=localSegment(start,end,ship),v=CRUISER_COLLISION_TRIANGLES,{x:ox,y:oy,z:oz}=s.local,{x:dx,y:dy,z:dz}=s.direction;let nearest=Infinity;
 for(let i=0;i<v.length;i+=9){
  const ax=v[i],ay=v[i+1],az=v[i+2],ux=v[i+3]-ax,uy=v[i+4]-ay,uz=v[i+5]-az,vx=v[i+6]-ax,vy=v[i+7]-ay,vz=v[i+8]-az;
  const px=dy*vz-dz*vy,py=dz*vx-dx*vz,pz=dx*vy-dy*vx,det=ux*px+uy*py+uz*pz;if(Math.abs(det)<1e-9)continue;
  const inv=1/det,tx=ox-ax,ty=oy-ay,tz=oz-az,u=(tx*px+ty*py+tz*pz)*inv;if(u<0||u>1)continue;
  const qx=ty*uz-tz*uy,qy=tz*ux-tx*uz,qz=tx*uy-ty*ux,b=(dx*qx+dy*qy+dz*qz)*inv;if(b<0||u+b>1)continue;
  const t=(vx*qx+vy*qy+vz*qz)*inv;if(t>=0&&t<=1)nearest=Math.min(nearest,t);
 }
 return Number.isFinite(nearest)?nearest:undefined;
}
function arc(ship,m,point,s){
 s.local.copy(point).sub(s.pivot).applyQuaternion(s.inverse);if(s.local.getComponent(m.axis)*m.side<-.20*s.local.length())return false;
 // A short clearance segment rejects hull obstruction at the mounting plane.
 s.end.copy(s.pivot).lerp(point,Math.min(1,65/Math.max(1,s.pivot.distanceTo(point))));
 return segmentCruiserHullHit(s.pivot,s.end,ship)===undefined;
}
export function updateCruiserBatteries(session,ship,dt,targetPosition,targetVelocity){
 ship.cruiserBatteriesAt=session.save.world.time;const s=state(ship),now=session.save.world.time;s.q.fromArray(ship.rotation);s.inverse.copy(s.q).invert();
 ship.energy=Math.min(650,ship.energy+dt*32);ship.capitalDisarmed=!(ship.capitalMountHull[0]>0||ship.capitalMountHull[1]>0||ship.capitalMountHull[2]>0||ship.capitalMountHull[3]>0);
 let charging=false;
 for(let i=0;i<CRUISER_ARMAMENT_COUNT;i++){
  const m=CRUISER_MOUNTS[i],gun=s.mounts[i];cruiserMountPosition(ship,i,s.position);s.q.fromArray(ship.rotation);s.inverse.copy(s.q).invert();s.normal.set(0,0,0).setComponent(m.axis,m.side).applyQuaternion(s.q);
  s.pivot.copy(s.position).addScaledVector(s.normal,m.size*(i<4?.72:.5));
  if(gun.direction.lengthSq()<.1){gun.direction.copy(forward).applyQuaternion(s.q);if(i>=4)gun.direction.add(s.normal).normalize();}
  const active=ship.capitalMountHull[i]>0;
  if(i<4&&active&&targetPosition&&ship.targetId&&!ship.holdFire&&!ship.fleeing&&!ship.patrolMemoryActive){
   s.target.copy(targetPosition);const distance=s.position.distanceTo(s.target);
   if(distance<=CRUISER_GUN.range&&arc(ship,m,s.target,s)&&!session.lineBlocked(s.position,s.target,ship.id)){
    const target=ship.targetId==='player'?session.save.player:session.ships.find(a=>a.id===ship.targetId);
    const capital=!!target?.capitalClass;
    if(gun.targetId!==ship.targetId||now-gun.lockedAt>3){gun.targetId=ship.targetId;gun.lockedAt=now;gun.point.copy(targetPosition);gun.velocity.copy(targetVelocity?.isVector3?targetVelocity:s.velocity.fromArray(targetVelocity??[0,0,0]));}
    s.target.copy(gun.point).addScaledVector(gun.velocity,now-gun.lockedAt);
    const flight=relativeIntercept(s.pivot,s.target.toArray(s.targetTuple??=[]),ship.velocity,gun.velocity.toArray(s.velocityTuple??=[]),CRUISER_GUN.speed,s.lead);
    s.direction.copy(s.lead).normalize();const error=distance*(capital ? .002 : .025);s.direction.x+=Math.sin(now*.7+i)*error/Math.max(1,distance);s.direction.y+=Math.cos(now*.5+i)*error/Math.max(1,distance);s.direction.normalize();
    const angle=gun.direction.angleTo(s.direction);s.turn.setFromUnitVectors(gun.direction,s.direction);s.turn.slerp(identity,1-Math.min(1,(capital ? .28 : .09)*dt/Math.max(.00001,angle)));gun.direction.applyQuaternion(s.turn).normalize();
    const ready=now>=gun.fireAt&&now-gun.lockedAt>=1.8&&Number.isFinite(flight)&&flight<=CRUISER_GUN.life;
    charging ||= now>=gun.fireAt&&now-gun.lockedAt<1.8;
    if(ready&&gun.direction.dot(s.direction)>.999&&ship.energy>=CRUISER_GUN.energyCost*2){
     // Physical twin barrels; each salvo has a long reset and deliberate aim.
     s.normal.set(0,0,0).setComponent(m.axis,m.side).applyQuaternion(s.q);s.normal.cross(gun.direction);if(s.normal.lengthSq()<1e-8)s.normal.set(1,0,0).applyQuaternion(s.q);s.normal.normalize();for(let side=-1;side<=1;side+=2){s.lead.copy(s.pivot).addScaledVector(gun.direction,m.size*2.65).addScaledVector(s.normal,side*m.size*.34);session.spawnGunProjectile(ship.id,CRUISER_GUN,s.lead,gun.direction,ship.velocity,ship.targetId,`${ship.id}-main-${i}`);session.renderer.spawnMuzzleFlash?.(s.lead.x,s.lead.y,s.lead.z,0xffbd65);}
     ship.energy-=CRUISER_GUN.energyCost*2;gun.fireAt=now+7;gun.lockedAt=now;
    }
   }
  }
  if(i>=4&&active&&!ship.holdFire){
   const channel=getPdcDefenseChannel(session,ship.id),next=channel.readyAt;
   if(now>=next&&ship.energy>=4)for(const missile of session.projectiles){
    if(missile.kind!=='missile'||missile.ownerId===ship.id||missile.targetId!==ship.id||missile.life<=0)continue;
    session.projStore.getPos(missile.slot,s.target);if(s.position.distanceTo(s.target)>CRUISER_PDC_RANGE||!arc(ship,m,s.target,s)||session.lineBlocked(s.position,s.target,ship.id))continue;
    s.direction.copy(s.target).sub(s.position).normalize();gun.direction.copy(s.direction);s.lead.copy(s.pivot).addScaledVector(s.direction,m.size*1.25);const round=session.spawnGunProjectile(ship.id,PDC_TURRET,s.lead,s.direction,ship.velocity);if(round)round.targetMissile=missile;
    ship.energy-=4;channel.readyAt=now+4;break;
   }
  }
  session.renderer.showTurret?.(`${ship.id}-main-${i}`,s.position,gun.direction,i<4?'M':'S',i<4?'capital':'pdc',s.q,m.side,0,i<4?m.size/1.3:m.size,m.axis,ship);
 }
 ship.capitalAttack=charging?'CHARGING':'RECOVERING';ship.capitalAttackRemaining=charging?1.8:0;
}
const identity=new THREE.Quaternion();
export function updateCruiserAttack(session,ship,targetPosition,targetVelocity,dt){
 const s=state(ship);s.origin.fromArray(ship.position);s.q.fromArray(ship.rotation);s.target.copy(targetPosition).sub(s.origin);const distance=s.target.length();s.target.normalize();
 // Hold a capital engagement range through forward thrust and slow attitude changes.
 s.lead.copy(s.target);if(distance<1000)s.lead.negate();
 s.turn.setFromUnitVectors(forward,s.lead);s.q.rotateTowards(s.turn,ship.turnRate*dt);s.q.toArray(ship.rotation);
 s.direction.copy(forward).applyQuaternion(s.q);s.velocity.fromArray(ship.velocity);const speed=distance>1450||distance<1000?ship.speed:0;
 integrateFlightVelocity(s.velocity,s.direction,speed,ship.speed,1.8,true,false,speed?1:0,dt,1.5);
 s.origin.addScaledVector(s.velocity,dt);s.origin.toArray(ship.position);s.velocity.toArray(ship.velocity);
 ship.capitalPreferredRange=1250;updateCruiserBatteries(session,ship,dt,targetPosition,targetVelocity);
}
