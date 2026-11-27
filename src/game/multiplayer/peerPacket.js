// A fight with many scattergun pellets can exceed the SCTP message size a
// browser advertises. Ordered delivery keeps all fragments contiguous.
const CHUNK_CHARS = 8 * 1024;
const MAX_CHARS = 256 * 1024;

export function sendPacket(channel, text) {
    if (typeof text !== 'string' || text.length > MAX_CHARS) throw Error('The game message is too large.');
    if (text.length <= CHUNK_CHARS) {
        channel.send(text);
        return;
    }
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + CHUNK_CHARS, text.length);
        const last = text.charCodeAt(end - 1);
        if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
        channel.send((end === text.length ? '=' : '+') + text.slice(start, end));
        start = end;
    }
}

export function receivePacket(peer, text) {
    if (typeof text !== 'string' || text.length > CHUNK_CHARS + 1) throw Error();
    if (text[0] === '+' || text[0] === '=') {
        // Require full-size leading fragments. This also bounds fragment count
        // and copying work for an incomplete message.
        if (text.length < 2 || (text[0] === '+' && text.length < CHUNK_CHARS) ||
            peer.partial.length + text.length - 1 > MAX_CHARS) throw Error();
        peer.partial += text.slice(1);
        if (text[0] === '+') return null;
        text = peer.partial;
        peer.partial = '';
    } else if (peer.partial) throw Error();
    const object = JSON.parse(text);
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw Error();
    return object;
}
