// Compare two directories of same-named PNGs (default: /tmp/vr-before vs
// screenshots) and report per-scene mean absolute difference plus the fraction
// of pixels that moved beyond a small threshold.
// Usage: node tools/playtest/probes/diff-shots.mjs <dirA> <dirB>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const dirA = process.argv[2] ?? '/tmp/vr-before';
const dirB = process.argv[3] ?? 'output/scenes';

const pairs = ['station', 'planet-vesper', 'asteroid-field', 'deep-space', 'dogfight'];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

const load = (path) => {
    const buf = readFileSync(path);
    // PNG decode via zlib: parse IHDR + IDAT (all captures are 8-bit RGBA, non-interlaced).
    let pos = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        if (type === 'IHDR') {
            width = buf.readUInt32BE(pos + 8);
            height = buf.readUInt32BE(pos + 12);
            bitDepth = buf[pos + 16];
            colorType = buf[pos + 17];
            interlace = buf[pos + 20];
        }
        pos += 12 + len;
        if (type === 'IEND') break;
    }
    if (interlace !== 0 || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`unsupported PNG ${path}: ${bitDepth}bpc ct=${colorType} ilace=${interlace}`);
    }
    // Reconstruct scanlines: find IDAT chunks and inflate.
    pos = 8;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
        pos += 12 + len;
        if (type === 'IEND') break;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const bpp = colorType === 6 ? 4 : 3;
    const stride = width * bpp;
    const px = new Uint8ClampedArray(width * height * 4);
    let p = 0;
    let prev = new Uint8Array(stride);
    for (let y = 0; y < height; y += 1) {
        const filter = raw[p];
        p += 1;
        const line = new Uint8Array(stride);
        for (let x = 0; x < stride; x += 1) {
            const rawByte = raw[p + x];
            const a = x >= bpp ? line[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let val;
            if (filter === 0) val = rawByte;
            else if (filter === 1) val = rawByte + a;
            else if (filter === 2) val = rawByte + b;
            else if (filter === 3) val = rawByte + Math.floor((a + b) / 2);
            else if (filter === 4) {
                const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
                val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            } else throw new Error('bad filter ' + filter);
            line[x] = val & 255;
        }
        for (let x = 0; x < width; x += 1) {
            px[(y * width + x) * 4] = line[x * bpp];
            px[(y * width + x) * 4 + 1] = line[x * bpp + 1];
            px[(y * width + x) * 4 + 2] = line[x * bpp + 2];
            px[(y * width + x) * 4 + 3] = 255;
        }
        prev = line;
        p += stride;
    }
    return { width, height, px };
};

let worst = 0;
for (const name of pairs) {
    const a = load(join(dirA, `${name}.png`));
    const b = load(join(dirB, `${name}.png`));
    if (a.width !== b.width || a.height !== b.height) {
        console.log(`${name}: SIZE MISMATCH ${a.width}x${a.height} vs ${b.width}x${b.height}`);
        continue;
    }
    let sum = 0;
    let changed = 0;
    const n = a.width * a.height;
    for (let i = 0; i < n; i += 1) {
        const dr = Math.abs(a.px[i * 4] - b.px[i * 4]);
        const dg = Math.abs(a.px[i * 4 + 1] - b.px[i * 4 + 1]);
        const db = Math.abs(a.px[i * 4 + 2] - b.px[i * 4 + 2]);
        const d = (dr + dg + db) / 3;
        sum += d;
        if (d > 12) changed += 1;
    }
    const mean = sum / n;
    const pct = (changed / n) * 100;
    worst = Math.max(worst, mean);
    console.log(`${name.padEnd(14)} mean|Δ|=${mean.toFixed(3)}  pixels>12: ${pct.toFixed(2)}%`);
}
console.log(`\nworst mean diff: ${worst.toFixed(3)}  (${dirA} vs ${dirB})`);
