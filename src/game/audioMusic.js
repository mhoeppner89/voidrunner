import { clamp } from './random.js';
import { hz, weightedIndex } from './musicKit.js';
import { PIECE_BY_ID, PIECES_BY_CONTEXT, ROTATION, isApproved, dockThemeFor, pieceWeight } from './musicScore.js';

// Adaptive score director.
//
// The music itself lives in the score modules (musicSpace.js, musicFlight.js,
// musicDocked.js) as pieces: each one has a context, tempo, meter and a
// `bar()` function that writes one bar at a time, so nothing ever loops
// identically. The director decides which piece plays and runs it:
//
// - Bars are scheduled against the audio clock with a short look-ahead (not
//   the frame timer), so rhythm stays tight through frame hitches.
// - Every piece owns a voice group; a change crossfades groups, which lets
//   long tails ring out instead of being cut.
// - Rotating contexts (open space, planets, fields, the graveyard) play a
//   piece for a few minutes, close it with a cadence and then rest in
//   silence before the next one. Choices are weighted by star system and
//   nearby region and avoid the most recent pieces.
// - Docked, the theme belongs to the station or planet.
// - Only approved pieces reach the game; the music review page can audition
//   any piece through `audition`.
//
// Instruments: detuned wavetable pads through a stereo chorus, soft FM keys
// and bells into a tempo-synced ping-pong delay, formant choir, bowed string
// ensemble, mallets, monophonic synths (persistent oscillators, sequenced by
// automation: no per-note nodes), and a forged percussion kit from the sound
// bank (group 'music').
const LOOKAHEAD = 0.22;
// A calm place must hold this long before the score follows it, so skirting
// a field edge or a planet's range does not swap pieces back and forth.
const SETTLE_SECONDS = 6;
// A fight that flares up again this soon resumes its piece instead of
// starting a new one.
const COMBAT_MEMORY = 90;
// How one place hands over to the next: the outgoing piece fades for
// `fadeOut`, the new one starts after `delay` and swells in over `swell`.
// Combat lands at once on its opening hit; everything else breathes.
const transition = (previous, context) => {
    if (context === 'combat') return { fadeOut: 1.2, delay: 0.06, swell: 0 };
    if (previous === 'combat') return { fadeOut: 4, delay: 3.5, swell: 5 };
    if (context === 'station' || previous === 'station') return { fadeOut: 3.5, delay: 2, swell: 4 };
    if (!previous) return { fadeOut: 2, delay: 0.1, swell: 3 };
    return { fadeOut: 6, delay: 3, swell: 6 };
};
// Formants as [frequency, gain, Q]: soft vowels only.
const VOWELS = {
    oo: [[310, 1, 3.5], [870, 0.32, 6], [2250, 0.08, 9]],
    oh: [[450, 1, 3.5], [820, 0.55, 6], [2700, 0.1, 9]],
    ah: [[720, 1, 3.5], [1100, 0.5, 6], [2500, 0.12, 9]],
    mm: [[260, 1, 2.5], [600, 0.18, 4], [1800, 0.03, 6]],
};
// Level compensation so the same `level` argument sounds equally loud on
// every sustained instrument (measured offline against `pad`).
const CHOIR_GAIN = 3.8;
const STRINGS_GAIN = 1.4;

