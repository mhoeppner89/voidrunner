import * as THREE from 'three';
import {interceptTime} from './combatTactics.js';
import {npcForwardCone,npcGunneryProfile} from './npcGunnery.js';
import {WEAPONS,weaponRange} from './weapons.js';
import {combatTargetEligible} from './combatTargeting.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const FORWARD=new THREE.Vector3(0,0,-1);

// Visible attackers only. Keep the small working set and vectors between scans;
// a pilot does not learn about hidden ships, their controls or their equipment.
function awareness(session,ship,now){
 const s=ship.combatAwareness??={next:0,contacts:[],pool:new Map(),position:new THREE.Vector3(),nose:new THREE.Vector3(),q:new THREE.Quaternion(),delta:new THREE.Vector3(),center:new THREE.Vector3(),edge:new THREE.Vector3(),direction:new THREE.Vector3(),end:new THREE.Vector3(),approachEdge:new THREE.Vector3()};
 if(now<s.next)return s;
 s.next=now+.25;s.position.fromArray(ship.position);s.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(ship.rotation));s.contacts.length=0;s.center.set(0,0,0);s.allies=0;
 for(const other of session.ships){
  if(other===ship||!combatTargetEligible(other))continue;
  s.delta.fromArray(other.position).sub(s.position);const distance=s.delta.length();
  if(distance>1000)continue;
  if(other.faction===ship.faction){if(other.targetId===ship.targetId&&!other.fleeing)s.allies++;continue;}
  if(other.targetId!==ship.id&&other.id!==ship.targetId&&!(other.id===ship.combatThreatId&&now<ship.combatThreatUntil))continue;
  s.end.fromArray(other.position);
  if(session.lineBlocked(s.position,s.end,ship.id)||session.canSee&&!session.canSee(ship.position,other.position,other.dark,Math.hypot(...other.velocity),other.speed))continue;
  let c=s.pool.get(other.id);
  if(!c){c={id:other.id,ship:other,position:new THREE.Vector3(),nose:new THREE.Vector3()};s.pool.set(other.id,c);}
  c.seenAt=now;c.position.copy(s.end);c.distance=distance;c.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(other.rotation));c.facing=-c.nose.dot(s.delta)/Math.max(1,distance);
  s.contacts.push(c);s.center.add(c.position);
 }
 const player=session.save.player;
 if(!player.dockedAt&&combatTargetEligible(player)&&(ship.targetId==='player'||ship.combatThreatId==='player'&&now<ship.combatThreatUntil||ship.hostile&&player.currentTargetId===ship.id)&&session.shipTracksPlayer(ship)){
  s.delta.fromArray(player.position).sub(s.position);const distance=s.delta.length();s.end.fromArray(player.position);
  if(distance<=1000&&!session.lineBlocked(s.position,s.end,ship.id)){
   let c=s.pool.get('player');
   if(!c){c={id:'player',ship:player,position:new THREE.Vector3(),nose:new THREE.Vector3()};s.pool.set('player',c);}
   c.seenAt=now;c.position.copy(s.end);c.distance=distance;c.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(player.rotation));c.facing=-c.nose.dot(s.delta)/Math.max(1,distance);
   s.contacts.push(c);s.center.add(c.position);
  }
 }
 if(s.contacts.length)s.center.multiplyScalar(1/s.contacts.length);
 for(const [id,c] of s.pool)if(now-c.seenAt>5)s.pool.delete(id);
 s.outnumbered=s.contacts.length>s.allies+1;
 return s;
}

// A stable target choice gives an isolated or damaged pursuer time to die.
// Score travel/turn costs as well as damage; avoid switching on every grazing hit.
export function selectCombatFocus(session,ship){
 if(ship.pilot?.tier!=='ace'||!ship.combatFit||ship.capitalClass||ship.tutorialEnemy||ship.tutorialCompanion||!combatTargetEligible(ship)||ship.holdFire||ship.pursuitHoldFire||ship.fleeing||ship.patrolMemoryActive||ship.combatPlan?.recovery?.active)return;
 const now=session.save.world.time,s=awareness(session,ship,now);
 let reach=0;for(const id of ship.combatFit.weapons)reach=Math.max(reach,weaponRange(WEAPONS[id]));
 if(!s.outnumbered)return;
 // Patrol target acquisition may nominate a nearer ship before this call.
 // Preserve the pilot's chosen opponent for the whole firing commitment.
 if(now<(s.focusUntil??0)&&s.contacts.some(c=>c.id===s.focusId&&combatTargetEligible(c.ship)&&c.distance<reach)){ship.targetId=s.focusId;return;}
 let best,current,bestScore=Infinity,currentScore=Infinity;
 for(const c of s.contacts){
  if(!combatTargetEligible(c.ship))continue;
  s.delta.copy(c.position).sub(s.position).normalize();
  let crowd=0;for(const other of s.contacts)if(other!==c)crowd+=Math.max(0,1-other.position.distanceTo(c.position)/350);
  const danger=clamp((c.facing-.7)/.3,0,1)*clamp((500-c.distance)/180,0,1);
  const finish=(c.ship.hull+c.ship.shield)<80?3:0;
  const score=Math.max(0,c.distance-reach*.85)/35+c.distance/130+(1-s.nose.dot(s.delta))*2+(c.ship.hull+c.ship.shield)/70+crowd*.6-danger*6-finish;
  if(c.id===ship.targetId){current=c;currentScore=score;}
  if(score<bestScore){best=c;bestScore=score;}
 }
 if(best&&(!current||bestScore<currentScore-1)){ship.targetId=best.id;s.focusId=best.id;s.focusUntil=now+.75;}
 else {s.focusId=ship.targetId;s.focusUntil=now+.3;}
}

