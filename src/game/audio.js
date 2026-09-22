import { playIndustrial, warmIndustrial, INDUSTRIAL_DURATIONS, playWorkSample, updateSampleEngines, stopSampleLoops } from './sampleSfx.js';
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
    effectsReverbGain;
    musicGain;
    musicReverbGain;
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
    // The current context's voice bus: every scheduled music voice connects
    // here, and a context change swaps it (fading the old one out, then
    // disconnecting it) so the previous theme's long-decay tails and drones
    // cannot bleed into the new one.
    musicBus;
    // Discrete combat escalation tier (0/1/2) with hysteresis, so the drums
    // step up as hostiles pile in instead of smearing with the danger decay.
    combatTier = 0;
    // Session-seeded RNG for music variation. Deterministic per session so
    // the same seed always produces the same phrase sequence — no repeats
    // from Math.random() reshuffling every reload.
    musicRngState = 1;
    // 8-bar phrase dynamics: bars 0-3 build, 4-7 relax. Each context's bar
    // player reads this to scale note levels so the music breathes.
    barIntensity = 0.75;
    musicRng() {
        // xorshift32 — fast, no allocation, deterministic.
        let x = this.musicRngState;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.musicRngState = x >>> 0;
        return this.musicRngState / 4294967296;
    }
    musicPick(array) { return array[Math.floor(this.musicRng() * array.length)]; }
    musicChance(p) { return this.musicRng() < p; }
    musicRange(lo, hi) { return lo + this.musicRng() * (hi - lo); }

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
        this.effectsReverbGain = this.context.createGain();
        this.effectsReverbGain.gain.value = this.effectsVolume;
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicReverbGain = this.context.createGain();
        this.musicReverbGain.gain.value = this.musicVolume;
        this.crossfadeGain = this.context.createGain();
        this.crossfadeGain.gain.value = 1;
        this.musicBus = this.context.createGain();
        this.musicBus.gain.value = 1;
        this.musicBus.connect(this.musicGain);
        this.effectsGain.connect(this.compressor);
        this.musicGain.connect(this.crossfadeGain);
        this.crossfadeGain.connect(this.compressor);
        this.compressor.connect(this.limiter);
        this.limiter.connect(this.master);
        this.master.connect(this.context.destination);

        const convolver = this.context.createConvolver();
        convolver.buffer = this.createImpulseResponse(2.35, 2.7);
        this.reverbInput = this.context.createGain();
        this.effectsReverbGain.connect(this.reverbInput);
        this.musicReverbGain.connect(this.reverbInput);
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
        // Seed the music RNG from the current time so each session gets a
        // different but deterministic phrase sequence.
        this.musicRngState = (Date.now() & 0x7fffffff) || 1;
        this.enabled = true;
        this.samplesReady = warmIndustrial(this);
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
        this.engineGain.connect(this.effectsReverbGain);

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
        this.musicReverbGain?.gain.setTargetAtTime(this.musicVolume, now, 0.04);
        this.effectsGain?.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
        this.effectsReverbGain?.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
    }

    setStationMode(station) {
        this.stationMode = station;
        if (!this.context)
            return;
        // State changes can happen between frame updates (landing, quitting,
        // or replacing a session). Silence continuous flight layers here too.
        if (station) {
            stopSampleLoops(this);
            const now = this.context.currentTime;
            this.engineGain?.gain.cancelScheduledValues(now);
            this.engineGain?.gain.setTargetAtTime(0, now, 0.035);
            this.engineWashGain?.gain.cancelScheduledValues(now);
            this.engineWashGain?.gain.setTargetAtTime(0, now, 0.035);
            this.engineTargets?.delete(this.engineGain?.gain);
            this.engineTargets?.delete(this.engineWashGain?.gain);
        }
    }

    dispose() {
        if (!this.context)
            return;
        const context = this.context;
        const now = context.currentTime;
        this.stopDrones();
        stopSampleLoops(this);
        this.sampleEngines = undefined;
        for(const release of this.effectReleases ?? []) release();
        this.effectTimes?.clear();
        this.master?.gain.cancelScheduledValues(now);
        this.master?.gain.setTargetAtTime(0, now, 0.02);
        this.enabled = false;
        // Closing stops the always-running engine, wash and station sources.
        // Previously every arena/title/session switch left one graph alive.
        setTimeout(() => void context.close().catch(() => {}), 80);
        this.context = undefined;
    }

    update(dt, throttle, afterburner, damage = 0, nearbyEnemies = 0, musicContext) {
        if (!this.context || !this.enabled)
            return;
        if (musicContext)
            this.musicContext = musicContext;
        const now = this.context.currentTime;
        const thrust = this.stationMode ? 0 : throttle;
        const burn = this.stationMode ? 0 : (afterburner ? 1 : 0);
        const sampledEngines = updateSampleEngines(this, thrust, burn);
        const engineBase = sampledEngines || this.stationMode ? 0 : 0.04 + thrust * 0.06 + burn * 0.05;
        this.setEngineTarget(this.engineGain?.gain, engineBase, now, 0.11);
        const pitch = 41 + thrust * 30 + burn * 25 + damage * 7;
        this.setEngineTarget(this.engineOscA?.frequency, pitch, now, 0.1);
        this.setEngineTarget(this.engineOscB?.frequency, pitch * 1.047, now, 0.1);
        this.setEngineTarget(this.engineSub?.frequency, pitch * 0.49, now, 0.12);
        this.setEngineTarget(this.engineFilter?.frequency, 190 + thrust * 330 + burn * 480, now, 0.1);
        const wash = sampledEngines || this.stationMode ? 0 : 0.008 + thrust * 0.038 + burn * 0.028;
        this.setEngineTarget(this.engineWashGain?.gain, wash, now, 0.12);
        this.setEngineTarget(this.engineWashFilter?.frequency, 300 + thrust * 430 + burn * 680, now, 0.12);
        this.setEngineTarget(this.stationGain?.gain, (this.stationMode ? 0.018 : 0) * this.effectsVolume, now, 0.35);

        if (nearbyEnemies > 0)
            this.dangerLevel = Math.min(1, 0.45 + nearbyEnemies * 0.15);
        else
            this.dangerLevel = Math.max(0, this.dangerLevel - dt * 0.18);
        // Combat overrides the location ambience while hostiles are close;
        // station mode wins over both (you are safe on the pad).
        const context = this.stationMode ? 'station' : (this.dangerLevel > 0.2 ? 'combat' : this.musicContext);
        if (context !== this.currentContext) {
            this.currentContext = context;
            this.swapMusicBus();
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
    setEngineTarget(parameter, value, now, smoothing) {
        if (!parameter) return;
        this.engineTargets ??= new WeakMap();
        if (this.engineTargets.get(parameter) === value) return;
        this.engineTargets.set(parameter, value);
        parameter.setTargetAtTime(value, now, smoothing);
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

    // Where every music voice lands: the current context's voice bus, then
    // the crossfade, then the compressor. Keeps drones, bells and drum
    // transients inside the same group so a context change can cut them all.
    musicOut() {
        return this.musicBus;
    }

    // Replaces the voice bus on a context change so the previous theme's
    // scheduled voices (bars with multi-second decays, drones) are silenced
    // instead of bleeding into the new one. The old bus fades out over a beat
    // then disconnects, which kills every one-shot already connected to it;
    // the new bus carries the next theme. The crossfade dip then smooths the
    // transition (see crossfadeContext).
    swapMusicBus() {
        const now = this.context.currentTime;
        const oldBus = this.musicBus;
        const newBus = this.context.createGain();
        newBus.gain.value = 1;
        newBus.connect(this.musicGain);
        this.musicBus = newBus;
        if (oldBus) {
            oldBus.gain.setValueAtTime(Math.max(oldBus.gain.value, 0.0001), now);
            oldBus.gain.linearRampToValueAtTime(0.0001, now + 0.12);
            // Cut the old group after its fade completes so its tails die.
            setTimeout(() => {
                try { oldBus.disconnect(this.musicGain); } catch { /* already gone */ }
            }, 140);
        }
    }

    // Dips the music bus on a context change so the switch reads as a smooth
    // transition rather than an abrupt cut. The old theme's voices are already
    // gone (swapMusicBus disconnected them), so this is a light dip — deep
    // enough to mask the swap, shallow enough not to blunt the new theme's
    // first notes.
    crossfadeContext() {
        const now = this.context.currentTime;
        const g = this.crossfadeGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(Math.max(g.value, 0.0001), now);
        g.linearRampToValueAtTime(0.4, now + 0.05);
        g.linearRampToValueAtTime(1, now + 0.4);
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
        gain.connect(this.musicReverbGain);
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
            gain.connect(this.musicReverbGain);
        source.start(at); source.stop(at + duration + 0.05);
    }

    // Deep space: wide, sparse and deep — a low root, a slow triangle pad
    // breathing in staggered, and the rare high sparkle. The quietest, emptiest
    // bed: low register, huge reverb, voices spread across the stereo field.
    // 8-chord progression with randomized sparkle and occasional bar drops
    // (skip a voice) so the space never loops identically.
    playOpenBar(now, step) {
        const di = this.barIntensity;
        const progression = [
            [45, 52, 57, 64], [41, 48, 53, 60], [43, 50, 55, 62], [43, 47, 50, 55],
            [40, 47, 52, 59], [45, 50, 55, 60], [41, 45, 50, 57], [43, 48, 53, 58],
        ];
        const chord = progression[step % progression.length];
        const isLong = step % 4 === 0;
        // Vary the root level slightly per bar for a breathing feel.
        const rootLevel = this.musicRange(0.082, 0.108) * di;
        this.musicNote({ at: now, midi: chord[0] - 12, type: 'sine', level: rootLevel, attack: 1.8, decay: isLong ? 5.6 : 5.0, filterFreq: 500, pan: -0.25 });
        // Occasionally drop a voice for textural variation.
        chord.forEach((midi, voice) => {
            if (voice > 0 && this.musicChance(0.15))
                return;
            this.musicNote({
                at: now + 0.6 + voice * 0.25, midi, type: voice === 0 ? 'sine' : 'triangle',
                level: (voice === 0 ? 0.055 : this.musicRange(0.028, 0.04)) * di,
                attack: 1.7, decay: 4.6, filterFreq: 850,
                pan: [-0.4, 0.1, 0.4, -0.15][voice],
            });
        });
        // Sparkle: random high note from the chord scale, not a fixed cycle.
        if (this.musicChance(0.5)) {
            const sparklePool = [69, 72, 76, 79, 81, 84, 88];
            const sparkle = this.musicPick(sparklePool);
            this.musicNote({ at: now + this.musicRange(1.0, 2.2), midi: sparkle, type: 'sine', level: this.musicRange(0.018, 0.03) * di, attack: 0.35, decay: this.musicRange(2.8, 4.2), pan: this.musicRange(-0.45, 0.45) });
        }
    }

    // Docked: bright mid-register arpeggios over a walking bass, a shaker tick
    // and the station bell. The busiest, warmest bed — a bustling safe haven.
    // 8-chord progression with 3 alternating arp patterns and randomized
    // shaker/bell placement so the dock never loops identically.
    playStationBar(now, step) {
        const progression = [
            [48, 52, 55], [47, 50, 55], [45, 48, 52], [41, 45, 48],
            [43, 47, 50], [46, 49, 53], [44, 48, 51], [41, 44, 48],
        ];
        const bass = [36, 35, 33, 29, 31, 34, 32, 29];
        const chord = progression[step % progression.length];
        // Three arp shapes rotate and shuffle.
        const arpShapes = [
            [chord[0], chord[2], chord[0] + 12, chord[1]],
            [chord[0] + 12, chord[2], chord[1], chord[0]],
            [chord[0], chord[1], chord[2], chord[0] + 12],
        ];
        const arp = arpShapes[step % arpShapes.length];
        const arpLevel = this.musicRange(0.038, 0.052);
        // A warm rolling arpeggio, not percussive plucks: slow attack, low
        // filter, capped register — anything with a fast attack up here read
        // as a "ding" no matter how quiet.
        arp.forEach((midi, i) => this.musicNote({
            at: now + i * 0.32, midi: Math.min(midi, 57), type: 'triangle', level: arpLevel,
            attack: this.musicRange(0.25, 0.4), decay: this.musicRange(1.2, 1.6), filterFreq: 850, pan: [-0.4, 0, 0.4, -0.2][i],
        }));
        const b = bass[step % bass.length];
        this.musicNote({ at: now, midi: b, type: 'sine', level: this.musicRange(0.07, 0.095), attack: 0.1, decay: 1.9, pan: -0.15 });
        if (this.musicChance(0.7))
            this.musicNote({ at: now + 1.1, midi: b + 7, type: 'sine', level: 0.04, attack: 0.1, decay: 0.8, pan: 0.15 });
        this.musicNoise({ at: now + this.musicRange(0.9, 1.3), duration: 0.05, filterType: 'highpass', filterFreq: 5200, level: 0.016, pan: 0.2 });
    }

    // Planets: a low drone with warm, sparse pentatonic plucks — each note
    // placed wide in the stereo field like wind over rock. Mid-low register,
    // gentle attack; distinct from open space's big pads and the station's
    // busy arpeggios.
    // Randomized note selection from a 7-note scale with varied note counts
    // per bar (3-6 notes) so the wind never repeats the same phrase. The
    // plucks stay in the low-mid register with a slow attack and warm filter:
    // an earlier version hit the D4/E4 range with a near-instant attack and
    // short decay, so every bar rang a bright repetitive "ding".
    playPlanetBar(now, step) {
        const scale = [38, 41, 43, 45, 46, 48, 50]; // D3 F3 G3 A3 Bb3 C4 D4
        const noteCount = 3 + Math.floor(this.musicRng() * 4); // 3-6 notes
        const pans = [-0.5, 0.2, 0.5, -0.3, 0.1, 0.35, -0.15];
        for (let i = 0; i < noteCount; i += 1) {
            let midi = scale[Math.floor(this.musicRng() * scale.length)];
            // Rare, capped octave shimmer — never above G4 so the wind never
            // spikes into a bell-like ring.
            if (this.musicChance(0.08))
                midi = Math.min(midi + 12, 55);
            this.musicNote({
                at: now + i * this.musicRange(0.4, 0.6),
                midi, type: 'triangle', level: this.musicRange(0.028, 0.042),
                attack: this.musicRange(0.25, 0.45), decay: this.musicRange(1.5, 2.2), filterFreq: 900,
                pan: pans[i % pans.length],
            });
        }
        // Root drone on odd bars; noise swell randomized.
        if (step % 2 === 0 || this.musicChance(0.25)) {
            const roots = [33, 38, 36];
            this.musicNote({ at: now, midi: this.musicPick(roots), type: 'sine', level: this.musicRange(0.06, 0.09), attack: 1.2, decay: 3.4, filterFreq: 300, pan: -0.2 });
            this.musicNoise({ at: now, duration: this.musicRange(1.6, 2.4), filterType: 'lowpass', filterFreq: 300, level: this.musicRange(0.018, 0.028), pan: 0.2 });
        }
    }

    // The Shardbelt: high-register metallic semitone clusters over a low E
    // sawtooth pulse with a ringing tick. The most nervous, brightest bed —
    // unmistakable against the warm planet plucks and the graveyard's slow
    // lament.
    // Randomized cluster pairs from a wider pool, occasional triple-tick,
    // and varied tick placement so the metallic chatter never repeats.
    playFieldBar(now, step) {
        const clusters = [[64, 66], [65, 63], [64, 66], [62, 65], [66, 68], [63, 65], [62, 64], [65, 67]];
        const pair = clusters[step % clusters.length];
        // Occasionally add a third note to the cluster for tension spikes.
        const notes = this.musicChance(0.25) ? [pair[0], pair[1], pair[0] + 1] : pair;
        notes.forEach((midi, i) => this.musicNote({
            at: now + i * 0.16, midi, type: 'square', level: this.musicRange(0.028, 0.04), attack: 0.008, decay: this.musicRange(0.2, 0.4),
            filterFreq: 2100, pan: i === 0 ? -0.35 : i === 1 ? 0.35 : 0.1,
        }));
        // Bass pulse — occasionally drop to let the clusters breathe.
        if (this.musicChance(0.8))
            this.musicNote({ at: now, midi: this.musicChance(0.3) ? 38 : 40, type: 'sawtooth', level: this.musicRange(0.038, 0.054), attack: 0.008, decay: this.musicRange(0.3, 0.5), filterFreq: 240, pan: 0 });
        // Ringing tick — random placement and occasionally double.
        this.musicNoise({ at: now + this.musicRange(0.5, 0.85), duration: 0.05, filterType: 'bandpass', filterFreq: this.musicRange(2200, 3000), q: 6, level: this.musicRange(0.04, 0.06), reverb: true, pan: 0.3 });
        if (this.musicChance(0.3))
            this.musicNoise({ at: now + this.musicRange(0.2, 0.4), duration: 0.04, filterType: 'bandpass', filterFreq: 3000, q: 5, level: 0.035, reverb: true, pan: -0.25 });
    }

    // The graveyard: slow mid-low lamenting chords and a distant wailing bend
    // that swells and falls. The sparsest, emptiest register — a hollow dirge
    // that reads instantly against the belt's nervous high clusters.
    // 8-chord progression with randomized wail pitch, pan, and timing so the
    // lament never repeats identically.
    playGraveyardBar(now, step) {
        const progression = [
            [50, 53, 57], [46, 50, 53], [41, 45, 48], [43, 48, 52],
            [48, 52, 55], [46, 50, 53], [41, 44, 48], [43, 47, 50],
        ];
        const chord = progression[step % progression.length];
        chord.forEach((midi, voice) => this.musicNote({
            at: now, midi, type: 'sine', level: voice === 0 ? this.musicRange(0.038, 0.048) : this.musicRange(0.018, 0.026),
            attack: 1.9, decay: this.musicRange(4.5, 5.6), pan: [-0.3, 0.15, 0.3][voice],
        }));
        // Wail: randomized pitch base, pan, and timing within the bar.
        if (this.musicChance(0.55)) {
            const base = this.musicPick([46, 48, 50, 52]);
            const bend = this.musicRange(3, 7);
            const wail = this.context.createOscillator();
            wail.type = 'sine';
            wail.frequency.setValueAtTime(midiToFrequency(base), now + 0.2);
            wail.frequency.exponentialRampToValueAtTime(midiToFrequency(base + bend), now + this.musicRange(0.8, 1.4));
            wail.frequency.exponentialRampToValueAtTime(midiToFrequency(base), now + this.musicRange(2.2, 3.0));
            const gain = this.context.createGain();
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(this.musicRange(0.012, 0.018), now + this.musicRange(0.7, 1.1));
            gain.gain.exponentialRampToValueAtTime(0.0001, now + this.musicRange(2.4, 3.2));
            const panner = this.context.createStereoPanner();
            panner.pan.setValueAtTime(this.musicRange(-0.5, 0.5), now);
            wail.connect(gain); gain.connect(panner);
            panner.connect(this.musicOut());
            gain.connect(this.musicReverbGain);
            wail.start(now); wail.stop(now + 3.3);
        }
    }

    // Combat: a driving 8-chord progression over a relentless percussion kit
    // — kick on the downbeat, snare on the backbeat, 8th-note hats, with
    // stabbing square chords and a sawtooth bass pulse. BSG-style: the drums
    // carry the tension, and escalation is a DISCRETE step — tier 1 adds
    // rolling toms and opens the stab filter, tier 2 doubles the kick into a
    // gallop and adds a low bass drone — never a smear of the danger value.
    // Randomized hat fills and occasional stab drops keep the combat loop
    // from repeating identically.
    playCombatBar(now, step) {
        const tier = this.combatTier;
        const di = this.barIntensity;
        const progression = [
            [40, 47, 52], [36, 43, 48], [38, 45, 50], [35, 42, 47],
            [40, 47, 52], [38, 45, 50], [33, 40, 45], [36, 43, 48],
        ];
        const bass = [28, 24, 26, 23, 28, 26, 21, 24];
        const chord = progression[step % progression.length];
        this.musicNote({ at: now, midi: bass[step % bass.length], type: 'sawtooth', level: [0.024, 0.029, 0.034][tier] * di, attack: 0.005, decay: 0.5, filterFreq: 230, pan: 0 });
        chord.forEach((midi, voice) => {
            // Occasionally drop a stab voice for textural variation.
            if (voice > 0 && this.musicChance(0.12))
                return;
            this.musicNote({
                at: now, midi, type: 'square', level: (0.012 - voice * 0.002) * di, attack: 0.006, decay: 0.42,
                filterFreq: 680 + tier * 520, pan: [-0.3, 0, 0.3][voice],
            });
        });
        // Kick on the downbeat; tier 2 doubles it into a galloping 8th so the
        // escalation reads as a loudness step, not just a denser arrangement.
        const kick = this.context.createOscillator();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(105, now);
        kick.frequency.exponentialRampToValueAtTime(40, now + 0.13);
        const kickGain = this.context.createGain();
        // The kick itself scales with the tier so escalation reads as a clean
        // loudness step, not just a denser arrangement.
        kickGain.gain.setValueAtTime([0.07, 0.085, 0.11][tier] * di, now);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        kick.connect(kickGain); kickGain.connect(this.musicOut());
        kick.start(now); kick.stop(now + 0.18);
        if (tier >= 2) {
            const gallop = this.context.createOscillator();
            gallop.type = 'sine';
            gallop.frequency.setValueAtTime(96, now + 0.4);
            gallop.frequency.exponentialRampToValueAtTime(40, now + 0.53);
            const gallopGain = this.context.createGain();
            gallopGain.gain.setValueAtTime(0.07, now + 0.4);
            gallopGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
            gallop.connect(gallopGain); gallopGain.connect(this.musicOut());
            gallop.start(now + 0.4); gallop.stop(now + 0.58);
        }
        // Snare on the backbeat — the constant drum anchor, hits harder as the
        // tier climbs.
        this.musicNoise({ at: now + 0.4, duration: 0.13, filterType: 'bandpass', filterFreq: 1900, q: 0.8, level: tier >= 1 ? 0.032 : 0.022, pan: -0.2 });
        // 8th-note hats keep the pulse relentless. Randomized fills on the
        // off-beat add variation so the combat loop never repeats identically.
        this.musicNoise({ at: now + 0.2, duration: 0.03, filterType: 'highpass', filterFreq: 6500, level: 0.012, pan: 0.25 });
        this.musicNoise({ at: now + 0.6, duration: 0.03, filterType: 'highpass', filterFreq: 6500, level: 0.012, pan: -0.3 });
        if (this.musicChance(0.35))
            this.musicNoise({ at: now + this.musicRange(0.3, 0.5), duration: 0.025, filterType: 'highpass', filterFreq: 7000, level: 0.009, pan: this.musicRange(-0.3, 0.3) });
        if (tier >= 1 && this.musicChance(0.25))
            this.musicNoise({ at: now + this.musicRange(0.5, 0.75), duration: 0.025, filterType: 'highpass', filterFreq: 7500, level: 0.011, pan: this.musicRange(-0.3, 0.3) });
        // Tier 1: rolling low toms on the 8ths — the clearest step up.
        if (tier >= 1) {
            this.musicNote({ at: now + 0.2, midi: 45, type: 'sine', level: 0.028, attack: 0.004, decay: 0.12, filterFreq: 900, pan: 0.2 });
            this.musicNote({ at: now + 0.6, midi: 48, type: 'sine', level: 0.028, attack: 0.004, decay: 0.12, filterFreq: 900, pan: -0.25 });
        }
        // Tier 2: a low sustained bass drone under the whole bar.
        if (tier >= 2)
            this.musicNote({ at: now, midi: 40, type: 'sawtooth', level: 0.012, attack: 0.02, decay: 1.1, filterFreq: 170, pan: 0 });
    }

    playMusicLayer(context) {
        if (!this.context || !this.musicGain || !this.reverbInput) return;
        const now = this.context.currentTime;
        const step = this.chordIndex;
        this.chordIndex += 1;
        // 8-bar phrase dynamics: build for 4 bars, relax for 4.
        const phraseStep = step % 8;
        this.barIntensity = phraseStep < 4
            ? 0.65 + phraseStep * 0.12  // 0.65 → 1.01
            : 1.01 - (phraseStep - 3) * 0.12; // 1.01 → 0.41
        switch (context) {
            case 'combat': this.playCombatBar(now, step); break;
            case 'station': this.playStationBar(now, step); break;
            case 'planet': this.playPlanetBar(now, step); break;
            case 'field': this.playFieldBar(now, step); break;
            case 'graveyard': this.playGraveyardBar(now, step); break;
            default: this.playOpenBar(now, step);
        }
    }

    play(effect, intensity = 1, pan = 0, distance = 0) {
        if (!this.context || !this.effectsGain || !this.reverbInput || !this.enabled || this.effectsVolume <= 0.001)
            return;
        const now = this.context.currentTime;
        if (['repair','mining'].includes(effect) && Number.isFinite(intensity) && intensity > 0) {
            playWorkSample(this,effect,intensity,Number.isFinite(pan)?pan:0,Number.isFinite(distance)?distance:0);return;
        }
        if (!Number.isFinite(intensity) || intensity <= 0) return;
        pan = Number.isFinite(pan) ? pan : 0;
        distance = Number.isFinite(distance) ? Math.max(0,distance) : 0;
        this.effectTimes ??= new Map();
        const spacing = {salvage:1.65,hyperActive:3.6,warning:.65,ui:.035,hit:.065,shield:.065,impact:.035,rock:.035,pdc:.035}[effect] ?? 0;
        if (now-(this.effectTimes.get(effect) ?? -Infinity)<spacing) return;
        this.effectTimes.set(effect,now);
        const strength = clamp(intensity, 0.001, 2);
        // Every effect gets its own pan + distance lowpass so simultaneous
        // sounds do not smear into one position (the old single panner).
        const chain = this.eventChain(pan, distance);
        const out = chain.input;
        out.pitchRatio = ['laser','gauss','pdc','ripper','ion','mortar','impact','hit','rock','mining','repair'].includes(effect) ? .97+Math.random()*.06 : 1;
        chain.output.connect(this.effectsGain);
        const wet = this.context.createGain();
        wet.gain.value = {pdc:.06,laser:.12,ripper:.12,ui:0,warning:.04,hit:.08,shield:.12,repair:.06,mining:.08}[effect] ?? .25;
        chain.output.connect(wet);wet.connect(this.effectsReverbGain);
        this.effectReleases ??= new Set();
        const release = () => {
            clearTimeout(timer);
            chain.input.disconnect();chain.filter.disconnect();chain.output.disconnect();wet.disconnect();
            this.effectReleases.delete(release);
        };
        switch (effect) {
            case 'beam': this.playBeam(now,strength,out); break;
            case 'shield': this.playShieldHit(now,strength,out); break;
            case 'capitalExplosion': this.playCapitalExplosion(now,strength,out); break;
            case 'laser': this.playLaser(now, strength, out); break;
            case 'gauss': this.playGauss(now, strength, out); break;
            case 'pdc': this.playPdc(now, strength, out); break;
            case 'ripper': this.playRipper(now, strength, out); break;
            case 'ion': this.playIon(now, strength, out); break;
            case 'mortar': this.playMortar(now, strength, out); break;
            case 'missile': this.playMissileLaunch(now, strength, out); break;
            case 'impact': this.playImpact(now, strength, out); break;
            case 'rock': this.playRockImpact(now, strength, out); break;
            case 'hit': this.playHit(now, strength, out); break;
            case 'explosion': this.playExplosion(now, strength, out); break;
            case 'scan': playIndustrial(this,'scan',now,strength,out); break;
            case 'dock': this.playDockChord(out); break;
            case 'ui': this.playUiBlip(strength, out); break;
            case 'success': this.playSuccessChord(strength, out); break;
            case 'warning': this.playWarning(strength, out); break;
            case 'repair': this.playRepairWeld(now, strength, out); break;
            case 'mining': this.playMiningHit(strength, out); break;
            case 'salvage': this.playSalvageClunk(strength, out); break;
            case 'hyperSpool': this.playHyperdriveSpool(strength, out); break;
            case 'hyperDrop': this.playHyperdriveDrop(strength, out); break;
            case 'hyperActive': this.playHyperdriveActive(out); break;
            case 'slipstream': this.playSlipstream(strength, out); break;
            case 'pickup': this.playPickup(strength, out); break;
            default: this.playImpact(now, strength, out); break;
        }
        // Release the chain when the effect is done (the longest tail wins).
        const releaseAt = (INDUSTRIAL_DURATIONS[effect] ?? .5) / .97 + .12;
        const timer = setTimeout(release, releaseAt * 1000 + 60);
        this.effectReleases.add(release);
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
        lowpass.frequency.value = distance > 0 ? Math.max(1400, 18000 / (1 + distance / 100)) : 22000;
        const gain = this.context.createGain();
        rose.connect(lowpass); lowpass.connect(gain);
        return {input:rose,filter:lowpass,output:gain};
    }

    // Distant events should not arrive at full volume. The squared falloff
    // keeps nearby combat punchy while far-away fights feel physically remote.
    playAtDirection(effect, intensity, distance, localX) {
        const range = effect === 'capitalExplosion' ? 1800 : effect === 'explosion' ? 900 : 520;
        // Web audio THROWS on non-finite AudioParam values, and a throw inside
        // updateProjectiles would take the sim loop down with it — a NaN that
        // slips out of a sim edge case must stay a silent non-event.
        if (!Number.isFinite(distance))
            distance = range;
        if (!Number.isFinite(localX))
            localX = 0;
        if (!Number.isFinite(intensity))
            intensity = 0.4;
        if(distance >= range) return;
        const proximity = clamp(1 - clamp(distance, 0, range) / range, 0, 1);
        const direction = clamp(localX / Math.max(1, distance), -1, 1);
        // Distance dominates at long range; stereo separation becomes clearer
        // as the source gets closer, which matches how cockpit audio behaves.
        this.play(effect, intensity * proximity * proximity, direction * (0.25 + proximity * 0.6), distance);
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
            gain.connect(this.effectsReverbGain);
        source.start(at, Math.random()*Math.max(.01,this.pinkBuffer.duration-.01)); source.stop(at + duration + 0.03);
    }

    playTone({ at, frequency, endFrequency, duration, type = 'sine', level = 0.05, attack = 0.006, filterFrequency = 2400, hold = 0, out }) {
        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        oscillator.type = type;
        const pitch = out?.pitchRatio ?? 1;
        oscillator.frequency.setValueAtTime(frequency*pitch, at);
        if (endFrequency !== undefined)
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency*pitch), at + duration);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFrequency, at);
        filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFrequency * 0.32), at + duration);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + attack);
        if (hold > 0) gain.gain.setValueAtTime(level, at + Math.max(attack, duration*hold));
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(filter); filter.connect(gain);
        gain.connect(out ?? this.effectsGain);
        if (!out)
            gain.connect(this.effectsReverbGain);
        oscillator.start(at); oscillator.stop(at + duration + 0.02);
    }

    // Industrial one-shots share cached procedural Foley buffers.
    playBeam(at, intensity, out) {
        playIndustrial(this, 'beam', at, intensity, out);
    }
    playShieldHit(at, intensity, out) {
        playIndustrial(this, 'shield', at, intensity, out);
    }
    playCapitalExplosion(at, intensity, out) {
        playIndustrial(this, 'capitalExplosion', at, intensity, out);
    }

    playLaser(at, intensity, out) {
        playIndustrial(this, 'laser', at, intensity, out);
    }

    playMissileLaunch(at, intensity, out) {
        playIndustrial(this, 'missile', at, intensity, out);
    }

    playGauss(at, intensity, out) {
        playIndustrial(this, 'gauss', at, intensity, out);
    }

    playPdc(at, intensity, out) {
        playIndustrial(this, 'pdc', at, intensity, out);
    }

    playRipper(at, intensity, out) {
        playIndustrial(this, 'ripper', at, intensity, out);
    }

    playIon(at, intensity, out) {
        playIndustrial(this, 'ion', at, intensity, out);
    }

    playMortar(at, intensity, out) {
        playIndustrial(this, 'mortar', at, intensity, out);
    }

    playRockImpact(at, intensity, out) {
        playIndustrial(this, 'rock', at, intensity, out);
    }

    playImpact(at, intensity, out) {
        playIndustrial(this, 'impact', at, intensity, out);
    }

    playHit(at, intensity, out) {
        playIndustrial(this, 'hit', at, intensity, out);
    }

    playRepairWeld(at, intensity, out) {
        playIndustrial(this, 'repair', at, intensity, out);
    }

    playMiningHit(intensity, out) {
        playIndustrial(this, 'mining', this.context.currentTime, intensity, out);
    }

    playSalvageClunk(intensity, out) {
        playIndustrial(this, 'salvage', this.context.currentTime, intensity, out);
    }

    playHyperdriveSpool(intensity = 1, out) {
        playIndustrial(this, 'hyperSpool', this.context.currentTime, intensity, out);
    }

    playHyperdriveDrop(intensity = 1, out) {
        playIndustrial(this, 'hyperDrop', this.context.currentTime, intensity, out);
    }

    playHyperdriveActive(out) {
        playIndustrial(this, 'hyperActive', this.context.currentTime, 1, out);
    }

    playSlipstream(intensity = 1, out) {
        playIndustrial(this, 'slipstream', this.context.currentTime, intensity, out);
    }

    playPickup(intensity = 1, out) {
        playIndustrial(this, 'pickup', this.context.currentTime, intensity, out);
    }

    playWarning(intensity, out) {
        playIndustrial(this, 'warning', this.context.currentTime, intensity, out);
    }

    playSuccessChord(intensity, out) {
        playIndustrial(this, 'success', this.context.currentTime, intensity, out);
    }

    playDockChord(out) {
        playIndustrial(this, 'dock', this.context.currentTime, 1, out);
    }

    playUiBlip(intensity, out) {
        playIndustrial(this, 'ui', this.context.currentTime, intensity, out);
    }

    playExplosion(at, intensity, out) {
        playIndustrial(this, 'explosion', at, intensity, out);
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
