import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// A bounded live-browser stability/performance soak. The probe deliberately
// owns a fresh profile and an isolated CDP port so a service-worker update or
// another probe cannot change the build under test.
const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const BASE_URL = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const PORT = 9348;
const PROFILE = mkdtempSync(join(tmpdir(), 'vr-performance-soak-'));
const SCREENSHOT = '/tmp/voidrunner-performance-soak-final.png';
const SIM_STEP = 1 / 60;
const MAX_SIM_STEPS = 6;
const ACCUMULATOR_CAP = SIM_STEP * MAX_SIM_STEPS;
const RAF_SAMPLE_MS = 1400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PASS = [];
const FAILURES = [];
const check = (name, ok, detail = '') => {
    if (ok)
        PASS.push(name);
    else
        FAILURES.push(`${name} :: ${detail}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` :: ${detail}`}`);
};

let httpd;
if (!process.env.VR_BASE_URL) {
    try {
        await fetch(BASE_URL, { signal: AbortSignal.timeout(900) });
    }
    catch {
        httpd = spawn('python3', ['-m', 'http.server', '4173'], { stdio: 'ignore', cwd: ROOT });
    }
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    'about:blank',
], { stdio: 'ignore', cwd: ROOT });

let ws;
let messageId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (response.exceptionDetails)
        throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'runtime evaluation failed');
    return response.result?.value;
};

const instrumentation = `(() => {
    let adds = 0;
    let removes = 0;
    const byType = Object.create(null);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args) {
        adds += 1;
        const type = String(args[0] ?? 'unknown');
        byType[type] = (byType[type] ?? 0) + 1;
        return add.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
        removes += 1;
        const type = String(args[0] ?? 'unknown');
        byType[type] = (byType[type] ?? 0) - 1;
        return remove.apply(this, args);
    };
    window.__VR_EVENT_STATS__ = () => ({ adds, removes, net: Math.max(0, adds - removes), byType: { ...byType } });
})()`;

const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await evaluate(expression).catch(() => undefined);
        if (value)
            return value;
        await sleep(120);
    }
    throw new Error(`timed out waiting for ${expression}`);
};

const stopLoop = () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!rt) return false;
    if (rt.frameId !== undefined) cancelAnimationFrame(rt.frameId);
    rt.frameId = 0;
    rt.simAccumulator = 0;
    rt.lastFrame = performance.now();
    return true;
})()`);

const resumeLoop = () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!rt) return false;
    if (rt.frameId) cancelAnimationFrame(rt.frameId);
    rt.active = true;
    rt.simAccumulator = 0;
    rt.lastFrame = performance.now();
    rt.frameId = requestAnimationFrame(rt.frame);
    return true;
})()`);

const startArena = async (environment, scenario = '1v3', difficulty = 'veteran') => {
    await evaluate(`window.__VOID_PRIVATEER__.startArena(${JSON.stringify(environment)}, ${JSON.stringify(scenario)}, ${JSON.stringify(difficulty)}); true`);
    const ready = await waitFor(`(() => {
        const rt = window.__VOID_PRIVATEER__?.getRuntime?.();
        return Boolean(rt && rt.arena?.environment === ${JSON.stringify(environment)} && rt.save?.player && rt.renderer);
    })()`);
    await sleep(220);
    return ready;
};

