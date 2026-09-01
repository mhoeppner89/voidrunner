import assert from 'node:assert/strict';
import { cargoMass, quoteCommodityTrade } from './economy.js';
import {
    SAVE_KEY,
    SETTINGS_KEY,
    SAVE_VERSION,
    createNewSave,
    defaultSettings,
    deleteSave,
    hasSavedGame,
    hydrateSave,
    loadGame,
    loadSettingsPreferences,
    saveGame,
    saveSettingsPreferences,
} from './save.js';

const storage = new Map();
globalThis.window = {
    localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key),
    },
};

const canonicalPlayer = (overrides = {}) => ({
    shipId: 'wayfarer',
    ownedShips: ['wayfarer'],
    systemId: 'helios-verge',
    dockedAt: 'helix',
    lastDockedAt: 'helix',
    position: [18000, -8000, -176000],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    ...overrides,
});

// Player preferences exist before and independently of a career autosave.
storage.clear();
const firstRunSettings = {
    ...defaultSettings(),
    music: 0,
    effects: 0,
    quality: 'low',
    language: 'en',
    tiltSensitivity: 1.6,
};
assert.equal(saveSettingsPreferences(firstRunSettings), true);
assert.equal(hasSavedGame(), false);
assert.equal(storage.has(SETTINGS_KEY), true);
assert.deepEqual(loadSettingsPreferences(), { ...firstRunSettings, quality: 'high' });

// A current save preserves an intentional full mute; only legacy silent
// defaults receive the one-time sound-on migration.
const currentMuted = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer(),
    world: { seed: 119 },
    settings: { music: 0, effects: 0 },
});
assert.equal(currentMuted.settings.music, 0);
assert.equal(currentMuted.settings.effects, 0);
const legacySilent = hydrateSave({
    version: SAVE_VERSION - 1,
    player: canonicalPlayer(),
    world: { seed: 118 },
    settings: { music: 0, effects: 0 },
});
assert.equal(legacySilent.settings.music, 0.34);
assert.equal(legacySilent.settings.effects, 0.68);

// Corrupted manifests are repaired at the save boundary and remain harmless
// if an unsanitized runtime object reaches the economy helpers directly.
const cargoSave = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer({
        cargo: { water: '2', food: -4, ore: 'broken', unknown: 999 },
        sealedCargo: [
            null,
            'broken',
            { missionId: '', label: 'orphan', units: 2, mass: 1 },
            { missionId: 'bad-units', label: 'bad', units: -2, mass: 1 },
            { missionId: 'valid-delivery', label: 'Medical cases', units: 3, mass: 0.5 },
        ],
    }),
    world: { seed: 120 },
});
assert.deepEqual(cargoSave.player.cargo, { water: 2 });
assert.deepEqual(cargoSave.player.sealedCargo, [{
    missionId: 'valid-delivery', label: 'Medical cases', units: 3, mass: 0.5,
}]);
assert.equal(cargoMass(cargoSave.player), 3.9);
assert.equal(Number.isFinite(cargoMass({ cargo: { water: 'NaN', food: -4 }, sealedCargo: [null, { mass: Infinity, units: 2 }] })), true);
const tradeQuote = quoteCommodityTrade(cargoSave, 'helix', 'water', 'buy', 1);
assert.equal(Number.isFinite(tradeQuote.postCargoMass ?? 0), true, 'trade quote never exposes NaN cargo mass');

// A valid dock is the authoritative system anchor.
const dockMismatch = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer({ systemId: 'redwake', dockedAt: 'helix' }),
    world: { seed: 121 },
});
assert.equal(dockMismatch.player.systemId, 'helios-verge');
assert.equal(dockMismatch.player.navTargetId, 'shardbelt');

const validPendingJump = {
    routeId: 'verge-meridian',
    fromSystemId: 'helios-verge',
    toSystemId: 'meridian',
    fromLocationId: 'verge-meridian-point',
    toLocationId: 'meridian-verge-point',
    startedAt: 10,
    completeAt: 10.65,
    returnThrottle: 0.4,
};
const pendingForward = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer({ dockedAt: undefined }),
    world: { seed: 122, pendingJump: validPendingJump },
});
assert.deepEqual(pendingForward.world.pendingJump, validPendingJump);
const pendingReverse = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer({ systemId: 'meridian', dockedAt: undefined, lastDockedAt: 'meridian-prime' }),
    world: {
        seed: 123,
        pendingJump: {
            ...validPendingJump,
            fromSystemId: 'meridian',
            toSystemId: 'helios-verge',
            fromLocationId: 'meridian-verge-point',
            toLocationId: 'verge-meridian-point',
        },
    },
});
assert.equal(pendingReverse.world.pendingJump?.fromLocationId, 'meridian-verge-point');
const mismatchedEndpoint = hydrateSave({
    version: SAVE_VERSION,
    player: canonicalPlayer({ dockedAt: undefined }),
    world: {
        seed: 124,
        pendingJump: { ...validPendingJump, fromLocationId: 'helix' },
    },
});
assert.equal(mismatchedEndpoint.world.pendingJump, null, 'route id cannot carry unrelated valid locations');

// Exercise the actual localStorage APIs, including a representative undocked
// career with settings, mission state, race records and a pending jump.
storage.clear();
const roundTrip = createNewSave(125);
roundTrip.player.dockedAt = undefined;
roundTrip.player.position = [1234, -56, 7890];
roundTrip.player.velocity = [4, 5, 6];
roundTrip.player.prevPosition = new Float64Array([1, 2, 3]);
roundTrip.player.prevRotation = new Float64Array([0, 0, 0, 1]);
roundTrip.settings.quality = 'low';
roundTrip.activeMissions = [{ id: 'round-trip-mission', kind: 'delivery', status: 'active' }];
roundTrip.world.raceRecords = { 'shard-gauntlet': { bestTime: 73.5, bestRank: 2, bestSplits: [10, 20] } };
roundTrip.world.pendingJump = validPendingJump;
assert.equal(saveGame(roundTrip), true);
assert.equal(hasSavedGame(), true);
const persistedRaw = JSON.parse(storage.get(SAVE_KEY));
assert.equal('prevPosition' in persistedRaw.player, false);
assert.equal('prevRotation' in persistedRaw.player, false);
const loaded = loadGame();
assert.deepEqual(loaded.player.position, [1234, -56, 7890]);
assert.deepEqual(loaded.player.velocity, [4, 5, 6]);
assert.equal(loaded.player.dockedAt, undefined);
assert.equal(loaded.settings.quality, 'high');
assert.equal(loaded.activeMissions[0].id, 'round-trip-mission');
assert.equal(loaded.world.raceRecords['shard-gauntlet'].bestTime, 73.5);
assert.equal(loaded.world.pendingJump?.routeId, 'verge-meridian');

const goodRaw = storage.get(SAVE_KEY);
loaded.player.position = [NaN, 0, 0];
assert.equal(saveGame(loaded), false, 'non-finite transforms do not overwrite the career');
assert.equal(storage.get(SAVE_KEY), goodRaw);
const arena = createNewSave(126);
arena.arena = { environment: 'open', scenario: '1v1' };
assert.equal(saveGame(arena), false, 'arena sessions never overwrite the career');
assert.equal(storage.get(SAVE_KEY), goodRaw);

deleteSave();
assert.equal(hasSavedGame(), false);
assert.equal(loadGame(), undefined);

console.log('all save assertions passed');
