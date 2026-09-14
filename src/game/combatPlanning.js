import * as THREE from 'three';
import {combatTargetEligible} from './combatTargeting.js';
import {WEAPONS,weaponRange,weaponShotDamage} from './weapons.js';
import {observeNpcTargetMotion} from './npcGunnery.js';
import {planCrossfire} from './combatAwareness.js';
import {planShieldRecovery} from './combatRecovery.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const UP=new THREE.Vector3(0,1,0),FORWARD=new THREE.Vector3(0,0,-1);

function state() {
 return {next:0,plans:0,q:new THREE.Quaternion(),position:new THREE.Vector3(),nose:new THREE.Vector3(),travel:new THREE.Vector3(),relative:new THREE.Vector3(),direct:new THREE.Vector3(),targetVelocity:new THREE.Vector3(),targetNose:new THREE.Vector3(),threatPosition:new THREE.Vector3(),threatNose:new THREE.Vector3(),right:new THREE.Vector3(),up:new THREE.Vector3(),candidate:new THREE.Vector3(),end:new THREE.Vector3(),delta:new THREE.Vector3(),escape:new THREE.Vector3(),reapproach:new THREE.Vector3(),offset:new THREE.Vector3(),teamAxis:new THREE.Vector3(),teamUp:new THREE.Vector3(),lastProgress:0,bestFacing:-1,bestRangeError:Infinity,reapproachUntil:0};
}
function basis(direction,right,up) {
 right.crossVectors(direction,UP);if(right.lengthSq()<.001)right.set(1,0,0);else right.normalize();
 up.crossVectors(right,direction).normalize();
}
function allied(a,b){return a!==b&&a.faction===b.faction&&b.hull>0;}

// A shared, short-lived assignment prevents every wing member choosing itself
// as the pressure pilot. Only nearby allies already attacking this target join.
function attackTeam(session,ship,target,now) {
 if(!ship.targetId)return;
 const teams=session.combatTeams??=new Map(),key=`${ship.faction}:${ship.targetId}`;
 let team=teams.get(key);
 if(!team){team={next:0,leaderUntil:0,members:[]};teams.set(key,team);}
 if(now>=team.next||!combatTargetEligible(team.leader)){
  team.next=now+.5;team.members.length=0;
  let best,bestScore=Infinity;
  for(const other of session.ships){
   if(other.faction!==ship.faction||other.targetId!==ship.targetId||!combatTargetEligible(other)||other.fleeing||other.patrolMemoryActive||other.combatPlan?.recovery?.active)continue;
   const x=target.x-other.position[0],y=target.y-other.position[1],z=target.z-other.position[2],distance=Math.hypot(x,y,z);
   if(distance>900)continue;
   team.members.push(other);
   const [qx,qy,qz,qw]=other.rotation;
   const facing=(-2*(qx*qz+qw*qy)*x-2*(qy*qz-qw*qx)*y-(1-2*(qx*qx+qy*qy))*z)/Math.max(1,distance);
   const score=distance/Math.max(20,other.speed)+(1-facing)*2+(other.combatIntent==='evade'?5:0)+(other.hull<other.maxHull*.4?5:0);
   if(score<bestScore){best=other;bestScore=score;}
  }
  if(now>=team.leaderUntil||!team.members.includes(team.leader)||team.leader?.combatIntent==='evade'){
   team.leader=best;team.leaderUntil=now+2;
  }
  team.members.sort((a,b)=>a.id.localeCompare(b.id));
 }
 // Old engagements must not accumulate references for a whole career session.
 if(now>=(session.nextCombatTeamCleanup??0)){
  session.nextCombatTeamCleanup=now+5;
  for(const [id,entry] of teams)if(entry.next<now-5)teams.delete(id);
 }
 return team;
}

export function friendlyFiringLaneBlocked(session,ship,start,direction,distance) {
 for(const other of session.ships){
  if(!allied(ship,other)||other.id===ship.targetId)continue;
  const x=other.position[0]-start.x,y=other.position[1]-start.y,z=other.position[2]-start.z;
  const along=x*direction.x+y*direction.y+z*direction.z;
  if(along<=0||along>=distance)continue;
  const radius=Math.max(...session.npcHullExtents(other))+2;
  if(x*x+y*y+z*z-along*along<radius*radius)return true;
 }
 return false;
}

