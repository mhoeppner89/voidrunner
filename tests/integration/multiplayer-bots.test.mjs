import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA_SITE_IDS } from '../../src/game/arenaSites.js';
import { BOT_CHARACTERS } from '../../src/game/multiplayer/botProfiles.js';
import { BOT_REFIT_SECONDS } from '../../src/game/multiplayer/matchBots.js';
import { createMultiplayerMatch, MULTIPLAYER_DEATH_CREDITS } from '../../src/game/multiplayer/matchRules.js';
import { MATCH_STEP, MatchWorld } from '../../src/game/multiplayer/matchWorld.js';
import { SHIPS } from '../../src/game/data.js';
import { fieldWorld } from '../helpers/field-world.mjs';

const noop = () => {};
const botIds = Object.keys(BOT_CHARACTERS);
const openSession = () => ({ save: { player: { position: [0, 0, 0] }, world: {} }, renderer: { updateWorld: noop }, siteSpotClear: () => true });

function startWorld({ seed = 718, siteId, session = openSession(), bots = botIds, difficulty = 'veteran', publish = noop } = {}) {
    const match = createMultiplayerMatch({ hostId: 'host', seed, settings: siteId ? { siteId } : {} });
    for (const id of bots) {
        assert.ok(match.addBot('host', id).ok);
        assert.ok(match.setBotDifficulty('host', `bot:${id}`, difficulty).ok);
    }
    assert.ok(match.confirmStarter('host').ok);
    assert.ok(match.start('host').ok);
    const world = new MatchWorld(match, session, noop, publish);
    for (const actor of world.actors()) assert.ok(world.spawn(actor));
    return world;
}

test('only the host changes bots, which use ordinary seats and start confirmed', () => {
    const match = createMultiplayerMatch({ hostId: 'host' });
    assert.equal(match.addPlayer('bot:brick', 'Intruder').code, 'invalid-player');
    assert.equal(match.addBot('guest', 'brick').code, 'host-only');
    assert.equal(match.addBot('host', 'constructor').code, 'unknown-bot');
    assert.ok(match.addBot('host', 'brick').ok);
    assert.equal(match.addBot('host', 'brick').code, 'already-joined');
    assert.equal(match.setBotDifficulty('guest', 'bot:brick', 'ace').code, 'host-only');
    assert.equal(match.removeBot('guest', 'bot:brick').code, 'host-only');
    assert.equal(match.setBotDifficulty('host', 'bot:brick', 'god').code, 'unknown-bot');
    assert.ok(match.setBotDifficulty('host', 'bot:brick', 'ace').ok);
    assert.equal(match.start('host').code, 'loadouts-not-ready');
    assert.ok(match.confirmStarter('host').ok);
    assert.ok(match.canStart(), 'one human can play free-for-all');
    assert.ok(match.configure('host', { mode: 'teams' }).ok);
    assert.equal(match.canStart(), false);
    assert.ok(match.addBot('host', 'latch').ok);
    assert.ok(match.addBot('host', 'wisp').ok);
    assert.deepEqual(match.connectedHumans().map(pilot => pilot.id), ['host']);
    assert.equal(match.addPlayer('guest').code, 'lobby-full');
    assert.ok(match.canStart(), 'one human and three bots can play 2v2');
    assert.ok(match.removeBot('host', 'bot:latch').ok);
    assert.ok(match.addPlayer('guest').ok);
    assert.equal(match.canStart(), false);
    assert.ok(match.confirmStarter('guest').ok);
    assert.ok(match.start('host').ok);
    assert.equal(match.removeBot('host', 'bot:brick').code, 'lobby-closed');
    assert.ok(match.removePlayer('guest').ok);
    assert.equal(match.phase, 'playing', 'the host can finish against bots when the other human leaves');
    match.tick(300);
    assert.ok(match.returnToLobby('host').ok);
    const brick = match.snapshot().players.find(pilot => pilot.id === 'bot:brick');
    assert.equal(brick.bot.difficulty, 'ace');
    assert.equal(brick.starterReady, true);
    assert.equal(match.snapshot().players[0].starterReady, false);
});

test('every bot spends death credits on its own equipment and hull path and waits before relaunch', () => {
    for (const id of botIds) {
        const forced = [];
        const world = startWorld({ bots: [id], publish: force => forced.push(force) });
        const pilot = world.match.players.get(`bot:${id}`);
        const boughtHulls = [pilot.shipId];
        const points = pilot.pointsByLife[1];
        const frames = Math.round(BOT_REFIT_SECONDS / MATCH_STEP);
        for (let death = 1; death <= 12; death++) {
            const old = pilot.actor;
            const credits = pilot.credits;
            world.recordDeath(pilot.id, 'host', old.life);
            assert.equal(pilot.credits, credits + MULTIPLAYER_DEATH_CREDITS);
            for (let i = 0; i < frames - 1; i++) world.advance(MATCH_STEP);
            assert.equal(pilot.alive, false);
            world.advance(MATCH_STEP);
            assert.equal(pilot.alive, true);
            assert.equal(pilot.life, death + 1);
            assert.ok(pilot.credits >= 0 && pilot.credits <= credits + MULTIPLAYER_DEATH_CREDITS);
            if (pilot.shipId !== boughtHulls.at(-1)) boughtHulls.push(pilot.shipId);
            assert.notEqual(pilot.actor, old);
            assert.ok(pilot.actor.position.every(Number.isFinite));
            if (death === 1) {
                assert.ok(pilot.paidMounts.size > 0 && pilot.credits < MULTIPLAYER_DEATH_CREDITS);
                assert.ok(pilot.pointsByLife[2] < points);
            }
            if (SHIPS[pilot.shipId].tier === 3) break;
        }
        assert.deepEqual(boughtHulls, [BOT_CHARACTERS[id].starterShipId, ...BOT_CHARACTERS[id].hulls]);
        assert.ok(forced.includes(true), 'a bot relaunch refreshes the roster');
    }
});

test('bots in all Arena sites fly, shoot and land hits with ordinary weapons', () => {
    const session = fieldWorld(718);
    session.renderer.updateWorld = noop;
    for (const siteId of ARENA_SITE_IDS) {
        session.stageArenaSite(siteId);
        const world = startWorld({ session, siteId });
        const shooters = new Set(), hits = new Set();
        for (let i = 0; i < 2400; i++) {
            world.step();
            for (const event of world.events.splice(0)) {
                if (event.type === 'shot' || event.type === 'beam') shooters.add(event.ownerId);
                if (event.type === 'hit' && event.ownerId) hits.add(event.ownerId);
            }
        }
        for (const id of botIds) {
            assert.ok(shooters.has(`bot:${id}`), `${id} fired at ${siteId}`);
            assert.ok(hits.has(`bot:${id}`), `${id} landed hits at ${siteId}`);
        }
    }
});

test('setting difficulty changes how quickly the same bot can damage a stationary pilot', () => {
    const results = [];
    for (const difficulty of ['novice', 'veteran', 'ace']) {
        const world = startWorld({ bots: ['brick'], difficulty });
        const target = world.match.players.get('host');
        let firstDamage = Infinity;
        for (let i = 0; i < 1700 && firstDamage === Infinity; i++) {
            world.step();
            if (world.events.some(event => event.type === 'hit' && event.targetId === target.id && event.ownerId === 'bot:brick'))
                firstDamage = world.tick;
            world.events.length = 0;
        }
        assert.ok(Number.isFinite(firstDamage), `${difficulty} is capable of hitting`);
        results.push(firstDamage);
    }
    assert.ok(results[2] <= results[1] && results[1] < results[0], `opening hit ticks ${results}`);
});
