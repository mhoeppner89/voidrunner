import { test } from 'node:test';
import assert from 'node:assert/strict';
import { session } from '../helpers/session.mjs';
import { updateShipAI } from '../../src/game/shipAI.js';

function setup(role = 'trader') {
    const s = session();
    s.arena = undefined;
    s.save.player.position = [10000, 0, 0];
    const civilian = s.spawnShip(role, [0, 0, 0], undefined, undefined, { tier: 'novice' }, { hullId: 'mule' });
    const hunter = s.spawnShip('pirate', [0, 0, 150], undefined, undefined, { tier: 'veteran' }, { hullId: 'talon' });
    civilian.rotation = [0, 0, 0, 1]; civilian.velocity = [0, 0, -25];
    civilian.destination = [0, 0, -2000];
    civilian.task = role === 'miner'
        ? { kind: 'mine', phase: 'transit', workUntil: 0 }
        : { kind: 'trade', phase: 'leg', port: 'vesper', dwellUntil: 0 };
    hunter.targetId = civilian.id;
    s.updateSensorAwareness = () => {};
    s.updateSearchAI = () => false;
    return { s, civilian, hunter };
}

test('ambient haulers and miners escape a hunt before combat targeting can start a dogfight', () => {
    for (const role of ['trader', 'miner']) {
        const { s, civilian } = setup(role);
        const prior = civilian.task, destination = civilian.destination;
        let travel = 0;
        s.updateTravelAI = () => { travel++; };
        s.resolveShipTarget = () => assert.fail('civilian must choose escape before combat resolution');
        updateShipAI(s, civilian, 1 / 60);
        assert.equal(travel, 1);
        assert.equal(civilian.task.kind, 'flee');
        assert.equal(civilian.task.prior, prior);
        assert.equal(civilian.task.priorDestination, destination);
        assert.ok(civilian.destination[2] < -1000);
        assert.equal(civilian.targetId, undefined);
    }
});

test('civilian escape holds briefly after a rescue, then restores the original working route', () => {
    const { s, civilian, hunter } = setup();
    const prior = civilian.task, destination = civilian.destination;
    s.updateTravelAI = () => {};
    s.resolveShipTarget = () => undefined;
    updateShipAI(s, civilian, 1 / 60);
    const flee = civilian.task, fleeDestination = civilian.destination, awayFrom = flee.awayFrom;
    hunter.targetId = 'player';
    for (const time of [1, 2, 3.9]) {
        s.save.world.time = time;
        updateShipAI(s, civilian, 1 / 60);
        assert.equal(civilian.task, flee);
        assert.equal(civilian.destination, fleeDestination, 'no destination allocation every escape tick');
        assert.equal(flee.awayFrom, awayFrom, 'no threat-position allocation every escape tick');
        assert.ok(civilian.destination[2] < -1000, 'keep escaping the last attacker, not the player');
    }
    s.save.world.time = 4.1;
    updateShipAI(s, civilian, 1 / 60);
    assert.equal(civilian.task, prior);
    assert.equal(civilian.destination, destination);
});

test('a recent player hit is a credible threat, merely targeting or passing a civilian is not', () => {
    const { s, civilian, hunter } = setup();
    hunter.targetId = 'player';
    s.save.player.position = [0, 0, 120];
    s.save.player.currentTargetId = civilian.id;
    s.updateTravelAI = () => {};
    s.resolveShipTarget = () => undefined;
    updateShipAI(s, civilian, 1 / 60);
    assert.equal(civilian.task.kind, 'trade');
    civilian.combatThreatId = 'player'; civilian.combatThreatUntil = 2;
    updateShipAI(s, civilian, 1 / 60);
    assert.equal(civilian.task.kind, 'flee');
    assert.ok(civilian.destination[2] < -1000);
});

