import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three'
        ? new URL('../vendor/three.module.min.js', import.meta.url).href
        : specifier, context);
} });
const THREE = await import('three');
const { SpaceRenderer } = await import('../src/game/render.js');

// Canvas drawing is irrelevant to ownership; keep actual Three textures,
// geometries, materials, cloning and disposal events in these regressions.
globalThis.document = { createElement: () => ({ getContext: () => ({
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
}) }) };
function renderer() {
    const r = Object.create(SpaceRenderer.prototype);
    r.pixelTextures = new Set();
    return r;
}
function watch(resource) {
    let calls = 0;
    resource.addEventListener('dispose', () => calls++);
    return () => calls;
}
const config = { scale: 1, enginePorts: [[0, 0, 0], [1, 0, 0]] };
function fieldRenderer() {
    const r = renderer();
    r.camera = new THREE.PerspectiveCamera(90, 1, .1, 1000);
    r.viewSphere = new THREE.Sphere();
    r.tmpPosition = new THREE.Vector3(); r.tmpScale = new THREE.Vector3();
    r.tmpEuler = new THREE.Euler(); r.tmpQuaternion = new THREE.Quaternion(); r.tmpMatrix = new THREE.Matrix4();
    return r;
}
function frustum(camera) {
    camera.updateMatrixWorld(true);
    return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
function piece(position, moving = false) {
    return { position, rotation: [0, 0, 0], scale: [1, 1, 1], moving };
}
function batch(pieces) {
    const geometry = new THREE.BoxGeometry(2, 2, 2); geometry.computeBoundingSphere();
    return { mesh: new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), pieces.length),
        pieces, renderedPieces: [], originRadius: geometry.boundingSphere.radius };
}

test('debris compaction preserves edge objects, restores visibility and refreshes moved pieces', () => {
    const r = fieldRenderer();
    const pieces = [piece([0, 0, -10]), piece([100, 0, 0]), piece([11, 0, -10]), piece([0, 0, 20], true)];
    const b = batch(pieces); r.graveyardBatches = [b];
    const original = JSON.stringify(pieces);
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 2); // center-outside third piece overlaps the screen edge
    assert.equal(JSON.stringify(pieces), original, 'rendering must not mutate simulation');
    const version = b.mesh.instanceMatrix.version;
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.instanceMatrix.version, version, 'static matrices need no repeat upload');
    r.camera.lookAt(0, 0, 20); r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 1);
    assert.equal(b.renderedPieces[0], pieces[3]);
    pieces[3].position[2] = 21;
    r.updateGraveyardInstances(frustum(r.camera));
    const m = new THREE.Matrix4(); b.mesh.getMatrixAt(0, m); assert.equal(m.elements[14], 21);
    r.camera.position.set(0, 50000, 0); r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 0); assert.equal(b.mesh.visible, false);
    r.camera.position.set(0, 0, 0); r.camera.lookAt(0, 0, -10);
    r.updateGraveyardInstances(frustum(r.camera));
    assert.equal(b.mesh.count, 2); assert.equal(b.mesh.visible, true);
    b.mesh.getMatrixAt(0, m); assert.equal(m.elements[14], -10);
});

test('compacted asteroids retain raycast identity and selection colors after turning', () => {
    const r = fieldRenderer();
    const nodes = [piece([0, 0, -10]), piece([100, 0, 0])];
    nodes.forEach((node, index) => Object.assign(node, { id: String(index), radius: 1 }));
    const b = batch(nodes);
    b.kind = 'iron'; b.entries = nodes.map((node, index) => ({ node, index })); b.renderedEntries = [];
    b.mesh.userData.nodeIndices = [0, 1]; r.asteroidMeshes = [b];
    r._asteroidPalettes = { iron: { base: 0x123456, scan: 0xabcdef } };
    const ray = new THREE.Raycaster();
    for (const index of [0, 1, 0]) {
        r.camera.lookAt(...nodes[index].position);
        r.selectedAsteroidId = String(index);
        r.updateAsteroidInstances(frustum(r.camera));
        assert.equal(b.mesh.count, 1);
        b.mesh.updateMatrixWorld(true);
        ray.setFromCamera(new THREE.Vector2(), r.camera);
        const hit = ray.intersectObject(b.mesh)[0];
        assert.ok(hit, 'tap ray still hits the visible asteroid');
        assert.equal(b.mesh.userData.nodeIndices[hit.instanceId], index);
        const color = new THREE.Color(); b.mesh.getColorAt(0, color);
        assert.equal(color.getHex(), 0xcfe884);
    }
});
function model() {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })));
    return source;
}

