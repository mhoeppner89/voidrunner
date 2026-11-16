import * as THREE from 'three';
import {fieldClearDistance,fieldObstacleSupport} from './fieldCombatNav.js';
import {combatTargetEligible} from './combatTargeting.js';
import {SHIP_COLLIDERS,shipVsObstacle} from './shipCollision.js';

const UP=new THREE.Vector3(0,1,0),FORWARD=new THREE.Vector3(0,0,-1);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function state(){
 return {active:false,nextPlan:0,readyAt:0,plans:0,rayTests:0,corridorChecks:0,nearby:[],obstacles:[],position:new THREE.Vector3(),nose:new THREE.Vector3(),travel:new THREE.Vector3(),target:new THREE.Vector3(),targetVelocity:new THREE.Vector3(),prediction:new THREE.Vector3(),threat:new THREE.Vector3(),center:new THREE.Vector3(),axis:new THREE.Vector3(),side:new THREE.Vector3(),up:new THREE.Vector3(),candidate:new THREE.Vector3(),exit:new THREE.Vector3(),best:new THREE.Vector3(),bestExit:new THREE.Vector3(),waypoint:new THREE.Vector3(),second:new THREE.Vector3(),leg:new THREE.Vector3(),direction:new THREE.Vector3(),delta:new THREE.Vector3(),forecast:new THREE.Vector3(),motion:new THREE.Vector3(),local:new THREE.Vector3(),ray:new THREE.Vector3(),q:new THREE.Quaternion(),pose:new THREE.Quaternion(),contact:{x:0,y:0,z:0,push:0}};
}
function stop(ship,s,now){
 if(s.kind==='cover-graze')s.riskReadyAt=now+40;
 s.grazeObstacle=undefined;
 s.active=false;s.targetHidden=false;s.lastKind=s.kind;s.readyAt=now+(ship.pilot?.tier==='ace'?5:7)+(ship.aiRng?.()??.5)*2;s.repeatAt=now+15;
}
function clear(s,a,b,reach){
 s.delta.copy(b).sub(a);const distance=s.delta.length();if(distance<1)return true;
 s.delta.multiplyScalar(1/distance);s.corridorChecks++;
 return fieldClearDistance(s,a,s.delta,reach,distance)>=distance-.5;
}
function reachable(s,ship,point,reach){
 s.delta.copy(point).sub(s.position);const distance=s.delta.length();
 if(distance<40||distance>280)return false;
 s.delta.multiplyScalar(1/distance);
 const facing=s.nose.dot(s.delta),stats=ship.combatFit.stats;
 if(facing<-.1)return false;
 const turnTime=Math.acos(clamp(facing,-1,1))*stats.angularDamping/stats.angularAcceleration;
 if(distance<s.speed*turnTime*.5)return false;
 // A clear chord to the waypoint is insufficient when momentum still points
 // into a plate. Check the coast during the turn, then a finite-thrust forecast.
 const horizon=clamp(turnTime+.35,.65,1.3),coast=Math.min(.7,turnTime*.65+.12);
 s.motion.copy(s.delta).multiplyScalar(Math.min(s.speed,ship.speed)).sub(s.travel).clampLength(0,stats.acceleration*horizon);
 s.forecast.copy(s.position).addScaledVector(s.travel,coast);
 if(!clear(s,s.position,s.forecast,reach+3))return false;
 s.forecast.copy(s.position).addScaledVector(s.travel,horizon).addScaledVector(s.motion,horizon*.5);
 if(!clear(s,s.position,s.forecast,reach+3))return false;
 return clear(s,s.position,point,reach);
}
function begin(ship,s,kind,now,second=false){
 s.kind=kind;s.active=true;s.targetId=ship.targetId;s.started=now;s.until=now+4.2;
 s.waypoint.copy(s.candidate);s.second.copy(s.exit);s.hasSecond=second;s.stage=0;
 s.leg.copy(s.waypoint).sub(s.position).normalize();
 s.speedFactor=kind==='gap-dash'?1.08:kind==='wreck-popout'?.86:.92;
 s.canBoost=false;s.bank=(s.sideSign??1)*(kind==='gap-dash'?.15:.42);
 s.nextCheck=now+.25;
 ship.aceMove=undefined;
 return s;
}
function allowed(s,kind,now){return s.lastKind!==kind||now>=s.repeatAt;}
function coverGraze(session,ship,s,now,reach){
 // A willing pilot keeps an already shallow escape line rather than braking
 // in a pursuer's sights. This is not a licence to aim at solid cover.
 if(now<(s.riskReadyAt??0)||now<(s.riskCheckAt??0)||ship.pilot?.temperament==='timid'||ship.pilotJudgment?.active||ship.storyPersonId||ship.role==='trader'||ship.role==='miner'||ship.hull<ship.maxHull*.8||ship.shield<ship.maxShield*.55||s.speed<28||s.speed>65||now-(ship.combatBumpAt??-Infinity)<20)return;
 const profile=SHIP_COLLIDERS[ship.variant];if(!profile)return;
 s.direction.copy(s.travel).normalize();
 if(s.nose.dot(s.direction)<.985)return;
 s.riskCheckAt=now+2;
 const scale=session.npcHullExtents(ship)[0]/profile.extent[0];
 const budget=Math.min(ship.shield*.12,ship.maxHull*.08),contact=s.contact;
 s.pose.fromArray(ship.rotation);
 for(let index=0;index<Math.min(2,s.nearby.length);index++){
  const o=s.nearby[index];
  if(o.terrain||o.shape==='wreck-mesh'||o.shape==='wreck-node-mesh')continue;
  s.delta.set(o.x,o.y,o.z).sub(s.position);
  const closest=clamp(s.delta.dot(s.travel)/(s.speed*s.speed),0,1.6);
  s.delta.addScaledVector(s.travel,-closest);
  const bound=(o.box?Math.hypot(o.box.hx,o.box.hy,o.box.hz):o.radius??o.collisionRadius)+profile.contactRadius*scale;
  if(s.delta.lengthSq()>bound*bound)continue;
  let hit=false,unsafe=false,worst=0;
  // Use the fixed simulation step for this rare bounded forecast: a coarse
  // sample can miss the hard front edge of a thin panel before a side scrape.
  // Only two nearby candidates are tested, at most once per two seconds.
  for(let i=0;i<=96;i++){
   s.forecast.copy(s.position).addScaledVector(s.travel,i/60);
   if(!shipVsObstacle(s.forecast,s.pose,ship.variant,scale,o,contact))continue;
   const inward=-(s.travel.x*contact.x+s.travel.y*contact.y+s.travel.z*contact.z);
   const damage=Math.max(0,(inward+s.speed*.16-3)*1.35);
   if(i===0||i===96||contact.push>1.1||inward>8||damage>budget){unsafe=true;break;}
   hit=true;worst=Math.max(worst,damage);
  }
  if(!hit||unsafe)continue;
  s.exit.copy(s.position).addScaledVector(s.travel,1.8);
  if(!session.lineBlocked(s.threat,s.exit,ship.id))continue;
  // Only the selected skin is relaxed. Every neighbouring object still gets
  // full conservative clearance, including the endpoint behind cover.
  s.grazeObstacle=o;s.grazeReach=0;
  if(!clear(s,s.position,s.exit,reach)){s.grazeObstacle=undefined;continue;}
  const willingness=ship.pilot?.temperament==='aggressive'?.25:ship.pilot?.temperament==='flamboyant'?.18:ship.pilot?.tier==='ace'?.15:.08;
  if((ship.aiRng?.()??.5)>willingness){s.grazeObstacle=undefined;return;}
  s.candidate.copy(s.exit);
  const move=begin(ship,s,'cover-graze',now);
  move.until=now+1.8;move.speedFactor=s.speed/ship.speed;move.grazeSpeed=s.speed;move.bank=0;move.riskReadyAt=now+22;move.expectedDamage=worst;move.riskChecks=(move.riskChecks??0)+1;
  return move;
 }
 s.grazeObstacle=undefined;
}
function collect(s){
 const list=s.nearby;list.length=0;
 for(const o of s.obstacles){
  if(o.shape!=='asteroid'&&o.shape!=='debris-mesh'&&o.shape!=='wreck-mesh'&&o.shape!=='wreck-node-mesh')continue;
  const radius=o.box?Math.max(o.box.hx,o.box.hy,o.box.hz):o.radius??o.collisionRadius;
  if(!(radius>=18&&radius<=220))continue;
  const d=Math.hypot(o.x-s.position.x,o.y-s.position.y,o.z-s.position.z)-radius;
  if(d>220||d<5)continue;
  // Keep six nearby bodies without allocating or sorting a fresh candidate list.
  let index=list.length;
  while(index>0){const p=list[index-1],pr=p.box?Math.max(p.box.hx,p.box.hy,p.box.hz):p.radius??p.collisionRadius;
   if(Math.hypot(p.x-s.position.x,p.y-s.position.y,p.z-s.position.z)-pr<=d)break;index--;}
  if(index<6){if(list.length<6)list.length++;for(let j=list.length-1;j>index;j--)list[j]=list[j-1];list[index]=o;}
 }
}
function basis(s,o,from){
 s.center.set(o.x,o.y,o.z);s.axis.copy(from).sub(s.center).normalize();
 s.side.crossVectors(s.axis,UP);if(s.side.lengthSq()<.01)s.side.set(1,0,0);else s.side.normalize();
 s.up.crossVectors(s.side,s.axis).normalize();
}
function shoulderWrap(session,ship,s,now,reach){
 if(!allowed(s,'asteroid-wrap',now))return;
 // A nearby shoulder can break an observed pursuer's line of fire. The first
 // point clears the corner; the second actually goes behind its solid body.
 for(let index=0;index<Math.min(2,s.nearby.length);index++){
  const o=s.nearby[index];if(o.shape!=='asteroid')continue;
  basis(s,o,s.threat);
  const depth=fieldObstacleSupport(o,s.axis,s)+reach+24,width=fieldObstacleSupport(o,s.side,s)+reach+28;
  for(let i=0;i<2;i++){
   const sign=i===0?-1:1;
   s.candidate.copy(s.center).addScaledVector(s.side,width*sign).addScaledVector(s.axis,-depth*.45);
   s.exit.copy(s.center).addScaledVector(s.side,width*.20*sign).addScaledVector(s.axis,-depth);
   if(!reachable(s,ship,s.candidate,reach)||!clear(s,s.candidate,s.exit,reach))continue;
   if(!session.lineBlocked(s.threat,s.exit,ship.id))continue;
   if(s.position.distanceTo(s.candidate)+s.candidate.distanceTo(s.exit)>s.speed*3.2+60)continue;
   s.sideSign=sign;return begin(ship,s,'asteroid-wrap',now,true);
  }
 }
}
function edgePopout(session,ship,s,now,reach,exposureTarget=s.target){
 if(!allowed(s,'wreck-popout',now))return;
 let best=Infinity,bestSign=1;
 for(let index=0;index<Math.min(2,s.nearby.length);index++){
  const o=s.nearby[index];if(o.shape==='asteroid')continue;
  basis(s,o,s.position);
  for(let i=0;i<4;i++){
   const axis=i<2?s.side:s.up,sign=i%2===0?-1:1;
   // Keep the existing small-ship clearance around thick broken plates. The
   // endpoint must expose the last observed target as well as be reachable.
   const width=fieldObstacleSupport(o,axis,s)+reach+55;
   s.exit.copy(s.center).addScaledVector(axis,width*sign);
   s.candidate.copy(s.exit).addScaledVector(s.axis,fieldObstacleSupport(o,s.axis,s)+reach+42);
   if(!reachable(s,ship,s.candidate,reach)||!clear(s,s.candidate,s.exit,reach)||session.lineBlocked(s.exit,exposureTarget,ship.id))continue;
   const approach=s.position.distanceTo(s.candidate),exitDistance=s.candidate.distanceTo(s.exit);
   if(approach+exitDistance>Math.max(40,ship.speed)*3.6)continue;
   const facing=s.delta.copy(s.candidate).sub(s.position).normalize().dot(s.nose);
   // A showy pilot favours an overhead emergence when it is nearly as good;
   // clearance and turn feasibility are still checked before this preference.
   const score=approach+exitDistance+(1-facing)*90-(ship.pilot?.temperament==='flamboyant'&&i>=2?12:0);
   if(score<best){best=score;bestSign=sign;s.best.copy(s.candidate);s.bestExit.copy(s.exit);}
  }
 }
 if(best<Infinity){s.candidate.copy(s.best);s.exit.copy(s.bestExit);s.sideSign=bestSign;return begin(ship,s,'wreck-popout',now,true);}
}
function gapDash(ship,s,now,reach,lead){
 if(!allowed(s,'gap-dash',now))return;
 // Only the three closest pairs are considered. This is a short gap crossing,
 // not a tunnel search; ordinary navigation keeps veto authority afterwards.
 const n=Math.min(3,s.nearby.length);
 for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){
  const one=s.nearby[a],two=s.nearby[b];
  s.center.set(one.x,one.y,one.z);s.axis.set(two.x-one.x,two.y-one.y,two.z-one.z);const span=s.axis.length();if(span<1)continue;s.axis.multiplyScalar(1/span);
  const r1=fieldObstacleSupport(one,s.axis,s),r2=fieldObstacleSupport(two,s.axis,s),gap=span-r1-r2;
  const extraMargin=ship.pilot?.temperament==='timid'?18:0;
  if(gap<reach*2+24+extraMargin||gap>160||Math.abs(s.axis.dot(lead))>.55)continue;
  s.candidate.copy(s.center).addScaledVector(s.axis,r1+gap*.5);
  s.delta.copy(s.candidate).sub(s.position);const distance=s.delta.length();
  if(distance<70||distance>230||s.delta.multiplyScalar(1/distance).dot(lead)<.7)continue;
  s.exit.copy(s.candidate).addScaledVector(lead,Math.max(70,s.speed*.9));
  if(!reachable(s,ship,s.candidate,reach)||!clear(s,s.candidate,s.exit,reach))continue;
  s.sideSign=s.axis.dot(ship.combatPlan.right??s.axis)>0?1:-1;
  return begin(ship,s,'gap-dash',now,true);
 }
}

