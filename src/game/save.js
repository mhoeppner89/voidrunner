import { createInitialMarket } from './economy.js';
import { LOCATIONS } from './data.js';
import { refreshMissionOffers } from './missions.js';
import { clamp } from './random.js';
import { getEffectiveShipStats } from './shipStats.js';
export const SAVE_KEY = 'void-privateer-save-v1';
export const SAVE_VERSION = 5;
const LEGACY_LOCATION_POSITIONS = {
    helix: [-14400, 1800, 12400],
    rook: [16400, 3200, 15200],
    vesper: [-20800, -2400, -18000],
    azure: [23600, -3600, -14400],
    shardbelt: [1800, -800, -19600],
    'mourning-line': [-18000, -2000, 22000],
};
const defaultSettings = () => ({
    music: 0.34,
    effects: 0.68,
    flightAssist: true,
    aimAssist: true,
    quality: 'auto',
    touchScale: 1,
    vibration: true,
    steering: 'tilt',
    tiltSensitivity: 1.35,
    tiltInvertPitch: false,
    tiltInvertYaw: false,
    tiltNeutral: null,
});
export const createNewSave = (seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) => {
    const now = Date.now();
    const save = {
        version: SAVE_VERSION,
        createdAt: now,
        updatedAt: now,
        player: {
            position: [...LOCATIONS.helix.position],
            rotation: [0, 0, 0, 1],
            velocity: [0, 0, 0],
            angularVelocity: [0, 0, 0],
            throttle: 0,
            credits: 3200,
            fuel: 100,
            shield: 90,
            armor: 85,
            hull: 100,
            missiles: 4,
            shipId: 'wayfarer',
            ownedShips: ['wayfarer'],
            cargo: {},
            sealedCargo: [],
            equipment: [],
            mode: 'combat',
            navTargetId: 'shardbelt',
            dockedAt: 'helix',
            lastDockedAt: 'helix',
            reputation: {
                concord: 0,
                'free-merchants': 4,
                'frontier-miners': 0,
                'salvage-union': 0,
                'red-talons': -12,
            },
            guildRep: {
                merchant: 0,
                bounty: 0,
                mining: 0,
                salvage: 0,
            },
            guildRank: {
                merchant: 0,
                bounty: 0,
                mining: 0,
                salvage: 0,
            },
            discovered: ['helix'],
            stats: {
                kills: 0,
                trades: 0,
                mined: 0,
                salvaged: 0,
                contracts: 0,
            },
        },
        world: {
            time: 0,
            economyClock: 0,
            encounterClock: 0,
            market: createInitialMarket(seed),
            offers: {
                helix: [],
                rook: [],
                vesper: [],
                azure: [],
            },
            depletedAsteroids: {},
            depletedWrecks: {},
            completedMissionIds: [],
            failedMissionIds: [],
            bountyKills: [],
            scannedNodes: [],
            danger: 0.8,
            seed,
        },
        activeMissions: [],
        // Reserved quest-state records (see quests.js): the main story arc's
        // flags and choices live here, plain JSON, versioned with the save.
        quests: [],
        settings: defaultSettings(),
    };
    refreshMissionOffers(save, true);
    return save;
};
const storageAvailable = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const migrateLegacyPosition = (save, sourceVersion) => {
    if (sourceVersion >= 4)
        return;
    const current = save.player.position;
    const ids = Object.keys(LEGACY_LOCATION_POSITIONS);
    const anchor = ids
        .map((id) => {
        const position = LEGACY_LOCATION_POSITIONS[id];
        const dx = current[0] - position[0];
        const dy = current[1] - position[1];
        const dz = current[2] - position[2];
        return { id, distance: Math.hypot(dx, dy, dz), offset: [dx, dy, dz] };
    })
        .sort((a, b) => a.distance - b.distance)[0];
    const fallbackAnchor = save.player.dockedAt ?? save.player.lastDockedAt;
    const selected = save.player.dockedAt
        ? { id: save.player.dockedAt, distance: 0, offset: [0, 0, 0] }
        : anchor && anchor.distance < 1150
            ? anchor
            : { id: fallbackAnchor, distance: 0, offset: [0, 0, (LOCATIONS[fallbackAnchor].dockRadius ?? 80) + 35] };
    const destination = LOCATIONS[selected.id].position;
    save.player.position = [
        destination[0] + selected.offset[0],
        destination[1] + selected.offset[1],
        destination[2] + selected.offset[2],
    ];
    if (save.player.dockedAt) {
        save.player.velocity = [0, 0, 0];
        save.player.angularVelocity = [0, 0, 0];
    }
};
export const saveGame = (save) => {
    // The combat simulator uses an in-memory arena save and must never touch
    // the career autosave slot.
    if (save?.arena)
        return false;
    if (!storageAvailable())
        return false;
    try {
        save.updatedAt = Date.now();
        // Interpolation scratch slots (prevPosition/prevRotation) are transient
        // sim state, not career data — keep them out of the persisted save.
        const persist = { ...save, player: { ...save.player } };
        delete persist.player.prevPosition;
        delete persist.player.prevRotation;
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
        return true;
    }
    catch (error) {
        console.warn('Unable to persist save.', error);
        return false;
    }
};
const hydrateSave = (candidate) => {
    const sourceVersion = Number(candidate.version ?? 1);
    const fallback = createNewSave(candidate.world?.seed);
    const save = {
        ...fallback,
        ...candidate,
        settings: { ...fallback.settings, ...(candidate.settings ?? {}) },
        player: {
            ...fallback.player,
            ...(candidate.player ?? {}),
            cargo: { ...fallback.player.cargo, ...(candidate.player?.cargo ?? {}) },
            reputation: { ...fallback.player.reputation, ...(candidate.player?.reputation ?? {}) },
            guildRep: { ...fallback.player.guildRep, ...(candidate.player?.guildRep ?? {}) },
            guildRank: { ...fallback.player.guildRank, ...(candidate.player?.guildRank ?? {}) },
            stats: { ...fallback.player.stats, ...(candidate.player?.stats ?? {}) },
            equipment: candidate.player?.equipment ?? fallback.player.equipment,
            ownedShips: candidate.player?.ownedShips ?? fallback.player.ownedShips,
            sealedCargo: candidate.player?.sealedCargo ?? fallback.player.sealedCargo,
            discovered: candidate.player?.discovered ?? fallback.player.discovered,
        },
        world: {
            ...fallback.world,
            ...(candidate.world ?? {}),
            market: candidate.world?.market ?? fallback.world.market,
            offers: { ...fallback.world.offers, ...(candidate.world?.offers ?? {}) },
            depletedAsteroids: candidate.world?.depletedAsteroids ?? {},
            depletedWrecks: candidate.world?.depletedWrecks ?? {},
            completedMissionIds: candidate.world?.completedMissionIds ?? [],
            failedMissionIds: candidate.world?.failedMissionIds ?? [],
            bountyKills: candidate.world?.bountyKills ?? [],
            scannedNodes: candidate.world?.scannedNodes ?? [],
        },
        activeMissions: candidate.activeMissions ?? [],
        quests: candidate.quests ?? [],
    };
    // Optional fields are omitted by JSON.stringify. Preserve an undocked flight
    // state instead of inheriting the fallback save's starting dock.
    if (candidate.player && !Object.prototype.hasOwnProperty.call(candidate.player, 'dockedAt'))
        save.player.dockedAt = undefined;
    if (candidate.player && !Object.prototype.hasOwnProperty.call(candidate.player, 'currentTargetId'))
        save.player.currentTargetId = undefined;
    migrateLegacyPosition(save, sourceVersion);
    save.version = SAVE_VERSION;
    const stats = getEffectiveShipStats(save.player);
    save.player.fuel = clamp(save.player.fuel, 0, stats.fuel);
    save.player.shield = clamp(save.player.shield, 0, stats.shield);
    save.player.armor = clamp(save.player.armor, 0, stats.armor);
    save.player.hull = clamp(save.player.hull, 1, stats.hull);
    save.player.missiles = clamp(save.player.missiles, 0, stats.missileCapacity);
    refreshMissionOffers(save);
    return save;
};
export const loadGame = () => {
    if (!storageAvailable())
        return undefined;
    try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw)
            return undefined;
        const parsed = JSON.parse(raw);
        return hydrateSave(parsed);
    }
    catch (error) {
        console.warn('Unable to load save.', error);
        return undefined;
    }
};
export const hasSavedGame = () => storageAvailable() && Boolean(window.localStorage.getItem(SAVE_KEY));
export const deleteSave = () => {
    if (!storageAvailable())
        return;
    window.localStorage.removeItem(SAVE_KEY);
};
