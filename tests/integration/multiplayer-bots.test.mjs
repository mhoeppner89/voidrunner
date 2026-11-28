import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA_SITE_IDS } from '../../src/game/arenaSites.js';
import { npcGunneryProfile } from '../../src/game/npcGunnery.js';
import { BOT_CHARACTERS } from '../../src/game/multiplayer/botProfiles.js';
import { BOT_REFIT_SECONDS } from '../../src/game/multiplayer/matchBots.js';
import { createMultiplayerMatch, MULTIPLAYER_DEATH_CREDITS } from '../../src/game/multiplayer/matchRules.js';
import { fireMatchRound } from '../../src/game/multiplayer/matchProjectiles.js';
import { MATCH_STEP, MatchWorld } from '../../src/game/multiplayer/matchWorld.js';
import { SHIPS } from '../../src/game/data.js';
import { WEAPONS } from '../../src/game/weapons.js';
import { Vector3 } from 'three';
import { fieldWorld } from '../helpers/field-world.mjs';
import { finishMatchDeployment } from '../helpers/multiplayer.mjs';

const noop = () => {};
const botIds = Object.keys(BOT_CHARACTERS);
const openSession = () => ({ save: { player: { position: [0, 0, 0] }, world: {} }, renderer: { updateWorld: noop }, siteSpotClear: () => true });

function startWorld({ seed = 718, siteId, session = openSession(), bots = botIds, difficulty = 'veteran', mode = 'ffa', publish = noop } = {}) {
    const match = createMultiplayerMatch({ hostId: 'host', seed, settings: { mode, ...(siteId && { siteId }) } });
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
    assert.equal(match.fillBotSeats('guest').code, 'host-only');
    assert.ok(match.fillBotSeats('host').ok);
    assert.equal(match.snapshot().players.find(pilot => pilot.id === 'bot:brick').bot.difficulty, 'ace');
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
    const maneuvers = new Set();
    for (const siteId of ARENA_SITE_IDS) {
        session.stageArenaSite(siteId);
        const world = startWorld({ session, siteId });
        const shooters = new Set(), hits = new Set();
        for (let i = 0; i < 5400; i++) {
            world.step();
            for (const { actor } of world.bots.values()) if (actor.aceMove?.kind) maneuvers.add(actor.aceMove.kind);
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
    for (const kind of ['climbing-turn', 'drift-pass', 'break-turn'])
        assert.ok(maneuvers.has(kind), `bots use the shared ${kind} under live combat`);
});

test('bot skill uses the Arena burst profile and reaction delay under incoming fire', () => {
    const delays = [];
    for (const difficulty of ['novice', 'veteran', 'ace']) {
        const world = startWorld({ bots: ['brick'], difficulty });
        finishMatchDeployment(world);
        const shooter = world.match.players.get('host').actor;
        const target = world.match.players.get('bot:brick').actor;
        shooter.position.splice(0, 3, 0, 0, 220);
        target.position.fill(0);
        target.rotation.splice(0, 4, 0, 1, 0, 0);
        assert.equal(npcGunneryProfile(target), npcGunneryProfile({ pilot: { tier: difficulty } }));
        fireMatchRound(world.combat, shooter, WEAPONS.pulse, 'test-gun', new Vector3(0, 0, 180), new Vector3(0, 0, -1), target, { damage: 140 });
        world.step();
        assert.equal(target.combatThreatId, 'host', `${difficulty} detects the incoming projectile`);
        assert.equal(target.shield, target.maxShield, 'the reaction starts before impact');
        delays.push(Number((target.evasiveLatencyUntil - world.tick * MATCH_STEP).toFixed(2)));
    }
    assert.deepEqual(delays, [.3, .18, .1]);
});

test('2v2 bot wingmen split pressure and flank roles against the same visible opponent', () => {
    const world = startWorld({ mode: 'teams' });
    finishMatchDeployment(world);
    const host = world.match.players.get('host').actor;
    const wing = world.actors().find(actor => actor.id !== host.id && actor.team === host.team);
    const [lead, flank] = world.actors().filter(actor => actor.team !== host.team);
    host.position.splice(0, 3, 0, 0, -350);
    wing.position.splice(0, 3, 0, 0, -900);
    lead.position.fill(0);
    flank.position.splice(0, 3, 60, 0, 30);
    for (const bot of [lead, flank]) bot.rotation.splice(0, 4, 0, 0, 0, 1);
    for (let i = 0; i < 65; i++) world.step();
    assert.equal(lead.targetId, host.id);
    assert.equal(flank.targetId, host.id);
    const wingPlans = [lead.combatPlan, flank.combatPlan];
    assert.deepEqual(wingPlans.map(plan => plan.teamRole).sort(), ['flank', 'pressure']);
    assert.ok(wingPlans.find(plan => plan.teamRole === 'flank').offset.length() > 0);
});

test('an occluded opponent leaves a last sighting for pursuit and loses the bot’s weapon lock', () => {
    const world = startWorld({ bots: ['brick'] });
    finishMatchDeployment(world);
    const host = world.match.players.get('host').actor;
    const bot = world.bots.get('bot:brick');
    host.position.splice(0, 3, 0, 0, -350);
    bot.actor.position.fill(0);
    bot.actor.rotation.splice(0, 4, 0, 0, 0, 1);
    world.botEnvironment.lineBlocked = (from, to) => to.x >= 500;
    world.step();
    assert.equal(bot.actor.targetId, host.id);
    const seen = bot.lastSeen.toArray();
    host.position[0] = 600;
    for (let i = 0; i < 30; i++) world.step();
    assert.equal(bot.actor.patrolMemoryActive, true);
    assert.deepEqual(bot.lastSeen.toArray(), seen);
    assert.equal(bot.command.targetId, null);
    assert.equal(bot.command.fire, false);
    assert.equal(bot.actor.lockProgress, 0);
    host.position[0] = 0;
    for (let i = 0; i < 30; i++) world.step();
    assert.equal(bot.actor.patrolMemoryActive, false);
    assert.equal(bot.actor.targetId, host.id);
});
