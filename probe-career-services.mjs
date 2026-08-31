// Live browser regression for dock repair/refill transactions and their UI.
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
const PORT = new URL(BASE_URL).port || '4173';
const QA_DIR = '/tmp/voidrunner-career-services';
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
    const server = spawn('python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'ignore'],
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await serverReady())
            return server;
        await wait(100);
    }
    server.kill();
    throw new Error(`local server did not become ready on ${PORT}`);
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

    const quoted = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { repairCost, refillCost } = await import('/src/game/shipStats.js');
        const { AMMO_CAPACITY } = await import('/src/game/weapons.js');
        const player = runtime.save.player;
        const stats = runtime.playerStats();
        player.credits = 100000;
        player.hull = stats.hull - 23;
        player.fuel = stats.fuel - 11;
        player.missiles = 0;
        player.ammo ??= {};
        player.ammo.slugs = 0;
        const result = {
            startingCredits: player.credits,
            repairCost: repairCost(player),
            refillCost: refillCost(player),
            expected: {
                hull: stats.hull,
                fuel: stats.fuel,
                missiles: stats.missileCapacity,
                slugs: AMMO_CAPACITY.slugs,
            },
        };
        runtime.ui.refreshDock(runtime.save);
        document.querySelector('[data-dock-hotspot="services"]')?.click();
        return {
            ...result,
            repairText: document.querySelector('[data-ui-command="repair"]')?.textContent?.trim(),
            refillText: document.querySelector('[data-ui-command="refuel"]')?.textContent?.trim(),
            serviceCards: document.querySelectorAll('.service-card').length,
        };
    });
    const digits = (text) => String(text ?? '').replace(/\D/g, '');
    check('services screen exposes repair, refill, and recovery information', quoted.serviceCards === 3
        && digits(quoted.repairText) === String(quoted.repairCost)
        && digits(quoted.refillText) === String(quoted.refillCost), JSON.stringify(quoted));
    await page.screenshot({ path: `${QA_DIR}/services-before.png`, fullPage: true });

    const serviced = await page.evaluate(async () => {
        document.querySelector('[data-ui-command="repair"]')?.click();
        document.querySelector('[data-ui-command="refuel"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const stored = JSON.parse(localStorage.getItem('void-privateer-save-v1'));
        return {
            credits: runtime.save.player.credits,
            hull: runtime.save.player.hull,
            fuel: runtime.save.player.fuel,
            missiles: runtime.save.player.missiles,
            slugs: runtime.save.player.ammo?.slugs,
            stored: {
                credits: stored?.player?.credits,
                hull: stored?.player?.hull,
                fuel: stored?.player?.fuel,
                missiles: stored?.player?.missiles,
                slugs: stored?.player?.ammo?.slugs,
            },
            repairDisabled: document.querySelector('[data-ui-command="repair"]')?.disabled,
            refillDisabled: document.querySelector('[data-ui-command="refuel"]')?.disabled,
        };
    });
    const expectedCredits = quoted.startingCredits - quoted.repairCost - quoted.refillCost;
    check('repair charges the quoted amount and restores hull integrity', serviced.credits === expectedCredits
        && serviced.hull === quoted.expected.hull, JSON.stringify(serviced));
    check('refill charges the quoted amount and restores every mounted consumable', serviced.fuel === quoted.expected.fuel
        && serviced.missiles === quoted.expected.missiles
        && serviced.slugs === quoted.expected.slugs, JSON.stringify(serviced));
    check('completed service state is persisted exactly', JSON.stringify(serviced.stored) === JSON.stringify({
        credits: serviced.credits,
        hull: serviced.hull,
        fuel: serviced.fuel,
        missiles: serviced.missiles,
        slugs: serviced.slugs,
    }), JSON.stringify(serviced.stored));
    check('fully serviced actions disable instead of charging twice', serviced.repairDisabled === true && serviced.refillDisabled === true, JSON.stringify(serviced));

    const refused = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { repairCost } = await import('/src/game/shipStats.js');
        const { t } = await import('/src/game/i18n.js');
        runtime.save.player.hull = Math.max(1, runtime.playerStats().hull - 10);
        const cost = repairCost(runtime.save.player);
        runtime.save.player.credits = cost - 1;
        runtime.ui.refreshDock(runtime.save);
        document.querySelector('[data-dock-hotspot="services"]')?.click();
        const before = { credits: runtime.save.player.credits, hull: runtime.save.player.hull };
        document.querySelector('#toast-stack')?.replaceChildren();
        document.querySelector('[data-ui-command="repair"]')?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return {
            cost,
            before,
            after: { credits: runtime.save.player.credits, hull: runtime.save.player.hull },
            toast: [...document.querySelectorAll('#toast-stack .toast')].at(-1)?.textContent ?? '',
            expectedToast: t('Insufficient credits for full repair.'),
        };
    });
    check('insufficient repair funds leave credits and hull untouched', refused.after.credits === refused.before.credits
        && refused.after.hull === refused.before.hull
        && refused.toast.trim() === refused.expectedToast, JSON.stringify(refused));
    await page.screenshot({ path: `${QA_DIR}/services-insufficient.png`, fullPage: true });
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
console.log(`\n${checks.length - failures.length}/${checks.length} career service checks passed`);
if (failures.length || errors.length)
    process.exitCode = 1;
