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
export const WEAPONS = {
    pulse: {
        id: 'pulse',
        nameKey: 'PULSE LASER',
        hudNameKey: 'PULSE',
        envelopeKey: 'ANY-RANGE REPEATER · REACH {range}U',
        kind: 'laser',
        slot: 1,
        // Baseline energy repeater — byte-identical to the historical gun.
        speed: 205,
        cooldown: 0.17,
        damageMul: 1,
        life: 1.35,
        audioKey: 'laser',
        assist: 1,
        ammoId: null,
        energyCost: 3.2,
        pierce: 0,
        mountSize: 'S',
    },
    'pulse-mk2': {
        id: 'pulse-mk2',
        nameKey: 'PULSE CANNON MK II',
        hudNameKey: 'PULSE MK II',
        envelopeKey: 'ANY-RANGE REPEATER · REACH {range}U · OVERCHARGED',
        kind: 'laser',
        slot: 7,
        equipmentId: 'pulse-mk2',
        // This is a real medium pulse weapon, rather than a global ship buff.
        // It therefore only contributes when a pulse-mk2 module occupies an
        // active M gun mount.
        speed: 218,
        cooldown: 0.17,
        damageMul: 1.35,
        life: 1.35,
        audioKey: 'laser',
        assist: 1,
        ammoId: null,
        energyCost: 5,
        pierce: 0,
        mountSize: 'M',
    },
    gauss: {
        id: 'gauss',
        nameKey: 'MAGRAIL',
        hudNameKey: 'MAGRAIL',
        envelopeKey: 'DUELIST · WINS BEYOND 300U · PUNCHES THROUGH',
        kind: 'gauss',
        slot: 2,
        // Long-range duelist: one hypervelocity slug, slow cadence, half the
        // aim-assist cone (a skill weapon), and over-penetration — the slug
        // punches through the first ship it hits and can strike one more.
        speed: 620,
        cooldown: 0.95,
        damageMul: 3.2,
        life: 1.6,
        audioKey: 'gauss',
        assist: 0.5,
        ammoId: 'slugs',
        energyCost: 6.5,
        pierce: 1,
        mountSize: 'M',
    },
    pdc: {
        id: 'pdc',
        nameKey: 'POINT-DEFENSE CLUSTER',
        hudNameKey: 'PDC',
        equipmentId: 'pdc-cluster',
        envelopeKey: 'WINS INSIDE {range}U · SHREDS MISSILES',
        kind: 'pdc',
        slot: 3,
        // Guardian: a buzz-saw spray of stubby bolts whose point-blank DPS
        // beats the pulse INSIDE its 71u envelope (0.55 x 10 dmg at 0.06s),
        // plus passive interception of hostile missiles within 60u even while
        // aiming elsewhere. Heat-gated instead of ammo-fed: 3.5s of sustained
        // fire forces a 1.6s vent (pressure lives on the session, not save).
        // Beyond ~70u it loses to everything — that is the honest weakness.
        speed: 170,
        cooldown: 0.06,
        damageMul: 0.55,
        life: 0.42,
        audioKey: 'pdc',
        assist: 0.8,
        ammoId: null,
        energyCost: 0.8,
        pierce: 0,
        spreadRad: 0.07,
        mountSize: 'S',
    },
    ripper: {
        id: 'ripper',
        nameKey: 'RIPPER SCATTERGUN',
        hudNameKey: 'RIPPER',
        equipmentId: 'ripper-scattergun',
        envelopeKey: 'WINS INSIDE {range}U · USELESS BEYOND',
        kind: 'ripper',
        slot: 4,
        // Brawler: seven pellets per shell across a ~6° gaussian-clumped
        // cone; wins inside their turn circle, useless beyond ~55u. Pellet
        // speeds jitter so the cloud arrives ragged, not as a ring. (Review
        // passes: the original 11° single-axis fan sprayed half the sky, and
        // the 0.5s reach let it snipe — both reined in.)
        speed: 165,
        cooldown: 0.78,
        damageMul: 0.55,
        life: 0.35,
        audioKey: 'ripper',
        assist: 1.1,
        ammoId: 'shells',
        energyCost: 5,
        pierce: 0,
        spreadRad: 0.11,
        pellets: 7,
        speedJitter: 35,
        mountSize: 'S',
    },
    ion: {
        id: 'ion',
        nameKey: 'ION LANCE',
        hudNameKey: 'ION LANCE',
        equipmentId: 'ion-lance',
        envelopeKey: 'CRACKS SHIELDS ×4 · JAMS GUNS · SOFT VS HULL',
        kind: 'ion',
        slot: 5,
        // Shield-cracker: half hull damage but ×4 against shields, and every
        // hit jams the target's guns briefly (NPC fireCooldown). The opener
        // that makes any kinetic land harder.
        speed: 240,
        cooldown: 0.62,
        damageMul: 0.5,
        life: 1.3,
        audioKey: 'ion',
        assist: 0.9,
        ammoId: 'cells',
        energyCost: 9,
        pierce: 0,
        shieldMul: 4,
        jamSeconds: 1.8,
        mountSize: 'M',
    },
    mortar: {
        id: 'mortar',
        nameKey: 'SUNLANCE PLASMA MORTAR',
        hudNameKey: 'PLASMA MORTAR',
        equipmentId: 'sunlance-mortar',
        envelopeKey: 'SIEGE · SPLASH + BURN · LOB AND WAIT',
        kind: 'mortar',
        slot: 6,
        // Siege: a slow heavy orb. Flat direct damage, splash with falloff to
        // everything nearby, and a burn that chews hull for seconds after.
        // Orbiting bombardment, not dogfighting.
        speed: 85,
        cooldown: 2.2,
        damageFlat: 30,
        damageMul: 0,
        life: 3.2,
        audioKey: 'mortar',
        assist: 0.35,
        ammoId: 'pods',
        energyCost: 14,
        pierce: 0,
        splashRadius: 26,
        splashMin: 12,
        burnDps: 6,
        burnSeconds: 4,
        mountSize: 'M',
    },
};
// Launcher records are kept beside guns because they share target and
// projectile plumbing, but they are not part of the primary weapon cycle.
// One trigger pull consumes one missile from each fitted rack; swarm racks
// turn that single round into four micro-warheads.
export const LAUNCHERS = {
    seeker: {
        id: 'seeker',
        nameKey: 'SEEKER MISSILE RACK',
        category: 'launcher',
        speed: 104,
        homingSpeed: 104,
        homingTurn: 3.1,
        damage: 42,
        life: 8,
        cooldown: 1.1,
        capacity: 4,
        volley: 1,
        spreadRad: 0,
        audioKey: 'missile',
    },
    swarm: {
        id: 'swarm',
        nameKey: 'SWARM MISSILE RACK',
        category: 'launcher',
        speed: 112,
        homingSpeed: 112,
        homingTurn: 3.8,
        damage: 15,
        life: 6.4,
        cooldown: 1.3,
        capacity: 12,
        volley: 4,
        spreadRad: 0.07,
        audioKey: 'missile',
    },
    torpedo: {
        id: 'torpedo',
        nameKey: 'TORPEDO TUBE',
        category: 'launcher',
        speed: 58,
        homingSpeed: 58,
        homingTurn: 1.45,
        damage: 118,
        life: 10,
        cooldown: 2.6,
        capacity: 2,
        volley: 1,
        spreadRad: 0,
        splashRadius: 20,
        splashMin: 20,
        audioKey: 'missile',
    },
};
export const WEAPON_ORDER = ['pulse', 'gauss', 'pdc', 'ripper', 'ion', 'mortar', 'pulse-mk2'];
export const LAUNCHER_ORDER = ['seeker', 'swarm', 'torpedo'];
// Ammo pool capacities keyed by ammoId (null-ammo weapons are energy-pooled
// or heat-gated and never run dry — pressure comes from cadence/heat).
export const AMMO_CAPACITY = {
    slugs: 48,
    shells: 36,
    cells: 60,
    pods: 10,
};
// Station restock price per unit of ammo, charged by the REFILL service.
export const AMMO_UNIT_COST = {
    slugs: 26,
    shells: 18,
    cells: 22,
    pods: 40,
};
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
// Guns are GAINED, not granted (bar pattern: acquisition economy). New hulls
// receive their factory pulse/gauss mounts through outfitting state. The
// fallback list remains solely for old tests/imported saves at the boundary.
export const STANDARD_ISSUE = ['pulse', 'gauss'];
