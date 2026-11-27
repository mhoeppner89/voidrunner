import { SHIPS } from '../data.js';
import { equipmentBaseId, registerEquipmentDefinition, resolveEquipmentDefinition } from '../equipmentCatalog.js';
import {
    BASE_OUTFIT_ITEMS, createOutfittingState, HULL_HARDPOINTS, itemFitsMount,
    LOADOUT_KEYS, UNIQUE_OUTFIT_IDS, validateLoadout,
} from '../outfitting.js';

export const MULTIPLAYER_DEATH_CREDITS = 1000;
const HULL_PRICES = [0, 1000, 2000, 4000];
const HULL_POINTS = [0, 100, 80, 60];
const EQUIPMENT_PRICE_DIVISOR = 8;

const hulls = Object.values(SHIPS).filter(ship => Object.hasOwn(HULL_HARDPOINTS, ship.id));
const hullById = new Map(hulls.map(ship => [ship.id, ship]));
const hullCombatValue = new Map();
const bestCombatValueByTier = [0, 0, 0, 0];
for (const ship of hulls) {
    const { guns, launchers } = HULL_HARDPOINTS[ship.id];
    const value = (ship.shield + ship.hull) / 75 + ship.afterburnSpeed / 15 + ship.angularAcceleration * 1.5
        + ship.reactorOutput / 2.5 + (guns.length + launchers.length) * 2;
    hullCombatValue.set(ship.id, value);
    bestCombatValueByTier[ship.tier] = Math.max(bestCombatValueByTier[ship.tier], value);
}

function stockHullPoints(ship) {
    const difference = bestCombatValueByTier[ship.tier] - hullCombatValue.get(ship.id);
    return HULL_POINTS[ship.tier] + Math.min(10, Math.round(difference));
}

const shopItems = new Map();
const itemsByTier = [[], [], [], []];
for (const base of Object.values(BASE_OUTFIT_ITEMS)) {
    // Cargo, salvage and physical drone services have no role in a dogfight.
    if (base.lootOnly || base.category === 'drone' || base.requiredGuild || base.id === 'loot-collector') continue;
    for (const tier of [1, 2, 3]) {
        const id = tier === 1 ? base.id : `pvp-${base.id}-t${tier}`;
        const item = tier === 1 ? base : resolveEquipmentDefinition(base, {
            id, baseId: base.id, tier, rarity: 'common', affixes: [],
        });
        if (tier > 1) registerEquipmentDefinition(id, Object.freeze(item));
        const offer = Object.freeze({
            id, baseId: base.id, name: base.name, tier, category: base.category,
            price: Math.max(100, Math.round(item.price / EQUIPMENT_PRICE_DIVISOR / 100) * 100),
        });
        shopItems.set(id, offer);
        itemsByTier[tier].push(offer);
    }
}

export function stockMultiplayerFit(shipId) {
    const ship = hullById.get(shipId);
    const outfit = createOutfittingState([shipId]);
    if (ship.tier === 1) return outfit;

    const loadout = outfit.loadouts[shipId];
    for (const slot of LOADOUT_KEYS) {
        for (const [index, id] of loadout[slot].entries()) {
            const tieredId = `pvp-${id}-t${ship.tier}`;
            if (id && shopItems.has(tieredId)) loadout[slot][index] = tieredId;
        }
    }
    return outfit;
}

const stockFits = new Map(hulls.map(ship => [ship.id, stockMultiplayerFit(ship.id).loadouts[ship.id]]));
function gearCombatValue(id) {
    const item = shopItems.get(id);
    if (!item) return 0;
    // Targeting systems support the main weapons indirectly.
    if (item.baseId === 'radar-mk2') return item.price * 0.35;
    if (item.baseId === 'fire-control') return item.price * 0.65;
    return item.price;
}

// Installed combat gear above the stock value of its socket subtracts
// one point per 100 credits of added combat value.
export function multiplayerKillPoints(shipId, outfit, replacement = null) {
    const stock = stockFits.get(shipId);
    const loadout = outfit.loadouts[shipId];
    let extraValue = 0;
    for (const slot of LOADOUT_KEYS) {
        for (const [index, current] of loadout[slot].entries()) {
            const id = replacement?.slot === slot && replacement.index === index ? replacement.id : current;
            extraValue += Math.max(0, gearCombatValue(id) - gearCombatValue(stock[slot][index]));
        }
    }
    return Math.max(25, stockHullPoints(hullById.get(shipId)) - Math.round(extraValue / 100));
}

export const multiplayerScorePreview = pointsPerKill => ({ pointsPerKill, scoreMultiplier: pointsPerKill / 100 });

