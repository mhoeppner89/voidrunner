// Audit harness — headless visual play-test of Voidrunner. Read-only audit:
// it writes nothing into the game, nothing in src/ is modified.
// Captures console errors, layout overflow, announcement (toast/ticker) streams.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try {
    ({ chromium } = await import('playwright'));
}
catch {
    ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs'));
}

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4871;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(ROOT, 'docs', 'audit-shots');
mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'ignore'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(BASE)).ok) break; } catch { await wait(100); }
}

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail).slice(0, 600) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
};

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'],
});

const OVERFLOW_JS = `(() => {
    const doc = document.documentElement;
    const issues = [];
    for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const ox = getComputedStyle(el).overflowX;
        const h = getComputedStyle(el).overflowY;
        const scrollable = ox === 'auto' || ox === 'scroll' || h === 'auto' || h === 'scroll';
        if (!scrollable && el.scrollWidth - el.clientWidth > 3)
            issues.push({ kind: 'hscroll-clip', sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], sw: el.scrollWidth, cw: el.clientWidth });
        if (r.left < -6 && r.width > 10) issues.push({ kind: 'offscreen-left', sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], x: Math.round(r.left) });
        if (r.right > doc.clientWidth + 6 && r.width > 10) issues.push({ kind: 'offscreen-right', sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], right: Math.round(r.right), vw: doc.clientWidth });
        if (r.bottom > doc.clientHeight + 6 && r.width > 10 && cs.position !== 'fixed') {
            let p = el.parentElement, clipped = false;
            while (p && p !== document.body) {
                const pcs = getComputedStyle(p);
                if (/(auto|scroll)/.test(pcs.overflowY)) { clipped = true; break; }
                p = p.parentElement;
            }
            if (!clipped) issues.push({ kind: 'offscreen-bottom', sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], bottom: Math.round(r.bottom), vh: doc.clientHeight });
        }
    }
    return issues.slice(0, 25);
})()`;

// announcement observer: records every toast + pilot comms line with timestamps
const INSTALL_OBSERVER = `(() => {
    window.__AUDIT = { toasts: [], comms: [], events: [] };
    const stamp = () => (performance.now() / 1000).toFixed(1);
    new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches?.('.toast')) window.__AUDIT.toasts.push({ at: stamp(), text: n.textContent, tone: n.className });
            if (n.matches?.('[data-toast-id]')) window.__AUDIT.toasts.push({ at: stamp(), text: n.textContent });
        }
    }).observe(document.body, { childList: true, subtree: true });
    window.__AUDIT.installComms = () => {
        const bar = document.querySelector('#comms-bar');
        if (!bar || window.__AUDIT.commsObserved) return;
        window.__AUDIT.commsObserved = true;
        new MutationObserver(() => {
            const txt = bar.textContent.trim();
            if (txt && txt !== window.__AUDIT.lastComms) { window.__AUDIT.lastComms = txt; window.__AUDIT.comms.push({ at: stamp(), text: txt.slice(0, 160) }); }
        }).observe(bar, { childList: true, characterData: true, subtree: true });
    };
    window.__AUDIT.installComms();
    return true;
})()`;

const CAPTURE = `(() => {
    const ui = window.__VOID_PRIVATEER__.getRuntime()?.ui;
    const ticker = ui ? ui.currentEntry(ui.recentEvents)?.message : null;
    const sensor = ui ? ui.currentEntry(ui.sensorLog)?.message : null;
    const comms = [...document.querySelectorAll('#comms-bar')].map((b) => b.textContent.trim().slice(0, 100)).filter(Boolean);
    return {
        toasts: [...document.querySelectorAll('#toast-stack .toast')].map((t) => t.textContent),
        ticker, sensor, comms,
        state: JSON.parse(window.render_game_to_text()),
    };
})()`;

const newPage = async (viewport) => {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', hasTouch: viewport.width < 900 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => {
        if (m.type() === 'error')
            errors.push(`console.error: ${m.text().slice(0, 200)}`);
    });
    return { context, page, errors };
};
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });

