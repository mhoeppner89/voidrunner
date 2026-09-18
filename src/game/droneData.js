// Canonical save/fitting data only. No renderer, world generator or timers.
const freeze = Object.freeze;
const emptyBays = freeze([]);
const bays = (count) => freeze(Array.from({ length: count }, (_, index) => {
    const bayId = `drone-${index + 1}`;
    // Anchor names are stable; physical coordinates belong to hull geometry.
    return freeze({ bayId, launchAnchorId: `${bayId}-launch`, dockAnchorId: `${bayId}-dock` });
}));
export const DRONE_BAY_LAYOUTS = freeze({
    wayfarer: bays(1), prospector: bays(3), torsas:bays(1), astra:bays(1),
    talon: emptyBays, vanguard: emptyBays, lancer: emptyBays, atlas: emptyBays,
});
export const droneBayLayoutFor = (shipId) => Object.hasOwn(DRONE_BAY_LAYOUTS, shipId)
    ? DRONE_BAY_LAYOUTS[shipId] : emptyBays;
export const DRONE_BAY_CAPACITY = freeze({ mining: 2, pdc: 1 });
export const DRONE_FLEET_VERSION = 1;
// Provisional tuning from the approved 0.8.2 addendum, in simulation units.
export const DRONE_TYPES = freeze({
    mining: freeze({ maxHull: 20, collisionRadius: 0.5, cruiseSpeed: 120,
        acceleration: 120, payloadUnits: 1, cutSecondsPerUnit: 2.4, replacementPrice: 250 }),
    pdc: freeze({ maxHull: 40, collisionRadius: 0.75, cruiseSpeed: 160,
        acceleration: 160, payloadUnits: 0, replacementPrice: 1500,
        escortDistance: 15, escortOrbitSeconds: 12, magazineCapacity: 120, shotInterval: 0.4,
        projectileSpeed: 500, interceptRange: 300, attackRange: 300, roundPrice: 2 }),
});
export const DRONE_RULES = freeze({ operatingRange: 100, recallSeconds: 15,
    steeringHz: 10, repairPricePerHull: 5 });
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unitId = (value) => typeof value === 'string' && value.length > 0 ? value : null;
const copy = (value) => JSON.parse(JSON.stringify(value));
export const canMineWithHull = id => id === 'wayfarer' || id === 'prospector';
const validMode = (mode) => mode === 'mining' || mode === 'pdc';

// Empty positions stay empty: configuration normalization never creates stock.
export const normalizeDroneBays = (shipId, source) => {
    const values = Array.isArray(source) ? source : [];
    const seen = new Set();
    return droneBayLayoutFor(shipId).map(({ bayId }, index) => {
        const raw = values[index];
        const mode = !canMineWithHull(shipId) ? 'pdc' : validMode(raw?.mode) ? raw.mode : 'mining';
        const unitIds = Array.from({ length: DRONE_BAY_CAPACITY[mode] }, (_, position) => {
            const id = Array.isArray(raw?.unitIds) ? unitId(raw.unitIds[position]) : null;
            if (!id || seen.has(id) || raw?.bayId !== bayId || raw?.mode !== mode) return null;
            seen.add(id);
            return id;
        });
        return { bayId, mode, unitIds };
    });
};
export const createDefaultDroneBays = (shipId) => normalizeDroneBays(shipId);

export const validateDroneBays = (shipId, source, fleet) => {
    const errors = [];
    const layout = droneBayLayoutFor(shipId);
    // Omission remains legal for pre-schema-3 callers.
    if (source === undefined) return errors;
    if (!Array.isArray(source) || source.length !== layout.length)
        return [{ code: 'invalid-drone-bay-count', slot: 'droneBays', expected: layout.length }];
    const seen = new Set();
    for (const [index, bay] of source.entries()) {
        if (!isRecord(bay) || bay.bayId !== layout[index].bayId || !validMode(bay.mode)
            || bay.mode === 'mining' && !canMineWithHull(shipId)
            || !Array.isArray(bay.unitIds) || bay.unitIds.length !== DRONE_BAY_CAPACITY[bay.mode]) {
            errors.push({ code: 'invalid-drone-bay', slot: 'droneBays', index });
            continue;
        }
        for (const id of bay.unitIds) {
            if (id === null) continue;
            const unit = unitId(id) && Object.hasOwn(fleet?.unitsById ?? {}, id) ? fleet.unitsById[id] : null;
            if (!unit || unit.id !== id || unit.type !== bay.mode
                || !Number.isFinite(unit.hull) || unit.hull <= 0 || seen.has(id))
                errors.push({ code: 'invalid-drone-unit', slot: 'droneBays', index, unitId: id });
            seen.add(id);
        }
    }
    return errors;
};

