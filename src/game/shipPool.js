import { SHIPS } from './data.js';
import { FACTION_FLEETS } from './factions.js';
import { LEAGUE_HULLS } from './leagueContent.js';

// Every hull the player can own and fly: career-yard, League and pirate hulls.
// Derived from SHIPS so new hulls join Arena Run offers and the observer palette.
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
    scrapper:'pirate', demon:'pirate', mule:'trader',
    blade: 'patrol',
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
    scrapper:'varied', demon:'varied', mule:'varied',
    blade: 'assault',
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

// Which factions fly a hull, derived from the live traffic rules rather than a
// second hand-kept table. `FACTION_FLEETS` is what spawns ships in the world, so
// inverting it (plus the League hulls' own faction) is the single source of
// truth for "who flies what" — Arena Run draws its hull-stage pools from here so
// the arena and the career agree on which hull belongs to which fleet.
export const HULL_FACTIONS = Object.freeze((()=>{
    const map={};
    for(const [faction,fleets] of Object.entries(FACTION_FLEETS))
        for(const hulls of Object.values(fleets))
            for(const hull of hulls)(map[hull]??=[]).push(faction);
    for(const [hull,data] of Object.entries(LEAGUE_HULLS)){
        if(!data.requiredFaction)continue;
        map[hull]??=[];
        if(!map[hull].includes(data.requiredFaction))map[hull].push(data.requiredFaction);
    }
    return map;
})());

// A hull's career tier (1 entry, 2 mid, 3 elite): the band an Arena Run hull
// stage offers from, so switching the ship is also climbing the combat tier.
export const hullTier = (hullId) => SHIPS[hullId]?.tier;

export const observerRoleFor = (hullId) => HULL_OBSERVER_ROLE[hullId] ?? 'escort';
export const wingmanFitFor = (hullId) => HULL_WINGMAN_FIT[hullId] ?? 'balanced';
export const isFlyableHull = (hullId) => PLAYER_FLYABLE_HULLS.includes(hullId);
