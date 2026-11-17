import { clamp } from './random.js';
import { hits, phrase, section } from './musicKit.js';

// Docked themes. Each belongs to the stations or planets in `locations`;
// minor outposts share a theme with a close sibling. Docked music is the
// one place for grooves and tunes, but it is still a backdrop to menus:
// moderate levels, no hard transients up high.

const lowPan = [-0.4, 0.4, -0.15, 0.2, 0, -0.3];

// Helix Freeport: the original lounge (and the title screen).
const LOUNGE = [
    [36, [52, 55, 59, 62]], [33, [55, 59, 60, 64]], [41, [57, 60, 64, 67]], [43, [53, 57, 60, 64]],
    [40, [55, 59, 62]], [33, [55, 60, 64]], [38, [53, 57, 60, 64]], [31, [53, 60, 62]],
];
const LOUNGE_SHAPES = [[0, 2, 1, 3, 2, 1, 3, 2], [3, 2, 1, 0, 1, 2, 3, 1], [0, 1, 2, 3, 2, 3, 1, 2]];
const lounge = {
    id: 'dock-lounge', title: 'Freeport Lounge', tempo: 84, locations: ['helix'],
    note: 'Helix Freeport (and the title screen): the original warm lounge. Mellow keys roll through the chords, a round bass walks underneath, brushed percussion keeps time.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 3 }); },
    bar(m, at, g) {
        const index = m.bar % LOUNGE.length, [bass, chord] = LOUNGE[index], beat = m.beat;
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, 0.021, { cutoff: 1100, attack: 0.6, release: 1.2, pan: [-0.4, 0.4, -0.15, 0.2][voice], wet: 0.45 }));
        // Eighth-note keys with a light swing; three shapes rotate and breathe.
        const shape = LOUNGE_SHAPES[(m.bar >> 1) % LOUNGE_SHAPES.length];
        for (let step = 0; step < 8; step += 1) {
            if (step > 0 && m.chance(0.22)) continue;
            const midi = Math.min(chord[shape[step] % chord.length], 67);
            const time = at + (step >> 1) * beat + (step % 2 ? beat * 0.58 : 0);
            m.bell(time, midi, m.range(0.03, 0.042) * (step % 2 ? 0.8 : 1), { decay: m.range(0.9, 1.3), attack: 0.035, ratio: 1, index: 1.0, pan: [-0.35, 0.1, 0.35, -0.1][step % 4], echo: 0.18, wet: 0.35 });
        }
        g.bass.note(at, bass, beat * 1.4, 0.13, 420);
        g.bass.note(at + beat * 2.5, bass + (m.chance(0.5) ? 7 : 12), beat * 0.45, 0.085, 480);
        if (m.chance(0.55)) g.bass.note(at + beat * 3.5, LOUNGE[(index + 1) % LOUNGE.length][0] + (m.chance(0.5) ? 2 : -1), beat * 0.4, 0.075, 460);
        for (let step = 0; step < 8; step += 1)
            if (step % 2 || m.chance(0.25)) m.drum(at + step * beat * 0.5 + (step % 2 ? beat * 0.08 : 0), 'm-shaker', m.range(0.05, 0.075), { pan: 0.3, rate: m.range(0.95, 1.05) });
        m.drum(at + beat, 'm-rim', 0.07, { pan: -0.25, wet: 0.3 });
        m.drum(at + beat * 3, 'm-rim', 0.08, { pan: -0.25, wet: 0.3 });
        m.drum(at, 'm-heart', 0.16);
    },
};

