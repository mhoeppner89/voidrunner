// Readability and interaction-shape probe for every docked station surface.
// Runs the real UI in headless Chrome at desktop, tablet, landscape-phone,
// and portrait-phone sizes. Screenshots are written only to /private/tmp.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const PORT = 4194;
const CDP_PORT = 9384;
const profile = mkdtempSync(join(tmpdir(), 'vr-station-readability-'));
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
const failures = [];
const checks = [];

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
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const capture = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
};

const VIEWPORTS = [
    { name: 'large-1920x1080', width: 1920, height: 1080, mobile: false, dsf: 1, language: 'en' },
    { name: 'desktop-1280x720', width: 1280, height: 720, mobile: false, dsf: 1, language: 'de' },
    { name: 'tablet-1024x768', width: 1024, height: 768, mobile: true, dsf: 1, language: 'en' },
    { name: 'phone-844x390', width: 844, height: 390, mobile: true, dsf: 1, language: 'de' },
    { name: 'phone-390x844', width: 390, height: 844, mobile: true, dsf: 1, language: 'en' },
];

const SCREENS = [
    ['concourse', `ui.switchToTerminal('concourse')`],
    ['market-floor', `ui.switchToTerminal('market')`],
    ['commodities', `ui.openMarketPoint('commodities')`],
    ['equipment', `ui.openMarketPoint('equipment')`],
    ['shipyard', `ui.openMarketPoint('shipyard')`],
    ['ship-detail', `ui.openMarketPoint('shipyard'); document.querySelector('[data-ship-detail]')?.click()`],
    ['bar-floor', `ui.switchToTerminal('bar', 'people')`],
    ['bar-dialogue', `ui.switchToTerminal('bar', 'people'); document.querySelector('[data-person-id]')?.click()`],
    ['missions', `ui.switchToTerminal('bar', 'missions')`],
    ['guilds', `ui.switchToTerminal('bar', 'guilds')`],
    ['services', `ui.dockTab = 'concourse'; ui.dockTerminal = 'services'; ui.renderDock()`],
];

