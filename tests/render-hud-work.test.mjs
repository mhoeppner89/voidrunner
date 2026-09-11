import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
registerHooks({ resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three'
        ? new URL('../vendor/three.module.min.js', import.meta.url).href
        : specifier, context);
} });
const THREE = await import('three');
const { buildGlbScene } = await import('../src/game/glbLoader.js');
const { GameUI } = await import('../src/game/ui.js');

test('static GLB parts preserve world transforms while the model root moves', async () => {
    // Include an authored shear matrix: recomposing it from TRS would lose it.
    const matrix = [1, 0, 0, 0, .3, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1];
    const json = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }],
        nodes: [{ translation: [1, 2, 3], children: [1] }, { matrix }] };
    const text = JSON.stringify(json), padded = text.padEnd(Math.ceil(text.length / 4) * 4, ' ');
    const buffer = new ArrayBuffer(28 + padded.length), view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
    view.setUint32(12, padded.length, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buffer, 20, padded.length).set(new TextEncoder().encode(padded));
    view.setUint32(20 + padded.length, 0, true); view.setUint32(24 + padded.length, 0x004e4942, true);
    const root = await buildGlbScene(buffer);
    const expected = new THREE.Group(), parent = new THREE.Group(), child = new THREE.Group();
    parent.position.set(1, 2, 3); child.matrix.fromArray(matrix); child.matrixAutoUpdate = false;
    parent.add(child); expected.add(parent);
    let recompositions = 0;
    for (const object of [root.children[0], root.children[0].children[0]]) {
        const update = object.updateMatrix;
        object.updateMatrix = function () { recompositions++; return update.call(this); };
    }
    for (let i = 0; i < 60; i++) {
        for (const model of [root, expected]) {
            model.position.set(i, -i, 2); model.rotation.y = i / 10; model.scale.setScalar(1 + i / 60);
            model.updateMatrixWorld(true);
        }
        assert.deepEqual(root.children[0].children[0].matrixWorld.elements, child.matrixWorld.elements);
    }
    assert.equal(recompositions, 0);
    assert.equal(root.matrixAutoUpdate, true);
});

test('own hull redraws for content, size and canvas changes; targets remain live', () => {
    globalThis.window = { devicePixelRatio: 1 };
    let clears = 0;
    const context = new Proxy({}, { get: (_, key) => key === 'clearRect' ? () => clears++ : () => {}, set: () => true });
    const canvas = { width: 150, height: 110, clientWidth: 150, clientHeight: 110, getContext: () => context };
    const ui = Object.create(GameUI.prototype); ui.ownHullCanvas = canvas;
    const draw = (missiles = 2) => ui.drawHullOutline(ui.ownHullCanvas, 'kestrel', 0, 'cyan', false, missiles, 4);
    draw(); const first = clears; assert.equal(first, 1);
    for (let i = 0; i < 60; i++) draw();
    assert.equal(clears, first);
    draw(1); assert.equal(clears, first + 1);
    canvas.clientWidth = 200; draw(1); assert.equal(clears, first + 2);
    window.devicePixelRatio = 2; draw(1); assert.equal(clears, first + 3);
    ui.ownHullCanvas = { ...canvas }; draw(1); assert.equal(clears, first + 4);
    ui.drawHullOutline(canvas, 'kestrel'); ui.drawHullOutline(canvas, 'kestrel');
    assert.equal(clears, first + 6, 'target redraws must not be skipped');
});

test('cockpit images are preloaded on ship changes, not every HUD update', () => {
    const ui = Object.create(GameUI.prototype);
    ui.root = { dataset: {} }; ui.el = () => ({ style: {} });
    let preloads = 0; ui.preloadImageSet = () => { preloads++; };
    ui.setCockpitShip('wayfarer');
    for (let i = 0; i < 60; i++) ui.setCockpitShip('wayfarer');
    assert.equal(preloads, 1);
    delete ui.root.dataset.cockpitShip;
    ui.setCockpitShip('wayfarer'); assert.equal(preloads, 2);
});

test('flight log groups identical consecutive notices without merging different rewards', () => {
    const ui = Object.create(GameUI.prototype);
    ui.save = { world: { time: 1 } }; ui.recentEvents = [];
    ui.pushEvent('Bounty: 100 credits', 'success');
    ui.save.world.time = 2; ui.pushEvent('Bounty: 100 credits', 'success');
    assert.equal(ui.recentEvents.length, 1); assert.equal(ui.recentEvents[0].count, 2);
    ui.pushEvent('Bounty: 200 credits', 'success');
    assert.equal(ui.recentEvents.length, 2);
    ui.save.world.time = 10; ui.pushEvent('Bounty: 200 credits', 'success');
    assert.equal(ui.recentEvents.length, 3);
});
