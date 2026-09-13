import { combatTargetEligible } from './combatTargeting.js';
import {PDC_RECOVERY_SECONDS} from './pdcFireControl.js';
import { DRONE_TYPES } from './droneData.js';

export const PDC_DRONE_STEP = 1 / 60;
export const PDC_DRONE_STATES = Object.freeze(['stowed', 'escorting', 'returning', 'destroyed']);
const TYPE = DRONE_TYPES.pdc;
const ZERO = Object.freeze([0, 0, 0]);
const vector = (v) => v != null && Number.isFinite(v[0])
    && Number.isFinite(v[1]) && Number.isFinite(v[2]);
const pointValid = (p) => vector(p?.position) && (p.velocity == null || vector(p.velocity));
const idValid = (id) => typeof id === 'string' && id.length > 0;
const deployed = (unit) => unit.hull > 0 && unit.state !== 'stowed' && unit.state !== 'destroyed';

function event(type, unit, extra) {
    return { ok: true, type, code: type, unitId: unit.id, state: unit.state,
        threatId: null, ammoSpent: 0, ...extra };
}

/** Mark caller-resolved fatal damage once. Keeps identity/ammo; caller clears
 * the fitting slot and handles wrecks. Never calls this merely because of age. */
export function destroyPdcDrone(fleet, unitId, reason = 'damage') {
    const unit = Object.hasOwn(fleet.unitsById, unitId) ? fleet.unitsById[unitId] : null;
    if (!unit || unit.type !== 'pdc' || unit.state === 'destroyed') return null;
    unit.hull = 0;
    unit.state = 'destroyed';
    unit.phaseTime = 0;
    return event('destroyed', unit, { reason });
}

function attach(unit, point, fallbackVelocity, dt = 0) {
    const velocity = point.velocity ?? fallbackVelocity;
    for (let axis = 0; axis < 3; axis++) {
        unit.position[axis] = point.position[axis] + velocity[axis] * dt;
        unit.velocity[axis] = velocity[axis];
    }
}

// Accelerate/brake in the moving anchor frame, reusing canonical arrays.
function travel(unit, point, fallbackVelocity, dt) {
    const p = unit.position, v = unit.velocity, tv = point.velocity ?? fallbackVelocity;
    const dx = point.position[0] - p[0], dy = point.position[1] - p[1], dz = point.position[2] - p[2];
    const distance = Math.hypot(dx, dy, dz);
    const rx = v[0] - tv[0], ry = v[1] - tv[1], rz = v[2] - tv[2];
    if (distance <= TYPE.collisionRadius && Math.hypot(rx, ry, rz) <= TYPE.acceleration * dt * 2) {
        attach(unit, point, fallbackVelocity, dt);
        return true;
    }
    const speed = Math.min(TYPE.cruiseSpeed,
        Math.sqrt(2 * TYPE.acceleration * Math.max(0, distance - TYPE.collisionRadius)), distance / dt);
    const scale = distance > 0 ? speed / distance : 0;
    const ax = dx * scale - rx, ay = dy * scale - ry, az = dz * scale - rz;
    const delta = Math.hypot(ax, ay, az);
    const blend = delta > 0 ? Math.min(1, TYPE.acceleration * dt / delta) : 0;
    v[0] += ax * blend; v[1] += ay * blend; v[2] += az * blend;
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    return false;
}

// First nonnegative root; Infinity means no future intersection.
function firstRoot(a, b, c) {
    if (c <= 0) return 0;
    if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : Infinity;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
    return Math.min(t1 >= 0 ? t1 : Infinity, t2 >= 0 ? t2 : Infinity);
}

function impactTime(threat, position, velocity, radius) {
    // A caller prediction may include guidance/turning that this module cannot know.
    if (Number.isFinite(threat.timeToImpact) && threat.timeToImpact >= 0) return threat.timeToImpact;
    const dx = threat.position[0] - position[0], dy = threat.position[1] - position[1], dz = threat.position[2] - position[2];
    const vx = threat.velocity[0] - velocity[0], vy = threat.velocity[1] - velocity[1], vz = threat.velocity[2] - velocity[2];
    return firstRoot(vx * vx + vy * vy + vz * vz,
        2 * (dx * vx + dy * vy + dz * vz), dx * dx + dy * dy + dz * dz - radius * radius);
}

