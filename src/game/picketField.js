// Tacita's field follows its mast through rolls. Test the shooter’s allegiance
// once for both ends of a lock, including locks on the picket itself.
import * as THREE from 'three';
import {factionsOpposed} from './factions.js';
import {capitalMountPosition} from './capitalHulls.js';
import {rackLockProgress,rackLockSeconds} from './weaponFlight.js';
import {hashString,mulberrySample} from './random.js';

export function advancePicketRotor(ship,time,dt,seed){
    const phase=ship.rotorPhase??=mulberrySample(hashString(ship.capitalSpawnKey??ship.id,seed))*Math.PI*2;
    const online=ship.capitalMountHull[0]>0;
    const sampleTime=online?time:(ship.ecmStoppedAt??=time-dt);
    const angle=phase+sampleTime*Math.PI/6;
    ship.prevRotorAngle=ship.rotorAngle??(online?phase+(time-dt)*Math.PI/6:angle);
    ship.rotorAngle=angle;
}

export function picketDishTilt(ship){
    return ship.capitalMountHull[0]>0?0:25*Math.PI/180;
}

export const ECM_RADIUS=400;
const centre=new THREE.Vector3();

// Neutral traffic does not suffer hostile ECM, but can take a stray rail hit.
export function capitalRelation(session,capital,actor){
    if(!actor)return 0;
    if(actor===capital)return 1;
    if(capital.observerTeam&&actor.observerTeam)return capital.observerTeam===actor.observerTeam?1:-1;
    if(actor===session.save.player||actor.arenaRunWingman||actor.tutorialCompanion)return capital.hostile?-1:1;
    if(capital.arenaRunEnemy)return actor.arenaRunEnemy?1:-1;
    if(capital.targetId===actor.id||actor.targetId===capital.id||factionsOpposed(capital.faction,actor.faction))return -1;
    return capital.faction===actor.faction?1:0;
}
function inside(point){
    if(!point)return false;
    const dx=(point.x??point[0])-centre.x,dy=(point.y??point[1])-centre.y,dz=(point.z??point[2])-centre.z;
    return dx*dx+dy*dy+dz*dz<=ECM_RADIUS*ECM_RADIUS;
}
function threatensPatrol(session,picket,actor,target){
    if(target===picket||target?.convoyLeader===picket)return true;
    if(!actor)return false;
    const id=actor===session.save.player?'player':actor.id;
    return capitalRelation(session,picket,actor)<0 ||
        (picket.combatThreatId===id&&picket.combatThreatUntil>session.save.world.time);
}
export function jammed(session,actor,point,other,target){
    for(const picket of session.ships){
        if(picket.variant!=='picket'||picket.hull<=0||picket.capitalMountHull[0]<=0||!threatensPatrol(session,picket,actor,target))continue;
        capitalMountPosition(picket,0,centre);
        if(inside(point)||inside(other))return true;
    }
    return false;
}
export function lockJammed(session,actor,target){
    return jammed(session,actor,actor.position,target?.position,target);
}
export function ordnanceEnemy(session,capital,round){
    if(round.targetId===capital.id)return true;
    let target,owner=round.ownerId==='player'?session.save.player:undefined;
    for(const ship of session.ships){
        if(ship.id===round.targetId)target=ship;
        if(ship.id===round.ownerId)owner=ship;
    }
    return threatensPatrol(session,capital,owner,target)||(!owner&&factionsOpposed(capital.faction,round.faction));
}
export function jammedRound(session,round,position){
    for(const p of session.ships){
        if(p.variant!=='picket'||p.hull<=0||p.capitalMountHull[0]<=0)continue;
        capitalMountPosition(p,0,centre);
        if(inside(position)&&ordnanceEnemy(session,p,round))return true;
    }
    return false;
}
// Count elapsed acquisition time in units of an ordinary lock at the current
// aspect and pilot tier. A fully settled track can be held without a deadline.
export function fieldRackProgress(session,actor,target,record,before,launcher,tier,distance,alignment,aspect,dt,mobility){
    if(!before)record.lockAge=0;
    const interference=lockJammed(session,actor,target);
    const next=rackLockProgress(before,launcher,tier,distance,alignment,aspect,dt,mobility*(interference ? .5 : 1));
    if(before<1||next<1){
        const seconds=rackLockSeconds(launcher,tier,aspect);
        record.lockAge=(record.lockAge??0)+dt/seconds;
        if(interference&&record.lockAge>2+1e-8+(next===1?dt/seconds:0))return 0;
    }
    return next;
}
function outsideScreen(a,b){
    const dx=a[0]-b[0],dy=a[1]-b[1],dz=a[2]-b[2];
    return dx*dx+dy*dy+dz*dz>350*350;
}
export function leavingScreen(escort,target){
    const p=escort.convoyLeader;
    if(p?.variant!=='picket'||p.hull<=0||!target)return false;
    return outsideScreen(escort.position,p.position)&&outsideScreen(target,p.position);
}
