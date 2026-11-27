import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_SITE_IDS } from '../../src/game/arenaSites.js';
import { SHIPS } from '../../src/game/data.js';
import { createOutfittingState, OUTFIT_ITEMS } from '../../src/game/outfitting.js';
import {
    createMultiplayerMatch, MULTIPLAYER_DEATH_CREDITS, MULTIPLAYER_STARTER_IDS,
} from '../../src/game/multiplayer/matchRules.js';

const HOST = 'host';
const GUEST = 'guest';

function twoPilotMatch(settings) {
    const match = createMultiplayerMatch({ hostId: HOST, hostName: ' Host ', settings });
    assert.equal(match.addPlayer(GUEST, 'Guest').ok, true);
    return match;
}

test('only the host configures the lobby and each pilot can select a stock Tier 1 hull', () => {
    const match = createMultiplayerMatch({ hostId: HOST, hostName: ' \nHost ' });
    assert.equal(match.snapshot().players[0].name, 'Host');
    assert.equal(match.start(HOST).code, 'not-enough-pilots');
    assert.equal(match.addPlayer(GUEST).ok, true);
    assert.equal(match.addPlayer(GUEST).code, 'already-joined');
    assert.equal(match.configure(GUEST, { durationMinutes: 10 }).code, 'host-only');
    assert.equal(match.configure(HOST, { mode: 'teams', siteId: 'constructor' }).code, 'invalid-settings');
    assert.equal(match.configure(HOST, { friendlyFire: 1 }).code, 'invalid-settings');
    assert.equal(match.configure(HOST, { durationMinutes: 7 }).code, 'invalid-settings');
    assert.equal(match.snapshot().settings.mode, 'ffa');
    for (const siteId of ARENA_SITE_IDS) assert.equal(match.configure(HOST, { siteId }).ok, true);
    assert.equal(match.configure(HOST, { durationMinutes: 10 }).ok, true);
    assert.equal(match.addPlayer('guest-2').ok, true);
    assert.equal(match.addPlayer('guest-3').ok, true);
    assert.equal(match.addPlayer('guest-4').code, 'lobby-full');
    assert.equal(match.selectStarter(GUEST, 'talon').code, 'invalid-starter');
    const hestiaPoints = match.snapshot().players.find(pilot => pilot.id === GUEST).pointsPerKill;
    match.selectStarter(GUEST, 'scrapper');
    const balorPoints = match.snapshot().players.find(pilot => pilot.id === GUEST).pointsPerKill;
    assert.ok(hestiaPoints > balorPoints);
    for (const shipId of MULTIPLAYER_STARTER_IDS) assert.equal(match.selectStarter(GUEST, shipId).ok, true);
    assert.equal(match.start(GUEST).code, 'host-only');
    const { actors } = match.start(HOST);
    const actor = actors.find(actor => actor.id === GUEST);
    assert.equal(actors.length, 4);
    assert.equal(actor.shipId, 'speedster');
    assert.deepEqual(actor.outfitting, createOutfittingState(['speedster']));
    assert.equal(actor.hull, SHIPS.speedster.hull);
    assert.equal(actor, match.players.get(GUEST).actor);
    assert.equal(match.snapshot().remainingSeconds, 600);
    assert.equal(match.snapshot().canStart, false);
    assert.equal(match.addPlayer('late').code, 'lobby-closed');
    assert.equal(match.selectStarter(GUEST, 'wayfarer').code, 'lobby-closed');
    assert.equal(match.configure(HOST, { siteId: 'verge-lanes' }).code, 'lobby-closed');
});