function equipmentOffer(pilot, item) {
    const spares = pilot.spareEquipment.get(item.id) ?? 0;
    return { spares, retailPrice: item.price, price: spares ? 0 : item.price };
}

export function multiplayerShopFor(pilot) {
    const { shipId, outfitting, credits, ownedFits } = pilot;
    const hull = hullById.get(shipId);
    const loadout = outfitting.loadouts[shipId];
    const hardpoints = HULL_HARDPOINTS[shipId];
    const equipment = [];
    for (const item of itemsByTier[hull.tier]) {
        const slots = [];
        for (const slot of LOADOUT_KEYS) {
            const uniqueInstalled = UNIQUE_OUTFIT_IDS.includes(item.baseId)
                && loadout[slot].some(id => equipmentBaseId(id) === item.baseId);
            if (uniqueInstalled) continue;
            for (const [index, mount] of hardpoints[slot].entries()) {
                const itemId = loadout[slot][index];
                if (itemId === item.id || !itemFitsMount(item, mount)) continue;
                const points = multiplayerKillPoints(shipId, outfitting, { slot, index, id: item.id });
                slots.push({ slot, index, id: mount.id, itemId, ...multiplayerScorePreview(points) });
            }
        }
        if (slots.length) {
            const offer = equipmentOffer(pilot, item);
            equipment.push({ ...item, ...offer, affordable: credits >= offer.price, slots });
        }
    }
    return {
        hulls: hulls.map(ship => {
            const ownedFit = ownedFits.get(ship.id);
            const price = ownedFit ? 0 : HULL_PRICES[ship.tier];
            const points = ownedFit ? multiplayerKillPoints(ship.id, ownedFit) : stockHullPoints(ship);
            return {
                id: ship.id, name: ship.name, tier: ship.tier, price, owned: Boolean(ownedFit),
                equipped: ship.id === shipId, affordable: credits >= price, ...multiplayerScorePreview(points),
            };
        }),
        equipment,
    };
}

export function purchaseMultiplayerHull(pilot, shipId) {
    const ship = hullById.get(shipId);
    if (!ship) return { ok: false, code: 'unknown-ship' };
    if (pilot.shipId === shipId) return { ok: false, code: 'already-equipped' };
    const ownedFit = pilot.ownedFits.get(shipId);
    const price = ownedFit ? 0 : HULL_PRICES[ship.tier];
    if (pilot.credits < price) return { ok: false, code: 'insufficient-credits' };

    const outfit = ownedFit ?? stockMultiplayerFit(shipId);
    pilot.ownedFits.set(shipId, outfit);
    pilot.outfitting = outfit;
    pilot.shipId = shipId;
    pilot.credits -= price;
    return { ok: true, code: 'ok', shipId, price, credits: pilot.credits,
        ...multiplayerScorePreview(multiplayerKillPoints(shipId, outfit)) };
}

export function purchaseMultiplayerEquipment(pilot, itemId, slot, index) {
    const { shipId, outfitting, spareEquipment, paidMounts } = pilot;
    const item = shopItems.get(itemId);
    if (!item) return { ok: false, code: 'unknown-item' };
    if (item.tier !== hullById.get(shipId).tier) return { ok: false, code: 'wrong-tier' };
    const mount = LOADOUT_KEYS.includes(slot) && Number.isInteger(index) && HULL_HARDPOINTS[shipId][slot][index];
    if (!mount || !itemFitsMount(item, mount)) return { ok: false, code: 'incompatible-mount' };
    const loadout = outfitting.loadouts[shipId];
    const displaced = loadout[slot][index];
    if (displaced === itemId) return { ok: false, code: 'already-equipped' };
    const { price, spares } = equipmentOffer(pilot, item);
    if (pilot.credits < price) return { ok: false, code: 'insufficient-credits' };

    const replacement = [...loadout[slot]];
    replacement[index] = itemId;
    const checked = validateLoadout({ shipId }, shipId, { ...loadout, [slot]: replacement });
    if (!checked.ok) return { ok: false, code: checked.code };

    if (spares === 1) spareEquipment.delete(itemId);
    else if (spares > 1) spareEquipment.set(itemId, spares - 1);
    // Outfitting flags cover only career factory-fit types. Track paid mounts
    // here so every PvP stock part, including beam guns, stays hull-bound.
    if (displaced && paidMounts.has(mount.id))
        spareEquipment.set(displaced, (spareEquipment.get(displaced) ?? 0) + 1);
    paidMounts.add(mount.id);
    loadout[slot][index] = itemId;
    outfitting.factory[shipId][slot][index] = false;
    pilot.credits -= price;
    return { ok: true, code: 'ok', itemId, slot, index, price, credits: pilot.credits,
        ...multiplayerScorePreview(multiplayerKillPoints(shipId, outfitting)) };
}
