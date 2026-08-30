// Player combat resources are intentionally small and deterministic. The
// reactor fills one shared capacitor; guns spend from it immediately and
// shield recharge uses whatever remains after the post-hit delay.
export const SHIELD_RECHARGE_RATE = 5.3;
export const SHIELD_ENERGY_PER_POINT = 1.25;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
        const desired = Math.min(shieldMax - shield, SHIELD_RECHARGE_RATE * seconds);
        shieldRestored = Math.min(desired, energy / SHIELD_ENERGY_PER_POINT);
        shieldEnergySpent = shieldRestored * SHIELD_ENERGY_PER_POINT;
        shield += shieldRestored;
        energy -= shieldEnergySpent;
    }

    player.energy = clamp(energy, 0, capacity);
    player.shield = clamp(shield, 0, shieldMax);
    return { generated, shieldRestored, shieldEnergySpent, energy: player.energy, shield: player.shield };
};
