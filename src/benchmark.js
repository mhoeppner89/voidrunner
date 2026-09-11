import { summarizeFrames } from './benchmark-metrics.js';

// Shared flight dynamics and ace manoeuvres change the benchmark workload.
const PROTOCOL = 'voidrunner-phone-v5';
const SEED = 804140;
const CHECK = new URLSearchParams(location.search).get('check') === '1';
const PROFILE = new URLSearchParams(location.search).get('profile') === '1';
const WARMUP_MS = CHECK ? 1000 : 10000;
const SAMPLE_MS = CHECK ? 3000 : 50000;
const SCENES = [
    { name: 'Open-space flight', environment: 'open', scenario: 'free-flight' },
    { name: 'Asteroid combat', environment: 'asteroid-field', scenario: '1v3' },
    { name: 'Debris-field combat', environment: 'debris-field', scenario: '2v3' },
];
const $ = (id) => document.getElementById(id);
const round = (n) => Math.round(n * 100) / 100;
let runtime, ui, report, phase, controller, wakeLock;
let running = false;
let scenarioOrigin = 0;
let nextEncounter = Infinity;
let encounterResets = 0;
let currentScene;
let readyModules;
let exportUrl;
const actions = {
    throttleDelta: 0, pitch: 0, yaw: 0, roll: 0, throttleSet: .4,
    fire: false, utility: false, missile: false, targetNext: false,
    targetNearestHostile: false, cycleMode: false, navNext: false,
    autopilot: false, scan: false, pause: false, map: false, capture: false,
    jettison: false, transponder: false, weaponCycle: false, afterburner: false,
};

// Only this page imports the driver. The production game entry point is unchanged.
const ready = Promise.all([
    import('./game/game.js'), import('./game/ui.js'), import('./game/save.js'),
    import('./game/audio.js'), import('./game/worldData.js'),
]).then((modules) => {
    readyModules = modules;
    $('start-benchmark').disabled = false;
    $('start-benchmark').textContent = CHECK ? 'Start interface check' : 'Start benchmark';
    $('setup-status').textContent = CHECK
        ? 'Short interface check. These results are not a performance baseline.'
        : PROFILE ? 'CPU profiling enabled. These timings add overhead; use a normal run to compare frame rates.'
        : 'Ready. Rotate your phone to landscape before starting.';
}).catch((error) => {
    $('setup-status').textContent = `Flight systems could not load: ${error.message}. Reload with a working connection.`;
});

async function abortable(promise, timeoutMs = 90000) {
    const signal = controller.signal;
    let timer, abort;
    const cancellation = new Promise((_, reject) => {
        abort = () => reject(new Error(String(signal.reason ?? 'Run stopped')));
        timer = setTimeout(() => reject(new Error('Asset preparation timed out. Check the connection and reload.')), timeoutMs);
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    });
    try { return await Promise.race([promise, cancellation]); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

function stop(reason = 'Stopped by the player') {
    if (!running) return;
    controller.abort(reason);
    phase?.reject(new Error(reason));
}

function diagnostic(message) {
    if (!running || !report) return;
    if (report.errors.length < 20) report.errors.push(String(message).slice(0, 300));
}
window.addEventListener('error', (event) => diagnostic(event.message || `Resource failed: ${event.target?.src ?? event.target?.href ?? 'unknown'}`), true);
window.addEventListener('unhandledrejection', (event) => diagnostic(event.reason?.message ?? event.reason));
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Interrupted: the tab became hidden or the screen locked.');
});
window.addEventListener('resize', () => {
    if (phase && (Math.abs(innerWidth - phase.width) > 2 || Math.abs(innerHeight - phase.height) > 2))
        stop('Interrupted: the viewport changed. Keep the phone in landscape and restart.');
});

function resetEncounter() {
    // Use the game's own simulator setup and transition cleanup. Fixed resets
    // maintain combat pressure instead of benchmarking an empty arena after a win.
    runtime.clearTransientSpace();
    runtime.arena = { environment: currentScene.environment, scenario: currentScene.scenario, difficulty: 'veteran' };
    runtime.save.arena = runtime.arena;
    runtime.restartArena();
    runtime.updateActiveInstance(true);
    ui.clearToasts();
    scenarioOrigin = runtime.save.world.time;
    nextEncounter = scenarioOrigin + 20;
    encounterResets += 1;
}