test('each death grants credits once and weighted kill points stay banked when a pilot upgrades', () => {
    const match = twoPilotMatch();
    const { actors: [host, guest] } = match.start(HOST);
    const { pointsPerKill: startingPoints } = match.snapshot().players[0];
    assert.equal(match.shopFor(HOST), null);
    assert.equal(match.buyEquipment(HOST, 'shield-mk2', 'utility', 0).code, 'shop-closed');
    assert.equal(match.respawn(HOST).code, 'respawn-unavailable');
    const firstKill = match.recordDeath(GUEST, HOST, { victimLife: guest.life });
    assert.equal(firstKill.actor, guest);
    assert.equal(firstKill.points, startingPoints);
    assert.equal(firstKill.credits, MULTIPLAYER_DEATH_CREDITS);
    assert.equal(match.recordDeath(GUEST, HOST).code, 'stale-life');
    assert.equal(match.respawn(GUEST).actor.life, 2);
    assert.equal(match.recordDeath(GUEST, HOST, { victimLife: guest.life }).code, 'stale-life');
    assert.equal(match.recordDeath(HOST, GUEST).actor, host);
    const item = match.shopFor(HOST).equipment.find(offer => offer.id === 'shield-mk2');
    assert.ok(item.affordable);
    const preview = item.slots.find(slot => slot.index === 0);
    assert.ok(preview.pointsPerKill < startingPoints);
    assert.equal(match.buyEquipment(HOST, item.id, 'guns', 0).code, 'incompatible-mount');
    assert.equal(match.buyEquipment(HOST, item.id, 'utility', -1).code, 'incompatible-mount');
    assert.equal(match.players.get(HOST).credits, MULTIPLAYER_DEATH_CREDITS);
    const purchase = match.buyEquipment(HOST, item.id, preview.slot, preview.index);
    assert.equal(purchase.pointsPerKill, preview.pointsPerKill);
    assert.equal(purchase.credits, MULTIPLAYER_DEATH_CREDITS - item.price);
    assert.equal(match.players.get(HOST).score, startingPoints);
    assert.equal(match.buyEquipment(HOST, item.id, preview.slot, preview.index).code, 'already-equipped');
    const upgraded = match.respawn(HOST).actor;
    assert.notEqual(upgraded, host);
    assert.equal(upgraded.shield, host.shield + 60);
    assert.equal(upgraded.hull, host.hull);
    assert.equal(upgraded.missiles, host.missiles);
    assert.equal(match.recordDeath(GUEST, HOST).points, preview.pointsPerKill);
    assert.equal(match.players.get(HOST).score, startingPoints + preview.pointsPerKill);

    match.respawn(GUEST);
    assert.equal(match.recordDeath(GUEST, HOST, { killerLife: host.life }).points, startingPoints);
    assert.equal(match.players.get(HOST).score, 2 * startingPoints + preview.pointsPerKill);
    assert.equal(match.players.get(HOST).credits, purchase.credits);
});

test('the shop fits only matching equipment tiers and keeps paid hulls and gear between lives', () => {
    const match = twoPilotMatch();
    match.start(HOST);
    match.recordDeath(HOST, GUEST);
    const firstShop = match.shopFor(HOST);
    assert.deepEqual(new Set(firstShop.hulls.map(hull => hull.tier)), new Set([1, 2, 3]));
    assert.ok(firstShop.equipment.every(item => item.tier === 1));
    assert.equal(match.buyHull(HOST, 'talon').code, 'insufficient-credits');
    assert.equal(match.buyEquipment(HOST, 'pvp-pulse-cannon-t2', 'guns', 0).code, 'wrong-tier');
    assert.equal(match.buyEquipment(HOST, 'fire-control', 'utility', 0).ok, true);
    match.respawn(HOST);
    for (let i = 0; i < 2; i++) {
        match.recordDeath(HOST, GUEST);
        match.respawn(HOST);
    }
    match.recordDeath(HOST, GUEST);
    const { price, pointsPerKill } = match.shopFor(HOST).hulls.find(hull => hull.id === 'talon');
    const before = match.players.get(HOST).credits;
    const bought = match.buyHull(HOST, 'talon');
    assert.equal(bought.credits, before - price);
    assert.equal(bought.pointsPerKill, pointsPerKill);
    assert.ok(match.shopFor(HOST).equipment.every(item => item.tier === 2));
    assert.equal(match.buyEquipment(HOST, 'shield-mk2', 'utility', 0).code, 'wrong-tier');
    const upgrade = match.shopFor(HOST).equipment.find(item => item.id === 'pvp-capacitor-bank-t2');
    assert.equal(match.buyEquipment(HOST, upgrade.id, 'utility', 0).ok, true);
    const { actor } = match.respawn(HOST);
    assert.ok(actor.energy > SHIPS.talon.energyCapacity);
    const fitted = actor.outfitting.loadouts.talon;
    assert.ok([...fitted.guns, ...fitted.launchers, fitted.utility[0]].every(id => OUTFIT_ITEMS[id].tier === 2));
    match.recordDeath(HOST, GUEST);
    const afterDeath = match.players.get(HOST).credits;
    assert.equal(match.buyHull(HOST, 'wayfarer').price, 0);
    assert.equal(match.players.get(HOST).outfitting.loadouts.wayfarer.utility[0], 'fire-control');
    assert.equal(match.buyHull(HOST, 'talon').price, 0);
    assert.equal(match.players.get(HOST).credits, afterDeath);
    assert.equal(match.respawn(HOST).actor.outfitting.loadouts.talon.utility[0], upgrade.id);
});

