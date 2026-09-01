/*
 * Ship outfitting is deliberately kept independent from the dock UI and the
 * flight simulator.  A loadout is just a set of item ids in named hardpoint
 * arrays; the helpers below are the single place that knows whether a fit is
 * legal and what a staged transaction costs.
 *
 * The old save format had one flat `player.equipment` array.  The new format
 * keeps that array as a compatibility projection, while `player.outfitting`
 * owns counted locker stock and a loadout for every owned hull.
 */
import { LOCATIONS, SHIPS } from './data.js';

export const OUTFIT_CATEGORIES = Object.freeze(['gun', 'launcher', 'drive', 'defense', 'utility']);
export const LOADOUT_KEYS = Object.freeze(['guns', 'launchers', 'drive', 'defense', 'utility']);
export const RESALE_RATE = 0.7;
export const OUTFITTING_SCHEMA = 1;

const freeze = (value) => Object.freeze(value);
const freezeItem = (item) => {
    const sizes = freeze([...item.sizes]);
    const availability = freeze([...item.availability]);
    return freeze({
        ...item,
        sizes,
        // Aliases keep the contract self-describing for UI/catalog callers
        // that prefer a more explicit name than `sizes`.
        compatibleSizes: sizes,
        sizeCompatibility: sizes,
        availability,
        availableAt: availability,
        artPath: item.art,
        effects: freeze({ ...(item.effects ?? {}) }),
    });
};

// The ids in this registry are canonical.  `legacyEquipmentId` on entries
// that replaced a historical id lets save migration and old UI callers keep
// working without adding aliases to the 18-item shop roster.
const itemRecords = [
    {
        id: 'pulse-cannon', name: 'Pulse Cannon', category: 'gun', size: 'S', sizes: ['S', 'M'],
        price: 1200, energyCost: 3.2, mass: 1, weaponId: 'pulse', factoryFit: true,
        description: 'A dependable energy repeater fitted to every new hull.', stat: '3.2 energy / shot · no ammunition',
        effects: { weaponId: 'pulse', damageMultiplier: 1 }, availability: ['helix', 'rook', 'vesper', 'azure'],
        art: './art/outfitting/pulse-cannon.webp',
    },
    {
        id: 'pulse-mk2', name: 'Pulse Cannon Mk II', category: 'gun', size: 'M', sizes: ['M'],
        price: 10200, energyCost: 5, mass: 3, weaponId: 'pulse',
        description: 'A tighter, hotter pulse battery for pilots who want reliable damage at every range.', stat: '+35% pulse damage · 5 energy / shot',
        effects: { weaponId: 'pulse', damageMultiplier: 1.35, upgradedFrom: 'pulse-cannon' }, availability: ['rook', 'vesper'],
        requiredGuild: 'bounty', requiredRank: 1, art: './art/outfitting/pulse-mk2.webp',
    },
    {
        id: 'gauss-cannon', name: 'Gauss Cannon', category: 'gun', size: 'M', sizes: ['M'],
        price: 5200, energyCost: 6.5, mass: 4, weaponId: 'gauss', factoryFit: true,
        description: 'A long-range magnetic slug thrower with a slow, decisive firing rhythm.', stat: '×3.2 damage · 6.5 energy / shot',
        effects: { weaponId: 'gauss', damageMultiplier: 3.2, ammoId: 'slugs' }, availability: ['helix', 'rook'],
        art: './art/outfitting/gauss-cannon.webp',
    },
    {
        id: 'pdc', name: 'Point-Defense Cluster', category: 'gun', size: 'S', sizes: ['S', 'M'],
        price: 4400, energyCost: 0.8, mass: 2, weaponId: 'pdc',
        description: 'A close-range defensive cluster that turns missiles and knife-fight attackers into scrap.', stat: 'Missile guard · 0.8 energy / burst',
        effects: { weaponId: 'pdc', missileInterception: 60, heatGated: true }, availability: ['rook'],
        legacyEquipmentId: 'pdc-cluster', art: './art/outfitting/pdc.webp',
    },
    {
        id: 'ripper', name: 'Ripper Scattergun', category: 'gun', size: 'S', sizes: ['S', 'M'],
        price: 3600, energyCost: 5, mass: 3, weaponId: 'ripper',
        description: 'Seven short-range pellets spread into a brutal shell cloud inside an opponent’s turn circle.', stat: '7 pellets · 5 energy / shell',
        effects: { weaponId: 'ripper', pellets: 7, effectiveRange: 55 }, availability: ['helix', 'rook'],
        legacyEquipmentId: 'ripper-scattergun', art: './art/outfitting/ripper.webp',
    },
    {
        id: 'ion-blaster', name: 'Ion Blaster', category: 'gun', size: 'M', sizes: ['M'],
        price: 5600, energyCost: 9, mass: 5, weaponId: 'ion',
        description: 'A shield-cracking discharge that jams hostile guns long enough to open the fight.', stat: '×4 vs shields · 9 energy / shot',
        effects: { weaponId: 'ion', shieldMultiplier: 4, jamSeconds: 1.8 }, availability: ['rook', 'vesper'],
        legacyEquipmentId: 'ion-lance', art: './art/outfitting/ion-blaster.webp',
    },
    {
        id: 'mortar', name: 'Sunlance Plasma Mortar', category: 'gun', size: 'M', sizes: ['M'],
        price: 7200, energyCost: 14, mass: 7, weaponId: 'mortar',
        description: 'A slow plasma orb that rewards patience with splash damage and a lingering hull burn.', stat: 'Splash + burn · 14 energy / shot',
        effects: { weaponId: 'mortar', splashRadius: 26, burnDps: 6, burnSeconds: 4 }, availability: ['rook'],
        legacyEquipmentId: 'sunlance-mortar', art: './art/outfitting/mortar.webp',
    },
    {
        id: 'seeker-launcher', name: 'Seeker Missile Rack', category: 'launcher', size: 'S', sizes: ['S', 'M'],
        // Factory fit: every hull can launch the existing missile stock on a
        // new career without buying a launcher first.
        price: 1800, mass: 2, weaponId: 'seeker', factoryFit: true,
        description: 'A compact guided rack that gives a new pilot a forgiving first missile lock.', stat: '4 seeker missiles · high tracking',
        effects: { weaponId: 'seeker', tracking: 'high', ammoId: 'missiles' }, availability: ['helix', 'rook', 'vesper', 'azure'],
        art: './art/outfitting/seeker-launcher.webp',
    },
    {
        id: 'swarm-launcher', name: 'Swarm Missile Rack', category: 'launcher', size: 'M', sizes: ['M'],
        price: 6200, mass: 4, weaponId: 'swarm',
        description: 'A medium rack that fills the approach with several fast, imperfectly tracking warheads.', stat: '12 swarm canisters · 4-warhead volley',
        effects: { weaponId: 'swarm', volley: 4, tracking: 'medium', ammoId: 'missiles' }, availability: ['rook', 'azure'],
        art: './art/outfitting/swarm-launcher.webp',
    },
    {
        id: 'torpedo-launcher', name: 'Torpedo Tube', category: 'launcher', size: 'M', sizes: ['M'],
        price: 9800, mass: 6, weaponId: 'torpedo',
        description: 'A heavy tube for deliberate shots against large, slow or already-disabled targets.', stat: '2 heavy torpedoes · splash r=20',
        effects: { weaponId: 'torpedo', tracking: 'low', splashRadius: 20, ammoId: 'missiles' }, availability: ['rook'],
        art: './art/outfitting/torpedo-launcher.webp',
    },
    {
        id: 'engine-mk2', name: 'Overburn Engine Core', category: 'drive', size: 'M', sizes: ['M'],
        price: 8400, mass: 6,
        description: 'A hotter drive core with better thrust and a stronger feed to the ship capacitor.', stat: '+18% thrust · +3 reactor output',
        effects: { speedMultiplier: 1.18, accelerationMultiplier: 1.18, reactorOutput: 3 }, availability: ['helix', 'vesper', 'azure'],
        art: './art/outfitting/engine-mk2.webp',
    },
    {
        id: 'thrusters-mk2', name: 'Vector Thruster Rack', category: 'drive', size: 'M', sizes: ['M'],
        price: 7200, mass: 5,
        description: 'Reinforced attitude jets that recover from hard turns faster and keep a light hull on the mark.', stat: '+22% turn authority',
        effects: { turnMultiplier: 1.22 }, availability: ['rook', 'vesper'],
        art: './art/outfitting/thrusters-mk2.webp',
    },
    {
        id: 'shield-mk2', name: 'Dual-Layer Shield Grid', category: 'defense', size: 'M', sizes: ['M'],
        price: 9600, mass: 7,
        description: 'A second shield layer that gives a pilot more time to disengage before hull integrity is exposed.', stat: '+45 shield capacity',
        effects: { shieldCapacity: 45 }, availability: ['helix', 'rook'],
        art: './art/outfitting/shield-mk2.webp',
    },
    {
        id: 'armor-mk2', name: 'Ablative Hull Weave', category: 'defense', size: 'M', sizes: ['M'],
        price: 6500, mass: 8,
        description: 'Segmented plates reinforce the pressure hull without adding another cockpit damage layer.', stat: '+40 hull integrity',
        effects: { hullCapacity: 40 }, availability: ['rook', 'vesper'],
        art: './art/outfitting/armor-mk2.webp',
    },
    {
        id: 'radar-mk2', name: 'Long-Baseline Radar', category: 'utility', size: 'S', sizes: ['S', 'M'],
        price: 5400, mass: 2,
        description: 'A longer baseline sensor array that finds contacts and survey signatures before they find you.', stat: '+25% radar · +50% scan range',
        effects: { radarMultiplier: 1.25, scanMultiplier: 1.5 }, availability: ['helix', 'azure'],
        art: './art/outfitting/radar-mk2.webp',
    },
    {
        id: 'cargo-pods', name: 'External Cargo Pods', category: 'utility', size: 'M', sizes: ['M'],
        price: 4800, mass: 9,
        description: 'Armored external pods that add room for a profitable haul without changing the ship’s core hold.', stat: '+18 cargo mass',
        effects: { cargoCapacity: 18 }, availability: ['helix', 'azure'],
        requiredGuild: 'merchant', requiredRank: 1, art: './art/outfitting/cargo-pods.webp',
    },
    {
        id: 'mining-mk2', name: 'Resonant Mining Lance', category: 'utility', size: 'M', sizes: ['M'],
        price: 7600, mass: 6,
        description: 'A resonant lance that exposes richer seams while wasting less heat on fractured rock.', stat: '+70% mining rate',
        effects: { miningRate: 1.7 }, availability: ['vesper'],
        requiredGuild: 'mining', requiredRank: 1, art: './art/outfitting/mining-mk2.webp',
    },
    {
        id: 'salvage-mk2', name: 'Phase-Locked Tractor', category: 'utility', size: 'M', sizes: ['M'],
        price: 8100, mass: 6,
        description: 'A phase-locked tractor that holds unstable wreckage together while it is pulled aboard.', stat: '+70% salvage rate · 170u range',
        effects: { salvageRate: 1.7, salvageRange: 170 }, availability: ['rook'],
        requiredGuild: 'salvage', requiredRank: 1, art: './art/outfitting/salvage-mk2.webp',
    },
];