function scriptedActions() {
    const t = runtime.save.world.time - scenarioOrigin;
    const combat = currentScene.scenario !== 'free-flight';
    actions.throttleSet = combat ? .35 : .6;
    actions.yaw = combat ? .12 * Math.sin(t * .3) : .1;
    actions.pitch = .035 * Math.sin(t * .45);
    actions.roll = .025 * Math.sin(t * .2);
    actions.fire = combat && t % 3 < 2.2;
    actions.afterburner = !combat && t % 20 > 16;
    return actions;
}

function snapshot() {
    const renderer = runtime.renderer.renderer;
    return {
        simulatedSeconds: round(runtime.save.world.time),
        ships: runtime.ships.length, projectiles: runtime.projectiles.length, pickups: runtime.pickups.length,
        shipMeshes: runtime.renderer.shipMeshes.size,
        projectileMeshes: runtime.renderer.projectileMeshes.size,
        pickupMeshes: runtime.renderer.pickupMeshes.size,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        retainedPixelTextures: runtime.renderer.pixelTextures.size,
        submittedAsteroids: runtime.renderer.instanceRoots.get('shardbelt')?.visible
            ? runtime.renderer.asteroidMeshes.reduce((n, batch) => n + batch.mesh.count, 0) : 0,
        submittedDebris: runtime.renderer.instanceRoots.get('mourning-line')?.visible
            ? runtime.renderer.graveyardBatches.reduce((n, batch) => n + batch.mesh.count, 0) : 0,
        totalAsteroids: runtime.renderer.asteroids.length,
        totalDebris: runtime.renderer.graveyardBatches.reduce((n, batch) => n + batch.pieces.length, 0),
        jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
        renderWidth: renderer.domElement.width, renderHeight: renderer.domElement.height,
        audioState: runtime.audio.context?.state ?? 'unavailable',
    };
}

function installRecorder() {
    const originalFrameBody = runtime.frameBody;
    // Opt-in timings live only in the benchmark; normal game and benchmark
    // runs pay no per-method clock cost. Timings are inclusive: a simulation
    // reset can also call mesh synchronization, so do not sum the categories.
    let frameProfile;
    if (PROFILE) {
        for (const [owner, method, category] of [
            [runtime, 'updateSimulation', 'simulation'],
            [runtime.audio, 'update', 'audio'],
            [runtime.renderer, 'syncShips', 'meshSync'],
            [runtime.renderer, 'syncProjectiles', 'meshSync'],
            [runtime.renderer, 'syncPickups', 'meshSync'],
            [runtime.renderer, 'render', 'renderSubmission'],
            [runtime, 'buildHudModel', 'hud'],
            [ui, 'updateHud', 'hud'],
        ]) {
            const original = owner[method];
            owner[method] = function (...args) {
                if (!frameProfile) return original.apply(this, args);
                const started = performance.now();
                try { return original.apply(this, args); }
                finally { frameProfile[category] += performance.now() - started; }
            };
        }
    }
    runtime.input.getActions = scriptedActions;
    runtime.renderer.renderer.info.autoReset = false;
    const originalSyncRender = runtime.syncRender;
    runtime.syncRender = function (...args) {
        runtime.renderer.renderer.info.reset();
        return originalSyncRender.apply(this, args);
    };
    runtime.frameBody = (now) => {
        const previousRenderCount = runtime.renderFrameCount ?? 0;
        frameProfile = PROFILE && phase?.measuring
            ? { simulation: 0, audio: 0, meshSync: 0, renderSubmission: 0, hud: 0 }
            : null;
        const started = performance.now();
        try {
            if (phase?.measuring && currentScene.scenario !== 'free-flight' && runtime.save.world.time >= nextEncounter)
                resetEncounter();
            originalFrameBody(now);
        }
        catch (error) {
            diagnostic(error.message);
            stop(`Game error: ${error.message}`);
            throw error;
        }
        const jsMs = performance.now() - started;
        const p = phase;
        if (!p) return;
        if (runtime.renderer.contextLost) { stop('Interrupted: the graphics context was lost.'); return; }
        if (ui.isModalOpen || runtime.save.player.dockedAt) { stop('Interrupted: the game paused or docked.'); return; }
        const rendered = (runtime.renderFrameCount ?? 0) !== previousRenderCount;
        p.pendingWork = (p.pendingWork ?? 0) + jsMs;
        if (p.measuring && frameProfile) {
            for (const key of Object.keys(frameProfile)) p.profile[key] += frameProfile[key];
        }
        if (rendered && p.previous !== null && now > p.previous) {
            if (p.measuring) {
                p.intervals.push(now - p.previous);
                p.work.push(p.pendingWork);
            }
        }
        if (rendered) { p.previous = now; p.pendingWork = 0; }
        frameProfile = null;
        const elapsed = now - p.start;
        if (now - p.lastStatus >= 1000) {
            p.lastStatus = now;
            if (p.measuring) p.timeline.push({ wallSeconds: round(elapsed / 1000), ...snapshot() });
            const remaining = Math.max(0, Math.ceil((p.duration - elapsed) / 1000));
            $('live-status').textContent = `${p.measuring ? 'Recording' : 'Warming up'} · ${remaining}s left · round ${p.round}/${report.rounds}`;
        }
        if (elapsed >= p.duration) { phase = undefined; p.resolve(p); }
    };
}