test('displaced purchases become counted spares shared across hulls, while stock stays hull-bound', () => {
    const match = twoPilotMatch();
    match.start(HOST);
    const { points: banked } = match.recordDeath(GUEST, HOST);
    match.respawn(GUEST);
    for (let life = 1; life <= 3; life++) {
        match.recordDeath(HOST, GUEST);
        if (life < 3) match.respawn(HOST);
    }
    for (const index of [0, 1]) assert.ok(match.buyEquipment(HOST, 'ripper', 'guns', index).price > 0);
    for (const index of [0, 1]) assert.ok(match.buyEquipment(HOST, 'gauss-cannon', 'guns', index).price > 0);
    const offer = id => match.shopFor(HOST).equipment.find(item => item.id === id);
    assert.equal(offer('beam-emitter').spares, 0);
    assert.ok(offer('beam-emitter').price > 0);
    assert.equal(offer('ripper').spares, 2);
    assert.equal(offer('ripper').price, 0);

    for (let life = 1; life <= 3; life++) {
        match.respawn(HOST);
        match.recordDeath(HOST, GUEST);
    }
    assert.equal(match.buyHull(HOST, 'talon').ok, true);
    assert.equal(offer('ripper'), undefined);
    assert.equal(match.buyEquipment(HOST, 'ripper', 'guns', 0).code, 'wrong-tier');
    assert.equal(match.buyHull(HOST, 'scrapper').ok, true);

    const credits = match.players.get(HOST).credits;
    for (const index of [0, 1]) {
        const next = offer('ripper');
        assert.equal(next.spares, 2 - index);
        assert.equal(next.affordable, true);
        const expected = next.slots.find(slot => slot.index === index).pointsPerKill;
        const purchase = match.buyEquipment(HOST, 'ripper', 'guns', index);
        assert.equal(purchase.price, 0);
        assert.equal(purchase.credits, credits);
        assert.equal(purchase.pointsPerKill, expected);
    }
    assert.equal(offer('ripper').spares, 0);
    assert.equal(offer('ripper').price, offer('ripper').retailPrice);
    assert.equal(offer('ripper').affordable, false);
    assert.equal(match.buyEquipment(HOST, 'ripper', 'guns', 2).code, 'insufficient-credits');
    assert.ok(offer('pulse-cannon').price > 0);
    assert.equal(match.players.get(HOST).score, banked);
    assert.deepEqual(match.respawn(HOST).actor.outfitting.loadouts.scrapper.guns,
        ['ripper', 'ripper', 'pulse-cannon', 'pulse-cannon']);
});