function aim(unit, threat, direction) {
    const dx = threat.position[0] - unit.position[0], dy = threat.position[1] - unit.position[1], dz = threat.position[2] - unit.position[2];
    const vx = threat.velocity[0] - unit.velocity[0], vy = threat.velocity[1] - unit.velocity[1], vz = threat.velocity[2] - unit.velocity[2];
    const time = firstRoot(vx * vx + vy * vy + vz * vz - TYPE.projectileSpeed ** 2,
        2 * (dx * vx + dy * vy + dz * vz), dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(time)) return Infinity;
    const x = dx + vx * time, y = dy + vy * time, z = dz + vz * time;
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) return Infinity;
    direction[0] = x / length; direction[1] = y / length; direction[2] = z / length;
    return time;
}

/** One controller per owner/session. update(fleet, dt, context, events = [])
 * appends durable event records and mutates only canonical PDC unit records.
 * Call once per fixed 1/60-second simulation step; dt=0 is a no-op. No offline
 * catch-up, renderer imports, mining-controller reads, repair or reload occurs.
 *
 * Required context (world-space numeric triples):
 *   unitIds: active ship's equipped IDs; ownerId: stable string;
 *   shipPosition, shipVelocity, ownerRadius: owner collision sphere;
 *   inFlight: true only during ordinary flight; now: simulation seconds;
 *   threats: [{id: string, kind: 'missile'|'torpedo', hostile: true, ownerId,
 *     targetId, position, velocity, life?: seconds, timeToImpact?: seconds}].
 * targetId must be ownerId or a live deployed unit in this fleet. Caller marks
 * hostility relative to this owner, never merely different ownership. Optional
 * timeToImpact predicts impact on that target; otherwise use straight-line
 * sphere contact. Supply predictions for homing threats on a curved approach.
 *
 * Geometry: bayAnchors[unitId] = {launch: Point, dock: Point},
 * escortAnchors[unitId] = Point; Point = {position, velocity?}. Optional
 * getBayAnchors(unit, context) / getEscortAnchor(unit, context) replace lookups.
 * Optional opponents are live ship records {id, hostile, hull, position, velocity}.
 * Drones engage the nearest clear hostile within attackRange only when no
 * intercept is available. Ship shots do not reserve the missile assignment ledger.
 * Refresh anchors each step (near owner/miners, usually TYPE.escortDistance).
 * Point velocity defaults to shipVelocity. Missing anchors prevent deployment
 * or pause movement; they never teleport a drone to a guessed ship centre.
 * inFlight=false, policy='stow', unequipping or empty ammo requests return to
 * the dock anchor. Keep supplying return anchors until state becomes stowed.
 * An empty unit stays stowed until external service replenishes canonical ammo.
 *
 * Shared shot reservations, REQUIRED: assignments = Map<threatId,
 * {defenderId, until}>. Mounted PDCs must consult/write this SAME map, using
 * simulation seconds. Entries expire at predicted round arrival + 0.12s;
 * caller prunes entries for expired/dead threats or releases a failed spawn.
 * Alternatively supply BOTH isAssigned(threatId, now) and
 * tryAssign(threatId, defenderId, until, now): boolean. They must synchronously
 * share the mounted-PDC ledger; false rejects a shot without spending ammo.
 * Reservations outlive recall/destruction while a fired round is in flight.
 *
 * Optional canFire(unit, threat, start, direction, flightTime) rejects blocked
 * firing paths before reserving/spending. Treat its arrays as read-only.
 * Optional onUnitStep(unit, dt, context) resolves movement collisions/damage
 * before firing/docking; return destroyPdcDrone's event to append it. Callback
 * may remove the unit; do not replace it or mutate threats/other fleet units.
 *
 * Events: {type, code: type, ok:true, unitId, state, threatId:null, ammoSpent:0}.
 * deploy/recall/empty/destroyed are transitions; recall has stage 'begin' or
 * 'stowed' and reason. fire adds threatId, start, direction, inheritedVelocity,
 * projectileSpeed, flightTime, predictedImpact, assignedUntil and ammoSpent:1.
 * Spawn physical rounds from fire events using speed + inherited velocity;
 * only game.js resolves actual hits. A reservation/fire NEVER removes, damages
 * or reports an interception of an enemy projectile. All event vectors are
 * copies, safe to retain. No per-threat sorting/vector allocations occur.
 * Unit processing uses stable lexical IDs; target order is earliest impact,
 * then lexical projectile ID. Health/ammo/cooldown/state survive normal JSON
 * saves. pdcEmptyReported is a serializable notification latch reset by service
 * ammo on the next update. Recreate this controller after loading a fleet.
 */
