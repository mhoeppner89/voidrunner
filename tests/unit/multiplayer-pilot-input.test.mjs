import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptPilotInput, clearPilotInput, createPilotInput, takePilotActions } from '../../src/game/multiplayer/pilotInput.js';

test('match input bounds untrusted axes and keeps flight edges through a newer packet', () => {
    const input = createPilotInput();
    assert.equal(acceptPilotInput(input, {
        sequence: 0, pitch: 1000, yaw: NaN, roll: '1', throttleSet: 2, missile: true,
    }, 8), true);
    assert.equal(acceptPilotInput(input, {
        sequence: 1, pitch: -5, yaw: .4, throttleDelta: 1000, targetId: 'pilot-2', fire: true, aimAssist: false,
    }, 8), true);
    assert.equal(acceptPilotInput(input, { sequence: 0, targetId: 'pilot-3' }, 8), false);
    assert.deepEqual(takePilotActions(input, 8), {
        pitch: -1, yaw: .4, roll: 0, throttleDelta: .88, afterburner: false, fire: true,
        flightAssist: true, aimAssist: false, throttleSet: 1, missile: true, targetId: 'pilot-2',
    });
    assert.deepEqual(takePilotActions(input, 9), {
        pitch: -1, yaw: .4, roll: 0, throttleDelta: .88, afterburner: false, fire: true, flightAssist: true, aimAssist: false,
    });
});

test('a silent client releases controls and clearing a life drops its queued actions', () => {
    const input = createPilotInput();
    acceptPilotInput(input, { sequence: 2, fire: true, afterburner: true, flightAssist: false }, 12);
    assert.equal(takePilotActions(input, 32).flightAssist, false);
    assert.equal(takePilotActions(input, 32).fire, true);
    assert.equal(takePilotActions(input, 33).afterburner, false);
    assert.equal(takePilotActions(input, 33).fire, false);

    acceptPilotInput(input, { sequence: 3, missile: true }, 34);
    clearPilotInput(input);
    assert.equal(acceptPilotInput(input, { sequence: 3, missile: true }, 35), false);
    assert.equal(takePilotActions(input, 35).missile, undefined);
});
