import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ControllerUI } from '../../src/game/controllerUi.js';

test('an idle controller menu wakes on connection and never schedules hidden polling', t => {
    const window = new EventTarget();
    const document = Object.assign(new EventTarget(), { hidden: false });
    const root = Object.assign(new EventTarget(), { querySelector: () => null });
    const frames = new Map(), timers = new Map();
    let now = 0, nextId = 0, polls = 0, pad;
    const globals = {
        window, document,
        navigator: { getGamepads() { polls++; return [pad]; } },
        performance: { now: () => now },
        requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(callback, delay) { timers.set(++nextId, { callback, at: now + delay }); return nextId; },
        clearTimeout(id) { timers.delete(id); },
    };
    for (const [key, value] of Object.entries(globals)) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { configurable: true, value });
        t.after(() => descriptor
            ? Object.defineProperty(globalThis, key, descriptor)
            : delete globalThis[key]);
    }
    const flushFrame = timestamp => {
        assert.equal(frames.size, 1);
        const [id, callback] = frames.entries().next().value;
        frames.delete(id);
        callback(now = timestamp);
    };
    const flushTimer = () => {
        assert.equal(timers.size, 1);
        const [id, { callback, at }] = timers.entries().next().value;
        timers.delete(id);
        now = at;
        callback();
    };
    const controller = new ControllerUI({ root }, () => undefined, () => ({}));
    flushFrame(0);
    for (let i = 0; i < 8; i++) {
        assert.equal(frames.size, 0);
        flushTimer();
    }
    assert.equal(now, 1000);
    assert.equal(polls, 9);

    pad = { index: 0, id: 'test', connected: true };
    window.dispatchEvent(new Event('gamepadconnected'));
    assert.equal(timers.size, 0, 'connection cancels the idle timer');
    flushFrame(1034);
    assert.equal(controller.padIndex, 0);
    assert.equal(frames.size, 1, 'a connected controller keeps the active cadence');

    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('gamepadconnected'));
    assert.equal(frames.size + timers.size, 0);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    pad = undefined;
    flushFrame(2000);
    assert.equal(controller.padIndex, undefined);
    assert.equal(frames.size, 0);
    pad = { index: 1, id: 'fallback', connected: true };
    flushTimer();
    assert.equal(controller.padIndex, 1, 'an embedded browser can reveal a pad without a connection event');

    controller.dispose();
    window.dispatchEvent(new Event('gamepadconnected'));
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(frames.size + timers.size, 0);
});
