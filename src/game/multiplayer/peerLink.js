import {newToken, packSignal, unpackSignal, roomRequest, roomTokenFromUrl, TOKEN_PATTERN} from './peerSignal.js';
import {sendPacket, receivePacket} from './peerPacket.js';
export {roomTokenFromUrl} from './peerSignal.js';

const MAX_GUESTS = 3;
const SIGNAL_TTL = 300_000;
const POLL_MS = 700;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function collectIce(pc, type) {
    const description = type === 'offer' ? await pc.createOffer() : await pc.createAnswer();
    await pc.setLocalDescription(description);
    if (pc.iceGatheringState !== 'complete') {
        await new Promise(resolve => {
            const done = () => {
                clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange', changed);
                pc.removeEventListener('signalingstatechange', changed);
                resolve();
            };
            const changed = () => {
                if (pc.iceGatheringState === 'complete' || pc.signalingState === 'closed') done();
            };
            const timer = setTimeout(done, 6000);
            pc.addEventListener('icegatheringstatechange', changed);
            pc.addEventListener('signalingstatechange', changed);
            changed();
        });
    }
    if (pc.signalingState === 'closed') throw Error('Connection cancelled.');
    if (!/^a=candidate:/m.test(pc.localDescription?.sdp || ''))
        throw Error('No local network address was available. Check local network access and try again.');
    return pc.localDescription;
}

export class PeerLink {
    constructor({role, onOpen = () => {}, onMessage = () => {}, onClose = () => {},
        onError = () => {}, rtcConfig = {iceServers:[]}, endpoint = './multiplayer',
        pageUrl = globalThis.location?.href} = {}) {
        if (role !== 'host' && role !== 'guest') throw Error('Choose host or guest.');
        if (typeof RTCPeerConnection !== 'function') throw Error('WebRTC is unavailable in this browser. Try opening the game over HTTPS.');
        Object.assign(this, {role, onOpen, onMessage, onClose, onError, rtcConfig, pageUrl});
        this.endpoint = new URL(endpoint, pageUrl);
        if (this.endpoint.origin !== new URL(pageUrl).origin) throw Error('The room service must be on the game site.');
        this.peers = new Map();
        this.life = new AbortController();
        this.room = null;
    }

    get peerIds() {
        return [...this.peers].filter(([, p]) => p.open).map(([id]) => id);
    }

    requireRole(role) {
        if (this.life.signal.aborted) throw Error('This lobby has closed.');
        if (this.role !== role) throw Error('This action belongs to the ' + role + '.');
    }

    addPeer(id, signalId) {
        if (this.life.signal.aborted) throw Error('This lobby has closed.');
        if (this.peers.has(id)) throw Error('This connection already exists.');
        if (this.peers.size >= (this.role === 'host' ? MAX_GUESTS : 1))
            throw Error(this.role === 'host' ? 'All three guest seats are reserved.' : 'Leave the current connection before joining another.');
        const pc = new RTCPeerConnection(this.rtcConfig);
        // Both sides create stream 0. Either can make the offer and no in-band
        // channel announcement can arrive ahead of the guest's game handlers.
        let channel;
        try { channel = pc.createDataChannel('voidrunner-1', {negotiated:true, id:0, ordered:true}); }
        catch (error) { pc.close(); throw error; }
        const peer = {pc, channel, id, signalId, open:false, grace:0, partial:''};
        this.peers.set(id, peer);
        const lost = reason => { if (this.peers.get(id) === peer) this.disconnect(id, reason); };
        peer.deadline = setTimeout(() => lost('The connection timed out. Send a fresh invite.'), SIGNAL_TTL);
        channel.onopen = () => {
            if (this.peers.get(id) !== peer) return;
            clearTimeout(peer.deadline);
            peer.open = true;
            this.onOpen(id);
        };
        channel.onmessage = event => {
            let message;
            try { message = receivePacket(peer, event.data); } catch { return lost('Invalid game message.'); }
            if (message) this.onMessage(id, message);
        };
        channel.onclose = () => lost('Peer left the session.');
        channel.onerror = () => lost('The game connection failed.');
        pc.oniceconnectionstatechange = () => {
            clearTimeout(peer.grace);
            if (['failed','closed'].includes(pc.iceConnectionState)) lost('The direct connection failed. Check that both pilots are on the same Wi-Fi.');
            else if (pc.iceConnectionState === 'disconnected')
                peer.grace = setTimeout(() => lost('Peer lost the Wi-Fi connection.'), 8000);
        };
        return peer;
    }

    async makeOffer(id, signalId) {
        const peer = this.addPeer(id, signalId);
        try { return await packSignal(signalId, await collectIce(peer.pc, 'offer')); }
        catch (error) { this.disconnect(id, error.message); throw error; }
    }

    async makeAnswer(id, offer) {
        const peer = this.addPeer(id, offer.id);
        try {
            await peer.pc.setRemoteDescription(offer.description);
            return await packSignal(offer.id, await collectIce(peer.pc, 'answer'));
        } catch (error) { this.disconnect(id, error.message); throw error; }
    }

    async applyAnswer(id, answer) {
        const peer = this.peers.get(id);
        if (!peer || peer.signalId !== answer.id || peer.pc.signalingState !== 'have-local-offer')
            throw Error('This reply belongs to another invite or has already been used.');
        await peer.pc.setRemoteDescription(answer.description);
        if (!peer.open) {
            clearTimeout(peer.deadline);
            peer.deadline = setTimeout(() => this.disconnect(id, 'The direct connection timed out. Check the Wi-Fi network.'), 30_000);
        }
    }