function chooseEscape(session,ship,s,now,novice) {
 const stats=ship.combatFit.stats,speed=Math.max(ship.speed*.65,s.travel.length());
 // Evaluate finite acceleration and turn time, not an instantaneous sideways jump.
 const horizon=novice?.7:ship.pilot?.tier==='ace'?1.3:1;
 let best=-Infinity;
 for(let i=0;i<(novice?2:4);i++){
  s.candidate.copy(i<2?s.right:s.up).multiplyScalar(i%2===0?1:-1).addScaledVector(s.direct,-.22);
  if(s.travel.lengthSq()>1)s.candidate.addScaledVector(s.delta.copy(s.travel).normalize(),.25);
  s.candidate.normalize();
  const angle=Math.acos(clamp(s.nose.dot(s.candidate),-1,1));
  const turnTime=Math.max(Math.sqrt(2*angle/stats.angularAcceleration),angle/(stats.angularAcceleration/stats.angularDamping));
  s.delta.copy(s.candidate).multiplyScalar(speed).sub(s.travel).clampLength(0,stats.acceleration*horizon);
  s.end.copy(s.position).addScaledVector(s.travel,horizon).addScaledVector(s.delta,.5*horizon*clamp(horizon/Math.max(.2,turnTime),0,1));
  const blocked=session.lineBlocked(s.position,s.end,ship.id);
  // Also check the exit corridor after the turn; immediate drift can still be safe.
  s.delta.copy(s.end).addScaledVector(s.candidate,speed*.8);
  const exitBlocked=session.lineBlocked(s.end,s.delta,ship.id);
  s.delta.copy(s.end).sub(s.threatPosition).normalize();
  const offNose=1-s.threatNose.dot(s.delta);
  const score=offNose*4+(1-Math.abs(s.candidate.dot(s.direct)))*.25-turnTime*.08-(blocked?8:0)-(exitBlocked?4:0);
  if(score>best){best=score;s.escape.copy(s.candidate);s.escapeChoice=i;}
 }
 s.escapePlannedUntil=now+(novice?1.1:.8);
}

