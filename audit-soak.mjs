// Focused probes: HUD overflow forensics, mission-row clip, long combat soak
// for announcement repetition (pushSensor has no duplicate coalescing).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs')); }

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4873;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(ROOT, 'docs', 'audit-shots');
mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(BASE)).ok) break; } catch { await wait(100); } }

const log = (...a) => console.log(...a);
const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'],
});

// ---------------------------------------------------------------- PROBE 1: HUD overflow forensics
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(600);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    await wait(2500);
    const hud = await page.evaluate(() => {
        const out = {};
        for (const sel of ['main.steering-stick', 'section.hud', '.cockpit-vignette', '#hud']) {
            const el = document.querySelector(sel);
            if (!el) { out[sel] = null; continue; }
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            out[sel] = { sw: el.scrollWidth, cw: el.clientWidth, w: Math.round(r.width), x: Math.round(r.left), right: Math.round(r.right), ox: cs.overflowX, transform: cs.transform !== 'none' ? cs.transform.slice(0, 40) : 'none' };
        }
        // find the widest offenders inside #hud
        const hudEl = document.querySelector('#hud');
        out.offenders = [...hudEl.querySelectorAll('*')]
            .map((el) => ({ sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], right: Math.round(el.getBoundingClientRect().right), w: Math.round(el.getBoundingClientRect().width) }))
            .filter((o) => o.right > 1281)
            .sort((a, b) => b.right - a.right)
            .slice(0, 8);
        return out;
    });
    log('HUD forensics:', JSON.stringify(hud, null, 1));
    // Which element is 1307 wide? check canvas
    const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const r = c?.getBoundingClientRect();
        return c ? { w: c.width, h: c.height, cw: c.clientWidth, rw: Math.round(r?.width ?? 0), x: Math.round(r?.left ?? 0) } : null;
    });
    log('canvas:', JSON.stringify(canvas));
    await page.screenshot({ path: `${SHOTS}/soak-flight-desktop.png` });
    await context.close();
}

// ---------------------------------------------------------------- PROBE 2: mission-row clip at 1280
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await wait(800);
    await page.evaluate(() => document.querySelector('[data-dock-hotspot="bar"]')?.click());
    await wait(600);
    await page.evaluate(() => document.querySelector('[data-bar-panel="missions"]')?.click());
    await wait(800);
    const rows = await page.evaluate(() => {
        return [...document.querySelectorAll('#dock-screen .mission-row')].slice(0, 4).map((row) => {
            const b = row.querySelector('.mission-row-copy b');
            if (!b) return null;
            const cs = getComputedStyle(b);
            const r = b.getBoundingClientRect();
            return { text: b.textContent.slice(0, 60), sw: b.scrollWidth, cw: b.clientWidth, fs: cs.fontSize, ws: cs.whiteSpace, ov: cs.overflow, tovf: cs.textOverflow, w: Math.round(r.width) };
        });
    });
    log('mission rows (desktop):', JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${SHOTS}/soak-missions-desktop.png` });
    await context.close();
}

// ---------------------------------------------------------------- PROBE 3: 3-minute combat soak
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 160)}`); });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(600);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    // place player near a patrol zone to trigger inspection chatter, then arena enemies
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('debris', 'dogfight', 'veteran'));
    await wait(3000);
    // soak: 150 s of combat sim with the player firing and turning
    const start = Date.now();
    while (Date.now() - start < 150000) {
        await page.keyboard.down(' '); // fire
        await wait(400);
        await page.keyboard.up(' ');
        await page.keyboard.down('a');
        await wait(300);
        await page.keyboard.up('a');
        await page.keyboard.down('d');
        await wait(300);
        await page.keyboard.up('d');
        await wait(400);
        if (errors.length > 3) break;
    }
    const soak = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ui = runtime.ui;
        return {
            sensor: ui.sensorLog.map((e) => ({ m: e.message.slice(0, 60), tone: e.tone })),
            events: ui.recentEvents.map((e) => ({ m: e.message.slice(0, 60), count: e.count ?? 1 })),
            hull: runtime.save.player.hull,
            shield: runtime.save.player.shield,
            hostiles: runtime.ships.filter((s) => s.hostile && s.hull > 0).length,
            wrecks: runtime.ships.filter((s) => s.hull <= 0).length,
            simTime: runtime.save.world.time,
            fps: runtime.frameStats?.fps ?? null,
        };
    });
    log('soak result:', JSON.stringify(soak, null, 1).slice(0, 3000));
    // repetition analysis on the sensor log
    const counts = {};
    for (const e of soak.sensor) counts[e.m] = (counts[e.m] ?? 0) + 1;
    const repeated = Object.entries(counts).filter(([, n]) => n > 1);
    log('repeated sensor lines (log history):', JSON.stringify(repeated));
    // live ticker check: watch the sensor ticker for 20 s and count distinct messages
    const live = await page.evaluate(() => new Promise((resolve) => {
        const ui = window.__VOID_PRIVATEER__.getRuntime().ui;
        const seen = [];
        const t0 = performance.now();
        const iv = setInterval(() => {
            const entry = ui.currentEntry(ui.sensorLog);
            const m = entry?.message ?? '(idle)';
            if (!seen.length || seen[seen.length - 1].m !== m)
                seen.push({ m: m.slice(0, 60), at: ((performance.now() - t0) / 1000).toFixed(1) });
            if (performance.now() - t0 > 20000) { clearInterval(iv); resolve(seen); }
        }, 250);
    }));
    log('live sensor ticker over 20 s:', JSON.stringify(live, null, 1).slice(0, 2000));
    await page.screenshot({ path: `${SHOTS}/soak-combat-final.png` });
    log('soak console errors:', errors.length === 0 ? 'none' : errors.slice(0, 5).join('|'));
    await context.close();
}

server.kill();
await browser.close();
log('done');
