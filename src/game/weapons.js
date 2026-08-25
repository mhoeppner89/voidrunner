// Weapon registry — the single source of truth for player primary weapons.
// Each entry describes one weapon's sim personality: projectile speed, fire
// cadence, damage profile, projectile lifetime, aim-assist generosity, ammo
// economy, and (for the magrail) over-penetration. The numbers ARE the
// playstyle: a roster where every gun is "fine everywhere" fails the bar (see
// docs/bar-everspace2-weapons.md — engagement envelope is the identity).
//
// kinds map onto renderer mesh branches (render.js syncProjectiles) and audio
// voices (audio.js play()). kind is immutable per projectile slot lifetime.
export const WEAPONS = {
    pulse: {
        id: 'pulse',
        nameKey: 'PULSE LASER',
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
        pierce: 0,
    },
    gauss: {
        id: 'gauss',
        nameKey: 'MAGRAIL',
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
        pierce: 1,
    },
    pdc: {
        id: 'pdc',
        nameKey: 'POINT-DEFENSE CLUSTER',
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
        pierce: 0,
        spreadRad: 0.07,
    },
    ripper: {
        id: 'ripper',
        nameKey: 'RIPPER SCATTERGUN',
        equipmentId: 'ripper-scattergun',
        envelopeKey: 'WINS INSIDE {range}U · USELESS BEYOND',
        kind: 'ripper',
        slot: 4,
        // Brawler: seven pellets per shell across a ~6° cone; wins inside
        // their turn circle, useless beyond ~120u. Pellet speeds jitter so
        // the cloud arrives ragged, not as a ring. (Review pass: the original
        // 11° cone sprayed half the sky — tightened to keep the brawler
        // honest without wasting shells.)
        speed: 165,
        cooldown: 0.78,
        damageMul: 0.55,
        life: 0.5,
        audioKey: 'ripper',
        assist: 1.1,
        ammoId: 'shells',
        pierce: 0,
        spreadRad: 0.11,
        pellets: 7,
        speedJitter: 35,
    },
    ion: {
        id: 'ion',
        nameKey: 'ION LANCE',
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
        pierce: 0,
        shieldMul: 4,
        jamSeconds: 1.8,
    },
    mortar: {
        id: 'mortar',
        nameKey: 'SUNLANCE PLASMA MORTAR',
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
        pierce: 0,
        splashRadius: 26,
        splashMin: 12,
        burnDps: 6,
        burnSeconds: 4,
    },
};
export const WEAPON_ORDER = ['pulse', 'gauss', 'pdc', 'ripper', 'ion', 'mortar'];
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
// Guns are GAINED, not granted (bar pattern: acquisition economy): pulse and
// magrail are standard issue on every hull, the other four are station
// equipment purchases. Ownership DERIVES from the existing equipment list —
// no new save schema, and a career that already flies a gun keeps it.
export const STANDARD_ISSUE = ['pulse', 'gauss'];
export const weaponOwned = (player, weaponId) => {
    if (STANDARD_ISSUE.includes(weaponId))
        return true;
    const equipmentId = WEAPONS[weaponId]?.equipmentId;
    return Boolean(equipmentId && player.equipment?.includes(equipmentId));
};