// Reads only the previous navigation broadphase and observed combat state.
// Apply this suggestion BEFORE fieldCombatSteering, so collision/braking always
// has final authority. Active routes keep static points through brief occlusion.
export function terrainCombatManeuver(session,ship,targetPosition,lead,out){
 const now=session.save.world.time,nav=ship.fieldNav,plan=ship.combatPlan;
 let s=ship.terrainManeuver;
 const eligible=(ship.pilot?.tier==='ace'||ship.pilot?.tier==='veteran')&&!ship.tutorialEnemy&&!ship.tutorialCompanion&&!ship.capitalClass&&!ship.race&&!ship.fleeing&&!ship.covering&&!ship.holdFire&&!ship.pursuitHoldFire&&!ship.patrolMemoryActive&&!ship.pilotJudgment?.active&&!plan?.recovery?.active&&!plan?.crossfire?.active;
 if(!eligible||nav?.recovering){if(s?.active)stop(ship,s,now);return;}
 if(!nav?.obstacles.length){if(s?.active)stop(ship,s,now);return;}
 s??=ship.terrainManeuver=state();s.obstacles=nav.obstacles;
 s.position.fromArray(ship.position);s.travel.fromArray(ship.velocity);s.speed=s.travel.length();
 s.nose.copy(FORWARD).applyQuaternion(s.q.fromArray(ship.rotation));
 s.targetHidden=Boolean(ship.recoveryTargetHidden)||!plan.visible;
 const reach=Math.max(...session.npcHullExtents(ship))+3;
 // Keep observations fresh even during cooldowns or a committed shot. Taking
 // cover must not send a pilot toward a position seen several seconds ago.
 if(!s.targetHidden){s.target.copy(targetPosition);s.targetVelocity.copy(plan.targetVelocity??s.delta.set(0,0,0));s.observedTargetId=ship.targetId;}
 if(s.active){
  if(s.kind==='cover-graze'&&((ship.combatBumpAt??-Infinity)>=s.started||ship.shield<ship.maxShield*.45||ship.hull<ship.maxHull*.8||s.speed>s.grazeSpeed*1.08||s.nose.dot(s.leg)<.992||s.direction.copy(s.travel).normalize().dot(s.leg)<.995)){stop(ship,s,now);return;}
  if(now>=s.until||s.targetId!==ship.targetId){stop(ship,s,now);return;}
  // Once the outside shoulder exposes the enemy, hand steering back to the
  // firing solution. Chasing the exact edge point would make another orbit.
  if(s.kind==='wreck-popout'&&s.stage===1&&now-(s.stageStarted??s.started)>.15&&!s.targetHidden){stop(ship,s,now);return;}
  const waypointDistance=s.position.distanceTo(s.waypoint);
  const passed=waypointDistance<Math.max(32,s.speed*.55)&&s.delta.copy(s.position).sub(s.waypoint).dot(s.leg)>0;
  if(waypointDistance<Math.max(22,s.speed*.28)||passed){
   if(s.hasSecond&&s.stage===0){s.stage=1;s.stageStarted=now;s.waypoint.copy(s.second);s.leg.copy(s.waypoint).sub(s.position).normalize();s.nextCheck=0;}
   else {stop(ship,s,now);return;}
  }
  if(now>=s.nextCheck){
   s.nextCheck=now+.25;
   if(!clear(s,s.position,s.waypoint,reach)){stop(ship,s,now);return;}
  }
  s.direction.copy(s.waypoint).sub(s.position).normalize();out.copy(s.direction);return s;
 }
 if(now<s.nextPlan||now<s.readyAt||now<(ship.fireCommitUntil??0)||s.speed<ship.speed*.45)return;
 s.nextPlan=now+.25;s.plans++;
 // No live coordinates are inspected behind cover. A pop-out uses the last
 // visible target position supplied by normal awareness, never hidden motion.
 if(s.targetHidden&&s.observedTargetId!==ship.targetId)return;
 collect(s);if(!s.nearby.length)return;
 const recentFire=now<(ship.combatThreatUntil??0)&&(now<(ship.evasiveUntil??0)||now-(ship.combatPressureAt??-Infinity)<2.2);
 const rearPressure=recentFire&&plan.threatPosition&&s.delta.copy(plan.threatPosition).sub(s.position).normalize().dot(s.nose)<.25;
 const underFire=recentFire&&(ship.combatIntent==='evade'||rearPressure);
 let move;
 if(underFire&&plan.threatPosition){s.threat.copy(plan.threatPosition);move=coverGraze(session,ship,s,now,reach);}
 if(move){s.direction.copy(s.waypoint).sub(s.position).normalize();out.copy(s.direction);return s;}
 if(nav.active&&!s.targetHidden)return;
 if(underFire&&plan.threatPosition){s.threat.copy(plan.threatPosition);move=shoulderWrap(session,ship,s,now,reach);}
 else if(s.targetHidden)move=edgePopout(session,ship,s,now,reach);
 else if(s.targetVelocity.lengthSq()>225){
  // Anticipate an observed crossing target disappearing behind a plate. Start
  // the outside turn while there is braking room, not after reaching the wall.
  s.prediction.copy(s.target).addScaledVector(s.motion.copy(s.targetVelocity).clampLength(0,150),1);
  if(session.lineBlocked(s.position,s.prediction,ship.id))move=edgePopout(session,ship,s,now,reach,s.prediction);
 }
 if(!move&&(underFire||plan.supportApproach)&&!s.targetHidden)move=gapDash(ship,s,now,reach,lead);
 if(move){s.direction.copy(s.waypoint).sub(s.position).normalize();out.copy(s.direction);return s;}
}

