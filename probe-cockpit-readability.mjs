// Readability and fit probe for the live in-flight cockpit. It exercises the
// densest target, race, warning, comms, and hyperdrive states in real Chrome
// at desktop, tablet, and landscape-phone sizes. Screenshots stay in /private/tmp.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const PORT = 4195;
const CDP_PORT = 9385;
const profile = mkdtempSync(join(tmpdir(), 'vr-cockpit-readability-'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-gpu-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', 'about:blank',
], { cwd: ROOT, stdio: 'ignore' });

let socket;
let messageId = 0;
const pending = new Map();
const pageErrors = [];
const checks = [];
const failures = [];

const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails)
        throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
};

const waitFor = async (expression, label, attempts = 120) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (await evaluate(expression).catch(() => false))
            return;
        await pause(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
};

const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    if (!ok)
        failures.push({ name, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const capture = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
};

const VIEWPORTS = [
    { name: 'large-1920x1080', width: 1920, height: 1080, mobile: false, language: 'en' },
    { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false, language: 'de' },
    { name: 'tablet-1024x768', width: 1024, height: 768, mobile: true, language: 'en' },
    { name: 'phone-844x390', width: 844, height: 390, mobile: true, language: 'de' },
];
const requestedViewport = process.argv.find((arg) => arg.startsWith('--viewport='))?.slice('--viewport='.length);
const activeViewports = requestedViewport ? VIEWPORTS.filter((viewport) => viewport.name === requestedViewport) : VIEWPORTS;
if (!activeViewports.length)
    throw new Error(`Unknown cockpit viewport: ${requestedViewport}`);

const STATES = ['target', 'race', 'warning'];

const setViewport = (viewport) => send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenOrientation: { angle: 90, type: 'landscapePrimary' },
});

const navigate = async (url) => {
    // A service-worker takeover can occasionally leave Chrome's Page.navigate
    // response pending even though the requested document is already live.
    // Continue to the explicit readiness checks after a short grace period.
    await Promise.race([
        send('Page.navigate', { url }),
        pause(5000),
    ]);
};

const prepareFlight = async (viewport) => {
    await setViewport(viewport);
    await navigate(`http://127.0.0.1:${PORT}/?cockpit-readability=${Date.now()}`);
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'game hooks');
    await evaluate(`localStorage.setItem('voidrunner-lang', ${JSON.stringify(viewport.language)}); localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__', ${JSON.stringify(viewport.language)})`);
    await navigate(`http://127.0.0.1:${PORT}/?cockpit-language=${viewport.language}&reload=${Date.now()}`);
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'reloaded game hooks');
    await waitFor(`document.documentElement.lang === ${JSON.stringify(viewport.language)}`, 'requested language');
    await evaluate('window.__VOID_PRIVATEER__.newGame()');
    await waitFor("window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player?.dockedAt === 'helix'", 'docked career');
    await evaluate('window.__VOID_PRIVATEER__.launch()');
    await waitFor("!window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player?.dockedAt && !document.querySelector('#hud')?.classList.contains('is-hidden')", 'live cockpit');
    await pause(250);
};

