import * as THREE from 'three';
import {registerHitReaction} from './flightDynamics.js';
import {weaponDamage} from './weaponDamage.js';
import {WEAPONS,weaponRange} from './weapons.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Scan real approaching projectiles, never the player's trigger or a hidden aim.
// Each pilot scans at 5 Hz. Reused vectors stay separate from live flight state.
export function observeIncomingFire(session,ship) {
 const now=session.save.world.time;
 if(now<(ship.nextThreatScan??0))return;
 ship.nextThreatScan=now+.2;
 const scan=ship.threatScan??={start:new THREE.Vector3(),end:new THREE.Vector3(),seen:new Map()};
 for(const [id,until] of scan.seen)if(now>=until)scan.seen.delete(id);
 const radius=Math.max(...session.npcHullExtents(ship))+2;
 let best,soonest=1.2;
 for(const p of session.projectiles) {
  if(p.life<=0||p.ownerId===ship.id||scan.seen.has(p.id)||!session.projectileCanHitShip(p,ship))continue;
  const i=p.slot*3,pos=session.projStore.pos,vel=session.projStore.vel;
  const x=pos[i]-ship.position[0],y=pos[i+1]-ship.position[1],z=pos[i+2]-ship.position[2];
  if(x*x+y*y+z*z>400*400)continue;
  const vx=vel[i]-ship.velocity[0],vy=vel[i+1]-ship.velocity[1],vz=vel[i+2]-ship.velocity[2],v2=vx*vx+vy*vy+vz*vz;
  const time=-(x*vx+y*vy+z*vz)/Math.max(1,v2);
  if(time<0||time>soonest||time>p.life||(x+vx*time)**2+(y+vy*time)**2+(z+vz*time)**2>radius*radius)continue;
  scan.start.set(pos[i],pos[i+1],pos[i+2]);scan.end.fromArray(ship.position);
  if(session.lineBlocked(scan.start,scan.end,ship.id))continue;
  best=p;soonest=time;
 }
 if(best){
  scan.seen.set(best.id,now+2);
  ship.combatThreatId=best.ownerId;ship.combatThreatUntil=now+2;
  if(WEAPONS[best.weaponId])ship.observedWeaponRange=Math.max(ship.observedWeaponRange??0,weaponRange(WEAPONS[best.weaponId]));
  const damage=weaponDamage(ship.shield,best.damage,WEAPONS[best.weaponId]);
  registerHitReaction(ship,now,damage.shield+damage.hull,true);
 }
}

export function updateCombatIntent(ship,now,distance,closing) {
 const reacting=now>=(ship.evasiveLatencyUntil??0)&&now<(ship.evasiveUntil??0)&&!holdingFiringWindow(ship,now);
 const lowEnergy=ship.energy<Math.max(5,ship.combatFit.stats.energyCapacity*.08);
 const trackingRecharge=ship.combatPlan?.movingEngagement;
 if(reacting){
  if(now>=(ship.breakUntil??0)&&!ship.combatPlan){ship.breakSide=(ship.aiRng?.()??.5)<.5?-1:1;ship.breakPitch=((ship.aiRng?.()??.5)-.5)*.6;}
  ship.breakUntil=Math.max(ship.breakUntil??0,ship.evasiveUntil??now+.65);
 }
 // A short clearance maneuver, not a mandatory long strafing run.
 const clearance=ship.combatPlan?.clearance??24;
 if(distance<clearance||(distance<Math.max(75,clearance*1.3)&&closing>35&&distance/closing<.65))ship.repositionUntil=Math.max(ship.repositionUntil??0,now+1);
 if(lowEnergy&&now>=(ship.energyRecoverReadyAt??0)){
  const stats=ship.combatFit.stats;
  ship.energyRecoverUntil=now+(trackingRecharge?clamp((stats.energyCapacity*.25-ship.energy)/Math.max(1,stats.reactorOutput),.35,1.2):2);ship.energyRecoverReadyAt=now+6;
 }
 ship.combatIntent=ship.fleeing?'flee':ship.combatPlan?.recovery?.active?'disengage':now<(ship.breakUntil??0)&&!holdingFiringWindow(ship,now)?'evade':now<(ship.repositionUntil??0)||now<(ship.combatPlan?.reapproachUntil??0)?'reposition':!trackingRecharge&&now<(ship.energyRecoverUntil??0)?'recover':'hunt';
 ship.attackPhase=ship.combatIntent==='hunt'?'approach':'extend';
}

export function holdingFiringWindow(ship,now) {
 const pressure=(ship.combatPressure??0)*Math.exp(-Math.max(0,now-(ship.combatPressureAt??now))/1.5);
 const prior=(ship.fireCommitPressure??0)*Math.exp(-Math.max(0,now-(ship.fireCommitStarted??now))/1.5);
 return ship.pilot?.tier!=='novice'&&now<(ship.fireCommitUntil??0)&&pressure-prior<(ship.fireCommitDamageLimit??0)&&ship.energy>3;
}

