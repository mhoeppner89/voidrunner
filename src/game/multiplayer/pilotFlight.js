import { Quaternion, Vector3 } from 'three';
import { integrateFlightTurn, integrateFlightVelocity } from '../flightDynamics.js';

const orientation = new Quaternion();
const angularVelocity = new Vector3();
const velocity = new Vector3();
const forward = new Vector3();

// The host and client prediction both call this once per fixed simulation step.
// The caller supplies resolved ship stats and sanitized controls. All persistent
// state lives on the actor, including the four pose arrays used by the renderer.
export function stepPilotFlight(actor, stats, input, dt) {
    const throttle = input.throttleSet ?? actor.throttle;
    actor.throttle = Math.max(0, Math.min(1, throttle + (input.throttleDelta ?? 0) * dt));
    actor.afterburning = Boolean(input.afterburner);
    const assisted = input.flightAssist ?? true;

    orientation.fromArray(actor.rotation);
    angularVelocity.fromArray(actor.angularVelocity);
    integrateFlightTurn(orientation, angularVelocity, input.pitch ?? 0, -(input.yaw ?? 0), -(input.roll ?? 0),
        stats.angularAcceleration, stats.angularDamping, assisted, actor.afterburning, dt);
    orientation.toArray(actor.rotation);
    angularVelocity.toArray(actor.angularVelocity);

    velocity.fromArray(actor.velocity);
    forward.set(0, 0, -1).applyQuaternion(orientation).normalize();
    // Even an empty capacitor permits a boosted turn. Extra speed needs power
    // and the ship must already be travelling at 90% of its cruise speed.
    const canBoostSpeed = actor.afterburning && actor.energy > 0 && velocity.length() >= 0.9 * stats.maxSpeed;
    const ceiling = canBoostSpeed ? stats.afterburnSpeed : stats.maxSpeed;
    integrateFlightVelocity(velocity, forward, actor.throttle * ceiling, ceiling, stats.acceleration,
        assisted, actor.afterburning, actor.throttle, dt, stats.lateralMultiplier ?? 1);
    velocity.toArray(actor.velocity);
    actor.position[0] += velocity.x * dt;
    actor.position[1] += velocity.y * dt;
    actor.position[2] += velocity.z * dt;

    if (actor.afterburning) actor.energy = Math.max(0, actor.energy - dt * (stats.burnEnergy ?? 0));
}
