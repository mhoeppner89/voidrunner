import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOCATIONS, SHIPS } from './data.js';
import {
    asteroidCollisionRadius,
    asteroidEnvelopeReach,
    graveyardCollisionMesh,
    GRAVEYARD_GEOMETRY_HALF_EXTENTS,
    GRAVEYARD_MODEL_COLLIDERS,
    GRAVEYARD_MODEL_WRECKS,
    graveyardWreckInteriorAt,
    generateAsteroidField,
    generateGraveyardPieces,
    generateWreckNodes,
    overlapsGraveyardModelWreck,
    wreckNodeCollisionRadius,
} from './worldData.js';
import { hullVsAsteroid, hullVsEngine, hullVsRing } from './hullCollision.js';
import {
    RACE_COURSES,
    createRaceRacers,
    generateRaceCourse,
    updateRaceRacer,
} from './racing.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const segmentDistanceSq = (point, start, end) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const lengthSq = dx * dx + dy * dy + dz * dz;
    const along = lengthSq > 1e-8
        ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy + (point[2] - start[2]) * dz) / lengthSq))
        : 0;
    return (point[0] - start[0] - dx * along) ** 2
        + (point[1] - start[1] - dy * along) ** 2
        + (point[2] - start[2] - dz * along) ** 2;
};
const corridorSegments = (zone) => {
    const segments = [];
    for (const course of Object.values(RACE_COURSES)) {
        if (course.zone !== zone)
            continue;
        for (let index = 1; index < course.localPoints.length; index += 1)
            segments.push([course.localPoints[index - 1], course.localPoints[index]]);
        for (const shortcut of course.shortcuts) {
            const points = [
                course.localPoints[shortcut.entryIndex],
                ...shortcut.gates.map((gate) => gate.localPosition),
                course.localPoints[shortcut.exitIndex + 1],
            ];
            for (let index = 1; index < points.length; index += 1)
                segments.push([points[index - 1], points[index]]);
        }
    }
    return segments;
};
const clearOfCorridors = (point, reach, segments) => segments.every(([start, end]) => segmentDistanceSq(point, start, end) > (reach + 12) ** 2 - 1e-6);

const shardCenter = LOCATIONS.shardbelt.position;
const mourningCenter = LOCATIONS['mourning-line'].position;
const shardSegments = corridorSegments('shardbelt');
const mourningSegments = corridorSegments('mourning-line');
const randomFragment = /^(carrier-wake|impact-port|impact-starboard|cruiser-alpha-shatter|cruiser-beta-shatter|frigate-alpha-wake|frigate-beta-wake|escort-crossfire|outer-wake)-/;
let checkedRocks = 0;
let checkedFragments = 0;
let checkedSalvage = 0;
let checkedHotspotSalvage = 0;
let checkedWreckClearances = 0;

for (let seed = 0; seed < 30; seed += 1) {
    for (const rock of generateAsteroidField(seed, {})) {
        const local = rock.position.map((value, index) => value - shardCenter[index]);
        assert.ok(clearOfCorridors(local, asteroidCollisionRadius(rock), shardSegments), `seed ${seed}: ${rock.id} intrudes into a fixed Shardbelt race corridor`);
        checkedRocks += 1;
    }
    for (const piece of generateGraveyardPieces(seed)) {
        assert.notEqual(piece.kind, 'modelCollision', `seed ${seed}: obsolete model collision proxy ${piece.id} returned`);
        const local = piece.position.map((value, index) => value - mourningCenter[index]);
        const profile = GRAVEYARD_GEOMETRY_HALF_EXTENTS[piece.kind] ?? [0.5, 0.5, 0.5];
        const visualReach = Math.hypot(profile[0] * piece.scale[0], profile[1] * piece.scale[1], profile[2] * piece.scale[2]);
        if (!piece.id.startsWith('route-') && overlapsGraveyardModelWreck(local, visualReach)) {
            assert.equal(piece.render, false, `seed ${seed}: ${piece.id} visibly overlaps an adapted wreck`);
            assert.equal(piece.collidable, false, `seed ${seed}: ${piece.id} blocks an adapted wreck fly-through`);
            checkedWreckClearances += 1;
        }
        if (!randomFragment.test(piece.id))
            continue;
        assert.ok(clearOfCorridors(local, Math.hypot(...piece.halfExtents), mourningSegments), `seed ${seed}: ${piece.id} intrudes into a fixed Mourning race corridor`);
        checkedFragments += 1;
    }
    for (const node of generateWreckNodes(seed, {})) {
        const local = node.position.map((value, index) => value - mourningCenter[index]);
        const reach = wreckNodeCollisionRadius(node);
        assert.ok(clearOfCorridors(local, reach, mourningSegments), `seed ${seed}: ${node.id} intrudes into a fixed Mourning race corridor`);
        if (node.insideWreckId) {
            assert.equal(node.hotspot, `${node.insideWreckId}:belly`, `seed ${seed}: ${node.id} is missing its belly hotspot identity`);
            assert.equal(graveyardWreckInteriorAt(local, reach), node.insideWreckId, `seed ${seed}: ${node.id} crosses its torn salvage cavity`);
            assert.equal(overlapsGraveyardModelWreck(local, reach), true, `seed ${seed}: ${node.id} is not inside its parent wreck envelope`);
            checkedHotspotSalvage += 1;
        }
        else {
            assert.equal(overlapsGraveyardModelWreck(local, reach), false, `seed ${seed}: exterior ${node.id} overlaps an adapted wreck`);
        }
        checkedSalvage += 1;
    }
}
assert.ok(checkedRocks > 14000 && checkedFragments >= 6300 && checkedSalvage === 3000, 'the seed sweep exercised the full structured fields');
assert.equal(checkedHotspotSalvage, 960, '32 capital-belly salvage hotspots remain stable across every seed');
assert.ok(checkedWreckClearances > 500, 'the seed sweep exercised the adapted wreck clearance volumes');

