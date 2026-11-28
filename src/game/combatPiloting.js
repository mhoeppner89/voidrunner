import * as THREE from 'three';
import {registerHitReaction} from './flightDynamics.js';
import {hashString,mulberrySample} from './random.js';
import {breakCueStart,breakCueEnd} from './weaponFlight.js';
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
 let best,soonest=Infinity;
 for(const p of session.projectiles) {
  const missile=p.kind==='missile'||p.kind==='torpedo';
  if(missile && (p.lostTrack || p.targetId!==ship.id))continue;
  if(p.life<=0||p.ownerId===ship.id||scan.seen.has(p.salvo??p.id??p)||!session.projectileCanHitShip(p,ship))continue;
  const i=session.projStore?p.slot*3:0,pos=session.projStore?.pos??p.position,vel=session.projStore?.vel??p.velocity;
  const x=pos[i]-ship.position[0],y=pos[i+1]-ship.position[1],z=pos[i+2]-ship.position[2];
  const viewRange=missile?800:400;
  if(x*x+y*y+z*z>viewRange*viewRange)continue;
  const vx=vel[i]-ship.velocity[0],vy=vel[i+1]-ship.velocity[1],vz=vel[i+2]-ship.velocity[2],v2=vx*vx+vy*vy+vz*vz;
  const time=-(x*vx+y*vy+z*vz)/Math.max(1,v2);
  if(time<=0||time>soonest||time>p.life||(x+vx*time)**2+(y+vy*time)**2+(z+vz*time)**2>radius*radius)continue;
  let reaction=1.2;
  if(missile && !ship.capitalClass){
   // Each pilot judges a salvo once. Sampling by pilot and salvo keeps all
   // four swarm lanes on the same decision across repeated threat scans.
   scan.seed??=hashString(ship.id);
   const roll=mulberrySample(scan.seed+(typeof p.salvo==='number'?p.salvo:p.slot));
   const center=(breakCueEnd(p.hitWeapon)+breakCueStart(p.hitWeapon))/2+.1; // 5 Hz scan
   reaction=ship.pilot?.tier==='ace'?center+(roll-.5)*.2:
    ship.pilot?.tier==='veteran'?center+(roll-.5)*1.2:roll<.7?.2+roll*.4:2+roll*.5;
  }
  if(time>reaction)continue;
  scan.start.set(pos[i],pos[i+1],pos[i+2]);scan.end.fromArray(ship.position);
  if(session.lineBlocked(scan.start,scan.end,ship.id))continue;
  best=p;soonest=time;
 }
 if(best){
  const missile=best.kind==='missile'||best.kind==='torpedo';
  scan.seen.set(best.salvo??best.id??best,now+(missile?best.life+.2:2));
  if(missile && !ship.capitalClass){
   ship.missileBreak??=new THREE.Vector3();
   scan.rotation??=new THREE.Quaternion();
   ship.missileBreak.set(1,0,0).applyQuaternion(scan.rotation.fromArray(ship.rotation));
   ship.missileBreakUntil=now+1;
   ship.evasiveUntil=Math.max(ship.evasiveUntil??0,ship.missileBreakUntil);
  }
  ship.combatThreatId=best.ownerId;ship.combatThreatUntil=now+2;
  if(WEAPONS[best.weaponId])ship.observedWeaponRange=Math.max(ship.observedWeaponRange??0,weaponRange(WEAPONS[best.weaponId]));
  const damage=weaponDamage(ship.shield,best.damage,session.projStore?WEAPONS[best.weaponId]:best.hitWeapon);
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

// NPC burns draw energy (stats.burnEnergy). A long closing or route burn
// keeps 35% of the capacitor for the fight; evasive burns need a tenth.
export const BURN_RESERVE=.35,BURN_MINIMUM=.1;
export function combatThrottle(ship,now,distance,closing,targetRadial,noseDot,preferred,canBoost,turnAngle=0,firingPass=false) {
 const crossfire=ship.combatPlan?.crossfire;
 const capacity=ship.combatFit?.stats?.energyCapacity??0,energy=ship.energy??0;
 const reserve=energy>capacity*BURN_RESERVE,spare=energy>capacity*BURN_MINIMUM;
 // Flying a route round terrain: cruise, and burn the long clear legs.
 const route=ship.combatRoute;
 if(route?.active&&!ship.fleeing&&!ship.combatPlan?.recovery?.active){
  ship.burning=Boolean(canBoost&&reserve&&route.leg>320&&noseDot>.3);
  return ship.burning?ship.afterburnSpeed:ship.speed;
 }
 const recovery=ship.combatPlan?.recovery;
 if(recovery?.active){
  const extend=recovery.mode==='range'?(distance<recovery.safeRange+80||distance<recovery.safeRange+200&&closing>5):recovery.coverDistance>100;
  ship.burning=Boolean(canBoost&&spare&&extend);
  if(recovery.mode==='cover'&&recovery.coverDistance<100)return ship.speed*.25;
  return ship.burning?ship.afterburnSpeed:ship.speed;
 }
 const main=ship.combatFit.weapons?.at(-1);
 const artillery=main==='gauss'||main==='mortar';
 if((!artillery||firingPass)&&ship.combatIntent==='hunt'&&!ship.fleeing&&!ship.covering&&ship.combatPlan?.finishing&&distance<220){ship.burning=false;return clamp(targetRadial+(distance-75)*.5,ship.speed*.25,ship.speed);}
 if(!ship.fleeing&&!ship.covering&&ship.pilot?.tier==='ace'&&crossfire?.outnumbered&&distance<600){ship.burning=Boolean(canBoost&&spare);return ship.burning?ship.afterburnSpeed:ship.speed;}
 if(crossfire?.active){ship.burning=Boolean(canBoost&&spare);return ship.burning?ship.afterburnSpeed:ship.speed;}
 const hunting=ship.combatIntent==='hunt';
 preferred=ship.combatPlan?.preferredRange??preferred;
 const pressure=(ship.combatPressure??0)*Math.exp(-Math.max(0,now-(ship.combatPressureAt??now))/1.5);
 const threatened=now<(ship.evasiveUntil??0)||pressure>Math.max(4,(ship.shield+ship.hull*.4)*.06);
 const matching=main==='gauss'&&firingPass&&hunting&&!threatened;
 const speedFloor=ship.speed*(matching?.25+.4*clamp((distance/preferred-.65)/.35,0,1):.65);
 const overshoot=hunting&&ship.combatPlan?.overshoot;
 canBoost=canBoost&&!overshoot;
 const request=threatened || !hunting || (noseDot>.65 && distance>preferred*1.2 && closing<ship.speed*.5);
 if(canBoost&&request&&spare&&now>=(ship.combatBoostReadyAt??0)){
  const novice=ship.pilot?.tier==='novice';
  const stats=ship.combatFit.stats,speed=Math.hypot(...ship.velocity);
  const accelerate=Math.max(0,ship.afterburnSpeed-speed)/stats.acceleration;
  const turn=turnAngle*stats.angularDamping/(stats.angularAcceleration*2);
  const duration=clamp(accelerate+turn+.65,novice?1.4:1.8,novice?3:4);
  ship.combatBoostUntil=now+duration;
  ship.combatBoostReadyAt=ship.combatBoostUntil+(novice?1.8:1.1)+(ship.aiRng?.()??.5)*.6;
 }
 // Closing burn: a long, clear approach is flown on the afterburner instead
 // of crawling in at cruise; the reserve stays for the fight itself.
 if(hunting&&!threatened&&canBoost&&noseDot>.8&&distance>Math.max(preferred*2.6,650)&&reserve){ship.burning=true;return ship.afterburnSpeed;}
 ship.burning=Boolean(canBoost&&energy>0&&now<(ship.combatBoostUntil??0));
 if(ship.burning)return ship.afterburnSpeed;
 const turningShot=hunting&&ship.combatPlan?.aimingRun&&ship.combatPlan.angularRate>.15&&!threatened;
 let speed=(matching||turningShot&&(!artillery||firingPass))?clamp(targetRadial+(distance-preferred)*.6,speedFloor,ship.speed):ship.speed;
 if(overshoot)speed=Math.max(speedFloor,Math.min(speed,targetRadial+ship.combatPlan.safeClosing));
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
