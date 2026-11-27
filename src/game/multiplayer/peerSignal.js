// Complete ICE descriptions can cross a static site's copy/paste boundary.
// The bundled codec also works on LAN HTTP and browsers without CompressionStream.
const MAX_SDP = 16_384;
export const SIGNAL_PATTERN = /^VR1\.[A-Za-z0-9_-]{1,24000}$/;
export const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
}

export async function packSignal(id, description) {
    const {deflateSync} = await import('../../../vendor/fflate-0.8.2/browser.js');
    const bytes = new TextEncoder().encode(JSON.stringify([id, description.type, description.sdp]));
    if (bytes.length > MAX_SDP) throw Error('The connection description is too long.');
    const binary = String.fromCharCode(...deflateSync(bytes));
    return 'VR1.' + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function unpackSignal(raw, expectedType) {
    const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '') : '';
    try {
        if (!SIGNAL_PATTERN.test(text)) throw Error();
        const binary = atob(text.slice(4).replaceAll('-', '+').replaceAll('_', '/'));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const {inflateSync} = await import('../../../vendor/fflate-0.8.2/browser.js');
        const plain = inflateSync(bytes, {out: new Uint8Array(MAX_SDP + 1)});
        if (plain.length > MAX_SDP) throw Error();
        const [id, type, sdp] = JSON.parse(new TextDecoder().decode(plain));
        if (!TOKEN_PATTERN.test(id) || type !== expectedType || typeof sdp !== 'string' ||
            !/^m=application /m.test(sdp) || /^m=(?!application )/m.test(sdp)) throw Error();
        return {id, description: {type, sdp}};
    } catch {
        throw Error('Paste the complete ' + (expectedType === 'offer' ? 'invite' : 'reply') + ' code.');
    }
}

export function roomTokenFromUrl(value = globalThis.location?.href) {
    try {
        const token = new URL(value).hash.match(/^#room=([0-9a-f]{32})$/)?.[1];
        return token || null;
    } catch { return null; }
}

export async function roomRequest(endpoint, body, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(cancel, 8000);
    try {
        const response = await fetch(endpoint, {
            method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
            credentials:'omit', redirect:'error', signal:controller.signal, body:JSON.stringify(body),
        });
        if (!response.headers.get('content-type')?.startsWith('application/json')) {
            throw Error('This site uses invite and reply codes.');
        }
        const result = await response.json();
        if (!response.ok) throw Object.assign(Error(result.error || 'Room request failed.'), {status:response.status});
        return result;
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
    }
}
