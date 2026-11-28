// Installed apps supply the socket and Bonjour bridge before the game starts.
// Match messages are the same objects used by the browser transport.
const MAX_MESSAGE = 256 * 1024;
const MAX_ROOMS = 64;

export function nativeBridgeAvailable(target = globalThis.window) {
    return typeof target?.VoidrunnerNative?.postMessage === 'function';
}

export class NativeLink {
    constructor({ role, onOpen, onMessage, onClose, onError, onRooms, onHosting, target = window }) {
        if (!nativeBridgeAvailable(target)) throw Error('Native LAN is unavailable.');
        if (role !== 'host' && role !== 'guest') throw Error('Choose host or guest.');
        Object.assign(this, { role, onOpen, onMessage, onClose, onError, onRooms, onHosting, target });
        this.session = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
        this.peers = new Set();
        this.receiver = value => this.receive(value);
        target.__voidrunnerNativeReceive = this.receiver;
    }

    get peerIds() {
        return [...this.peers];
    }

    post(type, args = {}) {
        if (this.closed) return false;
        try {
            this.target.VoidrunnerNative.postMessage(JSON.stringify({ session: this.session, type, ...args }));
            return true;
        } catch {
            this.onError?.(Error('Could not reach the local network service.'));
            return false;
        }
    }

    browse() {
        if (this.role === 'guest' && !this.peers.has('host')) return this.post('browse');
        return false;
    }

    host(name) {
        if (this.role !== 'host') return false;
        this.visible = true;
        return this.post('host', { name });
    }

    join(roomId) {
        if (this.role !== 'guest' || !roomId || this.peers.has('host')) return false;
        return this.post('join', { roomId });
    }

    setVisibility(visible) {
        if (this.role !== 'host' || this.visible === visible) return;
        this.visible = visible;
        this.post('visibility', { visible });
    }

    send(peerId, message, options) {
        if (!this.peers.has(peerId)) return false;
        return this.sendPayload(peerId, JSON.stringify(message), options);
    }

    sendPayload(peerId, payload, { latest = false } = {}) {
        if (payload.length > MAX_MESSAGE) {
            this.disconnect(peerId);
            return false;
        }
        return this.post('send', { peerId, payload, latest });
    }

    broadcast(message, options) {
        if (!this.peers.size) return;
        const payload = JSON.stringify(message);
        for (const id of this.peers) this.sendPayload(id, payload, options);
    }

    disconnect(peerId) {
        if (this.peers.has(peerId)) this.post('disconnect', { peerId });
    }

    close() {
        this.post('close');
        this.closed = true;
        this.peers.clear();
        if (this.target.__voidrunnerNativeReceive === this.receiver)
            delete this.target.__voidrunnerNativeReceive;
    }

    receive(value) {
        if (this.closed || typeof value !== 'string' || value.length > MAX_MESSAGE * 6) return;
        let event;
        try { event = JSON.parse(value); }
        catch { return; }
        if (event?.session !== this.session) return;
        const { type, peerId } = event;
        if (type === 'rooms' && this.role === 'guest' && Array.isArray(event.rooms)) {
            const rooms = new Map();
            for (const room of event.rooms.slice(0, MAX_ROOMS)) {
                if (typeof room?.id !== 'string' || !room.id || room.id.length > 160 || typeof room.name !== 'string') continue;
                rooms.set(room.id, { id: room.id, name: room.name.slice(0, 80) });
            }
            this.onRooms?.([...rooms.values()].sort((a, b) => a.name.localeCompare(b.name)));
        } else if (type === 'hosting' && this.role === 'host') {
            this.onHosting?.();
        } else if (type === 'error') {
            this.onError?.(Object.assign(new Error(String(event.message || 'Local network unavailable.')), { code: event.code }));
        } else if (typeof peerId === 'string' && peerId.length > 0 && peerId.length <= 64) {
            if (type === 'open') {
                if (this.peers.has(peerId)) return;
                if (this.role === 'guest' ? peerId !== 'host' : peerId === 'host' || this.peers.size >= 3) {
                    this.post('disconnect', { peerId });
                    return;
                }
                this.peers.add(peerId);
                this.onOpen?.(peerId);
            } else if (type === 'close' && this.peers.delete(peerId)) {
                this.onClose?.(peerId, String(event.reason || 'Peer left the room.'));
            } else if (type === 'message' && this.peers.has(peerId)) {
                let message;
                try {
                    if (typeof event.payload !== 'string' || event.payload.length > MAX_MESSAGE) throw Error();
                    message = JSON.parse(event.payload);
                    if (!message || typeof message !== 'object' || Array.isArray(message)) throw Error();
                } catch {
                    this.disconnect(peerId);
                    return;
                }
                this.onMessage?.(peerId, message);
            }
        }
    }
}
