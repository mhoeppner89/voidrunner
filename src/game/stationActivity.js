import * as THREE from 'three';
import { STATION_OCCUPANTS } from './stationOccupants.js';

// Dock lanes use the same author coordinates and export radius as station builders.
import { STATION_DOCKS as DOCKS } from './stationDocks.js';

export function addStationActivity(station, id) {
    const root = new THREE.Group();
    root.name = 'station-activity';
    const spec = DOCKS[id];
    const lanes = [];
    const lifts = [];
    const welds = [];
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const phase = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) * .17;
    if (spec) {
        const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, .08, .85),
            new THREE.MeshBasicMaterial({color:0xffffff}), spec.lanes.length * 12);
        lights.name = 'Sequential docking lane lights';
        let index = 0;
        for (const [x, y, z, width, length] of spec.lanes) {
            for (let step = 0; step < 6; step++) for (const side of [-1, 1]) {
                matrix.makeTranslation(x + side * width / 2, z, -y + length / 2 - step * length / 6);
                lights.setMatrixAt(index, matrix);
                lights.setColorAt(index, color.setRGB(.04, .14, .16));
                lanes.push({index:index++, step});
            }
        }
        lights.scale.setScalar(100 / spec.radius);
        root.add(lights);
        root.userData.laneLights = lights;
    }
    // Repair fixtures share each occupant's author frame, so no world-space drift.
    const dock = station.getObjectByName('station-docked-ships');
    if (dock) {
        const steel = new THREE.MeshStandardMaterial({color:0x3b4a52,roughness:.65,metalness:.5});
        const yellow = new THREE.MeshStandardMaterial({color:0xc39132,roughness:.6});
        const fixture = (parent, name, position, size, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
            mesh.name = name; mesh.position.set(...position); parent.add(mesh); return mesh;
        };
        dock.updateMatrixWorld(true);
        for (const ship of [...dock.children].filter(n => n.userData.stationOccupant)) {
            // Bounds and ray tests stay in the dock's local coordinate system.
            ship.updateMatrix();
            const bounds = new THREE.Box3();
            ship.traverse(n => {if(n.isMesh){n.geometry.computeBoundingBox();
                const m = new THREE.Matrix4().copy(dock.matrixWorld).invert().multiply(n.matrixWorld);
                bounds.union(n.geometry.boundingBox.clone().applyMatrix4(m));}});
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const capital = ship.name.includes('concord-');
            for (const side of capital ? [-1,1] : [1]) {
                // Find an actual hull surface for the welding point, not just a bounding box.
                const ray = new THREE.Raycaster();
                const origin = new THREE.Vector3(center.x + side*(size.x+2),center.y,center.z);
                const direction = new THREE.Vector3(-side,0,0).transformDirection(dock.matrixWorld);
                ray.set(origin.clone().applyMatrix4(dock.matrixWorld),direction);
                const hit = ray.intersectObject(ship,true)[0];
                if (!hit) continue;
                const point = dock.worldToLocal(hit.point.clone());
                const sparks = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({color:0xa8eaff,size:capital?.32:.15,sizeAttenuation:true,depthWrite:false,transparent:true,opacity:.85}));
                sparks.name = 'Intermittent repair sparks';
                const positions = new Float32Array(24*3);
                sparks.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
                sparks.position.copy(point);dock.add(sparks);
                welds.push({sparks,positions,side,phase:phase+welds.length*3.7});
                if (!capital) continue;
                const x = center.x + side*(size.x/2+2.3);
                const berth = STATION_OCCUPANTS[id]?.ships.find(item => ship.name === `berthed-${item.hull}`);
                const bottom = (berth ? berth.at[2] + 1.8 : bounds.min.y-1) + .3;
                const railZ = center.z + side * size.z * .27;
                const top = center.y+size.y*.2;
                fixture(dock,'Service lift guide',[x,(bottom+top)/2,railZ],[.28,top-bottom+2,.28],steel);
                fixture(dock,'Service lift foot',[x,bottom,railZ],[2,.6,2],steel);
                const lift = new THREE.Group();lift.name='Travelling maintenance lift';lift.position.set(x,bottom,railZ);dock.add(lift);
                fixture(lift,'Lift platform',[0,0,0],[2.4,.25,3],steel);
                fixture(lift,'Lift outer guard',[side, .75,0],[.12,.12,3],yellow);
                for(const end of [-1,1])fixture(lift,'Lift guard post',[side,.4,end*1.3],[.12,.8,.12],yellow);
                fixture(lift,'Lift control cabinet',[-side*.7,.5,.9],[.45,.85,.45],yellow);
                lifts.push({lift,bottom,travel:top-bottom,phase:phase+lifts.length*2.2});
            }
        }
    }
    station.add(root);
    const activity = {root,lanes,lifts,welds,phase,color};
    station.userData.stationActivity = activity;
    updateStationActivity(activity, 0);
    return activity;
}

export function updateStationActivity(activity, time) {
    const {root,lanes,lifts,welds,phase,color} = activity;
    const lights = root.userData.laneLights;
    if (lights) {
        const current = Math.floor(time*2+phase)%6;
        for(const lane of lanes){
            const bright = lane.step===current;
            lights.setColorAt(lane.index,color.setRGB(bright?.3:.025,bright?.9:.12,bright?1:.15));
        }
        lights.instanceColor.needsUpdate=true;
    }
    for(const entry of lifts){
        // Slow smooth trips with a short dwell at each end.
        const f=Math.max(0,Math.min(1,(Math.sin(time*.17+entry.phase)+.75)/1.5));
        entry.lift.position.y=entry.bottom+f*entry.travel;
    }
    for(const entry of welds){
        const cycle=(time+entry.phase)%11;
        entry.sparks.visible=cycle<1.25 && Math.sin(time*31+entry.phase)>.05;
        if(!entry.sparks.visible)continue;
        for(let i=0;i<24;i++){
            const age=(time*2+i*.137)%1;
            entry.positions[i*3]=entry.side*(.06+age*(.3+(i%5)*.08));
            entry.positions[i*3+1]=Math.sin(i*2.4)*age*.55-age*age*.65;
            entry.positions[i*3+2]=Math.cos(i*1.7)*age*.55;
        }
        entry.sparks.geometry.attributes.position.needsUpdate=true;
        // Fixed conservative bounds avoid per-frame geometry scans.
        entry.sparks.frustumCulled=false;
    }
}