// A persistent two-oscillator mono synth. Notes are automation events on its
// pitch, filter and level, so a 16th-note ostinato costs no node churn.
class MonoSynth {
    constructor(director, target, { type = 'sawtooth', wave, detune = 9, q = 0.9, attack = 0.006, release = 0.035, vibrato = 0, rate = 5 } = {}) {
        const context = director.context;
        this.attack = attack; this.release = release;
        this.oscillators = [-detune, detune].map((cents) => {
            const oscillator = context.createOscillator();
            if (wave) oscillator.setPeriodicWave(wave); else oscillator.type = type;
            oscillator.detune.value = cents;
            return oscillator;
        });
        this.filter = context.createBiquadFilter();
        this.filter.type = 'lowpass'; this.filter.Q.value = q; this.filter.frequency.value = 400;
        this.gain = context.createGain();
        this.gain.gain.value = 0;
        for (const oscillator of this.oscillators) { oscillator.connect(this.filter); oscillator.start(); }
        if (vibrato > 0) {
            this.lfo = context.createOscillator(); this.lfo.frequency.value = rate;
            const depth = context.createGain(); depth.gain.value = vibrato;
            this.lfo.connect(depth);
            for (const oscillator of this.oscillators) depth.connect(oscillator.detune);
            this.lfo.start();
        }
        this.filter.connect(this.gain); this.gain.connect(target);
    }
    // `glide` > 0 slides into the pitch (portamento time constant, seconds).
    note(at, midi, seconds, level, cutoff, glide = 0) {
        const frequency = hz(midi);
        for (const oscillator of this.oscillators) {
            if (glide > 0) oscillator.frequency.setTargetAtTime(frequency, at, glide);
            else oscillator.frequency.setValueAtTime(frequency, at);
        }
        this.filter.frequency.setValueAtTime(cutoff * 2.2, at);
        this.filter.frequency.setTargetAtTime(cutoff, at, 0.07);
        this.gain.gain.setTargetAtTime(level, at, this.attack);
        this.gain.gain.setTargetAtTime(0, at + seconds, this.release);
    }
    stop(at) {
        for (const oscillator of [...this.oscillators, this.lfo]) { try { oscillator?.stop(at); } catch { /* already stopped */ } }
    }
}

export class MusicDirector {
    current = null; // context being scored
    piece = null; // piece playing, null while resting
    slot = ''; // context (+ dock) that chose the piece
    group = null;
    bar = 0;
    nextBar = 0;
    length = Infinity; // bars until the piece closes
    restUntil = 0;
    tier = 0;
    intensity = 0.8;
    systemId = undefined;
    regionId = undefined;
    dockId = undefined;
    // Review page only: { id, bars?, rest? } plays that piece (approved or
    // not) whenever its own context is scored; `pace` = { bars, rest }
    // shortens every rotating piece so the rotation can be heard quickly.
    audition = null;
    pace = null;
    constructor(manager) {
        this.manager = manager;
        const context = this.context = manager.context;
        const gain = (value, target) => { const node = context.createGain(); node.gain.value = value; if (target) node.connect(target); return node; };
        this.out = gain(0.75, manager.musicGain);
        // Pads pass through a slow stereo chorus: one detuned pair becomes an ensemble.
        this.padIn = gain(1);
        this.padIn.connect(gain(0.75, this.out));
        this.lfos = [];
        for (const [seconds, rate, pan] of [[0.017, 0.23, -0.75], [0.023, 0.31, 0.75]]) {
            const delay = context.createDelay(0.06), lfo = context.createOscillator(), depth = gain(0.0038), panner = context.createStereoPanner();
            delay.delayTime.value = seconds; lfo.frequency.value = rate; panner.pan.value = pan;
            lfo.connect(depth); depth.connect(delay.delayTime); lfo.start();
            this.padIn.connect(delay); delay.connect(panner); panner.connect(gain(0.5, this.out));
            this.lfos.push(lfo);
        }
        // Tempo-synced ping-pong delay for keys, bells and metal.
        this.echoIn = gain(1);
        this.echoLeft = context.createDelay(1.5); this.echoRight = context.createDelay(1.5);
        const tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
        const left = context.createStereoPanner(), right = context.createStereoPanner();
        left.pan.value = -0.6; right.pan.value = 0.6;
        this.echoIn.connect(tone); tone.connect(this.echoLeft);
        this.echoLeft.connect(left); left.connect(this.out);
        this.echoLeft.connect(this.echoRight); this.echoRight.connect(right); right.connect(this.out);
        this.echoRight.connect(gain(0.32, this.echoLeft));
        // Stingers and cadences live outside the piece groups so a change never cuts them.
        this.sting = { bus: gain(1, this.out), pad: gain(1, this.padIn), echo: gain(1, this.echoIn), wet: gain(1, manager.musicReverbGain), trim: 1 };
        const table = (count, amplitude) => {
            const real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
            for (let n = 1; n <= count; n += 1) imag[n] = amplitude(n);
            return context.createPeriodicWave(real, imag);
        };
        this.waves = {
            warm: table(24, (n) => 1 / Math.pow(n, 1.6)),
            glass: table(12, (n) => (n % 2 ? 1 : 0.35) / Math.pow(n, 1.9)),
            pluck: table(32, (n) => 1 / Math.pow(n, 1.15)),
            bass: table(16, (n) => (n === 1 ? 1.4 : 1) / Math.pow(n, 1.35)),
            // Hollow, square-ish: pulse basses and arpeggios.
            pulse: table(24, (n) => (n % 2 ? 1 : 0.22) / n),
            // Clarinet-like: odd partials lead, for solo lines.
            reed: table(18, (n) => (n % 2 ? 1 : 0.3) / Math.pow(n, 1.25)),
            // Soft drawbar organ.
            organ: table(16, (n) => ({ 1: 1, 2: 0.55, 3: 0.35, 4: 0.22, 6: 0.12, 8: 0.1 })[n] ?? 0),
            // Brassy: a saw with the top rolled off by the filter.
            brass: table(28, (n) => 1 / Math.pow(n, 1.05)),
        };
        // Session-seeded xorshift: varied between sessions, cheap, allocation free.
        this.seed = (Date.now() & 0x7fffffff) || 1;
        this.history = new Map();
    }