const deterministicSceneSoak = async (label, steps = 180) => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const player = rt.save.player;
    const stats = rt.playerStats();
    const actions = {
        throttleDelta: 0,
        pitch: 0,
        yaw: 0.22,
        roll: 0.08,
        fire: true,
        utility: false,
        missile: false,
        targetNext: false,
        targetNearestHostile: false,
        cycleMode: false,
        navNext: false,
        autopilot: false,
        scan: false,
        pause: false,
        map: false,
        capture: false,
        jettison: false,
        transponder: false,
        weaponCycle: false,
        afterburner: false,
        throttleSet: 0.35,
    };
    const finite = (v) => v != null && v.length !== undefined && [...v].every(Number.isFinite);
    const metrics = {
        label: ${JSON.stringify(label)},
        steps: ${Number(steps)},
        sampleCount: 0,
        finite: true,
        issues: [],
        maxShips: rt.ships.length,
        maxProjectiles: rt.projectiles.length,
        maxPickups: rt.pickups.length,
        maxShipMeshes: rt.renderer.shipMeshes?.size ?? 0,
        maxProjectileMeshes: rt.renderer.projectileMeshes?.size ?? 0,
        maxPickupMeshes: rt.renderer.pickupMeshes?.size ?? 0,
        maxProjectileSlot: rt.projStore.nextSlot,
        maxPickupSlot: rt.pickupStore.nextSlot,
        maxStepMs: 0,
        simSeconds: 0,
    };
    const initialTime = rt.save.world.time;
    const addIssue = (issue) => {
        metrics.finite = false;
        if (metrics.issues.length < 8)
            metrics.issues.push(issue);
    };
    const sample = () => {
        metrics.sampleCount += 1;
        const checkTuple = (id, value, width) => {
            if (!finite(value) || value.length !== width)
                addIssue({ id, value });
        };
        checkTuple('player.position', player.position, 3);
        checkTuple('player.velocity', player.velocity, 3);
        checkTuple('player.rotation', player.rotation, 4);
        for (const ship of rt.ships) {
            checkTuple('ship:' + ship.id + ':position', ship.position, 3);
            checkTuple('ship:' + ship.id + ':velocity', ship.velocity, 3);
            checkTuple('ship:' + ship.id + ':rotation', ship.rotation, 4);
        }
        for (const projectile of rt.projectiles) {
            const index = projectile.slot * 3;
            checkTuple('projectile:' + projectile.id + ':position', [rt.projStore.pos[index], rt.projStore.pos[index + 1], rt.projStore.pos[index + 2]], 3);
            checkTuple('projectile:' + projectile.id + ':velocity', [rt.projStore.vel[index], rt.projStore.vel[index + 1], rt.projStore.vel[index + 2]], 3);
        }
        for (const pickup of rt.pickups) {
            const index = pickup.slot * 3;
            checkTuple('pickup:' + pickup.id + ':position', [rt.pickupStore.pos[index], rt.pickupStore.pos[index + 1], rt.pickupStore.pos[index + 2]], 3);
        }
        metrics.maxShips = Math.max(metrics.maxShips, rt.ships.length);
        metrics.maxProjectiles = Math.max(metrics.maxProjectiles, rt.projectiles.length);
        metrics.maxPickups = Math.max(metrics.maxPickups, rt.pickups.length);
        metrics.maxShipMeshes = Math.max(metrics.maxShipMeshes, rt.renderer.shipMeshes?.size ?? 0);
        metrics.maxProjectileMeshes = Math.max(metrics.maxProjectileMeshes, rt.renderer.projectileMeshes?.size ?? 0);
        metrics.maxPickupMeshes = Math.max(metrics.maxPickupMeshes, rt.renderer.pickupMeshes?.size ?? 0);
        metrics.maxProjectileSlot = Math.max(metrics.maxProjectileSlot, rt.projStore.nextSlot);
        metrics.maxPickupSlot = Math.max(metrics.maxPickupSlot, rt.pickupStore.nextSlot);
        if (!Number.isFinite(rt.simAccumulator) || rt.simAccumulator < -1e-9 || rt.simAccumulator > ${ACCUMULATOR_CAP + 1e-9})
            addIssue({ kind: 'accumulator', value: rt.simAccumulator });
    };
    player.mode = 'combat';
    player.velocity = [0, 0, 0];
    player.angularVelocity = [0, 0, 0];
    player.throttle = 0.35;
    player.shield = stats.shield;
    player.hull = stats.hull;
    player.energy = stats.energyCapacity;
    rt.simAccumulator = 0;
    const started = performance.now();
    for (let step = 0; step < ${Number(steps)}; step += 1) {
        // Refill the disposable arena's capacitor so the soak keeps producing
        // real player projectiles instead of turning into a quiet flight loop.
        player.energy = stats.energyCapacity;
        rt.gunCooldown = step % 4 === 0 ? 0 : rt.gunCooldown;
        const before = performance.now();
        rt.updateSimulation(${SIM_STEP}, actions);
        metrics.maxStepMs = Math.max(metrics.maxStepMs, performance.now() - before);
        if (player.hull <= 0 || !Number.isFinite(player.hull)) {
            player.hull = stats.hull;
            player.shield = stats.shield;
        }
        if (step % 3 === 0) {
            rt.syncRender(0, performance.now());
            sample();
        }
    }
    metrics.simSeconds = rt.save.world.time - initialTime;
    metrics.wallMs = performance.now() - started;
    metrics.end = {
        ships: rt.ships.length,
        projectiles: rt.projectiles.length,
        pickups: rt.pickups.length,
        shipMeshes: rt.renderer.shipMeshes?.size ?? 0,
        projectileMeshes: rt.renderer.projectileMeshes?.size ?? 0,
        pickupMeshes: rt.renderer.pickupMeshes?.size ?? 0,
        projectileSlot: rt.projStore.nextSlot,
        pickupSlot: rt.pickupStore.nextSlot,
        accumulator: rt.simAccumulator,
    };
    return metrics;
})()`);

const resourceChurn = async (label, kind) => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const player = rt.save.player;
    const mining = ${JSON.stringify(kind)} === 'asteroid';
    const nodes = mining ? rt.asteroids : rt.wreckNodes;
    const node = nodes.find((entry) => entry.remaining > 0);
    if (!node)
        return { label: ${JSON.stringify(label)}, kind: ${JSON.stringify(kind)}, found: false };
    const before = {
        remaining: node.remaining,
        mined: player.stats.mined,
        salvaged: player.stats.salvaged,
        cargo: { ...player.cargo },
    };
    player.mode = mining ? 'mining' : 'salvage';
    player.cargo = {};
    player.position = [node.position[0], node.position[1], node.position[2] - 90];
    player.velocity = [0, 0, 0];
    node.scanned = true;
    node.remaining = Math.max(12, Number(node.remaining));
    rt.extractionCarry.clear();
    rt.obstacleGridBuiltAt = -Infinity;
    rt.selectTarget(mining ? 'asteroid' : 'wreck', node.id);
    // Direct extraction is the same bounded production path used by the beam;
    // the arena is disposable, so the target is enlarged only to produce a
    // deterministic resource sample without waiting for many real seconds.
    for (let index = 0; index < 12 && node.remaining > 0; index += 1) {
        if (mining)
            rt.extractAsteroid(node, 2, 1.2);
        else
            rt.extractWreck(node, 2, 1.2);
    }
    rt.syncRender(0, performance.now());
    const after = {
        remaining: node.remaining,
        mined: player.stats.mined,
        salvaged: player.stats.salvaged,
        cargo: { ...player.cargo },
        targetId: player.currentTargetId ?? null,
        activeInstance: rt.activeInstanceId ?? null,
    };
    return {
        label: ${JSON.stringify(label)},
        kind: ${JSON.stringify(kind)},
        found: true,
        before,
        after,
        gained: mining ? after.mined - before.mined : after.salvaged - before.salvaged,
        cargoUnits: Object.values(after.cargo).reduce((sum, value) => sum + Number(value || 0), 0),
    };
})()`);

