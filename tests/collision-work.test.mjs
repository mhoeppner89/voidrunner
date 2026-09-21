import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.min.js';
import { segmentMeshHit, invalidateMeshQueryCache } from '../src/game/meshQueries.js';
import { indexObstacleCells, visitObstacleCells } from '../src/game/obstacleQueries.js';
import { GameSession } from '../src/game/game.js';

function fixture() {
    // Many separated triangles on z=0, arranged in authored order.
    const meshVerts = new Float32Array(3 * 3 * 120);
    const meshIndices = new Uint16Array(3 * 120);
    for (let i = 0; i < 120; i++) {
        const x = i * 10;
        meshVerts.set([x - 1, -1, 0, x + 1, -1, 0, x, 1, 0], i * 9);
        meshIndices.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3);
    }
    return { id: 'triangles', x: 0, y: 0, z: 0, losRadius: 2000, radius: 2000,
        box: { qx: 0, qy: 0, qz: 0, qw: 1 }, meshVerts, meshIndices };
}

test('triangle hierarchy preserves surface hits and prunes unrelated triangles', () => {
    const o = fixture(), stats = {};
    assert.equal(segmentMeshHit({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -10 }, o, false, stats), .5);
    assert.ok(stats.triangleTests < 20, JSON.stringify(stats));
    assert.equal(stats.treeBuilds, 1);
    assert.equal(segmentMeshHit({ x: 5, y: 0, z: 10 }, { x: 5, y: 0, z: -10 }, o), undefined);
    assert.equal(segmentMeshHit({ x: -1, y: -1, z: 10 }, { x: -1, y: -1, z: 0 }, o), 1, 'edge and endpoint');
    assert.equal(segmentMeshHit({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }, o), undefined, 'zero-length ray');
    assert.equal(segmentMeshHit({ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, o), undefined, 'coplanar convention unchanged');
});

test('geometry cache survives grid-object replacement, drift and rotation', () => {
    const o = fixture(), stats = {};
    segmentMeshHit({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -10 }, o, false, stats);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, .7, -.2));
    const moved = { ...o, x: 100, y: -200, z: 300, box: { qx: q.x, qy: q.y, qz: q.z, qw: q.w } };
    const transform = v => new THREE.Vector3(...v).applyQuaternion(q).add(new THREE.Vector3(100, -200, 300));
    assert.ok(Math.abs(segmentMeshHit(transform([0, 0, 10]), transform([0, 0, -10]), moved, false, stats) - .5) < 1e-12);
    assert.equal(stats.treeBuilds, 1);
    invalidateMeshQueryCache(o.meshVerts);
    segmentMeshHit(transform([0, 0, 10]), transform([0, 0, -10]), moved, false, stats);
    assert.equal(stats.treeBuilds, 2);
});

test('inside-envelope exclusion and nearest-hit/any-hit semantics remain separate', () => {
    const o = fixture(); o.minReach = 5;
    assert.equal(segmentMeshHit({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -10 }, o), undefined);
    delete o.minReach;
    for (let i = 0; i < o.meshVerts.length; i += 9) {
        o.meshVerts[i] = -1; o.meshVerts[i + 3] = 1; o.meshVerts[i + 6] = 0;
        o.meshVerts[i + 2] = o.meshVerts[i + 5] = o.meshVerts[i + 8] = i === 0 ? -5 : 5;
    }
    const a = { x: 0, y: 0, z: 10 }, b = { x: 0, y: 0, z: -10 };
    assert.equal(segmentMeshHit(a, b, o), .25);
    assert.equal(segmentMeshHit(a, b, o, true), .75, 'boolean caller may stop on an earlier authored triangle');
});

function gridSession(obstacles) {
    const s = Object.create(GameSession.prototype);
    s.save = { world: { time: 0 } }; s.activeInstanceId = 'test'; s.obstacleCellSize = 16; s.obstacleQueryStamp = 0;
    s.activeFieldObstacles = () => obstacles; s.activeDockObstacle = () => undefined;
    return s;
}

