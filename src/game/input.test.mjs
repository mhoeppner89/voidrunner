import assert from 'node:assert/strict';
import { InputManager } from './input.js';

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        this.listeners.set(type, listeners.filter((entry) => entry !== listener));
    }

    emit(type, event = {}) {
        for (const listener of [...(this.listeners.get(type) ?? [])])
            listener(event);
    }
}

class FakeClassList {
    values = new Set();

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement extends FakeEventTarget {
    constructor({ dataset = {}, rect = {}, offsetWidth = 0, offsetHeight = 0 } = {}) {
        super();
        this.dataset = dataset;
        this.rect = { left: 0, top: 0, width: 0, height: 0, ...rect };
        this.offsetWidth = offsetWidth;
        this.offsetHeight = offsetHeight;
        this.style = {};
        this.classList = new FakeClassList();
        this.capturedPointer = undefined;
    }

    getBoundingClientRect() {
        return this.rect;
    }

    setPointerCapture(pointerId) {
        this.capturedPointer = pointerId;
    }
}

class FakeRoot {
    constructor({ throttle, throttleThumb, stick, stickKnob, touchButtons = [] } = {}) {
        this.elements = new Map([
            ['[data-touch-throttle]', throttle],
            ['[data-touch-throttle-thumb]', throttleThumb],
            ['[data-touch-stick]', stick],
            ['[data-touch-stick-knob]', stickKnob],
        ]);
        this.touchButtons = touchButtons;
    }

    querySelector(selector) {
        return this.elements.get(selector) ?? null;
    }

    querySelectorAll(selector) {
        return selector === '[data-touch-action]' ? this.touchButtons : [];
    }
}

const windowFake = new FakeEventTarget();
windowFake.orientation = 0;
const screenFake = { orientation: { angle: 0 } };
let gamepads = [];
const vibrationCalls = [];
const navigatorFake = {
    getGamepads: () => gamepads,
    vibrate: (duration) => vibrationCalls.push(duration),
};
class FakeDeviceOrientationEvent {}
FakeDeviceOrientationEvent.requestPermission = async () => 'granted';

Object.defineProperty(globalThis, 'window', { configurable: true, value: windowFake });
Object.defineProperty(globalThis, 'screen', { configurable: true, value: screenFake });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorFake });
Object.defineProperty(globalThis, 'DeviceOrientationEvent', { configurable: true, value: FakeDeviceOrientationEvent });

const event = (extra = {}) => {
    let prevented = false;
    return {
        ...extra,
        get defaultPrevented() {
            return prevented;
        },
        preventDefault() {
            prevented = true;
        },
    };
};

const emitKey = (code, type = 'keydown') => {
    const next = event({ code });
    windowFake.emit(type, next);
    return next;
};

const makeTouchRoot = () => {
    const throttle = new FakeElement({ rect: { left: 10, top: 100, width: 40, height: 200 } });
    const throttleThumb = new FakeElement();
    const fire = new FakeElement({ dataset: { touchAction: 'fire' } });
    const missile = new FakeElement({ dataset: { touchAction: 'missile' } });
    const launcher = new FakeElement({ dataset: { touchAction: 'launcherCycle' } });
    const scan = new FakeElement({ dataset: { touchAction: 'scan' } });
    const stick = new FakeElement({ rect: { left: 0, top: 0, width: 100, height: 100 }, offsetWidth: 100 });
    const stickKnob = new FakeElement({ offsetWidth: 20 });
    return {
        root: new FakeRoot({ throttle, throttleThumb, stick, stickKnob, touchButtons: [fire, missile, launcher, scan] }),
        throttle,
        throttleThumb,
        fire,
        missile,
        launcher,
        scan,
        stick,
        stickKnob,
    };
};

const makePad = ({ axes = [0, 0, 0, 0], pressed = [], connected = true } = {}) => ({
    connected,
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index) })),
});

const setScreenAngle = (angle) => {
    screenFake.orientation.angle = angle;
    windowFake.orientation = angle;
};