export const createDroneUnit = (id, type = 'mining') => {
    if (!unitId(id) || !Object.hasOwn(DRONE_TYPES, type)) throw new TypeError('Invalid drone identity or type.');
    const definition = DRONE_TYPES[type];
    return { id, type, hull: definition.maxHull,
        ...(type === 'pdc' ? { ammo: definition.magazineCapacity } : {}),
        state: 'stowed', position: null, velocity: null, rotation: null,
        phaseTime: 0, recallTime: 0, fireCooldown: 0, job: null, payload: null };
};
export const createDroneFleet = () => ({
    version: DRONE_FLEET_VERSION, nextUnitId: 1, nextPacketId: 1,
    unitsById: {}, lockerIds: [],
    controller: { phase: 'idle', cycleId: 0, targetNodeKey: null, stopReason: null },
    pdcPolicy: 'defend', migrationGrants: { initialComplement: false },
});
const counter = (value) => Number.isSafeInteger(value) && value > 0 ? value : 1;

/** Reconcile ownership against normalized loadouts, retaining orphaned units
 * in the locker. Mutates only loadouts[*].droneBays; returns a detached fleet.
 * grantInitial is for new careers / legacy hydration ONLY, never fitting or
 * trading. Even an empty existing fleet is authoritative (loss is permanent).
 * Runtime records are copied intact; loading does not advance work or heal. */
export const normalizeDroneFleet = (candidate, loadouts = {}, { grantInitial = false } = {}) => {
    const source = isRecord(candidate) ? candidate : null;
    const shouldGrant = candidate == null && grantInitial;
    const fleet = source ? { ...createDroneFleet(), ...copy(source) } : createDroneFleet();
    fleet.version = DRONE_FLEET_VERSION;
    fleet.nextUnitId = counter(fleet.nextUnitId);
    fleet.nextPacketId = counter(fleet.nextPacketId);
    fleet.unitsById = Object.fromEntries(Object.entries(isRecord(fleet.unitsById) ? fleet.unitsById : {})
        .filter(([id, unit]) => unitId(id) && isRecord(unit) && unit.id === id
            && Object.hasOwn(DRONE_TYPES, unit.type) && Number.isFinite(unit.hull) && unit.hull > 0));
    fleet.controller = { ...createDroneFleet().controller, ...(isRecord(fleet.controller) ? fleet.controller : {}) };
    fleet.pdcPolicy = fleet.pdcPolicy === 'stow' ? 'stow' : 'defend';
    fleet.migrationGrants = { ...(isRecord(fleet.migrationGrants) ? fleet.migrationGrants : {}), initialComplement: true };
    // Counters never reuse surviving identities, including payload packets.
    const advance = (id, prefix, key) => {
        if (typeof id !== 'string' || !id.startsWith(prefix)) return;
        const suffix = Number(id.slice(prefix.length));
        if (Number.isSafeInteger(suffix) && suffix >= 0 && suffix < Number.MAX_SAFE_INTEGER)
            fleet[key] = Math.max(fleet[key], suffix + 1);
    };
    for (const unit of Object.values(fleet.unitsById)) {
        advance(unit.id, 'drone-unit-', 'nextUnitId');
        advance(unit.payload?.packetId, 'drone-packet-', 'nextPacketId');
    }
    const assigned = new Set();
    for (const [shipId, loadout] of Object.entries(loadouts)) {
        loadout.droneBays = normalizeDroneBays(shipId, loadout.droneBays);
        for (const bay of loadout.droneBays) {
            if (shouldGrant) {
                bay.mode = 'mining';
                bay.unitIds = Array(DRONE_BAY_CAPACITY.mining).fill(null);
            }
            bay.unitIds = bay.unitIds.map((id) => {
                if (shouldGrant) {
                    id = `drone-unit-${fleet.nextUnitId++}`;
                    fleet.unitsById[id] = createDroneUnit(id);
                }
                const unit = id && Object.hasOwn(fleet.unitsById, id) ? fleet.unitsById[id] : null;
                if (!unit || unit.type !== bay.mode || assigned.has(id)) return null;
                assigned.add(id);
                return id;
            });
        }
    }
    const locker = Array.isArray(fleet.lockerIds) ? fleet.lockerIds : [];
    fleet.lockerIds = [...new Set([...locker, ...Object.keys(fleet.unitsById)])]
        .filter((id) => unitId(id) && Object.hasOwn(fleet.unitsById, id) && !assigned.has(id));
    return fleet;
};
