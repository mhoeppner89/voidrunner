import { DRONE_RULES, DRONE_TYPES } from './droneData.js';

// Operates on the canonical droneData fleet in place; never creates ownership.
// Context is supplied fresh by game.js:
// { unitIds: equipped miner IDs, targetNodeKey: world-qualified string,
//   deposit: { remaining }, scanned, distance, commodityId, unitMass,
//   cargoMass: actual total mass (including sealed cargo), cargoCapacity,
//   cargo: the live ship commodity-count object (delivery only) }.
// The caller resolves the key to the live deposit and supplies trusted mass data.
// Jobs reserve one deposit unit AND cargo mass; payloads reserve only cargo mass.
// No separate reservation ledger can drift from the serializable fleet records.
// Outcomes are synchronous: apply stats/claims only for a returned cut/delivery,
// using packetId as the identity. Retrying a committed operation cannot repeat it.

export const MINING_CONTROLLER_PHASES = Object.freeze(['idle', 'running', 'recalling']);
export const MINER_UNIT_STATES = Object.freeze([
    'stowed', 'launching', 'outbound', 'mining', 'returning', 'docking', 'destroyed',
]);
const transitions = Object.freeze({
    stowed: ['launching'], launching: ['outbound', 'returning'],
    outbound: ['mining', 'returning'], mining: ['returning'],
    returning: ['docking'], docking: ['stowed'], destroyed: [],
});
const positive = (n) => Number.isFinite(n) && n > 0;
const nonnegative = (n) => Number.isFinite(n) && n >= 0;
const key = (value) => typeof value === 'string' && value.length > 0;
const fail = (code) => ({ ok: false, code });
const miner = (fleet, id) => key(id) && Object.hasOwn(fleet.unitsById, id)
    && fleet.unitsById[id].type === 'mining' ? fleet.unitsById[id] : null;
const alive = (unit) => unit && positive(unit.hull) && unit.state !== 'destroyed';
const airborne = (unit) => unit.type === 'mining' && unit.state !== 'stowed'
    && unit.state !== 'destroyed';

/** Allocation-free queries. Invalid reservation mass fails closed. */
export function miningReservedMass(fleet) {
    let mass = 0;
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type !== 'mining') continue;
        for (let i = 0; i < 2; i++) {
            const reservation = i === 0 ? unit.job : unit.payload;
            if (!reservation) continue;
            if (reservation.units !== 1 || !positive(reservation.unitMass)) return Infinity;
            mass += reservation.unitMass;
        }
    }
    return mass;
}

export function miningReservedUnits(fleet, targetNodeKey) {
    let units = 0;
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type === 'mining' && unit.job?.targetNodeKey === targetNodeKey) units++;
    }
    return units;
}

export function miningCargoAvailable(fleet, context) {
    if (!nonnegative(context.cargoMass) || !nonnegative(context.cargoCapacity)) return 0;
    return Math.max(0, context.cargoCapacity - context.cargoMass - miningReservedMass(fleet));
}

function targetFailure(context) {
    if (!key(context.targetNodeKey) || !context.deposit) return 'invalid-target';
    if (context.scanned !== true) return 'unscanned';
    if (!nonnegative(context.distance) || context.distance > DRONE_RULES.operatingRange) return 'out-of-range';
    if (!Number.isSafeInteger(context.deposit.remaining) || context.deposit.remaining < 0) return 'invalid-deposit';
    if (context.deposit.remaining === 0) return 'exhausted';
    if (!key(context.commodityId) || !positive(context.unitMass)) return 'invalid-commodity';
    return null;
}

function reservationFailure(fleet, context) {
    const reason = targetFailure(context);
    if (reason) return reason;
    if (context.deposit.remaining <= miningReservedUnits(fleet, context.targetNodeKey)) return 'deposit-reserved';
    if (miningCargoAvailable(fleet, context) < context.unitMass) return 'cargo-full';
    return null;
}

/** Allocation-free running-cycle gate. Pass the locked target's current context,
 * not the current UI selection. A reason can be passed directly to recallMining. */
export function miningRecallReason(fleet, context) {
    if (fleet.controller.phase !== 'running') return null;
    if (fleet.controller.targetNodeKey !== context.targetNodeKey) return 'target-changed';
    return targetFailure(context);
}

