import { SHIPS } from '../data.js';
import { createOutfittingState, HULL_HARDPOINTS, normalizeOutfitting, projectLegacyEquipment } from '../outfitting.js';
import { getEffectiveShipStats } from '../shipStats.js';
import { AMMO_CAPACITY, mountedGunEntries, normalizeLauncherMagazines } from '../weapons.js';

export const MULTIPLAYER_STARTER_IDS = Object.freeze(Object.keys(SHIPS)
    .filter(id => SHIPS[id].tier === 1 && Object.hasOwn(HULL_HARDPOINTS, id)));

export function createStarterPilotFitting(shipId) {
    return MULTIPLAYER_STARTER_IDS.includes(shipId) ? createPilotFitting(shipId) : null;
}

// Build fresh combat state from a host-approved fit. The match keeps the
// outfit separately from the mutable ammunition and resources of each life.
export function createPilotFitting(shipId, outfitting) {
    if (typeof shipId !== 'string' || !Object.hasOwn(SHIPS, shipId) || !Object.hasOwn(HULL_HARDPOINTS, shipId))
        return null;
    if (outfitting !== undefined && !outfitting?.loadouts?.[shipId])
        return null;

    const player = { shipId, ownedShips: [shipId], outfitting, weaponId: null, ammo: { ...AMMO_CAPACITY } };
    if (outfitting === undefined) player.outfitting = createOutfittingState(player.ownedShips);
    else normalizeOutfitting(player);

    const groups = player.outfitting.loadouts[shipId].fireGroups;
    const guns = mountedGunEntries(player);
    const selectedGun = guns.find(gun => groups.activeGroup === 'ALL' || gun.group === groups.activeGroup);
    const activeGun = selectedGun ?? guns[0];
    if (activeGun && !selectedGun) groups.activeGroup = activeGun.group;
    player.weaponId = activeGun?.weaponId;
    player.equipment = projectLegacyEquipment(player);
    normalizeLauncherMagazines(player, { fill: true });

    const stats = getEffectiveShipStats(player);
    player.shield = stats.shield;
    player.hull = stats.hull;
    player.energy = stats.energyCapacity;
    return { player, stats };
}
