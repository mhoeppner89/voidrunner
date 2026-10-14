import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCATIONS } from '../../../src/game/data.js';

const OUT = 'output/scenes';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdpPort = 9435;
const chromeProfile = mkdtempSync(join(tmpdir(), 'vr-capture-'));

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--mute-audio', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${chromeProfile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=960,540', 'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error('eval: ' + (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text));
    return res.result?.value;
};

const scene = async (name, setup, delayMs = 500) => {
    await evaluate(setup);
    await sleep(delayMs);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const png = Buffer.from(shot.data, 'base64');
    writeFileSync(`${OUT}/${name}.png`, png);
    const sig = await evaluate(`(() => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let luma = 0, sat = 0, bright = 0, dark = 0, satPx = 0, n = 0;
            const lumas = [];
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                const s = mx === 0 ? 0 : (mx - mn) / mx;
                luma += l; sat += s; n += 1;
                lumas.push(l);
                if (l > 0.78) bright += 1;
                if (l < 0.12) dark += 1;
                if (s > 0.35) satPx += 1;
            }
            lumas.sort((a, b) => b - a);
            const top = (frac) => {
                const k = Math.max(1, Math.floor(lumas.length * frac));
                let sum = 0;
                for (let i = 0; i < k; i += 1) sum += lumas[i];
                return sum / k;
            };
            resolve({
                luma: luma / n, sat: sat / n,
                bright: bright / n, dark: dark / n, satPx: satPx / n,
                top20: top(0.2), top2: top(0.02),
            });
        };
        img.src = ${JSON.stringify('data:image/png;base64,' + shot.data)};
    }))()`);
    // Subject-only brightness: the center third of the frame (the framed ship/rock/station).
    const center = await evaluate(`(() => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let luma = 0, n = 0, peak = 0;
            const W = c.width, H = c.height;
            for (let y = Math.floor(H*0.30); y < Math.floor(H*0.70); y += 1) {
                for (let x = Math.floor(W*0.30); x < Math.floor(W*0.70); x += 1) {
                    const i = (y*W + x)*4;
                    const r = d[i]/255, g = d[i+1]/255, b = d[i+2]/255;
                    const l = 0.2126*r + 0.7152*g + 0.0722*b;
                    luma += l; peak = Math.max(peak, Math.max(r,g,b)); n += 1;
                }
            }
            resolve({ luma: luma/n, peak });
        };
        img.src = ${JSON.stringify('data:image/png;base64,' + shot.data)};
    }))()`);
    console.log(`${name.padEnd(14)} luma=${sig.luma.toFixed(3)} sat=${sig.sat.toFixed(3)} subjectTop20=${sig.top20.toFixed(3)} highlightTop2=${sig.top2.toFixed(3)} dark=${(sig.dark * 100).toFixed(1)}%  CENTER=${center.luma.toFixed(3)} (peak ${center.peak.toFixed(3)})`);
    return sig;
};

const lookAt = (from, to) => {
    const f = [from[0], from[1], from[2]];
    const t = [to[0], to[1], to[2]];
    return `(() => {
        const s = window.__VOID_PRIVATEER__.getState();
        s.player.position = [${f.join(',')}];
        const dx = ${t[0]} - s.player.position[0];
        const dy = ${t[1]} - s.player.position[1];
        const dz = ${t[2]} - s.player.position[2];
        const l = Math.hypot(dx, dy, dz);
        let ux = dx / l, uy = dy / l, uz = dz / l;
        let ax = uy, ay = -ux, az = 0, w = 1 - uz;
        const ql = Math.hypot(ax, ay, az, w);
        s.player.rotation = [ax / ql, ay / ql, az / ql, w / ql];
        s.player.velocity = [0,0,0]; s.player.angularVelocity = [0,0,0]; s.player.throttle = 0;
        return s.player.position;
    })()`;
};

try {
    let target;
    for (let i = 0; i < 60 && !target; i += 1) {
        await sleep(500);
        try {
            const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
            target = list.find((t) => t.type === 'page');
        }
        catch { /* retry */ }
    }
    if (!target) throw new Error('no CDP target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const pageErrors = [];
    ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    });
    await send('Page.navigate', { url: process.env.VR_BASE_URL??'http://127.0.0.1:4192/' });
    let hookReady = false;
    for (let i = 0; i < 40 && !hookReady; i += 1) {
        await sleep(300);
        hookReady = await evaluate('Boolean(window.__VOID_PRIVATEER__)').catch(() => false);
    }
    if (!hookReady) throw new Error('page hook never appeared');
    await evaluate('window.__VOID_PRIVATEER__.newGame()');
    for (let i = 0; i < 120; i += 1) {
        await sleep(400);
        if ((await evaluate('window.__VOID_PRIVATEER__.getState().player.dockedAt')) === 'helix') break;
    }
    await evaluate('window.__VOID_PRIVATEER__.launch()');
    await sleep(600);

    // Static landmarks (persistent, comparable framing). Distances sit just outside
    // each body's dock radius so the player never auto-docks into the dock UI.
    await scene('station', lookAt([LOCATIONS.helix.position[0] + 1600, LOCATIONS.helix.position[1] + 320, LOCATIONS.helix.position[2] + 1000], LOCATIONS.helix.position));
    await scene('planet-vesper', lookAt([LOCATIONS.vesper.position[0] + 19000, LOCATIONS.vesper.position[1] + 6500, LOCATIONS.vesper.position[2] + 12000], LOCATIONS.vesper.position), 400);
    await scene('asteroid-field', lookAt([LOCATIONS.shardbelt.position[0] + 120, LOCATIONS.shardbelt.position[1] + 40, LOCATIONS.shardbelt.position[2] + 90], LOCATIONS.shardbelt.position), 400);

    // Deep space (starfield + nebulae).
    await scene('deep-space', `(() => { const s = window.__VOID_PRIVATEER__.getState(); s.player.position = [0,0,0]; s.player.rotation = [0,0,0,1]; s.player.velocity = [0,0,0]; s.player.throttle = 0; return true; })()`, 400);

    // Dogfight: frame a hostile ship up close.
    await evaluate(`window.__VOID_PRIVATEER__.startArena('open', '1v1')`);
    await sleep(800);
    const shipPos = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const ship = rt.ships.find((s) => s.hostile && s.hull > 0);
        return ship ? ship.position : null;
    })()`);
    if (shipPos) {
        const from = [shipPos[0] + 28, shipPos[1] + 9, shipPos[2] + 26];
        await scene('dogfight', lookAt(from, shipPos), 150);
    }
    console.log(`\nScreenshots written to ./${OUT}/`);
    const uniqueErrors = [...new Set(pageErrors)];
    console.log(`page errors: ${uniqueErrors.length ? '\n  ' + uniqueErrors.slice(0, 6).join('\n  ') : 'none'}`);
}
catch (err) {
    console.error('CAPTURE ERROR:', err.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* ignore */ }
    chrome.kill();
}
