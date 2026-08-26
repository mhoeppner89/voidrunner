// Headless layout regression probe for the own-ship monitor.
//
// Fails if the own-ship monitor's status bars or race strip ever overflow at
// any supported viewport — the recurring "Hülle overflows the bottom" and
// "racing text on top of health bars" bugs. The probe is self-contained: it
// spawns a static file server for the repo root, drives a headless Chrome,
// and measures real DOM geometry with a mounted weapon AND a live race strip
// (the worst case — the old four-track grid auto-placed the bars into the
// ticker row once a gun was mounted, and the strip then printed over them).
//
// Checks per viewport:
//   - bars: the HULL bar row's bottom must stay >= 4px above the monitor's
//     bottom border, with and without the strip live.
//   - strip: when live, its top must clear the bars container (>= 2px) and it
//     must stay inside the monitor (>= 2px from the bottom border).
//   - stability: showing the strip must not shift the monitor layout
//     (outline height delta <= 0.5px — "stable positions").
//
// Viewport matrix: desktop, media-query edge, phone landscape, portrait, and
// Retina, plus a large-root-font pass (rem 24) that approximates aggressive
// browser zoom / OS text scaling.
//
// Run: node probe-own-monitor.mjs   (exit code 0 = all green)
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0;
let failed = 0;
const check = (condition, message) => {
    if (condition) {
        passed += 1;
    }
    else {
        failed += 1;
        console.error(`FAIL: ${message}`);
    }
};

// ---------------------------------------------------------------- static server
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.glb': 'model/gltf-binary',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    let body;
    try {
        body = readFileSync(filePath);
    }
    catch {
        res.writeHead(404).end('not found');
        return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
});

// ---------------------------------------------------------------- headless driver
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let msgId = 0;
const pending = new Map();
let ws;
const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
});
const evalJS = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails)
        throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400));
    return res.result.value;
};

const geo = `(() => {
    const mon = document.querySelector('.cockpit-screen-own');
    if (!mon || document.querySelector('#hud').classList.contains('is-hidden'))
        return null;
    const bars = mon.querySelector('.screen-bars');
    const hull = bars.children[2]; // SHIELDS, ARMOR, HULL
    const strip = mon.querySelector('#screen-race-strip');
    const outline = mon.querySelector('.hull-outline');
    const m = mon.getBoundingClientRect();
    const hh = hull.getBoundingClientRect();
    const bb = bars.getBoundingClientRect();
    const ss = strip.getBoundingClientRect();
    const oo = outline.getBoundingClientRect();
    const ticker = mon.querySelector('.screen-ticker');
    const tt = ticker.getBoundingClientRect();
    return {
        hullBottomGap: +(m.bottom - hh.bottom).toFixed(1),        // space below HULL row
        barsH: +bb.height.toFixed(1),                             // bars container (squash detector)
        tickerH: +tt.height.toFixed(1),                           // ticker row (squash detector)
        stripTopVsBarsBottom: +(ss.top - bb.bottom).toFixed(1),   // strip clear of bars?
        stripBottomGap: +(m.bottom - ss.bottom).toFixed(1),       // strip inside monitor?
        stripVisible: strip.classList.contains('is-visible'),
        weaponVisible: getComputedStyle(mon.querySelector('#screen-own-weapon')).display !== 'none',
        outlineH: +oo.height.toFixed(1),
    };
})()`;

const rig = `(() => {
    const mon = document.querySelector('.cockpit-screen-own');
    const strip = mon.querySelector('#screen-race-strip');
    // updateHud toggles is-visible every frame; neutralize it so the rigged
    // strip stays live for the measurement.
    strip.classList.toggle = function () {};
    const weapon = mon.querySelector('#screen-own-weapon');
    weapon.classList.add('is-visible');
    weapon.dataset.venting = 'false';
    weapon.querySelector('span').textContent = 'IMPULSLASER';
    weapon.querySelector('em').textContent = '∞';
    strip.classList.add('is-visible');
    strip.dataset.phase = 'countdown';
    strip.querySelector('span').textContent = 'TÜR 9/13';
    strip.querySelector('b').textContent = '1. · 01:01';
    return 'rigged';
})()`;

const VIEWPORTS = [
    [1920, 1080, 1, 'desktop 1920x1080'],
    [1536, 864, 1, 'desktop 1536x864'],
    [1280, 720, 1, 'desktop 1280x720'],
    [1024, 576, 1, 'desktop 1024x576'],
    [900, 506, 1, 'media edge 900x506'],
    [844, 390, 1, 'phone landscape 844x390'],
    [667, 375, 1, 'phone landscape 667x375'],
    [580, 766, 1, 'portrait 580x766'],
    [960, 540, 2, 'retina 960x540@2x'],
    [960, 540, 2, 'retina bigfont 960x540@2x + rem24'],
    [1024, 576, 1, 'desktop bigfont 1024x576 + rem24'],
    [1280, 720, 1, 'desktop bigfont 1280x720 + rem24'],
];

