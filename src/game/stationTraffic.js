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

export function stationModelOffsetZ(id) {
    return id === 'blackglass' ? LOCATIONS[id].radius * .835 : 0;
}

// Blackglass's station is attached to the moon's near surface, not its center.
export function stationSurfaceDistance(id, position) {
    const location = LOCATIONS[id];
    return Math.max(0, Math.hypot((position[0]??position.x)-location.position[0], (position[1]??position.y)-location.position[1],
        (position[2]??position.z)-location.position[2]-stationModelOffsetZ(id)) - stationVisualSurfaceRadius(id));
}

// The same model transform as render.ensureStationModels, including Blackglass's moon offset.
function berthFromSpec(id, laneSpec, height = 2, radialGate = false) {
    const spec = STATION_DOCKS[id], location = LOCATIONS[id];
    if (!spec || !location || !laneSpec) return null;
    const [x,y,z,,length] = laneSpec;
    const scale = location.radius * (id === 'blackglass' ? .2 : .95) / spec.radius;
    // Keep complete fitted wings/engine housings above the sloped deck, not
    // only the old ellipsoid's centreline. This is clearance, not hull clipping.
    const pad = [location.position[0]+x*scale, location.position[1]+(z+(id==='cairn'?.12:0))*scale+height+1.75,
        location.position[2]+(-y+length*.28)*scale+stationModelOffsetZ(id)];
    let gate;
    if (radialGate) {
        const center = [location.position[0],location.position[1],location.position[2]+stationModelOffsetZ(id)];
        const dx = pad[0] - center[0], dy = pad[1] - center[1], dz = pad[2] - center[2];
        const radius = Math.hypot(dx,dy,dz) || 1;
        // These two yards have side beams across a radial path. Other exterior
        // pads retain their own radial approach (e.g. Haven's perimeter decks).
        const approach = spec.approachVector ?? (radialGate==='npc'||id==='cinder'||id==='torchwell'?[0,-1,0]:undefined);
        const gateRadius = approach
            ? Math.max(radius + 100, stationVisualSurfaceRadius(id) + 120)
            : Math.max(radius + 100, stationVisualSurfaceRadius(id) * 1.15 + 100);
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
            gate = perpendicular.map((value, i) => center[i] + value + axis[i] * gateAlong);
        }
        else {
            // A radial vertical component puts a lower-deck gate underneath
            // the station and sends the route through its floor. Approach
            // horizontally at the authored deck height instead.
            const horizontal = Math.hypot(dx,dz);
            const reach = Math.sqrt(Math.max(0,gateRadius**2-dy**2));
            gate = [center[0] + (horizontal ? dx/horizontal : 0)*reach,
                pad[1], center[2] + (horizontal ? dz/horizontal : 1)*reach];
        }
    } else {
        gate = [...pad];
        gate[1] += Math.max(12,height*3);
        gate[2] = Math.max(pad[2]+100,location.position[2]+location.radius*1.15+100);
    }
    if(spec.sharedEntry){
        const throat=[location.position[0]+spec.sharedEntry.x*scale,pad[1],
            location.position[2]-spec.sharedEntry.innerY*scale+stationModelOffsetZ(id)];
        gate[0]=throat[0];
        return {pad,gate,throat};
    }
    return {pad,gate};
}
export function stationBerth(id, lane = 0, height = 2) {
    const spec = STATION_DOCKS[id];
    return berthFromSpec(id, spec?.lanes[lane], height, 'npc');
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

// Cold-path route data shared by clearance checks and docking guidance.
export function stationDockRoute(berth){return berth.throat?[berth.gate,berth.throat,berth.pad]:[berth.gate,berth.pad];}

function sharedEntryBusy(session,id,ship){
    if(!STATION_DOCKS[id]?.sharedEntry)return false;
    if(session.stationLandingBerth?.id===id||session.departureClearance?.id===id)return true;
    for(const other of session.ships)if(other!==ship&&other.hull>0&&other.stationDock?.id===id&&other.stationDock.phase!=='docked')return true;
    return false;
}
export function reserveStationDock(session,ship,id,departing=false) {
    const spec=STATION_DOCKS[id];
    if(!spec || ship.capitalClass || ship.hostile || ship.captured || ship.poweredDown)return false;
    // Wait for the actual model/parked bounds before assigning a live route.
    if(session.renderer?.stationModelLoads && !session.renderer.stationColliders?.has(id)){ship.stationQueue=id;return false;}
    if(!departing&&sharedEntryBusy(session,id,ship)){ship.stationQueue=id;return false;}
    const hull=session.npcHullExtents(ship);
    let lane=-1,berth;
    for(let i=0;i<spec.lanes.length;i++) {
        if(session.stationLandingBerth?.id===id&&session.stationLandingBerth.sharedNpcLaneIndex===i
            ||session.departureClearance?.id===id&&session.departureClearance.sharedNpcLaneIndex===i)continue;
        if(session.ships.some(s=>s!==ship&&s.hull>0&&s.stationDock?.id===id&&s.stationDock.lane===i))continue;
        const candidate=stationBerth(id,i,hull[1]);
        if(!clearParkedBerth(candidate,hull,session.renderer?.stationDockObstacles?.get(id)))continue;
        lane=i;berth=candidate;break;
    }
    if(lane<0){ship.stationQueue=id;return false;}
    delete ship.stationQueue;
    ship.stationDock={id,lane,...berth,phase:departing?'docked':'align',elapsed:0};
    if(departing) {
        for(let i=0;i<3;i++){ship.position[i]=berth.pad[i];ship.velocity[i]=0;}
        ship.rotation.splice(0,4,0,0,0,1);
        ship.stationDock.until=session.save.world.time+6;
    }
    return true;
}

export function clearParkedBerth(berth,hull,obstacles=[]) {
    // Authored traffic doors face +Z. Keep the same deck and centreline, but
    // stop ahead of parked hulls instead of occupying their maintenance cradle.
    for(const {min,max} of obstacles) {
        if(berth.pad[0]+hull[0]+2<min[0] || berth.pad[0]-hull[0]-2>max[0]
            || berth.pad[1]+hull[1]+.5<min[1] || berth.pad[1]-hull[1]-.5>max[1]
            || min[2]>berth.gate[2]+hull[2])continue;
        berth.pad[2]=Math.max(berth.pad[2],max[2]+hull[2]+2);
    }
    return berth.pad[2]+hull[2]+4<(berth.throat??berth.gate)[2];
}
const rotation=new THREE.Quaternion(),goal=new THREE.Quaternion(),direction=new THREE.Vector3();
const forward=new THREE.Vector3(0,0,-1);
function segment(ship,phase,to,duration,via) {
    const dock=ship.stationDock;
    dock.phase=phase;dock.from=[...ship.position];dock.to=to;dock.elapsed=0;dock.duration=duration;
    dock.via=via;
    if(via){
        dock.firstLength=Math.hypot(...via.map((v,i)=>v-dock.from[i]));
        dock.routeLength=dock.firstLength+Math.hypot(...to.map((v,i)=>v-via[i]));
    }
}
function move(ship,dt) {
    const d=ship.stationDock;
    d.elapsed=Math.min(d.duration,d.elapsed+dt);
    const t=d.elapsed/d.duration,blend=t*t*t*(10+t*(-15+6*t));
    let from=d.from,to=d.to,along=blend;
    if(d.via){
        const distance=blend*d.routeLength;
        if(distance<=d.firstLength){to=d.via;along=distance/Math.max(1e-9,d.firstLength);}
        else{from=d.via;along=(distance-d.firstLength)/Math.max(1e-9,d.routeLength-d.firstLength);}
    }
    for(let i=0;i<3;i++) {const next=from[i]+(to[i]-from[i])*along;ship.velocity[i]=(next-ship.position[i])/dt;ship.position[i]=next;}
    return t>=1;
}
// Docking guidance owns actual entity transforms; there is no second decorative ship.
export function updateStationDock(session,ship,dt) {
    const d=ship.stationDock;
    if(!d)return false;
    if(ship.captured||ship.poweredDown){delete ship.stationDock;return false;}
    ship.burning=false;
    const heading=d.throat??d.pad;
    // Emergency departure stays in the clear lane before combat takes over.
    if(ship.hostile && d.phase==='docked')d.until=0;
    if(d.phase==='align') {
        segment(ship,'inbound',d.gate,Math.max(3,Math.hypot(...d.gate.map((x,i)=>x-ship.position[i]))/15));
    }
    if(d.phase==='inbound' && move(ship,dt)) {
        // Finish heading alignment outside the hull before entering the door.
        d.phase='orient';ship.velocity.fill(0);
    } else if(d.phase==='orient') {
        direction.set(heading[0]-d.gate[0],heading[1]-d.gate[1],heading[2]-d.gate[2]).normalize();
        goal.setFromUnitVectors(forward,direction);
        rotation.fromArray(ship.rotation).rotateTowards(goal,dt*.8).toArray(ship.rotation);
        if(rotation.angleTo(goal)<1e-5)segment(ship,'landing',d.pad,Math.max(8,Math.hypot(...d.pad.map((x,i)=>x-ship.position[i]))/18),d.throat);
        return true;
    } else if(d.phase==='landing' && move(ship,dt)) {
        d.phase='docked';d.until=session.save.world.time+8;
        ship.velocity.fill(0);
    } else if(d.phase==='docked') {
        ship.velocity.fill(0);
        if(session.save.world.time>=d.until&&!sharedEntryBusy(session,d.id,ship)) {
            // Back out through the entrance on manoeuvring thrusters. Turning
            // around inside a narrow hangar sweeps wings through its walls.
            const toward=d.throat??d.gate;
            direction.set(toward[0]-d.pad[0],toward[1]-d.pad[1],toward[2]-d.pad[2]).normalize();
            const release=d.pad.map((value,i)=>value+direction.getComponent(i)*8);
            segment(ship,'launch',release,4);
        }
    } else if(d.phase==='launch' && move(ship,dt)) {
        segment(ship,'outbound',d.gate,Math.max(8,Math.hypot(...d.gate.map((value,i)=>value-ship.position[i]))/22),d.throat);
    } else if(d.phase==='outbound' && move(ship,dt)) {
        d.phase='turnout';ship.velocity.fill(0);
    } else if(d.phase==='turnout') {
        // Turn only at the exterior gate. Hand normal flight an outward
        // heading so its first acceleration cannot send it back into the bay.
        direction.set(d.gate[0]-heading[0],d.gate[1]-heading[1],d.gate[2]-heading[2]).normalize();
        goal.setFromUnitVectors(forward,direction);
        rotation.fromArray(ship.rotation).rotateTowards(goal,dt*.8).toArray(ship.rotation);
        if(rotation.angleTo(goal)<1e-5){delete ship.stationDock;ship.stationDockCompleted=d.id;}
        return true;
    }
    if(d.phase==='turnout')return true;
    direction.set(heading[0]-d.gate[0],heading[1]-d.gate[1],heading[2]-d.gate[2]).normalize();
    goal.setFromUnitVectors(forward,direction);
    rotation.fromArray(ship.rotation).rotateTowards(goal,dt*.8).toArray(ship.rotation);
    return true;
}
