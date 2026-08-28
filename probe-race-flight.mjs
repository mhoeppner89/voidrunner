// probe-race-flight.mjs — fixed six-course racing career, end to end, headless.
//
// The authoritative racing regression suite (replaces the retired 0.7.7
// bar-circuit probe, which required every course gate on the map and radar
// before the grid — the polished career deliberately exposes only the
// gathering during travel, then reveals the course at countdown). Covers the
// mission board, gathering-only travel phase, visible staged rivals,
// countdown/course reveal, finish presentation, drafting, centered fuel
// rewards, tight shortcut lifecycle, progression, persistence, and all six
// configured courses. Drives the real GameSession through Playwright.
import { spawn } from 'node:child_process';
import { chromium } from '/Users/mhoeppner/.codex/node_modules/playwright/index.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const BASE_URL = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4173/';
const ownServer = !process.env.VR_BASE_URL;
const httpd = ownServer ? spawn('python3', ['-m', 'http.server', '4173'], { stdio: 'ignore', cwd: ROOT }) : null;
const FAILURES = [];
const PASSES = [];
const check = (name, ok, detail = '') => {
    if (ok)
        PASSES.push(name);
    else
        FAILURES.push(`${name} :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

const pageErrors = [];
let browser;
let page;
const evaluate = (expression) => page.evaluate(expression);

try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (message) => {
        if (message.type() === 'error')
            pageErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}race-probe=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    let ready = false;
    for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
        await sleep(250);
        ready = await evaluate('Boolean(window.__VOID_PRIVATEER__)').catch(() => false);
    }
    if (!ready)
        throw new Error('debug hook never appeared');
    await evaluate("localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__', 'en'); window.__VOID_PRIVATEER__.newGame()");
    let booted = false;
    for (let attempt = 0; attempt < 100 && !booted; attempt += 1) {
        await sleep(250);
        booted = await evaluate('Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.save?.player && window.__VOID_PRIVATEER__?.getRuntime?.()?.renderer)').catch(() => false);
    }
    if (!booted)
        throw new Error('game session never booted');
    // Stop wall-clock rAF advancement. Every lifecycle transition below is
    // driven explicitly, so assertions cannot race the five-second cleanup.
    await evaluate(`(() => { const rt = window.__VOID_PRIVATEER__.getRuntime(); cancelAnimationFrame(rt.frameId); rt.frameId = 0; return true; })()`);
    await sleep(1200);

    const board = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.save.player.credits = 500000;
        const raceIds = (dock) => (rt.save.world.offers[dock] ?? []).filter((offer) => offer.kind === 'race').map((offer) => ({ id: offer.id, locked: offer.locked, tier: offer.tier, recommended: offer.recommendedShipText }));
        return { helix: raceIds('helix'), rook: raceIds('rook') };
    })()`);
    check('mission boards expose exactly three fixed courses per field', board.helix.length === 3 && board.rook.length === 3, board);
    check('each board starts with only tier one unlocked', board.helix.filter((offer) => !offer.locked).length === 1 && board.rook.filter((offer) => !offer.locked).length === 1, board);
    check('track recommendations carry the intended ship guidance', board.helix[2]?.recommended?.includes('heavy afterburner') && board.rook[0]?.recommended?.includes('Talon'), board);

    const lockedAttempt = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.save.player.dockedAt = 'helix';
        const before = rt.save.player.credits;
        rt.acceptRace('shard-switchback');
        return { unchanged: before === rt.save.player.credits, active: rt.activeRace?.course?.id ?? null };
    })()`);
    check('locked courses cannot be bought early', lockedAttempt.unchanged && lockedAttempt.active === null, lockedAttempt);

    const travel = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.acceptRace('shard-gauntlet');
        const race = rt.activeRace;
        const visibleGates = rt.renderer.raceGateMeshes.filter((mesh) => mesh.visible).length;
        const gateRadar = rt.radarContacts().filter((contact) => contact.type === 'racegate');
        const mapGates = rt.buildNavigationMapModel().contacts.filter((contact) => contact.kind === 'gate');
        return {
            state: race?.state,
            feePaid: rt.save.player.credits === 499500,
            racers: race?.racers?.length,
            shipRacers: rt.ships.filter((ship) => ship.race).length,
            variants: [...new Set(race?.racers?.map((ship) => ship.variant) ?? [])],
            visibleGates,
            startVisible: Boolean(rt.renderer.raceStartRoot?.visible),
            target: rt.save.player.currentTargetId,
            gatheringId: race?.course?.gathering?.id,
            firstGateHiddenFromTargeting: !rt.raceGateById(race?.course?.gates?.[0]?.id),
            gateRadar: gateRadar.map((contact) => ({ gathering: contact.raceGathering, state: contact.raceGate?.state })),
            mapGateIds: mapGates.map((contact) => contact.id),
        };
    })()`);
    check('entry starts a paid travel leg with three persistent rivals', travel.state === 'travel' && travel.feePaid && travel.racers === 3 && travel.shipRacers === 3 && travel.variants.length === 3, travel);
    check('travel reveals only the gathering marker', travel.visibleGates === 0 && travel.startVisible && travel.target === travel.gatheringId && travel.firstGateHiddenFromTargeting && travel.gateRadar.length === 1 && travel.gateRadar[0].gathering === true && travel.mapGateIds.length === 1 && travel.mapGateIds[0] === travel.gatheringId, travel);

    const gatherElevation = await evaluate(`(() => {
        // The radar altitude must be the true elevation angle (vertical offset
        // over 3D distance), so the tick shrinks as the gathering recedes. A
        // regression to a fixed dy/range scale fails this check.
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const gathering = rt.raceGathering(rt.activeRace.course);
        const player = rt.save.player.position;
        const dx = gathering.position[0] - player[0];
        const dy = gathering.position[1] - player[1];
        const dz = gathering.position[2] - player[2];
        const dist3d = Math.hypot(dx, dy, dz);
        const trueMagnitude = Math.abs(dy) / Math.max(dist3d, 1);
        const contact = rt.radarContacts().find((c) => c.raceGathering);
        return { trueMagnitude, radarMagnitude: contact ? Math.abs(contact.altitude) : null };
    })()`);
    check('the gathering radar tick magnitude is the true distance-aware elevation', gatherElevation.radarMagnitude !== null && Math.abs(gatherElevation.radarMagnitude - gatherElevation.trueMagnitude) < 1e-6, gatherElevation);

    const mapElevation = await evaluate(`(() => {
        // The nav map must carry the same distance-aware elevation on its
        // gate/gathering markers as the radar (both are dy / 3D distance in
        // the player frame) — a map regression to a fixed dy/range scale
        // fails this check.
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const radar = rt.radarContacts().find((c) => c.raceGathering);
        const map = rt.buildNavigationMapModel().contacts.find((c) => c.raceGathering);
        return { radar: radar ? Math.abs(radar.altitude) : null, map: map ? Math.abs(map.altitude ?? 0) : null };
    })()`);
    check('the nav map gathering marker carries the same distance-aware elevation as the radar', mapElevation.radar !== null && mapElevation.map !== null && Math.abs(mapElevation.radar - mapElevation.map) < 1e-6, mapElevation);

    const mapCue = await evaluate(`(() => {
        // The chart renders a distance-scaled out-of-plane tick on race
        // markers: present only above a small elevation threshold, with the
        // --alt length and up/down direction matching the contact's altitude.
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const model = rt.buildNavigationMapModel();
        rt.ui.showMap(model);
        const contact = model.contacts.find((c) => c.raceGathering);
        const cue = document.querySelector('#map-panel .tactical-contact.gate .tactical-alt');
        const result = {
            hasCue: Boolean(cue),
            alt: cue ? parseFloat(cue.style.getPropertyValue('--alt')) : null,
            up: cue ? cue.classList.contains('up') : null,
            expectedAlt: contact ? Math.round(Math.min(1, Math.abs(contact.altitude ?? 0)) * 100) / 100 : null,
            expectedUp: contact ? (contact.altitude ?? 0) > 0 : null,
        };
        rt.ui.hideMap();
        return result;
    })()`);
    const expectCue = mapCue.expectedAlt !== null && mapCue.expectedAlt > 0.02;
    check('the nav map renders a distance-scaled out-of-plane tick on the gathering marker', mapCue.hasCue === expectCue && (!expectCue || (mapCue.alt === mapCue.expectedAlt && mapCue.up === mapCue.expectedUp)), mapCue);

    const sammelTick = await evaluate(`(async () => {
        // The gathering rides the radar rim for the whole travel leg. Its
        // altitude tick must render in BOTH directions there — the outward
        // one used to be suppressed because it had no room inside the disc.
        const { radarAltitudeTick } = await import('/src/game/ui.js');
        const radius = 66;
        const rimY = -Math.sqrt(radius * radius - 20 * 20);
        const outward = radarAltitudeTick({ x: 20, y: rimY, radius, ratio: 1, direction: -1, magnitude: 0.8, size: 4.2, canvasHeight: 150 });
        const inward = radarAltitudeTick({ x: 20, y: rimY, radius, ratio: 1, direction: 1, magnitude: 0.8, size: 4.2, canvasHeight: 150 });
        return {
            outward: outward ? { startY: outward.startY, length: outward.length } : null,
            inward: inward ? { startY: inward.startY, length: inward.length } : null,
        };
    })()`);
    check('the gathering altitude tick renders at the radar rim in both directions', Boolean(sammelTick.outward && sammelTick.inward && sammelTick.outward.length >= 1.5 && sammelTick.inward.length >= 1.5), sammelTick);

    const waiting = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const race = rt.activeRace;
        const g = race.course.gathering;
        const d = g.direction;
        rt.save.player.dockedAt = undefined;
        rt.save.player.position = [g.position[0] - d[0] * 230, g.position[1] - d[1] * 230, g.position[2] - d[2] * 230];
        rt.save.player.velocity = [0, 0, 0];
        const dot = -d[2];
        if (dot < -0.999999) {
            rt.save.player.rotation = [0, 1, 0, 0];
        }
        else {
            const scale = Math.sqrt((1 + dot) * 2);
            rt.save.player.rotation = [d[1] / scale, -d[0] / scale, 0, scale * 0.5];
        }
        rt.activeInstanceId = race.course.zone;
        rt.renderer.setActiveInstance(race.course.zone);
        rt.resetPlayerInterpolation(true);
        rt.syncRender(0, performance.now());
        const meshes = race.racers.map((racer) => {
            const mesh = rt.renderer.shipMeshes.get(racer.id);
            const projection = mesh ? rt.renderer.projectToScreen(mesh.position) : null;
            return {
                id: racer.id,
                expected: racer.variant,
                actual: mesh?.userData?.variant,
                visible: mesh?.visible !== false,
                projection,
                scale: mesh?.scale?.toArray?.(),
            };
        });
        const radarRacers = rt.radarContacts().filter((contact) => contact.racer).length;
        const mapRacers = rt.buildNavigationMapModel().contacts.filter((contact) => contact.racer).length;
        return { state: race.state, meshes, radarRacers, mapRacers };
    })()`);
    check('actual opponent ships wait visibly at the gathering point', waiting.state === 'travel' && waiting.meshes.length === 3 && waiting.meshes.every((mesh) => mesh.visible && mesh.actual === mesh.expected && mesh.projection?.visible && !mesh.projection?.behind && mesh.scale?.every((value) => Number.isFinite(value) && value > 0)), waiting);
    check('waiting opponents are ordinary radar and map ship contacts', waiting.radarRacers === 3 && waiting.mapRacers === 3, waiting);

    const countdown = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const race = rt.activeRace;
        const racerIds = race.racers.map((racer) => racer.id).join(',');
        rt.save.player.position = [...race.course.gathering.position];
        rt.save.player.velocity = [0, 0, 0];
        rt.resetPlayerInterpolation(true);
        rt.updateSimulation(1 / 60, {});
        const visible = rt.renderer.raceGateMeshes.filter((mesh) => mesh.visible);
        const finish = visible.filter((mesh) => mesh.userData.finish);
        const mapGates = rt.buildNavigationMapModel().contacts.filter((contact) => contact.kind === 'gate');
        const radarGateStates = rt.radarContacts().filter((contact) => contact.type === 'racegate' && !contact.raceGathering && !contact.raceShortcut).map((contact) => contact.raceGate.state);
        return {
            state: rt.activeRace?.state,
            sameRacers: racerIds === rt.activeRace?.racers?.map((racer) => racer.id).join(','),
            target: rt.save.player.currentTargetId,
            firstGate: rt.activeRace?.course?.gates?.[0]?.id,
            visible: visible.length,
            expected: rt.activeRace?.course?.gates?.length,
            finishCount: finish.length,
            finishDoubleRing: finish[0]?.children?.[2]?.visible === true,
            nonFinishDoubleRings: visible.filter((mesh) => !mesh.userData.finish && mesh.children?.[2]?.visible).length,
            startVisible: Boolean(rt.renderer.raceStartRoot?.visible),
            mapGates: mapGates.length,
            radarGateStates,
        };
    })()`);
    check('arrival reuses the grid ships and reveals the full fixed course', countdown.state === 'countdown' && countdown.sameRacers && countdown.target === countdown.firstGate && countdown.visible === countdown.expected && !countdown.startVisible && countdown.mapGates === countdown.expected, countdown);
    check('radar shows only the next gate and the one after it', countdown.radarGateStates.length === 2 && countdown.radarGateStates[0] === 'next' && countdown.radarGateStates[1] === 'upcoming', countdown);
    check('only the finish gate receives the special double ring', countdown.finishCount === 1 && countdown.finishDoubleRing && countdown.nonFinishDoubleRings === 0, countdown);

    const go = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        rt.save.player.velocity = [40, 0, 0];
        rt.updateSimulation(1 / 60, {});
        const held = Math.hypot(...rt.save.player.velocity) < 1e-8;
        rt.save.world.time = rt.activeRace.startedAt + 0.01;
        rt.updateRace(1 / 60);
        const before = rt.activeRace.racers.map((racer) => [...racer.position]);
        for (let index = 0; index < 60; index += 1)
            rt.updateRace(1 / 60);
        const moved = rt.activeRace.racers.every((racer, index) => Math.hypot(racer.position[0] - before[index][0], racer.position[1] - before[index][1], racer.position[2] - before[index][2]) > 1);
        return { held, state: rt.activeRace.state, moved, paces: rt.activeRace.racers.map((racer) => racer.pace) };
    })()`);
    check('countdown holds the player, then all rivals race at track pace', go.held && go.state === 'running' && go.moved && go.paces.join(',') === '42,44,46', go);

    const fuel = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const gate = rt.activeRace.course.gates[0];
        const d = gate.direction;
        const before = gate.position.map((value, index) => value - d[index] * 2);
        const after = gate.position.map((value, index) => value + d[index] * 2);
        rt.save.player.fuel = 10;
        const centered = rt.raceAwardGate(gate, before, after);
        const once = rt.save.player.fuel;
        rt.raceAwardGate(gate, before, after);
        const twice = rt.save.player.fuel;
        return { centered, once, twice, reward: rt.activeRace.course.centerFuelReward };
    })()`);
    check('centered gates grant their small fuel reward exactly once', fuel.centered && Math.abs(fuel.once - (10 + fuel.reward)) < 1e-6 && fuel.twice === fuel.once, fuel);

    const draft = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const p = rt.save.player;
        const rival = rt.activeRace.racers[0];
        p.position = [1000, 1000, 1000];
        p.rotation = [0, 0, 0, 1];
        rival.position[0] = 1000; rival.position[1] = 1000; rival.position[2] = 950;
        rival.velocity[0] = 0; rival.velocity[1] = 0; rival.velocity[2] = -60;
        rt.updateRaceSlipstreamState(1 / 60);
        const aligned = { active: rt.activeRace.draft.active, strength: rt.activeRace.draft.strength, save: rt.activeRace.draft.savePercent, multiplier: rt.raceDraftFuelMultiplier };
        rival.velocity[2] = 60;
        rt.updateRaceSlipstreamState(1 / 60);
        const opposite = { active: rt.activeRace.draft.active, strength: rt.activeRace.draft.strength };
        return { aligned, opposite };
    })()`);
    check('drafting requires a same-direction rival and scales fuel savings', draft.aligned.active && draft.aligned.strength > 0.5 && draft.aligned.save > 0 && draft.aligned.save < 38 && draft.aligned.multiplier > 0.62 && draft.aligned.multiplier < 1 && !draft.opposite.active, draft);

    const shortcut = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const race = rt.activeRace;
        const route = race.course.shortcuts[0];
        rt.save.player.raceGateIndex = route.entryIndex;
        race.shortcut = undefined;
        rt.syncRaceCourse(race);
        const tight = route.gates.every((gate) => gate.radius >= 12 && gate.radius <= 16);
        const cross = (gate) => [
            gate.position.map((value, index) => value - gate.direction[index] * 2),
            gate.position.map((value, index) => value + gate.direction[index] * 2),
        ];
        let [before, after] = cross(route.gates[0]);
        const committed = rt.raceAdvanceMainGate(race, before, after, rt.save.world.time);
        const rendered = rt.renderer.raceShortcutMeshes.filter((mesh) => mesh.visible).length;
        while (race.shortcut?.committed) {
            const gate = race.shortcut.data.gates[race.shortcut.index];
            [before, after] = cross(gate);
            rt.raceAdvanceShortcut(race, before, after, rt.save.world.time += 0.2);
        }
        return { tight, committed, rendered, rejoined: rt.save.player.raceGateIndex, exitIndex: route.exitIndex, shortcutCleared: !race.shortcut };
    })()`);
    check('very tight optional shortcut commits, renders, and rejoins correctly', shortcut.tight && shortcut.committed && shortcut.rendered > 0 && shortcut.rejoined === shortcut.exitIndex && shortcut.shortcutCleared, shortcut);

    const firstFinish = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const race = rt.activeRace;
        const cross = (gate) => [
            gate.position.map((value, index) => value - gate.direction[index] * 2),
            gate.position.map((value, index) => value + gate.direction[index] * 2),
        ];
        while (rt.activeRace?.state === 'running') {
            const gate = race.course.gates[rt.save.player.raceGateIndex];
            if (!gate) break;
            const [before, after] = cross(gate);
            rt.save.world.time += 0.25;
            rt.raceAdvanceMainGate(race, before, after, rt.save.world.time);
        }
        const record = rt.save.world.raceRecords['shard-gauntlet'];
        const hud = rt.raceHud();
        return { state: race.state, hud, record, cleanupDelay: race.cleanupAt - rt.save.world.time, finishPulse: rt.renderer.raceGateMeshes.at(-1)?.userData?.pulseFinish };
    })()`);
    check('finish locks rank, payout, PB, splits, and readable result phase', firstFinish.state === 'finished' && firstFinish.hud?.phase === 'finished' && firstFinish.record?.active === false && firstFinish.record?.attempts === 1 && Number.isFinite(firstFinish.record?.bestTime) && firstFinish.cleanupDelay >= 4.9 && firstFinish.finishPulse === true, firstFinish);

    const resultHold = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        for (let index = 0; index < 240; index += 1) rt.updateSimulation(1 / 60, {});
        const held = rt.activeRace?.state === 'finished';
        for (let index = 0; index < 70; index += 1) rt.updateSimulation(1 / 60, {});
        return { held, cleared: !rt.activeRace && rt.ships.every((ship) => !ship.race) && rt.renderer.raceGateMeshes.every((mesh) => !mesh.visible) };
    })()`);
    check('finish presentation stays readable, then cleans the field', resultHold.held && resultHold.cleared, resultHold);

    const sixCourses = await evaluate(`(() => {
        const rt = window.__VOID_PRIVATEER__.getRuntime();
        const ids = ['shard-switchback', 'shard-miners-knife', 'mourning-run', 'mourning-breach', 'mourning-relict-gauntlet'];
        const results = [];
        const cross = (gate) => [
            gate.position.map((value, index) => value - gate.direction[index] * 2),
            gate.position.map((value, index) => value + gate.direction[index] * 2),
        ];
        for (const id of ids) {
            const origin = id.startsWith('shard-') ? 'helix' : 'rook';
            rt.save.player.dockedAt = origin;
            rt.save.player.credits = Math.max(rt.save.player.credits, 500000);
            rt.acceptRace(id);
            const race = rt.activeRace;
            if (!race || race.course.id !== id) {
                results.push({ id, accepted: false });
                continue;
            }
            const obstacles = rt.activeFieldObstacles(race.course.zone);
            const marked = [race.course.gathering, ...race.course.gates, ...race.course.shortcuts.flatMap((route) => route.gates)];
            const blocked = marked.filter((gate) => {
                rt.tmpA.set(gate.position[0], gate.position[1], gate.position[2]);
                return !rt.entryPositionClear(rt.tmpA, obstacles);
            }).map((gate) => gate.id);
            rt.activeInstanceId = race.course.zone;
            rt.renderer.setActiveInstance(race.course.zone);
            rt.startRaceAt(race.course);
            rt.save.world.time = race.startedAt + 0.01;
            rt.updateRace(0);
            while (rt.activeRace?.state === 'running') {
                const gate = race.course.gates[rt.save.player.raceGateIndex];
                if (!gate) break;
                const [before, after] = cross(gate);
                rt.save.world.time += 0.25;
                rt.raceAdvanceMainGate(race, before, after, rt.save.world.time);
            }
            const record = rt.save.world.raceRecords[id];
            results.push({ id, accepted: true, state: race.state, rank: record?.lastRank, attempts: record?.attempts, bestTime: record?.bestTime, blocked, finish: race.course.gates.at(-1).kind });
            rt.endRaceField();
        }
        return { results, records: rt.save.world.raceRecords };
    })()`);
    check('all six courses accept in progression order and finish end to end', sixCourses.results.length === 5 && sixCourses.results.every((result) => result.accepted && result.state === 'finished' && result.rank >= 1 && result.rank <= 4 && result.attempts === 1 && Number.isFinite(result.bestTime) && result.finish === 'finish'), sixCourses.results);
    check('every authored gathering/gate/shortcut marker is collision-clear', sixCourses.results.every((result) => result.blocked.length === 0), sixCourses.results.map((result) => ({ id: result.id, blocked: result.blocked })));
    const recordsClean = Object.values(sixCourses.records).every((record) => !('ghost' in record) && !('replay' in record) && !('champion' in record));
    check('records persist per course without replay or champion ghosts', Object.keys(sixCourses.records).length === 6 && recordsClean, sixCourses.records);

    const difficulty = await evaluate(`(() => {
        const records = window.__VOID_PRIVATEER__.getRuntime().save.world.raceRecords;
        return {
            shardIds: ['shard-gauntlet', 'shard-switchback', 'shard-miners-knife'].every((id) => Number.isFinite(records[id]?.bestTime)),
            mourningIds: ['mourning-run', 'mourning-breach', 'mourning-relict-gauntlet'].every((id) => Number.isFinite(records[id]?.bestTime)),
        };
    })()`);
    check('both three-course career ladders retain independent progress', difficulty.shardIds && difficulty.mourningIds, difficulty);

    await sleep(500);
    check('clean browser console', pageErrors.length === 0, pageErrors.slice(0, 8));
}
catch (error) {
    check('probe completed', false, error?.stack ?? String(error));
}
finally {
    await browser?.close();
    httpd?.kill();
}

if (FAILURES.length) {
    console.error(`\n${FAILURES.length} FAILURE(S)`);
    for (const failure of FAILURES)
        console.error(`- ${failure}`);
    process.exit(1);
}
console.log(`\nALL ${PASSES.length} RACING CHECKS PASSED`);
