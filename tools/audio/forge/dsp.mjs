// Offline DSP primitives for the Voidrunner sound forge.
//
// Everything here runs in Node at authoring time and renders plain
// Float32Array signals at 44.1 kHz. Nothing in this directory ships to the
// browser: the runtime only plays the encoded results. A "signal parameter"
// is either a number or a per-sample Float32Array; a "stereo" value is a
// two-element array [left, right].
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const SR = 44100;
const TAU = Math.PI * 2;

export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const dbToGain = (db) => Math.pow(10, db / 20);
export const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const len = (seconds) => Math.max(1, Math.round(seconds * SR));
export const silence = (seconds) => new Float32Array(len(seconds));
export const isStereo = (signal) => Array.isArray(signal);
const at = (parameter, index) => typeof parameter === 'number' ? parameter : parameter[index < parameter.length ? index : parameter.length - 1];

// xorshift32: deterministic per recipe + variant, so a forge run is reproducible.
export function makeRng(seed) {
    let state = (seed >>> 0) || 1;
    const next = () => {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.pick = (list) => list[Math.floor(next() * list.length)];
    next.bipolar = () => next() * 2 - 1;
    return next;
}

// ---------------------------------------------------------------- envelopes

export function curve(seconds, fn) {
    const n = len(seconds), out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = fn(i / SR, i / n);
    return out;
}

// Breakpoint envelope. points: [[time, value], ...]; shape 'exp' interpolates
// geometrically (pitch sweeps, natural decays) when both ends share a sign.
export function line(seconds, points, shape = 'lin') {
    const n = len(seconds), out = new Float32Array(n);
    let segment = 0;
    for (let i = 0; i < n; i += 1) {
        const t = i / SR;
        while (segment < points.length - 2 && t >= points[segment + 1][0]) segment += 1;
        const [t0, v0] = points[segment], [t1, v1] = points[Math.min(segment + 1, points.length - 1)];
        const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
        out[i] = shape === 'exp' && v0 * v1 > 0 ? v0 * Math.pow(v1 / v0, u) : v0 + (v1 - v0) * u;
    }
    return out;
}

// Percussive envelope: linear attack, exponential decay with time constant tau.
export function perc(seconds, attack, tau, hold = 0) {
    return curve(seconds, (t) => t < attack ? t / attack : t < attack + hold ? 1 : Math.exp(-(t - attack - hold) / tau));
}

// Smooth swell that rises to a peak and falls: used for whooshes and pads.
export function swell(seconds, peakAt, riseShape = 2, fallShape = 2) {
    return curve(seconds, (t) => t < peakAt ? Math.pow(t / peakAt, riseShape) : Math.pow(Math.max(0, 1 - (t - peakAt) / (seconds - peakAt)), fallShape));
}

// ------------------------------------------------------------------ sources

function polyBlep(phase, step) {
    if (phase < step) { const u = phase / step; return u + u - u * u - 1; }
    if (phase > 1 - step) { const u = (phase - 1) / step; return u * u + u + u + 1; }
    return 0;
}

// Band-limited oscillator; frequency may be a per-sample array.
export function osc(seconds, frequency, shape = 'sine', { phase = 0, width = 0.5 } = {}) {
    const n = len(seconds), out = new Float32Array(n);
    let p = phase - Math.floor(phase);
    for (let i = 0; i < n; i += 1) {
        const step = Math.max(0, at(frequency, i)) / SR;
        let value;
        if (shape === 'sine') value = Math.sin(TAU * p);
        else if (shape === 'saw') value = 2 * p - 1 - polyBlep(p, step);
        else if (shape === 'square') value = (p < width ? 1 : -1) + polyBlep(p, step) - polyBlep((p + 1 - width) % 1, step);
        else value = 4 * Math.abs(p - 0.5) - 1;
        out[i] = value;
        p += step; p -= Math.floor(p);
    }
    return out;
}

// Two-operator FM. index and both frequencies may be arrays.
export function fm(seconds, carrier, ratio, index, { feedback = 0 } = {}) {
    const n = len(seconds), out = new Float32Array(n);
    let pc = 0, pm = 0, last = 0;
    for (let i = 0; i < n; i += 1) {
        const fc = at(carrier, i);
        const modulator = Math.sin(TAU * pm + feedback * last);
        last = modulator;
        out[i] = Math.sin(TAU * pc + at(index, i) * modulator);
        pc += fc / SR; pc -= Math.floor(pc);
        pm += fc * at(ratio, i) / SR; pm -= Math.floor(pm);
    }
    return out;
}

export function noise(seconds, random, color = 'white') {
    const n = len(seconds), out = new Float32Array(n);
    if (color === 'white') { for (let i = 0; i < n; i += 1) out[i] = random() * 2 - 1; return out; }
    if (color === 'brown') {
        let value = 0;
        for (let i = 0; i < n; i += 1) { value = (value + (random() * 2 - 1) * 0.045) * 0.997; out[i] = value * 5.5; }
        return out;
    }
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i += 1) {
        const white = random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852; b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.016898;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
    }
    return out;
}

