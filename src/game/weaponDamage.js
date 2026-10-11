// One damage calculation for all actors. Hull multipliers never amplify shield damage.
export function weaponDamage(shield, amount, weapon = {}) {
    const damage = Math.max(0, Number(amount) || 0);
    const bypass = damage * Math.max(0, Math.min(1, weapon.shieldBypass ?? 0));
    const shieldMultiplier = Math.max(0.01, weapon.shieldMul ?? 1);
    const absorbed = Math.min(Math.max(0, shield), (damage - bypass) * shieldMultiplier);
    const hull = (bypass + Math.max(0, damage - bypass - absorbed / shieldMultiplier)) * (weapon.hullMul ?? 1);
    return { shield: absorbed, hull };
}
export function disruptWeapons(actor, weapon, time, shieldBeforeHit = actor.shield) {
    if (weapon.id !== 'ion' || !weapon.jamSeconds || shieldBeforeHit > 0 || time < (actor.disruptionRecoveryUntil ?? 0)) return false;
    actor.disruptedUntil = time + weapon.jamSeconds;
    actor.disruptionRecoveryUntil = actor.disruptedUntil + 1;
    return true;
}

// Twice the interval and energy per shot: half DPS, unchanged sustained drain.
export const disruptionFactor = (actor, time) => time < (actor.disruptedUntil ?? 0) ? 2 : 1;

// One activation pays for the strongest hit in its fixed window, plus a
// fraction of the other loads. Later hits cannot keep the field active forever.
// Transient state never enters saves; bypass and capital shield rules stay intact.
const shieldActivations = new WeakMap();
export const SHIELD_ACTIVATION_WINDOW = .25;
export const SHIELD_FOLLOWUP_COST = .25;
export function activationWeaponDamage(actor, maxShield, amount, weapon = {}, now = 0) {
    const damage = Math.max(0, Number(amount) || 0);
    const bypass = damage * Math.max(0, Math.min(1, weapon.shieldBypass ?? 0));
    const multiplier = Math.max(.01, weapon.shieldMul ?? 1);
    const load = (damage - bypass) * multiplier;
    if (!(actor.shield > 0) || !(maxShield > 0) || !(load > 0)) {
        if (!(actor.shield > 0)) shieldActivations.delete(actor);
        return weaponDamage(actor.shield, amount, weapon);
    }
    let state = shieldActivations.get(actor);
    const activated = !state || now < state.start || now >= state.end;
    if (activated) {
        if (!state) { state = {}; shieldActivations.set(actor, state); }
        state.start = now;
        state.end = now + SHIELD_ACTIVATION_WINDOW;
        state.peak = load;
    }
    // Raising the field above its previous peak costs full energy. This gives
    // identical total cost regardless of the order of simultaneous hits.
    const discount = activated || actor.capitalClass ? 0
        : Math.min(actor.shield, (1 - SHIELD_FOLLOWUP_COST) * Math.min(load, state.peak));
    state.peak = Math.max(state.peak, load);
    const shield = Math.min(actor.shield, load - discount);
    const hull = (bypass + Math.max(0, (load - discount - shield) / multiplier)) * (weapon.hullMul ?? 1);
    if (shield >= actor.shield) shieldActivations.delete(actor);
    return {shield, hull, reduced: discount, activated, activationRemaining: state.end - now};
}