export const OUTFIT_ITEMS = freeze(Object.fromEntries(itemRecords.map(freezeItem).map((item) => [item.id, item])));
export const OUTFIT_ITEM_IDS = freeze(itemRecords.map((item) => item.id));

// Historical ids remain accepted at the boundary, never in the shop registry.
export const LEGACY_OUTFIT_ID_MAP = freeze({
    'pdc-cluster': 'pdc',
    'ripper-scattergun': 'ripper',
    'ion-lance': 'ion-blaster',
    'sunlance-mortar': 'mortar',
});

const mount = (id, category, size) => freeze({ id, category, size });
const makeMounts = (shipId, guns, launchers, utilitySizes, mass) => {
    const spec = {
        shipId,
        mass,
        guns: guns.map(([size, index]) => mount(`${shipId}-gun-${index}`, 'gun', size)),
        launchers: launchers.map(([size, index]) => mount(`${shipId}-launcher-${index}`, 'launcher', size)),
        drive: [mount(`${shipId}-drive-0`, 'drive', 'M')],
        defense: [mount(`${shipId}-defense-0`, 'defense', 'M')],
        utility: utilitySizes.map((size, index) => mount(`${shipId}-utility-${index}`, 'utility', size)),
    };
    spec.mounts = {
        gun: spec.guns,
        launcher: spec.launchers,
        drive: spec.drive,
        defense: spec.defense,
        utility: spec.utility,
    };
    spec.slotCounts = {
        gun: spec.guns.length,
        launcher: spec.launchers.length,
        drive: spec.drive.length,
        defense: spec.defense.length,
        utility: spec.utility.length,
    };
    spec.massBudget = mass;
    spec.hardpoints = {
        guns: { S: spec.guns.filter((slot) => slot.size === 'S').length, M: spec.guns.filter((slot) => slot.size === 'M').length },
        launchers: { S: spec.launchers.filter((slot) => slot.size === 'S').length, M: spec.launchers.filter((slot) => slot.size === 'M').length },
        drive: spec.drive.length,
        defense: spec.defense.length,
        utility: spec.utility.length,
    };
    spec.utilitySizes = [...utilitySizes];
    return freeze(spec);
};

// Mass remains the physical fitting limit. Reactor output is a flight stat,
// never an installation gate: a demanding gun fit is legal, but it can drain
// the capacitor faster than the hull replenishes it.
export const HULL_HARDPOINTS = freeze({
    wayfarer: makeMounts('wayfarer', [['S', 0], ['S', 1], ['M', 2]], [['S', 0]], ['M', 'S'], 34),
    talon: makeMounts('talon', [['S', 0], ['S', 1], ['M', 2]], [['S', 0]], ['S'], 28),
    vanguard: makeMounts('vanguard', [['S', 0], ['S', 1], ['M', 2], ['M', 3]], [['M', 0]], ['M', 'S'], 52),
    prospector: makeMounts('prospector', [['S', 0], ['M', 1]], [['S', 0]], ['M', 'M', 'S'], 70),
    lancer: makeMounts('lancer', [['M', 0], ['M', 1], ['M', 2]], [['M', 0], ['M', 1]], ['S'], 44),
    atlas: makeMounts('atlas', [['M', 0], ['M', 1]], [['M', 0]], ['M', 'M', 'S', 'S'], 120),
});
export const HARDPOINT_SPECS = HULL_HARDPOINTS;
export const UNIQUE_OUTFIT_IDS = freeze(['radar-mk2', 'mining-mk2', 'salvage-mk2']);
const FACTORY_BASELINE_IDS = freeze(['pulse-cannon', 'gauss-cannon', 'seeker-launcher']);

const categoryKey = (category) => category === 'gun' ? 'guns' : category === 'launcher' ? 'launchers' : category;
const canonicalId = (id) => LEGACY_OUTFIT_ID_MAP[id] ?? id;
const itemFor = (itemOrId) => typeof itemOrId === 'string' ? OUTFIT_ITEMS[canonicalId(itemOrId)] : itemOrId?.id ? OUTFIT_ITEMS[canonicalId(itemOrId.id)] ?? itemOrId : undefined;
const clone = (value) => JSON.parse(JSON.stringify(value));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const integerCount = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const normalizedLegacyEquipment = (value) => Array.isArray(value)
    ? value.filter((id) => typeof id === 'string')
    : [];

