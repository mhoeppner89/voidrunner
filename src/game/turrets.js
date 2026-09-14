import {FRIGATE_CLEARANCE} from './frigateMounts.js';
import { combatTargetEligible } from './combatTargeting.js';
import { disruptionFactor } from './weaponDamage.js';
import * as THREE from 'three';
import {OUTFIT_ITEMS} from './outfitting.js';
import {TURRET_LAYOUTS} from './turretLayouts.js';
import {spendEnergy} from './combatResources.js';
import {WEAPONS,TRACKING_LASER,WEAPON_DAMAGE_SCALE} from './weapons.js';
import {relativeIntercept} from './weaponFlight.js';
import {TURRET_CLEARANCE} from './turretClearance.js';
import {getPdcDefenseChannel,PDC_RECOVERY_SECONDS} from './pdcFireControl.js';
import {npcGunneryProfile} from './npcGunnery.js';
const laser=TRACKING_LASER;
export const PDC_TURRET=Object.freeze({...WEAPONS.pdc,damageFlat:2.2*WEAPON_DAMAGE_SCALE,shotInterval:.14,burstPause:2,interceptInterval:PDC_RECOVERY_SECONDS});
const identity=new THREE.Quaternion();
// Missile positions use Float32 storage; tolerate its rounding at the range edge.
const rangeEpsilon=0.0001;
// The forward sector crosses the mounting plane, but never the owner's hull.
export function clearTurretArc(actor,mount,extents,point,state) {
    const local=state.local.copy(point).sub(state.scratch.fromArray(actor.position)).applyQuaternion(state.inverse);
    const forward=mount.forwardCone && -local.z>local.length()*Math.cos(mount.forwardCone*Math.PI/180);
    if(local.getComponent(mount.axis??1)*mount.side < -1e-6 && !forward)return false;
    const ray=state.scratch.set(local.x-mount.position[0]*extents[0],local.y-mount.position[1]*extents[1],local.z-mount.position[2]*extents[2]);
    const az=Math.atan2(ray.x,-ray.z)*180/Math.PI,el=Math.atan2(ray.y,Math.hypot(ray.x,ray.z))*180/Math.PI;
    if(state.clearance){
        const x=Math.min(71.999999,Math.max(0,(az+180)/5)),y=Math.min(35.999999,Math.max(0,(el+90)/5));
        const ix=Math.floor(x),iy=Math.floor(y),grid=state.clearance;
        const nearest=Math.min(grid[iy*73+ix],grid[iy*73+ix+1],grid[(iy+1)*73+ix],grid[(iy+1)*73+ix+1]);
        return ray.length()<nearest*extents[2]-.01;
    }
    let near=0,far=1;
    for(let axis=0;axis<3;axis++){
        const start=mount.position[axis]*extents[axis],delta=local.getComponent(axis)-start,h=extents[axis];
        if(Math.abs(delta)<1e-9){if(Math.abs(start)>h)return true;continue;}
        let a=(-h-start)/delta,b=(h-start)/delta;if(a>b)[a,b]=[b,a];
        near=Math.max(near,a);far=Math.min(far,b);if(near>far)return true;
    }
    return false;
}
export function shipBlocksRay(session,actor,ownerId,target,point,state) {
    const direction=state.scratch.copy(point).sub(state.position).normalize();
    const distance=point.distanceTo(state.position);
    const blocks=(position,radius)=>{
        const delta=state.local.fromArray(position).sub(state.position),along=delta.dot(direction);
        return along>0 && along<distance && delta.addScaledVector(direction,-along).length()<radius;
    };
    // Include the player when an NPC fires past them at another ship/missile.
    if(ownerId!=='player' && target!==session.save.player && blocks(session.save.player.position,session.playerCollisionRadius()))return true;
    return session.ships.some(other=>other!==actor && other.id!==ownerId && other!==target && other.hull>0 && blocks(other.position,Math.max(...session.npcHullExtents(other))));
}
function selectedHostile(session,actor,ownerId,player) {
    if(actor.capitalClass==='frigate'&&actor.capitalAttack==='RECOVERING')return;
    if(actor.patrolMemoryActive || actor.fleeing || actor.holdFire || actor.pursuitHoldFire || actor.combatPlan?.recovery?.active || (player && actor.mode!=='combat'))return;
    const ref=player?session.getTargetRef():{kind:'ship',id:actor.targetId};
    if(!player && actor.targetId==='player' && actor.hostile && session.save.player.hull>0)return session.save.player;
    if(ref?.kind==='ship')return session.ships.find(s=>s.id===ref.id && combatTargetEligible(s) && (player?s.hostile:session.projectileCanHitShip({ownerId,faction:actor.faction,targetId:actor.targetId},s)));
}
export function updateAutomaticTurrets(session,actor,ownerId,dt) {
    const player=ownerId==='player',fit=player?actor.outfitting?.loadouts?.[actor.shipId]:actor.combatFit;
    const hullId=player?actor.shipId:fit?.hullId,layouts=TURRET_LAYOUTS[hullId]??[],items=fit?.turrets??[];
    if(!items.some(Boolean))return;
    const stats=player?session.playerStats():fit.stats;
    const extents=session.turretHullExtents(actor,ownerId),now=session.save.world.time;
    const assignments=session.pdcAssignments,defense=getPdcDefenseChannel(session,ownerId);
    if(actor.turretRuntime?.[0] && !(actor.turretRuntime[0].position instanceof THREE.Vector3))actor.turretRuntime=[];
    actor.turretRuntime??=[];
    for(const [index,mount] of layouts.entries()) {
        const item=OUTFIT_ITEMS[items[index]];if(!item || actor.capitalMountHull?.[index]<=0)continue;
        const pdc=item.turretKind==='pdc';
        const state=actor.turretRuntime[index]??= {position:new THREE.Vector3(),normal:new THREE.Vector3(),direction:new THREE.Vector3(),goal:new THREE.Vector3(),scratch:new THREE.Vector3(),desired:new THREE.Vector3(),q:new THREE.Quaternion(),turn:new THREE.Quaternion(),inverse:new THREE.Quaternion(),local:new THREE.Vector3(),fireAt:0};
        if(state.itemId!==item.id){state.itemId=item.id;state.burstRemaining=0;state.interceptAt=0;}
        state.clearance=hullId==='concord-frigate'?FRIGATE_CLEARANCE[index]:TURRET_CLEARANCE[hullId]?.[index];
        state.muzzle??=new THREE.Vector3();state.lead??=new THREE.Vector3();
        state.targetPosition??=[0,0,0];state.targetVelocity??=[0,0,0];
        state.phase??=Array.from(ownerId).reduce((hash,c)=>(hash*31+c.charCodeAt(0))>>>0, index+1)%628/100;
        state.q.fromArray(actor.rotation);state.inverse.copy(state.q).invert();
        state.position.set(...mount.position).multiply(state.scratch.fromArray(extents)).applyQuaternion(state.q).add(state.scratch.fromArray(actor.position));
        state.normal.set(0,0,0).setComponent(mount.axis??1,mount.side).applyQuaternion(state.q);
        if(state.direction.lengthSq()<0.1)state.direction.copy(state.normal);
        const disabled=actor.turretsHeld || actor.dockedAt || (player && session.autopilot);
        state.status=disabled?'TURRETS HOLD FIRE':'TURRETS READY';
        let target,point,intercept=false;
        if(!disabled && pdc && now>=defense.readyAt) {
            let nearest=PDC_TURRET.range;
            for(const p of session.projectiles) {
                if((p.kind!=='missile'&&p.kind!=='torpedo')||p.life<=0||p.ownerId===ownerId||p.targetId!==ownerId||(assignments?assignments.get(p.id)?.until:p.pdcAssignedUntil)>now)continue;
                const pos=session.projStore.getPos(p.slot,state.goal),distance=pos.distanceTo(state.position);
                if(distance<=nearest+rangeEpsilon && clearTurretArc(actor,mount,extents,pos,state) && !session.lineBlocked(state.position,pos,ownerId) && !shipBlocksRay(session,actor,ownerId,p,pos,state)){
                    nearest=distance;target=p;
                }
            }
            if(target){point=session.projStore.getPos(target.slot,state.goal);intercept=true;}
        }
        // Reconsider missiles on every simulation step, including burst pauses.
        if(!disabled && !target){target=selectedHostile(session,actor,ownerId,player);if(target)point=state.goal.fromArray(target.position);}
        if(disabled || !target || intercept)state.burstRemaining=0;
        if(!target || disabled)state.targetId=null;
        if(point) {
            const distance=point.distanceTo(state.position);
            const pilot=!player&&!intercept?npcGunneryProfile(actor):undefined;
            let flightTime=0;
            if(pdc){
                const targetVelocity=intercept?session.projStore.getVel(target.slot,state.lead).toArray(state.targetVelocity):target.velocity??[0,0,0];
                flightTime=relativeIntercept(state.position,point.toArray(state.targetPosition),actor.velocity??[0,0,0],targetVelocity,PDC_TURRET.speed,state.lead);
                if(Number.isFinite(flightTime))point.copy(state.position).add(state.lead);
            }
            // Stable angular tracking error changes smoothly: ship evasion matters,
            // while missile solutions retain their precise intercept lead.
            if(!intercept){
                const key=target.id??'player';
                if(state.targetId!==key){state.targetId=key;state.acquireAt=now+(pilot?.turretAcquire??.3);}
                const spread=(pdc ? .020 : .018)*distance*(pilot?.turretError??1);
                const phase=now*2.1+state.phase;
                point.x+=Math.sin(phase)*spread;
                point.y+=Math.sin(phase*1.37+1.2)*spread;
                point.z+=Math.cos(phase*.83)*spread*.5;
            }
            const desired=state.desired.copy(point).sub(state.position).normalize();
            const inArc=(!pdc||flightTime<=PDC_TURRET.life) && distance<=(pdc?PDC_TURRET.range:laser.range)+rangeEpsilon && clearTurretArc(actor,mount,extents,point,state);
            if(inArc) {
                const angle=state.direction.angleTo(desired),step=(pdc?4.5:1.2)*dt*(pilot?.turretTurn??1);
                state.turn.setFromUnitVectors(state.direction,desired);
                state.turn.slerp(identity,1-Math.min(1,step/Math.max(angle,0.0001)));
                state.direction.applyQuaternion(state.turn).normalize();
                const disruption=disruptionFactor(actor,now);
                const cost=(pdc&&!intercept?PDC_TURRET.energyCost:4)*disruption;
                // Ship bursts also leave the energy for one missile intercept.
                const reserve=Math.max(12,stats.energyCapacity*0.25)+(pdc&&!intercept?PDC_TURRET.interceptEnergy:0);
                if(actor.energy<reserve+cost)state.status='TURRETS WAITING FOR ENERGY';
                else if((intercept||now>=state.acquireAt) && state.direction.dot(desired)>Math.cos(0.001) && now>=(intercept?state.interceptAt:state.fireAt) && !session.lineBlocked(state.position,point,ownerId) && !shipBlocksRay(session,actor,ownerId,target,point,state) && spendEnergy(actor,cost)) {
                    const color=player?0xdce9ff:0xff8a5b;
                    state.muzzle.copy(state.position).addScaledVector(state.direction,(pdc ? .94 : .82)*(mount.size==='M'?1.3:1)*extents[2]/mount.hullHalfLength);
                    if(intercept) {
                        state.interceptAt=now+PDC_TURRET.interceptInterval*disruption;
                        defense.readyAt=state.interceptAt;
                        const round=session.spawnGunProjectile(ownerId,PDC_TURRET,state.muzzle,state.direction,actor.velocity??[0,0,0],undefined,`${ownerId}-turret-${index}`);
                        if(round){
                            round.targetMissile=target;
                            if(assignments)assignments.set(target.id,{defenderId:`${ownerId}-turret-${index}`,until:now+flightTime+.12,round});
                            else target.pdcAssignedUntil=now+flightTime+.12;
                        }
                    } else if(pdc) {
                        if(!state.burstRemaining)state.burstRemaining=PDC_TURRET.burstSize;
                        state.burstRemaining--;
                        state.fireAt=now+(state.burstRemaining?PDC_TURRET.shotInterval:PDC_TURRET.burstPause)*disruption;
                        session.spawnGunProjectile(ownerId,PDC_TURRET,state.muzzle,state.direction,actor.velocity??[0,0,0],target.id??'player',`${ownerId}-turret-${index}`);
                    } else {
                        state.fireAt=now+0.7*disruption;
                        session.fireBeam(ownerId,laser,state.muzzle,state.direction,`${ownerId}-turret-${index}`);
                    }
                    session.renderer.spawnMuzzleFlash?.(state.muzzle.x,state.muzzle.y,state.muzzle.z,pdc?color:0x7cffff);
                    if(pdc && now>=(state.soundAt??0)){
                        const offset=state.scratch.fromArray(actor.position).sub(state.local.fromArray(session.save.player.position));
                        const distance=offset.length();offset.applyQuaternion(state.turn.fromArray(session.save.player.rotation).invert());
                        session.audio?.playAtDirection?.('pdc',0.25,distance,offset.x);
                        state.soundAt=now+0.2;
                    }
                }
            }
        }
        // When banking carries a held barrel into the deck, retract its aim
        // outward. The base remains attached to the hull throughout the turn.
        state.goal.copy(state.position).addScaledVector(state.direction,1.1*(mount.size==='M'?1.3:1)*extents[2]/mount.hullHalfLength);
        if(!clearTurretArc(actor,mount,extents,state.goal,state))state.direction.copy(state.normal);
        session.renderer.showTurret?.(`${ownerId}-${index}`,state.position,state.direction,mount.size,pdc?'pdc':'laser',state.q,mount.side,mount.pedestal,extents[2]/mount.hullHalfLength,mount.axis??1,actor);
    }
}
