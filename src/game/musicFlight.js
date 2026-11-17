import { clamp } from './random.js';
import { hits, phrase, section } from './musicKit.js';

// Flight scores outside open space: near planets, in the belts, in the
// graveyard, running dark and in combat. `regions` weights a piece by the
// nearest location id, `systems` by star system; anything else weighs 1.
// Combat pieces read `m.tier` (0/1/2) and name the chord the fight
// resolves to when it ends (`resolve`).

const lowPan = [-0.45, 0.35, -0.15, 0.45, 0, -0.3];

// ------------------------------------------------------------------ planets

const PLANET = [
    [38, [45, 50, 53, 60, 64]], [34, [46, 50, 53, 57]], [31, [43, 46, 50, 53, 57]], [33, [45, 48, 52, 55]],
];
const PLANET_SCALE = [50, 53, 55, 57, 60, 62, 65, 67];
const planetWind = {
    id: 'planet-wind', context: 'planet', title: 'Planetfall', tempo: 66,
    note: 'The original planet theme: a low drone, warm plucked phrases that repeat and mutate, a frame drum far away and wind between the notes.',
    bar(m, at, g) {
        const index = m.bar % PLANET.length, [bass, chord] = PLANET[index], beat = m.beat, level = m.intensity, state = g.state;
        m.pad(at, bass, m.barSeconds, 0.09 * level, { cutoff: 300, attack: 1, release: 1.8, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => m.pad(at + voice * 0.15, midi, m.barSeconds, 0.022 * level, { cutoff: 1000, attack: 1.2, release: 2, pan: [-0.45, 0.3, -0.15, 0.45, 0][voice], wet: 0.6 }));
        // A four-bar motif is written once, then varied: repetition is what makes it a tune.
        if (!state.motif || (m.bar % 8 === 0 && m.chance(0.6)))
            state.motif = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => (m.chance(0.42) ? Math.floor(m.random() * PLANET_SCALE.length) : -1)));
        state.motif[index].forEach((degree, step) => {
            if (degree < 0 || m.chance(0.12)) return;
            const midi = PLANET_SCALE[m.chance(0.15) ? clamp(degree + (m.chance(0.5) ? 1 : -1), 0, PLANET_SCALE.length - 1) : degree];
            m.pluck(at + step * beat * 0.5, midi, m.range(0.036, 0.05) * level, { decay: m.range(1.2, 1.8), attack: 0.035, cutoff: 1500, pan: [-0.5, 0.2, 0.5, -0.3][step % 4], echo: 0.4, wet: 0.5 });
        });
        if (m.bar % 2 === 0) {
            m.drum(at, 'm-taiko', 0.11 * level, { rate: 1.12, wet: 0.7, pan: -0.2 });
            m.air(at + beat, m.barSeconds * 1.2, m.range(0.03, 0.045), { frequency: m.range(380, 620), pan: m.range(-0.4, 0.4) });
        }
        if (m.chance(0.5)) m.drum(at + beat * 2.5, 'm-tom', 0.06, { rate: 0.9, wet: 0.6, pan: 0.3 });
    },
    end(m, at, sting) {
        [38, 50, 57, 62, 65].forEach((midi, voice) => m.pad(at + voice * 0.15, midi, 4, voice ? 0.022 : 0.08, { cutoff: voice ? 1000 : 300, attack: 1.2, release: 3.5, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.7 }, sting));
    },
};

// Pastoral 6/8 over a living world: hand drums, a plucked tune that is
// written once and then varied, warm strings.
const TRADE = [
    [33, [49, 52, 57, 61]], [33, [50, 55, 59, 62]], [33, [50, 54, 57, 62]], [33, [49, 52, 57, 61]],
    [30, [49, 52, 57, 61]], [38, [50, 54, 57, 62]], [40, [52, 57, 59, 64]], [40, [52, 56, 59, 64]],
];
const TRADE_SCALE = [57, 59, 61, 62, 64, 66, 67, 69, 71, 73];
const TRADE_HAND = hits('x.ox.o');
const tradeWinds = {
    id: 'planet-trade-winds', context: 'planet', trim: 1.29, title: 'Trade Winds', tempo: 150, beats: 6, echo: 1.5, regions: { vesper: 3, azure: 2 },
    note: 'Pastoral 6/8 in A mixolydian for the living worlds (favoured at Vesper and Azure): hand drums, a plucked tune written once and then varied, warm strings and wind.',
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = TRADE[index], beat = m.beat, level = m.intensity, state = g.state, part = section(m);
        m.pad(at, bass, m.barSeconds, 0.08 * level, { cutoff: 300, attack: 0.8, release: 1.6, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => m.strings(at + voice * 0.08, midi, m.barSeconds, 0.018 * level, { attack: 1, release: 1.6, cutoff: 1400, pan: lowPan[voice], wet: 0.55 }));
        if (!state.tune || (m.bar % 16 === 0 && m.chance(0.5)))
            state.tune = Array.from({ length: 8 }, (_, bar) => Array.from({ length: 6 }, (_, step) => (step === 0 || m.chance(0.38) ? 2 + Math.floor(m.random() * 7) - (bar === 7 && step > 2 ? 9 : 0) : -1)));
        if (part !== 0) state.tune[index].forEach((degree, step) => {
            if (degree < 0 || (step && m.chance(0.1))) return;
            const midi = TRADE_SCALE[clamp(degree + (m.chance(0.12) ? m.pick([-1, 1]) : 0), 0, TRADE_SCALE.length - 1)];
            m.pluck(at + step * beat, midi, m.range(0.034, 0.046) * level, { decay: 1.3, cutoff: 1500, pan: [-0.4, 0.2, 0.4, -0.2, 0.1, -0.3][step], echo: 0.3, wet: 0.45 });
        });
        for (const [step, weight] of TRADE_HAND) m.drum(at + step * beat, 'm-hand', 0.1 * weight * level, { rate: weight === 1 ? 0.95 : 1.1, pan: step < 3 ? -0.25 : 0.25, wet: 0.3 });
        m.drum(at, 'm-frame', 0.1 * level, { rate: 1, wet: 0.4 });
        if (index % 4 === 0) m.air(at, m.barSeconds * 2, 0.035, { frequency: m.range(420, 700), pan: m.range(-0.5, 0.5) });
    },
    end(m, at, sting) {
        [33, 49, 52, 57, 64].forEach((midi, voice) => m.strings(at + voice * 0.1, midi, 4, voice ? 0.022 : 0.05, { attack: 1, release: 3.5, cutoff: voice ? 1400 : 450, pan: lowPan[voice], wet: 0.7 }, sting));
    },
};

