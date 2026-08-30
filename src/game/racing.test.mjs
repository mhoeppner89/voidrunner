import assert from 'node:assert/strict';
import { SHIPS } from './data.js';
import {
    RACE_COURSES,
    crossedRaceGate,
    createRaceRacers,
    generateRaceCourse,
    raceCourseUnlocked,
    raceOffersForLocation,
    raceRacerTarget,
    recordRaceResult,
    normalizeRaceRecord,
    stageRaceRacers,
    updateRaceRacer,
} from './racing.js';

const ids = Object.keys(RACE_COURSES);
assert.equal(ids.length, 6, 'the board has exactly six authored courses');
assert.deepEqual(raceOffersForLocation('helix'), ['shard-gauntlet', 'shard-switchback', 'shard-miners-knife']);
assert.deepEqual(raceOffersForLocation('cairn'), ['mourning-run', 'mourning-breach', 'mourning-relict-gauntlet']);
assert.equal(raceOffersForLocation('vesper').length, 0);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dotUnit = (a, b) => {
    const lengthA = Math.hypot(...a) || 1;
    const lengthB = Math.hypot(...b) || 1;
    return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (lengthA * lengthB);
};

for (const id of ids) {
    const config = RACE_COURSES[id];
    const first = generateRaceCourse(id, 0x1234);
    const second = generateRaceCourse(id, 0xfeed);
    assert.deepEqual(first, second, `${id} ignores seed variation`);
    assert.notEqual(first, second, `${id} returns an independent course object`);
    assert.deepEqual(first.center.map((value, index) => value + config.localPoints[0][index]), first.gathering.position, `${id} translates its gathering point from local coordinates`);
    assert.equal(first.gates.length, config.localPoints.length - 1, `${id} has every authored point after gathering as a gate`);
    assert.equal(first.gates.at(-1).kind, 'finish', `${id} has a distinct finish gate`);
    assert.equal(first.gates.filter((gate) => gate.kind === 'finish').length, 1, `${id} has one finish`);
    assert.equal(new Set(first.gates.map((gate) => gate.id)).size, first.gates.length, `${id} mandatory gate IDs are unique`);
    const directions = [first.gathering, ...first.gates, ...first.shortcuts.flatMap((route) => route.gates)];
    for (const gate of directions) {
        const length = Math.hypot(...gate.direction);
        assert.ok(Math.abs(length - 1) < 1e-9, `${id} direction is normalized`);
    }
    for (const route of first.shortcuts) {
        assert.deepEqual(Object.keys(route).sort(), ['entryIndex', 'exitIndex', 'gates', 'id']);
        assert.ok(route.entryIndex >= 0 && route.exitIndex > route.entryIndex, `${id} shortcut indices progress forward`);
        assert.ok(route.gates.length > 0, `${id} shortcut has gates`);
        for (const gate of route.gates)
            assert.ok(gate.radius >= 12 && gate.radius <= 16, `${id} shortcut gates stay very tight`);
        const before = route.entryIndex > 0 ? first.gates[route.entryIndex - 1].position : first.gathering.position;
        const exit = first.gates[route.exitIndex].position;
        const mainDistance = distance(before, first.gates[route.entryIndex].position)
            + Array.from({ length: route.exitIndex - route.entryIndex }, (_, offset) => distance(first.gates[route.entryIndex + offset].position, first.gates[route.entryIndex + offset + 1].position)).reduce((sum, value) => sum + value, 0);
        const shortcutDistance = distance(before, route.gates[0].position)
            + Array.from({ length: route.gates.length - 1 }, (_, index) => distance(route.gates[index].position, route.gates[index + 1].position)).reduce((sum, value) => sum + value, 0)
            + distance(route.gates.at(-1).position, exit);
        assert.ok(shortcutDistance < mainDistance, `${id} shortcut is shorter than the mandatory branch`);
        assert.ok(dotUnit(route.gates[0].direction, [route.gates[0].position[0] - before[0], route.gates[0].position[1] - before[1], route.gates[0].position[2] - before[2]]) > 0.9, `${id} shortcut entry direction follows the route`);
        assert.ok(dotUnit(route.gates.at(-1).direction, [exit[0] - route.gates.at(-1).position[0], exit[1] - route.gates.at(-1).position[1], exit[2] - route.gates.at(-1).position[2]]) > 0.9, `${id} shortcut exit direction rejoins the route`);
    }
    const mutated = generateRaceCourse(id, 0);
    mutated.gates[0].position[0] += 999;
    mutated.shortcuts[0].gates[0].position[0] += 999;
    const clean = generateRaceCourse(id, 0);
    assert.notEqual(mutated.gates[0].position[0], clean.gates[0].position[0], `${id} generated gates are mutable per run`);
    assert.notEqual(mutated.shortcuts[0].gates[0].position[0], clean.shortcuts[0].gates[0].position[0], `${id} generated shortcut gates are mutable per run`);
}

