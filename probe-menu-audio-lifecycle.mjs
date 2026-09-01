// Live-browser regression for the title, lifecycle, options, audio, and
// orientation surfaces. This deliberately uses a fresh Chrome profile so a
// first-run player (no autosave yet) is covered before the career is created.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const ORIGIN = new URL(BASE_URL).origin;
const SERVER_PORT = new URL(BASE_URL).port || '4173';
const CDP_PORT = Number(process.env.VR_CDP_PORT ?? 9344);
const SHOT_DIR = join(tmpdir(), 'voidrunner-menu-audio-shots');
const profile = mkdtempSync(join(tmpdir(), 'vr-menu-audio-'));
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

const evalSafe = async (expression, fallback = undefined) => {
    try {
        return await evaluate(expression);
    }
    catch {
        return fallback;
    }
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

const navigateAndWaitForHook = async (url) => {
    await send('Page.navigate', { url });
    return waitFor('Boolean(window.__VOID_PRIVATEER__ && document.querySelector("#game-shell"))', Boolean, 20000);
};

const visible = async (selector) => evalSafe(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const style = getComputedStyle(node);
    return !node.classList.contains('is-hidden') && style.display !== 'none' && style.visibility !== 'hidden';
})()` , false);

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

// Language changes reload the document. Waiting merely for the title/hook can
// succeed against the outgoing page before navigation starts, so stamp that
// document and require a fresh one before the probe continues.
const setLanguageAndWaitForReload = async (language) => {
    const marker = `language-reload-${Date.now()}-${Math.random()}`;
    await evaluate(`window.__VOIDRUNNER_PROBE_DOCUMENT__ = ${JSON.stringify(marker)}; true`);
    if (!await setValue('#pause-panel [data-setting="language"]', language))
        return false;
    return Boolean(await waitFor(`window.__VOIDRUNNER_PROBE_DOCUMENT__ !== ${JSON.stringify(marker)}
        && document.documentElement.lang === ${JSON.stringify(language)}
        && Boolean(window.__VOID_PRIVATEER__)
        && Boolean(document.querySelector('#title-screen'))`, Boolean, 20000));
};

// Headless Chrome can leave requestAnimationFrame suspended after repeated
// reloads even though the single page target reports itself visible. Session
// and first-flight staging intentionally yield to one paint; asking CDP for a
// frame mirrors the real browser's visible paint and keeps this lifecycle probe
// from mistaking a headless scheduling quirk for a game failure.
const wakeHeadlessPaint = async () => {
    await send('Page.bringToFront');
    await send('Page.captureScreenshot', { format: 'jpeg', quality: 1, fromSurface: true });
};

const press = async (code, key = code, release = true) => evaluate(`(() => {
    const init = { code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    ${release ? `window.dispatchEvent(new KeyboardEvent('keyup', init));` : ''}
    return true;
})()`);

const visibleSurfaces = () => evalSafe(`(() => {
    const ids = ['title-screen', 'dock-screen', 'hud', 'map-panel', 'ship-panel', 'pause-panel', 'arena-panel', 'chat-panel', 'rotate-notice'];
    return ids.filter((id) => {
        const node = document.getElementById(id);
        if (!node) return false;
        const style = getComputedStyle(node);
        return !node.classList.contains('is-hidden') && style.display !== 'none' && style.visibility !== 'hidden';
    });
})()`, []);

const modalIds = () => evalSafe(`(() => {
    const ids = ['map-panel', 'ship-panel', 'pause-panel', 'arena-panel', 'chat-panel'];
    return ids.filter((id) => {
        const node = document.getElementById(id);
        return node && !node.classList.contains('is-hidden') && getComputedStyle(node).display !== 'none';
    });
})()`, []);

const snapshot = () => evalSafe(`(() => {
    const api = window.__VOID_PRIVATEER__;
    const runtime = api?.getRuntime?.();
    const state = api?.getState?.();
    return {
        hasRuntime: Boolean(runtime),
        titleVisible: Boolean(document.querySelector('#title-screen') && !document.querySelector('#title-screen').classList.contains('is-hidden')),
        dockVisible: Boolean(document.querySelector('#dock-screen') && !document.querySelector('#dock-screen').classList.contains('is-hidden')),
        hudVisible: Boolean(document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('is-hidden')),
        dockedAt: state?.player?.dockedAt ?? null,
        settings: state?.settings ? { music: state.settings.music, effects: state.settings.effects, quality: state.settings.quality, language: state.settings.language } : null,
        language: document.documentElement.lang,
        worldTime: Number(runtime?.save?.world?.time ?? 0),
        modal: runtime?.ui?.isModalOpen ?? false,
        audio: runtime?.audio ? { enabled: runtime.audio.enabled, state: runtime.audio.context?.state ?? null, music: runtime.audio.musicVolume, effects: runtime.audio.effectsVolume } : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visible: ['title-screen', 'dock-screen', 'hud', 'map-panel', 'ship-panel', 'pause-panel', 'arena-panel', 'chat-panel', 'rotate-notice'].filter((id) => {
            const node = document.getElementById(id);
            return node && !node.classList.contains('is-hidden') && getComputedStyle(node).display !== 'none';
        }),
    };
})()`, {});

const capture = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(SHOT_DIR, name);
    writeFileSync(path, Buffer.from(result.data, 'base64'));
    console.log(`SHOT ${path}`);
    return path;
};

// Pump one deterministic frame through the real session while cancelling the
// normal rAF callback. This keeps focus/visibility assertions independent of
// headless Chromium's background-tab throttling, while still exercising the
// same frameBody path used by normal play.
const pumpRuntime = (seconds = 1) => evalSafe(`(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime?.();
    if (!runtime || runtime.save?.player?.dockedAt)
        return null;
    const before = Number(runtime.save.world.time ?? 0);
    if (runtime.frameId != null)
        cancelAnimationFrame(runtime.frameId);
    const last = Number.isFinite(runtime.lastFrame) ? runtime.lastFrame : performance.now();
    runtime.frameBody(Math.max(performance.now(), last) + ${Number(seconds)} * 1000);
    if (runtime.frameId != null)
        cancelAnimationFrame(runtime.frameId);
    return { before, after: Number(runtime.save.world.time ?? 0), modal: Boolean(runtime.ui?.isModalOpen) };
})()`, null);

const setViewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
    });
    // Device metrics normally fire resize/orientation events. Dispatching a
    // resize as well makes the same UI update path deterministic under
    // headless CDP emulation.
    await wait(80);
    await evalSafe('(() => { window.dispatchEvent(new Event("resize")); return { width: window.innerWidth, height: window.innerHeight }; })()', null);
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
    await setViewport(1280, 720, false);
    await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' });
    await navigateAndWaitForHook(`${BASE_URL}?probe=menu-audio-lifecycle-${Date.now()}`);
    await waitFor('Boolean(document.querySelector("#title-screen") && window.__VOID_PRIVATEER__)', Boolean, 15000);
    await wait(700);

    // ---- first-run title / options / fullscreen ----
    const first = await snapshot();
    check('fresh boot shows title with no career runtime', first.titleVisible && !first.hasRuntime && first.dockedAt === null, JSON.stringify(first));
    const resumeDisabled = await evalSafe('Boolean(document.querySelector("[data-ui-command=resume]")?.disabled)', false);
    check('fresh boot disables resume until a career exists', resumeDisabled);
    await capture('01-title-desktop.png');

    check('title options opens', await click('[data-ui-command="options"]') && await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))'));
    check('title options renders audio, controls, language, and the high-fidelity status', await evalSafe(`document.querySelectorAll('#pause-panel [data-setting]').length >= 8
        && !document.querySelector('#pause-panel [data-setting="quality"]')
        && Boolean(document.querySelector('#pause-panel output'))`, false), String(await evalSafe('document.querySelectorAll("#pause-panel [data-setting]").length', 0)));
    // This is intentionally asserted on a truly empty profile. The comments in
    // main.js promise that these title choices survive into the first career.
    await setValue('#pause-panel [data-setting="music"]', 0.15);
    await setValue('#pause-panel [data-setting="effects"]', 0.25);
    await setLanguageAndWaitForReload('en');
    await wait(500);
    const titleAfterLanguageReload = await snapshot();
    check('first-run language choice survives title reload', titleAfterLanguageReload.language === 'en', JSON.stringify(titleAfterLanguageReload));
    check('first-run title reload still has no career save', !titleAfterLanguageReload.hasRuntime && titleAfterLanguageReload.dockedAt === null, JSON.stringify(titleAfterLanguageReload));
    // Re-apply the audio/display choices after the language reload. There is
    // still no save; starting NEW CAREER is the persistence boundary under test.
    await click('[data-ui-command="options"]');
    await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))');
    await setValue('#pause-panel [data-setting="music"]', 0.15);
    await setValue('#pause-panel [data-setting="effects"]', 0.25);
    await capture('02-title-options-en.png');
    const titleChoice = await evalSafe(`(() => ({
        music: Number(document.querySelector('#pause-panel [data-setting="music"]')?.value),
        effects: Number(document.querySelector('#pause-panel [data-setting="effects"]')?.value),
        fidelity: document.querySelector('#pause-panel output')?.textContent?.trim(),
        hasQualitySelector: Boolean(document.querySelector('#pause-panel [data-setting="quality"]')),
        language: document.documentElement.lang,
        save: Boolean(window.__VOID_PRIVATEER__.getState()),
    }))()`, {});
    check('first-run options visibly hold the selected values before NEW CAREER', titleChoice.music === 0.15 && titleChoice.effects === 0.25 && titleChoice.fidelity === 'High fidelity' && !titleChoice.hasQualitySelector && titleChoice.language === 'en', JSON.stringify(titleChoice));

    const fullscreenBefore = pageErrors.length;
    await click('[data-ui-command="close-options"]');
    await click('[data-ui-command="toggle-fullscreen"]');
    await wait(350);
    const fullscreenState = await evalSafe('Boolean(document.fullscreenElement || document.webkitFullscreenElement)', false);
    check('fullscreen request path is safe in headless mode', pageErrors.length === fullscreenBefore, `full=${fullscreenState}`);
    if (fullscreenState) {
        await click('[data-ui-command="toggle-fullscreen"]');
        await wait(250);
    }

    // Start through the title button, not the debug hook, so the confirm/new
    // flow and title-to-dock surface transition are covered.
    check('NEW CAREER button is actionable', await click('[data-ui-command="new"]'));
    await wakeHeadlessPaint();
    await waitFor('window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === "helix"', Boolean, 25000);
    await wait(700);
    const freshCareer = await snapshot();
    check('new career reaches the Helix dock', freshCareer.hasRuntime && freshCareer.dockedAt === 'helix' && freshCareer.dockVisible && !freshCareer.titleVisible, JSON.stringify(freshCareer));
    check('new career has no duplicate top-level surfaces', (await visibleSurfaces()).filter((id) => ['title-screen', 'dock-screen', 'hud'].includes(id)).length === 1, JSON.stringify(await visibleSurfaces()));
    check('first-run audio/display choices survive NEW CAREER', freshCareer.settings?.music === 0.15 && freshCareer.settings?.effects === 0.25 && freshCareer.settings?.quality === 'high' && freshCareer.settings?.language === 'en', JSON.stringify(freshCareer.settings));

    // ---- dock options and persistence through EN/DE reloads ----
    check('dock options opens', await click('#dock-screen .dock-options-button') && await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))'));
    await setValue('#pause-panel [data-setting="music"]', 0);
    await setValue('#pause-panel [data-setting="effects"]', 0);
    const muted = await snapshot();
    check('music and effects sliders mute the live audio buses', muted.settings?.music === 0 && muted.settings?.effects === 0 && muted.audio?.music === 0 && muted.audio?.effects === 0, JSON.stringify(muted));
    await setValue('#pause-panel [data-setting="music"]', 0.30);
    await setValue('#pause-panel [data-setting="effects"]', 0.40);
    const tuned = await snapshot();
    check('high-fidelity/music/effects choices apply to the live session', tuned.settings?.quality === 'high' && tuned.settings?.music === 0.3 && tuned.settings?.effects === 0.4 && tuned.audio?.music === 0.3 && tuned.audio?.effects === 0.4 && tuned.hasRuntime, JSON.stringify(tuned));
    const dockRenderer = await evalSafe('window.__VOID_PRIVATEER__.getRuntime()?.renderer ?? null', null);
    check('docked career keeps the flight renderer staged out', dockRenderer === null, String(dockRenderer));
    const persistedSettings = await evalSafe(`(() => {
        const raw = localStorage.getItem('void-privateer-save-v1');
        const player = raw ? JSON.parse(raw)?.settings : null;
        return player ? { music: player.music, effects: player.effects, quality: player.quality, language: player.language } : null;
    })()`, null);
    check('live options are written to the local autosave', persistedSettings?.music === 0.3 && persistedSettings?.effects === 0.4 && persistedSettings?.quality === 'high', JSON.stringify(persistedSettings));
    await capture('03-dock-options-desktop.png');

    // Session language changes intentionally reload the static shell. Verify
    // both directions and then resume the saved dock state.
    await setLanguageAndWaitForReload('de');
    await wait(450);
    const germanTitle = await snapshot();
    check('EN to DE switch reloads the saved title in German', germanTitle.language === 'de' && germanTitle.settings?.language === 'de' && germanTitle.titleVisible, JSON.stringify(germanTitle));
    check('German title keeps resume enabled', !(await evalSafe('Boolean(document.querySelector("[data-ui-command=resume]")?.disabled)', true)));
    await click('[data-ui-command="resume"]');
    await wakeHeadlessPaint();
    await waitFor('window.__VOID_PRIVATEER__.getRuntime()?.save?.player?.dockedAt === "helix" && Boolean(document.querySelector("#dock-screen") && !document.querySelector("#dock-screen").classList.contains("is-hidden"))', Boolean, 60000);
    check('resume restores the saved dock career', (await snapshot()).dockedAt === 'helix' && (await visibleSurfaces()).includes('dock-screen'));
    await click('#dock-screen .dock-options-button');
    await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))');
    await setLanguageAndWaitForReload('en');
    await wait(450);
    const englishTitle = await snapshot();
    check('DE to EN switch reloads the saved title in English', englishTitle.language === 'en' && englishTitle.settings?.language === 'en' && englishTitle.titleVisible, JSON.stringify(englishTitle));
    check('English title keeps resume enabled', !(await evalSafe('Boolean(document.querySelector("[data-ui-command=resume]")?.disabled)', true)));
    await click('[data-ui-command="resume"]');
    await wakeHeadlessPaint();
    await waitFor('window.__VOID_PRIVATEER__.getRuntime()?.save?.player?.dockedAt === "helix" && Boolean(document.querySelector("#dock-screen") && !document.querySelector("#dock-screen").classList.contains("is-hidden"))', Boolean, 60000);
    await wait(350);

    // ---- launch, pause/resume, map views, audio context, and focus/blur ----
    const launchClicked = await click('#dock-screen .concourse-hover-ship');
    check('dock ship launch control is present', launchClicked);
    await wakeHeadlessPaint();
    // The visible ship departure animation hands off to WebGL after 1.08 s;
    // pulse once more after that handoff so its deliberate pre-allocation paint
    // is not throttled by headless Chrome.
    await wait(1300);
    await wakeHeadlessPaint();
    await waitFor('Boolean(window.__VOID_PRIVATEER__.getRuntime()?.renderer && !window.__VOID_PRIVATEER__.getRuntime()?.save?.player?.dockedAt)', Boolean, 60000);
    await wait(1200);
    const flight = await snapshot();
    check('launch returns to the flight HUD', flight.hasRuntime && flight.hudVisible && flight.dockedAt === null && !flight.dockVisible, JSON.stringify(flight));
    const rendererQuality = await evalSafe('window.__VOID_PRIVATEER__.getRuntime()?.renderer?.qualityMode', null);
    check('flight renderer starts in high-fidelity mode', rendererQuality === 'high', String(rendererQuality));
    check('flight starts with no duplicate modal overlays', (await modalIds()).length === 0, JSON.stringify(await modalIds()));

    // Focus/visibility loss must be safe for an active flight too. Use the
    // deterministic frame pump so a headless background-tab policy cannot
    // accidentally make an unfrozen session look paused.
    const activeFrame = await pumpRuntime(1);
    const focusBaseline = await snapshot();
    await evaluate('(() => { window.dispatchEvent(new Event("blur")); return true; })()');
    await wait(120);
    const blurSurface = await snapshot();
    const blurPump = await pumpRuntime(1);
    check('window blur pauses active flight and shows a recoverable surface', Boolean(blurPump) && Math.abs(blurPump.after - blurPump.before) < 0.08 && blurSurface.modal && (blurSurface.visible.includes('pause-panel') || blurSurface.visible.includes('rotate-notice')), JSON.stringify({ activeFrame, baseline: focusBaseline.worldTime, afterBlur: blurPump, surface: blurSurface.visible }));
    await evaluate('(() => { window.dispatchEvent(new Event("focus")); return true; })()');
    await wait(120);
    const focusRestored = await snapshot();
    const focusNoActionPump = await pumpRuntime(1);
    check('focus restoration does not resume until deliberate player action', Boolean(focusNoActionPump) && Math.abs(focusNoActionPump.after - focusNoActionPump.before) < 0.08, JSON.stringify({ restored: focusRestored.visible, afterFocus: focusNoActionPump }));
    if (await visible('#pause-panel')) {
        await click('#pause-panel [data-ui-command="resume-flight"]');
        await wait(250);
        const deliberateResume = await pumpRuntime(1);
        check('deliberate RESUME action restores active flight', Boolean(deliberateResume) && deliberateResume.after > deliberateResume.before + 0.05, JSON.stringify(deliberateResume));
    }

    const hiddenState = await evalSafe(`(() => {
        try {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            return { state: document.visibilityState, hidden: document.hidden };
        }
        catch (error) {
            return { error: String(error?.message ?? error) };
        }
    })()`, {});
    await wait(120);
    const hiddenSurface = await snapshot();
    const hiddenPump = await pumpRuntime(1);
    check('document hidden pauses active flight and shows a recoverable surface', Boolean(hiddenPump) && Math.abs(hiddenPump.after - hiddenPump.before) < 0.08 && hiddenSurface.modal && (hiddenSurface.visible.includes('pause-panel') || hiddenSurface.visible.includes('rotate-notice')), JSON.stringify({ state: hiddenState, afterHidden: hiddenPump, surface: hiddenSurface.visible }));
    const visibleState = await evalSafe(`(() => {
        try {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
            return { state: document.visibilityState, hidden: document.hidden };
        }
        catch (error) {
            return { error: String(error?.message ?? error) };
        }
    })()`, {});
    await wait(120);
    const visibleAgain = await snapshot();
    const hiddenNoActionPump = await pumpRuntime(1);
    check('visibility restoration does not resume until deliberate player action', Boolean(hiddenNoActionPump) && Math.abs(hiddenNoActionPump.after - hiddenNoActionPump.before) < 0.08, JSON.stringify({ state: visibleState, visible: visibleAgain.visible, afterVisible: hiddenNoActionPump }));
    if (await visible('#pause-panel')) {
        await click('#pause-panel [data-ui-command="resume-flight"]');
        await wait(250);
        const hiddenDeliberateResume = await pumpRuntime(1);
        check('deliberate RESUME after visibility loss restores flight', Boolean(hiddenDeliberateResume) && hiddenDeliberateResume.after > hiddenDeliberateResume.before + 0.05, JSON.stringify(hiddenDeliberateResume));
    }

    const beforePause = await evalSafe('window.__VOID_PRIVATEER__.getRuntime()?.save?.world?.time ?? 0', 0);
    const pauseClicked = await click('#hud .pause-button');
    check('flight pause control is present', pauseClicked);
    await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))', Boolean, 5000);
    const paused1 = await snapshot();
    await wait(850);
    const paused2 = await snapshot();
    check('pause control opens the pause panel', paused1.modal && (await visible('#pause-panel')), JSON.stringify(paused1));
    check('pause freezes world time', Math.abs(paused2.worldTime - paused1.worldTime) < 0.08, JSON.stringify({ beforePause, paused1: paused1.worldTime, paused2: paused2.worldTime }));
    await capture('04-pause-desktop.png');
    await click('#pause-panel [data-ui-command="resume-flight"]');
    await wait(350);
    const unpaused = await snapshot();
    check('RESUME closes pause and returns to flight', !unpaused.modal && unpaused.hudVisible && (await modalIds()).length === 0, JSON.stringify(unpaused));

    const radarOpened = await evaluate(`(() => {
        const radar = document.querySelector('#radar');
        if (!radar)
            return false;
        radar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
        return true;
    })()`);
    check('radar map control is present', radarOpened);
    await waitFor('Boolean(document.querySelector("#map-panel") && !document.querySelector("#map-panel").classList.contains("is-hidden"))', Boolean, 5000);
    const sector = await evalSafe(`(() => {
        const card = document.querySelector('#map-panel .map-card');
        return { active: card?.dataset.activeView, sector: !document.querySelector('#map-sector-view')?.hidden, galaxy: !document.querySelector('#map-galaxy-view')?.hidden, selected: document.querySelector('#map-sector-tab')?.getAttribute('aria-selected'), surfaces: document.querySelectorAll('#map-panel .map-node').length };
    })()`, {});
    check('radar opens the sector map with star and orbits', sector.active === 'sector' && sector.sector && !sector.galaxy && sector.selected === 'true' && sector.surfaces > 0, JSON.stringify(sector));
    await capture('05-sector-map-desktop.png');
    await click('#map-galaxy-tab');
    await wait(200);
    const galaxy = await evalSafe(`(() => ({
        active: document.querySelector('#map-panel .map-card')?.dataset.activeView,
        sector: !document.querySelector('#map-sector-view')?.hidden,
        galaxy: !document.querySelector('#map-galaxy-view')?.hidden,
        systems: document.querySelectorAll('#map-galaxy-view [data-map-target-kind="system"]').length,
        routes: document.querySelectorAll('#map-galaxy-view [data-route-id]').length,
    }))()`, {});
    check('GALAXY tab switches to the four-system route map', galaxy.active === 'galaxy' && !galaxy.sector && galaxy.galaxy && galaxy.systems === 4 && galaxy.routes === 3, JSON.stringify(galaxy));
    await capture('06-galaxy-map-desktop.png');
    await click('#map-sector-tab');
    await wait(150);
    check('sector tab switches back without duplicating map panels', await evalSafe('document.querySelector("#map-panel .map-card")?.dataset.activeView === "sector"', false) && (await modalIds()).length === 1);
    await click('#map-panel [data-ui-command="close-map"]');
    await wait(250);
    check('map close returns to flight without an overlay', !(await visible('#map-panel')) && (await modalIds()).length === 0 && (await snapshot()).hudVisible);

    const audioLifecycle = await evalSafe(`(async () => {
        const context = window.__VOID_PRIVATEER__.getRuntime()?.audio?.context;
        if (!context)
            return { available: false, before: null, suspended: null, resumed: null, graceful: true, error: null };
        const before = context.state;
        // Headless Chromium commonly keeps WebAudio suspended because there
        // is no user gesture. That is an expected unavailable path, but every
        // promise must remain bounded so a probe cannot hang indefinitely.
        if (before === 'suspended')
            return { available: true, before, suspended: 'suspended', resumed: 'suspended', graceful: true, error: null };
        const bounded = (promise) => Promise.race([
            promise.then(() => ({ ok: true })).catch((error) => ({ ok: false, error: String(error?.message ?? error) })),
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 1200)),
        ]);
        try {
            const suspendResult = await bounded(context.suspend());
            const suspended = context.state;
            if (!suspendResult.ok)
                return { available: true, before, suspended, resumed: null, graceful: true, error: suspendResult.timeout ? null : suspendResult.error };
            const resumeResult = await bounded(context.resume());
            return { available: true, before, suspended, resumed: context.state, graceful: false, error: resumeResult.ok ? null : (resumeResult.timeout ? null : resumeResult.error) };
        }
        catch (error) {
            return { available: true, before, suspended: context.state, resumed: null, graceful: true, error: String(error?.message ?? error) };
        }
    })()`, { available: false, graceful: true, error: null });
    check('audio context suspends/resumes or is gracefully unavailable', !audioLifecycle.error && (!audioLifecycle.available || audioLifecycle.graceful || (audioLifecycle.suspended === 'suspended' && audioLifecycle.resumed === 'running')), JSON.stringify(audioLifecycle));

    // Leave a held key behind, then fire the same blur event a real tab switch
    // would deliver. InputManager must clear every held/edge channel.
    await press('KeyR', 'r', false);
    await wait(200);
    const heldBeforeBlur = await evalSafe(`(() => { const input = window.__VOID_PRIVATEER__.getRuntime()?.input; return { keys: input?.keys?.size ?? -1, throttle: input?.throttleSet ?? null }; })()`, {});
    await evaluate('(() => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); return true; })()');
    const clearedAfterBlur = await evalSafe(`(() => { const input = window.__VOID_PRIVATEER__.getRuntime()?.input; return { keys: input?.keys?.size ?? -1, pressed: input?.pressed?.size ?? -1, touchHeld: input?.touchHeld?.size ?? -1, touchEdges: input?.touchEdges?.size ?? -1, throttle: input?.throttleSet ?? null, joystickX: input?.joystickX ?? null, joystickY: input?.joystickY ?? null }; })()`, {});
    check('focus/blur clears held keyboard and touch input', heldBeforeBlur.keys > 0 && clearedAfterBlur.keys === 0 && clearedAfterBlur.pressed === 0 && clearedAfterBlur.touchHeld === 0 && clearedAfterBlur.touchEdges === 0 && clearedAfterBlur.throttle === null && clearedAfterBlur.joystickX === 0 && clearedAfterBlur.joystickY === 0, JSON.stringify({ heldBeforeBlur, clearedAfterBlur }));
    // Focus loss now deliberately leaves the flight paused. Clear that pause
    // through the player-facing control before starting the independent
    // orientation lifecycle checks below.
    if (await visible('#pause-panel')) {
        await click('#pause-panel [data-ui-command="resume-flight"]');
        await wait(250);
    }

    // ---- responsive landscape/portrait pause behavior ----
    await setViewport(844, 390, true);
    await wait(350);
    await capture('07-flight-touch-844x390.png');
    const landscapeTouch = await snapshot();
    check('844x390 landscape keeps flight active', landscapeTouch.hudVisible && !landscapeTouch.modal && landscapeTouch.visible.includes('hud') && !landscapeTouch.visible.includes('rotate-notice'), JSON.stringify(landscapeTouch));
    await setViewport(390, 844, true);
    await wait(400);
    const portrait1 = await snapshot();
    await capture('08-portrait-rotate-notice.png');
    await wait(900);
    const portrait2 = await snapshot();
    check('portrait orientation shows the blocking rotate notice', portrait1.visible.includes('rotate-notice') && portrait1.modal, JSON.stringify(portrait1));
    check('portrait rotate notice pauses world time', Math.abs(portrait2.worldTime - portrait1.worldTime) < 0.08, JSON.stringify({ first: portrait1.worldTime, second: portrait2.worldTime }));
    await setViewport(844, 390, true);
    await wait(450);
    const landscapeAgain = await snapshot();
    const landscapeAgain2 = await pumpRuntime(1);
    check('landscape clears rotate notice and resumes flight', !landscapeAgain.visible.includes('rotate-notice') && landscapeAgain.hudVisible && !landscapeAgain.modal && Boolean(landscapeAgain2) && landscapeAgain2.after > landscapeAgain.worldTime + 0.05, JSON.stringify({ first: landscapeAgain, second: landscapeAgain2 }));
    check('touch landscape returns with no duplicate overlays', (await modalIds()).length === 0 && (await visibleSurfaces()).filter((id) => ['dock-screen', 'hud', 'title-screen'].includes(id)).length === 1, JSON.stringify(await visibleSurfaces()));

    // ---- explicit quit-to-title / resume lifecycle ----
    await click('#hud .pause-button');
    await waitFor('Boolean(document.querySelector("#pause-panel") && !document.querySelector("#pause-panel").classList.contains("is-hidden"))', Boolean, 5000);
    await click('#pause-panel [data-ui-command="quit-title"]');
    await waitFor('Boolean(document.querySelector("#title-screen") && !document.querySelector("#title-screen").classList.contains("is-hidden"))', Boolean, 10000);
    await wait(300);
    const quitTitle = await snapshot();
    check('QUIT TO TITLE disposes flight and enables resume', quitTitle.titleVisible && !quitTitle.hasRuntime && quitTitle.settings?.language === 'en' && !(await evalSafe('Boolean(document.querySelector("[data-ui-command=resume]")?.disabled)', true)), JSON.stringify(quitTitle));
    await capture('09-title-resume-touch.png');
    await click('[data-ui-command="resume"]');
    await wakeHeadlessPaint();
    await waitFor('Boolean(window.__VOID_PRIVATEER__.getRuntime()?.renderer && !window.__VOID_PRIVATEER__.getRuntime()?.save?.player?.dockedAt)', Boolean, 60000);
    await wait(450);
    const resumedFlight = await snapshot();
    check('RESUME restores the undocked flight career', resumedFlight.hasRuntime && resumedFlight.hudVisible && resumedFlight.dockedAt === null && (await modalIds()).length === 0, JSON.stringify(resumedFlight));
    check('final flight has no duplicate top-level surfaces', (await visibleSurfaces()).filter((id) => ['title-screen', 'dock-screen', 'hud'].includes(id)).length === 1, JSON.stringify(await visibleSurfaces()));
    check('lifecycle produced no uncaught console/page errors', pageErrors.length === 0, pageErrors.slice(0, 8).join(' | '));
    check('lifecycle produced no failed network requests', networkErrors.length === 0, networkErrors.slice(0, 8).join(' | '));
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
