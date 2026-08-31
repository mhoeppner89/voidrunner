#!/usr/bin/env node

/*
 * Live-browser contract lifecycle regression.
 *
 * The probe accepts contracts through the rendered mission board, then uses
 * the normal GameSession payout paths. It only adds disposable test fixtures
 * when a procedurally generated board does not happen to contain a requested
 * kind; production code is never changed.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';

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
const CDP_PORT = 9345;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_PREFIX = '/tmp/vr-contract-payouts-profile-';
const BOARD_SHOT = '/tmp/voidrunner-contract-payouts-board.png';
const ROOK_BOARD_SHOT = '/tmp/voidrunner-contract-payouts-rook-board.png';
const COMPLETION_SHOT = '/tmp/voidrunner-contract-payouts-completion.png';
const SALVAGE_SHOT = '/tmp/voidrunner-contract-payouts-salvage.png';

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const networkErrors = [];
const seenNetworkErrors = new Set();

const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
};

const format = (value) => {
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
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
    throw new Error('local server did not become ready at ' + BASE_URL);
};

const cdpReady = async () => {
    try {
        return (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version', {
            signal: AbortSignal.timeout(500),
        })).ok;
    }
    catch {
        return false;
    }
};

const waitForCdp = async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await cdpReady())
            return;
        await wait(150);
    }
    throw new Error('headless Chrome did not expose CDP on port ' + CDP_PORT);
};

let server;
let chrome;
let browser;
let page;
let profile;

const appUrl = (label) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('contract-payouts', label + '-' + Date.now());
    return url.href;
};

const snapshot = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const player = runtime.save.player;
    return {
        credits: player.credits,
        cargo: { ...player.cargo },
        sealedCargo: (player.sealedCargo || []).map((entry) => ({ ...entry })),
        active: player.activeMissions || null,
        activeMissions: runtime.save.activeMissions.map((mission) => ({
            id: mission.id,
            kind: mission.kind,
            status: mission.status,
            title: mission.title,
            reward: mission.reward,
            deposit: mission.deposit,
            guild: mission.guild,
            guildRep: mission.guildRep,
            faction: mission.faction,
            destination: mission.destination,
            targetZone: mission.targetZone,
            targetNodeId: mission.targetNodeId,
            claimNodeId: mission.claimNodeId,
            claimName: mission.claimName,
            targetName: mission.targetName,
            commodity: mission.commodity,
            quantity: mission.quantity,
            mined: mission.mined,
            salvaged: mission.salvaged,
            targetRemaining: mission.targetRemaining,
        })),
        completedMissionIds: [...runtime.save.world.completedMissionIds],
        failedMissionIds: [...runtime.save.world.failedMissionIds],
        guildRep: { ...player.guildRep },
        guildRank: { ...player.guildRank },
        reputation: { ...player.reputation },
        stats: { ...player.stats },
        dockedAt: player.dockedAt,
        systemId: player.systemId,
    };
});

const latestToast = async () => page.locator('#toast-stack .toast').last().textContent().catch(() => '');

const latestEvent = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    return runtime.ui.recentEvents.at(-1)?.message || '';
});

const freezeFlight = async () => page.evaluate(() => {
    const runtime = window.__VOID_PRIVATEER__?.getRuntime?.();
    if (!runtime)
        return false;
    if (runtime.frameId)
        cancelAnimationFrame(runtime.frameId);
    runtime.frameId = 0;
    return true;
});

const bootCareer = async (label) => {
    await page.goto(appUrl(label), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__?.newGame), undefined, { timeout: 30000 });
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await page.waitForFunction(
        () => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix',
        undefined,
        { timeout: 30000 },
    );
    await freezeFlight();
};

const dockAt = async (locationId) => {
    await page.evaluate((id) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.dockAt(id);
        if (runtime.frameId)
            cancelAnimationFrame(runtime.frameId);
        runtime.frameId = 0;
    }, locationId);
    await page.waitForFunction(
        (id) => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === id,
        locationId,
        { timeout: 10000 },
    );
    await page.waitForTimeout(80);
};

const openMissionBoard = async (locationId) => {
    await dockAt(locationId);
    const barHotspot = page.locator('[data-dock-hotspot="bar"]');
    if (await barHotspot.count())
        await barHotspot.first().click();
    const missionPanel = page.locator('[data-bar-panel="missions"]');
    if (await missionPanel.count())
        await missionPanel.first().click();
    await page.waitForSelector('.mission-grid', { timeout: 10000 });
    await page.waitForTimeout(60);
};

const forceSmugglerBoard = async () => {
    await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.save.world.underworld ??= {};
        runtime.save.world.underworld.helix = 600;
        const { refreshMissionOffers } = await import('/src/game/missions.js');
        refreshMissionOffers(runtime.save, true);
        runtime.ui.refreshDock(runtime.save);
    });
    await page.waitForTimeout(80);
};

const offerFor = async (locationId, kind) => page.evaluate(({ locationId: dock, kind: wanted }) => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const offer = (runtime.save.world.offers[dock] || []).find((entry) => entry.kind === wanted);
    return offer ? JSON.parse(JSON.stringify(offer)) : null;
}, { locationId, kind });

const injectOfferFixture = async (locationId, kind) => page.evaluate(async ({ locationId: dock, kind: wanted }) => {
    const runtime = window.__VOID_PRIVATEER__.getRuntime();
    const save = runtime.save;
    const { t } = await import('/src/game/i18n.js');
    const destination = wanted === 'smuggle' ? 'vesper' : 'rook';
    const common = {
        id: 'probe-' + wanted + '-' + Date.now(),
        kind: wanted,
        issuer: 'Probe Contract Desk',
        origin: dock,
        reward: 4800,
        deposit: 240,
        deadline: save.world.time + 1000,
        status: 'offered',
        guild: wanted === 'bounty' ? 'bounty' : wanted === 'mining' ? 'mining' : wanted === 'salvage' ? 'salvage' : wanted === 'smuggle' ? 'syndicate' : 'merchant',
        guildRep: wanted === 'bounty' ? 9 : wanted === 'mining' ? 8 : wanted === 'salvage' ? 8 : wanted === 'smuggle' ? 9 : 8,
        faction: wanted === 'bounty' ? 'concord' : wanted === 'salvage' ? 'salvage-union' : wanted === 'mining' ? 'frontier-miners' : wanted === 'smuggle' ? 'red-talons' : 'free-merchants',
        briefing: 'Disposable contract fixture for the live payout probe.',
    };
    if (wanted === 'delivery') {
        Object.assign(common, {
            commodity: 'medicine',
            quantity: 2,
            destination,
            title: t('Deliver {quantity} {commodity}', { quantity: 2, commodity: t('Medicine') }),
        });
    }
    else if (wanted === 'transport') {
        Object.assign(common, {
            quantity: 2,
            destination,
            title: t('Express transport to {station}', { station: 'ROOK' }),
        });
    }
    else if (wanted === 'smuggle') {
        Object.assign(common, {
            commodity: 'electronics',
            quantity: 2,
            destination,
            title: t('Dark run: {quantity} {commodity}', { quantity: 2, commodity: t('Electronics') }),
        });
    }
    else if (wanted === 'bounty') {
        Object.assign(common, {
            targetZone: 'rook',
            targetName: 'Probe Warrant',
            danger: 1.2,
            pilot: {
                tier: 'veteran',
                temperament: 'cautious',
                aim: 0.75,
            },
            title: t('Warrant: {name}', { name: 'Probe Warrant' }),
        });
    }
    else if (wanted === 'mining') {
        const target = runtime.asteroids.find((node) => node.remaining > 0);
        if (!target)
            throw new Error('no asteroid available for mining fixture');
        Object.assign(common, {
            destination: 'rook',
            commodity: 'ore',
            quantity: 1,
            claimNodeId: target.id,
            claimName: 'Probe Claim',
            claimPosition: [...target.position],
            mined: 0,
            deposit: 0,
            title: t('Mine the {claim} claim', { claim: 'PROBE CLAIM' }),
        });
    }
    else if (wanted === 'salvage') {
        const target = runtime.wreckNodes.find((node) => node.remaining > 0);
        if (!target)
            throw new Error('no wreck available for salvage fixture');
        Object.assign(common, {
            destination: 'rook',
            targetZone: 'mourning-line',
            targetNodeId: target.id,
            targetName: target.name,
            targetPosition: [...target.position],
            targetRemaining: target.remaining,
            salvaged: 0,
            commodity: target.salvage,
            quantity: 1,
            title: t('Recover {quantity} {commodity}', {
                quantity: 1,
                commodity: t(target.salvage),
            }),
        });
    }
    save.world.offers[dock] ??= [];
    save.world.offers[dock].push(common);
    runtime.ui.refreshDock(save);
    return JSON.parse(JSON.stringify(common));
}, { locationId, kind });

const ensureOffer = async (locationId, kind) => {
    const generated = await offerFor(locationId, kind);
    if (generated)
        return { offer: generated, fixture: false };
    const fixture = await injectOfferFixture(locationId, kind);
    return { offer: fixture, fixture: true };
};

const expectedVector = async (mission) => page.evaluate(async (entry) => {
    const { t } = await import('/src/game/i18n.js');
    const locations = await import('/src/game/data.js');
    const location = locations.LOCATIONS[entry.destination || entry.targetZone];
    const name = location?.name?.toUpperCase() || String(entry.destination || entry.targetZone || '').toUpperCase();
    if (entry.kind === 'bounty')
        return t('HUNT NEAR {name}', { name });
    if (entry.kind === 'mining')
        return t('MINE {name}', { name: (entry.claimName || 'SHARDBELT CLAIM').toUpperCase() });
    if (entry.kind === 'salvage')
        return t('SALVAGE {name}', { name: (entry.targetName || 'MOURNING LINE CLAIM').toUpperCase() });
    return t('FLY TO {name}', { name });
}, mission);

const acceptOffer = async (label, locationId, kind) => {
    const ensured = await ensureOffer(locationId, kind);
    const offer = ensured.offer;
    const selector = '[data-mission-id="' + offer.id + '"]';
    const button = page.locator(selector);
    if (await button.count() === 0)
        throw new Error('mission board did not render ' + kind + ' offer ' + offer.id);
    const before = await snapshot();
    const expectedAcceptance = await page.evaluate(async (entry) => {
        const { t } = await import('/src/game/i18n.js');
        return t('Accepted: {title}', { title: entry.title });
    }, offer);
    await button.first().click();
    await page.waitForTimeout(80);
    const after = await snapshot();
    const mission = after.activeMissions.find((entry) => entry.id === offer.id);
    const acceptanceToast = await latestToast();
    const remainingOffer = await offerFor(locationId, kind);
    check(label + ' acceptance label uses the active locale', acceptanceToast.trim() === expectedAcceptance.trim(), JSON.stringify({
        actual: acceptanceToast,
        expected: expectedAcceptance,
    }));
    check(label + ' becomes an active mission and removes the board offer',
        Boolean(mission)
        && mission.status === 'active'
        && !after.completedMissionIds.includes(offer.id)
        && (!remainingOffer || remainingOffer.id !== offer.id),
        JSON.stringify({ mission, offer: remainingOffer }),
    );
    check(label + ' posts the bond and preserves the expected sealed cargo',
        after.credits === before.credits - offer.deposit
        && (kind === 'delivery' || kind === 'transport' || kind === 'smuggle'
            ? after.sealedCargo.some((entry) => entry.missionId === offer.id && entry.units === offer.quantity)
            : true),
        JSON.stringify({ before: before.credits, after: after.credits, deposit: offer.deposit, sealedCargo: after.sealedCargo }),
    );
    if (kind === 'smuggle')
        check(label + ' marks the accepted crate as sealed syndicate cargo',
            after.sealedCargo.some((entry) => entry.missionId === offer.id && entry.smuggled === true),
            JSON.stringify(after.sealedCargo),
        );
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().launch());
    await freezeFlight();
    await page.waitForTimeout(60);
    const vector = await expectedVector(mission);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().openShipMenu());
    const shipMenu = await page.locator('.ship-menu-missions').innerText().catch(() => '');
    check(label + ' ship menu exposes its return vector', shipMenu.includes(vector), JSON.stringify({ vector, shipMenu }));
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().resumeFlight());
    return {
        offer,
        mission,
        before,
        accepted: after,
        vector,
        fixture: ensured.fixture,
    };
};

const completeAtDock = async (label, accepted, destination) => {
    const before = await snapshot();
    await dockAt(destination);
    const after = await snapshot();
    const mission = accepted.mission;
    const expectedPrefix = await page.evaluate(async (entry) => {
        const { t } = await import('/src/game/i18n.js');
        return t('{title} complete. {credits} credits transferred.{note}', {
            title: entry.title,
            credits: entry.reward + entry.deposit,
            note: '',
        });
    }, mission);
    const toast = await latestToast();
    const cargoStillSealed = after.sealedCargo.some((entry) => entry.missionId === mission.id);
    const cargoBefore = before.cargo[mission.commodity] || 0;
    const cargoAfter = after.cargo[mission.commodity] || 0;
    const expectedGuildDelta = mission.guildRep;
    const expectedFactionDelta = Math.max(1, Math.floor(mission.guildRep / 3));
    check(label + ' payout adds reward and refunds the bond exactly',
        after.credits === before.credits + mission.reward + mission.deposit
        && after.credits === accepted.before.credits + mission.reward,
        JSON.stringify({ before: before.credits, after: after.credits, reward: mission.reward, deposit: mission.deposit }),
    );
    check(label + ' completion clears active/completed state and sealed cargo',
        !after.activeMissions.some((entry) => entry.id === mission.id)
        && after.completedMissionIds.includes(mission.id)
        && !cargoStillSealed,
        JSON.stringify({ active: after.activeMissions, completed: after.completedMissionIds, sealed: after.sealedCargo }),
    );
    check(label + ' completion advances contracts, guild reputation, rank, and faction standing',
        after.stats.contracts === before.stats.contracts + 1
        && after.guildRep[mission.guild] === before.guildRep[mission.guild] + expectedGuildDelta
        && after.guildRank[mission.guild] >= before.guildRank[mission.guild]
        && after.reputation[mission.faction] === before.reputation[mission.faction] + expectedFactionDelta,
        JSON.stringify({
            stats: [before.stats.contracts, after.stats.contracts],
            guild: [before.guildRep[mission.guild], after.guildRep[mission.guild]],
            rank: [before.guildRank[mission.guild], after.guildRank[mission.guild]],
            faction: [mission.faction, before.reputation[mission.faction], after.reputation[mission.faction]],
        }),
    );
    if (mission.commodity && (mission.kind === 'mining' || mission.kind === 'salvage'))
        check(label + ' consumes the delivered resource manifest at the dock',
            cargoAfter === Math.max(0, cargoBefore - mission.quantity),
            JSON.stringify({ commodity: mission.commodity, before: cargoBefore, after: cargoAfter, quantity: mission.quantity }),
        );
    check(label + ' completion label uses the active locale',
        toast.includes(expectedPrefix),
        JSON.stringify({ actual: toast, expectedPrefix }),
    );
    return { before, after, toast };
};

const completeBounty = async (label, accepted) => {
    const mission = accepted.mission;
    const before = await snapshot();
    const destroyed = await page.evaluate((missionId) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const active = runtime.save.activeMissions.find((entry) => entry.id === missionId);
        if (!active)
            throw new Error('bounty mission disappeared before target spawn');
        const position = [...runtime.save.player.position];
        const target = runtime.spawnShip('bounty', position, active.id, active.targetName, active.pilot);
        target.targetId = 'player';
        target.shield = 0;
        target.hull = 1;
        const bountyValue = target.bountyValue;
        runtime.ships = [target];
        runtime.destroyShip(target, 'player', target.position);
        return {
            bountyValue,
            targetName: target.name,
            targetAlive: target.hull > 0,
        };
    }, mission.id);
    const after = await snapshot();
    const completionEvent = await page.evaluate((missionId) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const mission = runtime.save.world.completedMissionIds.includes(missionId);
        const event = [...runtime.ui.recentEvents].reverse().find((entry) => /complete|abgeschlossen/i.test(entry.message));
        return { mission, event: event?.message || '' };
    }, mission.id);
    const expectedPrefix = await page.evaluate(async (entry) => {
        const { t } = await import('/src/game/i18n.js');
        return t('{title} complete. {credits} credits transferred.{note}', {
            title: entry.title,
            credits: entry.reward + entry.deposit,
            note: '',
        });
    }, mission);
    const guildDelta = mission.guildRep + 2 + (mission.pilot?.tier === 'ace' ? 10 : 0);
    const factionDelta = Math.max(1, Math.floor(mission.guildRep / 3));
    const expectedFactionRep = Math.min(100, before.reputation[mission.faction] + factionDelta);
    const expectedConcordRep = Math.min(100, before.reputation.concord + 1 + (mission.faction === 'concord' ? factionDelta : 0));
    check(label + ' destroy path pays the bounty plus mission reward and bond',
        after.credits === before.credits + destroyed.bountyValue + mission.reward + mission.deposit,
        JSON.stringify({ before: before.credits, after: after.credits, bounty: destroyed.bountyValue, reward: mission.reward, deposit: mission.deposit }),
    );
    check(label + ' destroy path records kill, active/completed state, and warrant registry',
        destroyed.targetAlive === false
        && after.stats.kills === before.stats.kills + 1
        && after.stats.contracts === before.stats.contracts + 1
        && !after.activeMissions.some((entry) => entry.id === mission.id)
        && after.completedMissionIds.includes(mission.id),
        JSON.stringify({ destroyed, stats: [before.stats, after.stats], active: after.activeMissions }),
    );
    check(label + ' updates bounty guild rank and faction standings',
        after.guildRep.bounty === before.guildRep.bounty + guildDelta
        && after.guildRank.bounty >= before.guildRank.bounty
        && after.reputation[mission.faction] === expectedFactionRep
        && after.reputation.concord === expectedConcordRep
        && after.reputation['red-talons'] === Math.max(-100, before.reputation['red-talons'] - 4),
        JSON.stringify({
            guild: [before.guildRep.bounty, after.guildRep.bounty],
            rank: [before.guildRank.bounty, after.guildRank.bounty],
            faction: mission.faction,
            reputation: [before.reputation, after.reputation],
        }),
    );
    check(label + ' completion event uses the active locale',
        completionEvent.mission && completionEvent.event.includes(expectedPrefix),
        JSON.stringify({ actual: completionEvent.event, expectedPrefix }),
    );
    return { before, after, completionEvent };
};

const extractClaim = async (label, accepted, kind) => {
    const result = await page.evaluate(({ missionId, kind: extractionKind }) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const mission = runtime.save.activeMissions.find((entry) => entry.id === missionId);
        if (!mission)
            throw new Error('claim mission disappeared before extraction');
        const player = runtime.save.player;
        const nodes = extractionKind === 'mining' ? runtime.asteroids : runtime.wreckNodes;
        const target = nodes.find((node) => node.id === (mission.claimNodeId || mission.targetNodeId));
        if (!target)
            throw new Error('claim target is not present in the live field');
        for (const node of nodes) {
            if (node !== target) {
                node.remaining = 0;
                node.scale = [0.0001, 0.0001, 0.0001];
                node._collisionMesh = undefined;
            }
        }
        const baseline = extractionKind === 'salvage'
            ? Math.max(mission.targetRemaining || mission.quantity + 1, mission.quantity + 1)
            : mission.quantity;
        target.remaining = baseline;
        target.scanned = true;
        target.radius = 5;
        target.scale = [1, 1, 1];
        target._collisionMesh = undefined;
        if (extractionKind === 'salvage') {
            target.salvage = mission.commodity;
            runtime.save.world.depletedWrecks[target.id] = baseline;
            runtime.activeInstanceId = 'mourning-line';
            runtime.renderer.setActiveInstance('mourning-line');
            runtime.salvageAmbushTriggered.add(target.id);
        }
        else {
            runtime.save.world.depletedAsteroids[target.id] = baseline;
            runtime.activeInstanceId = 'shardbelt';
            runtime.renderer.setActiveInstance('shardbelt');
            runtime.claimDisputesTriggered.add(target.id);
        }
        const targetPosition = [...target.position];
        player.dockedAt = undefined;
        player.mode = extractionKind;
        player.position = [targetPosition[0], targetPosition[1], targetPosition[2] + 60];
        player.velocity = [0, 0, 0];
        player.rotation = [0, 0, 0, 1];
        player.throttle = 0;
        player.cargo = {};
        runtime.extractionCarry.clear();
        runtime.obstacleGridBuiltAt = -Infinity;
        runtime.selectTarget(extractionKind === 'mining' ? 'asteroid' : 'wreck', target.id);
        const iterations = mission.quantity * 5 + 30;
        for (let index = 0; index < iterations; index += 1)
            runtime.updateUtilityTool(1, true);
        runtime.utilityActive = false;
        return {
            id: mission.id,
            targetId: target.id,
            mission: {
                quantity: mission.quantity,
                mined: mission.mined,
                salvaged: mission.salvaged,
                commodity: mission.commodity,
            },
            targetRemaining: target.remaining,
            cargo: { ...player.cargo },
            stats: { ...player.stats },
            guildRep: { ...player.guildRep },
            activeInstanceId: runtime.activeInstanceId,
        };
    }, { missionId: accepted.mission.id, kind });
    const afterExtraction = await snapshot();
    const mission = afterExtraction.activeMissions.find((entry) => entry.id === accepted.mission.id);
    const vector = await expectedVector(mission);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().openShipMenu());
    const shipMenu = await page.locator('.ship-menu-missions').innerText().catch(() => '');
    const returnVector = vector
        .replace(/^.*(?:MINE|SALVAGE|BERGUNG|ABBAU|BERGUNG).*/i, vector);
    const returnLabel = await page.evaluate(async (entry) => {
        const { t } = await import('/src/game/i18n.js');
        const name = entry.kind === 'mining'
            ? (entry.destination || 'ROOK').toUpperCase()
            : (entry.destination || 'ROOK').toUpperCase();
        return t('RETURN TO {name}', { name });
    }, mission);
    check(label + ' extraction fills the exact claim and exposes a return vector',
        Boolean(mission)
        && (kind === 'mining' ? mission.mined >= mission.quantity : mission.salvaged >= mission.quantity)
        && afterExtraction.cargo[mission.commodity] >= mission.quantity
        && shipMenu.includes(returnLabel),
        JSON.stringify({ result, mission, returnLabel, shipMenu, returnVector }),
    );
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime().resumeFlight());
    return { result, afterExtraction, mission };
};