test('2v2 requires two pilots on each team and never awards friendly or self kills', () => {
    const match = twoPilotMatch({ mode: 'teams' });
    assert.equal(match.start(HOST).code, 'not-enough-pilots');
    match.addPlayer('wing');
    assert.equal(match.start(HOST).code, 'not-enough-pilots');
    match.addPlayer('opponent');
    assert.equal(match.setTeam('wing', 'blue').code, 'team-full');
    assert.equal(match.setTeam('wing', null).ok, true);
    assert.equal(match.start(HOST).code, 'not-enough-pilots');
    assert.equal(match.setTeam('wing', 'red').ok, true);
    match.start(HOST);
    assert.equal(match.canDamage(HOST, 'wing'), false);
    assert.equal(match.canDamage(HOST, GUEST), true);
    match.tick(300);
    match.returnToLobby(HOST);
    match.configure(HOST, { friendlyFire: true });
    match.start(HOST);
    const { pointsPerKill: startingPoints } = match.snapshot().players[0];
    assert.equal(match.canDamage(HOST, 'wing'), true);
    assert.equal(match.canDamage(HOST, HOST), false);
    assert.equal(match.recordDeath(HOST, HOST).points, 0);
    match.respawn(HOST);
    assert.equal(match.recordDeath('wing', HOST).killerId, null);
    assert.equal(match.players.get('wing').credits, MULTIPLAYER_DEATH_CREDITS);
    match.respawn('wing');
    assert.equal(match.recordDeath(GUEST, HOST).points, startingPoints);
    assert.equal(match.recordDeath('opponent', 'wing').points, startingPoints);
    assert.equal(match.snapshot().standings.teams[0].score, 2 * startingPoints);
    assert.equal(match.snapshot().standings.teams[1].score, 0);
    assert.equal(match.tick(299.5), false);
    assert.equal(match.tick(0.5), true);
    assert.deepEqual(match.snapshot().result, { reason: 'time', winnerIds: [], winnerTeams: ['red'] });
});

test('round timing, departures and rematch reset are host-owned and scoped to the current round', () => {
    const match = twoPilotMatch({ durationMinutes: 10 });
    match.selectStarter(HOST, 'scrapper');
    match.addPlayer('other');
    match.start(HOST);
    assert.equal(match.tick(NaN), false);
    assert.equal(match.tick(599), false);
    assert.equal(match.snapshot().remainingSeconds, 1);
    match.recordDeath(HOST, GUEST);
    match.recordDeath(GUEST, 'other');
    assert.equal(match.removePlayer('other').ok, true);
    assert.equal(match.phase, 'playing');
    assert.equal(match.players.get('other').actor, null);
    assert.equal(match.canDamage('other', GUEST), false);
    assert.equal(match.removePlayer(GUEST).ok, true);
    assert.equal(match.phase, 'ended');
    assert.deepEqual(match.snapshot().result, { reason: 'players-left', winnerIds: [HOST], winnerTeams: [] });
    assert.equal(match.recordDeath(HOST, GUEST).code, 'round-inactive');
    assert.equal(match.shopFor(HOST), null);
    assert.equal(match.returnToLobby(GUEST).code, 'host-only');
    assert.equal(match.returnToLobby(HOST).ok, true);
    assert.deepEqual(match.snapshot().players.map(pilot => pilot.id), [HOST]);
    assert.equal(match.snapshot().players[0].shipId, 'scrapper');
    assert.equal(match.snapshot().players[0].credits, 0);
    assert.equal(match.snapshot().players[0].deaths, 0);
    match.addPlayer(GUEST);
    match.start(HOST);
    assert.equal(match.snapshot().round, 2);
    assert.equal(match.recordDeath(HOST, GUEST, { round: 1 }).code, 'stale-life');
    assert.equal(match.tick(600), true);
    assert.deepEqual(match.snapshot().result, { reason: 'time', winnerIds: [HOST, GUEST], winnerTeams: [] });
    assert.equal(match.removePlayer(HOST).ok, true);
    assert.equal(match.phase, 'closed');
    assert.ok(match.snapshot().players.every(pilot => !pilot.connected));
    assert.equal(match.addPlayer('late').code, 'lobby-closed');
});
