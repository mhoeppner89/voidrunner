import assert from 'node:assert/strict';
import { GameSession } from './game.js';

const ship = (id, faction, position, changes = {}) => ({
    id,
    faction,
    position: [...position],
    velocity: [0, 0, 0],
    hull: 100,
    maxHull: 100,
    shield: 100,
    maxShield: 100,
    hostile: faction === 'red-talons',
    role: faction === 'red-talons' ? 'pirate' : 'patrol',
    ...changes,
});

const fixture = (arena = { observer: true }) => {
    const runtime = Object.create(GameSession.prototype);
    runtime.arena = arena;
    runtime.save = {
        world: { time: 0 },
        player: { position: [0, 0, 0], velocity: [0, 0, 0], hull: 100, dockedAt: undefined },
    };
    runtime.ships = [];
    runtime.deferentialPilot = () => false;
    runtime.shipTracksPlayer = () => true;
    runtime.projectileCanHitShip = (projectile, target) => {
        if (projectile.faction === 'red-talons')
            return target.faction !== 'red-talons';
        return target.faction === 'red-talons';
    };
    return runtime;
};

{
    const runtime = fixture();
    const blue = ship('blue-1', 'concord', [0, 0, 0], { observerTeam: 'blue', role: 'escort', hostile: false, targetId: 'red-dead' });
    const redDead = ship('red-dead', 'red-talons', [0, 0, 10], { observerTeam: 'red', hull: 0 });
    const redLive = ship('red-live', 'red-talons', [0, 0, 40], { observerTeam: 'red' });
    runtime.ships = [blue, redDead, redLive];
    runtime.resolveShipTarget(blue);
    assert.equal(blue.targetId, 'red-live', 'observer ships retarget the nearest living opposing ship');
}

{
    const runtime = fixture();
    const blue = ship('blue-1', 'concord', [0, 0, 0], { observerTeam: 'blue', role: 'escort', hostile: false, targetId: 'red-current' });
    const redCurrent = ship('red-current', 'red-talons', [0, 0, 15], { observerTeam: 'red' });
    const redAttacker = ship('red-attacker', 'red-talons', [0, 0, 60], { observerTeam: 'red', targetId: blue.id });
    runtime.ships = [blue, redCurrent, redAttacker];
    runtime.resolveShipTarget(blue);
    assert.equal(blue.targetId, redAttacker.id, 'an active attacker outranks the previous observer lock');
}

{
    const runtime = fixture();
    const blue = ship('blue-1', 'concord', [0, 0, 0], { observerTeam: 'blue', role: 'escort', hostile: false, targetId: 'red-current', combatThreatId: 'red-threat', combatThreatUntil: 2 });
    const redCurrent = ship('red-current', 'red-talons', [0, 0, 10], { observerTeam: 'red' });
    const redThreat = ship('red-threat', 'red-talons', [0, 0, 80], { observerTeam: 'red' });
    runtime.ships = [blue, redCurrent, redThreat];
    runtime.resolveShipTarget(blue);
    assert.equal(blue.targetId, redThreat.id, 'a recent damage source has the highest target priority');
}

{
    const runtime = fixture(null);
    const pirate = ship('pirate', 'red-talons', [0, 0, 0], { role: 'pirate', hostile: true });
    const patrol = ship('patrol', 'concord', [0, 0, 40], { role: 'patrol', hostile: false });
    runtime.save.player.position = [0, 0, 100];
    runtime.ships = [pirate, patrol];
    runtime.resolveShipTarget(pirate);
    assert.equal(pirate.targetId, patrol.id, 'normal hostile NPCs prefer the nearest opposing ship');
}

{
    const runtime = fixture(null);
    const trader = ship('trader', 'free-merchants', [0, 0, 0], { role: 'trader', hostile: false });
    const pirate = ship('pirate', 'red-talons', [0, 0, 40], { role: 'pirate', hostile: true, targetId: trader.id });
    trader.combatThreatId = pirate.id;
    trader.combatThreatUntil = 2;
    runtime.ships = [trader, pirate];
    runtime.resolveShipTarget(trader);
    assert.equal(trader.targetId, pirate.id, 'a normal civilian retaliates against the ship attacking it');
}

{
    const runtime = fixture();
    const blue = ship('blue-1', 'concord', [0, 0, 0], { observerTeam: 'blue', role: 'escort', hostile: false, targetId: 'red-dead' });
    const redDead = ship('red-dead', 'red-talons', [0, 0, 10], { observerTeam: 'red', hull: 0 });
    runtime.ships = [blue, redDead];
    const target = runtime.resolveShipTarget(blue);
    assert.equal(target, undefined, 'observer ships do not fall back to the hidden player');
    assert.equal(blue.targetId, undefined);
}

{
    const runtime = Object.create(GameSession.prototype);
    runtime.observerEditor = true;
    runtime.observerPendingShip = 'wayfarer';
    runtime.observerPendingFit = 'balanced';
    runtime.observerTeam = 'blue';
    runtime.observerDifficulty = 'novice';
    runtime.observerDraft = [];
    runtime.observerUnitCounter = 0;
    runtime.observerDraftPositionAt = () => ({ x: 10, y: 0, z: 20 });
    runtime.spawnObserverDraftUnit = entry => { runtime.spawnedEntry = entry; };
    runtime.observerViewModel = () => ({});
    runtime.ui = { updateObserverView: () => {} };
    runtime.observerPlacePendingAt(0, 0);
    assert.equal(runtime.observerDraft[0].tier, 'novice', 'each placed observer unit stores its selected pilot tier');

    runtime.observerDifficulty = 'ace';
    runtime.observerTeam = 'red';
    runtime.observerPlacePendingAt(0, 0);
    assert.equal(runtime.observerDraft[1].tier, 'ace', 'later placements can use a different pilot tier');
}

{
    const runtime = Object.create(GameSession.prototype);
    runtime.arena = { observer: true };
    runtime.observerStarted = true;
    runtime.observerEditor = false;
    runtime.observerResult = undefined;
    runtime.observerPaused = false;
    runtime.simAccumulator = 0;
    runtime.save = { world: { time: 6000 } };
    runtime.ships = [
        ship('blue-live', 'concord', [0, 0, 0], { observerTeam: 'blue' }),
        ship('red-live', 'red-talons', [0, 0, 80], { observerTeam: 'red' }),
    ];
    runtime.updateObserverBattleState();
    assert.equal(runtime.observerResult, undefined, 'observer combat has no elapsed-time result while both sides survive');

    runtime.ships[1].hull = 0;
    runtime.updateObserverBattleState();
    assert.equal(runtime.observerResult, 'BLUE WINS', 'observer result still resolves when a team is actually eliminated');
}

console.log('NPC targeting passed: retaliation, active attacker priority, nearest opponents, observer no-player fallback, draft pilot tiers and no observer time limit.');