export function planCombatFlight(session,ship,targetPosition,targetVelocity,lead,distance,closing) {
 const now=session.save.world.time,s=ship.combatPlan??=state();
 if(s.targetId!==ship.targetId){s.targetId=ship.targetId;s.next=0;s.lastProgress=now;s.bestFacing=-1;s.bestRangeError=Infinity;s.reapproachUntil=0;ship.fireCommitUntil=0;}
 if(now<s.next)return s;
 const novice=ship.pilot?.tier==='novice',ace=ship.pilot?.tier==='ace';
 s.next=now+(novice?.3:.2);s.plans++;
 const stats=ship.combatFit.stats;
 // An inexperienced marksman closes to a usable shot instead of missing
 // indefinitely from the railgun's maximum standoff distance.
 const preferred=novice&&ship.combatFit.weapons?.at(-1)==='gauss'?300:ship.combatFit.profile.range;
 s.position.fromArray(ship.position);s.travel.fromArray(ship.velocity);s.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(ship.rotation));
 s.relative.copy(targetPosition).sub(s.position);s.direct.copy(s.relative).normalize();
 s.targetVelocity.copy(targetVelocity??s.delta.set(0,0,0));
 s.visible=!ship.patrolMemoryActive&&!ship.recoveryTargetHidden&&!session.lineBlocked(s.position,targetPosition,ship.id);
 observeNpcTargetMotion(ship,targetVelocity,now,s.visible);
 const target=s.visible?(ship.targetId==='player'?session.save.player:session.ships.find(x=>x.id===ship.targetId)):undefined;
 s.targetNose.copy(s.direct);
 if(target?.rotation)s.targetNose.copy(FORWARD).applyQuaternion(s.q.fromArray(target.rotation));
 const facing=s.nose.dot(lead),targetSpeed=s.targetVelocity.length();
 s.targetRadial=s.targetVelocity.dot(s.direct);
 s.delta.copy(s.targetVelocity).sub(s.travel);
 s.angularRate=s.delta.cross(s.relative).length()/Math.max(1,distance*distance);
 // A crossing target needs more room than a parked one. Keep this bounded by
 // the fitting's useful range so close-range weapons retain their role.
 const mainWeapon=WEAPONS[ship.combatFit.weapons?.at(-1)];
 s.movingEngagement=!novice&&targetSpeed>15;
 const turnAuthority=stats.angularAcceleration/stats.angularDamping;
 s.preferredRange=s.movingEngagement&&mainWeapon?Math.min(weaponRange(mainWeapon)*.85,preferred+Math.min(100,preferred*.9),Math.max(preferred*1.1,s.angularRate*distance/Math.max(.2,turnAuthority*.35)+ship.speed*.4)):preferred;
 const future=Math.min(novice?.6:1.2,distance/Math.max(30,Math.abs(closing)));
 s.delta.copy(s.targetVelocity).sub(s.travel).multiplyScalar(future).add(s.relative).normalize();
 const angle=Math.acos(clamp(s.nose.dot(s.delta),-1,1));
 s.turnTime=Math.max(Math.sqrt(2*angle/stats.angularAcceleration),angle/(stats.angularAcceleration/stats.angularDamping));
 s.clearance=novice?Math.max(24,Math.min(180,preferred*.35)):Math.max(24,Math.min(preferred*.35,60,ship.speed/turnAuthority*.45));
 const room=Math.max(0,distance-Math.max(s.clearance,preferred*.55)),reaction=novice?.3:ace?.1:.18;
 const deceleration=stats.acceleration*1.25;
 s.brakingDistance=Math.max(0,closing)**2/(2*deceleration)+Math.max(0,closing)*(reaction+Math.min(1.5,s.turnTime)*.35);
 s.overshoot=closing>12&&room<s.brakingDistance;
 s.safeClosing=Math.max(0,Math.sqrt(2*deceleration*room)-deceleration*reaction);
 s.pursuit=targetSpeed>10&&distance>preferred*1.15?'lead':targetSpeed>10&&distance<preferred*1.1&&(s.angularRate>.12||s.overshoot)&&s.targetNose.dot(s.direct)>.3?'lag':'direct';
 s.pursuitTime=s.pursuit==='lead'?Math.min(novice?.45:ace?1.2:.85,distance/Math.max(40,ship.speed+targetSpeed)):s.pursuit==='lag'?-.35:0;

 // Preserve a short, affordable firing opportunity. A heavy incoming hit always
 // cancels this; novices retain their unconditional light-hit break behavior.
 const weapon=WEAPONS[ship.combatFit.weapons?.[ship.combatWeaponIndex]];
 const trackingWeapon=weapon??mainWeapon;
 s.aimingRun=s.visible&&trackingWeapon&&distance<weaponRange(trackingWeapon)&&facing>.35;
 const effectiveReserve=ship.shield+ship.hull*.4;
 ship.fireCommitDamageLimit=Math.max(5,effectiveReserve*(ace?.3:.22));
 let salvo=0;for(const id of ship.combatFit.weapons)salvo+=weaponShotDamage(WEAPONS[id]);
 const finishing=target&&target.hull+target.shield<=salvo*3;
 // Scatter fits must first close to useful pellet density; an early aiming
 // coast at maximum reach gives long-range opponents a free standoff.
 const commitRange=weapon?.id==='ripper'?175:weapon?weaponRange(weapon):0;
 s.finishing=ace&&finishing&&ship.hull+ship.shield>(target.hull+target.shield)*1.3&&distance>45&&facing>.94;
 if(!novice&&s.visible&&weapon&&facing>.94&&distance>s.clearance+Math.max(0,closing)*.8&&distance<commitRange&&ship.energy>=weapon.energyCost&&now>=(ship.combatFit.fireAt[ship.combatWeaponIndex]??0)-.2&&now>=(ship.gunBurstPauseUntil??0)&&now>=(ship.fireCommitReadyAt??0)&&(ship.shield>ship.maxShield*.35||ace&&finishing&&ship.hull>ship.maxHull*.6)&&!friendlyFiringLaneBlocked(session,ship,s.position,lead,distance)){
  ship.fireCommitUntil=now+(ace?1:.8);ship.fireCommitReadyAt=now+1.8;
  ship.fireCommitStarted=now;ship.fireCommitPressure=(ship.combatPressure??0)*Math.exp(-Math.max(0,now-(ship.combatPressureAt??now))/1.5);
 }

 // Plan against the observed attacker, which need not be the current target.
 s.threatPosition.copy(targetPosition);s.threatNose.copy(s.direct).negate();
 const threatId=now<(ship.combatThreatUntil??0)?ship.combatThreatId:ship.targetId;
 const threat=threatId==='player'?session.save.player:session.ships.find(x=>x.id===threatId);
 if(threat?.position&&!ship.patrolMemoryActive){
  s.delta.fromArray(threat.position);
  if(!session.lineBlocked(s.position,s.delta,ship.id)){
   s.threatPosition.copy(s.delta);if(threat.rotation)s.threatNose.copy(FORWARD).applyQuaternion(s.q.fromArray(threat.rotation));
  }
 }
 s.delta.copy(s.threatPosition).sub(s.position).normalize();basis(s.delta,s.right,s.up);
 planShieldRecovery(session,ship,s,target,now,distance);
 planCrossfire(session,ship,s,now,distance);
 const needsBreak=now<(ship.evasiveUntil??0)||s.overshoot||distance<s.clearance;
 if(needsBreak&&now>=(s.escapePlannedUntil??0))chooseEscape(session,ship,s,now,novice);

 const rangeError=Math.abs(distance-preferred);
 if(now-(ship.lastCombatShotAt??-Infinity)<.6||facing>s.bestFacing+.08||rangeError<s.bestRangeError-Math.max(25,preferred*.15)){
  s.lastProgress=now;s.bestFacing=facing;s.bestRangeError=rangeError;
 }
 const navigated=ship.fieldNav?.active||ship.fieldNav?.roundField;
 if(!s.visible||navigated||distance>preferred*2.5){s.lastProgress=now;s.bestFacing=facing;s.bestRangeError=rangeError;s.reapproachUntil=0;}
 if(!navigated&&!s.recovery.active&&s.visible&&!needsBreak&&now-s.lastProgress>(novice?7:ace?4:5)&&now>=(s.reapproachReadyAt??0)){
  const side=((s.reapproachCount=(s.reapproachCount??0)+1)%2?1:-1);
  s.reapproach.copy(s.up).multiplyScalar(side*.85).addScaledVector(s.right,.4).addScaledVector(s.direct,-.25).normalize();
  s.reapproachUntil=now+1.3;s.reapproachReadyAt=now+7;s.lastProgress=now;s.bestFacing=-1;s.bestRangeError=Infinity;
 }
 s.offset.set(0,0,0);s.teamRole='solo';
 const team=s.visible?attackTeam(session,ship,targetPosition,now):undefined;
 if(team?.leader&&team.members.length>1){
  s.teamRole=team.leader===ship?'pressure':'flank';s.teamLeaderId=team.leader.id;
  if(s.teamRole==='flank'){
   let rank=0;for(const other of team.members){if(other===ship)break;if(other!==team.leader)rank++;}
   s.delta.copy(targetPosition).sub(s.candidate.fromArray(team.leader.position)).normalize();basis(s.delta,s.teamAxis,s.teamUp);
   const phase=rank*Math.PI*2/Math.max(2,team.members.length-1);
   s.offset.copy(s.teamAxis).multiplyScalar(Math.cos(phase)*Math.min(110,preferred*.4)).addScaledVector(s.teamUp,Math.sin(phase)*Math.min(90,preferred*.35));
  }
 }
 return s;
}

export function combatPursuitDirection(ship,targetPosition,lead,distance,out) {
 const s=ship.combatPlan,preferred=ship.combatFit.profile.range;
 out.copy(lead);
 if(!s)return out;
 // Pursuit geometry steers the approach, but it must not continuously point
 // forward guns outside their own firing window once the shot is available.
 if(s.aimingRun)return out;
 if(s.pursuit!=='direct'){
  s.delta.copy(targetPosition).sub(s.position).addScaledVector(s.targetVelocity,s.pursuitTime).normalize();
  // Close guns still need a useful forward bearing. Coasting maneuvers use
  // their independent firing lead directly in the attitude controller.
  out.lerp(s.delta,s.pursuit==='lead'?.65:.3).normalize();
 }
 const spread=clamp((distance-preferred*.8)/(preferred*.5),0,1);
 if(spread>0&&s.teamRole==='flank')out.multiplyScalar(distance).addScaledVector(s.offset,spread).normalize();
 return out;
}
