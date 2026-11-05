// Compare packaged and candidate startup in fresh processes. Hash referenced
// triangles (not vertex IDs), bounds, and the actual seeded scenery transforms.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

if (process.argv[2] === '--sample') {
    const moduleUrl = file => pathToFileURL(resolve(process.argv[3], 'src/game', file)).href;
    const start = performance.now();
    const {GRAVEYARD_COLLISION_PROFILES: profiles} = await import(moduleUrl('graveyardCollisionProfiles.js'));
    const parsed = performance.now();
    const {generateGraveyardPieces, GRAVEYARD_MODEL_COLLIDERS: colliders} = await import(moduleUrl('worldData.js'));
    const ready = performance.now(), pieces = generateGraveyardPieces(3017), built = performance.now();
    const hash = createHash('sha256');
    function addMesh(positions, indices, ArrayType) {
        const stream = new ArrayType(indices.length * 3);
        for (let i = 0; i < indices.length; i++)
            for (let axis = 0; axis < 3; axis++) stream[i * 3 + axis] = positions[indices[i] * 3 + axis];
        hash.update(new Uint8Array(stream.buffer));
    }
    for (const [key, parts] of Object.entries(profiles)) {
        hash.update(key);
        for (const {vertices, indices, ...metadata} of parts) {
            hash.update(JSON.stringify(metadata));
            addMesh(vertices, indices, Float64Array);
        }
    }
    for (const {meshVerts, meshIndices, ...metadata} of colliders) {
        hash.update(JSON.stringify(metadata));
        addMesh(meshVerts, meshIndices, Float32Array);
    }
    for (const {_collisionMesh, ...visible} of pieces) hash.update(JSON.stringify(visible));
    console.log(JSON.stringify({profileMs: parsed-start, worldImportMs: ready-parsed, layoutMs: built-ready,
        totalMs: built-start, sections: colliders.length, pieces: pieces.length, sha256: hash.digest('hex')}));
} else {
    const roots = [process.argv[2] ?? 'dist', process.argv[3] ?? '.'];
    const trials = Number(process.env.VR_TRIALS ?? 3), results = [[], []];
    for (let n = 0; n < trials; n++) for (const i of n % 2 ? [1, 0] : [0, 1]) {
        const child = spawnSync(process.execPath, ['--import', './tests/helpers/offline-imports.mjs',
            import.meta.filename, '--sample', roots[i]], {encoding: 'utf8'});
        if (child.status !== 0) throw new Error(child.stderr || child.stdout);
        results[i].push(JSON.parse(child.stdout));
    }
    for (const sample of results.flat()) assert.equal(sample.sha256, results[0][0].sha256, 'wreck surfaces or scenery changed');
    const median = (values, key) => values.map(v => v[key]).sort((a,b) => a-b)[Math.floor(values.length / 2)];
    console.log(JSON.stringify({roots, trials, sha256: results[0][0].sha256, medians: results.map(values =>
        Object.fromEntries(['profileMs', 'worldImportMs', 'layoutMs', 'totalMs'].map(key => [key, median(values,key)])))}, null, 2));
}
