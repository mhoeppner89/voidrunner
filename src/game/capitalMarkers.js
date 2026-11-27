import * as THREE from 'three';
import {capitalHull} from './capitalHulls.js';
import {segmentShipColliderHit} from './shipCollision.js';
import {CAPITAL_MARKER_COUNT} from './capitalMarkerCount.js';

// One target owns this cache. The fractional budget visits each mount five times
// per second. Changing target starts concealed until each sightline is measured.
export class CapitalMarkers {
    entries=Array.from({length:CAPITAL_MARKER_COUNT},()=>({point:new THREE.Vector3(),screen:{},clear:false,alpha:0,opacity:0}));
    center=new THREE.Vector3();
    normal=new THREE.Vector3();
    rotation=new THREE.Quaternion();
    towardCamera=new THREE.Vector3();
    origin=[0,0,0];
    orientation=[0,0,0,1];
    update(ship,camera,dt,selected,rendered){
        if(ship!==this.ship){
            this.ship=ship;this.cursor=0;this.credit=1;
            for(const e of this.entries){e.alpha=e.opacity=0;e.clear=false;}
        }
        if(!ship)return 0;
        const mounts=capitalHull(ship).mounts;
        if(rendered){this.center.copy(rendered.position);this.rotation.copy(rendered.quaternion);}
        else{this.center.fromArray(ship.position);this.rotation.fromArray(ship.rotation);}
        this.center.toArray(this.origin);this.rotation.toArray(this.orientation);
        const fade=Math.min(1,(2000-camera.distanceTo(this.center))/500);
        this.credit=Math.min(mounts.length,this.credit+dt*5*mounts.length);
        const checks=Math.min(4,Math.floor(this.credit));
        for(const m of mounts){
            const e=this.entries[m.index];
            e.diamond=m.targetable;
            e.point.fromArray(m.markerPosition).applyQuaternion(this.rotation).add(this.center);
            const facing=this.towardCamera.subVectors(camera,e.point).dot(this.normal.fromArray(m.normal).applyQuaternion(this.rotation))>0;
            e.eligible=fade>0&&m.index!==selected&&ship.capitalMountHull[m.index]>0;
            e.facing=facing;
            if(!facing||!e.eligible)e.clear=false;
        }
        for(let i=0;i<checks;i++){
            const e=this.entries[this.cursor];
            if(e.eligible&&e.facing){
                const hit=segmentShipColliderHit(camera,e.point,this.origin,this.orientation,ship.collisionVariant??ship.variant,2,0,undefined,ship.rotorAngle);
                e.clear=hit===undefined||((1-hit)*camera.distanceTo(e.point)<.15);
            }
            this.cursor=(this.cursor+1)%mounts.length;
        }
        this.credit-=checks;
        for(let i=0;i<mounts.length;i++){
            const e=this.entries[i];
            e.alpha=e.eligible?THREE.MathUtils.clamp(e.alpha+(e.clear?dt:-dt)/.15,0,1):0;
            e.opacity=e.alpha*Math.max(0,fade)*.7;
        }
        return mounts.length;
    }
}