function recordWindow(measuring, duration, roundNumber) {
    return new Promise((resolve, reject) => {
        const now = performance.now();
        phase = {
            measuring, duration, round: roundNumber, start: now, previous: null,
            lastStatus: -Infinity, width: innerWidth, height: innerHeight,
            intervals: [], work: [], timeline: [], resolve, reject,
            profile: { simulation: 0, audio: 0, meshSync: 0, renderSubmission: 0, hud: 0 },
            simStart: runtime.save.world.time, resetsStart: encounterResets,
        };
    });
}

async function prepareScene(scene) {
    currentScene = scene;
    $('live-scene').textContent = scene.name;
    $('live-status').textContent = 'Loading models and preparing shaders…';
    // Loading is outside timed windows. Stop simulation so network speed cannot
    // decide how far the fight progressed before its first measurement.
    cancelAnimationFrame(runtime.frameId);
    resetEncounter();
    runtime.renderer.syncShips(runtime.ships);
    if (scene.environment === 'debris-field')
        await abortable(runtime.renderer.ensureGraveyardModels());
    await abortable(Promise.all(runtime.renderer.glbShipLoading.values()));
    for (const [name, model] of runtime.renderer.glbShipModels) {
        if (!model) throw new Error(`Ship model ${name} did not load. Reload before benchmarking.`);
    }
    if (scene.environment === 'debris-field' && runtime.renderer.graveyardModelMeshes.length !== readyModules[4].GRAVEYARD_MODEL_WRECKS.length)
        throw new Error('Wreck models did not load. Reload before benchmarking.');
    await abortable(runtime.prepareFlightScene());
    if (controller.signal.aborted) throw new Error(String(controller.signal.reason));
    runtime.lastFrame = performance.now();
    runtime.simAccumulator = 0;
    runtime.frameId = requestAnimationFrame(runtime.frame);
}

function finishSample(p, complete) {
    if (!p?.measuring || !p.intervals.length) return;
    report.scenes.push({
        name: currentScene.name, environment: currentScene.environment,
        scenario: currentScene.scenario, round: p.round, complete,
        ...summarizeFrames(p.intervals, p.work),
        simulatedSeconds: round(runtime.save.world.time - p.simStart),
        scriptedEncounterResets: encounterResets - p.resetsStart,
        timeline: p.timeline,
        frameIntervalsMs: p.intervals.map(round),
        jsWorkMs: p.work.map(round),
        ...(PROFILE ? { averageStageMs: Object.fromEntries(
            Object.entries(p.profile).map(([key, total]) => [key, round(total / p.intervals.length)])
        ) } : {}),
    });
}