assert.deepEqual(raceOffersForLocation('shardbelt'), raceOffersForLocation('helix'), 'field alias resolves Shardbelt board');
assert.deepEqual(raceOffersForLocation('mourning-line'), raceOffersForLocation('cairn'), 'field alias resolves Mourning board');
assert.equal(raceCourseUnlocked('shard-gauntlet', {}), true);
assert.equal(raceCourseUnlocked('shard-switchback', {}), false);
assert.equal(raceCourseUnlocked('shard-switchback', { 'shard-gauntlet': { rank: 2 } }), true, 'legacy rank unlocks the next tier');
assert.equal(raceCourseUnlocked('shard-switchback', { 'shard-gauntlet': { rank: 3 } }), false);
assert.equal(raceCourseUnlocked('mourning-relict-gauntlet', { 'mourning-breach': { bestRank: 2 } }), true);
assert.ok(RACE_COURSES['shard-miners-knife'].rivalPaces[0] < SHIPS.wayfarer.afterburnSpeed, 'the hardest Shardbelt rival remains reachable by a Wayfarer afterburner');
assert.ok(RACE_COURSES['mourning-run'].rivalPaces[0] > SHIPS.wayfarer.afterburnSpeed, 'Mourning rivals require a faster hull than the Wayfarer ceiling');

const normalized = normalizeRaceRecord({ rank: 2, time: 42, at: 100, active: true, ghost: {}, champion: {}, replay: {} });
assert.equal(normalized.rank, 2);
assert.equal(normalized.time, 42);
assert.equal(normalized.at, 100);
assert.equal(normalized.active, true);
assert.equal(normalized.bestRank, 2);
assert.equal(normalized.bestTime, 42);
assert.equal('ghost' in normalized, false);
assert.equal('champion' in normalized, false);
assert.equal('replay' in normalized, false);
const firstResult = recordRaceResult({}, { rank: 2, time: 42, at: 100, splits: [11, 22] });
const secondResult = recordRaceResult(firstResult, { rank: 1, time: 45, at: 110, splits: [12, 23] });
assert.equal(secondResult.attempts, 2);
assert.equal(secondResult.rank, 1);
assert.equal(secondResult.bestRank, 1);
assert.equal(secondResult.bestTime, 42, 'best time is independent of best rank');
assert.deepEqual(secondResult.bestSplits, [11, 22]);
assert.deepEqual(secondResult.lastSplits, [12, 23]);
const failed = recordRaceResult(secondResult, { failed: true, at: 130 });
assert.equal(failed.attempts, 3);
assert.equal(failed.failed, true);
assert.equal(failed.bestRank, 1);
assert.equal('ghost' in failed, false);
const sparseSplitResult = recordRaceResult({}, { rank: 1, time: 30, at: 140, splits: [8, undefined, 24] });
assert.deepEqual(sparseSplitResult.bestSplits, [8, null, 24], 'shortcut split gaps retain their mandatory-gate indexes');
assert.deepEqual(normalizeRaceRecord(JSON.parse(JSON.stringify(sparseSplitResult))).bestSplits, [8, null, 24], 'shortcut split indexes survive save hydration');

const course = generateRaceCourse('shard-gauntlet', 1);
const racersA = createRaceRacers(course, 'stable-seed', 10);
const racersB = createRaceRacers(course, 'stable-seed', 9999);
assert.deepEqual(racersA.map(({ name, variant, laneOffset, pace, raceShortcutChoice }) => ({ name, variant, laneOffset, pace, raceShortcutChoice })), racersB.map(({ name, variant, laneOffset, pace, raceShortcutChoice }) => ({ name, variant, laneOffset, pace, raceShortcutChoice })), 'racer roster is not world-time seeded');
assert.equal(racersA.length, 3);
assert.equal(new Set(racersA.map((racer) => racer.laneOffset)).size, 3);
assert.equal(new Set(racersA.map((racer) => racer.raceLivery?.accent)).size, 3, 'named rivals have three distinct race liveries');
assert.ok(racersA.every((racer) => Number.isFinite(racer.spawnTime)), 'race meshes always receive a finite render phase');
assert.equal(new Set(racersA.map((racer) => racersA[racersA.indexOf(racer)].variant)).size, 3);
assert.notEqual(racersA[0].raceShortcutChoice, racersA[1].raceShortcutChoice, 'rivals make distinct shortcut choices');
for (const [index, racer] of racersA.entries()) {
    const positionReference = racer.position;
    const velocityReference = racer.velocity;
    const rotationReference = racer.rotation;
    const target = raceRacerTarget(racer, course);
    const gate = course.gates[racer.raceGateIndex];
    const dx = target[0] - gate.position[0];
    const dy = target[1] - gate.position[1];
    const dz = target[2] - gate.position[2];
    assert.ok(Math.hypot(dx, dy, dz) <= gate.radius * 0.3 + 1e-8, 'racer lane target remains inside gate centre aperture');
    assert.equal(target[0] === gate.position[0] && target[1] === gate.position[1] && target[2] === gate.position[2], index === 1, 'racer targets use persistent lateral lanes');
    updateRaceRacer(racer, course, 1 / 60, 1);
    assert.equal(racer.position, positionReference, 'racer position array is updated in place');
    assert.equal(racer.velocity, velocityReference, 'racer velocity array is updated in place');
    assert.equal(racer.rotation, rotationReference, 'racer quaternion array is updated in place');
    assert.ok(Math.abs(Math.hypot(...racer.rotation) - 1) < 1e-9, 'racer orientation remains a unit quaternion');
}
const stagedReferences = racersA.map((racer) => racer.position);
const beforeRestagePositions = racersA.map((racer) => [...racer.position]);
assert.equal(stageRaceRacers(racersA, course), racersA);
for (const [index, racer] of racersA.entries()) {
    assert.equal(racer.position, stagedReferences[index], 'restaging keeps position arrays in place');
    assert.notDeepEqual(racer.position, beforeRestagePositions[index], 'restaging returns the racer to the gathering grid');
}
for (const racer of racersA)
    assert.ok(Math.hypot(racer.position[0] - course.gathering.position[0], racer.position[1] - course.gathering.position[1], racer.position[2] - course.gathering.position[2]) < 80, 'racer is staged at the gathering point');