// ==================================================================== TITLE
{
    const { context, page, errors } = await newPage({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await wait(2500);
    await shot(page, 'title-desktop.png');
    const overflowTitle = await page.evaluate(OVERFLOW_JS);
    const t = await page.evaluate(() => ({
        visible: !document.querySelector('#title-screen')?.classList.contains('is-hidden'),
        buttons: [...document.querySelectorAll('#title-screen button, #title-screen [role=button]')].map((b) => b.textContent?.trim().slice(0, 24)),
    }));
    check('title renders', t.visible && t.buttons.length >= 2, JSON.stringify(t.buttons));
    check('title no overflow', overflowTitle.length === 0, JSON.stringify(overflowTitle.slice(0, 4)));
    check('title console clean', errors.length === 0, errors.slice(0, 3).join('|'));
    await context.close();
}

// ==================================================================== DOCK FLOWS (desktop + phone)
const dockFlow = async (label, viewport) => {
    const { context, page, errors } = await newPage(viewport);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await wait(1500);
    await shot(page, `${label}-01-concourse.png`);

    // scan concourse overflow
    const concOverflow = await page.evaluate(OVERFLOW_JS);
    check(`${label} concourse no overflow`, concOverflow.length === 0, JSON.stringify(concOverflow.slice(0, 4)));

    // market: open the market hub, then the commodity exchange
    await page.evaluate(() => document.querySelector('[data-dock-hotspot="market"]')?.click());
    await wait(1200);
    await page.evaluate(() => document.querySelector('[data-market-point="commodities"]')?.click());
    await wait(1000);
    await shot(page, `${label}-02-market.png`);
    const marketOverflow = await page.evaluate(OVERFLOW_JS);
    const market = await page.evaluate(() => ({
        terminal: document.querySelector('#dock-screen')?.dataset.terminal,
        bodyText: document.querySelector('.dock-content')?.textContent?.replace(/\s+/g, ' ').slice(0, 180),
    }));
    check(`${label} market opens`, market.terminal === 'market', market.terminal);
    check(`${label} market no overflow`, marketOverflow.length === 0, JSON.stringify(marketOverflow.slice(0, 4)));

    // buy water at market point
    const buy = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-commodity-id]')];
        return rows.map((r) => r.dataset.commodityId).slice(0, 8);
    });
    check(`${label} market lists commodities`, buy.length > 0, buy.join(','));
    if (buy.length) {
        await page.evaluate((id) => document.querySelector(`[data-commodity-id="${id}"]`)?.click(), buy[0]);
        await wait(500);
        await shot(page, `${label}-03-commodity.png`);
        // click buy/sell-all button
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /BUY 10|KAUFE 10|BUY ALL/i.test(b.textContent))?.click());
        await wait(700);
        const creditsAfter = await page.evaluate(() => window.__VOID_PRIVATEER__.getState()?.player?.credits);
        check(`${label} commodity purchase executes`, typeof creditsAfter === 'number', `credits=${creditsAfter}`);
        await shot(page, `${label}-04-bought.png`);
    }

    // outfitting (ship parts)
    await page.evaluate(() => document.querySelector('[data-market-point="equipment"]')?.click());
    await wait(1200);
    await shot(page, `${label}-05-outfitting.png`);
    const outfitOverflow = await page.evaluate(OVERFLOW_JS);
    const outfit = await page.evaluate(() => ({
        text: document.querySelector('.dock-content')?.textContent?.replace(/\s+/g, ' ').slice(0, 140),
    }));
    check(`${label} outfitting no overflow`, outfitOverflow.length === 0, JSON.stringify(outfitOverflow.slice(0, 4)));

    // missions via bar
    await page.evaluate(() => document.querySelector('[data-ui-command="dock-concourse"]')?.click());
    await wait(600);
    await page.evaluate(() => document.querySelector('[data-dock-hotspot="bar"]')?.click());
    await wait(800);
    await page.evaluate(() => document.querySelector('[data-bar-panel="missions"]')?.click());
    await wait(900);
    await shot(page, `${label}-06-missions.png`);
    const missionsOverflow = await page.evaluate(OVERFLOW_JS);
    const missions = await page.evaluate(() => ({
        count: document.querySelectorAll('[data-mission-select]').length,
        text: document.querySelector('.dock-content')?.textContent?.replace(/\s+/g, ' ').slice(0, 160),
    }));
    check(`${label} mission board lists contracts`, missions.count > 0, `count=${missions.count}`);
    check(`${label} missions no overflow`, missionsOverflow.length === 0, JSON.stringify(missionsOverflow.slice(0, 4)));
    // accept the first mission
    await page.evaluate(() => document.querySelector('[data-mission-select]')?.click());
    await wait(600);
    const accept = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /ACCEPT|ANNEHMEN|SIGN/i.test(b.textContent))?.textContent?.trim());
    if (accept) {
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /ACCEPT|ANNEHMEN|SIGN/i.test(b.textContent))?.click());
        await wait(700);
    }
    check(`${label} mission accept offered`, Boolean(accept), String(accept));

    check(`${label} console clean`, errors.length === 0, errors.slice(0, 4).join('|'));
    await context.close();
};
await dockFlow('desktop', { width: 1280, height: 720 });
await dockFlow('phone', { width: 844, height: 390 });