async function start() {
    if (running || !readyModules) return;
    if (innerHeight > innerWidth) {
        $('setup-status').textContent = 'Rotate your phone to landscape, then tap Start.';
        return;
    }
    running = true;
    controller = new AbortController();
    const [{ GameSession }, { GameUI }, { createNewSave }, { AudioManager }] = readyModules;
    // Resuming sound happens directly in the Start gesture, including on iOS.
    const audio = new AudioManager();
    const audioReady = audio.enable();
    report = {
        protocol: PROTOCOL, interfaceCheck: CHECK, profiling: PROFILE, seed: SEED,
        startedAt: new Date().toISOString(), status: 'running',
        device: $('device-label').value.trim() || 'Not specified',
        userAgent: navigator.userAgent, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight },
        screen: { width: screen.width, height: screen.height },
        serviceWorker: navigator.serviceWorker?.controller?.scriptURL ?? null,
        rounds: CHECK ? 1 : Number($('run-length').value),
        warmupMs: WARMUP_MS, sampleMs: SAMPLE_MS,
        quality: 'high', targetFps: 60, scenes: [], errors: [],
        notes: ['Real simulator with scripted controls; fixed seed, not a bit-exact replay.',
            'Combat encounters restart every 20 simulated seconds to maintain load; reset cost is included.',
            'Frame intervals measure browser cadence. JS work is not GPU time.',
            'Texture/geometry counts are renderer counters. JS heap is optional and excludes GPU memory.',
            'Long-run slowdown can have several causes; device temperature is not measured.'],
    };
    if (PROFILE) report.notes.push('CPU profiling adds timing overhead. Stage times are inclusive and may overlap; renderSubmission is not GPU time. Repeat without ?profile=1 for frame-rate comparison.');
    $('benchmark-panel').hidden = true;
    $('benchmark-live').hidden = false;
    document.body.classList.add('bench-running');
    try {
        await abortable(audioReady, 15000);
        if (audio.context?.state !== 'running') throw new Error('Sound could not start. Reload and tap Start again.');
        if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen').catch(() => undefined);
        report.wakeLock = Boolean(wakeLock);
        report.build = await abortable(fetch('./benchmark-build.json', { cache: 'no-store' })
            .then((response) => response.ok ? response.json() : { commit: null })
            .catch(() => ({ commit: null })), 15000);
        ui = new GameUI($('app'));
        const save = createNewSave(SEED);
        save.settings.steering = 'stick';
        save.settings.quality = 'high';
        // Keep the sustained 60 fps benchmark protocol explicit; the actual
        // game's Auto mode now budgets 30 rendered frames on touch devices.
        save.settings.powerMode = 'performance';
        currentScene = SCENES[0];
        save.arena = { environment: 'open', scenario: 'free-flight', difficulty: 'veteran' };
        const setupStart = performance.now();
        runtime = new GameSession(save, ui, () => stop('Stopped from the game'), save.arena, false, audio);
        cancelAnimationFrame(runtime.frameId);
        const cockpitReady = await abortable(ui.preloadSessionAssets(save, { includeLocation: false, priority: 'high' }));
        if (!cockpitReady) throw new Error('Cockpit art did not load. Reload before benchmarking.');
        installRecorder();
        runtime.renderer.canvas.addEventListener('webglcontextlost', () => stop('Interrupted: the graphics context was lost.'));
        const gl = runtime.renderer.renderer.getContext();
        report.graphics = { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER) };
        report.setupMs = round(performance.now() - setupStart);
        report.settings = { ...save.settings, uiLanguage: document.documentElement.lang };
        for (let cycle = 1; cycle <= report.rounds; cycle++) {
            for (const scene of SCENES) {
                if (controller.signal.aborted) throw new Error(String(controller.signal.reason));
                const loadingStart = performance.now();
                await prepareScene(scene);
                const loadingMs = round(performance.now() - loadingStart);
                await recordWindow(false, WARMUP_MS, cycle);
                resetEncounter();
                const sample = await recordWindow(true, SAMPLE_MS, cycle);
                finishSample(sample, true);
                report.scenes.at(-1).loadingMs = loadingMs;
            }
        }
        report.status = 'completed';
    }
    catch (error) {
        finishSample(phase, false);
        report.status = controller.signal.aborted ? 'interrupted' : 'error';
        report.reason = error.message;
    }
    finally {
        phase = undefined;
        running = false;
        report.finishedAt = new Date().toISOString();
        report.comparable = report.status === 'completed' && !CHECK && !PROFILE && report.errors.length === 0 && Boolean(report.build?.commit);
        // Explicitly release the benchmark's context at the end; a fresh run is
        // a reload. This does not alter the production renderer's lifecycle.
        const webgl = runtime?.renderer?.renderer;
        runtime?.dispose();
        if (!runtime) audio.dispose();
        webgl?.forceContextLoss();
        await wakeLock?.release().catch(() => {});
        showReport();
    }
}

