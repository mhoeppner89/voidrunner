import {steerToward} from './npcNav.js';
import * as THREE from 'three';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const forward=new THREE.Vector3(0,0,-1),worldUp=new THREE.Vector3(0,1,0);
// Cheap swept-hull queries against world-sized obstacle bounds. Debris box
// extents already include model scale; applying scale again closes real gaps.
function rayDistance(o,p,d,reach,limit,s){
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
function clearDistance(s,p,d,reach,limit){let best=limit;for(const o of s.obstacles){s.rayTests++;best=Math.min(best,rayDistance(o,p,d,reach,best,s));}return best;}
function support(o,dir,s){
 if(!o.box)return o.radius??o.collisionRadius;
 const b=o.box;s.q.set(b.qx,b.qy,b.qz,b.qw).invert();s.local.copy(dir).applyQuaternion(s.q);
 return Math.abs(s.local.x)*b.hx+Math.abs(s.local.y)*b.hy+Math.abs(s.local.z)*b.hz;
}
export function fieldCombatSteering(session,ship,goal,desired,dt,out){
 const now=session.save.world.time,stats=ship.combatFit.stats;
 const s=ship.fieldNav??={position:new THREE.Vector3(),travel:new THREE.Vector3(),nose:new THREE.Vector3(),goal:new THREE.Vector3(),waypoint:new THREE.Vector3(),direction:new THREE.Vector3(),side:new THREE.Vector3(),candidate:new THREE.Vector3(),best:new THREE.Vector3(),delta:new THREE.Vector3(),local:new THREE.Vector3(),ray:new THREE.Vector3(),q:new THREE.Quaternion(),obstacles:[],nextPlan:0,until:0,lowTime:0,plans:0,rayTests:0,bank:0};
 const p=s.position.fromArray(ship.position),v=s.travel.fromArray(ship.velocity),speed=v.length();
 s.q.fromArray(ship.rotation);s.nose.copy(forward).applyQuaternion(s.q);v.copy(speed>1?v.multiplyScalar(1/speed):s.nose);
 const reach=Math.max(...session.npcHullExtents(ship))+2;
 const stopping=speed*speed/(2*stats.acceleration*1.25),look=clamp(stopping+speed*.65+reach,65,450);
 s.lowTime=speed<stats.maxSpeed*.15?s.lowTime+dt:0;
 // A blocked nose can brake a search approach long before speed reaches the
 // stall threshold. Commit to an escape promptly instead of waiting at rest.
 s.blockedTime=s.speedLimit<stats.maxSpeed*.2?(s.blockedTime??0)+dt:0;
 if(now>=s.nextPlan){
  s.nextPlan=now+.20+(Number(ship.id?.replace(/\D/g,''))%5||0)*.007;s.plans++;
  s.obstacles.length=0;
  const dock=session.activeDockObstacle();if(dock)s.obstacles.push(dock);
  const radius=look+180;
  session.forEachObstacleInBox(p.x-radius,p.y-radius,p.z-radius,p.x+radius,p.y+radius,p.z+radius,o=>s.obstacles.push(o));
  // Keep all broadphase candidates for immediate danger; route alternatives
  // use five waypoints around the closest blocker in debris. Round asteroid
  // fields reuse their sampled headings only at this slower planning cadence.
  s.goal.copy(desired).normalize();
  // Commit around isolated cover while hunting. Dense fields keep sampled
  // escape headings, which handle overlapping clearance bounds better.
  s.roundField=(ship.combatIntent!=='hunt'||s.obstacles.length>3)&&s.obstacles.length>0&&s.obstacles.every(o=>o.shape==='asteroid');
  if(s.roundField)steerToward(session,ship,goal,{goalDir:s.goal,speed,horizon:1.8,brakeScale:0,synthesize:true},s.goal);
  const goalClear=clearDistance(s,p,s.goal,reach,look);
  const stuck=(s.obstacles.length>0 && (s.lowTime>.75||s.blockedTime>.6))||(Boolean(ship.search)&&s.blockedTime>.4);
  const committed=s.until>now&&p.distanceTo(s.waypoint)>35;
  // Remaining momentum can carry a hull out of its planned exit corridor even
  // during recovery. Keep a commitment only while that corridor remains usable.
  if(committed){s.delta.copy(s.waypoint).sub(p).normalize();if(clearDistance(s,p,s.delta,reach,Math.min(look,100))<20)s.until=0;}
  if(!committed||s.until===0||(stuck&&!s.recovering)){
   s.until=0;s.bank=0;s.recovering=stuck;
   if((!s.roundField&&goalClear<look*.85)||stuck){
    let blocker,closest=look;
    for(const o of s.obstacles){const distance=rayDistance(o,p,s.goal,reach,look,s);if(distance<closest){closest=distance;blocker=o;}}
    s.side.crossVectors(s.goal,worldUp);if(s.side.lengthSq()<.01)s.side.set(1,0,0);s.side.normalize();
    let score=-Infinity,bestIndex=0;
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
     const value=(clear<corridor*.98?-2:0)+clear/corridor*2+turn*.35+progress*(stuck?.15:.65)+(i<2?.08:0)+(ship.pilot?.tier==='ace'&&i===2?.16:0);
     if(value>score){score=value;s.best.copy(s.candidate);bestIndex=i;}
    }
    if(stuck){
     // A single blocker's left/right waypoints can all enter its neighbours.
     // At a standstill, sample the surrounding volume for a short clear exit.
     let exitScore=-Infinity;
     for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      if(x===0&&y===0&&z===0)continue;
      s.delta.set(x,y,z).normalize();
      const clear=clearDistance(s,p,s.delta,reach,110);
      const value=clear/110*4+s.nose.dot(s.delta)*.35+s.goal.dot(s.delta)*.1;
      if(value>exitScore){exitScore=value;s.best.copy(p).addScaledVector(s.delta,Math.max(45,Math.min(100,clear-5)));}
     }
    }
    s.waypoint.copy(s.best);
    // Heavy hulls can need more than three seconds to turn toward an exit.
    // Replacing the waypoint mid-turn made a stopped ship alternate directions.
    const exitAngle=Math.acos(clamp(s.nose.dot(s.delta.copy(s.best).sub(p).normalize()),-1,1));
    s.until=now+(stuck?clamp(exitAngle*stats.angularDamping/stats.angularAcceleration+2,3,7):2);if(stuck)s.lowTime=0;
    s.bank=ship.pilot?.tier==='ace'?(bestIndex%2===0?1:-1)*.65:0;
   }
  }
 }
 s.active=s.until>now&&p.distanceTo(s.waypoint)>30;
 out.copy(s.active?s.direction.copy(s.waypoint).sub(p).normalize():s.roundField?s.goal:desired).normalize();
 // Only the current motion and nose corridor can demand braking. Sideways
 // clearance affects the next route choice, never the throttle itself.
 const travelClear=clearDistance(s,p,v,reach,look);
 const noseClear=clearDistance(s,p,s.nose,reach,Math.min(look,Math.max(35,speed*.5)));
 const available=Math.max(0,travelClear-2-speed*.12);
 const safeSpeed=travelClear>=look?stats.afterburnSpeed:Math.sqrt(2*stats.acceleration*1.25*available);
 const noseLimit=noseClear<20?stats.maxSpeed*clamp(noseClear/20,0,1):stats.afterburnSpeed;
 // Once the nose faces a clear exit, thrust against the remaining inward
 // drift helps brake AND escape. A zero throttle here otherwise waits several
 // seconds for passive damping, even with the ship already pointing out.
 const escapeThrust=s.active&&s.recovering&&speed<stats.maxSpeed*.4&&s.nose.dot(v)<.25&&noseClear>=Math.min(look,Math.max(35,speed*.5));
 s.speedLimit=escapeThrust?Math.max(Math.min(safeSpeed,noseLimit),stats.maxSpeed*.55):Math.min(safeSpeed,noseLimit);s.canBoost=travelClear>=Math.min(look,stats.maxSpeed*2)&&noseClear>=Math.min(look,Math.max(35,speed*.5));
 s.safeForManeuver=!s.active&&s.canBoost;
 return s;
}
