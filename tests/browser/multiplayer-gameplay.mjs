// The host fixture stages the collision and firing poses. Lobby changes,
// flight controls, purchases and relaunches use the real UI.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium, webkit, devices} from 'playwright';
import {createMultiplayerServer} from '../../tools/multiplayer/serve.mjs';

const hostProfile = process.env.VR_HOST_PROFILE ?? 'desktop';
const joinMethod = process.env.VR_JOIN_METHOD ?? 'room';
assert.ok(['desktop', 'iphone'].includes(hostProfile), 'Choose desktop or iphone for VR_HOST_PROFILE.');
assert.ok(['room', 'codes'].includes(joinMethod), 'Choose room or codes for VR_JOIN_METHOD.');
const guestProfile = hostProfile === 'iphone' ? 'android' : 'iphone';
const hostName = hostProfile === 'iphone' ? 'iPhone pilot' : 'Desktop pilot';
const guestName = guestProfile === 'android' ? 'Android pilot' : 'Phone pilot';
const variant = hostProfile === 'desktop' && joinMethod === 'room' ? '' : '/' + hostProfile + '-' + joinMethod;
const out = 'output/multiplayer/gameplay' + variant;
await mkdir(out, {recursive:true});
const browsers = [];
const pages = [];
const errors = [];
const timeout = 90_000;
let server;
const action = (page, id) => page.locator(`[data-match-action="${id}"]`);
const field = (page, id) => page.locator(`[data-match-field="${id}"]`);
const setting = (page, id) => page.locator(`[data-match-setting="${id}"]`);
const screen = (page, id) => page.locator(`#multiplayer-panel[data-screen="${id}"]:not(.is-hidden)`);
const waitSetting = (page, key, value) => page.waitForFunction(([key, value]) =>
    document.querySelector(`[data-match-setting="${key}"]`)?.value === value, [key,value]);

async function newDevice(name, browser, settings) {
    // The no-service case mocks a failed POST. A controlling worker can hide
    // that request from Playwright's route interception in WebKit.
    const page = await browser.newPage({...settings, serviceWorkers:joinMethod === 'codes' ? 'block' : 'allow'});
    page.setDefaultTimeout(timeout);
    pages.push([name, page]);
    if (joinMethod === 'codes') {
        // A static host serves the game assets, but has no room endpoint.
        await page.route('**/multiplayer', route => route.fulfill({status:405, contentType:'text/plain', body:'Method not allowed'}));
    }
    page.on('pageerror', error => {
        errors.push(name + ': ' + error.message);
        console.error(name, error.stack);
    });
    await page.addInitScript(() => {
        localStorage.setItem('voidrunner-lang', 'en');
        localStorage.setItem('void-privateer-settings-v1', JSON.stringify({language:'en', music:0, effects:0, vibration:false}));
        const Audio = window.AudioContext ?? window.webkitAudioContext;
        if (Audio) Audio.prototype.resume = async function () { await this.suspend(); };
        // Persist the coverage across a normal reload by the service worker.
        const storage = Storage.prototype;
        const record = operation => sessionStorage.setItem('mp-save-writes',
            JSON.stringify([...JSON.parse(sessionStorage.getItem('mp-save-writes') || '[]'), operation]));
        for (const method of ['setItem', 'removeItem', 'clear']) {
            const original = storage[method];
            storage[method] = function (...args) {
                if (this === localStorage && (method === 'clear' || String(args[0]).startsWith('void-privateer-save-v1'))) record(method);
                return original.apply(this, args);
            };
        }
    });
    return page;
}