// Slow random control signal (smoothed sample-and-hold) in [-1, 1].
export function wander(seconds, random, rate) {
    const n = len(seconds), out = new Float32Array(n);
    const period = Math.max(1, Math.round(SR / rate));
    let from = random() * 2 - 1, to = random() * 2 - 1;
    for (let i = 0; i < n; i += 1) {
        const k = i % period;
        if (k === 0 && i > 0) { from = to; to = random() * 2 - 1; }
        const u = k / period, smooth = u * u * (3 - 2 * u);
        out[i] = from + (to - from) * smooth;
    }
    return out;
}

// ------------------------------------------------------------------ filters

// Topology-preserving state variable filter: stays stable under fast sweeps.
export function svf(input, frequency, q = 0.707, mode = 'lp') {
    const n = input.length, out = new Float32Array(n);
    let ic1 = 0, ic2 = 0, g = 0, k = 0, a1 = 0, a2 = 0, a3 = 0;
    const fixed = typeof frequency === 'number' && typeof q === 'number';
    const set = (f, res) => {
        g = Math.tan(Math.PI * clamp(f, 12, SR * 0.46) / SR); k = 1 / Math.max(0.05, res);
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    };
    if (fixed) set(frequency, q);
    for (let i = 0; i < n; i += 1) {
        if (!fixed && (i & 7) === 0) set(at(frequency, i), at(q, i));
        const v3 = input[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        out[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 * k : mode === 'hp' ? input[i] - k * v1 - v2 : input[i] - k * v1;
    }
    return out;
}
export const lowpass = (input, frequency, q) => svf(input, frequency, q, 'lp');
export const highpass = (input, frequency, q) => svf(input, frequency, q, 'hp');
export const bandpass = (input, frequency, q = 1) => svf(input, frequency, q, 'bp');

// RBJ peaking / shelving equaliser for tonal shaping at fixed settings.
export function eq(input, type, frequency, gainDb, q = 0.8) {
    const A = Math.pow(10, gainDb / 40), w = TAU * frequency / SR, cos = Math.cos(w), sin = Math.sin(w);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'peak') {
        const alpha = sin / (2 * q);
        b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
    }
    else {
        const alpha = sin / 2 * Math.sqrt(2), root = 2 * Math.sqrt(A) * alpha, sign = type === 'low' ? 1 : -1;
        b0 = A * ((A + 1) - sign * (A - 1) * cos + root); b1 = sign * 2 * A * ((A - 1) - sign * (A + 1) * cos);
        b2 = A * ((A + 1) - sign * (A - 1) * cos - root); a0 = (A + 1) + sign * (A - 1) * cos + root;
        a1 = -sign * 2 * ((A - 1) + sign * (A + 1) * cos); a2 = (A + 1) + sign * (A - 1) * cos - root;
    }
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i += 1) {
        const x = input[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
    }
    return out;
}

// Bank of decaying two-pole resonators: struck metal, membranes, hull bodies.
// modes: [{ f, t60, gain }]. The excitation rings on for `seconds`.
export function modal(excitation, modes, seconds) {
    const n = len(seconds), out = new Float32Array(n);
    for (const { f, t60, gain = 1, bend = 0 } of modes) {
        if (f >= SR * 0.45) continue;
        const r = Math.pow(10, -3 / (Math.max(0.004, t60) * SR));
        let y1 = 0, y2 = 0;
        // sin(w) compensates the resonator's 1/sin(w) impulse peak, so `gain`
        // is the audible weight of the mode whatever its pitch or decay.
        const amount = gain * Math.sin(TAU * f / SR);
        for (let i = 0; i < n; i += 1) {
            // A small downward bend as the mode decays makes large bodies feel heavy.
            const freq = bend ? f * (1 + bend * Math.exp(-i / (0.05 * SR))) : f;
            const c = 2 * r * Math.cos(TAU * freq / SR);
            const y = (i < excitation.length ? excitation[i] : 0) + c * y1 - r * r * y2;
            y2 = y1; y1 = y; out[i] += y * amount;
        }
    }
    return normalize(out, 0);
}

export function comb(input, seconds, feedback, damp = 0.2, extra = 0) {
    const delay = Math.max(1, Math.round(seconds * SR)), n = input.length + len(extra);
    const out = new Float32Array(n), line = new Float32Array(delay);
    let index = 0, state = 0;
    for (let i = 0; i < n; i += 1) {
        const delayed = line[index];
        state = delayed * (1 - damp) + state * damp;
        const value = (i < input.length ? input[i] : 0) + state * feedback;
        line[index] = value; index = (index + 1) % delay; out[i] = value;
    }
    return out;
}

export function allpass(input, seconds, g = 0.6) {
    const delay = Math.max(1, Math.round(seconds * SR)), out = new Float32Array(input.length), line = new Float32Array(delay);
    let index = 0;
    for (let i = 0; i < input.length; i += 1) {
        const delayed = line[index], value = input[i] + delayed * g;
        line[index] = value; index = (index + 1) % delay; out[i] = delayed - value * g;
    }
    return out;
}

// Modulated delay line (flanger / chorus / doppler smear). delaySeconds may be an array.
export function modDelay(input, delaySeconds, feedback = 0, mix = 0.5) {
    const size = len(0.25), line = new Float32Array(size), out = new Float32Array(input.length);
    let write = 0;
    for (let i = 0; i < input.length; i += 1) {
        const delay = clamp(at(delaySeconds, i) * SR, 1, size - 2);
        let read = write - delay; if (read < 0) read += size;
        const i0 = Math.floor(read), frac = read - i0, delayed = line[i0] * (1 - frac) + line[(i0 + 1) % size] * frac;
        line[write] = input[i] + delayed * feedback; write = (write + 1) % size;
        out[i] = input[i] * (1 - mix) + delayed * mix;
    }
    return out;
}

// ------------------------------------------------------------ nonlinearity

export function drive(input, amount) {
    const out = new Float32Array(input.length), norm = Math.tanh(amount) || 1;
    for (let i = 0; i < input.length; i += 1) out[i] = Math.tanh(input[i] * amount) / norm;
    return out;
}

// Asymmetric fold for buzzy electrical edges.
export function fold(input, amount) {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 1) out[i] = Math.sin(input[i] * amount * Math.PI / 2);
    return out;
}

