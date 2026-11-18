// Screenshot the combat FX review at fixed moments (paused, stepped clock),
// so effect changes can be compared frame for frame.
//   VR_BASE_URL=http://127.0.0.1:4192 node tools/playtest/fx-review/capture.mjs [name ...]
// VR_FX_QUERY=legacy captures the previous release's effects (see review.js).
// Output: output/fx-review/<name>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173';
const out = process.env.VR_FX_OUT ?? 'output/fx-review';
mkdirSync(out, { recursive: true });
import { SCENARIOS } from './scenarios.js';
const pick = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const [name, { query, actions, at }] of Object.entries(SCENARIOS)) {
    if (pick.length && !pick.includes(name)) continue;
    await page.goto(`${base}/tools/playtest/fx-review/index.html?paused&nopanel&seed=7&${query}${process.env.VR_FX_QUERY ? `&${process.env.VR_FX_QUERY}` : ''}`);
    await page.waitForFunction(() => window.__FX_REVIEW__, null, { timeout: 30000 });
    await page.evaluate(`(() => { const fx = window.__FX_REVIEW__; const run = (t) => { for (let s = 0; s < t; s += 1/60) fx.step(1/60); }; ${actions}; run(${at}); })()`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('wrote', `${out}/${name}.png`);
}
await browser.close();
if (errors.length) { console.error('page errors:', [...new Set(errors)].join('\n')); process.exitCode = 1; }
