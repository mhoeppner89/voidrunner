// Navigation and tap-floor probe for every docked station surface.
//
// The station screens are a hierarchy: concourse → terminal → market point →
// detail. A screen the pilot cannot leave is a dead end, and a screen whose way
// out is smaller than a fingertip or below the fold is a dead end in practice.
// This probe walks the whole hierarchy in the real UI at desktop and phone
// sizes and asserts, per screen:
//
//   1. exactly one exit control is visible, carrying the command that leads
//      back to the parent screen (never two ways out, never none),
//   2. that control is at least 44x44 and fully inside the viewport, so the
//      pilot does not have to scroll or aim,
//   3. clicking it really lands on the parent screen,
//   4. the station body fits the viewport horizontally, and no visible control
//      sits past the right edge — the dock's content column sizes to its widest
//      row, so one wide row stretches every screen and `overflow: hidden` then
//      shears off the right third instead of scrolling,
//   5. on a touch layout, every other visible control clears the 44px tap
//      floor, and the ship dealer's stage (preview, hull name, price) fits the
//      visible content window — a preview that eats the whole window leaves the
//      price below the fold on the one screen opened to read it.
//
// (1)-(3) alone pass on a screen that is clipped or dominated by a picture,
// which is how both of those shipped.
//
// Screenshots are written to /private/tmp only.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const PORT = 4195;
const CDP_PORT = 9385;
const profile = mkdtempSync(join(tmpdir(), 'vr-station-navigation-'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

// --no-sandbox and --disable-gpu-sandbox keep Chrome's child sandbox from
// colliding with the outer session sandbox (without them Runtime.evaluate never
// resolves), and the cwd pin keeps the CDP browser level from hanging when the
// probe runs from inside a nested worktree. Both are house rules — see
// AGENTS.md before changing this spawn.
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
const failures = [];
const checks = [];
const shots = [];

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

const waitFor = async (expression, label, attempts = 100) => {
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
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? ` · ${detail}` : ''}`);
};

const capture = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
    shots.push(path);
};

const VIEWPORTS = [
    { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false, dsf: 1, language: 'en' },
    { name: 'phone-844x390', width: 844, height: 390, mobile: true, dsf: 1, language: 'de' },
];

// The station hierarchy as the pilot meets it. `command` is the UI command the
// exit must carry and `lands` the state it must leave behind — a control that
// exists but goes nowhere is not an exit. `exit` names which layout owns the
// way out: `chrome` is the shared dock-header chevron, and the fitting screens
// accept `either` because they hide the dock header for working height — there
// the chrome chevron goes away on a phone and that screen's own header chevron
// takes over. Either way exactly one of them may be visible.
const EXITS = {
    chrome: '#dock-screen .dock-back-button',
    fitting: '#dock-screen .outfit-exit',
};

const SCREENS = [
    { name: 'concourse', depth: 0, exit: 'chrome', root: true, enter: `ui.switchToTerminal('concourse')` },
    { name: 'services', depth: 1, exit: 'chrome', command: 'dock-concourse', lands: `ui.dockTerminal === 'concourse'`, enter: `ui.switchToTerminal('services')` },
    { name: 'market-floor', depth: 1, exit: 'chrome', command: 'dock-concourse', lands: `ui.dockTerminal === 'concourse'`, enter: `ui.switchToTerminal('market')` },
    { name: 'bar-floor', depth: 1, exit: 'chrome', command: 'dock-concourse', lands: `ui.dockTerminal === 'concourse'`, enter: `ui.switchToTerminal('bar', 'people')` },
    { name: 'commodity-market', depth: 2, exit: 'chrome', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`, enter: `ui.openMarketPoint('commodities')` },
    {
        name: 'commodity-ticket', depth: 3, exit: 'chrome', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`,
        enter: `ui.openMarketPoint('commodities'); ui.selectMarketCommodity(ui.marketCommodityId)`,
    },
    { name: 'ship-parts', depth: 2, exit: 'either', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`, enter: `ui.openMarketPoint('equipment')` },
    {
        name: 'ship-parts-bay', depth: 3, exit: 'either', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`,
        enter: `ui.openMarketPoint('equipment'); document.querySelector('#dock-screen [data-outfit-slot]')?.click()`,
    },
    {
        name: 'ship-parts-item', depth: 4, exit: 'either', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`,
        enter: `ui.openMarketPoint('equipment'); document.querySelector('#dock-screen [data-outfit-slot]')?.click(); document.querySelector('#dock-screen [data-outfit-item]')?.click()`,
    },
    { name: 'ship-dealer', depth: 2, exit: 'chrome', command: 'market-overview', lands: `ui.dockTerminal === 'market' && !ui.marketPoint`, enter: `ui.openMarketPoint('shipyard')` },
    { name: 'contract-board', depth: 2, exit: 'chrome', command: 'bar-scene', lands: `ui.dockTerminal === 'bar' && ui.barPanel === 'people'`, enter: `ui.switchToTerminal('bar', 'missions')` },
    {
        name: 'contract-dossier', depth: 3, exit: 'chrome', command: 'bar-scene', lands: `ui.dockTerminal === 'bar' && ui.barPanel === 'people'`,
        enter: `ui.switchToTerminal('bar', 'missions'); document.querySelector('#dock-screen [data-mission-select]')?.click()`,
    },
    { name: 'guild-desks', depth: 2, exit: 'chrome', command: 'bar-scene', lands: `ui.dockTerminal === 'bar' && ui.barPanel === 'people'`, enter: `ui.switchToTerminal('bar', 'guilds')` },
];

