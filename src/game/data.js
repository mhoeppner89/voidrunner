import { GALAXY_LOCATIONS } from './galaxyContent.js';
import { JUMP_ROUTES, SYSTEMS, systemHops } from './galaxy.js';

export const FACTION_NAMES = {
    concord: 'Concord Patrol',
    'free-merchants': 'Free Merchants Compact',
    'frontier-miners': 'Frontier Miners Cooperative',
    'salvage-union': 'Salvage Union',
    'red-talons': 'Red Talon Syndicate',
};
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
        name: 'Purified Water',
        description: 'Shielded tanks of potable water. Cheap, bulky, always needed.',
        flavor: 'Clean water is never glamorous. It is always cargo.',
        packaging: 'Shielded tanks',
        image: './art/commodities/water.webp',
        accent: '#59c9e8',
        basePrice: 22,
        mass: 1.2,
        legal: true,
        category: 'Staples',
    },
    food: {
        id: 'food',
        name: 'Protein Packs',
        description: 'Long-life nutrient blocks and cultivated protein.',
        flavor: 'Crew days, counted and vacuum-sealed.',
        packaging: 'Vacuum cartons',
        image: './art/commodities/food.webp',
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
        image: './art/commodities/medicine.webp',
        accent: '#70d8c2',
        basePrice: 145,
        mass: 0.5,
        legal: true,
        category: 'Medical',
    },
    electronics: {
        id: 'electronics',
        name: 'Control Electronics',
        description: 'Navigation boards, sensor cores, and industrial logic units.',
        flavor: 'Small crates that keep large machines thinking.',
        packaging: 'Anti-static crates',
        image: './art/commodities/electronics.webp',
        accent: '#65aef2',
        basePrice: 285,
        mass: 0.7,
        legal: true,
        category: 'Industrial',
    },
    machinery: {
        id: 'machinery',
        name: 'Industrial Machinery',
        description: 'Actuators, pumps, drill heads, and pressure-rated assemblies.',
        flavor: 'Heavy replacements for the parts a frontier wears out.',
        packaging: 'Pressure-rated pallet',
        image: './art/commodities/machinery.webp',
        accent: '#d78b49',
        basePrice: 177,
        mass: 2.2,
        legal: true,
        category: 'Industrial',
    },
    ore: {
        id: 'ore',
        name: 'Concentrated Ore',
        description: 'Dense mixed-metal concentrate recovered from frontier rock.',
        flavor: 'Unrefined mass with a refinery waiting at the other end.',
        packaging: 'Lined ore hopper',
        image: './art/commodities/ore.webp',
        accent: '#b98a61',
        basePrice: 114,
        mass: 2.5,
        legal: true,
        category: 'Raw Materials',
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        description: 'Precious metal veins recovered from frontier rock. Small in mass, heavy in value.',
        flavor: 'Assayed, compact, and loud enough to attract pirates.',
        packaging: 'Security ingots',
        image: './art/commodities/gold.webp',
        accent: '#e9bd4d',
        basePrice: 900,
        mass: 0.5,
        legal: true,
        category: 'Precious',
    },
    scrap: {
        id: 'scrap',
        name: 'Reclaimed Scrap',
        description: 'Sorted hull plate, cable, and machinery fragments.',
        flavor: 'Yesterday\'s wreck, tomorrow\'s pressure door.',
        packaging: 'Banded salvage bale',
        image: './art/commodities/scrap.webp',
        accent: '#8ca39c',
        basePrice: 78,
        mass: 1.8,
        legal: true,
        category: 'Raw Materials',
    },
    luxuries: {
        id: 'luxuries',
        name: 'Offworld Luxuries',
        description: 'Spices, artisan spirits, and prestige consumer goods.',
        flavor: 'What people buy when survival stops taking the whole wage.',
        packaging: 'Cushioned display case',
        image: './art/commodities/luxuries.webp',
        accent: '#c58ae8',
        basePrice: 330,
        mass: 0.8,
        legal: true,
        category: 'Luxury',
    },
    arms: {
        id: 'arms',
        name: 'Restricted Armaments',
        description: 'Sealed weapon components. Legal only under licensed manifests.',
        flavor: 'Manifest-controlled hardware with a second price off the books.',
        packaging: 'Sealed weapons crate',
        image: './art/commodities/arms.webp',
        accent: '#df6659',
        basePrice: 615,
        mass: 1.4,
        legal: false,
        category: 'Restricted',
    },
};
const helixPeople = [
    {
        id: 'mara-vek',
        name: 'Mara Vek',
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
        role: 'Independent pilot',
        affiliation: 'Vek family',
        portraitSeed: 18,
        lines: [
            'You finally have the spare key. I will take the Second Light and stay close until the Wayfarer feels like yours.',
            'Use the target monitor for the next contact and the navigation map for the route. I will keep off your firing line.',
            'Mara calls this a delivery run. She is not wrong, but she is not telling you why I chose the route.',
        ],
    },
    {
        id: 'oskar-brill',
        name: 'Oskar Brill',
        role: 'Cargo factor',
        affiliation: 'Merchant Guild',
        portraitSeed: 31,
        lines: [
            'Welcome to Helix; if your hold is empty, I can show you what the next ports are paying for.',
            'Check the buy and sell quotes before you load; cargo mass turns a cheap run into a slow one.',
            'Azure Reach has surplus food again, while Vesper is paying more for every crate that arrives.',
        ],
    },
    {
        id: 'sana-kell',
        name: 'Sana Kell',
        role: 'Dock mechanic',
        affiliation: 'Helix Freeport',
        portraitSeed: 53,
        lines: [
            'Bring me the damage report and I’ll tell you what Helix can fix before launch.',
            'Use afterburner in short bursts; it burns fuel quickly and heats the drive during a long crossing.',
            'If you run the Mourning Line dark, cool the drive before anyone gets close; a hot ship still shows up.',
        ],
    },
];
const rookPeople = [
    {
        id: 'captain-dorne',
        name: 'Captain Elian Dorne',
        role: 'Warrant marshal',
        affiliation: 'Concord Patrol',
        portraitSeed: 72,
        lines: [
            'Captain Dorne, Concord Patrol. Tell me what you need before you leave my dock.',
            'On a warrant, confirm the target and keep civilian traffic out of your firing line.',
            'Red Talon traffic has moved toward Mourning Line, where the wrecks make identification difficult.',
        ],
    },
    {
        id: 'yara-tan',
        name: 'Yara Tan',
        role: 'Ship broker',
        marketTipster: true,
        affiliation: 'Free Merchants Compact',
        portraitSeed: 87,
        lines: [
            'If you’re shopping for a hull, tell me the job first; the cheapest ship is rarely the cheapest run.',
            'Compare cargo capacity with the modules you want to fit before you sign the trade.',
            'Vanguard demand is up because more pilots are taking contracts through the Shardbelt.',
        ],
    },
    {
        id: 'tovik',
        name: 'Tovik Raal',
        role: 'Bounty pilot',
        affiliation: 'Bounty Hunters Registry',
        portraitSeed: 103,
        lines: [
            'Tovik Raal, Registry pilot. I can help you read a warrant before you chase it.',
            'In debris, make the target turn around the rocks; a straight chase gives pirates the easy line.',
            'The Registry has posted more named targets near Mourning Line, and several have escorts.',
        ],
    },
];
const vesperPeople = [
    {
        id: 'devi-castor',
        name: 'Devi Castor',
        role: 'Mining foreman',
        marketTipster: true,
        affiliation: 'Frontier Miners Cooperative',
        portraitSeed: 121,
        lines: [
            'You’re at Vesper; show me your scanner before you point a mining laser at anything.',
            'Scan the asteroid first, then cut only when the deposit marker is clear.',
            'Ore prices are soft here, but machinery shipments from Meridian are late again.',
        ],
    },
    {
        id: 'ren-iverson',
        name: 'Ren Iverson',
        role: 'Surveyor',
        affiliation: 'Prospectors Guild',
        portraitSeed: 138,
        lines: [
            'Ren Iverson, Prospector survey. I can mark a claim if your scan has enough detail.',
            'Run a full scan over the rock; a partial pass will not reveal deep signatures.',
            'A harmonic marker from the old Shardbelt tunnel is active again, near the rock crown.',
        ],
    },
    {
        id: 'kes-ali',
        name: 'Kes Ali',
        role: 'Union organizer',
        affiliation: 'Frontier Miners Cooperative',
        portraitSeed: 147,
        lines: [
            'Sit down. I’m Kes Ali, and I keep the Cooperative’s people from being treated as easy salvage.',
            'If pirates are near a claim, call for help before you start cutting; an escort is cheaper than a lost hold.',
            'The Cooperative has logged more gold in the Shardbelt, which is why the pirate patrols are thicker.',
        ],
    },
];
const azurePeople = [
    {
        id: 'linh-sorel',
        name: 'Linh Sorel',
        role: 'Agronomy delegate',
        marketTipster: true,
        affiliation: 'Azure Reach Cooperative',
        portraitSeed: 166,
        lines: [
            'Welcome to Azure Reach. We have food to move and too few pilots willing to take the long route.',
            'Leave room for the return cargo; food is light, but a full hold still limits your options.',
            'The latest harvest came in early, and Vesper’s clinics are already asking for more medicine.',
        ],
    },
    {
        id: 'ivo-senn',
        name: 'Ivo Senn',
        role: 'Courier',
        affiliation: 'Merchant Guild',
        portraitSeed: 179,
        lines: [
            'Ivo Senn, courier desk. If the deadline matters, I’ll show you the route before you accept.',
            'Express contracts pay more, but check the clock against your jump plan before you take one.',
            'Helix is buying protein packs by the pallet, while Vesper is paying emergency prices.',
        ],
    },
    {
        id: 'doctor-ames',
        name: 'Dr. Soraya Ames',
        role: 'Clinic director',
        affiliation: 'Civilian Medical Service',
        portraitSeed: 191,
        lines: [
            'I’m Dr. Soraya Ames. If you’re carrying medicine, tell me how long it has been out of the cold.',
            'Keep medical cargo sealed and avoid unnecessary fights; a hull hit can cost the fragile-load bonus.',
            'The clinics around Mourning Line are short on intact medical cores after the last salvage run.',
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
        faction: 'free-merchants',
        guilds: ['merchant'],
        accent: '#d89a43',
        secondary: '#623b24',
        description: 'A rotating freeport built around a refinery spindle. Busy, loud, and commercially neutral.',
        shipsForSale: ['talon', 'atlas'],
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
        shipsForSale: ['lancer', 'vanguard'],
        economy: { food: 1.14, water: 1.08, medicine: 1.18, electronics: 1.06, machinery: 1.04, ore: 1.1, scrap: 0.88, luxuries: 1.22, arms: 0.96 },
        marketBias: { medicine: -14, arms: 18, scrap: 22, luxuries: -12 },
        people: rookPeople,
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
        faction: 'frontier-miners',
        guilds: ['mining'],
        accent: '#d77742',
        secondary: '#4f281f',
        description: 'A dry mining world of open pits, pressure domes, and hard-won industrial settlements.',
        shipsForSale: ['prospector', 'atlas'],
        economy: { food: 1.36, water: 1.28, medicine: 1.25, electronics: 1.12, machinery: 1.2, ore: 0.58, scrap: 0.78, luxuries: 1.45, arms: 1.1 },
        marketBias: { ore: 45, scrap: 25, food: -24, water: -22, machinery: -18 },
        people: vesperPeople,
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
        faction: 'free-merchants',
        guilds: ['merchant'],
        accent: '#65c5b8',
        secondary: '#173d42',
        description: 'An oceanic agricultural world exporting food, biochemicals, and high-value cultured goods.',
        shipsForSale: ['talon'],
        economy: { food: 0.55, water: 0.62, medicine: 0.82, electronics: 1.28, machinery: 1.34, ore: 1.22, scrap: 1.12, luxuries: 0.72, arms: 1.35 },
        marketBias: { food: 48, water: 38, medicine: 20, machinery: -25, electronics: -18 },
        people: azurePeople,
    },
    shardbelt: {
        id: 'shardbelt',
        name: 'The Shardbelt',
        shortName: 'SHARDBELT',
        kind: 'field',
        position: [18000, -8000, -196000],
        radius: 2340,
        faction: 'frontier-miners',
        accent: '#b6a67a',
        secondary: '#332f29',
        description: 'A dense mineral field with slow-drifting fragments, massive cover, and a navigable rock crown.',
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
        faction: 'salvage-union',
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
            faction: systemId === 'redwake' ? 'red-talons' : 'concord',
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

export const LOCATIONS = Object.freeze({
    ...HELIOS_WITH_SYSTEM,
    ...GALAXY_LOCATIONS,
    ...jumpPointLocations,
});

// Local coordinates are reused in each system. Only the active system is
// rendered and simulated, while these anchors keep each navigation chart
// visually distinct.
export const SYSTEM_SUN_POSITIONS = Object.freeze({
    'helios-verge': [-360000, 144000, 800000],
    meridian: [620000, 110000, 690000],
    redwake: [-680000, -60000, 590000],
    'pale-ring': [130000, 260000, 830000],
});
export const SUN_POSITION = SYSTEM_SUN_POSITIONS['helios-verge'];
export const sunPositionForSystem = (systemId) => SYSTEM_SUN_POSITIONS[systemId] ?? SUN_POSITION;
export const DEFAULT_NAV_LOCATION_BY_SYSTEM = Object.freeze({
    'helios-verge': 'shardbelt',
    meridian: 'foundry-lanes',
    redwake: 'redwake-belt',
    'pale-ring': 'pale-rings',
});
export const DEFAULT_DOCK_LOCATION_BY_SYSTEM = Object.freeze({
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
        name: 'Kestrel Pulse Cannons',
        category: 'weapon',
        price: 10200,
        description: 'Tighter pulse timing and higher-energy emitter chambers.',
        stat: '+35% gun damage',
        requiredGuild: 'bounty',
        requiredRank: 1,
    },
    'pdc-cluster': {
        id: 'pdc-cluster',
        name: 'Point-Defense Cluster',
        category: 'weapon',
        price: 4400,
        description: 'A buzz-saw tracker mount that shreds incoming missiles and point-blank hulls. Heat-gated; fades past 70u.',
        stat: 'Missile interception · 60u guardian envelope',
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
        stat: '+25% target range · +50% scan range',
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
    'mining-mk2': {
        id: 'mining-mk2',
        name: 'Resonant Mining Lance',
        category: 'mining',
        price: 7600,
        description: 'A focused extraction beam that exposes deposits with less waste heat.',
        stat: '+70% mining yield rate',
        requiredGuild: 'mining',
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
// The six buyable hulls. Each maps onto one of the six voxel builders in
// voxelModels.js (variant) and carries a distinct stat "personality": speed,
// turn, damping, toughness, cargo and firepower are all tuned to an archetype
// so the ships feel different to fly, not just look different.
export const SHIPS = {
    wayfarer: {
        id: 'wayfarer',
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
        shield: 90,
        hull: 185,
        reactorOutput: 18,
        energyCapacity: 72,
        cargo: 32,
        fuel: 100,
        gunDamage: 10,
    },
    vanguard: {
        id: 'vanguard',
        name: 'Vanguard',
        className: 'VX-22 Frontier Heavy',
        variant: 'warden',
        personality: 'Armored patrol bruiser',
        price: 48500,
        description: 'A substantially more capable frontier ship: faster, tougher, better armed, and built around a serious cargo spine.',
        maxSpeed: 65,
        afterburnSpeed: 97.5,
        acceleration: 29,
        angularAcceleration: 1.95,
        angularDamping: 3.1,
        shield: 150,
        hull: 295,
        reactorOutput: 27,
        energyCapacity: 108,
        cargo: 58,
        fuel: 130,
        gunDamage: 15,
    },
    talon: {
        id: 'talon',
        name: 'Talon',
        className: 'TX-4 Courier Interceptor',
        variant: 'talon',
        personality: 'Fast, fragile striker',
        price: 34000,
        description: 'A light, twitchy interceptor built to outrun and out-turn anything it cannot outgun.',
        maxSpeed: 76,
        afterburnSpeed: 114,
        acceleration: 36,
        angularAcceleration: 2.45,
        angularDamping: 3.4,
        shield: 75,
        hull: 138,
        reactorOutput: 22,
        energyCapacity: 58,
        cargo: 16,
        fuel: 85,
        gunDamage: 12,
    },
    prospector: {
        id: 'prospector',
        name: 'Prospector',
        className: 'BP-2 Rock Hauler',
        variant: 'prospector',
        personality: 'Slow, cavernous miner',
        price: 26500,
        description: 'A reinforced ore barge with a deep hold and the patience to sit on a deposit until it is dry.',
        maxSpeed: 40,
        afterburnSpeed: 60,
        acceleration: 16,
        angularAcceleration: 1.15,
        angularDamping: 2.2,
        shield: 120,
        hull: 270,
        reactorOutput: 16,
        energyCapacity: 92,
        cargo: 96,
        fuel: 150,
        gunDamage: 8,
    },
    lancer: {
        id: 'lancer',
        name: 'Lancer',
        className: 'LN-9 Pursuit Hunter',
        variant: 'lancer',
        personality: 'Gun-focused bounty hunter',
        price: 62000,
        description: 'A warrant runner armed and shielded for long chases that end in a shooting match.',
        maxSpeed: 70,
        afterburnSpeed: 105,
        acceleration: 31,
        angularAcceleration: 2.15,
        angularDamping: 3.05,
        shield: 140,
        hull: 260,
        reactorOutput: 30,
        energyCapacity: 96,
        cargo: 30,
        fuel: 120,
        gunDamage: 19,
    },
    atlas: {
        id: 'atlas',
        name: 'Atlas Hauler',
        className: 'AT-5 Bulk Freighter',
        variant: 'atlas-freighter',
        personality: 'Titanic, ponderous hauler',
        price: 72000,
        description: 'A slow commercial freighter that trades maneuverability for a hold measured in shipping containers.',
        maxSpeed: 34,
        afterburnSpeed: 51,
        acceleration: 13,
        angularAcceleration: 0.85,
        angularDamping: 1.9,
        shield: 170,
        hull: 355,
        reactorOutput: 20,
        energyCapacity: 124,
        cargo: 160,
        fuel: 200,
        gunDamage: 9,
    },
};
export const LOCATION_ORDER = Object.freeze([
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
    if (location.kind === 'field' || location.kind === 'graveyard' || location.kind === 'rings')
        return location.radius + FIELD_ARRIVAL_MARGIN;
    if (location.kind === 'jump-point')
        return JUMP_POINT_ACTIVATION_RADIUS;
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
// Per-destination chance that a hyperdrive jump draws an encounter. Safe sectors
// (the civilized core around the starting station) sit at 20%; frontier and
// pirate-hunted destinations climb from there.
export const SECTOR_ENCOUNTER_RATE = {
    helix: 0.2,
    rook: 0.2,
    azure: 0.3,
    vesper: 0.35,
    shardbelt: 0.45,
    'mourning-line': 0.5,
};
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
