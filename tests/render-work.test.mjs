import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../vendor/three.module.min.js', import.meta.url).href : specifier, context);
} });
const THREE = await import('three');
const { skipHiddenWorldMatrices, markAttributeSpan } = await import('../src/game/renderWork.js');
const { CanvasSizeCache } = await import('../src/game/canvasSizeCache.js');
const { SpaceRenderer } = await import('../src/game/render.js');

function tree() {
    const scene = new THREE.Scene(), parent = new THREE.Group(), branch = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(parent); parent.add(branch); branch.add(leaf);
    leaf.position.set(1, 2, 3); leaf.updateMatrix(); leaf.matrixAutoUpdate = false;
    return { scene, parent, branch, leaf };
}
test('hidden roots do no descendant matrix work; waking matches Three exactly', () => {
    const normal = tree(), guarded = tree();
    let visits = 0;
    const original = guarded.leaf.updateMatrixWorld;
    guarded.leaf.updateMatrixWorld = function(force) { visits++; original.call(this, force); };
    skipHiddenWorldMatrices(guarded.branch);
    const fn = guarded.branch.updateMatrixWorld;
    skipHiddenWorldMatrices(guarded.branch);
    assert.equal(guarded.branch.updateMatrixWorld, fn, 'installation is idempotent');
    for (let frame = 0; frame < 120; frame++) {
        for (const t of [normal, guarded]) {
            t.branch.visible = frame % 20 === 0;
            t.parent.position.set(frame, frame / 2, -frame);
            t.parent.rotation.y = frame * .01;
            t.branch.rotation.z = frame * .02;
            t.scene.updateMatrixWorld(true);
        }
        if (guarded.branch.visible)
            assert.deepEqual(guarded.leaf.matrixWorld.elements, normal.leaf.matrixWorld.elements);
    }
    assert.equal(visits, 6, 'only six visible frames update the leaf, not all 120');
    // Reparent while asleep, then reactivate with frozen locals and no force.
    for (const t of [normal, guarded]) {
        const nextParent = new THREE.Group();
        nextParent.position.set(-30, 4, 9); nextParent.rotation.x = .7;
        t.scene.add(nextParent); nextParent.add(t.branch);
        t.parent.matrixAutoUpdate = false;
        t.branch.updateMatrix(); t.branch.matrixAutoUpdate = false;
        t.leaf.position.set(8, 9, 10); t.leaf.updateMatrix();
        t.branch.visible = true;
        t.scene.updateMatrixWorld(false);
    }
    assert.deepEqual(guarded.leaf.matrixWorld.elements, normal.leaf.matrixWorld.elements);
});
test('explicit queries on a hidden root still update world coordinates', () => {
    const t = tree(); skipHiddenWorldMatrices(t.branch); t.branch.visible = false;
    t.parent.position.x = 50; t.branch.position.y = 12;
    assert.deepEqual(t.leaf.getWorldPosition(new THREE.Vector3()).toArray(), [51, 14, 3]);
});
test('guard preserves custom matrix update methods when visible', () => {
    const root = new THREE.Group(); let calls = 0;
    root.updateMatrixWorld = function(force) { calls++; assert.equal(force, true); };
    skipHiddenWorldMatrices(root);
    root.visible = false; root.updateMatrixWorld(true); assert.equal(calls, 0);
    root.visible = true; root.updateMatrixWorld(true); assert.equal(calls, 1);
});
test('upload span merges pending writes and preserves clean attribute versions', () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(16 * 100), 16);
    a.addUpdateRange(0, 16); a.addUpdateRange(90 * 16, 16);
    const data = a.array.slice();
    markAttributeSpan(a, 20 * 16, 50 * 16);
    assert.deepEqual(a.updateRanges, [{ start: 0, count: 91 * 16 }]);
    assert.deepEqual(a.array, data, 'only transfer bookkeeping changes');
    const version = a.version;
    markAttributeSpan(a, Infinity, 0);
    assert.equal(a.version, version);
    a.clearUpdateRanges(); // emulate successful WebGL upload
    markAttributeSpan(a, 10 * 16, 11 * 16);
    assert.deepEqual(a.updateRanges, [{ start: 160, count: 16 }]);
});
test('interleaved moving debris queues one upload and keeps static matrices unchanged', () => {
    const r = Object.create(SpaceRenderer.prototype);
    r.camera = new THREE.PerspectiveCamera(); r.viewSphere = new THREE.Sphere();
    r.tmpPosition = new THREE.Vector3(); r.tmpScale = new THREE.Vector3();
    r.tmpEuler = new THREE.Euler(); r.tmpQuaternion = new THREE.Quaternion(); r.tmpMatrix = new THREE.Matrix4();
    const pieces = Array.from({ length: 100 }, (_, i) => ({ position: [i, 0, -100], rotation: [0, 0, 0], scale: [1, 1, 1], moving: i % 2 === 1 }));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), pieces.length);
    r.graveyardBatches = [{ mesh, pieces, renderedPieces: [], originRadius: 2 }];
    r.updateGraveyardInstances(); mesh.instanceMatrix.clearUpdateRanges();
    const before = mesh.instanceMatrix.array.slice();
    for (const piece of pieces) if (piece.moving) piece.position[1] = 1;
    r.updateGraveyardInstances();
    assert.equal(mesh.count, 100);
    assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 16, count: 99 * 16 }]);
    for (let i = 0; i < pieces.length; i++) {
        if (i % 2 === 0) assert.deepEqual(mesh.instanceMatrix.array.slice(i * 16, (i + 1) * 16), before.slice(i * 16, (i + 1) * 16));
        else assert.equal(mesh.instanceMatrix.array[i * 16 + 13], 1);
    }
});
test('HUD sizing reads layout once, then handles resize, hidden state, and disconnect', () => {
    let callback, observed, disconnected = false, reads = 0;
    const canvas = { get clientWidth() { reads++; return 150; }, get clientHeight() { reads++; return 110; } };
    class Observer {
        constructor(cb) { callback = cb; }
        observe(c) { observed = c; }
        disconnect() { disconnected = true; }
    }
    const cache = new CanvasSizeCache(Observer);
    for (let i = 0; i < 300; i++) assert.deepEqual(cache.get(canvas), { width: 150, height: 110 });
    assert.equal(observed, canvas); assert.equal(reads, 2);
    callback([{ target: canvas, contentRect: { width: 211.6, height: 98.2 } }]);
    assert.deepEqual(cache.get(canvas), { width: 212, height: 98 }); assert.equal(reads, 2);
    callback([{ target: canvas, contentRect: { width: 0, height: 0 } }]);
    assert.deepEqual(cache.get(canvas), { width: 0, height: 0 });
    cache.disconnect(); assert.equal(disconnected, true);
    cache.get(canvas); assert.equal(reads, 4);
});
test('HUD sizing keeps the live-layout fallback on browsers without ResizeObserver', () => {
    const canvas = { clientWidth: 100, clientHeight: 80 }, cache = new CanvasSizeCache(null);
    assert.equal(cache.get(canvas).width, 100);
    canvas.clientWidth = 200; assert.equal(cache.get(canvas).width, 200);
});