export function createPdcDroneController() {
    const orderedIds = [];
    const equipped = new Set();
    const direction = [0, 0, 0];
    const bestDirection = [0, 0, 0];

    function recall(unit, events, reason) {
        if (unit.state === 'returning' || unit.state === 'stowed') return;
        unit.state = 'returning';
        unit.phaseTime = 0;
        unit.recallTime = 0;
        events.push(event('recall', unit, { stage: 'begin', reason }));
    }

    function update(fleet, dt, context, events = []) {
        if (!Number.isFinite(dt) || dt < 0 || (dt !== 0 && Math.abs(dt - PDC_DRONE_STEP) > 1e-10))
            throw new RangeError('PDC drones require one fixed 1/60-second step.');
        if (dt === 0) return events;
        const callbacks = typeof context.isAssigned === 'function' && typeof context.tryAssign === 'function';
        if (!Array.isArray(context.unitIds) || !Array.isArray(context.threats)
            || !idValid(context.ownerId) || !vector(context.shipPosition) || !vector(context.shipVelocity)
            || !Number.isFinite(context.ownerRadius) || context.ownerRadius < 0
            || typeof context.inFlight !== 'boolean' || !Number.isFinite(context.now)
            || (!callbacks && !(context.assignments instanceof Map)))
            throw new TypeError('PDC drones require flight geometry, threats and a shared assignment ledger.');
        dt = PDC_DRONE_STEP;
        equipped.clear();
        for (const id of context.unitIds) if (idValid(id)) equipped.add(id);
        orderedIds.length = 0;
        for (const id in fleet.unitsById) {
            if (!Object.hasOwn(fleet.unitsById, id)) continue;
            const unit = fleet.unitsById[id];
            if (unit.type === 'pdc' && unit.state !== 'destroyed'
                && (equipped.has(id) || unit.state !== 'stowed')) orderedIds.push(id);
        }
        orderedIds.sort();

        for (const id of orderedIds) {
            const unit = fleet.unitsById[id];
            if (!unit || unit.state === 'destroyed') continue;
            if (!Number.isFinite(unit.hull) || unit.hull <= 0) {
                events.push(destroyPdcDrone(fleet, id));
                continue;
            }
            const hasAmmo = Number.isSafeInteger(unit.ammo) && unit.ammo > 0;
            if (hasAmmo) unit.pdcEmptyReported = false;
            else if (!unit.pdcEmptyReported) {
                unit.pdcEmptyReported = true;
                events.push(event('empty', unit));
            }
            unit.fireCooldown = Math.max(0, (Number.isFinite(unit.fireCooldown) ? unit.fireCooldown : 0) - dt);
            const anchors = context.getBayAnchors ? context.getBayAnchors(unit, context) : context.bayAnchors?.[id];
            const escort = context.getEscortAnchor ? context.getEscortAnchor(unit, context) : context.escortAnchors?.[id];
            const defend = fleet.pdcPolicy === 'defend' && context.inFlight && equipped.has(id) && hasAmmo;
            if (!defend) recall(unit, events, !hasAmmo ? 'empty' : !equipped.has(id) ? 'unequipped'
                : !context.inFlight ? 'flight-ended' : 'policy');
            if (unit.state === 'stowed') {
                if (!defend || !pointValid(anchors?.launch) || !pointValid(anchors?.dock) || !pointValid(escort)) continue;
                unit.position ??= [0, 0, 0];
                unit.velocity ??= [0, 0, 0];
                unit.rotation ??= [0, 0, 0, 1];
                attach(unit, anchors.launch, context.shipVelocity);
                unit.state = 'escorting';
                unit.phaseTime = 0;
                unit.recallTime = 0;
                events.push(event('deploy', unit));
            }
            if (!vector(unit.position) || !vector(unit.velocity)) continue;
            unit.phaseTime = (Number.isFinite(unit.phaseTime) ? unit.phaseTime : 0) + dt;
            const returning = unit.state === 'returning';
            if (returning) unit.recallTime = (Number.isFinite(unit.recallTime) ? unit.recallTime : 0) + dt;
            const point = returning ? anchors?.dock : escort;
            const arrived = pointValid(point) && travel(unit, point, context.shipVelocity, dt);
            const stepEvent = context.onUnitStep?.(unit, dt, context);
            if (stepEvent) events.push(stepEvent);
            if (fleet.unitsById[id] !== unit || unit.state === 'destroyed') continue;
            if (!Number.isFinite(unit.hull) || unit.hull <= 0) {
                events.push(destroyPdcDrone(fleet, id));
                continue;
            }
            if (returning) {
                if (arrived) {
                    unit.state = 'stowed';
                    unit.phaseTime = 0;
                    unit.recallTime = 0;
                    events.push(event('recall', unit, { stage: 'stowed', reason: 'arrived' }));
                }
                continue;
            }
            if (!defend || unit.state !== 'escorting' || !pointValid(escort) || unit.fireCooldown > 1e-10) continue;

            let best = null, bestImpact = Infinity, bestFlight = Infinity;
            for (const threat of context.threats) {
                if (context.defenseChannel?.readyAt > context.now) break;
                if (!threat || !idValid(threat.id) || threat.hostile !== true
                    || (threat.kind !== 'missile' && threat.kind !== 'torpedo')
                    || threat.ownerId === context.ownerId || (threat.life != null && !(threat.life > 0))
                    || !vector(threat.position) || !vector(threat.velocity)) continue;
                const protectedUnit = Object.hasOwn(fleet.unitsById, threat.targetId)
                    ? fleet.unitsById[threat.targetId] : null;
                const ownerTarget = threat.targetId === context.ownerId;
                if (!ownerTarget && (!protectedUnit || !deployed(protectedUnit)
                    || !vector(protectedUnit.position) || !vector(protectedUnit.velocity))) continue;
                const impact = impactTime(threat, ownerTarget ? context.shipPosition : protectedUnit.position,
                    ownerTarget ? context.shipVelocity : protectedUnit.velocity ?? ZERO,
                    ownerTarget ? context.ownerRadius : DRONE_TYPES[protectedUnit.type]?.collisionRadius ?? 0);
                if (!Number.isFinite(impact) || (threat.life != null && impact > threat.life)
                    || impact > bestImpact || (impact === bestImpact && best && threat.id >= best.id)) continue;
                const dx = threat.position[0] - unit.position[0], dy = threat.position[1] - unit.position[1], dz = threat.position[2] - unit.position[2];
                if (dx * dx + dy * dy + dz * dz > TYPE.interceptRange ** 2) continue;
                if (callbacks ? context.isAssigned(threat.id, context.now)
                    : context.assignments.get(threat.id)?.until > context.now) continue;
                const flight = aim(unit, threat, direction);
                if (!Number.isFinite(flight) || flight > impact || (threat.life != null && flight > threat.life)) continue;
                if (context.canFire && !context.canFire(unit, threat, unit.position, direction, flight)) continue;
                best = threat; bestImpact = impact; bestFlight = flight;
                bestDirection[0] = direction[0]; bestDirection[1] = direction[1]; bestDirection[2] = direction[2];
            }
            // Ship attacks are a fallback; missile interception always wins.
            if (!best) {
                let nearest = TYPE.attackRange ** 2;
                for (const ship of context.opponents ?? []) {
                    if (!ship || !idValid(ship.id) || ship.hostile !== true || !combatTargetEligible(ship)
                        || ship.race || !vector(ship.position) || !vector(ship.velocity)) continue;
                    const dx=ship.position[0]-unit.position[0], dy=ship.position[1]-unit.position[1], dz=ship.position[2]-unit.position[2];
                    const distance = dx*dx+dy*dy+dz*dz;
                    if (distance > nearest || (distance === nearest && best && ship.id >= best.id)) continue;
                    const flight = aim(unit, ship, direction);
                    if (!Number.isFinite(flight) || flight > TYPE.attackRange / TYPE.projectileSpeed) continue;
                    if (context.canFire && !context.canFire(unit, ship, unit.position, direction, flight)) continue;
                    best = ship; nearest = distance; bestFlight = flight;
                    bestDirection[0] = direction[0]; bestDirection[1] = direction[1]; bestDirection[2] = direction[2];
                }
            }
            if (!best) continue;
            const attackShip = bestImpact === Infinity;
            const until = context.now + bestFlight + 0.12;
            if (!attackShip) {
                if (callbacks) {
                    if (!context.tryAssign(best.id, id, until, context.now)) continue;
                } else context.assignments.set(best.id, { defenderId: id, until });
            }
            if (!attackShip && context.defenseChannel) context.defenseChannel.readyAt = context.now + PDC_RECOVERY_SECONDS;
            unit.ammo--;
            unit.fireCooldown = TYPE.shotInterval;
            events.push(event('fire', unit, { threatId: best.id, targetKind: attackShip ? 'ship' : 'missile', ammoSpent: 1,
                start: [...unit.position], direction: [...bestDirection], inheritedVelocity: [...unit.velocity],
                projectileSpeed: TYPE.projectileSpeed, flightTime: bestFlight,
                predictedImpact: bestImpact, assignedUntil: until }));
            if (unit.ammo === 0) {
                unit.pdcEmptyReported = true;
                events.push(event('empty', unit));
                recall(unit, events, 'empty');
            }
        }
        return events;
    }

    return { update };
}
