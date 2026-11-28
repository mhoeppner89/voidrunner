import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { createMultiplayerMatch } from '../../src/game/multiplayer/matchRules.js';
import { MATCH_STEP, MatchWorld } from '../../src/game/multiplayer/matchWorld.js';
import { shipVsShip } from '../../src/game/shipCollision.js';
import { fieldWorld } from '../helpers/field-world.mjs';

const noop = () => {};
const seed = 718;

function stagedMatch(session, siteId, teams = false) {
    session.stageArenaSite(siteId);
    const match = createMultiplayerMatch({ hostId: 'host', seed, settings: { siteId, mode: teams ? 'teams' : 'ffa' } });
    const guests = teams ? ['guest', 'wingman', 'wingman-2'] : ['guest'];
    for (const id of guests) assert.ok(match.addPlayer(id, id).ok);
    assert.ok(match.start('host').ok);
    const events = [];
    const world = new MatchWorld(match, session, batch => events.push(...batch), () => {
        // A bad host coordinate reaches peers as null in a JSON snapshot.
        for (const actor of JSON.parse(JSON.stringify(world.snapshot())).actors) {
            assert.ok(actor.position.every(Number.isFinite), actor.id + ' snapshot position at tick ' + world.tick);
            assert.ok(actor.velocity.every(Number.isFinite), actor.id + ' snapshot velocity at tick ' + world.tick);
        }
    });
    for (const actor of world.actors()) world.spawn(actor);
    return { world, events };
}

function intersect(a, b) {
    return shipVsShip(new Vector3(...a.position), new Quaternion(...a.rotation), a.variant, a.scale,
        new Vector3(...b.position), new Quaternion(...b.rotation), b.variant, b.scale, {});
}

test('pilots fly apart after an authoritative ram, with damage determined by their teams', () => {
    const session = fieldWorld(seed);
    session.renderer.updateWorld = noop;
    for (const teams of [false, true]) {
        const { world, events } = stagedMatch(session, 'verge-lanes', teams);
        const host = world.actors()[0];
        const guest = world.match.players.get(teams ? 'wingman' : 'guest').actor;
        const attacker = teams ? guest : host;
        const target = teams ? host : guest;
        attacker.position = [0, 0, 40];
        attacker.rotation = [0, 0, 0, 1];
        attacker.velocity = [0, 0, -50];
        target.position = [0, 0, 0];
        target.rotation = [0, 1, 0, 0];
        const frame = teams ? 1 / 120 : 1 / 30;
        for (let i = 0; i < 2 / frame; i++) {
            world.receiveInput(attacker.id, { sequence: i, life: attacker.life, throttleSet: 1 });
            world.advance(frame);
        }
        assert.equal(world.tick, 120);
        assert.ok(Math.hypot(...target.position) > 1, 'ram displaces the stationary pilot');
        assert.ok(!intersect(attacker, target), 'ships can fly clear');
        const hits = events.filter(event => event.type === 'hit');
        if (teams) {
            assert.deepEqual(hits, [], 'friendly fire is disabled');
        } else {
            assert.deepEqual(new Set(hits.map(hit => hit.targetId)), new Set([host.id, guest.id]));
            assert.ok(host.shield < host.stats.shield && guest.shield < guest.stats.shield);
        }
    }
});

test('a multiplayer pilot recoils from a Shardbelt rock and the next snapshots stay finite', () => {
    const session = fieldWorld(seed);
    session.renderer.updateWorld = noop;
    const { world, events } = stagedMatch(session, 'shardbelt-rim');
    const actor = world.actors()[0];
    const rock = session.activeFieldObstacles(world.site.instanceId).find(obstacle => obstacle.id === 'asteroid-static-1');
    actor.position = [rock.x, rock.y, rock.z + rock.maxReach + 20];
    actor.rotation = [0, 0, 0, 1];
    actor.velocity = [0, 0, -50];
    world.receiveInput(actor.id, { sequence: 0, life: actor.life, throttleSet: 1 });
    for (let i = 0; i < 60; i++) world.advance(MATCH_STEP);
    assert.ok(events.some(event => event.type === 'hit' && event.targetId === actor.id && event.ownerId === null));
    assert.ok(actor.shield < actor.stats.shield);
    assert.ok(actor.position[2] > rock.z, 'pilot stays on the approach side of the rock');
});
