import assert from 'node:assert/strict';
import {
    SHIELD_ENERGY_PER_POINT,
    SHIELD_RECHARGE_RATE,
    combinedHullIntegrity,
    normalizeEnergy,
    regenerateCombatResources,
    spendEnergy,
} from './combatResources.js';

assert.equal(combinedHullIntegrity(100, 85), 185, 'legacy hull and armor combine without loss');
assert.equal(normalizeEnergy(undefined, 72), 72, 'missing legacy energy starts full');
assert.equal(normalizeEnergy(90, 72), 72, 'energy clamps to capacitor');

const firing = { energy: 8 };
assert.equal(spendEnergy(firing, 5), true, 'affordable shot fires');
assert.equal(firing.energy, 3);
assert.equal(spendEnergy(firing, 4), false, 'unaffordable shot is rejected atomically');
assert.equal(firing.energy, 3);

const delayed = { energy: 0, shield: 10 };
const delayedTick = regenerateCombatResources(delayed, { reactorOutput: 12, energyCapacity: 50, shield: 30 }, 1, 2);
assert.equal(delayedTick.generated, 12);
assert.equal(delayed.shield, 10, 'shield delay prevents recharge');
assert.equal(delayed.energy, 12, 'delayed shield leaves reactor output in capacitor');

const recharging = { energy: 0, shield: 10 };
const rechargeTick = regenerateCombatResources(recharging, { reactorOutput: 12, energyCapacity: 50, shield: 30 }, 1, 0);
assert.ok(Math.abs(rechargeTick.shieldRestored - SHIELD_RECHARGE_RATE) < 1e-9);
assert.ok(Math.abs(rechargeTick.shieldEnergySpent - SHIELD_RECHARGE_RATE * SHIELD_ENERGY_PER_POINT) < 1e-9);
assert.ok(Math.abs(recharging.energy - (12 - SHIELD_RECHARGE_RATE * SHIELD_ENERGY_PER_POINT)) < 1e-9);

const starved = { energy: 1, shield: 0 };
regenerateCombatResources(starved, { reactorOutput: 0, energyCapacity: 20, shield: 20 }, 1, 0);
assert.ok(Math.abs(starved.shield - 1 / SHIELD_ENERGY_PER_POINT) < 1e-9, 'shield uses only available capacitor energy');
assert.equal(starved.energy, 0);

console.log('all combat resource assertions passed');
