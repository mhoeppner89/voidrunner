import { DRONE_RULES, DRONE_TYPES } from './droneData.js';
import {
    advanceMinerTimers, advanceMiningCut, cancelMiningJob, deliverMiningPayload,
    finishMiningRecall, miningRecallReason, recallMining, reserveMiningJob,
    transitionMinerUnit,
} from './droneMining.js';

export const DRONE_SYSTEM_STEP = 1 / 60;
const ZERO = Object.freeze([0, 0, 0]);
const vector = (v) => v != null && Number.isFinite(v[0])
    && Number.isFinite(v[1]) && Number.isFinite(v[2]);
const pointValid = (point) => vector(point?.position)
    && (point.velocity == null || vector(point.velocity));
const alive = (fleet, unit) => fleet.unitsById[unit.id] === unit
    && Number.isFinite(unit.hull) && unit.hull > 0 && unit.state !== 'destroyed';
const copyVector = (out, source) => {
    out[0] = source[0]; out[1] = source[1]; out[2] = source[2];
};

function attach(unit, point, fallbackVelocity, dt = 0) {
    const velocity = point.velocity ?? fallbackVelocity;
    for (let axis = 0; axis < 3; axis++) {
        unit.position[axis] = point.position[axis] + velocity[axis] * dt;
        unit.velocity[axis] = velocity[axis];
    }
}

// Seek in the anchor's moving frame. Brake before arrival and bound acceleration;
// only a slow arrival may attach to an anchor. All vectors are reused in place.
function travel(unit, point, fallbackVelocity, dt, radius) {
    const p = unit.position;
    const v = unit.velocity;
    const target = point.position;
    const tv = point.velocity ?? fallbackVelocity;
    const dx = target[0] - p[0], dy = target[1] - p[1], dz = target[2] - p[2];
    const distance = Math.hypot(dx, dy, dz);
    const rx = v[0] - tv[0], ry = v[1] - tv[1], rz = v[2] - tv[2];
    const acceleration = DRONE_TYPES.mining.acceleration;
    if (distance <= radius && Math.hypot(rx, ry, rz) <= acceleration * dt * 2) {
        attach(unit, point, fallbackVelocity, dt);
        return true;
    }
    const speed = Math.min(DRONE_TYPES.mining.cruiseSpeed,
        Math.sqrt(2 * acceleration * Math.max(0, distance - radius)), distance / dt);
    const scale = distance > 0 ? speed / distance : 0;
    const ax = dx * scale - rx, ay = dy * scale - ry, az = dz * scale - rz;
    const delta = Math.hypot(ax, ay, az);
    const blend = delta > 0 ? Math.min(1, acceleration * dt / delta) : 0;
    v[0] += ax * blend; v[1] += ay * blend; v[2] += az * blend;
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    return false;
}

/** Create one system per live session; ownership always remains in fleet.
 *
 * update(fleet, dt, context, events = []) appends and returns event records.
 * dt must be exactly DRONE_SYSTEM_STEP (within floating-point tolerance); zero
 * is a no-op. Invalid/variable/elapsed-time dt throws before any mutation. Call
 * only from the live fixed simulation loop, never to replay time spent offline.
 *
 * Context includes all droneMining fields: unitIds (equipped miners), locked
 * targetNodeKey, deposit, scanned, distance, commodityId, unitMass, cargo (live
 * counts), cargoMass (including sealed cargo), cargoCapacity. Supply these fresh
 * each step. This system updates a private mass view after each delivery; the
 * caller recomputes cargoMass from its hold before the next step.
 *
 * Geometry uses world-space numeric triples, never renderer objects:
 *   shipPosition, shipVelocity;
 *   bayAnchors[unitId] = { launch: Point, dock: Point };
 *   workPoint: Point;
 *   Point = { position: [x,y,z], velocity?: [vx,vy,vz] }.
 * Optional getBayAnchors(unit, context) / getWorkPoint(unit, context) replace
 * those lookups, allowing distinct work offsets and moving/rotating hull bays.
 * Missing point velocities default to shipVelocity for bays, zero for work.
 * Points describe the start of this step; refresh them as the world moves.
 * shipPosition is required context, but never substitutes for a missing bay.
 *
 * Optional validity (or getValidity(fleet, context)) is true/null for valid,
 * false for target loss, a recall-reason string, or {valid:false, reason}.
 * It supplements miningRecallReason; it cannot bypass scan/range/target gates.
 * requestRecall may be true or a reason string; external stopMining/recallMining
 * calls are also respected. The locked target is never selected or replaced.
 *
 * Optional onUnitStep(unit, dt, context) runs after movement, before arrival,
 * cutting, or delivery. The caller resolves collisions/damage here and may call
 * destroyMiningUnit and clear that exact ID from its bay. Return that helper's
 * event to include it in results. A removed/destroyed unit does no further work.
 * Do not change cargo/controller or replace live units in this callback.
 *
 * Events retain droneMining's {ok, code, unitId?, ...} records, including packet
 * IDs on cuts/deliveries. Extra codes: navigation-blocked (once per unit/reason,
 * cleared on recovery), recall-timeout (once on crossing recallSeconds; advisory
 * only). Timeout never destroys a miner or discards a payload automatically.
 * Unit events use lexicographic unit-ID order; controller events occur when a
 * recall is requested or settled, including target loss discovered during flight.
 *
 * Reservation starts launching at the bay; launching follows it for launchSeconds.
 * Outbound arrival enters mining; cutting starts on a later step at the work
 * point. Completed cuts return immediately. Return arrival enters docking;
 * dockSeconds of contact precedes delivery/stowing. A full hold retains the
 * packet in docking and retries each step. Stowed miners may relaunch next step.
 * Clocks consume one dt per call, with no leftover time carried across phases.
 * Position/velocity arrays are allocated on first launch and retained for reuse.
 */
