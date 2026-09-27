import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareSurfaceMeshIndex, invalidateSurfaceMeshIndex, surfaceMeshCandidates } from '../src/game/surfaceMeshCandidates.js';

function field(count = 512) {
    const vertices = new Float32Array(count * 9), indices = new Uint32Array(count * 3);
    for (let n = 0; n < count; n++) {
        const x = (n % 32) * 20, y = Math.floor(n / 32) * 20;
        vertices.set([x, y, 0, x + 4, y, 0, x, y + 4, 0], n * 9);
        indices.set([n * 3, n * 3 + 1, n * 3 + 2], n * 3);
    }
    return { meshVerts: vertices, meshIndices: indices, surfaceOnly: true,
        x: 0, y: 0, z: 0, box: { qx: 0, qy: 0, qz: 0, qw: 1 } };
}
function rotate(x, y, z, q) {
    const tx = 2 * (q.qy * z - q.qz * y), ty = 2 * (q.qz * x - q.qx * z), tz = 2 * (q.qx * y - q.qy * x);
    return { x: x + q.qw * tx + q.qy * tz - q.qz * ty,
        y: y + q.qw * ty + q.qz * tx - q.qx * tz,
        z: z + q.qw * tz + q.qx * ty - q.qy * tx };
}
test('outside the mesh bounds requires no vertex transforms or triangles', () => {
    const mesh = field(), work = surfaceMeshCandidates({ x: -100, y: -100, z: 0 }, [2, 3, 1], mesh, new Float32Array(mesh.meshVerts.length));
    assert.equal(work.triangleCount, 0); assert.equal(work.vertexCount, 0); assert.equal(work.boundsTests, 1);
});
test('localized query reduces candidate work on a spaced 512-triangle fixture', () => {
    const mesh = field(), work = surfaceMeshCandidates({ x: 41, y: 41, z: 0.5 }, [1, 1, 1], mesh, new Float32Array(mesh.meshVerts.length));
    assert.ok(work.triangleCount > 0 && work.triangleCount <= 24);
    assert.ok(Array.from(work.triangles.subarray(0, work.triangleCount)).includes((2 * 32 + 2) * 3));
});
test('all potentially touching triangle AABBs survive 1000 translated/rotated queries', () => {
    const mesh = field(), scratch = new Float32Array(mesh.meshVerts.length);
    let seed = 123;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let query = 0; query < 1000; query++) {
        const angle = rnd() * Math.PI * 2;
        mesh.box = { qx: 0, qy: Math.sin(angle / 2), qz: 0, qw: Math.cos(angle / 2) };
        mesh.x = 200000; mesh.y = -18000; mesh.z = 310000;
        const local = { x: rnd() * 650 - 10, y: rnd() * 330 - 10, z: rnd() * 20 - 10 };
        const hull = [0.5 + rnd() * 8, 0.5 + rnd() * 8, 0.5 + rnd() * 8];
        const pos = rotate(local.x, local.y, local.z, mesh.box);
        pos.x += mesh.x; pos.y += mesh.y; pos.z += mesh.z;
        const work = surfaceMeshCandidates(pos, hull, mesh, scratch);
        const candidates = new Set(work.triangles.subarray(0, work.triangleCount));
        const r = Math.max(...hull);
        for (let n = 0; n < mesh.meshIndices.length / 3; n++) {
            const x = (n % 32) * 20, y = Math.floor(n / 32) * 20;
            if (x + 4 < local.x - r || x > local.x + r || y + 4 < local.y - r
                || y > local.y + r || 0 < local.z - r || 0 > local.z + r) continue;
            assert.ok(candidates.has(n * 3), `query ${query} omitted triangle ${n}`);
        }
    }
});
test('a query workspace contains every referenced vertex once', () => {
    const mesh = field(), work = surfaceMeshCandidates({ x: 40, y: 40, z: 0 }, [30, 30, 30], mesh, new Float32Array(mesh.meshVerts.length));
    const vertices = new Set(work.vertices.subarray(0, work.vertexCount));
    assert.equal(vertices.size, work.vertexCount);
    for (let n = 0; n < work.triangleCount; n++)
        for (let j = 0; j < 3; j++) assert.ok(vertices.has(mesh.meshIndices[work.triangles[n] + j]));
});
test('source geometry/order are immutable and the index is cached', () => {
    const mesh = field(), original = mesh.meshIndices.slice();
    const first = prepareSurfaceMeshIndex(mesh.meshVerts, mesh.meshIndices);
    assert.equal(first, prepareSurfaceMeshIndex(mesh.meshVerts, mesh.meshIndices));
    assert.deepEqual(original, mesh.meshIndices);
    invalidateSurfaceMeshIndex(mesh.meshVerts);
    assert.notEqual(first, prepareSurfaceMeshIndex(mesh.meshVerts, mesh.meshIndices));
});
test('scratch buffers are reused but independent between callers', () => {
    const mesh = field(), a = new Float32Array(mesh.meshVerts.length), b = new Float32Array(mesh.meshVerts.length);
    const one = surfaceMeshCandidates({ x: 0, y: 0, z: 0 }, [2, 2, 2], mesh, a);
    const two = surfaceMeshCandidates({ x: 0, y: 0, z: 0 }, [2, 2, 2], mesh, b);
    assert.notEqual(one, two);
    const triangleBuffer = one.triangles;
    assert.equal(one, surfaceMeshCandidates({ x: 40, y: 40, z: 0 }, [2, 2, 2], mesh, a));
    assert.equal(one.triangles, triangleBuffer);
});
test('solid rocks retain the original interior-recovery path', () => {
    const mesh = field(); mesh.surfaceOnly = false;
    assert.equal(surfaceMeshCandidates({ x: 0, y: 0, z: 0 }, [2, 2, 2], mesh, new Float32Array(1)), undefined);
});
test('empty surfaces and epoch wrap are handled', () => {
    const mesh = field(0), scratch = new Float32Array(1);
    const work = surfaceMeshCandidates({ x: 0, y: 0, z: 0 }, [2, 2, 2], mesh, scratch);
    assert.equal(work.triangleCount, 0);
    work.epoch = 0xffffffff;
    surfaceMeshCandidates({ x: 0, y: 0, z: 0 }, [2, 2, 2], mesh, scratch);
    assert.equal(work.epoch, 1);
});


test('alternating vertex-heavy and index-heavy meshes never shrink scratch capacities', () => {
    const vertexHeavy = field(512), indexHeavy = field(256);
    indexHeavy.meshIndices = new Uint32Array(1200 * 3);
    for (let n = 0; n < 1200; n++) indexHeavy.meshIndices.set([0, 1, 2], n * 3);
    const scratch = new Float32Array(vertexHeavy.meshVerts.length);
    const pos = { x: 0, y: 0, z: 0 }, hull = [2, 2, 2];
    surfaceMeshCandidates(pos, hull, vertexHeavy, scratch);
    const expanded = surfaceMeshCandidates(pos, hull, indexHeavy, scratch);
    assert.equal(expanded.marks.length, 1536);
    assert.equal(expanded.triangles.length, 1200);
    for (let n = 0; n < 20; n++) {
        assert.equal(surfaceMeshCandidates(pos, hull, vertexHeavy, scratch), expanded);
        assert.equal(surfaceMeshCandidates(pos, hull, indexHeavy, scratch), expanded);
    }
});
