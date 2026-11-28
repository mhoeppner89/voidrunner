import assert from 'node:assert/strict';
import { finishMatchDeployment, startWithConfirmedLoadouts } from '../helpers/multiplayer.mjs';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { ARENA_SITES } from '../../src/game/arenaSites.js';
import { createMultiplayerMatch } from '../../src/game/multiplayer/matchRules.js';
import { ARENA_LIMIT, MatchWorld } from '../../src/game/multiplayer/matchWorld.js';
import { SHIP_COLLIDERS, shipVsObstacle } from '../../src/game/shipCollision.js';
import { fieldWorld } from '../helpers/field-world.mjs';

const ids = ['host', 'guest-a', 'guest-b', 'guest-c'];
const noop = () => {};

test('all multiplayer Arena sites admit four pilots and respawns and enforce their flight boundary', () => {
    const seed = 718;
    const session = fieldWorld(seed);
    session.renderer.updateWorld = noop;
    for (const [siteId, site] of Object.entries(ARENA_SITES)) {
        session.stageArenaSite(siteId);
        const match = createMultiplayerMatch({ hostId: ids[0], seed, settings: { siteId } });
        for (const id of ids.slice(1)) assert.ok(match.addPlayer(id, id).ok);
        assert.ok(match.selectStarter(ids[1], 'scrapper').ok);
        assert.ok(match.selectStarter(ids[2], 'speedster').ok);
        assert.ok(startWithConfirmedLoadouts(match).ok);
        const world = new MatchWorld(match, session, noop, noop);
        const obstacles = site.instanceId ? session.activeFieldObstacles(site.instanceId) : [];
        for (const actor of world.actors()) world.spawn(actor);
        const checkFleet = () => {
            const fleet = world.actors();
            assert.equal(fleet.length, 4);
            for (const actor of fleet) {
                const point = new Vector3().fromArray(actor.position);
                const rotation = new Quaternion().fromArray(actor.rotation);
                const radius = SHIP_COLLIDERS[actor.variant].contactRadius;
                assert.ok(point.distanceTo(world.center) <= ARENA_LIMIT - radius, siteId + ' flight volume');
                assert.ok(session.siteSpotClear(site, point, obstacles), siteId + ' spawn clearance');
                for (const other of fleet) {
                    if (other === actor) continue;
                    const distance = point.distanceTo(new Vector3().fromArray(other.position));
                    assert.ok(distance > radius + SHIP_COLLIDERS[other.variant].contactRadius, siteId + ' distinct spawns');
                }
                for (const obstacle of obstacles) {
                    const distance = Math.hypot(point.x - obstacle.x, point.y - obstacle.y, point.z - obstacle.z);
                    if (distance > radius + Math.max(obstacle.radius, obstacle.losRadius ?? 0)) continue;
                    assert.ok(!shipVsObstacle(point, rotation, actor.variant, actor.scale, obstacle, {}),
                        siteId + ' hull intersects ' + obstacle.id);
                }
            }
            const positions = fleet.map(actor => [...actor.position]);
            world.step();
            assert.deepEqual(fleet.map(actor => actor.position), positions, siteId + ' idle pilots remain in place');
        };
        checkFleet();
        assert.ok(match.recordDeath(ids[1], ids[2]).ok);
        world.spawn(match.respawn(ids[1]).actor);
        checkFleet();
        finishMatchDeployment(world);
        const actor = world.actors()[0];
        // Find an open section of this site's boundary; propulsion and terrain
        // contact use the same MatchWorld.step as the browser host.
        let outward;
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8;
            const direction = new Vector3(Math.cos(angle), .25, Math.sin(angle)).normalize();
            const point = world.center.clone().addScaledVector(direction, ARENA_LIMIT + 10);
            if (session.siteSpotClear(site, point, obstacles, 45)) { outward = direction; break; }
        }
        assert.ok(outward, siteId + ' open boundary');
        world.center.clone().addScaledVector(outward, ARENA_LIMIT + 10).toArray(actor.position);
        outward.clone().multiplyScalar(55).toArray(actor.velocity);
        world.step();
        const range = new Vector3().fromArray(actor.position).distanceTo(world.center);
        assert.ok(Math.abs(range - ARENA_LIMIT) < 1e-6, siteId + ' boundary range');
        assert.ok(new Vector3().fromArray(actor.velocity).dot(outward) <= 0, siteId + ' boundary pushes inward');
    }
});