// Rookhaven Bastion and Gatehouse Twelve: Concord authority at rest. A
// gentle march in D minor/F major for low strings, brushed snare and horns.
const BASTION = [[38, [50, 53, 57]], [38, [50, 53, 57]], [41, [48, 53, 57]], [41, [48, 53, 57]], [34, [50, 53, 58]], [36, [48, 52, 55]], [31, [50, 55, 58]], [33, [49, 52, 57]]];
const BASTION_MARCH = hits('x.oox.o.');
const BASTION_TUNE = [
    [[0, 62, 1.5], [1.5, 65, 0.5], [2, 69, 2]], [[0, 67, 1], [1, 65, 1], [2, 64, 2]], [[0, 65, 3], [3, 64, 1]], [[0, 60, 4]],
    [[0, 62, 1.5], [1.5, 65, 0.5], [2, 70, 2]], [[0, 67, 2], [2, 64, 2]], [[0, 62, 2], [2, 67, 1], [3, 65, 1]], [[0, 64, 4]],
];
const bastion = {
    id: 'dock-bastion', trim: 1.33, title: 'Bastion Watch', tempo: 72, locations: ['rook', 'gatehouse-twelve'],
    note: 'Rookhaven Bastion and Gatehouse Twelve: Concord authority off duty. A gentle march in D minor for low strings, a brushed snare, horn swells and a dignified theme.',
    setup(m, g) { g.low = m.synth(g, g.pad, { type: 'sawtooth', detune: 9, q: 0.8, attack: 0.01, release: 0.08 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = BASTION[index], beat = m.beat, part = section(m);
        for (const [step, weight] of BASTION_MARCH) g.low.note(at + step * beat * 0.5, bass + (step === 4 ? 7 : 0), beat * 0.35, 0.05 * weight, 650);
        m.pad(at, bass - 12, m.barSeconds, 0.06, { cutoff: 280, attack: 0.5, release: 1, wave: 'bass', wet: 0.3, detune: 3 });
        if (index % 2 === 0) chord.forEach((midi, voice) => m.strings(at + voice * 0.06, midi + 12, m.barSeconds * 2, 0.02, { wave: 'brass', attack: 0.9, release: 1.4, cutoff: 1200, pan: lowPan[voice], wet: 0.55, vibrato: 5 }));
        if (part === 1 || part === 3) phrase(m, at, BASTION_TUNE[index], (time, midi, seconds) => m.strings(time, midi, seconds * 0.96, 0.028, { attack: Math.min(0.3, seconds * 0.3), release: 0.8, cutoff: 2200, pan: 0.15, wet: 0.5 }));
        m.drum(at + beat, 'm-brush', 0.06, { pan: 0.2, wet: 0.2 });
        m.drum(at + beat * 3, 'm-brush', 0.07, { pan: 0.2, wet: 0.2 });
        m.drum(at + beat * 3, 'm-snare', 0.035, { rate: 0.92, pan: 0.1, wet: 0.3 });
        if (index === 7) for (let i = 0; i < 4; i += 1) m.drum(at + beat * (2 + i * 0.25), 'm-snare', 0.02 + i * 0.008, { rate: 0.95, wet: 0.3 });
        m.drum(at, 'm-frame', 0.1, { rate: 0.9, wet: 0.3 });
        if (index === 7 && part === 3) [50, 53, 57].forEach((midi, voice) => m.choir(at + beat * 2, midi, beat * 3, 0.016, { vowel: 'oh', attack: 0.8, release: 1.6, pan: lowPan[voice], wet: 0.6 }));
    },
};

// Haven Freeport: harbour lights in 6/8. Mallets rock through F major, hand
// drums lilt, a plucked tune comes and goes.
const HARBOUR = [[41, [53, 57, 60]], [40, [52, 55, 60]], [38, [53, 57, 60]], [34, [53, 57, 58]], [45, [53, 57, 60]], [43, [50, 53, 58]], [36, [53, 55, 58]], [36, [52, 55, 58]]];
const HARBOUR_ROCK = [0, 2, 1, 2, 1, 2];
const HARBOUR_HAND = hits('x..o.o');
const HARBOUR_TUNE = [
    [[0, 69, 3], [3, 67, 1], [4, 65, 2]], [[0, 64, 3], [3, 65, 1], [4, 67, 2]], [[0, 69, 2], [2, 65, 1], [3, 62, 3]], [[0, 65, 3], [3, 64, 1], [4, 62, 2]],
    [[0, 60, 3], [3, 65, 1], [4, 69, 2]], [[0, 70, 3], [3, 69, 1], [4, 67, 2]], [[0, 65, 3], [3, 67, 3]], [[0, 64, 6]],
];
const harbour = {
    id: 'dock-harbour', trim: 1.45, title: 'Haven Lights', tempo: 138, beats: 6, echo: 1.5, locations: ['haven'],
    note: 'Haven Freeport: harbour lights in a lilting 6/8. Mallets rock through F major, hand drums sway, warm strings, and a plucked tune comes and goes.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = HARBOUR[index], beat = m.beat, part = section(m);
        m.pad(at, bass - 12, m.barSeconds, 0.065, { cutoff: 300, attack: 0.5, release: 1.2, wave: 'bass', wet: 0.3, detune: 3 });
        chord.forEach((midi, voice) => m.strings(at + voice * 0.08, midi, m.barSeconds, 0.016, { attack: 0.9, release: 1.4, cutoff: 1300, pan: lowPan[voice], wet: 0.5 }));
        HARBOUR_ROCK.forEach((voice, step) => {
            if (step && m.chance(0.1)) return;
            m.mallet(at + step * beat, chord[voice] - (step === 0 ? 12 : 0), (step === 0 || step === 3 ? 0.04 : 0.028), { decay: 1, pan: step < 3 ? -0.3 : 0.3, echo: 0.15, wet: 0.35 });
        });
        if (part === 1 || part === 3) phrase(m, at, HARBOUR_TUNE[index], (time, midi, seconds) => m.pluck(time, midi, 0.04, { decay: Math.min(1.8, seconds * 1.2), cutoff: 1500, pan: 0.2, echo: 0.25, wet: 0.45 }));
        for (const [step, weight] of HARBOUR_HAND) m.drum(at + step * beat, 'm-hand', 0.09 * weight, { rate: weight === 1 ? 0.92 : 1.08, pan: step < 3 ? -0.2 : 0.25, wet: 0.25 });
        if (part >= 2) m.drum(at + beat * 3, 'm-brush', 0.05, { pan: 0.3, wet: 0.2 });
    },
};

// Unity and Argent Shipworks: the shift is on. A syncopated pulse bass,
// woodblock machinery, claps and organ skanks in E-flat mixolydian.
const SHIPWORKS = [[39, [55, 58, 61, 63]], [39, [55, 58, 61, 63]], [44, [55, 60, 63, 66]], [46, [56, 58, 61, 63]]];
const SHIPWORKS_BASS = [[0, 0, 0.6], [0.75, 0, 0.2], [1.5, 7, 0.4], [2, 10, 0.4], [2.75, 12, 0.2], [3.5, 7, 0.4]];
const SHIPWORKS_WOOD = hits('x.o.x.oxo.x.o.x.');
const SHIPWORKS_RIFF = [[0, 3], [0.5, 2], [1.5, 1], [2.5, 3], [3, 2]];
const shipworks = {
    id: 'dock-shipworks', trim: 1.43, title: 'Shipworks Shift', tempo: 96, locations: ['league-yard', 'argent'],
    note: 'Unity Shipworks and Argent Shipworks: the shift is on. A syncopated pulse bass, woodblock machinery, claps, a mallet riff and organ skanks in E-flat mixolydian.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 4, q: 2.5, attack: 0.006, release: 0.04 }); },
    bar(m, at, g) {
        const index = m.bar % 4, [bass, chord] = SHIPWORKS[index], beat = m.beat, part = section(m);
        for (const [time, offset, length] of SHIPWORKS_BASS) g.bass.note(at + time * beat, bass - 12 + offset, beat * length, time === 0 ? 0.11 : 0.08, 480);
        for (const hit of [0.5, 1.5, 2.5, 3.5]) chord.slice(1).forEach((midi, voice) => m.pad(at + hit * beat, midi, beat * 0.3, 0.014, { wave: 'organ', cutoff: 1800, attack: 0.02, release: 0.2, pan: lowPan[voice], wet: 0.3, detune: 4 }));
        if (part >= 1) for (const [time, voice] of SHIPWORKS_RIFF) m.mallet(at + time * beat, chord[voice], 0.032, { decay: 0.7, pan: 0.3, echo: 0.15, wet: 0.3 });
        for (const [step, weight] of SHIPWORKS_WOOD) m.drum(at + step * beat * 0.25, 'm-wood', 0.035 * weight, { rate: weight === 1 ? 0.95 : 1.2, pan: step % 4 === 0 ? -0.3 : 0.3, wet: 0.15 });
        m.drum(at + beat, 'm-clap', 0.06, { wet: 0.25 }); m.drum(at + beat * 3, 'm-clap', 0.065, { wet: 0.25 });
        m.drum(at, 'm-kick', 0.14); m.drum(at + beat * 2.5, 'm-kick', 0.1);
        if (part === 3 && index === 0) m.drum(at, 'm-anvil', 0.05, { rate: 0.7, pan: -0.4, wet: 0.5, echo: 0.3 });
    },
};

// Cinderfall Habitat: life in the black hole's shadow. A-flat lydian in
// slow choir and low mallets, a falling glass voice now and then.
const CINDERFALL = [[32, [44, 48, 51, 55]], [32, [46, 50, 53, 58]], [29, [44, 48, 51, 55]], [39, [49, 53, 56, 60]]];
const cinderfall = {
    id: 'dock-cinderfall', trim: 1.06, title: 'Cinderfall Habitat', tempo: 60, locations: ['cinderfall'],
    note: 'Cinderfall Habitat: warm life in the black hole\'s shadow. A-flat lydian in slow choir, low mallet arpeggios, high strings and a glass voice that falls away now and then.',
    bar(m, at) {
        const [bass, chord] = CINDERFALL[(m.bar >> 1) % CINDERFALL.length], beat = m.beat, part = section(m);
        if (m.bar % 2 === 0) {
            m.pad(at, bass, m.barSeconds * 2.04, 0.07, { cutoff: 260, attack: 1.4, release: 2, wave: 'bass', wet: 0.35, detune: 3 });
            chord.forEach((midi, voice) => m.choir(at + voice * 0.15, midi + 12, m.barSeconds * 2, 0.017, { vowel: 'oo', attack: 1.8, release: 2.4, pan: lowPan[voice], wet: 0.75 }));
        }
        [0, 1, 2, 3, 2, 1, 2, 3].forEach((voice, step) => {
            if (step && m.chance(0.15)) return;
            m.mallet(at + step * beat * 0.5, chord[voice] + (step >= 4 ? 12 : 0), step === 0 ? 0.034 : 0.024, { decay: 1.3, pan: voice % 2 ? 0.35 : -0.35, echo: 0.25, wet: 0.45 });
        });
        if (part >= 2 && m.bar % 2 === 0) m.strings(at, chord[3] + 12, m.barSeconds * 2, 0.014, { attack: 1.6, release: 2, cutoff: 1900, pan: 0.25, wet: 0.7 });
        if (m.chance(0.25)) m.pad(at + beat * 2, m.pick([67, 70, 72]), m.barSeconds, 0.009, { wave: 'glass', cutoff: 1500, attack: 1, release: 1.6, fall: -2, pan: m.range(-0.6, 0.6), wet: 1 });
        if (m.bar % 8 === 0) m.drum(at, 'm-gong', 0.035, { rate: 0.85, wet: 1 });
    },
};

// Cairn Yard: racers in the pits. An upbeat A major groove with claps, a
// sixteenth arpeggio and organ chords.
const PITLANE = [[33, [57, 61, 64]], [32, [56, 59, 64]], [30, [57, 61, 64]], [38, [57, 62, 66]], [37, [56, 61, 64]], [38, [57, 62, 66]], [40, [57, 59, 64]], [40, [56, 59, 64]]];
const pitlane = {
    id: 'dock-pitlane', trim: 1.19, title: 'Pit Lane', tempo: 112, locations: ['cairn'],
    note: 'Cairn Yard: racers in the pits. An upbeat A major groove with a light kick and claps, an octave pulse bass, a sixteenth arpeggio and organ chords.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.pulse, detune: 4, q: 1.6, attack: 0.005, release: 0.04 });
        g.arp = m.synth(g, g.bus, { wave: m.waves.glass, detune: 5, q: 1.2, attack: 0.006, release: 0.03 });
    },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = PITLANE[index], beat = m.beat, part = section(m);
        for (let step = 0; step < 8; step += 1) g.bass.note(at + step * beat * 0.5, bass + (step % 2 ? 12 : 0), beat * 0.32, step % 2 ? 0.07 : 0.1, 520);
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, 0.012, { wave: 'organ', cutoff: 1700, attack: 0.1, release: 0.6, pan: lowPan[voice], wet: 0.35, detune: 4 }));
        if (part >= 1) for (let step = 0; step < 16; step += 1) g.arp.note(at + step * beat * 0.25, chord[[0, 1, 2, 1][step % 4]] + 12, beat * 0.16, step % 4 === 0 ? 0.034 : 0.022, 1300);
        m.drum(at, 'm-kick', 0.16); m.drum(at + beat * 2, 'm-kick', 0.14);
        m.drum(at + beat, 'm-clap', 0.07, { wet: 0.25 }); m.drum(at + beat * 3, 'm-clap', 0.075, { wet: 0.25 });
        for (let step = 0; step < 16; step += 1) if (step % 2 || m.chance(0.4)) m.drum(at + step * beat * 0.25, 'm-shaker', step % 4 === 2 ? 0.05 : 0.03, { pan: 0.35, rate: m.range(0.95, 1.05) });
        if (part === 3) phrase(m, at, [[0, chord[2] + 12, 1.5], [1.5, chord[1] + 12, 0.5], [2, chord[0] + 12, 2]], (time, midi, seconds) => m.strings(time, midi, seconds, 0.016, { attack: 0.15, release: 0.6, cutoff: 2200, pan: -0.2, wet: 0.5 }));
        if (index === 7) m.drum(at + m.barSeconds - 1.6, 'm-rev-cym', 0.08, { wet: 0.4 });
    },
};