// Compatibility saves sometimes contain both a historical id and its newer
// canonical replacement for the same physical module. Count the most copies
// recorded by either spelling instead of summing aliases, while preserving
// genuine duplicate entries written under one spelling.
const canonicalLegacyEquipment = (value) => {
    const known = new Map();
    const unknown = [];
    for (const rawId of normalizedLegacyEquipment(value)) {
        const id = canonicalId(rawId);
        if (!OUTFIT_ITEMS[id]) {
            unknown.push(rawId);
            continue;
        }
        if (!known.has(id))
            known.set(id, new Map());
        const spellings = known.get(id);
        spellings.set(rawId, (spellings.get(rawId) ?? 0) + 1);
    }
    const result = [];
    for (const [id, spellings] of known) {
        const count = Math.max(...spellings.values());
        for (let index = 0; index < count; index += 1)
            result.push(id);
    }
    return [...result, ...unknown];
};

export const canonicalOutfitId = canonicalId;
export const outfitItem = (id) => OUTFIT_ITEMS[canonicalId(id)];

// Pulse Mk II deliberately shares the base pulse weapon implementation, but
// its old active-weapon id is still meaningful. Keep that distinction at the
// migration boundary instead of letting a registry lookup collapse it back to
// the ordinary pulse cannon.
const outfitIdForWeapon = (weaponId) => weaponId === 'pulse-mk2'
    ? 'pulse-mk2'
    : Object.values(OUTFIT_ITEMS).find((item) => item.weaponId === weaponId)?.id;

export const itemFitsMount = (itemOrId, mountOrCategory, size) => {
    const item = itemFor(itemOrId);
    const mountValue = typeof mountOrCategory === 'object' ? mountOrCategory : { category: mountOrCategory, size };
    if (!item || !mountValue)
        return false;
    return item.category === mountValue.category
        && (item.sizes ?? [item.size]).includes(mountValue.size);
};

const specFor = (shipId) => HULL_HARDPOINTS[shipId];
const mountsFor = (shipId, category) => specFor(shipId)?.[categoryKey(category)] ?? [];
const emptyFactoryFlags = (shipId) => {
    const spec = specFor(shipId);
    if (!spec)
        return { guns: [], launchers: [], drive: [], defense: [], utility: [] };
    return {
        guns: spec.guns.map(() => false),
        launchers: spec.launchers.map(() => false),
        drive: spec.drive.map(() => false),
        defense: spec.defense.map(() => false),
        utility: spec.utility.map(() => false),
    };
};
const factoryFlagsForLoadout = (shipId, loadout) => {
    const flags = emptyFactoryFlags(shipId);
    for (const key of LOADOUT_KEYS) {
        const values = loadout?.factory?.[key];
        if (Array.isArray(values))
            flags[key] = flags[key].map((_, index) => values[index] === true && Boolean(OUTFIT_ITEMS[loadout?.[key]?.[index]]?.factoryFit));
        else
            flags[key] = (loadout?.[key] ?? []).map((id) => Boolean(OUTFIT_ITEMS[id]?.factoryFit));
    }
    return flags;
};
// Older canonical saves could omit the explicit factory ledger. In that case
// at most one fitted copy of each baseline item came bundled with a hull;
// duplicate pulse/gauss/seeker modules are paid equipment and must survive a
// fleet collapse or trade-in as sellable locker stock.
const conservativeFactoryFlags = (shipId, loadout, savedFlags) => {
    const spec = specFor(shipId);
    const completeLedger = Boolean(spec) && isRecord(savedFlags) && LOADOUT_KEYS.every((key) => (
        Array.isArray(savedFlags[key])
        && savedFlags[key].length === spec[key].length
        && savedFlags[key].every((value) => typeof value === 'boolean')
    ));
    if (completeLedger)
        return factoryFlagsForLoadout(shipId, { ...loadout, factory: savedFlags });
    const flags = emptyFactoryFlags(shipId);
    const claimed = new Set();
    for (const key of LOADOUT_KEYS) {
        for (const [index, id] of (loadout?.[key] ?? []).entries()) {
            if (!FACTORY_BASELINE_IDS.includes(id) || claimed.has(id))
                continue;
            flags[key][index] = true;
            claimed.add(id);
        }
    }
    return flags;
};
const factoryCounts = (shipId, loadout, flags) => {
    const counts = {};
    for (const key of LOADOUT_KEYS)
        for (const [index, isFactory] of (flags?.[key] ?? []).entries()) {
            const id = loadout?.[key]?.[index];
            if (isFactory && id)
                counts[id] = (counts[id] ?? 0) + 1;
        }
    return counts;
};
const defaultFireGroups = (shipId) => {
    const spec = specFor(shipId);
    const assignments = {};
    for (const [index, slot] of (spec?.guns ?? []).entries())
        assignments[slot.id] = index % 2 === 0 ? 'A' : 'B';
    return { activeGroup: 'A', assignments };
};

const normalizeFireGroups = (shipId, source) => {
    const defaults = defaultFireGroups(shipId);
    const raw = source && typeof source === 'object' ? source : {};
    const assignments = { ...defaults.assignments };
    const supplied = raw.assignments ?? raw.gunGroups ?? raw.guns;
    if (supplied && typeof supplied === 'object') {
        for (const [mountId, group] of Object.entries(supplied))
            if (group === 'A' || group === 'B')
                assignments[mountId] = group;
    }
    return { activeGroup: raw.activeGroup === 'B' ? 'B' : 'A', assignments };
};

const emptyLoadout = (shipId) => {
    const spec = specFor(shipId);
    if (!spec)
        return { guns: [], launchers: [], drive: [], defense: [], utility: [] };
    return {
        guns: spec.guns.map(() => null),
        launchers: spec.launchers.map(() => null),
        drive: spec.drive.map(() => null),
        defense: spec.defense.map(() => null),
        utility: spec.utility.map(() => null),
        fireGroups: defaultFireGroups(shipId),
    };
};

const rawSlots = (source, key, mounts) => {
    const value = source?.[key] ?? source?.[key === 'guns' ? 'gun' : key === 'launchers' ? 'launcher' : key];
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object')
        return mounts.map((slot) => value[slot.id] ?? null);
    return [];
};

/** Return a legal-shaped loadout. Invalid entries are dropped; call
 * validateLoadout first when the caller needs the rejection reason. */
export const normalizeLoadout = (shipId, source = {}) => {
    const result = emptyLoadout(shipId);
    const spec = specFor(shipId);
    if (!spec)
        return result;
    for (const key of LOADOUT_KEYS) {
        const mounts = spec[key];
        const values = rawSlots(source, key, mounts);
        result[key] = mounts.map((slot, index) => {
            const id = values[index];
            const item = itemFor(id);
            return item && itemFitsMount(item, slot) ? item.id : null;
        });
    }
    // Every gun mount has a stable A/B assignment so the flight layer can
    // resolve a fire group without inventing defaults at runtime.
    result.fireGroups = normalizeFireGroups(shipId, source?.fireGroups);
    return result;
};

