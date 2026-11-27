import { registerCombatShieldHit, regenerateCombatResources } from '../combatResources.js';
import { disruptWeapons, weaponDamage } from '../weaponDamage.js';

const SHIELD_DELAY_SECONDS = 5.2;
const NO_HIT = Object.freeze({ shield: 0, hull: 0, killed: false, disrupted: false });

// The host resolves the hit, weapon definition and simulation time. Report
// actual losses so overkill and later hits on a wreck cannot score twice.
export function applyPilotWeaponHit(actor, amount, weapon, time) {
    if (!Number.isFinite(amount) || amount <= 0 || !weapon || !Number.isFinite(time) || time < 0) return NO_HIT;
    if (!Number.isFinite(actor.hull) || actor.hull <= 0 || !Number.isFinite(actor.shield)) return NO_HIT;

    const shieldBefore = Math.max(0, actor.shield);
    const damage = weaponDamage(shieldBefore, amount, weapon, actor);
    if (!Number.isFinite(damage.shield) || !Number.isFinite(damage.hull) || damage.hull < 0) return NO_HIT;

    const hull = Math.min(actor.hull, damage.hull);
    actor.shield = shieldBefore - damage.shield;
    actor.hull -= hull;
    actor.shieldDelay = SHIELD_DELAY_SECONDS;
    registerCombatShieldHit(actor);
    const disrupted = disruptWeapons(actor, weapon, time, shieldBefore);
    return { shield: damage.shield, hull, killed: actor.hull === 0, disrupted };
}

export function stepPilotRecovery(actor, stats, dt) {
    if (!(actor.hull > 0) || !Number.isFinite(dt) || dt <= 0) return;
    actor.shieldDelay = Math.max(0, (actor.shieldDelay ?? 0) - dt);
    regenerateCombatResources(actor, stats, dt, actor.shieldDelay);
}