    random() {
        let x = this.seed;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.seed = x >>> 0;
        return this.seed / 4294967296;
    }
    range(lo, hi) { return lo + this.random() * (hi - lo); }
    pick(list) { return list[Math.floor(this.random() * list.length)]; }
    chance(probability) { return this.random() < probability; }

    // `place` is the caller's flight scratch: { systemId, regionId, dockId }.
    update(dt, context, danger, place) {
        const { manager } = this, now = this.context.currentTime;
        if (manager.musicVolume <= 0.01) {
            if (this.group) this.retire(this.group, 0.3);
            this.group = null; this.piece = null; this.current = null; this.slot = '';
            return;
        }
        this.sweep(now);
        if (now < (this.holdUntil ?? 0)) return;
        if (place) { this.systemId = place.systemId; this.regionId = place.regionId; this.dockId = place.dockId; }
        const slot = context === 'station' ? `station:${this.dockId ?? ''}` : context;
        if (slot !== this.slot) {
            // Combat, docking and undocking change at once; calm places settle first.
            // An emptied slot is a forced restart (death, the review page).
            const urgent = !this.current || !this.slot || context === 'combat' || context === 'station' || this.current === 'combat' || this.current === 'station';
            if (this.pendingSlot !== slot) { this.pendingSlot = slot; this.pendingSince = now; }
            if (urgent || now - this.pendingSince >= SETTLE_SECONDS) { this.pendingSlot = ''; this.enter(context, slot, now); }
        }
        else {
            this.pendingSlot = '';
            if (!this.piece) {
                if (now < this.restUntil) return;
                this.begin(this.choose(context), now, 'rest');
            }
        }
        if (!this.piece) return;
        if (this.current === 'combat') this.updateTier(danger, now);
        // After a stall (hidden tab, long frame) rejoin the clock instead of bursting.
        if (this.nextBar < now - 0.05) this.nextBar = now + 0.06;
        while (this.piece && this.nextBar < now + LOOKAHEAD) {
            if (this.bar >= this.length) { this.finish(this.nextBar); break; }
            this.playBar(this.nextBar);
            this.nextBar += this.barSeconds;
            this.bar += 1;
        }
    }

    // A new place: fade out whatever plays and start that place's music.
    enter(context, slot, now) {
        const previous = this.current, outgoing = this.piece;
        let handover = transition(previous, context);
        // A forced restart (review page auditions) switches briskly.
        if (!this.slot) handover = { fadeOut: 1.2, delay: Math.min(0.3, handover.delay), swell: Math.min(1.5, handover.swell) };
        if (previous === 'combat' && outgoing) this.lastCombat = { piece: outgoing, at: now };
        if (this.group) this.retire(this.group, handover.fadeOut);
        // Resting (no group) there is nothing to wait for.
        if (!this.group && context !== 'combat') handover.delay = Math.min(handover.delay, 0.1);
        this.group = null;
        this.current = context; this.slot = slot;
        this.piece = null;
        this.begin(this.choose(context), now, previous, outgoing, handover);
    }