const tests = [];
const test = (name, callback) => tests.push([name, callback]);
const createdInputs = new Set();
const createInput = (root) => {
    const input = new InputManager(root);
    createdInputs.add(input);
    return input;
};

test('keyboard axes, holds, edge actions, and browser-default prevention', () => {
    const input = createInput(new FakeRoot());
    assert.equal(emitKey('KeyD').defaultPrevented, true, 'WASD keys are reserved for flight');
    assert.equal(input.getActions().yaw, 1);
    emitKey('KeyA');
    assert.equal(input.getActions().yaw, 0, 'opposing yaw keys cancel');
    emitKey('KeyD', 'keyup');
    assert.equal(input.getActions().yaw, -1);
    emitKey('KeyA', 'keyup');

    for (const [code, expectedAxis] of [['KeyW', -1], ['KeyS', 1], ['KeyE', 1], ['KeyQ', -1]]) {
        const down = emitKey(code);
        assert.equal(down.defaultPrevented, ['KeyW', 'KeyS'].includes(code));
        const actions = input.getActions();
        const key = ['KeyW', 'KeyS'].includes(code) ? 'pitch' : 'roll';
        assert.equal(actions[key], expectedAxis, `${code} maps to ${key}`);
        emitKey(code, 'keyup');
    }
    emitKey('KeyR');
    assert.equal(input.getActions().throttleDelta, 0.46);
    emitKey('KeyR', 'keyup');
    emitKey('KeyF');
    assert.equal(input.getActions().throttleDelta, -0.46);
    emitKey('KeyF', 'keyup');

    emitKey('Space');
    assert.equal(input.getActions().fire, true);
    assert.equal(input.getActions().fire, true, 'fire is held, not an edge');
    emitKey('Space', 'keyup');
    assert.equal(input.getActions().fire, false);
    emitKey('ShiftLeft');
    assert.equal(input.getActions().afterburner, true);
    emitKey('ShiftLeft', 'keyup');
    emitKey('KeyM');
    assert.equal(input.getActions().missile, true);
    assert.equal(input.getActions().utility, true, 'KeyM remains the legacy utility hold');
    assert.equal(input.getActions().missile, false, 'missile fires once per press');
    emitKey('KeyM', 'keyup');
    assert.equal(input.getActions().utility, false);

    const edges = [
        ['KeyX', 'weaponCycle'], ['KeyL', 'launcherCycle'], ['KeyT', 'targetNext'], ['KeyH', 'targetNearestHostile'],
        ['KeyC', 'cycleMode'], ['KeyN', 'navNext'], ['KeyJ', 'autopilot'], ['KeyB', 'transponder'],
        ['KeyG', 'jettison'], ['Escape', 'pause'], ['KeyK', 'map'],
    ];
    for (const [code, action] of edges) {
        emitKey(code);
        assert.equal(input.getActions()[action], true, `${code} triggers ${action}`);
        assert.equal(input.getActions()[action], false, `${action} is consumed`);
        emitKey(code, 'keyup');
    }
    assert.equal(emitKey('Space').defaultPrevented, true);
    emitKey('Space', 'keyup');
    assert.equal(emitKey('ArrowUp').defaultPrevented, true);
    emitKey('ArrowUp', 'keyup');
    assert.equal(emitKey('Tab').defaultPrevented, true);
    emitKey('Tab', 'keyup');
    assert.equal(emitKey('KeyJ').defaultPrevented, false, 'navigation edge does not steal browser shortcuts');
    emitKey('KeyJ', 'keyup');
    input.dispose();
});

