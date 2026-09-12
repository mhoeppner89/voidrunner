import { createDroneUnit, DRONE_FLEET_VERSION, DRONE_RULES, DRONE_TYPES, validateDroneBays } from './droneData.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code) => ({ ok: false, code });
const slotKey = (bayId, position) => JSON.stringify([bayId, position]);

// Stage 1 owns normalization. Service rejects broken ownership instead of
// normalizing live loadouts or silently granting units during a price preview.
function inspect(player) {
    if (!record(player)) return fail('invalid-player');
    const fleet = player.droneFleet;
    const loadouts = player.outfitting?.loadouts ?? {};
    if (!record(loadouts)) return fail('invalid-loadouts');
    if (fleet == null) {
        const configured = Object.values(loadouts).some((fit) => fit?.droneBays?.length);
        return configured ? fail('invalid-fleet') : { ok: true, fleet: null, bays: [], loadouts };
    }
    if (!record(fleet) || fleet.version !== DRONE_FLEET_VERSION
        || !record(fleet.unitsById) || !Array.isArray(fleet.lockerIds)
        || !Number.isSafeInteger(fleet.nextUnitId) || fleet.nextUnitId < 1)
        return fail('invalid-fleet');
    let nextUnitId = fleet.nextUnitId;
    for (const [id, unit] of Object.entries(fleet.unitsById)) {
        if (!id || !record(unit) || unit.id !== id || !Object.hasOwn(DRONE_TYPES, unit.type))
            return fail('invalid-unit');
        const type = DRONE_TYPES[unit.type];
        if (!Number.isFinite(unit.hull) || unit.hull <= 0 || unit.hull > type.maxHull
            || unit.state === 'destroyed'
            || (unit.type === 'pdc' && (!Number.isSafeInteger(unit.ammo)
                || unit.ammo < 0 || unit.ammo > type.magazineCapacity)))
            return fail('invalid-unit');
        if (/^drone-unit-\d+$/.test(id)) {
            const suffix = Number(id.slice('drone-unit-'.length));
            if (!Number.isSafeInteger(suffix) || suffix >= Number.MAX_SAFE_INTEGER)
                return fail('invalid-unit-counter');
            nextUnitId = Math.max(nextUnitId, suffix + 1);
        }
    }
    const owned = new Set();
    for (const [shipId, fit] of Object.entries(loadouts)) {
        if (!record(fit) || validateDroneBays(shipId, fit.droneBays, fleet).length)
            return fail('invalid-drone-bays');
        for (const bay of fit.droneBays ?? []) {
            for (const id of bay.unitIds) {
                if (id === null) continue;
                if (owned.has(id)) return fail('duplicate-ownership');
                owned.add(id);
            }
        }
    }
    for (const id of fleet.lockerIds) {
        if (typeof id !== 'string' || !Object.hasOwn(fleet.unitsById, id) || owned.has(id))
            return fail('invalid-locker');
        owned.add(id);
    }
    if (owned.size !== Object.keys(fleet.unitsById).length) return fail('unowned-unit');
    const fit = Object.hasOwn(loadouts, player.shipId) ? loadouts[player.shipId] : null;
    if (!fit) return fail('missing-loadout');
    return { ok: true, fleet, loadouts, bays: fit.droneBays ?? [], nextUnitId };
}

/** Read-only quote for the active ship. fillSlots defaults to all positions;
 * pass [] to repair/rearm only, or [{ bayId, position }] (zero-based) to choose.
 * Existing equipped survivors and locker units used by this quote are serviced.
 * Other ships and unused locker stock are untouched. Replacement lines include
 * free locker assignments; purchased PDC units already include a full magazine.
 * Invalid state returns { ok: false, code }, never a misleading zero price. */