    // Which piece plays here. Weighted by system/region, never the same
    // piece twice running when the pool allows it.
    choose(context) {
        const audition = this.audition && PIECE_BY_ID[this.audition.id];
        if (audition?.context === context) return audition;
        if (context === 'station') return dockThemeFor(this.dockId);
        // One fight, one piece: a quick re-engagement picks up where it left off.
        const last = this.lastCombat;
        if (context === 'combat' && last && this.context.currentTime - last.at < COMBAT_MEMORY && isApproved(last.piece)) return last.piece;
        const pool = (PIECES_BY_CONTEXT[context] ?? PIECES_BY_CONTEXT.open).filter(isApproved);
        if (pool.length <= 1) return pool[0];
        const recent = this.history.get(context) ?? [];
        const weights = pool.map((piece) => pieceWeight(piece, this.systemId, this.regionId));
        if (!weights.some((weight) => weight > 0)) weights.fill(1);
        const fresh = weights.map((weight, index) => (recent.includes(pool[index].id) ? 0 : weight));
        const index = weightedIndex(fresh.some((weight) => weight > 0) ? fresh : weights, this.random());
        return pool[Math.max(0, index)];
    }

    begin(piece, now, previous, outgoing, handover = transition(previous === 'rest' ? undefined : previous, this.current)) {
        if (!piece) return;
        const context = this.current;
        this.piece = piece;
        this.beat = 60 / piece.tempo;
        this.barSeconds = this.beat * (piece.beats ?? 4);
        this.bar = 0; this.tier = 0;
        const rotation = ROTATION[context];
        const bars = this.audition?.id === piece.id ? this.audition.bars : rotation && this.pace?.bars;
        if (bars) this.length = bars;
        else if (rotation) {
            const [lo, hi] = piece.minutes ?? rotation.minutes;
            this.length = Math.max(8, Math.round(this.range(lo, hi) * 60 / this.barSeconds / 4) * 4);
        }
        else this.length = Infinity;
        const trim = piece.trim ?? 1;
        const fresh = (target) => { const node = this.context.createGain(); node.gain.value = trim; node.connect(target); return node; };
        const group = this.group = { bus: fresh(this.out), pad: fresh(this.padIn), echo: fresh(this.echoIn), wet: fresh(this.manager.musicReverbGain), synths: [], nodes: [], trim, state: {} };
        group.nodes.push(group.bus, group.pad, group.echo, group.wet);
        const combat = context === 'combat';
        // Ambient themes wait for the outgoing piece to thin out, then swell
        // in (out of a rest they simply rise); combat lands at once.
        const delay = previous === 'rest' ? 0.1 : handover.delay;
        const swell = previous === 'rest' ? 3 : handover.swell;
        if (!combat && swell > 0) {
            for (const node of group.nodes) {
                node.gain.setValueAtTime(0.0001, now);
                node.gain.setValueAtTime(0.0001, now + delay);
                node.gain.linearRampToValueAtTime(trim, now + delay + swell);
            }
        }
        const echo = this.beat * (piece.echo ?? 0.75);
        this.echoLeft.delayTime.setTargetAtTime(echo, now, 0.05);
        this.echoRight.delayTime.setTargetAtTime(echo, now, 0.05);
        piece.setup?.(this, group);
        if (combat) {
            // The fight opens with a hit, not a fade; a resumed fight gets a lighter one.
            const resumed = this.lastCombat?.piece === piece;
            this.drum(now + 0.02, 'm-impact', resumed ? 0.32 : 0.6, { wet: 0.6 }, this.sting);
            if (!resumed) this.drum(now + 0.02, 'm-sub-drop', 0.35, {}, this.sting);
            this.nextBar = now + 0.06;
        }
        else {
            if (previous === 'combat') this.resolveCombat(now, outgoing);
            this.nextBar = now + Math.max(0.1, delay);
        }
    }