test('a civilian does not switch to hunting the player when escape grace expires', () => {
    const { s, civilian, hunter } = setup();
    const prior = civilian.task, destination = civilian.destination;
    hunter.targetId = 'player';
    s.save.player.position = [0, 0, 120];
    // The real unauthorized-attack handler retains these reputation fields.
    civilian.hostile = true; civilian.crimeVictim = true; civilian.targetId = 'player';
    civilian.combatThreatId = 'player'; civilian.combatThreatUntil = 2;
    s.updateTravelAI = () => {};
    s.resolveShipTarget = () => assert.fail('an escaped freighter must not resume offensive target acquisition');
    for (const time of [0, 1, 2.1, 4.9, 5.1]) {
        s.save.world.time = time;
        updateShipAI(s, civilian, 1 / 60);
        assert.equal(civilian.task.kind, 'flee');
    }
    s.save.player.position = [0, 0, 1000];
    s.save.world.time = 9.2;
    updateShipAI(s, civilian, 1 / 60);
    assert.equal(civilian.task, prior);
    assert.equal(civilian.destination, destination);
    assert.equal(civilian.targetId, undefined);
    assert.equal(civilian.hostile, true, 'do not erase reputation/attack consequences');
    assert.equal(civilian.crimeVictim, true);
    s.save.player.position = [0, 0, 120];
    civilian.combatThreatUntil = 12;
    s.save.world.time = 10;
    updateShipAI(s, civilian, 1 / 60);
    assert.equal(civilian.task.kind, 'flee', 'renewed fire restarts escape');
});

test('an armed claim-dispute miner remains a combatant after being hit', () => {
    const { s, civilian: rival } = setup('miner');
    rival.hostile = true; rival.authorizedTarget = true; rival.targetId = 'player';
    rival.combatThreatId = 'player'; rival.combatThreatUntil = 2;
    s.resolveShipTarget = () => ({ position: s.save.player.position, velocity: s.save.player.velocity });
    s.deferentialPilot = () => false;
    let attacks = 0;
    s.updateAttackAI = () => { attacks++; };
    updateShipAI(s, rival, 1 / 60);
    assert.equal(attacks, 1);
    assert.equal(rival.task.kind, 'mine');
});

test('inactive or distant hunters do not rout civilian traffic', () => {
    for (const patch of [{ hull: 0 }, { poweredDown: true }, { surrendered: true }, { standingDown: true }, { position: [0, 0, 700] }]) {
        const { s, civilian, hunter } = setup();
        Object.assign(hunter, patch);
        s.updateTravelAI = () => {};
        s.resolveShipTarget = () => undefined;
        updateShipAI(s, civilian, 1 / 60);
        assert.equal(civilian.task.kind, 'trade');
    }
});

test('authored actors and arena ships keep their existing combat decisions', () => {
    for (const flag of ['tutorialCompanion', 'tutorialEncounter', 'storyPersonId', 'explorationGroup', 'distressActor', 'race', 'arena']) {
        const { s, civilian, hunter } = setup();
        if (flag === 'arena') s.arena = {};
        else civilian[flag] = true;
        s.resolveShipTarget = () => ({ position: hunter.position, velocity: hunter.velocity });
        s.deferentialPilot = () => false;
        let attacks = 0;
        s.updateAttackAI = () => { attacks++; };
        updateShipAI(s, civilian, 1 / 60);
        assert.equal(attacks, 1, flag);
        assert.equal(civilian.task.kind, 'trade', flag);
    }
});

test('actual civilian travel increases separation without firing or losing finite transforms', () => {
    const { s, civilian, hunter } = setup();
    let attacks = 0;
    s.updateAttackAI = () => { attacks++; };
    const initial = Math.hypot(...civilian.position.map((v, i) => v - hunter.position[i]));
    for (let i = 0; i < 180; i++) {
        s.save.world.time = i / 60;
        updateShipAI(s, civilian, 1 / 60);
    }
    const final = Math.hypot(...civilian.position.map((v, i) => v - hunter.position[i]));
    assert.ok(final > initial + 100, `${initial} → ${final}`);
    assert.equal(attacks, 0);
    assert.equal(s.projectiles.length, 0);
    assert.ok([...civilian.position, ...civilian.velocity, ...civilian.rotation].every(Number.isFinite));
});
