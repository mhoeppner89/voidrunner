import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { t } from './i18n.js';
export const COMBAT_DRIVE_RECOVERY = 12;
export const PIRATE_ARRIVAL_MIN = 700;
export const PLAYER_RADAR_RANGE = 2000;
export function driveRecoveryRemaining(session) {
    return Math.max(0,(session.combatDriveReadyAt??0)-session.save.world.time);
}
// Capture only pursuers that can observe this departure, never every hostile in the sector.
export function prepareLocalPursuit(session) {
    if(session.localPursuitPrepared || session.arena)return;
    session.localPursuitPrepared=true;
    const p=new THREE.Vector3(...session.save.player.position);
    let count=0;
    for(const ship of session.ships) {
        if(ship.hull<=0||!ship.hostile||ship.capitalClass||ship.surrendered||ship.poweredDown||ship.fleeing||ship.combatPlan?.recovery?.active||ship.jumpPursuit)continue;
        if(ship.targetId!=='player'||(ship.playerAwareness??0)<.52)continue;
        const at=new THREE.Vector3(...ship.position);
        if(at.distanceTo(p)>1200||session.lineBlocked(at,p,ship.id))continue;
        ship.jumpPursuit={arrivalAt:null};
        session.renderer?.spawnHyperdriveStreak?.(ship.position,ship.velocity,0xf0b66b);
        count++;
    }
    if(count)session.setMonitorStatus(t('PURSUIT · HOSTILES FOLLOWING'),4000);
}
export function updateLocalPursuit(session) {
    const time=session.save.world.time;
    let index=0;
    for(const ship of session.ships) {
        const jump=ship.jumpPursuit;if(!jump||ship.hull<=0)continue;
        if(session.autopilot)continue;
        if(jump.arrivalAt===null) {
            const player=session.save.player.position,nav=LOCATIONS[session.save.player.navTargetId];
            const outward=new THREE.Vector3(...player).sub(new THREE.Vector3(...nav.position)).normalize();
            if(outward.lengthSq()<.01)outward.set(0,0,1);
            const side=new THREE.Vector3(outward.z,0,-outward.x).normalize();
            const at=new THREE.Vector3(...player).addScaledVector(outward,500+index*70).addScaledVector(side,(index%2?1:-1)*100);
            const obstacles=session.activeFieldObstacles?.(nav.id)??[];
            const clearance=session.npcHullExtents?Math.max(...session.npcHullExtents(ship))+8:24;
            let clear=true;
            if(obstacles.length){
                clear=false;
                for(let attempt=0;attempt<16;attempt++){
                    if(session.entryPositionClear(at,obstacles,clearance)){clear=true;break;}
                    at.addScaledVector(outward,100);
                }
            }
            if(!clear){delete ship.jumpPursuit;continue;}
            // Arrival is fixed now: moving behind cover does not drag pursuers to the player.
            jump.position=at.toArray();jump.target=[...player];jump.arrivalAt=time+3.5+index*.75;
            session.combatDriveReadyAt=Math.max(session.combatDriveReadyAt??0,time+COMBAT_DRIVE_RECOVERY);
            index++;
        }
        if(time<jump.arrivalAt)continue;
        for(let i=0;i<3;i++){ship.position[i]=jump.position[i];ship.velocity[i]=0;if(ship.prevPosition)ship.prevPosition[i]=ship.position[i];}
        ship.lastResolvedPlayer=jump.target;ship.playerIntelPosition=jump.target;ship.destination=jump.target;
        if(ship.task?.kind==='hunt')ship.task.anchor=jump.target;
        ship.attackPhase='approach';ship.targetId='player';ship.playerAwareness=.65;
        ship.arrivalSignatureUntil=time+12;ship.pursuitLeaseUntil=time+45;
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...jump.target).sub(new THREE.Vector3(...ship.position)).normalize()).toArray(ship.rotation);
        if(ship.prevRotation)for(let i=0;i<4;i++)ship.prevRotation[i]=ship.rotation[i];
        session.renderer?.spawnHyperdriveStreak?.(ship.position,jump.target.map((v,i)=>v-ship.position[i]),0xf0b66b);
        delete ship.jumpPursuit;
        session.setMonitorStatus(t('PURSUERS ARRIVING'),2600);
    }
    if(!session.autopilot)session.localPursuitPrepared=false;
}
