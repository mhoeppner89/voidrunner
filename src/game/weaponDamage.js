// One damage calculation for all actors. Hull multipliers never amplify shield damage.
export function weaponDamage(shield, amount, weapon = {}) {
    const damage = Math.max(0, Number(amount) || 0);
    const bypass = damage * Math.max(0, Math.min(1, weapon.shieldBypass ?? 0));
    const shieldMultiplier = Math.max(0.01, weapon.shieldMul ?? 1);
    const absorbed = Math.min(Math.max(0, shield), (damage - bypass) * shieldMultiplier);
    const hull = (bypass + Math.max(0, damage - bypass - absorbed / shieldMultiplier)) * (weapon.hullMul ?? 1);
    return { shield: absorbed, hull };
}
export function disruptWeapons(actor, weapon, time) {
    if (!weapon.jamSeconds || actor.shield > 0 || time < (actor.disruptionRecoveryUntil ?? 0)) return false;
    actor.disruptedUntil = time + weapon.jamSeconds;
    actor.disruptionRecoveryUntil = actor.disruptedUntil + 3;
    return true;
}
