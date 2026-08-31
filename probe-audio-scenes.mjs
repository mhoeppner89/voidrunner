// Live-browser audio regression. This uses a fresh profile so title, dock,
// flight, station/context transitions, mute persistence, and quit/resume are
// all tested against the current build rather than a saved user's state.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const ORIGIN = new URL(BASE_URL).origin;
const SERVER_PORT = new URL(BASE_URL).port || '4173';
const CDP_PORT = Number(process.env.VR_CDP_PORT ?? 9347);
const SHOT_DIR = join(tmpdir(), 'voidrunner-audio-scenes');
const profile = mkdtempSync(join(tmpdir(), 'vr-audio-scenes-'));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const PASS = [];
const FAIL = [];
const check = (name, ok, detail = '') => {
    const result = Boolean(ok);
    (result ? PASS : FAIL).push({ name, detail });
    console.log(`${result ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
};

let server;
let chrome;
let ws;
let messageId = 0;
const pending = new Map();
const pageErrors = [];
const networkErrors = [];

const serverReady = async () => {
    try {
        const response = await fetch(BASE_URL);
        return response.ok;
    }
    catch {
        return false;
    }
};

const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (!ws) {
        reject(new Error(`CDP is not connected for ${method}`));
        return;
    }
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime evaluation failed');
    return result.result?.value;
};

const evalSafe = async (expression, fallback = undefined) => {
    try {
        return await evaluate(expression);
    }
    catch {
        return fallback;
    }
};

const waitForTarget = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
            const targets = await response.json();
            const page = targets.find((target) => target.type === 'page');
            if (page)
                return page;
        }
        catch {
            // Chrome is still booting.
        }
        await wait(250);
    }
    throw new Error('no Chrome DevTools page target');
};

const waitFor = async (expression, predicate = Boolean, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const value = await evalSafe(expression);
        if (predicate(value))
            return value;
        await wait(150);
    }
    return await evalSafe(expression);
};

const click = async (selector) => evalSafe(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
})()`, false);

const setValue = async (selector, value) => evalSafe(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.value = ${JSON.stringify(value)};
    node.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
})()`, false);

const visible = async (selector) => evalSafe(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const style = getComputedStyle(node);
    return !node.classList.contains('is-hidden') && style.display !== 'none' && style.visibility !== 'hidden';
})()`, false);

const snapshot = () => evalSafe(`(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api?.getRuntime?.();
    const state = api?.getState?.();
    const audio = runtime?.audio;
    return {
        hasRuntime: Boolean(runtime),
        titleVisible: Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden')),
        dockVisible: Boolean(document.querySelector('#dock-screen') && !document.querySelector('#dock-screen').classList.contains('is-hidden')),
        hudVisible: Boolean(document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('is-hidden')),
        dockedAt: state?.player?.dockedAt ?? null,
        systemId: state?.player?.systemId ?? null,
        settings: state?.settings ? { music: state.settings.music, effects: state.settings.effects, quality: state.settings.quality, language: state.settings.language } : null,
        audio: audio ? {
            enabled: audio.enabled,
            contextState: audio.context?.state ?? null,
            stationMode: audio.stationMode,
            musicContext: audio.musicContext,
            currentContext: audio.currentContext,
            musicVolume: audio.musicVolume,
            effectsVolume: audio.effectsVolume,
            musicTimer: audio.musicTimer,
            dangerLevel: audio.dangerLevel,
            combatTier: audio.combatTier,
            musicBus: Boolean(audio.musicBus),
            stationSource: Boolean(audio.stationSource),
            engineOscillators: Boolean(audio.engineOscA && audio.engineOscB && audio.engineSub),
            engineWash: Boolean(audio.engineWashSource),
            musicGain: audio.musicGain?.gain?.value ?? null,
            effectsGain: audio.effectsGain?.gain?.value ?? null,
            drones: audio.droneOscillators?.length ?? 0,
        } : null,
        visible: ['title-screen', 'dock-screen', 'hud', 'pause-panel', 'map-panel', 'rotate-notice'].filter((id) => {
            const node = document.getElementById(id);
            return node && !node.classList.contains('is-hidden') && getComputedStyle(node).display !== 'none';
        }),
    };
})()`, {});

