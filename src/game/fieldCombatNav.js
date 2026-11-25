import {steerToward} from './npcNav.js';
import * as THREE from 'three';
import {terrainFlightDistance} from './asteroidTerrain.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const forward=new THREE.Vector3(0,0,-1),worldUp=new THREE.Vector3(0,1,0);
const BEND_SLOPES=[.25,.6,1.4,3];
const LOCAL_TURNS=[[-.5,0],[.5,0],[-1.4,0],[1.4,0],[0,.5],[0,-.5],[0,1.4],[0,-1.4]];
// Cheap swept-hull queries against world-sized obstacle bounds. Debris box
// extents already include model scale; applying scale again closes real gaps.
function rayDistance(o,p,d,reach,limit,s){
 if(o===s.grazeObstacle)reach=Math.min(reach,s.grazeReach);
 if(o.terrain)return terrainFlightDistance(o,p,d,reach,limit,s,s.safetyProbe?s.forwardReach:0);
 s.local.set(p.x-o.x,p.y-o.y,p.z-o.z);s.ray.copy(d);
 if(o.box&&(o.shape!=='asteroid'||Math.max(o.box.hx,o.box.hy,o.box.hz)>Math.min(o.box.hx,o.box.hy,o.box.hz)*1.5)){
  const b=o.box;s.q.set(b.qx,b.qy,b.qz,b.qw).invert();s.local.applyQuaternion(s.q);s.ray.applyQuaternion(s.q);
  let near=0,far=limit,inside=true,escaping=false;
  for(let i=0;i<3;i++){
   const x=s.local.getComponent(i),v=s.ray.getComponent(i),h=(i===0?b.hx:i===1?b.hy:b.hz)+reach;inside&&=Math.abs(x)<h;
   if(Math.abs(x)>h-.5&&x*v>0)escaping=true;
   if(Math.abs(v)<1e-8){if(Math.abs(x)>h)return limit;continue;}
   let enter=(-h-x)/v,leave=(h-x)/v;if(enter>leave){const t=enter;enter=leave;leave=t;}near=Math.max(near,enter);far=Math.min(far,leave);if(near>far)return limit;
  }
  // A wreck section's box encloses its open hangars and torn midsections.
  // Once the ray reaches the box, the hull mesh is the real surface.
  if(o.shape==='wreck-mesh'&&o.meshVerts)return terrainFlightDistance(o,p,d,reach,limit,s,s.safetyProbe?s.forwardReach:0);
  if(inside){
   let face=Infinity,axis=0;for(let i=0;i<3;i++){const gap=(i===0?b.hx:i===1?b.hy:b.hz)+reach-Math.abs(s.local.getComponent(i));if(gap<face){face=gap;axis=i;}}
   if(escaping||s.local.getComponent(axis)*s.ray.getComponent(axis)>0)return limit;
  }
  return near;
 }
 const radius=(o.radius??o.collisionRadius)+reach,b=s.local.dot(d),c=s.local.lengthSq()-radius*radius;
 if(c<0&&b>0)return limit;
 const disc=b*b-c;if(disc<0||b>0)return limit;
 return Math.min(limit,Math.max(0,-b-Math.sqrt(disc)));
}
// A plan casts many short rays near the same hull. Record a lower bound
// on the distance to each surface once per update, after debris has moved.
function cacheObstacleDistances(s,position){
 const distances=s.obstacleDistances??=[];
 for(let i=0;i<s.obstacles.length;i++){
  const obstacle=s.obstacles[i],box=obstacle.box;
  const radius=obstacle.radius??obstacle.collisionRadius;
  // The sum of the half extents encloses the box at any rotation.
  const bound=box&&!obstacle.terrain?Math.max(radius??0,box.hx+box.hy+box.hz):radius;
  const dx=position.x-obstacle.x,dy=position.y-obstacle.y,dz=position.z-obstacle.z;
  distances[i]=Math.sqrt(dx*dx+dy*dy+dz*dz)-bound;
 }
 s.useObstacleDistances=true;
}
function clearDistance(s,p,d,reach,limit){
 let best=limit,tested=0;
 const distances=s.useObstacleDistances?s.obstacleDistances:undefined,origin=s.position;
 // Allow for a hull-expanded box corner, nose clearance and a ray starting
 // away from the hull on a predicted turn. Surviving geometry is tested exactly.
 const allowance=distances?Math.sqrt(3)*reach+(s.safetyProbe?s.forwardReach:0)+.001+
  (p===origin?0:Math.abs(p.x-origin.x)+Math.abs(p.y-origin.y)+Math.abs(p.z-origin.z)):0;
 for(let i=0;i<s.obstacles.length;i++){
  if(distances&&distances[i]>best+allowance)continue;
  tested++;
  best=rayDistance(s.obstacles[i],p,d,reach,best,s);
  if(best===0)break;
 }
 s.rayTests+=tested;
 return best;
}
function support(o,dir,s){
 if(!o.box)return o.radius??o.collisionRadius;
 const b=o.box;s.q.set(b.qx,b.qy,b.qz,b.qw).invert();s.local.copy(dir).applyQuaternion(s.q);
 return Math.abs(s.local.x)*b.hx+Math.abs(s.local.y)*b.hy+Math.abs(s.local.z)*b.hz;
}
// Foresight: where does this hull actually go if it steers toward `heading`
// now? The nose turns at the hull's assisted rate, sideways slip decays like
// the flight assist and forward speed holds. Pilots used to notice a wall
// only once their straight braking ray reached it, then stop, turn and
// accelerate into the next one; this lets the planner see a steering line
// that ends on rock early and prefer exits the hull can reach at speed. Four
// chords keep the cost to four swept queries; past the horizon the corridor
// continues straight along the heading. Returns the clear arc length.
function predictedClearance(s,p,v,nose,heading,speed,motion,reach,limit){
 const pos=s.pathPos.copy(p),vel=s.pathVel.copy(v).multiplyScalar(speed),n=s.pathNose.copy(nose);
 const chord=motion.horizon/4,sub=chord/3;let travelled=0;
 for(let i=0;i<4;i++){
  s.pathStart.copy(pos);
  for(let k=0;k<3;k++){
   const dot=clamp(n.dot(heading),-1,1),angle=Math.acos(dot);
   if(angle>1e-4){
    const step=Math.min(angle,motion.rate*sub),sin=Math.sin(angle);
    // Rotate toward the heading in their common plane; an exact reversal
    // picks the hull's current slip side.
    if(sin<1e-3)n.addScaledVector(vel,.01).normalize();
    else n.multiplyScalar(Math.sin(angle-step)/sin).addScaledVector(heading,Math.sin(step)/sin).normalize();
   }
   const forwardSpeed=vel.dot(n);
   s.pathSide.copy(vel).addScaledVector(n,-forwardSpeed).multiplyScalar(Math.exp(-motion.slip*sub));
   vel.copy(n).multiplyScalar(forwardSpeed+clamp(speed-forwardSpeed,-motion.brake*sub,motion.thrust*sub)).add(s.pathSide);
   pos.addScaledVector(vel,sub);
  }
  s.pathDir.copy(pos).sub(s.pathStart);
  const length=s.pathDir.length();
  if(length<1e-3)continue;
  s.pathDir.multiplyScalar(1/length);
  const span=Math.min(length,limit-travelled),clear=clearDistance(s,s.pathStart,s.pathDir,reach,span);
  if(clear<span)return travelled+clear;
  travelled+=span;if(travelled>=limit)return limit;
 }
 return travelled+clearDistance(s,pos,heading,reach,limit-travelled);
}
// During a crawling departure the nose and the residual drift can point in
// different directions. Sweep the accelerating hull until the next plan.
function departureClear(session,ship,s,p,v,speed,acceleration){
 const vel=s.pathVel.copy(v).multiplyScalar(speed),pos=s.pathPos.copy(p);
 for(let i=0;i<3;i++){
  vel.addScaledVector(s.nose,acceleration*.08);
  const span=vel.length()*.08;
  if(span<1e-6)continue;
  const dir=s.pathDir.copy(vel).normalize();
  pos.addScaledVector(dir,span);
  if(!session.npcDepartureClear(ship,pos,s))return false;
 }
 return true;
}
// Exit scoring bonus (0..0.6) for a straight-clear corridor the hull can
// also reach on its predicted path. Blocked corridors and crawling or stuck
// hulls get none, so the ranking of unreachable exits is unchanged.
function momentumBonus(s,p,v,speed,motion,reach,corridor,clear,stuck){
 if(stuck||speed<=8||clear<corridor*.98)return 0;
 return .6*predictedClearance(s,p,v,s.nose,s.delta,speed,motion,reach,corridor)/corridor;
}
// Try to bend the current flight path around a surface before aiming at
// the far side of its bounding box. The current momentum defines the cone;
// the intended heading defines its first shoulder. Test shallow turns first.
function flyPastSurface(s,p,v,speed,motion,reach,look) {
 // Centre the search between pursuit and momentum. A target behind the
 // hull still gets a forward exit instead of an immediate reversal.
 const axis=s.turnAxis.copy(v).addScaledVector(s.goal,.8).normalize();
 const side=s.turnSide.copy(s.goal).addScaledVector(axis,-axis.dot(s.goal));
 if(side.lengthSq()<.001){
  side.crossVectors(axis,worldUp);
  if(side.lengthSq()<.001)side.set(1,0,0);
 }
 side.normalize();
 const up=s.turnUp.crossVectors(axis,side).normalize();
 let best=-Infinity;
 for(const slope of BEND_SLOPES){
  for(let i=0;i<4;i++){
   const shoulder=i<2?side:up, sign=i%2===0?1:-1;
   const heading=s.delta.copy(axis).addScaledVector(shoulder,sign*slope).normalize();
   const progress=heading.dot(s.goal);
   if(progress<=best)continue;
   if(clearDistance(s,p,heading,reach,look)<look)continue;
   if(predictedClearance(s,p,v,s.nose,heading,speed,motion,reach,look)<look)continue;
   best=progress;s.best.copy(p).addScaledVector(heading,look);
  }
  if(best>-Infinity)return true;
 }
 return false;
}
// Seconds and rates of one hull's turn, from the same constants the flight
// integrators use (steerFlightTurn / integrateFlightVelocity).
function turnModel(s,stats,speed,burning){
 const t=s.turn??={};
 t.rate=stats.angularAcceleration*(burning?2:1)/stats.angularDamping*.85;
 t.slip=(burning?.62:.9)*(stats.lateralMultiplier??1);
 t.thrust=stats.acceleration;t.brake=stats.acceleration*1.25;
 // Long enough to swing the nose ~70 degrees and shed most of the old slip.
 t.horizon=clamp(1.2/t.rate+.7/t.slip,1.2,3.4);
 t.reaction=speed*t.horizon;
 return t;
}
// Shared swept-hull queries for short combat commitments. Callers supply their
// own scratch state; the navigation controller keeps ownership of its vectors.
export {clearDistance as fieldClearDistance,support as fieldObstacleSupport};
export function fieldCombatSteering(session,ship,goal,desired,dt,out,combat=true){
 const now=session.save.world.time,stats=ship.combatFit.stats;
 const s=ship.fieldNav??={position:new THREE.Vector3(),travel:new THREE.Vector3(),nose:new THREE.Vector3(),goal:new THREE.Vector3(),waypoint:new THREE.Vector3(),direction:new THREE.Vector3(),side:new THREE.Vector3(),candidate:new THREE.Vector3(),best:new THREE.Vector3(),delta:new THREE.Vector3(),local:new THREE.Vector3(),ray:new THREE.Vector3(),q:new THREE.Quaternion(),pathPos:new THREE.Vector3(),pathVel:new THREE.Vector3(),pathNose:new THREE.Vector3(),pathStart:new THREE.Vector3(),pathDir:new THREE.Vector3(),pathSide:new THREE.Vector3(),turnAxis:new THREE.Vector3(),turnSide:new THREE.Vector3(),turnUp:new THREE.Vector3(),bendHeading:new THREE.Vector3(),contactNormal:new THREE.Vector3(),escapeBearing:new THREE.Vector3(),escapeUntil:0,nextHullCheck:0,departureContact:{x:0,y:0,z:0,push:0},obstacles:[],nextPlan:0,nextPath:0,pathClear:Infinity,pathAt:0,until:0,lowTime:0,plans:0,rayTests:0,bank:0};
 if(!combat && s.bendAt!=null){
  s.until=0;s.nextPlan=0;s.bendAt=undefined;
 }
 const p=s.position.fromArray(ship.position),v=s.travel.fromArray(ship.velocity),speed=v.length();
 const graze=ship.terrainManeuver;
 s.grazeObstacle=graze?.active&&graze.kind==='cover-graze'&&now<graze.until&&(ship.combatBumpAt??-Infinity)<graze.started?graze.grazeObstacle:undefined;
 s.grazeReach=graze?.grazeReach??0;
 s.q.fromArray(ship.rotation);s.nose.copy(forward).applyQuaternion(s.q);v.copy(speed>1?v.multiplyScalar(1/speed):s.nose);
 const reach=Math.max(...session.npcHullExtents(ship))+2;
 const motion=turnModel(s,stats,speed,ship.burning);
 // Look as far ahead as this hull needs to turn away, not just to stop: a
 // heavy fighter at combat speed needs ~2.5 s to divert, which the old
 // stopping-distance horizon (~1.5 s) never gave it.
 const stopping=speed*speed/(2*stats.acceleration*1.25),look=clamp(Math.max(stopping+speed*.65,motion.reaction+stopping*.35)+reach,65,520);
 s.lowTime=speed<stats.maxSpeed*.15?s.lowTime+dt:0;
 // A blocked nose can brake a search approach long before speed reaches the
 // stall threshold. Commit to an escape promptly instead of waiting at rest.
 s.blockedTime=s.speedLimit<stats.maxSpeed*.2?(s.blockedTime??0)+dt:0;
 const planDue=now>=s.nextPlan;
 if(planDue){
  s.nextPlan=now+.20+(Number(ship.id?.replace(/\D/g,''))%5||0)*.007;s.plans++;
  s.obstacles.length=0;s.noExit=false;
  const dock=session.activeDockObstacle();if(dock)s.obstacles.push(dock);
  const radius=look+(session.activeInstanceId==='shardbelt'?240:180);
  session.forEachObstacleInBox(p.x-radius,p.y-radius,p.z-radius,p.x+radius,p.y+radius,p.z+radius,o=>s.obstacles.push(o));
  if(session.largeSteeringObstacles){
   for(const obstacle of session.largeSteeringObstacles){
    const range=obstacle.radius+look+speed+reach;
    if(obstacle._queryStamp!==session.obstacleQueryStamp &&
       (p.x-obstacle.x)**2+(p.y-obstacle.y)**2+(p.z-obstacle.z)**2<=range*range)s.obstacles.push(obstacle);
   }
  }
 }
 cacheObstacleDistances(s,p);
 if(planDue){
  // Keep all broadphase candidates for immediate danger; route alternatives
  // use five waypoints around the closest blocker in debris. Round asteroid
  // fields reuse their sampled headings only at this slower planning cadence.
  s.goal.copy(desired).normalize();
  // Commit around isolated cover while hunting. Dense fields keep sampled
  // escape headings, which handle overlapping clearance bounds better.
  s.roundField=!s.grazeObstacle&&(ship.combatIntent!=='hunt'||s.obstacles.length>3)&&s.obstacles.length>0&&s.obstacles.every(o=>o.shape==='asteroid'&&!o.terrain);
  if(s.roundField)steerToward(session,ship,goal,{goalDir:s.goal,speed,horizon:1.8,brakeScale:0,synthesize:true},s.goal);
  // A ship accelerating out of a turn will cover more than its
  // instantaneous speed predicts before the next shoulder is reachable.
  const planLook=combat&&!graze?.active?Math.min(520,look+Math.min(speed,stats.maxSpeed)*.65):look;
  const goalClear=clearDistance(s,p,s.goal,reach,planLook);
  let stuck=(s.obstacles.length>0 && (s.lowTime>.75||s.blockedTime>.6))||(Boolean(ship.search)&&s.blockedTime>.4);
  if(s.bendAt!=null && s.until>now && now-s.bendAt>.4 && goalClear>=planLook
     &&predictedClearance(s,p,v,s.nose,s.goal,speed,motion,reach*1.5,planLook)>=planLook){
   s.until=0;
   // The stored obstruction belongs to the old bearing. The new pursuit
   // line just passed the full sweep; sample it again after steering.
   s.pathClear=Infinity;s.nextPath=0;
  }
  const committed=s.until>now&&p.distanceTo(s.waypoint)>35;
  // Remaining momentum can carry a hull out of its planned exit corridor even
  // during recovery. Keep a commitment only while that corridor remains usable.
  if(committed){
   if(s.bendAt!=null)s.delta.copy(s.bendHeading);
   else s.delta.copy(s.waypoint).sub(p).normalize();
   if(clearDistance(s,p,s.delta,reach,Math.min(look,100))<20)s.until=0;
  }
  // A single simple obstacle already has usable outside shoulders. A mesh
  // tile or several overlapping obstacles need a locally flyable line.
  const clutter=s.obstacles.length>1||s.obstacles[0]?.terrain||s.obstacles[0]?.shape==='wreck-mesh';
  const sampledLineBlocked=!s.roundField || s.pathClear<look*.65 && s.speedLimit<stats.maxSpeed;
  const bend=combat&&sampledLineBlocked&&clutter&&!graze?.active&&!stuck&&speed>stats.maxSpeed*.35
   &&(committed?s.pathClear<look*.65:goalClear<planLook*.85||s.pathClear<look*.65)
   &&flyPastSurface(s,p,v,speed,motion,reach*1.5,planLook);
  // A committed exit that still runs into the surface cannot be held
  // until the fighter reaches it. Start turning into open space while
  // the normal brake sheds the remaining inward momentum.
  if(!bend && combat && !graze?.active && committed && !s.recovering
     && now-s.pathAt<.15 && s.pathClear<speed && s.speedLimit<stats.maxSpeed)stuck=true;
  if(bend){
   s.bendAt=now;s.bendHeading.copy(s.best).sub(p).normalize();s.waypoint.copy(s.best);s.until=now+2;s.recovering=false;s.bank=0;s.nextPath=0;
  }else if(!committed||s.until===0||(stuck&&!s.recovering)){
   s.bendAt=undefined;s.until=0;s.bank=0;s.recovering=stuck;
   // In combat the live steering line counts too: jinks and lead change it
   // between plans, and a grazing line otherwise only pulsed the brake.
   // Route travel keeps its authored tunnel lines.
   const lineBlocked=combat&&s.pathClear<look*.6&&now-s.pathAt<.15;
   if((!s.roundField&&(goalClear<look*.85||lineBlocked))||stuck){
    let blocker,closest=look;
    for(const o of s.obstacles){const distance=rayDistance(o,p,s.goal,reach,look,s);if(distance<closest){closest=distance;blocker=o;}}
    s.side.crossVectors(s.goal,worldUp);if(s.side.lengthSq()<.01)s.side.set(1,0,0);s.side.normalize();
    let score=-Infinity,straight=-Infinity,bestIndex=0;
    for(let i=0;i<5;i++){
     const axis=i<2?s.side:worldUp,sign=i%2===0?1:-1;
     if(i===4)s.candidate.copy(p).addScaledVector(s.nose,-180);
     else if(blocker){
      s.candidate.set(blocker.x,blocker.y,blocker.z).addScaledVector(axis,sign*(support(blocker,axis,s)+reach+45)).addScaledVector(s.goal,-Math.min(support(blocker,s.goal,s)+reach,90));
     }else s.candidate.copy(p).addScaledVector(s.goal,60).addScaledVector(axis,sign*160);
     s.delta.copy(s.candidate).sub(p);const distance=s.delta.length();s.delta.normalize();
     const corridor=Math.min(distance,450);
     const clear=clearDistance(s,p,s.delta,reach,corridor);
     const turn=s.nose.dot(s.delta),progress=s.goal.dot(s.delta);
     // Prefer the exit the hull can actually fly from its current momentum,
     // so a waypoint behind the wing does not win over a reachable one.
     const value=(clear<corridor*.98?-2:0)+clear/corridor*2+turn*.35+progress*(stuck?.15:.65)+(i<2?.08:0)+(ship.pilot?.tier==='ace'&&i===2?.16:0);
     straight=Math.max(straight,value);
     const ranked=value+momentumBonus(s,p,v,speed,motion,reach,corridor,clear,stuck);
     if(ranked>score){score=ranked;s.best.copy(s.candidate);bestIndex=i;}
    }
    // A fractured asteroid's outer box is not its flyable surface. Probe
    // short local shoulders/passages against the actual terrain instead of
    // always asking for a waypoint beyond the entire giant fragment.
    if(!stuck&&straight<2&&s.obstacles.length===1&&s.obstacles[0].terrain&&s.obstacles[0].box&&Math.max(s.obstacles[0].box.hx,s.obstacles[0].box.hy,s.obstacles[0].box.hz)>look*1.5){
     const corridor=clamp(speed*1.5+reach,90,180);
     for(let i=0;i<LOCAL_TURNS.length;i++){
      const [yaw,pitch]=LOCAL_TURNS[i];
      s.delta.copy(s.goal).addScaledVector(s.side,yaw);s.delta.y+=pitch;s.delta.normalize();
      const clear=clearDistance(s,p,s.delta,reach,corridor);
      if(clear<corridor*.98)continue;
      const value=2+s.nose.dot(s.delta)*.35+s.goal.dot(s.delta)*.65+momentumBonus(s,p,v,speed,motion,reach,corridor,clear,false);
      if(value>score){score=value;s.best.copy(p).addScaledVector(s.delta,corridor);bestIndex=i;}
     }
    }
    if(stuck){
     // A single blocker's left/right waypoints can all enter its neighbours.
     // At a standstill, sample the surrounding volume for a short clear exit.
     // A clear tangent can still leave the hull drifting into the wall.
     // When already braking, favour a reachable exit across that drift:
     // forward thrust then arrests it as the nose comes around.
     const inwardDrift=combat&&speed>2&&s.speedLimit<stats.maxSpeed;
     let exitScore=-Infinity;
     for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      if(x===0&&y===0&&z===0)continue;
      s.delta.set(x,y,z).normalize();
      const clear=clearDistance(s,p,s.delta,reach,110);
      if(clear<=5)continue;
      const base=clear/110*4+s.nose.dot(s.delta)*.35+s.goal.dot(s.delta)*.1;
      const bonus=inwardDrift&&clear>=110?clamp((.25-v.dot(s.delta))/.4,0,1):0;
      // A sweep can only remove this bonus. Skip it when even a fully
      // clear turn cannot beat the best validated bearing.
      if(base+bonus<=exitScore)continue;
      const value=bonus && predictedClearance(s,p,v,s.nose,s.delta,speed,motion,reach,110)>=110 ? base+bonus : base;
      if(value>exitScore){exitScore=value;s.best.copy(p).addScaledVector(s.delta,Math.min(100,clear-5));}
     }
     s.noExit=exitScore===-Infinity;
    }
    s.waypoint.copy(s.noExit?p:s.best);
    // Heavy hulls can need more than three seconds to turn toward an exit.
    // Replacing the waypoint mid-turn made a stopped ship alternate directions.
    const exitAngle=Math.acos(clamp(s.nose.dot(s.delta.copy(s.best).sub(p).normalize()),-1,1));
    s.until=now+(stuck?clamp(exitAngle*stats.angularDamping/stats.angularAcceleration+2,3,7):2);if(stuck)s.lowTime=0;
    s.nextPath=0;
    s.bank=ship.pilot?.tier==='ace'?(bestIndex%2===0?1:-1)*.65:0;
   }
  }
 }
 s.active=!s.noExit&&s.until>now&&p.distanceTo(s.waypoint)>30;
 if(s.active){
  s.lastBypass=now;
  // The swept arc was checked for this bearing. Chasing a point on its
  // straight ray makes a slipping hull turn more sharply than predicted.
  if(s.bendAt!=null)s.direction.copy(s.bendHeading);
  else s.direction.copy(s.waypoint).sub(p).normalize();
 }
 out.copy(s.active?s.direction:s.roundField?s.goal:desired).normalize();
 if(s.noExit){
  // Physical collision resolution pushes embedded hulls out. Face its
  // measured normal until the next plan can validate a departure.
  if(s.contactNormal.lengthSq()>0 && now-ship.combatBumpAt<.5)out.copy(s.contactNormal);
  s.until=0;s.canBoost=false;s.speedLimit=0;s.safeForManeuver=false;s.openCoast=false;s.clearCoast=false;s.useObstacleDistances=false;
  return s;
 }
 // Only the current motion and nose corridor can demand braking. Sideways
 // clearance affects the next route choice, never the throttle itself.
 // Reserve extra nose room at combat speed. Taper the precaution while
 // crawling out of cover so it cannot pin a turning ship against a surface.
 s.forwardReach=reach*1.65*clamp((speed/stats.maxSpeed-.2)/.4,0,1);
 s.safetyProbe=true;
 // Foresight on the live steering line at 10 Hz. Jinks and lead move it
 // between 5 Hz plans; when its predicted path meets a surface the next plan
 // routes round it (lineBlocked) instead of letting the brake pulse at the
 // wall. Braking itself still follows the straight momentum line below.
 if(combat&&(now>=s.nextPath||now<s.pathAt)){
  s.nextPath=now+.1;s.pathAt=now;
  const clear=speed>8?predictedClearance(s,p,v,s.nose,out,speed,motion,reach,look):clearDistance(s,p,v,reach,look);
  s.pathClear=clear>=look?Infinity:clear;
 }
 const travelClear=clearDistance(s,p,v,reach,look);
 const noseClear=clearDistance(s,p,s.nose,reach,Math.min(look,Math.max(35,speed*.5)));
 s.safetyProbe=false;
 // When circling a slow contact, braking along the nose cannot arrest
 // lateral drift at the hull's forward braking rate.
 const circling=combat&&ship.combatPlan?.aimingRun&&ship.combatPlan.targetVelocity?.lengthSq()<stats.maxSpeed*stats.maxSpeed*.09;
 const slipTime=circling?motion.horizon*(1-clamp(s.nose.dot(v),0,1)):0;
 const available=Math.max(0,travelClear-2-speed*(.12+slipTime));
 const safeSpeed=travelClear>=look?stats.afterburnSpeed:Math.sqrt(2*stats.acceleration*1.25*available);
 const noseLimit=noseClear<20?stats.maxSpeed*clamp(noseClear/20,0,1):stats.afterburnSpeed;
 // Once the nose faces a clear exit, thrust against the remaining inward
 // drift helps brake AND escape. A zero throttle here otherwise waits several
 // seconds for passive damping, even with the ship already pointing out.
 const escapeThrust=s.active&&s.recovering&&speed<stats.maxSpeed*.4&&noseClear>=Math.min(look,Math.max(35,speed*.5))
  &&(s.nose.dot(v)<.25 || speed<stats.maxSpeed*.15 && s.nose.dot(out)>.85)
  &&departureClear(session,ship,s,p,v,speed,stats.acceleration);
 s.speedLimit=escapeThrust?Math.max(Math.min(safeSpeed,noseLimit),stats.maxSpeed*.55):Math.min(safeSpeed,noseLimit);s.canBoost=travelClear>=Math.min(look,stats.maxSpeed*2)&&noseClear>=Math.min(look,Math.max(35,speed*.5));
 // A bend was checked at the current speed. Hold cruise until the
 // velocity is inside its exit corridor before allowing an approach burn.
 if(s.active&&s.bendAt!=null&&v.dot(out)<.9)s.canBoost=false;
 s.openCoast=!s.active&&travelClear>=look&&noseClear>=35&&speed>stats.maxSpeed*.75;
 s.clearCoast=s.active&&s.bendAt!=null&&!s.recovering&&travelClear>=look&&noseClear>=35&&speed>stats.maxSpeed*.65;
 s.safeForManeuver=!s.active&&s.canBoost;s.useObstacleDistances=false;
 return s;
}
