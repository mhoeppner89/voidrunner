import {equipmentBaseId} from './equipmentCatalog.js';
import { PLAYER_RADAR_RANGE } from './combatTravel.js';
import { EQUIPMENT, SHIPS } from './data.js';
import { quoteDroneService } from './droneService.js';
import { HULL_HARDPOINTS, OUTFIT_ITEMS, installedItemIds, loadoutFor } from './outfitting.js';
import { AMMO_CAPACITY, AMMO_UNIT_COST, WEAPON_ORDER, WEAPONS, launcherMagazineEntries, missileCapacityForPlayer, weaponIdForOutfit } from './weapons.js';
// Strongest bonus first, then half effectiveness for each additional module.
// Benefits and drawbacks stack separately, so slot order cannot change a fit.
// The total contribution stays below twice the strongest individual effect.
export const stackedBonus = values => values.filter(v=>v>0).sort((a,b)=>b-a).reduce((sum,v,i)=>sum+v*2**-i,0);
export const stackedMultiplier = values => Math.max(.2,1+stackedBonus(values.map(v=>v-1))-stackedBonus(values.map(v=>1-v)));
export const getEffectiveShipStats = (player) => {
    const base = SHIPS[player.shipId];
    if (!base)
        return { ...(SHIPS.wayfarer ?? {}), missileCapacity: 0 };
    // A hydrated career always has an outfitting state. The fallback to the
    // legacy flat list is intentionally kept for imported saves and focused
    // unit probes that construct a minimal player object by hand.
    const hasOutfitting = Boolean(player?.outfitting?.loadouts?.[player.shipId] && HULL_HARDPOINTS[player.shipId]);
    const installed = hasOutfitting ? installedItemIds(player, player.shipId) : (player?.equipment ?? []);
    const count = (id) => installed.reduce((total, installedId) => total + (equipmentBaseId(installedId) === id ? 1 : 0), 0);
    const has = (id) => count(id) > 0;
    const effect = (id, key, fallback = 0) => {
        const values=installed.map(i=>OUTFIT_ITEMS[i]).filter(item=>equipmentBaseId(item?.id)===id).map(item=>item.effects?.[key]).filter(Number.isFinite);
        return values.length ? Math.max(...values) : OUTFIT_ITEMS[id]?.effects?.[key] ?? fallback;
    };
    const radarMultiplier = effect('radar-mk2', 'radarMultiplier', 1.5);
    const scanMultiplier = effect('radar-mk2', 'scanMultiplier', 1.5);
    const cargoBonus = hasOutfitting
        ? installed.reduce((total, id) => total + (OUTFIT_ITEMS[id]?.effects?.cargoCapacity ?? 0), 0)
        : (has('cargo-pods') ? 18 : 0);
    // Missile capacity belongs entirely to fitted racks. Lightweight callers
    // without an outfitting record therefore have no launcher and no storage;
    // save/runtime boundaries migrate legacy careers before resolving stats.
    const missileCapacity = missileCapacityForPlayer(player);
    const salvageRate = has('salvage-mk2') ? effect('salvage-mk2', 'salvageRate', 1.7) : 1;
    const salvageRange = has('salvage-mk2') ? effect('salvage-mk2', 'salvageRange', 170) : 100;
    const selectedEffects=installed.map(id=>OUTFIT_ITEMS[id]?.effects??{});
    const product=key=>stackedMultiplier(selectedEffects.flatMap(e=>e[key]==null?[]:[e[key]]));
    const capacity=key=>stackedBonus(selectedEffects.map(e=>e[key]??0));
    const equipmentMass=installed.reduce((n,id)=>n+(OUTFIT_ITEMS[id]?.mass??0),0);
    // Normal equipment is an upgrade; fitting technology above the hull's tier
    // instead places a visible, cumulative load on its power distribution.
    const overTierLevels=installed.reduce((sum,id)=>sum+Math.max(0,(OUTFIT_ITEMS[id]?.tier??1)-(base.tier??1)),0);
    const grossOutput=base.reactorOutput*product('outputMultiplier');
    const reactorOutput=Math.max(base.reactorOutput*.35, grossOutput-base.reactorOutput*.06*overTierLevels);
    const overTierLoad=grossOutput-reactorOutput;
    const handling=1;
    return {
        ...base,
        maxSpeed: base.maxSpeed * product('speedMultiplier') * handling,
        afterburnSpeed: base.afterburnSpeed * product('speedMultiplier') * handling,
        acceleration: base.acceleration * product('accelerationMultiplier') * handling,
        angularAcceleration: base.angularAcceleration * product('turnMultiplier') * handling,
        shield: (base.shield + capacity('shieldCapacity'))*product('shieldMultiplier'),
        hull: base.hull + capacity('hullCapacity'),
        reactorOutput,
        overTierLoad, overTierLevels,
        energyCapacity: base.energyCapacity * product('capacityMultiplier'),
        burnFuelMultiplier:product('burnFuelMultiplier'),lateralMultiplier:(base.lateralMultiplier??1)*product('lateralMultiplier'),shieldRechargeMultiplier:product('rechargeMultiplier'),
        shieldRegeneration:(base.shieldRegen??5)*product('rechargeMultiplier'),
        cargo: base.cargo + cargoBonus,
        // Pulse Mk II's multiplier lives on its projectile definition. Keeping
        // the hull's base gunDamage untouched prevents an installed gun from
        // silently buffing every other active mount.
        gunDamage: base.gunDamage,
        equipmentMass,
        missileCapacity,
        // Radar (sensor) range decides what appears as a selectable target. A
        // locked ship, asteroid, or wreck resolves automatically within the
        // active scan range.
        radarRange: has('radar-mk2') ? PLAYER_RADAR_RANGE * radarMultiplier : PLAYER_RADAR_RANGE,
        scanRange: has('radar-mk2') ? 500 * scanMultiplier : 500,
        miningRange: 100,
        salvageRate,
        salvageRange,
        lootRange: selectedEffects.reduce((range,e)=>Math.max(range,e.lootRange??0),0),
    };
};
export const repairCost = (player) => {
    const stats = getEffectiveShipStats(player);
    const missingHull = Math.max(0, stats.hull - player.hull);
    return Math.ceil(missingHull * 14);
};
// Separate from refillCost until the caller also commits drone service. Infinity
// makes malformed fleets unaffordable; use quoteDroneService for the error/lines.
export const droneServiceCost = (player, options) => {
    const quote = quoteDroneService(player, options);
    return quote.ok ? quote.total : Infinity;
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

// Dock maintenance never purchases or assigns drones. Carried spares are serviced
// too; units fitted to stored ships are not part of this visit.
export const dockServiceQuote = (player, kind) => {
    const drones = kind === 'repair' ? quoteDroneService(player, { fillSlots: [], includeLocker: true }) : null;
    const shipCost = kind === 'repair' ? repairCost(player) : refillCost(player);
    const ok = !drones || drones.ok;
    return { ok, shipCost, drones, total: ok ? shipCost + (drones?.total ?? 0) : Infinity };
};
export const repaintCost = player => Math.max(250, Math.round((SHIPS[player.shipId]?.price ?? 0) * .01 / 50) * 50);
