#!/usr/bin/env node

/*
 * Live-browser regression for the six player hulls and the outfitting model.
 *
 * This is deliberately a bounded matrix: every hull is commissioned once,
 * every catalog item is installed once at a legal dock, and each weapon class
 * is fired from its mounted hardpoint.  The probe owns no production fixtures;
 * it only resets disposable career sessions through the existing debug hooks.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let chromium;
try {
    ({ chromium } = await import('playwright'));
}
catch {
    ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs'));
}

const ROOT = '/Users/mhoeppner/Desktop/Voidrunner';
const BASE_URL = process.env.VOIDRUNNER_BASE_URL || 'http://127.0.0.1:4173/';
const HTTP_PORT = new URL(BASE_URL).port || '4173';
const CDP_PORT = 9349;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_PREFIX = join(tmpdir(), 'vr-fleet-loadouts-');
const SHOT_SMALL = '/private/tmp/voidrunner-fleet-talon.png';
const SHOT_LARGE = '/private/tmp/voidrunner-fleet-atlas.png';

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const networkErrors = [];
const seenNetworkErrors = new Set();

const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const serverReady = async () => {
    try {
        return (await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) })).ok;
    }
    catch {
        return false;
    }
};

const ensureServer = async () => {
    if (await serverReady())
        return null;
    const server = spawn('python3', ['-m', 'http.server', HTTP_PORT, '--bind', '127.0.0.1'], {
        cwd: ROOT,
        stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await serverReady())
            return server;
        await wait(150);
    }
    server.kill();
    throw new Error(`local server did not become ready at ${BASE_URL}`);
};

const cdpReady = async () => {
    try {
        return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
            signal: AbortSignal.timeout(500),
        })).ok;
    }
    catch {
        return false;
    }
};

const waitForCdp = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await cdpReady())
            return;
        await wait(100);
    }
    throw new Error(`headless Chrome did not expose CDP on port ${CDP_PORT}`);
};

const finite = (value) => Number.isFinite(Number(value));
const finiteStats = (stats) => Object.entries(stats ?? {})
    .filter(([key]) => ['maxSpeed', 'afterburnSpeed', 'acceleration', 'angularAcceleration', 'shield', 'hull', 'reactorOutput', 'energyCapacity', 'cargo', 'fuel', 'missileCapacity', 'gunDamage', 'radarRange', 'scanRange', 'miningRange', 'miningRate', 'salvageRate', 'salvageRange'].includes(key))
    .every(([, value]) => finite(value));

let server;
let chrome;
let browser;
let page;
let profile;

const appUrl = (label) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('fleet-loadouts', `${label}-${Date.now()}`);
    return url.href;
};

const stopRuntime = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime)
        return false;
    if (runtime.frameId !== undefined)
        cancelAnimationFrame(runtime.frameId);
    runtime.active = false;
    runtime.simAccumulator = 0;
    runtime.lastFrame = performance.now();
    return true;
});

const waitForRuntime = async () => {
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.getRuntime?.()?.renderer), undefined, {
        timeout: 60000,
    });
};

const bootCareer = async (label) => {
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await waitForRuntime();
    await page.waitForTimeout(180);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.ui?.dismissStory?.());
    await stopRuntime();
    return label;
};

const configureDock = async (dock) => page.evaluate(async (locationId) => {
    const { LOCATIONS } = await import('/src/game/data.js');
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    if (!runtime || !LOCATIONS[locationId])
        throw new Error(`missing dock ${locationId}`);
    const player = runtime.save.player;
    player.dockedAt = locationId;
    player.lastDockedAt = locationId;
    player.systemId = LOCATIONS[locationId].systemId;
    player.position = [...LOCATIONS[locationId].position];
    player.velocity = [0, 0, 0];
    player.angularVelocity = [0, 0, 0];
    player.throttle = 0;
    player.cargo = {};
    player.sealedCargo = [];
    player.credits = Math.max(1000000, Number(player.credits) || 0);
    player.guildRank = { merchant: 2, bounty: 2, mining: 2, salvage: 2, syndicate: 2 };
    player.guildRep = { merchant: 2, bounty: 2, mining: 2, salvage: 2, syndicate: 2 };
    return {
        dock: locationId,
        services: { ...(LOCATIONS[locationId].services ?? {}) },
        systemId: player.systemId,
    };
}, dock);

const commissionHull = async (hull, dock) => page.evaluate(({ targetHull, targetDock }) => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const player = runtime.save.player;
    const purchase = targetHull === 'wayfarer'
        ? { ok: true, code: 'starter' }
        : runtime.buyShip(targetHull);
    const stats = runtime.playerStats();
    const loadout = player.outfitting?.loadouts?.[targetHull];
    const installed = [
        ...(loadout?.guns ?? []),
        ...(loadout?.launchers ?? []),
        ...(loadout?.drive ? [loadout.drive] : []),
        ...(loadout?.defense ? [loadout.defense] : []),
        ...(loadout?.utility ?? []),
    ].filter(Boolean);
    const factory = ['pulse-cannon', 'gauss-cannon', 'seeker-launcher'].every((id) => installed.includes(id));
    const finiteValues = Object.values(stats).filter((value) => typeof value === 'number');
    const beforePosition = [...player.position];
    const beforeRotation = [...player.rotation];
    const beforeShield = stats.shield;
    const beforeHull = stats.hull;
    const radius = runtime.playerCollisionRadius();
    const extents = runtime.playerHullExtents();
    const spawnClearance = runtime.playerSpawnClearance();
    const factoryQuote = runtime.previewOutfitting(targetHull, loadout, { locationId: targetDock });
    runtime.launch();
    // Move the disposable test craft to an empty system coordinate after the
    // real launch path has mounted the cockpit and left the dock.
    player.position = [0, 0, 0];
    player.velocity = [0, 0, 0];
    player.angularVelocity = [0, 0, 0];
    player.rotation = [0, 0, 0, 1];
    player.throttle = 0;
    player.mode = 'combat';
    runtime.activeInstanceId = undefined;
    runtime.renderer.setActiveInstance?.(undefined);
    runtime.resetPlayerInterpolation?.(true);
    const flightStart = [...player.position];
    const flightRotation = [...player.rotation];
    const energyBefore = player.energy;
    runtime.damagePlayer(12, 'fleet-loadout probe', false);
    const damageTaken = {
        shield: beforeShield - player.shield,
        hull: beforeHull - player.hull,
        total: energyBefore - energyBefore + beforeShield + beforeHull - player.shield - player.hull,
    };
    player.shield = stats.shield;
    player.hull = stats.hull;
    for (let index = 0; index < 90; index += 1) {
        runtime.updateSimulation(1 / 60, {
            throttleSet: 0.7,
            throttleDelta: 0,
            pitch: 0.35,
            yaw: 0.25,
            roll: 0.2,
            afterburner: false,
            fire: false,
            utility: false,
            missile: false,
            targetNext: false,
            targetNearestHostile: false,
            cycleMode: false,
            navNext: false,
            autopilot: false,
            scan: false,
            pause: false,
            map: false,
            capture: false,
            jettison: false,
            transponder: false,
            weaponCycle: false,
        });
    }
    runtime.syncRender(0, performance.now());
    const cockpitArt = runtime.ui?.el?.('.cockpit-art');
    const afterPosition = [...player.position];
    const afterRotation = [...player.rotation];
    const displacement = Math.hypot(afterPosition[0] - flightStart[0], afterPosition[1] - flightStart[1], afterPosition[2] - flightStart[2]);
    const rotationDelta = Math.hypot(afterRotation[0] - flightRotation[0], afterRotation[1] - flightRotation[1], afterRotation[2] - flightRotation[2], afterRotation[3] - flightRotation[3]);
    const statsFinite = finiteValues.every(Number.isFinite);
    return {
        hull: targetHull,
        purchase,
        shipId: player.shipId,
        ownedShips: [...player.ownedShips],
        factory,
        loadout,
        factoryQuote: { ok: factoryQuote?.ok, code: factoryQuote?.code, usage: factoryQuote?.usage },
        stats,
        statsFinite,
        cockpit: {
            dataset: runtime.ui?.root?.dataset?.cockpitShip ?? null,
            backgroundImage: cockpitArt?.style?.backgroundImage ?? '',
        },
        launch: {
            dockedAt: player.dockedAt ?? null,
            activeInstance: runtime.activeInstanceId ?? null,
            positionFinite: player.position.every(Number.isFinite),
            rotationFinite: player.rotation.every(Number.isFinite),
        },
        flight: {
            displacement,
            speed: Math.hypot(...player.velocity),
            rotationDelta,
            throttle: player.throttle,
        },
        collision: {
            radius,
            extents,
            spawnClearance,
        },
        damage: damageTaken,
        probeStart: { beforePosition, beforeRotation },
    };
}, { targetHull: hull, targetDock: dock });

const installItem = async ({ id, hull, dock }) => {
    await bootCareer(`item-${id}`);
    await configureDock(dock);
    return page.evaluate(async ({ itemId, targetHull, targetDock }) => {
        const [{ OUTFIT_ITEMS, outfittingUsage }, { AMMO_CAPACITY, LAUNCHERS, WEAPONS, launcherIdForOutfit, weaponIdForOutfit }] = await Promise.all([
            import('/src/game/outfitting.js'),
            import('/src/game/weapons.js'),
        ]);
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const player = runtime.save.player;
        const purchase = targetHull === 'wayfarer' ? { ok: true, code: 'starter' } : runtime.buyShip(targetHull);
        const before = JSON.parse(JSON.stringify(player.outfitting.loadouts[targetHull]));
        const result = runtime.buyEquipment(itemId);
        const after = JSON.parse(JSON.stringify(player.outfitting.loadouts[targetHull]));
        const category = OUTFIT_ITEMS[itemId].category === 'gun'
            ? 'guns'
            : OUTFIT_ITEMS[itemId].category === 'launcher'
                ? 'launchers'
                : OUTFIT_ITEMS[itemId].category;
        const beforeSlots = before[category] ?? [];
        const afterSlots = after[category] ?? [];
        const installedIndex = afterSlots.findIndex((value, index) => value === itemId && beforeSlots[index] !== itemId);
        const stats = runtime.playerStats();
        let usage = outfittingUsage(player, targetHull, after);
        const expectedWeaponId = OUTFIT_ITEMS[itemId].category === 'gun' ? weaponIdForOutfit(itemId) : null;
        const expectedLauncherId = OUTFIT_ITEMS[itemId].category === 'launcher' ? launcherIdForOutfit(itemId) : null;
        const weapon = expectedWeaponId ? WEAPONS[expectedWeaponId] : null;
        const launcher = expectedLauncherId ? LAUNCHERS[expectedLauncherId] : null;
        const firing = { attempted: false, count: 0, matching: 0, kinds: [], weaponIds: [], ammoSpent: {}, energySpent: 0, expectedEnergy: 0, expectedAmmoId: weapon?.ammoId ?? null, expectedLauncher: launcher?.id ?? null };
        if (result?.ok && installedIndex >= 0 && (OUTFIT_ITEMS[itemId].category === 'gun' || OUTFIT_ITEMS[itemId].category === 'launcher')) {
            runtime.launch();
            player.position = [0, 0, 0];
            player.velocity = [0, 0, 0];
            player.angularVelocity = [0, 0, 0];
            player.rotation = [0, 0, 0, 1];
            player.throttle = 0;
            player.mode = 'combat';
            runtime.activeInstanceId = undefined;
            runtime.renderer.setActiveInstance?.(undefined);
            runtime.resetPlayerInterpolation?.(true);
            if (OUTFIT_ITEMS[itemId].category === 'gun') {
                after[category].forEach((value, index) => {
                    const mountId = `${targetHull}-gun-${index}`;
                    after.fireGroups.assignments[mountId] = index === installedIndex ? 'A' : 'B';
                });
                after.fireGroups.activeGroup = 'A';
                player.outfitting.loadouts[targetHull] = after;
                usage = outfittingUsage(player, targetHull, after);
                runtime.syncWeaponProjection();
                player.ammo = Object.fromEntries(Object.entries(AMMO_CAPACITY).map(([ammoId, capacity]) => [ammoId, capacity]));
                player.energy = stats.energyCapacity;
                runtime.gunCooldown = 0;
                runtime.pdcHeat = 0;
                runtime.pdcVentUntil = 0;
                const beforeAmmo = { ...player.ammo };
                const beforeEnergy = player.energy;
                const beforeCounter = runtime.projectileCounter;
                runtime.firePlayerGuns();
                const fresh = runtime.projectiles.filter((projectile) => Number(projectile.id.slice(2)) > beforeCounter);
                const matching = fresh.filter((projectile) => projectile.weaponId === expectedWeaponId);
                firing.attempted = true;
                firing.count = fresh.length;
                firing.matching = matching.length;
                firing.kinds = matching.map((projectile) => projectile.kind);
                firing.weaponIds = matching.map((projectile) => projectile.weaponId);
                firing.ammoSpent = Object.fromEntries(Object.keys(AMMO_CAPACITY).map((ammoId) => [ammoId, beforeAmmo[ammoId] - (player.ammo[ammoId] ?? 0)]));
                firing.energySpent = beforeEnergy - player.energy;
                firing.expectedEnergy = usage.energyPerVolley.A;
            }
            else {
                const target = runtime.spawnShip('pirate', [0, 0, -120], undefined, `fleet-target-${itemId}`);
                runtime.selectTarget('ship', target.id);
                player.missiles = stats.missileCapacity;
                runtime.missileCooldown = 0;
                const beforeMissiles = player.missiles;
                const beforeCounter = runtime.projectileCounter;
                runtime.fireMissile();
                const fresh = runtime.projectiles.filter((projectile) => Number(projectile.id.slice(2)) > beforeCounter);
                const matching = fresh.filter((projectile) => projectile.launcherId === expectedLauncherId);
                firing.attempted = true;
                firing.count = fresh.length;
                firing.matching = matching.length;
                firing.kinds = matching.map((projectile) => projectile.kind);
                firing.weaponIds = matching.map((projectile) => projectile.launcherId);
                firing.ammoSpent = { missiles: beforeMissiles - player.missiles };
                firing.energySpent = 0;
                firing.expectedEnergy = 0;
            }
        }
        const finiteValues = Object.values(stats).filter((value) => typeof value === 'number');
        return {
            itemId,
            category,
            hull: targetHull,
            dock: targetDock,
            purchase,
            result: result ? { ok: result.ok, code: result.code } : result,
            installedIndex,
            before,
            after,
            usage,
            stats,
            statsFinite: finiteValues.every(Number.isFinite),
            item: OUTFIT_ITEMS[itemId],
            firing,
        };
    }, { itemId: id, targetHull: hull, targetDock: dock });
};

const groupProbe = async () => {
    await bootCareer('fire-groups');
    await configureDock('rook');
    return page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const player = runtime.save.player;
        const purchase = runtime.buyShip('vanguard');
        const loadout = player.outfitting.loadouts.vanguard;
        const populated = loadout.guns.map((id, index) => id ? index : -1).filter((index) => index >= 0);
        if (populated.length < 2)
            throw new Error('vanguard factory fit did not provide two gun mounts');
        const [first, second] = populated;
        loadout.guns.forEach((id, index) => {
            loadout.fireGroups.assignments[`vanguard-gun-${index}`] = index === second ? 'B' : index === first ? 'A' : 'B';
        });
        loadout.fireGroups.activeGroup = 'A';
        runtime.launch();
        player.position = [0, 0, 0];
        player.velocity = [0, 0, 0];
        player.angularVelocity = [0, 0, 0];
        player.rotation = [0, 0, 0, 1];
        player.throttle = 0;
        player.mode = 'combat';
        runtime.activeInstanceId = undefined;
        runtime.renderer.setActiveInstance?.(undefined);
        runtime.resetPlayerInterpolation?.(true);
        player.ammo = { slugs: 48, shells: 36, cells: 60, pods: 10 };
        const fire = (group) => {
            runtime.switchWeapon(group);
            runtime.gunCooldown = 0;
            player.energy = runtime.playerStats().energyCapacity;
            const beforeCounter = runtime.projectileCounter;
            runtime.firePlayerGuns();
            const fresh = runtime.projectiles.filter((projectile) => Number(projectile.id.slice(2)) > beforeCounter);
            return {
                active: runtime.activeFireGroup(),
                weapon: player.weaponId,
                projectiles: fresh.map((projectile) => ({ kind: projectile.kind, weaponId: projectile.weaponId })),
            };
        };
        const a = fire('A');
        const b = fire('B');
        const backToA = runtime.switchWeapon('A');
        return {
            purchase,
            populated,
            guns: [...loadout.guns],
            a,
            b,
            finalGroup: runtime.activeFireGroup(),
            finalWeapon: player.weaponId,
            backToA,
        };
    });
};

const invalidDraftProbe = async () => {
    await bootCareer('invalid-drafts');
    await configureDock('rook');
    return page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const player = runtime.save.player;
        const purchase = runtime.buyShip('lancer');
        const baseline = JSON.parse(JSON.stringify(player.outfitting.loadouts.lancer));
        const unknownDraft = JSON.parse(JSON.stringify(baseline));
        unknownDraft.guns[0] = 'not-a-module';
        const incompatibleDraft = JSON.parse(JSON.stringify(baseline));
        incompatibleDraft.guns[0] = 'seeker-launcher';
        const massDraft = {
            guns: ['mortar', 'mortar', 'mortar'],
            launchers: ['torpedo-launcher', 'torpedo-launcher'],
            drive: ['thrusters-mk2'],
            defense: ['shield-mk2'],
            fireGroups: { activeGroup: 'A', assignments: {} },
        };
        const unknown = runtime.previewOutfitting('lancer', unknownDraft, { locationId: 'rook' });
        const incompatible = runtime.previewOutfitting('lancer', incompatibleDraft, { locationId: 'rook' });
        const overBudget = runtime.previewOutfitting('lancer', massDraft, { locationId: 'rook' });
        const cargo = runtime.previewOutfitting('lancer', baseline, { locationId: 'rook', cargoMass: 9999 });
        const staleDraft = JSON.parse(JSON.stringify(baseline));
        staleDraft.guns[2] = 'pulse-mk2';
        const quote = runtime.previewOutfitting('lancer', staleDraft, { locationId: 'rook' });
        const creditsBefore = player.credits;
        player.credits -= 1;
        const stale = runtime.applyOutfitting('lancer', quote);
        return {
            purchase,
            codes: {
                unknown: unknown?.code,
                incompatible: incompatible?.code,
                overBudget: overBudget?.code,
                cargo: cargo?.code,
                stale: stale?.code,
            },
            errors: {
                unknown: unknown?.errors,
                incompatible: incompatible?.errors,
                overBudget: overBudget?.errors,
                cargo: cargo?.errors,
            },
            creditsBefore,
            creditsAfter: player.credits,
            unchangedLoadout: JSON.stringify(player.outfitting.loadouts.lancer) === JSON.stringify(baseline),
        };
    });
};

const persistenceProbe = async () => {
    await bootCareer('save-load');
    await configureDock('rook');
    const before = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const player = runtime.save.player;
        const purchase = runtime.buyShip('vanguard');
        const moduleResult = runtime.buyEquipment('pdc');
        const loadout = player.outfitting.loadouts.vanguard;
        const populated = loadout.guns.map((id, index) => id ? index : -1).filter((index) => index >= 0);
        const first = populated[0];
        const second = populated[1];
        loadout.fireGroups.assignments[`vanguard-gun-${first}`] = 'A';
        loadout.fireGroups.assignments[`vanguard-gun-${second}`] = 'B';
        loadout.fireGroups.activeGroup = 'B';
        runtime.syncWeaponProjection();
        runtime.saveNow();
        return {
            purchase,
            moduleResult,
            shipId: player.shipId,
            credits: player.credits,
            loadout: JSON.parse(JSON.stringify(loadout)),
            activeGroup: loadout.fireGroups.activeGroup,
            weaponId: player.weaponId,
            rawSave: Boolean(window.localStorage.getItem('void-privateer-save-v1')),
        };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.resume());
    await waitForRuntime();
    await page.waitForTimeout(180);
    await stopRuntime();
    const after = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const player = runtime.save.player;
        const loadout = player.outfitting.loadouts[player.shipId];
        return {
            shipId: player.shipId,
            credits: player.credits,
            dockedAt: player.dockedAt,
            loadout: JSON.parse(JSON.stringify(loadout)),
            activeGroup: loadout.fireGroups.activeGroup,
            weaponId: player.weaponId,
        };
    });
    return { before, after };
};

try {
    server = await ensureServer();
    if (await cdpReady())
        throw new Error(`CDP port ${CDP_PORT} is already occupied; refusing to attach to an unknown browser`);
    profile = mkdtempSync(PROFILE_PREFIX);
    chrome = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,720',
        'about:blank',
    ], { cwd: ROOT, stdio: 'ignore' });
    await waitForCdp();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const context = browser.contexts()[0];
    page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('console', (message) => {
        if (message.type() === 'error')
            consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)));
    page.on('requestfailed', (request) => {
        const entry = `${request.url()} :: ${request.failure()?.errorText || 'unknown request failure'}`;
        if (!seenNetworkErrors.has(entry)) {
            seenNetworkErrors.add(entry);
            networkErrors.push(entry);
        }
    });
    page.on('response', (response) => {
        if (response.status() < 400)
            return;
        const entry = `${response.status()} ${response.url()}`;
        if (!seenNetworkErrors.has(entry)) {
            seenNetworkErrors.add(entry);
            networkErrors.push(entry);
        }
    });
    await page.goto(appUrl('boot'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 30000 });

    const registry = await page.evaluate(async () => {
        const [{ SHIPS }, { HULL_HARDPOINTS, OUTFIT_ITEMS, OUTFIT_ITEM_IDS }] = await Promise.all([
            import('/src/game/data.js'),
            import('/src/game/outfitting.js'),
        ]);
        return {
            hulls: Object.keys(SHIPS),
            hardpoints: HULL_HARDPOINTS,
            itemIds: [...OUTFIT_ITEM_IDS],
            items: OUTFIT_ITEMS,
        };
    });
    const expectedHulls = ['wayfarer', 'talon', 'vanguard', 'prospector', 'lancer', 'atlas'];
    check('catalog exposes all six player hulls and all eighteen outfitting items',
        expectedHulls.every((id) => registry.hulls.includes(id)) && registry.itemIds.length === 18,
        JSON.stringify({ hulls: registry.hulls, itemCount: registry.itemIds.length }));

    const hullCases = [
        { hull: 'wayfarer', dock: 'helix' },
        { hull: 'talon', dock: 'helix' },
        { hull: 'vanguard', dock: 'rook' },
        { hull: 'prospector', dock: 'vesper' },
        { hull: 'lancer', dock: 'rook' },
        { hull: 'atlas', dock: 'helix' },
    ];
    const hullResults = {};
    for (const item of hullCases) {
        await bootCareer(`hull-${item.hull}`);
        await configureDock(item.dock);
        hullResults[item.hull] = await commissionHull(item.hull, item.dock);
        const result = hullResults[item.hull];
        const cockpitLoaded = result.cockpit.dataset === item.hull
            && /cockpit-(frame|talon|vanguard|prospector|lancer|atlas)/.test(result.cockpit.backgroundImage);
        const collisionGood = finite(result.collision.radius)
            && result.collision.radius > 0
            && Array.isArray(result.collision.extents)
            && result.collision.extents.length === 3
            && result.collision.extents.every((value) => finite(value) && value > 0)
            && finite(result.collision.spawnClearance)
            && result.collision.spawnClearance > 0;
        const flightGood = result.launch.dockedAt === null
            && result.launch.positionFinite
            && result.launch.rotationFinite
            && result.flight.displacement > 0.1
            && result.flight.speed > 0.1
            && result.flight.rotationDelta > 0.001;
        const damageGood = result.damage.total > 0 && result.damage.shield >= 0 && result.damage.hull >= 0;
        const quoteGood = result.factoryQuote.ok === true
            && (result.factoryQuote.usage?.massRemaining ?? -1) >= 0;
        check(`${item.hull} factory loadout, effective stats, cockpit, flight, collision and damage`,
            result.purchase.ok === true
            && result.shipId === item.hull
            && result.factory
            && result.statsFinite
            && finiteStats(result.stats)
            && cockpitLoaded
            && quoteGood
            && collisionGood
            && flightGood
            && damageGood,
            JSON.stringify({
                purchase: result.purchase?.code,
                factory: result.factory,
                stats: { maxSpeed: result.stats.maxSpeed, hull: result.stats.hull, cargo: result.stats.cargo },
                cockpit: result.cockpit.dataset,
                flight: { displacement: result.flight.displacement, speed: result.flight.speed, rotationDelta: result.flight.rotationDelta },
                collision: { radius: result.collision.radius, extents: result.collision.extents },
                damage: result.damage,
                factoryMass: `${result.factoryQuote.usage?.mass}/${result.factoryQuote.usage?.massLimit}`,
            }));
        if (item.hull === 'talon') {
            await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.syncRender?.(0, performance.now()));
            await page.screenshot({ path: SHOT_SMALL });
        }
        if (item.hull === 'atlas') {
            await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.syncRender?.(0, performance.now()));
            await page.screenshot({ path: SHOT_LARGE });
        }
    }

    const itemCases = [
        { id: 'pulse-cannon', hull: 'wayfarer', dock: 'helix' },
        { id: 'pulse-mk2', hull: 'lancer', dock: 'rook' },
        { id: 'gauss-cannon', hull: 'vanguard', dock: 'rook' },
        { id: 'pdc', hull: 'vanguard', dock: 'rook' },
        { id: 'ripper', hull: 'vanguard', dock: 'rook' },
        { id: 'ion-blaster', hull: 'vanguard', dock: 'rook' },
        { id: 'mortar', hull: 'vanguard', dock: 'rook' },
        { id: 'seeker-launcher', hull: 'lancer', dock: 'rook' },
        { id: 'swarm-launcher', hull: 'lancer', dock: 'rook' },
        { id: 'torpedo-launcher', hull: 'lancer', dock: 'rook' },
        { id: 'engine-mk2', hull: 'wayfarer', dock: 'helix' },
        { id: 'thrusters-mk2', hull: 'lancer', dock: 'rook' },
        { id: 'shield-mk2', hull: 'vanguard', dock: 'rook' },
        { id: 'armor-mk2', hull: 'vanguard', dock: 'rook' },
        { id: 'radar-mk2', hull: 'wayfarer', dock: 'helix' },
        { id: 'cargo-pods', hull: 'wayfarer', dock: 'helix' },
        { id: 'mining-mk2', hull: 'prospector', dock: 'vesper' },
        { id: 'salvage-mk2', hull: 'vanguard', dock: 'rook' },
    ];
    const itemResults = {};
    for (const item of itemCases) {
        itemResults[item.id] = await installItem(item);
        const result = itemResults[item.id];
        const isWeapon = result.item.category === 'gun' || result.item.category === 'launcher';
        const legal = result.purchase.ok === true
            && result.result?.ok === true
            && result.installedIndex >= 0
            && result.statsFinite
            && result.usage.mass <= result.usage.massLimit
            && (!isWeapon || (result.firing.attempted && result.firing.matching > 0 && result.firing.count >= result.firing.matching));
        const itemLabel = `${item.id} legal ${result.item.category} slot application${isWeapon ? ' and live fire' : ''}`;
        check(itemLabel, legal, JSON.stringify({
            purchase: result.purchase?.code,
            result: result.result?.code,
            installedIndex: result.installedIndex,
            mass: `${result.usage.mass}/${result.usage.massLimit}`,
            firing: result.firing,
        }));
        if (isWeapon) {
            const expectedAmmo = result.firing.expectedAmmoId;
            const ammoGood = result.item.category === 'launcher'
                ? (result.firing.ammoSpent.missiles ?? 0) > 0
                : expectedAmmo
                    ? (result.firing.ammoSpent[expectedAmmo] ?? 0) > 0
                    : Object.values(result.firing.ammoSpent).every((value) => value === 0);
            const energyGood = Math.abs(result.firing.energySpent - result.firing.expectedEnergy) < 0.001;
            check(`${item.id} uses its projected energy/ammunition`,
                energyGood && ammoGood,
                JSON.stringify({ firing: result.firing }));
        }
    }

    const groups = await groupProbe();
    check('A/B fire groups select distinct mounted guns and both fire',
        groups.purchase.ok === true
        && groups.populated.length >= 2
        && groups.a.active === 'A'
        && groups.b.active === 'B'
        && groups.a.projectiles.length > 0
        && groups.b.projectiles.length > 0
        && groups.finalGroup === 'A',
        JSON.stringify({
            purchase: groups.purchase?.code,
            guns: groups.guns,
            a: groups.a,
            b: groups.b,
            finalGroup: groups.finalGroup,
            finalWeapon: groups.finalWeapon,
        }));

    const invalid = await invalidDraftProbe();
    check('invalid and incompatible drafts are rejected without mutation',
        invalid.purchase.ok === true
        && invalid.codes.unknown === 'unknown-item'
        && invalid.codes.incompatible === 'incompatible-mount'
        && invalid.unchangedLoadout,
        JSON.stringify({ codes: invalid.codes, unchangedLoadout: invalid.unchangedLoadout }));
    check('over-budget and over-capacity drafts are rejected',
        invalid.codes.overBudget === 'mass-over-budget'
        && invalid.codes.cargo === 'cargo-over-capacity',
        JSON.stringify({ overBudget: invalid.codes.overBudget, cargo: invalid.codes.cargo }));
    check('stale outfitting quotes are rejected safely',
        invalid.codes.stale === 'stale-quote'
        && invalid.creditsAfter === invalid.creditsBefore - 1,
        JSON.stringify({ stale: invalid.codes.stale, creditsBefore: invalid.creditsBefore, creditsAfter: invalid.creditsAfter }));

    const persistence = await persistenceProbe();
    check('save/load preserves hull, outfitting, credits and active fire group',
        persistence.before.rawSave
        && persistence.before.shipId === persistence.after.shipId
        && persistence.before.credits === persistence.after.credits
        && JSON.stringify(persistence.before.loadout) === JSON.stringify(persistence.after.loadout)
        && persistence.before.activeGroup === persistence.after.activeGroup
        && persistence.before.weaponId === persistence.after.weaponId,
        JSON.stringify({
            before: { shipId: persistence.before.shipId, credits: persistence.before.credits, activeGroup: persistence.before.activeGroup, weaponId: persistence.before.weaponId },
            after: { shipId: persistence.after.shipId, credits: persistence.after.credits, dockedAt: persistence.after.dockedAt, activeGroup: persistence.after.activeGroup, weaponId: persistence.after.weaponId },
        }));

    check('fleet/outfitting live browser diagnostics remain clean',
        consoleErrors.length === 0 && pageErrors.length === 0 && networkErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors, networkErrors }));
}
catch (error) {
    check('fleet/outfitting probe completed without a harness error', false, error?.stack || String(error));
}
finally {
    await browser?.close().catch(() => undefined);
    if (chrome && !chrome.killed)
        chrome.kill();
    server?.kill();
}

const passed = checks.filter((entry) => entry.ok).length;
const failed = checks.length - passed;
console.log(`SCREENSHOTS ${SHOT_SMALL} ${SHOT_LARGE}`);
console.log(`DIAGNOSTICS ${JSON.stringify({ consoleErrors, pageErrors, networkErrors })}`);
console.log(`RESULT ${passed}/${checks.length} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
