import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPilotWeaponHit, stepPilotRecovery } from '../../src/game/multiplayer/combatDamage.js';
import { WEAPONS } from '../../src/game/weapons.js';

test('stock ion fire can break shields and damage hull, but jams only a previously exposed target', () => {
    const actor = { hull: 100, shield: 24 };
    const ion = WEAPONS.ion;
    const hit = time => applyPilotWeaponHit(actor, ion.damageFlat, ion, time);
    const overflow = ion.damageFlat - actor.shield / ion.shieldMul;
    assert.deepEqual(hit(1), { shield: 24, hull: overflow, killed: false, disrupted: false });
    assert.equal(actor.shield, 0);
    assert.equal(actor.hull, 100 - overflow);
    assert.equal(hit(2).disrupted, true);
    assert.equal(actor.disruptedUntil, 3);
    assert.equal(hit(2.5).disrupted, false);
    assert.equal(hit(3.5).disrupted, false);
    assert.equal(actor.disruptedUntil, 3);
    assert.equal(hit(4).disrupted, true);
    assert.equal(actor.disruptedUntil, 5);
});

test('a lethal hit reports remaining hull once and invalid hits leave the target untouched', () => {
    const actor = { hull: 5, shield: 2, energy: 0 };
    const initial = { ...actor };
    for (const amount of [NaN, Infinity, -1, 0]) {
        assert.equal(applyPilotWeaponHit(actor, amount, WEAPONS.pulse, 0).killed, false);
        assert.deepEqual(actor, initial);
    }
    assert.deepEqual(applyPilotWeaponHit(actor, 50, WEAPONS.pulse, 1),
        { shield: 2, hull: 5, killed: true, disrupted: false });
    const wreck = { ...actor };
    assert.equal(wreck.hull, 0);
    assert.equal(wreck.shield, 0);
    assert.deepEqual(applyPilotWeaponHit(actor, 10, WEAPONS.ion, 2),
        { shield: 0, hull: 0, killed: false, disrupted: false });
    stepPilotRecovery(actor, { reactorOutput: 20, energyCapacity: 100, shield: 10 }, 1 / 60);
    assert.deepEqual(actor, wreck);
});

test('a second hit restarts shield delay while reactor charge and combat recharge follow solo rules', () => {
    const actor = { hull: 100, shield: 30, energy: 0 };
    const stats = { reactorOutput: 12, energyCapacity: 100, shield: 30, shieldRegeneration: 6 };
    const dt = 1 / 60;
    applyPilotWeaponHit(actor, 4, WEAPONS.pulse, 0);
    for (let i = 0; i < 60; i++) stepPilotRecovery(actor, stats, dt);
    assert.equal(actor.shield, 26);
    assert.ok(Math.abs(actor.energy - 12) < 1e-9);
    applyPilotWeaponHit(actor, 4, WEAPONS.pulse, 1);
    assert.equal(actor.shieldDelay, 5.2);
    for (let i = 0; i < 311; i++) stepPilotRecovery(actor, stats, dt);
    assert.equal(actor.shield, 22);
    for (let i = 0; i < 2; i++) stepPilotRecovery(actor, stats, dt);
    assert.equal(actor.shieldDelay, 0);
    assert.ok(actor.shield > 22);
    const previous = actor.shield;
    stepPilotRecovery(actor, stats, dt);
    assert.ok(Math.abs(actor.shield - (previous + 3 * dt)) < 1e-9);
});
