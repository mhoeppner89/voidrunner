// Probe 3: portrait concourse launch affordance.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs')); }
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 4877;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync(path.join(ROOT, 'docs', 'audit-shots'), { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(BASE)).ok) break; } catch { await wait(100); } }
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'] });
{
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 30000 });
    await wait(1500);
    const res = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const launchEls = [...document.querySelectorAll('[data-ui-command="launch"]')].map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh && r.width > 2 && cs.display !== 'none' && +cs.opacity > 0.05;
            return { tag: el.tagName, cls: String(el.className).slice(0, 40), rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, inView, opacity: cs.opacity, display: cs.display };
        });
        const otherPointers = [...document.querySelectorAll('#dock-screen [role="button"], #dock-screen button')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
        }).map((el) => (el.getAttribute('data-ui-command') ?? el.getAttribute('data-dock-hotspot') ?? el.textContent?.trim().slice(0, 16)));
        return { launchEls, otherPointers, vw, vh };
    });
    console.log(JSON.stringify(res, null, 1));
    await page.screenshot({ path: path.join(ROOT, 'docs', 'audit-shots', 'portrait-concourse.png') });
    await context.close();
}
server.kill();
await browser.close();
console.log('done');
