import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium, devices, webkit } from 'playwright';
import { createMultiplayerServer } from '../../tools/multiplayer/serve.mjs';

const profile = process.env.VR_PROFILES ?? 'desktop';
assert.ok(['desktop', 'android', 'iphone'].includes(profile));
const webkitPhone = profile === 'iphone';
const teams = process.env.VR_BOT_MODE ? process.env.VR_BOT_MODE === 'teams' : webkitPhone;
const publicRoom = process.env.VR_BOT_ROOM === 'public';
const nativeBridge = process.env.VR_BOT_NATIVE === '1';
const hiddenStartup = process.env.VR_BOT_HIDDEN === '1';
const output = `output/solo-start-qa/${profile}-${teams ? 'teams' : 'ffa'}${publicRoom ? '-public' : ''}${nativeBridge ? '-native' : ''}${hiddenStartup ? '-hidden' : ''}`;
await mkdir(output, { recursive: true });
let base = process.env.VR_BASE_URL;
let server;
if (!base) {
    server = await createMultiplayerServer();
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
}
const chrome = process.env.VR_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
try {
    browser = await (webkitPhone ? webkit.launch() : chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined,
        args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=metal'] }));
    const device = webkitPhone ? devices['iPhone 13 landscape'] : profile === 'android' ? devices['Pixel 7 landscape'] : { viewport: { width: 1150, height: 720 } };
    const page = await browser.newPage({ ...device, serviceWorkers: 'allow' });
    page.setDefaultTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ publicRoom, nativeBridge, hiddenStartup }) => {
        localStorage.setItem('voidrunner-lang', 'en');
        localStorage.setItem('void-privateer-settings-v1', JSON.stringify({ language: 'en', music: 0, effects: 0 }));
        window.setupTraffic = [];
        if (!publicRoom) Object.defineProperty(window, 'RTCPeerConnection', { value: undefined });
        if (nativeBridge) window.VoidrunnerNative = { postMessage: raw => setupTraffic.push(JSON.parse(raw).type) };
        if (hiddenStartup) {
            // A visibility fixture models WebKit's clamped startup yields.
            const nativeTimer = window.setTimeout.bind(window);
            const hidden = () => !!window.testHidden;
            Object.defineProperty(document, 'hidden', { get: hidden });
            Object.defineProperty(document, 'visibilityState', { get: () => hidden() ? 'hidden' : 'visible' });
            window.setTimeout = (fn, delay, ...args) => nativeTimer(fn, hidden() && !(delay > 0) ? 1000 : delay, ...args);
        }
        const Audio = window.AudioContext ?? window.webkitAudioContext;
        if (Audio) Audio.prototype.resume = async function () { await this.suspend(); };
    }, { publicRoom, nativeBridge, hiddenStartup });
    let roomRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/multiplayer') roomRequests++; });
    const action = name => page.locator(`[data-match-action="${name}"]`);
    const setting = name => page.locator(`[data-match-setting="${name}"]`);
    const screen = name => page.locator(`#multiplayer-panel[data-screen="${name}"]:not(.is-hidden)`);
    await page.goto(new URL('/game.html?multiplayer-test=1', base).href);
    await page.locator('[data-ui-command="multiplayer"]').click();
    await page.locator('[data-match-field="name"]').fill('Test pilot');
    await action(publicRoom ? 'host' : 'solo-bots').click();
    await screen('lobby').waitFor();
    const add = async id => {
        await setting('bot-character').selectOption(id);
        await action('add-bot').click();
        await setting('bot-difficulty').and(page.locator(`[data-match-id="bot:${id}"]`)).waitFor();
    };
    if (publicRoom) {
        assert.ok(await action('start').isDisabled());
        await add('brick');
    }
    await add('wisp');
    await action('remove-bot').and(page.locator('[data-match-id="bot:wisp"]')).click();
    await setting('bot-difficulty').and(page.locator('[data-match-id="bot:wisp"]')).waitFor({ state: 'detached' });
    const brick = setting('bot-difficulty').and(page.locator('[data-match-id="bot:brick"]'));
    await brick.selectOption('ace');
    assert.equal(await brick.inputValue(), 'ace');
    if (teams) {
        await setting('mode').selectOption('teams');
        assert.ok(await action('start').isDisabled(), '2v2 requires filled teams');
        await action('fill-bots').click();
        assert.equal(await setting('bot-team').count(), 3);
    }
    await page.screenshot({ path: `${output}/${profile}-bot-lobby.png` });
    assert.ok(await action('start').isEnabled(), 'a solo pilot can start from the lobby');
    await action('start').click();
    await screen('loadout').waitFor();
    await action('loadout-equipment').click();
    assert.match(await action('confirm-loadout').innerText(), /launch round/i);
    if (hiddenStartup) await page.evaluate(() => {
        document.querySelector('[data-match-action="confirm-loadout"]').addEventListener('click', () => {
            window.testHidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
        }, { capture: true, once: true });
    });
    await action('confirm-loadout').click();
    try {
        await page.waitForFunction(() => {
            const state = JSON.parse(render_game_to_text());
            return state.screen === 'flight' && state.contacts?.some(contact => contact.id.startsWith('bot:')) && state.remainingSeconds < 299;
        }, null, { timeout: hiddenStartup ? 35_000 : 140_000, polling: 100 });
    } catch (error) {
        const state = await page.evaluate(() => {
            const {screen, phase, remainingSeconds, contacts} = JSON.parse(render_game_to_text());
            return { screen, phase, remainingSeconds, contacts: contacts?.length, hidden: document.hidden,
                loaded: Boolean(__VOID_PRIVATEER__.getRuntime()), status: document.querySelector('.match-message')?.textContent };
        }).catch(() => null);
        console.error('Solo startup state', state, errors);
        throw error;
    }
    if (hiddenStartup) await page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    const launch = await page.evaluate(() => {
        const { controller } = __VOID_PRIVATEER__.getRuntime().arena.multiplayer;
        controller.stopClock();
        return controller.state.players.map(pilot => [pilot.name, pilot.bot?.difficulty]);
    });
    assert.equal(launch.length, teams ? 4 : 2);
    assert.deepEqual(launch.find(([name]) => name === 'Brick'), ['Brick', 'ace']);
    const play = await page.evaluate(() => {
        const { controller } = __VOID_PRIVATEER__.getRuntime().arena.multiplayer;
        const world = controller.world;
        const bot = world.match.players.get('bot:brick');
        const host = world.match.players.get('host');
        // Bring the pilot and Brick into each other's firing lanes to shorten
        // the run-up. All aiming, damage and purchases still occur in the sim.
        const { x, y, z } = world.center;
        host.actor.position.splice(0, 3, x, y, z);
        bot.actor.position.splice(0, 3, x, y, z + 230);
        bot.actor.rotation.splice(0, 4, 0, 0, 0, 1);
        let botHit = false;
        for (let i = 0; i < 2640 && !botHit; i++) {
            world.step();
            botHit = world.events.some(event => event.type === 'hit' && event.ownerId?.startsWith('bot:') && event.targetId !== event.ownerId);
            world.flushEvents();
        }
        controller.publishWorld(true);
        const actor = bot.actor;
        if (!actor) throw Error('Brick died before the refit check');
        world.recordDeath(bot.id, host.id, actor.life);
        const payout = bot.credits;
        for (let i = 0; i < 181; i++) world.advance(1 / 60);
        controller.publishWorld(true);
        return { botHit, payout, life: bot.life, boughtGear: bot.paidMounts.size > 0, finite: bot.actor?.position.every(Number.isFinite) };
    });
    assert.ok(play.botHit, 'a bot lands a real weapon hit');
    assert.ok(play.payout >= 1000 && play.life > 1 && play.boughtGear && play.finite, JSON.stringify(play));
    await page.screenshot({ path: `${output}/${profile}-bot-flight.png` });
    await page.evaluate(() => window.advanceTime(300_000));
    await screen('ended').waitFor();
    await screen('ended').getByText('Brick', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${profile}-bot-result.png` });
    await action('rematch').click();
    await screen('lobby').waitFor();
    assert.equal(await brick.inputValue(), 'ace');
    assert.ok(await action('start').isEnabled(), 'the solo rematch opens its loadout from Start');
    await action('start').click();
    await screen('loadout').waitFor();
    await screen('loadout').locator('[data-ui-command="multiplayer-back"]').click();
    await screen('lobby').waitFor();
    if (!publicRoom) {
        assert.equal(roomRequests, 0, 'solo play never contacts the room service');
        assert.deepEqual(await page.evaluate(() => window.setupTraffic), [], 'solo play never asks the native network bridge');
    }
    assert.deepEqual(errors, []);
    console.log(`${profile}: one human completed ${teams ? '2v2 with three bots' : 'free-for-all with one bot'}. Bot fire, refit, relaunch and rematch passed.`);
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
}
