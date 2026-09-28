import { COMMODITIES, LOCATIONS, SHIPS, commodityIds } from './data.js';
import {
    commissionOutfittingForShip,
    createOutfittingState,
    normalizeOutfitting,
    outfittingUsage,
    projectLegacyEquipment,
    projectLegacyWeaponId,
} from './outfitting.js';

export const HULL_TRADE_IN_RATE = 0.5;

const clone = (value) => JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const actualCargoMass = (player = {}) => {
    let mass = 0;
    for (const item of Array.isArray(player.sealedCargo) ? player.sealedCargo : [])
        mass += Math.max(0, finite(item?.units));
    for (const id of commodityIds)
        mass += Math.max(0, finite(player.cargo?.[id])) * COMMODITIES[id].mass;
    return Math.max(mass, Math.max(0, finite(player.cargoMass)));
};
const resolvedCargoMass = (player, requested) => Math.max(actualCargoMass(player), Math.max(0, finite(requested)));
export const shipResources = player => Object.fromEntries(['shield','hull','energy','fuel','ammo','missiles','launcherMagazines','activeLauncherMountId','launcherFireMode'].filter(k=>player[k]!==undefined).map(k=>[k,clone(player[k])]));
const context = (player, cargoMass) => ({
    credits: finite(player?.credits),
    shipId: player?.shipId ?? null,
    ownedShips: clone(player?.ownedShips ?? null),
    dockedAt: player?.dockedAt ?? null,
    cargo: clone(player?.cargo ?? null),
    sealedCargo: clone(player?.sealedCargo ?? null),
    cargoMass: finite(cargoMass),
    outfitting: clone(player?.outfitting ?? null),
    equipment: clone(player?.equipment ?? null),
    storedShips: clone(player?.storedShips ?? null),
    resources: shipResources(player),
    reputation: clone(player?.reputation ?? null),
});
const fingerprint = (player, cargoMass, targetShipId, keepCurrent) => JSON.stringify({
    ...context(player, cargoMass),
    targetShipId,
    keepCurrent: Boolean(keepCurrent),
});

/** Pure purchase, trade-in or stored-ship switch quote. A negative amountDue means the yard pays the
 * pilot the difference after accepting the old hull at half base value. */