// Blackglass: the pirate den. A swung minor blues with a walking bass,
// organ comping, brushes and a reed that tells the room's stories.
const DEN = [[38, [53, 57, 60, 64]], [38, [53, 57, 60, 64]], [43, [53, 58, 62, 65]], [43, [53, 58, 62, 65]], [38, [53, 57, 60, 64]], [38, [53, 57, 60, 64]], [34, [53, 56, 58, 62]], [33, [52, 55, 58, 61]]];
const DEN_BLUES = [62, 65, 67, 68, 69, 72, 74, 77];
const den = {
    id: 'dock-blackglass', trim: 0.88, title: 'Blackglass Den', tempo: 76, locations: ['blackglass'],
    note: 'Blackglass: the pirate den. A swung D minor blues with a walking bass, organ comping, brushes and rim, and a reed that tells the room\'s stories.',
    setup(m, g) {
        g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 3, q: 1, attack: 0.01, release: 0.06 });
        g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 4, q: 0.8, attack: 0.03, release: 0.12, vibrato: 18, rate: 5.2 });
    },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = DEN[index], beat = m.beat, part = section(m), swing = beat * 0.16;
        const next = DEN[(index + 1) % 8][0];
        [bass, bass + (m.chance(0.5) ? 3 : 7), bass + (m.chance(0.5) ? 7 : 10), next + (m.chance(0.5) ? 1 : -1)].forEach((midi, step) => g.bass.note(at + step * beat, midi, beat * 0.8, step === 0 ? 0.13 : 0.1, 520));
        for (const hit of m.pick([[0, 1.5], [0.5, 2.5], [1.5, 3]])) chord.forEach((midi, voice) => m.pad(at + hit * beat + (hit % 1 ? swing : 0), midi, beat * 0.6, 0.013, { wave: 'organ', cutoff: 1500, attack: 0.03, release: 0.4, pan: lowPan[voice], wet: 0.35, detune: 5 }));
        m.drum(at + beat, 'm-brush', 0.07, { pan: 0.25, wet: 0.2 }); m.drum(at + beat * 3, 'm-brush', 0.075, { pan: 0.25, wet: 0.2 });
        for (let step = 0; step < 4; step += 1) m.drum(at + step * beat, 'm-hat', 0.03, { pan: -0.3, rate: 0.85 });
        for (let step = 0; step < 4; step += 1) if (m.chance(0.6)) m.drum(at + step * beat + beat * 0.5 + swing, 'm-hat', 0.022, { pan: -0.3, rate: 0.85 });
        m.drum(at + beat * 3, 'm-rim', 0.05, { pan: 0.1, wet: 0.3 });
        if ((part === 1 || part === 3) && index % 2 === 0) {
            let time = at + beat * m.pick([0.5, 1]), note = 2 + Math.floor(m.random() * 4);
            const end = at + m.barSeconds * 2 - beat;
            while (time < end) {
                const length = m.pick([0.5, 0.5, 1, 1.5, 2]) * beat;
                if (m.chance(0.82)) g.lead.note(time + (Math.round((time - at) / beat * 2) % 2 ? swing : 0), DEN_BLUES[note], length * 0.85, 0.034, 1300, 0.03);
                time += length;
                note = clamp(note + m.pick([-2, -1, -1, 1, 1, 2]), 0, DEN_BLUES.length - 1);
            }
        }
    },
};

