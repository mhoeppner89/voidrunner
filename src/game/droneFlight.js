// Physical port centres in the playable hull frame; mouths face local -Y.
export const DRONE_PORTS = Object.freeze({
    torsas: [[0,-3.42,1]], astra: [[0,-2.28,1]],
    wayfarer: [[0, -2.05, -1]],
    prospector: [[0, -2.95, -3.2], [0, -2.95, 0], [0, -2.95, 3.2]],
});

// Turn local -Z toward travel, with bounded angular speed. Kept in simulation
// so interpolation and NPC drones use exactly the same orientation.
export function orientDrone(unit, dt, ownerVelocity, point, attached = false) {
    if (!unit.rotation || !unit.velocity) return;
    let x = unit.velocity[0], y = unit.velocity[1], z = unit.velocity[2];
    if (attached) { x -= ownerVelocity[0]; y -= ownerVelocity[1]; z -= ownerVelocity[2]; }
    let speed = Math.hypot(x, y, z);
    if (speed < .15 && point) {
        const p = point.position ?? point;
        x = p[0] - unit.position[0]; y = p[1] - unit.position[1]; z = p[2] - unit.position[2];
        speed = Math.hypot(x, y, z);
    }
    if (speed < .001) return;
    x /= speed; y /= speed; z /= speed;
    let qx = y, qy = -x, qz = 0, qw = 1 - z;
    const length = Math.hypot(qx, qy, qw);
    if (length < .00001) { qx = 0; qy = 1; qw = 0; }
    else { qx /= length; qy /= length; qw /= length; }
    rotateDroneComponents(unit, dt, qx,qy,qz,qw);
}

export function rotateDroneTo(unit, dt, target) {
    rotateDroneComponents(unit,dt,target[0],target[1],target[2],target[3]);
}
function rotateDroneComponents(unit,dt,qx,qy,qz,qw) {
    const q = unit.rotation;
    let dot = q[0]*qx + q[1]*qy + q[2]*qz + q[3]*qw;
    if (dot < 0) { qx=-qx; qy=-qy; qz=-qz; qw=-qw; dot=-dot; }
    const angle = Math.acos(Math.min(1, dot));
    const t = angle > .00001 ? Math.min(1, 5 * dt / (2 * angle)) : 1;
    const a = angle > .00001 ? Math.sin((1-t)*angle)/Math.sin(angle) : 0;
    const b = angle > .00001 ? Math.sin(t*angle)/Math.sin(angle) : 1;
    q[0]=a*q[0]+b*qx; q[1]=a*q[1]+b*qy; q[2]=a*q[2]+b*qz; q[3]=a*q[3]+b*qw;
}