const audioInstrumentation = () => evalSafe(`(() => {
    const audio = window.__VOID_PRIVATEER__.getRuntime?.()?.audio;
    if (!audio)
        return null;
    const probe = window.__VOIDRUNNER_AUDIO_PROBE__ ??= {
        contexts: [],
        firstContext: null,
        active: null,
    };
    const currentContext = audio.context;
    if (currentContext && !probe.contexts.includes(currentContext))
        probe.contexts.push(currentContext);
    if (!probe.firstContext)
        probe.firstContext = currentContext;
    const counters = {
        layers: [],
        swaps: 0,
        disconnects: 0,
        startDrones: 0,
        stopDrones: 0,
        effectVoices: 0,
    };
    probe.active = counters;
    const originalLayer = audio.playMusicLayer.bind(audio);
    audio.playMusicLayer = (context, ...args) => {
        counters.layers.push(context);
        return originalLayer(context, ...args);
    };
    const originalSwap = audio.swapMusicBus.bind(audio);
    audio.swapMusicBus = (...args) => {
        const oldBus = audio.musicBus;
        if (oldBus && !oldBus.__voidrunnerDisconnectProbe) {
            const disconnect = oldBus.disconnect.bind(oldBus);
            oldBus.disconnect = (...disconnectArgs) => {
                counters.disconnects += 1;
                return disconnect(...disconnectArgs);
            };
            oldBus.__voidrunnerDisconnectProbe = true;
        }
        counters.swaps += 1;
        return originalSwap(...args);
    };
    const originalStart = audio.startDrones.bind(audio);
    audio.startDrones = (...args) => {
        counters.startDrones += 1;
        return originalStart(...args);
    };
    const originalStop = audio.stopDrones.bind(audio);
    audio.stopDrones = (...args) => {
        counters.stopDrones += 1;
        return originalStop(...args);
    };
    const originalEventChain = audio.eventChain.bind(audio);
    audio.eventChain = (...args) => {
        counters.effectVoices += 1;
        return originalEventChain(...args);
    };
    audio.__voidrunnerAudioProbeWrapped = true;
    return {
        contextState: currentContext?.state ?? null,
        contextCount: probe.contexts.length,
        sources: Boolean(audio.stationSource && audio.engineOscA && audio.engineOscB && audio.engineSub && audio.engineWashSource),
    };
})()`, null);

const instrumentCurrentAudio = async () => {
    const already = await evalSafe('Boolean(window.__VOID_PRIVATEER__.getRuntime?.()?.audio?.__voidrunnerAudioProbeWrapped)', false);
    return already ? await evalSafe(`(() => {
        const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
        const probe = window.__VOIDRUNNER_AUDIO_PROBE__;
        if (audio.context && !probe.contexts.includes(audio.context)) probe.contexts.push(audio.context);
        return { contextState: audio.context?.state ?? null, contextCount: probe.contexts.length };
    })()`, null) : await audioInstrumentation();
};

const contextUpdate = async (label, stationMode = false, nearbyEnemies = 0) => evaluate(`(() => {
    const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
    audio.stationMode = ${Boolean(stationMode)};
    audio.musicTimer = 0;
    audio.update(1 / 60, 0, false, 0, ${Number(nearbyEnemies)}, ${JSON.stringify(label)});
    return {
        stationMode: audio.stationMode,
        musicContext: audio.musicContext,
        currentContext: audio.currentContext,
        dangerLevel: audio.dangerLevel,
        combatTier: audio.combatTier,
        musicTimer: audio.musicTimer,
    };
})()`);

const probeCounters = () => evalSafe(`(() => {
    const active = window.__VOIDRUNNER_AUDIO_PROBE__?.active;
    return active ? {
        layers: active.layers.slice(),
        swaps: active.swaps,
        disconnects: active.disconnects,
        startDrones: active.startDrones,
        stopDrones: active.stopDrones,
        effectVoices: active.effectVoices,
    } : null;
})()`, null);

const capture = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(SHOT_DIR, name);
    writeFileSync(path, Buffer.from(result.data, 'base64'));
    console.log(`SHOT ${path}`);
    return path;
};

