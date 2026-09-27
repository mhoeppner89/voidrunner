import { SHIPS } from './data.js';

// Every hull the player can own and fly: the six career-yard hulls followed by
// the five Frontier League hulls. Derived from SHIPS so a hull added to the
// data table automatically joins the Arena Run offers and the observer palette.
// The Concord frigate is an authored capital, never player-flyable, and lives
// outside this pool.
export const PLAYER_FLYABLE_HULLS = Object.freeze(Object.keys(SHIPS));

// How many hulls the Arena Run offers at a hull stage. The sixth choice keeps
// the current ship and hires a veteran wingman instead.
export const ARENA_HULL_OFFER_COUNT = 5;

// A run can end up with two wingmen: one hire per hull stage (waves 3 and 6).
export const MAX_RUN_WINGMEN = 2;

// How many veteran pilots a hull stage puts forward for hire. The sixth choice
// is a roster the pilot picks from, not a blind roll.
export const WINGMAN_OFFER_COUNT = 3;

// Which authored NPC role a hull uses when an observer places it. Only the
// base hulls need an explicit mapping (the role drives the hull's flight stats
// and doctrine flags in spawnShip); League hulls carry their own variant id.
export const HULL_OBSERVER_ROLE = Object.freeze({
    wayfarer: 'escort',
    vanguard: 'patrol',
    talon: 'pirate',
    prospector: 'miner',
    lancer: 'bounty',
    atlas: 'trader',
    speedster: 'escort',
    legionary: 'patrol',
    andromeda: 'bounty',
    torsas: 'trader',
    astra: 'escort',
});

// The fitting a hired wingman flies with. Base hulls use one of the authored
// combat presets (see enemyLoadouts.OBSERVER_FITS) matched to the hull's
// archetype; League hulls pass 'varied' so they keep their authored LEAGUE_FITS
// role fit (an Andromeda wingman arrives with its real torpedo and swarm racks).
export const HULL_WINGMAN_FIT = Object.freeze({
    wayfarer: 'balanced',
    vanguard: 'support',
    talon: 'assault',
    prospector: 'support',
    lancer: 'beam',
    atlas: 'support',
    speedster: 'varied',
    legionary: 'varied',
    andromeda: 'varied',
    torsas: 'varied',
    astra: 'varied',
});

export const observerRoleFor = (hullId) => HULL_OBSERVER_ROLE[hullId] ?? 'escort';
export const wingmanFitFor = (hullId) => HULL_WINGMAN_FIT[hullId] ?? 'balanced';
export const isFlyableHull = (hullId) => PLAYER_FLYABLE_HULLS.includes(hullId);