test('touch holds, touch edges, throttle slider, joystick, and vibration', () => {
    vibrationCalls.length = 0;
    const controls = makeTouchRoot();
    const input = createInput(controls.root);
    const fireDown = event({ pointerId: 1 });
    controls.fire.emit('pointerdown', fireDown);
    assert.equal(fireDown.defaultPrevented, true);
    assert.equal(controls.fire.capturedPointer, 1);
    assert.equal(controls.fire.classList.contains('is-active'), true);
    assert.equal(vibrationCalls.at(-1), 8);
    assert.equal(input.getActions().fire, true);
    controls.fire.emit('pointerup', event({ pointerId: 1 }));
    assert.equal(input.getActions().fire, false);

    controls.missile.emit('pointerdown', event({ pointerId: 2 }));
    assert.equal(input.getActions().missile, true);
    assert.equal(input.getActions().missile, false);
    controls.missile.emit('pointerup', event({ pointerId: 2 }));
    controls.launcher.emit('pointerdown', event({ pointerId: 5 }));
    assert.equal(input.getActions().launcherCycle, true);
    assert.equal(input.getActions().launcherCycle, false, 'launcher selector is an edge');
    controls.launcher.emit('pointerup', event({ pointerId: 5 }));
    controls.scan.emit('pointerdown', event({ pointerId: 3 }));
    assert.equal(input.getActions().scan, true);
    assert.equal(input.getActions().scan, false);
    controls.scan.emit('pointerleave', event({ pointerId: 3, buttons: 0 }));

    controls.fire.emit('pointerdown', event({ pointerId: 4 }));
    controls.fire.emit('pointerleave', event({ pointerId: 4, buttons: 0 }));
    assert.equal(input.getActions().fire, false, 'leaving with no buttons releases a held action');

    controls.throttle.emit('pointerdown', event({ pointerId: 10, clientY: 150 }));
    assert.equal(controls.throttle.capturedPointer, 10);
    assert.equal(input.throttleSet, 0.75);
    assert.equal(controls.throttleThumb.style.bottom, '75%');
    controls.throttle.emit('pointermove', event({ pointerId: 99, clientY: 300 }));
    assert.equal(input.throttleSet, 0.75, 'another pointer cannot hijack throttle');
    controls.throttle.emit('pointermove', event({ pointerId: 10, clientY: 300 }));
    assert.equal(input.throttleSet, 0);
    assert.equal(input.getActions().throttleSet, 0);
    assert.equal(input.getActions().throttleSet, undefined, 'throttle set is an edge value');
    controls.throttle.emit('pointerup', event({ pointerId: 10 }));
    assert.equal(input.activeThrottlePointer, undefined);

    controls.stick.emit('pointerdown', event({ pointerId: 20, clientX: 100, clientY: 50 }));
    assert.equal(input.getActions().yaw, 1);
    assert.equal(controls.stickKnob.style.left, 'calc(50% + 40px)');
    controls.stick.emit('pointerup', event({ pointerId: 20 }));
    assert.equal(input.getActions().yaw, 0);
    assert.equal(controls.stickKnob.style.left, '50%');
    assert.equal(controls.stickKnob.style.top, '50%');
    input.dispose();
});

test('blur clears held and pending input state', () => {
    const controls = makeTouchRoot();
    const input = createInput(controls.root);
    emitKey('Space');
    emitKey('KeyT');
    controls.fire.emit('pointerdown', event({ pointerId: 31 }));
    controls.scan.emit('pointerdown', event({ pointerId: 32 }));
    controls.throttle.emit('pointerdown', event({ pointerId: 33, clientY: 120 }));
    controls.stick.emit('pointerdown', event({ pointerId: 34, clientX: 100, clientY: 50 }));
    windowFake.emit('blur');
    const actions = input.getActions();
    assert.equal(actions.pitch, 0);
    assert.equal(actions.yaw, 0);
    assert.equal(actions.fire, false);
    assert.equal(actions.scan, false);
    assert.equal(actions.targetNext, false);
    assert.equal(actions.throttleSet, undefined);
    assert.equal(input.activeThrottlePointer, undefined);
    assert.equal(controls.stickKnob.style.left, '50%');
    assert.equal(controls.stickKnob.style.top, '50%');
    input.dispose();
});