const rigState = (state) => evaluate(`(() => {
    const rt = window.__VOID_PRIVATEER__.getRuntime();
    const ui = rt.ui;
    // Hold the live HUD refresh while the probe presents a dense deterministic
    // state. The world can keep rendering, but it must not overwrite the model
    // between updateHud() and the screenshot/measurement.
    rt.lastHudUpdate = Number.POSITIVE_INFINITY;
    const de = document.documentElement.lang === 'de';
    ui.dismissStory();
    ui.recentEvents.length = 0;
    const model = rt.buildHudModel();
    model.contacts = [{
        type: 'distress', distress: true, x: 0.82, y: -0.42, altitude: 0,
        distance: 1284, selected: false,
    }];
    model.searchRings = [];
    model.weapon = {
        group: 'A',
        name: 'PDC',
        fullName: de ? 'Punktabwehrcluster' : 'Point-Defense Cluster',
        mountCount: 2,
        ammo: { current: 48, capacity: 120 },
        venting: false,
    };
    model.launcher = {
        mountId: 'probe-launcher-0', index: 0, count: 2, id: 'seeker',
        name: de ? 'Suchraketenmagazin' : 'Seeker Missile Rack',
        ordnanceId: 'seeker-missile',
        ordnanceName: de ? 'Suchrakete' : 'Seeker Missile',
        shortCode: 'SKR', displayCode: 'SKR 1', current: 3, capacity: 4,
    };
    model.missiles = 4;
    model.maxMissiles = 6;
    model.target = {
        kind: 'ship',
        name: de ? 'Kapitänin Maximiliane Schwarzschild' : 'Captain Maximiliane Schwarzschild',
        hostile: true,
        surrendered: false,
        captured: false,
        captureClaimable: false,
        captureAvailable: false,
        variant: 'interceptor',
        heading: 0.48,
        readout: de ? 'KOPFGELDJÄGER · ELITE' : 'BOUNTY HUNTER · ELITE',
        distance: 1284,
        shield: 87,
        maxShield: 120,
        hull: 146,
        maxHull: 180,
        onScreen: false,
        edge: { x: innerWidth - 74, y: Math.round(innerHeight * 0.42), angleDeg: 90 },
    };
    model.monitorStatus = undefined;
    model.ownMonitorStatus = undefined;
    model.standoff = undefined;
    model.patrolReply = undefined;
    model.race = undefined;
    model.hyperdrive = { fx: 'none', progress: 0 };
    model.hyperdriveStatus = undefined;
    model.gateArmed = false;
    model.hyperdriveReady = false;

    if (${JSON.stringify(state)} === 'race') {
        model.race = {
            phase: 'running', title: de ? 'Trümmerlauf' : 'Mourning Run',
            gate: 13, gateCount: 13, shortcut: { gate: 3, gateCount: 4 },
            draft: 0.7, rankLabel: '1.', time: 83.4, splitDelta: -1.7, splitAge: 0.5,
        };
        model.target = {
            kind: 'gate', name: de ? 'ABKÜRZUNGSTOR 3/4' : 'SHORTCUT GATE 3/4',
            readout: de ? 'NÄCHSTER CHECKPOINT · HINDURCHFLIEGEN' : 'NEXT CHECKPOINT · FLY THROUGH',
            distance: 342, objectKind: 'gate', onScreen: true, screenX: innerWidth * 0.53, screenY: innerHeight * 0.36,
        };
        model.contacts = [{
            type: 'racegate', raceGate: { state: 'shortcut', beyond: true, distance: 342 },
            x: 0.8, y: 0.32, altitude: -0.5, selected: true,
        }];
        ui.pushEvent(de ? 'BESTZEIT UM 1,7 SEKUNDEN UNTERBOTEN' : 'PERSONAL BEST AHEAD BY 1.7 SECONDS', 'success', 30000);
    }
    if (${JSON.stringify(state)} === 'warning') {
        // The hyperdrive scale is the widest real speed readout. It used to
        // squeeze the live value out of its compact telemetry cell while the
        // ordinary 0–100 flight range still looked correct in screenshots.
        model.speed = 1200;
        model.maxSpeed = 1200;
        model.hyperdrive = { fx: 'spooling', progress: 0.87 };
        model.hyperdriveReady = true;
        model.standoff = { kind: 'credits', label: de ? '12.500 CR' : '12,500 CR', seconds: 9 };
        model.patrolReply = { seconds: 8 };
        model.monitorStatus = de ? 'REAKTORSTÖRUNG · ENERGIE NIEDRIG' : 'REACTOR FAULT · ENERGY LOW';
        model.ownMonitorStatus = de ? 'FRACHTRAUM VOLL' : 'CARGO HOLD FULL';
        ui.pushEvent(de ? 'RAKETENWARNUNG · AUSWEICHMANÖVER' : 'MISSILE WARNING · BREAK NOW', 'danger', 30000);
        ui.showStoryLine(de ? 'KOMMANDANT DORNE' : 'COMMANDER DORNE', de
            ? 'Halten Sie den Korridor, bis die Evakuierung vollständig ist.'
            : 'Hold the corridor until the evacuation is complete.', 'ally');
    }
    ui.updateHud(model);
    return true;
})()`);

