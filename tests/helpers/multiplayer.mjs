import assert from 'node:assert/strict';
export function finishMatchDeployment(world) {
    while (world.actors().some(actor => world.tick < actor.deployUntilTick)) world.step();
}

export function startWithConfirmedLoadouts(match) {
    for (const pilot of match.connectedPlayers()) assert.ok(match.confirmStarter(pilot.id).ok);
    return match.start(match.hostId);
}