/** Read-only command eligibility. unitIds must come from the active ship bays. */
export function miningStartEligibility(fleet, context) {
    if (fleet.controller.phase !== 'idle') return fail(fleet.controller.phase === 'recalling' ? 'recalling' : 'already-running');
    const reason = reservationFailure(fleet, context);
    if (reason) return fail(reason);
    if (!Array.isArray(context.unitIds)) return fail('no-miners');
    let ready = false;
    for (const id of context.unitIds) {
        const unit = miner(fleet, id);
        if (alive(unit) && unit.state === 'stowed' && !unit.job && !unit.payload) ready = true;
    }
    if (!ready) return fail('no-miners');
    // Never change targets underneath miners still carrying work from a cycle.
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type === 'mining' && (airborne(unit) || unit.job || unit.payload)) return fail('miners-busy');
    }
    const cycle = fleet.controller.cycleId;
    if (!Number.isSafeInteger(cycle) || cycle < 0 || cycle >= Number.MAX_SAFE_INTEGER) return fail('identity-exhausted');
    return { ok: true, code: 'can-start', targetNodeKey: context.targetNodeKey };
}

export function startMining(fleet, context) {
    const result = miningStartEligibility(fleet, context);
    if (!result.ok) return result;
    const controller = fleet.controller;
    controller.phase = 'running';
    controller.cycleId++;
    controller.targetNodeKey = context.targetNodeKey;
    controller.stopReason = null;
    return { ok: true, code: 'started', targetNodeKey: controller.targetNodeKey, cycleId: controller.cycleId };
}

/** Reserve before launch. Payload identity is allocated only on a completed cut. */
export function reserveMiningJob(fleet, unitId, context) {
    const unit = miner(fleet, unitId);
    if (!alive(unit)) return fail('invalid-miner');
    if (!Array.isArray(context.unitIds) || !context.unitIds.includes(unitId)) return fail('not-equipped');
    if (unit.state !== 'stowed' || unit.job || unit.payload) return fail('miner-busy');
    if (fleet.controller.phase !== 'running') return fail('not-running');
    if (fleet.controller.targetNodeKey !== context.targetNodeKey) return fail('target-changed');
    const reason = reservationFailure(fleet, context);
    if (reason) return fail(reason);
    unit.job = { targetNodeKey: context.targetNodeKey, cycleId: fleet.controller.cycleId,
        commodityId: context.commodityId, units: 1, unitMass: context.unitMass,
        cutTime: 0, cutSeconds: DRONE_TYPES.mining.cutSecondsPerUnit };
    unit.state = 'launching';
    unit.phaseTime = 0;
    unit.recallTime = 0;
    return { ok: true, code: 'job-reserved', unitId, targetNodeKey: context.targetNodeKey,
        cycleId: unit.job.cycleId, units: 1, unitMass: unit.job.unitMass };
}

/** Cancel uncut work only. Carried ore keeps its reservation until delivery/loss. */
export function cancelMiningJob(fleet, unitId, reason = 'cancelled') {
    const unit = miner(fleet, unitId);
    if (!unit?.job) return fail('no-job');
    const job = unit.job;
    unit.job = null;
    if (unit.state !== 'destroyed' && unit.state !== 'stowed') {
        unit.state = 'returning';
        unit.phaseTime = 0;
    }
    return { ok: true, code: 'job-cancelled', reason, unitId,
        targetNodeKey: job.targetNodeKey, cycleId: job.cycleId, releasedMass: job.unitMass };
}

/** Arrival transitions only; geometry/movement remain in game.js. */
export function transitionMinerUnit(fleet, unitId, nextState) {
    const unit = miner(fleet, unitId);
    if (!alive(unit)) return fail('invalid-miner');
    if (!Object.hasOwn(transitions, unit.state) || !transitions[unit.state].includes(nextState)) return fail('invalid-transition');
    if (nextState === 'launching') return fail('reserve-before-launch');
    if ((nextState === 'outbound' || nextState === 'mining') && (!unit.job || unit.payload)) return fail('no-job');
    if (nextState === 'stowed' && (unit.job || unit.payload)) return fail('miner-busy');
    if (nextState === 'returning' && unit.job) return cancelMiningJob(fleet, unitId);
    unit.state = nextState;
    unit.phaseTime = 0;
    if (nextState === 'stowed') unit.recallTime = 0;
    return { ok: true, code: 'state-changed', unitId, state: nextState };
}

// Check live packets as well as the persisted monotonic counter after hydration.
// Never wrap counters; nextUnitId belongs exclusively to ownership/service code.
function nextPacketNumber(fleet) {
    let next = fleet.nextPacketId;
    if (!Number.isSafeInteger(next) || next < 1) return null;
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const packetId = fleet.unitsById[id].payload?.packetId;
        if (typeof packetId !== 'string' || !packetId.startsWith('drone-packet-')) continue;
        const number = Number(packetId.slice(13));
        if (Number.isSafeInteger(number) && number >= next) next = number + 1;
    }
    return Number.isSafeInteger(next) && next < Number.MAX_SAFE_INTEGER ? next : null;
}