const scanCockpit = () => evaluate(`(() => {
    const root = document.querySelector('#hud:not(.is-hidden)');
    if (!root) return { missing: true };
    const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const path = (element) => {
        const parts = [];
        let node = element;
        for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
            let part = node.tagName.toLowerCase();
            if (node.id) part += '#' + node.id;
            else if (node.classList.length) part += '.' + [...node.classList].slice(0, 2).join('.');
            parts.unshift(part);
        }
        return parts.join('>');
    };
    const text = [];
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const value = walker.currentNode.nodeValue.replace(/\\s+/g, ' ').trim();
        const element = walker.currentNode.parentElement;
        if (!value || !element || seen.has(element) || element.closest('[aria-hidden="true"], svg')) continue;
        if (!visible(element)) continue;
        seen.add(element);
        const style = getComputedStyle(element);
        text.push({ path: path(element), value: value.slice(0, 80), size: Number.parseFloat(style.fontSize) });
    }
    const tinyText = text.filter((entry) => entry.size < 9.9);
    const monitorSelectors = [
        '.screen-flight', '.screen-own-weapon', '.screen-bars > div', '.screen-race-strip',
        '.screen-standoff', '.screen-ticker', '.screen-heading', '.screen-target-distance',
        '.screen-target-readout', '.cockpit-identity em', '.target-edge-pointer span',
    ];
    const critical = monitorSelectors.flatMap((selector) => [...root.querySelectorAll(selector)])
        .filter(visible)
        .map((element) => ({
            path: path(element),
            size: Number.parseFloat(getComputedStyle(element).fontSize),
            text: element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 90),
        }));
    const monitors = [...root.querySelectorAll('.cockpit-screen')].map((monitor) => {
        const rect = monitor.getBoundingClientRect();
        const escaped = [...monitor.querySelectorAll(':scope > *')].filter(visible).map((element) => {
            const child = element.getBoundingClientRect();
            return { path: path(element), left: child.left - rect.left, top: child.top - rect.top, right: child.right - rect.right, bottom: child.bottom - rect.bottom };
        }).filter((entry) => entry.left < -1 || entry.top < -1 || entry.right > 1 || entry.bottom > 1);
        return { className: monitor.className, rect: [rect.x, rect.y, rect.width, rect.height], escaped };
    });
    const own = root.querySelector('.cockpit-screen-own');
    const ownLauncher = root.querySelector('#screen-own-launcher');
    const ownBars = own.querySelector('.screen-bars').getBoundingClientRect();
    const race = own.querySelector('.screen-race-strip');
    const standoff = own.querySelector('.screen-standoff');
    const activeStrip = visible(race) ? race : visible(standoff) ? standoff : null;
    const stripRect = activeStrip?.getBoundingClientRect();
    const hyperdrive = root.querySelector('#hyperdrive-card');
    const hyperdriveRect = hyperdrive.getBoundingClientRect();
    const touchMissile = root.querySelector('#touch-missile');
    const touchMissileRect = touchMissile.getBoundingClientRect();
    const touchLauncher = root.querySelector('#touch-launcher-cycle');
    const touchLauncherRect = touchLauncher.getBoundingClientRect();
    const touchMissileCount = root.querySelector('#touch-missile-count');
    const touchLauncherCode = root.querySelector('#touch-launcher-code');
    const targetName = root.querySelector('#screen-target-name');
    const transponder = root.querySelector('#screen-radar-transponder');
    const telemetryClipped = [...root.querySelectorAll('.screen-flight span, .screen-flight b, .screen-flight small')]
        .filter(visible)
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({ path: path(element), text: element.textContent, width: element.clientWidth, scroll: element.scrollWidth }));
    const buttons = [hyperdrive, root.querySelector('#comms-bar'), root.querySelector('#patrol-reply-chip')]
        .filter((element) => element && visible(element))
        .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
                path: path(element), width: rect.width, height: rect.height,
                overflow: element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2,
                text: element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 100),
            };
        });
    return {
        missing: false,
        viewport: [innerWidth, innerHeight],
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        text,
        tinyText,
        critical,
        monitors,
        targetName: {
            visible: visible(targetName),
            size: Number.parseFloat(getComputedStyle(targetName).fontSize),
            text: targetName.textContent,
        },
        transponder: {
            size: Number.parseFloat(getComputedStyle(transponder).fontSize),
            text: transponder.textContent,
        },
        telemetryClipped,
        ownLauncher: {
            visible: visible(ownLauncher),
            text: ownLauncher?.textContent ?? '',
        },
        stripOverlap: stripRect ? ownBars.bottom - stripRect.top : 0,
        buttons,
        radarFont: Number.parseFloat(root.querySelector('#radar').getContext('2d').font),
        hyperdrive: { width: hyperdriveRect.width, height: hyperdriveRect.height },
        touchLauncher: {
            visible: visible(touchLauncher),
            countVisible: visible(touchMissileCount),
            count: touchMissileCount?.textContent ?? '',
            expectedCount: String(window.__VOID_PRIVATEER__.getRuntime()?.ui?.lastHud?.launcher?.current ?? ''),
            code: touchLauncherCode?.textContent ?? '',
            expectedCode: window.__VOID_PRIVATEER__.getRuntime()?.ui?.lastHud?.launcher?.displayCode
                ?? window.__VOID_PRIVATEER__.getRuntime()?.ui?.lastHud?.launcher?.shortCode ?? '',
            aria: touchLauncher?.getAttribute('aria-label') ?? '',
            disabled: touchLauncher?.disabled ?? true,
            width: touchLauncherRect.width,
            height: touchLauncherRect.height,
            overlapsMissile: !(touchLauncherRect.right <= touchMissileRect.left || touchMissileRect.right <= touchLauncherRect.left
                || touchLauncherRect.bottom <= touchMissileRect.top || touchMissileRect.bottom <= touchLauncherRect.top),
        },
    };
})()`);

