// Interface, cockpit systems, ambience details and music percussion.
//
// Every tonal cue here is tuned to A minor pentatonic (kit.NOTE) and built
// from the same FM "glass key", so menus, HUD and alerts sound like one
// instrument panel and never clash with the score.
import * as d from './dsp.mjs';
import { blend, tick, thud, burst, strike, modes, scatter, key, beep, NOTE } from './kit.mjs';

// Place a list of [signal, time, gain, pan] on a stereo canvas.
function sequence(seconds, parts) {
    const out = d.canvas(seconds);
    for (const [signal, time = 0, gain = 1, pan = 0] of parts) d.place(out, d.normalize(signal, 0), time, gain, pan);
    return out;
}
const room = (signal, seed, mix = 0.14, time = 0.45) => d.reverb(signal, { time, mix, seed, damp: 0.4 });
const softTick = (R) => d.modal(tick(R, { hz: 1500, ms: 1 }), [{ f: 2300, t60: 0.012 }, { f: 3400, t60: 0.008, gain: 0.6 }], 0.04);

export default {
    // ---------------------------------------------------------- interface
    'ui-click': {
        variants: 3, peak: -12, group: 'ui',
        make: (v, R) => blend([softTick(R), 0.55], [d.mul(d.osc(0.06, [520, 560, 490][v]), d.perc(0.06, 0.001, 0.012)), 1], [key(NOTE.E6, 0.06, { tau: 0.016, index: 1.2 }), 0.35]),
    },
    'ui-hover': {
        variants: 1, peak: -20, group: 'ui',
        make: (v, R) => d.highpass(softTick(R), 1800),
    },
    'ui-tab': {
        variants: 1, peak: -12, group: 'ui',
        make: (v, R) => blend([softTick(R), 0.5], [key(NOTE.D6, 0.1, { tau: 0.025, index: 1.4 }), 1]),
    },
    'ui-confirm': {
        variants: 1, peak: -9, group: 'ui',
        make: (v, R) => room(sequence(0.42, [[softTick(R), 0, 0.3], [key(NOTE.A5, 0.25, { tau: 0.06 }), 0, 0.8, -0.2], [key(NOTE.E6, 0.32, { tau: 0.08 }), 0.07, 1, 0.2]]), 201),
    },
    'ui-deny': {
        variants: 1, peak: -10, group: 'ui',
        make: (v, R) => {
            const T = 0.24, buzz = d.lowpass(d.sum(d.osc(T, d.line(T, [[0, 196], [T, 170]]), 'square'), d.osc(T, d.line(T, [[0, 185], [T, 163]]), 'saw')), 950);
            const pulse = (t, from, to) => Math.max(0, Math.min(1, (t - from) / 0.004, (to - t) / 0.012));
            return d.drive(d.mul(buzz, d.curve(T, (t) => pulse(t, 0, 0.08) + pulse(t, 0.115, 0.2))), 1.3);
        },
    },
    'ui-open': {
        variants: 1, peak: -11, group: 'ui',
        make: (v, R) => {
            const air = d.mul(d.bandpass(d.noise(0.16, R, 'pink'), d.line(0.16, [[0, 800], [0.16, 3200]], 'exp'), 2), d.swell(0.16, 0.11, 1.5, 1.5));
            return room(sequence(0.36, [[air, 0, 0.5], [key(NOTE.A4, 0.2, { tau: 0.05 }), 0.02, 0.7, -0.25], [key(NOTE.E5, 0.26, { tau: 0.07 }), 0.08, 1, 0.25]]), 203);
        },
    },
    'ui-close': {
        variants: 1, peak: -12, group: 'ui',
        make: (v, R) => {
            const air = d.mul(d.bandpass(d.noise(0.14, R, 'pink'), d.line(0.14, [[0, 3000], [0.14, 700]], 'exp'), 2), d.swell(0.14, 0.03, 1, 1.5));
            return room(sequence(0.3, [[air, 0, 0.5], [key(NOTE.E5, 0.16, { tau: 0.04 }), 0, 0.9, 0.25], [key(NOTE.A4, 0.22, { tau: 0.06 }), 0.06, 1, -0.25]]), 205);
        },
    },
    // Credits changing hands: a latch, then a quick rising run.
    'ui-purchase': {
        variants: 1, peak: -8, group: 'ui',
        make: (v, R) => {
            const shimmer = d.mul(d.highpass(d.noise(0.4, R), 6000), d.swell(0.4, 0.16, 2, 2));
            const latch = strike(R, 0.08, modes(900, [1, 2.3, 3.8], { t60: 0.04 }), { hard: 5000, ms: 2 });
            return room(sequence(0.62, [[latch, 0, 0.5], [key(NOTE.A5, 0.2, { tau: 0.05 }), 0.03, 0.7, -0.4], [key(NOTE.C6, 0.2, { tau: 0.05 }), 0.08, 0.8, -0.1],
                [key(NOTE.E6, 0.22, { tau: 0.06 }), 0.13, 0.9, 0.2], [key(NOTE.A6, 0.4, { tau: 0.12 }), 0.18, 1, 0.4], [shimmer, 0.1, 0.12]]), 207, 0.2, 0.7);
        },
    },
    // Hardware seating into a mount: clack, servo, confirm.
    'ui-equip': {
        variants: 1, peak: -8, group: 'ui', mono: true,
        make: (v, R) => {
            const servo = d.mul(d.bandpass(d.osc(0.2, d.line(0.2, [[0, 180], [0.2, 430]], 'exp'), 'saw'), 1200, 3), d.swell(0.2, 0.12, 1, 1));
            const clack = d.drive(blend([strike(R, 0.14, modes(560, [1, 2.2, 3.6, 5.1], { t60: 0.07 }), { hard: 5000 }), 1], [thud(0.1, 160, 80, { tau: 0.025 }), 0.6]), 1.4);
            return room(sequence(0.55, [[servo, 0, 0.35], [clack, 0.19, 1], [key(NOTE.E6, 0.25, { tau: 0.07 }), 0.27, 0.5, 0.2]]), 209);
        },
    },
    'target-cycle': {
        variants: 2, peak: -11, group: 'flight',
        make: (v, R) => blend([beep([NOTE.E6, NOTE.D6][v], 0.03), 1], [softTick(R), 0.4]),
    },
    'target-lock': {
        variants: 1, peak: -9, group: 'flight',
        make: (v, R) => sequence(0.42, [[beep(NOTE.A6, 0.038), 0, 0.8], [beep(NOTE.A6, 0.038), 0.062, 0.8], [beep(NOTE.A6, 0.038), 0.124, 0.8], [beep(NOTE.C7, 0.15, { release: 0.05 }), 0.19, 1]])[0],
    },
    // Fire pressed on an empty capacitor: a dry relay and a dying whine.
    'capacitor-empty': {
        variants: 1, peak: -8, group: 'flight',
        make: (v, R) => blend([strike(R, 0.06, [{ f: 620, t60: 0.03 }, { f: 1450, t60: 0.02, gain: 0.6 }], { hard: 4000, ms: 2 }), 1],
            [d.mul(d.lowpass(d.osc(0.2, d.line(0.2, [[0, 330], [0.2, 85]], 'exp'), 'saw'), 900), d.perc(0.2, 0.004, 0.06)), 0.55]),
    },
    // Your target's shields just failed: a rising pair over a glassy crack.
    'target-shield-down': {
        variants: 1, peak: -9, group: 'flight',
        make: (v, R) => sequence(0.36, [[beep(NOTE.E6, 0.06), 0, 0.8], [beep(NOTE.A6, 0.11, { release: 0.04 }), 0.09, 1],
            [d.mul(d.highpass(d.noise(0.12, R), 5000), d.perc(0.12, 0.001, 0.025)), 0, 0.3]])[0],
    },
    'countdown': {
        variants: 1, peak: -9, group: 'flight',
        make: () => beep(NOTE.A5, 0.11, { release: 0.03 }),
    },
    'race-go': {
        variants: 1, peak: -7, group: 'flight',
        make: () => sequence(0.5, [[beep(NOTE.A6, 0.34, { release: 0.12 }), 0, 1], [key(NOTE.E6, 0.4, { tau: 0.12 }), 0, 0.5], [key(NOTE.A5, 0.4, { tau: 0.12 }), 0, 0.5]])[0],
    },
    // An enemy seeker has you: dissonant warble, impossible to ignore.
    'lock-warning': {
        variants: 1, peak: -7, group: 'flight',
        make: () => {
            const T = 0.9, pitch = d.curve(T, (t) => (Math.floor(t * 20) % 2 ? 1108.7 : 880));
            return d.drive(d.mul(d.bandpass(d.osc(T, pitch, 'saw'), 1500, 1.5), d.curve(T, (t) => Math.min(1, t / 0.004) * Math.min(1, (T - t) / 0.03) * (0.75 + 0.25 * Math.sign(Math.sin(2 * Math.PI * 10 * t))))), 1.6);
        },
    },
    // A missile is in the air: four urgent pips.
    'missile-alert': {
        variants: 1, peak: -6, group: 'flight',
        make: () => {
            const pip = d.bandpass(d.sum(d.osc(0.045, 1480, 'saw'), d.osc(0.045, 1480, 'square')), 1700, 1.2);
            const shaped = d.mul(pip, d.curve(0.045, (t) => Math.min(1, t / 0.002) * Math.min(1, (0.045 - t) / 0.005)));
            return d.drive(sequence(0.34, [0, 0.08, 0.16, 0.24].map((time) => [shaped, time, 1]))[0], 1.5);
        },
    },
    // Hull critical: a two-swoop klaxon voiced through the cockpit.
    'alarm-hull': {
        variants: 1, peak: -8, group: 'flight', mono: true,
        make: () => {
            const swoop = d.curve(0.45, (t, u) => 380 + 240 * u * u), tone = d.eq(d.lowpass(d.sum(d.osc(0.45, swoop, 'saw'), d.osc(0.45, d.curve(0.45, (t, u) => 2 * (380 + 240 * u * u)), 'square', { width: 0.3 })), 2300), 'peak', 900, 6, 2);
            const shaped = d.drive(d.mul(tone, d.curve(0.45, (t) => Math.min(1, t / 0.02) * Math.min(1, (0.45 - t) / 0.05))), 1.5);
            return room(sequence(1.1, [[shaped, 0, 1], [shaped, 0.56, 1]]), 211, 0.16, 0.5);
        },
    },
    // General caution (low fuel, out of range): softer than an alarm.
    'alert': {
        variants: 1, peak: -9, group: 'ui',
        make: () => {
            const note = d.mul(d.fm(0.1, NOTE.E5, 1, d.line(0.1, [[0, 1.8], [0.1, 0.6]])), d.curve(0.1, (t) => Math.min(1, t / 0.004) * Math.min(1, (0.1 - t) / 0.02)));
            return sequence(0.3, [[note, 0, 1], [note, 0.155, 1]])[0];
        },
    },
    'comms-open': {
        variants: 2, peak: -12, group: 'flight',
        make: (v, R) => blend([d.mul(d.bandpass(d.noise(0.09, R), 1900 + v * 300, 2), d.curve(0.09, (t) => Math.min(1, t / 0.002) * (t < 0.07 ? 1 : 0.15))), 1], [d.mul(d.osc(0.035, d.line(0.035, [[0, 1200], [0.035, 1900]])), d.perc(0.035, 0.002, 0.02)), 0.6]),
    },
    'comms-close': {
        variants: 1, peak: -14, group: 'flight',
        make: (v, R) => blend([d.mul(d.bandpass(d.noise(0.05, R), 1700, 2), d.perc(0.05, 0.001, 0.015)), 1], [d.mul(d.osc(0.03, d.line(0.03, [[0, 1700], [0.03, 1100]])), d.perc(0.03, 0.002, 0.015)), 0.5]),
    },
    // Active sensor sweep: a sonar ping answered by its own echoes.
    'scan-ping': {
        variants: 1, peak: -7, group: 'flight',
        make: (v, R) => {
            const ping = d.mul(d.fm(1, 1180, 3.01, d.line(1, [[0, 1.5], [0.4, 0.2], [1, 0]])), d.perc(1, 0.002, 0.22));
            const sweep = d.mul(d.bandpass(d.noise(0.35, R), d.line(0.35, [[0, 600], [0.35, 3600]], 'exp'), 8), d.swell(0.35, 0.25, 1.5, 1.5));
            const echo = d.lowpass(ping, 2400);
            return d.reverb(sequence(1.5, [[sweep, 0, 0.3], [ping, 0.02, 1], [echo, 0.21, 0.42, -0.7], [echo, 0.4, 0.2, 0.7], [echo, 0.59, 0.1, -0.5]]), { time: 1.6, mix: 0.3, seed: 213 });
        },
    },
    'pickup-chime': {
        variants: 2, peak: -9, group: 'flight', mono: true,
        make: (v, R) => room(sequence(0.36, [[thud(0.1, 180, 90, { tau: 0.025 }), 0, 0.5], [key([NOTE.E5, NOTE.D5][v], 0.2, { tau: 0.05 }), 0.01, 0.8, -0.2], [key([NOTE.A5, NOTE.G5][v], 0.28, { tau: 0.08 }), 0.07, 1, 0.2]]), 215 + v),
    },
    // Contract paid / objective complete: the one unambiguous major resolve.
    'success-sting': {
        variants: 1, peak: -6, group: 'ui',
        make: (v, R) => {
            const padNote = (f) => d.mul(d.lowpass(d.sum(d.osc(1.4, f, 'saw'), d.osc(1.4, f * 1.006, 'saw')), d.line(1.4, [[0, 400], [0.5, 2200], [1.4, 600]], 'exp')), d.swell(1.4, 0.45, 1.5, 1.6));
            const pad = d.sum(padNote(NOTE.C4), padNote(NOTE.G4), padNote(NOTE.E5));
            return d.reverb(sequence(1.5, [[pad, 0, 0.42], [key(NOTE.C5, 0.5, { tau: 0.14 }), 0, 0.7, -0.4], [key(NOTE.E5, 0.5, { tau: 0.14 }), 0.09, 0.75, -0.1],
                [key(NOTE.G5, 0.5, { tau: 0.14 }), 0.18, 0.8, 0.2], [key(NOTE.C6, 0.9, { tau: 0.3 }), 0.27, 1, 0.4], [key(NOTE.D6, 0.7, { tau: 0.2, index: 1.2 }), 0.42, 0.35, -0.3]]), { time: 1.8, mix: 0.3, seed: 217 });
        },
    },
    // Hostile destroyed: a short, rewarding confirmation under the blast.
    'kill-confirm': {
        variants: 1, peak: -8, group: 'flight', mono: true,
        make: (v, R) => room(sequence(0.5, [[thud(0.22, 104, 50, { tau: 0.05 }), 0, 0.7], [key(NOTE.A5, 0.3, { tau: 0.08 }), 0, 0.8, -0.3], [key(NOTE.E6, 0.4, { tau: 0.11 }), 0.02, 1, 0.3]]), 219, 0.2, 0.7),
    },

    // ------------------------------------------------ cockpit atmosphere
    // Hull stress under load: stick-slip friction ringing a metal frame.
    'creak': {
        variants: 4, peak: -9, group: 'flight',
        make: (v, R) => {
            const T = R.range(0.9, 1.5), grip = d.wander(T, R, R.range(5, 11));
            const excitation = d.mul(d.bandpass(d.noise(T, R, 'pink'), 400, 0.7), d.curve(T, (t) => Math.pow(Math.max(0, grip[Math.floor(t * d.SR)]), 3)));
            const frame = d.modal(excitation, modes(R.range(70, 160), [1, 1.6, 2.3, 3.4, 4.9], { t60: 0.4, falloff: 0.35 }), T);
            const bend = d.wander(T, R, 1.4);
            const bent = d.lowpass(d.resample(frame, d.curve(T, (t) => 1.0 + 0.11 * bend[Math.floor(t * d.SR)]), T * 0.92), 2400);
            return room(d.widen(d.mul(bent, d.swell(T * 0.92, T * 0.35, 1.2, 1.5)), R, 0.5), 221 + v, 0.15, 0.5);
        },
    },
    // Avionics telemetry: tiny data chirps at the edge of hearing.
    'chatter': {
        variants: 6, peak: -18, group: 'flight',
        make: (v, R) => {
            const parts = []; let time = 0;
            for (let i = 0, count = 3 + Math.floor(R() * 4); i < count; i += 1) {
                const seconds = R.range(0.018, 0.035), f = R.pick([NOTE.G6, NOTE.A6, NOTE.C7, 2349, 2637, 3136]);
                parts.push([d.mul(d.fm(seconds, f, 1, 0.6), d.curve(seconds, (t) => Math.min(1, t / 0.002) * Math.min(1, (seconds - t) / 0.004))), time, R.range(0.5, 1)]);
                time += seconds + R.range(0.012, 0.03);
            }
            return d.lowpass(sequence(time + 0.02, parts)[0], 5200);
        },
    },

    // -------------------------------------------------- docked ambience
    'clank': {
        variants: 3, peak: -12, group: 'dock', mono: true,
        make: (v, R) => d.reverb(d.widen(d.lowpass(strike(R, 0.6, modes(R.range(240, 480), [1, 2.3, 3.9, 5.1], { t60: 0.4, detune: 0.02, R }), { hard: 3000 }), 1800), R, 0.4), { time: 2.2, mix: 0.6, damp: 0.5, seed: 231 + v }),
    },
    'pa-chirp': {
        variants: 2, peak: -15, group: 'dock', mono: true,
        make: (v, R) => {
            const notes = v ? [NOTE.G4, NOTE.C5, NOTE.E5] : [NOTE.E5, NOTE.C5, NOTE.G4];
            const dry = sequence(1.3, notes.map((f, i) => [key(f, 0.6, { tau: 0.2, index: 1.6 }), i * 0.28, 1]))[0];
            const slap = d.silence(1.3); slap.set(dry.subarray(0, dry.length - d.len(0.09)), d.len(0.09));
            const horn = d.bandpass(d.sum(dry, d.scale(slap, 0.4)), 1400, 0.6);
            return d.reverb(d.widen(horn, R, 0.3), { time: 1.5, mix: 0.5, damp: 0.45, seed: 241 + v });
        },
    },
    'pneumatic': {
        variants: 3, peak: -14, group: 'dock', mono: true,
        make: (v, R) => {
            const hiss = d.mul(d.bandpass(d.noise(0.8, R), d.line(0.8, [[0, 5200 - v * 600], [0.8, 2000]], 'exp'), 0.8), d.perc(0.8, 0.004, 0.16));
            const valve = strike(R, 0.1, [{ f: 310, t60: 0.06 }, { f: 720, t60: 0.04, gain: 0.6 }], { hard: 2500 });
            return d.reverb(d.widen(blend([hiss, 1], [valve, 0.7]), R, 0.5), { time: 1.4, mix: 0.4, seed: 251 + v });
        },
    },
    // Docking clamps closing on the hull.
    'dock-clamp': {
        variants: 1, peak: -4, group: 'flight', mono: true,
        make: (v, R) => {
            const clunk = () => d.drive(blend([thud(0.2, 110, 50, { tau: 0.05 }), 0.7], [strike(R, 0.4, modes(190, [1, 2.16, 3.45, 6.37], { t60: 0.35, falloff: 0.4 }), { hard: 2600 }), 1.2]), 1.5);
            const servo = d.mul(d.bandpass(d.osc(0.6, d.line(0.6, [[0, 92], [0.6, 70]]), 'saw'), 600, 2), d.swell(0.6, 0.3, 1, 1));
            const hiss = d.mul(d.highpass(d.noise(0.4, R), 3000), d.perc(0.4, 0.004, 0.1));
            return d.reverb(sequence(1.4, [[clunk(), 0, 1, -0.2], [clunk(), 0.22, 0.8, 0.2], [servo, 0.3, 0.2], [hiss, 0.95, 0.25]]), { time: 1.2, mix: 0.25, seed: 261 });
        },
    },

    // -------------------------------------------------- flight ambience
    // Distant rock collisions out in the belt.
    'rock-knock': {
        variants: 2, peak: -12, group: 'flight', mono: true,
        make: (v, R) => {
            const knock = d.lowpass(blend([thud(0.3, 70 + v * 8, 38, { tau: 0.07 }), 1], [burst(R, 0.2, { from: 900, to: 200, tau: 0.04 }), 0.6], [strike(R, 0.3, [{ f: R.range(90, 180), t60: 0.2 }], { hard: 900 }), 0.5]), 700);
            return d.reverb(d.widen(knock, R, 0.3), { time: 1.6, mix: 0.65, damp: 0.6, seed: 271 + v });
        },
    },
    // Dead hulls settling in the graveyard.
    'metal-groan': {
        variants: 2, peak: -13, group: 'flight', mono: true,
        make: (v, R) => {
            const T = 2.6, grip = d.wander(T, R, R.range(2.5, 5));
            const excitation = d.mul(d.noise(T, R, 'pink'), d.curve(T, (t) => Math.pow(Math.max(0, grip[Math.floor(t * d.SR)]), 2)));
            const frame = d.modal(excitation, modes(R.range(48, 95), [1, 1.52, 2.2, 3.1, 4.4], { t60: 1.4, falloff: 0.3 }), T);
            const bend = d.wander(T, R, 0.5);
            const bent = d.lowpass(d.resample(frame, d.curve(T, (t) => 1.0 + 0.09 * bend[Math.floor(t * d.SR)]), T * 0.93), 1400);
            return d.reverb(d.widen(d.mul(bent, d.swell(T * 0.93, 1.1, 1.5, 1.5)), R, 0.5), { time: 1.6, mix: 0.5, damp: 0.5, seed: 281 + v });
        },
    },
    // Deep-space "singing": a narrow, drifting tone like solar wind on the hull.
    'void-whisper': {
        variants: 2, peak: -15, group: 'flight', mono: true,
        make: (v, R) => {
            const T = 3.6, base = [392, 329.63, 440][v], drift = d.wander(T, R, 0.4);
            const voice = (ratio) => d.bandpass(d.noise(T, R, 'pink'), d.curve(T, (t) => base * ratio * (1 + 0.012 * drift[Math.floor(t * d.SR)])), 40);
            const tone = d.mul(blend([voice(1), 1], [voice(1.5), 0.6], [voice(2), 0.3]), d.swell(T, 1.6, 2, 2));
            return d.reverb(d.widen(tone, R, 0.8), { time: 1.6, mix: 0.45, seed: 291 + v });
        },
    },

    // -------------------------------------------------- music percussion
    'm-kick': {
        variants: 2, peak: -2, group: 'music',
        make: (v, R) => d.lowpass(d.drive(blend([thud(0.5, 120 - v * 12, 44, { sweep: 0.035, tau: 0.16 }), 1], [tick(R, { hz: 2500, ms: 1.5 }), 0.2]), 2), 5000),
    },
    // Large frame drum: the backbone of the combat score.
    'm-taiko': {
        variants: 3, peak: -2, group: 'music', mono: true,
        make: (v, R) => {
            const f0 = [70, 78, 64][v], ratios = [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.5], decays = [1.1, 0.6, 0.4, 0.35, 0.28, 0.22, 0.15];
            const skin = strike(R, 1.3, ratios.map((ratio, i) => ({ f: f0 * ratio, t60: decays[i], gain: 1 / (1 + i * 0.5), bend: i === 0 ? 0.25 : 0.08 })), { hard: 3500, ms: 5, click: 0.4 });
            const slap = d.mul(d.bandpass(d.noise(0.08, R), 1800, 1), d.perc(0.08, 0.001, 0.015));
            return d.reverb(d.widen(d.drive(blend([skin, 1], [slap, 0.7], [thud(0.3, f0 * 1.6, f0 * 0.8, { tau: 0.08 }), 0.4]), 1.8), R, 0.3), { time: 1.6, mix: 0.28, damp: 0.4, seed: 301 + v });
        },
    },
    'm-tom': {
        variants: 3, peak: -3, group: 'music', mono: true,
        make: (v, R) => {
            const f0 = [98, 123, 147][v];
            const skin = strike(R, 0.7, [1, 1.5, 2, 2.74].map((ratio, i) => ({ f: f0 * ratio, t60: [0.5, 0.3, 0.2, 0.12][i], gain: 1 / (1 + i * 0.6), bend: i === 0 ? 0.2 : 0.05 })), { hard: 4000, ms: 4, click: 0.5 });
            return d.reverb(d.widen(d.drive(skin, 1.5), R, 0.25), { time: 0.9, mix: 0.2, seed: 311 + v });
        },
    },
    'm-snare': {
        variants: 2, peak: -4, group: 'music',
        make: (v, R) => {
            const shell = strike(R, 0.2, [{ f: 185 + v * 12, t60: 0.12 }, { f: 330 + v * 20, t60: 0.09, gain: 0.6 }], { hard: 5000 });
            const wires = d.mul(d.bandpass(d.noise(0.26, R), 3500, 0.7), d.perc(0.26, 0.001, 0.06));
            return d.reverb(d.widen(d.highpass(d.drive(blend([shell, 0.8], [wires, 1]), 1.5), 150), R, 0.4), { time: 0.5, mix: 0.15, seed: 321 + v });
        },
    },
    'm-hat': {
        variants: 3, peak: -8, group: 'music',
        make: (v, R) => {
            const T = v === 2 ? 0.4 : 0.07, metal = d.sum(...[205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => d.osc(T, f * 1.62 * (1 + v * 0.03), 'square')));
            return d.mul(d.highpass(d.bandpass(metal, 9000, 0.8), 7000), d.perc(T, 0.0005, v === 2 ? 0.11 : 0.014 + v * 0.006));
        },
    },
    'm-shaker': {
        variants: 2, peak: -10, group: 'music',
        make: (v, R) => d.mul(d.highpass(d.noise(0.12, R), 5500), d.curve(0.12, (t) => t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / (0.02 + v * 0.015)))),
    },
    // Cinematic low hit: opens a fight or lands a story beat.
    'm-impact': {
        variants: 2, peak: -1.5, group: 'music', mono: true,
        make: (v, R) => {
            const boom = d.lowpass(d.drive(d.mul(d.osc(2, d.curve(2, (t) => 26 + (60 - v * 8 - 26) * Math.exp(-t / 0.2))), d.perc(2, 0.004, 0.5)), 2.5), 240);
            const clang = strike(R, 2.2, modes(55, [1, 2.4, 3.9, 5.3, 7.1], { t60: 2, falloff: 0.5, detune: 0.01, R }), { hard: 2400 });
            const mono = blend([boom, 0.8], [clang, 0.8], [burst(R, 0.7, { from: 5000, to: 300, sweep: 0.1, tau: 0.14 }), 0.8]);
            return d.reverb(d.widen(mono, R, 0.5, 140), { time: 2.4, mix: 0.35, damp: 0.5, seed: 331 + v });
        },
    },
    'm-riser': {
        variants: 1, peak: -6, group: 'music',
        make: (v, R) => {
            const T = 2.4;
            const band = d.mul(d.bandpass(d.noise(T, R, 'pink'), d.curve(T, (t, u) => 300 * Math.pow(30, u)), d.curve(T, (t, u) => 2 + 4 * u)), d.curve(T, (t, u) => u * u));
            const saws = d.mul(d.lowpass(d.sum(d.osc(T, d.curve(T, (t, u) => 110 * Math.pow(4, u)), 'saw'), d.osc(T, d.curve(T, (t, u) => 165.4 * Math.pow(4, u)), 'saw')), d.curve(T, (t, u) => 300 + 5000 * u * u)), d.curve(T, (t, u) => u * u));
            return d.fade(d.widen(blend([band, 1], [saws, 0.45]), R, 0.75), 0.01, 0.015);
        },
    },
    'm-rev-cym': {
        variants: 1, peak: -9, group: 'music',
        make: (v, R) => {
            const T = 1.6, metal = d.sum(...[205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => d.osc(T, f * 1.9, 'square')));
            const wash = d.mul(d.highpass(blend([metal, 0.5], [d.noise(T, R), 1]), 4000), d.perc(T, 0.002, 0.5));
            return d.fade(d.reverse(d.slice(d.reverb(d.widen(wash, R, 0.8), { time: 1.2, mix: 0.35, seed: 341 }), 0, T)), 0.02, 0.01);
        },
    },
    // Struck steel for the belt theme.
    'm-anvil': {
        variants: 2, peak: -8, group: 'music',
        make: (v, R) => d.reverb(d.widen(strike(R, 1.2, modes(R.range(520, 640), [1, 1.47, 2.09, 2.56, 3.4, 4.3], { t60: 0.9, falloff: 0.45, detune: 0.01, R }), { hard: 7000 }), R, 0.5), { time: 1.4, mix: 0.3, seed: 351 + v }),
    },
    'm-sub-drop': {
        variants: 1, peak: -3, group: 'music',
        make: () => d.drive(d.mul(d.osc(1.6, d.line(1.6, [[0, 82], [1.2, 28], [1.6, 26]], 'exp')), d.perc(1.6, 0.01, 0.5)), 1.8),
    },
    'm-rim': {
        variants: 1, peak: -10, group: 'music',
        make: (v, R) => strike(R, 0.1, [{ f: 1750, t60: 0.03 }, { f: 820, t60: 0.05, gain: 0.7 }], { hard: 6000, ms: 2 }),
    },
    // Muffled pulse for the stealth theme.
    'm-heart': {
        variants: 1, peak: -6, group: 'music',
        make: () => d.lowpass(thud(0.28, 62, 40, { sweep: 0.05, tau: 0.08, push: 1.3 }), 200),
    },
};
