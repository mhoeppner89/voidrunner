import { spawn } from 'node:child_process';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const BASE_URL = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const PORT = 9339;
const PROFILE = '/tmp/vr-perf-profile';
const SCENES = (process.env.VR_PERF_SCENES ?? 'open,asteroid-field,debris-field').split(',');
const MODES = (process.env.VR_PERF_MODES ?? 'high,auto,low').split(',');
const CPU_PROFILE = process.env.VR_CPU_PROFILE === '1';
const RENDER_BREAKDOWN = process.env.VR_RENDER_BREAKDOWN === '1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    '--headless=new', '--mute-audio',
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
const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false))
            return true;
        await sleep(120);
    }
    throw new Error(`Timed out waiting for ${expression}`);
};

const measureFps = (seconds = 2.5) => evaluate(`(() => new Promise((resolve) => {
    const startedAt = performance.now();
    let frames = 0;
    let worst = 0;
    let previous = startedAt;
    const loop = (now) => {
        worst = Math.max(worst, now - previous);
        previous = now;
        frames += 1;
        if (now - startedAt < ${seconds * 1000}) requestAnimationFrame(loop);
        else resolve({ fps: frames / ((now - startedAt) / 1000), worst });
    };
    requestAnimationFrame(loop);
}))()`);

const measureRenderPath = () => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    if (rt.frameId) cancelAnimationFrame(rt.frameId);
    rt.frameId = 0;
    rt.simAccumulator = 0;
    const webgl = rt.renderer.renderer;
    const gl = webgl.getContext();
    const previousAutoReset = webgl.info.autoReset;
    webgl.info.autoReset = false;
    const samples = [];
    let calls = 0;
    let triangles = 0;
    for (let index = 0; index < 24; index += 1) {
        webgl.info.reset();
        const startedAt = performance.now();
        rt.syncRender(0, startedAt);
        gl.finish();
        samples.push(performance.now() - startedAt);
        calls = webgl.info.render.calls;
        triangles = webgl.info.render.triangles;
    }
    webgl.info.autoReset = previousAutoReset;
    samples.sort((a, b) => a - b);
    rt.lastFrame = performance.now();
    rt.frameId = requestAnimationFrame(rt.frame);
    const canvas = webgl.domElement;
    return {
        meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        medianMs: samples[Math.floor(samples.length / 2)],
        p90Ms: samples[Math.floor(samples.length * 0.9)],
        calls,
        triangles,
        textures: webgl.info.memory.textures,
        geometries: webgl.info.memory.geometries,
        resolution: canvas.dataset.renderResolution,
        bloom: rt.renderer.bloomEnabled(),
        scale: rt.renderer.lastQualityScale,
    };
})()`);

try {
    let target;
    for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
        await sleep(500);
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            target = targets.find((entry) => entry.type === 'page');
        }
        catch { /* Chrome is still starting. */ }
    }
    if (!target)
        throw new Error('Headless Chrome did not expose a page target.');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (!message.id || !pending.has(message.id))
            return;
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error)
            entry.reject(new Error(message.error.message));
        else
            entry.resolve(message.result);
    };
    await send('Page.enable');
    await send('Runtime.enable');
    if (CPU_PROFILE) {
        await send('Profiler.enable');
        await send('Profiler.setSamplingInterval', { interval: 100 });
    }
    await send('Page.navigate', { url: `${BASE_URL}?perf=${Date.now()}` });
    await waitFor('Boolean(window.__VOID_PRIVATEER__)');

    for (const scene of SCENES) {
        await evaluate(`window.__VOID_PRIVATEER__.startArena(${JSON.stringify(scene)}, '1v3'); true`);
        await waitFor(`window.__VOID_PRIVATEER__.getRuntime()?.arena?.environment === ${JSON.stringify(scene)}`);
        await evaluate(`(() => {
            const save = window.__VOID_PRIVATEER__.getState();
            save.player.armor = 1e9;
            save.player.hull = 1e9;
            save.player.shield = 1e9;
            return true;
        })()`);
        await sleep(1800);
        for (const mode of MODES) {
            await evaluate(`(() => {
                const rt = window.__VOID_PRIVATEER__.getRuntime();
                delete rt.renderer.bloomEnabled;
                const requested = ${JSON.stringify(mode)};
                const baseMode = requested.startsWith('high-') ? 'high' : requested;
                rt.setSetting('quality', baseMode);
                if (requested === 'high-no-bloom') {
                    rt.renderer.bloomEnabled = () => false;
                }
                else if (requested === 'high-quarter-bloom') {
                    const canvas = rt.renderer.renderer.domElement;
                    const width = Math.max(2, Math.floor(canvas.width / 4));
                    const height = Math.max(2, Math.floor(canvas.height / 4));
                    for (const target of rt.renderer.bloomBlurTargets)
                        target.setSize(width, height);
                    rt.renderer.bloomBlurMaterial.uniforms.uResolution.value.set(width * 2, height * 2);
                }
                return true;
            })()`);
            await sleep(mode === 'auto' ? 3200 : 900);
            const fps = await measureFps();
            const render = await measureRenderPath();
            console.log(JSON.stringify({ scene, mode, fps: Number(fps.fps.toFixed(1)), worstMs: Number(fps.worst.toFixed(1)), ...render }));
            if (RENDER_BREAKDOWN && mode === MODES[0]) {
                const breakdown = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    if (rt.frameId) cancelAnimationFrame(rt.frameId);
                    rt.frameId = 0;
                    const webgl = rt.renderer.renderer;
                    const gl = webgl.getContext();
                    const previousAutoReset = webgl.info.autoReset;
                    webgl.info.autoReset = false;
                    const measure = () => {
                        webgl.info.reset();
                        const startedAt = performance.now();
                        rt.renderer.render();
                        gl.finish();
                        return {
                            ms: performance.now() - startedAt,
                            calls: webgl.info.render.calls,
                            triangles: webgl.info.render.triangles,
                        };
                    };
                    const result = { all: measure() };
                    const groups = {
                        sky: rt.renderer.skyRoot,
                        locations: rt.renderer.locationRoot,
                        shipsAndEffects: rt.renderer.dynamicRoot,
                        activeField: rt.renderer.instanceRoots.get(rt.renderer.activeInstanceId),
                    };
                    for (const [name, group] of Object.entries(groups)) {
                        if (!group || !group.visible) continue;
                        group.visible = false;
                        result['without' + name[0].toUpperCase() + name.slice(1)] = measure();
                        group.visible = true;
                    }
                    webgl.info.autoReset = previousAutoReset;
                    rt.lastFrame = performance.now();
                    rt.frameId = requestAnimationFrame(rt.frame);
                    return result;
                })()`);
                console.log(JSON.stringify({ scene, renderBreakdown: breakdown }));
            }
            if (CPU_PROFILE && mode === MODES[0]) {
                await send('Profiler.start');
                await sleep(4000);
                const { profile } = await send('Profiler.stop');
                const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
                const totals = new Map();
                for (let index = 0; index < profile.samples.length; index += 1) {
                    const frame = nodes.get(profile.samples[index]);
                    const name = frame?.functionName || '(anonymous)';
                    const url = frame?.url ? frame.url.split('/').at(-1) : '';
                    const key = `${name} (${url}:${(frame?.lineNumber ?? -1) + 1})`;
                    totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
                }
                const top = [...totals.entries()]
                    .filter(([name]) => !name.startsWith('(idle)'))
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 18)
                    .map(([name, micros]) => ({ name, ms: Number((micros / 1000).toFixed(1)) }));
                console.log(JSON.stringify({ scene, cpuProfile: top }));
            }
        }
    }
}
catch (error) {
    console.error('ERR:', error.stack ?? error.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); }
    catch { /* Chrome may already be gone. */ }
    ws?.close();
    chrome.kill();
    httpd?.kill();
}