const classCounts = Object.fromEntries(['battleship', 'carrier', 'cruiser', 'frigate'].map((className) => [className, GRAVEYARD_MODEL_WRECKS.filter((wreck) => wreck.class === className).length]));
assert.deepEqual(classCounts, { battleship: 1, carrier: 1, cruiser: 2, frigate: 8 }, 'Mourning Line has the requested exact wreck roster');
assert.deepEqual(GRAVEYARD_MODEL_WRECKS.filter((wreck) => wreck.class === 'wayfarer' || wreck.class === 'talon').map((wreck) => wreck.class).sort(), ['talon', 'wayfarer'], 'two textured fighter wrecks replace generic filler');
assert.equal(GRAVEYARD_MODEL_WRECKS.filter((wreck) => wreck.interior).length, 4, 'the battleship, carrier and two cruisers have flyable torn bellies');
assert.equal(GRAVEYARD_MODEL_WRECKS.filter((wreck) => !wreck.interior).length, 10, 'frigates and fighters use their visible torn surfaces');
assert.equal(GRAVEYARD_MODEL_COLLIDERS.length, 34, 'every rendered wreck section has one shared surface collider');
assert.ok(GRAVEYARD_MODEL_COLLIDERS.every((collider) => collider.surfaceOnly), 'wreck collision never fills an opening by inferring a solid convex interior');
for (const wreck of GRAVEYARD_MODEL_WRECKS.filter((entry) => entry.interior)) {
    const colliders = GRAVEYARD_MODEL_COLLIDERS.filter((entry) => entry.modelWreckId === wreck.id);
    assert.ok(colliders.some((entry) => entry.sectionName === wreck.interior.sectionName), `${wreck.id} collides against its real torn midsection surface`);
    assert.equal(colliders.some((entry) => /^(?:COLLISION|INTERIOR|STRUCTURE) /.test(entry.sectionName)), false, `${wreck.id} contains no freestanding tunnel boxes`);
}

