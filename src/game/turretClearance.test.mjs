import test from 'node:test';
import assert from 'node:assert/strict';
import { TURRET_LAYOUTS } from './turretLayouts.js';
import { TURRET_CLEARANCE } from './turretClearance.js';

test('Blade turret mounts have full-sphere clearance data', () => {
    const mounts = TURRET_LAYOUTS.blade;
    const grids = TURRET_CLEARANCE.blade;
    assert.equal(mounts.length, 3);
    assert.equal(grids?.length, mounts.length);
    for (const grid of grids) {
        assert.equal(grid.length, 37 * 73);
        assert.ok(grid.every(Number.isFinite));
        assert.ok(grid.some((clearance) => clearance > 0));
    }
});