const standardFit = (shipId, loadout) => {
    const spec = specFor(shipId);
    if (!spec)
        return loadout;
    const place = (id, predicate = () => true, categories = ['guns']) => {
        const item = OUTFIT_ITEMS[id];
        for (const key of categories) {
            for (let index = 0; index < spec[key].length; index += 1) {
                if (!predicate(spec[key][index], index) || loadout[key][index] || !itemFitsMount(item, spec[key][index]))
                    continue;
                loadout[key][index] = id;
                return true;
            }
        }
        return false;
    };
    // A pulse cannon is the universal baseline. Gauss occupies an M bay when
    // one exists and seeker preserves the existing missile control. Factory
    // copies are bundled in the hull state, not an infinite global stock.
    place('pulse-cannon');
    place('gauss-cannon');
    place('seeker-launcher', () => true, ['launchers']);
    // Alternate the guns that are actually installed, rather than alternating
    // every physical bay. Some hulls leave an empty S bay between their
    // factory pulse and gauss mounts; grouping by bay index would put both
    // usable guns in A and leave B empty. This runs only while seeding a new or
    // migrated loadout, so a player's later all-A/all-B grouping is preserved.
    let gunOrder = 0;
    for (const [index, mountValue] of spec.guns.entries()) {
        if (!loadout.guns[index])
            continue;
        loadout.fireGroups.assignments[mountValue.id] = gunOrder % 2 === 0 ? 'A' : 'B';
        gunOrder += 1;
    }
    return loadout;
};

const normalizeLocker = (locker, factoryOnly = false) => {
    const result = {};
    for (const [rawId, rawCount] of Object.entries(ownObject(locker))) {
        const id = canonicalId(rawId);
        if (!OUTFIT_ITEMS[id] || (factoryOnly && !OUTFIT_ITEMS[id].factoryFit))
            continue;
        const count = integerCount(rawCount);
        if (count > 0)
            result[id] = (result[id] ?? 0) + count;
    }
    return result;
};

const ownedShipIds = (player) => {
    const listed = Array.isArray(player?.ownedShips) ? player.ownedShips : [];
    const result = [...new Set([...listed, player?.shipId].filter((id) => SHIPS[id] && HULL_HARDPOINTS[id]))];
    return result.length ? result : ['wayfarer'];
};

const projectionIds = (state) => {
    const ids = [];
    for (const loadout of Object.values(state.loadouts ?? {})) {
        for (const key of LOADOUT_KEYS)
            for (const id of loadout[key] ?? [])
                if (id && !ids.includes(id))
                    ids.push(id);
    }
    for (const [id, count] of Object.entries(state.locker ?? {}))
        if (count > 0 && !ids.includes(id))
            ids.push(id);
    // Unknown ids from older expansions/save versions live in a sidecar so
    // they cannot be fitted or priced, but compatibility callers must still
    // see them instead of silently losing the original equipment record.
    for (const id of normalizedLegacyEquipment(state.legacyEquipment))
        if (!ids.includes(id))
            ids.push(id);
    return ids;
};

/** Create canonical state for a new career or a list of owned hulls. */
export const createOutfittingState = (ownedShips = ['wayfarer']) => {
    const ids = [...new Set((Array.isArray(ownedShips) ? ownedShips : ['wayfarer']).filter((id) => SHIPS[id] && HULL_HARDPOINTS[id]))];
    if (!ids.length)
        ids.push('wayfarer');
    const loadouts = {};
    const factory = {};
    for (const shipId of ids) {
        loadouts[shipId] = standardFit(shipId, emptyLoadout(shipId));
        factory[shipId] = factoryFlagsForLoadout(shipId, loadouts[shipId]);
    }
    return { schema: OUTFITTING_SCHEMA, locker: {}, factoryLocker: {}, loadouts, factory };
};

const addCount = (target, id, count = 1) => {
    if (!id || count <= 0)
        return target;
    target[id] = (target[id] ?? 0) + count;
    return target;
};
const paidLockerCounts = (state) => {
    const result = normalizeLocker(state?.locker);
    for (const [id, count] of Object.entries(normalizeLocker(state?.factoryLocker, true))) {
        const next = Math.max(0, (result[id] ?? 0) - count);
        if (next > 0)
            result[id] = next;
        else
            delete result[id];
    }
    return result;
};
const addPaidInstalled = (target, shipId, loadout, savedFlags) => {
    const flags = conservativeFactoryFlags(shipId, loadout, savedFlags);
    for (const key of LOADOUT_KEYS)
        for (const [index, id] of (loadout?.[key] ?? []).entries())
            if (id && !flags[key]?.[index])
                addCount(target, id);
    return target;
};

/** Collapse a fleet-era fitting record to one retained hull. Paid equipment
 * from every discarded hull moves to the locker; factory-bound equipment has
 * no resale value and leaves with its hull. */
export const collapseOutfittingToSingleShip = (player = {}, shipId = player?.shipId) => {
    const targetId = SHIPS[shipId] && HULL_HARDPOINTS[shipId] ? shipId : 'wayfarer';
    const source = validCanonicalOutfitting(player.outfitting)
        ? clone(player.outfitting)
        : migrateLegacyOutfitting(player);
    const targetLoadout = normalizeLoadout(targetId, source.loadouts?.[targetId] ?? {});
    if (!source.loadouts?.[targetId])
        standardFit(targetId, targetLoadout);
    const targetFactory = conservativeFactoryFlags(targetId, targetLoadout, source.factory?.[targetId]);
    const locker = paidLockerCounts(source);
    const owned = new Set(ownedShipIds(player));
    for (const [oldShipId, oldLoadout] of Object.entries(source.loadouts ?? {})) {
        if (oldShipId === targetId || !HULL_HARDPOINTS[oldShipId] || !owned.has(oldShipId))
            continue;
        addPaidInstalled(locker, oldShipId, normalizeLoadout(oldShipId, oldLoadout), source.factory?.[oldShipId]);
    }
    // The fleet-era factory locker was global and cannot say which discarded
    // hull supplied a copy. Retain at most the one baseline entitlement the
    // surviving hull is missing; unattributable extras leave with old hulls.
    const sourceFactoryLocker = normalizeLocker(source.factoryLocker, true);
    const installedFactory = factoryCounts(targetId, targetLoadout, targetFactory);
    const factoryLocker = {};
    for (const id of FACTORY_BASELINE_IDS) {
        const allowance = Math.max(0, 1 - (installedFactory[id] ?? 0));
        const count = Math.min(allowance, sourceFactoryLocker[id] ?? 0);
        if (count > 0)
            factoryLocker[id] = count;
    }
    const combinedLocker = { ...locker };
    countsAdd(combinedLocker, factoryLocker);
    const result = {
        schema: OUTFITTING_SCHEMA,
        locker: combinedLocker,
        factoryLocker,
        loadouts: { [targetId]: targetLoadout },
        factory: { [targetId]: targetFactory },
    };
    const legacyEquipment = normalizedLegacyEquipment(source.legacyEquipment);
    if (legacyEquipment.length)
        result.legacyEquipment = legacyEquipment;
    return result;
};

/** Prepare a newly commissioned hull. All paid old-hull and locker modules are
 * retained, while every old factory copy leaves with the trade-in. */
export const commissionOutfittingForShip = (player = {}, shipId) => {
    const targetId = SHIPS[shipId] && HULL_HARDPOINTS[shipId] ? shipId : undefined;
    if (!targetId)
        return undefined;
    const source = validCanonicalOutfitting(player.outfitting)
        ? clone(player.outfitting)
        : migrateLegacyOutfitting(player);
    const locker = paidLockerCounts(source);
    const owned = new Set(ownedShipIds(player));
    for (const [oldShipId, oldLoadout] of Object.entries(source.loadouts ?? {})) {
        if (!HULL_HARDPOINTS[oldShipId] || !owned.has(oldShipId))
            continue;
        addPaidInstalled(locker, oldShipId, normalizeLoadout(oldShipId, oldLoadout), source.factory?.[oldShipId]);
    }
    const result = createOutfittingState([targetId]);
    result.locker = locker;
    const legacyEquipment = normalizedLegacyEquipment(source.legacyEquipment);
    if (legacyEquipment.length)
        result.legacyEquipment = legacyEquipment;
    return result;
};