// Sample every Mourning main line and shortcut with a conservative 12-unit
// spherical hull. This exercises the exact wreck triangles plus the analytical
// ring/engine walls, including the painted physical route frames themselves.
const modelObstacles = GRAVEYARD_MODEL_COLLIDERS.map((collider) => ({
    id: collider.id,
    x: collider.position[0], y: collider.position[1], z: collider.position[2],
    radius: collider.collisionRadius, losRadius: collider.collisionRadius,
    meshVerts: collider.meshVerts, meshIndices: collider.meshIndices, minReach: collider.minReach,
    surfaceOnly: collider.surfaceOnly,
    box: { qx: collider.quaternion[0], qy: collider.quaternion[1], qz: collider.quaternion[2], qw: collider.quaternion[3] },
}));
const pieceObstacles = generateGraveyardPieces(0).filter((piece) => piece.collidable !== false).map((piece) => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...piece.rotation, 'XYZ'));
    const obstacle = {
        id: piece.id,
        x: piece.position[0], y: piece.position[1], z: piece.position[2],
        radius: Math.hypot(...piece.halfExtents),
        scale: piece.scale,
        box: { hx: piece.halfExtents[0], hy: piece.halfExtents[1], hz: piece.halfExtents[2], qx: quaternion.x, qy: quaternion.y, qz: quaternion.z, qw: quaternion.w },
    };
    if (piece.kind === 'ring' || piece.kind === 'engine')
        obstacle.shape = piece.kind;
    else {
        const mesh = graveyardCollisionMesh(piece);
        obstacle.radius = mesh.radius;
        obstacle.losRadius = mesh.radius;
        obstacle.meshVerts = mesh.verts;
        obstacle.meshIndices = mesh.indices;
        obstacle.minReach = mesh.minReach;
    }
    return obstacle;
});
const courseObstacles = [...modelObstacles, ...pieceObstacles];
const identity = new THREE.Quaternion();
const samplePosition = new THREE.Vector3();
const contact = { x: 0, y: 0, z: 0, push: 0 };
let collisionScratch = new Float32Array(0);
const routeCollision = (position, obstacle) => {
    if (obstacle.shape === 'ring')
        return hullVsRing(position, [12, 12, 12], identity, obstacle, contact);
    if (obstacle.shape === 'engine')
        return hullVsEngine(position, [12, 12, 12], identity, obstacle, contact);
    if (collisionScratch.length < obstacle.meshVerts.length)
        collisionScratch = new Float32Array(obstacle.meshVerts.length);
    return hullVsAsteroid(position, [12, 12, 12], identity, identity, obstacle, collisionScratch, contact);
};
const wreckModelPosition = new THREE.Vector3();
const wreckModelQuaternion = new THREE.Quaternion();
const wreckModelEuler = new THREE.Euler();
for (const wreck of GRAVEYARD_MODEL_WRECKS.filter((entry) => entry.interior)) {
    wreckModelEuler.set(...wreck.rotation, 'XYZ');
    wreckModelQuaternion.setFromEuler(wreckModelEuler);
    const bay = wreck.interior;
    for (const fraction of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) {
        for (const vertical of [-0.34, 0, 0.34]) {
            for (const lateral of [-0.34, 0, 0.34]) {
                wreckModelPosition.set(
                    bay.center[0] + bay.halfLength * fraction,
                    bay.center[1] + bay.halfHeight * vertical,
                    bay.center[2] + bay.halfWidth * lateral,
                ).multiplyScalar(wreck.scale).applyQuaternion(wreckModelQuaternion).add(new THREE.Vector3(
                    mourningCenter[0] + wreck.local[0],
                    mourningCenter[1] + wreck.local[1],
                    mourningCenter[2] + wreck.local[2],
                ));
                const hits = modelObstacles.filter((obstacle) => {
                    const broadReach = obstacle.radius + 12;
                    const dx = wreckModelPosition.x - obstacle.x;
                    const dy = wreckModelPosition.y - obstacle.y;
                    const dz = wreckModelPosition.z - obstacle.z;
                    return dx * dx + dy * dy + dz * dz <= broadReach * broadReach && routeCollision(wreckModelPosition, obstacle);
                });
                assert.deepEqual(hits, [], `${wreck.id} torn belly core is blocked at ${fraction}/${vertical}/${lateral}`);
            }
        }
    }
}
const centerlineHits = [];
for (const course of Object.values(RACE_COURSES)) {
    if (course.zone !== 'mourning-line')
        continue;
    const routes = [course.localPoints, ...course.shortcuts.map((shortcut) => [course.localPoints[shortcut.entryIndex], ...shortcut.gates.map((gate) => gate.localPosition), course.localPoints[shortcut.exitIndex + 1]])];
    for (const points of routes) {
        for (let segment = 1; segment < points.length; segment += 1) {
            const start = points[segment - 1];
            const end = points[segment];
            const steps = Math.ceil(distance(start, end) / 8);
            for (let step = 0; step <= steps; step += 1) {
                const fraction = step / steps;
                samplePosition.set(
                    mourningCenter[0] + start[0] + (end[0] - start[0]) * fraction,
                    mourningCenter[1] + start[1] + (end[1] - start[1]) * fraction,
                    mourningCenter[2] + start[2] + (end[2] - start[2]) * fraction,
                );
                for (const obstacle of courseObstacles) {
                    const broadReach = obstacle.radius + 12;
                    const dx = samplePosition.x - obstacle.x;
                    const dy = samplePosition.y - obstacle.y;
                    const dz = samplePosition.z - obstacle.z;
                    if (dx * dx + dy * dy + dz * dz > broadReach * broadReach)
                        continue;
                    if (routeCollision(samplePosition, obstacle)) {
                        centerlineHits.push(`${course.id}:${segment}:${obstacle.id}`);
                        break;
                    }
                }
            }
        }
    }
}
assert.deepEqual(centerlineHits, [], `Mourning race centerlines collide with battlefield geometry: ${centerlineHits.slice(0, 5).join(', ')}`);

