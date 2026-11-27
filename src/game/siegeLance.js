// The beam and shot share the same world-space ray. Once the cue sounds,
// neither the target’s movement nor drift of the firing ship moves that ray.
import * as THREE from 'three';
import {t} from './i18n.js';

export const LANCE=Object.freeze({id:'lance',kind:'gauss',range:1600,damageFlat:150,tint:0xfff1cf});
const blindLance={...LANCE,range:1000};
export function updateSiegeLance(session,ship,target){
    const now=session.save.world.time,fit=ship.combatFit;
    const s=ship.lance??={origin:new THREE.Vector3(),direction:new THREE.Vector3(),end:new THREE.Vector3(),relative:new THREE.Vector3(),rotation:new THREE.Quaternion(),readyAt:0};
    const weapon=ship.capitalMountHull[1]>0?LANCE:blindLance;
    ship.capitalDisarmed=ship.capitalMountHull[0]<=0;
    const disabled=ship.capitalDisarmed||ship.holdFire||ship.pursuitHoldFire||ship.patrolMemoryActive||ship.fleeing||ship.poweredDown||ship.surrendered||ship.captured;
    const lost=(!target||!ship.targetId||s.target!==ship.targetId)&&!s.frozen;
    if(disabled||lost){
        s.active=s.frozen=false;s.target=ship.targetId;ship.lanceGlow=0;ship.lanceCoils=0;s.flashUntil=0;fit.lock=0;ship.capitalAttack='RECOVERING';
        if(disabled||!target||!ship.targetId)return;
    }
    if(now<s.readyAt){
        ship.lanceCoils=now<s.flashUntil?6:0;
        return;
    }
    if(!s.frozen){
        s.rotation.fromArray(ship.rotation);
        s.origin.set(0,0,-32).applyQuaternion(s.rotation).add(s.relative.fromArray(ship.position));
        s.direction.set(0,0,-1).applyQuaternion(s.rotation);
        s.relative.copy(target).sub(s.origin);
        if(!s.active&&(s.relative.length()>weapon.range||s.relative.normalize().dot(s.direction)<.9998||session.lineBlocked(s.origin,target,ship.id)))return;
    }
    if(!s.active){
        s.active=true;s.starts=now;s.frozen=false;
        session.playWorldSound?.('lance-charge',1,...ship.position);
    }
    const elapsed=now-s.starts+1e-9;
    ship.lanceCoils=Math.min(6,Math.floor(elapsed*2));
    ship.capitalAttack='CHARGING';ship.lanceGlow=Math.min(1,elapsed/3);
    ship.capitalAttackRemaining=Math.max(0,3-elapsed);
    if(!s.frozen&&elapsed>=3-(weapon===LANCE?1.5:2)){
        s.frozen=true;
        if(s.target==='player'&&!session.arena?.observer){
            session.ui.flashBreakCue?.();
            session.audio?.playCockpit?.('lance-freeze');
        }
    }
    if(s.target==='player'){
        fit.lockTarget='player';fit.lockCheckedAt=now;fit.lock=s.frozen?1:Math.max(.01,ship.lanceGlow);fit.warned=true;
        session.warnPlayerLock?.(t('LANCE LOCK'),now===s.starts);
    }
    s.end.copy(s.origin).addScaledVector(s.direction,weapon.range);
    if(elapsed<3){
        const color=s.frozen?0xffffff:0xffaa45;
        session.renderer.showCapitalCharge?.(s.glowKey??=ship.id+'-lance',s.origin,.3+ship.lanceGlow,ship,color,false);
        session.renderer.showCombatBeam?.(s.key??=ship.id+'-aim',s.origin,s.end,color,undefined,.09,s.frozen?6:2+ship.lanceGlow*(3+Math.sin(now*45)),session.save.player);
        return;
    }
    if(session.fireBeam(ship.id,weapon,s.origin,s.direction,'rail')===false){
        // The ally may stay in the lane. Drop the charge and telegraph the retry.
        ship.lanceCoils=0;s.readyAt=now+1;
    }else{
        s.flashUntil=now+.10;
        session.playWorldSound?.('lance-fire',1,...ship.position);
        ship.capitalRelocateUntil=now+5;s.readyAt=now+12;
    }
    s.active=s.frozen=false;ship.lanceGlow=0;ship.capitalAttack='RECOVERING';fit.lock=0;
}