const scanStation = () => evaluate(`(() => {
    const root = document.querySelector('#dock-screen:not(.is-hidden)');
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
    const textElements = [];
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const text = walker.currentNode.nodeValue.replace(/\\s+/g, ' ').trim();
        const element = walker.currentNode.parentElement;
        if (!text || !element || seen.has(element) || element.closest('[aria-hidden="true"], .dock-backdrop, .dock-scanlines')) continue;
        if (!visible(element)) continue;
        seen.add(element);
        textElements.push({ element, text });
    }
    const tinyText = [];
    const clippedText = [];
    for (const { element, text } of textElements) {
        const style = getComputedStyle(element);
        const size = Number.parseFloat(style.fontSize);
        const decorativeIcon = element.matches('i, .dock-options-button') && text.length <= 2;
        if (!decorativeIcon && size < 12.9)
            tinyText.push({ path: path(element), size, text: text.slice(0, 70) });
        const clipsX = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
        const clipsY = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
        if (clipsX || clipsY)
            clippedText.push({ path: path(element), axis: clipsX ? 'x' : 'y', text: text.slice(0, 70) });
    }
    const controls = [...root.querySelectorAll('button, [role="button"], select, input')].filter((element) => visible(element));
    const smallControls = controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { path: path(element), width: rect.width, height: rect.height, text: element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60) };
    }).filter((entry) => entry.height < 43.5);
    const crampedControls = [];
    for (const element of controls) {
        const bounds = element.getBoundingClientRect();
        const ink = [];
        const textWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (textWalker.nextNode()) {
            const node = textWalker.currentNode;
            if (!node.nodeValue.replace(/\\s+/g, '').length || !visible(node.parentElement)) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            ink.push(...range.getClientRects());
        }
        const left = ink.length ? Math.min(...ink.map((rect) => rect.left)) : bounds.left;
        const right = ink.length ? Math.max(...ink.map((rect) => rect.right)) : bounds.right;
        const top = ink.length ? Math.min(...ink.map((rect) => rect.top)) : bounds.top;
        const bottom = ink.length ? Math.max(...ink.map((rect) => rect.bottom)) : bounds.bottom;
        const ownOverflow = element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2;
        const inkOutside = ink.length && (left < bounds.left - 1 || right > bounds.right + 1 || top < bounds.top - 1 || bottom > bounds.bottom + 1);
        const edgeRoomX = ink.length ? Math.min(left - bounds.left, bounds.right - right) : 99;
        const edgeRoomY = ink.length ? Math.min(top - bounds.top, bounds.bottom - bottom) : 99;
        if (ownOverflow || inkOutside || edgeRoomX < 1.5 || edgeRoomY < 1) {
            crampedControls.push({
                path: path(element),
                text: element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 70),
                size: [Math.round(bounds.width), Math.round(bounds.height)],
                ink: ink.length ? [Math.round(right - left), Math.round(bottom - top)] : [0, 0],
                room: [Number(edgeRoomX.toFixed(1)), Number(edgeRoomY.toFixed(1))],
                ownOverflow,
                inkOutside,
            });
        }
    }
    const dockRect = root.getBoundingClientRect();
    const bodyStyle = getComputedStyle(root.querySelector('p:not([hidden])') ?? root);
    const outfitMountRects = [...root.querySelectorAll('.outfit-dealer .dealer-mount')].map((element) => element.getBoundingClientRect());
    const outfitActionsRect = root.querySelector('.outfit-dealer .dealer-fit-actions')?.getBoundingClientRect();
    return {
        missing: false,
        viewport: [innerWidth, innerHeight],
        dock: [dockRect.left, dockRect.top, dockRect.right, dockRect.bottom],
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dockOverflowX: root.scrollWidth - root.clientWidth,
        tinyText,
        clippedText,
        smallControls,
        crampedControls,
        controlsScanned: controls.length,
        bodyFont: Number.parseFloat(bodyStyle.fontSize),
        outfit: {
            canvases: root.querySelectorAll('.outfit-dealer canvas').length,
            previewHosts: root.querySelectorAll('.dealer-preview-host, .outfit-hardpoint-node').length,
            steps: root.querySelectorAll('.outfit-dealer .dealer-step-heading').length,
            compatibleBays: root.querySelectorAll('.outfit-dealer .dealer-mount').length,
            enabledInstall: root.querySelectorAll('.outfit-dealer [data-outfit-action="install"]:not(:disabled)').length,
            fireGroupControls: root.querySelectorAll('.outfit-dealer [data-outfit-group]').length,
            rackActionOverlap: outfitMountRects.length && outfitActionsRect
                ? Math.max(0, Math.max(...outfitMountRects.map((rect) => rect.bottom)) - outfitActionsRect.top)
                : 0,
        },
    };
})()`);

const scanRotationNotice = () => evaluate(`(() => {
    const notice = document.querySelector('#rotate-notice:not(.is-hidden)');
    if (!notice) return { missing: true };
    const sizes = [...notice.querySelectorAll('strong, span, button')].map((element) => ({
        tag: element.tagName,
        size: Number.parseFloat(getComputedStyle(element).fontSize),
        height: element.getBoundingClientRect().height,
        text: element.textContent.trim().replace(/\\s+/g, ' '),
    }));
    return {
        missing: false,
        sizes,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
})()`);

const setViewport = (viewport) => send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.dsf,
    mobile: viewport.mobile,
    screenOrientation: viewport.width >= viewport.height
        ? { angle: 90, type: 'landscapePrimary' }
        : { angle: 0, type: 'portraitPrimary' },
});

