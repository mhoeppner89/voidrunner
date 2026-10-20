export {GUILD_FACTIONS} from './factions.js';
import { STATION_DOCKS } from './stationDocks.js';
import {LEAGUE_HULLS} from './leagueContent.js';
import { GALAXY_LOCATIONS } from './galaxyContent.js';
import { JUMP_ROUTES, SYSTEMS, systemHops } from './galaxy.js';
import {careerRegion} from './careerDanger.js';

export {FACTION_NAMES} from './factions.js';
export const GUILD_NAMES = {
    merchant: 'Merchant Guild',
    bounty: 'Bounty Hunters Registry',
    mining: 'Prospectors Guild',
    salvage: 'Salvage Union',
    syndicate: 'Red Talon Syndicate',
};
export const GUILD_RANK_NAMES = {
    merchant: ['Independent', 'Factor', 'Broker', 'Master Trader'],
    bounty: ['Unlicensed', 'Deputy', 'Hunter', 'Warrant Marshal'],
    mining: ['Roughneck', 'Prospector', 'Surveyor', 'Deep-Core Chief'],
    salvage: ['Picker', 'Rigger', 'Recovery Chief', 'Relic Broker'],
    syndicate: ['Unmarked', 'Fence', 'Fixer', 'Kingpin'],
};
export const COMMODITIES = {
    water: {
        id: 'water',
        name: 'Water',
        description: 'Shielded tanks of potable water. Cheap, bulky, always needed.',
        flavor: 'Clean water is never glamorous. It is always cargo.',
        packaging: 'Shielded tanks',
        image: './art/commodities/simplified/water.webp',
        accent: '#59c9e8',
        basePrice: 18,
        mass: 1,
        legal: true,
        category: 'Staples',
    },
    food: {
        id: 'food',
        name: 'Protein',
        description: 'Long-life nutrient blocks and cultivated protein.',
        flavor: 'Crew days, counted and vacuum-sealed.',
        packaging: 'Vacuum cartons',
        image: './art/commodities/simplified/food.webp',
        accent: '#d99b55',
        basePrice: 38,
        mass: 1,
        legal: true,
        category: 'Staples',
    },
    medicine: {
        id: 'medicine',
        name: 'Medigel',
        description: 'Temperature-controlled trauma and anti-radiation compounds.',
        flavor: 'Cold-chain cargo with no room for a late arrival.',
        packaging: 'Cold-chain case',
        image: './art/commodities/simplified/medicine.webp',
        accent: '#70d8c2',
        basePrice: 290,
        mass: 1,
        legal: true,
        category: 'Medical',
    },
    electronics: {
        id: 'electronics',
        name: 'Electronics',
        description: 'Navigation boards, sensor cores, and industrial logic units.',
        flavor: 'Small crates that keep large machines thinking.',
        packaging: 'Anti-static crates',
        image: './art/commodities/simplified/electronics.webp',
        accent: '#65aef2',
        basePrice: 407,
        mass: 1,
        legal: true,
        category: 'Industrial',
    },
    machinery: {
        id: 'machinery',
        name: 'Machinery',
        description: 'Actuators, pumps, drill heads, and pressure-rated assemblies.',
        flavor: 'Heavy replacements for the parts a frontier wears out.',
        packaging: 'Pressure-rated pallet',
        image: './art/commodities/simplified/machinery.webp',
        accent: '#d78b49',
        basePrice: 80,
        mass: 1,
        legal: true,
        category: 'Industrial',
    },
    ore: {
        id: 'ore',
        name: 'Ore',
        description: 'Dense mixed-metal concentrate recovered from frontier rock.',
        flavor: 'Unrefined mass with a refinery waiting at the other end.',
        packaging: 'Lined ore hopper',
        image: './art/commodities/simplified/ore.webp',
        accent: '#b98a61',
        // At Helix's typical surplus, 32 ore sells for about 6,000 credits.
        basePrice: 315,
        mass: 1,
        legal: true,
        category: 'Raw Materials',
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        description: 'Precious metal veins recovered from frontier rock. A rare, valuable find.',
        flavor: 'Assayed, compact, and loud enough to attract pirates.',
        packaging: 'Security ingots',
        image: './art/commodities/simplified/gold.webp',
        accent: '#e9bd4d',
        basePrice: 1800,
        mass: 1,
        legal: true,
        category: 'Precious',
    },
    scrap: {
        id: 'scrap',
        name: 'Scrap',
        description: 'Sorted hull plate, cable, and machinery fragments.',
        flavor: 'Yesterday\'s wreck, tomorrow\'s pressure door.',
        packaging: 'Banded salvage bale',
        image: './art/commodities/simplified/scrap.webp',
        accent: '#8ca39c',
        basePrice: 43,
        mass: 1,
        legal: true,
        category: 'Raw Materials',
    },
    luxuries: {
        id: 'luxuries',
        name: 'Luxuries',
        description: 'Spices, artisan spirits, and prestige consumer goods.',
        flavor: 'What people buy when survival stops taking the whole wage.',
        packaging: 'Cushioned display case',
        image: './art/commodities/simplified/luxuries.webp',
        accent: '#c58ae8',
        basePrice: 413,
        mass: 1,
        legal: true,
        category: 'Luxury',
    },
    arms: {
        id: 'arms',
        name: 'Weapons',
        description: 'Sealed weapon components. Legal only under licensed manifests.',
        flavor: 'Manifest-controlled hardware with a second price off the books.',
        packaging: 'Sealed weapons crate',
        image: './art/commodities/simplified/arms.webp',
        accent: '#df6659',
        basePrice: 439,
        mass: 1,
        legal: false,
        category: 'Restricted',
    },
};
const helixPeople = [
    {
        id: 'mara-vek',
        name: 'Mara Vek',
        relationship: 'Your aunt · your mother’s sister',
        role: 'Bartender and rumor broker',
        marketTipster: true,
        affiliation: 'Vek family',
        portraitSeed: 12,
        lines: [
            'You made it to Helix. What are you looking for: a drink, a lead, or a quiet berth?',
            'Keep your transponder on near Rookhaven unless you have a reason to invite an inspection.',
            'Three crews are claiming the same Shardbelt rock, and pirates are already watching the approach.',
        ],
    },
    {
        id: 'rin-vek',
        name: 'Rin Vek',
        relationship: 'Your sister',
        role: 'Pilot of the Second Light',
        affiliation: 'Vek family',
        portraitSeed: 18,
        lines: [
            // Greeting line. The prologue supplies Rin's own line while it runs
            // (tutorialDialogue), so this one only speaks once that story is
            // over - and it must not promise an escort that never flies.
            'Two keys, two ships: you have the Wayfarer, I have the Second Light. That is how our mother wanted it.',
            'Use the target monitor for the next contact and the navigation map for the route. I will keep off your firing line.',
            'Mara calls this a delivery run. She is not wrong, but she is not telling you why I chose the route.',
        ],
        // Shown instead when the prologue was skipped: the monitor lesson flew
        // with a wingman who is not there, and the route was never chosen for a
        // delivery this career never carried.
        linesNoPrologue: [
            'Two keys, two ships: you have the Wayfarer, I have the Second Light. That is how our mother wanted it.',
            'Keep the transponder on and the hold half empty; a light ship outruns anything you cannot shoot.',
            'Mara kept that key for years and handed it over the day you walked in. Ask her why now – I would.',
        ],
    },

];
const HELIOS_LOCATIONS = {
    helix: {
        id: 'helix',
        name: 'Helix Freeport',
        shortName: 'HELIX',
        kind: 'station',
        // Helix services the Shardbelt directly: close enough for the rock
        // crown to hang on the horizon, but well outside the active field.
        position: [18000, -8000, -176000],
        radius: 880,
        dockRadius: 1420,
        faction: 'independents',
        guilds: ['merchant'],
        accent: '#d89a43',
        secondary: '#623b24',
        description: 'A rotating freeport built around a refinery spindle. Busy, loud, and commercially neutral.',
        shipsForSale: ['speedster', 'talon', 'legionary', 'andromeda', 'mule', 'atlas'],
        economy: { food: 1.08, water: 1.05, medicine: 1.12, electronics: 0.92, machinery: 0.96, ore: 0.9, scrap: 0.92, luxuries: 1.15, arms: 1.08 },
        marketBias: { electronics: 18, machinery: 12, ore: 20, scrap: 18, food: -10, medicine: -8 },
        people: helixPeople,
    },
    rook: {
        id: 'rook',
        name: 'Rookhaven Bastion',
        shortName: 'ROOK',
        kind: 'station',
        position: [164000, 32000, 152000],
        radius: 960,
        dockRadius: 1540,
        faction: 'concord',
        guilds: ['bounty', 'merchant'],
        accent: '#7fb7ca',
        secondary: '#24444f',
        description: 'A fortified patrol station and warrant exchange guarding the outer traffic lanes.',
        shipsForSale: ['lancer', 'vanguard', 'blade'],
        economy: { food: 1.14, water: 1.08, medicine: 1.18, electronics: 1.06, machinery: 1.04, ore: 1.1, scrap: 0.88, luxuries: 1.22, arms: 0.96 },
        marketBias: { medicine: -14, arms: 18, scrap: 22, luxuries: -12 },
        people: [],
    },
    vesper: {
        id: 'vesper',
        name: 'Vesper Colony',
        shortName: 'VESPER',
        kind: 'planet',
        position: [-208000, -24000, -180000],
        radius: 15250,
        // Landing engages 5km above the surface, so the surface texture is
        // never seen at close range.
        dockRadius: 20250,
        faction: 'independents',
        guilds: ['mining'],
        accent: '#d77742',
        secondary: '#4f281f',
        description: 'A dry mining world of open pits, pressure domes, and hard-won industrial settlements.',
        shipsForSale: ['prospector', 'atlas'],
        economy: { food: 1.36, water: 1.28, medicine: 1.25, electronics: 1.12, machinery: 1.2, ore: 0.58, scrap: 0.78, luxuries: 1.45, arms: 1.1 },
        marketBias: { ore: 45, scrap: 25, food: -24, water: -22, machinery: -18 },
        people: [],
    },
    azure: {
        id: 'azure',
        name: 'Azure Reach',
        shortName: 'AZURE',
        kind: 'planet',
        position: [236000, -36000, -144000],
        radius: 17400,
        // Landing engages 5km above the surface, so the surface texture is
        // never seen at close range.
        dockRadius: 22400,
        faction: 'independents',
        guilds: ['merchant'],
        accent: '#65c5b8',
        secondary: '#173d42',
        description: 'An oceanic agricultural world exporting food, biochemicals, and high-value cultured goods.',
        shipsForSale: ['talon'],
        economy: { food: 0.55, water: 0.62, medicine: 0.82, electronics: 1.28, machinery: 1.34, ore: 1.22, scrap: 1.12, luxuries: 0.72, arms: 1.35 },
        marketBias: { food: 48, water: 38, medicine: 20, machinery: -25, electronics: -18 },
        people: [],
    },
    shardbelt: {
        id: 'shardbelt',
        name: 'The Shardbelt',
        shortName: 'SHARDBELT',
        kind: 'field',
        position: [18000, -8000, -196000],
        radius: 2340,
        faction: 'independents',
        accent: '#b6a67a',
        secondary: '#332f29',
        description: 'The fractured remains of a giant asteroid, threaded with mineral galleries, rough tunnels and drifting rubble.',
    },
    'mourning-line': {
        id: 'mourning-line',
        name: 'Mourning Line',
        shortName: 'MOURNING',
        kind: 'graveyard',
        // Cairn Yard remains tucked beside the wreck fleet so the graveyard
        // is visible from its approaches and immediately reachable from dock.
        position: [-149994, 21496, 142758],
        // Twelve full-scale Concord wrecks and their cleared approach lanes
        // form a broad battlefield around this exact navigation centre.
        radius: 5000,
        faction: 'independents',
        accent: '#a2b9b0',
        secondary: '#293738',
        description: 'A battlefield graveyard of shattered hulls, unstable reactors, and salvage claims with flexible ownership.',
    },
};