try {
    let ready = false;
    for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
        await pause(100);
        try { ready = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; }
        catch { /* retry */ }
    }
    if (!ready)
        throw new Error(`Server did not start: ${serverOutput.trim()}`);

    let target;
    for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
        await pause(100);
        try {
            const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
            target = targets.find((entry) => entry.type === 'page');
        }
        catch { /* retry */ }
    }
    if (!target)
        throw new Error('Chrome DevTools target did not start');

    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) handlers.reject(new Error(message.error.message));
            else handlers.resolve(message.result);
            return;
        }
        if (message.method === 'Runtime.exceptionThrown')
            pageErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'page exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
            pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    };
    await send('Page.enable');
    await send('Runtime.enable');

    for (const viewport of activeViewports) {
        await prepareFlight(viewport);
        for (const state of STATES) {
            await rigState(state);
            await pause(180);
            const result = await scanCockpit();
            const prefix = `${viewport.name} ${viewport.language} ${state}`;
            check(`${prefix}: cockpit renders`, !result.missing);
            check(`${prefix}: no page overflow`, result.overflowX <= 1, `${result.overflowX}px`);
            check(`${prefix}: all visible cockpit text is at least 10px`, result.tinyText.length === 0, JSON.stringify(result.tinyText.slice(0, 8)));
            check(`${prefix}: critical monitor text is at least 10px`, result.critical.every((entry) => entry.size >= 9.9), JSON.stringify(result.critical.filter((entry) => entry.size < 9.9).slice(0, 8)));
            check(`${prefix}: all monitor children stay inside their screens`, result.monitors.every((entry) => entry.escaped.length === 0), JSON.stringify(result.monitors.flatMap((entry) => entry.escaped).slice(0, 8)));
            check(`${prefix}: target name remains visible`, result.targetName.visible && result.targetName.size >= 9.9, JSON.stringify(result.targetName));
            check(`${prefix}: transponder state is readable`, result.transponder.size >= 9.9, JSON.stringify(result.transponder));
            check(`${prefix}: core telemetry values are complete`, result.telemetryClipped.length === 0, JSON.stringify(result.telemetryClipped));
            check(`${prefix}: radar distance text is at least 10px`, result.radarFont >= 9.9, `${result.radarFont}px`);
            check(`${prefix}: race/warning strip clears the status bars`, result.stripOverlap <= 1, `${result.stripOverlap.toFixed(1)}px`);
            check(`${prefix}: cockpit buttons do not clip their text`, result.buttons.every((entry) => !entry.overflow), JSON.stringify(result.buttons));
            if (!viewport.mobile)
                check(`${prefix}: own monitor shows the selected launcher`, result.ownLauncher.visible && result.ownLauncher.text === 'SKR 1 3/4', JSON.stringify(result.ownLauncher));
            if (viewport.mobile) {
                check(`${prefix}: cockpit text buttons are 44px touch targets`, result.buttons.every((entry) => entry.height >= 43.5), JSON.stringify(result.buttons));
                check(`${prefix}: hyperdrive control fits its phone content`, result.hyperdrive.width <= 180, `${result.hyperdrive.width.toFixed(1)}px`);
                check(`${prefix}: launcher selector carries typed live ordnance`, result.touchLauncher.visible
                    && result.touchLauncher.countVisible
                    && result.touchLauncher.count === result.touchLauncher.expectedCount
                    && result.touchLauncher.code === result.touchLauncher.expectedCode
                    && result.touchLauncher.aria.includes('/')
                    && !result.touchLauncher.disabled, JSON.stringify(result.touchLauncher));
                check(`${prefix}: launcher selector is a separate 48px touch target`, result.touchLauncher.width >= 47.5
                    && result.touchLauncher.height >= 47.5
                    && !result.touchLauncher.overlapsMissile, JSON.stringify(result.touchLauncher));
            }
            await capture(`/private/tmp/voidrunner-cockpit-${viewport.name}-${viewport.language}-${state}.png`);
        }
    }

    // The secondary phone pad is contextual. Hide its launcher selector when
    // that pad becomes SCAN or CAPTURE, otherwise its count appears to belong
    // to the wrong action.
    const contextualLauncherSelector = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const selector = document.querySelector('#touch-launcher-cycle');
        rt.ui.updateWeaponButtons({ kind: 'asteroid' }, 'mining');
        const hiddenForScan = selector.classList.contains('is-hidden');
        rt.ui.updateWeaponButtons({
            kind: 'ship', surrendered: true, captured: false,
            captureAvailable: true, captureClaimable: true,
        }, 'combat');
        const hiddenForCapture = selector.classList.contains('is-hidden');
        return { hiddenForScan, hiddenForCapture };
    })()`);
    check('phone launcher selector hides when the pad becomes SCAN or CAPTURE', contextualLauncherSelector.hiddenForScan && contextualLauncherSelector.hiddenForCapture, JSON.stringify(contextualLauncherSelector));

    check('cockpit run has no browser errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 8)));
    console.log(`\nCockpit readability: ${checks.length - failures.length}/${checks.length} checks passed.`);
    if (failures.length) {
        console.log(`Failures: ${failures.length}`);
        process.exitCode = 1;
    }
}
catch (error) {
    console.error('COCKPIT READABILITY ERROR:', error.stack ?? error.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* ignore */ }
    chrome.kill();
    server.kill();
    await pause(350);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