/**
 * Convert a legacy flat equipment array into per-hull fits.  The current hull
 * gets first claim on old gear; anything that cannot fit goes into the counted
 * locker. Factory pulse/gauss/seeker modules are seeded for every owned hull;
 * they are ordinary counted modules after that.
 */
export const migrateLegacyOutfitting = (player = {}) => {
    const ships = ownedShipIds(player);
    const currentShip = SHIPS[player.shipId] && HULL_HARDPOINTS[player.shipId] ? player.shipId : ships[0];
    const state = createOutfittingState(ships);
    // Give legacy items a clear bay before seeding factory weapons. This
    // preserves an old upgrade whenever an appropriate bay exists.
    state.factoryLocker = {};
    state.factory = {};
    for (const shipId of ships) {
        state.loadouts[shipId] = emptyLoadout(shipId);
        state.factory[shipId] = emptyFactoryFlags(shipId);
    }

    const locker = {};
    const factoryLocker = {};
    const addCount = (target, id, count = 1) => {
        if (!id || count <= 0)
            return;
        target[id] = (target[id] ?? 0) + count;
    };
    const place = (shipId, id) => {
        const spec = specFor(shipId);
        const loadout = state.loadouts[shipId];
        const item = OUTFIT_ITEMS[id];
        for (const key of LOADOUT_KEYS) {
            for (let index = 0; index < spec[key].length; index += 1) {
                if (!loadout[key][index] && itemFitsMount(item, spec[key][index])) {
                    loadout[key][index] = id;
                    return true;
                }
            }
        }
        return false;
    };
    const legacyIds = canonicalLegacyEquipment(player.equipment);
    // Schema-6 careers sometimes stored a purchased weapon only in the
    // active `weaponId` field (the old hydration courtesy added its equipment
    // id later). Bring that ownership into canonical outfitting before the
    // flat compatibility projection is refreshed.
    const weaponItemId = outfitIdForWeapon(player.weaponId);
    if (weaponItemId && !OUTFIT_ITEMS[weaponItemId]?.factoryFit && !legacyIds.some((id) => canonicalId(id) === weaponItemId))
        legacyIds.push(weaponItemId);
    for (const rawId of legacyIds) {
        const id = canonicalId(rawId);
        const item = OUTFIT_ITEMS[id];
        if (!item) {
            // Keep unknown historical ids visible to old callers. They cannot
            // be fitted or priced, so retain them in a migration sidecar.
            if (typeof rawId === 'string')
                state.legacyEquipment = [...(state.legacyEquipment ?? []), rawId];
            continue;
        }
        if (!place(currentShip, id))
            locker[id] = (locker[id] ?? 0) + 1;
    }
    // Remember which baseline copies found a mount before handling the one
    // historical compatibility rule below. This lets an occupied current-hull
    // M bay be replaced for gauss without losing the displaced factory copy.
    const baselineSeeded = {};
    for (const shipId of ships) {
        standardFit(shipId, state.loadouts[shipId]);
        baselineSeeded[shipId] = Object.fromEntries(FACTORY_BASELINE_IDS.map((id) => [id, allItemsInLoadout(state.loadouts[shipId]).includes(id)]));
    }
    // Gauss is standard issue in the old weapon roster. If a legacy M-gun
    // occupied every bay, move that one legacy copy to the locker so the
    // player never loses access to the baseline gauss weapon after migration.
    const currentLoadout = state.loadouts[currentShip];
    if (!allItemsInLoadout(currentLoadout).includes('gauss-cannon')) {
        const mMounts = specFor(currentShip)?.guns ?? [];
        const mIndex = mMounts.findIndex((slot) => slot.size === 'M');
        if (mIndex >= 0) {
            const displaced = currentLoadout.guns[mIndex];
            // A displaced factory baseline is returned through the factory
            // locker below. Other legacy gear is paid/owned gear and must stay
            // sellable in the ordinary locker rather than disappearing.
            if (displaced && !(baselineSeeded[currentShip]?.[displaced] && FACTORY_BASELINE_IDS.includes(displaced)))
                addCount(locker, displaced);
            if (displaced && baselineSeeded[currentShip]?.[displaced] && FACTORY_BASELINE_IDS.includes(displaced))
                baselineSeeded[currentShip][displaced] = false;
            currentLoadout.guns[mIndex] = 'gauss-cannon';
            baselineSeeded[currentShip]['gauss-cannon'] = true;
        }
    }
    // Every owned hull receives one bound copy of each factory baseline. When
    // old gear fills the bays, keep that copy in both ledgers: the ordinary
    // locker makes it usable, while factoryLocker preserves its unsellable
    // origin. The two counts are consumed together when it is fitted later.
    for (const shipId of ships) {
        for (const id of FACTORY_BASELINE_IDS) {
            if (baselineSeeded[shipId]?.[id] || allItemsInLoadout(state.loadouts[shipId]).includes(id))
                continue;
            addCount(locker, id);
            addCount(factoryLocker, id);
        }
        state.factory[shipId] = factoryFlagsForLoadout(shipId, state.loadouts[shipId]);
    }
    // Preserve the old active weapon selection when it is installed. New
    // flight code can read activeGroup without consulting the flat projection.
    const activeWeapon = outfitIdForWeapon(player.weaponId);
    if (activeWeapon) {
        const activeItem = OUTFIT_ITEMS[activeWeapon];
        const activeIndex = (specFor(currentShip)?.guns ?? []).findIndex((slot, index) => currentLoadout.guns[index] === activeItem?.id);
        if (activeIndex >= 0)
            currentLoadout.fireGroups.activeGroup = currentLoadout.fireGroups.assignments[(specFor(currentShip)?.guns ?? [])[activeIndex].id] ?? 'A';
    }
    state.locker = locker;
    state.factoryLocker = factoryLocker;
    return state;
};

const validCanonicalOutfitting = (source) => {
    if (!isRecord(source) || source.schema !== OUTFITTING_SCHEMA || !isRecord(source.locker) || !isRecord(source.loadouts))
        return false;
    if (source.factoryLocker !== undefined && !isRecord(source.factoryLocker))
        return false;
    if (source.factory !== undefined && !isRecord(source.factory))
        return false;
    if (source.legacyEquipment !== undefined && !Array.isArray(source.legacyEquipment))
        return false;
    if (Object.values(source.loadouts).some((loadout) => !isRecord(loadout)))
        return false;
    if (Object.values(source.factory ?? {}).some((flags) => !isRecord(flags)))
        return false;
    return true;
};

/** Normalize (and return) player.outfitting without trusting malformed save
 * data. The player object is mutated only at its `outfitting` property. */