export const quoteShipTrade = (player = {}, targetShipId, options = {}) => {
    const current = SHIPS[player.shipId];
    const target = SHIPS[targetShipId];
    if (!current)
        return { ok: false, code: 'unknown-current-ship' };
    if (!target)
        return { ok: false, code: 'unknown-ship' };
    if (!player.dockedAt)
        return { ok: false, code: 'not-docked' };
    if (!LOCATIONS[player.dockedAt]?.services?.shipyard)
        return { ok: false, code: 'service-unavailable' };
    if (targetShipId === player.shipId)
        return { ok: false, code: 'already-owned' };
    const stored = player.storedShips?.[targetShipId];
    const switching = Boolean(stored && player.ownedShips?.includes(targetShipId));
    if (switching && stored.locationId !== player.dockedAt) return {ok:false,code:'stored-elsewhere'};
    const keep = switching || options.keepCurrent === true;
    if (!switching && !(LOCATIONS[player.dockedAt]?.shipsForSale ?? []).includes(targetShipId))
        return { ok: false, code: 'not-for-sale' };
    if (!switching && target.requiredReputation > (player.reputation?.[target.requiredFaction] ?? 0))
        return {ok:false,code:'reputation-required',requiredReputation:target.requiredReputation};
    const cargoMass = resolvedCargoMass(player, options.cargoMass);
    const tradeIn = keep ? 0 : Math.round(current.price * HULL_TRADE_IN_RATE);
    const amountDue = switching ? 0 : target.price - tradeIn;
    const creditsBefore = Number(player.credits);
    if (!Number.isFinite(creditsBefore) || creditsBefore < 0)
        return { ok: false, code: 'invalid-credits' };
    const creditsAfter = creditsBefore - amountDue;
    if (creditsAfter < 0)
        return { ok: false, code: 'insufficient-credits', tradeIn, amountDue, creditsBefore };
    const source = normalizeOutfitting(clone(player));
    const remaining = (player.ownedShips ?? [player.shipId]).filter(id=>keep || id!==player.shipId);
    const ownedShips = [...new Set([...remaining,targetShipId])];
    let outfitting;
    if (keep) {
        outfitting=clone(source);
        if (!switching) {const fresh=createOutfittingState([targetShipId]);outfitting.loadouts[targetShipId]=fresh.loadouts[targetShipId];outfitting.factory[targetShipId]=fresh.factory[targetShipId];}
    } else {
        // Only the traded hull contributes equipment; stored ships keep their fits.
        outfitting=commissionOutfittingForShip({...player,ownedShips:[player.shipId],outfitting:{...source,loadouts:{[player.shipId]:source.loadouts[player.shipId]},factory:{[player.shipId]:source.factory[player.shipId]}}},targetShipId);
        for (const id of remaining) {outfitting.loadouts[id]=clone(source.loadouts[id]);outfitting.factory[id]=clone(source.factory[id]);}
    }
    if (!outfitting)
        return { ok: false, code: 'commission-failed' };
    const candidate = { ...player, shipId: targetShipId, ownedShips, outfitting };
    const cargoCapacity = outfittingUsage(candidate, targetShipId).cargoCapacity;
    if (cargoMass > cargoCapacity)
        return { ok: false, code: 'cargo-over-capacity', cargoMass, cargoCapacity, tradeIn, amountDue };
    const equipment = projectLegacyEquipment(candidate, outfitting);
    const weaponId = projectLegacyWeaponId(candidate, targetShipId);
    return {
        ok: true,
        code: 'ok',
        keepCurrent: keep,
        switching,
        ownedShips,
        currentShipId: player.shipId,
        targetShipId,
        tradeIn,
        amountDue,
        creditsBefore,
        creditsAfter,
        cargoMass,
        cargoCapacity,
        outfitting,
        equipment,
        weaponId,
        beforeFingerprint: fingerprint(player, cargoMass, targetShipId, keep),
    };
};

export const commitShipTrade = (player, quote, options = {}) => {
    if (!quote?.ok)
        return { ok: false, code: quote?.code ?? 'invalid-quote' };
    const cargoMass = resolvedCargoMass(player, options.cargoMass ?? quote.cargoMass);
    if (!quote.beforeFingerprint || quote.beforeFingerprint !== fingerprint(player, cargoMass, quote.targetShipId, quote.keepCurrent))
        return { ok: false, code: 'stale-quote' };
    const fresh = quoteShipTrade(player, quote.targetShipId, { cargoMass, keepCurrent: quote.keepCurrent });
    if (!fresh.ok)
        return fresh;
    if (fresh.beforeFingerprint !== quote.beforeFingerprint)
        return { ok: false, code: 'stale-quote' };
    const targetState = fresh.switching ? clone(player.storedShips[fresh.targetShipId].resources) : null;
    player.storedShips = {...(player.storedShips ?? {})};
    if (fresh.keepCurrent) player.storedShips[player.shipId] = {locationId:player.dockedAt,resources:shipResources(player)};
    else delete player.storedShips[player.shipId];
    delete player.storedShips[fresh.targetShipId];
    player.retainedFleetVersion = 1;
    player.credits = fresh.creditsAfter;
    player.shipId = fresh.targetShipId;
    player.ownedShips = fresh.ownedShips;
    player.outfitting = clone(fresh.outfitting);
    player.equipment = [...fresh.equipment];
    player.weaponId = fresh.weaponId;
    delete player.shipStates;
    if (targetState) Object.assign(player,targetState);
    return { ok: true, code: 'traded', quote: fresh };
};
