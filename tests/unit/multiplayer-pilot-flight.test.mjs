import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepPilotFlight } from '../../src/game/multiplayer/pilotFlight.js';
import { getEffectiveShipStats } from '../../src/game/shipStats.js';
import { flight } from '../helpers/hyperdrive-flight.mjs';

const dt = 1 / 60;
const stats = getEffectiveShipStats({ shipId: 'wayfarer', equipment: [] });
const poseKeys = ['position', 'rotation', 'velocity', 'angularVelocity'];

function pilot(speed, energy) {
    return {
        position: [20, 30, 40], rotation: [0, 0, 0, 1],
        velocity: [0, 0, -speed], angularVelocity: [0, 0, 0],
        throttle: 0.8, afterburning: false, energy,
    };
}

test('burn speed requires cruise entry speed and power, while an empty capacitor still doubles turn authority', () => {
    const entry = 0.9 * stats.maxSpeed;
    const below = pilot(entry - 0.01, 10);
    const ready = pilot(entry, 10);
    const empty = pilot(entry, 0);
    const coasting = pilot(entry, 0);
    const burn = { pitch: 0.5, afterburner: true };
    for (const actor of [below, ready, empty]) stepPilotFlight(actor, stats, burn, dt);
    stepPilotFlight(coasting, stats, { pitch: 0.5 }, dt);

    assert.ok(Math.hypot(...below.velocity) < entry - 0.01);
    assert.ok(Math.hypot(...ready.velocity) > entry);
    assert.ok(Math.hypot(...empty.velocity) < entry);
    assert.equal(below.energy, 10 - dt * stats.burnEnergy);
    assert.equal(ready.energy, below.energy);
    assert.equal(empty.energy, 0);
    assert.equal(empty.afterburning, true);
    assert.equal(empty.angularVelocity[0], 2 * coasting.angularVelocity[0]);
});

test('multiplayer pose matches solo flight across steering, throttle and assist changes', () => {
    const solo = flight();
    const player = solo.save.player;
    const actor = pilot(68, 6);
    for (const key of poseKeys) player[key] = [...actor[key]];
    player.energy = actor.energy;
    player.throttle = actor.throttle;
    const arrays = poseKeys.map(key => actor[key]);
    const fittedStats = solo.playerStats();

    for (let i = 0; i < 90; i++) {
        const input = {
            pitch: 0.4, yaw: -0.7, roll: 0.2,
            throttleSet: i === 0 ? 1 : i === 45 ? 0 : undefined,
            throttleDelta: i < 45 ? 0.46 : -0.46,
            afterburner: i < 60, flightAssist: i < 30 || i >= 75,
        };
        solo.save.settings.flightAssist = input.flightAssist;
        solo.updatePlayer(dt, input);
        stepPilotFlight(actor, fittedStats, input, dt);
        for (const [index, key] of poseKeys.entries()) {
            assert.equal(actor[key], arrays[index], key);
            assert.deepEqual(actor[key], player[key], key);
        }
        assert.equal(actor.throttle, player.throttle);
        assert.equal(actor.energy, player.energy);
        assert.equal(actor.afterburning, solo.afterburning);
    }
});