export const normalizeOutfitting = (player = {}) => {
    const source = validCanonicalOutfitting(player.outfitting)
        ? player.outfitting
        : migrateLegacyOutfitting(player);
    const ships = ownedShipIds(player);
    const state = { schema: OUTFITTING_SCHEMA, locker: normalizeLocker(source.locker), factoryLocker: normalizeLocker(source.factoryLocker, true), loadouts: {}, factory: {} };
    for (const shipId of ships) {
        const hasSavedLoadout = Boolean(source.loadouts?.[shipId]);
        state.loadouts[shipId] = normalizeLoadout(shipId, source.loadouts?.[shipId] ?? {});
        if (!hasSavedLoadout)
            standardFit(shipId, state.loadouts[shipId]);
        state.factory[shipId] = conservativeFactoryFlags(shipId, state.loadouts[shipId], source.factory?.[shipId]);
    }
    // A semantically damaged canonical record can still pass the shape check
    // while silently dropping a module that remains in the old compatibility
    // projection. Recover one copy of any such known item into paid locker
    // stock; modern commits keep the projection exact, so this does not revive
    // legitimately sold equipment.
    const represented = new Set(Object.keys(state.locker));
    for (const loadout of Object.values(state.loadouts))
        for (const id of allItemsInLoadout(loadout))
            represented.add(id);
    for (const rawId of Array.isArray(player.equipment) ? player.equipment : []) {
        const id = canonicalId(rawId);
        if (!OUTFIT_ITEMS[id] || represented.has(id))
            continue;
        state.locker[id] = (state.locker[id] ?? 0) + 1;
        represented.add(id);
    }
    const activeWeaponItemId = outfitIdForWeapon(player.weaponId);
    if (activeWeaponItemId
        && OUTFIT_ITEMS[activeWeaponItemId]
        && !OUTFIT_ITEMS[activeWeaponItemId].factoryFit
        && !represented.has(activeWeaponItemId)) {
        state.locker[activeWeaponItemId] = (state.locker[activeWeaponItemId] ?? 0) + 1;
        represented.add(activeWeaponItemId);
    }
    const legacyEquipment = normalizedLegacyEquipment(source.legacyEquipment);
    if (legacyEquipment.length)
        state.legacyEquipment = legacyEquipment;
    player.outfitting = state;
    return state;
};

export const loadoutFor = (player, shipId = player?.shipId) => {
    const state = normalizeOutfitting({ ...player, outfitting: player?.outfitting ? clone(player.outfitting) : undefined });
    return state.loadouts[shipId] ? clone(state.loadouts[shipId]) : normalizeLoadout(shipId, {});
};

export const installedItemIds = (player, shipId = player?.shipId) => {
    const loadout = loadoutFor(player, shipId);
    return LOADOUT_KEYS.flatMap((key) => (loadout[key] ?? []).filter(Boolean));
};

export const installedCounts = (player, shipId = player?.shipId) => {
    const counts = {};
    for (const id of installedItemIds(player, shipId))
        counts[id] = (counts[id] ?? 0) + 1;
    return counts;
};

const allItemsInLoadout = (loadout) => LOADOUT_KEYS.flatMap((key) => (loadout?.[key] ?? []).filter(Boolean));
const itemCount = (ids) => ids.reduce((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
}, {});

const legacyIdFor = Object.freeze(Object.fromEntries(
    Object.values(OUTFIT_ITEMS).filter((item) => item.legacyEquipmentId).map((item) => [item.id, item.legacyEquipmentId]),
));

/** Return the flat compatibility ids for code that has not migrated yet.
 * Canonical ids remain visible alongside historical aliases so no caller
 * has to infer ownership from implicit starter-weapon rules. */
export const projectLegacyEquipment = (player, state = player?.outfitting) => {
    const source = state ?? normalizeOutfitting({ ...player });
    const ids = [];
    for (const id of projectionIds(source)) {
        // Keep canonical ids for the new game layer, plus the historical alias
        // where one exists so old weapon/equipment lookups remain valid during
        // the transition.
        if (!ids.includes(id))
            ids.push(id);
        const legacyId = legacyIdFor[id];
        if (legacyId && !ids.includes(legacyId))
            ids.push(legacyId);
    }
    return ids;
};

/** Resolve a legacy weaponId from the active fire group. The flight layer can
 * still use this while it transitions to reading all assigned gun mounts. */
export const projectLegacyWeaponId = (player, shipId = player?.shipId, group) => {
    const loadout = loadoutFor(player, shipId);
    const active = group === 'A' || group === 'B'
        ? group
        : loadout.fireGroups?.activeGroup === 'B' ? 'B' : 'A';
    const spec = specFor(shipId);
    for (const [index, mountValue] of (spec?.guns ?? []).entries()) {
        if (loadout.fireGroups?.assignments?.[mountValue.id] !== active)
            continue;
        const itemId = canonicalId(loadout.guns[index]);
        const item = outfitItem(itemId);
        // Pulse Mk II uses the pulse implementation in combat, but old save
        // state and weapon cycling must retain its distinct mounted identity.
        if (itemId === 'pulse-mk2')
            return 'pulse-mk2';
        const weaponId = item?.weaponId ?? item?.effects?.weaponId;
        if (weaponId)
            return weaponId;
    }
    return 'pulse';
};

export const defaultLoadoutFor = (shipId) => {
    const state = createOutfittingState([shipId]);
    return clone(state.loadouts[shipId] ?? emptyLoadout(shipId));
};
export const createDefaultLoadout = defaultLoadoutFor;

export const outfittingUsage = (player, shipId = player?.shipId, draft) => {
    const spec = specFor(shipId);
    const loadout = draft ? normalizeLoadout(shipId, draft) : loadoutFor(player, shipId);
    const ids = allItemsInLoadout(loadout);
    const mass = ids.reduce((sum, id) => sum + (OUTFIT_ITEMS[id]?.mass ?? 0), 0);
    const cargoBonus = ids.reduce((sum, id) => sum + (OUTFIT_ITEMS[id]?.effects?.cargoCapacity ?? 0), 0);
    const energyPerVolley = { A: 0, B: 0 };
    for (const [index, mountValue] of (spec?.guns ?? []).entries()) {
        const item = OUTFIT_ITEMS[loadout.guns?.[index]];
        if (!item)
            continue;
        const group = loadout.fireGroups?.assignments?.[mountValue.id] === 'B' ? 'B' : 'A';
        energyPerVolley[group] += Number(item.energyCost ?? 0);
    }
    return {
        mass,
        massLimit: spec?.mass ?? 0,
        massRemaining: (spec?.mass ?? 0) - mass,
        energyPerVolley,
        cargoBonus,
        cargoCapacity: (SHIPS[shipId]?.cargo ?? 0) + cargoBonus,
        loadout,
    };
};

const guildRank = (player, guild) => Number(player?.guildRank?.[guild] ?? player?.guildRep?.[guild] ?? 0);
export const itemAvailable = (player, itemOrId, locationId = player?.dockedAt) => {
    const item = itemFor(itemOrId);
    if (!item)
        return false;
    if (item.availability?.length && locationId && !item.availability.includes(locationId))
        return false;
    if (item.requiredGuild && guildRank(player, item.requiredGuild) < (item.requiredRank ?? 0))
        return false;
    return true;
};

const addError = (errors, code, detail = {}) => errors.push({ code, ...detail });

/** Validate a proposed assignment before pricing it. `options.cargoMass` (or
 * `options.currentCargoMass`) is the mass already in the hold. */