// The corridor reservation must clear a rock's FULL envelope — the spawn-
// clearance box corner reach (0.9·radius·hypot(scale)), not just its bounding
// sphere — at every authored gate point. A rock whose sphere misses the race
// line can still have a box corner sitting inside a gate ring the pilot must
// fly through; the reservation uses the larger of the two so this is a
// deterministic invariant, not a per-seed gamble.
const markedGates = Object.values(RACE_COURSES).flatMap((course) => {
    const built = generateRaceCourse(course.id);
    return [built.gathering, ...built.gates, ...built.shortcuts.flatMap((route) => route.gates)].map((gate) => gate.position);
});
const GATE_CLEARANCE = 10.1; // Wayfarer: longest hull half-extent + entry clearance
let intrudingGates = 0;
for (let seed = 0; seed < 30; seed += 1) {
    for (const rock of generateAsteroidField(seed, {})) {
        const reach = asteroidEnvelopeReach(rock) + GATE_CLEARANCE;
        for (const gate of markedGates) {
            if (Math.hypot(gate[0] - rock.position[0], gate[1] - rock.position[1], gate[2] - rock.position[2]) < reach)
                intrudingGates += 1;
        }
    }
}
assert.equal(intrudingGates, 0, `a rock envelope intrudes on an authored gate (${intrudingGates} intrusions across 30 seeds)`);

const fullRouteDistance = (course) => {
    let total = 0;
    let previous = course.gathering.position;
    for (const gate of course.gates) {
        total += distance(previous, gate.position);
        previous = gate.position;
    }
    return total;
};
const shortcutRouteDistance = (course) => {
    const route = course.shortcuts[0];
    let total = 0;
    let previous = course.gathering.position;
    for (let index = 0; index < route.entryIndex; index += 1) {
        total += distance(previous, course.gates[index].position);
        previous = course.gates[index].position;
    }
    for (const gate of route.gates) {
        total += distance(previous, gate.position);
        previous = gate.position;
    }
    total += distance(previous, course.gates[route.exitIndex].position);
    previous = course.gates[route.exitIndex].position;
    for (let index = route.exitIndex + 1; index < course.gates.length; index += 1) {
        total += distance(previous, course.gates[index].position);
        previous = course.gates[index].position;
    }
    return total;
};
const fastestRivalTime = (course) => {
    const racers = createRaceRacers(course);
    let elapsed = 0;
    while (elapsed < 400 && racers.some((racer) => !racer.raceFinished)) {
        elapsed += 1 / 60;
        for (const racer of racers)
            updateRaceRacer(racer, course, 1 / 60, elapsed);
    }
    return Math.min(...racers.map((racer) => racer.raceFinishTime));
};

const hardestShard = generateRaceCourse('shard-miners-knife');
const hardestShardDistance = Math.min(fullRouteDistance(hardestShard), shortcutRouteDistance(hardestShard));
const hardestShardRival = fastestRivalTime(hardestShard);
assert.ok(hardestShardDistance / SHIPS.wayfarer.maxSpeed > hardestShardRival, 'a cruise-only Wayfarer should lose the hardest Shardbelt course');
assert.ok(hardestShardDistance / SHIPS.wayfarer.afterburnSpeed < hardestShardRival, 'heavy Wayfarer afterburner use should make the hardest Shardbelt course winnable');

const mourningRun = generateRaceCourse('mourning-run');
const mourningDistance = Math.min(fullRouteDistance(mourningRun), shortcutRouteDistance(mourningRun));
const mourningRival = fastestRivalTime(mourningRun);
assert.ok(mourningDistance / SHIPS.wayfarer.afterburnSpeed > mourningRival, 'even an ideal full-burn Wayfarer should not contest the Mourning Run');
assert.ok(mourningDistance / SHIPS.talon.afterburnSpeed < mourningRival, 'a faster Talon with afterburner should be able to contest the Mourning Run');

console.log(`racing world checks passed: ${checkedRocks} rocks, ${checkedFragments} fragments, ${checkedSalvage} salvage nodes across 30 seeds`);