const FULL_DOCK_SERVICES = Object.freeze({
    fuel: true,
    repair: true,
    market: true,
    bar: true,
    shipyard: true,
    outfitting: true,
    missions: true,
    race: false,
});
const ACTIVITY_SERVICES = Object.freeze({
    fuel: false,
    repair: false,
    market: false,
    bar: false,
    shipyard: false,
    outfitting: false,
    missions: false,
    race: false,
});
const HELIOS_WITH_SYSTEM = Object.fromEntries(Object.entries(HELIOS_LOCATIONS).map(([id, location]) => [id, {
    ...location,
    systemId: 'helios-verge',
    services: ['station', 'planet'].includes(location.kind) ? FULL_DOCK_SERVICES : ACTIVITY_SERVICES,
}]));

const JUMP_POINT_POSITIONS = Object.freeze({
    'pale-acheron-point': [-230000,-20000,-190000],
    'acheron-pale-point': [240000,10000,200000],
    'verge-meridian-point': [250000, 45000, 210000],
    'meridian-verge-point': [-250000, 18000, 225000],
    'verge-redwake-point': [245000, 16000, 205000],
    'redwake-verge-point': [-70000, -12000, 245000],
    'verge-pale-point': [255000, 50000, 200000],
    'pale-verge-point': [-80000, 10000, 220000],
});
const jumpPointLocations = {};
for (const route of JUMP_ROUTES) {
    const endpoints = [
        [route.fromSystemId, route.toSystemId, route.fromLocationId, route.toLocationId],
        [route.toSystemId, route.fromSystemId, route.toLocationId, route.fromLocationId],
    ];
    for (const [systemId, destinationSystemId, id, destinationLocationId] of endpoints) {
        const destinationSystem = SYSTEMS[destinationSystemId];
        jumpPointLocations[id] = {
            id,
            systemId,
            name: `${destinationSystem.name} Jump Point`,
            shortName: `TO ${destinationSystem.shortName}`,
            kind: 'jump-point',
            position: JUMP_POINT_POSITIONS[id],
            radius: 460,
            faction: systemId === 'acheron' ? 'alliance' : systemId === 'redwake' ? 'pirates' : 'concord',
            accent: systemId === 'redwake' ? '#d26759' : '#80bad0',
            secondary: '#202c38',
            description: `A stabilized jump approach linking ${SYSTEMS[systemId].name} with ${destinationSystem.name}.`,
            routeId: route.id,
            destinationSystemId,
            destinationLocationId,
            services: ACTIVITY_SERVICES,
            encounterRate: systemId === 'redwake' || destinationSystemId === 'redwake' ? 0.72 : 0.38,
        };
    }
}