// Cinder Station and Torchwell: a dusty frontier waltz in G minor, picked
// strings and a harmonica-like reed.
const SALOON = [[43, [55, 58, 62]], [43, [55, 58, 62]], [36, [55, 60, 63]], [43, [55, 58, 62]], [39, [55, 58, 63]], [38, [54, 57, 62]], [43, [55, 58, 62]], [38, [54, 57, 60]]];
const SALOON_TUNE = [
    [[0, 67, 1], [1, 70, 1], [2, 69, 1]], [[0, 67, 2], [2, 62, 1]], [[0, 63, 1], [1, 67, 1], [2, 72, 1]], [[0, 70, 3]],
    [[0, 70, 1], [1, 67, 1], [2, 63, 1]], [[0, 62, 1.5], [1.5, 66, 0.5], [2, 69, 1]], [[0, 67, 3]], [[0, 66, 2], [2, 62, 1]],
];
const saloon = {
    id: 'dock-cinder', trim: 2.4, title: 'Cinder Saloon', tempo: 96, beats: 3, locations: ['cinder', 'torchwell'],
    note: 'Cinder Station and Torchwell: a dusty frontier waltz in G minor. Picked strings oom-pah-pah, a hand drum and woodblock, and a harmonica-like reed carrying the tune.',
    setup(m, g) { g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 6, q: 1.2, attack: 0.025, release: 0.08, vibrato: 22, rate: 5.6 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = SALOON[index], beat = m.beat, part = section(m);
        m.pluck(at, bass - (index % 2 ? 5 : 0), 0.06, { decay: 1, cutoff: 900, pan: -0.1, echo: 0, wet: 0.25 });
        for (const hit of [1, 2]) chord.slice(1).forEach((midi, voice) => m.pluck(at + hit * beat + voice * 0.012, midi, 0.032, { decay: 0.45, cutoff: 1400, pan: voice ? 0.3 : 0.1, echo: 0.05, wet: 0.25 }));
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, part === 0 ? 0.018 : 0.012, { cutoff: 900, attack: 0.5, release: 1, pan: lowPan[voice], wet: 0.4 }));
        if (part === 1 || part === 3) phrase(m, at, SALOON_TUNE[index], (time, midi, seconds) => g.lead.note(time, midi, seconds * 0.88, 0.034, 1500, 0.02));
        if (part === 2) phrase(m, at, SALOON_TUNE[index], (time, midi, seconds) => m.mallet(time, midi - 12, 0.03, { decay: Math.min(1.2, seconds), pan: 0.25, echo: 0.2, wet: 0.35 }));
        m.drum(at, 'm-hand', 0.08, { rate: 0.85, wet: 0.2 });
        m.drum(at + beat, 'm-wood', 0.03, { rate: 1.1, pan: 0.3, wet: 0.2 });
        m.drum(at + beat * 2, 'm-wood', 0.025, { rate: 1.2, pan: 0.3, wet: 0.2 });
    },
};

