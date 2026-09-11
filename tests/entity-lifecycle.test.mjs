import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
registerHooks({ resolve(s, c, next) {
    return next(s === 'three' ? new URL('../vendor/three.module.min.js', import.meta.url).href : s, c);
} });
const THREE = await import('three');
const { SpaceRenderer } = await import(process.env.RENDER_MODULE || '../src/game/render.js');
function renderer() {
    const r = Object.create(SpaceRenderer.prototype);
    Object.assign(r, {
        dynamicRoot: new THREE.Group(), shipMeshes: new Map(), projectileMeshes: new Map(), pickupMeshes: new Map(),
        shipSyncRevision: 0, projectileSyncRevision: 0, pickupSyncRevision: 0,
        shipMeshCount: 0, projectileMeshCount: 0, pickupMeshCount: 0,
        glbShipModels: new Map(), glbShipLoading: new Map(),
        tmpPrevPos: new THREE.Vector3(), forward: new THREE.Vector3(), tmpQuaternion: new THREE.Quaternion(),
        radialTexture: () => { const t = new THREE.Texture(); t.userData.shared = true; return t; },
        createShipMesh: e => { const m = new THREE.Group(); m.userData.variant = e.variant; return m; },
    });
    return r;
}
const store = { pos: new Float32Array(12), prevPos: new Float32Array(12), vel: new Float32Array(12) };
test('equal-count ship replacement removes old mesh and remains stable', () => {
    const r = renderer();
    const ship = id => ({ id, variant: 'test-hull', position: [0,0,0], rotation: [0,0,0,1], hull: 10, maxHull: 10 });
    r.syncShips([ship('a')]); const old = r.shipMeshes.get('a');
    r.syncShips([ship('b')]);
    assert.deepEqual([...r.shipMeshes.keys()], ['b']); assert.equal(old.parent, null);
    const current = r.shipMeshes.get('b'); r.syncShips([ship('b')]); assert.equal(r.shipMeshes.get('b'), current);
    r.syncShips([]); assert.equal(r.dynamicRoot.children.length, 0);
});
test('equal-count projectile replacement disposes the old slot', () => {
    const r = renderer();
    r.syncProjectiles([{ slot: 0, kind: 'pdc', faction: 'player' }], store);
    const old = r.projectileMeshes.get(0); let disposed = 0; old.geometry.addEventListener('dispose', () => disposed++);
    r.syncProjectiles([{ slot: 1, kind: 'pdc', faction: 'player' }], store);
    assert.deepEqual([...r.projectileMeshes.keys()], [1]); assert.equal(disposed, 1); assert.equal(old.parent, null);
});
test('recycled projectile slots refresh kind and faction but reuse matching visuals', () => {
    const r = renderer(); const sync = (kind, faction) => r.syncProjectiles([{ slot: 0, kind, faction }], store);
    sync('pdc', 'player'); const old = r.projectileMeshes.get(0);
    sync('pdc', 'pirate'); assert.notEqual(r.projectileMeshes.get(0), old);
    assert.equal(r.projectileMeshes.get(0).material.color.getHex(), 0xff8a5b);
    sync('ripper', 'pirate'); const current = r.projectileMeshes.get(0);
    assert.equal(current.geometry.type, 'SphereGeometry'); sync('ripper', 'pirate'); assert.equal(r.projectileMeshes.get(0), current);
});
test('pickup replacement updates target identity, source geometry and live slots', () => {
    const r = renderer(); const sync = (id, source, slot = 0) => r.syncPickups([{ id, source, slot }], store);
    sync('a', 'mining'); const old = r.pickupMeshes.get(0);
    sync('b', 'mining'); assert.equal(r.pickupMeshes.get(0), old); assert.equal(old.userData.targetId, 'b');
    sync('c', 'salvage'); assert.equal(r.pickupMeshes.get(0).children[0].geometry.type, 'BoxGeometry');
    sync('d', 'salvage', 1); assert.deepEqual([...r.pickupMeshes.keys()], [1]);
    r.syncPickups([], store); assert.equal(r.dynamicRoot.children.length, 0);
});
