// Shared building blocks for forge recipes: the small gestures (ticks, thuds,
// noise bursts, struck bodies, grain clouds, glass keys) that every designed
// sound is layered from.
import * as d from './dsp.mjs';

// Peak-normalise each part before weighting, so recipe mix values are honest
// level ratios regardless of how a part was synthesised.
export function blend(...parts) {
    return d.sum(...parts.map(([signal, gain]) => d.scale(d.normalize(signal, 0), gain)));
}

// A few milliseconds of bright noise: the transient that makes a hit read.
export function tick(R, { hz = 2500, ms = 3 } = {}) {
    const seconds = ms * 5 / 1000;
    return d.mul(d.highpass(d.noise(seconds, R), hz), d.perc(seconds, 0.0003, ms / 1000));
}

// Pitch-dropping sine: kick drums, recoil, impacts, sub booms.
export function thud(seconds, from, to, { sweep = 0.05, tau = 0.08, attack = 0.002, push = 1.6 } = {}) {
    const pitch = d.curve(seconds, (t) => to + (from - to) * Math.exp(-t / sweep));
    return d.drive(d.mul(d.osc(seconds, pitch), d.perc(seconds, attack, tau)), push);
}

// Filtered noise burst whose cutoff falls from `from` to `to`.
export function burst(R, seconds, { color = 'white', from = 8000, to = 400, sweep = 0.08, q = 0.8, attack = 0.001, tau = 0.08, mode = 'lp' } = {}) {
    const cutoff = d.curve(seconds, (t) => to + (from - to) * Math.exp(-t / sweep));
    return d.mul(d.svf(d.noise(seconds, R, color), cutoff, q, mode), d.perc(seconds, attack, tau));
}

// Strike a resonant body: a click plus a short noise burst into modal modes.
export function strike(R, seconds, modes, { hard = 4000, ms = 4, click = 0.6 } = {}) {
    const excitation = blend([tick(R, { hz: 1500, ms: 1 }), click], [burst(R, ms * 4 / 1000, { from: hard, to: hard * 0.5, tau: ms / 1000 }), 1]);
    return d.modal(excitation, modes, seconds);
}

// Build a mode list from a base pitch and ratio table; higher modes decay
// faster and sit lower, like real struck objects.
export function modes(base, ratios, { t60 = 0.5, falloff = 0.8, tilt = 0.35, detune = 0, R } = {}) {
    return ratios.map((ratio, index) => ({
        f: base * ratio * (R && detune ? 1 + R.bipolar() * detune : 1),
        t60: t60 / (1 + index * falloff),
        gain: 1 / (1 + index * tilt),
    }));
}

// Scatter grains over time and across the stereo field. Density thins out
// along `shape`; grain(R, u) returns a mono signal for progress u in 0..1.
export function scatter(R, seconds, count, grain, { span = seconds, shape = 1.6, spread = 0.9, fall = 1.2 } = {}) {
    const out = d.canvas(seconds);
    for (let i = 0; i < count; i += 1) {
        const u = Math.pow(R(), shape), signal = grain(R, u);
        d.place(out, d.normalize(signal, 0), u * span, Math.pow(1 - u, fall) * R.range(0.35, 1), R.bipolar() * spread);
    }
    return out;
}

// The interface voice: a soft FM "glass key" used by every cockpit and menu
// cue so the whole UI shares one timbre.
export function key(freq, seconds, { tau = 0.09, index = 2.2, ratio = 2, attack = 0.003, air = 0.12 } = {}) {
    const body = d.fm(seconds, freq, ratio, d.line(seconds, [[0, index], [Math.min(seconds, tau * 2.5), index * 0.12], [seconds, 0]]));
    const shimmer = d.fm(seconds, freq * 2.005, 3.01, d.line(seconds, [[0, 1.2], [seconds, 0]]));
    return d.lowpass(d.mul(d.sum(body, d.scale(shimmer, air)), d.perc(seconds, attack, tau)), 7000);
}

// A harder, squarer tone for HUD/targeting cues (reads through combat).
export function beep(freq, seconds, { attack = 0.002, release = 0.006 } = {}) {
    const tone = d.lowpass(d.sum(d.osc(seconds, freq, 'square', { width: 0.42 }), d.scale(d.osc(seconds, freq * 2, 'sine'), 0.25)), Math.min(9000, freq * 4.5));
    return d.mul(tone, d.curve(seconds, (t) => Math.min(1, t / attack) * Math.min(1, (seconds - t) / release)));
}

// Interface pitch set: A minor pentatonic, consonant over every music context.
export const NOTE = { A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093 };