test('trail-free ships reuse glow textures and preserve cached hulls', () => {
    const r = renderer(), source = model();
    const hull = source.children[0];
    const hullGeometry = watch(hull.geometry), hullTexture = watch(hull.material.map), hullMaterial = watch(hull.material);
    for (let i = 0; i < 30; i++) {
        const ship = r.createGlbShipMesh({ id: String(i), role: 'pirate', hostile: true }, source, config, 'talon');
        const flare = ship.userData.engineFlares[0].material.map;
        const flareDisposed = watch(flare);
        assert.equal(ship.children[0].children.filter(child => child.isMesh).length, 1, 'only the hull mesh remains');
        const tintDisposed = watch(ship.children[0].children[0].material);
        r.disposeGlbShip(ship);
        assert.equal(flareDisposed(), 0, 'shared glow stays alive for the next ship');
        assert.equal(r.radialTextureCache.size, 1, 'identical ship glows use one bitmap');
        assert.equal(tintDisposed(), 1);
    }
    assert.equal(hullGeometry(), 0);
    assert.equal(hullTexture(), 0);
    assert.equal(hullMaterial(), 0);
    assert.equal(r.pixelTextures.size, 0, 'no exhaust texture is allocated');
});

test('renderer shutdown releases postprocessing and cached resources', () => {
    const r = renderer();
    globalThis.window = { removeEventListener() {} };
    r.scene = new THREE.Scene();
    r.scene.environment = new THREE.Texture();
    r.shipMeshes = new Map();
    r.glbShipModels = new Map([['talon', model()]]);
    r.glbShipLoading = new Map();
    r.dynamicRoot = new THREE.Group();
    r.screenTextures = [];
    r.bloomSceneTarget = new THREE.WebGLRenderTarget(2, 2);
    r.bloomBlurTargets = [new THREE.WebGLRenderTarget(2, 2), new THREE.WebGLRenderTarget(2, 2)];
    r.bloomBrightMaterial = new THREE.ShaderMaterial();
    r.bloomBlurMaterial = new THREE.ShaderMaterial();
    r.bloomCompositeMaterial = new THREE.ShaderMaterial();
    r.bloomQuad = new THREE.Mesh(new THREE.PlaneGeometry(), r.bloomCompositeMaterial);
    r.renderer = { domElement: { removeEventListener() {}, remove() {} }, dispose() {} };
    const glow = r.radialTexture('#ffffff', '#123456');
    const resources = [glow, r.scene.environment, r.bloomSceneTarget, ...r.bloomBlurTargets,
        r.bloomBrightMaterial, r.bloomBlurMaterial, r.bloomCompositeMaterial, r.bloomQuad.geometry,
        r.glbShipModels.get('talon').children[0].geometry];
    const counts = resources.map(watch);
    r.dispose();
    assert.deepEqual(counts.map(count => count()), resources.map(() => 1));
    assert.equal(r.radialTextureCache.size, 0);
});

test('shared source materials are tinted once per ship and released once', () => {
    const r = renderer(), source = model();
    source.add(new THREE.Mesh(source.children[0].geometry, source.children[0].material));
    const a = r.createGlbShipMesh({ id: 'a', role: 'pirate', hostile: true }, source, config, 'talon');
    const b = r.createGlbShipMesh({ id: 'b', role: 'trader', faction: 'concord' }, source, config, 'talon');
    const material = a.children[0].children[0].material;
    assert.equal(material, a.children[0].children[1].material);
    assert.notEqual(material, source.children[0].material, 'source palette stays untouched');
    assert.notEqual(material, b.children[0].children[0].material, 'different ships keep independent palettes');
    assert.equal(a.userData.emissiveMaterials.length, 1);
    const disposed = watch(material); r.disposeGlbShip(a); assert.equal(disposed(), 1);
    r.disposeGlbShip(b);
});
test('glow cache has bounded retention; overflow textures remain individually owned', () => {
    const r = renderer();
    for (let i = 0; i < 70; i++) {
        const texture = r.radialTexture('#ffffff', `#${i.toString(16).padStart(6, '0')}`);
        assert.equal(Boolean(texture.userData.shared), i < 64);
        if (i >= 64) {
            const disposed = watch(texture);
            r.disposeObject(new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })));
            assert.equal(disposed(), 1);
        }
    }
    assert.equal(r.radialTextureCache.size, 64);
});
