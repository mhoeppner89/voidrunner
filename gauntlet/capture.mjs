// Gauntlet capture rig — screenshots of the judged scenes for builder/critic A/B.
// Modeled on .freebuff/capture-scenes.mjs. Usage: node gauntlet/capture.mjs <outDir>
// Scenes: azure-rings, azure-limb, vesper-view, laser-volley, missile-run, dogfight-wide.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCATIONS } from '../src/game/data.js';

// Node's built-in WebSocket (the script referenced an undefined `WS`).
const WS = WebSocket;

// Chrome needs --no-sandbox --disable-gpu-sandbox under the session sandbox;
// with those flags Node's native WebSocket transport works (see AGENTS.md).

const OUT = process.argv[2] ?? 'gauntlet/shots/run';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdpPort = 9435;
const chromeProfile = mkdtempSync(join(tmpdir(), 'vr-capture-'));

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-gpu-sandbox', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${chromeProfile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,720', 'about:blank',
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
const shoot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`captured ${name}.png`);
};

// Place the player at `from`, oriented to look at `to`, parked.
const lookAt = (from, to) => `(() => {
    const s = window.__VOID_PRIVATEER__.getState();
    s.player.position = [${from.join(',')}];
    const dx = ${to[0]} - s.player.position[0];
    const dy = ${to[1]} - s.player.position[1];
    const dz = ${to[2]} - s.player.position[2];
    const l = Math.hypot(dx, dy, dz);
    let ux = dx / l, uy = dy / l, uz = dz / l;
    let ax = uy, ay = -ux, az = 0, w = 1 - uz;
    const ql = Math.hypot(ax, ay, az, w);
    s.player.rotation = [ax / ql, ay / ql, az / ql, w / ql];
    s.player.velocity = [0,0,0]; s.player.angularVelocity = [0,0,0]; s.player.throttle = 0;
    return true;
})()`;

const planetScene = (name, id, distFactor, lift) => {
    const p = LOCATIONS[id].position;
    const r = LOCATIONS[id].radius;
    // Offset mostly along +X/+Z with a vertical lift so the ring plane reads.
    const from = [p[0] + r * distFactor * 0.62, p[1] + r * lift, p[2] + r * distFactor * 0.79];
    return { name, setup: lookAt(from, p) };
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
    ws = new WS(target.webSocketDebuggerUrl);
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
    await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
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

    // --- Planet scenes -----------------------------------------------------
    const rings = planetScene('azure-rings', 'azure', 4.6, 1.15);
    await evaluate(rings.setup);
    await sleep(700);
    await shoot('azure-rings');

    const limb = planetScene('azure-limb', 'azure', 1.75, 0.34);
    await evaluate(limb.setup);
    await sleep(700);
    await shoot('azure-limb');

    const vesper = planetScene('vesper-view', 'vesper', 2.6, 0.55);
    await evaluate(vesper.setup);
    await sleep(700);
    await shoot('vesper-view');

    // --- Combat scenes -----------------------------------------------------
    await evaluate(`window.__VOID_PRIVATEER__.startArena('open', '1v1')`);
    await sleep(900);
    const shipPos = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const ship = rt.ships.find((s) => s.hostile && s.hull > 0);
        return ship ? ship.position : null;
    })()`);
    if (!shipPos) throw new Error('no hostile in arena');

    // Laser volley: park close on the +X/+Z diagonal, dead-on, fire three
    // pairs, shoot while the last bolts are mid-flight (bolt life 1.35s @ 205).
    const standoff = (dist) => lookAt(
        [shipPos[0] + dist * 0.57, shipPos[1] + dist * 0.2, shipPos[2] + dist * 0.79],
        shipPos,
    );
    await evaluate(standoff(38));
    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().firePlayerGuns()`);
    await sleep(150);
    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().firePlayerGuns()`);
    await sleep(150);
    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().firePlayerGuns()`);
    await sleep(140);
    await shoot('laser-volley');
    await sleep(120);
    await shoot('laser-volley-late');

    // Missile run: lock nearest hostile, launch, catch it mid-flight with exhaust.
    await evaluate(standoff(62));
    await sleep(250);
    await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); if (rt.targetNearestHostile) rt.targetNearestHostile(); rt.fireMissile(); return true; })()`);
    await sleep(430);
    await shoot('missile-run');

    // Wide dogfight framing.
    await evaluate(standoff(130));
    await sleep(400);
    await shoot('dogfight-wide');

    console.log(`\nScreenshots written to ${OUT}/`);
    const uniqueErrors = [...new Set(pageErrors)];
    console.log(`page errors: ${uniqueErrors.length ? '\n  ' + uniqueErrors.slice(0, 6).join('\n  ') : 'none'}`);
    if (uniqueErrors.length)
        process.exitCode = 1;
}
catch (err) {
    console.error('CAPTURE ERROR:', err.message);
    process.exitCode = 1;
}
finally {
    try { await send('Browser.close'); } catch { /* ignore */ }
    chrome.kill();
}