const prepareCareer = async (viewport) => {
    await setViewport(viewport);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?station-readability=${Date.now()}` });
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'game hooks');
    await evaluate(`localStorage.setItem('voidrunner-lang', ${JSON.stringify(viewport.language)}); localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__', ${JSON.stringify(viewport.language)})`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?station-language=${viewport.language}&reload=${Date.now()}` });
    await pause(250);
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'reloaded game hooks');
    await waitFor(`document.documentElement.lang === ${JSON.stringify(viewport.language)}`, 'requested language');
    await evaluate('window.__VOID_PRIVATEER__.newGame()');
    await waitFor("window.__VOID_PRIVATEER__.getRuntime?.()?.save?.player?.dockedAt === 'helix'", 'docked career');
    await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const player = rt.save.player;
        player.credits = 123456789;
        player.cargo = {};
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
        if (viewport.width < viewport.height) {
            const notice = await scanRotationNotice();
            check(`${viewport.name} ${viewport.language}: landscape notice renders`, !notice.missing);
            check(`${viewport.name} ${viewport.language}: landscape notice text is at least 14px`, notice.sizes.every((entry) => entry.size >= 13.9), JSON.stringify(notice.sizes));
            check(`${viewport.name} ${viewport.language}: landscape notice action is at least 44px tall`, notice.sizes.filter((entry) => entry.tag === 'BUTTON').every((entry) => entry.height >= 43.5), JSON.stringify(notice.sizes));
            check(`${viewport.name} ${viewport.language}: landscape notice has no horizontal overflow`, notice.overflowX <= 1, `${notice.overflowX}px`);
            await capture(`/private/tmp/voidrunner-station-${viewport.name}-${viewport.language}-landscape-notice.png`);
            continue;
        }
        for (const [screen, command] of SCREENS) {
            await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); const ui = rt.ui; ${command}; return true; })()`);
            await pause(screen === 'shipyard' ? 260 : 120);
            await evaluate(`(() => { const dock = document.querySelector('#dock-screen .dock-content'); const market = document.querySelector('#dock-screen .market-menu-screen'); if (dock) dock.scrollTop = 0; if (market) market.scrollTop = 0; })()`);
            const result = await scanStation();
            const prefix = `${viewport.name} ${viewport.language} ${screen}`;
            check(`${prefix}: screen renders`, !result.missing);
            check(`${prefix}: no horizontal page overflow`, result.documentOverflowX <= 1 && result.dockOverflowX <= 1, `${result.documentOverflowX}/${result.dockOverflowX}px`);
            check(`${prefix}: station text is at least 13px`, result.tinyText.length === 0, JSON.stringify(result.tinyText.slice(0, 6)));
            check(`${prefix}: text is not clipped`, result.clippedText.length === 0, JSON.stringify(result.clippedText.slice(0, 6)));
            check(`${prefix}: all controls are at least 44px tall`, result.smallControls.length === 0, JSON.stringify(result.smallControls.slice(0, 6)));
            check(`${prefix}: control labels fit with breathing room`, result.crampedControls.length === 0, JSON.stringify(result.crampedControls.slice(0, 6)));
            if (screen === 'equipment') {
                check(`${prefix}: outfitter has no ship preview`, result.outfit.canvases === 0 && result.outfit.previewHosts === 0, JSON.stringify(result.outfit));
                check(`${prefix}: outfitter exposes three steps and usable bays`, result.outfit.steps === 3 && result.outfit.compatibleBays > 0, JSON.stringify(result.outfit));
                check(`${prefix}: selected gun exposes its A/B group control`, result.outfit.fireGroupControls === 1, JSON.stringify(result.outfit));
                check(`${prefix}: bay choices and actions do not overlap`, result.outfit.rackActionOverlap <= 1, JSON.stringify(result.outfit));
            }
            if (['equipment', 'commodities', 'missions', 'services', 'shipyard', 'ship-detail', 'guilds'].includes(screen))
                await capture(`/private/tmp/voidrunner-station-${viewport.name}-${viewport.language}-${screen}.png`);
            if (screen === 'equipment' && viewport.name === 'desktop-1280x720') {
                const beforeGroup = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    const mount = document.querySelector('.dealer-mount.is-selected')?.dataset.outfitSlot;
                    const loadout = rt.save.player.outfitting.loadouts[rt.save.player.shipId];
                    return { mount, group: loadout.fireGroups.assignments[mount], credits: rt.save.player.credits, target: document.querySelector('[data-outfit-group]')?.dataset.outfitGroup };
                })()`);
                check('desktop outfitter: default fitted gun makes grouping discoverable', Boolean(beforeGroup.mount && beforeGroup.group && beforeGroup.target && beforeGroup.group !== beforeGroup.target), JSON.stringify(beforeGroup));
                await evaluate(`document.querySelector('[data-outfit-group]')?.click()`);
                await waitFor(`window.__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.wayfarer.fireGroups.assignments[${JSON.stringify(beforeGroup.mount)}] === ${JSON.stringify(beforeGroup.target)}`, 'fire-group assignment');
                const afterGroup = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    const loadout = rt.save.player.outfitting.loadouts[rt.save.player.shipId];
                    const button = document.querySelector('[data-outfit-group]');
                    return { group: loadout.fireGroups.assignments[${JSON.stringify(beforeGroup.mount)}], credits: rt.save.player.credits, nextTarget: button?.dataset.outfitGroup, label: button?.textContent.trim().replace(/\\s+/g, ' ') };
                })()`);
                check('desktop outfitter: group change persists, costs nothing, and offers the reverse action', afterGroup.group === beforeGroup.target && afterGroup.credits === beforeGroup.credits && afterGroup.nextTarget === beforeGroup.group, JSON.stringify(afterGroup));
                await evaluate(`document.querySelector('[data-outfit-group="${beforeGroup.group}"]')?.click()`);
                await waitFor(`window.__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.wayfarer.fireGroups.assignments[${JSON.stringify(beforeGroup.mount)}] === ${JSON.stringify(beforeGroup.group)}`, 'fire-group restoration');
                const cycleResult = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    const loadout = rt.save.player.outfitting.loadouts.wayfarer;
                    const before = loadout.fireGroups.activeGroup;
                    rt.cycleWeapon();
                    return { before, after: loadout.fireGroups.activeGroup };
                })()`);
                check('flight weapon-cycle action switches between the fitted A/B groups', cycleResult.before === 'B' && cycleResult.after === 'A', JSON.stringify(cycleResult));
                const before = await evaluate(`(async () => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    const { OUTFIT_ITEMS } = await import('./src/game/outfitting.js');
                    return { credits: rt.save.player.credits, price: OUTFIT_ITEMS['radar-mk2'].price };
                })()`);
                await evaluate(`document.querySelector('[data-outfit-view="systems"]')?.click()`);
                await pause(100);
                await evaluate(`document.querySelector('[data-outfit-item="radar-mk2"]')?.click()`);
                await pause(100);
                const readyToInstall = await evaluate(`Boolean(document.querySelector('[data-outfit-action="install"]:not(:disabled)') && document.querySelector('.dealer-mount.is-selected'))`);
                check('desktop outfitter: item selection exposes one clear install action and selected bay', readyToInstall);
                await evaluate(`document.querySelector('[data-outfit-action="install"]:not(:disabled)')?.click()`);
                await waitFor(`window.__VOID_PRIVATEER__.getRuntime().save.player.outfitting.loadouts.wayfarer.utility.includes('radar-mk2')`, 'radar installation');
                const after = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    return { credits: rt.save.player.credits, installed: rt.save.player.outfitting.loadouts.wayfarer.utility.includes('radar-mk2') };
                })()`);
                check('desktop outfitter: install is immediate and charges the shown price', after.installed && after.credits === before.credits - before.price, JSON.stringify({ before, after }));
                const reset = await evaluate(`(() => {
                    const rt = window.__VOID_PRIVATEER__.getRuntime();
                    const dock = document.querySelector('#dock-screen .dock-content');
                    const market = document.querySelector('#dock-screen .market-menu-screen');
                    if (dock) dock.scrollTop = 120;
                    if (market) market.scrollTop = 120;
                    rt.ui.openMarketPoint('shipyard');
                    const nextDock = document.querySelector('#dock-screen .dock-content');
                    const nextMarket = document.querySelector('#dock-screen .market-menu-screen');
                    return { dock: nextDock?.scrollTop ?? -1, market: nextMarket?.scrollTop ?? -1 };
                })()`);
                check('market tab changes open at the top', reset.dock === 0 && reset.market === 0, JSON.stringify(reset));
            }
        }
    }

    check('station run has no browser errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 8)));
    console.log(`\nStation readability: ${checks.length - failures.length}/${checks.length} checks passed.`);
    if (failures.length) {
        console.log(`Failures: ${failures.length}`);
        process.exitCode = 1;
    }
}
catch (error) {
    console.error('STATION READABILITY ERROR:', error.stack ?? error.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* ignore */ }
    chrome.kill();
    server.kill();
    await pause(350);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
