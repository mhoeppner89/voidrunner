import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const delta = new THREE.Quaternion(), euler = new THREE.Euler();
const error = new THREE.Quaternion();

// Both pilots use these integrators. Inputs are bounded local thrust/rotation
// commands; steering never replaces a velocity vector with a new heading.
export function integrateFlightTurn(orientation, angularVelocity, x, y, z, acceleration, damping, assisted, burning, dt) {
    const authority = acceleration * (burning ? 2 : 1) * dt;
    angularVelocity.x += clamp(x,-1,1) * authority;
    angularVelocity.y += clamp(y,-1,1) * authority;
    angularVelocity.z += clamp(z,-1,1) * authority;
    angularVelocity.multiplyScalar(Math.exp(-damping * (assisted ? 1 : 0.38) * dt));
    delta.setFromEuler(euler.set(angularVelocity.x*dt,angularVelocity.y*dt,angularVelocity.z*dt,'XYZ'));
    orientation.multiply(delta).normalize();
}

export function steerFlightTurn(orientation, angularVelocity, desired, stats, assisted, burning, dt, trackingRate) {
    error.copy(orientation).invert().multiply(desired).normalize();
    if (error.w < 0) error.set(-error.x,-error.y,-error.z,-error.w);
    const length = Math.hypot(error.x,error.y,error.z);
    const scale = length > 1e-8 ? 2*Math.atan2(length,error.w)/length : 0;
    // Anticipate angular momentum, with exactly the player's authority limits.
    const gain = stats.angularAcceleration * (burning ? 2 : 1);
    const damping = stats.angularDamping * (assisted ? 1 : 0.38);
    integrateFlightTurn(orientation,angularVelocity,
        (error.x*scale*3+(trackingRate?.x??0)*3-angularVelocity.x*(3-damping))/gain,
        (error.y*scale*3+(trackingRate?.y??0)*3-angularVelocity.y*(3-damping))/gain,
        (error.z*scale*3+(trackingRate?.z??0)*3-angularVelocity.z*(3-damping))/gain,
        stats.angularAcceleration,stats.angularDamping,assisted,burning,dt);
}

export function integrateFlightVelocity(velocity, forward, targetSpeed, speedCeiling, acceleration, assisted, burning, throttle, dt, lateralMultiplier=1) {
    const forwardSpeed = velocity.dot(forward);
    let lx=velocity.x-forward.x*forwardSpeed, ly=velocity.y-forward.y*forwardSpeed, lz=velocity.z-forward.z*forwardSpeed;
    let next = forwardSpeed;
    if (assisted) {
        const change=targetSpeed-forwardSpeed;
        const thrust=acceleration*(change<0?1.25:1)*dt;
        next += clamp(change,-thrust,thrust);
        const damping=Math.exp(-(burning?0.62:0.9)*lateralMultiplier*dt);
        lx*=damping;ly*=damping;lz*=damping;
    } else if (throttle>0 && targetSpeed>forwardSpeed) {
        next += Math.min(targetSpeed-forwardSpeed,acceleration*dt);
    }
    velocity.set(forward.x*next+lx,forward.y*next+ly,forward.z*next+lz);
    if (!assisted) {
        const speed=velocity.length(),limit=speedCeiling*1.06;
        if(speed>limit)velocity.multiplyScalar(Math.max(limit,speed-acceleration*0.45*dt)/speed);
    }
}

export function registerHitReaction(ship, time, damage) {
    if (damage !== undefined) {
        if (!(damage > 0)) return false;
        const elapsed=Math.max(0,time-(ship.combatPressureAt??time));
        ship.combatPressure=(ship.combatPressure??0)*Math.exp(-elapsed/1.5)+damage;
        ship.combatPressureAt=time;
        const tier=ship.pilot?.tier;
        // Experienced pilots tolerate grazing fire while they have reserves.
        // A novice treats even a PDC hit as reason to abandon the firing line.
        const reserve=Math.max(5,((ship.shield??0)+Math.max(0,ship.hull??100)*.4)*(tier==='ace'?.14:.09));
        if (tier!=='novice' && ship.combatPressure<reserve) return false;
    }
    const reflex=ship.pilot?.reflex ?? 0.78;
    // Repeated hits extend the reaction, but never restart its initial delay.
    if (!(ship.evasiveUntil > time)) ship.evasiveLatencyUntil=time+(damage===undefined?(1.2-reflex)*1.1:ship.pilot?.tier==='novice'?.3:ship.pilot?.tier==='ace'?.1:.18);
    ship.evasiveUntil=Math.max(ship.evasiveUntil ?? 0,time+(damage===undefined?2.5*(0.6+reflex*0.5):ship.pilot?.tier==='novice'?2.4:1.4));
    return true;
}