function cutFailure(fleet, job, context) {
    let reason = null;
    if (fleet.controller.phase !== 'running') reason = 'not-running';
    else if (job.cycleId !== fleet.controller.cycleId || job.targetNodeKey !== fleet.controller.targetNodeKey
        || job.targetNodeKey !== context.targetNodeKey) reason = 'target-changed';
    else reason = targetFailure(context);
    if (!reason && (job.units !== 1 || job.commodityId !== context.commodityId || job.unitMass !== context.unitMass)) reason = 'invalid-job';
    if (!reason && (!nonnegative(context.cargoMass) || !nonnegative(context.cargoCapacity)
        || context.cargoMass + miningReservedMass(fleet) > context.cargoCapacity)) reason = 'cargo-full';
    if (!reason && (!positive(job.cutSeconds) || !nonnegative(job.cutTime))) reason = 'invalid-job';
    return reason;
}

/** Atomic cut: rock -1, job -> one packet, reserved cargo mass unchanged.
 * Invalid/stale context cancels uncut work. Incomplete cuts are harmless no-ops. */
export function completeMiningCut(fleet, unitId, context) {
    const unit = miner(fleet, unitId);
    if (!alive(unit) || unit.state !== 'mining' || !unit.job || unit.payload) return fail('no-mining-job');
    const job = unit.job;
    const reason = cutFailure(fleet, job, context);
    if (reason) return cancelMiningJob(fleet, unitId, reason);
    if (job.cutTime < job.cutSeconds) return fail('cut-incomplete');
    const number = nextPacketNumber(fleet);
    if (number === null) return cancelMiningJob(fleet, unitId, 'identity-exhausted');
    const payload = { packetId: `drone-packet-${number}`, unitId,
        targetNodeKey: job.targetNodeKey, cycleId: job.cycleId,
        commodityId: job.commodityId, units: 1, unitMass: job.unitMass };
    context.deposit.remaining--;
    fleet.nextPacketId = number + 1;
    unit.job = null;
    unit.payload = payload;
    unit.state = 'returning';
    unit.phaseTime = 0;
    return { ok: true, code: 'cut-completed', ...payload, remaining: context.deposit.remaining };
}

/** Per-step cut timer: no allocations until completion/cancellation; bad dt never
 * advances. The caller also uses miningRecallReason to recall the whole cycle. */
export function advanceMiningCut(fleet, unitId, dt, context) {
    if (!positive(dt)) return null;
    const unit = miner(fleet, unitId);
    if (!alive(unit) || unit.state !== 'mining' || !unit.job || unit.payload) return null;
    const job = unit.job;
    const reason = cutFailure(fleet, job, context);
    if (reason) return cancelMiningJob(fleet, unitId, reason);
    job.cutTime = Math.min(job.cutSeconds, job.cutTime + dt);
    return job.cutTime >= job.cutSeconds ? completeMiningCut(fleet, unitId, context) : null;
}

/** Per-step lifecycle clocks; caller handles arrival and recall timeout loss.
 * Returns false for invalid dt/state. No allocations and no catch-up overflow. */
export function advanceMinerTimers(fleet, unitId, dt) {
    if (!positive(dt)) return false;
    const unit = miner(fleet, unitId);
    if (!alive(unit) || !airborne(unit)) return false;
    unit.phaseTime = Math.min(Number.MAX_VALUE, (nonnegative(unit.phaseTime) ? unit.phaseTime : 0) + dt);
    if (fleet.controller.phase === 'recalling')
        unit.recallTime = Math.min(DRONE_RULES.recallSeconds, (nonnegative(unit.recallTime) ? unit.recallTime : 0) + dt);
    return true;
}

/** Dock-only atomic delivery. A full/invalid hold retains the packet and its
 * reservation for retry or explicit destruction; it never silently loses ore.
 * Count our existing reservation once, allowing an exactly full hold. */
