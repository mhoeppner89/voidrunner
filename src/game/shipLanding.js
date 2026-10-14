import * as THREE from 'three';
import {STATION_DOCKS} from './stationDocks.js';
import {stationBerth} from './stationTraffic.js';
import {shipVsStation,SHIP_COLLIDERS,PLAYER_CONTACT_SCALE} from './shipCollision.js';
import {playerShipVariant} from './voxelModels.js';
import {playerBerths} from './playerDocking.js';
const forward=new THREE.Vector3(0,0,-1);
const fittedBerths=new WeakMap(),fitPosition=new THREE.Vector3(),fitDirection=new THREE.Vector3(),fitRotation=new THREE.Quaternion(),fitContact={};
function routeFits(berth,variant,scale,collider){
    fitDirection.set(berth.pad[0]-berth.gate[0],berth.pad[1]-berth.gate[1],berth.pad[2]-berth.gate[2]).normalize();
    for(let facing=0;facing<2;facing++){
        fitRotation.setFromUnitVectors(forward,fitDirection);if(facing)fitRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
        for(let i=0;i<=60;i++){const t=i/60;fitPosition.set(berth.gate[0]+(berth.pad[0]-berth.gate[0])*t,berth.gate[1]+(berth.pad[1]-berth.gate[1])*t,berth.gate[2]+(berth.pad[2]-berth.gate[2])*t);
            if(shipVsStation(fitPosition,fitRotation,variant,scale,collider,fitContact))return false;
        }
    }return true;
}
// Cold route validation when a hull/station is selected. Keep safe authored
// pads; move a obstructed touchdown a few metres outward before rejecting it.
// Cached by collider and hull, never repeated in the flight loop.
export function fittedPlayerBerths(id,variant,collider){
    const profile=SHIP_COLLIDERS[variant],height=profile.extent[1]*PLAYER_CONTACT_SCALE;
    if(!collider)return playerBerths(id,height);
    let cache=fittedBerths.get(collider);if(!cache)fittedBerths.set(collider,cache=new Map());if(cache.has(variant))return cache.get(variant);
    const accepted=[];
    for(const authored of playerBerths(id,height)){
        if(routeFits(authored,variant,PLAYER_CONTACT_SCALE,collider)){accepted.push(authored);continue;}
        fitDirection.set(authored.gate[0]-authored.pad[0],0,authored.gate[2]-authored.pad[2]).normalize();const dx=fitDirection.x,dz=fitDirection.z;
        let fit;
        for(const shift of [2,4,8,12]){
            const b={...authored,pad:[authored.pad[0]+dx*shift,authored.pad[1],authored.pad[2]+dz*shift]};
            if(routeFits(b,variant,PLAYER_CONTACT_SCALE,collider)){b.surface=[b.pad[0],b.pad[1]-height,b.pad[2]];fit=b;break;}
        }
        if(fit)accepted.push(fit);
    }
    if(!accepted.length){
        // A large hull may not fit the small perimeter pads. Use a real central
        // traffic berth, reserved from NPCs while the player lands/departs.
        for(let lane=0;lane<STATION_DOCKS[id].lanes.length;lane++){
            const b=stationBerth(id,lane,height),padIndex=(STATION_DOCKS[id].playerPads?.length??0)+lane;
            Object.assign(b,{id,height,padIndex,padId:`${id}-traffic-${lane}`,label:`PAD ${String(lane+1).padStart(2,'0')}`,sharedNpcLaneIndex:lane,captureRadius:18,corridorRadius:24,surface:[b.pad[0],b.pad[1]-height,b.pad[2]]});
            if(routeFits(b,variant,PLAYER_CONTACT_SCALE,collider))accepted.push(b);
        }
    }
    cache.set(variant,accepted);return accepted;
}

export function fitSessionPlayerBerths(session,id){
 const collider=session.renderer?.stationColliders?.get(id);
 return collider?fittedPlayerBerths(id,playerShipVariant(session.save.player.shipId),collider):playerBerths(id,session.playerHullExtents()[1]);
}
