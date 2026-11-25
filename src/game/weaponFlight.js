import * as THREE from 'three';
import {interceptTime} from './combatTactics.js';
export const MISSILE_PADDING=.25;
const q=new THREE.Quaternion(),identity=new THREE.Quaternion(),from=new THREE.Vector3(),to=new THREE.Vector3();
const relative=new THREE.Vector3(),transverse=new THREE.Vector3();
const aftAxis=new THREE.Vector3();
function readAftAxis(rotation){
    q.fromArray(rotation);
    const norm=q.lengthSq();
    if(!(norm>0) || !Number.isFinite(norm))return false;
    aftAxis.set(0,0,1).applyQuaternion(q.normalize());
    return true;
}
const radians=Math.PI/180;
export function breakCueEnd(rack){
    if(rack?.id==='torpedo')return 1;
    return Math.min(.75,.5+Math.max(0,(rack?.gunneryAccuracy??1)-1));
}
// Cockpit and pilot timing, measured on the fighter trials.
export function breakCueStart(rack){
    if(rack?.id==='torpedo')return 2;
    const start=(rack?.volley??1)>1?1.25:1.5;
    return Math.max(1,start/Math.max(1,rack?.gunneryAccuracy??1));
}
// Seconds between hearing the break cue and the ship actually turning: a
// simple auditory reaction plus moving the stick. The device's measured audio
// output latency is added on top at runtime (updateMissileWarning).
export const BREAK_REACTION=.3;
// The best moment to break: the middle of the window in which a hard break
// defeats this rack (measured with tests/helpers/missile-flight.mjs), early
// by the pilot's reaction time. NPC pilots time their breaks the same way.
export const breakCueTime=rack=>(breakCueEnd(rack)+breakCueStart(rack))/2+BREAK_REACTION;
// Fighters and capital tubes keep the receiver reading with the rack itself.
export function beginRackLock(fit, target, rack, time, dt) {
    if (fit.lockTarget !== target || fit.lockRack !== rack || time - (fit.lockCheckedAt ?? time) > dt + .001) {
        fit.lock = 0;
        fit.warned = false;
    }
    fit.lockTarget = target;
    fit.lockRack = rack;
    fit.lockCheckedAt = time;
}
// A pilot that has broken off can retain its last rack reading until the next
// attack pass. Only a lock checked on the latest simulation step is live.
export function cockpitLockState(ships, time, trackingMissile) {
    if (trackingMissile) return 'missile';
    let state = 'off';
    for (const ship of ships) {
        const fit = ship.combatFit;
        if (!ship.hostile || ship.hull <= 0 || ship.surrendered
            || fit?.lockTarget !== 'player' || fit.lockCheckedAt !== time) continue;
        if (fit.lock === 1) return 'locked';
        if (fit.warned && fit.lock > 0) state = 'acquiring';
    }
    return state;
}
// Select the first closing round so a later swarm lane cannot mask a more
// urgent warning. This writes the reused mixer model, including on docking.
// missileBreak is true for the one frame the nearest round reaches its cue
// time (once per salvo); missileCommitted while that round is past its cue,
// so the approach pips fall silent and the cue stands alone.
export function updateMissileWarning(flight,projectiles,store,player,latency=0){
    flight.missileThreat=0;
    flight.trackingMissile=false;
    flight.missileBreak=false;
    flight.missileCommitted=false;
    if(!projectiles)return;
    let nearest=Infinity,urgent;
    for(const shot of projectiles){
        if(shot.targetId!=='player' || shot.lostTrack || shot.life<=0 || (shot.kind!=='missile' && shot.kind!=='torpedo'))continue;
        // A live seeker can still be turning toward us outside the audio cue window.
        flight.trackingMissile=true;
        const i=shot.slot*3;
        const x=store.pos[i]-player.position[0],y=store.pos[i+1]-player.position[1],z=store.pos[i+2]-player.position[2];
        const vx=store.vel[i]-player.velocity[0],vy=store.vel[i+1]-player.velocity[1],vz=store.vel[i+2]-player.velocity[2];
        const time=-(x*vx+y*vy+z*vz)/Math.max(1,vx*vx+vy*vy+vz*vz);
        if(time<=0 || time>shot.life)continue;
        const range=Math.hypot(x,y,z);
        flight.missileThreat=Math.max(flight.missileThreat,1-range/700,.05);
        if(time<nearest){nearest=time;urgent=shot;}
    }
    if(!urgent)return;
    const cueAt=breakCueTime(urgent.hitWeapon)+latency;
    if(nearest>cueAt)return;
    flight.missileCommitted=true;
    if(urgent.breakCued)return;
    // A round first seen too late for a break gets no cue at all.
    flight.missileBreak=nearest>=breakCueEnd(urgent.hitWeapon);
    for(const shot of projectiles)if(shot===urgent || urgent.salvo!==undefined && shot.salvo===urgent.salvo)shot.breakCued=true;
}
// The plume starts on the hull intercept. Turning after lock swings the
// apparent spot by the change in the ship's local +Z axis in world space.
export function guideMissile(velocity,offset,missile,dt,targetVelocity,targetRotation) {
    if(missile.lostTrack)return false;
    const rack=missile.hitWeapon??missile;
    const speed=velocity.length(),cruise=missile.homingSpeed??260,distance=offset.length();
    if(distance<1e-6)return true;
    to.copy(offset).divideScalar(distance);
    from.copy(speed>1e-6?velocity:to).normalize();
    if(from.angleTo(to)>(rack.seekerCone??45)*radians)return false;
    if(rack.trackRate && targetVelocity){
        relative.copy(velocity).sub(targetVelocity);
        const closing=relative.dot(to);
        if(transverse.crossVectors(to,relative).length()>distance*rack.trackRate*radians)return false;
        if(missile.plumeOffset===undefined){
            const time=distance*closing/Math.max(1,relative.lengthSq());
            const aligned=time>0 && transverse.copy(offset).addScaledVector(relative,-time).lengthSq()<.4**2;
            missile.alignedTime=aligned?(missile.alignedTime??0)+dt:0;
            if(distance<=rack.terminalRange && missile.alignedTime>=.15){
                missile.plumeOffset=distance*rack.plumeFraction;
                if(targetRotation && readAftAxis(targetRotation)){
                    missile.lockAxis=aftAxis.clone();
                    missile.lockVelocity=targetVelocity.clone();
                }
            }
        }
        // Capitals, selected mounts and drones coast once aligned.
        if(missile.plumeOffset!==undefined && !targetRotation)return true;
        const trackingPlume=missile.lockAxis && readAftAxis(targetRotation);
        // Carry the steady motion used for the hull intercept into plume lock.
        // A bad fighter pose uses the ordinary hull lead for this step.
        const motion=trackingPlume?missile.lockVelocity:targetVelocity;
        const lead=.8*distance/Math.max(1,cruise-motion.dot(to));
        to.copy(offset).addScaledVector(motion,lead);
        if(trackingPlume)
            to.addScaledVector(aftAxis.sub(missile.lockAxis),missile.plumeOffset);
        to.normalize();
    }
    const angle=from.angleTo(to),step=(missile.homingTurn??1.8)*dt;
    q.setFromUnitVectors(from,to).slerp(identity,1-Math.min(1,step/Math.max(angle,1e-8)));
    from.applyQuaternion(q).normalize();
    const change=(missile.acceleration??520)*dt;
    velocity.copy(from).multiplyScalar(speed+Math.max(-change,Math.min(change,cruise-speed)));
    return true;
}
export function relativeIntercept(position,targetPosition,velocity,targetVelocity,speed,out) {
    const rx=targetPosition[0]-position.x,ry=targetPosition[1]-position.y,rz=targetPosition[2]-position.z;
    const vx=(targetVelocity?.[0]??0)-velocity[0],vy=(targetVelocity?.[1]??0)-velocity[1],vz=(targetVelocity?.[2]??0)-velocity[2];
    const time=interceptTime(rx,ry,rz,vx,vy,vz,speed);
    if(!Number.isFinite(time))return Infinity;
    out.set(rx+vx*time,ry+vy*time,rz+vz*time);return time;
}
// The incoming flight direction points with the fighter's nose on a tail hit.
export function wearFighterDrive(ship,damage,position,origin) {
    if (!ship.combatFit?.stats || ship.crippled || ship.capitalClass || ship.tutorialCompanion || ship.tutorialEnemy && !ship.campaignCombat ||
        ship.race || ship.surrendered || ship.captured || ship.role==='trader' || ship.role==='miner' || !(damage>0) || !origin || !position) return;
    from.set(origin.x??origin[0],origin.y??origin[1],origin.z??origin[2]);
    const shot=to.fromArray(position).sub(from).normalize();
    from.set(0,0,-1).applyQuaternion(q.fromArray(ship.rotation));
    if (shot.dot(from)<.65) return;
    ship.driveWear=(ship.driveWear??0)+damage/ship.maxHull;
    if(ship.driveWear<.18)return;
    crippleDrive(ship);
}
export function restoreFighterDrive(ship,snapshot) {
    if(Number.isFinite(snapshot?.driveWear) && snapshot.driveWear>0)ship.driveWear=snapshot.driveWear;
    if(snapshot?.crippled===true)crippleDrive(ship);
}
function crippleDrive(ship) {
    if(ship.crippled || !ship.combatFit?.stats)return;
    ship.crippled=true;
    ship.burning=false;
    const stats=ship.combatFit.stats, speed=stats.maxSpeed*.5;
    ship.combatFit.stats={...stats,maxSpeed:speed,afterburnSpeed:speed,acceleration:stats.acceleration*.45};
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

const acquireCone=Math.cos(20*Math.PI/180),holdCone=Math.cos(30*Math.PI/180);
// The line-of-sight angular speed is |unit bearing × relative velocity| / range.
const lockFalloff=(value,full,zero)=>Math.min(1,Math.max(0,(zero-value)/(zero-full)));
export function torpedoMobilityFactor(launcher,shooterVelocity,targetVelocity,bearing,distance){
    if(launcher.zeroLockSpeed===undefined)return 1;
    if(!targetVelocity||!shooterVelocity)return 0;
    const speed=Math.hypot(targetVelocity[0],targetVelocity[1],targetVelocity[2]);
    const speedFactor=lockFalloff(speed,launcher.fullLockSpeed,launcher.zeroLockSpeed);
    if(!speedFactor||distance<=0)return 0;
    relative.fromArray(targetVelocity).sub(transverse.fromArray(shooterVelocity));
    const angularRate=relative.cross(bearing).length()/distance;
    return speedFactor*lockFalloff(angularRate,launcher.fullLockAngularRate,launcher.zeroLockAngularRate);
}
export function rackLockProgress(progress,launcher,pilot,distance,alignment,aspect,dt,mobility=1){
    if(distance>launcher.lockRange || alignment<(progress===1?holdCone:acquireCone))return 0;
    const scale=pilot==='novice'?2:pilot==='veteran'?1.5:1;
    const seconds=launcher.lockTime*scale*(.75-.25*Math.max(-1,Math.min(1,aspect)));
    if(mobility===0)return Math.max(0,progress-dt/seconds);
    const next=progress+mobility*dt/seconds;
    return next>=1-1e-12?1:next;
}