const entityChurn = async () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const player = rt.save.player;
    const stats = rt.playerStats();
    const origin = [...player.position];
    const firstProjectileSlots = [];
    const reusedProjectileSlots = [];
    const firstPickupSlots = [];
    const reusedPickupSlots = [];
    let maxProjectiles = 0;
    let maxPickups = 0;
    let maxProjectileMeshes = 0;
    let maxPickupMeshes = 0;
    let movedProjectile = false;
    let movedPickup = false;
    player.mode = 'combat';
    player.currentTargetId = undefined;
    for (let cycle = 0; cycle < 8; cycle += 1) {
        for (let shot = 0; shot < 8; shot += 1) {
            player.energy = stats.energyCapacity;
            rt.gunCooldown = 0;
            const before = rt.projectiles.length;
            rt.firePlayerGuns();
            if (rt.projectiles.length > before) {
                const projectile = rt.projectiles.at(-1);
                (cycle === 0 ? firstProjectileSlots : reusedProjectileSlots).push(projectile.slot);
            }
        }
        const projectile = rt.projectiles[0];
        if (projectile) {
            const index = projectile.slot * 3;
            const start = [rt.projStore.pos[index], rt.projStore.pos[index + 1], rt.projStore.pos[index + 2]];
            rt.updateProjectiles(0.12);
            const end = [rt.projStore.pos[index], rt.projStore.pos[index + 1], rt.projStore.pos[index + 2]];
            movedProjectile ||= Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) > 0.1;
        }
        rt.syncRender(0, performance.now());
        maxProjectiles = Math.max(maxProjectiles, rt.projectiles.length);
        maxProjectileMeshes = Math.max(maxProjectileMeshes, rt.renderer.projectileMeshes?.size ?? 0);
        rt.projectiles.forEach((entry) => { entry.life = 0; });
        rt.cleanupEntities();
        rt.syncRender(0, performance.now());

        for (let pickup = 0; pickup < 8; pickup += 1) {
            rt.spawnPickup('scrap', origin, 'combat', 1);
            const entry = rt.pickups.at(-1);
            (cycle === 0 ? firstPickupSlots : reusedPickupSlots).push(entry.slot);
        }
        const livePickup = rt.pickups[0];
        if (livePickup) {
            const index = livePickup.slot * 3;
            const start = [rt.pickupStore.pos[index], rt.pickupStore.pos[index + 1], rt.pickupStore.pos[index + 2]];
            rt.updatePickups(0.12);
            const end = [rt.pickupStore.pos[index], rt.pickupStore.pos[index + 1], rt.pickupStore.pos[index + 2]];
            movedPickup ||= Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) > 0.01;
        }
        rt.syncRender(0, performance.now());
        maxPickups = Math.max(maxPickups, rt.pickups.length);
        maxPickupMeshes = Math.max(maxPickupMeshes, rt.renderer.pickupMeshes?.size ?? 0);
        rt.pickups.forEach((entry) => { entry.life = 0; });
        rt.cleanupEntities();
        rt.syncRender(0, performance.now());
    }
    return {
        firstProjectileSlots,
        reusedProjectileSlots,
        firstPickupSlots,
        reusedPickupSlots,
        maxProjectiles,
        maxPickups,
        maxProjectileMeshes,
        maxPickupMeshes,
        finalProjectiles: rt.projectiles.length,
        finalPickups: rt.pickups.length,
        finalProjectileMeshes: rt.renderer.projectileMeshes?.size ?? 0,
        finalPickupMeshes: rt.renderer.pickupMeshes?.size ?? 0,
        projectileNextSlot: rt.projStore.nextSlot,
        pickupNextSlot: rt.pickupStore.nextSlot,
        projectileFree: rt.projStore.freeSlots.length,
        pickupFree: rt.pickupStore.freeSlots.length,
        movedProjectile,
        movedPickup,
    };
})()`);

const sampleRaf = (durationMs = RAF_SAMPLE_MS) => evaluate(`new Promise((resolve) => {
    const samples = [];
    let previous;
    const started = performance.now();
    const tick = (now) => {
        if (previous !== undefined)
            samples.push(now - previous);
        previous = now;
        if (now - started < ${Number(durationMs)})
            requestAnimationFrame(tick);
        else
            resolve(samples);
    };
    requestAnimationFrame(tick);
})`);

const summarizeSamples = (samples) => {
    const sorted = [...samples].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length)
        return { n: 0, min: null, median: null, p90: null, max: null };
    const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
    return {
        n: sorted.length,
        min: Number(sorted[0].toFixed(2)),
        median: Number(percentile(0.5).toFixed(2)),
        p90: Number(percentile(0.9).toFixed(2)),
        max: Number(sorted.at(-1).toFixed(2)),
    };
};

const pauseResume = async () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    if (rt.frameId) cancelAnimationFrame(rt.frameId);
    rt.frameId = 0;
    rt.simAccumulator = 0;
    rt.lastFrame = performance.now();
    rt.ui.showPause();
    const before = rt.save.world.time;
    const pauseNow = rt.lastFrame + 250;
    rt.frameBody(pauseNow);
    const paused = rt.save.world.time;
    const modalWhilePaused = rt.ui.isModalOpen;
    rt.resumeFlight();
    const resumeNow = rt.lastFrame + 250;
    rt.frameBody(resumeNow);
    const resumed = rt.save.world.time;
    const modalAfterResume = rt.ui.isModalOpen;
    rt.simAccumulator = 0;
    rt.lastFrame = performance.now();
    return {
        before,
        paused,
        resumed,
        pausedDelta: paused - before,
        resumedDelta: resumed - paused,
        modalWhilePaused,
        modalAfterResume,
        accumulator: rt.simAccumulator,
    };
})()`);

