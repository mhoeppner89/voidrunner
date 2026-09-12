// Weapon registry — the single source of truth for player primary weapons.
// Each entry describes one weapon's sim personality: projectile speed, fire
// cadence, damage profile, projectile lifetime, aim-assist generosity, ammo
// economy, and (for the magrail) over-penetration. The numbers ARE the
// playstyle: a roster where every gun is "fine everywhere" fails the bar (see
// docs/bar-everspace2-weapons.md — engagement envelope is the identity).
//
// kinds map onto renderer mesh branches (render.js syncProjectiles) and audio
// voices (audio.js play()). kind is immutable per projectile slot lifetime.
//
// The outfitting registry owns which item is installed in a hardpoint.  This
// module only owns the flight personality of that installed item.  Keeping the
// two tables separate means a duplicated gun mount can share one projectile
// definition without making the save format weapon-specific.
import { HULL_HARDPOINTS, OUTFIT_ITEMS, canonicalOutfitId } from './outfitting.js';
// A shared speed also means a shared lead solution. Values are km/s in the
// simulation; firing-platform velocity is inherited by every physical round.
export const PROJECTILE_SPEEDS=Object.freeze({normal:500,gauss:1200,plasma:300});
export const WEAPONS = {
    pulse:{id:'pulse',nameKey:'PULSE LASER',hudNameKey:'PULSE',kind:'laser',slot:1,
        speed:PROJECTILE_SPEEDS.normal,range:400,cooldown:.17,damageFlat:10,energyCost:3.2,assist:1,audioKey:'laser',mountSize:'S'},
    beam:{id:'beam',nameKey:'BEAM EMITTER',hudNameKey:'BEAM',kind:'beam',slot:8,
        speed:100000,range:300,cooldown:.4,damageFlat:8,energyCost:6,assist:1.4,audioKey:'ion',mountSize:'S'},
    'pulse-mk2':{id:'pulse-mk2',nameKey:'PULSE CANNON MK II',hudNameKey:'PULSE MK II',kind:'laser',slot:7,equipmentId:'pulse-mk2',
        speed:PROJECTILE_SPEEDS.normal,range:400,cooldown:.17,damageFlat:13.5,energyCost:5,assist:1,audioKey:'laser',mountSize:'M'},
    gauss:{id:'gauss',nameKey:'MAGRAIL',hudNameKey:'MAGRAIL',kind:'gauss',slot:2,
        speed:PROJECTILE_SPEEDS.gauss,range:600,cooldown:.95,damageFlat:40,energyCost:14,shieldBypass:.25,assist:.5,audioKey:'gauss',mountSize:'M'},
    pdc:{id:'pdc',nameKey:'POINT-DEFENSE CLUSTER',hudNameKey:'PDC',kind:'pdc',slot:3,equipmentId:'pdc-cluster',
        speed:PROJECTILE_SPEEDS.normal,range:300,cooldown:.07,damageFlat:.8,energyCost:.6,shieldMul:.15,assist:1,audioKey:'pdc',mountSize:'S',
        burstSize:10,shotInterval:.07,burstPause:1,interceptInterval:.6,interceptEnergy:4},
    ripper:{id:'ripper',nameKey:'RIPPER SCATTERGUN',hudNameKey:'RIPPER',kind:'ripper',slot:4,equipmentId:'ripper-scattergun',
        speed:PROJECTILE_SPEEDS.normal,range:350,cooldown:.78,damageFlat:5.5,energyCost:9,hullMul:1.7,pellets:7,spreadRad:.035,assist:1,audioKey:'ripper',mountSize:'S'},
    ion:{id:'ion',nameKey:'ION PROJECTOR',hudNameKey:'ION',kind:'ion',slot:5,equipmentId:'ion-lance',
        speed:PROJECTILE_SPEEDS.normal,range:400,cooldown:.62,damageFlat:5,energyCost:9,shieldMul:4,jamSeconds:.8,assist:1,audioKey:'ion',mountSize:'M'},
    mortar:{id:'mortar',nameKey:'SUNLANCE PLASMA MORTAR',hudNameKey:'PLASMA MORTAR',kind:'mortar',slot:6,equipmentId:'sunlance-mortar',
        speed:PROJECTILE_SPEEDS.plasma,range:450,cooldown:1.5,damageFlat:180,energyCost:32,splashRadius:18,splashMin:4,splashDamage:24,assist:.35,audioKey:'mortar',mountSize:'M'},
};
const descriptions={
    pulse:'Normal-speed fire. Shares its lead with pulse, ion and scatterguns. 400 km range.',
    'pulse-mk2':'Stronger normal-speed pulse fire. Shares the standard lead; uses more energy. 400 km range.',
    gauss:'Very fast precision shots bypass 25% of shields. Slow firing; 600 km range.',
    ripper:'Normal-speed pellet spread deals extra hull damage. Shares the standard lead; 350 km range.',
    ion:'Normal-speed shots strip shields and briefly disrupt exposed weapons. Shares the standard lead; 400 km range.',
    mortar:'Slow plasma rewards accurate direct hits with high damage and energy efficiency. Small blast; 450 km range.',
    pdc:'Missiles first. Ten-round bursts at selected hostiles; 15% shield damage. 300 km range against ships and missiles.',
    beam:'Instant beam pulses make aiming easy. Lower damage and energy efficiency; 300 km range.',
};
for(const weapon of Object.values(WEAPONS)){
    weapon.life=weapon.range/weapon.speed;
    weapon.ammoId=null;weapon.pierce=0;
    weapon.descriptionKey=weapon.envelopeKey=descriptions[weapon.id];
}
export const TRACKING_LASER=Object.freeze({id:'tracking-turret',kind:'beam',range:300,speed:100000,damageFlat:6,energyCost:4,cooldown:.7});
export const weaponRange=weapon=>weapon.range??weapon.speed*weapon.life;
export const weaponShotDamage=weapon=>weapon.damageFlat??0;
// Launcher records are kept beside guns because they share target and
// projectile plumbing, but they use ship-local magazines and their own
// selection cycle. A swarm canister is one magazine round that opens into
// four micro-warheads after launch.
export const LAUNCHERS = {
    seeker: {
        id: 'seeker',
        nameKey: 'SEEKER MISSILE RACK',
        category: 'launcher',
        speed: 260,
        homingSpeed: 260,
        homingTurn: 1.8,
        acceleration: 520, lockRange: 800,
        damage: 42,
        life: 8,
        cooldown: 1.1,
        capacity: 4,
        ordnanceId: 'seeker-missile',
        ordnanceNameKey: 'SEEKER MISSILE',
        shortCode: 'SKR',
        unitCost: 240,
        volley: 1,
        spreadRad: 0,
        audioKey: 'missile',
    },
    swarm: {
        id: 'swarm',
        nameKey: 'SWARM MISSILE RACK',
        category: 'launcher',
        speed: 300,
        homingSpeed: 300,
        homingTurn: 2.4,
        acceleration: 650, lockRange: 700,
        damage: 15,
        life: 6.4,
        cooldown: 1.3,
        capacity: 12,
        ordnanceId: 'swarm-canister',
        ordnanceNameKey: 'SWARM CANISTER',
        shortCode: 'SWM',
        unitCost: 240,
        volley: 4,
        spreadRad: 0.07,
        audioKey: 'missile',
    },
    torpedo: {
        id: 'torpedo',
        nameKey: 'TORPEDO TUBE',
        category: 'launcher',
        speed: 210,
        homingSpeed: 210,
        homingTurn: .8,
        acceleration: 320, lockRange: 600,
        damage: 118,
        life: 10,
        cooldown: 2.6,
        capacity: 2,
        ordnanceId: 'heavy-torpedo',
        ordnanceNameKey: 'HEAVY TORPEDO',
        shortCode: 'TOR',
        unitCost: 240,
        volley: 1,
        spreadRad: 0,
        splashRadius: 20,
        splashMin: 20,
        audioKey: 'missile',
    },
};
export const WEAPON_ORDER = ['pulse', 'gauss', 'pdc', 'ripper', 'ion', 'mortar', 'pulse-mk2', 'beam'];
export const LAUNCHER_ORDER = ['seeker', 'swarm', 'torpedo'];
// Ammo pool capacities keyed by ammoId (null-ammo weapons are energy-pooled
// or heat-gated and never run dry — pressure comes from cadence/heat).
export const AMMO_CAPACITY = Object.freeze({});
export const AMMO_UNIT_COST = Object.freeze({});
// Migration only: obsolete ammunition is exchanged once, at its former price.
export const LEGACY_GUN_AMMO = Object.freeze({slugs: [48,26], shells: [36,18], cells: [60,22], pods: [10,40]});
export const ammoCapacity = (ammoId) => (ammoId ? AMMO_CAPACITY[ammoId] ?? 0 : 0);
export const weaponForSlot = (slot) => WEAPONS[WEAPON_ORDER[slot - 1]];
export const launcherForId = (id) => LAUNCHERS[id];