// One page-side scan per screen: the exits, every control's hit box, and the
// state the screen is in. Only scoped values cross the boundary — the session
// object graph is circular and cannot be serialized.
const scanStation = () => evaluate(`(() => {
    const root = document.querySelector('#dock-screen:not(.is-hidden)');
    if (!root) return { missing: true };
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const ui = runtime.ui;
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
    const describe = (element) => {
        const rect = element.getBoundingClientRect();
        return {
            command: element.dataset.uiCommand ?? null,
            label: (element.getAttribute('aria-label') ?? element.textContent.trim()).replace(/\\s+/g, ' ').slice(0, 48),
            size: [Math.round(rect.width), Math.round(rect.height)],
            inViewport: rect.top >= -0.5 && rect.bottom <= innerHeight + 0.5 && rect.left >= -0.5 && rect.right <= innerWidth + 0.5,
        };
    };
    const clipped = [...root.querySelectorAll('button, [role="button"], select, input')].filter(visible)
        .map((element) => ({ path: path(element), right: Math.round(element.getBoundingClientRect().right), viewport: innerWidth }))
        .filter((entry) => entry.right > entry.viewport + 0.5);
    const controls = [...root.querySelectorAll('button, [role="button"], select, input')].filter(visible);
    const small = controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
            path: path(element),
            size: [Math.round(rect.width), Math.round(rect.height)],
            label: (element.getAttribute('aria-label') ?? element.textContent.trim()).replace(/\\s+/g, ' ').slice(0, 48),
        };
    }).filter((entry) => entry.size[0] < 43.5 || entry.size[1] < 43.5);
    return {
        missing: false,
        viewport: [innerWidth, innerHeight],
        touchLayout: matchMedia('(pointer: coarse)').matches || innerWidth <= 900,
        state: { terminal: ui.dockTerminal, marketPoint: ui.marketPoint, barPanel: ui.barPanel, stage: ui.outfittingStage, screen: ui.dockScreenLabel() },
        dockWidth: Math.round(Math.max(...getComputedStyle(root).gridTemplateColumns.split(' ').map(Number.parseFloat).filter(Number.isFinite))),
        dockColumns: getComputedStyle(root).gridTemplateColumns,
        // The ship dealer's own stage: the preview plus the hull's name and
        // price. On a touch layout it has to fit the visible content window,
        // or the pilot is looking at a ship model with the price below the
        // fold — the whole reason the screen was opened.
        showroomStage: (() => {
            const stage = root.querySelector('.ship-showroom-stage');
            const content = root.querySelector('.dock-content');
            if (!stage || !content)
                return null;
            return { height: Math.round(stage.getBoundingClientRect().height), contentHeight: Math.round(content.clientHeight) };
        })(),
        clipped,
        chromeBack: [...root.querySelectorAll('.dock-back-button')].filter(visible).map(describe),
        fittingExit: [...root.querySelectorAll('.outfit-exit')].filter(visible).map(describe),
        controls: controls.length,
        small,
    };
})()`);

const setViewport = async (viewport) => {
    await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.dsf,
        mobile: viewport.mobile,
        screenOrientation: viewport.width >= viewport.height
            ? { angle: 90, type: 'landscapePrimary' }
            : { angle: 0, type: 'portraitPrimary' },
    });
    await send('Emulation.setTouchEmulationEnabled', viewport.mobile
        ? { enabled: true, maxTouchPoints: 5 }
        : { enabled: false });
};

