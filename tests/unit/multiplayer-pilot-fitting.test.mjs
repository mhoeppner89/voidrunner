import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIPS } from '../../src/game/data.js';
import { createPilotFitting, createStarterPilotFitting, MULTIPLAYER_STARTER_IDS } from '../../src/game/multiplayer/pilotFitting.js';
import { createOutfittingState, HULL_HARDPOINTS } from '../../src/game/outfitting.js';
import { getEffectiveShipStats } from '../../src/game/shipStats.js';
import { activeLauncherMagazine, AMMO_CAPACITY, launcherMagazineEntries, mountedGunEntries } from '../../src/game/weapons.js';

test('only the roster’s Tier 1 fitted hulls can start a multiplayer match', () => {
    assert.deepEqual(MULTIPLAYER_STARTER_IDS, ['wayfarer', 'scrapper', 'speedster']);
    for (const id of [undefined, ['wayfarer'], 'missing', 'constructor', 'talon', 'vanguard'])
        assert.equal(createStarterPilotFitting(id), null);
    assert.equal(createPilotFitting('missing'), null);
    assert.equal(createPilotFitting('scrapper', createOutfittingState(['wayfarer'])), null);
});

test('starters launch with a stock outfit, effective resources and loaded magazines', () => {
    for (const id of MULTIPLAYER_STARTER_IDS) {
        const { player, stats } = createStarterPilotFitting(id);
        const hardpoints = HULL_HARDPOINTS[id];
        assert.deepEqual(player.outfitting, createOutfittingState([id]));
        assert.deepEqual(player.ammo, AMMO_CAPACITY);
        assert.deepEqual(stats, getEffectiveShipStats(player));
        assert.equal(player.hull, stats.hull);
        assert.equal(player.shield, stats.shield);
        assert.equal(player.energy, stats.energyCapacity);
        assert.equal(player.missiles, stats.missileCapacity);
        assert.equal(mountedGunEntries(player).length, hardpoints.guns.length);
        const magazines = launcherMagazineEntries(player);
        assert.equal(magazines.length, hardpoints.launchers.length);
        assert.equal(activeLauncherMagazine(player).mount.id, hardpoints.launchers[0].id);
        for (const entry of magazines) {
            assert.equal(entry.rounds, entry.capacity);
            assert.equal(player.launcherMagazines[entry.mount.id].ordnanceId, entry.ordnanceId);
        }
    }
});

test('respawning recomputes the approved fit and keeps live resources separate', () => {
    const id = 'scrapper';
    const outfit = createOutfittingState([id]);
    const loadout = outfit.loadouts[id];
    loadout.utility.splice(0, 2, 'shield-mk2', 'capacitor-bank');
    loadout.launchers[0] = 'swarm-launcher';
    loadout.guns.fill(null);
    loadout.guns[1] = 'pulse-cannon';
    const first = createPilotFitting(id, outfit).player;
    const magazine = activeLauncherMagazine(first);
    first.launcherMagazines[magazine.mount.id].rounds = 0;
    first.energy = 0;
    first.outfitting.loadouts[id].guns[1] = null;

    const { player, stats } = createPilotFitting(id, outfit);
    assert.deepEqual(loadout.guns, [null, 'pulse-cannon', null, null]);
    assert.equal(loadout.fireGroups.activeGroup, 'A');
    assert.equal(player.outfitting.loadouts[id].fireGroups.activeGroup, 'B');
    assert.equal(player.weaponId, 'pulse');
    assert.equal(activeLauncherMagazine(player).launcherId, 'swarm');
    assert.equal(activeLauncherMagazine(player).rounds, magazine.capacity);
    assert.equal(player.missiles, magazine.capacity);
    assert.equal(player.shield, stats.shield);
    assert.ok(stats.shield > SHIPS[id].shield);
    assert.equal(player.energy, stats.energyCapacity);
    assert.ok(stats.energyCapacity > SHIPS[id].energyCapacity);
});