export function combatThrottle(ship,now,distance,closing,targetRadial,noseDot,preferred,canBoost,turnAngle=0) {
 const crossfire=ship.combatPlan?.crossfire;
 const recovery=ship.combatPlan?.recovery;
 if(recovery?.active){
  const extend=recovery.mode==='range'?(distance<recovery.safeRange+80||distance<recovery.safeRange+200&&closing>5):recovery.coverDistance>100;
  ship.burning=Boolean(canBoost&&ship.fuel>2&&extend);
  if(recovery.mode==='cover'&&recovery.coverDistance<100)return ship.speed*.25;
  return ship.burning?ship.afterburnSpeed:ship.speed;
 }
 if(!ship.fleeing&&!ship.covering&&ship.combatPlan?.finishing&&distance<220){ship.burning=false;return clamp(targetRadial+(distance-75)*.5,ship.speed*.25,ship.speed);}
 if(!ship.fleeing&&!ship.covering&&ship.pilot?.tier==='ace'&&crossfire?.outnumbered&&distance<600){ship.burning=Boolean(canBoost&&ship.fuel>2);return ship.burning?ship.afterburnSpeed:ship.speed;}
 if(crossfire?.active){ship.burning=Boolean(canBoost&&ship.fuel>2);return ship.burning?ship.afterburnSpeed:ship.speed;}
 const hunting=ship.combatIntent==='hunt';
 preferred=ship.combatPlan?.preferredRange??preferred;
 const pressure=(ship.combatPressure??0)*Math.exp(-Math.max(0,now-(ship.combatPressureAt??now))/1.5);
 const threatened=now<(ship.evasiveUntil??0)||pressure>Math.max(4,(ship.shield+ship.hull*.4)*.06);
 const main=ship.combatFit.weapons?.at(-1);
 const artillery=main==='gauss'&&!threatened;
 const matching=artillery&&hunting&&ship.combatPlan?.aimingRun;
 const speedFloor=ship.speed*(matching?.25+.4*clamp((distance/preferred-.65)/.35,0,1):hunting&&!threatened&&distance<preferred*.65?.35:.65);
 const overshoot=hunting&&ship.combatPlan?.overshoot;
 canBoost=canBoost&&!overshoot;
 const request=threatened || !hunting || (noseDot>.65 && distance>preferred*1.2 && closing<ship.speed*.5);
 if(canBoost&&request&&ship.fuel>1&&now>=(ship.combatBoostReadyAt??0)){
  const novice=ship.pilot?.tier==='novice';
  const stats=ship.combatFit.stats,speed=Math.hypot(...ship.velocity);
  const accelerate=Math.max(0,ship.afterburnSpeed-speed)/stats.acceleration;
  const turn=turnAngle*stats.angularDamping/(stats.angularAcceleration*2);
  const duration=clamp(accelerate+turn+.65,novice?1.4:1.8,novice?3:4);
  ship.combatBoostUntil=now+duration;
  ship.combatBoostReadyAt=ship.combatBoostUntil+(novice?1.8:1.1)+(ship.aiRng?.()??.5)*.6;
 }
 ship.burning=Boolean(canBoost&&ship.fuel>.5&&now<(ship.combatBoostUntil??0));
 if(ship.burning)return ship.afterburnSpeed;
 const turningShot=hunting&&ship.combatPlan?.aimingRun&&ship.combatPlan.angularRate>.15&&!threatened;
 let speed=(artillery&&hunting||turningShot)?clamp(targetRadial+(distance-preferred)*.6,speedFloor,ship.speed):ship.speed;
 if(overshoot)speed=Math.max(Math.min(speedFloor,ship.speed*.45),Math.min(speed,targetRadial+ship.combatPlan.safeClosing));
 return speed;
}

// Feed forward the changing desired attitude, while preserving ordinary thrust
// limits. This removes steady tracking lag without slowing the ship to a crawl.
export function combatTrackingRate(ship,orientation,desired,dt) {
 const s=ship.flightTracking??={previous:desired.clone(),delta:new THREE.Quaternion(),inverse:new THREE.Quaternion(),world:new THREE.Vector3(),local:new THREE.Vector3()};
 s.delta.copy(s.previous).invert().multiply(desired).normalize();
 if(s.delta.w<0)s.delta.set(-s.delta.x,-s.delta.y,-s.delta.z,-s.delta.w);
 const n=Math.hypot(s.delta.x,s.delta.y,s.delta.z),scale=n>1e-7?2*Math.atan2(n,s.delta.w)/(n*dt):0;
 s.local.set(s.delta.x*scale,s.delta.y*scale,s.delta.z*scale).applyQuaternion(s.previous).clampLength(0,2.5);
 s.world.lerp(s.local,1-Math.exp(-8*dt));s.previous.copy(desired);
 return s.local.copy(s.world).applyQuaternion(s.inverse.copy(orientation).invert());
}
