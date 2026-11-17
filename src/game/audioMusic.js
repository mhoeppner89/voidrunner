import { clamp } from './random.js';

// Adaptive score.
//
// Seven contexts, each with its own tempo, harmony and band, generated bar by
// bar so it never loops identically. Bars are scheduled against the audio
// clock with a short look-ahead (not the frame timer), so rhythm stays tight
// through frame hitches. Every context owns a voice group; a context change
// crossfades groups, which lets long tails ring out instead of being cut.
//
// Instruments: detuned wavetable pads through a stereo chorus, soft FM keys
// and bells into a tempo-synced ping-pong delay, monophonic bass and ostinato
// synths (persistent oscillators, sequenced by automation: no per-note
// nodes), and a forged percussion kit from the sound bank (group 'music').
const TEMPO = { open: 60, station: 84, planet: 66, field: 100, graveyard: 48, stealth: 72, combat: 132 };
// Seconds for the outgoing group to fade when entering each context.
const FADE_IN_TO = { combat: 0.35, station: 1.2, stealth: 0.8 };
// Per-context trim so every theme lands at its intended loudness (see tools/audio/render-mix.mjs).
const TRIM = { field: 1.8 };
const LOOKAHEAD = 0.22;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

//  bass, pad voicing
const OPEN = [
    [33, [45, 52, 55, 59, 60]], [29, [41, 48, 52, 57, 60]], [36, [48, 55, 62, 64]], [31, [43, 50, 55, 60]],
    [33, [45, 55, 60, 64, 71]], [38, [50, 57, 60, 64, 65]], [29, [41, 57, 60, 64, 71]], [28, [40, 47, 50, 55, 59]],
];
const STATION = [
    [36, [52, 55, 59, 62]], [33, [55, 59, 60, 64]], [41, [57, 60, 64, 67]], [43, [53, 57, 60, 64]],
    [40, [55, 59, 62]], [33, [55, 60, 64]], [38, [53, 57, 60, 64]], [31, [53, 60, 62]],
];
const PLANET = [
    [38, [45, 50, 53, 60, 64]], [34, [46, 50, 53, 57]], [31, [43, 46, 50, 53, 57]], [33, [45, 48, 52, 55]],
];
const GRAVEYARD = [
    [38, [45, 50, 53, 57]], [34, [46, 50, 53]], [33, [45, 48, 53]], [36, [43, 48, 52]],
    [31, [43, 46, 50]], [29, [41, 45, 50]], [33, [45, 50, 52]], [33, [45, 49, 52]],
];
// Combat: root, third (15 = minor tenth, 16 = major) — two bars per chord.
const COMBAT = [[40, 15], [36, 16], [38, 16], [35, 15], [40, 15], [38, 16], [33, 15], [36, 16]];
const PENTATONIC = [69, 72, 74, 76, 79, 81, 84];
const PLANET_SCALE = [50, 53, 55, 57, 60, 62, 65, 67];

// A persistent two-oscillator mono synth. Notes are automation events on its
// pitch, filter and level, so a 16th-note ostinato costs no node churn.
class MonoSynth {
    constructor(director, target, { type = 'sawtooth', wave, detune = 9, q = 0.9 } = {}) {
        const context = director.context;
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
        this.filter.connect(this.gain); this.gain.connect(target);
    }
    note(at, midi, seconds, level, cutoff) {
        const frequency = hz(midi);
        for (const oscillator of this.oscillators) oscillator.frequency.setValueAtTime(frequency, at);
        this.filter.frequency.setValueAtTime(cutoff * 2.2, at);
        this.filter.frequency.setTargetAtTime(cutoff, at, 0.07);
        this.gain.gain.setTargetAtTime(level, at, 0.006);
        this.gain.gain.setTargetAtTime(0, at + seconds, 0.035);
    }
    stop(at) {
        for (const oscillator of this.oscillators) { try { oscillator.stop(at); } catch { /* already stopped */ } }
    }
}

