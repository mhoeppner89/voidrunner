import assert from 'node:assert/strict';
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
        assert.ok(match.start(ids[0]).ok);
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
    match.start(ids[0]);
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
