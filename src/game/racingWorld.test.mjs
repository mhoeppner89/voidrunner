import assert from 'node:assert/strict';
import { LOCATIONS, SHIPS } from './data.js';
import {
    asteroidCollisionRadius,
    asteroidEnvelopeReach,
    GRAVEYARD_GEOMETRY_HALF_EXTENTS,
    generateAsteroidField,
    generateGraveyardPieces,
    generateWreckNodes,
    overlapsGraveyardModelWreck,
} from './worldData.js';
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
const randomFragment = /^(carrier-wake|impact-port|impact-starboard|frigate-alpha-wake|frigate-beta-wake|outer-wake)-/;
let checkedRocks = 0;
let checkedFragments = 0;
let checkedSalvage = 0;
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
        assert.ok(clearOfCorridors(local, node.radius * 1.6, mourningSegments), `seed ${seed}: ${node.id} intrudes into a fixed Mourning race corridor`);
        assert.equal(overlapsGraveyardModelWreck(local, node.radius * 1.6), false, `seed ${seed}: ${node.id} blocks an adapted wreck fly-through`);
        checkedSalvage += 1;
    }
}
assert.ok(checkedRocks > 14000 && checkedFragments > 5000 && checkedSalvage > 1800, 'the seed sweep exercised the full random fields');
assert.ok(checkedWreckClearances > 500, 'the seed sweep exercised the adapted wreck clearance volumes');

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
