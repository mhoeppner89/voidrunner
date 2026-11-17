// Prints duration, level and spectral balance for forged WAVs (run forge with --wav first).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as d from './dsp.mjs';
const dir = process.argv[2] ?? 'output/audio-forge', filter = process.argv[3];
const db = (x) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1).padStart(6);
let total = 0, decoded = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.wav') && (!filter || f.includes(filter))).sort()) {
    const raw = readFileSync(join(dir, file)), channels = raw.readUInt16LE(22), frames = (raw.length - 44) / 4 / channels;
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    for (let i = 0; i < frames; i += 1) for (let c = 0; c < channels; c += 1) data[c][i] = raw.readFloatLE(44 + (i * channels + c) * 4);
    const mono = channels > 1 ? d.toMono(data) : data[0];
    const low = d.rmsOf(d.lowpass(mono, 200)), mid = d.rmsOf(d.highpass(d.lowpass(mono, 2000), 200)), high = d.rmsOf(d.highpass(mono, 2000));
    let corr = '';
    if (channels > 1) { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < frames; i += 1) { ab += data[0][i] * data[1][i]; aa += data[0][i] ** 2; bb += data[1][i] ** 2; } corr = (ab / Math.sqrt(aa * bb + 1e-12)).toFixed(2); }
    total += frames / d.SR; decoded += frames * channels * 4 * 48000 / d.SR;
    console.log(`${file.padEnd(26)} ${(frames / d.SR).toFixed(2).padStart(5)}s ch${channels} peak${db(d.peakOf(channels > 1 ? data : mono))} rms${db(d.rmsOf(mono))} | low${db(low)} mid${db(mid)} high${db(high)} ${corr ? 'corr ' + corr : ''}`);
}
console.log(`total ${total.toFixed(1)} s, ~${(decoded / 1048576).toFixed(1)} MB decoded at 48 kHz`);
