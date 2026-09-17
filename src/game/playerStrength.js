import { SHIPS } from './data.js';
import { LOADOUT_KEYS, OUTFIT_ITEMS, normalizeOutfitting } from './outfitting.js';

// This is deliberately a readable proxy, not a second combat formula. Hulls
// and modules keep their shop prices; cash contributes only half because it
// represents future buying power rather than strength already in the ship.
export const PLAYER_STRENGTH_WEIGHTS = Object.freeze({
    ship: 1,
    equipment: 1,
    cash: 0.5,
    cargo: 0,
});

const positiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const equipmentValue = (ids) => ids.reduce((total, id) => total + positiveNumber(OUTFIT_ITEMS[id]?.price), 0);

const normalizedPlayerOutfitting = (player = {}) => normalizeOutfitting({
    ...player,
    // normalizeOutfitting writes the normalized state back to its argument.
    // Keep this calculation observational so rendering cannot mutate a live
    // save while it is only asking for the number.
    outfitting: player?.outfitting && typeof player.outfitting === 'object'
        ? JSON.parse(JSON.stringify(player.outfitting))
        : player?.outfitting,
});

/**
 * Calculate the player's combat-strength proxy from current owned assets.
 * The active hull is valued at its listed price, all owned equipment is valued
 * at full listed price, cash at half value, and cargo is intentionally ignored.
 */
export const playerStrengthBreakdown = (player = {}) => {
    const shipId = SHIPS[player?.shipId] ? player.shipId : 'wayfarer';
    const shipValue = positiveNumber(SHIPS[shipId]?.price);
    const state = normalizedPlayerOutfitting(player);
    const installed = [];
    for (const loadout of Object.values(state.loadouts ?? {}))
        for (const key of LOADOUT_KEYS)
            installed.push(...(loadout?.[key] ?? []).filter(Boolean));
    const stored = [];
    for (const [id, count] of Object.entries(state.locker ?? {})) {
        for (let index = 0; index < Math.max(0, Math.floor(positiveNumber(count))); index += 1)
            stored.push(id);
    }
    const installedEquipmentValue = equipmentValue(installed);
    const storedEquipmentValue = equipmentValue(stored);
    const equipmentValueTotal = installedEquipmentValue + storedEquipmentValue;
    const cash = positiveNumber(player?.credits);
    const cashValue = cash * PLAYER_STRENGTH_WEIGHTS.cash;
    const cargoValue = 0;
    const total = Math.round(
        shipValue * PLAYER_STRENGTH_WEIGHTS.ship
        + equipmentValueTotal * PLAYER_STRENGTH_WEIGHTS.equipment
        + cashValue
        + cargoValue * PLAYER_STRENGTH_WEIGHTS.cargo,
    );
    return {
        total,
        shipId,
        shipValue,
        installedEquipmentValue,
        storedEquipmentValue,
        equipmentValue: equipmentValueTotal,
        cash,
        cashValue,
        cargoValue,
        weights: PLAYER_STRENGTH_WEIGHTS,
    };
};

export const playerStrengthValue = (player = {}) => playerStrengthBreakdown(player).total;
