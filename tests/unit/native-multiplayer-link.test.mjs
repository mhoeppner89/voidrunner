import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativeLink, nativeBridgeAvailable } from '../../src/game/multiplayer/nativeLink.js';

function fixture(role) {
    const sent = [];
    const events = [];
    const target = { VoidrunnerNative: { postMessage: message => sent.push(JSON.parse(message)) } };
    const link = new NativeLink({
        target, role,
        onRooms: rooms => events.push(['rooms', rooms]),
        onHosting: () => events.push(['hosting']),
        onOpen: id => events.push(['open', id]),
        onMessage: (id, data) => events.push(['message', id, data]),
        onClose: (id, reason) => events.push(['close', id, reason]),
        onError: error => events.push(['error', error.code]),
    });
    const receive = args => target.__voidrunnerNativeReceive(JSON.stringify({ session: link.session, ...args }));
    return { link, target, sent, events, receive };
}

test('installed pilots browse and join in the same native session', () => {
    const { link, target, sent, events, receive } = fixture('guest');
    assert.equal(nativeBridgeAvailable(target), true);
    assert.equal(nativeBridgeAvailable({}), false);
    assert.equal(link.browse(), true);
    receive({ type: 'rooms', rooms: [{ id: 'b', name: 'Loki' }, { id: 'a', name: 'Balor' }, { id: null, name: 'Invalid' }] });
    assert.deepEqual(events[0], ['rooms', [{ id: 'a', name: 'Balor' }, { id: 'b', name: 'Loki' }]]);
    assert.equal(link.join('b'), true);
    receive({ session: 'old', type: 'open', peerId: 'host' });
    assert.deepEqual(link.peerIds, []);
    receive({ type: 'open', peerId: 'host' });
    assert.equal(link.send('host', { v: 1, type: 'hello' }), true);
    assert.deepEqual(sent.map(packet => packet.type), ['browse', 'join', 'send']);
    assert.ok(sent.every(packet => packet.session === link.session));
    assert.deepEqual(JSON.parse(sent[2].payload), { v: 1, type: 'hello' });
    receive({ type: 'message', peerId: 'host', payload: '{"v":1,"type":"state"}' });
    assert.deepEqual(events.at(-1), ['message', 'host', { v: 1, type: 'state' }]);
    link.close();
    assert.equal(sent.at(-1).type, 'close');
    assert.equal(target.__voidrunnerNativeReceive, undefined);
});

test('a native host withdraws discovery without dropping peers and caps occupancy', () => {
    const { link, sent, events, receive } = fixture('host');
    link.host('Mac');
    receive({ type: 'hosting' });
    for (const peerId of ['a', 'b', 'c', 'd']) receive({ type: 'open', peerId });
    assert.deepEqual(link.peerIds, ['a', 'b', 'c']);
    assert.deepEqual(sent.at(-1), { session: link.session, type: 'disconnect', peerId: 'd' });
    link.setVisibility(false);
    link.setVisibility(false);
    assert.deepEqual(sent.slice(-1).map(packet => [packet.type, packet.visible]), [['visibility', false]]);
    link.broadcast({ v: 1, type: 'world' }, { latest: true });
    assert.deepEqual(sent.slice(-3).map(packet => [packet.peerId, packet.latest]), [['a', true], ['b', true], ['c', true]]);
    receive({ type: 'close', peerId: 'b', reason: 'Left' });
    assert.deepEqual(events.at(-1), ['close', 'b', 'Left']);
    assert.deepEqual(link.peerIds, ['a', 'c']);
    receive({ type: 'message', peerId: 'a', payload: 'null' });
    assert.equal(sent.at(-1).type, 'disconnect');
});
