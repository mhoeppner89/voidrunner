import { clamp } from './random.js';
const HOLD_ACTIONS = new Set(['fire', 'afterburner', 'roll-left', 'roll-right']);
export class InputManager {
    root;
    keys = new Set();
    pressed = new Set();
    touchHeld = new Set();
    touchEdges = new Set();
    joystickX = 0;
    joystickY = 0;
    throttleSet;
    activeStickPointer;
    activeThrottlePointer;
    gamepadButtons = new Map();
    gamepadConnected = false;
    constructor(root) {
        this.root = root;
        window.addEventListener('keydown', this.onKeyDown, { passive: false });
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        this.bindTouchControls();
    }
    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
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
    };
    bindTouchControls() {
        const pad = this.root.querySelector('[data-touch-stick]');
        const knob = this.root.querySelector('[data-touch-stick-knob]');
        if (pad && knob) {
            const update = (event) => {
                const rect = pad.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const max = rect.width * 0.34;
                const dx = event.clientX - cx;
                const dy = event.clientY - cy;
                const length = Math.hypot(dx, dy);
                const scale = length > max ? max / length : 1;
                const nx = (dx * scale) / max;
                const ny = (dy * scale) / max;
                this.joystickX = clamp(nx, -1, 1);
                this.joystickY = clamp(ny, -1, 1);
                knob.style.transform = `translate(${this.joystickX * max}px, ${this.joystickY * max}px)`;
            };
            pad.addEventListener('pointerdown', (event) => {
                this.activeStickPointer = event.pointerId;
                pad.setPointerCapture(event.pointerId);
                update(event);
            });
            pad.addEventListener('pointermove', (event) => {
                if (event.pointerId === this.activeStickPointer)
                    update(event);
            });
            const release = (event) => {
                if (event.pointerId !== this.activeStickPointer)
                    return;
                this.activeStickPointer = undefined;
                this.joystickX = 0;
                this.joystickY = 0;
                knob.style.transform = 'translate(0, 0)';
            };
            pad.addEventListener('pointerup', release);
            pad.addEventListener('pointercancel', release);
        }
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
            interact: this.gamepadEdge(2, button(2)),
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
        const throttleSet = this.throttleSet;
        this.throttleSet = undefined;
        return {
            pitch: clamp(this.joystickY || pitchKeyboard || gamepad.pitch || 0, -1, 1),
            yaw: clamp(this.joystickX || yawKeyboard || gamepad.yaw || 0, -1, 1),
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
            interact: this.consumePressed('KeyG', 'Enter') || this.consumeTouch('interact') || Boolean(gamepad.interact),
            scan: this.consumePressed('KeyV') || this.consumeTouch('scan') || Boolean(gamepad.scan),
            pause: this.consumePressed('Escape', 'KeyP') || this.consumeTouch('pause') || Boolean(gamepad.pause),
            map: this.consumePressed('KeyK') || this.consumeTouch('map') || Boolean(gamepad.map),
        };
    }
    get usingGamepad() {
        return this.gamepadConnected;
    }
}