export function deliverMiningPayload(fleet, unitId, context) {
    const unit = miner(fleet, unitId);
    if (!alive(unit) || !unit.payload) return fail('no-payload');
    if (unit.state !== 'docking' || unit.job) return fail('not-docking');
    const payload = unit.payload;
    if (!key(payload.packetId) || payload.unitId !== unitId || payload.units !== 1
        || !key(payload.commodityId) || !positive(payload.unitMass)) return fail('invalid-payload');
    if (!nonnegative(context.cargoMass) || !nonnegative(context.cargoCapacity)
        || context.cargoMass + miningReservedMass(fleet) > context.cargoCapacity) return fail('cargo-full');
    const cargo = context.cargo;
    if (!cargo || typeof cargo !== 'object' || Array.isArray(cargo)) return fail('invalid-cargo');
    const count = Object.hasOwn(cargo, payload.commodityId) ? cargo[payload.commodityId] : 0;
    if (!Number.isSafeInteger(count) || count < 0 || count >= Number.MAX_SAFE_INTEGER) return fail('invalid-cargo');
    // defineProperty also treats an imported '__proto__' commodity as data.
    Object.defineProperty(cargo, payload.commodityId, { value: count + 1, writable: true, enumerable: true, configurable: true });
    unit.payload = null;
    return { ok: true, code: 'payload-delivered', ...payload, releasedMass: payload.unitMass };
}

/** Loss consumes carried ore permanently. Ownership/bay cleanup is the caller's
 * job; retaining this destroyed record cannot mint a replacement unit. */
export function destroyMiningUnit(fleet, unitId, reason = 'destroyed') {
    const unit = miner(fleet, unitId);
    if (!unit || unit.state === 'destroyed') return fail('already-destroyed');
    const payload = unit.payload;
    const job = unit.job;
    unit.job = null;
    unit.payload = null;
    unit.hull = 0;
    unit.state = 'destroyed';
    unit.phaseTime = 0;
    unit.recallTime = 0;
    return { ok: true, code: 'miner-destroyed', reason, unitId,
        packetId: payload?.packetId ?? null, targetNodeKey: payload?.targetNodeKey ?? job?.targetNodeKey ?? null,
        commodityId: payload?.commodityId ?? null, lostUnits: payload ? 1 : 0,
        releasedMass: (job?.unitMass ?? 0) + (payload?.unitMass ?? 0) };
}

export function miningRecallEligibility(fleet) {
    if (fleet.controller.phase === 'recalling') return fail('already-recalling');
    if (fleet.controller.phase === 'running') return { ok: true, code: 'can-recall' };
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type === 'mining' && (airborne(unit) || unit.job || unit.payload)) return { ok: true, code: 'can-recall' };
    }
    return fail('idle');
}

/** Cancel all uncut miner jobs; packets return intact. Selection changes do not
 * change the cycle's target key. Repeated recall does not reset timeout clocks. */
export function recallMining(fleet, reason = 'recalled') {
    const result = miningRecallEligibility(fleet);
    if (!result.ok) return result;
    const controller = fleet.controller;
    controller.phase = 'recalling';
    controller.stopReason = reason;
    let cancelledJobs = 0;
    let releasedMass = 0;
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type !== 'mining') continue;
        if (unit.job) { cancelledJobs++; releasedMass += unit.job.unitMass; unit.job = null; }
        unit.recallTime = 0;
        if (airborne(unit) && unit.state !== 'returning' && unit.state !== 'docking') {
            unit.state = 'returning';
            unit.phaseTime = 0;
        }
    }
    return { ok: true, code: 'recalling', reason, targetNodeKey: controller.targetNodeKey,
        cycleId: controller.cycleId, cancelledJobs, releasedMass };
}

export function miningStopEligibility(fleet, targetNodeKey = fleet.controller.targetNodeKey) {
    if (fleet.controller.phase !== 'running') return fail('not-running');
    if (targetNodeKey !== fleet.controller.targetNodeKey) return fail('target-changed');
    return { ok: true, code: 'can-stop' };
}

export function stopMining(fleet, targetNodeKey = fleet.controller.targetNodeKey) {
    const result = miningStopEligibility(fleet, targetNodeKey);
    return result.ok ? recallMining(fleet, 'stopped') : result;
}

/** Call after docking/destruction. Returns null until the recall finishes. */
export function finishMiningRecall(fleet) {
    const controller = fleet.controller;
    if (controller.phase !== 'recalling') return null;
    for (const id in fleet.unitsById) {
        if (!Object.hasOwn(fleet.unitsById, id)) continue;
        const unit = fleet.unitsById[id];
        if (unit.type === 'mining' && (airborne(unit) || unit.job || unit.payload)) return null;
    }
    const targetNodeKey = controller.targetNodeKey;
    controller.phase = 'idle';
    controller.targetNodeKey = null;
    return { ok: true, code: 'recall-completed', targetNodeKey,
        cycleId: controller.cycleId, reason: controller.stopReason };
}