const main = async () => {
    if (!existsSync(CHROME)) {
        console.error(`FAIL: Chrome not found at ${CHROME} (set CHROME_BIN to override). The layout probe cannot measure DOM geometry without a browser.`);
        process.exit(1);
    }
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;

    const profile = mkdtempSync(join(tmpdir(), 'vr-ownmon-regression-'));
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
        '--no-sandbox', '--disable-gpu-sandbox',
        `--remote-debugging-port=${port + 1}`, `--user-data-dir=${profile}`,
        '--window-size=1920,1080', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    const cdpPort = port + 1;

    let target;
    for (let i = 0; i < 60; i += 1) {
        try {
            const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
            const tabs = await res.json();
            target = tabs.find((t) => t.type === 'page');
            if (target)
                break;
        }
        catch { /* not up yet */ }
        await sleep(250);
    }
    if (!target) {
        console.error('FAIL: could not reach headless Chrome.');
        process.exit(1);
    }

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result);
            pending.delete(msg.id);
        }
    };
    await send('Page.enable');
    await send('Page.navigate', { url: `${origin}/` });
    await sleep(4000);
    await evalJS(`(() => { window.__VOID_PRIVATEER__.newGame(true); window.__VOID_PRIVATEER__.launch(); return 'ok'; })()`);

    // Wait for the HUD to come up with the own monitor in the DOM.
    let hudReady = false;
    for (let i = 0; i < 40; i += 1) {
        hudReady = await evalJS(`(() => {
            const hud = document.querySelector('#hud');
            const mon = document.querySelector('.cockpit-screen-own');
            return !!hud && !!mon && !hud.classList.contains('is-hidden');
        })()`);
        if (hudReady)
            break;
        await sleep(250);
    }
    check(hudReady, 'game HUD (with own-ship monitor) becomes visible after launch');
    if (!hudReady)
        process.exit(1);

    await evalJS(rig);
    await sleep(200);

    for (const [w, h, dpr, label] of VIEWPORTS) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
        await sleep(200);
        if (label.includes('bigfont'))
            await evalJS(`document.documentElement.style.fontSize = '24px'`);
        else
            await evalJS(`document.documentElement.style.fontSize = ''`);
        await sleep(120);

        // Worst case: weapon mounted + strip live.
        const g = await evalJS(geo);
        check(g !== null, `${label}: monitor measurable`);
        if (g === null)
            continue;
        check(g.weaponVisible, `${label}: weapon readout is mounted (worst case)`);
        check(g.stripVisible, `${label}: race strip is live (worst case)`);
        check(g.hullBottomGap >= 4, `${label}: HULL bar stays >= 4px above the monitor's bottom border (got ${g.hullBottomGap}px)`);
        // The bars must sit in their own natural-height track. The old grid had
        // four tracks for five children once a gun was mounted, so auto-placement
        // squashed the bars into the 0.98rem ticker row (~16px instead of ~27px).
        check(g.barsH >= 20, `${label}: status bars keep their natural height (got ${g.barsH}px)`);
        check(g.tickerH >= 12, `${label}: ticker keeps its reserved row (got ${g.tickerH}px)`);
        check(g.stripTopVsBarsBottom >= 2, `${label}: race strip clears the bars by >= 2px (got ${g.stripTopVsBarsBottom}px)`);
        check(g.stripBottomGap >= 2, `${label}: race strip stays inside the monitor (bottom gap ${g.stripBottomGap}px)`);

        // Plain state: no strip, no weapon — bars must still not overflow.
        await evalJS(`(() => {
            const mon = document.querySelector('.cockpit-screen-own');
            const s = mon.querySelector('#screen-race-strip');
            const w = mon.querySelector('#screen-own-weapon');
            s.classList.remove('is-visible');
            w.classList.remove('is-visible');
            return 'plain';
        })()`);
        await sleep(120);
        const plain = await evalJS(geo);
        check(plain !== null && plain.hullBottomGap >= 4, `${label}: HULL bar stays clear with no strip/weapon (got ${plain?.hullBottomGap}px)`);

        // Stability: re-show the strip and the layout must not shift.
        await evalJS(rig);
        await sleep(120);
        const withStrip = await evalJS(geo);
        check(withStrip !== null && Math.abs((withStrip.outlineH ?? 0) - (plain?.outlineH ?? 0)) <= 0.5,
            `${label}: showing the strip does not shift the monitor layout (outline ${plain?.outlineH}px -> ${withStrip?.outlineH}px)`);
    }

    chrome.kill();
    server.close();
    console.log(`\n${passed} checks passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
};
main().catch((err) => {
    console.error('probe failed:', err.message);
    process.exit(1);
});
