// Red Njord Barrage launcher racks. Missile artillery: speed only slows its
// lock (full rate up to 50, four times slower from 100). What breaks it is
// line-of-sight rate: the fire-control tracker cannot follow a pilot crossing
// its view fast enough, so the defence is a hard pass across the bearing, and
// closer in the same speed crosses faster. Each salvo is announced three
// seconds ahead (CHARGING on the target monitor, LOCK lamp, rack flashes);
// nothing fires inside BARGE.minRange. A pilot who rushes it fast still draws
// one snap volley per approach, which the normal break cue lets them dodge.
// Allocation-free per step: one scratch record per barge.
import * as THREE from 'three';
import {fieldRackProgress} from './picketField.js';
import {beginRackLock,relativeIntercept} from './weaponFlight.js';
import {capitalHull} from './capitalHulls.js';
import {tracksActivePlayer} from './combatTargeting.js';
import {t} from './i18n.js';

export const BARGE=Object.freeze({
    every:15, warning:3, ripple:.15, snapCount:3,
    lockTime:4, lockRange:1200, minRange:250,
    snapRange:600, snapRearm:800, snapSpeed:45, abortReload:5,
    // Lock rate against target speed: full up to 50, a quarter from 100 on.
    lockFullSpeed:50, lockSlowSpeed:100, lockSlowFactor:4,
    // Tracker limit (line-of-sight rate): full rate up to 3°/s, lost at 6°/s.
    fullTrack:3*Math.PI/180, lostTrack:6*Math.PI/180,
    // After a full salvo the barge relocates at full speed for this long.
    relocate:6,
});
// Pirate fire control: one re-lead at correctAt of the flight, turning at
// most correctTurn, then straight again; the BREAK cue follows that update.
export const FLAK=Object.freeze({id:'flak',speed:90,damage:45,radius:70,minimum:10,
    proximity:45,spread:6*Math.PI/180,jitter:.4,correctAt:.4,correctTurn:10*Math.PI/180,lockRange:BARGE.lockRange,lockTime:BARGE.lockTime});
const BLIND=Object.freeze({...FLAK,lockRange:BARGE.lockRange/2,lockTime:BARGE.lockTime*2});

