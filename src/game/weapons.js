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
};
export const WEAPON_ORDER = ['pulse', 'gauss'];
// Ammo pool capacities keyed by ammoId (null-ammo weapons are energy-pooled
// and never run dry — pressure comes from the cadence, per the bar dossier).
export const AMMO_CAPACITY = {
    slugs: 48,
};
// Station restock price per unit of ammo, charged by the REFILL service.
export const AMMO_UNIT_COST = {
    slugs: 26,
};
export const ammoCapacity = (ammoId) => (ammoId ? AMMO_CAPACITY[ammoId] ?? 0 : 0);
export const weaponForSlot = (slot) => WEAPONS[WEAPON_ORDER[slot - 1]];
