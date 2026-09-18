import {DRONE_PORTS} from './droneFlight.js';
import * as THREE from 'three';
import {createPdcDroneController,destroyPdcDrone} from './dronePdc.js';
import {createDroneFleet,createDroneUnit,droneBayLayoutFor,DRONE_TYPES} from './droneData.js';
import {combatTargetEligible} from './combatTargeting.js';
import {getPdcDefenseChannel} from './pdcFireControl.js';
import {TURRET_LAYOUTS} from './turretLayouts.js';
import {WEAPONS} from './weapons.js';
// NPC carriers use the same physical drone controller and defense channel as the player.
const type=DRONE_TYPES.pdc;
const anchorKinds=['launch','dock','escort'];
const weapon=Object.freeze({...WEAPONS.pdc,damageFlat:WEAPONS.pdc.damageFlat*2,speed:type.projectileSpeed});
const point=()=>({position:[0,0,0],velocity:[0,0,0]});
export function droneUnits(session){
 const units=session.combinedDroneUnits??=Object.create(null);
 for(const id in units)delete units[id];
 Object.assign(units,session.save.player.droneFleet?.unitsById,session.npcDroneUnits);
 return units;
}
export function damageNpcDrone(session,unit,amount){
 if(unit.hull<=0||!Number.isFinite(amount)||amount<=0)return;
 unit.hull=Math.max(0,unit.hull-amount);
 if(!unit.hull){const ship=session.ships.find(s=>s.id===unit.ownerId);if(ship?.droneFleet)destroyPdcDrone(ship.droneFleet,unit.id,'damage');}
}
function initialize(session,ship){
 const hull=ship.combatFit?.hullId,count=Math.min(droneBayLayoutFor(hull).length,ship.combatFit?.droneCount??Infinity);
 if(!count||ship.npcDrones||ship.hull<=0||ship.tutorialEnemy||ship.tutorialCompanion)return;
 const fleet=ship.droneFleet=createDroneFleet(),context={ownerId:ship.id,unitIds:[],threats:[],opponents:[],bayAnchors:{},escortAnchors:{},weaponOwner:{ownerId:ship.id,faction:ship.faction,targetId:ship.targetId}};
 const state=ship.npcDrones={controller:createPdcDroneController(),context,events:[],threatPool:[],opponentPool:[],live:new Map(),q:new THREE.Quaternion(),inverse:new THREE.Quaternion(),p:new THREE.Vector3(),v:new THREE.Vector3(),end:new THREE.Vector3(),local:new THREE.Vector3(),ray:new THREE.Vector3(),omega:new THREE.Vector3(),spin:new THREE.Vector3()};
 for(let i=0;i<count;i++){
  const id=`${ship.id}-drone-${i}`,unit=createDroneUnit(id,'pdc');unit.ownerId=ship.id;
  fleet.unitsById[id]=unit;(session.npcDroneUnits??=Object.create(null))[id]=unit;context.unitIds.push(id);
  context.bayAnchors[id]={launch:point(),dock:point()};context.escortAnchors[id]=point();
 }
 context.canFire=(unit,target,start,direction,time)=>{
  if(time>weapon.life)return false;
  state.p.fromArray(start);state.end.fromArray(direction).multiplyScalar(type.projectileSpeed).add(state.v.fromArray(unit.velocity)).multiplyScalar(time).add(state.p);
  if(session.lineBlocked(state.p,state.end,ship.id))return false;
  // Reject shots through any friendly hull, including the mothership.
  for(const other of session.ships){
   if(other.hull<=0||other.id===target.id||other!==ship&&session.projectileCanHitShip(context.weaponOwner,other))continue;
   state.inverse.fromArray(other.rotation).invert();const ext=session.npcHullExtents(other);
   state.local.copy(state.p).sub(state.v.fromArray(other.position)).applyQuaternion(state.inverse);
   state.ray.copy(state.end).sub(state.p).applyQuaternion(state.inverse);
   let a=0,b=0,c=-1;for(let k=0;k<3;k++){const x=state.local.getComponent(k)/ext[k],d=state.ray.getComponent(k)/ext[k];a+=d*d;b+=2*x*d;c+=x*x;}
   const disc=b*b-4*a*c;if(c<=0)return false;if(a>0&&disc>=0){const t=(-b-Math.sqrt(disc))/(2*a);if(t>=0&&t<=1)return false;}
  }
  if(!ship.hostile&&!session.save.player.dockedAt){
   state.local.copy(state.p).sub(state.v.fromArray(session.save.player.position));state.ray.copy(state.end).sub(state.p);
   const a=state.ray.lengthSq(),t=a?Math.max(0,Math.min(1,-state.local.dot(state.ray)/a)):0;
   if(state.local.addScaledVector(state.ray,t).lengthSq()<session.playerCollisionRadius()**2)return false;
  }
  return true;
 };
 context.onUnitStep=unit=>{
  if(unit.position&&session.firstObstacleHitInfo){state.p.fromArray(unit.prevPosition??unit.position);state.end.fromArray(unit.position);if(session.firstObstacleHitInfo(state.p,state.end,ship.id))damageNpcDrone(session,unit,unit.hull);}
 };
}
export function updateNpcDrones(session,dt){
 const registry=session.npcDroneUnits??=Object.create(null),now=session.save.world.time;
 session.pdcAssignments??=new Map();
 for(const ship of session.ships){
  initialize(session,ship);const s=ship.npcDrones;if(!s)continue;
  const fleet=ship.droneFleet,c=s.context;
  if(ship.hull<=0||ship.captured||ship.poweredDown){for(const id of c.unitIds)destroyPdcDrone(fleet,id,'owner-lost');continue;}
  s.q.fromArray(ship.rotation);s.omega.copy(ship.flightAngularVelocity??s.omega.set(0,0,0)).applyQuaternion(s.q);const ext=session.npcHullExtents(ship),count=c.unitIds.length,rate=2*Math.PI/type.escortOrbitSeconds;
  for(let i=0;i<count;i++){
   const id=c.unitIds[i],unit=fleet.unitsById[id];
   if(unit.position){unit.prevPosition??=[...unit.position];for(let k=0;k<3;k++)unit.prevPosition[k]=unit.position[k];}
   if(unit.rotation){unit.prevRotation??=[...unit.rotation];for(let k=0;k<4;k++)unit.prevRotation[k]=unit.rotation[k];}
   for(const kind of anchorKinds){
    const anchor=kind==='escort'?c.escortAnchors[id]:c.bayAnchors[id][kind];s.v.set(0,0,0);
    const port=DRONE_PORTS[ship.combatFit.hullId]?.[i];
    if(port)s.p.fromArray(port).multiplyScalar(ext[2]/(({wayfarer:6.09,prospector:6.7,torsas:8,astra:6.4}[ship.combatFit.hullId]??6.7)));
    else s.p.set(0,-ext[1],0);
    s.p.y+=kind==='launch'?-3.5:1;
    if(kind==='escort'){
     const turret=TURRET_LAYOUTS[ship.combatFit.hullId]?.[0];
     s.p.set(0,-(turret?.side??1)*(ext[1]+type.escortDistance),(turret?.position[2]??0)*ext[2]);
     if(count>1){const phase=now*rate+i*2*Math.PI/count,r=Math.max(ext[0],ext[1])+type.escortDistance;s.p.set(Math.cos(phase)*r,Math.sin(phase)*r,0);s.v.set(-s.p.y*rate,s.p.x*rate,0);}
    }
    s.p.applyQuaternion(s.q);s.v.applyQuaternion(s.q).add(s.spin.crossVectors(s.omega,s.p));
    for(let k=0;k<3;k++){anchor.velocity[k]=ship.velocity[k]+s.v.getComponent(k);anchor.position[k]=ship.position[k]+s.p.getComponent(k)-anchor.velocity[k]*dt;}
   }
  }
  c.shipPosition=ship.position;c.shipVelocity=ship.velocity;c.ownerRadius=Math.max(ext[0],ext[1],ext[2]);c.now=now;
  c.inFlight=!ship.surrendered&&!ship.standingDown&&!ship.fleeing;c.assignments=session.pdcAssignments;c.defenseChannel=getPdcDefenseChannel(session,ship.id);
  c.opponents.length=0;c.weaponOwner.faction=ship.faction;c.weaponOwner.targetId=ship.targetId;
  const ready=!ship.holdFire&&!ship.pursuitHoldFire&&!ship.pendingMug&&!ship.pendingMugLeaderId;
  if(ready){
   let index=0;const add=(actor,id)=>{const proxy=s.opponentPool[index++]??={};proxy.id=id;proxy.hostile=true;proxy.hull=actor.hull;proxy.position=actor.position;proxy.velocity=actor.velocity;c.opponents.push(proxy);};
   for(const other of session.ships)if(other!==ship&&combatTargetEligible(other)&&session.projectileCanHitShip(c.weaponOwner,other))add(other,other.id);
   if(ship.hostile&&ship.targetId==='player'&&session.save.player.hull>0&&!session.save.player.dockedAt)add(session.save.player,'player');
  }
  c.threats.length=0;s.live.clear();
  for(const missile of session.projectiles){
   if(missile.life<=0||missile.kind!=='missile'&&missile.kind!=='torpedo')continue;s.live.set(missile.id,missile);
   if(missile.ownerId===ship.id||missile.targetId!==ship.id&&!fleet.unitsById[missile.targetId])continue;
   const t=s.threatPool[c.threats.length]??={position:[0,0,0],velocity:[0,0,0]};
   t.id=missile.id;t.kind=missile.kind;t.hostile=true;t.ownerId=missile.ownerId;t.targetId=missile.targetId;t.life=missile.life;
   for(let k=0;k<3;k++){t.position[k]=session.projStore.pos[missile.slot*3+k];t.velocity[k]=session.projStore.vel[missile.slot*3+k];}
   const target=fleet.unitsById[missile.targetId]??ship;
   if(!target.position||!target.velocity)continue;
   s.p.fromArray(target.position).sub(s.v.fromArray(t.position));const distance=s.p.length();
   s.v.fromArray(t.velocity).sub(s.end.fromArray(target.velocity));
   const closing=distance?s.p.dot(s.v)/distance:0,radius=target===ship?c.ownerRadius:type.collisionRadius;
   t.timeToImpact=Math.max(0,distance-radius)/Math.max(closing,s.v.length()*.5,.001);
   c.threats.push(t);
  }
  s.events.length=0;s.controller.update(fleet,dt,c,s.events);
  for(const e of s.events)if(e.type==='fire'){
   const missile=e.targetKind==='ship'?null:s.live.get(e.threatId);
   const round=session.spawnGunProjectile(ship.id,weapon,s.p.fromArray(e.start),s.v.fromArray(e.direction),e.inheritedVelocity,e.targetKind==='ship'?e.threatId:undefined,e.unitId);
   if(round){if(missile)round.targetMissile=missile;const assigned=session.pdcAssignments.get(e.threatId);if(assigned?.defenderId===e.unitId)assigned.round=round;}
   else {fleet.unitsById[e.unitId].ammo+=e.ammoSpent;if(session.pdcAssignments.get(e.threatId)?.defenderId===e.unitId)session.pdcAssignments.delete(e.threatId);}
  }
 }
 for(const id in registry)if(!session.ships.some(s=>s.id===registry[id].ownerId&&s.hull>0)){registry[id].state='destroyed';delete registry[id];}
}
