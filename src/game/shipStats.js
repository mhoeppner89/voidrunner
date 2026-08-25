import { EQUIPMENT, SHIPS } from './data.js';
import { AMMO_CAPACITY, AMMO_UNIT_COST, WEAPON_ORDER, WEAPONS } from './weapons.js';
export const getEffectiveShipStats = (player) => {
    const base = SHIPS[player.shipId];
    const has = (id) => player.equipment.includes(id);
    return {
        ...base,
        maxSpeed: base.maxSpeed * (has('engine-mk2') ? 1.18 : 1),
        afterburnSpeed: base.afterburnSpeed * (has('engine-mk2') ? 1.18 : 1),
        acceleration: base.acceleration * (has('engine-mk2') ? 1.18 : 1),
        angularAcceleration: base.angularAcceleration * (has('thrusters-mk2') ? 1.22 : 1),
        shield: base.shield + (has('shield-mk2') ? 45 : 0),
        armor: base.armor + (has('armor-mk2') ? 40 : 0),
        cargo: base.cargo + (has('cargo-pods') ? 18 : 0),
        gunDamage: base.gunDamage * (has('pulse-mk2') ? 1.35 : 1),
        // Radar (sensor) range decides what appears as a selectable target. A
        // locked ship, asteroid, or wreck resolves automatically within the
        // active scan range.
        radarRange: has('radar-mk2') ? 1250 : 1000,
        scanRange: has('radar-mk2') ? 750 : 500,
        miningRange: 100,
        miningRate: has('mining-mk2') ? 1.7 : 1,
        salvageRate: has('salvage-mk2') ? 1.7 : 1,
        salvageRange: has('salvage-mk2') ? 170 : 100,
    };
};
export const repairCost = (player) => {
    const stats = getEffectiveShipStats(player);
    const missingHull = Math.max(0, stats.hull - player.hull);
    const missingArmor = Math.max(0, stats.armor - player.armor);
    return Math.ceil(missingHull * 18 + missingArmor * 9);
};
export const refillCost = (player) => {
    const stats = getEffectiveShipStats(player);
    const fuel = Math.max(0, stats.fuel - player.fuel) * 6;
    const missiles = Math.max(0, stats.missileCapacity - player.missiles) * 240;
    // Weapon ammo restocks through the same REFILL service as ordnance, priced
    // per unit from the weapon registry.
    let ammo = 0;
    const pools = player.ammo ?? {};
    for (const id of WEAPON_ORDER) {
        const ammoId = WEAPONS[id].ammoId;
        if (ammoId)
            ammo += Math.max(0, AMMO_CAPACITY[ammoId] - (pools[ammoId] ?? 0)) * AMMO_UNIT_COST[ammoId];
    }
    return Math.ceil(fuel + missiles + ammo);
};
export const equipmentUnlocked = (player, equipmentId) => {
    const equipment = EQUIPMENT[equipmentId];
    if (!equipment.requiredGuild)
        return true;
    return player.guildRank[equipment.requiredGuild] >= (equipment.requiredRank ?? 0);
};
