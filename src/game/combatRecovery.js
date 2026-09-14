import * as THREE from 'three';
import {SHIPS} from './data.js';
import {SHIELD_RECHARGE_RATE} from './combatResources.js';
import {combatTargetEligible} from './combatTargeting.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// A temporary tactical withdrawal, not surrender or a permanent flee. The
// decision uses the visible hull and observed motion, not hidden upgrades.
export function planShieldRecovery(session,ship,plan,target,now,distance){
 const r=plan.recovery??={active:false,readyAt:0,direction:new THREE.Vector3(),entry:new THREE.Vector3(),side:new THREE.Vector3(),up:new THREE.Vector3(),threat:new THREE.Vector3(),cover:new THREE.Vector3(),candidate:new THREE.Vector3(),end:new THREE.Vector3(),away:new THREE.Vector3(),tangent:new THREE.Vector3(),targetPosition:new THREE.Vector3(),targetVelocity:new THREE.Vector3()};
 const stats=ship.combatFit.stats,novice=ship.pilot?.tier==='novice',ace=ship.pilot?.tier==='ace';
 if(r.targetId!==ship.targetId){r.active=false;r.targetId=ship.targetId;r.attempts=0;}
 if(plan.visible){r.threat.copy(plan.threatPosition);r.targetPosition.copy(plan.position).add(plan.relative);r.targetVelocity.copy(plan.targetVelocity);}
 const hull=SHIPS[target?.shipId??target?.combatFit?.hullId],observed=plan.targetVelocity.length();
 const targetCruise=hull?.maxSpeed??Math.max(40,observed),targetBurn=Math.max(hull?.afterburnSpeed??observed,observed);
 r.speedAdvantage=stats.maxSpeed>targetCruise+5&&(ship.fuel>4?stats.afterburnSpeed>targetBurn+8:stats.maxSpeed>observed+8);
 if(r.active){
  const age=now-r.started;
  const recovered=age>4.5&&ship.shield>=r.shieldGoal&&ship.shieldDelay<=0;
  const stalled=r.mode==='range'&&age>7&&distance<r.startRange+50&&ship.shieldDelay>0;
  if(ship.fleeing||ship.holdFire||recovered||now>=r.until||stalled){
   r.active=false;r.readyAt=now+18;r.lastResult=recovered?'recovered':stalled?'pursued':'ended';r.finishedAt=now;
   plan.reapproachUntil=0;ship.breakUntil=0;ship.repositionUntil=0;
  }
 }
 const finishable=target&&target.shield<1&&target.hull<=(target.maxHull??hull?.hull??0)*.4&&ship.hull>ship.maxHull*.4;
 if(!r.active&&now>=r.readyAt&&r.attempts<(ace?2:1)&&plan.visible&&target&&!finishable&&!ship.fleeing&&!ship.holdFire&&ship.shield<ship.maxShield*(novice?.35:ace?.2:.25)){
  const cover=!r.speedAdvantage?session.findCoverPoint(plan.position,r.threat):undefined;
  const exitReady=distance>120&&(plan.nose.dot(plan.direct)<-.25||plan.travel.dot(plan.direct)<-stats.maxSpeed*.4||distance>clamp((ship.observedWeaponRange??400)+80,380,750));
  if(r.speedAdvantage&&exitReady||cover){
   r.mode=cover?'cover':'range';if(cover)r.cover.set(cover.x,cover.y,cover.z);
   r.active=true;r.attempts++;r.started=now;r.startRange=distance;r.holdingRange=false;r.shieldGoal=ship.maxShield*(novice?.3:ace?.4:.35);
   r.safeRange=clamp((ship.observedWeaponRange??400)+80,380,750);
   r.until=now+clamp(Math.max(0,ship.shieldDelay??4.5)+(r.shieldGoal-ship.shield)/SHIELD_RECHARGE_RATE+6,10,14);
   r.side.copy(plan.right);r.up.copy(plan.up);ship.fireCommitUntil=0;plan.reapproachUntil=0;
   // Choose a clear oblique exit once, allowing the turn to finish before
   // changing course. The main nav controller still enforces hull clearance.
   let best=-Infinity;
   for(let i=0;i<4;i++){
    r.candidate.copy(plan.position).sub(r.threat).normalize().addScaledVector(i<2?r.side:r.up,i%2===0?.8:-.8).normalize();
    r.end.copy(plan.position).addScaledVector(r.candidate,Math.max(120,stats.maxSpeed*2));
    const score=plan.nose.dot(r.candidate)-(session.lineBlocked(plan.position,r.end,ship.id)?4:0);
    if(score>best){best=score;r.entry.copy(r.candidate);}
   }
   r.turnSign=r.entry.dot(r.side)<0?-1:1;
  }else r.readyAt=now+2;
 }
 if(r.active){
  const age=now-r.started;
  r.coverDistance=r.mode==='cover'?r.cover.distanceTo(plan.position):Infinity;
  r.away.copy(plan.position).sub(r.threat).normalize();
  if(r.mode==='cover')r.direction.copy(r.coverDistance>60?r.cover:r.threat).sub(plan.position).normalize().multiplyScalar(r.coverDistance>60?1:-1);
  else if(age<2)r.direction.copy(r.entry);
  else {
   // Once clear, a broad arc holds useful re-entry distance. Continuing
   // straight throughout the recharge would turn combat into a long chase.
   if(distance>r.safeRange+100)r.holdingRange=true;
   else if(distance<r.safeRange+25)r.holdingRange=false;
   if(r.holdingRange){
    r.tangent.crossVectors(r.up,r.away);if(r.tangent.lengthSq()<.01)r.tangent.copy(r.side);r.tangent.normalize().multiplyScalar(r.turnSign);
    const radial=clamp(((r.safeRange+140-distance)*.4+plan.targetVelocity.dot(r.away))/stats.maxSpeed,-.65,.9);
    r.direction.copy(r.away).multiplyScalar(radial).addScaledVector(r.tangent,Math.sqrt(1-radial*radial));
   }else r.direction.copy(r.away);
   // Modest three-dimensional weaving keeps most thrust directed away.
   const weave=now<(ship.evasiveUntil??0)?.24:.12;
   r.direction.addScaledVector(r.side,Math.sin(age*1.7)*weave).addScaledVector(r.up,Math.sin(age*1.13)*weave*.7).normalize();
  }
 }
 return r;
}