test('four-pilot snapshots read live rack counts without resolving the full fit again', () => {
    const match = createMultiplayerMatch({ hostId: ids[0], seed: 718 });
    for (const id of ids.slice(1)) match.addPlayer(id);
    startWithConfirmedLoadouts(match);
    const session = { save: { player: { position: [0, 0, 0] } }, siteSpotClear: () => true };
    const world = new MatchWorld(match, session, noop, noop);
    const expected = [];
    let outfitReads = 0;
    for (const actor of world.actors()) {
        world.spawn(actor);
        const mountId = actor.activeLauncherMountId;
        assert.ok(mountId);
        const rounds = --actor.launcherMagazines[mountId].rounds;
        expected.push({ mountId, rounds });
        const outfit = actor.outfitting;
        Object.defineProperty(actor, 'outfitting', { get() { outfitReads++; return outfit; } });
    }
    const snapshot = world.snapshot();
    assert.deepEqual(snapshot.actors.map(actor => actor.rack), expected);
    assert.equal(outfitReads, 0);
});

test('respawns rotate away from a camper and the recently used firing area', () => {
    function deployment(seed) {
        const match = createMultiplayerMatch({ hostId: 'host', seed });
        match.addPlayer('camper');
        assert.ok(startWithConfirmedLoadouts(match).ok);
        const session = { save: { player: { position: [0, 0, 0] } }, siteSpotClear: () => true };
        const world = new MatchWorld(match, session, noop, noop);
        const [pilot, camper] = world.actors();
        assert.ok(world.spawn(pilot) && world.spawn(camper));
        const first = new Vector3().fromArray(pilot.position);
        first.toArray(camper.position);
        const positions = [pilot.position];
        for (let life = 2; life < 8; life++) {
            world.recordDeath('host', 'camper', life - 1);
            const next = match.respawn('host').actor;
            assert.ok(world.spawn(next));
            const point = new Vector3().fromArray(next.position);
            assert.ok(point.distanceTo(first) > 650, 'the camper has no close shot at the redeploying pilot');
            assert.ok(point.distanceTo(new Vector3().fromArray(positions.at(-1))) > 300, 'the last spawn is not immediately reused');
            positions.push(next.position);
        }
        return positions;
    }
    const sample = deployment(718);
    assert.ok(new Set(sample.map(position => position.join(','))).size >= 4);
    assert.deepEqual(sample, deployment(718));
    assert.notDeepEqual(sample, deployment(941));
});

test('team deployment favors a covered wing position without moving into hostile range', () => {
    const match = createMultiplayerMatch({ hostId: 'host', settings: { mode: 'teams', siteId: 'shardbelt-rim' } });
    for (const id of ['enemy', 'wing', 'enemy-wing']) match.addPlayer(id);
    assert.ok(startWithConfirmedLoadouts(match).ok);
    const session = { save: { player: { position: [0, 0, 0] } }, activeFieldObstacles: () => [],
        siteSpotClear: () => true, lineBlocked: (_, point) => point.z > 0 };
    const world = new MatchWorld(match, session, noop, noop);
    for (const actor of world.actors()) assert.ok(world.spawn(actor));
    const [host, enemy, wing, enemyWing] = world.actors();
    enemy.position = [0, 0, 0];
    enemyWing.position = [0, 0, -120];
    wing.position = [720, 0, 0];
    const coveredWing = new Vector3(460, 0, 180);
    world.spawnOptions = [new Vector3(220, 0, 0), new Vector3(-900, 0, 0), new Vector3(460, 0, -160), coveredWing];
    world.recordDeath(host.id, enemy.id, host.life);
    const next = match.respawn(host.id).actor;
    assert.equal(world.chooseSpawn(next), coveredWing);
    session.siteSpotClear = () => false;
    assert.equal(world.spawn(next), false, 'a blocked site never falls back inside the terrain');
});

test('2v2 openings group each wing with room to maneuver and separate the opposing wings', () => {
    for (const seed of [175, 718, 941]) {
        const match = createMultiplayerMatch({ hostId: 'host', seed, settings: { mode: 'teams' } });
        for (const id of ['enemy', 'wing', 'enemy-wing']) match.addPlayer(id);
        assert.ok(startWithConfirmedLoadouts(match).ok);
        const session = { save: { player: { position: [0, 0, 0] } }, siteSpotClear: () => true };
        const world = new MatchWorld(match, session, noop, noop);
        const actors = world.actors();
        for (const actor of actors) assert.ok(world.spawn(actor));
        for (const actor of actors) {
            for (const other of actors.filter(other => other !== actor)) {
                const gap = Math.hypot(...actor.position.map((value, i) => value - other.position[i]));
                assert.ok(actor.team === other.team ? gap > 120 && gap < 520 : gap > 650, `seed ${seed}, gap ${gap}`);
            }
        }
    }
});
