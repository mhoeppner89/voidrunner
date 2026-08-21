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
        basePrice: 22,
        mass: 1.2,
        legal: true,
        category: 'Staples',
    },
    food: {
        id: 'food',
        name: 'Protein Packs',
        description: 'Long-life nutrient blocks and cultivated protein.',
        basePrice: 38,
        mass: 1,
        legal: true,
        category: 'Staples',
    },
    medicine: {
        id: 'medicine',
        name: 'Medigel',
        description: 'Temperature-controlled trauma and anti-radiation compounds.',
        basePrice: 145,
        mass: 0.5,
        legal: true,
        category: 'Medical',
    },
    electronics: {
        id: 'electronics',
        name: 'Control Electronics',
        description: 'Navigation boards, sensor cores, and industrial logic units.',
        basePrice: 285,
        mass: 0.7,
        legal: true,
        category: 'Industrial',
    },
    machinery: {
        id: 'machinery',
        name: 'Industrial Machinery',
        description: 'Actuators, pumps, drill heads, and pressure-rated assemblies.',
        basePrice: 177,
        mass: 2.2,
        legal: true,
        category: 'Industrial',
    },
    ore: {
        id: 'ore',
        name: 'Concentrated Ore',
        description: 'Dense mixed-metal concentrate recovered from frontier rock.',
        basePrice: 114,
        mass: 2.5,
        legal: true,
        category: 'Raw Materials',
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        description: 'Precious metal veins recovered from frontier rock. Small in mass, heavy in value.',
        basePrice: 900,
        mass: 0.5,
        legal: true,
        category: 'Precious',
    },
    scrap: {
        id: 'scrap',
        name: 'Reclaimed Scrap',
        description: 'Sorted hull plate, cable, and machinery fragments.',
        basePrice: 78,
        mass: 1.8,
        legal: true,
        category: 'Raw Materials',
    },
    luxuries: {
        id: 'luxuries',
        name: 'Offworld Luxuries',
        description: 'Spices, artisan spirits, and prestige consumer goods.',
        basePrice: 330,
        mass: 0.8,
        legal: true,
        category: 'Luxury',
    },
    arms: {
        id: 'arms',
        name: 'Restricted Armaments',
        description: 'Sealed weapon components. Legal only under licensed manifests.',
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
        affiliation: 'Independent',
        portraitSeed: 12,
        lines: [
            'The Shardbelt is rich this cycle. Rich enough that three crews are lying about the same claim.',
            'A trader who flies predictable lanes is a trader who buys pirates dinner.',
            'Rookhaven pays well for medicine, but their inspectors count every seal twice.',
        ],
    },
    {
        id: 'oskar-brill',
        name: 'Oskar Brill',
        role: 'Cargo factor',
        affiliation: 'Merchant Guild',
        portraitSeed: 31,
        lines: [
            'Margins are made before launch. Know who is desperate, then let the hold do the work.',
            'Azure Reach floods this station with food. Vesper still pays for every crate it can get.',
            'Guild rank buys information before it buys privilege.',
        ],
    },
    {
        id: 'sana-kell',
        name: 'Sana Kell',
        role: 'Dock mechanic',
        affiliation: 'Helix Freeport',
        portraitSeed: 53,
        lines: [
            'Your Wayfarer will forgive one bad decision. The second one goes on my invoice.',
            'Afterburners drink fuel and cook seals. Use them to end a fight, not start a commute.',
            'A clean radar is worth more than a bigger gun in the graveyard.',
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
            'A warrant pays for proof, not enthusiasm. Confirm the hull, record the kill, return alive.',
            'Red Talon traffic has shifted toward Mourning Line. They think the wrecks make them invisible.',
            'Civilian fire inside the traffic cordon will cost you every favor you have here.',
        ],
    },
    {
        id: 'yara-tan',
        name: 'Yara Tan',
        role: 'Ship broker',
        affiliation: 'Free Merchants Compact',
        portraitSeed: 87,
        lines: [
            'The Vanguard is expensive because it survives the jobs that pay for a Vanguard.',
            'Bring a clean title, enough credits, and no active warrants. I will handle the rest.',
            'Armor keeps the shape of a ship. Shields keep its options.',
        ],
    },
    {
        id: 'tovik',
        name: 'Tovik Raal',
        role: 'Bounty pilot',
        affiliation: 'Bounty Hunters Registry',
        portraitSeed: 103,
        lines: [
            'Never chase through the center of a debris lane. Make the target choose between you and the metal.',
            'Named targets keep escorts. Procedural targets keep surprises.',
            'Missiles are for commitments. Guns are for questions.',
        ],
    },
];
const vesperPeople = [
    {
        id: 'devi-castor',
        name: 'Devi Castor',
        role: 'Pit boss',
        affiliation: 'Frontier Miners Cooperative',
        portraitSeed: 121,
        lines: [
            'Scan before you cut. Most rocks are ballast; a few are retirement.',
            'Slow fragments drift into fast ships. The field keeps its own schedule.',
            'Ore is cheap here. Machinery is not. That is the whole colony in one sentence.',
            'Gold doesn\'t register on a surface scan. Run the seam dry and the pocket shows itself — one rock in a dozen pays for the whole contract.',
        ],
    },
    {
        id: 'ren-iverson',
        name: 'Ren Iverson',
        role: 'Surveyor',
        affiliation: 'Prospectors Guild',
        portraitSeed: 138,
        lines: [
            'Deep signatures fluoresce after a full scan. Partial scans sell people false confidence.',
            'The old tunnel marker still transmits. Fly through the rock crown and listen for the harmonic.',
            'Prospector rank opens claims that independent cutters never see.',
            'Gold hides in the last meter of a cut. Most crews clear the crust and move on; the crews that finish the seam are the ones who retire.',
        ],
    },
    {
        id: 'kes-ali',
        name: 'Kes Ali',
        role: 'Union organizer',
        affiliation: 'Frontier Miners Cooperative',
        portraitSeed: 147,
        lines: [
            'Pirates call it tax. We call it theft. The distinction comes with gunfire.',
            'A miner with an escort returns with ore. A miner without one returns as salvage.',
            'The Cooperative remembers who answers distress calls.',
            'The Shardbelt gold is why the lanes are watched. Cut quiet, sell far from the board, and never say what your hold is worth.',
        ],
    },
];
const azurePeople = [
    {
        id: 'linh-sorel',
        name: 'Linh Sorel',
        role: 'Agronomy delegate',
        affiliation: 'Azure Reach Cooperative',
        portraitSeed: 166,
        lines: [
            'Our harvest is predictable. The transport lanes are not.',
            'Medicine moves fastest after a storm warning. Panic is a market signal with casualties.',
            'We trade food for machines, and machines for one more season of food.',
        ],
    },
    {
        id: 'ivo-senn',
        name: 'Ivo Senn',
        role: 'Courier',
        affiliation: 'Merchant Guild',
        portraitSeed: 179,
        lines: [
            'Timed contracts pay for speed and punish improvisation.',
            'Hyperdrive is a tool. The second it says HOSTILES, you are the pilot again.',
            'Helix buys our protein packs by the pallet. Vesper buys them by the emergency.',
        ],
    },
    {
        id: 'doctor-ames',
        name: 'Dr. Soraya Ames',
        role: 'Clinic director',
        affiliation: 'Civilian Medical Service',
        portraitSeed: 191,
        lines: [
            'A damaged freighter is a delayed shipment. A delayed medicine shipment is a body count.',
            'The graveyard wrecks are never unclaimed. Salvage crews underestimate how many guns are watching.',
            'Bring us recovered medical cores intact and the clinic will pay above scrap value.',
        ],
    },
];
export const LOCATIONS = {
    helix: {
        id: 'helix',
        name: 'Helix Freeport',
        shortName: 'HELIX',
        kind: 'station',
        position: [-144000, 18000, 124000],
        radius: 880,
        dockRadius: 1420,
        faction: 'free-merchants',
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
        dockRadius: 15860,
        faction: 'frontier-miners',
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
        dockRadius: 18096,
        faction: 'free-merchants',
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
        shortName: 'GRAVEYARD',
        kind: 'graveyard',
        // Keep the wreck fleet in Helix's far viewing distance, on the
        // sunward side: roughly 20,000 world units from the station.
        position: [-149994, 21496, 142758],
        radius: 2580,
        faction: 'salvage-union',
        accent: '#a2b9b0',
        secondary: '#293738',
        description: 'A battlefield graveyard of shattered hulls, unstable reactors, and salvage claims with flexible ownership.',
    },
};
// The visible star is placed on the far star shell rather than at world
// origin. Navigation-map projections use the same anchor so sunward routes
// are not judged against the wrong point.
export const SUN_POSITION = [-360000, 144000, 800000];
export const DOCK_LOCATION_IDS = ['helix', 'rook', 'vesper', 'azure'];
export const NAV_LOCATION_IDS = ['helix', 'rook', 'vesper', 'azure', 'shardbelt', 'mourning-line'];
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
        name: 'Ablative Armor Weave',
        category: 'armor',
        price: 6500,
        description: 'Segmented sacrificial plating for extended combat endurance.',
        stat: '+40 armor capacity',
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
        armor: 85,
        hull: 100,
        cargo: 32,
        fuel: 100,
        missileCapacity: 4,
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
        armor: 145,
        hull: 150,
        cargo: 58,
        fuel: 130,
        missileCapacity: 8,
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
        armor: 60,
        hull: 78,
        cargo: 16,
        fuel: 85,
        missileCapacity: 4,
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
        armor: 130,
        hull: 140,
        cargo: 96,
        fuel: 150,
        missileCapacity: 2,
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
        armor: 125,
        hull: 135,
        cargo: 30,
        fuel: 120,
        missileCapacity: 10,
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
        armor: 165,
        hull: 190,
        cargo: 160,
        fuel: 200,
        missileCapacity: 4,
        gunDamage: 9,
    },
};
export const LOCATION_ORDER = ['helix', 'rook', 'azure', 'shardbelt', 'vesper', 'mourning-line'];
export const SYSTEM_MAP_EXTENT = 256000;
export const ROUTE_DISTANCE_SCALE = 480;
export const displaySpeed = (unitsPerSecond) => unitsPerSecond * 2;
const FIELD_ENTRY_MARGIN = 250;
export const hyperdriveArrivalRadius = (location) => {
    if (location.kind === 'field' || location.kind === 'graveyard')
        // Field destinations are navigationally centred on the cloud, but the
        // player should regain control just beyond its visible/collidable edge.
        return location.radius + FIELD_ENTRY_MARGIN;
    // Planets are huge now: exit hyperdrive at a distance proportional to the surface.
    if (location.kind === 'planet')
        return location.radius * 1.12;
    return location.radius + 2000;
};
export const spawnClearance = (location) => {
    // Ships must spawn well clear of the body and its landing zone.
    if (location.kind === 'field' || location.kind === 'graveyard')
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
export const sectorEncounterChance = (id) => SECTOR_ENCOUNTER_RATE[id] ?? 0.3;
export const locationInstanceRadius = (id) => {
    const location = LOCATIONS[id];
    if (location.kind === 'field' || location.kind === 'graveyard')
        return location.radius + 330;
    if (location.kind === 'planet')
        return (location.dockRadius ?? location.radius) + 330;
    return (location.dockRadius ?? location.radius) + 240;
};
export const routeDistanceBetween = (a, b) => {
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
