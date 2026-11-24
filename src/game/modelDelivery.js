// Preview, station, traffic and predictive loading can ask for the same GLB.
// Share the network read, never the mutable scene. After the first successful
// read, the browser's HTTP cache may supply subsequent reads in this page.
const pending = new Map();
const downloaded = new Set();
export const modelNetworkBusy = () => pending.size > 0;

export function fetchModelBytes(url, priority = 'auto') {
    const key = globalThis.document?.baseURI ? new URL(url, document.baseURI).href : String(url);
    const active = pending.get(key);
    if (active) return active;
    const read = fetch(url, {priority, cache: downloaded.has(key) ? 'force-cache' : 'default'})
        .then(async response => {
            if (!response.ok) throw new Error(`GLB ${key}: HTTP ${response.status}`);
            // Static hosts normally serve .gz as a file. Hosts setting
            // Content-Encoding have already let fetch decode this body.
            const packed = key.endsWith('.glb.gz') && !response.headers.get('content-encoding')?.toLowerCase().split(/,\s*/).includes('gzip');
            const bytes = packed
                ? await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
                : await response.arrayBuffer();
            if (key.endsWith('.glb.gz') && (bytes.byteLength < 12 || new DataView(bytes).getUint32(0,true) !== 0x46546c67))
                throw new Error(`Invalid packed GLB ${key}`);
            downloaded.add(key);
            return bytes;
        }).finally(() => pending.delete(key));
    pending.set(key, read);
    return read;
}

export function fieldModelURL(file) {
    return globalThis.document?.documentElement?.hasAttribute('data-packed-models')
        && typeof DecompressionStream === 'function' ? file + '.gz' : file;
}
