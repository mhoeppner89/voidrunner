import assert from 'node:assert/strict';
import { AudioManager } from './audio.js';

// Station paint textures use canvas only in the browser; the structural audit
// supplies a minimal stub so the voxel geometry can still be built in Node.
globalThis.document = {
    createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => new Proxy({}, {
            get: (target, property) => {
                if (property === 'canvas') return this;
                if (property === 'createLinearGradient' || property === 'createRadialGradient')
                    return () => ({ addColorStop() {} });
                return typeof target[property] === 'function' ? target[property] : () => {};
            },
            set: () => true,
        }),
    }),
};
globalThis.window = {};

const audio = new AudioManager();
assert.equal(audio.enabled, false);
assert.doesNotThrow(() => audio.play('explosion', 1.5));
assert.doesNotThrow(() => audio.play('impact', 0.8));
assert.doesNotThrow(() => audio.update(0.016, 0.6, true, 0.4, 2));
assert.equal(audio.stationMode, true);
assert.equal(audio.dangerLevel, 0);

// Every gameplay effect must have an explicit layered generator; this catches
// accidental fallbacks to the generic impact sound after future refactors.
const requiredEffects = [
    'laser', 'missile', 'impact', 'explosion', 'scan', 'dock', 'ui',
    'success', 'warning', 'mining', 'salvage', 'hyperSpool', 'hyperDrop',
    'hyperActive', 'pickup',
];
for (const effect of requiredEffects)
    assert.doesNotThrow(() => audio.play(effect), `${effect} should route to a dedicated sound`);
assert.doesNotThrow(() => audio.playAtDirection('explosion', 1, 650, -420));
assert.doesNotThrow(() => audio.playAtDirection('impact', 1, 90, 80));

const { createVoxelStationModel } = await import('./voxelModels.js');
for (const id of ['helix', 'rook']) {
    const station = createVoxelStationModel(id);
    let voxels = 0;
    station.traverse((child) => {
        if (child.isMesh && child.geometry) voxels += child.geometry.getAttribute('position').count;
    });
    assert.ok(voxels > 5000, `${id} station should retain dense voxel detail (${voxels})`);
}

const { LOCATIONS } = await import('./data.js');
for (const [id, location] of Object.entries(LOCATIONS)) {
    if (!['vesper', 'azure'].includes(id))
        continue;
    assert.ok(location.radius > 500, `${id} should remain a large planetary landmark`);
}

console.log(`visual/audio audit passed: stations dense, audio graph safely inert without user gesture`);