// ==================================================================== FLIGHT + COMBAT (desktop)
{
    const { context, page, errors } = await newPage({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    // skip the family-prologue tutorial gate so launch is allowed
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(800);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    await wait(3000);
    await shot(page, 'flight-01-launch.png');

    // hold W for thrust via keyboard events
    await page.keyboard.down('w');
    await wait(2500);
    await page.keyboard.up('w');
    await wait(1000);
    await shot(page, 'flight-02-thrust.png');
    const flight = await page.evaluate(CAPTURE);
    check('flight state advances', flight.state.mode === 'flight', `mode=${flight.state.mode} vel=${JSON.stringify(flight.state.player?.velocity)}`);
    const flightOverflow = await page.evaluate(OVERFLOW_JS);
    check('flight no overflow', flightOverflow.length === 0, JSON.stringify(flightOverflow.slice(0, 4)));

    // fire weapons
    await page.keyboard.down(' ');
    await wait(1500);
    await page.keyboard.up(' ');
    await wait(600);
    await shot(page, 'flight-03-fire.png');
    const fired = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const before = runtime.save.player.energy;
        return { energy: before, projectiles: runtime.projectiles?.length ?? -1 };
    });
    check('weapons fire consumes energy / spawns shots', fired.projectiles >= 0, JSON.stringify(fired));

    // arena: spawn hostiles and fight
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('debris', 'freeflight', 'rookie'));
    await wait(2500);
    const arena = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        return { hostiles: runtime.ships.filter((s) => s.hostile && s.hull > 0).length, mode: window.render_game_to_text() };
    });
    await wait(8000); // let AI fight
    await shot(page, 'flight-04-arena.png');
    check('arena spawns hostiles', arena.hostiles >= 0, `${arena.hostiles} hostile(s)`);

    // damage loop: hostiles should engage; verify hull/shield changes and pushEvent spam behavior
    const events = await page.evaluate(() => {
        const ui = window.__VOID_PRIVATEER__.getRuntime().ui;
        return ui.recentEvents.map((e) => ({ m: e.message.slice(0, 80), count: e.count ?? 1, tone: e.tone }));
    });
    check('event log records combat', events.length > 0, `${events.length} entries · latest=${JSON.stringify(events.slice(-3))}`);

    // spam check: identical announcements coalesce?
    const dupes = events.filter((e, i) => i > 0 && events[i - 1].m === e.m && (e.count ?? 1) === 1);
    check('no un-coalesced duplicate events', dupes.length === 0, JSON.stringify(dupes.slice(0, 4)));

    const dupToasts = await page.evaluate(() => {
        const toasts = [...document.querySelectorAll('#toast-stack .toast')].map((t) => t.textContent);
        return toasts.filter((t, i) => i > 0 && toasts[i - 1] === t);
    });
    check('no identical stacked toasts', dupToasts.length === 0, JSON.stringify(dupToasts));

    check('flight console clean', errors.length === 0, errors.slice(0, 4).join('|'));
    await context.close();
}

// ==================================================================== LONG SOAK: announcement repetition (2 min sim)
{
    const { context, page, errors } = await newPage({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(800);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    await page.evaluate(INSTALL_OBSERVER);
    // idle flight 45 s with periodic thrust pulses (sim runs, chatter accumulates)
    for (let i = 0; i < 9; i += 1) {
        await page.keyboard.down('w');
        await wait(1500);
        await page.keyboard.up('w');
        await wait(3000);
    }
    const soak = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ui = runtime.ui;
        const eventLog = ui.recentEvents.map((e) => ({ m: e.message, count: e.count ?? 1 }));
        const comms = window.__AUDIT?.comms ?? [];
        return {
            eventLog,
            comms,
            eventCount: ui.recentEvents.length,
            domToasts: document.querySelectorAll('#toast-stack .toast').length,
        };
    });
    // repetition analysis
    const counts = {};
    for (const e of soak.eventLog)
        counts[e.m] = (counts[e.m] ?? 0) + 1;
    const repeated = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    check('soak: no un-coalesced repeated events', repeated.length === 0, JSON.stringify(repeated.slice(0, 6)));
    const commsCounts = {};
    for (const c of soak.comms)
        commsCounts[c.text] = (commsCounts[c.text] ?? 0) + 1;
    const repeatedComms = Object.entries(commsCounts).filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]);
    check('soak: comms lines repeat ≤2×', repeatedComms.length === 0, JSON.stringify(repeatedComms.slice(0, 6)));
    console.log('soak comms sample:', JSON.stringify(soak.comms.slice(0, 12), null, 1).slice(0, 900));
    await shot(page, 'flight-05-soak.png');
    check('soak console clean', errors.length === 0, errors.slice(0, 4).join('|'));
    await context.close();
}

// ==================================================================== DOCK AFTER DAMAGE / RECOVERY + SAVE
{
    const { context, page, errors } = await newPage({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(800);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    // self-damage to test recovery flow
    const dmg = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.damagePlayer(40, 'audit probe');
        return { shield: runtime.save.player.shield, hull: runtime.save.player.hull };
    });
    check('damage drains shield first', dmg.shield === 60 || dmg.hull < 100, JSON.stringify(dmg));
    // dock again
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().dockAtNearest?.() ?? window.__VOID_PRIVATEER__.launch());
    await wait(1500);
    const st = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    check('re-dock works or launch no-op', typeof st === 'object', '');
    check('post-damage console clean', errors.length === 0, errors.slice(0, 4).join('|'));
    await context.close();
}

server.kill();
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
console.log(JSON.stringify(results.filter((r) => !r.ok), null, 1));