async function flight(page, shipId, opponent) {
    await page.waitForFunction(([ship, opponent]) => {
        const runtime = window.__VOID_PRIVATEER__?.getRuntime();
        const frame = document.querySelector('.painted-cockpit-frame');
        return runtime?.arena?.multiplayer && runtime.save.player.shipId === ship && runtime.save.player.hull > 0 &&
            runtime.ships.some(s => s.matchPilot && s.name === opponent) &&
            document.querySelector('#game-shell')?.dataset.cockpitPaint === ship &&
            frame?.complete && frame.naturalWidth > 0 &&
            !document.querySelector('#hud')?.classList.contains('is-hidden') &&
            document.querySelector('#hyperdrive-card')?.disabled &&
            /\d+:\d{2}/.test(document.querySelector('#screen-event-ticker .ticker-line')?.title);
    }, [shipId, opponent], {timeout:180_000});
    for (const display of ['own','radar','target']) assert.ok(await page.locator('.cockpit-screen-' + display).isVisible());
    assert.ok(await page.locator('#viewport canvas').isVisible());
}

async function boxCenter(locator) {
    await locator.waitFor({state:'visible'});
    const {x, y, width, height} = await locator.boundingBox();
    return {x:x+width/2, y:y+height/2, width, height};
}

try {
    let base = process.env.VR_BASE_URL;
    if (!base) {
        server = await createMultiplayerServer();
        await new Promise((resolve,reject) => server.once('error',reject).listen(0, '127.0.0.1', resolve));
        base = 'http://127.0.0.1:' + server.address().port;
    }
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const chrome = await chromium.launch({executablePath:existsSync(chromePath) ? chromePath : undefined,
        args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    browsers.push(chrome);
    const safari = await webkit.launch();
    browsers.push(safari);
    const phone = devices['iPhone 13 landscape'];
    const host = hostProfile === 'iphone' ? await newDevice(hostProfile, safari, phone)
        : await newDevice(hostProfile, chrome, {viewport:{width:1100,height:640}});
    const guest = guestProfile === 'android' ? await newDevice(guestProfile, chrome, devices['Pixel 7 landscape'])
        : await newDevice(guestProfile, safari, phone);
    const gameUrl = new URL('game.html', base.endsWith('/') ? base : base + '/').href;
    await host.goto(gameUrl + '?multiplayer-test=1');
    await host.locator('[data-ui-command="multiplayer"]').click();
    await field(host, 'name').fill(hostName);
    await action(host, 'host').click();
    await screen(host, 'lobby').waitFor();
    assert.ok(await action(host, 'start').isDisabled());
    if (joinMethod === 'codes') {
        await host.getByText('Use invite codes to connect on this site.', {exact:true}).waitFor();
        await host.locator('details[data-match-details="manual"] > summary').click();
        await action(host, 'make-invite').click();
        const invite = await host.locator('[data-match-copy="invite"]').inputValue();
        assert.match(invite, /^VR1\./);
        await guest.goto(gameUrl);
        await guest.locator('[data-ui-command="multiplayer"]').click();
        await action(guest, 'show-join').click();
        await field(guest, 'name').fill(guestName);
        await field(guest, 'invite').fill(invite);
        await action(guest, 'join-code').click();
        const reply = await guest.locator('[data-match-copy="reply"]').inputValue();
        assert.match(reply, /^VR1\./);
        await field(host, 'reply').fill(reply);
        await action(host, 'accept-reply').click();
    } else {
        const roomLink = host.locator('[data-match-copy="room"]');
        const original = await roomLink.inputValue();
        assert.match(original, /#room=[a-f0-9]{32}$/);
        let expired = false;
        const expireNextPoll = async route => {
            if (!expired && route.request().postDataJSON()?.action === 'poll') {
                expired = true;
                return route.fulfill({status:410, json:{error:'This room has expired or closed.'}});
            }
            return route.continue();
        };
        await host.route('**/multiplayer', expireNextPoll);
        await host.waitForFunction(previous => {
            const value = document.querySelector('[data-match-copy="room"]')?.value;
            return Boolean(value && value !== previous);
        }, original, {timeout:15_000});
        assert.ok(expired, 'The host replaced its room link after HTTP 410');
        await host.unroute('**/multiplayer', expireNextPoll);
        const url = await roomLink.inputValue();
        assert.match(url, /#room=[a-f0-9]{32}$/);
        await guest.goto(url);
        await screen(guest, 'join').waitFor();
        await field(guest, 'name').fill(guestName);
        await action(guest, 'join-code').click();
    }
    await screen(guest, 'lobby').waitFor();
    await host.getByText(guestName, {exact:true}).waitFor();
    assert.ok(await setting(guest, 'siteId').isDisabled());

    await setting(host, 'mode').selectOption('teams');
    await waitSetting(guest, 'mode', 'teams');
    await setting(host, 'friendlyFire').selectOption('true');
    await waitSetting(guest, 'friendlyFire', 'true');
    assert.ok(await action(host, 'start').isDisabled(), 'Two pilots cannot start a 2v2');
    await setting(host, 'siteId').selectOption('acheron-horizon');
    await waitSetting(guest, 'siteId', 'acheron-horizon');
    await setting(host, 'durationMinutes').selectOption('10');
    await waitSetting(guest, 'durationMinutes', '10');
    await setting(host, 'mode').selectOption('ffa');
    await waitSetting(guest, 'mode', 'ffa');
    await setting(host, 'siteId').selectOption('verge-lanes');
    await waitSetting(guest, 'siteId', 'verge-lanes');
    await setting(host, 'starter').selectOption('wayfarer');
    await setting(guest, 'starter').selectOption('scrapper');
    const guestRow = host.locator('.match-table tbody tr').filter({hasText:guestName});
    await guestRow.getByText('Balor', {exact:true}).waitFor();
    const expectedScore = Number(await guestRow.locator('td').last().textContent());
    assert.ok(expectedScore > 0);
    await guest.screenshot({path:out + '/' + guestProfile + '-lobby.png'});
    console.log(hostProfile, 'host and', guestProfile, 'guest joined via', joinMethod, 'and replicated lobby settings.');

    await action(host, 'start').click();
    await Promise.all([flight(host, 'wayfarer', guestName), flight(guest, 'scrapper', hostName)]);
    await Promise.all([host.screenshot({path:out + '/' + hostProfile + '-hud.png'}), guest.screenshot({path:out + '/' + guestProfile + '-hud.png'})]);
    const rotation = await host.evaluate(() => [...__VOID_PRIVATEER__.getRuntime().ships[0].rotation]);
    const stick = await boxCenter(guest.locator('[data-touch-stick]'));
    await guest.mouse.move(stick.x, stick.y);
    await guest.mouse.down();
    try {
        await guest.mouse.move(stick.x + stick.width * .3, stick.y - stick.height * .2);
        await host.waitForFunction(before => {
            const q = __VOID_PRIVATEER__.getRuntime().ships[0].rotation;
            return Math.abs(q.reduce((dot,n,i) => dot + n * before[i], 0)) < .999;
        }, rotation, {timeout:15_000});
    } finally { await guest.mouse.up(); }
    console.log('Both cockpits loaded. The phone stick turned its ship on the host.');

    // Wait for the stick release to reach the authority before resetting the
    // pose. A late steering packet would keep turning the staged shooter.
    await host.waitForFunction(() => {
        const rt = __VOID_PRIVATEER__.getRuntime();
        const held = rt.arena.multiplayer.controller.world.inputs.get(rt.ships[0].id)?.held;
        return held?.pitch === 0 && held.yaw === 0;
    });
    const separated = await host.evaluate(async () => {
        const [{ Vector3, Quaternion }, { shipVsShip }] = await Promise.all([
            import('three'), import('./src/game/shipCollision.js'),
        ]);
        const { controller } = __VOID_PRIVATEER__.getRuntime().arena.multiplayer;
        const world = controller.world;
        const [a, b] = world.actors();
        const { x, y, z } = world.center;
        a.position.splice(0, 3, x, y, z + 3);
        b.position.splice(0, 3, x, y, z);
        a.rotation.splice(0, 4, 0, 0, 0, 1);
        b.rotation.splice(0, 4, 0, 1, 0, 0);
        for (const actor of [a, b]) {
            actor.velocity.fill(0);
            actor.angularVelocity.fill(0);
            actor.throttle = 0;
        }
        const overlaps = () => shipVsShip(
            new Vector3(...a.position), new Quaternion(...a.rotation), a.variant, a.scale,
            new Vector3(...b.position), new Quaternion(...b.rotation), b.variant, b.scale, {},
        );
        const startedOverlapping = overlaps();
        for (let i = 0; i < 12; i++) world.step();
        if (!startedOverlapping || overlaps() || ![...a.position, ...b.position].every(Number.isFinite))
            throw Error('Overlapping multiplayer hulls did not separate with finite positions.');
        controller.publishWorld(true);
        return { host: a.position.slice(), guest: b.position.slice() };
    });
    await guest.waitForFunction(expected => {
        const {save, ships} = __VOID_PRIVATEER__.getRuntime();
        const close = (actual, want) => actual?.every((n, i) => Number.isFinite(n) && Math.abs(n - want[i]) < 1);
        return close(save.player.position, expected.guest) && close(ships[0]?.position, expected.host);
    }, separated);
    console.log('Overlapping Hestia and Balor hulls separated on the host and both positions reached the guest.');
    assert.equal(await host.evaluate(() => __VOID_PRIVATEER__.stageMultiplayerDuel()), true);
    await guest.waitForFunction(() => {
        const {save, ships} = __VOID_PRIVATEER__.getRuntime();
        const d = Math.hypot(...save.player.position.map((n,i) => n - ships[0].position[i]));
        return d > 50 && d < 180;
    });
    await guest.locator('.cockpit-screen-target').tap();
    await guest.waitForFunction(() => {
        const runtime = __VOID_PRIVATEER__.getRuntime();
        return runtime.save.player.currentTargetId === runtime.ships[0].id;
    });
    const shield = await host.evaluate(() => __VOID_PRIVATEER__.getRuntime().save.player.shield);
    const fire = await boxCenter(guest.locator('#touch-fire'));
    await guest.mouse.move(fire.x, fire.y);
    await guest.mouse.down();
    try {
        await host.waitForFunction(shield => __VOID_PRIVATEER__.getRuntime().save.player.shield < shield, shield, {timeout:20_000});
        await screen(host, 'shop').waitFor({timeout:40_000});
    } finally { await guest.mouse.up(); }
    for (const page of [host, guest]) {
        const debris = await page.evaluate(() => {
            const {renderer} = __VOID_PRIVATEER__.getRuntime();
            const wreck = renderer.effects.find(effect => effect.combatWreck);
            const plates = renderer.effects.find(effect => effect.maxLife === 14 && effect.object.children[0]?.isInstancedMesh);
            return {
                sections: wreck?.sections.length ?? 0,
                attached: wreck?.object.parent === renderer.scene,
                plates: plates?.object.children[0].count ?? 0,
            };
        });
        assert.ok(debris.attached && debris.sections >= 5, `Destroyed hull must break up on both peers: ${JSON.stringify(debris)}`);
        assert.equal(debris.plates, 36);
    }
    const victimRow = host.locator('.match-table tbody tr').filter({hasText:hostName});
    assert.equal(await victimRow.locator('td').nth(3).innerText(), '1', 'Host death is recorded once');
    assert.equal(await guestRow.locator('td').nth(2).innerText(), '1', 'Guest gets the kill');
    assert.equal(Number(await guestRow.locator('td').last().innerText()), expectedScore);
    const bank = host.locator('.match-bank > b');
    assert.equal(Number((await bank.innerText()).replace(/\D/g, '')), 1000);
    await host.screenshot({path:out + '/' + hostProfile + '-refit.png'});
    await host.locator('details[data-match-details="hulls"] > summary').click();
    await host.locator('[data-match-action="buy-hull"][data-match-id="speedster"]').click();
    await host.waitForFunction(() => document.querySelector('.match-bank > b')?.textContent.replace(/\D/g,'') === '0');
    await action(host, 'respawn').click();
    await flight(host, 'speedster', guestName);
    await guest.waitForFunction(() => __VOID_PRIVATEER__.getRuntime().ships.some(s =>
        s.shipId === 'speedster' && s.hull === s.maxHull && s.life === 2));
    console.log('Guest fire killed the host. Score, 1,000 credits, hull purchase and relaunch passed.');

    await guest.locator('[data-ui-command="pause"]').click();
    await screen(guest, 'score').waitFor();
    await screen(guest, 'score').locator('[data-ui-command="multiplayer-back"]').click();
    await host.evaluate(() => window.advanceTime(600_000));
    for (const page of [host, guest]) {
        const result = screen(page, 'ended');
        await result.waitFor();
        assert.equal(await result.locator('.match-result').innerText(), 'Winner · ' + guestName);
        const winnerRow = result.locator('tbody tr').filter({hasText:guestName});
        assert.equal(Number(await winnerRow.locator('td').last().innerText()), expectedScore);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().arena.multiplayer.controller.state.result.reason), 'time');
    }
    await guest.screenshot({path:out + '/' + guestProfile + '-result.png'});
    await action(host, 'rematch').click();
    await Promise.all([screen(host, 'lobby').waitFor(), screen(guest, 'lobby').waitFor()]);
    assert.ok(await action(host, 'start').isEnabled());
    await screen(host, 'lobby').locator('[data-ui-command="multiplayer-back"]').click();
    await screen(guest, 'disconnected').waitFor();
    await screen(guest, 'disconnected').locator('[data-ui-command="multiplayer-back"]').click();
    await guest.locator('[data-ui-command="multiplayer"]').waitFor({state:'visible'});
    for (const [name,page] of pages) {
        const career = await page.evaluate(() => ({
            save:localStorage.getItem('void-privateer-save-v1'),
            writes:JSON.parse(sessionStorage.getItem('mp-save-writes') || '[]'),
        }));
        assert.deepEqual(career, {save:null, writes:[]}, name + ' kept Career storage untouched');
    }
    assert.deepEqual(errors, []);
    console.log('Both pilots saw the timed result and returned to the lobby. Host departure disconnected the guest. Both Career saves remained untouched.');
} catch (error) {
    for (const [name,page] of pages) {
        if (page.isClosed()) continue;
        const status = await page.evaluate(() => {
            const panel = document.querySelector('#multiplayer-panel');
            const rt = window.__VOID_PRIVATEER__?.getRuntime();
            return {
                screen:panel?.dataset.screen, status:panel?.querySelector('[role=status]')?.textContent,
                load:document.querySelector('#loading-screen:not(.is-hidden)')?.innerText,
                focus:document.hasFocus(), hull:rt?.save.player.hull, shield:rt?.save.player.shield,
                ship:rt?.save.player.shipId, foes:rt?.ships.map(s => [s.shipId,s.hull,s.shield]), tick:rt?.save.world.time,
                q:rt?.save.player.rotation, velocity:rt?.save.player.velocity, input:rt?.arena.multiplayer.me?.targetId,
                energy:rt?.save.player.energy, shots:rt?.projectiles.length,
                ticker:document.querySelector('#screen-event-ticker .ticker-line')?.title,
            };
        }).catch(() => null);
        console.error(name, status);
        await page.screenshot({path:out + '/' + name + '-failure.png', timeout:6000}).catch(() => {});
    }
    throw error;
} finally {
    await Promise.all(browsers.map(browser => browser.close()));
    if (server) await new Promise(resolve => server.close(resolve));
}
