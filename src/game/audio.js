import { clamp } from './random.js';
import { createTransitVoice } from './transitAudio.js';
import { SoundBank } from './soundBank.js';
import { SOUND_EVENTS, FALLBACK_EVENT } from './soundEvents.js';
import { ShipEngineAudio } from './audioEngine.js';
import { AmbienceAudio } from './audioAmbience.js';
import { MusicDirector } from './audioMusic.js';

// One-shot voices alive at once. Low-priority events are dropped beyond this
// so a furball cannot starve the audio thread on phones.
const MAX_VOICES = 36;
// Pilots key their radios at slightly different pitches.
const COMMS_RATE = { timid: 1.18, aggressive: 0.84, flamboyant: 1.32, steady: 1 };
// Sound crosses the fiction's vacuum at this many units per second: far
// detonations are seen first and heard a beat later.
const SOUND_SPEED = 2200;
// Several ships firing the same weapon in one frame collapse into one voice.
const FAR_SPACING = 0.045;

// Filtered pink noise is the shared raw material for engine wash, cockpit
// air and ambience beds.
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

// Mix architecture
//
//   worldBus ─┐
//   cockpitBus┼─► worldFilter ─► pauseDip ─► effectsGain ─┐
//   engineBus ┤   (concussion,   (menus)     (user volume) │
//   ambienceBus┘   pause)                                   ├─► mixBus ─► glue ─► soft clip ─► limiter ─► out
//   uiBus ────────────────────────────────► effectsGain ───┤
//   music ─► musicGain ─► crossfade ─► musicDuck ───────────┘
//
// Two convolution reverbs: a short cockpit room (own guns, hits, alarms) and
// a long shared tail (everything outside, plus the score).
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
    dangerLevel = 0;
    // Ambient music context: 'open' | 'planet' | 'field' | 'graveyard' |
    // 'stealth'. Combat and station override it (see update).
    musicContext = 'open';
    currentContext = null;
    activeVoices = 0;
    pinkBuffer;

    async enable() {
        if (this.enabled) {
            await this.context?.resume();
            return;
        }
        const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContextCtor)
            return;
        const context = this.context = new AudioContextCtor({ latencyHint: 'interactive' });
        const gain = (value, ...targets) => {
            const node = context.createGain();
            node.gain.value = value;
            for (const target of targets) node.connect(target);
            return node;
        };

        // Master chain: gentle glue, a soft clipper that rounds transients
        // before they reach the limiter, then a brick wall so nothing clips.
        this.master = gain(0.9, context.destination);
        this.limiter = context.createDynamicsCompressor();
        this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.001; this.limiter.release.value = 0.08;
        this.limiter.connect(this.master);
        const saturator = context.createWaveShaper();
        saturator.curve = AudioManager.softClipCurve();
        saturator.oversample = '2x';
        saturator.connect(this.limiter);
        const saturatorInput = gain(0.5, saturator); // the curve spans ±2
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -16; this.compressor.knee.value = 18; this.compressor.ratio.value = 3;
        this.compressor.attack.value = 0.008; this.compressor.release.value = 0.22;
        this.compressor.connect(saturatorInput);
        this.mixBus = gain(1, this.compressor);

        // Effects side.
        this.effectsGain = gain(this.effectsVolume, this.mixBus);
        this.worldFilter = context.createBiquadFilter();
        this.worldFilter.type = 'lowpass'; this.worldFilter.frequency.value = 20000; this.worldFilter.Q.value = 0.5;
        this.pauseDip = gain(1, this.effectsGain);
        this.worldFilter.connect(this.pauseDip);
        this.worldBus = gain(0.8, this.worldFilter);
        this.cockpitBus = gain(0.8, this.worldFilter);
        this.engineBus = gain(1, this.worldFilter);
        this.ambienceBus = gain(1, this.worldFilter);
        this.uiBus = gain(1, this.effectsGain);

        // Music side. The director owns everything upstream of musicGain.
        this.musicDuck = gain(1, this.mixBus);
        this.crossfadeGain = gain(1, this.musicDuck);
        this.musicGain = gain(this.musicVolume, this.crossfadeGain);

        // Long shared tail.
        this.reverbInput = gain(1);
        this.effectsReverbGain = gain(this.effectsVolume, this.reverbInput);
        this.musicReverbGain = gain(this.musicVolume, this.reverbInput);
        const preDelay = context.createDelay(0.2);
        preDelay.delayTime.value = 0.03;
        const convolver = context.createConvolver();
        convolver.buffer = this.createImpulseResponse(2.8, 2.4, 1.1);
        const lowCut = context.createBiquadFilter();
        lowCut.type = 'highpass'; lowCut.frequency.value = 130;
        this.reverbInput.connect(preDelay); preDelay.connect(convolver); convolver.connect(lowCut);
        lowCut.connect(gain(0.36, this.mixBus));

        // Short cockpit room: early reflections off the canopy and consoles.
        this.roomSend = gain(1);
        const room = context.createConvolver();
        room.buffer = this.createImpulseResponse(0.36, 0.26, 3.2, [[0.003, 0.7], [0.0071, 0.55], [0.0113, 0.45], [0.0172, 0.3]]);
        this.roomSend.connect(room);
        room.connect(gain(0.5, this.worldFilter));
        this.paused = false;

        this.pinkBuffer = new PinkNoise(context).buffer;
        this.bank = new SoundBank(context);
        this.effectTimes = new Map();
        this.effectReleases = new Set();
        this.engine = new ShipEngineAudio(this);
        this.ambience = new AmbienceAudio(this);
        this.music = new MusicDirector(this);
        this.enabled = true;
        // Interface and flight sounds first; percussion only if music is on.
        this.samplesReady = this.bank.load('ui').then(() => this.bank.load('flight'));
        if (this.musicVolume > 0.01) void this.bank.load('music');
        if (this.stationMode) void this.bank.load('dock');
        await context.resume();
    }

    // Linear up to half scale, then a tanh knee. Defined over ±2 so hot
    // sums are rounded rather than squared off.
    static softClipCurve() {
        const size = 2049, curve = new Float32Array(size), knee = 0.5;
        for (let i = 0; i < size; i += 1) {
            const x = (i / (size - 1)) * 4 - 2, magnitude = Math.abs(x);
            const y = magnitude <= knee ? magnitude : knee + (1 - knee) * Math.tanh((magnitude - knee) / (1 - knee));
            curve[i] = Math.sign(x) * y;
        }
        return curve;
    }

    // Decaying noise that darkens as it fades, like air and structure
    // absorbing highs. `early` adds discrete first reflections: [seconds, gain].
    createImpulseResponse(seconds, rt60, darkening, early = []) {
        const rate = this.context.sampleRate, length = Math.floor(rate * seconds);
        const impulse = this.context.createBuffer(2, length, rate);
        for (let channel = 0; channel < 2; channel += 1) {
            const data = impulse.getChannelData(channel);
            let state = 0;
            for (let index = 0; index < length; index += 1) {
                const t = index / rate, cutoff = 1200 + 12800 * Math.exp(-t * darkening);
                state += (1 - Math.exp(-2 * Math.PI * cutoff / rate)) * (Math.random() * 2 - 1 - state);
                data[index] = state * Math.pow(10, -3 * t / rt60) * Math.min(1, index / (rate * 0.002));
            }
            early.forEach(([time, level], tap) => {
                const index = Math.floor((time + (channel ? 0.0006 : 0)) * rate);
                if (index < length) data[index] += level * (tap % 2 === channel ? 1 : 0.6);
            });
        }
        return impulse;
    }

    setVolumes(music, effects) {
        this.musicVolume = clamp(music, 0, 1);
        this.effectsVolume = clamp(effects, 0, 1);
        if (!this.context) return;
        const now = this.context.currentTime;
        const musicLevel = this.musicVolume * (this.cinematicVoice && !this.cinematicVoice.stopped ? .65 : 1);
        this.musicGain?.gain.setTargetAtTime(musicLevel, now, 0.04);
        this.musicReverbGain?.gain.setTargetAtTime(musicLevel, now, 0.04);
        this.effectsGain?.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
        this.effectsReverbGain?.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
        if (this.musicVolume > 0.01) void this.bank?.load('music');
    }

    setStationMode(station) {
        this.stationMode = station;
        if (!this.context)
            return;
        // State changes can happen between frame updates (landing, quitting,
        // or replacing a session). Silence continuous flight layers here too.
        this.setPaused(false);
        if (station) {
            this.stopWork();
            this.engine?.silence();
            void this.bank?.load('dock');
        }
    }

    cinematicSound(event, phase, kind, progress = 0, pan = 0) {
        if (event === 'stop') {
            this.cinematicVoice?.stop(); this.cinematicVoice = undefined;
            if (this.context) this.setVolumes(this.musicVolume, this.effectsVolume);
            return;
        }
        if (!this.context || !this.enabled || this.effectsVolume <= .001 || progress >= 1) return;
        if (event === 'start' || !this.cinematicVoice) {
            this.cinematicVoice?.stop();
            this.cinematicVoice = createTransitVoice(this, phase, kind, progress);
            this.setVolumes(this.musicVolume, this.effectsVolume);
        }
        this.cinematicVoice?.update(progress, pan);
    }

    dispose() {
        if (!this.context)
            return;
        const context = this.context;
        const now = context.currentTime;
        this.cinematicVoice?.stop(); this.cinematicVoice = undefined;
        this.music?.dispose();
        this.ambience?.dispose();
        this.engine?.dispose();
        this.stopWork();
        for (const release of [...(this.effectReleases ?? [])]) release();
        this.effectTimes?.clear();
        this.bank?.close();
        this.master?.gain.cancelScheduledValues(now);
        this.master?.gain.setTargetAtTime(0, now, 0.02);
        this.enabled = false;
        // Closing stops every always-running source (engine loops, beds,
        // sequencer voices) so session switches never leak a graph.
        setTimeout(() => void context.close().catch(() => {}), 80);
        this.context = undefined;
    }

    // Per-frame mix state. `flight` is an optional, caller-owned scratch
    // object: { speed, turn, yaw, shield, hyper, missileThreat, dockKind,
    // dockId, systemId, regionId } (the last three choose the music).
    update(dt, throttle, afterburner, damage = 0, nearbyEnemies = 0, musicContext, raceIntensity = 0, flight) {
        if (!this.context || !this.enabled)
            return;
        // A NaN or negative step must never reach an AudioParam (Web Audio throws).
        if (!(dt >= 0)) dt = 0;
        if (musicContext)
            this.musicContext = musicContext;
        const flying = !this.stationMode;
        this.sweepWork(this.context.currentTime);
        this.engine.update(dt, flying ? throttle : 0, flying && afterburner, damage, raceIntensity, flight);
        if (nearbyEnemies > 0)
            this.dangerLevel = Math.min(1, 0.45 + nearbyEnemies * 0.15);
        else
            this.dangerLevel = Math.max(0, this.dangerLevel - dt * 0.18);
        // Combat overrides the location ambience while hostiles are close;
        // station mode wins over both (you are safe on the pad).
        this.currentContext = this.stationMode ? 'station' : (this.musicContext === 'stealth' && nearbyEnemies === 0 ? 'stealth' : this.dangerLevel > 0.2 ? 'combat' : this.musicContext);
        this.music.update(dt, this.currentContext, this.dangerLevel, flight);
        this.ambience.update(dt, this.currentContext, flight?.dockKind);
        if (flying) this.updateCockpit(dt, afterburner, damage, flight);
        else this.alarmCycles = 0;
    }

    // The cockpit reacts on its own: alarms, stressed structure, avionics.
    updateCockpit(dt, afterburner, damage, flight) {
        // Hull critical: insistent at first, then a quieter reminder so a
        // long limp home is not a klaxon the whole way.
        if (damage >= 0.7 && damage < 1) {
            this.alarmTimer = (this.alarmTimer ?? 0) - dt;
            if (this.alarmTimer <= 0) {
                this.alarmCycles = (this.alarmCycles ?? 0) + 1;
                const insistent = this.alarmCycles <= 4;
                this.play('hullAlarm', insistent ? 0.6 : 0.3);
                this.alarmTimer = insistent ? 2.2 : 7;
            }
        }
        else if (damage < 0.6) { this.alarmCycles = 0; this.alarmTimer = 0; }

        const shield = flight?.shield;
        if (Number.isFinite(shield)) {
            if (this.lastShield !== undefined && this.lastShield <= 0.001 && shield > 0.02) this.play('shieldRestore', 0.8);
            this.lastShield = shield;
        }

        const threat = flight?.missileThreat ?? 0;
        if (threat > 0) {
            this.missileTimer = (this.missileTimer ?? 0) - dt;
            if (this.missileTimer <= 0) {
                this.play('missileAlert', 0.55 + 0.35 * threat);
                this.missileTimer = 0.95 - 0.6 * clamp(threat, 0, 1);
            }
        }
        else this.missileTimer = 0;

        // Structure groans under afterburner, hard turns and damage.
        const stress = (afterburner ? 0.35 : 0) + clamp(flight?.turn ?? 0, 0, 1) * 0.45 + damage * 0.45;
        if (stress > 0.3 && Math.random() < dt * stress * 0.3)
            this.play('creak', 0.3 + 0.5 * Math.min(1, stress), Math.random() * 1.4 - 0.7);
        if (damage > 0.45 && Math.random() < dt * (damage - 0.35) * 0.9)
            this.play('spark', 0.35 + damage * 0.4, Math.random() * 1.6 - 0.8);
        this.chatterTimer = (this.chatterTimer ?? 6) - dt;
        if (this.chatterTimer <= 0) {
            this.chatterTimer = 5 + Math.random() * 11;
            if (this.dangerLevel < 0.2) this.play('chatter', 0.55, Math.random() * 1.2 - 0.6);
        }
    }

    // A menu over the cockpit: the world drops back behind glass while the
    // score and the interface stay clear.
    setPaused(paused) {
        if (!this.context || !this.worldFilter || this.paused === paused) return;
        this.paused = paused;
        const now = this.context.currentTime;
        this.worldFilter.frequency.cancelScheduledValues(now);
        this.worldFilter.frequency.setTargetAtTime(paused ? 650 : 20000, now, paused ? 0.08 : 0.15);
        this.pauseDip.gain.setTargetAtTime(paused ? 0.45 : 1, now, 0.1);
    }

    setMusicContext(context) {
        this.musicContext = context;
    }
    // Continuous parameters are only rescheduled when their target changes.
    setEngineTarget(parameter, value, now, smoothing) {
        if (!parameter || !Number.isFinite(value)) return;
        this.engineTargets ??= new WeakMap();
        if (this.engineTargets.get(parameter) === value) return;
        this.engineTargets.set(parameter, value);
        parameter.setTargetAtTime(value, now, smoothing);
    }

    // Sidechain-style ducking: big moments push the score (and the beds)
    // down, then let them swell back.
    duck(depth, hold, release) {
        const now = this.context.currentTime;
        if (now < (this.duckUntil ?? 0) && depth >= (this.duckDepth ?? 1)) return;
        this.duckDepth = depth; this.duckUntil = now + hold;
        for (const [node, level] of [[this.musicDuck, depth], [this.ambienceBus, Math.sqrt(depth)]]) {
            if (!node) continue;
            node.gain.cancelScheduledValues(now);
            node.gain.setTargetAtTime(level, now, 0.03);
            node.gain.setTargetAtTime(1, now + hold, release / 3);
        }
    }

    // Concussion: a heavy hit closes the world low-pass for a moment, the
    // way ears and a rattled cockpit would.
    concuss(amount) {
        if (!this.worldFilter || amount < 0.05 || this.paused) return;
        const now = this.context.currentTime, frequency = this.worldFilter.frequency;
        frequency.cancelScheduledValues(now);
        frequency.setTargetAtTime(9000 * Math.pow(600 / 9000, clamp(amount, 0, 1)), now, 0.008);
        frequency.setTargetAtTime(20000, now + 0.08 + amount * 0.25, 0.2 + amount * 0.45);
    }

    // Music-side accent for story beats ('threat', 'kill', 'death').
    stinger(name) {
        if (this.context && this.enabled) this.music?.stinger(name);
    }

    playCockpit(effect, intensity = 1, pan = 0) {
        this.play(effect, intensity, pan, 0, true);
    }

    // Own-ship and interface playback: full detail, no distance.
    play(effect, intensity = 1, pan = 0, distance = 0, cockpit = false) {
        if (!this.context || !this.effectsGain || !this.enabled || this.effectsVolume <= 0.001)
            return;
        if (!Number.isFinite(intensity) || intensity <= 0) return;
        pan = Number.isFinite(pan) ? pan : 0;
        distance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
        if (effect === 'repair' || effect === 'mining') {
            this.playWork(effect, intensity, pan, distance);
            return;
        }
        this.trigger(effect, clamp(intensity * (cockpit ? 1.25 : 1), 0.001, 2), pan, distance, 1, 0, 0, cockpit ? `cockpit:${effect}` : effect);
        // Story beats also land in the score.
        if (effect === 'threat' || effect === 'kill') this.music?.stinger(effect);
    }

    // Distant events should not arrive at full volume. The squared falloff
    // keeps nearby combat punchy while far-away fights feel physically remote.
    // localX / localZ are the source offset in ship space (+x right, +z behind).
    playAtDirection(effect, intensity, distance, localX, localZ = 0) {
        if (!this.context || !this.effectsGain || !this.enabled || this.effectsVolume <= 0.001)
            return;
        const range = (SOUND_EVENTS[effect] ?? SOUND_EVENTS[FALLBACK_EVENT]).range ?? 520;
        // Web audio THROWS on non-finite AudioParam values, and a throw inside
        // updateProjectiles would take the sim loop down with it — a NaN that
        // slips out of a sim edge case must stay a silent non-event.
        if (!Number.isFinite(distance)) distance = range;
        if (!Number.isFinite(localX)) localX = 0;
        if (!Number.isFinite(localZ)) localZ = 0;
        if (!Number.isFinite(intensity)) intensity = 0.4;
        if (distance >= range || intensity <= 0) return;
        const proximity = clamp(1 - Math.max(0, distance) / range, 0, 1);
        const direction = clamp(localX / Math.max(1, distance), -1, 1);
        const rear = clamp(localZ / Math.max(1, distance), 0, 1);
        // Distance dominates at long range; stereo separation becomes clearer
        // as the source gets closer, which matches how cockpit audio behaves.
        this.trigger(effect, clamp(intensity * proximity * proximity, 0.001, 2), direction * (0.3 + proximity * 0.6), Math.max(0.001, distance), proximity, rear, Math.min(0.45, distance / SOUND_SPEED), `far:${effect}`, 1, FAR_SPACING);
    }

    // Builds one voice: layers → gain → (distance filter) → (pan) → bus,
    // plus room/space sends. Throttling happens before any node exists.
    trigger(effect, strength, pan, distance, proximity, rear, delay, channel, rate = 1, minSpacing = 0) {
        const event = SOUND_EVENTS[effect] ?? SOUND_EVENTS[FALLBACK_EVENT];
        const context = this.context, now = context.currentTime;
        if (now - (this.effectTimes.get(channel) ?? -Infinity) < Math.max(event.spacing ?? 0, minSpacing)) return;
        if (this.activeVoices >= MAX_VOICES && (event.priority ?? 1) < 2) return;
        this.effectTimes.set(channel, now);
        const spatial = distance > 0;
        const out = context.createGain();
        out.gain.value = strength * (event.gain ?? 1);
        const nodes = [out];
        let tail = out;
        if (spatial && (distance > 25 || rear > 0.15)) {
            // Distance and "behind you" both cost high-frequency content, so
            // far events arrive muffled and rear events sit behind the head.
            const lowpass = context.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = Math.max(900, 19000 / (1 + distance / 110)) * (1 - 0.45 * rear);
            tail.connect(lowpass); tail = lowpass; nodes.push(lowpass);
        }
        if (pan !== 0) {
            const panner = context.createStereoPanner();
            panner.pan.value = clamp(pan, -0.9, 0.9);
            tail.connect(panner); tail = panner; nodes.push(panner);
        }
        tail.connect(spatial ? this.worldBus : event.bus === 'ui' ? this.uiBus : event.bus === 'world' ? this.worldBus : this.cockpitBus);
        const send = (level, target) => {
            if (!(level > 0) || !target) return;
            const node = context.createGain();
            node.gain.value = level;
            tail.connect(node); node.connect(target); nodes.push(node);
        };
        if (!spatial) send(event.room, this.roomSend);
        // Far sources are mostly tail: the dry signal fades faster than the reverb.
        send((event.space ?? 0) * (spatial ? 1 + (1 - proximity) * 1.6 : 1), this.effectsReverbGain);

        let longest = 0, lastSource;
        for (const [id, gain, options] of event.layers) {
            if (options) {
                if (options.prox && proximity < options.prox) continue;
                if (options.chance && Math.random() > options.chance) continue;
            }
            const buffer = this.bank.buffer(id);
            if (!buffer) continue;
            const source = context.createBufferSource();
            source.buffer = buffer;
            const playbackRate = rate * (options?.rate ?? 1) * (options?.vary ? 1 + (Math.random() * 2 - 1) * options.vary : 1);
            source.playbackRate.value = playbackRate;
            if (gain === 1) source.connect(out);
            else {
                const level = context.createGain();
                level.gain.value = gain;
                source.connect(level); level.connect(out); nodes.push(level);
            }
            const offset = delay + (options?.delay ?? 0);
            source.start(now + offset);
            nodes.push(source);
            const ends = offset + buffer.duration / playbackRate;
            if (ends > longest) { longest = ends; lastSource = source; }
        }
        if (!lastSource) {
            // Bank still loading: nothing audible, nothing to keep.
            for (const node of nodes) node.disconnect();
            return;
        }
        this.activeVoices += 1;
        const release = () => {
            if (!this.effectReleases.delete(release)) return;
            this.activeVoices -= 1;
            for (const node of nodes) node.disconnect();
        };
        this.effectReleases.add(release);
        lastSource.onended = release;
        const weight = Math.min(1, strength) * proximity;
        if (event.duck && weight > 0.2) this.duck(1 - (1 - event.duck[0]) * weight, event.duck[1], event.duck[2]);
        if (event.muffle) this.concuss(event.muffle * weight);
    }

    // Repair and mining are continuous work: one looping voice per kind,
    // kept alive by the game's periodic pulses and released when they stop.
    playWork(id, intensity, pan, distance) {
        this.work ??= new Map();
        let voice = this.work.get(id);
        if (!voice) {
            const buffer = this.bank.buffer(id);
            if (!buffer) return;
            const context = this.context, source = context.createBufferSource(), gain = context.createGain(), panner = context.createStereoPanner();
            source.buffer = buffer; source.loop = true;
            // Stay within the steady working part of the recordings.
            source.loopStart = id === 'mining' ? .3 : .12; source.loopEnd = buffer.duration - .12;
            gain.gain.value = 0;
            panner.pan.value = clamp(pan, -0.9, 0.9);
            source.connect(gain); gain.connect(panner); panner.connect(distance > 0 ? this.worldBus : this.cockpitBus);
            const wet = context.createGain(); wet.gain.value = 0.12;
            panner.connect(wet); wet.connect(this.roomSend);
            voice = { source, gain, panner, wet };
            source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); wet.disconnect(); };
            this.work.set(id, voice);
            source.start();
        }
        const now = this.context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(intensity, now, .025);
        // Game repair pulses arrive every .34 seconds. Silence promptly if work stops.
        voice.gain.gain.setTargetAtTime(0, now + .4, .035);
        voice.until = now + .65;
    }
    // Releases work loops whose pulses stopped (timed on the audio clock).
    sweepWork(now) {
        if (!this.work?.size) return;
        for (const [id, voice] of this.work) {
            if (now < voice.until) continue;
            try { voice.source.stop(); } catch { /* already stopped */ }
            this.work.delete(id);
        }
    }
    stopWork() {
        for (const voice of this.work?.values() ?? []) {
            try { voice.source.stop(); } catch { /* already stopped */ }
        }
        this.work?.clear();
    }

    // Radio squelch as a pilot keys the channel, pitched by temperament.
    playComms(temperament = 'steady') {
        if (!this.context || !this.enabled || !this.effectsGain || this.effectsVolume <= 0.001)
            return;
        this.trigger('commsOpen', 0.8, 0, 0, 1, 0, 0, 'commsOpen', COMMS_RATE[temperament] ?? 1);
    }
}
