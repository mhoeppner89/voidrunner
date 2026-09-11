import * as THREE from 'three';
import {interceptTime} from './combatTactics.js';
const q=new THREE.Quaternion(),identity=new THREE.Quaternion(),from=new THREE.Vector3(),to=new THREE.Vector3();
// Separate turn authority and motor acceleration. Turning cannot silently
// collapse missile speed, or turn a seeker around instantaneously.
export function guideMissile(velocity,offset,missile,dt) {
    const speed=velocity.length(),cruise=missile.homingSpeed??260;
    if(offset.lengthSq()<1e-12)return;
    to.copy(offset).normalize();from.copy(speed>1e-6?velocity:to).normalize();
    const angle=from.angleTo(to),step=(missile.homingTurn??1.8)*dt;
    q.setFromUnitVectors(from,to).slerp(identity,1-Math.min(1,step/Math.max(angle,1e-8)));
    from.applyQuaternion(q).normalize();
    const change=(missile.acceleration??520)*dt;
    velocity.copy(from).multiplyScalar(speed+Math.max(-change,Math.min(change,cruise-speed)));
}
export function relativeIntercept(position,targetPosition,velocity,targetVelocity,speed,out) {
    const rx=targetPosition[0]-position.x,ry=targetPosition[1]-position.y,rz=targetPosition[2]-position.z;
    const vx=(targetVelocity?.[0]??0)-velocity[0],vy=(targetVelocity?.[1]??0)-velocity[1],vz=(targetVelocity?.[2]??0)-velocity[2];
    const time=interceptTime(rx,ry,rz,vx,vy,vz,speed);
    if(!Number.isFinite(time))return Infinity;
    out.set(rx+vx*time,ry+vy*time,rz+vz*time);return time;
}
// Exact nearest point on the same oriented ellipsoid used by ship hits.
// Bisection is only needed on a blast, not in the per-frame navigation loop.
export function closestHullPoint(point,actor,extents,out) {
    q.fromArray(actor.rotation).invert();from.copy(point).sub(to.fromArray(actor.position)).applyQuaternion(q);
    const x=from.x,y=from.y,z=from.z,[a,b,c]=extents;
    if(x*x/(a*a)+y*y/(b*b)+z*z/(c*c)<=1)return out.copy(point);
    const f=t=>(a*x/(t+a*a))**2+(b*y/(t+b*b))**2+(c*z/(t+c*c))**2;
    let low=0,high=Math.max(a,b,c)*from.length();
    for(let i=0;i<28;i++){const mid=(low+high)/2;if(f(mid)>1)low=mid;else high=mid;}
    out.set(a*a*x/(high+a*a),b*b*y/(high+b*b),c*c*z/(high+c*c));
    return out.applyQuaternion(q.invert()).add(to.fromArray(actor.position));
}
