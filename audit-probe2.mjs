// Probe round 2: collision-announcement spam, real dogfight soak, phone
// portrait flight, save/resume round trip.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs')); }

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4875;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(ROOT, 'docs', 'audit-shots');
mkdirSync(SHOTS, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(BASE)).ok) break; } catch { await wait(100); } }
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'] });

const bootLaunch = async (page) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(500);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    await wait(1500);
};

// ------------------------------------------------- PROBE A: collision spam
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
    await bootLaunch(page);
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('debris', 'freeflight', 'rookie'));
    await wait(2000);
    // ram the debris field at full throttle for 40 s
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await wait(40000);
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
    const coll = await page.evaluate(() => {
        const ui = window.__VOID_PRIVATEER__.getRuntime().ui;
        return {
            events: ui.recentEvents.map((e) => ({ m: e.message.slice(0, 50), count: e.count ?? 1, at: +e.at.toFixed(1) })),
            hull: window.__VOID_PRIVATEER__.getRuntime().save.player.hull,
            shield: window.__VOID_PRIVATEER__.getRuntime().save.player.shield,
            dockedAt: window.__VOID_PRIVATEER__.getRuntime().save.player.dockedAt ?? null,
        };
    });
    log('collision soak events:', JSON.stringify(coll.events, null, 1));
    log('hull/shield after ramming:', coll.hull, coll.shield, 'docked:', coll.dockedAt);
    const dupes = coll.events.filter((e, i) => i > 0 && coll.events[i - 1].m === e.m && (e.count ?? 1) === 1);
    log('un-coalesced adjacent duplicate events:', JSON.stringify(dupes));
    log('collision probe console errors:', errors.length ? errors.slice(0, 3).join('|') : 'none');
    await page.screenshot({ path: `${SHOTS}/probe-collision.png` });
    await context.close();
}

// ------------------------------------------------- PROBE B: real dogfight (1v1, rookie) + chatter log
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
    await bootLaunch(page);
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('open', '1v1', 'rookie'));
    await wait(2500);
    // aim at the enemy and fire in bursts; cycle targets to keep lock
    const start = Date.now();
    let key = ' ';
    while (Date.now() - start < 90000) {
        await page.keyboard.down(key);
        await wait(700);
        await page.keyboard.up(key);
        key = key === ' ' ? 'a' : ' ';
        await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.targetNearestHostile?.());
        await wait(300);
    }
    const fight = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const ui = runtime.ui;
        return {
            hull: runtime.save.player.hull, shield: runtime.save.player.shield,
            hostiles: runtime.ships.filter((s) => s.hostile && s.hull > 0).length,
            wrecks: runtime.ships.filter((s) => s.hull <= 0).length,
            events: ui.recentEvents.map((e) => ({ m: e.message.slice(0, 50), count: e.count ?? 1 })),
            comms: ui.commsLog.map((c) => `${c.callsign}: ${c.line.slice(0, 60)}`),
            projectiles: runtime.projectiles?.length ?? 0,
        };
    });
    log('dogfight result:', JSON.stringify(fight, null, 1).slice(0, 3500));
    const commsCounts = {};
    for (const c of fight.comms) commsCounts[c] = (commsCounts[c] ?? 0) + 1;
    log('repeated comms lines >2:', JSON.stringify(Object.entries(commsCounts).filter(([, n]) => n > 2)));
    const evCounts = {};
    for (const e of fight.events) evCounts[e.m] = (evCounts[e.m] ?? 0) + (e.count ?? 1);
    log('event totals:', JSON.stringify(evCounts));
    log('dogfight console errors:', errors.length ? errors.slice(0, 4).join('|') : 'none');
    await page.screenshot({ path: `${SHOTS}/probe-dogfight.png` });
    await context.close();
}

// ------------------------------------------------- PROBE C: phone portrait flight + dock
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await wait(1200);
    await page.screenshot({ path: `${SHOTS}/portrait-01-dock.png` });
    // dock scan: any element wider than viewport?
    const dockScan = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        return [...document.querySelectorAll('#dock-screen *')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > vw + 4 || r.left < -4);
        }).slice(0, 6).map((el) => ({ sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], l: Math.round(el.getBoundingClientRect().left), r: Math.round(el.getBoundingClientRect().right), vw }));
    });
    log('portrait dock wide elements:', JSON.stringify(dockScan));
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.skipTutorial?.());
    await wait(500);
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 30000 });
    await wait(2500);
    await page.screenshot({ path: `${SHOTS}/portrait-02-flight.png` });
    const flightScan = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const mon = document.querySelector('.cockpit-screen-own');
        const monR = mon?.getBoundingClientRect();
        return {
            wide: [...document.querySelectorAll('#hud *')].filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > vw + 4 || r.left < -4);
            }).slice(0, 6).map((el) => ({ sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], l: Math.round(el.getBoundingClientRect().left), r: Math.round(el.getBoundingClientRect().right), vw })),
            monitor: monR ? { x: Math.round(monR.left), right: Math.round(monR.right), vw } : null,
        };
    });
    log('portrait flight wide elements:', JSON.stringify(flightScan, null, 1));
    log('portrait console errors:', errors.length ? errors.slice(0, 4).join('|') : 'none');
    await context.close();
}

// ------------------------------------------------- PROBE D: save/resume round trip
{
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await bootLaunch(page);
    const before = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.player.credits += 123;
        window.__VOID_PRIVATEER__.saveNow();
        return { credits: runtime.save.player.credits, pos: runtime.save.player.position.map((v) => Math.round(v)) };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    const resumed = await page.evaluate(() => {
        window.__VOID_PRIVATEER__.resume();
        return new Promise((resolve) => setTimeout(() => {
            const save = window.__VOID_PRIVATEER__.getState();
            resolve({ credits: save?.player?.credits, dockedAt: save?.player?.dockedAt ?? null, mode: save ? (save.player.dockedAt ? 'docked' : 'flight') : 'none' });
        }, 2500));
    });
    log('save/resume:', JSON.stringify({ before, resumed }));
    log('resume credits preserved:', resumed.credits === before.credits);
    await page.screenshot({ path: `${SHOTS}/probe-resume.png` });
    await context.close();
}

server.kill();
await browser.close();
log('done');