export const LOCATIONS = Object.freeze(Object.fromEntries(Object.entries({
    ...HELIOS_WITH_SYSTEM, ...GALAXY_LOCATIONS, ...jumpPointLocations,
}).map(([id,location])=>[id,{...location,
    security:careerRegion(location.systemId,id),
    encounterRate:careerRegion(location.systemId,id).jumpChance,
    guildPresence:Object.freeze(Object.fromEntries((location.guilds??[]).map((guild,i)=>[guild,i===0?1:.45]))),
}])));

// Local coordinates are reused in each system. Only the active system is
// rendered and simulated, while these anchors keep each navigation chart
// visually distinct.
export const SYSTEM_SUN_POSITIONS = Object.freeze({
    acheron: [150000,160000,-850000],
    'helios-verge': [-360000, 144000, 800000],
    meridian: [620000, 110000, 690000],
    redwake: [-680000, -60000, 590000],
    'pale-ring': [130000, 260000, 830000],
});
export const SUN_POSITION = SYSTEM_SUN_POSITIONS['helios-verge'];
export const sunPositionForSystem = (systemId) => SYSTEM_SUN_POSITIONS[systemId] ?? SUN_POSITION;
export const DEFAULT_NAV_LOCATION_BY_SYSTEM = Object.freeze({
    acheron: 'acheron-belt',
    'helios-verge': 'shardbelt',
    meridian: 'foundry-lanes',
    redwake: 'redwake-belt',
    'pale-ring': 'pale-rings',
});
export const DEFAULT_DOCK_LOCATION_BY_SYSTEM = Object.freeze({
    acheron: 'haven',
    'helios-verge': 'helix',
    meridian: 'meridian-prime',
    redwake: 'cinder',
    'pale-ring': 'nacre',
});
export const locationIdsForSystem = (systemId) => Object.values(LOCATIONS)
    .filter((location) => location.systemId === systemId)
    .map((location) => location.id);
