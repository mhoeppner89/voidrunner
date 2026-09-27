// Explicit runtime board-cycle cache. No save schema change is required.
// Each world has its own cache; imported/restored saves cannot share entries.
const EMPTY_OFFERS = Object.freeze([]);

export function offerCycleFromId(offers, locationId) {
    const prefix = `${locationId}-`;
    for (const offer of offers) {
        if (offer?.authored || typeof offer?.id !== 'string'
            || !offer.id.startsWith(prefix)) continue;
        const end = offer.id.indexOf('-', prefix.length);
        if (end < 0) continue;
        const token = offer.id.slice(prefix.length, end);
        if (!/^\d+$/.test(token)) continue;
        const cycle = Number(token);
        if (Number.isSafeInteger(cycle)) return cycle;
    }
    return undefined;
}

/**
 * Preserve procedural generation and authored synchronization; avoid deriving
 * a cycle from IDs every simulation step. Array replacement invalidates a
 * board entry automatically. After an in-place external rewrite, use force.
 * An empty or race-only generated board is valid for its current cycle too.
 */
export function createMissionOfferRefresher({
    locationIds, generateOffers, syncAuthored, syncRaces, cycleSeconds = 150,
}) {
    if (!Array.isArray(locationIds) || typeof generateOffers !== 'function'
        || typeof syncAuthored !== 'function'
        || !Number.isFinite(cycleSeconds) || cycleSeconds <= 0) {
        throw new TypeError('Invalid mission offer refresher configuration.');
    }
    const worlds = new WeakMap();
    return function refreshMissionOffers(save, force = false) {
        const world = save.world;
        const cycle = Math.floor(world.time / cycleSeconds);
        const authoredDirty = world.localContractOffersDirty === true;
        const racesDirty = world.raceOffersDirty === true;
        let boards = worlds.get(world);
        if (!boards) worlds.set(world, boards = new Map());
        for (const locationId of locationIds) {
            const current = world.offers[locationId];
            const existing = Array.isArray(current) ? current : EMPTY_OFFERS;
            let entry = boards.get(locationId);
            if (!entry) {
                entry = { offers: undefined, cycle: undefined };
                boards.set(locationId, entry);
            }
            const knownCycle = entry.offers === existing
                ? entry.cycle : offerCycleFromId(existing, locationId);
            if (force || knownCycle !== cycle) {
                // Cache only successfully generated boards. A thrown generator
                // leaves the dirty flag set and can be retried on the next call.
                const next = generateOffers(locationId, save);
                world.offers[locationId] = next;
                entry.offers = next;
                entry.cycle = cycle;
            } else {
                let next = existing;
                if (authoredDirty) next = syncAuthored(next, locationId, save);
                if (racesDirty && syncRaces && next.some(offer => offer.kind === 'race'))
                    next = syncRaces(next, locationId, save);
                if (next !== existing) world.offers[locationId] = next;
                entry.offers = next;
                entry.cycle = knownCycle;
            }
        }
        if (authoredDirty) delete world.localContractOffersDirty;
        if (racesDirty && syncRaces) delete world.raceOffersDirty;
    };
}