export function planCrossfire(session,ship,plan,now,distance){
 if(ship.pilot?.tier!=='ace'){plan.crossfire=undefined;return;}
 const s=awareness(session,ship,now);
 plan.crossfire=s;s.active=false;s.mode=undefined;
 if(!s.outnumbered||!combatTargetEligible(ship)||ship.fleeing||ship.pursuitHoldFire||!plan.visible||plan.recovery?.active){if(!s.outnumbered){s.approachStarted=undefined;s.approachEdge.set(0,0,0);}return s;}
 const focus=s.contacts.find(c=>c.id===ship.targetId);
 if(!focus)return s;
 s.approachStarted??=now;
 if(distance>550&&now-s.approachStarted<3&&now-(ship.lastCombatShotAt??-Infinity)>5){
  if(s.approachEdge.lengthSq()===0){
   s.edge.copy(focus.position).sub(s.center).addScaledVector(plan.direct,-s.delta.copy(focus.position).sub(s.center).dot(plan.direct));
   if(s.edge.lengthSq()<100)s.edge.copy(plan.right);
   s.edge.normalize();s.approachEdge.copy(s.edge);
  }
  s.direction.copy(plan.relative).addScaledVector(s.approachEdge,700).normalize();
  s.end.copy(plan.position).addScaledVector(s.direction,Math.max(150,ship.speed*2));
  s.active=!session.lineBlocked(plan.position,s.end,ship.id);s.mode='flank';
 }
 return s;
}

export function fireCrossfireOpportunity(session,ship){
 const now=session.save.world.time,s=ship.combatAwareness;
 if(ship.pilot?.tier!=='ace'||!s?.outnumbered||now-(ship.lastCombatShotAt??-Infinity)<.001||!combatTargetEligible(ship)||ship.fleeing||ship.pursuitHoldFire||ship.patrolMemoryActive||ship.recoveryTargetHidden||now<(ship.energyRecoverUntil??0)||ship.combatPlan?.recovery?.active)return;
 const fit=ship.combatFit;const index=fit.attackOrder.find(i=>now>=fit.fireAt[i]&&ship.energy>=WEAPONS[fit.weapons[i]].energyCost);
 if(index===undefined)return;
 const weapon=WEAPONS[fit.weapons[index]];
 s.position.fromArray(ship.position);s.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(ship.rotation));
 let best,bestFacing=Math.cos(npcForwardCone(weapon));
 for(const c of s.contacts){
  const other=c.ship;if(c.id===ship.targetId||!combatTargetEligible(other)||c.id!=='player'&&other.faction===ship.faction||c.id==='player'&&(other.dockedAt||!session.shipTracksPlayer(ship)))continue;
  s.delta.fromArray(other.position).sub(s.position);const distance=s.delta.length();
  if(distance>weaponRange(weapon)){c.alignedAt=undefined;continue;}
  s.end.fromArray(other.velocity).sub(s.direction.fromArray(ship.velocity));
  const time=weapon.kind==='beam'?0:interceptTime(s.delta.x,s.delta.y,s.delta.z,s.end.x,s.end.y,s.end.z,weapon.speed);
  if(!Number.isFinite(time)||time>weapon.life)continue;
  s.delta.addScaledVector(s.end,time).normalize();const facing=s.nose.dot(s.delta);
  if(facing<=Math.cos(npcForwardCone(weapon))){c.alignedAt=undefined;continue;}
  c.alignedAt??=now;
  if(facing<=bestFacing||(weapon.id==='gauss'||weapon.id==='mortar')&&now-c.alignedAt<npcGunneryProfile(ship).settle)continue;
  if(c.id!=='player'&&session.canSee&&!session.canSee(ship.position,other.position,other.dark,Math.hypot(...other.velocity),other.speed))continue;
  s.end.fromArray(other.position);if(session.lineBlocked(s.position,s.end,ship.id))continue;
  best=c;bestFacing=facing;s.edge.copy(s.delta);
 }
 if(best)session.fireNpcGun(ship,s.edge,{target:best.ship,targetId:best.id,index});
}
