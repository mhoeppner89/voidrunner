import * as THREE from 'three';
import {DRONE_TYPES} from './droneData.js';
import {REPAIR_SITES} from './repairSites.js';
import {SHIP_COLLIDERS,segmentShipColliderHit} from './shipCollision.js';
import {playerShipVariant} from './voxelModels.js';

export const REPAIR_DRONE_RANGE=200;
const origin=[0,0,0],identity=[0,0,0,1],up=new THREE.Vector3(0,1,0),generated=new Map();
const distanceSq=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
const hullId=actor=>actor.shipId??(actor.capitalClass?actor.variant:actor.combatFit?.hullId??actor.hullId??actor.variant);
const maximum=(session,actor)=>actor===session.save.player?session.playerStats().hull:actor.maxHull??actor.combatFit?.stats.hull??0;
function available(session,actor){return actor&&actor.hull>0&&(!actor.poweredDown||actor.distressRepairEligible===true)&&!actor.captured&&!actor.claimed&&!actor.surrendered&&!actor.race&&actor.position&&(actor!==session.save.player||!actor.dockedAt&&!session.arena?.observer);}
function friendly(session,owner,target){
 const p=session.save.player;if(owner===target)return true;
 if(owner.observerTeam||target.observerTeam)return Boolean(owner.observerTeam&&owner.observerTeam===target.observerTeam);
 if(owner===p)return !target.hostile&&!target.tutorialEnemy;
 if(target===p)return !owner.hostile&&!owner.tutorialEnemy;
 if(owner.tutorialCompanion&&target.tutorialCompanion)return true;
 if(owner.arenaRunWingman&&target.arenaRunWingman)return true;
 return Boolean(owner.faction&&owner.faction===target.faction&&Boolean(owner.hostile)===Boolean(target.hostile));
}
export function repairTargetEligible(session,owner,target){
 // Distress-event neutrals opt in explicitly; their crews asked for help,
 // while a hostile raider is still not a valid repair recipient.
 const distressHelp=owner===session.save.player&&target?.distressRepairEligible===true&&!target.hostile;
 return available(session,owner)&&available(session,target)&&(friendly(session,owner,target)||distressHelp)
  &&distanceSq(owner.position,target.position)<=REPAIR_DRONE_RANGE**2;
}
function targetById(session,owner,id){if(id==='player')return session.save.player;if(id===owner.id)return owner;for(const ship of session.ships)if(ship.id===id)return ship;}
const siteOffset=(hull,bay)=>(REPAIR_SITES[hull]?.length??0)>bay?0:bay*4;
const targetId=(session,actor)=>actor===session.save.player?'player':actor.id;
const damaged=(session,target)=>target.hull<maximum(session,target)-.001;

export function selectRepairTarget(session,owner,unit){
 if(damaged(session,owner)&&repairTargetEligible(session,owner,owner))return owner;
 const current=targetById(session,owner,unit.repairTargetId);
 if(current&&damaged(session,current)&&repairTargetEligible(session,owner,current))return current;
 let best,bestRatio=Infinity;
 const player=session.save.player;
 if(owner!==player&&repairTargetEligible(session,owner,player)&&damaged(session,player)){best=player;bestRatio=player.hull/maximum(session,player);}
 for(const ship of session.ships){
  if(ship===owner||!repairTargetEligible(session,owner,ship)||!damaged(session,ship))continue;
  const ratio=ship.hull/maximum(session,ship);if(ratio<bestRatio){best=ship;bestRatio=ratio;}
 }
 return best??owner;
}

// Sample missing fighter contact rings once, using the actual collision mesh.
// Existing industrial hulls retain their authored work/clearance points.
function sitesFor(hull,bay=0){
 if(REPAIR_SITES[hull])return REPAIR_SITES[hull][bay%REPAIR_SITES[hull].length];
 if(generated.has(hull))return generated.get(hull);
 const variant=SHIP_COLLIDERS[hull]?hull:playerShipVariant(hull),collider=SHIP_COLLIDERS[variant]??SHIP_COLLIDERS.kestrel,sites=[];
 for(let i=0;i<8;i++){
  const angle=(i+.5)*Math.PI/4,normal=new THREE.Vector3(Math.cos(angle),Math.sin(angle),0),start=new THREE.Vector3(normal.x*(collider.extent[0]+3),normal.y*(collider.extent[1]+3),0),end=new THREE.Vector3(0,0,0);
  const hit=segmentShipColliderHit(start,end,origin,identity,variant),position=start.clone().lerp(end,hit??.5),rotation=new THREE.Quaternion().setFromUnitVectors(up,normal);
  sites.push({position:position.toArray(),normal:normal.toArray(),rotation:rotation.toArray(),transit:start.toArray()});
 }
 generated.set(hull,sites);return sites;
}
export function createRepairDroneState(){return {q:new THREE.Quaternion(),offset:new THREE.Vector3(),omega:new THREE.Vector3(),start:new THREE.Vector3(),end:new THREE.Vector3()};}

