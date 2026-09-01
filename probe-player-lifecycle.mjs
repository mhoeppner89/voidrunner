// Live browser regression for player damage/recovery and every missile rack.
// Run from the project root while the static server is available on :4173.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let chromium;
try {
    ({ chromium } = await import('playwright'));
}
catch {
    ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs'));
}

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const BASE_URL = process.env.VOIDRUNNER_BASE_URL ?? 'http://127.0.0.1:4173/';
const BASE_PORT = new URL(BASE_URL).port || '4173';
const QA_DIR = '/tmp/voidrunner-player-lifecycle';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const checks = [];
const errors = [];
const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const serverReady = async () => {
    try {
        return (await fetch(BASE_URL)).ok;
    }
    catch {
        return false;
    }
};
const ensureServer = async () => {
    if (await serverReady())
        return null;
    const server = spawn('python3', ['-m', 'http.server', BASE_PORT, '--bind', '127.0.0.1'], {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'ignore'],
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await serverReady())
            return server;
        await wait(100);
    }
    server.kill();
    throw new Error(`local server did not become ready on ${BASE_PORT}`);
};

let server;
let browser;
try {
    await mkdir(QA_DIR, { recursive: true });
    server = await ensureServer();
    browser = await chromium.launch({
        headless: true,
        args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error')
            errors.push(`console.error: ${message.text()}`);
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 15000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', undefined, { timeout: 15000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt == null, undefined, { timeout: 15000 });

    const layeredDamage = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const before = { shield: runtime.save.player.shield, hull: runtime.save.player.hull };
        runtime.damagePlayer(30, 'probe', false);
        return { before, after: { shield: runtime.save.player.shield, hull: runtime.save.player.hull } };
    });
    check('damage drains shields before hull', layeredDamage.after.shield === layeredDamage.before.shield - 30
        && layeredDamage.after.hull === layeredDamage.before.hull, JSON.stringify(layeredDamage));

    const destroyed = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        Object.assign(runtime.save.player, {
            credits: 10000,
            shield: 5,
            hull: 10,
            cargo: { water: 10 },
            sealedCargo: [{ missionId: 'probe-delivery', label: 'Probe cargo', units: 2, mass: 1 }],
            lastDockedAt: 'helix',
        });
        runtime.save.activeMissions = [
            { id: 'probe-delivery', kind: 'delivery', status: 'active' },
            { id: 'probe-bounty', kind: 'bounty', status: 'active' },
        ];
        runtime.save.world.failedMissionIds = [];
        runtime.damagePlayer(20, 'probe collision', false);
        return { hull: runtime.save.player.hull, deathTimer: runtime.deathTimer, dockedAt: runtime.save.player.dockedAt };
    });
    check('lethal damage enters the timed loss state', destroyed.hull === 0 && destroyed.deathTimer > 2 && destroyed.dockedAt == null, JSON.stringify(destroyed));

    const recovered = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        for (let step = 0; step < 140; step += 1)
            runtime.updateSimulation(1 / 60, {});
        return {
            dockedAt: runtime.save.player.dockedAt,
            systemId: runtime.save.player.systemId,
            credits: runtime.save.player.credits,
            cargo: runtime.save.player.cargo,
            sealedCargo: runtime.save.player.sealedCargo,
            activeMissions: runtime.save.activeMissions,
            failedMissionIds: runtime.save.world.failedMissionIds,
            shield: runtime.save.player.shield,
            hull: runtime.save.player.hull,
            fuel: runtime.save.player.fuel,
            missiles: runtime.save.player.missiles,
            dockVisible: !document.querySelector('#dock-screen')?.classList.contains('is-hidden'),
            hudHidden: document.querySelector('#hud')?.classList.contains('is-hidden'),
        };
    });
    check('career loss tows the player to the last dock', recovered.dockedAt === 'helix'
        && recovered.systemId === 'helios-verge' && recovered.dockVisible && recovered.hudHidden, JSON.stringify(recovered));
    check('career loss applies the stated financial and cargo penalty', recovered.credits === 8500
        && recovered.cargo.water === 3 && recovered.sealedCargo.length === 0, JSON.stringify(recovered));
    check('career loss fails active contracts once', recovered.activeMissions.length === 0
        && recovered.failedMissionIds.includes('probe-delivery')
        && recovered.failedMissionIds.includes('probe-bounty'), JSON.stringify(recovered.failedMissionIds));
    check('career recovery leaves a damaged but usable hull', recovered.shield === 0
        && Math.abs(recovered.hull - 64.75) < 0.001 && recovered.fuel === 35 && recovered.missiles === 0, JSON.stringify(recovered));
    await page.screenshot({ path: `${QA_DIR}/career-recovery.png`, fullPage: true });

    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('open', '1v1', 'rookie'));
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getRuntime()?.ships?.length === 1, undefined, { timeout: 15000 });
    const arenaReset = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.player.shield = 0;
        runtime.save.player.hull = 1;
        runtime.damagePlayer(5, 'arena probe', false);
        for (let step = 0; step < 140; step += 1)
            runtime.updateSimulation(1 / 60, {});
        const stats = runtime.playerStats();
        return {
            dockedAt: runtime.save.player.dockedAt,
            deathTimer: runtime.deathTimer,
            hostileCount: runtime.ships.filter((ship) => ship.hostile && ship.hull > 0).length,
            shield: runtime.save.player.shield,
            hull: runtime.save.player.hull,
            energy: runtime.save.player.energy,
            missiles: runtime.save.player.missiles,
            expected: { shield: stats.shield, hull: stats.hull, energy: stats.energyCapacity, missiles: stats.missileCapacity },
        };
    });
    check('arena death resets the same sortie instead of docking', arenaReset.dockedAt == null
        && arenaReset.deathTimer === 0 && arenaReset.hostileCount === 1, JSON.stringify(arenaReset));
    check('arena reset fully reloads combat resources', arenaReset.shield === arenaReset.expected.shield
        && arenaReset.hull === arenaReset.expected.hull
        && arenaReset.energy === arenaReset.expected.energy
        && arenaReset.missiles === arenaReset.expected.missiles, JSON.stringify(arenaReset));

    const runLauncher = async (itemId, expectedVolley, splash = false) => {
        await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('open', '1v2', 'rookie'));
        await page.waitForFunction(() => window.__VOID_PRIVATEER__.getRuntime()?.ships?.length === 2, undefined, { timeout: 15000 });
        const fired = await page.evaluate(async ({ itemId: launcherItem, splash: splashTest }) => {
            const runtime = window.__VOID_PRIVATEER__.getRuntime();
            const { createOutfittingState } = await import('/src/game/outfitting.js');
            const { normalizeLauncherMagazines } = await import('/src/game/weapons.js');
            const player = runtime.save.player;
            player.shipId = 'vanguard';
            player.outfitting = createOutfittingState(['vanguard']);
            player.outfitting.loadouts.vanguard.launchers[0] = launcherItem;
            player.launcherMagazines = {};
            player.activeLauncherMountId = null;
            normalizeLauncherMagazines(player, { legacyMissiles: 12 });
            player.mode = 'combat';
            player.position = [0, 0, 0];
            player.velocity = [0, 0, 0];
            player.rotation = [0, 0, 0, 1];
            runtime.missileCooldown = 0;
            const [target, nearby] = runtime.ships;
            target.position = [0, 0, -48];
            target.velocity = [0, 0, 0];
            target.shield = 0;
            target.hull = 240;
            // Keep the second hull close to the target's centre. The blast is
            // measured from the impact point on the target's rotated hull,
            // not from its centre, so a wider lateral offset can sit outside
            // the authored 20-unit torpedo radius even when the centres look
            // close enough.
            nearby.position = [splashTest ? 2 : 80, 0, -48];
            nearby.velocity = [0, 0, 0];
            nearby.shield = 0;
            nearby.hull = 240;
            player.currentTargetId = target.id;
            const before = { target: target.hull, nearby: nearby.hull, missiles: player.missiles };
            runtime.fireMissile();
            runtime.syncRender(0, performance.now());
            return {
                before,
                projectiles: runtime.projectiles.filter((projectile) => projectile.kind === 'missile').map((projectile) => ({
                    launcherId: projectile.launcherId,
                    damage: projectile.damage,
                    splashRadius: projectile.splashRadius ?? 0,
                })),
            };
        }, { itemId, splash });
        if (itemId === 'swarm-launcher') {
            await wait(120);
            await page.screenshot({ path: `${QA_DIR}/swarm-volley.png`, fullPage: true });
        }
        const impact = await page.evaluate(() => {
            const runtime = window.__VOID_PRIVATEER__.getRuntime();
            const targetId = runtime.save.player.currentTargetId;
            const target = runtime.ships.find((ship) => ship.id === targetId);
            const nearby = runtime.ships.find((ship) => ship.id !== targetId);
            const before = { target: target.hull, nearby: nearby.hull };
            for (let step = 0; step < 720 && target.hull === before.target; step += 1) {
                runtime.save.world.time += 1 / 60;
                runtime.updateProjectiles(1 / 60);
            }
            return {
                targetBefore: before.target,
                targetAfter: target.hull,
                nearbyBefore: before.nearby,
                nearbyAfter: nearby.hull,
                missilesLeft: runtime.save.player.missiles,
            };
        });
        return { fired, impact };
    };

    for (const scenario of [
        { itemId: 'seeker-launcher', launcherId: 'seeker', volley: 1, splash: false },
        { itemId: 'swarm-launcher', launcherId: 'swarm', volley: 4, splash: false },
        { itemId: 'torpedo-launcher', launcherId: 'torpedo', volley: 1, splash: true },
    ]) {
        const result = await runLauncher(scenario.itemId, scenario.volley, scenario.splash);
        check(`${scenario.launcherId} rack fires its authored volley`, result.fired.projectiles.length === scenario.volley
            && result.fired.projectiles.every((projectile) => projectile.launcherId === scenario.launcherId), JSON.stringify(result.fired));
        check(`${scenario.launcherId} volley consumes one rack round`, result.impact.missilesLeft === result.fired.before.missiles - 1, JSON.stringify(result.impact));
        check(`${scenario.launcherId} missiles home into the locked ship`, result.impact.targetAfter < result.fired.before.target, JSON.stringify(result.impact));
        if (scenario.splash)
            check('torpedo splash damages a nearby second hull', result.impact.nearbyAfter < result.fired.before.nearby, JSON.stringify(result.impact));
    }

    // A mixed Lancer fit must fire only the selected physical rack. Cycling
    // changes the ordnance; it must not spend or convert the other magazine.
    await page.evaluate(() => window.__VOID_PRIVATEER__.startArena('open', '1v2', 'rookie'));
    await page.waitForFunction(() => window.__VOID_PRIVATEER__.getRuntime()?.ships?.length === 2, undefined, { timeout: 15000 });
    const selectedLaunchers = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { createOutfittingState } = await import('/src/game/outfitting.js');
        const { launcherMagazineEntries, normalizeLauncherMagazines } = await import('/src/game/weapons.js');
        const player = runtime.save.player;
        player.shipId = 'lancer';
        player.outfitting = createOutfittingState(['lancer']);
        player.outfitting.loadouts.lancer.launchers = ['swarm-launcher', 'torpedo-launcher'];
        player.launcherMagazines = {};
        player.activeLauncherMountId = null;
        normalizeLauncherMagazines(player, { fill: true });
        player.mode = 'combat';
        player.position = [0, 0, 0];
        player.velocity = [0, 0, 0];
        player.rotation = [0, 0, 0, 1];
        const target = runtime.ships[0];
        target.position = [0, 0, -80];
        target.velocity = [0, 0, 0];
        target.hull = 240;
        player.currentTargetId = target.id;
        runtime.missileCooldown = 0;
        const projectileStart = runtime.projectiles.length;
        runtime.fireMissile();
        const firstVolley = runtime.projectiles.slice(projectileStart).map((projectile) => ({
            launcherId: projectile.launcherId,
            ordnanceId: projectile.ordnanceId,
            mountId: projectile.mountId,
        }));
        const afterFirst = launcherMagazineEntries(player).map((entry) => ({
            launcherId: entry.launcherId, rounds: entry.rounds, selected: entry.selected,
        }));
        runtime.missileCooldown = 0;
        runtime.cycleLauncher();
        const secondStart = runtime.projectiles.length;
        runtime.fireMissile();
        const secondVolley = runtime.projectiles.slice(secondStart).map((projectile) => ({
            launcherId: projectile.launcherId,
            ordnanceId: projectile.ordnanceId,
            mountId: projectile.mountId,
        }));
        const afterSecond = launcherMagazineEntries(player).map((entry) => ({
            launcherId: entry.launcherId, rounds: entry.rounds, selected: entry.selected,
        }));
        return { firstVolley, afterFirst, secondVolley, afterSecond, total: player.missiles };
    });
    check('selected swarm rack fires alone', selectedLaunchers.firstVolley.length === 4
        && selectedLaunchers.firstVolley.every((round) => round.launcherId === 'swarm' && round.ordnanceId === 'swarm-canister')
        && selectedLaunchers.afterFirst[0].rounds === 11
        && selectedLaunchers.afterFirst[1].rounds === 2, JSON.stringify(selectedLaunchers));
    check('launcher cycle selects and spends only the torpedo magazine', selectedLaunchers.secondVolley.length === 1
        && selectedLaunchers.secondVolley[0].launcherId === 'torpedo'
        && selectedLaunchers.secondVolley[0].ordnanceId === 'heavy-torpedo'
        && selectedLaunchers.afterSecond[0].rounds === 11
        && selectedLaunchers.afterSecond[1].rounds === 1
        && selectedLaunchers.afterSecond[1].selected
        && selectedLaunchers.total === 12, JSON.stringify(selectedLaunchers));

    check('browser console remains clean', errors.length === 0, errors.join(' | '));
}
catch (error) {
    errors.push(error.stack || error.message);
    console.error(error);
}
finally {
    await browser?.close().catch(() => undefined);
    server?.kill();
}

const failures = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failures.length}/${checks.length} player lifecycle checks passed`);
if (errors.length && !checks.some((entry) => entry.name === 'browser console remains clean'))
    console.error(errors.join('\n'));
if (failures.length || errors.length)
    process.exitCode = 1;