const ZERO=[0,0,0];
function stateFor(ship){
    return ship.bargeLaunch??={phase:'ready',readyAt:0,fireAt:0,salvoUntil:0,flashAt:0,snapArmed:true,queue:[],cursor:0,
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
// Each tube uses the pilot's current course once, at ignition. A target
// outrunning the solution leaves a timed burst on the last reachable bearing.
function fireNext(session,ship,s,victim){
    while(s.cursor<s.queue.length){
        const rack=s.queue[s.cursor++];
        if(ship.capitalMountHull[rack.index]<=0)continue;
        rackTop(ship,rack,s,s.muzzle);
        let time=relativeIntercept(s.muzzle,victim.position,ZERO,victim.velocity,FLAK.speed,s.shot);
        if(!Number.isFinite(time)){
            s.shot.copy(s.target).sub(s.muzzle);time=s.shot.length()/FLAK.speed;
        }
        s.shot.normalize();
        s.up.set(0,Math.abs(s.shot.y)<.9?1:0,Math.abs(s.shot.y)<.9?0:1);
        s.right.crossVectors(s.shot,s.up).normalize();s.up.crossVectors(s.right,s.shot);
        const angle=Math.random()*2*Math.PI,radius=Math.sqrt(Math.random())*Math.tan(FLAK.spread);
        s.shot.addScaledVector(s.right,radius*Math.cos(angle)).addScaledVector(s.up,radius*Math.sin(angle)).normalize().multiplyScalar(FLAK.speed);
        const fuseJitter=(2*Math.random()-1)*FLAK.jitter;
        const slot=session.projStore.alloc(),life=Math.max(.01,time+fuseJitter);
        session.projStore.setPosV(slot,s.muzzle);session.projStore.snapshot?.(slot);session.projStore.setVelV(slot,s.shot);
        const salvo=s.volley;
        salvo.interceptTime??=time;
        // Remaining time at which BREAK sounds: just after the mid-course re-lead.
        salvo.cueAt??=time*(1-FLAK.correctAt)-.2;
        session.projectiles.push({id:`p-${++session.projectileCounter}`,kind:'missile',launcherId:'flak',ownerId:ship.id,slot,
            salvo:salvo.id,flakVolley:salvo,life,damage:FLAK.damage,hitWeapon:FLAK,faction:ship.faction,targetId:ship.targetId,
            arenaSide:ship.arenaRunEnemy,threatensPilot:ship.hostile||ship.targetId==='player',flightTime:life,fuseJitter,correctAt:time*FLAK.correctAt,wobblePhase:angle,
            wobbleX:s.right.x,wobbleY:s.right.y,wobbleZ:s.right.z});
        session.renderer?.spawnMuzzleFlash?.(s.muzzle.x,s.muzzle.y,s.muzzle.z,0xff8532);
        session.playWorldSound?.('flak-launch',1,s.muzzle.x,s.muzzle.y,s.muzzle.z);
        s.nextAt+=BARGE.ripple;
        break;
    }
}
function launch(session,ship,s,count,victim,now){
    s.queue.length=0;
    for(let i=0;i<count;i++)s.queue.push(s.racks[i]);
    s.cursor=0;s.nextAt=now;s.volley={id:session.projectileCounter+1,targetId:ship.targetId,cued:false};
    fireNext(session,ship,s,victim);
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
        s.queue.length=0;resetLock(ship,s,BARGE.abortReload,now);return;
    }
    s.position.fromArray(ship.position);s.q.fromArray(ship.rotation);s.target.copy(targetPosition);
    s.bearing.copy(s.target).sub(s.position);
    const distance=s.bearing.length();if(distance<1e-6)return;s.bearing.multiplyScalar(1/distance);
    if(distance>BARGE.snapRearm)s.snapArmed=true;
    const launcher=dishIntact(ship)?FLAK:BLIND;
    const blocked=session.lineBlocked(s.position,s.target,ship.id);
    if(distance<BARGE.minRange||distance>launcher.lockRange||blocked){s.queue.length=0;resetLock(ship,s,BARGE.abortReload,now);return;}
    if(s.cursor<s.queue.length){
        if(s.volley.targetId!==targetId)s.queue.length=0;
        else if(now+1e-8>=s.nextAt)fireNext(session,ship,s,victim);
        return;
    }
    const v=victim.velocity,speed=v?Math.hypot(v[0],v[1],v[2]):0;
    // A fast pilot closing inside snap range draws one volley without a lock.
    if(s.snapArmed&&distance<=BARGE.snapRange&&speed>=BARGE.snapSpeed&&s.phase!=='warning'){
        const closing=v?-(v[0]*s.bearing.x+v[1]*s.bearing.y+v[2]*s.bearing.z):0;
        if(closing>=BARGE.snapSpeed){
            s.snapArmed=false;launch(session,ship,s,Math.min(BARGE.snapCount,racks.length),victim,now);
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
        if(mobility===0){s.queue.length=0;resetLock(ship,s,BARGE.abortReload,now);return;}
        fit.lock=1;
        if(targetId==='player')session.warnPlayerLock?.(t('BARRAGE LAUNCH — BREAK LOCK'),false);
        if(now>=s.flashAt){
            s.flashAt=now+.5;
            for(const rack of racks){rackTop(ship,rack,s,s.muzzle);session.renderer?.spawnMuzzleFlash?.(s.muzzle.x,s.muzzle.y,s.muzzle.z,0xff8a3a);}
        }
        if(now<s.fireAt)return;
        launch(session,ship,s,racks.length,victim,now);
        s.phase='ready';s.readyAt=now+BARGE.every;s.salvoUntil=now+1;fit.lock=0;fit.warned=false;
        ship.capitalRelocateUntil=now+BARGE.relocate;
        return;
    }
    const previous=fit.lock??0;
    fit.lock=fieldRackProgress(session,ship,victim,fit,previous,launcher,ship.pilot?.tier,distance,1,0,dt,mobility);
    // A building lock lights the LOCK lamp (acquiring) while the pilot can still break it.
    fit.warned=fit.lock>0;
    if(fit.lock>0&&targetId==='player')session.warnPlayerLock?.(t('BARRAGE LOCK · CROSS FAST'),!previous);
    if(fit.lock<1)return;
    s.phase='warning';s.fireAt=now+BARGE.warning;s.flashAt=now;
    if(targetId==='player')session.warnPlayerLock?.(t('BARRAGE LAUNCH — BREAK LOCK'),true);
}