export function quoteDroneService(player, options = {}) {
    if (!record(options)) return fail('invalid-options');
    const state = inspect(player);
    if (!state.ok) return state;
    const { fleet, bays, loadouts } = state;
    const legalSlots = new Set(bays.flatMap((bay) => bay.unitIds.map((_, position) => slotKey(bay.bayId, position))));
    let fillSlots = null;
    if (options.fillSlots !== undefined && options.fillSlots !== null) {
        if (!Array.isArray(options.fillSlots)) return fail('invalid-slots');
        const keys = new Set();
        for (const slot of options.fillSlots) {
            if (!record(slot) || typeof slot.bayId !== 'string' || !Number.isSafeInteger(slot.position))
                return fail('invalid-slots');
            const key = slotKey(slot.bayId, slot.position);
            if (!legalSlots.has(key)) return fail('invalid-slots');
            keys.add(key);
        }
        fillSlots = [...keys].sort().map((key) => {
            const [bayId, position] = JSON.parse(key);
            return { bayId, position };
        });
    }
    const selected = fillSlots && new Set(fillSlots.map((slot) => slotKey(slot.bayId, slot.position)));
    const lines = [];
    const serviceIds = new Set();
    const usedLocker = new Set();
    let nextUnitId = state.nextUnitId;
    for (const bay of bays) {
        for (const [position, id] of bay.unitIds.entries()) {
            if (id !== null) {
                serviceIds.add(id);
                continue;
            }
            if (selected && !selected.has(slotKey(bay.bayId, position))) continue;
            const lockerId = fleet.lockerIds.find((candidate) => !usedLocker.has(candidate)
                && fleet.unitsById[candidate].type === bay.mode);
            let unitId = lockerId;
            if (lockerId) {
                usedLocker.add(lockerId);
                serviceIds.add(lockerId);
            } else {
                // Leave room for the next counter value; never wrap/reuse IDs.
                if (nextUnitId >= Number.MAX_SAFE_INTEGER) return fail('unit-id-exhausted');
                unitId = `drone-unit-${nextUnitId++}`;
            }
            const unitPrice = lockerId ? 0 : DRONE_TYPES[bay.mode].replacementPrice;
            lines.push({ kind: 'replacement', type: bay.mode, bayId: bay.bayId,
                position, unitId, source: lockerId ? 'locker' : 'purchase',
                quantity: 1, unitPrice, cost: unitPrice });
        }
    }
    for (const id of serviceIds) {
        const unit = fleet.unitsById[id];
        const type = DRONE_TYPES[unit.type];
        const missingHull = type.maxHull - unit.hull;
        if (missingHull > 0) lines.push({ kind: 'repair', unitId: id, type: unit.type,
            quantity: missingHull, unitPrice: DRONE_RULES.repairPricePerHull,
            cost: Math.ceil(missingHull * DRONE_RULES.repairPricePerHull) });
        if (unit.type === 'pdc' && unit.ammo < type.magazineCapacity) {
            const quantity = type.magazineCapacity - unit.ammo;
            lines.push({ kind: 'rounds', unitId: id, type: unit.type,
                quantity, unitPrice: type.roundPrice, cost: quantity * type.roundPrice });
        }
    }
    const total = lines.reduce((sum, line) => sum + line.cost, 0);
    if (!Number.isSafeInteger(total)) return fail('invalid-cost');
    // Snapshot includes ownership and runtime state, so loss, damage, refitting,
    // or a locker change invalidates the offer. Credits are checked separately.
    let fingerprint;
    try {
        fingerprint = JSON.stringify({ shipId: player.shipId, fleet,
            bays: Object.entries(loadouts).map(([shipId, fit]) => [shipId, fit.droneBays]),
            fillSlots, lines, nextUnitId });
    } catch {
        return fail('invalid-fleet');
    }
    return { ok: true, shipId: player.shipId, fillSlots, lines, total, fingerprint, nextUnitId };
}

/** Commit synchronously after the caller checks docking AND service availability:
 * commitDroneService(player, { authorized: docked && hasService, expected: quote }).
 * expected may also be quote.fingerprint (supply the same fillSlots in that case).
 * A fresh quote is always recomputed; caller-provided line items/prices are never
 * applied. Failures leave every live record unchanged. Persist/refresh in caller.
 * This deducts drone costs itself: do not also include them in another debit. */
export function commitDroneService(player, options = {}) {
    if (!record(options)) return fail('invalid-options');
    if (options.authorized !== true) return fail('service-not-authorized');
    const expected = options.expected;
    const fingerprint = typeof expected === 'string' ? expected : expected?.fingerprint;
    if (typeof fingerprint !== 'string' || !fingerprint) return fail('quote-required');
    const fillSlots = options.fillSlots === undefined && record(expected) ? expected.fillSlots : options.fillSlots;
    const quote = quoteDroneService(player, { fillSlots });
    if (!quote.ok) return quote;
    if (fingerprint !== quote.fingerprint) return fail('stale-quote');
    if (!Number.isFinite(player.credits) || player.credits < 0) return fail('invalid-credits');
    if (player.credits < quote.total) return fail('insufficient-credits');
    if (!quote.lines.length) return { ok: true, code: 'already-serviced', cost: 0, quote };

    // Stage all changes off the live fleet/loadout. Only canonical construction
    // creates units; surviving records keep their other health/runtime fields.
    const fleet = player.droneFleet;
    const nextFleet = { ...fleet, unitsById: { ...fleet.unitsById },
        lockerIds: [...fleet.lockerIds], nextUnitId: quote.nextUnitId };
    const loadouts = player.outfitting.loadouts;
    const fit = loadouts[player.shipId];
    const nextFit = { ...fit, droneBays: fit.droneBays.map((bay) => ({ ...bay, unitIds: [...bay.unitIds] })) };
    for (const line of quote.lines) {
        if (line.kind === 'replacement') {
            if (line.source === 'purchase') nextFleet.unitsById[line.unitId] = createDroneUnit(line.unitId, line.type);
            else nextFleet.lockerIds = nextFleet.lockerIds.filter((id) => id !== line.unitId);
            nextFit.droneBays.find((bay) => bay.bayId === line.bayId).unitIds[line.position] = line.unitId;
        } else {
            const unit = { ...nextFleet.unitsById[line.unitId] };
            if (line.kind === 'repair') unit.hull = DRONE_TYPES[unit.type].maxHull;
            else unit.ammo = DRONE_TYPES[unit.type].magazineCapacity;
            nextFleet.unitsById[line.unitId] = unit;
        }
    }
    player.credits -= quote.total;
    player.droneFleet = nextFleet;
    loadouts[player.shipId] = nextFit;
    return { ok: true, code: 'serviced', cost: quote.total, quote };
}
