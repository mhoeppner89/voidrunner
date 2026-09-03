import { createInitialMarket, normalizeMarketIntel, refreshAllPrices } from './economy.js';
import { DEFAULT_NAV_LOCATION_BY_SYSTEM, LOCATIONS, MISSION_LOCATION_IDS, SHIPS, commodityIds, navLocationIdsForSystem } from './data.js';
import { SYSTEM_IDS, getRoute, hasSystem } from './galaxy.js';
import { refreshMissionOffers } from './missions.js';
import { normalizeRaceRecord } from './racing.js';
import { clamp } from './random.js';
import { getEffectiveShipStats } from './shipStats.js';
import { AMMO_CAPACITY, WEAPON_ORDER, WEAPONS, normalizeLauncherMagazines } from './weapons.js';
import { collapseOutfittingToSingleShip, createOutfittingState, normalizeOutfitting, projectLegacyEquipment, projectLegacyWeaponId } from './outfitting.js';
import { combinedHullIntegrity, normalizeEnergy } from './combatResources.js';
export const SAVE_KEY = 'void-privateer-save-v1';
export const SETTINGS_KEY = 'void-privateer-settings-v1';
export const SAVE_VERSION = 10;
// Test-funds build: a fresh career starts with enough credits to try any ship,
// outfitting module or trade route without grinding first.
export const STARTING_CREDITS = 500000;
const LEGACY_LOCATION_POSITIONS = {
    helix: [-14400, 1800, 12400],
    rook: [16400, 3200, 15200],
    vesper: [-20800, -2400, -18000],
    azure: [23600, -3600, -14400],
    shardbelt: [1800, -800, -19600],
    'mourning-line': [-18000, -2000, 22000],
};
// Sound starts ON at the designed listening levels: a fresh career hears the
// game (music + effects) immediately, and the AUDIO sliders are the volume /
// mute control — a lone 0 on either slider silences that bus.
export const defaultSettings = () => ({
    music: 0.34,
    effects: 0.68,
    flightAssist: true,
    aimAssist: true,
    // High fidelity is the single shipping presentation. The retired Auto and
    // Low modes traded away too much resolution for inconsistent gains.
    quality: 'high',
    touchScale: 1,
    vibration: true,
    steering: 'tilt',
    tiltSensitivity: 1.35,
    tiltInvertPitch: false,
    tiltInvertYaw: false,
    tiltNeutral: null,
    // German is the game's default language; English is the secondary.
    // hydrateSave merges missing settings from the defaults, so existing
    // careers migrate to German automatically.
    language: 'de',
});
export const createNewSave = (seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) => {
    const now = Date.now();
    const save = {
        version: SAVE_VERSION,
        createdAt: now,
        updatedAt: now,
        player: {
            systemId: 'helios-verge',
            position: [...LOCATIONS.helix.position],
            rotation: [0, 0, 0, 1],
            velocity: [0, 0, 0],
            angularVelocity: [0, 0, 0],
            throttle: 0,
            credits: STARTING_CREDITS,
            fuel: 100,
            // Identity transponder only. Turning it off hides the callsign, not
            // the hull: drive heat, weapons, damage, and utility emissions still
            // create a physical sensor contact in flight.
            transponder: true,
            shield: 90,
            hull: 185,
            energy: 72,
            missiles: 4,
            launcherMagazines: {},
            activeLauncherMountId: null,
            // Active primary weapon + per-weapon ammo pools. hydrateSave
            // default-fills both for careers written before the weapon roster
            // shipped, so old saves load straight into the pulse laser.
            weaponId: 'pulse',
            ammo: Object.fromEntries(Object.entries(AMMO_CAPACITY).map(([ammoId, capacity]) => [ammoId, capacity])),
            shipId: 'wayfarer',
            ownedShips: ['wayfarer'],
            cargo: {},
            sealedCargo: [],
            equipment: [],
            // Canonical ship-local hardpoints and counted module locker. The
            // flat equipment array remains a derived compatibility projection.
            outfitting: createOutfittingState(['wayfarer']),
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
                syndicate: 0,
            },
            guildRank: {
                merchant: 0,
                bounty: 0,
                mining: 0,
                salvage: 0,
                syndicate: 0,
            },
            discovered: ['helix'],
            discoveredSystems: [...SYSTEM_IDS],
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
            goldHeatUntil: 0,
            market: createInitialMarket(seed),
            // Sparse learned-price ledger. Ports are added by recordMarketVisit
            // only when the player has actually visited them.
            marketIntel: {},
            offers: Object.fromEntries(MISSION_LOCATION_IDS.map((locationId) => [locationId, []])),
            plannedSystemId: null,
            plannedDestinationId: null,
            pendingJump: null,
            depletedAsteroids: {},
            depletedWrecks: {},
            completedMissionIds: [],
            failedMissionIds: [],
            bountyKills: [],
            raceRecords: {},
            // Cleared-warrant registry: callsign → { tier, temperament, danger,
            // count, clearedAt }. The bounty board reads this to remember which
            // named pilots the player has taken down (ace kills pay bonus rep).
            registry: {},
            // Pilots who surrendered to the player, callsign → 'captured' (they
            // powered down in place) or 'fled' (they ran after surrendering): a
            // later spawn of the same name recognizes the player — captured
            // pilots defer, escaped ones come back wary (see spawnShip).
            surrenderedTo: {},
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
    normalizeLauncherMagazines(save.player, { fill: true });
    refreshMissionOffers(save, true);
    return save;
};
const storageAvailable = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const normalizeSettings = (candidate) => {
    const defaults = defaultSettings();
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    const numberInRange = (key, min, max) => {
        const raw = source[key];
        const value = raw === null || raw === '' ? NaN : Number(raw);
        return Number.isFinite(value) ? clamp(value, min, max) : defaults[key];
    };
    const boolean = (key) => typeof source[key] === 'boolean' ? source[key] : defaults[key];
    const neutral = source.tiltNeutral;
    const validNeutral = neutral
        && typeof neutral === 'object'
        && Number.isFinite(Number(neutral.beta))
        && Number.isFinite(Number(neutral.gamma))
        && Number.isFinite(Number(neutral.angle));
    return {
        music: numberInRange('music', 0, 1),
        effects: numberInRange('effects', 0, 1),
        flightAssist: boolean('flightAssist'),
        aimAssist: boolean('aimAssist'),
        // Migrate every legacy Auto/Low preference to the high-fidelity
        // baseline. Keeping the field preserves save compatibility.
        quality: 'high',
        touchScale: numberInRange('touchScale', 0.8, 1.3),
        vibration: boolean('vibration'),
        steering: source.steering === 'stick' ? 'stick' : 'tilt',
        tiltSensitivity: numberInRange('tiltSensitivity', 0.4, 1.8),
        tiltInvertPitch: boolean('tiltInvertPitch'),
        tiltInvertYaw: boolean('tiltInvertYaw'),
        tiltNeutral: validNeutral
            ? { beta: Number(neutral.beta), gamma: Number(neutral.gamma), angle: Number(neutral.angle) }
            : null,
        language: source.language === 'en' ? 'en' : 'de',
    };
};
// Settings are global player preferences, not career progress. Keeping a
// small independent record lets title-screen choices survive a reload and the
// first NEW CAREER click, before a career autosave exists at all.
export const loadSettingsPreferences = () => {
    if (!storageAvailable())
        return undefined;
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        return raw ? normalizeSettings(JSON.parse(raw)) : undefined;
    }
    catch (error) {
        console.warn('Unable to load settings preferences.', error);
        return undefined;
    }
};
export const saveSettingsPreferences = (settings) => {
    if (!storageAvailable())
        return false;
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
        return true;
    }
    catch (error) {
        console.warn('Unable to save settings preferences.', error);
        return false;
    }
};
const finiteTuple = (value, length) => Array.isArray(value)
    && value.length === length
    && value.every((entry) => Number.isFinite(entry));