export const navLocationIdsForSystem = locationIdsForSystem;
export const dockLocationIdsForSystem = (systemId) => locationIdsForSystem(systemId)
    .filter((id) => LOCATIONS[id].dockRadius && Object.values(LOCATIONS[id].services ?? {}).some(Boolean));
export const marketLocationIdsForSystem = (systemId) => dockLocationIdsForSystem(systemId)
    .filter((id) => LOCATIONS[id].services?.market);
export const activityLocationIdsForSystem = (systemId) => locationIdsForSystem(systemId)
    .filter((id) => ['field', 'graveyard', 'rings'].includes(LOCATIONS[id].kind));
export const DOCK_LOCATION_IDS = Object.freeze(Object.keys(LOCATIONS).filter((id) =>
    LOCATIONS[id].dockRadius && Object.values(LOCATIONS[id].services ?? {}).some(Boolean)));
export const MARKET_LOCATION_IDS = Object.freeze(DOCK_LOCATION_IDS.filter((id) => LOCATIONS[id].services?.market));
export const MISSION_LOCATION_IDS = Object.freeze(DOCK_LOCATION_IDS.filter((id) =>
    LOCATIONS[id].services?.missions || LOCATIONS[id].services?.race));
export const NAV_LOCATION_IDS = Object.freeze(Object.keys(LOCATIONS));
export const EQUIPMENT = {
    'engine-mk2': {
        id: 'engine-mk2',
        name: 'Overburn Engine Core',
        category: 'engine',
        price: 8400,
        description: 'Higher sustained thrust and a cooler afterburn cycle.',
        stat: '+18% speed and acceleration',
    },
    'thrusters-mk2': {
        id: 'thrusters-mk2',
        name: 'Vector Thruster Rack',
        category: 'maneuver',
        price: 7200,
        description: 'Reinforced attitude jets with faster spool and recovery.',
        stat: '+22% turn authority',
    },
    'shield-mk2': {
        id: 'shield-mk2',
        name: 'Dual-Layer Shield Grid',
        category: 'shield',
        price: 9600,
        description: 'A larger shield reserve with improved recharge control.',
        stat: '+45 shield capacity',
    },
    'armor-mk2': {
        id: 'armor-mk2',
        name: 'Ablative Hull Weave',
        category: 'hull',
        price: 6500,
        description: 'Segmented sacrificial plating around the pressure hull.',
        stat: '+40 hull integrity',
    },
    'pulse-mk2': {
        id: 'pulse-mk2',
        name: 'Pulse Laser II',
        category: 'weapon',
        price: 10200,
        description: 'Tighter pulse timing and higher-energy emitter chambers.',
        stat: 'Tier II pulse laser',
        requiredGuild: 'bounty',
        requiredRank: 1,
    },
    'pdc-cluster': {
        id: 'pdc-cluster',
        name: 'Point-Defense Cluster',
        category: 'weapon',
        price: 4400,
        description: 'Prioritises incoming missiles. Fires ten-round bursts at your selected hostile within 90 units; weak against shields, effective against exposed hull.',
        stat: 'Missile priority · 90u range · 10-round bursts',
    },
    'ripper-scattergun': {
        id: 'ripper-scattergun',
        name: 'Ripper Scattergun',
        category: 'weapon',
        price: 3600,
        description: 'Seven-pellet shell cloud for turning fights. Devastating inside their turn circle, useless beyond it.',
        stat: '7 pellets · wins inside ~55u',
    },
    'ion-lance': {
        id: 'ion-lance',
        name: 'Ion Lance',
        category: 'weapon',
        price: 5600,
        description: 'Shield-cracking discharge that jams target guns on every hit. The opener that makes kinetics land harder.',
        stat: '×4 vs shields · 1.8s gun jam',
    },
    'sunlance-mortar': {
        id: 'sunlance-mortar',
        name: 'Sunlance Plasma Mortar',
        category: 'weapon',
        price: 7200,
        description: 'Lobbed plasma orbs with splash falloff and clinging burn. Siege ordnance for camps, freighters, and patience.',
        stat: 'Splash r=26 · 6/s burn ×4s',
    },
    'radar-mk2': {
        id: 'radar-mk2',
        name: 'Long-Baseline Radar',
        category: 'radar',
        price: 5400,
        description: 'Improves target acquisition, scan range, and threat classification.',
        stat: '+50% target range · +50% scan range',
    },
    'cargo-pods': {
        id: 'cargo-pods',
        name: 'External Cargo Pods',
        category: 'cargo',
        price: 4800,
        description: 'Armored modular pods mounted along the lower keel.',
        stat: '+18 cargo mass',
        requiredGuild: 'merchant',
        requiredRank: 1,
    },
    'salvage-mk2': {
        id: 'salvage-mk2',
        name: 'Phase-Locked Tractor',
        category: 'salvage',
        price: 8100,
        description: 'Stabilizes wreck fragments and retrieves valuable components at longer range.',
        stat: '+70% salvage rate and range',
        requiredGuild: 'salvage',
        requiredRank: 1,
    },
};
// Player hulls share tier/role metadata across the shipyard and simulation.
// Tier reads as a career step and as a combat band: the durability curves are
// balanced so a tier-3 combat hull beats a tier-2 and a tier-2 beats a tier-1,
// while a tier-3 hauler fights at the tier-2 combat level (see
// .freebuff/balance/main-loadouts.mjs, which grades exactly that ladder).
export const SHIPS = {
    wayfarer: {
        id: 'wayfarer',
        progressesTo: ["torsas", "prospector", "talon", "legionary", "andromeda"],
        role: "allrounder",
        tier: 1,
        name: 'Wayfarer',
        className: 'MPR-7 Utility Cutter',
        variant: 'kestrel',
        personality: 'Balanced all-rounder',
        price: 0,
        description: 'A modest multipurpose ship with enough hardpoints and utility gear to attempt every frontier career.',
        maxSpeed: 50,
        afterburnSpeed: 75,
        acceleration: 21,
        angularAcceleration: 1.65,
        angularDamping: 2.8,
        shield: 200,
        hull: 190,
        reactorOutput: 10,
        energyCapacity: 60,
        cargo: 32,
        fuel: 100,
        gunDamage: 10,
        shieldRegen: 5,
    },
    vanguard: {
        id: 'vanguard',
        role: "bomber",
        tier: 3,
        name: 'Vanguard',
        className: 'VX-22 Frontier Heavy',
        variant: 'warden',
        personality: "Armored heavy bomber",
        price: 105000,
        description: "Three heavy launcher racks and defensive turrets support sustained attack runs. Strong armor, slow pursuit and a large turning circle.",
        maxSpeed: 48,
        afterburnSpeed: 72,
        acceleration: 17,
        angularAcceleration: 2.2,
        angularDamping: 3.1,
        shield: 400,
        hull: 440,
        reactorOutput: 30,
        energyCapacity: 120,
        cargo: 42,
        fuel: 130,
        gunDamage: 15,
        shieldRegen: 7,
    },
    scrapper: {
        id: 'scrapper', name: 'Scrapper', className: 'Four-gun Pirate Fighter', variant: 'scrapper',
        role: 'fighter', tier: 1, price: 18000, progressesTo: ['legionary'],
        personality: 'Split-wing pirate raider',
        description: 'A patched charcoal-and-red fighter with four wingtip cannons and twin engine booms.',
        maxSpeed: 62, afterburnSpeed: 100, acceleration: 32,
        angularAcceleration: 3.5, angularDamping: 3.1, lateralMultiplier: 1.05,
        shield: 180, hull: 180, reactorOutput: 15, energyCapacity: 60, cargo: 12, fuel: 85, gunDamage: 10,
        shieldRegen: 5,
    },
    demon: {
        id:'demon', name:'Demon', className:'Twin-hull Interceptor', variant:'demon',
        role:'interceptor', tier:2, price:45000, progressesTo:['lancer'],
        personality:'Fast close-range interceptor',
        description:'A compact twin-hull interceptor with four forward guns, seeker missiles and powerful paired engines.',
        maxSpeed:78, afterburnSpeed:132, acceleration:47, angularAcceleration:4.2, angularDamping:3.1, lateralMultiplier:1.15,
        shield:260, hull:220, reactorOutput:20, energyCapacity:80, cargo:14, fuel:100, gunDamage:12,
        shieldRegen: 6,
    },
    mule: {
        id:'mule', name:'Mule', className:'Armored Medium Freighter', variant:'mule',
        role:'transport', tier:2, price:65000, progressesTo:['atlas'],
        personality:'Protected convoy freighter',
        description:'An armored transport with a substantial hold, three drives and two defensive PDC positions. Less cargo and industry capacity than Atlas.',
        maxSpeed:40, afterburnSpeed:60, acceleration:16, angularAcceleration:1.1, angularDamping:2.6,
        shield:260, hull:350, reactorOutput:20, energyCapacity:90, cargo:128, fuel:180, gunDamage:8,
        shieldRegen: 6,
    },
    talon: {
        id: 'talon',
        progressesTo: ["lancer"],
        role: "interceptor",
        tier: 2,
        name: 'Talon',
        className: 'TX-4 Courier Interceptor',
        variant: 'talon',
        personality: 'Fast, fragile striker',
        price: 40000,
        description: 'A light, twitchy interceptor built to outrun and out-turn anything it cannot outgun.',
        maxSpeed: 76,
        afterburnSpeed: 128,
        acceleration: 46,
        angularAcceleration: 4.4,
        angularDamping: 3.15,
        lateralMultiplier: 1.2,
        shield: 280,
        hull: 210,
        reactorOutput: 20,
        energyCapacity: 80,
        cargo: 16,
        fuel: 85,
        gunDamage: 12,
        shieldRegen: 6,
    },
    prospector: {
        id: 'prospector',
        progressesTo: ["atlas"],
        role: "industrial",
        tier: 2,
        name: 'Prospector',
        className: 'BP-2 Rock Hauler',
        variant: 'prospector',
        personality: 'Slow, cavernous miner',
        price: 35000,
        description: 'A reinforced ore barge with a deep hold and the patience to sit on a deposit until it is dry.',
        maxSpeed: 40,
        afterburnSpeed: 60,
        acceleration: 16,
        angularAcceleration: 1.15,
        angularDamping: 2.2,
        shield: 200,
        hull: 300,
        reactorOutput: 15,
        energyCapacity: 80,
        cargo: 96,
        fuel: 150,
        gunDamage: 8,
        shieldRegen: 5,
    },
    lancer: {
        id: 'lancer',
        role: "interceptor",
        tier: 3,
        name: 'Lancer',
        className: 'LN-9 Pursuit Hunter',
        variant: 'lancer',
        personality: "Elite pursuit interceptor",
        price: 90000,
        description: 'A warrant runner armed and shielded for long chases that end in a shooting match.',
        maxSpeed: 82,
        afterburnSpeed: 138,
        acceleration: 47,
        angularAcceleration: 4.3,
        lateralMultiplier: 1.12,
        angularDamping: 3.05,
        shield: 360,
        hull: 300,
        reactorOutput: 30,
        energyCapacity: 100,
        cargo: 30,
        fuel: 120,
        gunDamage: 19,
        shieldRegen: 7,
    },
    atlas: {
        id: 'atlas',
        role: "industrial",
        tier: 3,
        name: 'Atlas Hauler',
        className: 'AT-5 Bulk Freighter',
        variant: 'atlas-freighter',
        personality: "Heavy industrial freighter",
        price: 110000,
        description: "Four drone bays, four defensive turrets and a vast hold support mining and bulk freight. Slow acceleration makes route planning and escorts valuable.",
        maxSpeed: 34,
        afterburnSpeed: 51,
        acceleration: 13,
        angularAcceleration: 0.85,
        angularDamping: 1.9,
        shield: 350,
        hull: 480,
        reactorOutput: 25,
        energyCapacity: 120,
        cargo: 176,
        fuel: 200,
        gunDamage: 9,
        shieldRegen: 7,
    },
    blade: {
        "id": "blade",
        "name": "Blade",
        "className": "BL-3 Heavy Fighter",
        "variant": "blade",
        "personality": "Elite heavy fighter",
        "description": "Heavy forward guns and three defensive turret positions. Strong sustained pressure, limited cargo and less agility than an interceptor.",
        "tier": 3,
        "role": "fighter",
        "price": 120000,
        "maxSpeed": 61,
        "afterburnSpeed": 98,
        "acceleration": 32,
        "angularAcceleration": 3.0,
        "angularDamping": 3.05,
        "shield": 420,
        "hull": 420,
        "reactorOutput": 35,
        "energyCapacity": 140,
        "cargo": 22,
        "fuel": 130,
        "gunDamage": 12,
        shieldRegen: 8,
},
    ...LEAGUE_HULLS,
};
export const LOCATION_ORDER = Object.freeze([
    'haven','league-yard','cinderfall','acheron-belt',
    'helix', 'rook', 'azure', 'shardbelt', 'vesper', 'mourning-line', 'cairn',
    'meridian-prime', 'argent', 'gatehouse-twelve', 'foundry-lanes',
    'blackglass', 'cinder', 'torchwell', 'redwake-belt',
    'nacre', 'boreal', 'shepherd', 'pale-rings',
]);
export const SYSTEM_MAP_EXTENT = 256000;
export const ROUTE_DISTANCE_SCALE = 480;
export const displaySpeed = (unitsPerSecond) => unitsPerSecond * 2;
// NPC spawns stay well outside the cloud (their ships drift while the player
// engages); the player's own hyperdrive arrival uses FIELD_ARRIVAL_MARGIN.
const FIELD_ENTRY_MARGIN = 250;
// The player drops right at an ordinary field's rock shell instead of 250
// units outside it. Mourning Line uses this as its predictive drop trigger,
// then resolves the final position into an approach-facing, collision-safe
// capital-wreck pocket; see GameSession.setFieldEntryPosition.
const FIELD_ARRIVAL_MARGIN = -60;
// A system jump is a close-range interaction with the physical gate. Local
// hyperdrive can carry the player to this boundary, but the actual inter-system
// jump will not arm until the ship is within one kilometre of the centre.
export const JUMP_POINT_ACTIVATION_RADIUS = 1000;
export const hyperdriveArrivalRadius = (location) => {
    if(location.kind==='waypoint')return 500;
    if (location.kind === 'field' || location.kind === 'graveyard' || location.kind === 'rings')
        return location.radius + FIELD_ARRIVAL_MARGIN;
    if (location.kind === 'jump-point')
        return JUMP_POINT_ACTIVATION_RADIUS;
    // Station arrivals should begin outside the landing beacon ring. That
    // leaves a visible, flyable approach after the local hyperdrive drops out.
    if (STATION_DOCKS[location.id]) return Math.max(location.radius * 1.05, location.radius + 450);
    // Planets are huge now: exit hyperdrive well clear of the surface so the
    // approach reads as a long glide in (and the low-res surface texture stays
    // out of close-up range). 7km above the surface.
    if (location.kind === 'planet')
        return location.radius + 7000;
    return location.radius + 2000;
};
export const spawnClearance = (location) => {
    // Ships must spawn well clear of the body and its landing zone.
    if (location.kind === 'field' || location.kind === 'graveyard' || location.kind === 'rings')
        return location.radius + FIELD_ENTRY_MARGIN;
    return (location.dockRadius ?? location.radius) + 120;
};
// Compatibility catalogue; the central region policy also covers all new POIs.
export const SECTOR_ENCOUNTER_RATE = Object.freeze(Object.fromEntries(Object.entries(LOCATIONS).map(([id,location])=>[id,location.encounterRate])));
export const sectorEncounterChance = (id) => LOCATIONS[id]?.encounterRate ?? SECTOR_ENCOUNTER_RATE[id] ?? 0.3;
export const locationInstanceRadius = (id) => {
    const location = LOCATIONS[id];
    if (location.kind === 'field' || location.kind === 'graveyard' || location.kind === 'rings')
        return location.radius + 330;
    if (location.kind === 'planet')
        return (location.dockRadius ?? location.radius) + 330;
    return (location.dockRadius ?? location.radius) + 240;
};
export const routeDistanceBetween = (a, b) => {
    const fromSystemId = LOCATIONS[a]?.systemId;
    const toSystemId = LOCATIONS[b]?.systemId;
    if (!fromSystemId || !toSystemId)
        return 0;
    if (fromSystemId !== toSystemId)
        return (systemHops(fromSystemId, toSystemId) ?? 3) * 950;
    const pa = LOCATIONS[a].position;
    const pb = LOCATIONS[b].position;
    const dx = pa[0] - pb[0];
    const dy = pa[1] - pb[1];
    const dz = pa[2] - pb[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / ROUTE_DISTANCE_SCALE;
};
export const commodityIds = Object.keys(COMMODITIES);
export const equipmentIds = Object.keys(EQUIPMENT);
export const locationByDockId = (id) => LOCATIONS[id];
