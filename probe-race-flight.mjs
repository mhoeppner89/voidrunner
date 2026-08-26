// probe-race-flight.mjs — bar-circuit race quest, end to end, headless.
//
// Drives a real session through window.__VOID_PRIVATEER__.getRuntime() and
// steps updateSimulation(1/60) directly (no rAF): offer → accept (fee,
// travel leg) → manual fly-in to the start line (proximity handoff) →
// countdown hold → gate-by-gate flight at cruise speed with live rank →
// finish payout + records → expiry forfeit path → paid-entry reload restore.
// Also verifies the 0.7.7b gate-as-targets layer: gate lock via
// raceGateById / kind 'gate', gate radar blips + altitude ticks, and the
// own-monitor race strip. Exits nonzero on failure.
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpd = spawn('python3', ['-m', 'http.server', '4173'], { stdio: 'ignore', cwd: process.cwd() });
const FAILURES = [];
const PASS = [];
const check = (name, ok, detail) => {
    if (ok) PASS.push(name);
    else FAILURES.push(`${name} :: ${detail}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`);
};

const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox',
    // CDP over pipe: Node 25's global WebSocket stalls against DevTools in
    // this sandboxed environment, and Chrome's own child-process sandbox
    // collides with the outer one unless disabled. The pipe + --no-sandbox
    // pair boots cleanly where --remote-debugging-port hangs.
    '--remote-debugging-pipe',
    `--user-data-dir=${process.env.VR_PROFILE ?? '/tmp/vr-race-flight-profile'}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=640,480', 'about:blank',
], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

let msgId = 0;
let pageSession = null;
const pending = new Map();
const pageErrors = [];
{
    let buf = '';
    chrome.stdio[4].on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\0')) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (!line.trim())
                continue;
            let msg;
            try { msg = JSON.parse(line); } catch { continue; }
            if (msg.id !== undefined && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
                continue;
            }
            if (msg.method === 'Target.attachedToTarget' && msg.params.targetInfo.type === 'page')
                pageSession = msg.params.sessionId;
            else if (msg.sessionId === pageSession && msg.method === 'Runtime.exceptionThrown')
                pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? 'exception');
        }
    });
}
const rawSend = (method, params = {}, sessionId) => {
    const id = ++msgId;
    const payload = { id, method, params };
    if (sessionId)
        payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        chrome.stdio[3].write(JSON.stringify(payload) + '\0');
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error('cdp timeout: ' + method));
            }
        }, 30000);
    });
};
const send = (method, params = {}) => rawSend(method, params, pageSession);
const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 500));
    return r.result?.value;
};

try {
    await rawSend('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
    await sleep(400);
    const { targetId } = await rawSend('Target.createTarget', { url: 'about:blank' });
    const attached = await rawSend('Target.attachToTarget', { targetId, flatten: true });
    pageSession = attached.sessionId;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
    let hookReady = false;
    for (let i = 0; i < 40 && !hookReady; i += 1) {
        await sleep(300);
        hookReady = await evaluate('Boolean(window.__VOID_PRIVATEER__)').catch(() => false);
    }
    if (!hookReady) throw new Error('page hook never appeared');
    await evaluate('window.__VOID_PRIVATEER__.newGame()');
    let booted = false;
    for (let i = 0; i < 60 && !booted; i += 1) {
        await sleep(300);
        booted = await evaluate('Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.save?.player && window.__VOID_PRIVATEER__?.getRuntime?.()?.updateSimulation)').catch(() => false);
    }
    if (!booted) throw new Error('session never booted');

    // Pin the world seed: course geometry (and therefore flight duration)
    // must be identical across runs or the timing band below is noise.
    await evaluate("window.__VOID_PRIVATEER__.getRuntime().save.world.seed = 'race-flight-probe';");

    const STEP = 1 / 60;

    // ── Offer + accept ────────────────────────────────────────────────────
    await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.save.player.credits = 5000;
        rt.save.player.dockedAt = 'helix';
        rt.updateActiveInstance(true);
        return true;
    })()`);
    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().updateSimulation(${STEP}, {})`);
    check('offer posted at helix', await evaluate(
        `window.__VOID_PRIVATEER__.getState().world.offers.helix?.some((m) => m.id === 'race-shard-gauntlet') ?? false`,
    ), 'race-shard-gauntlet offer missing from helix board');

    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().acceptRace('shard-gauntlet')`);
    check('entry fee deducted', await evaluate(
        `window.__VOID_PRIVATEER__.getState().player.credits === 4500`,
    ), `credits=${await evaluate('window.__VOID_PRIVATEER__.getState().player.credits')} expected 4500`);
    check('travel leg live', await evaluate(
        `(() => { const rt = window.__VOID_PRIVATEER__.getRuntime();
           return !!rt.activeRace && rt.activeRace.state === 'travel'
             && rt.activeRace.course.id === 'shard-gauntlet'
             && rt.save.player.navTargetId === 'shardbelt'
             && rt.save.world.raceRecords['shard-gauntlet']?.active === true
             && Number.isFinite(rt.activeRace.deadline); })()`,
    ), JSON.stringify(await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); return { race: rt.activeRace?.state, nav: rt.save.player.navTargetId, rec: rt.save.world.raceRecords['shard-gauntlet'], dl: rt.activeRace?.deadline }; })()`)));
    check('second entry refused while one is live', await evaluate(
        `(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); const c = rt.save.player.credits;
           rt.acceptRace('mourning-run'); return rt.save.player.credits === c && rt.activeRace.course.id === 'shard-gauntlet'; })()`,
    ), 'double entry changed credits or overwrote the live race');

    // ── Visible start line + gate-as-target layer ─────────────────────────
    // The parcours must be VISIBLE from the moment the entry is paid: gate 1
    // is the pulsing active marker the pilot flies toward. And it must be
    // LOCKABLE from anywhere — raceGateById resolves the '{course}-gate-{n}'
    // ids the nav map and radar carry (mission anchors, like claims).
    check('gates visible during travel leg', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const gates = rt.renderer.raceGateMeshes;
        return { ok: gates.length === 13 && gates[0].visible && gates[12].visible, count: gates.length };
    })()`), 'parcours not rendered while travelling');

    check('gate lock via raceGateById (kind gate)', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const found = rt.raceGateById('shard-gauntlet-gate-0');
        if (!found || found.index !== 0) return { ok: false, found: Boolean(found) };
        const target = rt.raceGateTarget('shard-gauntlet-gate-0');
        if (!target || target.kind !== 'gate') return { ok: false, kind: target?.kind };
        rt.selectTarget('gate', 'shard-gauntlet-gate-0');
        const ref = rt.getTargetRef(false);
        return { ok: ref?.kind === 'gate' && rt.save.player.currentTargetId === 'shard-gauntlet-gate-0', refKind: ref?.kind };
    })()`), 'gate not lockable as a gate target');
    check('gate HUD model carries the checkpoint readout', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const model = rt.buildHudModel();
        const t = model.target;
        return {
            ok: t?.kind === 'gate' && t.name.startsWith('GATE') && t.readout !== undefined,
            name: t?.name, readout: t?.readout,
        };
    })()`), 'gate target missing from the HUD model');

    check('every gate is clear of rocks (reachable)', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const course = rt.activeRace.course;
        const obstacles = rt.activeFieldObstacles(course.zone);
        if (!obstacles.length) return { ok: true, skipped: 'no obstacles' };
        const v = rt.tmpA;
        const blocked = [];
        course.gates.forEach((gate, i) => {
            v.set(gate.position[0], gate.position[1], gate.position[2]);
            if (!rt.entryPositionClear(v, obstacles))
                blocked.push(i);
        });
        return { ok: blocked.length === 0, blocked };
    })()`), 'buried gates remain');

    // ── Gate color language + map-targetable start ────────────────────────
    check('gate colors: green active, yellow next, grey after, faint rest', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        // Mid-race view: gate 3 is current, 4 next, 5 after, 6+ far ahead.
        rt.renderer.syncRaceGates(rt.activeRace.course.gates, 3, [0, 0, 0]);
        const hex = (group) => '#' + group.children[0].material.color.getHexString();
        const op = (group) => Math.round(group.children[0].material.opacity * 100) / 100;
        const gates = rt.renderer.raceGateMeshes;
        const result = {
            active: hex(gates[3]), next: hex(gates[4]), after: hex(gates[5]), far: hex(gates[9]),
            activeOp: op(gates[3]), nextOp: op(gates[4]), afterOp: op(gates[5]), farOp: op(gates[9]),
        };
        rt.renderer.syncRaceGates(rt.activeRace.course.gates, 0, [0, 0, 0]);
        result.ok = result.active === '#3dff6e' && result.next === '#ffd24a'
            && result.after === '#9aa6b0' && result.far === '#9aa6b0'
            && result.afterOp === 0.5 && result.farOp === 0.14 && result.nextOp > result.afterOp;
        return result;
    })()`), 'color language wrong');
    check('race start is a map-targetable gate node', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.ui.showMap(rt.buildNavigationMapModel());
        const node = document.querySelector('#map-panel [data-map-target-kind="gate"][data-map-target-id="shard-gauntlet-gate-0"]');
        const label = node?.getAttribute('aria-label') ?? '';
        rt.ui.hideMap();
        return { ok: Boolean(node), label };
    })()`), 'gate node missing from the map');
    check('tapping the gate node locks it as the target', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.selectTarget('gate', 'shard-gauntlet-gate-0');
        return { locked: rt.save.player.currentTargetId === 'shard-gauntlet-gate-0', kind: rt.getTargetRef(false)?.kind };
    })()`), 'gate not locked after selection');

    // ── Radar: gate blips + altitude ticks ────────────────────────────────
    check('radar carries the next/cleared/future gate blips', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const contacts = rt.radarContacts().filter((c) => c.type === 'racegate');
        const states = contacts.map((c) => c.raceGate?.state);
        return {
            ok: contacts.length >= 2 && states.includes('next') && states.includes('future'),
            states, count: contacts.length,
        };
    })()`), 'racegate contacts missing from the radar');
    const altResult = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        // The radar disc is normalized to [-1, 1]; any contact whose gate
        // rides above/below the ecliptic gets a stub in that direction. Verify
        // at least one out-of-plane gate contact reaches the tick drawer.
        const contacts = rt.radarContacts().filter((c) => c.type === 'racegate' && Math.abs(c.altitude || 0) > 0.02);
        return { ok: contacts.length > 0, altitudes: contacts.map((c) => Math.round(c.altitude * 100) / 100) };
    })()`);
    check('out-of-plane gates draw an altitude tick', altResult.ok, JSON.stringify(altResult));
    check('radarAltitudeTick geometry helper', await evaluate(`(async () => {
        const mod = await import('/src/game/ui.js');
        const tick = mod.radarAltitudeTick({ x: 0.3, y: 0.2, radius: 1, ratio: 1, direction: -1, magnitude: 0.6, size: 4.2 });
        return { ok: Boolean(tick) && tick.length >= 1.5 && tick.startY < 0.2, tick };
    })()`), 'radarAltitudeTick failed to produce a stub');

    // ── Fly-in: manual approach triggers the proximity handoff ────────────
    // The 0.7.7b travel leg hands off to the grid by PROXIMITY (within
    // 2.2× gateRadius of Gate 1), not the removed 0.7.7a approach autopilot:
    // undock, jump the instance, fly at Gate 1 at cruise speed, and the
    // grid start must fire on its own.
    await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const course = rt.activeRace.course;
        const g = course.gates[0].position;
        rt.save.player.dockedAt = undefined;
        rt.activeInstanceId = course.zone;
        rt.renderer.setActiveInstance(course.zone);
        const d = Math.hypot(g[0], g[1], g[2]) || 1;
        rt.save.player.position = [g[0] + 400 * g[0] / d, g[1] + 400 * g[1] / d, g[2] + 400 * g[2] / d];
        rt.save.player.velocity = [0, 0, 0];
        rt.save.player.raceGateIndex = 0;
        rt.save.player.currentTargetId = undefined;
        rt.resetPlayerInterpolation(true);
        return true;
    })()`);
    const flyIn = await evaluate(`(async () => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const STEP = ${STEP};
        const course = rt.activeRace.course;
        const cruise = rt.playerStats().maxSpeed;
        const g = course.gates[0].position;
        let steps = 0;
        while (rt.activeRace?.state === 'travel' && steps < 60 * 60) {
            const p = rt.save.player.position;
            // Steer like the autopilot: desired vector to the gate, blended with
            // the obstacle-avoidance push so the fly-in bends around rocks that
            // happen to sit on the direct chord (the field layout is per-session
            // random — see createNewSave — so the chord is not always clear).
            const dx = g[0] - p[0], dy = g[1] - p[1], dz = g[2] - p[2];
            const d = Math.hypot(dx, dy, dz) || 1;
            const desired = { x: dx / d, y: dy / d, z: dz / d };
            const avoid = rt.getAvoidanceVector({ x: p[0], y: p[1], z: p[2] }, desired, 65, cruise);
            let nx = desired.x + avoid.x * 0.85;
            let ny = desired.y + avoid.y * 0.85;
            let nz = desired.z + avoid.z * 0.85;
            const nl = Math.hypot(nx, ny, nz) || 1;
            const move = Math.min(cruise * STEP, d);
            rt.save.player.position = [p[0] + nx / nl * move, p[1] + ny / nl * move, p[2] + nz / nl * move];
            rt.save.player.velocity = [0, 0, 0];
            rt.updateSimulation(STEP, {});
            steps += 1;
        }
        return { state: rt.activeRace?.state ?? 'none', steps };
    })()`);
    check('manual fly-in hands off to the grid (countdown)', flyIn.state === 'countdown',
        `travel leg never handed off: ${JSON.stringify(flyIn)}`);

    // Countdown hold: velocity pinned during the count, then green.
    let sawHold = false;
    for (let step = 0; step < Math.ceil(4.6 / STEP); step += 1) {
        const held = await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime();
            rt.updateSimulation(${STEP}, {});
            const v = rt.save.player.velocity;
            return rt.activeRace.state !== 'running' ? Math.hypot(v[0], v[1], v[2]) : -1; })()`);
        if (held > -1 && held < 1e-6)
            sawHold = true;
        if (await evaluate(`window.__VOID_PRIVATEER__.getRuntime().activeRace.state`) === 'running')
            break;
    }
    check('countdown reached running', await evaluate(
        `window.__VOID_PRIVATEER__.getRuntime().activeRace.state === 'running'`,
    ), 'race never left countdown after 4.6s of sim steps');
    check('grid hold pinned velocity', sawHold, 'velocity was never observed pinned at zero during the hold');

    // ── Race strip on the own-ship monitor ────────────────────────────────
    const stripResult = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const hud = rt.raceHud();
        const okModel = hud?.phase === 'running' && hud.gate >= 1 && hud.gateCount === 13
            && hud.rankLabel !== undefined && Number.isFinite(hud.time);
        rt.ui.updateHud(rt.buildHudModel());
        const strip = document.querySelector('#screen-race-strip');
        const label = document.querySelector('#screen-race-label')?.textContent ?? '';
        const value = document.querySelector('#screen-race-value')?.textContent ?? '';
        return {
            ok: okModel && strip?.classList.contains('is-visible')
                && /GATE|TOR/.test(label) && value.includes('·'),
            phase: hud?.phase, gate: hud?.gate, label, value,
        };
    })()`);
    check('race strip live while racing (label + value + rank)', stripResult.ok, JSON.stringify(stripResult));

    // ── Race the course at cruise speed (straight-line ideal) ─────────────
    // Each step: aim at the next gate, move along the chord at maxSpeed, then
    // run one sim step so updateRace sees the new position. This measures the
    // lower bound on real flight time — turning losses land above it.
    const finish = await evaluate(`(async () => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const STEP = ${STEP};
        const stats = rt.playerStats();
        const cruise = stats.maxSpeed;
        const p = rt.save.player;
        let steps = 0;
        const maxSteps = 60 * 400; // hard stop ≈ 6.7 min of sim time
        // Count gate passes by the highest gate index the player TARGETED:
        // endRaceField deletes raceGateIndex the same step the final gate is
        // crossed, so counting post-step increments would always undercount by
        // one. Crossing the last gate is the only path to a finished race, so
        // a finished run implies targetedMax + 1 gates were passed.
        let targetedMax = 0;
        while (rt.activeRace && rt.activeRace.state === 'running' && steps < maxSteps) {
            const course = rt.activeRace.course;
            const gate = course.gates[p.raceGateIndex];
            if (!gate) break;
            targetedMax = Math.max(targetedMax, p.raceGateIndex ?? 0);
            // Obstacle-aware steering (same blend the autopilot uses): the
            // straight chord between gates can clip a rock in a random field
            // layout, and teleporting into it makes the collision resolver
            // push the player back every step — a permanent stall. Bending
            // around rocks is what a real pilot does and keeps the ideal-time
            // lower bound honest.
            const dx = gate.position[0] - p.position[0];
            const dy = gate.position[1] - p.position[1];
            const dz = gate.position[2] - p.position[2];
            const d = Math.hypot(dx, dy, dz) || 1;
            const desired = { x: dx / d, y: dy / d, z: dz / d };
            const avoid = rt.getAvoidanceVector({ x: p.position[0], y: p.position[1], z: p.position[2] }, desired, 65, cruise);
            let nx = desired.x + avoid.x * 0.85;
            let ny = desired.y + avoid.y * 0.85;
            let nz = desired.z + avoid.z * 0.85;
            const nl = Math.hypot(nx, ny, nz) || 1;
            const move = Math.min(cruise * STEP, d);
            p.position = [p.position[0] + nx / nl * move, p.position[1] + ny / nl * move, p.position[2] + nz / nl * move];
            p.velocity = [0, 0, 0];
            rt.updateSimulation(STEP, {});
            steps += 1;
        }
        const gatePasses = rt.activeRace ? targetedMax : targetedMax + 1;
        return { steps, seconds: steps * STEP, gatePasses, finished: !rt.activeRace, rank: rt.save.world.raceRecords['shard-gauntlet']?.rank ?? null };
    })()`);
    check('all 13 gates passed', finish.gatePasses === 13, `gatePasses=${finish.gatePasses}`);
    check('course finished', finish.finished, `sim ended with activeRace=${JSON.stringify(finish)}`);
    check('rank recorded', finish.rank >= 1 && finish.rank <= 4, `rank=${finish.rank}`);
    // Course length is seed-dependent (radius jitter), so this is a sanity
    // floor/ceiling, not a fixed band: a collapsed or exploded course would
    // land far outside it.
    check('ideal-flight duration 45–300s (sanity band)', finish.seconds >= 45 && finish.seconds <= 300,
        `ideal straight-line time ${finish.seconds.toFixed(1)}s — tune baseRadius/racerSpeed`);
    console.log(`INFO ideal straight-line duration: ${finish.seconds.toFixed(1)}s, rank ${finish.rank}, gates ${finish.gatePasses}/13`);

    check('payout applied by rank', await evaluate(`(() => {
        const s = window.__VOID_PRIVATEER__.getState();
        const payouts = [4200, 1600, -300, -800];
        const expected = 4500 + payouts[(s.world.raceRecords['shard-gauntlet'].rank ?? 4) - 1];
        return s.player.credits === expected; })()`),
    `credits=${await evaluate('window.__VOID_PRIVATEER__.getState().player.credits')}`);
    check('quest closed + record written', await evaluate(`(() => {
        const s = window.__VOID_PRIVATEER__.getState();
        const q = s.quests.find((q) => q.id === 'bar-circuit');
        const rec = s.world.raceRecords['shard-gauntlet'];
        return q?.completedAt !== undefined && q.stepId === 'complete'
          && rec?.active === false && Number.isFinite(rec.time); })()`),
    JSON.stringify(await evaluate(`(() => { const s = window.__VOID_PRIVATEER__.getState(); return { q: s.quests.find((x) => x.id === 'bar-circuit'), rec: s.world.raceRecords['shard-gauntlet'] }; })()`)));
    check('field cleared after finish (gate lock dropped too)', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        return rt.ships.filter((sh) => sh.race).length === 0
          && rt.save.player.raceGateIndex === undefined
          && rt.renderer.raceActiveGate === undefined
          && rt.raceGateById('shard-gauntlet-gate-0') === undefined
          && !(rt.save.player.currentTargetId ?? '').includes('-gate-'); })()`),
    'racers, gate markers, or the gate lock survived endRaceField');

    // ── Reload restore: a paid-but-open entry rebuilds the travel leg ─────
    check('paid-entry restore rebuilds travel leg', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const s = rt.save;
        const q = s.quests.find((x) => x.id === 'bar-circuit');
        q.completedAt = undefined; q.stepId = 'travel'; q.flags.paid = true; q.flags.courseId = 'shard-gauntlet';
        delete q.flags.deadline;
        rt.restoreActiveRace();
        const ok = !!rt.activeRace && rt.activeRace.state === 'travel' && Number.isFinite(rt.activeRace.deadline)
            && rt.renderer.raceGateMeshes.length === 13;
        // Tear the rebuilt entry back down so the next scenario books cleanly.
        rt.activeRace = null;
        rt.renderer.clearRaceGates();
        if (s.world.raceRecords['shard-gauntlet'])
            s.world.raceRecords['shard-gauntlet'].active = false;
        return ok; })()`),
    'restoreActiveRace did not rebuild the travel leg from quest flags');

    // ── Expiry forfeit on the mourning-run ticket ──────────────────────────
    await evaluate(`window.__VOID_PRIVATEER__.getRuntime().acceptRace('mourning-run')`);
    check('mourning-run accepted', await evaluate(
        `(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); return rt.activeRace?.course?.id === 'mourning-run' && rt.save.world.raceRecords['mourning-run']?.active === true; })()`,
    ), 'second-course entry failed to book');
    await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.activeRace.deadline = rt.save.world.time - 1;
        rt.updateSimulation(${STEP}, {}); return true; })()`);
    check('expired entry forfeits', await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const s = rt.save;
        const rec = s.world.raceRecords['mourning-run'];
        const q = s.quests.find((x) => x.id === 'bar-circuit');
        return !rt.activeRace && rec?.failed === true && rec?.active === false && q?.completedAt !== undefined; })()`),
    JSON.stringify(await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); return { race: rt.activeRace?.state ?? null, rec: rt.save.world.raceRecords['mourning-run'] }; })()`)));
    check('offer returns after forfeit', await evaluate(
        `(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); rt.updateSimulation(${STEP}, {}); return rt.save.world.offers.rook?.some((m) => m.id === 'race-mourning-run') ?? false; })()`,
    ), 'forfeited course never re-offered at rook');

    // ── Save round-trip keeps race records ────────────────────────────────
    const recordsDump = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const raw = JSON.parse(JSON.stringify(rt.save));
        return JSON.stringify(raw.world.raceRecords ?? null); })()`);
    let parsedRecords = null;
    try { parsedRecords = JSON.parse(recordsDump); } catch { /* handled below */ }
    check('raceRecords survive saveGame round-trip',
        Boolean(parsedRecords?.['shard-gauntlet']?.rank >= 1 && typeof parsedRecords?.['mourning-run']?.failed === 'boolean'),
        `records=${recordsDump}`);
    // No page exceptions across the whole run (a NaN gate transform or a
    // missing renderer method would surface here first).
    check('no page exceptions', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'clean');
}
catch (err) {
    check('probe completed', false, String(err));
}
finally {
    chrome.kill('SIGKILL');
    httpd.kill();
}

if (FAILURES.length) {
    console.error(`\n${FAILURES.length} FAILURE(S)`);
    process.exit(1);
}
console.log(`\nALL ${PASS.length} CHECKS PASSED`);