// Nacre Station and Shepherd Relay: the research decks. A soft glass
// arpeggio in E-flat lydian, strings and the tick of instruments.
const NACRE = [[39, [51, 55, 57, 62]], [36, [51, 55, 58, 62]], [39, [53, 57, 60, 65]], [43, [53, 58, 62, 65]]];
const NACRE_SHAPES = [[0, 1, 2, 3, 2, 1, 3, 2], [3, 1, 2, 0, 2, 3, 1, 2]];
const nacre = {
    id: 'dock-nacre', trim: 1.35, title: 'Nacre Laboratory', tempo: 70, locations: ['nacre', 'shepherd'],
    note: 'Nacre Station and Shepherd Relay: the research decks. A soft glass arpeggio in E-flat lydian, strings, and the quiet tick of instruments.',
    setup(m, g) { g.arp = m.synth(g, g.bus, { wave: m.waves.glass, detune: 5, q: 1.1, attack: 0.012, release: 0.06 }); },
    bar(m, at, g) {
        const [bass, chord] = NACRE[(m.bar >> 1) % NACRE.length], beat = m.beat, part = section(m);
        if (m.bar % 2 === 0) {
            m.pad(at, bass - 12, m.barSeconds * 2.04, 0.06, { cutoff: 280, attack: 1, release: 1.8, wave: 'bass', wet: 0.3, detune: 3 });
            chord.forEach((midi, voice) => m.strings(at + voice * 0.1, midi, m.barSeconds * 2, 0.016, { attack: 1.4, release: 1.8, cutoff: 1300, pan: lowPan[voice], wet: 0.6, vibrato: 6 }));
        }
        const shape = NACRE_SHAPES[m.bar % 2];
        for (let step = 0; step < 8; step += 1) {
            if (step && m.chance(0.12)) continue;
            g.arp.note(at + step * beat * 0.5, chord[shape[step]] + 12, beat * 0.4, step % 4 === 0 ? 0.04 : 0.028, 1000 + 300 * (part === 2 ? 1 : 0));
        }
        for (let tick = 0; tick < 4; tick += 1) m.drum(at + tick * beat, 'm-wood', 0.018, { rate: 1.5, pan: tick % 2 ? 0.4 : -0.4, wet: 0.2 });
        if (part === 3 && m.bar % 4 === 0) m.mallet(at, chord[0], 0.03, { decay: 2, pan: 0, echo: 0.5, wet: 0.5 });
        if (m.bar % 4 === 2) m.air(at, m.barSeconds, 0.015, { frequency: 1200, pan: m.range(-0.5, 0.5) });
    },
};

