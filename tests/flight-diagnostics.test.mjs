import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFlightCapture, flightPhase } from '../src/game/flightDiagnostics.js';

function fixture() {
    let time = 0, hidden = false;
    const work = ms => { time += ms; };
    const runtime = {
        save: { player: {}, settings: { quality: 'high', powerMode: 'performance' } },
        renderer: { canvas: { width: 640, height: 360 }, lastQualityScale: .82,
            render() { work(2); }, syncShips() { work(1); } },
        ui: { updateHud() { work(1); } }, ships: [], projectiles: [], renderFrameCount: 0,
        updateSimulation() { work(3); },
        syncRender() { this.renderer.syncShips(); this.renderer.render(); this.ui.updateHud(); this.renderFrameCount++; },
        frameBody(now, render = true) { this.updateSimulation(); if (render) this.syncRender(); return now; },
        dispose() { this.disposed = true; return 42; },
    };
    return { runtime, options: { clock: () => time, isHidden: () => hidden },
        frame(now, render = true) { time = now; return runtime.frameBody(now, render); },
        hide(value) { hidden = value; } };
}

test('capture classifies local hyperdrive and gate travel without advancing FX state', () => {
    const { runtime } = fixture();
    runtime.hyperdriveFxState = () => { throw new Error('must not evaluate mutating FX getter'); };
    assert.equal(flightPhase(runtime), 'normal-flight');
    runtime.hyperdriveFx = 'spooling'; assert.equal(flightPhase(runtime), 'hyperdrive-spool');
    runtime.autopilot = true; runtime.hyperdriveFx = 'active'; assert.equal(flightPhase(runtime), 'local-hyperdrive');
    runtime.galaxyJump = {}; assert.equal(flightPhase(runtime), 'gate-jump');
    runtime.ui.isModalOpen = true; assert.equal(flightPhase(runtime), 'modal');
    runtime.save.player.dockedAt = 'home'; assert.equal(flightPhase(runtime), 'docked');
});

test('separates callback/render cadence, inclusive stages and independent report copies', () => {
    const f = fixture(), original = f.runtime.frameBody;
    const capture = startFlightCapture(f.runtime, { ...f.options, profile: true });
    assert.equal(f.frame(0), 0); f.frame(16, false); f.frame(32);
    const report = capture.stop();
    assert.equal(f.runtime.frameBody, original);
    assert.equal(capture.running, false);
    const phase = report.phases['normal-flight'];
    assert.equal(phase.animationCallbacks.medianMs, 16);
    assert.equal(phase.renderedFrames.medianMs, 32);
    assert.equal(phase.inclusiveStages.simulation.totalMs, 9);
    assert.equal(phase.inclusiveStages['render-sync-total'].totalMs, 8);
    assert.equal(phase.inclusiveStages['render-js-submission'].totalMs, 4);
    assert.equal(report.frames[0].width, 640);
    assert.equal(report.frames[0].qualityScale, .82);
    report.frames[0].width = 1;
    assert.equal(capture.report().frames[0].width, 640);
    assert.deepEqual(f.runtime.save.settings, { quality: 'high', powerMode: 'performance' });
});

test('phase boundaries and hidden tabs never enter stable phase interval averages', () => {
    const f = fixture(); const capture = startFlightCapture(f.runtime, f.options);
    f.frame(0); f.frame(16);
    f.runtime.autopilot = true;
    f.frame(32); f.frame(48);
    f.hide(true); f.frame(4000); f.hide(false);
    f.frame(5000); f.frame(5016);
    f.runtime.autopilot = false; f.frame(5032);
    const report = capture.stop();
    assert.equal(report.phases['local-hyperdrive'].animationCallbacks.frames, 2);
    assert.equal(report.phases['local-hyperdrive'].animationCallbacks.worstMs, 16);
    assert.equal(report.phases['normal-flight'].renderedFrames.frames, 1);
    assert.equal(report.frames.at(-1).renderIntervalMs, null);
    assert.deepEqual(report.frames[0].stages, {});
});

test('a phase changing inside a frame is labeled as transition and excluded', () => {
    const f = fixture();
    f.runtime.frameBody = function () { this.galaxyJump = {}; };
    const c = startFlightCapture(f.runtime, f.options); f.frame(0);
    const report = c.stop();
    assert.equal(report.frames[0].transition, true);
    assert.equal(report.phases['normal-flight'].transitionsExcluded, 1);
    assert.equal(report.phases['normal-flight'].animationCallbacks, null);
});

test('bounded capture detaches automatically and does not overwrite later wrappers', () => {
    const f = fixture(), original = f.runtime.frameBody;
    const c = startFlightCapture(f.runtime, { ...f.options, maxFrames: 2 });
    assert.throws(() => startFlightCapture(f.runtime, f.options), /existing capture/);
    f.frame(0); f.frame(16); f.frame(32);
    assert.equal(c.count, 2); assert.equal(c.running, false);
    assert.equal(c.report().reason, 'sample-limit');
    assert.equal(f.runtime.frameBody, original);
    const second = startFlightCapture(f.runtime, f.options);
    const external = () => 'other-debugger'; f.runtime.frameBody = external;
    second.stop(); assert.equal(f.runtime.frameBody, external);
});

test('dispose restores inherited methods and preserves returns and original exceptions', () => {
    const f = fixture(), original = f.runtime.frameBody;
    const prototype = { frameBody: original }; delete f.runtime.frameBody;
    Object.setPrototypeOf(f.runtime, prototype);
    const c = startFlightCapture(f.runtime, { ...f.options, profile: true });
    f.runtime.updateSimulation = () => { throw new Error('simulation error'); };
    assert.throws(() => f.frame(0), /simulation error/);
    assert.equal(c.count, 1);
    assert.equal(f.runtime.dispose(), 42);
    assert.equal(c.running, false); assert.equal(c.report().reason, 'session-disposed');
    assert.equal(Object.hasOwn(f.runtime, 'frameBody'), false);
    assert.equal(f.runtime.frameBody, original);
    assert.throws(() => startFlightCapture({}, f.options), /Launch a flight/);
    assert.throws(() => startFlightCapture(f.runtime, { maxFrames: 1 }), /maxFrames/);
});