/** Prepare the existing physical repair controller's contact on the chosen hull.
 * Changing recipients first lifts off the old hull; it never teleports a latched
 * drone onto another ship. The owner still supplies the launch/recall anchors. */
export function prepareRepairDrone(session,owner,unit,anchor,dt,state,active=true){
 let current=targetById(session,owner,unit.repairTargetId),target;
 if(unit.repairLeaving&&unit.repairMoveStage!=='lift'){
  unit.repairLeaving=false;unit.repairMoveStage=null;unit.repairTargetId=null;current=undefined;
 }
 if(!active||unit.state==='returning')target=current??owner;
 else target=selectRepairTarget(session,owner,unit);
 if(current&&current!==target&&(unit.repairAttached||unit.repairMoveStage==='lift')){
  unit.repairLeaving=true;unit.repairAttached=false;unit.repairMoveStage='lift';target=current;
 }
 const id=targetId(session,target),hull=hullId(target),bay=unit.repairBayIndex??0,sites=sitesFor(hull,bay),phase=siteOffset(hull,bay);
 const scale=target===session.save.player?1:session.npcHullExtents(target)[2]/(SHIP_COLLIDERS[hull]??SHIP_COLLIDERS[playerShipVariant(hull)]??SHIP_COLLIDERS.kestrel).extent[2];
 if(unit.repairTargetId!==id){
  unit.repairTargetId=id;unit.repairAttached=false;unit.repairContactTime=0;unit.repairWorkTime=0;unit.repairSite=0;unit.repairMoveStage=unit.portStage?null:'cross';
  // Approach another ship on the side nearest the drone, rather than flying
  // straight through its hull to the owner's default underside contact.
  if(target!==owner){
   state.q.fromArray(target.rotation);let nearest=0,best=Infinity;
   for(let i=0;i<sites.length;i++){
    state.offset.fromArray(sites[i].transit).multiplyScalar(scale).applyQuaternion(state.q).add(state.end.fromArray(target.position));
    const d=state.offset.distanceToSquared(state.start.fromArray(unit.position??owner.position));
    if(d<best){best=d;nearest=i;}
   }
   unit.repairSite=(nearest+bay-phase+sites.length)%sites.length;
  }
 }
 unit.repairing=false;
 const site=sites[((unit.repairSite??0)+phase)%sites.length];
 const transit=unit.repairMoveStage||unit.repairReturnStage;
 const q=state.q.fromArray(target.rotation),offset=state.offset.fromArray(transit?site.transit:site.position).multiplyScalar(scale);
 if(!transit)offset.addScaledVector(state.end.fromArray(site.normal),.65);
 offset.applyQuaternion(q);
 const angular=target===session.save.player?target.angularVelocity:target.flightAngularVelocity;
 if(Array.isArray(angular))state.omega.fromArray(angular);else if(angular?.isVector3)state.omega.copy(angular);else state.omega.set(0,0,0);
 state.omega.applyQuaternion(q);
 anchor.rotation??=[0,0,0,1];
 const [x,y,z,w]=site.rotation;
 anchor.rotation[0]=q.w*x+q.x*w+q.y*z-q.z*y;anchor.rotation[1]=q.w*y-q.x*z+q.y*w+q.z*x;
 anchor.rotation[2]=q.w*z+q.x*y-q.y*x+q.z*w;anchor.rotation[3]=q.w*w-q.x*x-q.y*y-q.z*z;
 for(let axis=0;axis<3;axis++){
  const o=state.omega,spin=axis===0?o.y*offset.z-o.z*offset.y:axis===1?o.z*offset.x-o.x*offset.z:o.x*offset.y-o.y*offset.x;
  anchor.velocity[axis]=(target.velocity?.[axis]??0)+spin;
  anchor.position[axis]=target.position[axis]+offset.getComponent(axis)-anchor.velocity[axis]*dt;
 }
}

export function applyDroneRepair(session,owner,unit,dt,state){
 unit.repairing=false;const target=targetById(session,owner,unit.repairTargetId);
 if(!unit.repairAttached||!repairTargetEligible(session,owner,target))return 0;
 // Contact and cover are checked at the tool, rather than healing through a hull
 // or across space merely because the mothership is within the support radius.
 state.start.fromArray(unit.position);state.end.fromArray(target.position);
 if(session.lineBlocked?.(state.start,state.end,target===session.save.player?'player':target.id))return 0;
 const stats=owner===session.save.player?session.playerStats():owner.combatFit?.stats;
 if(!stats)return 0;
 const amount=Math.max(0,Math.min(maximum(session,target)-target.hull,DRONE_TYPES.repair.repairRate*dt,
  ((owner.energy??0)-stats.energyCapacity*.2)/DRONE_TYPES.repair.energyPerHull));
 if(amount>0){target.hull+=amount;owner.energy-=amount*DRONE_TYPES.repair.energyPerHull;unit.repairing=true;}
 return amount;
}
