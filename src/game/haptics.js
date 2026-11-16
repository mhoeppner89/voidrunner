import { connectedGamepad } from './gamepad.js';

const bounded = (value, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : min;
export function gamepadActuator(pad) {
    const actuator = pad?.vibrationActuator ?? pad?.hapticActuators?.[0];
    if (typeof actuator?.playEffect === 'function') {
        if (actuator.effects && !actuator.effects.includes('dual-rumble')) return undefined;
        return actuator;
    }
    return typeof actuator?.pulse === 'function' ? actuator : undefined;
}

// Event-driven, bounded pulses. Low-priority gunfire never replaces a hit,
// and multiple barrels/pellets cannot issue dozens of motor commands per frame.
export class Haptics {
    constructor(enabled, activePad, now = () => performance.now()) {
        this.enabled = enabled;
        this.activePad = activePad;
        this.now = now;
        this.until = 0;
        this.priority = -1;
        this.generation = 0;
    }
    play(actuator, duration, strong, weak) {
        this.actuator = actuator;
        return typeof actuator.playEffect === 'function'
            ? actuator.playEffect('dual-rumble', { startDelay: 0, duration, strongMagnitude: strong, weakMagnitude: weak })
            : actuator.pulse(Math.max(strong, weak), duration);
    }
    pulse(duration, strong, weak, priority = 0, phone = 0) {
        if (!this.enabled() || globalThis.document?.hidden) return false;
        const now = this.now();
        if (now < this.until && priority <= this.priority) return false;
        duration = bounded(duration, 1, 250);
        strong = bounded(strong, 0, 1); weak = bounded(weak, 0, 1);
        this.until = now + Math.max(duration, 90);
        this.priority = priority;
        const actuator = gamepadActuator(this.activePad());
        if (actuator && actuator !== this.failedActuator) {
            try {
                const generation = this.generation;
                Promise.resolve(this.play(actuator, duration, strong, weak)).then(result => { if (generation === this.generation && result === false) this.failedActuator = actuator; }, () => { if (generation === this.generation) this.failedActuator = actuator; });
                return true;
            } catch { this.failedActuator = actuator; }
        }
        if (phone && typeof globalThis.navigator?.vibrate === 'function' && (globalThis.navigator?.userActivation?.hasBeenActive ?? true)) {
            try { this.phoneActive = globalThis.navigator?.vibrate?.(phone) !== false; return Boolean(this.phoneActive); }
            catch { /* Phone vibration is optional too. */ }
        }
        return false;
    }
    stop() {
        this.generation++;
        this.failedActuator = undefined;
        this.until = 0;
        this.priority = -1;
        const actuator = this.actuator;
        this.actuator = undefined;
        if (actuator) {
            try {
                const result = typeof actuator.reset === 'function' ? actuator.reset()
                    : typeof actuator.pulse === 'function' ? actuator.pulse(0, 0)
                    : actuator.playEffect('dual-rumble', { duration: 0, startDelay: 0, strongMagnitude: 0, weakMagnitude: 0 });
                Promise.resolve(result).catch(() => {});
            } catch { /* Disconnected controllers can reject reset. */ }
        }
        if (this.phoneActive) {
            try { globalThis.navigator?.vibrate?.(0); } catch { /* optional */ }
            this.phoneActive = false;
        }
    }
    async test() {
        if (!this.enabled()) return 'disabled';
        if (globalThis.document?.hidden) return 'cancelled';
        const pad = this.activePad() ?? connectedGamepad();
        if (!pad) return 'not-connected';
        const actuator = gamepadActuator(pad);
        if (!actuator) return 'unsupported';
        this.stop();
        const generation = this.generation;
        this.failedActuator = undefined;
        this.until = this.now() + 300;
        this.priority = 3;
        let timer;
        try {
            const result = await Promise.race([
                Promise.resolve(this.play(actuator, 300, 0.55, 0.75)),
                new Promise(resolve => { timer = setTimeout(() => resolve(false), 1500); }),
            ]);
            if (generation !== this.generation || result === 'preempted') return 'cancelled';
            if (result === false) { this.stop(); return 'failed'; }
            return 'sent';
        } catch {
            if (generation !== this.generation) return 'cancelled';
            this.failedActuator = actuator; return 'failed';
        }
        finally { clearTimeout(timer); }
    }
}