const prepareCareer = async (viewport) => {
    await setViewport(viewport);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?station-navigation=${Date.now()}` });
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'game hooks');
    await evaluate(`localStorage.setItem('voidrunner-lang', ${JSON.stringify(viewport.language)}); localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__', ${JSON.stringify(viewport.language)})`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?station-navigation-language=${viewport.language}&reload=${Date.now()}` });
    await pause(250);
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'reloaded game hooks');
    await waitFor(`document.documentElement.lang === ${JSON.stringify(viewport.language)}`, 'requested language');
    // newGame() resolves to the live session, whose object graph is circular:
    // returning it by value fails with "Object reference chain is too long".
    // Every evaluate in this probe returns a small, scoped value for the same
    // reason.
    await evaluate('(() => { window.__VOID_PRIVATEER__.newGame(); return true; })()');
    await waitFor("window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player?.dockedAt === 'helix'", 'docked career');
    // A career that can afford everything: the walk must not stall on a screen
    // whose contents depend on credits, reputation, or an empty hold.
    await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const player = rt.save.player;
        player.credits = 123456789;
        player.cargo = { electronics: 3 };
        player.sealedCargo = [];
        player.dockedAt = 'helix';
        player.lastDockedAt = 'helix';
        player.guildRank = { merchant: 3, bounty: 3, mining: 3, salvage: 3, syndicate: 3 };
        player.guildRep = { merchant: 999, bounty: 999, mining: 999, salvage: 999, syndicate: 999 };
        rt.ui.refreshDock(rt.save);
    })()`);
    await pause(180);
};

try {
    let ready = false;
    for (let attempt = 0; attempt < 70 && !ready; attempt += 1) {
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

    for (const viewport of VIEWPORTS) {
        await prepareCareer(viewport);
        for (const screen of SCREENS) {
            const prefix = `${viewport.name} ${viewport.language} ${screen.name}`;
            await evaluate(`(() => { const ui = window.__VOID_PRIVATEER__.getRuntime().ui; ${screen.enter}; return true; })()`);
            await pause(160);
            // Arrive the way a pilot does: at the top of the screen.
            await evaluate(`(() => {
                const dock = document.querySelector('#dock-screen .dock-content');
                const market = document.querySelector('#dock-screen .market-menu-screen');
                if (dock) dock.scrollTop = 0;
                if (market) market.scrollTop = 0;
            })()`);
            const result = await scanStation();
            check(`${prefix}: screen renders`, !result.missing, JSON.stringify(result));
            if (result.missing) {
                await capture(`/private/tmp/voidrunner-station-nav-${viewport.name}-${viewport.language}-${screen.name}.png`);
                continue;
            }

            // A screen with the dock header may only use the chrome chevron; a
            // fitting screen may use either chevron, never both.
            const exits = screen.exit === 'chrome' ? result.chromeBack : [...result.chromeBack, ...result.fittingExit];
            const otherExits = screen.exit === 'chrome' ? result.fittingExit : [];
            if (screen.root) {
                check(`${prefix}: the root terminal offers no way back`, result.chromeBack.length === 0 && result.fittingExit.length === 0, JSON.stringify({ chromeBack: result.chromeBack, fittingExit: result.fittingExit }));
            }
            else {
                check(`${prefix}: exactly one exit control is visible`, exits.length === 1 && otherExits.length === 0, JSON.stringify({ exits, otherExits }));
                const exit = exits[0];
                check(`${prefix}: the exit carries ${screen.command}`, exit?.command === screen.command, JSON.stringify(exit ?? null));
                check(`${prefix}: the exit clears the 44px tap floor`, Boolean(exit) && exit.size[0] >= 43.5 && exit.size[1] >= 43.5, JSON.stringify(exit ?? null));
                check(`${prefix}: the exit needs no scrolling`, exit?.inViewport === true, JSON.stringify(exit ?? null));
                const exitSelector = result.chromeBack.length === 1 ? EXITS.chrome : EXITS.fitting;
                if (exit) {
                    await evaluate(`(() => { document.querySelector(${JSON.stringify(exitSelector)})?.click(); return true; })()`);
                    await pause(180);
                    const landed = await evaluate(`(() => { const ui = window.__VOID_PRIVATEER__.getRuntime().ui; return ${screen.lands}; })()`);
                    if (landed !== true)
                        await capture(`/private/tmp/voidrunner-station-nav-${viewport.name}-${viewport.language}-${screen.name}.png`);
                    check(`${prefix}: the exit lands one level up at depth ${screen.depth - 1}`, landed === true, JSON.stringify(await scanStation()));
                }
            }

            check(`${prefix}: the station body fits the viewport`, result.dockWidth <= result.viewport[0] + 1, JSON.stringify({ dockWidth: result.dockWidth, viewport: result.viewport, columns: result.dockColumns }));
            check(`${prefix}: no control sits past the right edge`, result.clipped.length === 0, JSON.stringify(result.clipped.slice(0, 6)));

            if (result.touchLayout && result.showroomStage)
                check(`${prefix}: the hull preview leaves the price on screen`, result.showroomStage.height <= result.showroomStage.contentHeight + 1, JSON.stringify(result.showroomStage));

            if (result.touchLayout)
                check(`${prefix}: every control clears the 44px tap floor`, result.small.length === 0, JSON.stringify(result.small.slice(0, 6)));
        }
    }

    check('station navigation run has no browser errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 8)));
    console.log(`\nStation navigation: ${checks.length - failures.length}/${checks.length} checks passed.`);
    if (failures.length) {
        console.log(`Failures: ${failures.length}`);
        for (const failure of failures)
            console.log(`  · ${failure.name}${failure.detail ? ` · ${failure.detail}` : ''}`);
        process.exitCode = 1;
    }
}
catch (error) {
    console.error('STATION NAVIGATION ERROR:', error.stack ?? error.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* ignore */ }
    chrome.kill();
    server.kill();
    await pause(350);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