    // The piece has run its length: a closing cadence, then silence.
    finish(at) {
        const piece = this.piece, rotation = ROTATION[this.current] ?? { rest: [20, 40] };
        piece.end?.(this, at, this.sting);
        this.retire(this.group, Math.min(4, this.barSeconds * 1.2));
        this.group = null; this.piece = null;
        const recent = this.history.get(this.current) ?? [];
        recent.unshift(piece.id); recent.length = Math.min(recent.length, 2);
        this.history.set(this.current, recent);
        const rest = this.audition?.id === piece.id ? this.audition.rest ?? 4 : this.pace?.rest ?? this.range(...rotation.rest);
        this.restUntil = at + rest;
    }

    synth(group, target, options) {
        const synth = new MonoSynth(this, target, options);
        group.synths.push(synth);
        return synth;
    }
    // Fade a group out, then stop its synths and drop it from the graph.
    retire(group, seconds) {
        const now = this.context.currentTime;
        for (const node of group.nodes) {
            node.gain.cancelScheduledValues(now);
            node.gain.setValueAtTime(Math.max(node.gain.value, 0.0001), now);
            node.gain.linearRampToValueAtTime(0.0001, now + seconds);
        }
        for (const synth of group.synths) synth.stop(now + seconds + 0.1);
        group.deadAt = now + seconds + 0.25;
        (this.retired ??= []).push(group);
    }
    // Drop faded groups from the graph, timed on the audio clock.
    sweep(now) {
        if (!this.retired?.length || now < this.retired[0].deadAt) return;
        const group = this.retired.shift();
        for (const node of group.nodes) node.disconnect();
    }

    // Discrete combat escalation (0/1/2) with hysteresis, so a single
    // straggler does not flicker the arrangement.
    updateTier(danger) {
        const desired = danger >= 0.8 ? 2 : danger >= 0.55 ? 1 : 0;
        if (desired > this.tier) this.tier = desired;
        else if (desired < this.tier && danger < (this.tier === 2 ? 0.7 : 0.45)) this.tier = desired;
    }

    playBar(at) {
        const phrase = this.bar % 8;
        // Eight-bar breathing: four bars build, four relax.
        this.intensity = phrase < 4 ? 0.72 + phrase * 0.09 : 0.99 - (phrase - 3) * 0.075;
        this.piece.bar(this, at, this.group);
    }

    // What the review page shows.
    nowPlaying() {
        const now = this.context?.currentTime ?? 0;
        return { id: this.piece?.id ?? null, title: this.piece?.title ?? null, context: this.current, bar: this.bar, length: this.length, resting: !this.piece && now < this.restUntil, restLeft: Math.max(0, this.restUntil - now) };
    }

    // ------------------------------------------------------------ instruments

    // Sustained ensemble voice: two detuned wavetable oscillators through a
    // filter that opens with the swell.
    // `bend` rises and returns; `fall` slides away for the whole note.
    pad(at, midi, seconds, level, { cutoff = 1400, attack = 0.9, release = 1.6, pan = 0, wave = 'warm', detune = 7, wet = 0.5, bend = 0, fall = 0 } = {}, group = this.group) {
        const context = this.context, filter = context.createBiquadFilter(), gain = context.createGain(), frequency = hz(midi);
        const end = at + Math.max(seconds, attack) + release;
        for (const cents of [-detune, detune]) {
            const oscillator = context.createOscillator();
            oscillator.setPeriodicWave(this.waves[wave]);
            oscillator.frequency.setValueAtTime(frequency, at);
            if (bend) {
                oscillator.frequency.exponentialRampToValueAtTime(frequency * Math.pow(2, bend / 12), at + seconds * 0.45);
                oscillator.frequency.exponentialRampToValueAtTime(frequency, at + seconds);
            }
            else if (fall) oscillator.frequency.exponentialRampToValueAtTime(frequency * Math.pow(2, fall / 12), at + seconds);
            oscillator.detune.value = cents;
            oscillator.connect(filter); oscillator.start(at); oscillator.stop(end + 0.05);
        }
        filter.type = 'lowpass'; filter.Q.value = 0.6;
        filter.frequency.setValueAtTime(cutoff * 0.45, at);
        filter.frequency.linearRampToValueAtTime(cutoff, at + attack);
        filter.frequency.setTargetAtTime(cutoff * 0.6, at + attack, Math.max(0.2, seconds));
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(level, at + attack);
        gain.gain.setTargetAtTime(0.0001, at + Math.max(seconds, attack), release / 5);
        filter.connect(gain);
        this.route(gain, pan, group.pad, wet, 0, group);
    }

