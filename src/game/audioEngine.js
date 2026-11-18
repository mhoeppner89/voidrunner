import { clamp } from './random.js';

// The player's drive, as a layered instrument rather than three crossfaded
// loops. Recorded idle/thrust/afterburner beds carry the character; forged
// layers add what a cockpit should feel like: a reactor sub that follows
// power, a turbine whine that audibly spools, a wide afterburner roar, a
// slipstream rush tied to real speed and thruster hiss on hard manoeuvres.
// Every layer is a persistent looping voice — steady state allocates nothing.
//
//            id                  pan   through tone filter
const LAYERS = [
    ['engine-idle', -0.45, true], ['engine-idle', 0.45, true],
    ['engine-thrust', -0.55, true], ['engine-thrust', 0.55, true],
    ['engine-afterburner', 0, true],
    ['loop-engine-sub', 0, false],
    ['loop-engine-whine', 0, true],
    ['loop-ab-roar', 0, false],
];
const [IDLE_L, IDLE_R, THRUST_L, THRUST_R, BURN, SUB, WHINE, ROAR] = LAYERS.map((_, index) => index);
const quantize = (value) => Math.round(value * 400) / 400;

export class ShipEngineAudio {
    spool = 0;
    burn = 0;
    turnLevel = 0;
    lastTurn = 0;
    constructor(manager) {
        this.manager = manager;
        const context = manager.context;
        this.bus = context.createGain();
        // 0.25 (was 0.62): the drive sits well under weapons, comms and music.
        this.bus.gain.value = 0.25;
        this.bus.connect(manager.engineBus);
        // A little of the drive reaches the long tail so it sits in a space.
        const tail = context.createGain(); tail.gain.value = 0.05;
        this.bus.connect(tail); tail.connect(manager.effectsReverbGain);
        this.filter = context.createBiquadFilter();
        this.filter.type = 'lowpass'; this.filter.frequency.value = 1400; this.filter.Q.value = 0.4;
        this.filter.connect(this.bus);

        // Noise-driven layers exist immediately: slipstream rush and RCS hiss.
        this.noise = context.createBufferSource();
        this.noise.buffer = manager.pinkBuffer; this.noise.loop = true;
        this.rushFilter = context.createBiquadFilter();
        this.rushFilter.type = 'bandpass'; this.rushFilter.frequency.value = 700; this.rushFilter.Q.value = 0.6;
        this.rushGain = context.createGain(); this.rushGain.gain.value = 0;
        this.noise.connect(this.rushFilter); this.rushFilter.connect(this.rushGain); this.rushGain.connect(this.bus);
        const hissFilter = context.createBiquadFilter();
        hissFilter.type = 'bandpass'; hissFilter.frequency.value = 3600; hissFilter.Q.value = 0.9;
        this.hissGain = context.createGain(); this.hissGain.gain.value = 0;
        this.hissPan = context.createStereoPanner();
        this.noise.connect(hissFilter); hissFilter.connect(this.hissGain); this.hissGain.connect(this.hissPan); this.hissPan.connect(this.bus);
        this.noise.start();
    }

    // Loop voices appear as soon as the bank has every recording.
    build() {
        const { manager } = this, { bank, context } = manager;
        if (LAYERS.some(([id]) => !bank.has(id))) return false;
        this.voices = LAYERS.map(([id, pan, filtered]) => {
            const source = bank.loopSource(id), gain = context.createGain();
            gain.gain.value = 0;
            source.connect(gain);
            let tail = gain;
            if (pan !== 0) {
                const panner = context.createStereoPanner();
                panner.pan.value = pan; gain.connect(panner); tail = panner;
            }
            tail.connect(filtered ? this.filter : this.bus);
            // Paired left/right copies start out of phase: one mono recording, a wide engine.
            source.start(0, source.loopStart + Math.random() * (source.loopEnd - source.loopStart));
            return { source, gain };
        });
        return true;
    }

