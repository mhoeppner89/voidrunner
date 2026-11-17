import { clamp } from './random.js';
import { hits, phrase, section } from './musicKit.js';

// Open-space score. One shared pool plays everywhere; every star system adds
// two signature pieces that only play there and are favoured three to one.
//
// Piece shape (see audioMusic.js): { id, context, title, note, tempo,
// beats?, echo?, trim?, minutes?, systems?, weight?, setup?(m, g),
// bar(m, at, g), end?(m, at, sting) }. `m` is the director, `g` the voice
// group, `m.bar` counts bars since the piece began.
//
// House rules: bells, plucks and mallets stay at or below C6 (midi 84) with
// soft attacks; the open-space pieces are beds, not foreground tunes.

const signature = (systemId) => ({ systems: { [systemId]: 3 }, weight: 0 });
const lowPan = [-0.45, 0.35, -0.15, 0.45, 0, -0.3];

// ------------------------------------------------------------- shared pool

// The original deep-space bed.
const DRIFT = [
    [33, [45, 52, 55, 59, 60]], [29, [41, 48, 52, 57, 60]], [36, [48, 55, 62, 64]], [31, [43, 50, 55, 60]],
    [33, [45, 55, 60, 64, 71]], [38, [50, 57, 60, 64, 65]], [29, [41, 57, 60, 64, 71]], [28, [40, 47, 50, 55, 59]],
];
const PENTATONIC = [69, 72, 74, 76, 79, 81, 84];
const drift = {
    id: 'open-drift', context: 'open', title: 'Deep Drift', tempo: 60,
    note: 'Wide slow chords, a low root and the occasional far-off soft bell answered by the delay. The emptiest, most patient bed.',
    bar(m, at) {
        const [bass, chord] = DRIFT[m.bar % DRIFT.length], level = m.intensity, bar = m.barSeconds;
        m.pad(at, bass, bar * 1.05, 0.085 * level, { cutoff: 320, attack: 1.4, release: 2.4, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => {
            if (voice > 1 && m.chance(0.14)) return; // thin the chord now and then
            m.pad(at + voice * 0.22, midi, bar * 1.02, m.range(0.026, 0.036) * level, {
                cutoff: m.range(900, 1500) * (0.8 + 0.3 * level), attack: m.range(1.4, 2), release: 2.6,
                pan: [-0.5, 0.35, -0.2, 0.5, 0][voice], wet: 0.7,
            });
        });
        if (m.chance(0.5)) {
            const count = m.chance(0.3) ? 2 : 1;
            for (let i = 0; i < count; i += 1)
                m.bell(at + m.range(0.6, 3) + i * m.beat * 0.75, m.pick(PENTATONIC), m.range(0.014, 0.022) * level, { decay: m.range(2.4, 3.6), attack: 0.14, index: 1.1, pan: m.range(-0.6, 0.6), echo: 0.6, wet: 0.9 });
        }
        if (m.bar % 4 === 2)
            m.pad(at + 1, m.pick([76, 81, 83]), bar * 1.4, 0.011 * level, { cutoff: 2600, attack: 2.2, release: 3, wave: 'glass', pan: m.range(-0.4, 0.4), wet: 0.9 });
    },
    end(m, at, sting) {
        [33, 45, 52, 59, 64].forEach((midi, voice) => m.pad(at + voice * 0.3, midi, 4, voice ? 0.026 : 0.07, { cutoff: voice ? 1100 : 320, attack: 1.6, release: 4, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// A slow string chorale in D lydian, three beats to the bar; a wordless
// voice sings two long phrases over it.
const LONG_WAVE = [
    [38, [50, 57, 62, 66]], [38, [52, 56, 59, 64]], [35, [50, 57, 61, 66]], [31, [47, 54, 57, 62]],
    [42, [50, 57, 62, 64]], [40, [47, 54, 55, 62]], [33, [50, 55, 57, 64]], [33, [49, 52, 57, 64]],
];
const LONG_WAVE_TUNE = [
    [[0, 66, 3]], [[0, 68, 2], [2, 64, 1]], [[0, 66, 3]], [[0, 62, 3]], [[0, 69, 2], [2, 71, 1]], [[0, 67, 3]], [[0, 64, 3]], [[0, 61, 3]],
    [[0, 69, 3]], [[0, 71, 2], [2, 68, 1]], [[0, 69, 1.5], [1.5, 66, 1.5]], [[0, 62, 3]], [[0, 66, 2], [2, 69, 1]], [[0, 71, 3]], [[0, 69, 3]], [[0, 64, 3]],
];
const longWave = {
    id: 'open-long-wave', context: 'open', trim: 0.97, title: 'Long Wave', tempo: 56, beats: 3,
    note: 'A slow string chorale in D lydian, in three; a wordless voice sings long phrases above it, and low mallets break the chords in the third section.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = LONG_WAVE[index], part = section(m), level = m.intensity, bar = m.barSeconds;
        m.pad(at, bass, bar * 1.04, 0.08 * level, { cutoff: 300, attack: 1.4, release: 2.2, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => m.strings(at + voice * 0.12, midi, bar * 1.02, (part === 3 ? 0.034 : 0.028) * level, { attack: 1.5, release: 2.4, cutoff: 1500 + 300 * level, pan: lowPan[voice], wet: 0.65 }));
        if (part === 1 || part === 3)
            phrase(m, at, LONG_WAVE_TUNE[index + (part === 3 ? 8 : 0)], (time, midi, seconds) => m.choir(time, midi, seconds * 0.95, 0.024 * level, { vowel: 'oo', attack: Math.min(1.2, seconds * 0.4), release: 1.8, pan: 0.1, wet: 0.8 }));
        if (part === 2)
            [0, 2, 1, 3, 2, 1].forEach((voice, step) => m.mallet(at + step * m.beat * 0.5, chord[voice], (step % 2 ? 0.022 : 0.03) * level, { decay: 1.4, pan: voice % 2 ? 0.35 : -0.35, echo: 0.3, wet: 0.5 }));
        if (index === 0 && m.chance(0.5)) m.air(at, bar * 2, 0.025, { frequency: 520, pan: m.range(-0.4, 0.4) });
    },
    end(m, at, sting) {
        [38, 50, 57, 64, 66, 68].forEach((midi, voice) => m.strings(at + voice * 0.2, midi, 4, voice ? 0.026 : 0.05, { attack: 1.8, release: 4, cutoff: voice ? 1500 : 500, pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// A patient arpeggio through a long echo; its filter opens and closes like a
// tide over sixteen bars. No drums.
const TIDAL = [
    [40, [52, 55, 59, 62], [59, 62, 66, 67, 71]], [36, [52, 55, 59, 62], [59, 62, 64, 67, 71]],
    [33, [48, 52, 55, 59], [57, 60, 64, 67, 71]], [35, [52, 54, 57, 59], [59, 64, 66, 69, 71]],
];
const TIDAL_SHAPES = [[0, 2, 1, 3, 2, 4, 3, 1], [0, 1, 2, 4, 3, 2, 1, 2]];
const tidalLock = {
    id: 'open-tidal-lock', context: 'open', trim: 0.95, title: 'Tidal Lock', tempo: 76, echo: 0.75,
    note: 'E minor. A soft arpeggio rides a long ping-pong echo while its filter opens and closes like a tide; pads and a sub root underneath, no drums.',
    setup(m, g) { g.arp = m.synth(g, g.bus, { wave: m.waves.glass, detune: 6, q: 1.4, attack: 0.012, release: 0.06 }); },
    bar(m, at, g) {
        const [bass, chord, notes] = TIDAL[(m.bar >> 1) % TIDAL.length], level = m.intensity, beat = m.beat;
        const tide = 0.5 - 0.5 * Math.cos((m.bar % 16) / 16 * Math.PI * 2);
        if (m.bar % 2 === 0) {
            m.pad(at, bass, m.barSeconds * 2.05, 0.08 * level, { cutoff: 300, attack: 1.2, release: 2, wave: 'bass', wet: 0.3, detune: 4 });
            chord.forEach((midi, voice) => m.pad(at + voice * 0.18, midi, m.barSeconds * 2, 0.022 * level, { cutoff: 1100, attack: 1.6, release: 2.2, pan: lowPan[voice], wet: 0.6 }));
        }
        const shape = TIDAL_SHAPES[m.bar % 2];
        for (let step = 0; step < 8; step += 1) {
            if (step && m.chance(0.1)) continue;
            g.arp.note(at + step * beat * 0.5, notes[shape[step]], beat * 0.38, (step % 4 === 0 ? 0.05 : 0.036) * level, 650 + 1000 * tide);
        }
        if (m.bar % 8 === 6) m.strings(at + beat, notes[4], m.barSeconds * 1.6, 0.016 * level, { attack: 2, release: 2.5, cutoff: 1800, pan: 0.3, wet: 0.8 });
        if (m.bar % 4 === 1) m.air(at, m.barSeconds * 1.5, 0.02 + 0.02 * tide, { frequency: 700 + 600 * tide, pan: m.range(-0.5, 0.5) });
    },
    end(m, at, sting) {
        [40, 52, 55, 59, 66].forEach((midi, voice) => m.pad(at + voice * 0.25, midi, 4, voice ? 0.024 : 0.07, { cutoff: voice ? 1200 : 300, attack: 1.4, release: 3.5, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// ------------------------------------------------------------ Helios Verge

// The frontier theme: a picked progression in G mixolydian, a reed singing
// the tune, a frame drum when the road opens up.
const HORIZON = [
    [31, [50, 55, 59, 62]], [31, [48, 53, 57, 60]], [31, [48, 52, 55, 60]], [31, [50, 55, 59, 62]],
    [28, [50, 55, 59, 62]], [36, [48, 52, 55, 60]], [38, [50, 55, 57, 62]], [38, [50, 54, 57, 62]],
];
const HORIZON_TUNE = [
    [[0, 67, 1.5], [1.5, 69, 0.5], [2, 71, 2]], [[0, 72, 1.5], [1.5, 71, 0.5], [2, 69, 2]], [[0, 67, 1], [1, 64, 1], [2, 67, 2]], [[0, 62, 4]],
    [[0, 71, 1.5], [1.5, 74, 0.5], [2, 74, 1], [3, 72, 1]], [[0, 71, 2], [2, 67, 2]], [[0, 69, 1.5], [1.5, 67, 0.5], [2, 69, 2]], [[0, 66, 3], [3, 62, 1]],
];
const PICKING = [0, 3, 2, 4, 1, 3, 2, 5];
const horizon = {
    id: 'open-helios-horizon', context: 'open', trim: 1.14, title: 'Verge Horizon', tempo: 68, ...signature('helios-verge'),
    note: 'Helios Verge signature. Warm and hopeful: a picked G mixolydian progression, a reed carrying the frontier tune, strings and a frame drum when the road opens up.',
    setup(m, g) { g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 4, q: 0.8, attack: 0.05, release: 0.12, vibrato: 12, rate: 5.2 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = HORIZON[index], part = section(m), level = m.intensity, beat = m.beat;
        m.pad(at, bass, m.barSeconds, 0.075 * level, { cutoff: 320, attack: 0.8, release: 1.6, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => m.pad(at + voice * 0.1, midi, m.barSeconds, 0.016 * level, { cutoff: 1100, attack: 1, release: 1.6, pan: lowPan[voice], wet: 0.5 }));
        const ext = [chord[0], chord[1], chord[2], chord[3], chord[1] + 12, chord[2] + 12];
        PICKING.forEach((voice, step) => {
            if (step > 0 && m.chance(0.08)) return;
            m.pluck(at + step * beat * 0.5 + (step % 2 ? beat * 0.04 : 0), ext[voice], (step % 2 ? 0.03 : 0.04) * level, { decay: 1.1, cutoff: 1500, pan: [-0.35, 0.25, -0.1, 0.4][step % 4], echo: 0.15, wet: 0.35 });
        });
        if (part === 1 || part === 3) {
            // The second statement drops an octave for its first half.
            const shift = part === 3 && index < 4 ? -12 : 0;
            phrase(m, at, HORIZON_TUNE[index], (time, midi, seconds) => g.lead.note(time, midi + shift, seconds * 0.92, 0.042 * level, 1500, 0.025));
            chord.slice(2).forEach((midi, voice) => m.strings(at, midi + 12, m.barSeconds, 0.014 * level, { attack: 1.2, release: 1.8, cutoff: 1700, pan: voice ? 0.4 : -0.4, wet: 0.6 }));
        }
        if (part >= 2) {
            m.drum(at, 'm-frame', 0.16 * level, { rate: 0.95, wet: 0.4, pan: -0.15 });
            m.drum(at + beat * 2.5, 'm-frame', 0.1 * level, { rate: 1.08, wet: 0.4, pan: 0.15 });
            if (m.chance(0.4)) m.drum(at + beat * 3.5, 'm-frame', 0.07, { rate: 1.2, wet: 0.4, pan: 0.25 });
        }
    },
    end(m, at, sting) {
        [31, 50, 55, 59, 62, 69].forEach((midi, voice) => m.pad(at + voice * 0.12, midi, 4, voice ? 0.022 : 0.07, { cutoff: voice ? 1200 : 320, attack: 1, release: 3.5, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.7 }, sting));
        m.pluck(at, 43, 0.05, { decay: 2.5, cutoff: 1200, echo: 0.4, wet: 0.5 }, sting);
    },
};

// A working road groove in D dorian: pulse bass, a 3+3+2 mallet figure,
// hand drums; the haulers' crew hums along in the second half.
const HAULERS = [
    [38, [53, 57, 60, 64]], [38, [53, 57, 60, 64]], [43, [53, 57, 59, 62]], [43, [55, 59, 62, 64]],
    [34, [53, 57, 58, 62]], [36, [52, 55, 60, 64]], [38, [53, 57, 60, 64]], [33, [52, 55, 60, 62]],
];
const HAULER_BASS = [[0, 0, 0.9], [1, 0, 0.4], [1.5, 12, 0.35], [2.5, 0, 0.4], [3, 10, 0.4], [3.5, 7, 0.4]];
const HAULER_HAND = hits('x..o.x-.x..o.xo.');
const haulers = {
    id: 'open-helios-haulers', context: 'open', trim: 1.2, title: 'Ore Haulers', tempo: 92, ...signature('helios-verge'),
    note: 'Helios Verge signature. A steady hauling groove in D dorian: pulse bass, a 3+3+2 mallet figure and hand drums; a hummed choir in the second half.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 4, q: 1.3, attack: 0.008, release: 0.05 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = HAULERS[index], part = section(m), level = m.intensity, beat = m.beat;
        for (const [time, offset, length] of HAULER_BASS) g.bass.note(at + time * beat, bass + offset, beat * length, (time === 0 ? 0.11 : 0.075) * level, 420 + (time === 0 ? 160 : 0));
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, 0.015 * level, { cutoff: 1000, attack: 0.6, release: 1.2, pan: lowPan[voice], wet: 0.45 }));
        // 3+3+2 accents across eight eighths.
        [0, 3, 6].forEach((step, i) => {
            m.mallet(at + step * beat * 0.5, chord[[1, 2, 3][i]], 0.04 * level, { decay: 0.9, pan: [-0.3, 0.3, 0][i], echo: 0.12, wet: 0.3 });
            if (m.chance(0.6)) m.mallet(at + (step + 1) * beat * 0.5, chord[[3, 1, 2][i]] - (i === 2 ? 12 : 0), 0.022 * level, { decay: 0.6, pan: [0.3, -0.3, 0.1][i], echo: 0.1, wet: 0.3 });
        });
        for (const [step, weight] of HAULER_HAND) m.drum(at + step * beat * 0.25, 'm-hand', 0.11 * weight * level, { rate: weight === 1 ? 0.92 : m.range(1.02, 1.12), pan: step % 2 ? 0.3 : -0.2, wet: 0.2 });
        for (let step = 1; step < 8; step += 2) m.drum(at + step * beat * 0.5, 'm-shaker', 0.045, { pan: 0.35, rate: m.range(0.95, 1.05) });
        m.drum(at, 'm-frame', 0.14 * level, { rate: 0.85, wet: 0.2 });
        if (part >= 2 && index % 2 === 0)
            chord.slice(0, 3).forEach((midi, voice) => m.choir(at, midi - (voice ? 0 : 12), m.barSeconds * 2, 0.018 * level, { vowel: 'oh', attack: 1.4, release: 2, pan: [-0.3, 0.3, 0][voice], wet: 0.6 }));
    },
    end(m, at, sting) {
        [38, 50, 57, 60, 64].forEach((midi, voice) => m.pad(at + voice * 0.08, midi, 3, voice ? 0.022 : 0.07, { cutoff: voice ? 1100 : 320, attack: 0.6, release: 3, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.6 }, sting));
        m.drum(at, 'm-frame', 0.2, { rate: 0.8, wet: 0.6 }, sting);
    },
};

// ----------------------------------------------------------------- Meridian

// Clockwork in 7/8: two interlocking lines of different lengths drift in
// and out of phase over a lydian string bed.
const LATTICE = [[36, [52, 55, 59, 66]], [33, [52, 55, 59, 60]], [36, [50, 54, 57, 62]], [40, [50, 55, 59, 62]]];
const LATTICE_A = [60, 67, 64, 71, 67, 64, 66];
const LATTICE_B = [76, 74, 71, 72, 69, 67, 71, 74];
const LATTICE_GROUPS = [0, 2, 4];
const lattice = {
    id: 'open-meridian-lattice', context: 'open', trim: 1.6, title: 'Lattice', tempo: 210, beats: 7, echo: 1.5, ...signature('meridian'),
    note: 'Meridian signature. Precise clockwork in 7/8: a mallet cell and a plucked line of different lengths drift through phase over C lydian strings.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 3, q: 1, attack: 0.01, release: 0.08 }); },
    bar(m, at, g) {
        const [bass, chord] = LATTICE[(m.bar >> 2) % LATTICE.length], part = section(m), level = m.intensity, beat = m.beat;
        if (m.bar % 4 === 0) chord.forEach((midi, voice) => m.strings(at + voice * 0.15, midi, m.barSeconds * 4, 0.022 * level, { attack: 2, release: 2.4, cutoff: 1500, pan: lowPan[voice], wet: 0.65 }));
        if (part !== 3) LATTICE_A.forEach((midi, step) => m.mallet(at + step * beat, midi - 12 * (step === 0 ? 1 : 0), (LATTICE_GROUPS.includes(step) ? 0.034 : 0.022) * level, { decay: 0.8, pan: step % 2 ? 0.3 : -0.3, echo: 0.12, wet: 0.35 }));
        if (part >= 1) {
            const offset = (m.bar * 3) % LATTICE_B.length;
            for (const step of LATTICE_GROUPS) m.pluck(at + step * beat, LATTICE_B[(offset + step) % LATTICE_B.length], 0.03 * level, { decay: 1.1, cutoff: 1400, pan: 0.45 - step * 0.2, echo: 0.3, wet: 0.45 });
        }
        if (part >= 2) {
            for (const step of LATTICE_GROUPS) g.bass.note(at + step * beat, bass + (step === 4 ? 7 : 0), beat * 1.6, 0.08 * level, 360);
            m.drum(at + 4 * beat, 'm-wood', 0.05 * level, { pan: -0.4, wet: 0.3, rate: 0.95 });
            if (m.chance(0.5)) m.drum(at + 6 * beat, 'm-wood', 0.03, { pan: 0.4, wet: 0.3, rate: 1.1 });
        }
        if (part === 3 && m.bar % 2 === 0) m.strings(at, m.pick([71, 74, 76, 78]), m.barSeconds * 1.8, 0.016 * level, { attack: 1.4, release: 2, cutoff: 2000, pan: 0.2, wet: 0.7 });
    },
    end(m, at, sting) {
        [36, 52, 55, 59, 66].forEach((midi, voice) => m.strings(at + voice * 0.1, midi, 4, voice ? 0.024 : 0.05, { attack: 1.2, release: 3.5, cutoff: voice ? 1600 : 500, pan: lowPan[voice], wet: 0.75 }, sting));
        m.mallet(at, 60, 0.04, { decay: 2, echo: 0.5, wet: 0.5 }, sting);
    },
};

// Cathedral of commerce: choir and organ in B-flat, a stately string melody
// and a bass walking in half notes.
const CONCOURSE = [
    [34, [50, 53, 58, 62], 33], [33, [48, 53, 57, 60], 31], [31, [50, 53, 55, 58], 32], [39, [51, 55, 58, 62], 38],
    [38, [50, 53, 58, 62], 39], [39, [51, 55, 58, 63], 38], [36, [51, 55, 58, 60], 40], [41, [51, 53, 57, 60], 40],
];
const CONCOURSE_TUNE = [
    [[0, 74, 2], [2, 72, 1], [3, 70, 1]], [[0, 72, 3], [3, 69, 1]], [[0, 70, 2], [2, 67, 2]], [[0, 67, 3], [3, 70, 1]],
    [[0, 74, 2], [2, 77, 2]], [[0, 75, 2], [2, 74, 1], [3, 72, 1]], [[0, 72, 2], [2, 70, 2]], [[0, 69, 4]],
];
const concourse = {
    id: 'open-meridian-concourse', context: 'open', trim: 1.17, title: 'Grand Concourse', tempo: 72, ...signature('meridian'),
    note: 'Meridian signature. Stately and wealthy: choir and soft organ in B-flat major, a string melody and a bass walking in half notes.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord, passing] = CONCOURSE[index], part = section(m), level = m.intensity, half = m.barSeconds / 2;
        m.pad(at, bass, half, 0.075 * level, { cutoff: 340, attack: 0.5, release: 1, wave: 'bass', wet: 0.3, detune: 3 });
        m.pad(at + half, passing, half, 0.06 * level, { cutoff: 340, attack: 0.5, release: 1, wave: 'bass', wet: 0.3, detune: 3 });
        chord.forEach((midi, voice) => {
            m.choir(at + voice * 0.08, midi, m.barSeconds, 0.016 * level, { vowel: 'ah', attack: 1, release: 1.6, pan: lowPan[voice], wet: 0.7 });
            if (part !== 0) m.pad(at, midi, m.barSeconds, 0.012 * level, { wave: 'organ', cutoff: 1800, attack: 0.5, release: 1, pan: -lowPan[voice], wet: 0.6, detune: 4 });
        });
        if (part === 1 || part === 3)
            phrase(m, at, CONCOURSE_TUNE[index], (time, midi, seconds) => m.strings(time, midi - (part === 1 ? 12 : 0), seconds * 0.98, 0.03 * level, { attack: Math.min(0.5, seconds * 0.3), release: 1, cutoff: 2200, pan: 0.15, wet: 0.6 }));
        if (index === 0) m.drum(at, part === 2 ? 'm-gong' : 'm-taiko', part === 2 ? 0.07 : 0.08 * level, { rate: 0.8, wet: 0.8 });
    },
    end(m, at, sting) {
        [34, 46, 53, 58, 62, 65].forEach((midi, voice) => m.choir(at + voice * 0.1, midi, 4, voice ? 0.02 : 0.03, { vowel: 'ah', attack: 1.2, release: 3.5, pan: lowPan[voice], wet: 0.8 }, sting));
    },
};

// ------------------------------------------------------------------ Redwake

// Smouldering E phrygian over a pedal: a glass voice sighing down a
// semitone, a slow double-thud drum and, later, a reed lament.
const EMBER = [[40, [52, 55, 59]], [40, [53, 57, 60, 64]], [40, [52, 55, 59, 62]], [40, [50, 53, 57]]];
const EMBER_SCALE = [64, 65, 67, 69, 71, 72, 74];
const EMBER_TUNE = [[[0, 64, 2], [2, 65, 1], [3, 64, 1]], [[0, 62, 2], [2, 60, 1], [3, 59, 1]], [[0, 60, 3], [3, 62, 1]], [[0, 64, 4]]];
const ember = {
    id: 'open-redwake-ember', context: 'open', trim: 1.32, title: 'Ember Drift', tempo: 52, ...signature('redwake'),
    note: 'Redwake signature. Sparse and smouldering: an E phrygian pedal, a glass voice that sighs down a semitone, a slow double-thud drum and a reed lament.',
    setup(m, g) { g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 5, q: 0.7, attack: 0.08, release: 0.2, vibrato: 16, rate: 4.6 }); },
    bar(m, at, g) {
        const index = m.bar % 4, [, chord] = EMBER[index], part = section(m), level = m.intensity, beat = m.beat;
        m.pad(at, 28, m.barSeconds * 1.05, 0.07 * level, { cutoff: 220, attack: 1.6, release: 2.4, wave: 'bass', wet: 0.3, detune: 4 });
        m.pad(at, 35, m.barSeconds * 1.05, 0.03 * level, { cutoff: 300, attack: 1.8, release: 2.4, wave: 'bass', wet: 0.4, detune: 6 });
        chord.forEach((midi, voice) => m.pad(at + voice * 0.3, midi, m.barSeconds, 0.019 * level, { cutoff: 800, attack: 2, release: 2.6, pan: lowPan[voice], wet: 0.7 }));
        if (m.chance(0.6)) {
            const note = m.pick(EMBER_SCALE);
            m.pad(at + m.range(0.5, 2), note, m.range(2.4, 3.4), 0.014 * level, { cutoff: 1300, attack: 1, release: 1.6, wave: 'glass', fall: note === 65 || note === 72 ? -1 : -2, pan: m.range(-0.6, 0.6), wet: 1 });
        }
        if (part === 2) phrase(m, at, EMBER_TUNE[index], (time, midi, seconds) => g.lead.note(time, midi, seconds * 0.9, 0.034 * level, 1100, 0.05));
        if (m.bar % 2 === 0) { m.drum(at, 'm-frame', 0.14 * level, { rate: 0.78, wet: 0.6 }); m.drum(at + beat * 0.45, 'm-frame', 0.09 * level, { rate: 0.74, wet: 0.6 }); }
        if (m.bar % 8 === 0) m.drum(at + beat, 'm-gong', 0.05, { wet: 0.8, rate: 0.9 });
        if (m.bar % 4 === 3) m.air(at, m.barSeconds * 1.4, 0.03, { frequency: 320, pan: m.range(-0.4, 0.4) });
    },
    end(m, at, sting) {
        [28, 40, 47, 52].forEach((midi, voice) => m.pad(at + voice * 0.3, midi, 5, voice ? 0.022 : 0.07, { cutoff: voice ? 900 : 220, attack: 1.8, release: 4, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.8 }, sting));
        m.drum(at, 'm-gong', 0.07, { wet: 0.9, rate: 0.85 }, sting);
    },
};

// Noir smuggling run in C minor: a pulse-bass riff, swung shaker, low string
// stabs and a reed that answers itself in blues phrases.
const SMUGGLER = [[36, [48, 51, 55, 58, 62]], [36, [48, 51, 55, 58, 62]], [32, [48, 51, 55, 60]], [31, [47, 50, 53, 56]]];
const SMUGGLER_RIFF = [[0, 0, 0.75], [1.5, 0, 0.4], [2, 3, 0.4], [2.5, 5, 0.4], [3, 7, 0.7]];
const SMUGGLER_BLUES = [60, 63, 65, 66, 67, 70, 72, 75];
const smuggler = {
    id: 'open-redwake-smuggler', context: 'open', trim: 1.14, title: "Smuggler's Run", tempo: 84, ...signature('redwake'),
    note: "Redwake signature. Brooding noir groove in C minor: a pulse-bass riff, swung shaker and rim, low string stabs and a reed trading blues phrases.",
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 5, q: 2.6, attack: 0.008, release: 0.05 });
        g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 4, q: 0.8, attack: 0.03, release: 0.1, vibrato: 18, rate: 5.4 });
    },
    bar(m, at, g) {
        const index = m.bar % 4, [bass, chord] = SMUGGLER[index], part = section(m), level = m.intensity, beat = m.beat;
        for (const [time, offset, length] of SMUGGLER_RIFF) g.bass.note(at + time * beat, bass + offset, beat * length, (time === 0 ? 0.12 : 0.085) * level, 520);
        if (index === 3) g.bass.note(at + 3.75 * beat, bass - 1, beat * 0.2, 0.07 * level, 480);
        if (index !== 1) chord.forEach((midi, voice) => m.strings(at + (index === 0 ? 0 : beat * 0.5), midi, beat * 0.7, 0.03 * level, { attack: 0.06, release: 0.5, cutoff: 1200, pan: lowPan[voice], wet: 0.4, vibrato: 4 }));
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, 0.012 * level, { cutoff: 800, attack: 0.8, release: 1.2, pan: -lowPan[voice], wet: 0.5 }));
        for (let step = 0; step < 16; step += 1) {
            if (step % 2 === 0 && m.chance(0.3)) continue;
            const swing = step % 2 ? beat * 0.09 : 0;
            m.drum(at + step * beat * 0.25 + swing, 'm-shaker', (step % 4 === 2 ? 0.06 : 0.035) * level, { pan: 0.35, rate: m.range(0.95, 1.05) });
        }
        m.drum(at + beat, 'm-rim', 0.07, { pan: -0.25, wet: 0.3 });
        m.drum(at + beat * 3, 'm-rim', 0.07, { pan: -0.25, wet: 0.3 });
        m.drum(at, 'm-frame', 0.15 * level, { rate: 0.8, wet: 0.25 });
        if (part >= 2) m.drum(at + beat * 3, 'm-clap', 0.05 * level, { pan: 0.15, wet: 0.35 });
        if ((part === 1 || part === 3) && index % 2 === 0) {
            // Call on the first bar, answer a little lower on the second.
            let time = at + beat * m.pick([0.5, 1]);
            const count = 3 + Math.floor(m.random() * 3);
            let note = 3 + Math.floor(m.random() * 4);
            for (let i = 0; i < count * 2; i += 1) {
                const answer = i >= count, length = m.pick([0.5, 0.5, 1, 1.5]) * beat;
                g.lead.note(time + (answer ? m.barSeconds : 0), SMUGGLER_BLUES[clamp(note - (answer ? 1 : 0), 0, SMUGGLER_BLUES.length - 1)], length * 0.85, 0.034 * level, 1300, 0.03);
                time += length;
                if (i === count - 1) time = at + beat * m.pick([0.5, 1]);
                note = clamp(note + m.pick([-2, -1, -1, 1, 2]), 0, SMUGGLER_BLUES.length - 1);
            }
        }
    },
    end(m, at, sting) {
        [36, 48, 51, 55, 62].forEach((midi, voice) => m.strings(at, midi, 3, voice ? 0.03 : 0.06, { attack: 0.08, release: 3, cutoff: voice ? 1300 : 400, pan: lowPan[voice], wet: 0.6 }, sting));
        m.drum(at, 'm-gong', 0.06, { wet: 0.8 }, sting);
    },
};

// ---------------------------------------------------------------- Pale Ring

// Ice: quartal choir clusters at a crawl, glass glints, a high thin wind.
const RIME = [[35, [50, 54, 57, 64]], [31, [50, 54, 59, 61]], [28, [47, 54, 55, 62]], [30, [47, 52, 54, 61]]];
const RIME_GLINTS = [66, 69, 71, 73, 76, 78];
const rime = {
    id: 'open-pale-rime', context: 'open', trim: 1.4, title: 'Rime', tempo: 46, ...signature('pale-ring'),
    note: 'Pale Ring signature. Cold and remote: quartal choir clusters at a crawl, glass glints that bloom slowly and a thin high wind. No pulse at all.',
    bar(m, at) {
        const [bass, chord] = RIME[m.bar % RIME.length], level = m.intensity, bar = m.barSeconds;
        m.pad(at, bass, bar * 1.04, 0.06 * level, { cutoff: 260, attack: 2, release: 3, wave: 'bass', wet: 0.4, detune: 3 });
        chord.forEach((midi, voice) => {
            if (voice > 0 && m.chance(0.15)) return;
            m.choir(at + voice * 0.4, midi, bar, m.range(0.017, 0.022) * level, { vowel: voice % 2 ? 'oo' : 'mm', attack: 2.2, release: 3, pan: lowPan[voice], wet: 0.85, vibrato: 8 });
        });
        for (let glint = m.chance(0.5) ? 2 : 1; glint > 0; glint -= 1)
            m.pad(at + m.range(0.5, bar - 1), m.pick(RIME_GLINTS), m.range(2.5, 4), 0.009 * level, { cutoff: 2600, attack: 2.4, release: 3, wave: 'glass', pan: m.range(-0.7, 0.7), wet: 1 });
        if (m.bar % 2 === 1) m.air(at, bar * 1.5, 0.022, { frequency: m.range(1600, 2400), q: 1.6, pan: m.range(-0.6, 0.6) });
        if (m.bar % 16 === 8) m.drum(at, 'm-gong', 0.04, { rate: 1.1, wet: 1 });
    },
    end(m, at, sting) {
        [35, 50, 54, 57, 64].forEach((midi, voice) => m.choir(at + voice * 0.4, midi, 5, voice ? 0.02 : 0.03, { vowel: 'oo', attack: 2, release: 4, pan: lowPan[voice], wet: 0.9, vibrato: 6 }, sting));
    },
};

// A survey drone in three: low mallets ripple through B minor chords and a
// beacon tone returns every four bars.
const SURVEY = [[35, [50, 54, 57, 61]], [31, [50, 54, 57, 59]], [38, [50, 54, 57, 64]], [33, [49, 52, 57, 59]]];
const SURVEY_SHAPE = [0, 2, 1, 3, 2, 1];
const survey = {
    id: 'open-pale-survey', context: 'open', trim: 1.17, title: 'Survey Beacon', tempo: 60, beats: 3, ...signature('pale-ring'),
    note: 'Pale Ring signature. Observation in three: low mallets ripple through B minor chords, a string drone and a soft beacon tone returning every four bars.',
    bar(m, at) {
        const [bass, chord] = SURVEY[(m.bar >> 1) % SURVEY.length], part = section(m), level = m.intensity, beat = m.beat;
        if (m.bar % 2 === 0) {
            m.pad(at, bass, m.barSeconds * 2.04, 0.07 * level, { cutoff: 280, attack: 1.2, release: 2, wave: 'bass', wet: 0.35, detune: 4 });
            chord.forEach((midi, voice) => m.pad(at + voice * 0.2, midi, m.barSeconds * 2, 0.014 * level, { cutoff: 900, attack: 1.6, release: 2, pan: lowPan[voice], wet: 0.6 }));
        }
        SURVEY_SHAPE.forEach((voice, step) => {
            if (step && m.chance(0.12)) return;
            m.mallet(at + step * beat * 0.5, chord[voice] - (step === 0 ? 12 : 0), (step === 0 ? 0.036 : 0.026) * level, { decay: 1.3, pan: voice % 2 ? 0.4 : -0.4, echo: 0.25, wet: 0.5 });
        });
        if (part === 1 || part === 3) {
            if (m.bar % 2 === 0) [bass + 12, bass + 19].forEach((midi, voice) => m.strings(at, midi, m.barSeconds * 2, 0.02 * level, { attack: 1.6, release: 2, cutoff: 900, pan: voice ? 0.3 : -0.3, wet: 0.6 }));
        }
        if (m.bar % 4 === 0) m.bell(at + beat * 0.5, 71, 0.016, { decay: 2.6, attack: 0.08, ratio: 1, index: 0.6, pan: 0.2, echo: 0.6, wet: 0.8 });
        if (m.bar % 4 === 2) m.air(at, m.barSeconds * 2, 0.022, { frequency: 900, pan: m.range(-0.5, 0.5) });
    },
    end(m, at, sting) {
        [35, 50, 54, 57, 61].forEach((midi, voice) => m.pad(at + voice * 0.2, midi, 4, voice ? 0.02 : 0.06, { cutoff: voice ? 1000 : 280, attack: 1.4, release: 3.5, wave: voice ? 'warm' : 'bass', pan: lowPan[voice], wet: 0.8 }, sting));
        m.bell(at + 0.5, 71, 0.016, { decay: 3, attack: 0.08, ratio: 1, index: 0.6, echo: 0.6, wet: 0.8 }, sting);
    },
};

// ------------------------------------------------------------------ Acheron

// Near the black hole time stretches: very slow harmonic minor, voices that
// slide downward through each bar and a heartbeat slowed to a crawl.
const HORIZON_EVENT = [[36, [48, 55, 60, 63]], [32, [48, 56, 60, 63]], [29, [48, 53, 56, 60]], [31, [47, 55, 59, 62]]];
const eventHorizon = {
    id: 'open-acheron-horizon', context: 'open', trim: 1.12, title: 'Event Horizon', tempo: 40, ...signature('acheron'),
    note: 'Acheron signature. Gravity made audible: very slow C harmonic minor, voices that slide downward through each bar, low choir and a heartbeat slowed to a crawl.',
    bar(m, at) {
        const [bass, chord] = HORIZON_EVENT[m.bar % HORIZON_EVENT.length], level = m.intensity, bar = m.barSeconds, beat = m.beat;
        m.pad(at, bass, bar * 1.04, 0.075 * level, { cutoff: 240, attack: 2, release: 3, wave: 'bass', wet: 0.35, detune: 3 });
        chord.forEach((midi, voice) => m.pad(at + voice * 0.4, midi, bar, 0.018 * level, { cutoff: 900, attack: 2.4, release: 3, pan: lowPan[voice], wet: 0.75, fall: voice === 3 && m.chance(0.5) ? -1 : 0 }));
        if (m.bar % 2 === 0) [chord[0], chord[1]].forEach((midi, voice) => m.choir(at + beat, midi, bar * 1.6, 0.02 * level, { vowel: 'oh', attack: 2.6, release: 3, pan: voice ? 0.35 : -0.35, wet: 0.8, vibrato: 10 }));
        m.drum(at, 'm-frame', 0.15 * level, { rate: 0.68, wet: 0.7 });
        m.drum(at + beat * 0.5, 'm-frame', 0.09 * level, { rate: 0.64, wet: 0.7 });
        if (m.chance(0.45)) m.pad(at + beat * 2, m.pick([67, 72, 75]), bar * 0.8, 0.011 * level, { cutoff: 1500, attack: 1.4, release: 2, wave: 'glass', fall: -3, pan: m.range(-0.6, 0.6), wet: 1 });
        if (m.bar % 4 === 0) m.drum(at + beat * 0.1, 'm-gong', 0.06, { rate: 0.75, wet: 0.9 });
    },
    end(m, at, sting) {
        [24, 36, 43, 48, 55].forEach((midi, voice) => m.pad(at + voice * 0.4, midi, 6, voice ? 0.022 : 0.06, { cutoff: voice ? 800 : 200, attack: 2, release: 5, wave: voice ? 'warm' : 'bass', fall: voice === 4 ? -2 : 0, pan: lowPan[voice], wet: 0.85 }, sting));
    },
};

// The Alliance keeps watch: low strings in a spiccato ostinato, horn swells
// on the changes and a resolute theme in D minor.
const VIGIL = [[38, 0], [38, 0], [34, 1], [34, 1], [41, 2], [41, 2], [36, 3], [33, 4]];
const VIGIL_CHORDS = [[50, 53, 57], [50, 53, 58], [48, 53, 57], [48, 52, 55], [49, 52, 57]];
const VIGIL_FIGURE = [0, 0, 7, 0, 3, 0, 7, 5];
const VIGIL_TUNE = [
    [[0, 62, 1.5], [1.5, 64, 0.5], [2, 65, 2]], [[0, 69, 3], [3, 67, 1]], [[0, 65, 2], [2, 62, 2]], [[0, 65, 1.5], [1.5, 67, 0.5], [2, 69, 2]],
    [[0, 72, 3], [3, 70, 1]], [[0, 69, 4]], [[0, 67, 2], [2, 64, 2]], [[0, 64, 2], [2, 61, 2]],
];
const vigil = {
    id: 'open-acheron-vigil', context: 'open', title: 'Alliance Vigil', tempo: 76, ...signature('acheron'),
    note: 'Acheron signature. A watchful patrol: low strings in a spiccato ostinato, horn-like swells on each change and a resolute D minor theme.',
    setup(m, g) { g.low = m.synth(g, g.pad, { type: 'sawtooth', detune: 10, q: 0.8, attack: 0.008, release: 0.06 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chordIndex] = VIGIL[index], chord = VIGIL_CHORDS[chordIndex], part = section(m), level = m.intensity, beat = m.beat;
        const minor = chordIndex === 0 || chordIndex === 1;
        VIGIL_FIGURE.forEach((offset, step) => g.low.note(at + step * beat * 0.5, bass + 12 + (offset === 3 && !minor ? 4 : offset), beat * 0.3, (step % 4 === 0 ? 0.05 : 0.034) * level, 700 + (step % 4 === 0 ? 300 : 0)));
        m.pad(at, bass, m.barSeconds, 0.07 * level, { cutoff: 300, attack: 0.6, release: 1.2, wave: 'bass', wet: 0.3, detune: 3 });
        if (index % 2 === 0) chord.forEach((midi, voice) => m.strings(at + voice * 0.05, midi + 12, m.barSeconds * 2, 0.024 * level, { wave: 'brass', attack: 0.7, release: 1.4, cutoff: 1300, pan: lowPan[voice], wet: 0.55, vibrato: 6 }));
        if (part === 1 || part === 3)
            phrase(m, at, VIGIL_TUNE[index], (time, midi, seconds) => m.strings(time, midi, seconds * 0.96, 0.032 * level, { attack: Math.min(0.35, seconds * 0.3), release: 0.9, cutoff: 2400, pan: 0.1, wet: 0.55 }));
        m.drum(at, 'm-frame', 0.15 * level, { rate: 0.9, wet: 0.35 });
        if (index % 2 === 1) m.drum(at + beat * 2, 'm-taiko', 0.12 * level, { rate: 0.9, wet: 0.6, pan: 0.2 });
        if (part >= 2) m.drum(at + beat * 3.5, 'm-frame', 0.08, { rate: 1.05, wet: 0.35, pan: -0.2 });
    },
    end(m, at, sting) {
        [38, 50, 54, 57, 62].forEach((midi, voice) => m.strings(at + voice * 0.08, midi, 4, voice ? 0.028 : 0.05, { wave: voice ? 'brass' : undefined, attack: 0.8, release: 3.5, cutoff: voice ? 1500 : 500, pan: lowPan[voice], wet: 0.7 }, sting));
        m.drum(at, 'm-taiko', 0.2, { rate: 0.85, wet: 0.8 }, sting);
    },
};

export default [drift, longWave, tidalLock, horizon, haulers, lattice, concourse, ember, smuggler, rime, survey, eventHorizon, vigil].map((piece) => ({ context: 'open', ...piece }));