test('gamepad axes, deadzones, held buttons, and edge buttons', () => {
    const input = createInput(new FakeRoot());
    gamepads = [null, makePad({
        axes: [0.12, -0.12, 0.13, -1],
        pressed: [0, 1, 2, 3, 5, 7, 8, 9, 10, 12, 13, 14, 15],
    })];
    const first = input.getActions();
    assert.equal(input.usingGamepad, true);
    assert.equal(first.yaw, 0, 'sub-deadzone yaw is neutral');
    assert.equal(first.pitch, 0, 'sub-deadzone pitch is neutral');
    assert.equal(first.roll, 0.13, 'the deadzone boundary remains active');
    assert.equal(first.throttleDelta, 0.42);
    assert.equal(first.fire, true);
    assert.equal(first.missile, true);
    assert.equal(first.weaponCycle, true);
    assert.equal(first.launcherCycle, true);
    assert.equal(first.targetNext, true);
    assert.equal(first.cycleMode, true);
    assert.equal(first.autopilot, true);
    assert.equal(first.transponder, true);
    assert.equal(first.capture, true);
    assert.equal(first.targetNearestHostile, true);
    assert.equal(first.navNext, true);
    assert.equal(first.pause, true);
    assert.equal(first.map, true);
    assert.equal(first.utility, true, 'button 5 is also the utility hold');
    assert.equal(input.getActions().missile, false, 'gamepad missile is an edge');
    assert.equal(input.getActions().fire, true, 'gamepad fire is held');

    gamepads = [makePad({ axes: [0, 0, 0, 0], pressed: [] })];
    assert.equal(input.getActions().fire, false);
    assert.equal(input.usingGamepad, true);
    gamepads = [];
    assert.equal(input.getActions().fire, false);
    assert.equal(input.usingGamepad, false);
    gamepads = [makePad({ pressed: [5] })];
    assert.equal(input.getActions().missile, true, 'disconnect clears the edge latch');
    input.dispose();
    gamepads = [];
});

test('a connected gamepad without axes or buttons fails safely', () => {
    const input = createInput(new FakeRoot());
    gamepads = [{ connected: true }];
    assert.doesNotThrow(() => input.getActions(), 'a connected pad without axes must be ignored safely');
    gamepads = [{ connected: true, axes: [] }];
    assert.doesNotThrow(() => input.getActions(), 'a connected pad without buttons must be ignored safely');
    input.dispose();
    gamepads = [];
});

test('non-finite gamepad axes fall back to finite neutral controls', () => {
    const input = createInput(new FakeRoot());
    gamepads = [makePad({ axes: [NaN, 'not-a-number', null, Infinity] })];
    const actions = input.getActions();
    assert.equal(Number.isFinite(actions.yaw), true);
    assert.equal(Number.isFinite(actions.pitch), true);
    assert.equal(Number.isFinite(actions.roll), true);
    assert.equal(Number.isFinite(actions.throttleDelta), true);
    input.dispose();
    gamepads = [];
});

