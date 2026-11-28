import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium, devices, webkit } from 'playwright';
import { createMultiplayerServer } from '../../tools/multiplayer/serve.mjs';

const profile = process.env.VR_PROFILES ?? 'desktop';
assert.ok(['desktop', 'iphone'].includes(profile));
const phone = profile === 'iphone';
const output = 'output/bot-qa';
await mkdir(output, { recursive: true });
const server = await createMultiplayerServer();
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
try {
    browser = await (phone ? webkit.launch() : chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined,
        args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=metal'] }));
    const page = await browser.newPage({ ...(phone ? devices['iPhone 13 landscape'] : { viewport: { width: 1150, height: 720 } }), serviceWorkers: 'block' });
    page.setDefaultTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('voidrunner-lang', 'en');
        localStorage.setItem('void-privateer-settings-v1', JSON.stringify({ language: 'en', music: 0, effects: 0 }));
        const Audio = window.AudioContext ?? window.webkitAudioContext;
        if (Audio) Audio.prototype.resume = async function () { await this.suspend(); };
    });
    const action = name => page.locator(`[data-match-action="${name}"]`);
    const setting = name => page.locator(`[data-match-setting="${name}"]`);
    const screen = name => page.locator(`#multiplayer-panel[data-screen="${name}"]:not(.is-hidden)`);
    await page.goto(`http://127.0.0.1:${server.address().port}/game.html?multiplayer-test=1&startup-probe=1`);
    await page.locator('[data-ui-command="multiplayer"]').click();
    await page.locator('[data-match-field="name"]').fill('Test pilot');
    await action('host').click();
    await screen('lobby').waitFor();
    assert.ok(await action('start').isDisabled());
    const add = async id => {
        await setting('bot-character').selectOption(id);
        await action('add-bot').click();
        await setting('bot-difficulty').and(page.locator(`[data-match-id="bot:${id}"]`)).waitFor();
    };
    await add('wisp');
    await action('remove-bot').and(page.locator('[data-match-id="bot:wisp"]')).click();
    await setting('bot-difficulty').and(page.locator('[data-match-id="bot:wisp"]')).waitFor({ state: 'detached' });
    await add('brick');
    const brick = setting('bot-difficulty').and(page.locator('[data-match-id="bot:brick"]'));
    await brick.selectOption('ace');
    assert.equal(await brick.inputValue(), 'ace');
    if (phone) {
        await setting('mode').selectOption('teams');
        await add('latch');
        await add('wisp');
        assert.equal(await setting('bot-team').count(), 3);
    }
    await page.screenshot({ path: `${output}/${profile}-bot-lobby.png` });
    assert.ok(await action('start').isDisabled(), 'the human must confirm their loadout');
    await action('open-loadout').click();
    await action('loadout-equipment').click();
    await action('confirm-loadout').click();
    await action('start').click();
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).screen === 'flight', null, { timeout: 180_000 });
    const launch = await page.evaluate(() => {
        const { controller } = __VOID_PRIVATEER__.getRuntime().arena.multiplayer;
        controller.stopClock();
        return controller.state.players.map(pilot => [pilot.name, pilot.bot?.difficulty]);
    });
    assert.equal(launch.length, phone ? 4 : 2);
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
    assert.ok(await action('start').isDisabled());
    assert.deepEqual(errors, []);
    console.log(`${profile}: one human completed ${phone ? '2v2 with three bots' : 'free-for-all with one bot'}. Bot fire, refit, relaunch and rematch passed.`);
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