    // Wordless choir: a detuned saw pair through three vowel formants, with
    // vibrato that blooms after the attack. Keep it in the low-mid register.
    // `scoop` (semitones, usually negative) slides up into the note: a wail.
    choir(at, midi, seconds, level, { vowel = 'oo', attack = 1.4, release = 2.2, pan = 0, wet = 0.7, detune = 8, vibrato = 14, scoop = 0 } = {}, group = this.group) {
        const context = this.context, frequency = hz(midi), hold = Math.max(seconds, attack), end = at + hold + release + 0.05;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(level * CHOIR_GAIN, at + attack);
        envelope.gain.setTargetAtTime(0.0001, at + hold, release / 5);
        const lfo = context.createOscillator(), depth = context.createGain();
        lfo.frequency.value = this.range(4.4, 5.4);
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(vibrato, at + attack);
        lfo.connect(depth); lfo.start(at); lfo.stop(end);
        // Lower voices sit on slightly lower formants.
        const shift = midi < 50 ? 0.86 : midi < 57 ? 0.93 : 1;
        const filters = VOWELS[vowel].map(([formant, weight, q]) => {
            const filter = context.createBiquadFilter(), amount = context.createGain();
            filter.type = 'bandpass'; filter.frequency.value = formant * shift; filter.Q.value = q;
            amount.gain.value = weight;
            filter.connect(amount); amount.connect(envelope);
            return filter;
        });
        for (const cents of [-detune, detune]) {
            const oscillator = context.createOscillator();
            oscillator.type = 'sawtooth'; oscillator.detune.value = cents;
            oscillator.frequency.setValueAtTime(frequency * Math.pow(2, scoop / 12), at);
            if (scoop) oscillator.frequency.exponentialRampToValueAtTime(frequency, at + Math.min(attack, 0.8) * 0.7);
            depth.connect(oscillator.detune);
            for (const filter of filters) oscillator.connect(filter);
            oscillator.start(at); oscillator.stop(end);
        }
        this.route(envelope, pan, group.pad, wet, 0, group);
    }

    // Bowed string section: three detuned saws, a filter that opens with the
    // bow and vibrato that arrives late. Short attacks give brass-like swells.
    strings(at, midi, seconds, level, { attack = 0.9, release = 1.6, cutoff = 2200, pan = 0, wet = 0.55, detune = 9, vibrato = 10, wave } = {}, group = this.group) {
        const context = this.context, frequency = hz(midi), hold = Math.max(seconds, attack), end = at + hold + release + 0.05;
        const filter = context.createBiquadFilter(), envelope = context.createGain();
        filter.type = 'lowpass'; filter.Q.value = 0.5;
        filter.frequency.setValueAtTime(cutoff * 0.35, at);
        filter.frequency.linearRampToValueAtTime(cutoff, at + attack);
        filter.frequency.setTargetAtTime(cutoff * 0.75, at + attack, Math.max(0.3, seconds * 0.5));
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(level * STRINGS_GAIN, at + attack);
        envelope.gain.setTargetAtTime(0.0001, at + hold, release / 5);
        const lfo = context.createOscillator(), depth = context.createGain();
        lfo.frequency.value = this.range(4.8, 5.6);
        depth.gain.setValueAtTime(0, at);
        depth.gain.setValueAtTime(0, at + attack * 0.6);
        depth.gain.linearRampToValueAtTime(vibrato, at + attack + 0.8);
        lfo.connect(depth); lfo.start(at); lfo.stop(end);
        for (const cents of [-detune, 0, detune]) {
            const oscillator = context.createOscillator();
            if (wave) oscillator.setPeriodicWave(this.waves[wave]); else oscillator.type = 'sawtooth';
            oscillator.frequency.value = frequency; oscillator.detune.value = cents;
            depth.connect(oscillator.detune);
            oscillator.connect(filter); oscillator.start(at); oscillator.stop(end);
        }
        filter.connect(envelope);
        this.route(envelope, pan, group.pad, wet, 0, group);
    }