const gridLongitudinal = racersA.map((racer) => racer.position.reduce((sum, value, index) => sum + (value - course.gathering.position[index]) * course.gathering.direction[index], 0));
assert.equal(gridLongitudinal.filter((value) => value > 0).length, 3, 'all three rivals wait ahead of the player');
assert.ok(Math.min(...gridLongitudinal) >= 20 && Math.max(...gridLongitudinal) <= 46, 'rivals form a compact, cockpit-visible stagger');

const gate = { position: [0, 0, 0], direction: [0, 0, 1], radius: 2 };
assert.equal(crossedRaceGate([0, 0, -10], [0, 0, 10], gate), true);
assert.equal(crossedRaceGate([0, 0, 10], [0, 0, -10], gate), false);
assert.equal(crossedRaceGate([3, 0, -10], [3, 0, 10], gate), false);
assert.equal(crossedRaceGate([0, 0, 1], [0, 0, 10], gate), false, 'starting on the exit side cannot count');

const simpleCourse = {
    racerSpeed: 10,
    rivalPaces: [10, 10, 10],
    gathering: { position: [0, 0, -20], direction: [0, 0, 1], radius: 3 },
    gates: [{ id: 'simple-finish', position: [0, 0, 0], direction: [0, 0, 1], radius: 2, kind: 'finish' }],
    shortcuts: [],
};
const simple = { position: [0, 0, -5], velocity: [0, 0, 0], rotation: [0, 0, 0, 1], pace: 10, speed: 10, laneOffset: 0, raceGateIndex: 0, raceFinished: false };
const simplePosition = simple.position;
updateRaceRacer(simple, simpleCourse, 1, 7);
assert.equal(simple.position, simplePosition);
assert.equal(simple.raceGateIndex, 1);
assert.equal(simple.raceFinished, true, 'racer advances on a swept finish crossing');
assert.equal(simple.raceFinishTime, 7);

const shortcutCourse = {
    racerSpeed: 10,
    rivalPaces: [10, 10, 10],
    gathering: { position: [0, 0, -20], direction: [0, 0, 1], radius: 3 },
    gates: [
        { id: 'shortcut-entry', position: [0, 0, 0], direction: [0, 0, 1], radius: 2, kind: 'mandatory' },
        { id: 'shortcut-exit', position: [0, 0, 30], direction: [0, 0, 1], radius: 2, kind: 'finish' },
    ],
    shortcuts: [{ id: 'shortcut', entryIndex: 0, exitIndex: 1, gates: [
        { id: 'shortcut-a', position: [0, 0, 8], direction: [0, 0, 1], radius: 2 },
        { id: 'shortcut-b', position: [0, 0, 16], direction: [0, 0, 1], radius: 2 },
    ] }],
};
const shortcutRacer = { position: [0, 0, -5], velocity: [0, 0, 0], rotation: [0, 0, 0, 1], pace: 10, speed: 10, laneOffset: 0, raceGateIndex: 0, raceFinished: false, raceShortcutChoice: true };
const shortcutTarget = raceRacerTarget(shortcutRacer, shortcutCourse);
assert.equal(shortcutTarget[2], 8, 'entryIndex selects the shortcut while it is the next mandatory gate');
assert.equal(shortcutRacer.raceShortcutState, 'active');
updateRaceRacer(shortcutRacer, shortcutCourse, 3, 8);
assert.equal(shortcutRacer.raceShortcutState, 'complete');
assert.equal(shortcutRacer.raceGateIndex, 1, 'shortcut rejoins at its declared exitIndex');
assert.equal(shortcutRacer.raceFinished, false);
updateRaceRacer(shortcutRacer, shortcutCourse, 1, 9);
assert.equal(shortcutRacer.raceGateIndex, 2);
assert.equal(shortcutRacer.raceFinished, true);

console.log('all racing assertions passed');