const finiteRotation = (value) => finiteTuple(value, 4)
    && value.reduce((sum, entry) => sum + entry * entry, 0) > 1e-12;
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
    const dockedAnchor = LOCATIONS[save.player.dockedAt] ? save.player.dockedAt : undefined;
    const fallbackAnchor = LOCATIONS[save.player.lastDockedAt] ? save.player.lastDockedAt : 'helix';
    const selected = dockedAnchor
        ? { id: dockedAnchor, distance: 0, offset: [0, 0, 0] }
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
        // Never persist a corrupted state: if the player's position or velocity
        // has gone non-finite (a crash glitch), keep the last good autosave
        // instead of overwriting the career with garbage.
        const state = save.player;
        if (!finiteTuple(state.position, 3)
            || !finiteTuple(state.velocity, 3)
            || !finiteTuple(state.angularVelocity, 3)
            || !finiteRotation(state.rotation)) {
            console.warn('Refusing to persist non-finite player state.');
            return false;
        }
        // Interpolation scratch slots (prevPosition/prevRotation) are transient
        // sim state, not career data — keep them out of the persisted save.
        const persist = { ...save, player: { ...save.player } };
        delete persist.player.prevPosition;
        delete persist.player.prevRotation;
        delete persist.player.shipStates;
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
        return true;
    }
    catch (error) {
        console.warn('Unable to persist save.', error);
        return false;
    }
};
// Existing saves carry a market snapshot from the version they were written
// under. When a new commodity ships (e.g. gold), that snapshot lacks its entry
// and the market UI/economy tick would crash on `undefined`. Merge the saved
// prices with any freshly added commodity so old careers keep working.
const mergeMarket = (candidateMarket, fallbackMarket) => {
    const merged = {};
    for (const locationId of Object.keys(fallbackMarket)) {
        merged[locationId] = {};
        for (const commodityId of Object.keys(fallbackMarket[locationId])) {
            merged[locationId][commodityId] = candidateMarket?.[locationId]?.[commodityId] ?? fallbackMarket[locationId][commodityId];
        }
    }
    return merged;
};
const normalizeRaceRecords = (records) => Object.fromEntries(
    Object.entries(records && typeof records === 'object' ? records : {})
        .map(([courseId, record]) => [courseId, normalizeRaceRecord(record)]),
);
// Version 8 stored armor and hull separately. These maxima let a damaged save
// with one missing legacy field migrate conservatively instead of receiving a
// free full repair or losing durability.
const LEGACY_DURABILITY = Object.freeze({
    wayfarer: { armor: 85, hull: 100 },
    vanguard: { armor: 135, hull: 160 },
    talon: { armor: 58, hull: 80 },
    prospector: { armor: 120, hull: 150 },
    lancer: { armor: 115, hull: 145 },
    atlas: { armor: 165, hull: 190 },
});
const validFleetIds = (player = {}) => {
    const listed = Array.isArray(player.ownedShips) ? player.ownedShips : [];
    return [...new Set([player.shipId, ...listed].filter((id) => SHIPS[id]))];
};
const safeCargoNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, Number.MAX_SAFE_INTEGER)
        : 0;
};
const normalizeCargo = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return {};
    return Object.fromEntries(commodityIds
        .map((commodityId) => [commodityId, safeCargoNumber(candidate[commodityId])])
        .filter(([, units]) => units > 0));
};
const normalizeSealedCargo = (candidate) => {
    if (!Array.isArray(candidate))
        return [];
    const result = [];
    for (const item of candidate) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const missionId = typeof item.missionId === 'string' ? item.missionId.trim() : '';
        const units = safeCargoNumber(item.units);
        const mass = safeCargoNumber(item.mass);
        if (!missionId || units <= 0 || mass <= 0)
            continue;
        const label = typeof item.label === 'string' && item.label.trim()
            ? item.label.trim()
            : 'Sealed cargo';
        result.push({ missionId, label, units, mass, ...(item.smuggled ? { smuggled: true } : {}) });
    }
    return result;
};
export const hydrateSave = (candidate) => {
    candidate = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    const parsedVersion = Number(candidate.version ?? 1);
    const sourceVersion = Number.isFinite(parsedVersion) ? parsedVersion : 1;
    const fallback = createNewSave(candidate.world?.seed);
    const save = {
        ...fallback,
        ...candidate,
        settings: (() => {
            const merged = normalizeSettings({ ...fallback.settings, ...(candidate.settings ?? {}) });
            // Sound-default-on migration: a save that still carries the legacy
            // silent defaults (0 / 0) opens at the designed listening levels, so
            // the change applies to old careers once. Current saves preserve a
            // deliberate full mute across reloads.
            if (sourceVersion < 9 && merged.music === 0 && merged.effects === 0) {
                merged.music = 0.34;
                merged.effects = 0.68;
            }
            return merged;
        })(),
        player: {
            ...fallback.player,
            ...(candidate.player ?? {}),
            cargo: normalizeCargo(candidate.player?.cargo),
            reputation: { ...fallback.player.reputation, ...(candidate.player?.reputation ?? {}) },
            guildRep: { ...fallback.player.guildRep, ...(candidate.player?.guildRep ?? {}) },
            guildRank: { ...fallback.player.guildRank, ...(candidate.player?.guildRank ?? {}) },
            stats: { ...fallback.player.stats, ...(candidate.player?.stats ?? {}) },
            // Weapon ammo pools merge per-key like cargo so a save written
            // before a weapon shipped still receives the new pool's default.
            ammo: { ...fallback.player.ammo, ...(candidate.player?.ammo ?? {}) },
            // Schema 10 gives every fitted rack a typed magazine. Do not let
            // the fallback Wayfarer magazine mask an older shared missile pool.
            launcherMagazines: candidate.player?.launcherMagazines ?? undefined,
            activeLauncherMountId: typeof candidate.player?.activeLauncherMountId === 'string'
                ? candidate.player.activeLauncherMountId
                : null,
            // The schema-6 field was always an array. Treat hand-edited or
            // corrupted values as empty instead of letting later compatibility
            // projections call .includes/.push on a string or object.
            equipment: Array.isArray(candidate.player?.equipment)
                ? [...candidate.player.equipment]
                : fallback.player.equipment,
            // Keep legacy saves on the migration path instead of inheriting
            // the fallback's seeded wayfarer state.
            outfitting: candidate.player?.outfitting ?? undefined,
            ownedShips: candidate.player?.ownedShips ?? fallback.player.ownedShips,
            sealedCargo: normalizeSealedCargo(candidate.player?.sealedCargo),
            discovered: candidate.player?.discovered ?? fallback.player.discovered,
            discoveredSystems: [...SYSTEM_IDS],
        },
        world: {
            ...fallback.world,
            ...(candidate.world ?? {}),
            market: mergeMarket(candidate.world?.market, fallback.world.market),
            marketIntel: normalizeMarketIntel(candidate.world?.marketIntel),
            offers: { ...fallback.world.offers, ...(candidate.world?.offers ?? {}) },
            depletedAsteroids: candidate.world?.depletedAsteroids ?? {},
            depletedWrecks: candidate.world?.depletedWrecks ?? {},
            completedMissionIds: candidate.world?.completedMissionIds ?? [],
            failedMissionIds: candidate.world?.failedMissionIds ?? [],
            bountyKills: candidate.world?.bountyKills ?? [],
            registry: candidate.world?.registry ?? {},
            // Upgrade legacy rank/time entries into the persistent PB/split
            // shape and deliberately discard any old replay/ghost payloads.
            raceRecords: normalizeRaceRecords(candidate.world?.raceRecords),
            // Legacy saves stored surrendered callsigns as a plain array (no
            // capture/fled distinction); default those to 'captured' so existing
            // recognition behavior is preserved.
            surrenderedTo: Array.isArray(candidate.world?.surrenderedTo) ? Object.fromEntries(candidate.world.surrenderedTo.map((name) => [name, 'captured'])) : candidate.world?.surrenderedTo ?? {},
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
    if (save.player.dockedAt && !LOCATIONS[save.player.dockedAt])
        save.player.dockedAt = undefined;
    if (!LOCATIONS[save.player.lastDockedAt])
        save.player.lastDockedAt = save.player.dockedAt ?? 'helix';
    const dockedSystemId = LOCATIONS[save.player.dockedAt]?.systemId;
    const anchoredSystemId = dockedSystemId ?? LOCATIONS[save.player.lastDockedAt]?.systemId;
    // A dock is an authoritative physical anchor. A valid but contradictory
    // system id can otherwise load Helix's UI while navigation and encounters
    // are running Redwake's world.
    save.player.systemId = dockedSystemId
        ?? (hasSystem(save.player.systemId) ? save.player.systemId : (anchoredSystemId ?? 'helios-verge'));
    const localNavIds = navLocationIdsForSystem(save.player.systemId);
    if (!localNavIds.includes(save.player.navTargetId))
        save.player.navTargetId = DEFAULT_NAV_LOCATION_BY_SYSTEM[save.player.systemId] ?? localNavIds[0] ?? 'shardbelt';
    if (save.player.currentTargetId && LOCATIONS[save.player.currentTargetId]?.systemId !== save.player.systemId)
        save.player.currentTargetId = undefined;
    if (save.world.pendingJump) {
        const pending = save.world.pendingJump;
        const route = getRoute(pending.routeId);
        const validArrival = hasSystem(pending.toSystemId)
            && LOCATIONS[pending.toLocationId]?.systemId === pending.toSystemId;
        const validDeparture = hasSystem(pending.fromSystemId)
            && LOCATIONS[pending.fromLocationId]?.systemId === pending.fromSystemId;
        const exactForward = route
            && pending.fromSystemId === route.fromSystemId
            && pending.toSystemId === route.toSystemId
            && pending.fromLocationId === route.fromLocationId
            && pending.toLocationId === route.toLocationId;
        const exactReverse = route
            && pending.fromSystemId === route.toSystemId
            && pending.toSystemId === route.fromSystemId
            && pending.fromLocationId === route.toLocationId
            && pending.toLocationId === route.fromLocationId;
        if (!route || !validArrival || !validDeparture || (!exactForward && !exactReverse))
            save.world.pendingJump = null;
    }
    if (!hasSystem(save.world.plannedSystemId)) {
        save.world.plannedSystemId = null;
        save.world.plannedDestinationId = null;
    }
    else if (save.world.plannedDestinationId
        && LOCATIONS[save.world.plannedDestinationId]?.systemId !== save.world.plannedSystemId) {
        save.world.plannedDestinationId = null;
    }
    // A save written by a crashed session may hold a non-finite position
    // (JSON round-trips NaN as null). Snap it back to the last dock so the
    // pilot always recovers instead of spawning into corrupted coordinates.
    const savedPosition = save.player.position;
    if (!finiteTuple(savedPosition, 3)) {
        const anchorId = save.player.dockedAt ?? save.player.lastDockedAt ?? 'helix';
        const anchor = LOCATIONS[anchorId] ?? LOCATIONS.helix;
        save.player.position = [...anchor.position];
        save.player.throttle = 0;
    }
    if (!finiteTuple(save.player.velocity, 3))
        save.player.velocity = [0, 0, 0];
    if (!finiteTuple(save.player.angularVelocity, 3))
        save.player.angularVelocity = [0, 0, 0];
    if (!finiteRotation(save.player.rotation))
        save.player.rotation = [0, 0, 0, 1];
    else {
        const rotationLength = Math.hypot(...save.player.rotation);
        save.player.rotation = save.player.rotation.map((entry) => entry / rotationLength);
    }
    migrateLegacyPosition(save, sourceVersion);
    const activeShipId = SHIPS[save.player.shipId] ? save.player.shipId : 'wayfarer';
    const legacyFleet = validFleetIds({
        shipId: activeShipId,
        ownedShips: Array.isArray(candidate.player?.ownedShips)
            ? candidate.player.ownedShips
            : save.player.ownedShips,
    });
    // Fleet-era careers keep the active ship. Every other hull is bought back
    // once at the same 50% base-value rule used by the new ship dealer.
    const fleetCredit = legacyFleet
        .filter((shipId) => shipId !== activeShipId)
        .reduce((total, shipId) => total + Math.round(SHIPS[shipId].price * 0.5), 0);
    const savedCredits = Number(save.player.credits);
    save.player.credits = (Number.isFinite(savedCredits) ? Math.max(0, savedCredits) : 0) + fleetCredit;
    // Outfitting is the source of truth from schema 7 onward. A schema-6
    // career is converted from its flat equipment array. Keep that original
    // flat list on the first load so older callers still see the exact ids
    // they wrote; commitOutfitting refreshes it from canonical state. A save
    // that already carries canonical state gets a fresh projection now.
    const hadCanonicalOutfitting = Boolean(candidate.player?.outfitting);
    save.player.shipId = activeShipId;
    save.player.outfitting = collapseOutfittingToSingleShip({
        ...save.player,
        ownedShips: legacyFleet,
    }, activeShipId);
    save.player.ownedShips = [activeShipId];
    delete save.player.shipStates;
    save.player.outfitting = normalizeOutfitting(save.player);
    if (hadCanonicalOutfitting) {
        save.player.equipment = projectLegacyEquipment(save.player, save.player.outfitting);
        save.player.weaponId = projectLegacyWeaponId(save.player, save.player.shipId, save.player.outfitting.loadouts?.[save.player.shipId]?.fireGroups?.activeGroup);
    }
    save.version = SAVE_VERSION;
    const stats = getEffectiveShipStats(save.player);
    if (sourceVersion < 9) {
        const legacy = LEGACY_DURABILITY[activeShipId] ?? LEGACY_DURABILITY.wayfarer;
        const legacyNumber = (value, fallbackValue) => value !== null && value !== '' && Number.isFinite(Number(value))
            ? Number(value)
            : fallbackValue;
        save.player.hull = combinedHullIntegrity(
            legacyNumber(candidate.player?.hull, legacy.hull),
            legacyNumber(candidate.player?.armor, legacy.armor),
        );
        save.player.energy = stats.energyCapacity;
    }
    const currentResource = (value, fallbackValue) => value !== null && value !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : fallbackValue;
    save.player.fuel = clamp(currentResource(save.player.fuel, stats.fuel), 0, stats.fuel);
    save.player.shield = clamp(currentResource(save.player.shield, stats.shield), 0, stats.shield);
    save.player.hull = clamp(currentResource(save.player.hull, stats.hull), 1, stats.hull);
    save.player.energy = normalizeEnergy(save.player.energy, stats.energyCapacity);
    delete save.player.armor;
    // Schema 9 and older had one hull-wide count. Preserve every remaining
    // round by distributing it across fitted racks in mount order; current
    // saves instead trust their typed per-rack records.
    normalizeLauncherMagazines(save.player, {
        legacyMissiles: sourceVersion < 10
            ? currentResource(candidate.player?.missiles, stats.missileCapacity)
            : undefined,
    });
    // Weapon state hygiene: an unknown weaponId (registry change, corrupted
    // save) falls back to the pulse laser, and every ammo pool clamps to its
    // capacity so imported/hand-edited saves cannot carry negative or
    // overfilled stock.
    if (!WEAPONS[save.player.weaponId])
        save.player.weaponId = 'pulse';
    // Legacy weapon-only ownership is folded into canonical outfitting during
    // normalizeOutfitting. Never append it here: the flat equipment array is a
    // compatibility projection and would be discarded at the runtime boundary.
    for (const id of WEAPON_ORDER) {
        const ammoId = WEAPONS[id].ammoId;
        if (ammoId)
            save.player.ammo[ammoId] = clamp(save.player.ammo[ammoId] ?? 0, 0, AMMO_CAPACITY[ammoId]);
    }
    // Re-derive market prices from the current base prices on load, so a
    // balance pass (e.g. ore/salvage revaluation) lands immediately instead of
    // waiting for the next 45s economy tick.
    refreshAllPrices(save.world.market, save.world.seed, save.world.economyClock);
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