// A shoulder run deliberately loses sight. Let its short physical commitment
// finish before ordinary search takes over, without tracking through the rock.
export function continueTerrainManeuver(session,ship,dt){
 const s=ship.terrainManeuver,now=session.save.world.time;
 if(!s?.active)return false;
 if(now>=s.until||s.targetId!==ship.targetId||!combatTargetEligible(ship)||ship.fleeing||ship.pursuitHoldFire||ship.combatPlan?.recovery?.active){stop(ship,s,now);return false;}
 const target=ship.targetId==='player'?session.save.player:session.ships.find(other=>other.id===ship.targetId&&combatTargetEligible(other));
 if(!target||target.hull<=0||target.dockedAt){stop(ship,s,now);return false;}
 s.position.fromArray(ship.position);s.candidate.fromArray(target.position);
 const sensed=ship.targetId==='player'?session.shipTracksPlayer(ship):!session.canSee||session.canSee(ship.position,target.position,target.dark,target.velocity?Math.hypot(...target.velocity):0,target.speed);
 const visible=sensed&&!session.lineBlocked(s.position,s.candidate,ship.id);
 s.targetHidden=!visible;
 if(visible){s.target.copy(s.candidate);if(target.velocity)s.targetVelocity.fromArray(target.velocity);else s.targetVelocity.set(0,0,0);}
 else s.targetVelocity.set(0,0,0);
 ship.recoveryTargetHidden=!visible;
 try{session.updateAttackAI(ship,s.target,s.targetVelocity,dt);}
 finally{ship.recoveryTargetHidden=false;}
 return true;
}
