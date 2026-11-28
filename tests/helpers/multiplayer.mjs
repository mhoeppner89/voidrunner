import assert from 'node:assert/strict';

export function startWithConfirmedLoadouts(match) {
    for (const pilot of match.connectedPlayers()) assert.ok(match.confirmStarter(pilot.id).ok);
    return match.start(match.hostId);
}