const legacyEquipmentForWeapon = Object.freeze({
    pdc: 'pdc-cluster',
    ripper: 'ripper-scattergun',
    ion: 'ion-lance',
    mortar: 'sunlance-mortar',
    'pulse-mk2': 'pulse-mk2',
});

/** Resolve the flight weapon represented by an outfitting item. */
export const weaponIdForOutfit = (itemOrId) => {
    const rawId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    const id = canonicalOutfitId(rawId);
    // Pulse Mk II intentionally has effects.weaponId === 'pulse' for old
    // catalog callers; its item id is the authoritative distinction.
    if (id === 'pulse-mk2')
        return 'pulse-mk2';
    const item = OUTFIT_ITEMS[id];
    if(item?.category==='turret')return undefined;
    const candidate = item?.weaponId ?? item?.effects?.weaponId;
    return candidate && WEAPONS[candidate] ? candidate : (WEAPONS[id] ? id : undefined);
};
export const launcherIdForOutfit = (itemOrId) => {
    const rawId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    const id = canonicalOutfitId(rawId);
    const item = OUTFIT_ITEMS[id];
    const candidate = item?.weaponId ?? item?.effects?.weaponId;
    return candidate && LAUNCHERS[candidate] ? candidate : (LAUNCHERS[id] ? id : undefined);
};
export const weaponForOutfit = (itemOrId) => {
    const id = weaponIdForOutfit(itemOrId);
    return id ? WEAPONS[id] : undefined;
};
export const launcherForOutfit = (itemOrId) => {
    const id = launcherIdForOutfit(itemOrId);
    return id ? LAUNCHERS[id] : undefined;
};