const systemTransitions = async () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const requested = ['meridian', 'pale-ring', 'redwake', 'pale-ring', 'meridian', 'helios-verge'];
    const result = [{ requested: rt.save.player.systemId, ok: true, actual: rt.save.player.systemId }];
    for (const systemId of requested) {
        const ok = rt.debugJumpToSystem(systemId);
        result.push({ requested: systemId, ok: Boolean(ok), actual: rt.save.player.systemId, activeInstance: rt.activeInstanceId ?? null });
    }
    return result;
})()`);

const instanceTransitions = async () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const result = [];
    const move = (id, position) => {
        rt.save.player.position = [...position];
        rt.save.player.velocity = [0, 0, 0];
        rt.updateActiveInstance(true);
        result.push({ requested: id, actual: rt.activeInstanceId ?? null });
    };
    const shard = rt.asteroids[0]?.position;
    const wreck = rt.wreckNodes[0]?.position;
    // The field centers are authoritative for instance selection; the field
    // arena boot below performs the collision-safe staging for actual flight.
    const locations = {
        shardbelt: [${-126000}, ${-4200}, ${-122000}],
        'mourning-line': [${-214000}, ${6500}, ${-91000}],
    };
    if (shard)
        move('shardbelt', shard);
    else
        move('shardbelt', locations.shardbelt);
    if (wreck)
        move('mourning-line', wreck);
    else
        move('mourning-line', locations['mourning-line']);
    move('open', [0, 0, 0]);
    return result;
})()`);

