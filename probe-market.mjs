import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const PORT = 4187;
const CDP_PORT = 9370;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(join(tmpdir(), 'vr-market-profile-'));
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
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', 'about:blank',
], { cwd: ROOT, stdio: 'ignore' });

let ws;
let messageId = 0;
const pending = new Map();
const runtimeErrors = [];
const checks = [];
const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};
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
        throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
};
const waitFor = async (expression, label, attempts = 100) => {
    for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression).catch(() => false))
            return;
        await wait(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
};
const capture = async (path) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
};

try {
    let serverReady = false;
    for (let i = 0; i < 50 && !serverReady; i += 1) {
        await wait(100);
        try {
            serverReady = (await fetch(`http://127.0.0.1:${PORT}/`)).ok;
        }
        catch { /* retry */ }
    }
    if (!serverReady)
        throw new Error(`Local market probe server did not start${serverOutput ? `: ${serverOutput.trim()}` : ''}`);

    let target;
    for (let i = 0; i < 80 && !target; i += 1) {
        await wait(100);
        try {
            const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
            target = list.find((entry) => entry.type === 'page');
        }
        catch { /* retry */ }
    }
    if (!target)
        throw new Error('Chrome DevTools target did not start');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            if (message.error)
                handlers.reject(new Error(message.error.message));
            else
                handlers.resolve(message.result);
            return;
        }
        if (message.method === 'Runtime.exceptionThrown')
            runtimeErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'page exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
            runtimeErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await waitFor('Boolean(window.__VOID_PRIVATEER__)', 'game debug hooks');
    await evaluate('window.__VOID_PRIVATEER__.newGame()');
    await waitFor("window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix'", 'new docked career');
    await evaluate(`(async () => {
        const { setLanguage } = await import('./src/game/i18n.js');
        setLanguage('en');
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.ui.refreshDock(runtime.save);
        document.querySelector('[data-dock-hotspot="market"]')?.click();
        document.querySelector('[data-market-point="commodities"]')?.click();
    })()`);
    await waitFor("document.querySelectorAll('.commodity-card').length === 10", 'commodity catalog');
    await waitFor("[...document.querySelectorAll('.commodity-art img')].every((img) => img.complete)", 'commodity images');

    // Selecting a commodity refreshes the same exchange panel; the catalog's
    // scroll anchor must survive the re-render (it used to bounce to the top).
    const scrollKept = await evaluate(`(async () => {
        const cat = () => document.querySelector('.commodity-catalog');
        cat().scrollTop = 99999;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const before = cat().scrollTop;
        if (before > 0) {
            [...cat().querySelectorAll('.commodity-card')].at(-1).click();
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return cat().scrollTop === before;
        }
        return true;
    })()`);
    check('catalog scroll stays put when selecting a commodity', scrollKept);

    const desktop = await evaluate(`(() => ({
        cards: document.querySelectorAll('.commodity-card').length,
        images: [...document.querySelectorAll('.commodity-card .commodity-art img')].map((img) => ({
            ok: img.complete && img.naturalWidth > 0,
            width: img.naturalWidth,
            height: img.naturalHeight,
        })),
        viewport: [innerWidth, innerHeight],
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        selected: document.querySelector('.commodity-card.selected')?.dataset.commodityId,
    }))()`);
    check('all 10 commodity cards render', desktop.cards === 10, String(desktop.cards));
    check('all 10 commodity images load at 4:3', desktop.images.length === 10 && desktop.images.every((image) => image.ok && image.width * 3 === image.height * 4), JSON.stringify(desktop.images));
    check('desktop market has no horizontal overflow', desktop.overflow <= 1, `${desktop.viewport.join('×')} overflow ${desktop.overflow}px`);
    await capture('/private/tmp/voidrunner-market-desktop.png');

    const quoted = await evaluate(`(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.player.credits = 50000;
        runtime.save.player.cargo = {};
        runtime.ui.refreshDock(runtime.save);
        document.querySelector('[data-commodity-id="medicine"]')?.click();
        document.querySelector('[data-market-qty="five"]')?.click();
        const { quoteCommodityTrade } = await import('./src/game/economy.js');
        const quote = quoteCommodityTrade(runtime.save, 'helix', 'medicine', 'buy', 5);
        const before = { credits: runtime.save.player.credits, cargo: runtime.save.player.cargo.medicine ?? 0 };
        document.querySelector('[data-trade="buy:medicine:5"]')?.click();
        return {
            quote,
            before,
            after: { credits: runtime.save.player.credits, cargo: runtime.save.player.cargo.medicine ?? 0 },
            selected: document.querySelector('.commodity-card.selected')?.dataset.commodityId,
            ticketTotal: document.querySelector('.trade-buy small')?.textContent ?? '',
            textState: JSON.parse(window.render_game_to_text()),
        };
    })()`);
    check('trade ticket stays focused on the selected commodity', quoted.selected === 'medicine', quoted.selected);
    check('executed buy matches the displayed quote', quoted.quote.ok
        && quoted.after.credits === quoted.quote.postCredits
        && quoted.after.cargo === quoted.before.cargo + quoted.quote.quantity,
    `quote ${quoted.quote.quantity} for ${quoted.quote.total}; credits ${quoted.before.credits}→${quoted.after.credits}`);
    check('text-state hook matches the visible trade ticket', quoted.textState.market?.selectedCommodityId === 'medicine'
        && quoted.textState.market?.quantity === 5
        && quoted.textState.market?.credits === quoted.after.credits,
    JSON.stringify(quoted.textState.market));

    const intel = await evaluate(`(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { recordMarketVisit } = await import('./src/game/economy.js');
        runtime.save.world.marketIntel = {};
        runtime.save.world.time = 100;
        recordMarketVisit(runtime.save.world, 'helix');
        runtime.save.world.time = 130;
        recordMarketVisit(runtime.save.world, 'vesper');
        runtime.save.world.time = 160;
        recordMarketVisit(runtime.save.world, 'azure');
        runtime.ui.renderMarketPoint('commodities');
        return {
            rows: [...document.querySelectorAll('.route-intelligence ol li')].map((row) => row.textContent.trim()),
            text: document.querySelector('.route-intelligence')?.textContent ?? '',
        };
    })()`);
    const intelText = intel.text.toLowerCase();
    check('remote comparison lists visited ports only', intel.rows.length === 2 && intelText.includes('vesper') && intelText.includes('azure') && !intelText.includes('rook'), intel.rows.join(' | '));
    await evaluate("document.querySelector('.route-intelligence')?.scrollIntoView({ block: 'center' })");
    await capture('/private/tmp/voidrunner-market-intel.png');

    const tip = await evaluate(`(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.world.market.helix.food.lastPrice = 20;
        runtime.save.world.market.vesper.food.lastPrice = 90;
        const { currentProfitableRoutes } = await import('./src/game/economy.js');
        const { formatCredits } = await import('./src/game/random.js');
        const route = currentProfitableRoutes(runtime.save.world, 'helix', 3)[0];
        runtime.ui.switchToTerminal('bar');
        document.querySelector('[data-person-id="mara-vek"]')?.click();
        const actual = document.querySelector('.bar-dialogue-card p')?.textContent ?? '';
        return {
            badge: document.querySelector('.live-route-tip')?.textContent ?? '',
            actual,
            route,
            expectedParts: route ? [
                formatCredits(route.buyPrice),
                formatCredits(route.sellPrice),
                formatCredits(route.profitPerUnit),
                runtime.save.world.market[route.destinationId] ? route.destinationId : '',
            ] : [],
            destinationName: route ? (await import('./src/game/data.js')).LOCATIONS[route.destinationId].name : '',
        };
    })()`);
    check('local market contact gives a live route tip', Boolean(tip.route) && tip.badge.includes('LIVE ROUTE TIP'), tip.badge);
    check('bartender tip matches the current profitable route', tip.expectedParts.slice(0, 3).every((part) => tip.actual.includes(part)) && tip.actual.includes(tip.destinationName), tip.actual);
    await capture('/private/tmp/voidrunner-market-tip.png');

    await evaluate(`(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.ui.switchToTerminal('market');
        runtime.ui.openMarketPoint('commodities');
    })()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
    await wait(250);
    const phone = await evaluate(`(() => {
        const selectors = ['.commodity-exchange', '.commodity-catalog', '.trade-ticket', '.trade-ticket-hero', '.trade-actions-ticket'];
        const boxes = Object.fromEntries(selectors.map((selector) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect();
            return [selector, rect ? { left: rect.left, right: rect.right, width: rect.width } : null];
        }));
        document.querySelector('.trade-ticket')?.scrollIntoView({ block: 'start' });
        return {
            viewport: [innerWidth, innerHeight],
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            columns: getComputedStyle(document.querySelector('.commodity-catalog')).gridTemplateColumns.split(' ').length,
            boxes,
        };
    })()`);
    check('844×390 market has no horizontal overflow', phone.overflow <= 1 && Object.values(phone.boxes).filter(Boolean).every((box) => box.left >= -1 && box.right <= 845), `overflow ${phone.overflow}px; ${JSON.stringify(phone.boxes)}`);
    check('phone catalog becomes a compact five-column shelf', phone.columns === 5, `${phone.columns} columns`);
    await wait(100);
    await capture('/private/tmp/voidrunner-market-phone.png');
    check('browser console is clean', runtimeErrors.length === 0, runtimeErrors.join(' | '));

    const failures = checks.filter((entry) => !entry.ok);
    console.log(`${checks.length - failures.length}/${checks.length} market browser checks passed`);
    if (failures.length)
        process.exitCode = 1;
}
catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* already closed */ }
    server.kill();
    chrome.kill();
}