// ------------------------------------------------------------------ algebra

export function mul(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 1) out[i] = a[i] * at(b, i);
    return out;
}
export function scale(signal, gain) {
    if (isStereo(signal)) return signal.map((channel) => scale(channel, gain));
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i += 1) out[i] = signal[i] * gain;
    return out;
}
export function sum(...signals) {
    const n = Math.max(...signals.map((signal) => signal.length)), out = new Float32Array(n);
    for (const signal of signals) for (let i = 0; i < signal.length; i += 1) out[i] += signal[i];
    return out;
}
export function reverse(signal) {
    if (isStereo(signal)) return signal.map(reverse);
    return Float32Array.from(signal).reverse();
}
export function pad(signal, seconds) {
    if (isStereo(signal)) return signal.map((channel) => pad(channel, seconds));
    const out = new Float32Array(Math.max(signal.length, len(seconds)));
    out.set(signal); return out;
}
export function slice(signal, from, to) {
    if (isStereo(signal)) return signal.map((channel) => slice(channel, from, to));
    return signal.slice(Math.round(from * SR), to === undefined ? undefined : Math.round(to * SR));
}

// Variable-rate playback with linear interpolation: doppler and pitch drops.
export function resample(input, rate, seconds) {
    const n = seconds ? len(seconds) : Math.floor(input.length / (typeof rate === 'number' ? rate : 1));
    const out = new Float32Array(n);
    let position = 0;
    for (let i = 0; i < n; i += 1) {
        const i0 = Math.floor(position);
        if (i0 >= input.length - 1) break;
        const frac = position - i0;
        out[i] = input[i0] * (1 - frac) + input[i0 + 1] * frac;
        position += at(rate, i);
    }
    return out;
}

// ------------------------------------------------------------------- stereo

export const stereo = (signal) => isStereo(signal) ? signal : [signal, Float32Array.from(signal)];
export const toMono = (signal) => isStereo(signal) ? scale(sum(signal[0], signal[1]), 0.5) : signal;

