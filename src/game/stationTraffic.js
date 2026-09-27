import * as THREE from 'three';
import { LOCATIONS } from './data.js';
import { STATION_DOCKS } from './stationDocks.js';

// Station GLBs are normalized to a 100-unit source radius before the root is
// scaled. Keep guidance thresholds on the same visible hull edge as the model.
export function stationVisualSurfaceRadius(id) {
    const location = LOCATIONS[id];
    if (!location || location.kind !== 'station') return 0;
    return location.radius * (id === 'blackglass' ? .2 : .95);
}

// The same model transform as render.ensureStationModels, including Blackglass's moon offset.
function berthFromSpec(id, laneSpec, height = 2, radialGate = false) {
    const spec = STATION_DOCKS[id], location = LOCATIONS[id];
    if (!spec || !location || !laneSpec) return null;
    const [x,y,z,,length] = laneSpec;
    const scale = location.radius * (id === 'blackglass' ? .2 : .95) / spec.radius;
    const pad = [location.position[0]+x*scale, location.position[1]+(z+(id==='cairn'?.12:0))*scale+height+.25,
        location.position[2]+(-y+length*.28)*scale+(id==='blackglass'?location.radius*.835:0)];
    let gate;
    if (radialGate) {
        const dx = pad[0] - location.position[0], dy = pad[1] - location.position[1], dz = pad[2] - location.position[2];
        const radius = Math.hypot(dx,dy,dz) || 1;
        const approach = spec.approachVector;
        const gateRadius = approach
            ? Math.max(radius + 100, stationVisualSurfaceRadius(id) + 120)
            : Math.max(radius + 100, location.radius * 1.15 + 100);
        if (approach) {
            // Convert Blender's Z-up vector into the runtime's Y-up frame.
            // Keeping the berth's perpendicular offset preserves its authored
            // deck height, so a hangar route passes through its door instead
            // of below it.
            const axis = [approach[0], approach[2], -approach[1]];
            const axisLength = Math.hypot(...axis) || 1;
            for (let i = 0; i < 3; i++) axis[i] /= axisLength;
            const relative = [dx, dy, dz];
            const along = relative[0] * axis[0] + relative[1] * axis[1] + relative[2] * axis[2];
            const perpendicular = relative.map((value, i) => value - axis[i] * along);
            const perpendicularSq = perpendicular[0] ** 2 + perpendicular[1] ** 2 + perpendicular[2] ** 2;
            const gateAlong = Math.sqrt(Math.max(0, gateRadius ** 2 - perpendicularSq));
            gate = perpendicular.map((value, i) => location.position[i] + value + axis[i] * gateAlong);
        }
        else {
            gate = [location.position[0] + dx / radius * gateRadius,
                location.position[1] + dy / radius * gateRadius,
                location.position[2] + dz / radius * gateRadius];
        }
    } else {
        gate = [...pad];
        gate[1] += Math.max(12,height*3);
        gate[2] = Math.max(pad[2]+100,location.position[2]+location.radius*1.15+100);
    }
    return {pad,gate};
}
export function stationBerth(id, lane = 0, height = 2) {
    const spec = STATION_DOCKS[id];
    return berthFromSpec(id, spec?.lanes[lane], height);
}
export function stationPlayerBerths(id, height = 2) {
    const spec = STATION_DOCKS[id];
    return (spec?.playerPads ?? spec?.lanes ?? []).map((padSpec, padIndex) => ({
        ...berthFromSpec(id, padSpec, height, true),
        padIndex,
        padId: `${id}-pad-${String(padIndex + 1).padStart(2, '0')}`,
        label: `PAD ${String(padIndex + 1).padStart(2, '0')}`,
    }));
}
const approaches = new Map();
export function stationApproach(id) {
    if (!STATION_DOCKS[id]) return undefined;
    if (!approaches.has(id)) approaches.set(id,stationBerth(id).gate);
    return approaches.get(id);
}

export function reserveStationDock(session,ship,id,departing=false) {
    const spec=STATION_DOCKS[id];
    if(!spec || ship.capitalClass || ship.hostile || ship.captured || ship.poweredDown)return false;
    const lane=spec.lanes.findIndex((_,i)=>!session.ships.some(s=>s!==ship&&s.hull>0&&s.stationDock?.id===id&&s.stationDock.lane===i));
    if(lane<0){ship.stationQueue=id;return false;}
    delete ship.stationQueue;
    const height=session.npcHullExtents(ship)[1];
    const berth=stationBerth(id,lane,height);
    ship.stationDock={id,lane,...berth,phase:departing?'docked':'align',elapsed:0};
    if(departing) {
        for(let i=0;i<3;i++){ship.position[i]=berth.pad[i];ship.velocity[i]=0;}
        ship.rotation.splice(0,4,0,0,0,1);
        ship.stationDock.until=session.save.world.time+6;
    }
    return true;
}
const rotation=new THREE.Quaternion(),goal=new THREE.Quaternion();
function segment(ship,phase,to,duration) {
    const dock=ship.stationDock;
    dock.phase=phase;dock.from=[...ship.position];dock.to=to;dock.elapsed=0;dock.duration=duration;
}
function move(ship,dt) {
    const d=ship.stationDock;
    d.elapsed=Math.min(d.duration,d.elapsed+dt);
    const t=d.elapsed/d.duration,blend=t*t*t*(10+t*(-15+6*t));
    for(let i=0;i<3;i++) {const next=d.from[i]+(d.to[i]-d.from[i])*blend;ship.velocity[i]=(next-ship.position[i])/dt;ship.position[i]=next;}
    return t>=1;
}
// Docking guidance owns actual entity transforms; there is no second decorative ship.
export function updateStationDock(session,ship,dt) {
    const d=ship.stationDock;
    if(!d)return false;
    if(ship.captured||ship.poweredDown){delete ship.stationDock;return false;}
    ship.burning=false;
    // Emergency departure stays in the clear lane before combat takes over.
    if(ship.hostile && d.phase==='docked')d.until=0;
    if(d.phase==='align') {
        segment(ship,'inbound',d.gate,Math.max(3,Math.hypot(...d.gate.map((x,i)=>x-ship.position[i]))/15));
    }
    if(d.phase==='inbound' && move(ship,dt)) {
        segment(ship,'landing',d.pad,Math.max(8,Math.hypot(...d.pad.map((x,i)=>x-ship.position[i]))/18));
    } else if(d.phase==='landing' && move(ship,dt)) {
        d.phase='docked';d.until=session.save.world.time+8;
        ship.velocity.fill(0);
    } else if(d.phase==='docked') {
        ship.velocity.fill(0);
        if(session.save.world.time>=d.until) {
            const lift=[...d.pad];lift[1]=d.gate[1];segment(ship,'launch',lift,4);
        }
    } else if(d.phase==='launch' && move(ship,dt)) {
        segment(ship,'outbound',d.gate,Math.max(8,(d.gate[2]-ship.position[2])/22));
    } else if(d.phase==='outbound' && move(ship,dt)) {
        delete ship.stationDock;ship.stationDockCompleted=d.id;return true;
    }
    goal.set(0,d.phase==='launch'||d.phase==='outbound'?1:0,0,d.phase==='launch'||d.phase==='outbound'?0:1);
    rotation.fromArray(ship.rotation).rotateTowards(goal,dt*.8).toArray(ship.rotation);
    return true;
}
