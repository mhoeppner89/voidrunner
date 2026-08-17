import { clamp } from './random.js';

const HOLD_ACTIONS = new Set(['fire', 'afterburner']);
const TILT_DEADZONE = 2.5;
const TILT_FULL_RANGE = 15;
const wrapAngle = (value) => {
    while (value > 180)
        value -= 360;
    while (value < -180)
        value += 360;
    return value;
};

export class InputManager {
    root;
    keys = new Set();
    pressed = new Set();
    touchHeld = new Set();
    touchEdges = new Set();
    joystickX = 0;
    joystickY = 0;
    joystickKnob;
    throttleSet;
    activeThrottlePointer;
    gamepadButtons = new Map();
    gamepadConnected = false;
    tiltSupported = false;
    tiltEnabled = false;
    tiltSeen = false;
    tiltCalibrated = false;
    tiltBeta = 0;
    tiltGamma = 0;
    tiltNeutralBeta = 0;
    tiltNeutralGamma = 0;
    tiltSensitivity = 1.35;
    tiltInvertPitch = false;
    tiltInvertYaw = false;
    constructor(root) {
        this.root = root;
        window.addEventListener('keydown', this.onKeyDown, { passive: false });
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        this.bindTouchControls();
        this.bindTilt();
    }
    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('deviceorientation', this.onDeviceOrientation);
    }
    onKeyDown = (event) => {
        const code = event.code;
        if (!this.keys.has(code))
            this.pressed.add(code);
        this.keys.add(code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab'].includes(code)) {
            event.preventDefault();
        }
    };
    onKeyUp = (event) => {
        this.keys.delete(event.code);
    };
    onBlur = () => {
        this.keys.clear();
        this.touchHeld.clear();
        this.joystickX = 0;
        this.joystickY = 0;
        if (this.joystickKnob) {
            this.joystickKnob.style.left = '50%';
            this.joystickKnob.style.top = '50%';
        }
    };
    // ---- tilt (device orientation) steering ----
    bindTilt() {
        this.tiltSupported = typeof DeviceOrientationEvent !== 'undefined';
        if (this.tiltSupported)
            window.addEventListener('deviceorientation', this.onDeviceOrientation, { passive: true });
    }
    // Current screen orientation in degrees (0 = portrait, ±90 = landscape).
    // The deviceorientation event always reports tilt in the DEVICE frame
    // (portrait axes), so the screen frame — the frame the player actually
    // steers in — is a rotation of (beta, gamma) by this angle.
    screenOrientationAngle() {
        return screen?.orientation?.angle ?? window.orientation ?? 0;
    }
    onDeviceOrientation = (event) => {
        if (event.beta == null || event.gamma == null)
            return;
        this.tiltSeen = true;
        // Rotate the device-frame tilt into the screen frame so steering feels
        // identical in portrait, landscape-primary and landscape-secondary.
        // Without this, holding the phone sideways (the game locks landscape)
        // swaps the pitch/yaw axes: rolling steers the nose and tilting the
        // phone forward steers the wheel.
        const radians = (this.screenOrientationAngle() * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const beta = event.beta * cos + event.gamma * sin;
        const gamma = -event.beta * sin + event.gamma * cos;
        this.tiltBeta += (beta - this.tiltBeta) * 0.35;
        this.tiltGamma += (gamma - this.tiltGamma) * 0.35;
    };
    // alreadyGranted: the player granted gyroscope permission from the title
    // screen this session, so skip the (user-gesture-gated) re-request — the
    // permission call would otherwise fail outside a tap, e.g. at session start.
    async enableTilt(alreadyGranted = false) {
        if (!this.tiltSupported) {
            this.tiltEnabled = false;
            return false;
        }
        const request = DeviceOrientationEvent.requestPermission;
        if (typeof request === 'function' && !alreadyGranted) {
            try {
                const state = await request.call(DeviceOrientationEvent);
                if (state !== 'granted') {
                    this.tiltEnabled = false;
                    return false;
                }
            }
            catch {
                this.tiltEnabled = false;
                return false;
            }
        }
        this.tiltEnabled = true;
        return true;
    }
    disableTilt() {
        // Stops tilt from driving the ship without losing the stored neutral
        // and calibration, so re-enabling later is instant (no re-setup).
        this.tiltEnabled = false;
    }
    calibrateTilt() {
        this.tiltNeutralBeta = this.tiltBeta;
        this.tiltNeutralGamma = this.tiltGamma;
        this.tiltCalibrated = true;
        return { beta: this.tiltNeutralBeta, gamma: this.tiltNeutralGamma };
    }
    configureTilt(settings = {}) {
        if (settings.tiltSensitivity !== undefined)
            this.tiltSensitivity = Number(settings.tiltSensitivity);
        if (settings.tiltInvertPitch !== undefined)
            this.tiltInvertPitch = Boolean(settings.tiltInvertPitch);
        if (settings.tiltInvertYaw !== undefined)
            this.tiltInvertYaw = Boolean(settings.tiltInvertYaw);
        if (settings.tiltNeutral) {
            this.tiltNeutralBeta = Number(settings.tiltNeutral.beta ?? 0);
            this.tiltNeutralGamma = Number(settings.tiltNeutral.gamma ?? 0);
            this.tiltCalibrated = true;
        }
    }
    tiltSteering() {
        // Roll (gamma) steers yaw like a wheel, pitch (beta) steers the nose.
        // Beta/gamma are already screen-frame (see onDeviceOrientation), so the
        // wheel and nose stay on the physical axes the player perceives.
        const curve = (value) => {
            const magnitude = Math.abs(value);
            if (magnitude < TILT_DEADZONE)
                return 0;
            const t = clamp((magnitude - TILT_DEADZONE) / TILT_FULL_RANGE, 0, 1);
            return Math.sign(value) * t * this.tiltSensitivity;
        };
        // Inverted by default: the base mapping negates the raw device tilt,
        // and the invert checkboxes flip it back the other way when the player
        // opts out of the inverted default.
        let pitch = -curve(wrapAngle(this.tiltBeta - this.tiltNeutralBeta));
        let yaw = -curve(wrapAngle(this.tiltGamma - this.tiltNeutralGamma));
        if (this.tiltInvertPitch)
            pitch = -pitch;
        if (this.tiltInvertYaw)
            yaw = -yaw;
        return { pitch: clamp(pitch, -1, 1), yaw: clamp(yaw, -1, 1) };
    }
    get tiltActive() {
        return this.tiltSupported && this.tiltEnabled && this.tiltSeen && this.tiltCalibrated;
    }
    bindTouchControls() {
        const throttle = this.root.querySelector('[data-touch-throttle]');
        const thumb = this.root.querySelector('[data-touch-throttle-thumb]');
        if (throttle && thumb) {
            const update = (event) => {
                const rect = throttle.getBoundingClientRect();
                const value = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
                this.throttleSet = value;
                thumb.style.bottom = `${value * 100}%`;
            };
            throttle.addEventListener('pointerdown', (event) => {
                this.activeThrottlePointer = event.pointerId;
                throttle.setPointerCapture(event.pointerId);
                update(event);
            });
            throttle.addEventListener('pointermove', (event) => {
                if (event.pointerId === this.activeThrottlePointer)
                    update(event);
            });
            const release = (event) => {
                if (event.pointerId === this.activeThrottlePointer)
                    this.activeThrottlePointer = undefined;
            };
            throttle.addEventListener('pointerup', release);
            throttle.addEventListener('pointercancel', release);
        }
        this.root.querySelectorAll('[data-touch-action]').forEach((button) => {
            const action = button.dataset.touchAction;
            if (!action)
                return;
            const press = (event) => {
                event.preventDefault();
                button.setPointerCapture(event.pointerId);
                button.classList.add('is-active');
                if (HOLD_ACTIONS.has(action)) {
                    this.touchHeld.add(action);
                }
                else {
                    this.touchEdges.add(action);
                }
                if (navigator.vibrate)
                    navigator.vibrate(8);
            };
            const release = (event) => {
                event.preventDefault();
                button.classList.remove('is-active');
                this.touchHeld.delete(action);
            };
            button.addEventListener('pointerdown', press);
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('pointerleave', (event) => {
                if (event.buttons === 0)
                    release(event);
            });
        });
        const stick = this.root.querySelector('[data-touch-stick]');
        const knob = this.root.querySelector('[data-touch-stick-knob]');
        if (stick && knob) {
            this.joystickKnob = knob;
            let stickPointer;
            const centerStick = () => {
                stickPointer = undefined;
                this.joystickX = 0;
                this.joystickY = 0;
                knob.style.left = '50%';
                knob.style.top = '50%';
            };
            const moveStick = (event) => {
                const rect = stick.getBoundingClientRect();
                const scale = stick.offsetWidth > 0 ? rect.width / stick.offsetWidth : 1;
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const halfTravel = Math.max(1, (stick.offsetWidth - knob.offsetWidth) / 2);
                const dx = clamp((event.clientX - cx) / scale, -halfTravel, halfTravel);
                const dy = clamp((event.clientY - cy) / scale, -halfTravel, halfTravel);
                this.joystickX = dx / halfTravel;
                this.joystickY = dy / halfTravel;
                knob.style.left = `calc(50% + ${dx}px)`;
                knob.style.top = `calc(50% + ${dy}px)`;
            };
            stick.addEventListener('pointerdown', (event) => {
                stickPointer = event.pointerId;
                stick.setPointerCapture(event.pointerId);
                moveStick(event);
            });
            stick.addEventListener('pointermove', (event) => {
                if (event.pointerId === stickPointer)
                    moveStick(event);
            });
            const releaseStick = (event) => {
                if (event.pointerId === stickPointer)
                    centerStick();
            };
            stick.addEventListener('pointerup', releaseStick);
            stick.addEventListener('pointercancel', releaseStick);
        }
    }
    keyAxis(positive, negative) {
        const pos = positive.some((code) => this.keys.has(code)) ? 1 : 0;
        const neg = negative.some((code) => this.keys.has(code)) ? 1 : 0;
        return pos - neg;
    }
    consumePressed(...codes) {
        const hit = codes.some((code) => this.pressed.has(code));
        codes.forEach((code) => this.pressed.delete(code));
        return hit;
    }
    consumeTouch(action) {
        const hit = this.touchEdges.has(action);
        this.touchEdges.delete(action);
        return hit;
    }
    gamepadEdge(buttonIndex, pressed) {
        const previous = this.gamepadButtons.get(buttonIndex) ?? false;
        this.gamepadButtons.set(buttonIndex, pressed);
        return pressed && !previous;
    }
    readGamepad() {
        const pads = navigator.getGamepads?.() ?? [];
        const pad = Array.from(pads).find((entry) => Boolean(entry && entry.connected));
        if (!pad) {
            this.gamepadConnected = false;
            this.gamepadButtons.clear();
            return {};
        }
        this.gamepadConnected = true;
        const deadzone = (value) => (Math.abs(value) < 0.13 ? 0 : value);
        const button = (index) => Boolean(pad.buttons[index]?.pressed);
        return {
            yaw: deadzone(pad.axes[0] ?? 0),
            pitch: deadzone(pad.axes[1] ?? 0),
            roll: deadzone(pad.axes[2] ?? 0),
            throttleDelta: -deadzone(pad.axes[3] ?? 0) * 0.42,
            fire: button(7),
            missile: this.gamepadEdge(5, button(5)),
            afterburner: button(4),
            targetNext: this.gamepadEdge(0, button(0)),
            cycleMode: this.gamepadEdge(1, button(1)),
            autopilot: this.gamepadEdge(3, button(3)),
            scan: this.gamepadEdge(12, button(12)),
            targetNearestHostile: this.gamepadEdge(13, button(13)),
            navNext: this.gamepadEdge(15, button(15)),
            pause: this.gamepadEdge(9, button(9)),
            map: this.gamepadEdge(8, button(8)),
        };
    }
    getActions() {
        const gamepad = this.readGamepad();
        const yawKeyboard = this.keyAxis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
        const pitchKeyboard = this.keyAxis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        const rollKeyboard = this.keyAxis(['KeyE'], ['KeyQ']);
        const throttleKeyboard = this.keyAxis(['KeyR', 'Equal', 'NumpadAdd'], ['KeyF', 'Minus', 'NumpadSubtract']);
        const tilt = this.tiltActive ? this.tiltSteering() : undefined;
        const throttleSet = this.throttleSet;
        this.throttleSet = undefined;
        return {
            pitch: clamp(tilt ? tilt.pitch : (this.joystickY || pitchKeyboard || gamepad.pitch || 0), -1, 1),
            yaw: clamp(tilt ? tilt.yaw : (this.joystickX || yawKeyboard || gamepad.yaw || 0), -1, 1),
            roll: clamp((this.touchHeld.has('roll-right') ? 1 : 0) - (this.touchHeld.has('roll-left') ? 1 : 0) || rollKeyboard || gamepad.roll || 0, -1, 1),
            throttleDelta: throttleKeyboard * 0.46 + (gamepad.throttleDelta ?? 0),
            throttleSet,
            fire: this.keys.has('Space') || this.touchHeld.has('fire') || Boolean(gamepad.fire),
            missile: this.consumePressed('KeyM') || this.consumeTouch('missile') || Boolean(gamepad.missile),
            afterburner: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchHeld.has('afterburner') || Boolean(gamepad.afterburner),
            targetNext: this.consumePressed('KeyT', 'Tab') || this.consumeTouch('targetNext') || Boolean(gamepad.targetNext),
            targetNearestHostile: this.consumePressed('KeyH') || this.consumeTouch('targetNearestHostile') || Boolean(gamepad.targetNearestHostile),
            cycleMode: this.consumePressed('KeyC') || this.consumeTouch('cycleMode') || Boolean(gamepad.cycleMode),
            navNext: this.consumePressed('KeyN') || this.consumeTouch('navNext') || Boolean(gamepad.navNext),
            autopilot: this.consumePressed('KeyJ') || this.consumeTouch('autopilot') || Boolean(gamepad.autopilot),
            scan: this.consumePressed('KeyV') || this.consumeTouch('scan') || Boolean(gamepad.scan),
            pause: this.consumePressed('Escape', 'KeyP') || this.consumeTouch('pause') || Boolean(gamepad.pause),
            map: this.consumePressed('KeyK') || this.consumeTouch('map') || Boolean(gamepad.map),
        };
    }
    get usingGamepad() {
        return this.gamepadConnected;
    }
}
