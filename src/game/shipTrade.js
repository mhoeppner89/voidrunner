import { COMMODITIES, LOCATIONS, SHIPS, commodityIds } from './data.js';
import {
    commissionOutfittingForShip,
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
        mass += Math.max(0, finite(item?.mass)) * Math.max(0, finite(item?.units));
    for (const id of commodityIds)
        mass += Math.max(0, finite(player.cargo?.[id])) * COMMODITIES[id].mass;
    return Math.max(mass, Math.max(0, finite(player.cargoMass)));
};
const resolvedCargoMass = (player, requested) => Math.max(actualCargoMass(player), Math.max(0, finite(requested)));
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
});
const fingerprint = (player, cargoMass, targetShipId) => JSON.stringify({
    ...context(player, cargoMass),
    targetShipId,
});

/** Pure single-ship trade quote. A negative amountDue means the yard pays the
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
    if (!(LOCATIONS[player.dockedAt]?.shipsForSale ?? []).includes(targetShipId))
        return { ok: false, code: 'not-for-sale' };
    const cargoMass = resolvedCargoMass(player, options.cargoMass);
    const tradeIn = Math.round(current.price * HULL_TRADE_IN_RATE);
    const amountDue = target.price - tradeIn;
    const creditsBefore = Number(player.credits);
    if (!Number.isFinite(creditsBefore) || creditsBefore < 0)
        return { ok: false, code: 'invalid-credits' };
    const creditsAfter = creditsBefore - amountDue;
    if (creditsAfter < 0)
        return { ok: false, code: 'insufficient-credits', tradeIn, amountDue, creditsBefore };
    const outfitting = commissionOutfittingForShip(player, targetShipId);
    if (!outfitting)
        return { ok: false, code: 'commission-failed' };
    const candidate = { ...player, shipId: targetShipId, ownedShips: [targetShipId], outfitting };
    const cargoCapacity = outfittingUsage(candidate, targetShipId).cargoCapacity;
    if (cargoMass > cargoCapacity)
        return { ok: false, code: 'cargo-over-capacity', cargoMass, cargoCapacity, tradeIn, amountDue };
    const equipment = projectLegacyEquipment(candidate, outfitting);
    const weaponId = projectLegacyWeaponId(candidate, targetShipId);
    return {
        ok: true,
        code: 'ok',
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
        beforeFingerprint: fingerprint(player, cargoMass, targetShipId),
    };
};

export const commitShipTrade = (player, quote, options = {}) => {
    if (!quote?.ok)
        return { ok: false, code: quote?.code ?? 'invalid-quote' };
    const cargoMass = resolvedCargoMass(player, options.cargoMass ?? quote.cargoMass);
    if (!quote.beforeFingerprint || quote.beforeFingerprint !== fingerprint(player, cargoMass, quote.targetShipId))
        return { ok: false, code: 'stale-quote' };
    const fresh = quoteShipTrade(player, quote.targetShipId, { cargoMass });
    if (!fresh.ok)
        return fresh;
    if (fresh.beforeFingerprint !== quote.beforeFingerprint)
        return { ok: false, code: 'stale-quote' };
    player.credits = fresh.creditsAfter;
    player.shipId = fresh.targetShipId;
    player.ownedShips = [fresh.targetShipId];
    player.outfitting = clone(fresh.outfitting);
    player.equipment = [...fresh.equipment];
    player.weaponId = fresh.weaponId;
    delete player.shipStates;
    return { ok: true, code: 'traded', quote: fresh };
};