test('tilt permission, rotation, calibration, sensitivity, inversion, and malformed readings', async () => {
    setScreenAngle(0);
    FakeDeviceOrientationEvent.requestPermission = async () => 'granted';
    const input = createInput(new FakeRoot());
    assert.equal(input.tiltSupported, true);
    assert.equal(input.tiltActive, false);
    assert.equal(await input.enableTilt(), true);
    assert.equal(input.calibrateTilt(), undefined, 'neutral cannot be captured before the first real sensor sample');
    windowFake.emit('deviceorientation', { beta: Infinity, gamma: 2 });
    windowFake.emit('deviceorientation', { beta: 2, gamma: undefined });
    assert.equal(input.tiltSeen, false, 'non-finite device readings are ignored');
    const firstSample = input.waitForTiltSample(50);
    windowFake.emit('deviceorientation', { beta: 8, gamma: -4 });
    assert.equal(await firstSample, true, 'activation can wait for the first usable sensor sample');
    assert.equal(input.tiltSeen, true);
    assert.equal(input.tiltBeta, 8, 'the first beta sample is used directly instead of smoothing from zero');
    assert.equal(input.tiltGamma, -4, 'the first gamma sample is used directly instead of smoothing from zero');
    assert.equal(input.tiltActive, false, 'tilt needs calibration before steering');
    const neutral = input.calibrateTilt();
    assert.equal(input.tiltActive, true);
    assert.deepEqual(neutral, { beta: input.tiltNeutralBeta, gamma: input.tiltNeutralGamma, angle: 0 });

    input.configureTilt({ tiltSensitivity: 1.2, tiltInvertPitch: false, tiltInvertYaw: false });
    input.tiltBeta = input.tiltNeutralBeta + 10;
    input.tiltGamma = input.tiltNeutralGamma - 10;
    const steering = input.tiltSteering();
    assert.ok(Math.abs(steering.pitch + 0.6) < 1e-9);
    assert.ok(Math.abs(steering.yaw - 0.6) < 1e-9);
    input.tiltBeta = input.tiltNeutralBeta + 2;
    input.tiltGamma = input.tiltNeutralGamma - 2;
    const deadzone = input.tiltSteering();
    assert.ok(Math.abs(deadzone.pitch) < 1e-9, 'small pitch tilt stays inside the deadzone');
    assert.ok(Math.abs(deadzone.yaw) < 1e-9, 'small yaw tilt stays inside the deadzone');

    input.configureTilt({ tiltSensitivity: 2, tiltInvertPitch: true, tiltInvertYaw: true });
    input.tiltBeta = input.tiltNeutralBeta + 20;
    input.tiltGamma = input.tiltNeutralGamma - 20;
    assert.deepEqual(input.tiltSteering(), { pitch: 1, yaw: -1 }, 'inversion flips and sensitivity clamps');
    emitKey('KeyD');
    emitKey('KeyS');
    const actions = input.getActions();
    assert.equal(actions.yaw, -1, 'tilt yaw takes priority over keyboard yaw');
    assert.equal(actions.pitch, 1, 'tilt pitch takes priority over keyboard pitch');
    emitKey('KeyD', 'keyup');
    emitKey('KeyS', 'keyup');
    input.dispose();

    const rotated = createInput(new FakeRoot());
    setScreenAngle(90);
    windowFake.emit('deviceorientation', { beta: 10, gamma: 0 });
    assert.ok(Math.abs(rotated.tiltBeta) < 1e-8, 'landscape rotation maps raw beta away from screen beta');
    assert.ok(rotated.tiltGamma < 0, 'landscape rotation preserves the expected screen yaw sign');
    rotated.dispose();
    setScreenAngle(0);

    FakeDeviceOrientationEvent.requestPermission = async () => 'denied';
    const denied = createInput(new FakeRoot());
    assert.equal(await denied.enableTilt(), false);
    assert.equal(denied.tiltEnabled, false);
    denied.dispose();
    FakeDeviceOrientationEvent.requestPermission = async () => 'granted';
});

test('tilt gracefully falls back when the device API is absent', async () => {
    const previous = globalThis.DeviceOrientationEvent;
    Object.defineProperty(globalThis, 'DeviceOrientationEvent', { configurable: true, value: undefined });
    const input = createInput(new FakeRoot());
    assert.equal(input.tiltSupported, false);
    assert.equal(await input.enableTilt(), false);
    assert.equal(input.tiltActive, false);
    input.dispose();
    Object.defineProperty(globalThis, 'DeviceOrientationEvent', { configurable: true, value: previous });
});

let failures = 0;
for (const [name, callback] of tests) {
    try {
        await callback();
        console.log(`ok - ${name}`);
    }
    catch (error) {
        failures += 1;
        console.error(`FAIL - ${name}`);
        console.error(error);
    }
    for (const input of createdInputs)
        input.dispose();
    createdInputs.clear();
    gamepads = [];
    setScreenAngle(0);
}
if (failures > 0) {
    console.error(`${failures} input test group(s) failed`);
    process.exitCode = 1;
}
else {
    console.log(`all input assertions passed (${tests.length} groups)`);
}
