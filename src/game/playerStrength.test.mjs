import assert from 'node:assert/strict';
import test from 'node:test';
import { createNewSave } from './save.js';
import { createOutfittingState } from './outfitting.js';
import { playerStrengthBreakdown, playerStrengthValue } from './playerStrength.js';

test('combat-strength proxy uses full hull and equipment value, half cash, and no cargo', () => {
    const save = createNewSave(0x51, { tutorial: true });
    const player = save.player;
    player.shipId = 'vanguard';
    player.ownedShips = ['vanguard'];
    player.outfitting = createOutfittingState(['vanguard']);
    player.credits = 1000;
    player.cargo = { gold: 999 };
    player.outfitting.loadouts.vanguard.guns = ['pulse-mk2', 'gauss-cannon'];
    player.outfitting.loadouts.vanguard.utility = ['cargo-pods', 'radar-mk2'];
    player.outfitting.locker['torpedo-launcher'] = 1;

    const breakdown = playerStrengthBreakdown(player);
    assert.equal(breakdown.shipValue, 48500);
    assert.equal(breakdown.installedEquipmentValue, 10200 + 5200 + 1800 + 4800 + 5400);
    assert.equal(breakdown.storedEquipmentValue, 9800);
    assert.equal(breakdown.cashValue, 500);
    assert.equal(breakdown.cargoValue, 0);
    assert.equal(breakdown.total, 86200);
    assert.equal(playerStrengthValue(player), 86200);
    assert.equal(player.cargo.gold, 999, 'cargo remains outside the proxy and unchanged');
});

test('legacy equipment is still valued without mutating the player save', () => {
    const save = createNewSave(0x52, { tutorial: true });
    const player = {
        ...save.player,
        outfitting: undefined,
        equipment: ['pulse-mk2'],
        credits: 200,
        cargo: { ore: 100 },
    };
    const before = JSON.stringify(player);
    const breakdown = playerStrengthBreakdown(player);
    assert.equal(breakdown.shipValue, 0);
    assert.equal(breakdown.equipmentValue, 23200);
    assert.equal(breakdown.total, 23300);
    assert.equal(JSON.stringify(player), before);
});