function summary() {
    const rows = report.scenes.map((scene) => `${scene.name}, round ${scene.round}${scene.complete ? '' : ' (partial)'}: ${scene.averageFps} FPS; p95 ${scene.p95Ms} ms; ${scene.framesOver50ms} frames >50 ms; simulation ${scene.simulatedSeconds}s / wall ${(scene.elapsedMs / 1000).toFixed(1)}s`);
    return [`Voidrunner phone benchmark · ${report.protocol}`, `${report.device} · ${report.status}${report.interfaceCheck ? ' · INTERFACE CHECK' : ''}`,
        `Build: ${report.build?.commit ?? 'unversioned'} / ${report.build?.revision ?? 'original'}`, `Viewport: ${report.viewport.width}×${report.viewport.height}; High graphics`,
        ...rows, report.reason ?? '', ...report.errors.map((error) => `Error: ${error}`)].filter(Boolean).join('\n');
}

function showReport() {
    document.body.classList.remove('bench-running');
    $('benchmark-live').hidden = true;
    $('benchmark-panel').hidden = false;
    $('setup').hidden = true;
    $('results').hidden = false;
    $('result-title').textContent = report.status === 'completed' ? 'Your flight report' : 'Run interrupted';
    $('result-status').textContent = report.reason ?? (report.interfaceCheck
        ? 'Interface check only. Run the full benchmark for useful phone measurements.'
        : report.profiling ? 'CPU timings recorded. Export the report; use a normal run for frame-rate comparisons.'
        : report.comparable ? 'Recorded on your device. Export the report for comparison.' : 'Diagnostic run: check errors and build identity before comparing results.');
    const tbody = $('result-rows');
    tbody.replaceChildren();
    for (const scene of report.scenes) {
        const tr = document.createElement('tr');
        for (const value of [`${scene.name} / ${scene.round}${scene.complete ? '' : ' (partial)'}`, scene.averageFps, `${scene.p95Ms} ms`, scene.framesOver50ms]) {
            const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        }
        tbody.append(tr);
    }
    $('comparison-note').textContent = 'At 60 FPS, frames arrive about every 16.7 ms. The 95% figure shows the slower end of frame delivery; lower is better. Hitches over 50 ms help explain visible stutter. Compare the same scene and round, and check simulation time as well as FPS.';
    $('report-summary').value = summary();
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    $('share-report').hidden = !navigator.share;
    window.scrollTo(0, 0);
}

$('start-benchmark').addEventListener('click', () => { void start(); });
$('stop-benchmark').addEventListener('click', () => stop());
$('download-report').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = exportUrl; a.download = `voidrunner-${report.startedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(a); a.click(); a.remove();
});
$('share-report').addEventListener('click', async () => {
    const file = new File([JSON.stringify(report, null, 2)], 'voidrunner-benchmark.json', { type: 'application/json' });
    try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Voidrunner benchmark' });
        else await navigator.share({ text: summary(), title: 'Voidrunner benchmark' });
    }
    catch (error) { if (error.name !== 'AbortError') $('result-status').textContent = 'Sharing is unavailable. Use Download report or copy the summary.'; }
});
$('copy-summary').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summary()); $('copy-summary').textContent = 'Copied'; }
    catch { $('report-summary').closest('details').open = true; $('report-summary').select(); }
});
void ready;
