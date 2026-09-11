import * as THREE from 'three';
import {weaponAssistCone} from './weapons.js';
const profiles={
 novice:{settle:.12,shots:4,pause:1.2,spread:2.5*Math.PI/180,lead:.5},
 veteran:{settle:.12,shots:5,pause:.35,spread:.6*Math.PI/180,lead:.888},
 ace:{settle:0,shots:8,pause:.15,spread:.15*Math.PI/180,lead:.988},
};
export const npcGunneryProfile=ship=>profiles[ship.pilot?.tier]??profiles.veteran;
export const npcForwardCone=weapon=>weapon?.kind==='beam'?weaponAssistCone(weapon):4*Math.PI/180;
export const npcTriggerCone=(ship,weapon)=>weapon?.kind!=='beam'&&ship.pilot?.tier==='novice'?12*Math.PI/180:npcForwardCone(weapon);
export function npcTriggerReady(ship,weapon,facing,now){
 if(facing<Math.cos(npcTriggerCone(ship,weapon))){ship.gunAlignedSince=undefined;return false;}
 ship.gunAlignedSince??=now;
 return now-ship.gunAlignedSince>=npcGunneryProfile(ship).settle&&now>=(ship.gunBurstPauseUntil??0);
}
export function recordNpcShot(ship,now){const p=npcGunneryProfile(ship);ship.gunBurstCount=(ship.gunBurstCount??0)+1;if(ship.gunBurstCount>=p.shots){ship.gunBurstCount=0;ship.gunBurstPauseUntil=now+p.pause;}}
// A forward gun follows the hull. Only the beam's shared aim assist snaps to its target.
export function npcShotDirection(ship,weapon,targetDirection,out){
 const rotation=new THREE.Quaternion().fromArray(ship.rotation);
 out.set(0,0,-1).applyQuaternion(rotation);
 if(out.dot(targetDirection)<Math.cos(npcTriggerCone(ship,weapon)))return false;
 if(weapon?.kind==='beam'){out.copy(targetDirection);return true;}
 const rng=ship.aiRng??Math.random,spread=npcGunneryProfile(ship).spread;
 const radius=Math.sqrt(rng())*Math.tan(spread),angle=rng()*Math.PI*2;
 if(out.dot(targetDirection)>=Math.cos(npcForwardCone(weapon)))out.lerp(targetDirection,.34).normalize();
 const error=new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,0).applyQuaternion(rotation);
 out.add(error).normalize();
 return true;
}