const directLoadout = (player, shipId = player?.shipId) => {
    const loadout = player?.outfitting?.loadouts?.[shipId];
    return loadout && typeof loadout === 'object' ? loadout : undefined;
};

/** True only when the weapon is installed in a gun mount on this hull. */
export const weaponOwned = (player, weaponId) => {
    const loadout = directLoadout(player);
    const spec = HULL_HARDPOINTS[player?.shipId];
    if (loadout && spec) {
        for (const [index, mount] of spec.guns.entries()) {
            const itemWeaponId = weaponIdForOutfit(loadout.guns?.[index]);
            if (itemWeaponId === weaponId)
                return true;
        }
        return false;
    }
    // Lightweight combat probes and pre-schema callers may not carry the new
    // state yet. Keep their old standard-issue/acquisition semantics as a
    // boundary fallback; hydrated careers always take the branch above.
    if (STANDARD_ISSUE.includes(weaponId))
        return true;
    const legacy = legacyEquipmentForWeapon[weaponId];
    return Boolean(legacy && (player?.equipment ?? []).includes(legacy));
};

/** Iterate fitted gun slots without cloning a loadout in the flight loop. */
export const mountedGunEntries = (player, shipId = player?.shipId) => {
    const loadout = directLoadout(player, shipId);
    const spec = HULL_HARDPOINTS[shipId];
    if (!loadout || !spec)
        return [];
    const result = [];
    for (const [index, mount] of spec.guns.entries()) {
        const itemId = loadout.guns?.[index];
        const weaponId = weaponIdForOutfit(itemId);
        if (weaponId && WEAPONS[weaponId])
            result.push({ index, mount, itemId, weaponId, weapon: WEAPONS[weaponId], group: loadout.fireGroups?.assignments?.[mount.id] === 'B' ? 'B' : 'A' });
    }
    return result;
};

/** Iterate fitted launcher slots. Used for capacity, refill and firing. */
export const mountedLauncherEntries = (player, shipId = player?.shipId) => {
    const loadout = directLoadout(player, shipId);
    const spec = HULL_HARDPOINTS[shipId];
    if (!loadout || !spec)
        return [];
    const result = [];
    for (const [index, mount] of spec.launchers.entries()) {
        const itemId = loadout.launchers?.[index];
        const launcherId = launcherIdForOutfit(itemId);
        if (launcherId && LAUNCHERS[launcherId])
            result.push({ index, mount, itemId, launcherId, launcher: LAUNCHERS[launcherId] });
    }
    return result;
};

export const missileCapacityForPlayer = (player, shipId = player?.shipId) => mountedLauncherEntries(player, shipId).reduce((total, entry) => total + entry.launcher.capacity, 0);

const magazineRecords = (player) => player?.launcherMagazines
    && typeof player.launcherMagazines === 'object'
    && !Array.isArray(player.launcherMagazines)
    ? player.launcherMagazines
    : {};
const magazineRounds = (value, capacity) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(capacity, Math.floor(number))) : 0;
};

