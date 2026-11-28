// Uses the packaged game UI with a simulated native bridge. Device discovery
// and socket interoperability are covered by the physical test in NATIVE_APPS.md.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium, devices} from 'playwright';
import {createMultiplayerServer} from '../../tools/multiplayer/serve.mjs';

const output = 'output/native/bridge-qa';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const action = (page, name) => page.locator(`[data-match-action="${name}"]`);
const lobby = page => page.locator('#multiplayer-panel[data-screen="lobby"]:not(.is-hidden)');
const browserFallbackRequests = [];
const errors = [];
let server;
let browser;

async function addPilot(name, settings) {
    const page = await browser.newPage(settings);
    page.setDefaultTimeout(20_000);
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    await page.route('**/multiplayer', route => {
        browserFallbackRequests.push(route.request().url());
        return route.abort();
    });
    await page.addInitScript(() => {
        localStorage.setItem('voidrunner-lang', 'en');
        localStorage.setItem('void-privateer-settings-v1', JSON.stringify({language: 'en', music: 0, effects: 0, vibration: false}));
        window.bridgeCommands = [];
        window.VoidrunnerNative = {
            postMessage(raw) {
                const command = JSON.parse(raw);
                if (command.type === 'send') command.packet = JSON.parse(command.payload);
                window.bridgeCommands.push(command);
            },
        };
    });
    return page;
}

async function command(page, type, properties = {}, packetType) {
    const result = await page.waitForFunction(({type, properties, packetType}) =>
        window.bridgeCommands.find(entry => entry.type === type &&
            Object.entries(properties).every(([key, value]) => entry[key] === value) &&
            (!packetType || entry.packet?.type === packetType)), {type, properties, packetType});
    return result.jsonValue();
}

function emit(page, session, type, fields = {}) {
    return page.evaluate(event => window.__voidrunnerNativeReceive(JSON.stringify(event)), {session, type, ...fields});
}

async function openMultiplayer(page, url, name) {
    await page.goto(url);
    await page.locator('[data-ui-command="multiplayer"]').click();
    await page.locator('[data-match-field="name"]').fill(name);
    return command(page, 'browse');
}

try {
    let base = process.env.VR_BASE_URL;
    if (!base) {
        server = await createMultiplayerServer();
        await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${server.address().port}`;
    }
    const url = new URL('index.html', base.endsWith('/') ? base : `${base}/`).href;
    await mkdir(output, {recursive: true});
    browser = await chromium.launch({executablePath: existsSync(chrome) ? chrome : undefined,
        args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio']});
    const host = await addPilot('host', {viewport: {width: 1100, height: 640}});
    const guest = await addPilot('guest', devices['Pixel 7 landscape']);
    const hostBrowse = await openMultiplayer(host, url, 'Kepler');
    await action(host, 'host').click();
    const {session: hostSession, name: roomName} = await command(host, 'host');
    await command(host, 'close', {session: hostBrowse.session});
    assert.notEqual(hostSession, hostBrowse.session);
    assert.equal(roomName, 'Kepler');
    await emit(host, hostSession, 'hosting');
    await lobby(host).waitFor();
    assert.ok(await action(host, 'start').isDisabled());

    const {session: guestSession} = await openMultiplayer(guest, url, 'Lumen');
    const roomId = 'kepler-room';
    await emit(guest, guestSession, 'rooms', {rooms: [{id: roomId, name: roomName}]});
    await guest.getByText(roomName, {exact: true}).waitFor();
    await guest.screenshot({path: `${output}/nearby-room.png`});
    await action(guest, 'join-nearby').click();
    await command(guest, 'join', {session: guestSession, roomId});

    const peerId = 'pilot-a';
    await emit(host, hostSession, 'open', {peerId});
    await emit(guest, guestSession, 'open', {peerId: 'host'});
    const hello = await command(guest, 'send', {peerId: 'host'}, 'hello');
    assert.equal(hello.packet.name, 'Lumen');
    await emit(host, hostSession, 'message', {peerId, payload: hello.payload});
    const assignment = await command(host, 'send', {peerId}, 'assign');
    const state = await command(host, 'send', {peerId}, 'state');
    assert.equal(assignment.packet.id, peerId);
    await emit(guest, guestSession, 'message', {peerId: 'host', payload: assignment.payload});
    await emit(guest, guestSession, 'message', {peerId: 'host', payload: state.payload});
    await lobby(guest).getByRole('cell', {name: 'Lumen You'}).waitFor();
    await lobby(host).getByText('Lumen', {exact: true}).waitFor();
    assert.ok(await action(host, 'start').isDisabled());
    for (const page of [host, guest]) {
        await action(page, 'open-loadout').click();
        await action(page, 'loadout-equipment').click();
        await action(page, 'confirm-loadout').click();
    }
    const ready = await command(guest, 'send', {peerId: 'host'}, 'command');
    assert.equal(ready.packet.action, 'confirm-loadout');
    await emit(host, hostSession, 'message', {peerId, payload: ready.payload});
    assert.ok(await action(host, 'start').isEnabled());

    const additionalGuests = [['pilot-b', 'Vela'], ['pilot-c', 'Tallis']];
    for (const [peerId, name] of additionalGuests) {
        assert.equal(await host.evaluate(() => window.bridgeCommands.some(entry => entry.type === 'visibility' && entry.visible === false)), false);
        await emit(host, hostSession, 'open', {peerId});
        await emit(host, hostSession, 'message', {peerId, payload: JSON.stringify({...hello.packet, name})});
        await lobby(host).getByText(name, {exact: true}).waitFor();
    }
    await command(host, 'visibility', {session: hostSession, visible: false});
    const fullRoom = await command(host, 'send', {peerId: 'pilot-c'}, 'state');
    assert.equal(fullRoom.packet.state.players.length, 4);
    await host.screenshot({path: `${output}/full-lobby.png`});

    await emit(host, hostSession, 'close', {peerId: 'pilot-c', reason: 'Left the room.'});
    await command(host, 'visibility', {session: hostSession, visible: true});
    await lobby(host).getByText('Tallis', {exact: true}).waitFor({state: 'hidden'});
    assert.deepEqual(browserFallbackRequests, []);
    assert.deepEqual(errors, []);
    console.log('Native bridge UI passed: room discovery, guest assignment, four-pilot withdrawal and seat reopening.');
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
}
