import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeLink } from '../../src/game/multiplayer/nativeLink.js';
import { PeerLink } from '../../src/game/multiplayer/peerLink.js';
import { receivePacket } from '../../src/game/multiplayer/peerPacket.js';

for (const transport of ['browser', 'native']) {
    test(transport + ' sends one encoded world snapshot to three guests', () => {
        const ids = ['a', 'b', 'c'];
        const received = new Map();
        let link;
        if (transport === 'browser') {
            link = Object.create(PeerLink.prototype);
            link.peers = new Map(ids.map(id => {
                const peer = { partial: '', open: true, channel: { readyState: 'open', bufferedAmount: 0,
                    send(chunk) {
                        const message = receivePacket(peer, chunk);
                        if (message) received.set(id, message);
                    },
                } };
                return [id, peer];
            }));
        } else {
            const target = { VoidrunnerNative: { postMessage(text) {
                const message = JSON.parse(text);
                received.set(message.peerId, JSON.parse(message.payload));
            } } };
            link = new NativeLink({ role: 'host', target });
            for (const id of ids) link.peers.add(id);
        }
        let encodings = 0;
        const world = { tick: 60, actors: ids, projectiles: Array.from({ length: 240 }, (_, id) => ({
            id, position: [id, 123.5, -234.5], velocity: [0, 0, -500],
        })) };
        const packet = { type: 'world', snapshot: { toJSON() { encodings++; return world; } } };
        link.broadcast(packet, { latest: true });
        assert.equal(received.size, 3);
        for (const message of received.values()) assert.deepEqual(message, { type: 'world', snapshot: world });
        assert.equal(encodings, 1);
        if (transport === 'browser') {
            for (const peer of link.peers.values()) peer.channel.bufferedAmount = 50 * 1024;
            link.broadcast(packet, { latest: true });
            assert.equal(encodings, 1, 'skip encoding if all three channels are busy');
        }
    });
}