// Losing sight is the purpose of taking cover. Finish the bounded withdrawal
// before the ordinary search task takes over, using only the last seen point
// while hidden. Reacquisition still needs the normal sensors and a clear ray.
export function continueShieldRecovery(session,ship,dt){
 const r=ship.combatPlan?.recovery;
 if(!r?.active)return false;
 if(!combatTargetEligible(ship)||ship.fleeing||ship.pursuitHoldFire){r.active=false;return false;}
 const target=ship.targetId==='player'?session.save.player:session.ships.find(s=>s.id===ship.targetId&&combatTargetEligible(s));
 if(!target||target.hull<=0){r.active=false;return false;}
 r.candidate.fromArray(ship.position);r.end.fromArray(target.position);
 const visible=(ship.targetId!=='player'||session.shipTracksPlayer(ship))&&!session.lineBlocked(r.candidate,r.end,ship.id);
 if(visible){r.targetPosition.copy(r.end);if(target.velocity)r.targetVelocity.fromArray(target.velocity);else r.targetVelocity.set(0,0,0);}
 else r.targetVelocity.set(0,0,0);
 ship.recoveryTargetHidden=!visible;
 try{session.updateAttackAI(ship,r.targetPosition,r.targetVelocity,dt);}
 finally{ship.recoveryTargetHidden=false;}
 return true;
}