const main = async () => {
    mkdirSync(SHOT_DIR, { recursive: true });
    if (!await serverReady()) {
        server = spawn('python3', ['-m', 'http.server', SERVER_PORT, '--bind', '127.0.0.1'], {
            cwd: ROOT,
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        for (let attempt = 0; attempt < 80 && !await serverReady(); attempt += 1)
            await wait(100);
    }

    chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
        '--no-sandbox', '--disable-gpu-sandbox',
        `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', 'about:blank',
    ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
    const target = await waitForTarget();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const entry = pending.get(message.id);
            pending.delete(message.id);
            if (message.error)
                entry.reject(new Error(message.error.message));
            else
                entry.resolve(message.result);
            return;
        }
        if (message.method === 'Runtime.exceptionThrown')
            pageErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'uncaught page exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
            pageErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') ?? 'console.error');
        if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')
            pageErrors.push(message.params.entry.text ?? 'browser log error');
        if (message.method === 'Network.loadingFailed' && !String(message.params.requestId).startsWith('data:'))
            networkErrors.push(`${message.params.type ?? 'request'} ${message.params.errorText ?? ''}`.trim());
        if (message.method === 'Network.responseReceived' && message.params.response.status >= 400)
            networkErrors.push(`${message.params.response.status} ${message.params.response.url}`);
    };
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' });
    await send('Page.navigate', { url: `${BASE_URL}?probe=audio-scenes-${Date.now()}` });
    await waitFor('Boolean(window.__VOID_PRIVATEER__ && document.querySelector("#game-shell"))', Boolean, 20000);
    await wait(700);

    const title = await snapshot();
    check('fresh title has no active audio runtime', title.titleVisible && !title.hasRuntime && title.audio === null, JSON.stringify(title));
    await capture('01-title.png');

    check('NEW CAREER enters the Helix dock', await click('[data-ui-command="new"]'));
    await waitFor('window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === "helix"', Boolean, 25000);
    await wait(900);
    const dock = await snapshot();
    check('dock music enters station mode', dock.dockVisible && dock.dockedAt === 'helix' && dock.audio?.enabled && dock.audio?.stationMode && dock.audio?.contextState, JSON.stringify(dock));
    await instrumentCurrentAudio();
    const stationLayer = await contextUpdate('station', true);
    check('station layer is scheduled in the dock', stationLayer.stationMode && stationLayer.currentContext === 'station', JSON.stringify(stationLayer));
    await capture('02-station-dock.png');

    check('dock options opens for volume controls', await click('#dock-screen .dock-options-button') && await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))', Boolean, 5000));
    await setValue('#pause-panel [data-setting="music"]', 0);
    await setValue('#pause-panel [data-setting="effects"]', 0);
    await wait(120);
    const muted = await snapshot();
    const mutedCountersBefore = await probeCounters();
    await contextUpdate('station', true);
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().audio.play("ui"); return true; })()').catch(() => undefined);
    const mutedCountersAfter = await probeCounters();
    check('full mute reaches both live audio buses', muted.settings?.music === 0 && muted.settings?.effects === 0 && muted.audio?.musicVolume === 0 && muted.audio?.effectsVolume === 0, JSON.stringify(muted));
    check('full mute suppresses music layers and effects', mutedCountersAfter?.layers.length === mutedCountersBefore?.layers.length && mutedCountersAfter?.effectVoices === mutedCountersBefore?.effectVoices, JSON.stringify({ before: mutedCountersBefore, after: mutedCountersAfter }));
    const mutedPersisted = await evalSafe(`(() => {
        const raw = localStorage.getItem('void-privateer-save-v1');
        const settings = raw ? JSON.parse(raw)?.settings : null;
        return settings ? { music: settings.music, effects: settings.effects } : null;
    })()`, null);
    check('full mute is written to the career autosave', mutedPersisted?.music === 0 && mutedPersisted?.effects === 0, JSON.stringify(mutedPersisted));
    await setValue('#pause-panel [data-setting="music"]', 0.45);
    await setValue('#pause-panel [data-setting="effects"]', 0.55);
    await wait(120);
    const audible = await snapshot();
    const effectBefore = (await probeCounters())?.effectVoices ?? 0;
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().audio.play("ui"); return true; })()').catch(() => undefined);
    const effectAfter = (await probeCounters())?.effectVoices ?? 0;
    check('volume controls restore audible music and effects', audible.audio?.musicVolume === 0.45 && audible.audio?.effectsVolume === 0.55 && effectAfter > effectBefore, JSON.stringify({ audible, effectBefore, effectAfter }));
    const audiblePersisted = await evalSafe(`(() => {
        const raw = localStorage.getItem('void-privateer-save-v1');
        const settings = raw ? JSON.parse(raw)?.settings : null;
        return settings ? { music: settings.music, effects: settings.effects } : null;
    })()`, null);
    check('restored volumes persist in the career autosave', audiblePersisted?.music === 0.45 && audiblePersisted?.effects === 0.55, JSON.stringify(audiblePersisted));
    await click('[data-ui-command="close-options"]');
    await wait(180);

    // Station identity transitions reuse the same audio graph. Continuous
    // engine/station sources must not be recreated for each dock.
    const initialRefs = await evalSafe(`(() => {
        const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
        const probe = window.__VOIDRUNNER_AUDIO_PROBE__;
        probe.initialRefs = { station: audio.stationSource, engineA: audio.engineOscA, engineB: audio.engineOscB, engineSub: audio.engineSub, wash: audio.engineWashSource };
        return { contextState: audio.context?.state ?? null, sources: Boolean(audio.stationSource && audio.engineOscA && audio.engineWashSource) };
    })()`, null);
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().launch(); return true; })()').catch(() => undefined);
    await contextUpdate('open', false);
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().dockAt("cairn"); return true; })()').catch(() => undefined);
    await contextUpdate('station', true);
    const cairn = await snapshot();
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().launch(); return true; })()').catch(() => undefined);
    await contextUpdate('open', false);
    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().dockAt("helix"); return true; })()').catch(() => undefined);
    await contextUpdate('station', true);
    const helixAgain = await snapshot();
    const graphReuse = await evalSafe(`(() => {
        const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
        const probe = window.__VOIDRUNNER_AUDIO_PROBE__;
        return {
            sameContext: audio.context === probe.firstContext,
            sameStationSource: audio.stationSource === probe.initialRefs.station,
            sameEngine: audio.engineOscA === probe.initialRefs.engineA && audio.engineWashSource === probe.initialRefs.wash,
            contextCount: probe.contexts.length,
        };
    })()`, {});
    check('station identity changes reuse one audio context and source graph', cairn.dockedAt === 'cairn' && helixAgain.dockedAt === 'helix' && graphReuse.sameContext && graphReuse.sameStationSource && graphReuse.sameEngine && graphReuse.contextCount === 1, JSON.stringify({ cairn, helixAgain, graphReuse }));
    await wait(260);
    const stationCounters = await probeCounters();
    check('station/flight context swaps disconnect the old music bus', stationCounters?.swaps >= 3 && stationCounters?.disconnects >= 1, JSON.stringify(stationCounters));

    await evaluate('(() => { window.__VOID_PRIVATEER__.getRuntime().launch(); return true; })()').catch(() => undefined);
    const openLayer = await contextUpdate('open', false);
    check('launch flight selects open-space music', openLayer.currentContext === 'open' && !(await snapshot()).audio?.stationMode, JSON.stringify(openLayer));
    const contextNames = [];
    for (const name of ['planet', 'field', 'graveyard']) {
        const state = await contextUpdate(name, false);
        contextNames.push({ name, state });
        check(`${name} music context is distinct`, state.currentContext === name && state.musicContext === name, JSON.stringify(state));
    }
    const combatCalm = await contextUpdate('combat', false, 1);
    const combatEscalated = await contextUpdate('combat', false, 5);
    check('combat music enters an intensity tier', combatCalm.currentContext === 'combat' && combatCalm.combatTier >= 1 && combatEscalated.dangerLevel > combatCalm.dangerLevel && combatEscalated.combatTier >= combatCalm.combatTier, JSON.stringify({ calm: combatCalm, escalated: combatEscalated }));
    await evaluate(`(() => {
        const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
        for (let i = 0; i < 320; i += 1)
            audio.update(1 / 60, 0, false, 0, 0, 'open');
        return { context: audio.currentContext, danger: audio.dangerLevel, tier: audio.combatTier };
    })()`);
    const layers = (await probeCounters())?.layers ?? [];
    check('music scheduler visited station, open, planet, field, graveyard, and combat', ['station', 'open', 'planet', 'field', 'graveyard', 'combat'].every((name) => layers.includes(name)), JSON.stringify({ layers, contextNames }));

    // Exercise actual system transitions after the local-context pass; the
    // debug jump uses the production route/arrival code and should not create
    // another AudioContext.
    for (const systemId of ['meridian', 'pale-ring', 'redwake', 'helios-verge']) {
        const jumped = await evaluate(`(() => {
            const target = ${JSON.stringify(systemId)};
            const api = window.__VOID_PRIVATEER__;
            const legs = [];
            let current = api.getState()?.player?.systemId;
            for (let leg = 0; leg < 4 && current !== target; leg += 1) {
                legs.push(Boolean(api.jumpToSystem(target)));
                current = api.getState()?.player?.systemId;
            }
            return { reached: current === target, legs, systemId: current };
        })()`);
        await wait(220);
        const state = await snapshot();
        const open = await contextUpdate('open', false);
        const graph = await evalSafe(`(() => {
            const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
            const probe = window.__VOIDRUNNER_AUDIO_PROBE__;
            return { sameContext: audio.context === probe.firstContext, contextCount: probe.contexts.length };
        })()`, {});
        check(`system transition reaches ${systemId} without a second audio context`, jumped?.reached && state.systemId === systemId && graph.sameContext && graph.contextCount === 1 && open.currentContext === 'open', JSON.stringify({ jumped, state: { systemId: state.systemId, dockedAt: state.dockedAt }, graph, open }));
    }

    const flight = await snapshot();
    check('flight HUD is active after audio scene transitions', flight.hudVisible && flight.dockedAt === null && flight.audio?.stationMode === false, JSON.stringify(flight));
    await capture('03-flight-open-space.png');

    // Persist full mute through a real in-flight options -> quit -> resume
    // cycle, then prove the old graph closed before the new one was made.
    check('flight pause control opens', await click('#hud .pause-button') && await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))', Boolean, 5000));
    await setValue('#pause-panel [data-setting="music"]', 0);
    await setValue('#pause-panel [data-setting="effects"]', 0);
    await wait(150);
    const flightMuted = await snapshot();
    check('in-flight full mute updates the active audio graph', flightMuted.settings?.music === 0 && flightMuted.settings?.effects === 0 && flightMuted.audio?.musicVolume === 0 && flightMuted.audio?.effectsVolume === 0, JSON.stringify(flightMuted));
    const oldContextStateBeforeQuit = await evalSafe('window.__VOIDRUNNER_AUDIO_PROBE__.firstContext?.state ?? null', null);
    check('QUIT TO TITLE is available from the paused flight', await click('#pause-panel [data-ui-command="quit-title"]'));
    await waitFor('Boolean(document.querySelector("#title-screen") && !document.querySelector("#title-screen").classList.contains("is-hidden"))', Boolean, 10000);
    await wait(320);
    const titleAfterQuit = await snapshot();
    const oldContextState = await evalSafe('window.__VOIDRUNNER_AUDIO_PROBE__.firstContext?.state ?? null', null);
    check('quit disposes the flight and closes its audio context', titleAfterQuit.titleVisible && !titleAfterQuit.hasRuntime && oldContextState === 'closed', JSON.stringify({ oldContextStateBeforeQuit, oldContextState, titleAfterQuit }));
    check('RESUME restores the saved undocked career', await click('[data-ui-command="resume"]'));
    await waitFor('Boolean(window.__VOID_PRIVATEER__.getRuntime() && !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt)', Boolean, 20000);
    await wait(700);
    await instrumentCurrentAudio();
    const resumed = await snapshot();
    const resumedGraph = await evalSafe(`(() => {
        const audio = window.__VOID_PRIVATEER__.getRuntime().audio;
        const probe = window.__VOIDRUNNER_AUDIO_PROBE__;
        return {
            newContext: audio.context !== probe.firstContext,
            contextCount: probe.contexts.length,
            sources: Boolean(audio.stationSource && audio.engineOscA && audio.engineOscB && audio.engineSub && audio.engineWashSource),
        };
    })()`, {});
    check('resumed career keeps full mute settings', resumed.hasRuntime && resumed.hudVisible && resumed.dockedAt === null && resumed.settings?.music === 0 && resumed.settings?.effects === 0 && resumed.audio?.musicVolume === 0 && resumed.audio?.effectsVolume === 0, JSON.stringify(resumed));
    check('resume creates one fresh graph after the old context closed', resumedGraph.newContext && resumedGraph.contextCount === 2 && resumedGraph.sources, JSON.stringify(resumedGraph));
    await capture('04-resumed-flight-muted.png');
    check('audio lifecycle produced no uncaught page/console errors', pageErrors.length === 0, pageErrors.slice(0, 8).join(' | '));
    check('audio lifecycle produced no failed network requests', networkErrors.length === 0, networkErrors.slice(0, 8).join(' | '));
};

try {
    await main();
}
catch (error) {
    console.error(`PROBE ERROR: ${error.message}`);
    FAIL.push({ name: 'probe exception', detail: error.stack ?? error.message });
}
finally {
    for (const entry of pending.values())
        entry.reject(new Error('probe closed'));
    pending.clear();
    try { ws?.close(); } catch { /* ignore */ }
    try { chrome?.kill(); } catch { /* ignore */ }
    try { server?.kill(); } catch { /* ignore */ }
}

console.log(`\n=== ${PASS.length} passed, ${FAIL.length} failed ===`);
for (const failure of FAIL)
    console.log(`  FAILED: ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`);
console.log(`Screenshots: ${SHOT_DIR}`);
process.exitCode = FAIL.length ? 1 : 0;
