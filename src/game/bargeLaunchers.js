// Red Njord Barrage launcher racks. Missile artillery: speed only slows its
// lock (full rate up to 50, four times slower from 100). What breaks it is
// line-of-sight rate: the fire-control tracker cannot follow a pilot crossing
// its view fast enough, so the defence is a hard pass across the bearing, and
// closer in the same speed crosses faster. Each salvo is announced three
// seconds ahead (CHARGING on the target monitor, LOCK lamp, rack flashes);
// nothing fires inside BARGE.minRange. A pilot who rushes it fast still draws
// one snap canister per approach, which the normal break cue lets them dodge.
// Allocation-free per step: one scratch record per barge.
import * as THREE from 'three';
import {LAUNCHERS} from './weapons.js';
import {beginRackLock,rackLockProgress} from './weaponFlight.js';
import {capitalHull} from './capitalHulls.js';
import {tracksActivePlayer} from './combatTargeting.js';
import {t} from './i18n.js';

export const BARGE=Object.freeze({
    every:15, warning:3, warheads:8, canister:4,
    lockTime:4, lockRange:1200, minRange:250,
    snapRange:600, snapRearm:800, snapSpeed:45, abortReload:5,
    // Lock rate against target speed: full up to 50, a quarter from 100 on.
    lockFullSpeed:50, lockSlowSpeed:100, lockSlowFactor:4,
    // Tracker limit (line-of-sight rate): full rate up to 3°/s, lost at 6°/s.
    fullTrack:3*Math.PI/180, lostTrack:6*Math.PI/180,
    // After a full salvo the barge relocates at full speed for this long.
    relocate:6,
});
// Stock swarm warheads (same speed, turn and 600-unit terminal phase, so the
// measured break window holds) with the reach to shell from the stand-off.
export const BARGE_SWARM=Object.freeze({...LAUNCHERS.swarm,id:'barge-swarm',life:7,
    lockRange:BARGE.lockRange,lockTime:BARGE.lockTime});
const BLIND=Object.freeze({...BARGE_SWARM,lockRange:BARGE.lockRange/2,lockTime:BARGE.lockTime*2});

const ZERO=[0,0,0];
function stateFor(ship){
    return ship.bargeLaunch??={phase:'ready',readyAt:0,fireAt:0,salvoUntil:0,flashAt:0,snapArmed:true,rackCursor:0,
        position:new THREE.Vector3(),target:new THREE.Vector3(),bearing:new THREE.Vector3(),q:new THREE.Quaternion(),
        muzzle:new THREE.Vector3(),shot:new THREE.Vector3(),up:new THREE.Vector3(),right:new THREE.Vector3(),scratch:new THREE.Vector3(),
        racks:[]};
}
function intactRacks(ship,out){
    out.length=0;
    for(const m of capitalHull(ship).mounts)if(m.kind==='rack'&&ship.capitalMountHull[m.index]>0)out.push(m);
    return out;
}
function dishIntact(ship){
    for(const m of capitalHull(ship).mounts)if(m.kind==='dish')return ship.capitalMountHull[m.index]>0;
    return false;
}
// Top centre of a rack's tube deck in world space.
function rackTop(ship,mount,s,out){
    const side=mount.normal[0];
    return out.set(mount.position[0]-side*mount.hitHalfExtents[0],mount.position[1]+mount.hitHalfExtents[1],mount.position[2])
        .applyQuaternion(s.q).add(s.position);
}
// Fraction of the full lock rate against a target at this speed and
// line-of-sight rate (radians per second). Zero only when the tracker loses it.
export function bargeLockRate(speed,angularRate){
    if(angularRate>=BARGE.lostTrack)return 0;
    const track=Math.min(1,(BARGE.lostTrack-angularRate)/(BARGE.lostTrack-BARGE.fullTrack));
    const over=Math.min(1,Math.max(0,(speed-BARGE.lockFullSpeed)/(BARGE.lockSlowSpeed-BARGE.lockFullSpeed)));
    return track/(1+(BARGE.lockSlowFactor-1)*over);
}
export function bargeWarheadCount(intact){return intact?Math.ceil(BARGE.warheads*intact/6):0;}

