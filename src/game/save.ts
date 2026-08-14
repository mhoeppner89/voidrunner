import { createInitialMarket } from './economy';
import { refreshMissionOffers } from './missions';
import { clamp } from './random';
import { getEffectiveShipStats } from './shipStats';
import type { GameSave, SettingsState } from './types';

export const SAVE_KEY = 'void-privateer-save-v1';
export const SAVE_VERSION = 1;

const defaultSettings = (): SettingsState => ({
  music: 0.34,
  effects: 0.68,
  flightAssist: true,
  aimAssist: true,
  quality: 'auto',
  touchScale: 1,
  vibration: true,
});

export const createNewSave = (seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0): GameSave => {
  const now = Date.now();
  const save: GameSave = {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    player: {
      position: [-130, 45, 268],
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
    settings: defaultSettings(),
  };
  refreshMissionOffers(save, true);
  return save;
};

const storageAvailable = (): boolean => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const saveGame = (save: GameSave): boolean => {
  if (!storageAvailable()) return false;
  try {
    save.updatedAt = Date.now();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    console.warn('Unable to persist save.', error);
    return false;
  }
};

const hydrateSave = (candidate: Partial<GameSave>): GameSave => {
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
  } satisfies GameSave;
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

export const loadGame = (): GameSave | undefined => {
  if (!storageAvailable()) return undefined;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    return hydrateSave(parsed);
  } catch (error) {
    console.warn('Unable to load save.', error);
    return undefined;
  }
};

export const hasSavedGame = (): boolean => storageAvailable() && Boolean(window.localStorage.getItem(SAVE_KEY));

export const deleteSave = (): void => {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(SAVE_KEY);
};