export const validateLoadout = (player = {}, shipId = player.shipId, draft = {}, options = {}) => {
    const errors = [];
    const spec = specFor(shipId);
    if (!SHIPS[shipId] || !spec) {
        addError(errors, 'unknown-ship', { shipId });
        return { ok: false, code: errors[0].code, errors, shipId };
    }
    if (Array.isArray(player.ownedShips) && player.ownedShips.length && !player.ownedShips.includes(shipId))
        addError(errors, 'ship-not-owned', { shipId });
    const raw = draft ?? {};
    const normalized = normalizeLoadout(shipId, raw);
    for (const key of LOADOUT_KEYS) {
        const mounts = spec[key];
        const values = rawSlots(raw, key, mounts);
        if (values.length > mounts.length)
            addError(errors, 'too-many-items', { slot: key });
        for (let index = 0; index < Math.min(values.length, mounts.length); index += 1) {
            const rawId = values[index];
            if (rawId == null || rawId === '')
                continue;
            const id = canonicalId(rawId);
            const item = itemFor(rawId);
            if (!item) {
                addError(errors, 'unknown-item', { itemId: rawId, slot: key, index });
                continue;
            }
            if (!itemFitsMount(item, mounts[index]))
                addError(errors, 'incompatible-mount', { itemId: id, slot: key, index, mount: mounts[index] });
            if (normalized[key][index] !== id && itemFitsMount(item, mounts[index]))
                addError(errors, 'invalid-item', { itemId: id, slot: key, index });
        }
    }
    const usage = outfittingUsage(player, shipId, normalized);
    if (usage.mass > usage.massLimit)
        addError(errors, 'mass-over-budget', { mass: usage.mass, limit: usage.massLimit });
    const cargoMassValue = options.cargoMass ?? options.currentCargoMass ?? options.holdMass ?? player.cargoMass;
    if (Number.isFinite(Number(cargoMassValue)) && Number(cargoMassValue) > usage.cargoCapacity)
        addError(errors, 'cargo-over-capacity', { cargoMass: Number(cargoMassValue), capacity: usage.cargoCapacity });
    const counts = itemCount(allItemsInLoadout(normalized));
    for (const id of UNIQUE_OUTFIT_IDS)
        if ((counts[id] ?? 0) > 1)
            addError(errors, 'duplicate-unique-module', { itemId: id, count: counts[id] });
    return {
        ok: errors.length === 0,
        code: errors[0]?.code ?? 'ok',
        errors,
        shipId,
        loadout: normalized,
        usage,
    };
};

const countsAdd = (target, source, sign = 1) => {
    for (const [id, value] of Object.entries(source ?? {})) {
        const next = (target[id] ?? 0) + value * sign;
        if (next > 0)
            target[id] = next;
        else
            delete target[id];
    }
    return target;
};
const countsClone = (source) => ({ ...source });
const positiveDifference = (left, right) => {
    const result = {};
    for (const id of new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])) {
        const count = Math.max(0, (left?.[id] ?? 0) - (right?.[id] ?? 0));
        if (count > 0)
            result[id] = count;
    }
    return result;
};
const normalizeCountMap = (source) => {
    const result = {};
    for (const [rawId, rawCount] of Object.entries(ownObject(source))) {
        const id = canonicalId(rawId);
        if (!OUTFIT_ITEMS[id])
            continue;
        const count = integerCount(rawCount);
        if (count > 0)
            result[id] = (result[id] ?? 0) + count;
    }
    return result;
};
const ownValue = (source, keys) => {
    for (const key of keys) {
        if (source && Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined)
            return source[key];
    }
    return undefined;
};
const normalizedNumber = (value) => value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;
const contextCargoMass = (player, options = {}, fallback = undefined) => normalizedNumber(
    ownValue(options, ['cargoMass', 'currentCargoMass', 'holdMass'])
        ?? player?.cargoMass
        ?? fallback,
);
const contextLocation = (player, options = {}, fallback = undefined) => {
    const supplied = ownValue(options, ['locationId']);
    return supplied !== undefined ? supplied : player?.dockedAt ?? fallback ?? null;
};
const contextSnapshot = (player, shipId, options = {}, fallbackCargoMass) => ({
    credits: Number(player?.credits ?? 0),
    shipId,
    currentShipId: player?.shipId ?? null,
    dockedAt: player?.dockedAt ?? null,
    locationId: contextLocation(player, options),
    ownedShips: clone(player?.ownedShips ?? null),
    guildRank: clone(player?.guildRank ?? null),
    guildRep: clone(player?.guildRep ?? null),
    cargo: clone(player?.cargo ?? null),
    sealedCargo: clone(player?.sealedCargo ?? null),
    // Keep both the raw save value and the effective value used for cargo
    // validation. The raw field catches hand-edited/derived-state changes;
    // the effective field covers callers that supply a calculated hold mass.
    rawCargoMass: clone(player?.cargoMass ?? null),
    cargoMass: contextCargoMass(player, options, fallbackCargoMass),
    legacyEquipment: clone(player?.equipment ?? null),
    outfitting: clone(player?.outfitting ?? null),
});
const fingerprint = (player, shipId, options = {}, fallbackCargoMass) => JSON.stringify(contextSnapshot(player, shipId, options, fallbackCargoMass));
const priceTotal = (counts) => Object.entries(counts).reduce((sum, [id, count]) => sum + (OUTFIT_ITEMS[id]?.price ?? 0) * count, 0);

const normalizedRequest = (shipId, loadout, purchases = {}, sales = {}) => ({
    shipId,
    loadout: clone(normalizeLoadout(shipId, loadout)),
    purchases: normalizeCountMap(purchases),
    sales: normalizeCountMap(sales),
});

const requestFromQuote = (quote) => {
    const raw = quote?.request;
    const shipId = raw?.shipId ?? quote?.shipId;
    if (typeof shipId !== 'string' || !isRecord(raw))
        return undefined;
    if (!isRecord(raw.loadout) || !isRecord(raw.purchases) || !isRecord(raw.sales))
        return undefined;
    return normalizedRequest(shipId, raw.loadout, raw.purchases, raw.sales);
};

/**
 * Price a complete staged fit. Missing non-standard copies are automatically
 * purchased, which lets the dock use one deterministic path for “buy and
 * install” and for rearranging existing stock. `options.purchases`/`buy` can
 * stage extra locker copies; `options.sales`/`sell` sells locker copies at 70%.
 */
