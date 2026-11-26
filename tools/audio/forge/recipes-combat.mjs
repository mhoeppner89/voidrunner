// Combat, damage, movement and hyperdrive layers.
//
// These are *layers*, not finished events: the runtime (soundEvents.js)
// stacks them with the recorded bodies in assets/audio and picks variants at
// random, so a handful of small files yields many distinct results.
// Each recipe: { variants, peak (dBFS), group, loop?, make(variant, R) }.
import * as d from './dsp.mjs';
import { blend, tick, thud, burst, strike, modes, scatter } from './kit.mjs';

const BAR = [1, 2.76, 5.4, 8.93, 13.34, 18.64]; // free metal bar partials

export default {
    // ------------------------------------------------------------ weapons
    // Low-end recoil shared by every projectile weapon.
    'thump': {
        variants: 3, peak: -2, group: 'flight',
        make: (v, R) => blend([thud(0.26, [98, 86, 112][v], [42, 38, 47][v], { sweep: 0.035, tau: 0.06, push: 1.8 }), 1], [tick(R, { hz: 2500, ms: 2 }), 0.3]),
    },
    // Airy energy discharge that trails a laser bolt out into the stereo field.
    'energy-tail': {
        variants: 3, peak: -4, group: 'flight',
        make: (v, R) => {
            const T = 0.5, top = R.range(3600, 4600);
            const band = d.bandpass(d.noise(T, R, 'pink'), d.line(T, [[0, top], [0.12, 1500], [T, 480]], 'exp'), 3);
            const chirp = d.mul(d.fm(0.3, d.line(0.3, [[0, 2300 + v * 260], [0.3, 400]], 'exp'), 0.5, d.line(0.3, [[0, 3], [0.3, 0]])), d.perc(0.3, 0.002, 0.05));
            const mono = blend([d.mul(band, d.perc(T, 0.004, 0.11)), 1], [chirp, 0.3]);
            return d.reverb(d.widen(mono, R, 0.7), { time: 0.7, mix: 0.18, seed: 3 + v });
        },
    },
    // Hard, bright leading edge: gives the bolt its "snap" on small speakers.
    'laser-snap': {
        variants: 3, peak: -3, group: 'flight',
        make: (v, R) => {
            const T = 0.2, top = R.range(2600, 3300);
            const tone = d.bandpass(d.osc(T, d.line(T, [[0, top], [0.03, 900], [T, 250]], 'exp'), 'saw'), d.line(T, [[0, 3200], [T, 500]], 'exp'), 1.4);
            const low = d.mul(d.osc(T, d.line(T, [[0, 310], [T, 88]], 'exp')), d.perc(T, 0.001, 0.03));
            return d.drive(blend([d.mul(tone, d.perc(T, 0.001, 0.035)), 1], [low, 0.55]), 1.6);
        },
    },
    // Railgun: supersonic crack, electromagnetic discharge and a ringing barrel.
    'rail-crack': {
        variants: 2, peak: -1.5, group: 'flight',
        make: (v, R) => {
            const k = v ? 0.9 : 1;
            const crack = tick(R, { hz: 1800, ms: 4 });
            const zap = d.mul(d.bandpass(d.noise(0.35, R), d.line(0.35, [[0, 7200], [0.25, 300], [0.35, 200]], 'exp'), 5), d.perc(0.35, 0.001, 0.07));
            const ring = strike(R, 0.7, [{ f: 430 * k, t60: 0.5 }, { f: 1130 * k, t60: 0.35, gain: 0.7 }, { f: 1870 * k, t60: 0.22, gain: 0.5 }, { f: 2950 * k, t60: 0.15, gain: 0.4 }, { f: 4410 * k, t60: 0.1, gain: 0.3 }], { hard: 7000 });
            const whip = d.mul(d.osc(0.09, d.line(0.09, [[0, 3400], [0.09, 180]], 'exp')), d.perc(0.09, 0.0005, 0.02));
            const mono = d.drive(blend([crack, 1], [zap, 1], [ring, 0.6], [whip, 0.55], [thud(0.4, 88 * k, 34, { sweep: 0.05, tau: 0.1, push: 2 }), 0.45]), 1.5);
            return d.reverb(d.widen(mono, R, 0.5), { time: 1.1, mix: 0.2, damp: 0.3, seed: 21 + v });
        },
    },
    // Breech / feed mechanism cycling after a heavy shot.
    'mech-clack': {
        variants: 3, peak: -5, group: 'flight',
        make: (v, R) => {
            const k = [1, 0.88, 1.13][v], body = (gain) => modes(820 * k, [1, 2.32, 3.78, 5.73], { t60: 0.05 * gain, falloff: 0.5 });
            const out = d.silence(0.18);
            const first = strike(R, 0.1, body(1), { hard: 6000, ms: 2 }), second = strike(R, 0.1, body(0.8), { hard: 5000, ms: 2 });
            out.set(first.subarray(0, Math.min(first.length, out.length)));
            const offset = d.len(R.range(0.034, 0.046));
            for (let i = 0; i < second.length && i + offset < out.length; i += 1) out[i + offset] += second[i] * 0.7;
            return out;
        },
    },
    // Plasma mortar: a low "foomp" and a boiling, rising plasma body.
    'plasma-whoosh': {
        variants: 2, peak: -2.5, group: 'flight',
        make: (v, R) => {
            const T = 0.85, turbulence = d.wander(T, R, 32);
            const cutoff = d.curve(T, (t, u) => 480 + 950 * u + 340 * turbulence[Math.floor(t * d.SR)]);
            const plasma = d.mul(d.bandpass(d.noise(T, R, 'pink'), cutoff, 2.6), d.swell(T, 0.08, 1, 2.2));
            const mono = d.drive(blend([thud(0.4, 132 - v * 14, 46, { sweep: 0.06, tau: 0.11 }), 0.55], [plasma, 1], [burst(R, 0.2, { from: 3000, to: 500, tau: 0.04 }), 0.4]), 2);
            return d.reverb(d.widen(mono, R, 0.55), { time: 0.9, mix: 0.22, seed: 31 + v });
        },
    },
    // Ion cannon: ring-modulated static with an electrical flutter.
    'ion-sizzle': {
        variants: 3, peak: -4, group: 'flight',
        make: (v, R) => {
            const T = 0.45, carrier = d.osc(T, d.line(T, [[0, 1500 + v * 180], [T, 900]], 'exp'));
            const band = d.bandpass(d.mul(d.noise(T, R), carrier), 3200, 1.2);
            const flutter = d.curve(T, (t, u) => 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(Math.PI * (70 + 45 * u) * t)), 0.6));
            const whistle = d.mul(d.osc(0.3, d.line(0.3, [[0, 2900], [0.3, 1250]], 'exp')), d.perc(0.3, 0.004, 0.07));
            const mono = d.fold(blend([d.mul(d.mul(band, flutter), d.perc(T, 0.003, 0.12)), 1], [whistle, 0.22]), 0.9);
            return d.reverb(d.widen(mono, R, 0.75), { time: 0.6, mix: 0.16, seed: 41 + v });
        },
    },
    // Point-defence round: a tight mechanical snap with a little body.
    'pdc-tick': {
        variants: 3, peak: -4, group: 'flight',
        make: (v, R) => d.drive(blend([thud(0.08, 250 - v * 20, 105, { sweep: 0.012, tau: 0.014 }), 1], [burst(R, 0.05, { from: 6000, to: 1800, tau: 0.007, mode: 'bp', q: 1.2 }), 0.7]), 2),
    },
    // Scatter blast: the shotgun of the arsenal. Phone and laptop speakers
    // cannot reproduce much below 150 Hz, so the weight sits in a 220→90 Hz
    // punch and a 250 Hz chest body, with a hard muzzle crack on top and a
    // short slapback off the hull. The 40 Hz pressure tail stays for
    // headphones and desktops, but no longer eats the headroom.
    'ripper-blast': {
        variants: 2, peak: -2, group: 'flight',
        make: (v, R) => {
            const crack = blend([burst(R, 0.05, { from: 9000, to: 2000, sweep: 0.008, tau: 0.01, attack: 0.0004 }), 1], [tick(R, { hz: 2200, ms: 3 }), 0.7]);
            const blast = blend([burst(R, 0.42, { from: 7500, to: 500, sweep: 0.09, tau: 0.07 }), 1], [d.mul(d.bandpass(d.noise(0.3, R), 1200, 0.9), d.perc(0.3, 0.001, 0.06)), 0.7]);
            const punch = thud(0.22, 220 - v * 12, 90, { sweep: 0.035, tau: 0.045, attack: 0.0006, push: 3 });
            const body = d.mul(d.bandpass(d.noise(0.3, R, 'pink'), 250 + v * 20, 0.9), d.perc(0.3, 0.001, 0.09));
            const pressure = thud(0.45, 110 - v * 6, 42, { sweep: 0.03, tau: 0.12, attack: 0.001, push: 2 });
            const pellets = scatter(R, 0.3, 7, (r) => tick(r, { hz: 3200, ms: 2 }), { span: 0.09, shape: 1, spread: 0.8, fall: 0.4 });
            const mixed = d.drive(blend([crack, 0.7], [blast, 0.85], [punch, 1.3], [body, 1.1], [pressure, 0.6]), 2.6);
            // Shelve some sub away and lift the 300 Hz chest and 2.5 kHz bite small speakers carry.
            const mono = d.drive(d.eq(d.eq(d.eq(mixed, 'low', 70, -4), 'peak', 300, 5, 0.9), 'peak', 2500, 3, 1), 1.8);
            const out = d.canvas(0.6);
            d.place(out, d.widen(mono, R, 0.45)); d.place(out, pellets, 0.012, 0.35);
            // Slapback: a darker copy ~85 ms later, the "boom" of a big gun in a small space.
            d.place(out, d.widen(d.lowpass(mono, 900), R, 0.6), 0.085 + v * 0.01, 0.3);
            return d.reverb(out, { time: 0.6, mix: 0.15, seed: 51 + v });
        },
    },
    // Missile motor: ignition pop, then a roar that leaves down-range.
    'missile-ignite': {
        variants: 2, peak: -2.5, group: 'flight',
        make: (v, R) => {
            const T = 1.5, turbulence = d.wander(T, R, 26);
            const envelope = d.curve(T, (t) => (t < 0.07 ? t / 0.07 : Math.exp(-(t - 0.07) / 0.5)) * (0.72 + 0.28 * turbulence[Math.floor(t * d.SR)]));
            const roar = d.mul(d.bandpass(d.noise(T, R, 'pink'), d.line(T, [[0, 380], [0.15, 1400 + v * 200], [T, 480]], 'exp'), 0.9), envelope);
            const hiss = d.mul(d.highpass(d.noise(T, R), 4200), d.perc(T, 0.03, 0.22));
            const moving = d.resample(blend([roar, 1], [hiss, 0.28]), d.line(T, [[0, 1.12], [T * 0.9, 0.8]]), T * 0.95);
            const mono = d.drive(blend([moving, 1], [thud(0.2, 150, 58, { tau: 0.05 }), 0.6], [tick(R, { hz: 2000, ms: 3 }), 0.35]), 1.5);
            return d.reverb(d.widen(mono, R, 0.5), { time: 1.4, mix: 0.22, seed: 61 + v });
        },
    },
    // Soft missile ejection followed by motor wash; no launch concussion.
    // Keep missile-ignite unchanged: the magrail now uses that original sound.
    'missile-exhaust': {
        variants: 2, peak: -5, group: 'flight',
        make: (v, R) => {
            const T = 1.5, turbulence = d.wander(T, R, 26);
            const envelope = d.curve(T, (t) => Math.min(1, t / 0.18) * Math.exp(-Math.max(0, t - 0.18) / 0.46) * (0.82 + 0.18 * turbulence[Math.floor(t * d.SR)]));
            const roar = d.mul(d.bandpass(d.noise(T, R, 'pink'), d.line(T, [[0, 500], [0.2, 1500 + v * 180], [T, 480]], 'exp'), 0.85), envelope);
            const air = d.mul(d.highpass(d.noise(T, R), 3500), d.perc(T, 0.07, 0.22));
            const mono = d.drive(blend([roar, 1], [air, 0.2]), 1.3);
            return d.reverb(d.widen(mono, R, 0.5), { time: 1.1, mix: 0.16, seed: 65 + v });
        },
    },
    // Unpitched electrical discharge: no carrier notes or regular modulation.
    'beam-sizzle': {
        variants: 2, peak: -6, group: 'flight',
        make: (v, R) => {
            const T = 0.38, drift = d.wander(T, R, 31);
            const cutoff = d.curve(T, (t) => 1600 + v * 160 + 380 * drift[Math.floor(t * d.SR)]);
            const body = d.bandpass(d.noise(T, R, 'pink'), cutoff, 0.65);
            const air = d.highpass(d.noise(T, R), 4600);
            const flutter = d.curve(T, (t) => 0.82 + 0.18 * drift[Math.floor(t * d.SR)]);
            const envelope = d.curve(T, (t) => Math.min(1, t / 0.006) * Math.exp(-t / 0.105) * Math.min(1, (T - t) / 0.06));
            const mono = d.mul(d.mul(blend([body, 1], [air, 0.3]), flutter), envelope);
            return d.widen(d.drive(mono, 1.25), R, 0.4);
        },
    },

    // ------------------------------------------------------------ impacts
    // Struck hull plating heard from outside.
    'metal-clang': {
        variants: 4, peak: -3, group: 'flight',
        make: (v, R) => {
            const base = R.range(170, 230) * [1, 1.12, 0.9, 1.25][v];
            const plate = [...modes(base, BAR, { t60: 0.55, falloff: 0.9, detune: 0.015, R }), { f: base * R.range(3.1, 3.6), t60: 0.2, gain: 0.5 }, { f: base * R.range(6.2, 7.4), t60: 0.12, gain: 0.35 }];
            return d.drive(blend([strike(R, 0.7, plate, { hard: 6500 }), 1], [thud(0.12, 142, 68, { tau: 0.03 }), 0.45]), 1.4);
        },
    },
    // The same hit heard from inside the cockpit: dull, close and heavy.
    'hull-thud': {
        variants: 3, peak: -2, group: 'flight',
        make: (v, R) => {
            const body = strike(R, 0.4, [{ f: 138 - v * 9, t60: 0.25 }, { f: 211 + v * 12, t60: 0.18, gain: 0.7 }, { f: 333, t60: 0.1, gain: 0.4 }], { hard: 1200, click: 0.2 });
            return d.lowpass(d.drive(blend([thud(0.45, 84 - v * 5, 43, { sweep: 0.06, tau: 0.09 }), 1], [body, 0.9], [burst(R, 0.3, { from: 1400, to: 220, tau: 0.05 }), 0.6]), 1.6), 2400);
        },
    },
    // Loose cockpit fittings shaken by a hit.
    'rattle': {
        variants: 3, peak: -8, group: 'flight',
        make: (v, R) => scatter(R, 0.55, 9 + v * 3, (r) => d.modal(tick(r, { hz: 1500, ms: 1 }), [{ f: r.range(1400, 4200), t60: r.range(0.012, 0.03) }, { f: r.range(600, 1100), t60: 0.02, gain: 0.5 }], 0.06), { span: 0.4, shape: 1.6, spread: 0.85 }),
    },
    // Shield absorbing a hit: a glassy, falling energy ripple.
    'shield-zap': {
        variants: 3, peak: -4, group: 'flight',
        make: (v, R) => {
            const T = 0.5, top = R.range(1200, 1700);
            const bell = d.mul(d.fm(T, d.line(T, [[0, top], [T, top * 0.38]], 'exp'), 1.41, d.line(T, [[0, 7], [0.1, 2], [T, 0]])), d.perc(T, 0.002, 0.11));
            const ripple = d.modDelay(bell, d.line(T, [[0, 0.004], [T, 0.0005]]), 0.5, 0.5);
            const gate = d.curve(0.4, () => (R() < 0.012 ? 1 : 0));
            const sparkle = d.mul(d.mul(d.highpass(d.noise(0.4, R), 5200), d.lowpass(gate, 900)), d.perc(0.4, 0.001, 0.1));
            const mono = blend([ripple, 1], [sparkle, 0.5], [thud(0.14, 185, 88, { tau: 0.03 }), 0.32]);
            return d.reverb(d.widen(mono, R, 0.7), { time: 0.8, mix: 0.2, seed: 71 + v });
        },
    },
    // Shields failing: every partial falls and the field tears apart.
    'shield-collapse': {
        variants: 1, peak: -1.5, group: 'flight',
        make: (v, R) => {
            const out = d.canvas(1.3);
            for (let i = 0; i < 6; i += 1) {
                const T = R.range(0.5, 0.9), top = R.range(1200, 2600);
                const partial = d.mul(d.fm(T, d.line(T, [[0, top], [T, R.range(90, 180)]], 'exp'), 1.5, d.line(T, [[0, 5], [T, 0.3]])), d.perc(T, 0.004, 0.25));
                d.place(out, partial, R.range(0, 0.12), 0.5, R.bipolar() * 0.8);
            }
            const tear = burst(R, 1, { from: 9000, to: 120, sweep: 0.22, q: 2, tau: 0.22 });
            const crackle = scatter(R, 1.1, 26, (r) => tick(r, { hz: 4000, ms: 1.5 }), { span: 0.95, shape: 1.3 });
            d.place(out, d.widen(d.drive(blend([tear, 1], [thud(0.7, 96, 30, { sweep: 0.2, tau: 0.25, push: 2.2 }), 0.6]), 1.5), R, 0.5), 0, 1);
            d.place(out, crackle, 0.05, 0.45);
            return d.reverb(out, { time: 1.2, mix: 0.22, seed: 81 });
        },
    },
    // Shields coming back: the collapse inverted into a rising shimmer.
    'shield-restore': {
        variants: 1, peak: -7, group: 'flight',
        make: (v, R) => {
            const out = d.canvas(1);
            for (const [from, to, pan] of [[330, 659.26, -0.5], [440, 880, 0.5], [220, 1318.5, 0]]) {
                const T = 0.62, partial = d.mul(d.fm(T, d.line(T, [[0, from], [T, to]], 'exp'), 2, d.line(T, [[0, 0.4], [T, 2.2]])), d.swell(T, 0.52, 2, 1));
                d.place(out, partial, 0, 0.5, pan);
            }
            const air = d.mul(d.highpass(d.noise(0.6, R), 4800), d.swell(0.6, 0.5, 2.5, 1));
            const ping = d.mul(d.fm(0.4, 1318.5, 3.5, d.line(0.4, [[0, 1.6], [0.4, 0]])), d.perc(0.4, 0.003, 0.1));
            d.place(out, d.widen(air, R, 0.8), 0, 0.12); d.place(out, ping, 0.58, 0.55);
            return d.reverb(out, { time: 0.9, mix: 0.22, seed: 91 });
        },
    },
    // Electrical arcing from damaged systems.
    'spark': {
        variants: 4, peak: -6, group: 'flight',
        make: (v, R) => {
            const out = d.canvas(0.4);
            for (let cluster = 0; cluster < 2 + (v % 2); cluster += 1) {
                const start = R.range(0, 0.22);
                for (let i = 0; i < 6 + v * 2; i += 1)
                    d.place(out, d.bandpass(tick(R, { hz: 2500, ms: 1.2 }), R.range(3000, 7000), 3), start + R.range(0, 0.07), R.range(0.4, 1), R.bipolar() * 0.7);
                const buzz = d.mul(d.highpass(d.osc(0.07, R.range(95, 125), 'saw'), 1200), d.perc(0.07, 0.002, 0.02));
                d.place(out, buzz, start, 0.4, R.bipolar() * 0.4);
            }
            return out;
        },
    },
    // Explosion sub: the pressure wave you feel more than hear.
    'sub-boom': {
        variants: 3, peak: -1, group: 'flight',
        make: (v, R) => {
            const T = 1.8, top = [64, 56, 72][v];
            const boom = d.lowpass(d.drive(d.mul(d.osc(T, d.curve(T, (t) => 24 + (top - 24) * Math.exp(-t / 0.18))), d.perc(T, 0.004, 0.42)), 2.5), 220);
            return blend([boom, 1], [d.mul(d.lowpass(d.noise(T, R, 'brown'), 110), d.perc(T, 0.02, 0.5)), 0.55]);
        },
    },
    // Explosion front edge: dense, saturated, over in a blink.
    'blast-crack': {
        variants: 3, peak: -1.5, group: 'flight',
        make: (v, R) => d.drive(blend([burst(R, 0.4, { from: 11000 - v * 1500, to: 600, sweep: 0.03, tau: 0.05, attack: 0.0006 }), 1], [d.mul(d.bandpass(d.noise(0.4, R), 900 - v * 120, 1), d.perc(0.4, 0.002, 0.08)), 0.7]), 3),
    },
    // Debris and secondary crackle settling after a blast.
    'debris-tail': {
        variants: 2, peak: -5, group: 'flight',
        make: (v, R) => {
            const T = 2.2;
            const grains = scatter(R, T, 80 + v * 20, (r) => r() < 0.5
                ? d.modal(tick(r, { hz: 1200, ms: 1 }), [{ f: r.range(300, 5000), t60: r.range(0.01, 0.06) }], 0.08)
                : d.mul(d.bandpass(d.noise(0.03, r), r.range(600, 4000), 2), d.perc(0.03, 0.001, r.range(0.004, 0.012))), { span: 2, shape: 2, fall: 1.5 });
            const rumble = d.mul(d.lowpass(d.noise(T, R, 'brown'), d.line(T, [[0, 260], [T, 70]], 'exp')), d.perc(T, 0.03, 0.8));
            d.place(grains, d.widen(rumble, R, 0.4, 120), 0, 0.3);
            return d.reverb(grains, { time: 1.2, mix: 0.25, seed: 101 + v });
        },
    },
    // A slow pressure wash that rolls past after a big, close detonation.
    'shockwave': {
        variants: 2, peak: -4, group: 'flight', mono: true,
        make: (v, R) => {
            const T = 2.8, envelope = d.swell(T, 0.4 + v * 0.1, 1.5, 2.2);
            const wash = d.mul(d.lowpass(d.noise(T, R, 'brown'), d.line(T, [[0, 50], [0.5, 420], [T, 60]], 'exp'), 1.1), envelope);
            const [left, right] = d.widen(blend([wash, 1], [d.mul(d.osc(T, 38), envelope), 0.6]), R, 0.8, 120);
            const drift = d.wander(T, R, 0.7);
            return [d.mul(left, d.curve(T, (t) => 0.8 + 0.2 * drift[Math.floor(t * d.SR)])), d.mul(right, d.curve(T, (t) => 0.8 - 0.2 * drift[Math.floor(t * d.SR)]))];
        },
    },
    // Shot striking rock: gravel spray over a dull knock.
    'rock-crumble': {
        variants: 3, peak: -4, group: 'flight', mono: true,
        make: (v, R) => {
            const grains = scatter(R, 0.8, 34 + v * 6, (r) => d.mul(d.bandpass(d.noise(0.04, r), r.range(500, 3200), 2.5), d.perc(0.04, 0.001, r.range(0.004, 0.014))), { span: 0.6, shape: 1.5 });
            d.place(grains, blend([thud(0.2, 92, 50, { tau: 0.04 }), 1], [burst(R, 0.15, { from: 1400, to: 300, tau: 0.03 }), 0.8]), 0, 1.1);
            return grains;
        },
    },
    // A capital hull breaking up: stick-slip groans and secondary detonations.
    'capital-groan': {
        variants: 1, peak: -4, group: 'flight',
        make: (v, R) => {
            const T = 3.8, out = d.canvas(T);
            for (let voice = 0; voice < 3; voice += 1) {
                const grip = d.wander(T, R, R.range(4, 8));
                const excitation = d.mul(d.noise(T, R, 'pink'), d.curve(T, (t) => Math.pow(Math.max(0, grip[Math.floor(t * d.SR)]), 2)));
                const groan = d.modal(excitation, modes(R.range(55, 120), [1, 1.48, 2.1, 2.9, 3.7], { t60: 1.1, falloff: 0.3 }), T);
                const bend = d.wander(T, R, 0.6);
                const bent = d.resample(groan, d.curve(T, (t) => 0.97 + 0.12 * bend[Math.floor(t * d.SR)]), T);
                d.place(out, d.mul(bent, d.swell(T, R.range(0.8, 2.2), 1.5, 1.5)), 0, 0.6, R.bipolar() * 0.7);
            }
            for (let i = 0; i < 3 + v; i += 1) {
                const boom = d.drive(blend([thud(0.7, R.range(60, 85), 28, { sweep: 0.12, tau: 0.2 }), 1], [burst(R, 0.3, { from: 6000, to: 500, tau: 0.06 }), 1]), 2.2);
                d.place(out, boom, R.range(0.4, 2.8), R.range(0.45, 0.75), R.bipolar() * 0.8);
            }
            const shriek = d.mul(d.bandpass(d.noise(1.4, R), d.line(1.4, [[0, R.range(900, 1500)], [1.4, 520]], 'exp'), 14), d.swell(1.4, 0.5, 2, 2));
            d.place(out, shriek, R.range(0.6, 2), 0.3, R.bipolar() * 0.6);
            return d.reverb(out, { time: 1.8, mix: 0.3, damp: 0.45, seed: 111 + v });
        },
    },

    // ----------------------------------------------------------- movement
    // A ship tearing past the canopy, doppler baked in.
    'flyby': {
        variants: 4, peak: -3, group: 'flight',
        make: (v, R) => {
            const T = 1.4, center = 0.62, width = [0.09, 0.07, 0.12, 0.08][v], base = [92, 118, 74, 140][v];
            const doppler = d.curve(T, (t) => 1 - 0.2 * Math.tanh((t - center) / width));
            const pitch = (ratio) => d.curve(T, (t, u) => base * ratio * doppler[Math.floor(t * d.SR)]);
            const engine = blend([d.osc(T, pitch(1), 'saw'), 1], [d.osc(T, pitch(1.503), 'saw'), 0.6], [d.osc(T, pitch(0.5), 'square'), 0.5]);
            const wash = d.bandpass(d.noise(T, R, 'pink'), d.curve(T, (t) => 800 * doppler[Math.floor(t * d.SR)]), 0.8);
            const turbulence = d.wander(T, R, 30);
            const loudness = d.curve(T, (t) => Math.pow(1 / (1 + Math.pow((t - center) / (width * 1.1), 2)), 1.2) * (0.8 + 0.2 * turbulence[Math.floor(t * d.SR)]));
            const opened = d.lowpass(blend([engine, 0.75], [wash, 1]), d.curve(T, (t) => 500 + 5500 * loudness[Math.floor(t * d.SR)]), 0.8);
            return d.drive(d.mul(opened, loudness), 1.4);
        },
    },
    // A round passing close to the canopy.
    'whizz': {
        variants: 4, peak: -5, group: 'flight',
        make: (v, R) => {
            const T = 0.32, center = 0.13, width = 0.018, top = [3400, 2400, 4600, 1800][v];
            const doppler = d.curve(T, (t) => 1 - 0.35 * Math.tanh((t - center) / width));
            const band = d.bandpass(d.noise(T, R), d.curve(T, (t) => top * doppler[Math.floor(t * d.SR)]), 9);
            const tone = d.osc(T, d.curve(T, (t) => top * 0.5 * doppler[Math.floor(t * d.SR)]), 'saw');
            return d.mul(blend([band, 1], [tone, 0.12]), d.curve(T, (t) => 1 / (1 + Math.pow((t - center) / (width * 1.3), 2))));
        },
    },
    // Afterburner lighting: fuel dump, whoomp, crackle.
    'ab-ignite': {
        variants: 2, peak: -2.5, group: 'flight', mono: true,
        make: (v, R) => {
            const T = 1.2;
            const whoomp = d.mul(d.lowpass(d.noise(T, R, 'pink'), d.line(T, [[0, 90], [0.09, 2400 + v * 400], [T, 500]], 'exp'), 1.2), d.curve(T, (t) => t < 0.06 ? Math.pow(t / 0.06, 2) : Math.exp(-(t - 0.06) / 0.35)));
            const gate = d.lowpass(d.curve(0.6, () => (R() < 0.02 ? 1 : 0)), 1200);
            const crackle = d.mul(d.mul(d.highpass(d.noise(0.6, R), 3000), gate), d.perc(0.6, 0.01, 0.2));
            const mono = d.drive(blend([whoomp, 1], [thud(0.5, 76, 38, { sweep: 0.12, tau: 0.16 }), 0.5], [crackle, 0.5]), 1.8);
            return d.widen(mono, R, 0.6);
        },
    },
    // Afterburner cutting out: the flame collapses with a soft breath.
    'ab-off': {
        variants: 1, peak: -6, group: 'flight', mono: true,
        make: (v, R) => d.widen(blend([d.mul(d.lowpass(d.noise(0.8, R, 'pink'), d.line(0.8, [[0, 1600], [0.6, 110]], 'exp')), d.perc(0.8, 0.01, 0.2)), 1], [d.mul(d.osc(0.5, d.line(0.5, [[0, 120], [0.5, 45]], 'exp')), d.perc(0.5, 0.01, 0.15)), 0.35]), R, 0.6),
    },
    // Reactor sub: integer cycle counts keep the periodic part seamless.
    'loop-engine-sub': {
        variants: 1, peak: -4, group: 'flight', loop: true,
        make: (v, R) => {
            const P = 4, tone = d.curve(P, (t) => (Math.sin(2 * Math.PI * 38 * t) + 0.55 * Math.sin(2 * Math.PI * 57 * t + 0.6) + 0.35 * Math.sin(2 * Math.PI * 76.25 * t)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t)) * (0.9 + 0.1 * Math.sin(2 * Math.PI * 0.75 * t + 1)));
            const rumble = d.makeLoop(d.lowpass(d.noise(P + 0.5, R, 'brown'), 95), 0.5);
            return blend([d.drive(tone, 1.3), 1], [rumble, 0.5]);
        },
    },
    // Turbine whine: pitched by the runtime as the reactor spools.
    'loop-engine-whine': {
        variants: 1, peak: -8, group: 'flight', loop: true,
        make: (v, R) => {
            const P = 3, vibrato = (t) => 0.9 * Math.sin(2 * Math.PI * 2 * t);
            const stack = d.curve(P, (t) => (Math.sin(2 * Math.PI * 440 * t + vibrato(t)) + 0.5 * Math.sin(2 * Math.PI * (880 + 1 / 3) * t + 1.3 * vibrato(t)) + 0.28 * Math.sin(2 * Math.PI * (1320 + 2 / 3) * t) + 0.14 * Math.sin(2 * Math.PI * (2200 + 1 / 3) * t)) * (0.88 + 0.12 * Math.sin(2 * Math.PI * (7 / 3) * t)));
            const air = d.makeLoop(d.bandpass(d.noise(P + 0.4, R), 3000, 1), 0.4);
            return blend([stack, 1], [air, 0.5]);
        },
    },
    // Afterburner roar: wide, turbulent, decorrelated between the ears.
    'loop-ab-roar': {
        variants: 1, peak: -4, group: 'flight', loop: true,
        make: (v, R) => {
            const T = 4.5, turbulence = d.wander(T, R, 14);
            const roar = d.mul(d.lowpass(blend([d.noise(T, R, 'pink'), 1], [d.noise(T, R, 'brown'), 0.8]), 950, 0.9), d.curve(T, (t) => 0.75 + 0.25 * turbulence[Math.floor(t * d.SR)]));
            return d.makeLoop(d.widen(d.drive(roar, 1.5), R, 0.85, 150), 0.5);
        },
    },

    // ---------------------------------------------------------- hyperdrive
    'hyper-charge': {
        variants: 1, peak: -3, group: 'flight',
        make: (v, R) => {
            const T = 2;
            const band = d.mul(d.bandpass(d.noise(T, R, 'pink'), d.curve(T, (t, u) => 180 * Math.pow(40, u)), d.curve(T, (t, u) => 1 + 5 * u)), d.curve(T, (t, u) => Math.pow(u, 1.6)));
            const tones = d.sum(...[110, 165, 220, 330].map((f, i) => d.scale(d.osc(T, d.curve(T, (t, u) => f * Math.pow(6, u)), i % 2 ? 'saw' : 'sine'), i % 2 ? 0.25 : 0.5)));
            let phase = 0;
            const tremolo = d.curve(T, (t, u) => { phase += (5 + 28 * u * u) / d.SR; return 0.6 + 0.4 * Math.sin(2 * Math.PI * phase); });
            const sub = d.mul(d.osc(T, d.line(T, [[0, 40], [T, 72]])), d.curve(T, (t, u) => u * u));
            const mono = blend([d.mul(blend([band, 1], [d.mul(d.lowpass(tones, 4200), d.curve(T, (t, u) => u * u)), 0.55]), tremolo), 1], [sub, 0.3]);
            return d.fade(d.widen(mono, R, 0.7), 0.01, 0.012);
        },
    },
    'hyper-engage': {
        variants: 1, peak: -1, group: 'flight',
        make: (v, R) => {
            const T = 2.4;
            const blast = d.mul(d.lowpass(d.noise(T, R), d.line(T, [[0, 12000], [0.25, 2500], [2.2, 200]], 'exp')), d.perc(T, 0.002, 0.5));
            const streak = d.resample(d.mul(d.bandpass(d.noise(2.2, R, 'pink'), d.line(2.2, [[0, 6000], [1.6, 300]], 'exp'), 6), d.perc(2.2, 0.01, 0.45)), d.line(1.8, [[0, 1.3], [1.8, 0.75]]), 1.8);
            const stretch = d.mul(d.fm(1.2, d.line(1.2, [[0, 1800], [1.2, 60]], 'exp'), 1.5, d.line(1.2, [[0, 4], [1.2, 0.5]])), d.perc(1.2, 0.004, 0.3));
            const mono = d.drive(blend([thud(1.2, 110, 26, { sweep: 0.25, tau: 0.5, push: 2.4 }), 0.6], [blast, 1], [streak, 0.9], [stretch, 0.45]), 1.6);
            return d.reverb(d.widen(mono, R, 0.8, 140), { time: 2.2, mix: 0.28, seed: 121 });
        },
    },
    'hyper-exit': {
        variants: 1, peak: -2, group: 'flight', mono: true,
        make: (v, R) => {
            const T = 1.4, land = 0.38;
            const decel = d.mul(d.bandpass(d.noise(T, R, 'pink'), d.line(T, [[0, 5200], [land, 260], [T, 200]], 'exp'), 3), d.curve(T, (t) => t < land ? Math.pow(t / land, 1.5) : Math.exp(-(t - land) / 0.12)));
            const arrive = d.silence(T);
            const hit = d.drive(blend([thud(0.7, 92, 34, { sweep: 0.1, tau: 0.2, push: 2 }), 0.7], [burst(R, 0.6, { from: 4200, to: 300, sweep: 0.1, tau: 0.16 }), 1]), 1.6);
            arrive.set(hit.subarray(0, Math.min(hit.length, arrive.length - d.len(land))), d.len(land));
            return d.reverb(d.widen(blend([decel, 1], [arrive, 1]), R, 0.7, 140), { time: 1.4, mix: 0.25, seed: 131 });
        },
    },
    // In-transit bed: a deep fifth under a slowly flanging slipstream.
    'loop-hyper-tunnel': {
        variants: 1, peak: -6, group: 'flight', loop: true,
        make: (v, R) => {
            const P = 4, T = P + 0.8;
            const drone = d.curve(P, (t) => (Math.sin(2 * Math.PI * 55 * t) + 0.6 * Math.sin(2 * Math.PI * 82.5 * t + 1) + 0.35 * Math.sin(2 * Math.PI * (110 + 1 / 4) * t)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * (1 / 2) * t)));
            const side = (phase) => {
                const wind = d.bandpass(d.noise(T, R, 'pink'), d.curve(T, (t) => 700 + 450 * Math.sin(2 * Math.PI * t / P + phase)), 1.4);
                const shimmer = d.modDelay(d.highpass(d.noise(T, R), 2200), d.curve(T, (t) => 0.0035 + 0.0025 * Math.sin(2 * Math.PI * 2 * t / P + phase)), 0.7, 0.6);
                return d.makeLoop(blend([wind, 1], [shimmer, 0.35]), 0.8);
            };
            const left = side(0), right = side(2.1), low = d.drive(drone, 1.2);
            return [blend([low, 0.6], [left, 1]), blend([low, 0.6], [right, 1])];
        },
    },
};