    update(dt, throttle, afterburner, damage, raceIntensity, flight) {
        const { manager } = this, now = manager.context.currentTime;
        const thrust = clamp(Number.isFinite(throttle) ? throttle : 0, 0, 1);
        if (!(dt >= 0)) dt = 0;
        damage = clamp(Number.isFinite(damage) ? damage : 0, 0, 1);
        // Reactor inertia: quick to answer the throttle, slower to wind down.
        this.spool = clamp(this.spool + (thrust - this.spool) * Math.min(1, dt * (thrust > this.spool ? 2.6 : 1.5)), 0, 1);
        this.burn = clamp(this.burn + ((afterburner ? 1 : 0) - this.burn) * Math.min(1, dt * (afterburner ? 5 : 2.5)), 0, 1);
        if (afterburner && !this.wasBurning) { manager.play('afterburnerOn', 0.26); this.burnStartedAt = now; }
        else if (!afterburner && this.wasBurning && now - this.burnStartedAt > 0.35 && !manager.stationMode) manager.play('afterburnerOff', 0.28);
        this.wasBurning = Boolean(afterburner);
        this.updateTunnel(Boolean(flight?.hyper) && !manager.stationMode, now);
        if (manager.stationMode) return;
        if (!this.voices && !this.build()) return;

        const s = this.spool, b = this.burn, race = clamp(Number.isFinite(raceIntensity) ? raceIntensity : 0, 0, 1);
        // A badly damaged drive misfires: brief random dropouts in the thrust bed.
        if (damage > 0.6 && now > (this.sputterUntil ?? 0) && Math.random() < dt * (damage - 0.6) * 3)
            this.sputterUntil = now + 0.06 + Math.random() * 0.1;
        const sputter = now < (this.sputterUntil ?? 0) ? 0.35 : 1;
        const idle = (1 - s) * 0.44, push = s * (0.5 - 0.26 * b) * sputter;
        this.setLayer(IDLE_L, idle, 1 + race * 0.08, now); this.setLayer(IDLE_R, idle, 1 + race * 0.08, now);
        this.setLayer(THRUST_L, push, 0.95 + 0.09 * s + race * 0.08, now); this.setLayer(THRUST_R, push, 0.95 + 0.09 * s + race * 0.08, now);
        this.setLayer(BURN, b * 0.6, 1 + race * 0.16, now);
        this.setLayer(SUB, 0.1 + 0.2 * s + 0.14 * b, 0.85 + 0.3 * s + 0.2 * b, now);
        this.setLayer(WHINE, Math.pow(s, 1.4) * 0.055 + b * 0.025, 0.5 + 0.75 * s + 0.3 * b + damage * 0.05, now);
        this.setLayer(ROAR, b * 0.42, 0.9 + 0.2 * b + race * 0.1, now);
        manager.setEngineTarget(this.filter.frequency, Math.round(1400 + 9000 * s + 8000 * b), now, 0.15);

        // Slipstream: speed you can hear, independent of throttle (coasting counts).
        const speed = clamp(Number.isFinite(flight?.speed) ? flight.speed : s, 0, 1.4);
        manager.setEngineTarget(this.rushGain.gain, quantize(speed * speed * 0.05), now, 0.25);
        manager.setEngineTarget(this.rushFilter.frequency, Math.round(500 + 1500 * speed), now, 0.25);
        // Manoeuvring thrusters fire when the turn rate changes, on the far side of the turn.
        const turn = clamp(Number.isFinite(flight?.turn) ? flight.turn : 0, 0, 1);
        const change = dt > 0 ? Math.abs(turn - this.lastTurn) / dt : 0;
        this.lastTurn = turn;
        this.turnLevel = Math.max(clamp(change * 0.35, 0, 1), this.turnLevel - dt * 3.5);
        manager.setEngineTarget(this.hissGain.gain, quantize(this.turnLevel * 0.045), now, 0.03);
        manager.setEngineTarget(this.hissPan.pan, quantize(clamp(-(Number.isFinite(flight?.yaw) ? flight.yaw : 0) * 0.7, -0.7, 0.7)), now, 0.05);
    }

    setLayer(index, level, rate, now) {
        const voice = this.voices[index], manager = this.manager;
        manager.setEngineTarget(voice.gain.gain, quantize(level), now, 0.12);
        manager.setEngineTarget(voice.source.playbackRate, quantize(rate), now, 0.18);
    }

    // Hyperspace transit bed: fades in while the drive is engaged.
    updateTunnel(active, now) {
        const { manager } = this;
        if (active && !this.tunnel) {
            const source = manager.bank.loopSource('loop-hyper-tunnel');
            if (!source) return;
            const gain = manager.context.createGain();
            gain.gain.value = 0;
            source.connect(gain); gain.connect(this.bus);
            const wet = manager.context.createGain(); wet.gain.value = 0.25;
            gain.connect(wet); wet.connect(manager.effectsReverbGain);
            source.playbackRate.setValueAtTime(0.82, now);
            source.playbackRate.linearRampToValueAtTime(1.08, now + 6);
            gain.gain.setTargetAtTime(0.55, now, 0.5);
            source.onended = () => { source.disconnect(); gain.disconnect(); wet.disconnect(); };
            source.start(now, source.loopStart);
            this.tunnel = { source, gain };
        }
        else if (!active && this.tunnel) {
            const { source, gain } = this.tunnel;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setTargetAtTime(0, now, 0.12);
            source.stop(now + 0.8);
            this.tunnel = undefined;
        }
    }

    // Landing, quitting or replacing a session: cut every continuous layer now.
    silence() {
        const { manager } = this, now = manager.context.currentTime;
        for (const parameter of [...(this.voices ?? []).map((voice) => voice.gain.gain), this.rushGain.gain, this.hissGain.gain]) {
            parameter.cancelScheduledValues(now);
            parameter.setTargetAtTime(0, now, 0.035);
            manager.engineTargets?.delete(parameter);
        }
        this.updateTunnel(false, now);
        this.wasBurning = false; this.burn = 0; this.turnLevel = 0;
    }

    dispose() {
        for (const voice of this.voices ?? []) { try { voice.source.stop(); } catch { /* already stopped */ } }
        try { this.noise.stop(); } catch { /* already stopped */ }
        if (this.tunnel) { try { this.tunnel.source.stop(); } catch { /* already stopped */ } this.tunnel = undefined; }
        this.voices = undefined;
    }
}