export const quoteOutfitting = (player = {}, shipId = player.shipId, draft, options = {}) => {
    const safeOptions = isRecord(options) ? options : {};
    const actualDock = player?.dockedAt ?? null;
    if (!actualDock)
        return { ok: false, code: 'not-docked', errors: [{ code: 'not-docked' }], shipId };
    if (!LOCATIONS[actualDock]?.services?.outfitting)
        return { ok: false, code: 'service-unavailable', errors: [{ code: 'service-unavailable', locationId: actualDock }], shipId };
    const locationId = contextLocation(player, safeOptions);
    if (locationId !== actualDock)
        return { ok: false, code: 'location-mismatch', errors: [{ code: 'location-mismatch', locationId, dockedAt: actualDock }], shipId };
    const workingPlayer = { ...player, outfitting: player?.outfitting ? clone(player.outfitting) : undefined };
    const state = normalizeOutfitting(workingPlayer);
    const current = state.loadouts[shipId] ?? normalizeLoadout(shipId, {});
    const requested = draft ? normalizeLoadout(shipId, draft) : clone(current);
    const cargoMass = contextCargoMass(player, safeOptions);
    const validationOptions = { ...safeOptions, locationId, cargoMass };
    const validation = validateLoadout(workingPlayer, shipId, draft ?? current, validationOptions);
    if (!validation.ok)
        return { ok: false, code: validation.code, errors: validation.errors, validation, shipId };
    const explicitPurchases = normalizeCountMap(safeOptions.purchases ?? safeOptions.buy);
    const explicitSales = normalizeCountMap(safeOptions.sales ?? safeOptions.sell);
    const request = normalizedRequest(shipId, requested, explicitPurchases, explicitSales);
    const lockerBefore = normalizeLocker(state.locker);
    const currentCounts = itemCount(allItemsInLoadout(current));
    const desiredCounts = itemCount(allItemsInLoadout(requested));
    const available = countsAdd(countsClone(lockerBefore), currentCounts);
    const requiredPurchases = {};
    for (const [id, count] of Object.entries(desiredCounts)) {
        const missing = Math.max(0, count - (available[id] ?? 0));
        if (missing > 0)
            requiredPurchases[id] = missing;
    }
    const purchases = countsClone(requiredPurchases);
    countsAdd(purchases, explicitPurchases);
    for (const [id, count] of Object.entries(purchases)) {
        if (!itemAvailable(player, id, locationId))
            return { ok: false, code: 'item-unavailable', errors: [{ code: 'item-unavailable', itemId: id, count }], shipId };
    }
    // Required purchases are consumed by the desired fit. Only copies already
    // in the locker, returned by uninstalling the old fit, or explicitly
    // bought as extras may be sold in this same transaction. This keeps an
    // installed module from being sold out from under its own loadout.
    const returnedToLocker = positiveDifference(currentCounts, desiredCounts);
    const lockerAfterFit = {};
    const allLockerIds = new Set([...Object.keys(lockerBefore), ...Object.keys(currentCounts), ...Object.keys(desiredCounts), ...Object.keys(purchases)]);
    for (const id of allLockerIds) {
        const count = (lockerBefore[id] ?? 0) + (currentCounts[id] ?? 0) + (purchases[id] ?? 0) - (desiredCounts[id] ?? 0);
        if (count > 0)
            lockerAfterFit[id] = count;
    }
    const currentFactoryFlags = state.factory?.[shipId] ?? emptyFactoryFlags(shipId);
    const currentFactoryCounts = factoryCounts(shipId, current, currentFactoryFlags);
    const factoryPool = countsClone(state.factoryLocker ?? {});
    countsAdd(factoryPool, currentFactoryCounts);
    const nextFactoryFlags = emptyFactoryFlags(shipId);
    // Factory copies are consumed before paid/locker copies. A factory copy
    // moved to a different mount remains bound and cannot be sold for credits.
    for (const key of LOADOUT_KEYS) {
        for (const [index, id] of (requested[key] ?? []).entries()) {
            if (!id || (factoryPool[id] ?? 0) <= 0)
                continue;
            nextFactoryFlags[key][index] = true;
            factoryPool[id] -= 1;
        }
    }
    const lockerFactoryAfter = normalizeLocker(factoryPool, true);
    const lockerAvailableForSale = {};
    for (const id of new Set([...Object.keys(lockerAfterFit), ...Object.keys(lockerFactoryAfter)])) {
        const count = Math.max(0, (lockerAfterFit[id] ?? 0) - (lockerFactoryAfter[id] ?? 0));
        if (count > 0)
            lockerAvailableForSale[id] = count;
    }
    const sales = explicitSales;
    for (const [id, count] of Object.entries(sales)) {
        if ((lockerAvailableForSale[id] ?? 0) < count)
            return { ok: false, code: 'not-enough-stock-to-sell', errors: [{ code: 'not-enough-stock-to-sell', itemId: id, count, available: lockerAvailableForSale[id] ?? 0 }], shipId };
    }
    countsAdd(lockerAfterFit, sales, -1);
    const spent = priceTotal(purchases);
    const resale = Math.round(priceTotal(sales) * RESALE_RATE);
    const netCost = spent - resale;
    const creditsBefore = Number(player.credits);
    if (!Number.isFinite(creditsBefore) || creditsBefore < 0)
        return { ok: false, code: 'invalid-credits', errors: [{ code: 'invalid-credits', credits: player.credits }], shipId };
    if (creditsBefore < netCost)
        return { ok: false, code: 'insufficient-credits', errors: [{ code: 'insufficient-credits', credits: creditsBefore, cost: netCost }], shipId };
    const nextState = clone(state);
    nextState.locker = lockerAfterFit;
    nextState.loadouts[shipId] = requested;
    nextState.factoryLocker = lockerFactoryAfter;
    nextState.factory = nextState.factory ?? {};
    nextState.factory[shipId] = nextFactoryFlags;
    const beforeFingerprint = fingerprint(player, shipId, { cargoMass });
    const afterCredits = creditsBefore - netCost;
    const context = contextSnapshot(player, shipId, { locationId, cargoMass });
    return {
        ok: true,
        code: 'ok',
        shipId,
        loadout: requested,
        afterLoadout: requested,
        usage: validation.usage,
        validation,
        lockerBefore,
        lockerAfter: lockerAfterFit,
        sellable: lockerAvailableForSale,
        purchases,
        sales,
        spent,
        resale,
        netCost,
        cost: netCost,
        creditsBefore,
        creditsAfter: afterCredits,
        returnedToLocker,
        request,
        context,
        contextFingerprint: beforeFingerprint,
        locationId,
        cargoMass,
        beforeFingerprint,
        afterState: nextState,
    };
};

/** Apply a previously accepted quote as one atomic operation. A stale quote
 * cannot overwrite another fitting change made since it was staged. */
export const commitOutfitting = (player, quote, currentOptions = {}) => {
    if (!quote?.ok)
        return { ok: false, code: quote?.code ?? 'invalid-quote' };
    const request = requestFromQuote(quote);
    if (!request)
        return { ok: false, code: 'invalid-quote' };
    const safeOptions = isRecord(currentOptions) ? currentOptions : {};
    const quotedLocation = quote.context?.locationId ?? quote.locationId ?? null;
    // Never infer a current dock from the quote or from a caller-supplied
    // location. An undocked player must fail, and a context override that does
    // not match the actual dock must not authorize a purchase.
    const actualDock = player?.dockedAt ?? null;
    const currentLocation = contextLocation(player, safeOptions);
    if (!actualDock)
        return { ok: false, code: 'not-docked' };
    if (!LOCATIONS[actualDock]?.services?.outfitting)
        return { ok: false, code: 'service-unavailable' };
    if (!currentLocation || currentLocation !== actualDock || quotedLocation !== currentLocation)
        return { ok: false, code: 'stale-quote' };
    const quotedCargoMass = quote.context?.cargoMass ?? quote.cargoMass;
    const currentCargoMass = contextCargoMass(player, safeOptions, quotedCargoMass);
    const expectedFingerprint = quote.beforeFingerprint ?? quote.contextFingerprint ?? quote.context?.fingerprint;
    if (!expectedFingerprint || fingerprint(player, request.shipId, { cargoMass: currentCargoMass }) !== expectedFingerprint)
        return { ok: false, code: 'stale-quote' };
    // Re-price and re-validate from the normalized request and the current
    // context. Mutable presentation fields on a quote (netCost, afterState,
    // validation, etc.) are never trusted as write input.
    const freshQuote = quoteOutfitting(player, request.shipId, request.loadout, {
        purchases: request.purchases,
        sales: request.sales,
        locationId: currentLocation,
        cargoMass: currentCargoMass,
    });
    if (!freshQuote.ok)
        return { ok: false, code: freshQuote.code, errors: freshQuote.errors, quote: freshQuote };
    if (freshQuote.beforeFingerprint !== expectedFingerprint)
        return { ok: false, code: 'stale-quote' };
    const nextOutfitting = clone(freshQuote.afterState);
    const nextCredits = Number(player.credits ?? 0) - Number(freshQuote.netCost ?? 0);
    // Build every derived value before mutating the player. This keeps a
    // failed projection or validation from leaving a half-applied transaction.
    const nextEquipment = projectLegacyEquipment(player, nextOutfitting);
    const nextWeaponId = projectLegacyWeaponId({
        ...player,
        outfitting: nextOutfitting,
        equipment: nextEquipment,
        weaponId: undefined,
    }, request.shipId, nextOutfitting.loadouts?.[request.shipId]?.fireGroups?.activeGroup);
    player.outfitting = nextOutfitting;
    player.credits = nextCredits;
    player.equipment = nextEquipment;
    player.weaponId = nextWeaponId;
    return { ok: true, code: 'committed', credits: player.credits, outfitting: player.outfitting, quote: freshQuote };
};

export const sellOutfitting = (player, shipId = player?.shipId, sales = {}, options = {}) => {
    const draft = loadoutFor(player, shipId);
    return quoteOutfitting(player, shipId, draft, { ...options, sales });
};
