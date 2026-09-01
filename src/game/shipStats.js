import { EQUIPMENT, SHIPS } from './data.js';
import { HULL_HARDPOINTS, OUTFIT_ITEMS, installedItemIds, loadoutFor } from './outfitting.js';
import { AMMO_CAPACITY, AMMO_UNIT_COST, WEAPON_ORDER, WEAPONS, launcherMagazineEntries, missileCapacityForPlayer, weaponIdForOutfit } from './weapons.js';
export const getEffectiveShipStats = (player) => {
    const base = SHIPS[player.shipId];
    if (!base)
        return { ...(SHIPS.wayfarer ?? {}), missileCapacity: 0 };
    // A hydrated career always has an outfitting state. The fallback to the
    // legacy flat list is intentionally kept for imported saves and focused
    // unit probes that construct a minimal player object by hand.
    const hasOutfitting = Boolean(player?.outfitting?.loadouts?.[player.shipId] && HULL_HARDPOINTS[player.shipId]);
    const installed = hasOutfitting ? installedItemIds(player, player.shipId) : (player?.equipment ?? []);
    const count = (id) => installed.reduce((total, installedId) => total + (installedId === id ? 1 : 0), 0);
    const has = (id) => count(id) > 0 || (!hasOutfitting && (id === 'pulse-mk2' ? installed.includes('pulse-mk2') : false));
    const effect = (id, key, fallback = 0) => {
        const item = OUTFIT_ITEMS[id];
        return item?.effects?.[key] ?? fallback;
    };
    const engineMultiplier = effect('engine-mk2', 'speedMultiplier', 1.18);
    const accelerationMultiplier = effect('engine-mk2', 'accelerationMultiplier', 1.18);
    const turnMultiplier = effect('thrusters-mk2', 'turnMultiplier', 1.22);
    const radarMultiplier = effect('radar-mk2', 'radarMultiplier', 1.25);
    const scanMultiplier = effect('radar-mk2', 'scanMultiplier', 1.5);
    const cargoBonus = hasOutfitting
        ? installed.reduce((total, id) => total + (OUTFIT_ITEMS[id]?.effects?.cargoCapacity ?? 0), 0)
        : (has('cargo-pods') ? 18 : 0);
    // Missile capacity belongs entirely to fitted racks. Lightweight callers
    // without an outfitting record therefore have no launcher and no storage;
    // save/runtime boundaries migrate legacy careers before resolving stats.
    const missileCapacity = missileCapacityForPlayer(player);
    const miningRate = has('mining-mk2') ? effect('mining-mk2', 'miningRate', 1.7) : 1;
    const salvageRate = has('salvage-mk2') ? effect('salvage-mk2', 'salvageRate', 1.7) : 1;
    const salvageRange = has('salvage-mk2') ? effect('salvage-mk2', 'salvageRange', 170) : 100;
    return {
        ...base,
        maxSpeed: base.maxSpeed * (has('engine-mk2') ? engineMultiplier : 1),
        afterburnSpeed: base.afterburnSpeed * (has('engine-mk2') ? engineMultiplier : 1),
        acceleration: base.acceleration * (has('engine-mk2') ? accelerationMultiplier : 1),
        angularAcceleration: base.angularAcceleration * (has('thrusters-mk2') ? turnMultiplier : 1),
        shield: base.shield + (has('shield-mk2') ? effect('shield-mk2', 'shieldCapacity', 45) : 0),
        hull: base.hull + (has('armor-mk2') ? effect('armor-mk2', 'hullCapacity', 40) : 0),
        reactorOutput: base.reactorOutput + (has('engine-mk2') ? effect('engine-mk2', 'reactorOutput', 3) : 0),
        energyCapacity: base.energyCapacity,
        cargo: base.cargo + cargoBonus,
        // Pulse Mk II's multiplier lives on its projectile definition. Keeping
        // the hull's base gunDamage untouched prevents an installed gun from
        // silently buffing every other active mount.
        gunDamage: base.gunDamage,
        missileCapacity,
        // Radar (sensor) range decides what appears as a selectable target. A
        // locked ship, asteroid, or wreck resolves automatically within the
        // active scan range.
        radarRange: has('radar-mk2') ? 1000 * radarMultiplier : 1000,
        scanRange: has('radar-mk2') ? 500 * scanMultiplier : 500,
        miningRange: 100,
        miningRate,
        salvageRate,
        salvageRange,
    };
};
export const repairCost = (player) => {
    const stats = getEffectiveShipStats(player);
    const missingHull = Math.max(0, stats.hull - player.hull);
    return Math.ceil(missingHull * 14);
};
export const refillCost = (player) => {
    const stats = getEffectiveShipStats(player);
    const fuel = Math.max(0, stats.fuel - player.fuel) * 6;
    const missiles = launcherMagazineEntries(player).reduce((total, entry) => (
        total + Math.max(0, entry.capacity - entry.rounds) * (entry.launcher.unitCost ?? 240)
    ), 0);
    // Weapon ammo restocks through the same REFILL service as ordnance, priced
    // per unit from the weapon registry. Only ammo-fed guns currently mounted
    // on this hull need a refill; a gun in the locker should not charge the
    // pilot for a magazine they cannot fire.
    let ammo = 0;
    const pools = player.ammo ?? {};
    const ammoIds = new Set();
    if (player?.outfitting?.loadouts?.[player.shipId]) {
        const loadout = loadoutFor(player, player.shipId);
        for (const id of loadout.guns ?? []) {
            const weaponId = weaponIdForOutfit(id);
            const ammoId = weaponId ? WEAPONS[weaponId]?.ammoId : undefined;
            if (ammoId)
                ammoIds.add(ammoId);
        }
    }
    else {
        for (const id of WEAPON_ORDER) {
            const ammoId = WEAPONS[id].ammoId;
            if (ammoId && (player?.equipment ?? []).some((entry) => entry === (WEAPONS[id].equipmentId ?? id)))
                ammoIds.add(ammoId);
        }
    }
    for (const ammoId of ammoIds) {
        const capacity = AMMO_CAPACITY[ammoId] ?? 0;
        ammo += Math.max(0, capacity - (pools[ammoId] ?? 0)) * (AMMO_UNIT_COST[ammoId] ?? 0);
    }
    return Math.ceil(fuel + missiles + ammo);
};
export const equipmentUnlocked = (player, equipmentId) => {
    const equipment = OUTFIT_ITEMS[equipmentId] ?? EQUIPMENT[equipmentId];
    if (!equipment)
        return false;
    if (!equipment.requiredGuild)
        return true;
    return Number(player.guildRank?.[equipment.requiredGuild] ?? player.guildRep?.[equipment.requiredGuild] ?? 0) >= (equipment.requiredRank ?? 0);
};