let pageErrors = [];
let networkErrors = [];
let responseErrors = [];
let requestUrls = new Map();
const metrics = [];
let rafEarly;
let rafLate;
let screenshotWritten = false;

try {
    let target;
    for (let index = 0; index < 60 && !target; index += 1) {
        await sleep(250);
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            target = list.find((entry) => entry.type === 'page');
        }
        catch {
            // DevTools endpoint is not ready yet.
        }
    }
    if (!target)
        throw new Error('no CDP target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error)
                reject(new Error(message.error.message));
            else
                resolve(message.result);
        }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown')
            pageErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'uncaught page exception');
        if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type))
            pageErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || 'console error');
        if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error')
            pageErrors.push(message.params.entry.text ?? 'browser log error');
        if (message.method === 'Network.requestWillBeSent')
            requestUrls.set(message.params.requestId, message.params.request.url);
        if (message.method === 'Network.loadingFailed' && !message.params.canceled)
            networkErrors.push({ url: requestUrls.get(message.params.requestId), error: message.params.errorText });
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400)
            responseErrors.push({ url: message.params.response.url, status: message.params.response.status });
    });

    await send('Page.navigate', { url: BASE_URL });
    await waitFor('Boolean(window.__VOID_PRIVATEER__?.getRuntime)');
    // Let the service worker claim the fresh page before starting the first
    // session. This avoids measuring a mid-reload title/session handoff.
    await waitFor(`Boolean(window.__VOID_PRIVATEER__?.getRuntime && document.readyState === 'complete')`);
    await sleep(450);
    await evaluate('window.__VOID_PRIVATEER__.newGame(); true');
    await waitFor(`window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix'`);
    await evaluate('window.__VOID_PRIVATEER__.launch(); true');
    await waitFor(`Boolean(window.__VOID_PRIVATEER__.getRuntime()?.save?.player && !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt)`);
    check('boot: career session launches into live flight', true);
    const bootText = await evaluate('window.render_game_to_text?.()');
    check('boot: render text exposes flight mode', (() => {
        try { return JSON.parse(bootText).mode === 'flight'; }
        catch { return false; }
    })(), String(bootText).slice(0, 180));

    const baselineSurface = await evaluate(`(() => ({
        dom: document.querySelectorAll('*').length,
        canvases: document.querySelectorAll('canvas').length,
        buttons: document.querySelectorAll('button').length,
        events: window.__VR_EVENT_STATS__?.(),
    }))()`);

    // Use an arena for disposable combat/entity stress, then keep a career
    // session at the end for the real save round-trip check.
    await startArena('open', '1v3', 'veteran');
    await stopLoop();
    const openMetric = await deterministicSceneSoak('open', 180);
    metrics.push(openMetric);
    check('open soak: player/NPC/projectile/pickup transforms stay finite', openMetric.finite, JSON.stringify(openMetric.issues.slice(0, 2)));
    check('open soak: accumulator stays within the six-step cap', openMetric.end.accumulator <= ACCUMULATOR_CAP + 1e-9 && openMetric.end.accumulator >= -1e-9, JSON.stringify(openMetric.end));
    check('open soak: live entity and render surfaces stay bounded', openMetric.maxShips <= 16 && openMetric.maxProjectiles <= 96 && openMetric.maxPickups <= 32 && openMetric.maxShipMeshes <= 16 && openMetric.maxProjectileMeshes <= 96 && openMetric.maxPickupMeshes <= 32, JSON.stringify({ maxShips: openMetric.maxShips, maxProjectiles: openMetric.maxProjectiles, maxPickups: openMetric.maxPickups, maxShipMeshes: openMetric.maxShipMeshes, maxProjectileMeshes: openMetric.maxProjectileMeshes, maxPickupMeshes: openMetric.maxPickupMeshes }));
    check('open soak: deterministic fixed steps remain reasonably bounded', openMetric.maxStepMs < 100 && openMetric.wallMs < 8000, JSON.stringify({ maxStepMs: openMetric.maxStepMs, wallMs: openMetric.wallMs, samples: openMetric.sampleCount }));

    const accumulatorGuard = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.simAccumulator = 0;
        rt.lastFrame = performance.now();
        const before = rt.save.world.time;
        rt.frameBody(rt.lastFrame + 5000);
        const result = { advanced: rt.save.world.time - before, accumulator: rt.simAccumulator, cap: ${ACCUMULATOR_CAP} };
        rt.simAccumulator = 0;
        rt.lastFrame = performance.now();
        return result;
    })()`);
    check('frame guard: long stall is catch-up capped', accumulatorGuard.advanced <= ACCUMULATOR_CAP + 0.002 && accumulatorGuard.accumulator <= ACCUMULATOR_CAP + 0.002, JSON.stringify(accumulatorGuard));

    const churn = await entityChurn();
    check('entity churn: projectiles and pickups actually move', churn.movedProjectile && churn.movedPickup, JSON.stringify({ movedProjectile: churn.movedProjectile, movedPickup: churn.movedPickup }));
    check('entity churn: projectile/pickup slots recycle', churn.projectileFree > 0 && churn.pickupFree > 0 && churn.reusedProjectileSlots.length > 0 && churn.reusedPickupSlots.length > 0 && new Set(churn.reusedProjectileSlots).size <= 8 && new Set(churn.reusedPickupSlots).size <= 8, JSON.stringify({ firstProjectileSlots: churn.firstProjectileSlots.slice(0, 8), reusedProjectileSlots: churn.reusedProjectileSlots.slice(0, 8), firstPickupSlots: churn.firstPickupSlots.slice(0, 8), reusedPickupSlots: churn.reusedPickupSlots.slice(0, 8), projectileFree: churn.projectileFree, pickupFree: churn.pickupFree }));
    check('entity churn: cleaned entities release render meshes', churn.finalProjectiles === 0 && churn.finalPickups === 0 && churn.finalProjectileMeshes === 0 && churn.finalPickupMeshes === 0, JSON.stringify(churn));
    check('entity churn: store growth remains bounded', churn.projectileNextSlot <= 64 && churn.pickupNextSlot <= 64 && churn.maxProjectiles <= 64 && churn.maxPickups <= 16, JSON.stringify({ projectileNextSlot: churn.projectileNextSlot, pickupNextSlot: churn.pickupNextSlot, maxProjectiles: churn.maxProjectiles, maxPickups: churn.maxPickups, thresholds: { projectileNextSlot: 64, pickupNextSlot: 64, maxProjectiles: 64, maxPickups: 16 } }));

    const transitionResult = await systemTransitions();
    check('system travel: connected systems transition and return cleanly', transitionResult.every((entry) => entry.ok) && transitionResult.at(-1).actual === 'helios-verge', JSON.stringify(transitionResult));
    const instanceResult = await instanceTransitions();
    check('instance travel: open space and both field instances resolve', instanceResult[0]?.actual === 'shardbelt' && instanceResult[1]?.actual === 'mourning-line' && instanceResult[2]?.actual === null, JSON.stringify(instanceResult));

    await startArena('asteroid-field', '1v3', 'rookie');
    await stopLoop();
    const asteroidMetric = await deterministicSceneSoak('asteroid-field', 150);
    metrics.push(asteroidMetric);
    const asteroidResource = await resourceChurn('asteroid-field', 'asteroid');
    check('asteroid field: flight/combat/resource transforms stay finite', asteroidMetric.finite && asteroidResource.found && asteroidResource.gained > 0, JSON.stringify({ metric: asteroidMetric.issues.slice(0, 2), resource: asteroidResource }));
    check('asteroid field: entity/render growth remains bounded', asteroidMetric.maxProjectiles <= 96 && asteroidMetric.maxPickups <= 32 && asteroidMetric.maxProjectileSlot <= 128 && asteroidMetric.maxPickupSlot <= 64, JSON.stringify({ maxProjectiles: asteroidMetric.maxProjectiles, maxPickups: asteroidMetric.maxPickups, projectileSlot: asteroidMetric.maxProjectileSlot, pickupSlot: asteroidMetric.maxPickupSlot }));

    await startArena('debris-field', '1v3', 'rookie');
    await stopLoop();
    const debrisMetric = await deterministicSceneSoak('debris-field', 150);
    metrics.push(debrisMetric);
    const debrisResource = await resourceChurn('debris-field', 'wreck');
    check('debris field: flight/combat/resource transforms stay finite', debrisMetric.finite && debrisResource.found && debrisResource.gained > 0, JSON.stringify({ metric: debrisMetric.issues.slice(0, 2), resource: debrisResource }));
    check('debris field: entity/render growth remains bounded', debrisMetric.maxProjectiles <= 96 && debrisMetric.maxPickups <= 32 && debrisMetric.maxProjectileSlot <= 128 && debrisMetric.maxPickupSlot <= 64, JSON.stringify({ maxProjectiles: debrisMetric.maxProjectiles, maxPickups: debrisMetric.maxPickups, projectileSlot: debrisMetric.maxProjectileSlot, pickupSlot: debrisMetric.maxPickupSlot }));

    // Real rAF samples use the same debris scene before and after the
    // deterministic stress. Compare distributions rather than declaring an
    // absolute SwiftShader FPS target to be a product failure.
    // Give asynchronous field/GLB work time to settle before comparing the
    // two short real-rAF windows; otherwise the first window can contain the
    // one-time asset upload stall rather than a steady-state frame sample.
    await sleep(1200);
    await resumeLoop();
    await sampleRaf();
    rafEarly = summarizeSamples(await sampleRaf());
    await stopLoop();
    const lateStress = await entityChurn();
    await resumeLoop();
    rafLate = summarizeSamples(await sampleRaf());
    await stopLoop();
    const rafThreshold = {
        p90Multiplier: 1.75,
        additiveMs: 10,
        minimumSamples: 8,
        allowedP90: rafEarly.p90 == null ? null : Number((rafEarly.p90 * 1.75 + 10).toFixed(2)),
    };
    const rafComparable = rafEarly.n >= rafThreshold.minimumSamples && rafLate.n >= rafThreshold.minimumSamples;
    const rafStable = rafComparable && rafLate.p90 <= rafThreshold.allowedP90;
    check('real rAF: late frame-time distribution does not materially degrade', rafStable, JSON.stringify({ early: rafEarly, late: rafLate, threshold: rafThreshold, lateStress: { projectileNextSlot: lateStress.projectileNextSlot, pickupNextSlot: lateStress.pickupNextSlot } }));

    const pause = await pauseResume();
    check('pause/resume: modal freezes simulation then resumes it', pause.modalWhilePaused && !pause.modalAfterResume && pause.pausedDelta === 0 && pause.resumedDelta > 0 && pause.accumulator === 0, JSON.stringify(pause));

    await send('Page.captureScreenshot', { format: 'png' }).then((capture) => {
        writeFileSync(SCREENSHOT, Buffer.from(capture.data, 'base64'));
        screenshotWritten = true;
    });

    // Return to an actual career save (arena saves intentionally do not write
    // the autosave slot) and verify the public save path still round-trips.
    await evaluate('window.__VOID_PRIVATEER__.newGame(); true');
    await waitFor(`window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix'`);
    await evaluate('window.__VOID_PRIVATEER__.launch(); true');
    await waitFor(`Boolean(window.__VOID_PRIVATEER__.getRuntime()?.save?.player && !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt)`);
    await evaluate('window.__VOID_PRIVATEER__.saveNow(); true');
    // Let transient combat-simulator toasts clear before measuring the stable
    // DOM surface. Event listeners are intentionally not hidden by this wait.
    await sleep(5200);
    const saved = await evaluate(`(() => {
        const raw = localStorage.getItem('void-privateer-save-v1');
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        const position = parsed?.player?.position;
        return {
            hasRaw: Boolean(raw),
            parsed: Boolean(parsed),
            finitePosition: Array.isArray(position) && position.length === 3 && position.every(Number.isFinite),
            stripsInterpolation: Boolean(parsed?.player) && !('prevPosition' in parsed.player) && !('prevRotation' in parsed.player),
            systemId: parsed?.player?.systemId ?? null,
        };
    })()`);
    check('career save: live state still serializes and round-trips', saved.hasRaw && saved.parsed && saved.finitePosition && saved.stripsInterpolation, JSON.stringify(saved));

    const finalSurface = await evaluate(`(() => ({
        dom: document.querySelectorAll('*').length,
        canvases: document.querySelectorAll('canvas').length,
        buttons: document.querySelectorAll('button').length,
        events: window.__VR_EVENT_STATS__?.(),
    }))()`);
    const surfaceDelta = {
        dom: finalSurface.dom - baselineSurface.dom,
        canvases: finalSurface.canvases - baselineSurface.canvases,
        buttons: finalSurface.buttons - baselineSurface.buttons,
        eventNet: (finalSurface.events?.net ?? 0) - (baselineSurface.events?.net ?? 0),
    };
    check('surface: DOM/canvas/listener counts remain stable after transitions', Math.abs(surfaceDelta.dom) <= 40 && surfaceDelta.canvases === 0 && Math.abs(surfaceDelta.buttons) <= 8 && Math.abs(surfaceDelta.eventNet) <= 12, JSON.stringify({ baselineSurface, finalSurface, surfaceDelta }));
    check('diagnostics: no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
    check('diagnostics: no failed requests or HTTP errors', networkErrors.length === 0 && responseErrors.length === 0, JSON.stringify({ networkErrors: networkErrors.slice(0, 3), responseErrors: responseErrors.slice(0, 3) }));
}
catch (error) {
    console.error('PROBE CRASHED:', error.stack ?? error.message);
    FAILURES.push(`probe exception: ${error.message}`);
}
finally {
    try { await send('Browser.close'); }
    catch { /* Chrome may already have exited. */ }
    ws?.close();
    chrome.kill();
    httpd?.kill();
    await sleep(250);
}