// Looking down on a whole world: an E lydian choir, rising low mallets and
// strong wind.
const ALTITUDE = [
    [40, [51, 56, 59, 66]], [40, [49, 54, 58, 61]], [40, [51, 56, 59, 66]], [40, [49, 54, 58, 61]],
    [37, [52, 56, 59, 61]], [33, [49, 52, 56, 61]], [35, [52, 54, 59, 61]], [35, [51, 54, 59, 63]],
];
const highAltitude = {
    id: 'planet-high-altitude', context: 'planet', trim: 1.11, title: 'High Altitude', tempo: 58, regions: { 'meridian-prime': 3, azure: 2 },
    note: 'A world seen from orbit (favoured at Meridian Prime and Azure): an E lydian choir, rising low mallet arpeggios, strings and strong wind.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = ALTITUDE[index], beat = m.beat, level = m.intensity, part = section(m);
        m.pad(at, bass, m.barSeconds * 1.03, 0.08 * level, { cutoff: 300, attack: 1.4, release: 2, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => m.choir(at + voice * 0.15, midi, m.barSeconds, 0.018 * level, { vowel: part === 2 ? 'oo' : 'ah', attack: 1.6, release: 2.2, pan: lowPan[voice], wet: 0.75 }));
        if (part >= 1) [0, 1, 2, 3, 2, 3, 1, 2].forEach((voice, step) => {
            if (step && m.chance(0.12)) return;
            m.mallet(at + step * beat * 0.5, chord[voice] - (step < 2 ? 12 : 0), (step === 0 ? 0.034 : 0.024) * level, { decay: 1.3, pan: voice % 2 ? 0.4 : -0.4, echo: 0.3, wet: 0.5 });
        });
        if (part === 3) m.strings(at, chord[3] + 12, m.barSeconds, 0.016 * level, { attack: 1.4, release: 2, cutoff: 2000, pan: 0.2, wet: 0.7 });
        if (m.bar % 2 === 0) m.air(at, m.barSeconds * 1.6, m.range(0.035, 0.05), { frequency: m.range(450, 800), pan: m.range(-0.5, 0.5) });
        if (index === 0) m.drum(at, 'm-taiko', 0.08 * level, { rate: 1.05, wet: 0.8 });
    },
    end(m, at, sting) {
        [40, 51, 56, 59, 66].forEach((midi, voice) => m.choir(at + voice * 0.15, midi, 4, voice ? 0.02 : 0.03, { vowel: 'ah', attack: 1.4, release: 3.5, pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// A frozen world: F-sharp minor in low strings and hum, glass flecks,
// a drum heard from far away, the wind doing most of the work.
const FROST = [
    [30, [45, 49, 54, 57]], [26, [45, 50, 54, 57]], [35, [47, 50, 54, 59]], [37, [49, 54, 56, 61]],
    [30, [45, 49, 54, 57]], [26, [45, 50, 54, 57]], [35, [47, 50, 54, 59]], [37, [49, 53, 56, 61]],
];
const frostline = {
    id: 'planet-frostline', context: 'planet', title: 'Frostline', tempo: 50, regions: { boreal: 3 }, weight: 0.5,
    note: 'A frozen world (favoured at Boreal): F-sharp minor in low strings and a hummed choir, flecks of glass, a far-off drum and a high wind.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = FROST[index], beat = m.beat, level = m.intensity;
        m.pad(at, bass + 12, m.barSeconds * 1.03, 0.075 * level, { cutoff: 260, attack: 1.6, release: 2.4, wave: 'bass', wet: 0.35, detune: 3 });
        chord.forEach((midi, voice) => m.strings(at + voice * 0.25, midi, m.barSeconds, 0.02 * level, { attack: 2, release: 2.6, cutoff: 1000, pan: lowPan[voice], wet: 0.7, vibrato: 6 }));
        if (index % 2 === 0) m.choir(at + beat, chord[0], m.barSeconds * 1.8, 0.022 * level, { vowel: 'mm', attack: 2, release: 2.6, pan: -0.2, wet: 0.7 });
        if (m.chance(0.55)) m.pad(at + m.range(0.4, m.barSeconds - 1), m.pick([69, 73, 76, 78]), m.range(1.6, 2.6), 0.01 * level, { cutoff: 2600, attack: 1.2, release: 2, wave: 'glass', pan: m.range(-0.7, 0.7), wet: 1 });
        if (m.bar % 2 === 1) m.drum(at + beat * 2, 'm-frame', 0.08 * level, { rate: 0.75, wet: 0.9, pan: m.range(-0.3, 0.3) });
        m.air(at, m.barSeconds * 1.2, m.range(0.03, 0.045), { frequency: m.range(1100, 1900), q: 1.2, pan: m.range(-0.6, 0.6) });
    },
    end(m, at, sting) {
        [30, 45, 49, 54, 61].forEach((midi, voice) => m.strings(at + voice * 0.2, midi + (voice ? 0 : 12), 5, voice ? 0.022 : 0.04, { attack: 1.6, release: 4, cutoff: voice ? 1000 : 400, pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// ------------------------------------------------------------------- fields

const fieldSteel = {
    id: 'field-steel', context: 'field', title: 'Struck Steel', tempo: 100, trim: 1.8, regions: { shardbelt: 2 },
    note: 'The original belt theme: a nervous low pulse, struck steel ringing through the delay and semitone clusters hanging overhead.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { type: 'sawtooth', detune: 6, q: 2 }); },
    bar(m, at, g) {
        const beat = m.beat, level = m.intensity;
        const accents = [1, 0, 0.7, 0.55, 0, 0.8, 0, 0.6];
        accents.forEach((accent, step) => {
            if (!accent && m.chance(0.75)) return;
            const midi = step === 7 && m.chance(0.4) ? 29 : step === 4 && m.chance(0.2) ? 26 : 28;
            g.bass.note(at + step * beat * 0.5, midi + 12, beat * 0.28, (0.05 + 0.05 * accent) * level, 240 + 260 * accent);
        });
        if (m.bar % 2 === 0) {
            const cluster = m.pick([[52, 53, 59], [52, 55, 58], [50, 53, 57], [52, 54, 59]]);
            cluster.forEach((midi, voice) => m.pad(at, midi + 12, m.barSeconds * 2, 0.017 * level, { cutoff: 1900, attack: 1.3, release: 2, wave: 'glass', pan: [-0.5, 0.5, 0][voice], wet: 0.8 }));
        }
        for (let hitCount = m.chance(0.45) ? 2 : 1; hitCount > 0; hitCount -= 1)
            m.drum(at + Math.floor(m.random() * 16) * beat * 0.25, 'm-anvil', m.range(0.07, 0.12) * level, { rate: m.pick([1, 1.189, 1.335, 0.891, 0.75]), pan: m.range(-0.7, 0.7), wet: 0.6, echo: 0.55 });
        for (let step = 0; step < 16; step += 1)
            if (m.chance(0.3)) m.drum(at + step * beat * 0.25, 'm-rim', m.range(0.03, 0.055), { pan: step % 2 ? 0.45 : -0.45, rate: m.range(0.9, 1.2), echo: 0.2 });
        for (const step of [1, 3, 5, 7]) m.drum(at + step * beat * 0.5, 'm-hat', 0.035, { pan: 0.2 });
        m.drum(at, 'm-heart', 0.2 * level); m.drum(at + beat * 2, 'm-heart', 0.15 * level);
    },
    end(m, at, sting) {
        [52, 53, 59].forEach((midi, voice) => m.pad(at, midi + 12, 4, 0.02, { cutoff: 1900, attack: 1, release: 3.5, wave: 'glass', pan: [-0.5, 0.5, 0][voice], wet: 0.9 }, sting));
        m.drum(at, 'm-anvil', 0.1, { rate: 0.75, wet: 0.8, echo: 0.6 }, sting);
    },
};

// Heavy industry: a gated pulse bass, hammer blows on low steel, machine
// woodblocks and steam; dark string chords move underneath.
const FOUNDRY = [[31, [50, 55, 58, 62]], [27, [51, 55, 58, 62]], [29, [48, 53, 57, 60]], [26, [50, 54, 57, 60]]];
const FOUNDRY_GATE = hits('x.xo.xx.x.xo.x.o');
const FOUNDRY_MACHINE = hits('o-o-x-o-o-o-x-o-');
const foundry = {
    id: 'field-foundry', context: 'field', trim: 1.32, title: 'Foundry Lanes', tempo: 104, regions: { 'foundry-lanes': 3, 'acheron-belt': 2 }, weight: 0.6,
    note: 'Heavy industry (favoured in the Foundry Lanes and the Acheron belt): a gated pulse bass, hammer blows on low steel, machine woodblocks and steam over dark G minor strings.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 7, q: 3, attack: 0.005, release: 0.03 }); },
    bar(m, at, g) {
        const [bass, chord] = FOUNDRY[(m.bar >> 1) % FOUNDRY.length], beat = m.beat, level = m.intensity, part = section(m);
        for (const [step, weight] of FOUNDRY_GATE) g.bass.note(at + step * beat * 0.25, bass + (step === 10 ? 12 : 0), beat * 0.18, (0.05 + 0.05 * weight) * level, 260 + 360 * weight);
        if (m.bar % 2 === 0) chord.forEach((midi, voice) => m.strings(at + voice * 0.05, midi, m.barSeconds * 2, 0.02 * level, { attack: 1, release: 1.6, cutoff: 1100, pan: lowPan[voice], wet: 0.5, vibrato: 5 }));
        m.drum(at, 'm-anvil', 0.11 * level, { rate: 0.62, pan: -0.3, wet: 0.5, echo: 0.3 });
        m.drum(at + beat * 2.75, 'm-anvil', 0.08 * level, { rate: 0.7, pan: 0.3, wet: 0.5, echo: 0.3 });
        if (part >= 1) for (const [step, weight] of FOUNDRY_MACHINE) m.drum(at + step * beat * 0.25, 'm-wood', 0.045 * weight * level, { rate: weight === 1 ? 0.9 : 1.15, pan: step % 4 === 0 ? -0.35 : 0.35, wet: 0.15 });
        m.drum(at, 'm-kick', 0.18 * level); m.drum(at + beat * 2, 'm-kick', 0.14 * level);
        if (m.bar % 2 === 1) m.air(at + beat * 3, beat * 1.2, 0.05, { frequency: 3200, q: 0.7, pan: m.range(-0.6, 0.6) });
        if (part === 3 && m.bar % 4 === 0) m.choir(at, chord[0] - 12, m.barSeconds * 4, 0.02 * level, { vowel: 'oh', attack: 2, release: 2.5, wet: 0.7 });
    },
    end(m, at, sting) {
        m.drum(at, 'm-anvil', 0.14, { rate: 0.55, wet: 0.8, echo: 0.5 }, sting);
        [31, 50, 55, 58].forEach((midi, voice) => m.strings(at, midi, 3, voice ? 0.024 : 0.05, { attack: 0.5, release: 3, cutoff: voice ? 1100 : 400, pan: lowPan[voice], wet: 0.7 }, sting));
    },
};

// Pirate water: a 3+3+2 tom figure, a C-sharp pedal that leans on its
// semitone, low tremolo strings and rim pinpricks.
const SHOALS_TOMS = hits('x..o..o.');
const redShoals = {
    id: 'field-red-shoals', context: 'field', trim: 1.84, title: 'Red Shoals', tempo: 90, regions: { 'redwake-belt': 3 }, weight: 0.6,
    note: 'Pirate-held rock (favoured in the Redwake belt): a 3+3+2 tom figure, a C-sharp phrygian pedal leaning on its semitone, low tremolo strings and rim pinpricks.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 5, q: 1.5, attack: 0.01, release: 0.08 });
        g.trem = m.synth(g, g.pad, { type: 'sawtooth', detune: 12, q: 0.7, attack: 0.004, release: 0.02 });
    },
    bar(m, at, g) {
        const beat = m.beat, level = m.intensity, phase = m.bar % 4, part = section(m);
        const root = phase === 3 ? 38 : 37;
        for (const [step, weight] of SHOALS_TOMS) {
            m.drum(at + step * beat * 0.5, 'm-tom', 0.2 * weight * level, { rate: [0.8, 0.9, 1][step % 3], pan: step < 4 ? -0.3 : 0.3, wet: 0.35 });
            g.bass.note(at + step * beat * 0.5, root - 12 + (step === 6 && m.chance(0.4) ? 1 : 0), beat * 0.6, 0.11 * weight * level, 380);
        }
        const trem = part % 2 ? [50, 52, 56][(m.bar >> 1) % 3] : 49;
        for (let step = 0; step < 16; step += 1) g.trem.note(at + step * beat * 0.25, trem, beat * 0.2, (0.018 + 0.01 * (step / 16)) * level, 900);
        if (m.bar % 2 === 0) [root + 12, root + 19].forEach((midi, voice) => m.pad(at, midi, m.barSeconds * 2, 0.02 * level, { cutoff: 700, attack: 1.2, release: 2, pan: voice ? 0.4 : -0.4, wet: 0.6 }));
        for (let step = 0; step < 16; step += 1) if (m.chance(0.18)) m.drum(at + step * beat * 0.25, 'm-rim', m.range(0.025, 0.045), { pan: m.range(-0.6, 0.6), echo: 0.35 });
        if (part >= 2 && m.bar % 4 === 0) m.pad(at + beat, 62, m.barSeconds * 1.5, 0.012 * level, { wave: 'glass', cutoff: 1400, attack: 1, release: 1.6, bend: -1, pan: 0.3, wet: 1 });
        m.drum(at, 'm-heart', 0.16 * level);
    },
    end(m, at, sting) {
        m.drum(at, 'm-taiko', 0.25, { rate: 0.8, wet: 0.8 }, sting);
        [37, 49, 56, 62].forEach((midi, voice) => m.pad(at, midi, 4, voice ? 0.022 : 0.06, { cutoff: voice ? 800 : 300, attack: 0.8, release: 3.5, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// Ice and dust: mallet ripples flicker through B lydian, glass clusters
// hang overhead, rim clicks like settling ice.
const ICEFALL = [59, 61, 63, 65, 66, 68, 70, 71, 73];
const icefall = {
    id: 'field-icefall', context: 'field', trim: 1.36, title: 'Icefall', tempo: 96, regions: { 'pale-rings': 3 }, weight: 0.6,
    note: 'Ice and dust (favoured in the Pale Rings): quick mallet ripples flicker through B lydian, glass clusters hang overhead and rim clicks settle like ice.',
    bar(m, at) {
        const beat = m.beat, level = m.intensity, part = section(m);
        if (m.bar % 2 === 0) {
            m.pad(at, 35, m.barSeconds * 2.04, 0.06 * level, { cutoff: 260, attack: 1.2, release: 2, wave: 'bass', wet: 0.35, detune: 3 });
            m.pick([[63, 66, 70], [61, 66, 68], [63, 65, 70], [59, 63, 66]]).forEach((midi, voice) => m.pad(at, midi, m.barSeconds * 2, 0.014 * level, { cutoff: 2200, attack: 1.4, release: 2, wave: 'glass', pan: [-0.5, 0.5, 0][voice], wet: 0.85 }));
        }
        for (let ripple = part >= 2 ? 2 : 1; ripple > 0; ripple -= 1) {
            let step = Math.floor(m.random() * 10), note = Math.floor(m.random() * 5);
            const up = m.chance(0.6), count = 4 + Math.floor(m.random() * 3);
            for (let i = 0; i < count && step < 16; i += 1, step += 1) {
                m.mallet(at + step * beat * 0.25, ICEFALL[clamp(note, 0, ICEFALL.length - 1)], (0.02 + 0.012 * (1 - i / count)) * level, { decay: 0.7, pan: -0.5 + i * 0.2, echo: 0.3, wet: 0.5 });
                note += up ? 1 : -1;
            }
        }
        for (let step = 0; step < 16; step += 1) if (m.chance(0.22)) m.drum(at + step * beat * 0.25, 'm-rim', m.range(0.02, 0.04), { pan: m.range(-0.7, 0.7), rate: m.range(1.1, 1.4), echo: 0.3 });
        m.drum(at, 'm-heart', 0.16 * level);
        if (part >= 1) m.drum(at + beat * 2, 'm-heart', 0.1 * level);
        if (part === 3 && m.bar % 2 === 0) m.strings(at, m.pick([66, 68, 70]), m.barSeconds * 2, 0.016 * level, { attack: 1.4, release: 2, cutoff: 1800, pan: -0.2, wet: 0.7, vibrato: 5 });
    },
    end(m, at, sting) {
        [35, 59, 63, 66, 70].forEach((midi, voice) => m.pad(at, midi, 4, voice ? 0.016 : 0.05, { cutoff: voice ? 2200 : 260, attack: 1, release: 3.5, wave: voice ? 'glass' : 'bass', pan: lowPan[voice], wet: 0.9 }, sting));
    },
};

// ---------------------------------------------------------------- graveyard

const LAMENT = [
    [38, [45, 50, 53, 57]], [34, [46, 50, 53]], [33, [45, 48, 53]], [36, [43, 48, 52]],
    [31, [43, 46, 50]], [29, [41, 45, 50]], [33, [45, 50, 52]], [33, [45, 49, 52]],
];
const lament = {
    id: 'graveyard-lament', context: 'graveyard', title: 'Mourning Line', tempo: 48,
    note: 'The original graveyard theme: a slow lament of dark chords, a far-off drum and a voice that bends up and falls back.',
    bar(m, at) {
        const [bass, chord] = LAMENT[m.bar % LAMENT.length], bar = m.barSeconds, level = m.intensity;
        m.pad(at, bass, bar, 0.08 * level, { cutoff: 260, attack: 1.8, release: 2.6, wave: 'bass', wet: 0.4, detune: 4 });
        chord.forEach((midi, voice) => m.pad(at + voice * 0.3, midi, bar, (voice === 0 ? 0.034 : 0.024) * level, { cutoff: 720, attack: 2.2, release: 3, pan: [-0.4, 0.3, -0.1, 0.4][voice], wet: 0.8 }));
        if (m.chance(0.55))
            m.pad(at + m.range(0.4, 1.4), m.pick([57, 60, 62, 65]), m.range(2.6, 3.4), m.range(0.013, 0.019), { cutoff: 1300, attack: 1.1, release: 1.6, wave: 'glass', bend: m.range(2, 5), pan: m.range(-0.55, 0.55), wet: 1 });
        if (m.bar % 2 === 0) m.drum(at, 'm-taiko', 0.14 * level, { rate: 0.8, wet: 1, pan: m.range(-0.3, 0.3) });
        if (m.bar % 8 === 7) m.drum(at + bar * 0.5, 'm-sub-drop', 0.12);
    },
    end(m, at, sting) {
        [38, 45, 50, 53, 57].forEach((midi, voice) => m.pad(at + voice * 0.3, midi, 5, voice ? 0.026 : 0.07, { cutoff: voice ? 720 : 260, attack: 2, release: 4, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.9 }, sting));
    },
};

// A requiem for the hulls: a C minor choir chorale over low strings, a gong
// opening every phrase.
const REQUIEM = [
    [36, [48, 55, 60, 63]], [32, [48, 56, 60, 63]], [29, [48, 53, 56, 60]], [31, [47, 55, 59, 62]],
    [39, [48, 55, 58, 63]], [32, [48, 53, 56, 60]], [38, [50, 53, 56, 60]], [31, [47, 53, 55, 62]],
];
const requiem = {
    id: 'graveyard-requiem', context: 'graveyard', trim: 1.06, title: 'Requiem for Hulls', tempo: 50,
    note: 'A chorale for the dead ships: a C minor choir over low strings, a gong opening every phrase and a distant drum.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = REQUIEM[index], bar = m.barSeconds, level = m.intensity, part = section(m);
        m.strings(at, bass + 12, bar * 1.02, 0.04 * level, { attack: 1.6, release: 2.4, cutoff: 600, wet: 0.5, vibrato: 4 });
        m.pad(at, bass, bar, 0.06 * level, { cutoff: 240, attack: 1.8, release: 2.6, wave: 'bass', wet: 0.4, detune: 3 });
        chord.forEach((midi, voice) => m.choir(at + voice * 0.12, midi, bar, (voice === 3 ? 0.024 : 0.018) * level, { vowel: part === 1 ? 'oo' : 'ah', attack: 1.8, release: 2.6, pan: lowPan[voice], wet: 0.85 }));
        if (part === 3) m.strings(at, chord[3] + 12, bar, 0.018 * level, { attack: 1.6, release: 2.2, cutoff: 1600, pan: 0.2, wet: 0.7 });
        if (index === 0) m.drum(at, 'm-gong', 0.08, { rate: 0.8, wet: 0.9 });
        if (index % 2 === 1) m.drum(at + m.beat * 2, 'm-taiko', 0.1 * level, { rate: 0.75, wet: 1, pan: m.range(-0.3, 0.3) });
    },
    end(m, at, sting) {
        [36, 48, 55, 60, 63].forEach((midi, voice) => m.choir(at + voice * 0.2, midi, 5, voice ? 0.02 : 0.025, { vowel: 'oh', attack: 1.8, release: 4, pan: lowPan[voice], wet: 0.9 }, sting));
        m.drum(at, 'm-gong', 0.08, { rate: 0.75, wet: 1 }, sting);
    },
};

// A hymn sung by a lone reed in three over a D drone: the one written
// melody in the graveyard, so it can be remembered.
const HYMN_BASS = [38, 36, 34, 33, 34, 41, 31, 38, 41, 36, 33, 41, 34, 33, 38, 38];
const HYMN_CHORDS = {
    38: [50, 53, 57], 36: [48, 52, 57], 34: [50, 53, 58], 33: [49, 52, 57], 41: [48, 53, 57], 31: [50, 55, 58],
};
const HYMN_TUNE = [
    [[0, 62, 2], [2, 64, 1]], [[0, 65, 1.5], [1.5, 64, 0.5], [2, 62, 1]], [[0, 60, 3]], [[0, 57, 2], [2, 60, 1]],
    [[0, 62, 2], [2, 65, 1]], [[0, 69, 2], [2, 67, 1]], [[0, 65, 1], [1, 64, 1], [2, 62, 1]], [[0, 62, 3]],
    [[0, 69, 2], [2, 70, 1]], [[0, 69, 1.5], [1.5, 67, 0.5], [2, 65, 1]], [[0, 64, 3]], [[0, 65, 1], [1, 64, 1], [2, 60, 1]],
    [[0, 62, 2], [2, 65, 1]], [[0, 64, 1.5], [1.5, 62, 0.5], [2, 61, 1]], [[0, 62, 3]], [],
];
const debrisHymn = {
    id: 'graveyard-debris-hymn', context: 'graveyard', trim: 1.11, title: 'Debris Hymn', tempo: 54, beats: 3,
    note: 'A lone reed sings a written hymn in three over a D drone and quiet string chords; a frame drum keeps the slow pulse.',
    setup(m, g) { g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 4, q: 0.7, attack: 0.08, release: 0.18, vibrato: 16, rate: 4.5 }); },
    bar(m, at, g) {
        const index = m.bar % 16, bass = HYMN_BASS[index], level = m.intensity, part = section(m, 16, 2);
        m.pad(at, 26, m.barSeconds * 1.04, 0.05 * level, { cutoff: 220, attack: 1.4, release: 2, wave: 'bass', wet: 0.4, detune: 3 });
        m.pad(at, bass, m.barSeconds, 0.05 * level, { cutoff: 300, attack: 1, release: 1.6, wave: 'bass', wet: 0.35, detune: 4 });
        HYMN_CHORDS[bass].forEach((midi, voice) => m.strings(at + voice * 0.1, midi, m.barSeconds, 0.02 * level, { attack: 1.2, release: 1.8, cutoff: 1000, pan: lowPan[voice], wet: 0.65, vibrato: 5 }));
        phrase(m, at, HYMN_TUNE[index], (time, midi, seconds) => {
            g.lead.note(time, midi, seconds * 0.9, 0.036 * level, 1200, 0.04);
            // Second verse: the strings take the line an octave below.
            if (part === 1) m.strings(time, midi - 12, seconds * 0.95, 0.016 * level, { attack: Math.min(0.4, seconds * 0.3), release: 0.8, cutoff: 1400, pan: -0.2, wet: 0.6 });
        });
        m.drum(at, 'm-frame', 0.12 * level, { rate: 0.8, wet: 0.6 });
        if (index % 4 === 3) m.air(at, m.barSeconds * 1.5, 0.025, { frequency: 400, pan: m.range(-0.4, 0.4) });
    },
    end(m, at, sting) {
        [26, 50, 53, 57].forEach((midi, voice) => m.strings(at + voice * 0.15, midi + (voice ? 0 : 12), 5, voice ? 0.024 : 0.04, { attack: 1.4, release: 4, cutoff: voice ? 1000 : 400, pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// ------------------------------------------------------------------ stealth

const stealthHeart = {
    id: 'stealth-heart', context: 'stealth', title: 'Running Dark', tempo: 72,
    note: 'The original stealth theme: a muffled heartbeat and almost nothing else.',
    bar(m, at) {
        const beat = m.beat, root = [33, 33, 31, 32][(m.bar >> 1) % 4];
        m.drum(at, 'm-heart', 0.3); m.drum(at + beat * 0.34, 'm-heart', 0.2, { rate: 0.94 });
        m.drum(at + beat * 2, 'm-heart', 0.24); m.drum(at + beat * 2.34, 'm-heart', 0.15, { rate: 0.94 });
        if (m.bar % 2 === 0) m.pad(at, root, m.barSeconds * 2, 0.05, { cutoff: 240, attack: 1.2, release: 1.6, wave: 'bass', wet: 0.3 });
        if (m.bar % 2 === 0) m.pad(at + beat, root + 36, m.barSeconds * 1.5, 0.011, { cutoff: 900, attack: 1.4, release: 1.8, wave: 'glass', pan: m.bar % 4 ? 0.35 : -0.35, wet: 0.9 });
        if (m.bar % 4 === 3) m.pad(at + beat * 1.5, root + 37, m.barSeconds, 0.008, { cutoff: 900, attack: 1.2, release: 1.6, wave: 'glass', pan: -0.2, wet: 0.9 });
        if (m.chance(0.3)) m.drum(at + beat * m.pick([1.5, 3, 3.5]), 'm-rim', 0.035, { pan: m.range(-0.5, 0.5), echo: 0.4, wet: 0.5 });
    },
};

// Holding your breath: a clock ticking in the dark, a sub pulse, a low hum
// and two glass notes a semitone apart.
const heldBreath = {
    id: 'stealth-held-breath', context: 'stealth', trim: 0.75, title: 'Held Breath', tempo: 66,
    note: 'Waiting it out: a soft clock ticking in the dark, a sub pulse on one and three, a low hum, breaths of air and two glass notes a semitone apart.',
    bar(m, at) {
        const beat = m.beat, root = [33, 33, 34, 32][(m.bar >> 2) % 4];
        for (let tick = 0; tick < 4; tick += 1) m.drum(at + tick * beat, 'm-wood', tick % 2 ? 0.02 : 0.026, { rate: tick % 2 ? 1.35 : 1.5, pan: tick % 2 ? 0.25 : -0.25, wet: 0.3 });
        [0, 2].forEach((hit) => m.pad(at + hit * beat, root, beat * 0.7, 0.07, { cutoff: 200, attack: 0.06, release: 0.5, wave: 'bass', wet: 0.2, detune: 2 }));
        if (m.bar % 4 === 0) m.choir(at, root + 12, m.barSeconds * 4, 0.022, { vowel: 'mm', attack: 2.5, release: 2.5, wet: 0.6, vibrato: 6 });
        if (m.bar % 2 === 1) m.air(at + beat, m.barSeconds, 0.03, { frequency: 900, q: 1.2, pan: m.range(-0.5, 0.5) });
        if (m.bar % 4 === 2) [69, 70].forEach((midi, voice) => m.pad(at + beat * (1 + voice), midi, m.barSeconds, 0.007, { cutoff: 1100, attack: 1.4, release: 1.8, wave: 'glass', pan: voice ? 0.45 : -0.45, wet: 0.9 }));
    },
};

// Slipping past in 5/4: a muffled bass ostinato grouped 3+2, a frame drum
// felt more than heard, a low hum.
const SHADOW_LINE = [[0, 40], [2, 40], [3, 43], [5, 40], [7, 38], [8, 40]];
const shadowLine = {
    id: 'stealth-shadow-line', context: 'stealth', trim: 0.73, title: 'Shadow Line', tempo: 80, beats: 5,
    note: 'Slipping past in 5/4: a muffled bass ostinato grouped 3+2, a frame drum felt more than heard and a low hum.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 4, q: 4, attack: 0.01, release: 0.06 }); },
    bar(m, at, g) {
        const beat = m.beat, shift = (m.bar >> 2) % 2 ? -2 : 0;
        for (const [step, midi] of SHADOW_LINE) g.bass.note(at + step * beat * 0.5, midi + shift, beat * 0.4, step === 0 ? 0.13 : 0.09, step === 0 ? 260 : 190);
        m.drum(at, 'm-frame', 0.12, { rate: 0.7, wet: 0.3 });
        m.drum(at + beat * 3, 'm-frame', 0.08, { rate: 0.66, wet: 0.3 });
        if (m.bar % 2 === 0) [40 + shift, 47 + shift].forEach((midi, voice) => m.choir(at, midi, m.barSeconds * 2, 0.018, { vowel: 'mm', attack: 1.6, release: 2, pan: voice ? 0.3 : -0.3, wet: 0.6, vibrato: 5 }));
        if (m.chance(0.25)) m.drum(at + beat * m.pick([1.5, 2.5, 4.5]), 'm-rim', 0.03, { pan: m.range(-0.6, 0.6), echo: 0.4, wet: 0.5 });
        if (m.bar % 8 === 7) m.pad(at + beat * 2, 71 + shift, m.barSeconds, 0.008, { cutoff: 1200, attack: 1, release: 1.6, wave: 'glass', bend: -1, pan: 0.3, wet: 1 });
    },
};

// ------------------------------------------------------------------- combat

// Combat: drums carry the fight. Tier 0 is taiko, kick and a driving
// bass/string ostinato; tier 1 adds the backbeat, brass-like stabs and
// fills; tier 2 gallops, opens the hats and brings in the lead line.
const COMBAT = [[40, 15], [36, 16], [38, 16], [35, 15], [40, 15], [38, 16], [33, 15], [36, 16]];
const combatDrums = {
    id: 'combat-drums', context: 'combat', title: 'War Drums', tempo: 132, resolve: [40, 47, 52, 56, 59],
    note: 'The original combat score: taiko and kick under a bass and string ostinato; the backbeat, stabs and fills arrive at tier 1, the gallop and lead line at tier 2.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 5 });
        g.ostinato = m.synth(g, g.pad, { type: 'sawtooth', detune: 11 });
        g.lead = m.synth(g, g.pad, { wave: m.waves.warm, detune: 7 });
    },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity;
        const chordIndex = (m.bar >> 1) % COMBAT.length, [root, third] = COMBAT[chordIndex], second = m.bar % 2 === 1, phrasePosition = m.bar % 8;
        // Bass: relentless eighths with octave kicks.
        [0, 0, 12, 0, 0, 12, 0, 7].forEach((offset, step) =>
            g.bass.note(at + step * beat * 0.5, root + offset, beat * 0.36, (step % 2 ? 0.085 : 0.11) * level, 300 + tier * 110));
        // Spiccato ostinato: eighths at rest, sixteenths once the fight escalates.
        const figure = [0, 7, 12, 7, 0, 7, third, 7], steps = tier >= 1 ? 16 : 8;
        for (let step = 0; step < steps; step += 1) {
            const offset = figure[(tier >= 1 ? step >> 1 : step) % figure.length] + (tier >= 1 && step % 2 ? 12 : 0);
            const accent = step % (steps / 4) === 0;
            g.ostinato.note(at + step * beat * (4 / steps), root + 12 + offset, beat * (2.2 / steps), (accent ? 0.05 : 0.034) * level, 1300 + tier * 500 + (accent ? 400 : 0));
        }
        // Brass-weight stabs on the chord change and a syncopated answer.
        if (tier >= 1 && (!second || m.chance(0.6))) {
            const time = second ? at + beat * 2.5 : at;
            [0, 7, third].forEach((offset, voice) => m.pad(time, root + 12 + offset, beat * 0.8, 0.036 * level, { cutoff: 1700 + tier * 700, attack: 0.025, release: 0.5, pan: [-0.35, 0.35, 0][voice], wet: 0.4, detune: 10 }));
        }
        // Lead line at full escalation: a four-note cell, answered every other bar.
        if (tier >= 2) {
            const cell = second ? [third + 12, 19, 14, 12] : [12, third + 12, 19, 24];
            cell.forEach((offset, i) => g.lead.note(at + i * beat, root + 24 + offset, beat * 0.9, 0.03 * level, 2400));
        }
        const kicks = tier >= 2 ? [0, 1, 2, 3] : [0, 2];
        for (const hit of kicks) { m.drum(at + hit * beat, 'm-kick', 0.42 * level); m.pump(at + hit * beat, tier >= 2 ? 0.5 : 0.62); }
        const taiko = tier >= 2 ? [0, 0.75, 1.5, 2.5, 3, 3.5] : tier === 1 ? [0, 2.5, 3.75] : [0, 2.5];
        taiko.forEach((hit, i) => m.drum(at + hit * beat, 'm-taiko', (i === 0 ? 0.5 : 0.36) * level, { rate: i % 2 ? 1.06 : 1, pan: i % 2 ? 0.25 : -0.25, wet: 0.35 }));
        if (tier >= 1) {
            m.drum(at + beat, 'm-snare', 0.3 * level, { pan: 0.1, wet: 0.25 });
            m.drum(at + beat * 3, 'm-snare', 0.33 * level, { pan: 0.1, wet: 0.25 });
        }
        for (let step = 0; step < 8; step += 1) {
            const open = tier >= 2 && step % 2 === 1;
            m.drum(at + step * beat * 0.5, 'm-hat', (step % 2 ? 0.075 : 0.05) * (open ? 0.8 : 1), { pan: 0.3, rate: open ? 0.92 : m.range(0.97, 1.04) });
        }
        if (m.chance(0.3)) m.drum(at + beat * m.pick([1.75, 2.25, 3.25]), 'm-hat', 0.05, { pan: -0.3 });
        // Fill into every fourth bar; riser and a hit across the phrase boundary.
        if (tier >= 1 && m.bar % 4 === 3)
            for (let i = 0; i < 4; i += 1) m.drum(at + beat * (3 + i * 0.25), 'm-tom', (0.3 + i * 0.03) * level, { rate: [1.2, 1.1, 1, 0.9][i], pan: [-0.5, -0.2, 0.2, 0.5][i], wet: 0.3 });
        if (phrasePosition === 7) m.drum(at + m.barSeconds - 1.6, 'm-rev-cym', 0.3, { wet: 0.4 });
        if (phrasePosition === 0 && m.bar > 0 && tier >= 1) m.drum(at, 'm-impact', 0.34, { wet: 0.5 });
        if (tier >= 2 && !second) m.drum(at, 'm-anvil', 0.12, { rate: 0.75, pan: 0.5, wet: 0.5, echo: 0.3 });
    },
};

// Shared combat furniture for the new pieces: fills, the phrase riser and
// the impact on the downbeat of each phrase.
function combatFurniture(m, at, beat, tier, level) {
    if (tier >= 1 && m.bar % 4 === 3)
        for (let i = 0; i < 4; i += 1) m.drum(at + m.barSeconds - beat + i * beat * 0.25, 'm-tom', (0.28 + i * 0.03) * level, { rate: [1.2, 1.1, 1, 0.9][i], pan: [-0.5, -0.2, 0.2, 0.5][i], wet: 0.3 });
    if (m.bar % 8 === 7) m.drum(at + m.barSeconds - 1.6, 'm-rev-cym', 0.28, { wet: 0.4 });
    if (m.bar % 8 === 0 && m.bar > 0 && tier >= 1) m.drum(at, 'm-impact', 0.32, { wet: 0.5 });
}

// Synth-driven pursuit in D minor: pulse bass, a sixteenth arpeggio once it
// escalates, four on the floor and a reed-like lead riff at the top.
const BREAKNECK = [[38, 3], [34, 4], [36, 4], [33, 4]];
const breakneck = {
    id: 'combat-breakneck', context: 'combat', title: 'Breakneck', tempo: 148, resolve: [38, 45, 50, 54, 57],
    note: 'Fast synth pursuit in D minor: pulse bass, a sixteenth arpeggio at tier 1 with four on the floor and claps, open hats and a reed-like lead riff at tier 2.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 6, q: 2, attack: 0.004, release: 0.03 });
        g.arp = m.synth(g, g.pad, { wave: m.waves.pulse, detune: 9, q: 1.6, attack: 0.004, release: 0.02 });
        g.lead = m.synth(g, g.pad, { wave: m.waves.reed, detune: 7, q: 1, attack: 0.01, release: 0.05, vibrato: 10, rate: 6 });
    },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, [root, third] = BREAKNECK[(m.bar >> 1) % BREAKNECK.length], second = m.bar % 2 === 1;
        const steps = tier >= 1 ? 16 : 8;
        for (let step = 0; step < steps; step += 1) {
            const offset = [0, 0, 12, 0][step % 4] + (step === steps - 2 ? 7 : 0);
            g.bass.note(at + step * beat * (4 / steps), root + offset, beat * (2.6 / steps), (step % 4 === 0 ? 0.11 : 0.08) * level, 320 + tier * 120);
        }
        if (tier >= 1) {
            const notes = [0, third, 7, 12, 7, third, 12, 15];
            for (let step = 0; step < 16; step += 1) g.arp.note(at + step * beat * 0.25, root + 24 + notes[(step + (second ? 2 : 0)) % notes.length], beat * 0.16, (step % 4 === 0 ? 0.036 : 0.026) * level, 1400 + tier * 500);
        }
        if (m.bar % 2 === 0) [0, 7, third + 12].forEach((offset, voice) => m.strings(at, root + 12 + offset, m.barSeconds * 2, 0.022 * level, { attack: 0.4, release: 0.8, cutoff: 1600, pan: lowPan[voice], wet: 0.4, vibrato: 4 }));
        if (tier >= 2) {
            const riff = second ? [[0, 17, 1], [1, 15, 0.5], [1.5, 12, 0.5], [2, 10, 2]] : [[0, 12, 0.75], [0.75, 15, 0.75], [1.5, 17, 0.5], [2, 19, 1], [3, 17, 1]];
            phrase(m, at, riff, (time, offset, seconds) => g.lead.note(time, root + 24 + offset - (third === 4 && offset === 15 ? -1 : 0), seconds * 0.9, 0.034 * level, 2200, 0.015));
        }
        const kicks = tier >= 1 ? [0, 1, 2, 3] : [0, 2.5];
        for (const hit of kicks) { m.drum(at + hit * beat, 'm-kick', 0.4 * level); m.pump(at + hit * beat, 0.55); }
        if (tier >= 1) { m.drum(at + beat, 'm-clap', 0.2 * level, { wet: 0.25 }); m.drum(at + beat * 3, 'm-clap', 0.22 * level, { wet: 0.25 }); }
        else m.drum(at + beat * 3, 'm-snare', 0.22 * level, { wet: 0.25 });
        for (let step = 0; step < (tier >= 2 ? 16 : 8); step += 1) {
            const sixteenths = tier >= 2;
            m.drum(at + step * beat * (sixteenths ? 0.25 : 0.5), 'm-hat', (sixteenths ? (step % 4 === 2 ? 0.07 : 0.04) : step % 2 ? 0.065 : 0.045), { pan: 0.3, rate: sixteenths && step % 4 === 2 ? 0.9 : m.range(0.97, 1.04) });
        }
        m.drum(at, 'm-taiko', 0.32 * level, { pan: -0.2, wet: 0.3 });
        combatFurniture(m, at, beat, tier, level);
    },
};

// Ship-of-the-line combat in G minor, kept dark: minor chords sliding by
// semitone and chromatic mediant (Ab, Ebm, F#dim), low brass, a semitone
// string ostinato, a low choir and taiko/o-daiko.
// [root, third, fifth, chord]
const BROADSIDE = [[43, 3, 7, [50, 55, 58]], [44, 4, 7, [48, 51, 56]], [43, 3, 7, [50, 55, 58]], [41, 3, 7, [48, 53, 56]], [43, 3, 7, [50, 55, 58]], [39, 3, 7, [51, 54, 58]], [36, 3, 7, [51, 55, 60]], [42, 3, 6, [48, 51, 54]]];
const BROADSIDE_SEMITONES = [0, 1, 0, 1, 0, 1, 3, 1];
const broadside = {
    id: 'combat-broadside', context: 'combat', trim: 0.99, title: 'Broadside', tempo: 120, resolve: [43, 50, 55, 58, 62],
    note: 'Orchestral ship-of-the-line combat in G minor, kept dark: minor chords sliding by semitone (Ab, Ebm, F#dim), spiccato with a flat-second pickup, low brass stabs and taiko; snare rolls and a semitone string ostinato at tier 1, low choir, o-daiko and gong at tier 2.',
    setup(m, g) {
        g.low = m.synth(g, g.pad, { type: 'sawtooth', detune: 12, q: 0.8, attack: 0.004, release: 0.03 });
        g.high = m.synth(g, g.pad, { type: 'sawtooth', detune: 10, q: 0.8, attack: 0.004, release: 0.03 });
    },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, [root, third, fifth, chord] = BROADSIDE[m.bar % BROADSIDE.length];
        const figure = [0, 0, fifth, 0, third, 0, fifth, 1], steps = tier >= 1 ? 16 : 8;
        for (let step = 0; step < steps; step += 1) {
            const offset = figure[(tier >= 1 ? step >> 1 : step) % 8] + (tier >= 1 && step % 2 ? 12 : 0);
            g.low.note(at + step * beat * (4 / steps), root + offset, beat * (2 / steps), (step % (steps / 4) === 0 ? 0.06 : 0.04) * level, 950 + tier * 350);
        }
        m.pad(at, root - 12, m.barSeconds, 0.08 * level, { cutoff: 300, attack: 0.2, release: 0.8, wave: 'bass', wet: 0.3, detune: 4 });
        // Low brass stabs in the chord's own register.
        const stabs = tier >= 1 ? [0, 1.5, 2.5] : [0];
        for (const hit of stabs) chord.forEach((midi, voice) => m.strings(at + hit * beat, midi, beat * 0.7, 0.046 * level, { wave: 'brass', attack: 0.03, release: 0.4, cutoff: 1300 + tier * 450, pan: lowPan[voice], wet: 0.4, vibrato: 0 }));
        // Semitone ostinato: root and flat second, a minor third on the turn.
        if (tier >= 1) for (let step = 0; step < 8; step += 1) g.high.note(at + step * beat * 0.5, root + 24 + BROADSIDE_SEMITONES[step], beat * 0.3, (step % 2 ? 0.022 : 0.028) * level, 1500);
        if (tier >= 2 && m.bar % 2 === 0) chord.forEach((midi, voice) => m.choir(at, midi - 12 * (voice === 0), m.barSeconds * 2, 0.028 * level, { vowel: 'oh', attack: 0.5, release: 1.2, pan: lowPan[voice], wet: 0.6, vibrato: 8 }));
        [0, 1.5, 2.5, 3].slice(0, tier >= 1 ? 4 : 2).forEach((hit, i) => m.drum(at + hit * beat, 'm-taiko', (i === 0 ? 0.5 : 0.34) * level, { rate: i % 2 ? 1.08 : 1, pan: i % 2 ? 0.25 : -0.25, wet: 0.35 }));
        m.drum(at, 'm-kick', 0.36 * level); m.pump(at, 0.6);
        if (tier >= 1) {
            m.drum(at + beat, 'm-snare', 0.26 * level, { wet: 0.3 });
            m.drum(at + beat * 3, 'm-snare', 0.28 * level, { wet: 0.3 });
            if (m.bar % 2 === 1) for (let i = 0; i < 6; i += 1) m.drum(at + beat * 2.5 + i * beat * 0.125, 'm-snare', (0.1 + i * 0.025) * level, { wet: 0.3, rate: 1.02 });
        }
        if (tier >= 2) m.drum(at, 'm-odaiko', 0.4 * level, { wet: 0.4 });
        if (tier >= 2 && m.bar % 8 === 0) m.drum(at, 'm-gong', 0.18, { wet: 0.6 });
        combatFurniture(m, at, beat, tier, level);
    },
};

// Knife fight in 7/8 (2+2+3): toms and hand drums, a pulse bass jabbing a
// tritone, claps on the long group; Redwake's own.
const CUTTHROAT = [40, 40, 41, 38];
const CUTTHROAT_GROUPS = [0, 2, 4];
const cutthroat = {
    id: 'combat-cutthroat', context: 'combat', title: 'Cutthroat', tempo: 300, beats: 7, echo: 1.5, systems: { redwake: 3 }, resolve: [40, 47, 52, 55, 59],
    note: 'Pirate knife fight in 7/8 (2+2+3), favoured in Redwake: toms and hand drums, a pulse bass jabbing a tritone; kick and claps at tier 1, a snarling lead and anvil at tier 2.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 8, q: 2.4, attack: 0.004, release: 0.03 });
        g.lead = m.synth(g, g.pad, { wave: m.waves.brass, detune: 9, q: 2, attack: 0.008, release: 0.05, vibrato: 14, rate: 6.5 });
    },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, root = CUTTHROAT[m.bar % 4];
        for (let step = 0; step < 7; step += 1) {
            const group = CUTTHROAT_GROUPS.includes(step);
            g.bass.note(at + step * beat, root + (step === 6 ? 6 : step === 3 && tier >= 1 ? 12 : 0), beat * 0.7, (group ? 0.12 : 0.075) * level, 360 + tier * 140 + (group ? 140 : 0));
        }
        CUTTHROAT_GROUPS.forEach((step, i) => m.drum(at + step * beat, 'm-tom', (i === 2 ? 0.36 : 0.3) * level, { rate: [1, 1.12, 0.86][i], pan: [-0.35, 0.35, 0][i], wet: 0.3 }));
        for (let step = 0; step < 7; step += 1) if (!CUTTHROAT_GROUPS.includes(step) || m.chance(0.3)) m.drum(at + step * beat, 'm-hand', 0.12 * level, { rate: m.range(1, 1.15), pan: step % 2 ? 0.4 : -0.4, wet: 0.2 });
        if (m.bar % 2 === 0) [root + 12, root + 19].forEach((midi, voice) => m.strings(at, midi, m.barSeconds * 2, 0.026 * level, { attack: 0.3, release: 0.6, cutoff: 1400, pan: voice ? 0.35 : -0.35, wet: 0.4, vibrato: 5 }));
        if (tier >= 1) {
            for (const step of CUTTHROAT_GROUPS) { m.drum(at + step * beat, 'm-kick', 0.38 * level); m.pump(at + step * beat, 0.6); }
            m.drum(at + 4 * beat, 'm-clap', 0.24 * level, { wet: 0.3 });
            for (let step = 0; step < 7; step += 1) m.drum(at + step * beat, 'm-hat', step % 2 ? 0.055 : 0.04, { pan: 0.3 });
        }
        else m.drum(at, 'm-kick', 0.34 * level);
        if (tier >= 2) {
            const line = m.bar % 2 ? [[0, 19, 2], [2, 18, 2], [4, 16, 3]] : [[0, 12, 2], [2, 13, 2], [4, 16, 1.5], [5.5, 18, 1.5]];
            phrase(m, at, line, (time, offset, seconds) => g.lead.note(time, root + 12 + offset, seconds * 0.85, 0.03 * level, 1800, 0.02));
            if (m.bar % 2 === 0) m.drum(at, 'm-anvil', 0.12, { rate: 0.7, pan: 0.5, wet: 0.5, echo: 0.3 });
        }
        m.drum(at, 'm-taiko', 0.34 * level, { wet: 0.3 });
        combatFurniture(m, at, beat, tier, level);
    },
};

// ------------------------------------------------- drum-led combat pieces
// Four fights carried by percussion first: ensembles of big drums in odd
// meters, junk metal and low synth pulses, with a single lamenting or
// wailing voice on top when the fight peaks.

// Taiko ensemble in 5/4 (3+2): an o-daiko on every group, drum voices that
// multiply with each tier, a low string drone, a duduk-like reed lament.
const DRUM_LINE_LOW = hits('x.o..x.o..');
const DRUM_LINE_MID = hits('..x.o.x..x');
const DRUM_LINE_HIGH = hits('-o-x-o-x-o');
const DRUM_LINE_FRAME = hits('xooxooxoxo');
const DRUM_LINE_FIGURE = [0, 0, 1, 0, 4, 1, 0, 7, 5, 4];
const DRUM_LINE_ROOTS = [38, 39, 38, 34];
const DRUM_LINE_TUNE = [
    [[0, 62, 1.5], [1.5, 63, 0.5], [2, 66, 1], [3, 67, 1], [4, 66, 1]],
    [[0, 63, 2], [2, 62, 1], [3, 60, 0.5], [3.5, 58, 0.5], [4, 62, 1]],
    [[0, 69, 1.5], [1.5, 70, 0.5], [2, 69, 1], [3, 67, 0.5], [3.5, 66, 0.5], [4, 67, 1]],
    [[0, 66, 1], [1, 63, 1], [2, 62, 3]],
];
const drumLine = {
    id: 'combat-drum-line', context: 'combat', trim: 1.4, title: 'Drum Line', tempo: 138, beats: 5, resolve: [38, 45, 50, 54, 57],
    note: 'A taiko ensemble in 5/4 (3+2): o-daiko on every group and interlocking drum voices that multiply with each tier over a low string drone and spiccato in D hijaz. At tier 2 a duduk-like reed sings a lament over goblet-drum cracks.',
    setup(m, g) {
        g.low = m.synth(g, g.pad, { type: 'sawtooth', detune: 11, q: 0.8, attack: 0.004, release: 0.03 });
        g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 5, q: 0.9, attack: 0.06, release: 0.15, vibrato: 24, rate: 5.2 });
    },
    bar(m, at, g) {
        const beat = m.beat, half = beat / 2, tier = m.tier, level = 0.85 + 0.15 * m.intensity, root = DRUM_LINE_ROOTS[m.bar % 4];
        for (const hit of [0, 3]) m.drum(at + hit * beat, 'm-odaiko', (hit ? 0.42 : 0.55) * level, { wet: 0.4, pan: hit ? 0.15 : -0.15 });
        for (const [step, weight] of DRUM_LINE_LOW) m.drum(at + step * half, 'm-taiko', 0.36 * weight * level, { rate: step < 6 ? 1 : 1.08, pan: -0.3, wet: 0.3 });
        if (tier >= 1) {
            for (const [step, weight] of DRUM_LINE_MID) m.drum(at + step * half, 'm-tom', 0.28 * weight * level, { rate: [1.15, 1, 0.9][step % 3], pan: 0.35, wet: 0.3 });
            for (const [step, weight] of DRUM_LINE_FRAME) m.drum(at + step * half, 'm-frame', 0.12 * weight * level, { rate: 1.1, pan: 0.15, wet: 0.2 });
            for (const hit of [0, 3]) { m.drum(at + hit * beat, 'm-kick', 0.34 * level); m.pump(at + hit * beat, 0.6); }
        }
        if (tier >= 2) for (const [step, weight] of DRUM_LINE_HIGH) m.drum(at + step * half, weight > 0.5 ? 'm-tek' : 'm-hand', (weight > 0.5 ? 0.14 : 0.1) * level, { rate: m.range(0.97, 1.05), pan: step % 4 < 2 ? -0.45 : 0.45, wet: 0.2 });
        DRUM_LINE_FIGURE.forEach((offset, step) => {
            if (tier === 0 && step !== 0 && step !== 6 && step % 2) return;
            const accent = step === 0 || step === 6;
            g.low.note(at + step * half, root + 12 + offset + (tier >= 2 && accent ? 12 : 0), half * 0.6, (accent ? 0.05 : 0.034) * level, 1000 + tier * 350);
        });
        if (m.bar % 2 === 0) [root, root + 7].forEach((midi, voice) => m.strings(at, midi, m.barSeconds * 2, 0.03 * level, { wave: tier >= 1 ? 'brass' : undefined, attack: 0.5, release: 1, cutoff: 800 + tier * 300, pan: voice ? 0.3 : -0.3, wet: 0.45, vibrato: 4 }));
        if (tier >= 2) phrase(m, at, DRUM_LINE_TUNE[m.bar % 4], (time, midi, seconds) => g.lead.note(time, midi, seconds * 0.92, 0.036 * level, 1100, 0.05));
        if (tier >= 2 && m.bar % 8 === 0) m.drum(at, 'm-gong', 0.16, { wet: 0.6 });
        combatFurniture(m, at, beat, tier, level);
    },
};

// Half-time dread in C phrygian: a low pulse whose filter opens across every
// bar, o-daiko and sub drops, steel-pipe hits, a throat-low drone and, as
// the fight grows, a wailing voice that scoops into its notes.
const LOW_ORBIT = [[36, [48, 51, 55], [67, 63]], [37, [49, 53, 56], [68, 65]], [32, [48, 51, 56], [68, 63]], [31, [47, 50, 55], [67, 62]]];
const LOW_ORBIT_FRAME = hits('x-o-x-o-x-o-xoxo');
const lowOrbit = {
    id: 'combat-low-orbit', context: 'combat', trim: 1.15, title: 'Low Orbit', tempo: 96, resolve: [36, 43, 48, 51, 55],
    note: 'Heavy half-time dread in C phrygian: a low synth pulse whose filter opens across every bar, o-daiko, sub drops and steel-pipe hits over a throat-low drone. A wailing voice scoops into long notes from tier 1; hats, toms and anvil drive tier 2.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 8, q: 4, attack: 0.004, release: 0.03 }); },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, index = (m.bar >> 1) % LOW_ORBIT.length, [root, chord, wail] = LOW_ORBIT[index];
        for (let step = 0; step < 16; step += 1)
            g.bass.note(at + step * beat * 0.25, root + (step % 8 === 7 ? 12 : 0), beat * 0.18, (step % 4 === 0 ? 0.12 : 0.08) * level, 200 + (480 + tier * 260) * (step / 16));
        if (m.bar % 2 === 0) {
            m.choir(at, root, m.barSeconds * 2, 0.03 * level, { vowel: 'oh', attack: 0.8, release: 1.4, wet: 0.5, vibrato: 4, detune: 12 });
            if (tier >= 1) chord.forEach((midi, voice) => m.strings(at, midi, m.barSeconds * 2, 0.024 * level, { attack: 0.6, release: 1, cutoff: 900 + tier * 300, pan: lowPan[voice], wet: 0.5, vibrato: 5 }));
        }
        if (tier >= 1 && m.bar % (tier >= 2 ? 2 : 4) === 0)
            m.choir(at + beat * 0.5, wail[(m.bar >> 2) % 2], m.barSeconds * 1.6, 0.03 * level, { vowel: 'ah', attack: 0.9, release: 1.6, pan: 0.2, wet: 0.8, vibrato: 22, scoop: -3 });
        m.drum(at, 'm-odaiko', 0.55 * level, { wet: 0.45 });
        m.drum(at + beat * 2.5, 'm-odaiko', 0.4 * level, { wet: 0.45, pan: 0.2 });
        m.drum(at + beat * 2, 'm-taiko', 0.42 * level, { rate: 1.1, wet: 0.35, pan: -0.15 });
        if (m.bar % 4 === 0) m.drum(at, 'm-sub-drop', 0.3);
        if (tier >= 1) {
            for (const [step, weight] of LOW_ORBIT_FRAME) m.drum(at + step * beat * 0.25, 'm-frame', 0.1 * weight * level, { rate: 1.15, pan: 0.3, wet: 0.2 });
            for (const hit of [1.5, 3.5]) m.drum(at + hit * beat, 'm-pipe', 0.11 * level, { rate: m.pick([0.84, 0.89, 1]), pan: hit > 2 ? 0.45 : -0.45, wet: 0.4 });
            for (const hit of [0, 2.5]) { m.drum(at + hit * beat, 'm-kick', 0.38 * level); m.pump(at + hit * beat, 0.55); }
        }
        if (tier >= 2) {
            m.drum(at + beat * 2, 'm-snare', 0.28 * level, { wet: 0.3 });
            for (let step = 0; step < 16; step += 1) m.drum(at + step * beat * 0.25, 'm-hat', step % 4 === 2 ? 0.06 : 0.035, { pan: 0.3, rate: m.range(0.96, 1.04) });
            if (m.bar % 2 === 1) for (let i = 0; i < 4; i += 1) m.drum(at + beat * (3 + i * 0.25), 'm-tom', (0.26 + i * 0.03) * level, { rate: [1.2, 1.05, 0.95, 0.85][i], pan: [-0.5, -0.2, 0.2, 0.5][i], wet: 0.3 });
            m.drum(at + beat * 3, 'm-anvil', 0.1, { rate: 0.7, pan: -0.5, wet: 0.5, echo: 0.3 });
        }
        combatFurniture(m, at, beat, tier, level);
    },
};

// Junk-metal gamelan in 9/8 (2+2+2+3): a mallet and steel-pipe ostinato in
// the Japanese in-scale over interlocking drums.
const GAMELAN_SCALE = [64, 65, 69, 71, 72, 76];
const GAMELAN_CELLS = [[0, 2, 1, 3, 2, 4, 3, 1, 0], [2, 4, 3, 5, 4, 2, 1, 3, 2]];
const GAMELAN_GROUPS = [0, 2, 4, 6];
const GAMELAN_ROOTS = [40, 40, 41, 40, 45, 45, 47, 40];
// The pipe sounds near G3; these rates tune it to each root.
const PIPE_RATE = { 4: 0.853, 5: 0.904, 9: 1.14, 11: 1.28 };
const ironGamelan = {
    id: 'combat-iron-gamelan', context: 'combat', title: 'Iron Gamelan', tempo: 330, beats: 9, echo: 2, resolve: [40, 47, 52, 55, 59],
    note: 'Junk-metal gamelan in 9/8 (2+2+2+3): a mallet and tuned steel-pipe ostinato in the Japanese in-scale over o-daiko, taiko and toms. Kick and hand drums join at tier 1; claps, goblet cracks, hats and a choir swell come in at tier 2.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 6, q: 2, attack: 0.004, release: 0.04 }); },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, root = GAMELAN_ROOTS[m.bar % 8], cell = GAMELAN_CELLS[(m.bar >> 1) % 2];
        cell.forEach((degree, step) => {
            if (tier === 0 && step % 2 && step !== 7) return;
            m.mallet(at + step * beat, GAMELAN_SCALE[degree] - (tier === 0 ? 12 : 0), (GAMELAN_GROUPS.includes(step) ? 0.04 : 0.028) * level, { decay: 0.6, pan: step % 2 ? 0.35 : -0.35, echo: GAMELAN_GROUPS.includes(step) ? 0.15 : 0, wet: 0.3, hard: 0.35 });
        });
        for (const step of GAMELAN_GROUPS) m.drum(at + step * beat, 'm-pipe', (step === 6 ? 0.14 : 0.1) * level, { rate: PIPE_RATE[root % 12] * (step === 6 ? 1.5 : 1), pan: step === 6 ? 0.4 : -0.2, wet: 0.35 });
        for (const step of GAMELAN_GROUPS) g.bass.note(at + step * beat, root - 12 + (step === 6 ? 12 : 0), beat * 1.4, (step === 0 ? 0.12 : 0.09) * level, 380 + tier * 140);
        m.drum(at, 'm-odaiko', 0.5 * level, { wet: 0.4 });
        for (const step of [2, 4]) m.drum(at + step * beat, 'm-taiko', 0.36 * level, { rate: step === 2 ? 1.05 : 1.12, pan: step === 2 ? -0.3 : 0.3, wet: 0.3 });
        m.drum(at + 6 * beat, 'm-tom', 0.32 * level, { rate: 0.95, wet: 0.3 });
        if (tier >= 1) {
            m.drum(at + 7 * beat, 'm-tom', 0.26 * level, { rate: 1.1, pan: 0.3, wet: 0.3 });
            m.drum(at + 8 * beat, 'm-tom', 0.28 * level, { rate: 1.25, pan: -0.3, wet: 0.3 });
            for (const step of GAMELAN_GROUPS) { m.drum(at + step * beat, 'm-kick', 0.34 * level); m.pump(at + step * beat, 0.6); }
            for (const step of [1, 3, 5]) m.drum(at + step * beat, 'm-hand', 0.1 * level, { rate: m.range(1, 1.12), pan: 0.4, wet: 0.2 });
            if (m.bar % 2 === 0) m.strings(at, root, m.barSeconds * 2, 0.03 * level, { wave: 'brass', attack: 0.4, release: 0.8, cutoff: 1000 + tier * 300, wet: 0.45, vibrato: 4 });
        }
        if (tier >= 2) {
            m.drum(at + 6 * beat, 'm-clap', 0.22 * level, { wet: 0.3 });
            for (const step of [1, 5, 8]) m.drum(at + step * beat, 'm-tek', 0.09, { pan: -0.4, rate: m.range(0.97, 1.04) });
            for (const step of [3, 7]) m.drum(at + step * beat, 'm-hat', 0.05, { pan: 0.3 });
            if (m.bar % 2 === 0) m.drum(at, 'm-anvil', 0.11, { rate: 0.75, pan: 0.5, wet: 0.5, echo: 0.3 });
            if (m.bar % 4 === 0) [root + 12, root + 19, root + 24].forEach((midi, voice) => m.choir(at, midi, m.barSeconds * 3, 0.026 * level, { vowel: 'oh', attack: 1.2, release: 1.6, pan: lowPan[voice], wet: 0.6, vibrato: 16 }));
        }
        combatFurniture(m, at, beat, tier, level);
    },
};

// A running fight in 6/8: a frame-drum gallop with triplet rolls, taiko on
// the dotted quarters, a low pulse and, at the top tier, a fiddle-like reed
// tune in A dorian.
const BURN_ACCENTS = [1, 0.35, 0.65, 1, 0.35, 0.65];
const BURN_ROOTS = [33, 33, 31, 31, 29, 31, 33, 28];
const BURN_FIGURE = [0, 7, 3, 0, 10, 7];
const BURN_TUNE = [
    [[0, 69, 1], [1, 72, 1], [2, 76, 1], [3, 74, 1.5], [4.5, 72, 0.5], [5, 74, 1]],
    [[0, 76, 2], [2, 74, 1], [3, 72, 2], [5, 71, 1]],
    [[0, 71, 1], [1, 74, 1], [2, 71, 1], [3, 67, 2], [5, 69, 1]],
    [[0, 71, 3], [3, 74, 1.5], [4.5, 72, 0.5], [5, 71, 1]],
    [[0, 72, 1], [1, 69, 1], [2, 65, 1], [3, 69, 2], [5, 72, 1]],
    [[0, 74, 2], [2, 71, 1], [3, 67, 3]],
    [[0, 69, 1], [1, 72, 1], [2, 76, 1], [3, 74, 1], [4, 72, 1], [5, 71, 1]],
    [[0, 68, 3], [3, 71, 3]],
];
const burnPattern = {
    id: 'combat-burn-pattern', context: 'combat', title: 'Burn Pattern', tempo: 312, beats: 6, echo: 1.5, resolve: [33, 45, 52, 57, 61],
    note: 'A running fight in 6/8: a frame-drum gallop with triplet rolls, taiko on the dotted quarters and a low pulse in A dorian. Spiccato strings and goblet cracks join at tier 1; a fiddle-like reed tune and choir swells come in at tier 2.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 6, q: 1.8, attack: 0.004, release: 0.03 });
        g.low = m.synth(g, g.pad, { type: 'sawtooth', detune: 11, q: 0.8, attack: 0.004, release: 0.03 });
        g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 7, q: 1.1, attack: 0.02, release: 0.06, vibrato: 18, rate: 6 });
    },
    bar(m, at, g) {
        const beat = m.beat, tier = m.tier, level = 0.85 + 0.15 * m.intensity, index = m.bar % 8, root = BURN_ROOTS[index];
        BURN_ACCENTS.forEach((accent, step) => {
            m.drum(at + step * beat, 'm-frame', (0.08 + 0.1 * accent) * level, { rate: accent === 1 ? 1 : 1.18, pan: step < 3 ? -0.2 : 0.2, wet: 0.2 });
            if (tier >= 2 || (tier === 1 && (step === 2 || step === 5))) m.drum(at + (step + 0.5) * beat, 'm-frame', 0.06 * level, { rate: 1.3, pan: 0.3, wet: 0.2 });
        });
        for (const step of [0, 3]) m.drum(at + step * beat, 'm-taiko', (step ? 0.38 : 0.46) * level, { rate: step ? 1.08 : 1, pan: step ? 0.25 : -0.25, wet: 0.3 });
        if (m.bar % 2 === 0 || tier >= 2) m.drum(at, 'm-odaiko', 0.46 * level, { wet: 0.4 });
        [0, 0, 12, 0, 7, 0].forEach((offset, step) => g.bass.note(at + step * beat, root + offset, beat * 0.7, (step % 3 === 0 ? 0.12 : 0.085) * level, 360 + tier * 140));
        if (tier >= 1) {
            BURN_FIGURE.forEach((offset, step) => g.low.note(at + step * beat, root + 24 + offset - (offset === 3 && root === 28 ? -1 : 0), beat * 0.6, (step % 3 === 0 ? 0.05 : 0.035) * level, 1300 + tier * 400));
            for (const step of [2, 5]) m.drum(at + step * beat, 'm-tek', 0.12 * level, { pan: step === 2 ? -0.4 : 0.4, wet: 0.2 });
            for (const step of [0, 3]) { m.drum(at + step * beat, 'm-kick', 0.34 * level); m.pump(at + step * beat, 0.6); }
        }
        if (tier >= 2) {
            phrase(m, at, BURN_TUNE[index], (time, midi, seconds) => g.lead.note(time, midi, seconds * 0.9, 0.034 * level, 1800, 0.02));
            if (m.bar % 4 === 0) [root + 12, root + 19, root + 24].forEach((midi, voice) => m.choir(at, midi, m.barSeconds * 4, 0.024 * level, { vowel: 'ah', attack: 1, release: 1.4, pan: lowPan[voice], wet: 0.6, vibrato: 18 }));
            m.drum(at + 3 * beat, 'm-snare', 0.22 * level, { wet: 0.3 });
        }
        combatFurniture(m, at, beat, tier, level);
    },
};

export default [
    planetWind, tradeWinds, highAltitude, frostline,
    fieldSteel, foundry, redShoals, icefall,
    lament, requiem, debrisHymn,
    stealthHeart, heldBreath, shadowLine,
    combatDrums, breakneck, broadside, cutthroat, drumLine, lowOrbit, ironGamelan, burnPattern,
];
