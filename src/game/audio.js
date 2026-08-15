import { clamp } from './random.js';
export class AudioManager {
    context;
    master;
    effectsGain;
    musicGain;
    engineGain;
    engineOsc;
    engineOsc2;
    engineSub;
    engineFilter;
    engineNoise;
    engineNoiseFilter;
    engineNoiseGain;
    enabled = false;
    musicTimer = 0;
    noteIndex = 0;
    stationMode = true;
    musicVolume = 0.34;
    effectsVolume = 0.68;
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
        this.effectsGain = this.context.createGain();
        this.musicGain = this.context.createGain();
        this.engineGain = this.context.createGain();
        this.engineFilter = this.context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.master.gain.value = 0.88;
        this.effectsGain.gain.value = this.effectsVolume;
        this.musicGain.gain.value = this.musicVolume;
        this.engineGain.gain.value = 0;
        this.effectsGain.connect(this.master);
        this.musicGain.connect(this.master);
        this.engineGain.connect(this.engineFilter);
        this.engineFilter.connect(this.master);
        this.master.connect(this.context.destination);
        // Engine voice: a warm, smooth rumble. Two gently detuned triangles give
        // a soft beating "purr", a sub sine carries the weight, and a filtered
        // noise wash supplies the air pushed out of the thrusters. The old raw
        // sawtooth was the harsh, buzzy "angry bee" drone — it's gone.
        this.engineOsc = this.context.createOscillator();
        this.engineOsc.type = 'triangle';
        this.engineOsc.frequency.value = 46;
        this.engineOsc2 = this.context.createOscillator();
        this.engineOsc2.type = 'triangle';
        this.engineOsc2.frequency.value = 48;
        this.engineSub = this.context.createOscillator();
        this.engineSub.type = 'sine';
        this.engineSub.frequency.value = 23;
        const osc2Gain = this.context.createGain();
        osc2Gain.gain.value = 0.6;
        const subGain = this.context.createGain();
        subGain.gain.value = 0.5;
        this.engineOsc.connect(this.engineGain);
        this.engineOsc2.connect(osc2Gain);
        osc2Gain.connect(this.engineGain);
        this.engineSub.connect(subGain);
        subGain.connect(this.engineGain);
        // Thruster wash: looping white noise through its own lowpass, gated by throttle.
        this.engineNoise = this.context.createBufferSource();
        this.engineNoise.buffer = this.createNoiseBuffer(2);
        this.engineNoise.loop = true;
        this.engineNoiseFilter = this.context.createBiquadFilter();
        this.engineNoiseFilter.type = 'lowpass';
        this.engineNoiseFilter.frequency.value = 380;
        this.engineNoiseGain = this.context.createGain();
        this.engineNoiseGain.gain.value = 0;
        this.engineNoise.connect(this.engineNoiseFilter);
        this.engineNoiseFilter.connect(this.engineNoiseGain);
        this.engineNoiseGain.connect(this.master);
        this.engineNoise.start();
        this.engineOsc.start();
        this.engineOsc2.start();
        this.engineSub.start();
        this.enabled = true;
        await this.context.resume();
    }
    createNoiseBuffer(seconds) {
        const length = Math.floor(this.context.sampleRate * seconds);
        const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < length; index += 1)
            data[index] = Math.random() * 2 - 1;
        return buffer;
    }
    setVolumes(music, effects) {
        this.musicVolume = clamp(music, 0, 1);
        this.effectsVolume = clamp(effects, 0, 1);
        if (this.musicGain && this.context)
            this.musicGain.gain.setTargetAtTime(this.musicVolume, this.context.currentTime, 0.04);
        if (this.effectsGain && this.context)
            this.effectsGain.gain.setTargetAtTime(this.effectsVolume, this.context.currentTime, 0.04);
    }
    setStationMode(station) {
        this.stationMode = station;
    }
    update(dt, throttle, afterburner, damage = 0) {
        if (!this.context || !this.enabled)
            return;
        const now = this.context.currentTime;
        const thrust = this.stationMode ? 0 : throttle;
        const burn = this.stationMode ? 0 : (afterburner ? 1 : 0);
        const engineLevel = this.stationMode ? 0 : 0.05 + thrust * 0.075 + burn * 0.05;
        this.engineGain?.gain.setTargetAtTime(engineLevel * this.effectsVolume, now, 0.1);
        const oscHz = 44 + thrust * 32 + burn * 26 + damage * 6;
        this.engineOsc?.frequency.setTargetAtTime(oscHz, now, 0.09);
        this.engineOsc2?.frequency.setTargetAtTime(oscHz * 1.045, now, 0.09);
        this.engineSub?.frequency.setTargetAtTime(22 + thrust * 15 + burn * 11, now, 0.1);
        this.engineFilter?.frequency.setTargetAtTime(300 + thrust * 380 + burn * 600, now, 0.1);
        const washLevel = this.stationMode ? 0 : 0.014 + thrust * 0.055 + burn * 0.032;
        this.engineNoiseGain?.gain.setTargetAtTime(washLevel * this.effectsVolume, now, 0.12);
        this.engineNoiseFilter?.frequency.setTargetAtTime(320 + thrust * 560 + burn * 740, now, 0.1);
        this.musicTimer -= dt;
        if (this.musicTimer <= 0 && this.musicVolume > 0.01) {
            this.musicTimer = this.stationMode ? 1.8 : 2.5;
            this.playAmbientNote();
        }
    }
    playAmbientNote() {
        if (!this.context || !this.musicGain)
            return;
        const now = this.context.currentTime;
        const stationScale = [48, 55, 62, 67, 55, 72];
        const spaceScale = [36, 43, 48, 51, 43, 55];
        const midi = (this.stationMode ? stationScale : spaceScale)[this.noteIndex % 6];
        this.noteIndex += 1;
        const frequency = 440 * Math.pow(2, (midi - 69) / 12);
        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        oscillator.type = this.stationMode ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        filter.type = 'lowpass';
        filter.frequency.value = this.stationMode ? 850 : 520;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (this.stationMode ? 1.45 : 2.1));
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        oscillator.start(now);
        oscillator.stop(now + (this.stationMode ? 1.5 : 2.2));
    }
    play(effect, intensity = 1) {
        if (!this.context || !this.effectsGain || !this.enabled || this.effectsVolume <= 0.001)
            return;
        const now = this.context.currentTime;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        const level = clamp(intensity, 0.15, 2) * 0.08;
        let duration = 0.16;
        let start = 180;
        let end = 90;
        let type = 'sawtooth';
        switch (effect) {
            case 'laser':
                start = 760;
                end = 180;
                duration = 0.09;
                type = 'square';
                break;
            case 'missile':
                start = 150;
                end = 620;
                duration = 0.36;
                type = 'sawtooth';
                break;
            case 'impact':
                start = 120;
                end = 42;
                duration = 0.13;
                type = 'triangle';
                break;
            case 'explosion':
                start = 88;
                end = 24;
                duration = 0.62;
                type = 'sawtooth';
                break;
            case 'scan':
                start = 330;
                end = 980;
                duration = 0.42;
                type = 'sine';
                break;
            case 'dock':
                start = 180;
                end = 260;
                duration = 0.62;
                type = 'triangle';
                break;
            case 'ui':
                start = 440;
                end = 520;
                duration = 0.055;
                type = 'square';
                break;
            case 'success':
                start = 430;
                end = 790;
                duration = 0.46;
                type = 'triangle';
                break;
            case 'warning':
                start = 190;
                end = 150;
                duration = 0.24;
                type = 'square';
                break;
            case 'mining':
                start = 260;
                end = 195;
                duration = 0.12;
                type = 'sawtooth';
                break;
            case 'salvage':
                start = 120;
                end = 360;
                duration = 0.16;
                type = 'triangle';
                break;
        }
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(start, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
        filter.type = 'lowpass';
        filter.frequency.value = effect === 'explosion' ? 280 : 2400;
        gain.gain.setValueAtTime(level, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.effectsGain);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
    }
}