function launch(session,ship,s,count,targetId){
    const racks=s.racks;if(!racks.length||!count)return;
    s.up.set(0,1,0).applyQuaternion(s.q);
    let salvo=session.projectileCounter+1,inCanister=0;
    for(let i=0;i<count;i++){
        if(inCanister===BARGE.canister){inCanister=0;salvo=session.projectileCounter+1;s.rackCursor++;}
        const rack=racks[s.rackCursor%racks.length];
        rackTop(ship,rack,s,s.muzzle);
        // Lofted along the tube rake, inside the seeker cone of the target.
        s.shot.copy(s.target).sub(s.muzzle).normalize().addScaledVector(s.up,.25).normalize();
        s.right.crossVectors(s.shot,s.up).normalize();
        const angle=(inCanister+.5)*2*Math.PI/BARGE.canister,spread=BARGE_SWARM.spreadRad;
        s.shot.addScaledVector(s.right,Math.cos(angle)*spread).addScaledVector(s.scratch.crossVectors(s.right,s.shot),Math.sin(angle)*spread).normalize();
        const slot=session.projStore.alloc();
        session.projStore.setPosV(slot,s.muzzle);session.projStore.snapshot?.(slot);
        s.shot.multiplyScalar(BARGE_SWARM.speed).add(s.scratch.fromArray(ship.velocity));
        session.projStore.setVelV(slot,s.shot);
        session.projectiles.push({id:`p-${++session.projectileCounter}`,kind:'missile',ownerId:ship.id,slot,salvo,damage:BARGE_SWARM.damage,life:BARGE_SWARM.life,
            targetId,faction:ship.faction,launcherId:'swarm',hitWeapon:BARGE_SWARM,homingSpeed:BARGE_SWARM.homingSpeed,homingTurn:BARGE_SWARM.homingTurn,
            shield:BARGE_SWARM.projectileShield,acceleration:BARGE_SWARM.acceleration});
        inCanister++;
        if(inCanister===1){
            session.renderer?.spawnMuzzleFlash?.(s.muzzle.x,s.muzzle.y,s.muzzle.z,0xffc04a);
            session.playWorldSound?.('missile',.9,s.muzzle.x,s.muzzle.y,s.muzzle.z);
        }
    }
    s.rackCursor++;
    if(targetId==='player')session.audio?.playCockpit?.('missileLaunch',.9);
}
function resetLock(ship,s,reload,now){
    ship.combatFit.lock=0;ship.combatFit.warned=false;
    if(s.phase==='warning'){s.phase='ready';s.readyAt=now+reload;}
}
// Called from the corvette weapon step with the resolved target point.
export function updateBargeLaunchers(session,ship,dt,targetPosition){
    const s=stateFor(ship),fit=ship.combatFit,now=session.save.world.time;
    const racks=intactRacks(ship,s.racks);
    ship.capitalDisarmed=racks.length===0;
    ship.capitalAttack=s.phase==='warning'?'CHARGING':now<s.salvoUntil?'SALVO':'RECOVERING';
    ship.capitalAttackRemaining=s.phase==='warning'?Math.max(0,s.fireAt-now):0;
    const targetId=ship.targetId;
    const victim=targetId==='player'?session.save.player:session.ships.find(actor=>actor.id===targetId);
    if(!racks.length||!targetPosition||!targetId||!victim||ship.holdFire||ship.pursuitHoldFire||ship.fleeing||ship.patrolMemoryActive
        ||ship.surrendered||ship.poweredDown||ship.captured||targetId==='player'&&!tracksActivePlayer(session,ship)){
        resetLock(ship,s,BARGE.abortReload,now);return;
    }
    s.position.fromArray(ship.position);s.q.fromArray(ship.rotation);s.target.copy(targetPosition);
    s.bearing.copy(s.target).sub(s.position);
    const distance=s.bearing.length();if(distance<1e-6)return;s.bearing.multiplyScalar(1/distance);
    if(distance>BARGE.snapRearm)s.snapArmed=true;
    const launcher=dishIntact(ship)?BARGE_SWARM:BLIND;
    const blocked=session.lineBlocked(s.position,s.target,ship.id);
    if(distance<BARGE.minRange||distance>launcher.lockRange||blocked){resetLock(ship,s,BARGE.abortReload,now);return;}
    const v=victim.velocity,speed=v?Math.hypot(v[0],v[1],v[2]):0;
    // A fast pilot closing inside snap range draws one canister without a lock.
    if(s.snapArmed&&distance<=BARGE.snapRange&&speed>=BARGE.snapSpeed&&s.phase!=='warning'){
        const closing=v?-(v[0]*s.bearing.x+v[1]*s.bearing.y+v[2]*s.bearing.z):0;
        if(closing>0){
            s.snapArmed=false;launch(session,ship,s,Math.min(BARGE.canister,bargeWarheadCount(racks.length)),targetId);
            s.salvoUntil=now+1;fit.lock=0;fit.warned=false;return;
        }
    }
    if(s.phase==='ready'&&now<s.readyAt){fit.lock=0;return;}
    beginRackLock(fit,targetId,'barge',now,dt);
    // Line-of-sight rate from the relative velocity across the bearing.
    s.scratch.fromArray(v??ZERO).sub(s.shot.fromArray(ship.velocity));
    const mobility=bargeLockRate(speed,s.scratch.cross(s.bearing).length()/distance);
    if(s.phase==='warning'){
        // The salvo needs the track to hold through the warning. Crossing the
        // tracker's view too fast breaks it and the racks reload short.
        if(mobility===0){resetLock(ship,s,BARGE.abortReload,now);return;}
        fit.lock=1;
        if(targetId==='player')session.warnPlayerLock?.(t('BARRAGE LAUNCH — BREAK LOCK'),false);
        if(now>=s.flashAt){
            s.flashAt=now+.5;
            for(const rack of racks){rackTop(ship,rack,s,s.muzzle);session.renderer?.spawnMuzzleFlash?.(s.muzzle.x,s.muzzle.y,s.muzzle.z,0xff8a3a);}
        }
        if(now<s.fireAt)return;
        launch(session,ship,s,bargeWarheadCount(racks.length),targetId);
        s.phase='ready';s.readyAt=now+BARGE.every;s.salvoUntil=now+1;fit.lock=0;fit.warned=false;
        ship.capitalRelocateUntil=now+BARGE.relocate;
        return;
    }
    const previous=fit.lock??0;
    fit.lock=rackLockProgress(previous,launcher,ship.pilot?.tier,distance,1,0,dt,mobility);
    // A building lock lights the LOCK lamp (acquiring) while the pilot can still break it.
    fit.warned=fit.lock>0;
    if(fit.lock>0&&targetId==='player')session.warnPlayerLock?.(t('BARRAGE LOCK · CROSS FAST'),!previous);
    if(fit.lock<1)return;
    s.phase='warning';s.fireAt=now+BARGE.warning;s.flashAt=now;
    if(targetId==='player')session.warnPlayerLock?.(t('BARRAGE LAUNCH — BREAK LOCK'),true);
}
