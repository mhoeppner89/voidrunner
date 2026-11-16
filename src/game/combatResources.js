const COMBAT_RECOVERY_SCALE = .5;

// Ship combat resources are deterministic. The reactor fills one shared
// capacitor; guns spend from it immediately and shields use what remains
// after the post-hit delay.
// Apply a broad recharge lift to every flyable hull and non-frigate NPC ship.
// Capital frigates use their separate, subsystem-controlled recharge rate.
export const NON_FRIGATE_SHIELD_RECHARGE_MULTIPLIER = 2;
// Fallback for legacy/minimal stat records. Flyable hulls provide their own
// whole-number regeneration; capitals keep separate passive/subsystem rates.
export const SHIELD_RECHARGE_RATE = 5;
export const SHIELD_ENERGY_PER_POINT = 1.25;
export const COMBAT_SHIELD_RECOVERY_SECONDS = 12;

// Keep recharge proportional to weapon pressure while a fight is active.
// This is runtime-only state: saving/loading cannot retain a combat penalty.
// Capitals already use their continuously reduced passive rate below.
const combatShieldRecovery = new WeakMap();
export const registerCombatShieldHit = actor => {
    if (!actor.capitalClass) combatShieldRecovery.set(actor, COMBAT_SHIELD_RECOVERY_SECONDS);
};
export const combatShieldRechargeScale = (actor, dt) => {
    const remaining = combatShieldRecovery.get(actor) ?? 0;
    if (!(remaining > 0)) return 1;
    const next = remaining - Math.max(0, Number(dt) || 0);
    if (next > 0) combatShieldRecovery.set(actor, next);
    else combatShieldRecovery.delete(actor);
    return COMBAT_RECOVERY_SCALE;
};

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const passiveShieldRechargeRate = (baseRate, capitalClass) =>
    Math.max(0, finite(baseRate, 3.8))
    * (capitalClass === 'frigate' ? 1 : NON_FRIGATE_SHIELD_RECHARGE_MULTIPLIER)
    // Capitals can recharge while taking fire. Scale their continuous repair
    // alongside weapon damage so a longer fight does not become unwinnable.
    * (capitalClass ? COMBAT_RECOVERY_SCALE : 1);

export const combinedHullIntegrity = (hull, armor = 0) => Math.max(0, finite(hull) + finite(armor));

export const normalizeEnergy = (energy, capacity) => clamp(finite(energy, capacity), 0, Math.max(0, finite(capacity)));

export const spendEnergy = (player, amount) => {
    const cost = Math.max(0, finite(amount));
    const available = Math.max(0, finite(player?.energy));
    if (available + 1e-9 < cost)
        return false;
    player.energy = Math.max(0, available - cost);
    return true;
};

/** Advance the player's reactor, capacitor and shield recharge by one fixed
 * simulation step. Mutates only player.energy and player.shield. */
export const regenerateCombatResources = (player, stats, dt, shieldDelay = 0) => {
    const seconds = Math.max(0, finite(dt));
    const shieldRateScale = combatShieldRechargeScale(player, seconds);
    const capacity = Math.max(0, finite(stats?.energyCapacity));
    const output = Math.max(0, finite(stats?.reactorOutput));
    let energy = clamp(finite(player?.energy), 0, capacity);
    const generated = Math.min(capacity - energy, output * seconds);
    energy += generated;

    const shieldMax = Math.max(0, finite(stats?.shield));
    let shield = clamp(finite(player?.shield), 0, shieldMax);
    let shieldRestored = 0;
    let shieldEnergySpent = 0;
    if (finite(shieldDelay) <= 0 && shield < shieldMax && energy > 0) {
        const desired = Math.min(shieldMax - shield, (stats.shieldRegeneration??(stats.shieldRegen??SHIELD_RECHARGE_RATE)*(stats.shieldRechargeMultiplier??1)) * shieldRateScale * seconds);
        shieldRestored = Math.min(desired, energy / SHIELD_ENERGY_PER_POINT);
        shieldEnergySpent = shieldRestored * SHIELD_ENERGY_PER_POINT;
        shield += shieldRestored;
        energy -= shieldEnergySpent;
    }

    player.energy = clamp(energy, 0, capacity);
    player.shield = clamp(shield, 0, shieldMax);
    return { generated, shieldRestored, shieldEnergySpent, energy: player.energy, shield: player.shield };
};
