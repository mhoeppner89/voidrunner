// Small composition helpers shared by the score modules (musicSpace.js,
// musicFlight.js, musicDocked.js). Everything here is plain data or pure
// functions: pieces call them while scheduling a bar, never per frame.

export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Rhythm strings, parsed once at module load. 'x' accent, 'o' normal,
// '-' ghost, anything else a rest. Returns [[step, weight], ...].
export function hits(pattern) {
    const out = [];
    for (let step = 0; step < pattern.length; step += 1) {
        const weight = pattern[step] === 'x' ? 1 : pattern[step] === 'o' ? 0.65 : pattern[step] === '-' ? 0.35 : 0;
        if (weight) out.push([step, weight]);
    }
    return out;
}

// Scale degree with octave wrap: degree(scale, -1) is the top note an octave down.
export function degree(scale, index) {
    const size = scale.length, octave = Math.floor(index / size);
    return scale[((index % size) + size) % size] + 12 * octave;
}

// Modes as semitone offsets from the root.
export const MODE = {
    ionian: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    pentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
};
export const scaleOf = (root, mode) => MODE[mode].map((step) => root + step);

// Weighted choice; returns the index. `weights` may contain zeros.
export function weightedIndex(weights, random) {
    let total = 0;
    for (const weight of weights) total += Math.max(0, weight);
    if (!(total > 0)) return -1;
    let roll = random * total;
    for (let index = 0; index < weights.length; index += 1) {
        roll -= Math.max(0, weights[index]);
        if (roll < 0) return index;
    }
    return weights.length - 1;
}

// Play a written line: notes are [beat, midi, beats] relative to `at`.
export function phrase(m, at, notes, play) {
    for (const [beat, midi, beats] of notes) play(at + beat * m.beat, midi, beats * m.beat);
}

// Which section of a piece this bar is in: sections of `size` bars, cycling.
export const section = (m, size = 8, count = 4) => Math.floor(m.bar / size) % count;
