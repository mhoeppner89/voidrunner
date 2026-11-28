import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { DEPLOYMENT_SECONDS, takeShipJumpArrival } from '../../src/game/jumpArrival.js';
import { fireMatchRound } from '../../src/game/multiplayer/matchProjectiles.js';
import { createMultiplayerMatch } from '../../src/game/multiplayer/matchRules.js';
import { DEPLOYMENT_TICKS, MATCH_STEP, MatchWorld } from '../../src/game/multiplayer/matchWorld.js';
import { WEAPONS } from '../../src/game/weapons.js';
import { startWithConfirmedLoadouts } from '../helpers/multiplayer.mjs';
import { session } from '../helpers/session.mjs';

const noop = () => {};

test('an in-view jump cue is consumed once and excludes physical launches', () => {
    const solo = session();
    const ship = solo.spawnShip('patrol', [0, 0, -300]);
    assert.ok(takeShipJumpArrival(ship, solo.save.world.time));
    assert.equal(takeShipJumpArrival(ship, solo.save.world.time), false);
    for (const flags of [{ launchOwner: 'carrier' }, { stationDock: {} }, { race: true }, { hull: 0 }]) {
        const entry = { hull: 100, jumpArrivalAt: 10, ...flags };
        assert.equal(takeShipJumpArrival(entry, 10.2), false);
        assert.equal(entry.jumpArrivalAt, undefined);
    }
    assert.equal(takeShipJumpArrival({ hull: 100, jumpArrivalAt: 10 }, 11), false);
});

test('Arena entry holds the cockpit at its spawn, then drops out of hyperdrive on time', () => {
    const solo = session();
    solo.arena = { scenario: '1v1' };
    const heard = [];
    solo.audio = { play: sound => heard.push(sound), setStationMode: noop };
    solo.clearCombatDebris = noop;
    solo.setupArena(solo.arena, false);
    const spawn = [...solo.save.player.position];
    const clock = solo.save.world.time;
    const controls = { throttleSet: 1, fire: true, missile: true };
    solo.handleActions(controls);
    assert.equal(solo.save.player.throttle, .35);
    for (let i = 0; i < DEPLOYMENT_TICKS - 1; i++) solo.updateSimulation(MATCH_STEP, controls);
    assert.equal(solo.hyperdriveFxState().fx, 'active');
    assert.equal(solo.save.world.time, clock);
    assert.deepEqual(solo.save.player.position, spawn);
    solo.updateSimulation(MATCH_STEP, controls);
    assert.equal(solo.hyperdriveFxState().fx, 'drop');
    assert.deepEqual(heard, ['hyperDrop']);
    assert.deepEqual(solo.save.player.position, spawn);
    solo.handleActions({ throttleSet: 1 });
    assert.equal(solo.save.player.throttle, 1);
});

test('the match clock waits for deployment, and a relaunch cannot fire or take hits while jumping', () => {
    const match = createMultiplayerMatch({ hostId: 'host' });
    assert.ok(match.addPlayer('guest', 'Guest').ok);
    assert.ok(startWithConfirmedLoadouts(match).ok);
    const s = { save: { player: { position: [0, 0, 0] }, world: {} }, renderer: { updateWorld: noop }, siteSpotClear: () => true };
    const world = new MatchWorld(match, s, noop, noop);
    const [host, firstGuest] = world.actors();
    assert.ok(world.spawn(host, new Vector3(0, 0, 35)));
    assert.ok(world.spawn(firstGuest, new Vector3(0, 0, 0)));
    const roundClock = match.remainingSeconds;
    const input = { life: firstGuest.life, sequence: 0, fire: true, throttleSet: 1 };
    world.receiveInput('guest', input);
    assert.equal(world.snapshot().actors[1].deployTicks, DEPLOYMENT_TICKS);
    for (let i = 0; i < DEPLOYMENT_TICKS; i++) world.advance(MATCH_STEP);
    assert.equal(world.snapshot().actors[1].deployTicks, 0);
    assert.equal(world.tick * MATCH_STEP, DEPLOYMENT_SECONDS);
    assert.equal(match.remainingSeconds, roundClock);
    assert.equal(firstGuest.throttle, 0);
    assert.deepEqual(firstGuest.position, [0, 0, 0]);
    world.receiveInput('guest', { ...input, fire: false });
    world.advance(MATCH_STEP);
    assert.ok(match.remainingSeconds < roundClock);
    assert.equal(firstGuest.throttle, 1);

    world.recordDeath('guest', 'host', firstGuest.life);
    const guest = match.respawn('guest').actor;
    assert.ok(world.spawn(guest, new Vector3(0, 0, 0)));
    assert.equal(world.snapshot().actors[1].deployTicks, DEPLOYMENT_TICKS);
    const shoot = () => fireMatchRound(world.combat, host, WEAPONS.pulse, 'test-gun', new Vector3(0, 0, 28),
        new Vector3(0, 0, -1), guest);
    shoot();
    for (let i = 0; i < DEPLOYMENT_TICKS; i++) world.advance(MATCH_STEP);
    assert.equal(guest.shield, guest.maxShield, 'a pulse can pass through the spawn during deployment');
    assert.deepEqual(guest.position, [0, 0, 0]);
    shoot();
    for (let i = 0; i < 10; i++) world.advance(MATCH_STEP);
    assert.ok(guest.shield < guest.maxShield, 'the same shot hits after normal flight resumes');
});