// Mix `source` (mono or stereo) into a stereo destination at a time offset.
export function place(destination, source, atSeconds = 0, gain = 1, pan = 0) {
    const offset = Math.round(atSeconds * SR), [dl, dr] = destination;
    if (isStereo(source)) {
        const gl = gain * (pan > 0 ? 1 - pan : 1), gr = gain * (pan < 0 ? 1 + pan : 1);
        for (let i = 0; i < source[0].length && i + offset < dl.length; i += 1) {
            if (i + offset < 0) continue;
            dl[i + offset] += source[0][i] * gl; dr[i + offset] += source[1][i] * gr;
        }
    }
    else {
        const angle = (clamp(pan, -1, 1) + 1) * Math.PI / 4, gl = Math.cos(angle) * gain * Math.SQRT2, gr = Math.sin(angle) * gain * Math.SQRT2;
        for (let i = 0; i < source.length && i + offset < dl.length; i += 1) {
            if (i + offset < 0) continue;
            dl[i + offset] += source[i] * gl; dr[i + offset] += source[i] * gr;
        }
    }
    return destination;
}
export const canvas = (seconds) => [silence(seconds), silence(seconds)];

// Decorrelate a mono signal into a wide pair. Lows below `crossover` stay
// mono so the result keeps its weight on phone speakers and in mono fold-down.
export function widen(mono, random, amount = 0.6, crossover = 180) {
    const low = lowpass(mono, crossover), high = highpass(mono, crossover);
    let left = high, right = high;
    for (let i = 0; i < 3; i += 1) {
        left = allpass(left, random.range(0.0011, 0.0079), 0.55);
        right = allpass(right, random.range(0.0013, 0.0083), 0.55);
    }
    const n = mono.length, l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
        l[i] = low[i] + high[i] * (1 - amount) + left[i] * amount;
        r[i] = low[i] + high[i] * (1 - amount) + right[i] * amount;
    }
    return [l, r];
}

// Feedback delay network reverb. Returns the wet signal mixed with the dry
// input; the output is longer than the input by the tail.
export function reverb(input, { time = 1.6, size = 1, damp = 0.35, predelay = 0.012, mix = 0.3, highpassHz = 140, seed = 11 } = {}) {
    const [inL, inR] = stereo(input), random = makeRng(seed * 7919 + 13);
    const base = [0.0297, 0.0371, 0.0411, 0.0437, 0.0479, 0.0533, 0.0599, 0.0673];
    const lengths = base.map((seconds) => Math.max(8, Math.round(seconds * size * (1 + random.range(-0.03, 0.03)) * SR)));
    const lines = lengths.map((length) => new Float32Array(length));
    const gains = lengths.map((length) => Math.pow(10, -3 * length / (time * SR)));
    const heads = lengths.map(() => 0), states = lengths.map(() => 0);
    const total = inL.length + len(time * 1.15 + predelay);
    const pre = Math.round(predelay * SR);
    const diffuse = (channel, offset) => allpass(allpass(pad(channel, total / SR), 0.0047 + offset, 0.6), 0.0113 + offset, 0.55);
    const dl = diffuse(inL, 0), dr = diffuse(inR, 0.0009);
    const wetL = new Float32Array(total), wetR = new Float32Array(total);
    const taps = new Float32Array(8);
    for (let i = 0; i < total; i += 1) {
        const xl = i >= pre ? dl[i - pre] : 0, xr = i >= pre ? dr[i - pre] : 0;
        let total8 = 0;
        for (let k = 0; k < 8; k += 1) {
            const delayed = lines[k][heads[k]];
            states[k] = delayed * (1 - damp) + states[k] * damp;
            taps[k] = states[k]; total8 += taps[k];
        }
        const household = total8 * 0.25;
        let l = 0, r = 0;
        for (let k = 0; k < 8; k += 1) {
            const feedback = (taps[k] - household) * gains[k];
            lines[k][heads[k]] = (k % 2 ? xr : xl) + feedback;
            heads[k] = (heads[k] + 1) % lengths[k];
            if (k % 2) r += taps[k]; else l += taps[k];
        }
        wetL[i] = l * 0.35; wetR[i] = r * 0.35;
    }
    const outL = highpass(wetL, highpassHz), outR = highpass(wetR, highpassHz);
    for (let i = 0; i < total; i += 1) {
        outL[i] = outL[i] * mix + (i < inL.length ? inL[i] * (1 - mix) : 0);
        outR[i] = outR[i] * mix + (i < inR.length ? inR[i] * (1 - mix) : 0);
    }
    return [outL, outR];
}