const runSimpleContract = async (label, kind, locationId, prepare) => {
    await bootCareer(label);
    await openMissionBoard(locationId);
    if (prepare)
        await prepare();
    const accepted = await acceptOffer(label, locationId, kind);
    if (kind === 'bounty')
        return completeBounty(label, accepted);
    return completeAtDock(label, accepted, accepted.mission.destination);
};

const runSalvage = async () => {
    const label = 'salvage';
    await bootCareer(label);
    await openMissionBoard('rook');
    const accepted = await acceptOffer(label, 'rook', 'salvage');
    await extractClaim(label, accepted, 'salvage');
    await page.screenshot({ path: SALVAGE_SHOT });
    return completeAtDock(label, accepted, accepted.mission.destination);
};

const runFailure = async () => {
    const label = 'failure';
    await bootCareer(label);
    await openMissionBoard('helix');
    const accepted = await acceptOffer(label, 'helix', 'delivery');
    const failure = await page.evaluate(async (missionId) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { t } = await import('/src/game/i18n.js');
        const mission = runtime.save.activeMissions.find((entry) => entry.id === missionId);
        const before = {
            credits: runtime.save.player.credits,
            guildRep: runtime.save.player.guildRep[mission.guild],
            reputation: runtime.save.player.reputation[mission.faction],
            sealed: runtime.save.player.sealedCargo.length,
        };
        mission.deadline = runtime.save.world.time - 0.1;
        runtime.lastMissionCheck = -Infinity;
        runtime.save.player.throttle = 0;
        runtime.save.player.velocity = [0, 0, 0];
        runtime.updateSimulation(1 / 60, {
            throttleDelta: 0,
            pitch: 0,
            yaw: 0,
            roll: 0,
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
            weaponSelect: undefined,
            afterburner: false,
            throttleSet: 0,
        });
        const after = runtime.save;
        const expected = t('Contract failed: {title}', { title: mission.title });
        const event = [...runtime.ui.recentEvents].reverse().find((entry) => entry.message.includes(expected));
        return {
            missionId,
            missionGuild: mission.guild,
            missionGuildRep: mission.guildRep,
            missionFaction: mission.faction,
            before,
            after: {
                credits: after.player.credits,
                guildRep: after.player.guildRep[mission.guild],
                reputation: after.player.reputation[mission.faction],
                sealed: after.player.sealedCargo.length,
                active: after.activeMissions.some((entry) => entry.id === missionId),
                failed: after.world.failedMissionIds.includes(missionId),
                contracts: after.player.stats.contracts,
            },
            expected,
            event: event?.message || '',
        };
    }, accepted.mission.id);
    check(label + ' marks the accepted contract failed and removes active/sealed state',
        failure.after.failed
        && !failure.after.active
        && failure.after.sealed === 0,
        JSON.stringify(failure),
    );
    check(label + ' keeps the bond and credits unrecovered while applying failure penalties',
        failure.after.credits === failure.before.credits
        && failure.after.guildRep === Math.max(0, failure.before.guildRep - Math.max(2, Math.floor(failure.missionGuildRep / 2)))
        && failure.after.reputation === failure.before.reputation - 3
        && failure.after.contracts === 0,
        JSON.stringify(failure),
    );
    check(label + ' failure label uses the active locale',
        failure.event === failure.expected,
        JSON.stringify({ actual: failure.event, expected: failure.expected }),
    );
};

