// Exercises real data channels against the packed game and the LAN room service.
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {chromium, webkit, devices} from 'playwright';
import {createMultiplayerServer} from '../../tools/multiplayer/serve.mjs';

const server = await createMultiplayerServer();
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const requested = process.env.VR_PROFILES || 'desktop';
const browsers = [];
try {
    const request = body => fetch(base + '/multiplayer', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    });
    const owner = await (await request({action:'create'})).json();
    const roomId = owner.room;
    const visitor = await (await request({action:'join', room:roomId, offer:'VR1.test'})).json();
    const outsider = await (await request({action:'join', room:roomId, offer:'VR1.test'})).json();
    assert.equal((await request({action:'poll', room:roomId, key:visitor.key})).status, 403);
    assert.equal((await request({action:'read', room:roomId, id:visitor.id, key:outsider.key})).status, 403);
    assert.equal((await request({action:'close', room:roomId, key:visitor.key})).status, 403);
    assert.equal((await request({action:'close', ...owner})).status, 200);
    assert.equal((await request({action:'poll', ...owner})).status, 410);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/tools/multiplayer/serve.mjs')).status, 404);

    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const executablePath = await access(chrome).then(() => chrome, () => undefined);
    const desktop = await chromium.launch({executablePath, args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']});
    browsers.push(desktop);
    const mobile = requested.includes('iphone') ? await webkit.launch() : desktop;
    if (mobile !== desktop) browsers.push(mobile);

    async function pilot(role, engine, device = {}) {
        const page = await engine.newPage({...device, serviceWorkers:'block'});
        await page.route('**/link-test', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Direct connection check</title>'}));
        await page.goto(base + '/link-test');
        await page.evaluate(async role => {
            const {PeerLink} = await import('/src/game/multiplayer/peerLink.js');
            window.messages = [];
            window.disconnects = [];
            window.link = new PeerLink({role,
                onMessage:(id, message) => messages.push([id,message]),
                onClose:(id, reason) => disconnects.push([id,reason]),
            });
        }, role);
        return page;
    }
    const mobileHost = process.env.VR_HOST_PROFILE === 'iphone';
    const phone = mobile === desktop ? devices['Pixel 7 landscape'] : devices['iPhone 13 landscape'];
    const host = await pilot('host', mobileHost ? mobile : desktop, mobileHost ? phone : {});
    const guestA = await pilot('guest', mobileHost ? desktop : mobile, mobileHost ? {} : phone);
    const invite = await host.evaluate(() => link.createInvite());
    const reply = await guestA.evaluate(code => link.acceptInvite(code), invite);
    await host.evaluate(code => link.acceptReply(code), reply);
    await guestA.waitForFunction(() => link.peerIds.includes('host'));
    await host.waitForFunction(() => link.peerIds.length === 1);
    await assert.rejects(host.evaluate(code => link.acceptReply(code), reply), /already been used/);
    console.log('Manual invitation and reply connected.');

    const room = await host.evaluate(() => link.openRoom());
    const guests = await Promise.all([pilot('guest', desktop), pilot('guest', desktop)]);
    await Promise.all(guests.map(page => page.evaluate(url => link.joinRoom(url), room)));
    await host.waitForFunction(() => link.peerIds.length === 3);
    await assert.rejects(host.evaluate(() => link.createInvite()), /three guest seats/);
    const allGuests = [guestA, ...guests];
    for (const [index, page] of allGuests.entries()) {
        await page.waitForFunction(() => link.peerIds.includes('host'));
        assert.equal(await page.evaluate(index => {
            for (let sequence = 0; sequence < 4; ++sequence)
                if (!link.send('host', {kind:'input', index, sequence})) return false;
            return true;
        }, index), true);
    }
    await host.waitForFunction(() => messages.length === 12);
    const packets = await host.evaluate(() => messages);
    assert.equal(new Set(packets.map(([id]) => id)).size, 3);
    for (let index = 0; index < 3; index++) {
        const received = packets.filter(([, x]) => x.index === index);
        assert.deepEqual(received.map(([, x]) => x.sequence), [0,1,2,3]);
        assert.equal(new Set(received.map(([id]) => id)).size, 1);
    }
    await host.evaluate(() => link.broadcast({kind:'snapshot', frame:17}, {latest:true}));
    await Promise.all(allGuests.map(page => page.waitForFunction(() => messages.some(([id,x]) => id === 'host' && x.frame === 17))));
    const denseSnapshot = {kind:'snapshot', positions:'🛸12.3456789'.repeat(9000)};
    await host.evaluate(snapshot => link.broadcast(snapshot, {latest:true}), denseSnapshot);
    for (const page of allGuests) {
        await page.waitForFunction(() => messages.some(([,x]) => x.positions));
        assert.deepEqual(await page.evaluate(() => messages.find(([,x]) => x.positions)[1]), denseSnapshot);
    }
    const denied = await pilot('guest', desktop);
    await assert.rejects(denied.evaluate(url => link.joinRoom(url), room), /three guest seats/);
    await guestA.evaluate(() => link.close());
    await host.waitForFunction(() => link.peerIds.length === 2);
    await denied.evaluate(url => link.joinRoom(url), room);
    await host.waitForFunction(() => link.peerIds.length === 3);
    await host.evaluate(() => link.close());
    await Promise.all([...guests, denied].map(page => page.waitForFunction(() => !link.peerIds.length)));
    console.log('Room link connected three guest seats. Ordered inputs, broadcast snapshot, full room, disconnect and seat reuse passed.');
} finally {
    await Promise.all(browsers.map(browser => browser.close()));
    await new Promise(resolve => server.close(resolve));
}