// ---------------------------------------------------------------- finishing

export function peakOf(signal) {
    if (isStereo(signal)) return Math.max(peakOf(signal[0]), peakOf(signal[1]));
    let peak = 0;
    for (let i = 0; i < signal.length; i += 1) { const value = Math.abs(signal[i]); if (value > peak) peak = value; }
    return peak;
}
export function rmsOf(signal) {
    const channels = stereo(signal);
    let total = 0;
    for (const channel of channels) for (let i = 0; i < channel.length; i += 1) total += channel[i] * channel[i];
    return Math.sqrt(total / (channels[0].length * 2));
}
export function normalize(signal, peakDb = -1) {
    const peak = peakOf(signal);
    return peak > 1e-9 ? scale(signal, dbToGain(peakDb) / peak) : signal;
}
export function fade(signal, inSeconds = 0.002, outSeconds = 0.01) {
    if (isStereo(signal)) return signal.map((channel) => fade(channel, inSeconds, outSeconds));
    const out = Float32Array.from(signal), a = Math.min(len(inSeconds), out.length >> 1), b = Math.min(len(outSeconds), out.length >> 1);
    for (let i = 0; i < a; i += 1) out[i] *= i / a;
    for (let i = 0; i < b; i += 1) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / b);
    return out;
}
// Remove subsonic energy and DC that would only eat headroom.
export const tidy = (signal, hz = 28) => isStereo(signal) ? signal.map((channel) => highpass(channel, hz)) : highpass(signal, hz);

// Cut the tail once it has decayed below the noise floor.
export function trimTail(signal, floorDb = -66, keep = 0.02) {
    const channels = stereo(signal), floor = dbToGain(floorDb);
    let last = 0;
    for (const channel of channels) for (let i = channel.length - 1; i > last; i -= 1) if (Math.abs(channel[i]) > floor) { last = i; break; }
    const end = Math.min(channels[0].length, last + len(keep));
    return isStereo(signal) ? signal.map((channel) => channel.slice(0, end)) : signal.slice(0, end);
}

// Turn a steady texture into a seamless loop by folding its tail over its
// head with an equal-power crossfade. Returns the loop body (period).
export function makeLoop(signal, crossfadeSeconds = 0.5) {
    if (isStereo(signal)) return signal.map((channel) => makeLoop(channel, crossfadeSeconds));
    const fadeLength = len(crossfadeSeconds), period = signal.length - fadeLength, out = new Float32Array(period);
    for (let i = 0; i < period; i += 1) {
        if (i < fadeLength) {
            const u = i / fadeLength;
            out[i] = signal[i] * Math.sin(u * Math.PI / 2) + signal[period + i] * Math.cos(u * Math.PI / 2);
        }
        else out[i] = signal[i];
    }
    return out;
}
// MP3 decoders disagree about encoder delay. Surround the period with copies
// of its own end/start so any window of one period inside the file loops
// cleanly, whatever constant offset the decoder adds.
export const LOOP_ROLL = 0.12;
export function rollLoop(body) {
    if (isStereo(body)) return body.map(rollLoop);
    const roll = len(LOOP_ROLL), out = new Float32Array(body.length + roll * 2);
    out.set(body.subarray(body.length - roll), 0); out.set(body, roll); out.set(body.subarray(0, roll), roll + body.length);
    return out;
}

// ----------------------------------------------------------------------- io

export function writeWav(path, signal) {
    const channels = isStereo(signal) ? signal : [signal], frames = channels[0].length;
    const header = Buffer.alloc(44), data = Buffer.alloc(frames * channels.length * 4);
    header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(channels.length, 22);
    header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * channels.length * 4, 28);
    header.writeUInt16LE(channels.length * 4, 32); header.writeUInt16LE(32, 34);
    header.write('data', 36); header.writeUInt32LE(data.length, 40);
    for (let i = 0; i < frames; i += 1)
        for (let c = 0; c < channels.length; c += 1) data.writeFloatLE(clamp(channels[c][i], -1, 1), (i * channels.length + c) * 4);
    writeFileSync(path, Buffer.concat([header, data]));
}

// Decode any audio file to mono float PCM through ffmpeg.
export function readMono(path) {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (result.status !== 0) throw new Error(`ffmpeg could not decode ${path}: ${result.stderr}`);
    return new Float32Array(result.stdout.buffer, result.stdout.byteOffset, result.stdout.byteLength >> 2).slice();
}
