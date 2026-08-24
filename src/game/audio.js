import { clamp } from './random.js';

const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Music scheduler: one bar fires per tick. Every context has its own tempo,
// harmony and instrumentation, so stations, planets, the belt, the graveyard,
// open space and combat each sound unmistakably different — combat is a full
// departure (drums + stabs), not a filter tweak on the ambient loop.
const MUSIC_INTERVALS = {
    station: 2.2,
    planet: 2.5,
    field: 1.5,
    graveyard: 3.4,
    open: 3.0,
    combat: 0.8,
};
const DRONE_ROOTS = {
    planet: [38, 45],
    field: [40],
    graveyard: [38],
};
const DRONE_LEVEL = {
    planet: 0.018,
    field: 0.014,
    graveyard: 0.014,
};

// Filtered pink noise is the shared material for engine wash, impacts and
// explosions. It sounds much less harsh than the old white-noise beeper mix.
class PinkNoise {
    constructor(context) {
        this.buffer = context.createBuffer(2, Math.floor(context.sampleRate * 3), context.sampleRate);
        for (let channel = 0; channel < this.buffer.numberOfChannels; channel += 1) {
            const output = this.buffer.getChannelData(channel);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let index = 0; index < output.length; index += 1) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.969 * b2 + white * 0.153852;
                b3 = 0.8665 * b3 + white * 0.3104856;
                b4 = 0.55 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.016898;
                output[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
                b6 = white * 0.115926;
            }
        }
    }
}

export class AudioManager {
    context;
    master;
    effectsGain;
    musicGain;
    reverbInput;
    compressor;
    enabled = false;
    stationMode = true;
    musicVolume = 0.34;
    effectsVolume = 0.68;
    musicTimer = 0;
    chordIndex = 0;
    dangerLevel = 0;
    // Ambient music context: 'open' | 'planet' | 'field' | 'graveyard' | 'station'.
    // Combat overrides it while hostiles are close (see update).
    musicContext = 'open';
    currentContext = null;
    droneOscillators = [];
    // Context-switch crossfade: a dedicated gain between the user volume and
    // the compressor, ducked briefly on context changes so leaving combat
    // never pops. The user's music volume is untouched.
    crossfadeGain;
    // Discrete combat escalation tier (0/1/2) with hysteresis, so the drums
    // step up as hostiles pile in instead of smearing with the danger decay.
    combatTier = 0;

    engineGain;
    engineFilter;
    engineOscA;
    engineOscB;
    engineSub;
    engineWashSource;
    engineWashFilter;
    engineWashGain;
    pinkBuffer;
    stationSource;
    stationFilter;
    stationGain;

    async enable() {
        if (this.enabled) {
            await this.context?.resume();
            return;
        }
        const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContextCtor)
            return;
        this.context = new AudioContextCtor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.82;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 24;
        this.compressor.ratio.value = 3.2;
        this.compressor.attack.value = 0.006;
        this.compressor.release.value = 0.22;
        // A hard safety limiter at the very end of the chain: loudness
        // changes here can never clip the destination.
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -2;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 18;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.09;
        this.effectsGain = this.context.createGain();
        this.effectsGain.gain.value = this.effectsVolume;
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.crossfadeGain = this.context.createGain();
        this.crossfadeGain.gain.value = 1;
        this.effectsGain.connect(this.compressor);
        this.musicGain.connect(this.crossfadeGain);
        this.crossfadeGain.connect(this.compressor);
        this.compressor.connect(this.limiter);
        this.limiter.connect(this.master);
        this.master.connect(this.context.destination);

        const convolver = this.context.createConvolver();
        convolver.buffer = this.createImpulseResponse(2.35, 2.7);
        this.reverbInput = this.context.createGain();
        const reverbOutput = this.context.createGain();
        reverbOutput.gain.value = 0.38;
        const preDelay = this.context.createDelay(0.2);
        preDelay.delayTime.value = 0.028;
        const lowCut = this.context.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 110;
        this.reverbInput.connect(preDelay);
        preDelay.connect(convolver);
        convolver.connect(lowCut);
        lowCut.connect(reverbOutput);
        reverbOutput.connect(this.compressor);