    // Marimba-like mallet: a sine body and a quickly fading fourth partial.
    // Woody rather than bright; stays below C6.
    mallet(at, midi, level, { decay = 1.1, pan = 0, echo = 0.2, wet = 0.4, hard = 0.25 } = {}, group = this.group) {
        const context = this.context, frequency = hz(midi), envelope = context.createGain(), overtone = context.createGain();
        const body = context.createOscillator(), partial = context.createOscillator();
        body.frequency.value = frequency; partial.frequency.value = frequency * 3.93;
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(level, at + 0.01);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.01 + decay);
        overtone.gain.setValueAtTime(hard, at);
        overtone.gain.exponentialRampToValueAtTime(0.0001, at + 0.01 + decay * 0.22);
        partial.connect(overtone); overtone.connect(envelope); body.connect(envelope);
        const end = at + decay + 0.06;
        body.start(at); partial.start(at); body.stop(end); partial.stop(end);
        this.route(envelope, pan, group.bus, wet, echo, group);
    }

    // FM voice. ratio 1 with a low index is a mellow electric piano; ratio
    // 3.5 is a glassy bell. A soft attack keeps it from ever reading as a "ding".
    bell(at, midi, level, { decay = 1.8, attack = 0.04, ratio = 3.5, index = 1.6, pan = 0, echo = 0.35, wet = 0.5 } = {}, group = this.group) {
        const context = this.context, frequency = hz(midi);
        const carrier = context.createOscillator(), modulator = context.createOscillator(), depth = context.createGain(), gain = context.createGain();
        carrier.frequency.value = frequency; modulator.frequency.value = frequency * ratio;
        depth.gain.setValueAtTime(frequency * index, at);
        depth.gain.exponentialRampToValueAtTime(Math.max(1, frequency * index * 0.08), at + attack + decay * 0.5);
        modulator.connect(depth); depth.connect(carrier.frequency);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(level, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
        carrier.connect(gain);
        const end = at + attack + decay + 0.05;
        carrier.start(at); modulator.start(at); carrier.stop(end); modulator.stop(end);
        this.route(gain, pan, group.bus, wet, echo, group);
    }

    // Filtered wavetable pluck: warm, short, woody.
    pluck(at, midi, level, { decay = 1.2, attack = 0.03, cutoff = 1600, pan = 0, echo = 0.3, wet = 0.4 } = {}, group = this.group) {
        const context = this.context, oscillator = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
        oscillator.setPeriodicWave(this.waves.pluck);
        oscillator.frequency.value = hz(midi);
        filter.type = 'lowpass'; filter.Q.value = 1.1;
        filter.frequency.setValueAtTime(cutoff, at);
        filter.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.22), at + decay * 0.6);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(level, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
        oscillator.connect(filter); filter.connect(gain);
        oscillator.start(at); oscillator.stop(at + attack + decay + 0.05);
        this.route(gain, pan, group.bus, wet, echo, group);
    }

    // One percussion hit from the forged kit. Silent until the kit has loaded.
    drum(at, id, level, { pan = 0, rate = 1, wet = 0, echo = 0 } = {}, group = this.group) {
        const buffer = this.manager.bank.buffer(id);
        if (!buffer) return;
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; source.playbackRate.value = rate;
        gain.gain.value = level;
        source.connect(gain);
        source.start(at);
        this.route(gain, pan, group.bus, wet, echo, group);
    }

    // Filtered noise swell: wind, breath, distant surf.
    air(at, seconds, level, { frequency = 600, q = 0.8, pan = 0 } = {}, group = this.group) {
        const context = this.context, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = this.manager.pinkBuffer; source.loop = true;
        filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(level, at + seconds * 0.45);
        gain.gain.linearRampToValueAtTime(0.0001, at + seconds);
        source.connect(filter); filter.connect(gain);
        source.start(at, this.random() * 2); source.stop(at + seconds + 0.05);
        this.route(gain, pan, group.bus, 0.4, 0, group);
    }

    route(node, pan, target, wet, echo, group) {
        let tail = node;
        if (pan !== 0) {
            const panner = this.context.createStereoPanner();
            panner.pan.value = clamp(pan, -0.9, 0.9);
            node.connect(panner); tail = panner;
        }
        tail.connect(target);
        const send = (level, bus) => {
            if (!(level > 0)) return;
            const amount = this.context.createGain();
            amount.gain.value = level;
            tail.connect(amount); amount.connect(bus);
        };
        send(wet, group.wet); send(echo, group.echo);
    }

    // Briefly dips the pad bus on a kick so the low end punches through.
    pump(at, depth = 0.55, group = this.group) {
        const gain = group.pad.gain, full = group.trim ?? 1;
        gain.setValueAtTime(depth * full, at);
        gain.linearRampToValueAtTime(full, at + this.beat * 0.5);
    }

    // The fight is over: one last hit, then the chord finally resolves into
    // the outgoing combat piece's home key.
    resolveCombat(now, outgoing) {
        const chord = outgoing?.resolve ?? [40, 47, 52, 56, 59];
        this.drum(now + 0.05, 'm-taiko', 0.4, { rate: 0.85, wet: 0.8 }, this.sting);
        chord.forEach((midi, voice) => this.pad(now + 0.1 + voice * 0.05, midi, 2.2, 0.03, { cutoff: 1500, attack: 0.5, release: 2.4, pan: [-0.4, 0.4, -0.2, 0.2, 0][voice] ?? 0, wet: 0.8 }, this.sting));
    }

    // Short accents on top of whatever is playing.
    stinger(name) {
        if (this.manager.musicVolume <= 0.01 || !this.current) return;
        const now = this.context.currentTime + 0.02, sting = this.sting;
        if (name === 'threat') {
            // Something has noticed you: a low swell and a breath of cymbal.
            [28, 40, 47, 52].forEach((midi, voice) => this.pad(now, midi, 1.3, voice ? 0.03 : 0.07, { cutoff: voice ? 1500 : 320, attack: 0.55, release: 1.1, wave: voice ? 'warm' : 'bass', pan: [0, -0.4, 0.4, 0][voice], wet: 0.6, detune: 10 }, sting));
            this.drum(now, 'm-rev-cym', 0.22, { wet: 0.5 }, sting);
            this.drum(now + 1.55, 'm-taiko', 0.3, { rate: 0.9, wet: 0.6 }, sting);
        }
        else if (name === 'kill') {
            if (this.current !== 'combat') return;
            this.drum(now, 'm-taiko', 0.4, { wet: 0.5, pan: -0.2 }, sting);
            this.drum(now + 0.075, 'm-taiko', 0.46, { rate: 1.08, wet: 0.5, pan: 0.2 }, sting);
            [52, 59, 64, 66].forEach((midi, voice) => this.pad(now, midi, 0.5, 0.03, { cutoff: 2600, attack: 0.02, release: 0.8, pan: [-0.4, 0.4, -0.15, 0.15][voice], wet: 0.6, detune: 10 }, sting));
        }
        else if (name === 'death') {
            if (this.group) this.retire(this.group, 1.2);
            this.group = null; this.piece = null; this.current = null; this.slot = '';
            this.drum(now, 'm-impact', 0.8, { wet: 0.7 }, sting);
            this.drum(now, 'm-sub-drop', 0.5, {}, sting);
            [52, 51, 46, 40].forEach((midi, voice) => this.pad(now + voice * 0.35, midi, 3.5, 0.035, { cutoff: 700, attack: 1.2, release: 3, pan: [-0.4, 0.4, -0.2, 0.2][voice], wet: 0.9 }, sting));
            // Hold the silence before any theme returns.
            this.holdUntil = now + 5;
        }
    }

    dispose() {
        const now = this.context.currentTime;
        for (const synth of this.group?.synths ?? []) synth.stop(now);
        for (const lfo of this.lfos) { try { lfo.stop(); } catch { /* already stopped */ } }
        this.group = null; this.piece = null; this.current = null; this.slot = '';
    }
}
