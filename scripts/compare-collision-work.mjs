import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { registerHooks } from 'node:module';
if (!process.argv[2]) throw new Error('Usage: node scripts/compare-collision-work.mjs BASELINE_DIRECTORY [REPORT_JSON]');
const root = new URL('../', import.meta.url), baseline = pathToFileURL(resolve(process.argv[2]) + '/');
registerHooks({ resolve(s, c, n) { return n(s === 'three' ? new URL('vendor/three.module.min.js', root).href : s, c); } });
const THREE = await import('three');
const { GameSession: Old } = await import(new URL('src/game/game.js', baseline));
const { GameSession: New } = await import(new URL('src/game/game.js', root));
const { segmentMeshHit } = await import(new URL('src/game/meshQueries.js', root));
const { visitObstacleCells } = await import(new URL('src/game/obstacleQueries.js', root));
const world = await import(new URL('src/game/worldData.js', root));
const { LOCATIONS } = await import(new URL('src/game/data.js', root));
// Extract the baseline's self-contained exact query; count triangle tests only.
// This reference comes from the caller's baseline, never from the revised code.
const source = await readFile(new URL('src/game/game.js', baseline), 'utf8');
const begin = source.indexOf('const segmentMeshHit = '), finish = source.indexOf('const segmentRadialBandAt', begin);
assert.ok(begin >= 0 && finish > begin, 'Unsupported baseline mesh query; update the comparison deliberately.');
let referenceSource = source.slice(begin, finish).replace('const segmentMeshHit = (start, end, obstacle)', 'export const reference = (start, end, obstacle, stats)');
referenceSource = referenceSource.replace('for (let t = 0; t < indices.length; t += 3) {', 'for (let t = 0; t < indices.length; t += 3) { if (stats) stats.triangleTests = (stats.triangleTests ?? 0) + 1;');
const { reference } = await import('data:text/javascript;base64,' + Buffer.from(referenceSource).toString('base64'));
let state = 804140;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }
function session(Type, id) {
    const s = Object.create(Type.prototype); s.activeInstanceId = id;
    s.save = { world: { time: 0 } }; s.obstacleCellSize = 256; s.obstacleQueryStamp = 0;
    s.asteroids = world.generateAsteroidField(804140, []);
    s.graveyard = world.generateGraveyardPieces(804140);
    s.wreckNodes = world.generateWreckNodes(804140, []);
    s.regionalFields = new Map(); s.activeDockObstacle = () => undefined;
    return s;
}
const stats = { baseline: { triangleTests: 0 }, revisedNearest: { triangleTests: 0 }, revisedAny: { triangleTests: 0 } };
let rays = 0, hits = 0, boxQueries = 0, fieldQueries = 0, oldGridLookups = 0;
const sparse = { columns: 0, rows: 0, buckets: 0 }, scenes = [];
for (const id of ['shardbelt', 'mourning-line']) {
    const before = session(Old, id), after = session(New, id);
    const obstacles = after.activeFieldObstacles();
    const meshes = obstacles.filter(o => o.meshVerts && o.meshIndices);
    scenes.push({ id, obstacles: obstacles.length, meshes: meshes.length });
    for (const o of meshes) {
        const q = new THREE.Quaternion(o.box.qx, o.box.qy, o.box.qz, o.box.qw);
        const center = new THREE.Vector3(o.x, o.y, o.z);
        for (let i = 0; i < 32; i++) {
            const radius = o.losRadius;
            const a = new THREE.Vector3((random() * 2 - 1) * radius * 2, (random() * 2 - 1) * radius * 2, (random() * 2 - 1) * radius * 2);
            const b = i % 5 === 0 ? a.clone() : new THREE.Vector3((random() * 2 - 1) * radius, (random() * 2 - 1) * radius, (random() * 2 - 1) * radius);
            // Include exact triangle vertices, opposite-side paths, and starts
            // inside the enclosing sphere but outside the minReach convention.
            if (i % 4 === 0) b.fromArray(o.meshVerts, (i % (o.meshVerts.length / 3)) * 3);
            if (i % 7 === 0) b.copy(a).negate();
            a.applyQuaternion(q).add(center); b.applyQuaternion(q).add(center);
            const expected = reference(a, b, o, stats.baseline);
            const actual = segmentMeshHit(a, b, o, false, stats.revisedNearest);
            assert.equal(actual, expected, `${id}/${o.id}/ray${i}`);
            assert.equal(segmentMeshHit(a, b, o, true, stats.revisedAny) !== undefined, expected !== undefined, `any: ${o.id}/${i}`);
            rays++; if (actual !== undefined) hits++;
        }
    }
    before.ensureObstacleGrid(); after.ensureObstacleGrid();
    const get = before.obstacleGrid.get;
    before.obstacleGrid.get = function (key) { oldGridLookups++; return get.call(this, key); };
    for (let i = 0; i < 1500; i++) {
        const o = obstacles[i % obstacles.length], range = i % 7 === 0 ? 1400 : 760;
        const x = o.x + (random() - .5) * 1400, y = o.y + (random() - .5) * 1400, z = o.z + (random() - .5) * 1400;
        const bounds = [x-range, y-range, z-range, x+range, y+range, z+range];
        const a = [], b = [];
        before.forEachObstacleInBox(...bounds, obstacle => a.push(obstacle.id));
        visitObstacleCells(after.obstacleBoxIndex, ...bounds.map(v => Math.floor(v/256)), ++after.obstacleQueryStamp, obstacle => b.push(obstacle.id), sparse);
        assert.deepEqual(b, a, `${id}/box${i}`); boxQueries++;
        // Test full DDA, broad phase, narrow phase, ignoreId, and first-hit IDs.
        if (i < 500) {
            const start = new THREE.Vector3(x,y,z), end = new THREE.Vector3(o.x,o.y,o.z);
            const ignore = i % 9 === 0 ? o.id : undefined;
            const oldHit = before.firstObstacleHitInfo(start,end,ignore), newHit = after.firstObstacleHitInfo(start,end,ignore);
            assert.equal(newHit?.t, oldHit?.t, `${id}/field${i}`);
            assert.equal(newHit?.obstacle.id, oldHit?.obstacle.id);
            assert.equal(after.lineBlocked(start,end,ignore), before.lineBlocked(start,end,ignore)); fieldQueries++;
        }
    }
}
const result = { seed:804140, scenes, exactMeshQueries:rays, meshHits:hits,
    identicalNearestParameters:true, identicalBooleanResults:true,
    exactFieldQueries:fieldQueries, identicalNearestObstacleIds:true,
    exactBoxQueries:boxQueries, identicalBoxCandidateOrder:true,
    triangles:stats, spatialQueries:{baselineCellLookups:oldGridLookups,revisedOccupiedVisits:sparse},
    method:'Deterministic generated collision geometry and real GameSession query methods versus the provided baseline. Counts are executed CPU work; they are not iPhone or GPU timings. Hierarchy builds are counted on the nearest-hit pass; the following Boolean pass reuses that cache. No collision surfaces, AI cadence or rendered detail changes.' };
await writeFile(process.argv[3] ?? 'collision-work-report.json', JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