test('sparse box query retains exactly the old cell and bucket order', () => {
    const obstacles = Array.from({ length: 80 }, (_, i) => ({ id: String(i),
        x: (i % 7 - 3) * 16, y: (i % 5 - 2) * 16, z: (i % 11 - 5) * 16, radius: 1 }));
    const s = gridSession(obstacles); s.ensureObstacleGrid();
    let stamp = 100;
    for (let radius = 0; radius < 12; radius++) {
        const expected = [];
        for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) for (let z = -radius; z <= radius; z++)
            expected.push(...(s.obstacleGrid.get(s.cellKey(x, y, z)) ?? []).map(o => o.id));
        const actual = [], stats = {};
        visitObstacleCells(s.obstacleBoxIndex, -radius, -radius, -radius, radius, radius, radius, ++stamp, o => actual.push(o.id), stats);
        assert.deepEqual(actual, expected);
        assert.ok((stats.buckets ?? 0) <= s.obstacleGrid.size);
    }
    const out = [];
    visitObstacleCells(s.obstacleBoxIndex, 1000, 1000, 1000, 2000, 2000, 2000, ++stamp, o => out.push(o));
    assert.deepEqual(out, []);
});

test('spatial keys distinguish the full documented coordinate range and outliers', () => {
    const key = GameSession.prototype.cellKey;
    assert.notEqual(key(0, 0, 4095), key(0, 1, -1));
    assert.notEqual(key(0, 4095, 0), key(1, -1, 0));
    const keys = new Set();
    for (const x of [-9000, -4096, -1, 0, 4095, 9000]) for (const y of [-4096, -1, 0, 4095]) for (const z of [-4096, -1, 0, 4095]) {
        const k = key(x, y, z); assert.ok(!keys.has(k)); keys.add(k);
    }
});

test('boolean LOS stops early; projectiles retain nearest obstacle and ignored IDs', () => {
    const near = { id: 'near', x: 0, y: 0, z: 30, radius: 3, losRadius: 3 };
    const far = { id: 'far', x: 0, y: 0, z: 80, radius: 3, losRadius: 3 };
    const s = gridSession([far, near]); const start = { x: 0, y: 0, z: 0 }, end = { x: 0, y: 0, z: 200 };
    s.ensureObstacleGrid();
    assert.equal(s.firstObstacleHitInfo(start, end).obstacle.id, 'near');
    assert.equal(s.firstObstacleHitInfo(start, end, 'near').obstacle.id, 'far');
    assert.equal(s.lineBlocked(start, end), true);
    let visits = 0;
    assert.equal(s.forEachObstacleAlongSegment(start, end, () => { visits++; return true; }), true);
    assert.equal(visits, 1);
    visits = 0;
    s.forEachObstacleAlongSegment(start, end, () => { visits++; });
    assert.equal(visits, 2);
});

test('grid rebuild cadence and instance switches rebuild the sparse index together', () => {
    const nodes = [{ id: 'a', x: 0, y: 0, z: 0, radius: 1 }], s = gridSession(nodes);
    s.ensureObstacleGrid(); const old = s.obstacleBoxIndex;
    s.save.world.time = .2; s.ensureObstacleGrid(); assert.equal(s.obstacleBoxIndex, old);
    s.save.world.time = .6; nodes[0].x = 64; s.ensureObstacleGrid(); assert.notEqual(s.obstacleBoxIndex, old);
    const found = []; s.forEachObstacleInBox(60, -1, -1, 70, 1, 1, o => found.push(o.id)); assert.deepEqual(found, ['a']);
    const changed = s.obstacleBoxIndex; s.activeInstanceId = 'other'; s.ensureObstacleGrid(); assert.notEqual(s.obstacleBoxIndex, changed);
});