        this.createEngine();
        this.createStationAmbience();
        this.enabled = true;
        await this.context.resume();
    }

    createEngine() {
        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter = this.context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 260;
        this.engineFilter.Q.value = 0.65;
        this.engineOscA = this.context.createOscillator();
        this.engineOscA.type = 'sawtooth';
        this.engineOscA.frequency.value = 43;
        this.engineOscB = this.context.createOscillator();
        this.engineOscB.type = 'triangle';
        this.engineOscB.frequency.value = 45.2;
        this.engineSub = this.context.createOscillator();
        this.engineSub.type = 'sine';
        this.engineSub.frequency.value = 21.5;
        const sawGain = this.context.createGain(); sawGain.gain.value = 0.14;
        const triangleGain = this.context.createGain(); triangleGain.gain.value = 0.42;
        const subGain = this.context.createGain(); subGain.gain.value = 0.58;
        this.engineOscA.connect(sawGain); sawGain.connect(this.engineFilter);
        this.engineOscB.connect(triangleGain); triangleGain.connect(this.engineFilter);
        this.engineSub.connect(subGain); subGain.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.effectsGain);
        this.engineGain.connect(this.reverbInput);

        this.pinkBuffer = new PinkNoise(this.context).buffer;
        this.engineWashSource = this.context.createBufferSource();
        this.engineWashSource.buffer = this.pinkBuffer;
        this.engineWashSource.loop = true;
        this.engineWashFilter = this.context.createBiquadFilter();
        this.engineWashFilter.type = 'bandpass';
        this.engineWashFilter.frequency.value = 420;
        this.engineWashFilter.Q.value = 0.75;
        this.engineWashGain = this.context.createGain();
        this.engineWashGain.gain.value = 0;
        this.engineWashSource.connect(this.engineWashFilter);
        this.engineWashFilter.connect(this.engineWashGain);
        this.engineWashGain.connect(this.effectsGain);
        this.engineOscA.start(); this.engineOscB.start(); this.engineSub.start(); this.engineWashSource.start();
    }

    createStationAmbience() {
        this.stationSource = this.context.createBufferSource();
        this.stationSource.buffer = this.pinkBuffer;
        this.stationSource.loop = true;
        this.stationFilter = this.context.createBiquadFilter();
        this.stationFilter.type = 'lowpass';
        this.stationFilter.frequency.value = 210;
        this.stationGain = this.context.createGain();
        this.stationGain.gain.value = 0;
        this.stationSource.connect(this.stationFilter);
        this.stationFilter.connect(this.stationGain);
        this.stationGain.connect(this.master);
        this.stationSource.start();
    }

    createImpulseResponse(seconds, decay) {
        const length = Math.floor(this.context.sampleRate * seconds);
        const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
        for (let channel = 0; channel < 2; channel += 1) {
            const data = impulse.getChannelData(channel);
            for (let index = 0; index < length; index += 1)
                data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
        }
        return impulse;
    }

    setVolumes(music, effects) {
        this.musicVolume = clamp(music, 0, 1);
        this.effectsVolume = clamp(effects, 0, 1);
        if (!this.context) return;
        const now = this.context.currentTime;
        this.musicGain?.gain.setTargetAtTime(this.musicVolume, now, 0.04);
        this.effectsGain?.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
    }

    setStationMode(station) {
        this.stationMode = station;
    }

    update(dt, throttle, afterburner, damage = 0, nearbyEnemies = 0, musicContext) {
        if (!this.context || !this.enabled)
            return;
        if (musicContext)
            this.musicContext = musicContext;
        const now = this.context.currentTime;
        const thrust = this.stationMode ? 0 : throttle;
        const burn = this.stationMode ? 0 : (afterburner ? 1 : 0);
        const engineBase = this.stationMode ? 0 : 0.04 + thrust * 0.06 + burn * 0.05;
        this.engineGain?.gain.setTargetAtTime(engineBase * this.effectsVolume, now, 0.11);
        const pitch = 41 + thrust * 30 + burn * 25 + damage * 7;
        this.engineOscA?.frequency.setTargetAtTime(pitch, now, 0.1);
        this.engineOscB?.frequency.setTargetAtTime(pitch * 1.047, now, 0.1);
        this.engineSub?.frequency.setTargetAtTime(pitch * 0.49, now, 0.12);
        this.engineFilter?.frequency.setTargetAtTime(190 + thrust * 330 + burn * 480, now, 0.1);
        const wash = this.stationMode ? 0 : 0.008 + thrust * 0.038 + burn * 0.028;
        this.engineWashGain?.gain.setTargetAtTime(wash * this.effectsVolume, now, 0.12);
        this.engineWashFilter?.frequency.setTargetAtTime(300 + thrust * 430 + burn * 680, now, 0.12);
        this.stationGain?.gain.setTargetAtTime((this.stationMode ? 0.018 : 0) * this.effectsVolume, now, 0.35);

        if (nearbyEnemies > 0)
            this.dangerLevel = Math.min(1, 0.45 + nearbyEnemies * 0.15);
        else
            this.dangerLevel = Math.max(0, this.dangerLevel - dt * 0.18);
        // Combat overrides the location ambience while hostiles are close;
        // station mode wins over both (you are safe on the pad).
        const context = this.stationMode ? 'station' : (this.dangerLevel > 0.2 ? 'combat' : this.musicContext);
        if (context !== this.currentContext) {
            this.currentContext = context;
            this.crossfadeContext();
            if (context !== 'combat')
                this.combatTier = 0;
            this.stopDrones();
            this.startDrones(context);
            // Pull the next bar forward so a context change lands promptly.
            this.musicTimer = Math.min(this.musicTimer, 0.05);
        }
        if (context === 'combat')
            this.updateCombatTier();
        this.musicTimer -= dt;
        const interval = MUSIC_INTERVALS[context];
        if (this.musicTimer <= 0 && this.musicVolume > 0.01) {
            this.musicTimer = interval;
            this.playMusicLayer(context);
        }
    }

    setMusicContext(context) {
        this.musicContext = context;
    }

    // Discrete combat escalation (0/1/2) with hysteresis: the drums step up
    // as hostiles pile in and only step back down below a lower threshold, so
    // a single straggler doesn't flicker the tier. The bar reads the tier and
    // adds a snare (1) or a doubled hat + bass drone (2) as clear steps.
    updateCombatTier() {
        const danger = this.dangerLevel;
        const desired = danger >= 0.8 ? 2 : danger >= 0.55 ? 1 : 0;
        if (desired > this.combatTier) {
            this.combatTier = desired;
        }
        else if (desired < this.combatTier) {
            const dropAt = this.combatTier === 2 ? 0.7 : 0.45;
            if (danger < dropAt)
                this.combatTier = desired;
        }
    }

    // Where every music voice lands: user volume, then the context crossfade,
    // then the compressor. Keeps drones, bells and drum transients inside the
    // same duck so a context change never pops any of them.
    musicOut() {
        return this.crossfadeGain;
    }

    // Ducks the music bus for a beat on context changes so the old context's
    // sustained voices settle before the new one begins, then restores
    // smoothly. Short enough to read as a transition, not a glitch.
    crossfadeContext() {
        const now = this.context.currentTime;
        const g = this.crossfadeGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(Math.max(g.value, 0.0001), now);
        g.linearRampToValueAtTime(0.0001, now + 0.05);
        g.linearRampToValueAtTime(1, now + 0.5);
    }

    // One sustained oscillator per drone root; replaced whenever the ambient
    // context changes (combat has no drone and stops them).
    startDrones(context) {
        const roots = DRONE_ROOTS[context];
        if (!roots)
            return;
        const now = this.context.currentTime;
        const level = DRONE_LEVEL[context];
        for (const midi of roots) {
            const oscillator = this.context.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = midiToFrequency(midi);
            const gain = this.context.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(level, now + 1.6);
            oscillator.connect(gain);
            gain.connect(this.musicOut());
            oscillator.start();
            this.droneOscillators.push({ oscillator, gain });
        }
    }

    stopDrones() {
        const now = this.context.currentTime;
        for (const { oscillator, gain } of this.droneOscillators) {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(0.0001, now, 0.25);
            try { oscillator.stop(now + 1.0); } catch { /* already stopped */ }
        }
        this.droneOscillators = [];
    }

    // A single music note: oscillator → optional filter → optional pan → gain
    // → music bus. The pan places voices in the stereo field per context.
    musicNote({ at, midi, type = 'sine', level = 0.02, attack = 0.4, decay = 3, filterFreq = 0, pan = 0 }) {
        const oscillator = this.context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = midiToFrequency(midi);
        let head = oscillator;
        if (filterFreq > 0) {
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            oscillator.connect(filter);
            head = filter;
        }
        if (pan !== 0) {
            const panner = this.context.createStereoPanner();
            panner.pan.setValueAtTime(clamp(pan, -0.9, 0.9), at);
            head.connect(panner);
            head = panner;
        }
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
        head.connect(gain);
        gain.connect(this.musicOut());
        gain.connect(this.reverbInput);
        oscillator.start(at);
        oscillator.stop(at + attack + decay + 0.05);
    }

    // A short shared-pink-noise hit for ticks, shakers and percussion.
    musicNoise({ at, duration = 0.1, filterType = 'bandpass', filterFreq = 1200, q = 1, level = 0.02, reverb = false, pan = 0 }) {
        const source = this.context.createBufferSource();
        source.buffer = this.pinkBuffer;
        const filter = this.context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq;
        filter.Q.value = q;
        let head = filter;
        if (pan !== 0) {
            const panner = this.context.createStereoPanner();
            panner.pan.setValueAtTime(clamp(pan, -0.9, 0.9), at);
            filter.connect(panner);
            head = panner;
        }
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + duration * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        source.connect(filter); head.connect(gain);
        gain.connect(this.musicOut());
        if (reverb)
            gain.connect(this.reverbInput);
        source.start(at); source.stop(at + duration + 0.05);
    }

    // Deep space: wide, sparse and deep — a low root, a slow triangle pad
    // breathing in staggered, and the rare high sparkle. The quietest, emptiest
    // bed: low register, huge reverb, voices spread across the stereo field.
    playOpenBar(now, step) {
        const progression = [[45, 52, 57, 64], [41, 48, 53, 60], [43, 50, 55, 62], [43, 47, 50, 55]];
        const chord = progression[step % progression.length];
        this.musicNote({ at: now, midi: chord[0] - 12, type: 'sine', level: 0.096, attack: 1.8, decay: 5.2, filterFreq: 500, pan: -0.25 });
        chord.forEach((midi, voice) => this.musicNote({
            at: now + 0.6 + voice * 0.25, midi, type: voice === 0 ? 'sine' : 'triangle',
            level: voice === 0 ? 0.055 : 0.034, attack: 1.7, decay: 4.6, filterFreq: 850,
            pan: [-0.4, 0.1, 0.4, -0.15][voice],
        }));
        if (step % 2 === 1) {
            const sparkle = [69, 72, 76, 79][(step >> 1) % 4];
            this.musicNote({ at: now + 1.4, midi: sparkle, type: 'sine', level: 0.024, attack: 0.35, decay: 3.4, pan: 0.35 });
        }
    }

    // Docked: bright mid-register arpeggios (root–fifth–octave–third) over a
    // walking bass, a shaker tick and the station bell. The busiest, warmest
    // bed — a bustling safe haven, unmistakable from the sparse deep-space pad.
    playStationBar(now, step) {
        const progression = [[48, 52, 55], [47, 50, 55], [45, 48, 52], [41, 45, 48]];
        const bass = [36, 35, 33, 29];
        const chord = progression[step % progression.length];
        const arp = [chord[0], chord[2], chord[0] + 12, chord[1]];
        arp.forEach((midi, i) => this.musicNote({
            at: now + i * 0.32, midi, type: 'triangle', level: 0.046,
            attack: 0.02, decay: 0.9, filterFreq: 1600, pan: [-0.4, 0, 0.4, -0.2][i],
        }));
        this.musicNote({ at: now, midi: bass[step % bass.length], type: 'sine', level: 0.085, attack: 0.1, decay: 1.9, pan: -0.15 });
        this.musicNote({ at: now + 1.1, midi: bass[step % bass.length] + 7, type: 'sine', level: 0.04, attack: 0.1, decay: 0.8, pan: 0.15 });
        this.musicNoise({ at: now + 1.1, duration: 0.05, filterType: 'highpass', filterFreq: 5200, level: 0.016, pan: 0.2 });
        if (step % 2 === 0)
            this.playStationBell(now + 0.8);
    }

    // Planets: a low drone with warm, sparse pentatonic plucks — each note
    // placed wide in the stereo field like wind over rock. Mid-low register,
    // gentle attack; distinct from open space's big pads and the station's
    // busy arpeggios.
    playPlanetBar(now, step) {
        const scale = [45, 48, 43, 41, 38]; // A3 C4 G3 F3 D3
        const patterns = [[0, 1, 2, 1, 3], [1, 0, 2, 4, 2], [2, 3, 1, 0, 1], [3, 2, 4, 1, 2]];
        const pattern = patterns[step % patterns.length];
        const pans = [-0.5, 0.2, 0.5, -0.3, 0.1];
        pattern.forEach((index, i) => this.musicNote({
            at: now + i * 0.46, midi: scale[index], type: 'triangle', level: 0.042,
            attack: 0.02, decay: 1.1, filterFreq: 1500, pan: pans[i % pans.length],
        }));
        if (step % 2 === 0) {
            this.musicNote({ at: now, midi: 33, type: 'sine', level: 0.076, attack: 1.2, decay: 3.4, filterFreq: 300, pan: -0.2 });
            this.musicNoise({ at: now, duration: 2.0, filterType: 'lowpass', filterFreq: 300, level: 0.023, pan: 0.2 });
        }
    }

    // The Shardbelt: high-register metallic semitone clusters over a low E
    // sawtooth pulse with a ringing tick. The most nervous, brightest bed —
    // unmistakable against the warm planet plucks and the graveyard's slow
    // lament.
    playFieldBar(now, step) {
        const ostinato = [[64, 66], [65, 63], [64, 66], [62, 65]];
        const pair = ostinato[step % ostinato.length];
        pair.forEach((midi, i) => this.musicNote({
            at: now + i * 0.16, midi, type: 'square', level: 0.034, attack: 0.008, decay: 0.3,
            filterFreq: 2100, pan: i === 0 ? -0.35 : 0.35,
        }));
        this.musicNote({ at: now, midi: 40, type: 'sawtooth', level: 0.048, attack: 0.008, decay: 0.4, filterFreq: 240, pan: 0 });
        this.musicNoise({ at: now + 0.7, duration: 0.05, filterType: 'bandpass', filterFreq: 2600, q: 6, level: 0.051, reverb: true, pan: 0.3 });
    }

    // The graveyard: slow mid-low lamenting chords and a distant wailing bend
    // that swells and falls. The sparsest, emptiest register — a hollow dirge
    // that reads instantly against the belt's nervous high clusters.
    playGraveyardBar(now, step) {
        const progression = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [43, 48, 52]];
        const chord = progression[step % progression.length];
        chord.forEach((midi, voice) => this.musicNote({
            at: now, midi, type: 'sine', level: voice === 0 ? 0.043 : 0.022,
            attack: 1.9, decay: 5.0, pan: [-0.3, 0.15, 0.3][voice],
        }));
        if (step % 2 === 0) {
            const base = 50 + (step % 3) * 2;
            const wail = this.context.createOscillator();
            wail.type = 'sine';
            wail.frequency.setValueAtTime(midiToFrequency(base), now + 0.2);
            wail.frequency.exponentialRampToValueAtTime(midiToFrequency(base + 5), now + 1.1);
            wail.frequency.exponentialRampToValueAtTime(midiToFrequency(base), now + 2.6);
            const gain = this.context.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.015, now + 0.9);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
            const panner = this.context.createStereoPanner();
            panner.pan.setValueAtTime(0.4, now);
            wail.connect(gain); gain.connect(panner);
            panner.connect(this.musicOut());
            gain.connect(this.reverbInput);
            wail.start(now); wail.stop(now + 2.9);
        }
    }

    // Combat: a driving Em → C → D → Bm loop with kick, offbeat hats, stabbing
    // square chords and a sawtooth bass pulse. Escalation is a DISCRETE step:
    // tier 0 is the base kit, tier 1 adds a snare and opens the stab filter,
    // tier 2 doubles the hat and adds a low bass drone — a clear jump in
    // energy, not a continuous smear of the danger value.
    playCombatBar(now, step) {
        const tier = this.combatTier;
        const progression = [[40, 47, 52], [36, 43, 48], [38, 45, 50], [35, 42, 47]];
        const bass = [28, 24, 26, 23];
        const chord = progression[step % progression.length];
        this.musicNote({ at: now, midi: bass[step % bass.length], type: 'sawtooth', level: 0.026, attack: 0.005, decay: 0.5, filterFreq: 230, pan: 0 });
        chord.forEach((midi, voice) => this.musicNote({
            at: now, midi, type: 'square', level: 0.012 - voice * 0.002, attack: 0.006, decay: 0.42,
            filterFreq: 680 + tier * 520, pan: [-0.3, 0, 0.3][voice],
        }));
        const kick = this.context.createOscillator();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(105, now);
        kick.frequency.exponentialRampToValueAtTime(40, now + 0.13);
        const kickGain = this.context.createGain();
        // Tier 2's kick hits harder so the escalation reads as a loudness step,
        // not just a denser arrangement.
        kickGain.gain.setValueAtTime(tier >= 2 ? 0.12 : 0.085, now);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        kick.connect(kickGain); kickGain.connect(this.musicOut());
        kick.start(now); kick.stop(now + 0.18);
        // Offbeat hats; tier 2 adds a second hat halfway through the bar.
        this.musicNoise({ at: now + 0.4, duration: 0.03, filterType: 'highpass', filterFreq: 6500, level: 0.011, pan: 0.25 });
        if (tier >= 2)
            this.musicNoise({ at: now + 0.8, duration: 0.03, filterType: 'highpass', filterFreq: 7000, level: 0.009, pan: -0.3 });
        // Tier 1: offbeat snare (band-passed noise) — the clearest step up.
        if (tier >= 1)
            this.musicNoise({ at: now + 0.4, duration: 0.13, filterType: 'bandpass', filterFreq: 1900, q: 0.8, level: 0.026, pan: -0.2 });
        // Tier 2: a low sustained bass drone under the whole bar.
        if (tier >= 2)
            this.musicNote({ at: now, midi: 40, type: 'sawtooth', level: 0.012, attack: 0.02, decay: 1.1, filterFreq: 170, pan: 0 });
    }

    playMusicLayer(context) {
        if (!this.context || !this.musicGain || !this.reverbInput) return;
        const now = this.context.currentTime;
        const step = this.chordIndex;
        this.chordIndex += 1;
        switch (context) {
            case 'combat': this.playCombatBar(now, step); break;
            case 'station': this.playStationBar(now, step); break;
            case 'planet': this.playPlanetBar(now, step); break;
            case 'field': this.playFieldBar(now, step); break;
            case 'graveyard': this.playGraveyardBar(now, step); break;
            default: this.playOpenBar(now, step);
        }
    }

    playStationBell(at) {
        const carrier = this.context.createOscillator();
        const modulator = this.context.createOscillator();
        const modulation = this.context.createGain();
        const gain = this.context.createGain();
        carrier.frequency.value = midiToFrequency(79);
        modulator.frequency.value = midiToFrequency(91);
        modulation.gain.value = 180;
        modulator.connect(modulation); modulation.connect(carrier.frequency);
        carrier.connect(gain); gain.connect(this.musicOut()); gain.connect(this.reverbInput);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.013, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
        carrier.start(at); modulator.start(at); carrier.stop(at + 1.85); modulator.stop(at + 1.85);
    }

    play(effect, intensity = 1, pan = 0, distance = 0) {
        if (!this.context || !this.effectsGain || !this.reverbInput || !this.enabled || this.effectsVolume <= 0.001)
            return;
        const now = this.context.currentTime;
        const strength = clamp(intensity, 0.15, 2);
        // Every effect gets its own pan + distance lowpass so simultaneous
        // sounds do not smear into one position (the old single panner).
        const out = this.eventChain(pan, distance);
        out.connect(this.effectsGain);
        out.connect(this.reverbInput);
        const release = () => {
            try { out.disconnect(this.effectsGain); out.disconnect(this.reverbInput); } catch { /* already gone */ }
        };
        switch (effect) {
            case 'laser': this.playLaser(now, strength, out); break;
            case 'missile': this.playMissileLaunch(now, strength, out); break;
            case 'impact': this.playImpact(now, strength, out); break;
            case 'hit': this.playHit(now, strength, out); break;
            case 'explosion': this.playExplosion(now, strength, out); break;
            case 'scan': this.playTone({ at: now, frequency: 320, endFrequency: 1050, duration: 0.38, type: 'sine', level: 0.035, out }); break;
            case 'dock': this.playDockChord(out); break;
            case 'ui': this.playUiBlip(strength, out); break;
            case 'success': this.playSuccessChord(strength, out); break;
            case 'warning': this.playWarning(strength, out); break;
            case 'mining': this.playMiningHit(strength, out); break;
            case 'salvage': this.playSalvageClunk(strength, out); break;
            case 'hyperSpool': this.playHyperdriveSpool(strength, out); break;
            case 'hyperDrop': this.playHyperdriveDrop(strength, out); break;
            case 'hyperActive': this.playHyperdriveActive(out); break;
            case 'pickup': this.playPickup(strength, out); break;
            default: this.playImpact(now, strength, out); break;
        }
        // Release the chain when the effect is done (the longest tail wins).
        const releaseAt = { explosion: 1.6, dock: 1.1, missile: 0.85, scan: 0.5, hyperSpool: 2.1, hyperActive: 4.0, hyperDrop: 0.6, pickup: 0.35 }[effect] ?? 0.4;
        setTimeout(release, releaseAt * 1000 + 60);
    }

    // One spatial voice: pan → distance lowpass → gain. Returns the gain node
    // callers route into the effects bus and the reverb send.
    eventChain(pan, distance) {
        const rose = this.context.createStereoPanner();
        rose.pan.setValueAtTime(clamp(pan, -0.9, 0.9), this.context.currentTime);
        // Distance lowers both level (via strength) and high-frequency content,
        // so far events arrive muffled behind the music.
        const lowpass = this.context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = distance > 0 ? Math.max(6000, 22000 - distance * 18) : 22000;
        const gain = this.context.createGain();
        rose.connect(lowpass); lowpass.connect(gain);
        return gain;
    }

    // Distant events should not arrive at full volume. The squared falloff
    // keeps nearby combat punchy while far-away fights feel physically remote.
    playAtDirection(effect, intensity, distance, localX) {
        const range = effect === 'explosion' ? 900 : 520;
        const proximity = clamp(1 - clamp(distance, 0, range) / range, 0, 1);
        const direction = clamp(localX / Math.max(1, distance), -1, 1);
        // Distance dominates at long range; stereo separation becomes clearer
        // as the source gets closer, which matches how cockpit audio behaves.
        this.play(effect, intensity * (0.18 + proximity * proximity * 0.82), direction * (0.25 + proximity * 0.6), distance);
    }

    playNoiseBurst({ at, duration, start = 1200, end = 90, q = 0.8, level = 0.08, playbackRate = 1, out }) {
        const source = this.context.createBufferSource();
        source.buffer = this.pinkBuffer;
        source.loop = true;
        source.playbackRate.value = playbackRate;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.Q.value = q;
        filter.frequency.setValueAtTime(start, at);
        filter.frequency.exponentialRampToValueAtTime(Math.max(25, end), at + duration);
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + duration * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        source.connect(filter); filter.connect(gain);
        gain.connect(out ?? this.effectsGain);
        if (!out)
            gain.connect(this.reverbInput);
        source.start(at); source.stop(at + duration + 0.03);
    }

    playTone({ at, frequency, endFrequency, duration, type = 'sine', level = 0.05, attack = 0.006, filterFrequency = 2400, out }) {
        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        if (endFrequency !== undefined)
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFrequency, at);
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFrequency * 0.32), at + duration);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(filter); filter.connect(gain);
        gain.connect(out ?? this.effectsGain);
        if (!out)
            gain.connect(this.reverbInput);
        oscillator.start(at); oscillator.stop(at + duration + 0.02);
    }

    // Energy cannon: a sharp transient crack, a detuned twin-square zing that
    // sweeps down fast, and a low thump for weight. Reads as a punchy weapon
    // rather than a thin blip.
    playLaser(at, intensity, out) {
        this.playNoiseBurst({ at, duration: 0.035, start: 5200, end: 900, level: 0.086 * intensity, out });
        this.playTone({ at, frequency: 1500, endFrequency: 240, duration: 0.11, type: 'square', level: 0.086 * intensity, filterFrequency: 4200, out });
        this.playTone({ at, frequency: 1518, endFrequency: 252, duration: 0.1, type: 'square', level: 0.062 * intensity, filterFrequency: 3900, out });
        this.playTone({ at, frequency: 190, endFrequency: 62, duration: 0.09, type: 'sine', level: 0.16 * intensity, filterFrequency: 520, out });
    }

    // Missile: an ignition puff, a rising rumble, then a long whoosh as the
    // round accelerates away.
    playMissileLaunch(at, intensity, out) {
        this.playNoiseBurst({ at, duration: 0.07, start: 300, end: 950, level: 0.1 * intensity, playbackRate: 0.8, out });
        this.playTone({ at, frequency: 68, endFrequency: 132, duration: 0.35, type: 'sine', level: 0.2 * intensity, filterFrequency: 300, out });
        this.playNoiseBurst({ at: at + 0.05, duration: 0.7, start: 2400, end: 220, level: 0.12 * intensity, playbackRate: 0.66, out });
    }

    // Collision / hull impact: a sharp crack, a deep thud, and a short
    // metallic ring.
    playImpact(at, intensity, out) {
        this.playNoiseBurst({ at, duration: 0.04, start: 3800, end: 700, level: 0.12 * intensity, out });
        this.playTone({ at, frequency: 200, endFrequency: 52, duration: 0.2, type: 'triangle', level: 0.26 * intensity, filterFrequency: 700, out });
        this.playTone({ at: at + 0.005, frequency: 780, endFrequency: 300, duration: 0.22, type: 'square', level: 0.07 * intensity, filterFrequency: 2200, out });
    }

    // Hull damage: a sharper clang with an alarm edge so incoming damage reads
    // instantly from nearby impacts.
    playHit(at, intensity, out) {
        this.playNoiseBurst({ at, duration: 0.05, start: 4200, end: 600, level: 0.12 * intensity, out });
        this.playTone({ at, frequency: 340, endFrequency: 90, duration: 0.22, type: 'triangle', level: 0.22 * intensity, filterFrequency: 900, out });
        this.playTone({ at: at + 0.01, frequency: 900, endFrequency: 520, duration: 0.18, type: 'square', level: 0.07 * intensity, filterFrequency: 2600, out });
    }

    playMiningHit(intensity, out) {
        const now = this.context.currentTime;
        // A heavy thud with a bright rock-chip ping on top.
        this.playTone({ at: now, frequency: 260, endFrequency: 120, duration: 0.11, type: 'triangle', level: 0.05 * intensity, filterFrequency: 1500, out });
        this.playTone({ at: now, frequency: 1250, endFrequency: 980, duration: 0.12, type: 'sine', level: 0.022 * intensity, filterFrequency: 3200, out });
        this.playNoiseBurst({ at: now, duration: 0.09, start: 3800, end: 500, level: 0.04 * intensity, out });
    }

    playSalvageClunk(intensity, out) {
        const now = this.context.currentTime;
        // A hollow metal clunk followed by a short scrape.
        this.playTone({ at: now, frequency: 96, endFrequency: 46, duration: 0.16, type: 'square', level: 0.055 * intensity, filterFrequency: 420, out });
        this.playNoiseBurst({ at: now + 0.02, duration: 0.11, start: 1000, end: 140, level: 0.035 * intensity, out });
        this.playNoiseBurst({ at: now + 0.09, duration: 0.07, start: 700, end: 220, level: 0.02 * intensity, playbackRate: 0.8, out });
    }

    // Hyperdrive: a rising whine + engine-intensify as the drive charges.
    playHyperdriveSpool(intensity = 1, out) {
        const now = this.context.currentTime;
        const dur = 2.0;
        this.playTone({ at: now, frequency: 220, endFrequency: 880, duration: dur, type: 'sawtooth', level: 0.016 * intensity, filterFrequency: 1600, out });
        this.playTone({ at: now, frequency: 440, endFrequency: 1760, duration: dur, type: 'sine', level: 0.008 * intensity, filterFrequency: 2200, out });
        // Airy rising noise underneath — the drive winding up.
        this.playNoiseBurst({ at: now, duration: dur, start: 500, end: 2400, level: 0.012 * intensity, playbackRate: 0.8, out });
    }

    // Drive drop/arrival: a downward swoosh + thump as the bubble collapses.
    playHyperdriveDrop(intensity = 1, out) {
        const now = this.context.currentTime;
        this.playTone({ at: now, frequency: 1800, endFrequency: 120, duration: 0.5, type: 'sine', level: 0.05 * intensity, filterFrequency: 2400, out });
        this.playNoiseBurst({ at: now, duration: 0.4, start: 3200, end: 150, level: 0.06 * intensity, playbackRate: 0.75, out });
        this.playTone({ at: now + 0.02, frequency: 90, endFrequency: 32, duration: 0.5, type: 'triangle', level: 0.08 * intensity, filterFrequency: 420, out });
    }

    // While cruising in the drive, a slow undulating "space wind" bed.
    playHyperdriveActive(out) {
        const now = this.context.currentTime;
        this.playNoiseBurst({ at: now, duration: 2.6, start: 900, end: 1800, level: 0.018, playbackRate: 0.6, out });
        this.playNoiseBurst({ at: now + 1.3, duration: 2.6, start: 1400, end: 700, level: 0.014, playbackRate: 0.45, out });
    }

    // A bright rising chime for tractored cargo / ore / loot.
    playPickup(intensity = 1, out) {
        const now = this.context.currentTime;
        [880, 1108, 1318].forEach((freq, index) => this.playTone({
            at: now + index * 0.045,
            frequency: freq, endFrequency: freq * 1.5,
            duration: 0.2,
            type: 'sine', level: 0.03 * intensity,
            filterFrequency: 3200,
            out,
        }));
    }

    playWarning(intensity, out) {
        const now = this.context.currentTime;
        // Three descending insistent beeps so warnings read as urgent.
        this.playTone({ at: now, frequency: 660, duration: 0.1, type: 'triangle', level: 0.07 * intensity, filterFrequency: 1800, out });
        this.playTone({ at: now + 0.13, frequency: 505, duration: 0.12, type: 'triangle', level: 0.062 * intensity, filterFrequency: 1500, out });
        this.playTone({ at: now + 0.27, frequency: 610, duration: 0.14, type: 'triangle', level: 0.056 * intensity, filterFrequency: 1700, out });
    }

    playSuccessChord(intensity, out) {
        const now = this.context.currentTime;
        [64, 69, 73].forEach((midi, index) => this.playTone({
            at: now + index * 0.035,
            frequency: midiToFrequency(midi),
            duration: 0.34,
            type: 'triangle',
            level: 0.03 * intensity,
            filterFrequency: 2600,
            out,
        }));
    }

    playDockChord(out) {
        const now = this.context.currentTime;
        [45, 57, 61, 66].forEach((midi, index) => this.playTone({
            at: now + index * 0.07,
            frequency: midiToFrequency(midi),
            duration: 0.75,
            type: 'triangle',
            level: 0.022,
            filterFrequency: 1300,
            out,
        }));
        this.playNoiseBurst({ at: now, duration: 0.5, start: 420, end: 70, level: 0.016, out });
    }

    playUiBlip(intensity, out) {
        this.playTone({
            at: this.context.currentTime,
            frequency: 510,
            endFrequency: 690,
            duration: 0.055,
            type: 'triangle',
            level: 0.025 * intensity,
            filterFrequency: 2800,
            out,
        });
    }

    // Layered blast: a sharp shockwave transient, a deep sub thump, a sawtooth
    // body rumble, a long airy blast, and a bright debris crackle tail.
    playExplosion(at, intensity, out) {
        const size = clamp(intensity, 0.4, 2);
        this.playNoiseBurst({ at, duration: 0.05, start: 5200, end: 700, level: 0.09 * size, playbackRate: 0.9, out });
        this.playTone({ at, frequency: 68 / Math.sqrt(size), endFrequency: 16, duration: 0.9 * size, type: 'sine', level: 0.14 * size, filterFrequency: 300, out });
        this.playTone({ at: at + 0.01, frequency: 150, endFrequency: 30, duration: 0.5 * size, type: 'sawtooth', level: 0.07 * size, filterFrequency: 420, out });
        this.playNoiseBurst({ at, duration: 0.7 * size, start: 2400, end: 60, level: 0.11 * size, playbackRate: 0.6, out });
        this.playNoiseBurst({ at: at + 0.08, duration: 1.3 * size, start: 3200, end: 900, level: 0.045 * size, playbackRate: 1.3, out });
    }

    playComms(temperament = 'steady') {
        if (!this.context || !this.enabled || !this.effectsGain || this.effectsVolume <= 0.001)
            return;
        const pairs = { timid: [1480, 1170], aggressive: [1090, 1560], flamboyant: [1560, 1980], steady: [1310, 1430] };
        const [first, second] = pairs[temperament] ?? pairs.steady;
        const now = this.context.currentTime;
        this.playTone({ at: now, frequency: first, duration: 0.065, type: 'sine', level: 0.023, filterFrequency: first });
        this.playTone({ at: now + 0.1, frequency: second, duration: 0.075, type: 'sine', level: 0.023, filterFrequency: second });
    }
}