export class MusicDirector {
    current = null;
    group = null;
    bar = 0;
    nextBar = 0;
    tier = 0;
    intensity = 0.8;
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
        // Stingers live outside the context groups so a context change never cuts them.
        this.sting = { bus: gain(1, this.out), pad: gain(1, this.padIn), echo: gain(1, this.echoIn), wet: gain(1, manager.musicReverbGain) };
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
        };
        // Session-seeded xorshift: varied between sessions, cheap, allocation free.
        this.seed = (Date.now() & 0x7fffffff) || 1;
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

    update(dt, context, danger) {
        const { manager } = this, now = this.context.currentTime;
        if (manager.musicVolume <= 0.01) {
            if (this.group) { this.retire(this.group, 0.3); this.group = null; this.current = null; }
            return;
        }
        this.sweep(now);
        if (now < (this.holdUntil ?? 0)) return;
        if (context !== this.current) this.enter(context, now);
        if (context === 'combat') this.updateTier(danger, now);
        // After a stall (hidden tab, long frame) rejoin the clock instead of bursting.
        if (this.nextBar < now - 0.05) this.nextBar = now + 0.06;
        while (this.nextBar < now + LOOKAHEAD) {
            this.playBar(this.nextBar);
            this.nextBar += this.barSeconds;
            this.bar += 1;
        }
    }

    enter(context, now) {
        const previous = this.current, fade = previous === 'combat' ? 2.2 : FADE_IN_TO[context] ?? 1.6;
        if (this.group) this.retire(this.group, fade);
        this.current = context;
        this.beat = 60 / TEMPO[context];
        this.barSeconds = this.beat * 4;
        this.bar = 0; this.tier = 0;
        const fresh = (target, level = 1) => { const node = this.context.createGain(); node.gain.value = level; node.connect(target); return node; };
        const trim = TRIM[context] ?? 1;
        const group = this.group = { bus: fresh(this.out, trim), pad: fresh(this.padIn, trim), echo: fresh(this.echoIn, trim), wet: fresh(this.manager.musicReverbGain, trim), synths: [], nodes: [] };
        group.nodes.push(group.bus, group.pad, group.echo, group.wet);
        // Ambient themes swell in under the outgoing tail; combat lands at once.
        if (context !== 'combat' && previous) {
            for (const node of group.nodes) { node.gain.setValueAtTime(0.0001, now); node.gain.linearRampToValueAtTime(trim, now + Math.min(2.5, fade + 0.6)); }
        }
        this.echoLeft.delayTime.setTargetAtTime(this.beat * 0.75, now, 0.05);
        this.echoRight.delayTime.setTargetAtTime(this.beat * 0.75, now, 0.05);
        if (context === 'combat') {
            group.bass = this.synth(group, group.bus, { wave: this.waves.bass, detune: 5 });
            group.ostinato = this.synth(group, group.pad, { type: 'sawtooth', detune: 11 });
            group.lead = this.synth(group, group.pad, { wave: this.waves.warm, detune: 7 });
            // The fight opens with a hit, not a fade.
            this.drum(now + 0.02, 'm-impact', 0.6, { wet: 0.6 }, this.sting);
            this.drum(now + 0.02, 'm-sub-drop', 0.35, {}, this.sting);
            this.nextBar = now + 0.06;
        }
        else {
            if (context === 'field') group.bass = this.synth(group, group.bus, { type: 'sawtooth', detune: 6, q: 2 });
            if (context === 'station') group.bass = this.synth(group, group.bus, { wave: this.waves.bass, detune: 3 });
            if (previous === 'combat') this.resolveCombat(now);
            this.nextBar = now + (previous ? 0.5 : 0.1);
        }
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
        switch (this.current) {
            case 'combat': this.combatBar(at); break;
            case 'station': this.stationBar(at); break;
            case 'planet': this.planetBar(at); break;
            case 'field': this.fieldBar(at); break;
            case 'graveyard': this.graveyardBar(at); break;
            case 'stealth': this.stealthBar(at); break;
            default: this.openBar(at);
        }
    }

    // ------------------------------------------------------------ instruments

    // Sustained ensemble voice: two detuned wavetable oscillators through a
    // filter that opens with the swell.
    pad(at, midi, seconds, level, { cutoff = 1400, attack = 0.9, release = 1.6, pan = 0, wave = 'warm', detune = 7, wet = 0.5, bend = 0 } = {}, group = this.group) {
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
    pump(at, depth = 0.55) {
        const gain = this.group.pad.gain, full = TRIM[this.current] ?? 1;
        gain.setValueAtTime(depth * full, at);
        gain.linearRampToValueAtTime(full, at + this.beat * 0.5);
    }

    // --------------------------------------------------------------- contexts

    // Deep space: wide slow chords, a low root, and the occasional far-off
    // soft bell answered by the delay. The emptiest, most patient bed.
    openBar(at) {
        const [bass, chord] = OPEN[this.bar % OPEN.length], level = this.intensity, bar = this.barSeconds;
        this.pad(at, bass, bar * 1.05, 0.085 * level, { cutoff: 320, attack: 1.4, release: 2.4, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => {
            if (voice > 1 && this.chance(0.14)) return; // thin the chord now and then
            this.pad(at + voice * 0.22, midi, bar * 1.02, this.range(0.026, 0.036) * level, {
                cutoff: this.range(900, 1500) * (0.8 + 0.3 * level), attack: this.range(1.4, 2), release: 2.6,
                pan: [-0.5, 0.35, -0.2, 0.5, 0][voice], wet: 0.7,
            });
        });
        if (this.chance(0.5)) {
            const count = this.chance(0.3) ? 2 : 1;
            for (let i = 0; i < count; i += 1)
                this.bell(at + this.range(0.6, 3) + i * this.beat * 0.75, this.pick(PENTATONIC), this.range(0.014, 0.022) * level, { decay: this.range(2.4, 3.6), attack: 0.14, index: 1.1, pan: this.range(-0.6, 0.6), echo: 0.6, wet: 0.9 });
        }
        if (this.bar % 4 === 2)
            this.pad(at + 1, this.pick([76, 81, 83]), bar * 1.4, 0.011 * level, { cutoff: 2600, attack: 2.2, release: 3, wave: 'glass', pan: this.range(-0.4, 0.4), wet: 0.9 });
    }

    // Docked: a warm, unhurried lounge. Mellow keys roll through the chord,
    // a round bass walks underneath, brushed percussion keeps time.
    stationBar(at) {
        const index = this.bar % STATION.length, [bass, chord] = STATION[index], beat = this.beat, group = this.group;
        chord.forEach((midi, voice) => this.pad(at, midi, this.barSeconds, 0.021, { cutoff: 1100, attack: 0.6, release: 1.2, pan: [-0.4, 0.4, -0.15, 0.2][voice], wet: 0.45 }));
        // Eighth-note keys with a light swing; three shapes rotate and breathe.
        const shapes = [[0, 2, 1, 3, 2, 1, 3, 2], [3, 2, 1, 0, 1, 2, 3, 1], [0, 1, 2, 3, 2, 3, 1, 2]], shape = shapes[(this.bar >> 1) % shapes.length];
        for (let step = 0; step < 8; step += 1) {
            if (step > 0 && this.chance(0.22)) continue;
            const midi = Math.min(chord[shape[step] % chord.length], 67);
            const time = at + (step >> 1) * beat + (step % 2 ? beat * 0.58 : 0);
            this.bell(time, midi, this.range(0.03, 0.042) * (step % 2 ? 0.8 : 1), { decay: this.range(0.9, 1.3), attack: 0.035, ratio: 1, index: 1.0, pan: [-0.35, 0.1, 0.35, -0.1][step % 4], echo: 0.18, wet: 0.35 });
        }
        group.bass.note(at, bass, beat * 1.4, 0.13, 420);
        group.bass.note(at + beat * 2.5, bass + (this.chance(0.5) ? 7 : 12), beat * 0.45, 0.085, 480);
        if (this.chance(0.55)) group.bass.note(at + beat * 3.5, STATION[(index + 1) % STATION.length][0] + (this.chance(0.5) ? 2 : -1), beat * 0.4, 0.075, 460);
        for (let step = 0; step < 8; step += 1)
            if (step % 2 || this.chance(0.25)) this.drum(at + step * beat * 0.5 + (step % 2 ? beat * 0.08 : 0), 'm-shaker', this.range(0.05, 0.075), { pan: 0.3, rate: this.range(0.95, 1.05) });
        this.drum(at + beat, 'm-rim', 0.07, { pan: -0.25, wet: 0.3 });
        this.drum(at + beat * 3, 'm-rim', 0.08, { pan: -0.25, wet: 0.3 });
        this.drum(at, 'm-heart', 0.16);
    }

    // Planets: a low drone, warm plucked phrases that repeat and mutate, a
    // frame drum far away, wind between the notes.
    planetBar(at) {
        const index = this.bar % PLANET.length, [bass, chord] = PLANET[index], beat = this.beat, level = this.intensity;
        this.pad(at, bass, this.barSeconds, 0.09 * level, { cutoff: 300, attack: 1, release: 1.8, wave: 'bass', wet: 0.3, detune: 4 });
        chord.forEach((midi, voice) => this.pad(at + voice * 0.15, midi, this.barSeconds, 0.022 * level, { cutoff: 1000, attack: 1.2, release: 2, pan: [-0.45, 0.3, -0.15, 0.45, 0][voice], wet: 0.6 }));
        // A four-bar motif is written once, then varied: repetition is what makes it a tune.
        if (!this.motif || (this.bar % 8 === 0 && this.chance(0.6)))
            this.motif = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => (this.chance(0.42) ? Math.floor(this.random() * PLANET_SCALE.length) : -1)));
        this.motif[index].forEach((degree, step) => {
            if (degree < 0 || this.chance(0.12)) return;
            const midi = PLANET_SCALE[this.chance(0.15) ? clamp(degree + (this.chance(0.5) ? 1 : -1), 0, PLANET_SCALE.length - 1) : degree];
            this.pluck(at + step * beat * 0.5, midi, this.range(0.036, 0.05) * level, { decay: this.range(1.2, 1.8), attack: 0.035, cutoff: 1500, pan: [-0.5, 0.2, 0.5, -0.3][step % 4], echo: 0.4, wet: 0.5 });
        });
        if (this.bar % 2 === 0) {
            this.drum(at, 'm-taiko', 0.11 * level, { rate: 1.12, wet: 0.7, pan: -0.2 });
            this.air(at + beat, this.barSeconds * 1.2, this.range(0.03, 0.045), { frequency: this.range(380, 620), pan: this.range(-0.4, 0.4) });
        }
        if (this.chance(0.5)) this.drum(at + beat * 2.5, 'm-tom', 0.06, { rate: 0.9, wet: 0.6, pan: 0.3 });
    }

    // The belt: a nervous low pulse, struck steel ringing through the delay,
    // semitone clusters hanging overhead.
    fieldBar(at) {
        const beat = this.beat, group = this.group, level = this.intensity;
        const accents = [1, 0, 0.7, 0.55, 0, 0.8, 0, 0.6];
        accents.forEach((accent, step) => {
            if (!accent && this.chance(0.75)) return;
            const midi = step === 7 && this.chance(0.4) ? 29 : step === 4 && this.chance(0.2) ? 26 : 28;
            group.bass.note(at + step * beat * 0.5, midi + 12, beat * 0.28, (0.05 + 0.05 * accent) * level, 240 + 260 * accent);
        });
        if (this.bar % 2 === 0) {
            const cluster = this.pick([[52, 53, 59], [52, 55, 58], [50, 53, 57], [52, 54, 59]]);
            cluster.forEach((midi, voice) => this.pad(at, midi + 12, this.barSeconds * 2, 0.017 * level, { cutoff: 1900, attack: 1.3, release: 2, wave: 'glass', pan: [-0.5, 0.5, 0][voice], wet: 0.8 }));
        }
        for (let hits = this.chance(0.45) ? 2 : 1; hits > 0; hits -= 1)
            this.drum(at + Math.floor(this.random() * 16) * beat * 0.25, 'm-anvil', this.range(0.07, 0.12) * level, { rate: this.pick([1, 1.189, 1.335, 0.891, 0.75]), pan: this.range(-0.7, 0.7), wet: 0.6, echo: 0.55 });
        for (let step = 0; step < 16; step += 1)
            if (this.chance(0.3)) this.drum(at + step * beat * 0.25, 'm-rim', this.range(0.03, 0.055), { pan: step % 2 ? 0.45 : -0.45, rate: this.range(0.9, 1.2), echo: 0.2 });
        for (const step of [1, 3, 5, 7]) this.drum(at + step * beat * 0.5, 'm-hat', 0.035, { pan: 0.2 });
        this.drum(at, 'm-heart', 0.2 * level); this.drum(at + beat * 2, 'm-heart', 0.15 * level);
    }

    // The graveyard: a slow lament. Dark chords, a far-off drum, and a voice
    // that bends up and falls back.
    graveyardBar(at) {
        const [bass, chord] = GRAVEYARD[this.bar % GRAVEYARD.length], bar = this.barSeconds, level = this.intensity;
        this.pad(at, bass, bar, 0.08 * level, { cutoff: 260, attack: 1.8, release: 2.6, wave: 'bass', wet: 0.4, detune: 4 });
        chord.forEach((midi, voice) => this.pad(at + voice * 0.3, midi, bar, (voice === 0 ? 0.034 : 0.024) * level, { cutoff: 720, attack: 2.2, release: 3, pan: [-0.4, 0.3, -0.1, 0.4][voice], wet: 0.8 }));
        if (this.chance(0.55))
            this.pad(at + this.range(0.4, 1.4), this.pick([57, 60, 62, 65]), this.range(2.6, 3.4), this.range(0.013, 0.019), { cutoff: 1300, attack: 1.1, release: 1.6, wave: 'glass', bend: this.range(2, 5), pan: this.range(-0.55, 0.55), wet: 1 });
        if (this.bar % 2 === 0) this.drum(at, 'm-taiko', 0.14 * level, { rate: 0.8, wet: 1, pan: this.range(-0.3, 0.3) });
        if (this.bar % 8 === 7) this.drum(at + bar * 0.5, 'm-sub-drop', 0.12);
    }

    // Running dark: a muffled heartbeat and almost nothing else.
    stealthBar(at) {
        const beat = this.beat, root = [33, 33, 31, 32][(this.bar >> 1) % 4];
        this.drum(at, 'm-heart', 0.3); this.drum(at + beat * 0.34, 'm-heart', 0.2, { rate: 0.94 });
        this.drum(at + beat * 2, 'm-heart', 0.24); this.drum(at + beat * 2.34, 'm-heart', 0.15, { rate: 0.94 });
        if (this.bar % 2 === 0) this.pad(at, root, this.barSeconds * 2, 0.05, { cutoff: 240, attack: 1.2, release: 1.6, wave: 'bass', wet: 0.3 });
        if (this.bar % 2 === 0) this.pad(at + beat, root + 36, this.barSeconds * 1.5, 0.011, { cutoff: 900, attack: 1.4, release: 1.8, wave: 'glass', pan: this.bar % 4 ? 0.35 : -0.35, wet: 0.9 });
        if (this.bar % 4 === 3) this.pad(at + beat * 1.5, root + 37, this.barSeconds, 0.008, { cutoff: 900, attack: 1.2, release: 1.6, wave: 'glass', pan: -0.2, wet: 0.9 });
        if (this.chance(0.3)) this.drum(at + beat * this.pick([1.5, 3, 3.5]), 'm-rim', 0.035, { pan: this.range(-0.5, 0.5), echo: 0.4, wet: 0.5 });
    }

    // Combat: drums carry the fight. Tier 0 is taiko, kick and a driving
    // bass/string ostinato; tier 1 adds the backbeat, brass-like stabs and
    // fills; tier 2 gallops, opens the hats and brings in the lead line.
    combatBar(at) {
        const beat = this.beat, group = this.group, tier = this.tier, level = 0.85 + 0.15 * this.intensity;
        const chordIndex = (this.bar >> 1) % COMBAT.length, [root, third] = COMBAT[chordIndex], second = this.bar % 2 === 1, phrase = this.bar % 8;
        // Bass: relentless eighths with octave kicks.
        [0, 0, 12, 0, 0, 12, 0, 7].forEach((offset, step) =>
            group.bass.note(at + step * beat * 0.5, root + offset, beat * 0.36, (step % 2 ? 0.085 : 0.11) * level, 300 + tier * 110));
        // Spiccato ostinato: eighths at rest, sixteenths once the fight escalates.
        const figure = [0, 7, 12, 7, 0, 7, third, 7], steps = tier >= 1 ? 16 : 8;
        for (let step = 0; step < steps; step += 1) {
            const offset = figure[(tier >= 1 ? step >> 1 : step) % figure.length] + (tier >= 1 && step % 2 ? 12 : 0);
            const accent = step % (steps / 4) === 0;
            group.ostinato.note(at + step * beat * (4 / steps), root + 12 + offset, beat * (2.2 / steps), (accent ? 0.05 : 0.034) * level, 1300 + tier * 500 + (accent ? 400 : 0));
        }
        // Brass-weight stabs on the chord change and a syncopated answer.
        if (tier >= 1 && (!second || this.chance(0.6))) {
            const time = second ? at + beat * 2.5 : at;
            [0, 7, third].forEach((offset, voice) => this.pad(time, root + 12 + offset, beat * 0.8, 0.036 * level, { cutoff: 1700 + tier * 700, attack: 0.025, release: 0.5, pan: [-0.35, 0.35, 0][voice], wet: 0.4, detune: 10 }));
        }
        // Lead line at full escalation: a four-note cell, answered every other bar.
        if (tier >= 2) {
            const cell = second ? [third + 12, 19, 14, 12] : [12, third + 12, 19, 24];
            cell.forEach((offset, i) => group.lead.note(at + i * beat, root + 24 + offset, beat * 0.9, 0.03 * level, 2400));
        }

        // Drums.
        const kicks = tier >= 2 ? [0, 1, 2, 3] : [0, 2];
        for (const hit of kicks) { this.drum(at + hit * beat, 'm-kick', 0.42 * level); this.pump(at + hit * beat, tier >= 2 ? 0.5 : 0.62); }
        const taiko = tier >= 2 ? [0, 0.75, 1.5, 2.5, 3, 3.5] : tier === 1 ? [0, 2.5, 3.75] : [0, 2.5];
        taiko.forEach((hit, i) => this.drum(at + hit * beat, 'm-taiko', (i === 0 ? 0.5 : 0.36) * level, { rate: i % 2 ? 1.06 : 1, pan: i % 2 ? 0.25 : -0.25, wet: 0.35 }));
        if (tier >= 1) {
            this.drum(at + beat, 'm-snare', 0.3 * level, { pan: 0.1, wet: 0.25 });
            this.drum(at + beat * 3, 'm-snare', 0.33 * level, { pan: 0.1, wet: 0.25 });
        }
        for (let step = 0; step < 8; step += 1) {
            const open = tier >= 2 && step % 2 === 1;
            this.drum(at + step * beat * 0.5, 'm-hat', (step % 2 ? 0.075 : 0.05) * (open ? 0.8 : 1), { pan: 0.3, rate: open ? 0.92 : this.range(0.97, 1.04) });
        }
        if (this.chance(0.3)) this.drum(at + beat * this.pick([1.75, 2.25, 3.25]), 'm-hat', 0.05, { pan: -0.3 });
        // Fill into every fourth bar; riser and a hit across the phrase boundary.
        if (tier >= 1 && this.bar % 4 === 3)
            for (let i = 0; i < 4; i += 1) this.drum(at + beat * (3 + i * 0.25), 'm-tom', (0.3 + i * 0.03) * level, { rate: [1.2, 1.1, 1, 0.9][i], pan: [-0.5, -0.2, 0.2, 0.5][i], wet: 0.3 });
        if (phrase === 7) this.drum(at + this.barSeconds - 1.6, 'm-rev-cym', 0.3, { wet: 0.4 });
        if (phrase === 0 && this.bar > 0 && tier >= 1) this.drum(at, 'm-impact', 0.34, { wet: 0.5 });
        if (tier >= 2 && !second) this.drum(at, 'm-anvil', 0.12, { rate: 0.75, pan: 0.5, wet: 0.5, echo: 0.3 });
    }

    // The fight is over: one last hit, then the chord finally resolves.
    resolveCombat(now) {
        this.drum(now + 0.05, 'm-taiko', 0.4, { rate: 0.85, wet: 0.8 }, this.sting);
        [40, 47, 52, 56, 59].forEach((midi, voice) => this.pad(now + 0.1 + voice * 0.05, midi, 2.2, 0.03, { cutoff: 1500, attack: 0.5, release: 2.4, pan: [-0.4, 0.4, -0.2, 0.2, 0][voice], wet: 0.8 }, this.sting));
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
            if (this.group) this.retire(this.group, 1.2), this.group = null, this.current = null;
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
        this.group = null; this.current = null;
    }
}
