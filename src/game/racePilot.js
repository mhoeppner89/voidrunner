import * as THREE from 'three';
import {raceHull,integrateRaceTurn,integrateRacePilotVelocity} from './raceHulls.js';
import {createRaceDrive,raceDraft} from './raceDynamics.js';
const v=new THREE.Vector3(),direction=new THREE.Vector3(),demand=new THREE.Vector3(),nose=new THREE.Vector3(),w=new THREE.Vector3(),q=new THREE.Quaternion(),desired=new THREE.Quaternion(),error=new THREE.Quaternion();
const gateError=new THREE.Vector3();
const forward=new THREE.Vector3(0,0,-1),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lineCurvatures=new WeakMap();
// A race line is immutable during a race, so all rivals can share its curvature cache.
function raceLineCurvature(points){
 let values=lineCurvatures.get(points);
 if(values&&values.length===points.length)return values;
 values=new Float64Array(points.length);
 for(let j=1;j<points.length-1;j++){
  const a=points[j-1],b=points[j],c=points[j+1];
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-b[0],vy=c[1]-b[1],vz=c[2]-b[2];
  const cross=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
  values[j]=2*cross/Math.max(1e-8,Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz)*Math.hypot(ux+vx,uy+vy,uz+vz));
 }
 lineCurvatures.set(points,values);
 return values;
}
export function raceCornerSpeed(ship,course,hull,ceiling,speed){
 const points=course.racingLine,distances=course.racingLineDistances;
 if(!points)return ceiling;
 speed??=Math.hypot(ship.velocity[0],ship.velocity[1],ship.velocity[2]);
 const progress=ship.raceLineDistance??0,curvatures=raceLineCurvature(points);
 const effectiveBraking=hull.braking/1.25;
 const horizon=speed*speed/(2*effectiveBraking)+speed*1.05+180;
 const aggression=clamp(ship.raceAggression??.5,0,1);
 const turnBase=course.tunnelCourse?1.8:course.id==='mourning-run'?2.0:course.id==='mourning-breach'?1.7:1.6;
 const cornerSkill=clamp(ship.raceCorneringSkill??1,.65,1.3);
 const turnAcceleration=hull.acceleration*(turnBase+.04*aggression)*.9*cornerSkill;
 let limitSquared=ceiling*ceiling;
 // Hold the bend budget briefly through its exit: accelerating as soon
 // as the apex passes left pilots still rotating outside the next aperture.
 const exitHold=speed*.45+40;
 const narrowRing=course.id==='mourning-relict-gauntlet';
 let begin=Math.max(1,(ship.raceLineIndex??1)-1);
 while(begin>1&&distances[begin]>progress-exitHold)begin--;
 for(let j=begin;j<points.length-1;j++){
  const away=distances[j]-progress;if(away>horizon)break;
  const curvature=curvatures[j];
  if(away< -exitHold)continue;
  if(curvature>1e-7){
   // Tight graveyard rings need an earlier, lower speed budget in
   // sharp bends; broad arcs and straights can still be taken at full pace.
   const apertureBudget=narrowRing?clamp(1/(curvature*680),.375,1):1;
   const bendBudget=turnAcceleration*(curvature>1/250?.75:1)*apertureBudget;
   limitSquared=Math.min(limitSquared,bendBudget/curvature+2*effectiveBraking*Math.max(0,away-speed*.8-45));
  }
 }
 return Math.max(35,Math.sqrt(limitSquared));
}
// Desired trajectory becomes bounded torque and real engine thrust. Neither
// orientation nor velocity is snapped to the racing line.
export function updateRacePilot(ship,course,target,dt,now,steering){
 const hull=raceHull(ship.raceHull),drive=ship.raceDrive??=createRaceDrive();
 v.fromArray(ship.velocity);q.fromArray(ship.rotation);w.fromArray(ship.raceAngularVelocity??=[0,0,0]);
 const safeDirection=steering?.direction;
 if(safeDirection&&Number.isFinite(safeDirection.x)&&Number.isFinite(safeDirection.y)&&Number.isFinite(safeDirection.z)&&safeDirection.lengthSq()>1e-8)
  direction.copy(safeDirection).normalize();
 else direction.set(target[0]-ship.position[0],target[1]-ship.position[1],target[2]-ship.position[2]).normalize();
 const speed=v.length(),draft=steering?.peers?Math.max(raceDraft(ship,steering.peers),steering.player?raceDraft(ship,steering.player):0):0;
 drive.stabilizerTime=Math.max(0,drive.stabilizerTime-dt);
 const stabilized=drive.stabilizerTime>0,pace=clamp(ship.racePaceMultiplier??1,.65,1),ceiling=hull.afterburnSpeed*pace*(1+draft*.14);
 // Applying pace to both the ceiling and the requested speed penalized
 // slower rivals twice on straights. Keep one pace reduction.
 let targetSpeed=Math.min(ceiling,raceCornerSpeed(ship,course,hull,hull.afterburnSpeed*(1+draft*.14),speed)*pace);
 ship.raceLaunchAt??=now;
 ship.raceMistakeActive=now-ship.raceLaunchAt<(ship.raceLaunchDelay??0);
 if(ship.raceMistakeActive)targetSpeed=0;
 const gate=course.gates[ship.raceGateIndex];
 const gatePlane=gate?(ship.position[0]-gate.position[0])*gate.direction[0]+(ship.position[1]-gate.position[1])*gate.direction[1]+(ship.position[2]-gate.position[2])*gate.direction[2]:Infinity;
 const gateApproach=-gatePlane,gateDistance=gate?Math.hypot(ship.position[0]-gate.position[0],ship.position[1]-gate.position[1],ship.position[2]-gate.position[2]):Infinity,pathBlocked=ship.raceNavigation?.clear===false;
 // Start bending toward the active aperture before the final, high-speed
 // approach. The smaller mourning rings punish a late correction even when
 // the authored line itself is smooth.
 const directGate=Boolean(course.racingLine&&!ship.raceGateRecovery&&!ship.racePickupTarget&&!pathBlocked&&gate&&gateDistance<Math.max(ship.raceDirectGateRange??600,speed*(ship.raceDirectGateSpeedScale??2.4)));
 // Keep the continuous chord already checked by navigation across checkpoints.
 const alignment=speed>1?direction.dot(v)/speed:1;
 // The line controller intentionally permits some sideways drift. Trim speed
 // for severe heading errors, but don't turn every modest drift angle into a
 // cornering slowdown; curvature and the obstacle pass already govern braking.
 targetSpeed*=Math.max(.45,1-Math.max(0,1-alignment)*1.5);
 targetSpeed*=1-clamp(steering?.brake??0,0,1)*.8;
 if(ship.raceGateRecovery)targetSpeed=Math.min(targetSpeed,80);
 if(directGate){
  const aggression=clamp(ship.raceAggression??.5,0,1);
  const entrySpeed=ceiling*(.92+.02*aggression),brakeMargin=60;
  targetSpeed=Math.min(targetSpeed,Math.sqrt(entrySpeed**2+2*(hull.braking/1.25)*Math.max(0,gateApproach-brakeMargin)));
 }
 if(!ship.raceMistakeTriggered&&ship.raceMistakeGate===ship.raceGateIndex&&!ship.raceGateRecovery&&gateApproach>0&&gateApproach<=(ship.raceMistakeApproach??680)){
  ship.raceMistakeTriggered=true;ship.raceMistakeStartedAt=now;
 }
 const mistakeHesitation=ship.raceMistakeTriggered&&now-(ship.raceMistakeStartedAt??now)<(ship.raceMistakeDuration??0);
 if(mistakeHesitation)targetSpeed=Math.max(35,targetSpeed*.4);
 ship.raceMistakeActive=ship.raceMistakeActive||mistakeHesitation;
 // Predict the next plane crossing, so a fast line is still brought
 // through the visible aperture before looking beyond it into the next bend.
 let apertureCorrection=0;
 if(course.racingLine&&gate&&!ship.raceGateRecovery&&gateApproach>0){
  const along=v.x*gate.direction[0]+v.y*gate.direction[1]+v.z*gate.direction[2],time=gateApproach/Math.max(1,along);
  if(along>20&&time<1.2){
   gateError.set(ship.position[0]-gate.position[0],ship.position[1]-gate.position[1],ship.position[2]-gate.position[2]).addScaledVector(v,time);
   const axial=gateError.x*gate.direction[0]+gateError.y*gate.direction[1]+gateError.z*gate.direction[2];
   gateError.x-=gate.direction[0]*axial;gateError.y-=gate.direction[1]*axial;gateError.z-=gate.direction[2]*axial;
   const miss=gateError.length(),inner=gate.radius*.55;
   if(miss>inner){apertureCorrection=(1-inner/miss)*Math.min(3,2/Math.max(.5,time));targetSpeed*=Math.max(.7,Math.min(1,gate.radius*.85/miss));}
  }
 }
 const braking=speed>targetSpeed+2?clamp((speed-targetSpeed)/25,0,1):0;
 ship.raceBraking=braking;drive.burning=true;
 demand.copy(direction).multiplyScalar(targetSpeed).sub(v).multiplyScalar(2);
 if(course.racingLine&&!ship.raceGateRecovery){
  // Track the authored line while actively damping sideways drift. Full
  // velocity correction oscillates through close bends, but ignoring it lets
  // afterburner drift carry the hull outside narrow checkpoints.
  const along=v.dot(direction),lx=v.x-direction.x*along,ly=v.y-direction.y*along,lz=v.z-direction.z*along;
  const lineDamping=clamp(ship.raceLineDamping??(.4+((ship.raceCorneringSkill??1)-1)*.6),0,2.4);
  demand.set(direction.x*targetSpeed-lx*lineDamping,direction.y*targetSpeed-ly*lineDamping,direction.z*targetSpeed-lz*lineDamping);
 }
 if(apertureCorrection)demand.addScaledVector(gateError,-apertureCorrection);
 // Retrothrusters do the requested deceleration; face the lateral correction
 // while braking, rather than turning the main engine into an automatic brake.
 if(braking>0&&speed>1&&!ship.raceGateRecovery){const along=demand.dot(v)/speed;if(along<0)demand.addScaledVector(v,-along/speed);}
 // Small lateral errors near cruise must not demand a sideways-facing nose.
 if(directGate){const along=demand.dot(direction),minimum=hull.acceleration*.5;if(along<minimum)demand.addScaledVector(direction,minimum-along);}
 if(demand.lengthSq()<1)demand.copy(direction);
 nose.copy(demand).normalize();desired.setFromUnitVectors(forward,nose);
 error.copy(q).invert().multiply(desired).normalize();if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);
 const length=Math.hypot(error.x,error.y,error.z),gain=length>1e-8?2*Math.atan2(length,error.w)/length:0;
 const ax=clamp((error.x*gain*14-w.x*6)/hull.angularAcceleration,-1,1),ay=clamp((error.y*gain*14-w.y*6)/hull.angularAcceleration,-1,1),az=clamp((error.z*gain*14-w.z*6)/hull.angularAcceleration,-1,1);
 integrateRaceTurn(q,w,ax,ay,az,hull,0,dt);
 nose.copy(forward).applyQuaternion(q);
 const forwardSpeed=Math.max(0,v.dot(nose)),speedError=targetSpeed-forwardSpeed;
 const canThrust=now>=(ship.raceContactUntil??0);
 const appliedBrake=speedError< -1?clamp(-speedError/(hull.braking*.42),0,1):0;
 ship.raceBraking=appliedBrake;
 ship.burning=canThrust&&speedError>1;
 // Racing AI steers the authored line while tracking its requested speed;
 // corner speed changes no longer turn into full-stop brake cycles.
 integrateRacePilotVelocity(v,nose,hull,canThrust?targetSpeed:Math.min(targetSpeed,forwardSpeed),dt,draft,stabilized,Boolean(ship.raceGateRecovery),pace);
 for(let i=0;i<3;i++){ship.velocity[i]=v.getComponent(i);ship.position[i]+=ship.velocity[i]*dt;ship.raceAngularVelocity[i]=w.getComponent(i);}
 q.toArray(ship.rotation);
}