try {
    server = await ensureServer();
    if (await cdpReady())
        throw new Error('CDP port ' + CDP_PORT + ' is already occupied; refusing to attach to an unknown browser');
    profile = mkdtempSync(PROFILE_PREFIX);
    chrome = spawn(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profile,
        '--window-size=1280,720',
        'about:blank',
    ], {
        cwd: ROOT,
        stdio: 'ignore',
    });
    await waitForCdp();
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + CDP_PORT);
    const context = browser.contexts()[0];
    page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('console', (message) => {
        if (message.type() === 'error')
            consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)));
    page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText || 'unknown request failure';
        const entry = request.url() + ' :: ' + failure;
        if (!seenNetworkErrors.has(entry)) {
            seenNetworkErrors.add(entry);
            networkErrors.push(entry);
        }
    });
    page.on('response', (response) => {
        if (response.status() >= 400) {
            const entry = response.status() + ' ' + response.url();
            if (!seenNetworkErrors.has(entry)) {
                seenNetworkErrors.add(entry);
                networkErrors.push(entry);
            }
        }
    });

    await bootCareer('delivery');
    await openMissionBoard('helix');
    await page.screenshot({ path: BOARD_SHOT });
    const delivery = await acceptOffer('delivery', 'helix', 'delivery');
    await completeAtDock('delivery', delivery, delivery.mission.destination);
    await page.screenshot({ path: COMPLETION_SHOT });

    await bootCareer('transport');
    await openMissionBoard('helix');
    const transport = await acceptOffer('transport', 'helix', 'transport');
    await completeAtDock('transport', transport, transport.mission.destination);

    await bootCareer('smuggle');
    await openMissionBoard('helix');
    await forceSmugglerBoard();
    const smuggle = await acceptOffer('smuggle', 'helix', 'smuggle');
    await completeAtDock('smuggle', smuggle, smuggle.mission.destination);

    await bootCareer('bounty');
    await openMissionBoard('helix');
    const bounty = await acceptOffer('bounty', 'helix', 'bounty');
    await completeBounty('bounty', bounty);

    await bootCareer('mining-board');
    await openMissionBoard('rook');
    await page.screenshot({ path: ROOK_BOARD_SHOT });
    // The board screenshot above is the representative Rook contract view.
    const mining = await acceptOffer('mining-board', 'rook', 'mining');
    await extractClaim('mining-board', mining, 'mining');
    await completeAtDock('mining-board', mining, mining.mission.destination);

    await runSalvage();
    await runFailure();

    check('live browser console/page/network diagnostics remain clean',
        consoleErrors.length === 0 && pageErrors.length === 0 && networkErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors, networkErrors }),
    );
}
catch (error) {
    check('contract payout probe completed without a harness error', false, error?.stack || String(error));
}
finally {
    await browser?.close().catch(() => undefined);
    if (chrome && !chrome.killed)
        chrome.kill();
    server?.kill();
}

const passed = checks.filter((entry) => entry.ok).length;
const failed = checks.length - passed;
console.log('SCREENSHOTS ' + [BOARD_SHOT, ROOK_BOARD_SHOT, COMPLETION_SHOT, SALVAGE_SHOT].join(' '));
console.log('DIAGNOSTICS ' + format({ consoleErrors, pageErrors, networkErrors }));
console.log('RESULT ' + passed + '/' + checks.length + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
