import * as THREE from 'three';
import {weaponAssistCone} from './weapons.js';
const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const profiles={
 novice:{settle:.08,shots:7,pause:.55,spread:1.7*DEG,lead:.925,wander:.4*DEG,curve:.12,beam:.25*DEG,beamSlip:.16,beamWide:1.2*DEG,turretError:1.25,turretAcquire:.45,turretTurn:.85},
 veteran:{settle:.12,shots:5,pause:.35,spread:.3*DEG,lead:.99,wander:.22*DEG,curve:.55,beam:.12*DEG,beamSlip:.045,beamWide:.8*DEG,turretError:.65,turretAcquire:.3,turretTurn:1},
 ace:{settle:0,shots:8,pause:.15,spread:.15*DEG,lead:1,wander:.13*DEG,curve:.85,beam:.035*DEG,beamSlip:.006,beamWide:.45*DEG,turretError:.35,turretAcquire:.18,turretTurn:1.15},
};
export const npcGunneryProfile=ship=>profiles[ship.pilot?.tier]??profiles.veteran;
export const npcForwardCone=weapon=>weapon?.kind==='beam'?weaponAssistCone(weapon):(weapon?.id==='ripper'?7:weapon?.id==='pulse'||weapon?.id==='pulse-mk2'?6:4)*DEG;
const sprayCone=weapon=>weapon?.id==='ripper'?9*DEG:weapon?.id==='pulse'||weapon?.id==='pulse-mk2'?7*DEG:0;
export const npcTriggerCone=(ship,weapon,now=0)=>ship.gunSpeculateWeapon===weapon?.id&&now<(ship.gunSpeculateUntil??0)?sprayCone(weapon):npcForwardCone(weapon);
export function npcTriggerReady(ship,weapon,facing,now){
 if(ship.gunDecisionTarget!==ship.targetId){ship.gunDecisionTarget=ship.targetId;ship.gunAlignedSince=undefined;ship.gunLastAlignedAt=-Infinity;ship.gunSpeculateUntil=0;ship.gunDecisionAt=-Infinity;}
 const previousAt=ship.gunDecisionAt??-Infinity,previousFacing=ship.gunDecisionFacing??facing;
 ship.gunDecisionAt=now;ship.gunDecisionFacing=facing;
 if(facing<Math.cos(npcForwardCone(weapon)))ship.gunAlignedSince=undefined;
 if(now<(ship.gunBurstPauseUntil??0))return false;
 if(facing<Math.cos(npcForwardCone(weapon))){
  ship.gunAlignedSince=undefined;
  const cone=sprayCone(weapon);
  if(!cone||facing<Math.cos(cone))return false;
  const approaching=now>previousAt&&now-previousAt<=.25&&(facing-previousFacing)/(now-previousAt)>.015;
  if(now>=(ship.gunSpeculateReadyAt??0)&&(approaching||now-(ship.gunLastAlignedAt??-Infinity)<.25)){
   ship.gunSpeculateWeapon=weapon.id;ship.gunSpeculateUntil=now+(weapon.id==='ripper'?.35:.28);ship.gunSpeculateReadyAt=now+1.5;
  }
  return ship.gunSpeculateWeapon===weapon.id&&now<(ship.gunSpeculateUntil??0);
 }
 ship.gunLastAlignedAt=now;
 ship.gunAlignedSince??=now;
 const easy=weapon?.kind==='beam'||weapon?.id==='pulse'||weapon?.id==='pulse-mk2'||weapon?.id==='ripper';
 return now-ship.gunAlignedSince>=(easy?0:npcGunneryProfile(ship).settle);
}
export function recordNpcShot(ship,now){ship.lastCombatShotAt=now;const p=npcGunneryProfile(ship);ship.gunBurstCount=(ship.gunBurstCount??0)+1;if(ship.gunBurstCount>=p.shots){ship.gunBurstCount=0;ship.gunBurstPauseUntil=now+p.pause;}}
function aimState(ship){
 if(!ship.gunAim){let hash=0;for(const c of ship.id??'pilot')hash=(hash*31+c.charCodeAt(0))>>>0;
  ship.gunAim={rotation:new THREE.Quaternion(),error:new THREE.Vector3(),velocity:new THREE.Vector3(),trackedVelocity:new THREE.Vector3(),acceleration:new THREE.Vector3(),delta:new THREE.Vector3(),phase:hash%628/100,observedAt:-Infinity};}
 return ship.gunAim;
}
// Called by the visible-target planner at 5 Hz (3.3 Hz for novices). Never
// sample controls or a hidden target; reacquisition starts with no acceleration.
export function observeNpcTargetMotion(ship,velocity,now,visible){
 const s=aimState(ship),dt=now-s.observedAt;
 if(!visible||!velocity){s.visible=false;s.acceleration.set(0,0,0);return;}
 if(!s.visible||s.targetId!==ship.targetId||dt<=0||dt>.6){s.acceleration.set(0,0,0);s.trackedVelocity.copy(velocity);}
 else {s.delta.copy(velocity).sub(s.velocity).multiplyScalar(1/dt).clampLength(0,40);s.acceleration.lerp(s.delta,1-Math.exp(-6*dt));s.trackedVelocity.lerp(velocity,1-Math.exp(-(ship.pilot?.tier==='ace'?5:ship.pilot?.tier==='novice'?2:3)*dt));}
 s.velocity.copy(velocity);s.targetId=ship.targetId;s.observedAt=now;s.visible=true;
}
export function applyNpcTurnLead(ship,predicted,leadTime,now){
 const s=ship.gunAim;
 if(!s?.visible||s.targetId!==ship.targetId||ship.patrolMemoryActive||now-s.observedAt>.4||!Number.isFinite(leadTime))return predicted;
 const horizon=Math.min(.75,Math.max(0,leadTime));
 s.delta.copy(s.acceleration).multiplyScalar(.5*horizon*horizon*npcGunneryProfile(ship).curve).clampLength(0,Math.min(12,predicted.length()*Math.tan(2*DEG)));
 return predicted.add(s.delta);
}
// Speculative rounds still follow the barrel; their wider trigger window does
// not grant wider aim correction. Pointing errors move the actual beam/ray.
export function npcShotDirection(ship,weapon,targetDirection,out,now=0,distance=0){
 const s=aimState(ship),rotation=s.rotation.fromArray(ship.rotation);
 out.set(0,0,-1).applyQuaternion(rotation);
 if(out.dot(targetDirection)<Math.cos(npcTriggerCone(ship,weapon,now)))return false;
 const rng=ship.aiRng??Math.random,p=npcGunneryProfile(ship),beam=weapon?.kind==='beam',gauss=weapon?.id==='gauss';
 let spread=p.spread;
 if(beam){out.copy(targetDirection);spread=rng()<p.beamSlip?p.beamWide:p.beam;}
 else {
  const tier=ship.pilot?.tier??'veteran',hard=gauss||weapon?.id==='mortar';
  // Precision weapons demand deliberate tracking; forgiving guns retain a
  // useful stream of speculative fire even with inexperienced pilots.
  if(hard)spread*=tier==='novice'?(gauss?1.2:1.35):tier==='veteran'?2:1;
  else spread*=tier==='novice'?.65:1;
  if(gauss)spread*=.45+.6*clamp(distance/weapon.range,0,1);
  if(out.dot(targetDirection)>=Math.cos(npcForwardCone(weapon)))out.lerp(targetDirection,tier==='ace'?(hard?.96:.94):tier==='veteran'?(hard?.55:.97):gauss?.85:hard?.25:.65).normalize();
 }
 const radius=Math.sqrt(rng())*Math.tan(spread),angle=rng()*Math.PI*2;
 const wander=p.wander*(beam?.2:gauss?.5:1),phase=now*1.7+s.phase;
 s.error.set(Math.cos(angle)*radius+Math.sin(phase)*wander,Math.sin(angle)*radius+Math.sin(phase*1.31+1.2)*wander,0).applyQuaternion(rotation);
 out.add(s.error).normalize();
 return true;
}

export function npcTrackedVelocity(ship,velocity,out){const s=ship.gunAim;return out.copy(s?.visible&&s.targetId===ship.targetId?s.trackedVelocity:velocity);}
