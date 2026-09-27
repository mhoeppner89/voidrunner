// Installed into repo/tests by tools/apply_fixes.py --fix surface.
// Run with the repository's existing offlineImportHooks.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hullVsAsteroid as accelerated } from '../src/game/hullCollision.js';
import { hullVsAsteroid as linear } from './fixtures/perf-audit-hull-linear.mjs';

function fixture() {
    const vertices = [], indices = [];
    for (let n = 0; n < 64; n++) {
        const x = (n % 8) * 30, y = Math.floor(n / 8) * 30;
        const base = vertices.length / 3;
        vertices.push(x, y, 0, x + 12, y, 0, x, y + 12, 0, x + 12, y + 12, 0);
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    return { meshVerts: new Float32Array(vertices), meshIndices: new Uint32Array(indices),
        surfaceOnly: true, radius: 1000, losRadius: 1000, x: 200000, y: -10000, z: 400000,
        box: { qx: 0, qy: 0, qz: 0, qw: 1 } };
}
function rotate(x, y, z, q) {
    const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    return { x: x + q.w * tx + q.y * tz - q.z * ty,
        y: y + q.w * ty + q.z * tx - q.x * tz,
        z: z + q.w * tz + q.x * ty - q.y * tx };
}
function quaternion(rnd) {
    const x = rnd() - .5, y = rnd() - .5, z = rnd() - .5, w = rnd() - .5;
    const size = Math.hypot(x, y, z, w);
    return { x: x / size, y: y / size, z: z / size, w: w / size };
}

test('surface BVH preserves exact old hit/contact output for 2000 rotated hull queries', () => {
    const obstacle = fixture();
    const scratchA = new Float32Array(obstacle.meshVerts.length), scratchB = scratchA.slice();
    let seed = 999, hits = 0, misses = 0;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let n = 0; n < 2000; n++) {
        const rotation = quaternion(rnd), ship = quaternion(rnd);
        obstacle.box = { qx: rotation.x, qy: rotation.y, qz: rotation.z, qw: rotation.w };
        const pos = rotate(rnd() * 240 - 5, rnd() * 240 - 5, rnd() * 16 - 8, rotation);
        pos.x += obstacle.x; pos.y += obstacle.y; pos.z += obstacle.z;
        const hull = [.5 + rnd() * 8, .5 + rnd() * 8, .5 + rnd() * 8];
        const inv = { x: -ship.x, y: -ship.y, z: -ship.z, w: ship.w };
        const a = {}, b = {};
        const hitA = linear(pos, hull, ship, inv, obstacle, scratchA, a);
        const hitB = accelerated(pos, hull, ship, inv, obstacle, scratchB, b);
        assert.equal(hitB, hitA, `hit mismatch at query ${n}`);
        if (hitA) { hits++; assert.deepEqual(b, a, `contact mismatch at query ${n}`); }
        else misses++;
    }
    assert.ok(hits > 0 && misses > 0);
});

test('solid mode retains the old full scan and inside/exit handling', () => {
    const obstacle = fixture(); obstacle.surfaceOnly = false;
    const q = { x: 0, y: 0, z: 0, w: 1 };
    for (const x of [0, 2, 10, 30, 100]) {
        const pos = { x: obstacle.x + x, y: obstacle.y + 2, z: obstacle.z + .5 };
        const a = {}, b = {};
        const hitA = linear(pos, [1, 2, 3], q, q, obstacle, new Float32Array(obstacle.meshVerts.length), a);
        const hitB = accelerated(pos, [1, 2, 3], q, q, obstacle, new Float32Array(obstacle.meshVerts.length), b);
        assert.equal(hitB, hitA); if (hitA) assert.deepEqual(b, a);
    }
});