    async createInvite() {
        this.requireRole('host');
        const id = newToken();
        return this.makeOffer(id, id);
    }

    async cancelInvite(code) {
        this.requireRole('host');
        const {id} = await unpackSignal(code, 'offer');
        if (this.peers.get(id)?.pc.signalingState === 'have-local-offer') this.disconnect(id, 'Invite cancelled.');
    }

    async acceptInvite(code) {
        this.requireRole('guest');
        return this.makeAnswer('host', await unpackSignal(code, 'offer'));
    }

    async acceptReply(code) {
        this.requireRole('host');
        const answer = await unpackSignal(code, 'answer');
        await this.applyAnswer(answer.id, answer);
    }

    request(body) { return roomRequest(this.endpoint, body, this.life.signal); }

    async openRoom() {
        this.requireRole('host');
        if (!this.room) {
            this.roomOpening ??= this.request({action:'create'}).then(room => {
                this.requireRole('host');
                this.room = room;
                void this.pollHost(room);
            }).finally(() => { this.roomOpening = null; });
            await this.roomOpening;
        }
        const url = new URL(this.pageUrl);
        url.hash = 'room=' + this.room.room;
        return url.href;
    }

    async pollHost(room) {
        const results = new Map();
        const auth = {room:room.room, key:room.key};
        let failures = 0;
        while (!this.life.signal.aborted && this.room === room) {
            try {
                const {offers} = await this.request({...auth, action:'poll'});
                const pending = new Set(offers.map(o => o.id));
                for (const id of results.keys()) if (!pending.has(id)) results.delete(id);
                for (const {id, offer} of offers) {
                    if (!results.has(id)) {
                        try {
                            const answer = await this.makeAnswer(id, await unpackSignal(offer, 'offer'));
                            results.set(id, {answer});
                        } catch (error) { results.set(id, {error:error.message}); }
                    }
                    try { await this.request({...auth, action:'answer', id, ...results.get(id)}); }
                    catch (error) {
                        if (error.status !== 409) throw error;
                        this.disconnect(id, 'Guest cancelled the connection.');
                    }
                }
                failures = 0;
            } catch (error) {
                if (this.life.signal.aborted || this.room !== room) return;
                if (error.status === 410 || error.status === 403) {
                    this.room = null;
                    this.onError(error);
                    return;
                }
                if (++failures === 3) this.onError(error);
            }
            await sleep(failures ? 2000 : POLL_MS);
        }
    }

    async joinRoom(value) {
        this.requireRole('guest');
        const room = TOKEN_PATTERN.test(value) ? value : roomTokenFromUrl(value);
        if (!room) throw Error('This room link is incomplete.');
        const signalId = newToken();
        const offer = await this.makeOffer('host', signalId);
        const peer = this.peers.get('host');
        let auth;
        try {
            const joined = await this.request({action:'join', room, offer});
            auth = {room, id:joined.id, key:joined.key};
            const deadline = Date.now() + 45_000;
            while (Date.now() < deadline && this.peers.get('host') === peer) {
                const result = await this.request({...auth, action:'read'});
                if (result.error) throw Error(result.error);
                if (result.answer) {
                    await this.applyAnswer('host', await unpackSignal(result.answer, 'answer'));
                    return;
                }
                await sleep(POLL_MS);
            }
            throw Error('The host did not answer. Ask them to reopen the lobby.');
        } catch (error) {
            if (this.peers.get('host') === peer) this.disconnect('host', error.message);
            throw error;
        } finally {
            if (auth) void roomRequest(this.endpoint, {...auth, action:'finish'}).catch(() => {});
        }
    }

    send(id, message, {latest = false} = {}, encode = JSON.stringify) {
        const peer = this.peers.get(id);
        if (!peer?.open || peer.channel.readyState !== 'open') return false;
        if (latest && peer.channel.bufferedAmount > 32 * 1024) return false;
        if (peer.channel.bufferedAmount > 512 * 1024) {
            this.disconnect(id, 'The connection could not keep up.');
            return false;
        }
        try {
            sendPacket(peer.channel, encode(message));
            return true;
        } catch (error) {
            this.disconnect(id, error.message);
            return false;
        }
    }

    broadcast(message, options) {
        let text;
        const encode = () => text ??= JSON.stringify(message);
        for (const [id, peer] of this.peers) if (peer.open) this.send(id, message, options, encode);
    }

    disconnect(id, reason = 'Peer left the session.') {
        const peer = this.peers.get(id);
        if (!peer) return;
        this.peers.delete(id);
        clearTimeout(peer.deadline);
        clearTimeout(peer.grace);
        peer.channel.onclose = peer.channel.onopen = peer.channel.onerror = peer.channel.onmessage = null;
        peer.pc.oniceconnectionstatechange = null;
        peer.channel.close();
        peer.pc.close();
        this.onClose(id, reason);
    }

    close() {
        if (this.life.signal.aborted) return;
        this.life.abort();
        if (this.room) {
            const {room, key} = this.room;
            this.room = null;
            void roomRequest(this.endpoint, {action:'close', room, key}).catch(() => {});
        }
        for (const id of this.peers.keys()) this.disconnect(id, 'Lobby closed.');
    }
}