// Vesper Colony: fields under an open sky. A folk tune in D major on reed
// over picked strings, hand drum and shaker.
const VESPER = [[38, [50, 54, 57, 62]], [38, [50, 55, 59, 62]], [38, [50, 54, 57, 62]], [37, [49, 52, 57, 61]], [35, [50, 54, 59, 62]], [31, [50, 55, 59, 62]], [40, [50, 55, 59, 62]], [33, [49, 52, 57, 61]]];
const VESPER_TUNE = [
    [[0, 66, 1], [1, 69, 1], [2, 74, 2]], [[0, 71, 1.5], [1.5, 69, 0.5], [2, 67, 2]], [[0, 66, 1], [1, 64, 1], [2, 62, 2]], [[0, 64, 2], [2, 61, 2]],
    [[0, 62, 1], [1, 66, 1], [2, 69, 2]], [[0, 71, 2], [2, 74, 1], [3, 71, 1]], [[0, 69, 1.5], [1.5, 67, 0.5], [2, 66, 1], [3, 64, 1]], [[0, 64, 4]],
];
const VESPER_PICK = [0, 3, 2, 3, 1, 3, 2, 3];
const vesper = {
    id: 'dock-vesper', trim: 1.24, title: 'Vesper Fields', tempo: 80, locations: ['vesper'],
    note: 'Vesper Colony: fields under an open sky. A folk tune in D major on reed over picked strings, warm strings, hand drum and shaker.',
    setup(m, g) { g.lead = m.synth(g, g.bus, { wave: m.waves.reed, detune: 4, q: 0.8, attack: 0.04, release: 0.1, vibrato: 12, rate: 5 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord] = VESPER[index], beat = m.beat, part = section(m);
        m.pad(at, bass, m.barSeconds, 0.065, { cutoff: 300, attack: 0.6, release: 1.2, wave: 'bass', wet: 0.3, detune: 3 });
        VESPER_PICK.forEach((voice, step) => m.pluck(at + step * beat * 0.5, chord[voice] + (step % 2 ? 12 : 0), step % 2 ? 0.026 : 0.036, { decay: 1, cutoff: 1500, pan: [-0.3, 0.3, -0.1, 0.35][step % 4], echo: 0.12, wet: 0.35 }));
        if (part >= 1) chord.forEach((midi, voice) => m.strings(at, midi, m.barSeconds, 0.012, { attack: 1, release: 1.4, cutoff: 1300, pan: lowPan[voice], wet: 0.5 }));
        if (part === 1 || part === 3) phrase(m, at, VESPER_TUNE[index], (time, midi, seconds) => g.lead.note(time, midi - (part === 3 && index < 4 ? 12 : 0), seconds * 0.9, 0.036, 1500, 0.025));
        m.drum(at, 'm-hand', 0.08, { rate: 0.9, wet: 0.25 }); m.drum(at + beat * 2, 'm-hand', 0.06, { rate: 1.05, wet: 0.25, pan: 0.2 });
        if (m.chance(0.5)) m.drum(at + beat * 3.5, 'm-hand', 0.04, { rate: 1.12, wet: 0.25, pan: 0.3 });
        for (let step = 1; step < 8; step += 2) m.drum(at + step * beat * 0.5, 'm-shaker', 0.04, { pan: 0.35, rate: m.range(0.95, 1.05) });
    },
};

// Azure Reach: an ocean world. Mallet ripples like light on water, surf
// swells, choir and strings in E major.
const AZURE = [[40, [52, 56, 59, 66]], [37, [52, 56, 59, 64]], [33, [49, 56, 59, 61]], [35, [51, 54, 56, 61]]];
const azure = {
    id: 'dock-azure', trim: 1.17, title: 'Azure Shore', tempo: 64, locations: ['azure'],
    note: 'Azure Reach: an ocean world. Rising mallet ripples like light on water, slow surf swells, choir and strings in E major.',
    bar(m, at) {
        const [bass, chord] = AZURE[(m.bar >> 1) % AZURE.length], beat = m.beat, part = section(m);
        if (m.bar % 2 === 0) {
            m.pad(at, bass, m.barSeconds * 2.04, 0.065, { cutoff: 280, attack: 1.2, release: 2, wave: 'bass', wet: 0.3, detune: 3 });
            chord.forEach((midi, voice) => m.choir(at + voice * 0.12, midi, m.barSeconds * 2, 0.015, { vowel: 'oo', attack: 1.6, release: 2.2, pan: lowPan[voice], wet: 0.75 }));
            m.air(at, m.barSeconds * 1.6, 0.05, { frequency: m.range(380, 520), q: 0.6, pan: m.range(-0.6, 0.6) });
        }
        for (const start of m.bar % 2 ? [0, 2] : [0.5, 2.5]) for (let i = 0; i < 4; i += 1)
            m.mallet(at + (start + i * 0.25) * beat, chord[i] + (start >= 2 ? 12 : 0), 0.026 - i * 0.003, { decay: 1.4, pan: -0.45 + i * 0.3, echo: 0.3, wet: 0.5 });
        if (part >= 2 && m.bar % 2 === 0) m.strings(at, chord[2] + 12, m.barSeconds * 2, 0.014, { attack: 1.6, release: 2, cutoff: 1800, pan: 0.2, wet: 0.7 });
        if (part === 3 && m.bar % 4 === 1) m.pluck(at + beat * 3, chord[3] + 12, 0.028, { decay: 1.8, cutoff: 1300, echo: 0.5, wet: 0.6, pan: -0.3 });
    },
};

// Meridian Prime: the capital's upscale lounge. Jazz in D-flat with
// electric piano comping, a walking bass and brushes.
const CAPITAL = [[39, [54, 58, 61, 65], 44], [44, [54, 58, 60, 65], 37], [37, [53, 56, 60, 63], 34], [34, [53, 56, 60, 61], 39], [39, [54, 58, 61, 65], 44], [44, [54, 59, 60, 64], 37], [37, [53, 56, 60, 63], 42], [42, [53, 58, 60, 65], 39]];
const capital = {
    id: 'dock-meridian', title: 'Capital Nocturne', tempo: 88, locations: ['meridian-prime'],
    note: 'Meridian Prime: the capital\'s upscale lounge. Jazz in D-flat major with electric piano comping in a Charleston rhythm, a walking bass, brushes and a soft ride.',
    setup(m, g) { g.bass = m.synth(g, g.bus, { wave: m.waves.bass, detune: 3, q: 1, attack: 0.01, release: 0.06 }); },
    bar(m, at, g) {
        const index = m.bar % 8, [bass, chord, next] = CAPITAL[index], beat = m.beat, part = section(m), swing = beat * 0.16;
        [bass, bass + 7, bass + (m.chance(0.5) ? 4 : 3), next + (m.chance(0.5) ? 1 : -1)].forEach((midi, step) => g.bass.note(at + step * beat, midi - (midi > 45 ? 12 : 0), beat * 0.8, step === 0 ? 0.12 : 0.095, 500));
        const comp = m.pick([[0, 1.5], [0, 2.5], [1.5, 3]]);
        for (const hit of comp) chord.forEach((midi, voice) => m.bell(at + hit * beat + (hit % 1 ? swing : 0) + voice * 0.008, midi, 0.024, { decay: 1.2, attack: 0.03, ratio: 1, index: 0.9, pan: lowPan[voice], echo: 0.1, wet: 0.35 }));
        chord.forEach((midi, voice) => m.pad(at, midi, m.barSeconds, 0.008, { cutoff: 900, attack: 0.6, release: 1, pan: -lowPan[voice], wet: 0.4 }));
        m.drum(at + beat, 'm-brush', 0.065, { pan: 0.2, wet: 0.2 }); m.drum(at + beat * 3, 'm-brush', 0.07, { pan: 0.2, wet: 0.2 });
        for (const time of [0, 1, 1.5, 2, 3, 3.5]) m.drum(at + time * beat + (time % 1 ? swing : 0), 'm-hat', time % 1 ? 0.018 : 0.028, { pan: -0.35, rate: 0.82 });
        if (part === 3 && index % 2 === 0) m.bell(at + beat * 0.5, chord[3] + 12, 0.02, { decay: 1.6, attack: 0.04, ratio: 1, index: 0.8, pan: 0.3, echo: 0.3, wet: 0.45 });
    },
};

// Boreal: a lodge against the cold. A waltz in A minor for soft organ,
// picked strings and a string melody by the fire.
const LODGE = [[33, [57, 60, 64]], [31, [57, 60, 64]], [29, [57, 60, 64]], [28, [56, 59, 62]], [33, [57, 60, 64]], [31, [55, 60, 64]], [38, [57, 60, 65]], [28, [56, 59, 62]]];
const LODGE_TUNE = [
    [[0, 64, 1], [1, 69, 2]], [[0, 67, 1], [1, 64, 1], [2, 60, 1]], [[0, 65, 2], [2, 64, 1]], [[0, 64, 3]],
    [[0, 69, 1], [1, 72, 2]], [[0, 71, 1], [1, 67, 1], [2, 64, 1]], [[0, 65, 1], [1, 69, 1], [2, 72, 1]], [[0, 71, 2], [2, 68, 1]],
];
const lodge = {
    id: 'dock-boreal', trim: 1.4, title: 'Boreal Lodge', tempo: 72, beats: 3, locations: ['boreal'],
    note: 'Boreal: a lodge against the cold. A waltz in A minor for soft organ, picked strings and a frame drum, with a string melody by the fire.',
    bar(m, at) {
        const index = m.bar % 8, [bass, chord] = LODGE[index], beat = m.beat, part = section(m);
        m.pad(at, bass, m.barSeconds, 0.06, { cutoff: 280, attack: 0.4, release: 1, wave: 'bass', wet: 0.3, detune: 3 });
        chord.forEach((midi, voice) => m.pad(at, midi - 12, m.barSeconds, 0.012, { wave: 'organ', cutoff: 1200, attack: 0.4, release: 0.9, pan: lowPan[voice], wet: 0.45, detune: 4 }));
        [[1, 0], [1.5, 1], [2, 2], [2.5, 1]].forEach(([time, voice]) => m.pluck(at + time * beat, chord[voice], 0.028, { decay: 0.8, cutoff: 1400, pan: voice === 1 ? 0.3 : -0.2, echo: 0.1, wet: 0.3 }));
        if (part === 1 || part === 3) phrase(m, at, LODGE_TUNE[index], (time, midi, seconds) => m.strings(time, midi, seconds * 0.95, 0.026, { attack: Math.min(0.4, seconds * 0.3), release: 0.9, cutoff: 2000, pan: 0.15, wet: 0.55 }));
        m.drum(at, 'm-frame', 0.09, { rate: 0.95, wet: 0.3 });
        if (m.bar % 4 === 3) m.air(at, m.barSeconds * 1.5, 0.02, { frequency: 1500, q: 1.2, pan: m.range(-0.6, 0.6) });
    },
};

export default [lounge, bastion, harbour, shipworks, cinderfall, pitlane, den, saloon, nacre, vesper, azure, capital, lodge].map((piece) => ({ context: 'station', ...piece }));