export function createMiningDroneSystem({ launchSeconds = 0.25, dockSeconds = 0.25,
    arrivalRadius = DRONE_TYPES.mining.collisionRadius } = {}) {
    if (!Number.isFinite(launchSeconds) || launchSeconds < 0
        || !Number.isFinite(dockSeconds) || dockSeconds < 0
        || !Number.isFinite(arrivalRadius) || arrivalRadius <= 0)
        throw new RangeError('Invalid mining drone timing or arrival radius.');
    const orderedIds = [];
    const equipped = new Set();
    const blocked = new Map();
    const miningContext = {};

    function update(fleet, dt, context, events = []) {
        if (!Number.isFinite(dt) || dt < 0
            || (dt !== 0 && Math.abs(dt - DRONE_SYSTEM_STEP) > 1e-10))
            throw new RangeError('Mining drones require one fixed 1/60-second step.');
        if (dt === 0) return events;
        if (!vector(context.shipPosition) || !vector(context.shipVelocity)
            || !Array.isArray(context.unitIds))
            throw new TypeError('Mining drones require ship vectors and equipped unitIds.');
        // Use the canonical step even when the caller has harmless rounding error.
        dt = DRONE_SYSTEM_STEP;
        miningContext.unitIds = context.unitIds;
        miningContext.targetNodeKey = context.targetNodeKey;
        miningContext.deposit = context.deposit;
        miningContext.scanned = context.scanned;
        miningContext.distance = context.distance;
        miningContext.commodityId = context.commodityId;
        miningContext.unitMass = context.unitMass;
        miningContext.cargo = context.cargo;
        miningContext.cargoMass = context.cargoMass;
        miningContext.cargoCapacity = context.cargoCapacity;
        equipped.clear();
        for (const id of context.unitIds) if (typeof id === 'string') equipped.add(id);
        orderedIds.length = 0;
        for (const id in fleet.unitsById) {
            if (!Object.hasOwn(fleet.unitsById, id)) continue;
            const unit = fleet.unitsById[id];
            if (unit.type === 'mining' && alive(fleet, unit)
                && (equipped.has(id) || unit.state !== 'stowed' || unit.job || unit.payload))
                orderedIds.push(id);
        }
        orderedIds.sort();
        for (const id of blocked.keys()) if (!orderedIds.includes(id)) blocked.delete(id);

        const validity = context.getValidity ? context.getValidity(fleet, context) : context.validity;
        const worldReason = typeof validity === 'string' ? validity
            : validity === false || validity?.valid === false ? validity?.reason || 'target-lost' : null;
        const recallReason = context.requestRecall
            ? typeof context.requestRecall === 'string' ? context.requestRecall : 'recalled'
            : worldReason || miningRecallReason(fleet, miningContext);
        if (recallReason && fleet.controller.phase !== 'recalling') {
            const event = recallMining(fleet, recallReason);
            if (event.ok) events.push(event);
        }

        for (const id of orderedIds) {
            const unit = fleet.unitsById[id];
            if (!unit || !alive(fleet, unit)) continue;
            // Also return orphaned work if equipment changes or an idle controller
            // is restored with airborne units. Neither path creates replacement IDs.
            if (unit.job && (!equipped.has(id) || fleet.controller.phase !== 'running'
                || unit.job.targetNodeKey !== fleet.controller.targetNodeKey
                || unit.job.cycleId !== fleet.controller.cycleId)) {
                events.push(cancelMiningJob(fleet, id, 'inactive-job'));
            }
            if ((unit.state === 'launching' || unit.state === 'outbound' || unit.state === 'mining')
                && !unit.job) events.push(transitionMinerUnit(fleet, id, 'returning'));

            const state = unit.state;
            const previousRecallTime = unit.recallTime;
            advanceMinerTimers(fleet, id, dt);
            if (fleet.controller.phase === 'recalling' && previousRecallTime < DRONE_RULES.recallSeconds
                && unit.recallTime >= DRONE_RULES.recallSeconds)
                events.push({ ok: true, code: 'recall-timeout', unitId: id,
                    reason: fleet.controller.stopReason, recallTime: unit.recallTime });

            const anchors = context.getBayAnchors ? context.getBayAnchors(unit, context) : context.bayAnchors?.[id];
            let point;
            let arrived = false;
            let navigationFailure = null;
            if (state === 'stowed') {
                if (fleet.controller.phase !== 'running' || !equipped.has(id)) continue;
                if (!pointValid(anchors?.launch) || !pointValid(anchors?.dock)) {
                    reportBlocked(id, 'missing-bay-anchor', events);
                    continue;
                }
                const event = reserveMiningJob(fleet, id, miningContext);
                if (!event.ok) continue;
                unit.position ??= [0, 0, 0];
                unit.velocity ??= [0, 0, 0];
                unit.rotation ??= [0, 0, 0, 1];
                attach(unit, anchors.launch, context.shipVelocity);
                events.push(event);
            } else if (!vector(unit.position) || !vector(unit.velocity)) {
                navigationFailure = 'invalid-transform';
            } else if (state === 'launching') {
                point = anchors?.launch;
                if (pointValid(point)) {
                    attach(unit, point, context.shipVelocity, dt);
                    arrived = true;
                } else navigationFailure = 'missing-bay-anchor';
            } else {
                const working = state === 'outbound' || state === 'mining';
                point = working
                    ? context.getWorkPoint ? context.getWorkPoint(unit, context) : context.workPoint
                    : anchors?.dock;
                if (pointValid(point)) {
                    arrived = travel(unit, point, working ? ZERO : context.shipVelocity, dt, arrivalRadius);
                } else {
                    navigationFailure = working ? 'missing-work-point' : 'missing-bay-anchor';
                    if (working && fleet.controller.phase === 'running')
                        events.push(recallMining(fleet, 'target-lost'));
                }
            }

            // No economic commit precedes the caller's collision/damage decision.
            const worldEvent = context.onUnitStep?.(unit, dt, context);
            if (worldEvent) events.push(worldEvent);
            if (!alive(fleet, unit)) { blocked.delete(id); continue; }
            if (navigationFailure) {
                reportBlocked(id, navigationFailure, events);
                if (unit.state === 'docking' || unit.state === 'launching') unit.phaseTime = 0;
                continue;
            }
            // Collision resolution can push a previously arrived unit off its point.
            if (arrived) {
                const pv = point.velocity ?? (state === 'outbound' || state === 'mining' ? ZERO : context.shipVelocity);
                arrived = Math.hypot(unit.position[0] - point.position[0] - pv[0] * dt,
                    unit.position[1] - point.position[1] - pv[1] * dt,
                    unit.position[2] - point.position[2] - pv[2] * dt) <= arrivalRadius
                    && Math.hypot(unit.velocity[0] - pv[0], unit.velocity[1] - pv[1],
                        unit.velocity[2] - pv[2]) <= DRONE_TYPES.mining.acceleration * dt * 2;
            }
            blocked.delete(id);
            if (unit.state !== state) continue;
            if (state === 'launching' && arrived && unit.phaseTime >= launchSeconds)
                events.push(transitionMinerUnit(fleet, id, 'outbound'));
            else if (state === 'outbound' && arrived)
                events.push(transitionMinerUnit(fleet, id, 'mining'));
            else if (state === 'mining' && arrived) {
                const event = advanceMiningCut(fleet, id, dt, miningContext);
                if (event) events.push(event);
            } else if (state === 'returning' && arrived)
                events.push(transitionMinerUnit(fleet, id, 'docking'));
            else if (state === 'docking') {
                if (!arrived) { unit.phaseTime = 0; continue; }
                if (unit.phaseTime < dockSeconds) continue;
                if (unit.payload) {
                    const event = deliverMiningPayload(fleet, id, miningContext);
                    if (!event.ok) continue; // Keep the packet and retry on a later step.
                    miningContext.cargoMass += event.unitMass;
                    events.push(event);
                }
                const event = transitionMinerUnit(fleet, id, 'stowed');
                if (event.ok) {
                    copyVector(unit.velocity, context.shipVelocity);
                    events.push(event);
                }
            }
        }
        // A final cut can exhaust the deposit this very step.
        const finalReason = miningRecallReason(fleet, miningContext);
        if (finalReason) events.push(recallMining(fleet, finalReason));
        const settled = finishMiningRecall(fleet);
        if (settled) events.push(settled);
        return events;
    }

    function reportBlocked(unitId, reason, events) {
        if (blocked.get(unitId) === reason) return;
        blocked.set(unitId, reason);
        events.push({ ok: false, code: 'navigation-blocked', unitId, reason });
    }

    return { update };
}