/** Read every fitted rack together with its own typed magazine. Careers from
 * before save schema 10 have only the aggregate `player.missiles` field; until
 * hydration migrates them, that pool is distributed across mounts in order. */
export const launcherMagazineEntries = (player, shipId = player?.shipId) => {
    const mounted = mountedLauncherEntries(player, shipId);
    const records = magazineRecords(player);
    const hasCanonicalMagazine = mounted.some((entry) => records[entry.mount.id]?.launcherId === entry.launcherId);
    let legacyRemaining = hasCanonicalMagazine ? 0 : magazineRounds(player?.missiles, missileCapacityForPlayer(player, shipId));
    const selectedMountId = mounted.some((entry) => entry.mount.id === player?.activeLauncherMountId)
        ? player.activeLauncherMountId
        : mounted[0]?.mount.id;
    return mounted.map((entry) => {
        const record = records[entry.mount.id];
        let rounds = 0;
        if (record?.launcherId === entry.launcherId)
            rounds = magazineRounds(record.rounds, entry.launcher.capacity);
        else if (!hasCanonicalMagazine) {
            rounds = Math.min(entry.launcher.capacity, legacyRemaining);
            legacyRemaining -= rounds;
        }
        return {
            ...entry,
            magazineId: entry.mount.id,
            ordnanceId: entry.launcher.ordnanceId,
            rounds,
            capacity: entry.launcher.capacity,
            selected: entry.mount.id === selectedMountId,
        };
    });
};

/** Reconcile persistent magazines with the current hardpoints. Matching racks
 * retain their rounds. A newly installed/different rack starts empty unless
 * this is a new commission (`fill`) or an old shared pool is being migrated. */
export const normalizeLauncherMagazines = (player, { legacyMissiles, fill = false } = {}) => {
    if (!player || typeof player !== 'object')
        return [];
    const mounted = mountedLauncherEntries(player);
    const records = magazineRecords(player);
    const hasCanonicalMagazine = mounted.some((entry) => records[entry.mount.id]?.launcherId === entry.launcherId);
    const hasLegacyPool = !hasCanonicalMagazine && legacyMissiles !== undefined;
    let legacyRemaining = hasLegacyPool ? magazineRounds(legacyMissiles, missileCapacityForPlayer(player)) : 0;
    const next = {};
    for (const entry of mounted) {
        const record = records[entry.mount.id];
        let rounds = 0;
        if (record?.launcherId === entry.launcherId)
            rounds = magazineRounds(record.rounds, entry.launcher.capacity);
        else if (hasLegacyPool) {
            rounds = Math.min(entry.launcher.capacity, legacyRemaining);
            legacyRemaining -= rounds;
        }
        else if (fill)
            rounds = entry.launcher.capacity;
        next[entry.mount.id] = {
            launcherId: entry.launcherId,
            ordnanceId: entry.launcher.ordnanceId,
            rounds,
        };
    }
    player.launcherMagazines = next;
    const selectedStillMounted = mounted.some((entry) => entry.mount.id === player.activeLauncherMountId);
    if (!selectedStillMounted)
        player.activeLauncherMountId = mounted.find((entry) => next[entry.mount.id]?.rounds > 0)?.mount.id ?? mounted[0]?.mount.id ?? null;
    player.missiles = Object.values(next).reduce((total, record) => total + record.rounds, 0);
    return launcherMagazineEntries(player);
};

export const fillLauncherMagazines = (player) => {
    const entries = normalizeLauncherMagazines(player);
    for (const entry of entries)
        player.launcherMagazines[entry.mount.id].rounds = entry.launcher.capacity;
    player.missiles = missileCapacityForPlayer(player);
    return launcherMagazineEntries(player);
};

export const clearLauncherMagazines = (player) => {
    const entries = normalizeLauncherMagazines(player);
    for (const entry of entries)
        player.launcherMagazines[entry.mount.id].rounds = 0;
    player.missiles = 0;
    return launcherMagazineEntries(player);
};

export const activeLauncherMagazine = (player) => launcherMagazineEntries(player).find((entry) => entry.selected);

export const syncLauncherMissileTotal = (player) => {
    const total = launcherMagazineEntries(player).reduce((sum, entry) => sum + entry.rounds, 0);
    player.missiles = total;
    return total;
};
// Guns are GAINED, not granted (bar pattern: acquisition economy). New hulls
// receive their factory pulse/gauss mounts through outfitting state. The
// fallback list remains solely for old tests/imported saves at the boundary.
export const STANDARD_ISSUE = ['pulse', 'gauss'];

export const weaponAssistCone = weapon => 0.18 * (weapon?.assist ?? 1);
