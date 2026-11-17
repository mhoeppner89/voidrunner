// A strict stand-in for the Web Audio graph, for headless score tests.
// It records nothing audible; it throws where a browser would (non-finite
// automation values, exponential ramps to zero, negative times) and counts
// the nodes created, so tests can check correctness and node churn.

const finite = (value, what) => {
    if (!Number.isFinite(value)) throw new TypeError(`${what} is not finite: ${value}`);
    return value;
};

class FakeParam {
    constructor(owner, name, value = 0) { this.owner = owner; this.name = name; this.value = value; }
    check(value, time, what) {
        finite(value, `${this.name}.${what} value`);
        finite(time, `${this.name}.${what} time`);
        if (time < 0) throw new RangeError(`${this.name}.${what} time is negative: ${time}`);
    }
    setValueAtTime(value, time) { this.check(value, time, 'setValueAtTime'); this.value = value; return this; }
    linearRampToValueAtTime(value, time) { this.check(value, time, 'linearRamp'); this.value = value; return this; }
    exponentialRampToValueAtTime(value, time) {
        this.check(value, time, 'exponentialRamp');
        if (Math.abs(value) < 1.4013e-45) throw new RangeError(`${this.name}.exponentialRamp to zero`);
        this.value = value; return this;
    }
    setTargetAtTime(value, time, constant) {
        this.check(value, time, 'setTarget');
        finite(constant, `${this.name}.setTarget constant`);
        if (constant < 0) throw new RangeError(`${this.name}.setTarget constant is negative`);
        return this;
    }
    cancelScheduledValues(time) { finite(time, `${this.name}.cancel time`); return this; }
}

class FakeNode {
    constructor(context, kind, params = {}) {
        this.context = context; this.kind = kind; this.outputs = 0;
        for (const [name, value] of Object.entries(params)) this[name] = new FakeParam(this, `${kind}.${name}`, value);
        context.created += 1;
    }
    connect(target) {
        if (!(target instanceof FakeNode) && !(target instanceof FakeParam)) throw new TypeError(`${this.kind} connected to a non-node`);
        this.outputs += 1;
        return target;
    }
    disconnect() { this.outputs = 0; }
}

class FakeSource extends FakeNode {
    start(when = 0, offset = 0) {
        finite(when, `${this.kind}.start`); finite(offset, `${this.kind}.start offset`);
        if (this.started !== undefined) throw new Error(`${this.kind} started twice`);
        this.started = when;
        this.context.starts.push(when);
    }
    stop(when = 0) {
        finite(when, `${this.kind}.stop`);
        if (this.started === undefined) throw new Error(`${this.kind} stopped before start`);
        if (this.stopped !== undefined) throw new Error(`${this.kind} stopped twice`);
        this.stopped = when;
    }
}

export class FakeAudioContext {
    currentTime = 0;
    sampleRate = 48000;
    created = 0;
    starts = [];
    destination = new FakeNode(this, 'destination');
    createGain() { return new FakeNode(this, 'gain', { gain: 1 }); }
    createBiquadFilter() { const node = new FakeNode(this, 'filter', { frequency: 350, Q: 1, gain: 0 }); node.type = 'lowpass'; return node; }
    createStereoPanner() { return new FakeNode(this, 'panner', { pan: 0 }); }
    createDelay(max = 1) { const node = new FakeNode(this, 'delay', { delayTime: 0 }); node.max = max; return node; }
    createOscillator() {
        const node = new FakeSource(this, 'oscillator', { frequency: 440, detune: 0 });
        node.type = 'sine';
        node.setPeriodicWave = (wave) => { if (!wave?.periodic) throw new TypeError('not a periodic wave'); };
        return node;
    }
    createBufferSource() { const node = new FakeSource(this, 'buffer', { playbackRate: 1, detune: 0 }); node.buffer = null; node.loop = false; return node; }
    createPeriodicWave(real, imag) {
        for (const value of [...real, ...imag]) finite(value, 'periodic wave coefficient');
        return { periodic: true };
    }
}

// The slice of AudioManager that MusicDirector touches.
export function fakeMusicManager({ drums } = {}) {
    const context = new FakeAudioContext();
    const used = new Set();
    return {
        context,
        musicVolume: 0.34,
        musicGain: context.createGain(),
        musicReverbGain: context.createGain(),
        pinkBuffer: { duration: 4 },
        drumsUsed: used,
        bank: { buffer(id) { used.add(id); return drums && !drums.has(id) ? undefined : { duration: 1 }; } },
    };
}
