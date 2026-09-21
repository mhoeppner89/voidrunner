// Loaded only on an explicit debug request. No polling, GPU readbacks, telemetry,
// extra animation loop, or quality changes are installed during ordinary play.
import { summarizeFrames } from '../benchmark-metrics.js';

const activeCaptures = new WeakMap();
export function flightPhase(runtime) {
    if (runtime.save?.player?.dockedAt) return 'docked';
    if (runtime.ui?.isModalOpen) return 'modal';
    if (runtime.galaxyJump) return 'gate-jump';
    if (runtime.hyperdriveFx === 'spooling') return 'hyperdrive-spool';
    if (runtime.autopilot) return 'local-hyperdrive';
    if (runtime.hyperdriveFx === 'drop' || runtime.hyperdriveFx === 'interrupt') return 'hyperdrive-exit';
    return 'normal-flight';
}

// The returned handle remains usable after stopping. Download/export is left
// to the caller, so starting a capture never writes a save or a remote file.
export function startFlightCapture(runtime, {
    maxFrames = 12000, profile = false,
    clock = () => performance.now(),
    isHidden = () => typeof document !== 'undefined' && document.hidden,
} = {}) {
    if (!runtime?.renderer || typeof runtime.frameBody !== 'function')
        throw new Error('Launch a flight before starting a performance capture.');
    if (!Number.isInteger(maxFrames) || maxFrames < 2 || maxFrames > 60000)
        throw new RangeError('maxFrames must be an integer from 2 to 60000.');
    if (activeCaptures.has(runtime)) throw new Error('Stop the existing capture first.');
    const frames = [], restorers = [];
    const startedAt = new Date().toISOString();
    const device = { userAgent: globalThis.navigator?.userAgent ?? null,
        appleTouchProfile: runtime.renderer.isIOS ?? null, touchDevice: runtime.renderer.touchDevice ?? null };
    const start = clock();
    let running = true, reason, current, previous, previousRender;
    let lastObservedPhase;

    function wrap(object, name, replacement) {
        if (!object || typeof object[name] !== 'function') return;
        const own = Object.getOwnPropertyDescriptor(object, name), original = object[name];
        const wrapped = replacement(original);
        object[name] = wrapped;
        restorers.push(() => {
            // Do not overwrite a method another debugger replaced meanwhile.
            if (object[name] !== wrapped) return;
            if (own) Object.defineProperty(object, name, own);
            else delete object[name];
        });
    }
    function stage(object, name, label) {
        wrap(object, name, original => function (...args) {
            if (!current) return Reflect.apply(original, this, args);
            const sample = current, began = clock();
            try { return Reflect.apply(original, this, args); }
            finally {
                const entry = sample.stages[label] ??= { calls: 0, ms: 0 };
                entry.calls++;
                entry.ms += clock() - began;
            }
        });
    }
    function stop(why = 'manual') {
        if (running) {
            running = false; reason = why;
            for (const restore of restorers.reverse()) restore();
            activeCaptures.delete(runtime);
        }
        return report();
    }
    function report() {
        const groups = {};
        for (const frame of frames) {
            const g = groups[frame.phase] ??= { samples: 0, transitionsExcluded: 0,
                intervals: [], work: [], renderIntervals: [], stages: {} };
            g.samples++;
            if (frame.transition) { g.transitionsExcluded++; continue; }
            if (frame.intervalMs !== null) { g.intervals.push(frame.intervalMs); g.work.push(frame.jsMs); }
            if (frame.renderIntervalMs !== null) g.renderIntervals.push(frame.renderIntervalMs);
            for (const [label, entry] of Object.entries(frame.stages)) {
                const total = g.stages[label] ??= { calls: 0, totalMs: 0 };
                total.calls += entry.calls; total.totalMs += entry.ms;
            }
        }
        const phases = Object.fromEntries(Object.entries(groups).map(([phase, g]) => [phase, {
            samples: g.samples, transitionsExcluded: g.transitionsExcluded,
            animationCallbacks: summarizeFrames(g.intervals, g.work),
            renderedFrames: summarizeFrames(g.renderIntervals),
            inclusiveStages: g.stages,
        }]));
        return { schema: 'voidrunner-flight-capture-v1', startedAt, device: { ...device }, running, reason,
            profile, maxFrames, phases, frames: structuredClone(frames),
            interpretation: 'Frame intervals measure scheduling cadence. Render intervals count game render submissions, not displayed frames. JS times include capture overhead and are not GPU timings. Stage times are inclusive: do not add nested stages. Transition and hidden-tab intervals are excluded from phase summaries. No quality settings are changed.',
        };
    }

    if (profile) {
        stage(runtime, 'updateSimulation', 'simulation');
        stage(runtime, 'firstObstacleHitInfo', 'obstacle-ray-queries');
        stage(runtime, 'forEachObstacleInBox', 'obstacle-box-queries');
        stage(runtime, 'ensureObstacleGrid', 'grid-ensure');
        stage(runtime, 'syncRender', 'render-sync-total');
        for (const name of ['syncShips', 'syncDrones', 'syncProjectiles', 'syncPickups'])
            stage(runtime.renderer, name, 'entity-visual-sync');
        stage(runtime.renderer, 'render', 'render-js-submission');
        stage(runtime, 'buildHudModel', 'hud-model');
        stage(runtime.ui, 'updateHud', 'hud-update');
    }
    wrap(runtime, 'frameBody', original => function (...args) {
        if (isHidden()) {
            previous = undefined; previousRender = undefined; lastObservedPhase = undefined;
            return Reflect.apply(original, this, args);
        }
        const began = clock(), timestamp = Number.isFinite(args[0]) ? args[0] : began;
        const phase = flightPhase(runtime);
        // A render interval must not silently span another phase's callbacks.
        if (phase !== lastObservedPhase) previousRender = undefined;
        const beforeRenders = runtime.renderFrameCount ?? 0;
        const sample = { atMs: began - start, phase,
            intervalMs: previous?.phase === phase ? timestamp - previous.timestamp : null,
            renderIntervalMs: null, jsMs: 0, transition: false, stages: {} };
        current = sample;
        try { return Reflect.apply(original, this, args); }
        finally {
            sample.jsMs = clock() - began;
            const endPhase = flightPhase(runtime);
            sample.transition = phase !== endPhase;
            sample.rendered = (runtime.renderFrameCount ?? 0) > beforeRenders;
            if (sample.rendered && !sample.transition) {
                if (previousRender?.phase === phase) sample.renderIntervalMs = timestamp - previousRender.timestamp;
                previousRender = { phase, timestamp };
            }
            const renderer = runtime.renderer;
            sample.width = renderer?.canvas?.width ?? null;
            sample.height = renderer?.canvas?.height ?? null;
            sample.qualityScale = renderer?.lastQualityScale ?? runtime.qualityScale ?? null;
            sample.quality = runtime.save?.settings?.quality ?? null;
            sample.sceneQuality = renderer?.sceneQuality ?? null;
            sample.obstacleCells = runtime.obstacleGrid?.size ?? 0;
            sample.powerMode = runtime.save?.settings?.powerMode ?? null;
            sample.activeInstanceId = runtime.activeInstanceId ?? null;
            sample.ships = runtime.ships?.length ?? 0;
            sample.projectiles = runtime.projectiles?.length ?? 0;
            frames.push(sample);
            current = undefined;
            if (sample.transition) { previous = undefined; previousRender = undefined; }
            else previous = { phase, timestamp };
            lastObservedPhase = endPhase;
            // Detach without computing a large report inside the game loop.
            if (frames.length >= maxFrames) {
                running = false; reason = 'sample-limit';
                for (const restore of restorers.reverse()) restore();
                activeCaptures.delete(runtime);
            }
        }
    });
    wrap(runtime, 'dispose', original => function (...args) {
        // Avoid generating a report during session teardown, too.
        if (running) {
            running = false; reason = 'session-disposed';
            for (const restore of restorers.reverse()) restore();
            activeCaptures.delete(runtime);
        }
        return Reflect.apply(original, this, args);
    });
    const handle = { stop, report, get running() { return running; }, get count() { return frames.length; } };
    activeCaptures.set(runtime, handle);
    return handle;
}