console.log('\n=== performance soak summary ===');
for (const metric of metrics) {
    console.log(`${metric.label}: steps=${metric.steps} sim=${metric.simSeconds?.toFixed?.(2) ?? '0.00'}s samples=${metric.sampleCount} wall=${metric.wallMs?.toFixed?.(1) ?? '0.0'}ms maxStep=${metric.maxStepMs?.toFixed?.(2) ?? '0.00'}ms finite=${metric.finite} peakEntities=${JSON.stringify({ ships: metric.maxShips, projectiles: metric.maxProjectiles, pickups: metric.maxPickups })} peakMeshes=${JSON.stringify({ ships: metric.maxShipMeshes, projectiles: metric.maxProjectileMeshes, pickups: metric.maxPickupMeshes })} slots=${JSON.stringify({ projectile: metric.maxProjectileSlot, pickup: metric.maxPickupSlot })}`);
}
console.log(`realRafEarly=${JSON.stringify(rafEarly)} realRafLate=${JSON.stringify(rafLate)} threshold=${JSON.stringify({ p90Multiplier: 1.75, additiveMs: 10, minimumSamples: 8, allowedP90: rafEarly?.p90 == null ? null : Number((rafEarly.p90 * 1.75 + 10).toFixed(2)) })}`);
console.log(`baseline/final screenshot=${screenshotWritten ? SCREENSHOT : 'not-written'}`);
console.log(`pageErrors=${JSON.stringify(pageErrors.slice(0, 6))}`);
console.log(`networkErrors=${JSON.stringify({ networkErrors: networkErrors.slice(0, 6), responseErrors: responseErrors.slice(0, 6) })}`);
console.log(`\n${PASS.length} passed, ${FAILURES.length} failed`);
if (FAILURES.length) {
    FAILURES.forEach((failure) => console.log(`FAILED ${failure}`));
    process.exitCode = 1;
}
