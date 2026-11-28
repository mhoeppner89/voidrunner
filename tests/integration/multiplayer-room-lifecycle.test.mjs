import assert from 'node:assert/strict';
import { startWithConfirmedLoadouts } from '../helpers/multiplayer.mjs';
import test from 'node:test';
import { createMultiplayerMatch } from '../../src/game/multiplayer/matchRules.js';
import { Multiplayer } from '../../src/game/multiplayer/multiplayer.js';

function host(ids) {
    const match = createMultiplayerMatch({ hostId: 'host' });
    for (const id of ids) assert.ok(match.addPlayer(id, id).ok);
    return Object.assign(Object.create(Multiplayer.prototype), {
        host: true, localId: 'host', match, screen: 'lobby', state: match.snapshot(),
        link: { peerIds: [...ids], send() {}, broadcast() {} },
        render() {}, view: { panel: { classList: { contains: () => true } } },
    });
}

test('disconnecting during a four-pilot roster update keeps the seat open on every remaining screen', () => {
    const room = host(['a', 'b', 'c']);
    const lastState = new Map();
    room.link.send = (id, message) => {
        if (id === 'b') {
            room.link.peerIds = ['a', 'c'];
            room.disconnected('b', 'Peer left the session.');
        } else lastState.set(id, message.state);
    };
    room.distributeState();
    for (const state of [room.state, ...lastState.values()])
        assert.deepEqual(state.players.map(p => p.id), ['host', 'a', 'c']);
    room.link.peerIds.push('d');
    room.receive('d', { v: 3, type: 'hello', name: 'Replacement' });
    assert.equal(room.state.players.find(p => p.id === 'd').slot, 2);
    assert.equal(room.state.players.length, 4);
});

test('a round ending while the host loads disposes the late session and keeps the result', async () => {
    const room = host(['a']);
    startWithConfirmedLoadouts(room.match);
    room.state = room.match.snapshot();
    let finishLoad;
    room.startFlight = () => new Promise(resolve => { finishLoad = resolve; });
    const stopped = [];
    room.stopFlight = session => stopped.push(session);
    const loading = room.prepareRound(room.state);
    try {
        room.disconnected('a', 'Peer left the session.');
        assert.equal(room.screen, 'ended');
        const session = { save: { player: { position: [0, 0, 0] } }, siteSpotClear: () => true };
        finishLoad(session);
        await loading;
        assert.deepEqual(stopped, [session]);
        assert.equal(room.screen, 'ended');
        assert.equal(room.world, undefined);
        assert.equal(room.clock, undefined);
        assert.equal(room.loadTimeout, undefined);
    } finally {
        room.stopClock();
    }
});

test('a slow peer leaving on the opening snapshot does not restart an ended round clock', () => {
    const room = host(['a']);
    startWithConfirmedLoadouts(room.match);
    room.state = room.match.snapshot();
    room.screen = 'preparing';
    room.ready = new Set(['a']);
    room.flight = { setFitting() {}, updateSnapshot() {} };
    room.world = { snapshot: () => ({ tick: 0 }), fittingFor: () => ({ life: 1 }) };
    room.link.broadcast = () => {
        room.link.peerIds = [];
        room.disconnected('a', 'The connection could not keep up.');
    };
    try {
        room.markReady('host');
        assert.equal(room.screen, 'ended');
        assert.equal(room.live, false);
        assert.equal(room.clock, undefined);
    } finally {
        room.stopClock();
    }
});

test('a mixed room waits for human peers to load and sends fitting packets only to humans', () => {
    const room = host(['a']);
    assert.ok(room.match.addBot('host', 'brick').ok);
    assert.ok(startWithConfirmedLoadouts(room.match).ok);
    room.ready = new Set();
    room.world = {};
    const fits = [], published = [];
    room.sendFit = id => fits.push(id);
    room.publishWorld = force => published.push(force);
    try {
        room.markReady('host');
        assert.notEqual(room.live, true);
        assert.deepEqual(published, []);
        room.markReady('a');
        assert.equal(room.live, true);
        assert.deepEqual(fits, ['host', 'a']);
        assert.deepEqual(published, [true]);
    } finally {
        room.stopClock();
    }
});

test('a rematch requested during a cancelled load waits for a fresh session before declaring ready', async () => {
    const room = host(['a']);
    room.host = false;
    room.localId = 'a';
    startWithConfirmedLoadouts(room.match);
    room.state = room.match.snapshot();
    const messages = [];
    room.link.send = (id, message) => messages.push(message);
    const stopped = [];
    room.stopFlight = session => { if (session) stopped.push(session); };
    let active;
    const loads = [];
    room.startFlight = config => {
        if (active) return active;
        active = new Promise(resolve => loads.push({ config, resolve }));
        return active;
    };
    const firstLoad = room.prepareRound(room.state);
    room.match.finish('players-left');
    room.applyState(room.match.snapshot());
    room.match.returnToLobby('host');
    room.applyState(room.match.snapshot());
    assert.ok(startWithConfirmedLoadouts(room.match).ok);
    room.state = room.match.snapshot();
    const nextLoad = room.prepareRound(room.state);
    const firstSession = { save: { player: { position: [0, 0, 0] } } };
    loads[0].resolve(firstSession);
    active = undefined;
    await firstLoad;
    assert.deepEqual(stopped, [firstSession]);
    assert.equal(loads.length, 2);
    assert.equal(loads[1].config.multiplayer, room.flight);
    const nextSession = { save: { player: { position: [1, 0, 0] } } };
    loads[1].resolve(nextSession);
    await nextLoad;
    assert.equal(room.flight.session, nextSession);
    assert.deepEqual(messages.map(message => [message.type, message.round]), [['ready', 2]]);
});
