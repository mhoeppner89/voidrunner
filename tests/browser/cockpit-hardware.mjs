// All painted hulls in live career flight, one session per device. Set
// VR_ANNUNCIATOR_REVIEW=1 to keep the eight combinations per hull on desktop and Android.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium, webkit, devices} from 'playwright';
import {COCKPITS} from '../../src/game/cockpitDefinitions.js';
import {isolateBrowserProfiles, isolateBrowserHulls} from '../helpers/browser-profiles.mjs';

const profiles = {
    desktop:[chromium, {viewport:{width:1440,height:900}}],
    android:[chromium, devices['Pixel 7 landscape']],
    iphone:[webkit, devices['iPhone 13 landscape']],
    small:[chromium, {viewport:{width:667,height:375},deviceScaleFactor:2,isMobile:true,hasTouch:true}],
};
await isolateBrowserProfiles(import.meta.url, Object.keys(profiles));
await isolateBrowserHulls(import.meta.url);
const profile = process.env.VR_PROFILES;
const [engine, device] = profiles[profile];
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4212';
const capture = process.env.VR_ANNUNCIATOR_REVIEW === '1' && ['desktop','android'].includes(profile);
const browser = await engine.launch(engine === chromium ? {
    ...(existsSync(chrome) ? {executablePath:chrome} : {}),
    args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader'],
} : {headless:true});

// Let the actual capital launcher and projectile simulation run against a
// stationary pilot in open space. The normal flight frame drives the lamps.
async function checkLiveLock(page) {
    await page.emulateMedia({reducedMotion:'reduce'});
    const stages = await page.evaluate(async () => {
        const {updateFrigateBatteries} = await import('/src/game/capitalCombat.js');
        const {Vector3} = await import('three');
        const r = __VOID_PRIVATEER__.getRuntime(), p = r.save.player;
        const target = new Vector3(32000,32000,32000), velocity = new Vector3();
        r.ships.length = 0;
        p.shipId = 'atlas';
        r._statsDirty = true;
        const stats = r.playerStats();
        p.hull = stats.hull; p.shield = stats.shield;
        p.position = target.toArray(); p.velocity = velocity.toArray(); p.rotation = [0,0,0,1];
        r.resetPlayerInterpolation(true);
        r.ui.setCockpitShip(p.shipId);
        await r.ui.cockpitArtwork.ready;
        const ship = r.spawnCapitalShip('concord-frigate',[target.x,target.y,target.z+380]);
        Object.assign(ship,{targetId:'player',hostile:true,holdFire:false,rotation:[0,0,0,1]});
        r.save.world.time = Math.max(12,r.save.world.time);
        const lamp = r.ui.cockpitArtwork.lamp, stages = [];
        function readLamp() {
            r.updateFrame(r.lastFrame);
            const state = lamp.dataset.state;
            if (state !== stages.at(-1)?.state) stages.push({state, legend:lamp.innerText.trim()});
        }
        readLamp();
        for (let i=0;i<600;i++) {
            r.save.world.time += 1/60;
            updateFrigateBatteries(r,ship,1/60,target,velocity);
            if (i%6===0 || ship.capitalTorpedoes===0) readLamp();
            if (ship.capitalTorpedoes===0) break;
        }
        return {stages, torpedoes:r.projectiles.filter(p=>p.ownerId===ship.id && p.launcherId==='torpedo').length};
    });
    assert.equal(stages.torpedoes,2,'the hostile frigate actually fired its paired salvo');
    assert.deepEqual(stages.stages, [
        {state:'off',legend:'LOCK'}, {state:'acquiring',legend:'LOCK'},
        {state:'locked',legend:'LOCK'}, {state:'missile',legend:'MSL'},
    ], 'live receiver progression and reduced-motion legends');
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.equal((await page.locator('.painted-lock').innerText()).trim(),'LOCK','standard missile legend');
    const cleared = await page.evaluate(() => {
        const r=__VOID_PRIVATEER__.getRuntime();
        for (let i=0;i<660 && r.projectiles.length;i++) {
            r.save.world.time += 1/60;
            r.updateProjectiles(1/60);
            r.cleanupEntities();
        }
        r.updateFrame(r.lastFrame);
        return {state:r.ui.cockpitArtwork.lamp.dataset.state,alive:r.save.player.hull>0};
    });
    assert.deepEqual(cleared,{state:'off',alive:true},'the receiver clears when the salvo is gone');
}

async function checkReviewTransponder(page) {
    await page.goto(base+'/tools/playtest/cockpit-layout/index.html?embedded=1&hull=wayfarer');
    await page.waitForFunction(() => window.ready);
    const switchState = () => page.evaluate(() => [
        cockpitReview.state.transponder,cockpitReview.artwork.switch.getAttribute('aria-pressed'),
    ]);
    const b = await page.locator('.painted-xpdr').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height-4);
    await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
    const afterHold = await switchState();
    await page.keyboard.down('b');
    await page.evaluate(() => advanceTime(20));
    await page.keyboard.up('b');
    assert.deepEqual([afterHold,await switchState()],[[false,'false'],[true,'true']],
        'the review hold and B operate the same transponder and indicator');
}

try {
    const page = await browser.newPage({...device,serviceWorkers:'block'});
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.text().includes('Frame error')) errors.push(m.text()); });
    await page.addInitScript(() => {
        localStorage.setItem('void-privateer-settings-v1', JSON.stringify({music:0,effects:0,vibration:false}));
        const A = window.AudioContext ?? window.webkitAudioContext;
        if (A) A.prototype.resume = async function () { await this.suspend(); };
    });
    await page.goto(base + '/game.html?startup-probe=1');
    await page.waitForFunction(() => window.__VOID_PRIVATEER__?.newGame);
    await page.evaluate(() => __VOID_PRIVATEER__.newGame());
    await page.evaluate(async () => {
        const r = __VOID_PRIVATEER__.getRuntime();
        r.skipTutorial();
        await r.launch();
        await r.ui.cockpitArtwork.ready;
    });
    const button = page.locator('.painted-xpdr');
    await page.waitForFunction(() => {
        const r = __VOID_PRIVATEER__.getRuntime(), b = r.ui.cockpitArtwork.switch;
        if (b.disabled || !r.ui.cockpitArtwork.layout) return false;
        const rect = b.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width/2, rect.bottom-4)?.closest('.painted-xpdr') === b;
    });
    const rect = await button.boundingBox(), x = rect.x + rect.width/2, y = rect.y + rect.height-4;
    const on = () => page.evaluate(() => __VOID_PRIVATEER__.getRuntime().save.player.transponder !== false);
    assert.equal(await on(), true);
    if (device.hasTouch) await page.touchscreen.tap(x,y);
    else await page.mouse.click(x,y);
    assert.equal(await on(), true, 'a short tap leaves the transponder on');
    const monitor = await page.locator('.cockpit-screen-own').boundingBox();
    await page.mouse.move(x,y); await page.mouse.down();
    await page.mouse.move(monitor.x + monitor.width/2, monitor.y + monitor.height/2);
    await page.waitForTimeout(350); await page.mouse.up();
    assert.equal(await on(), true, 'sliding off cancels the hold');
    assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().ui.isModalOpen), false,
        'releasing a cancelled hold over the monitor leaves it closed');
    const touch = profile === 'android' ? await page.context().newCDPSession(page) : null;
    if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
    else { await page.mouse.move(x,y); await page.mouse.down(); }
    await page.waitForFunction(() => document.querySelector('.painted-xpdr').classList.contains('holding'));
    assert.equal(await button.locator('b').evaluate(el => getComputedStyle(el,'::after').animationName), 'xpdr-hold');
    await page.waitForTimeout(350);
    assert.equal(await on(), true, 'the transponder stays on until release');
    if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    else await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.painted-xpdr').getAttribute('aria-pressed') === 'false');
    assert.equal(await on(), false);
    await page.keyboard.press('b');
    await page.waitForFunction(() => document.querySelector('.painted-xpdr').getAttribute('aria-pressed') === 'true');
    assert.equal(await on(), true, 'keyboard changes reach the same indicator');

    // A viewport resize cancels the gesture while the thumb is still down.
    const viewport = page.viewportSize();
    await page.mouse.move(x,y); await page.mouse.down();
    const beforeWidth = await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork.layout.width);
    await page.setViewportSize({...viewport,width:viewport.width-24});
    await page.waitForFunction(width => __VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork.layout.width !== width,beforeWidth);
    const resizedMonitor = await page.locator('.cockpit-screen-own').boundingBox();
    await page.mouse.move(resizedMonitor.x+resizedMonitor.width/2,resizedMonitor.y+resizedMonitor.height/2);
    await page.waitForTimeout(350); await page.mouse.up();
    const afterResize = await page.evaluate(() => {
        const r=__VOID_PRIVATEER__.getRuntime();
        return [r.save.player.transponder !== false,r.ui.isModalOpen];
    });
    await page.setViewportSize(viewport);
    assert.deepEqual(afterResize,[true,false],'resizing during a hold leaves the switch and ship monitor alone');

    await button.focus();
    await page.keyboard.down('Enter');
    const afterPress = await on();
    await page.keyboard.down('Enter');
    const afterRepeat = await on();
    await page.keyboard.up('Enter');
    await page.keyboard.press('Space');
    const afterSpace = await on();
    await button.evaluate(el => el.click()); // Native activation with no pointer or key events.
    assert.deepEqual([afterPress,afterRepeat,afterSpace,await on()],[false,false,true,false],
        'Enter, Space and assistive activation each toggle once per press');

    // Touching XPDR after flying with a controller takes over before unplug.
    await page.evaluate(() => {
        const input=__VOID_PRIVATEER__.getRuntime().input;
        const pad={index:0,id:'XPDR controller',mapping:'standard',connected:true,
            axes:[.8,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
        Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
        input.readGamepad();
        pad.axes[0]=0;
    });
    assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.usingGamepad),true);
    if (device.hasTouch) await button.tap();
    else await button.click();
    const disconnected = await page.evaluate(() => {
        const r=__VOID_PRIVATEER__.getRuntime();
        Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});
        return r.input.getActions().controllerDisconnected;
    });
    assert.equal(disconnected,false,'releasing the controller after XPDR input keeps flight active');

    // Freeze at a real rendered cockpit. Hull switches still run the shipping
    // artwork loader, cached alpha map and viewport-specific control layout.
    await page.evaluate(() => cancelAnimationFrame(__VOID_PRIVATEER__.getRuntime().frameId));
    const hulls = process.env.VR_COCKPIT_HULLS?.split(',') ?? Object.keys(COCKPITS);
    const geometryErrors = [];
    for (const hull of hulls) {
        const failures = await page.evaluate(async hull => {
            const r = __VOID_PRIVATEER__.getRuntime(), c = r.ui.cockpitArtwork;
            r.save.player.shipId = hull;
            r.ui.setCockpitShip(hull);
            await c.ready;
            r.syncRender(0,performance.now());
            c.relayout();
            const l = c.layout, fail = [];
            const box = el => {
                const b = el.getBoundingClientRect();
                return {x:b.left-l.left,y:b.top-l.top,width:b.width,height:b.height};
            };
            const surface = await c.alphaResource(c.definition.shell,371,170);
            const faces = {lock:box(c.lamp), xpdr:box(c.switch.firstElementChild)};
            for (const [id,b] of Object.entries(faces)) {
                let min = 255;
                // A plate seated on a housing's top edge only needs its foot on the frame.
                const top = c.definition.hardwareSeat === 'top' ? b.y+b.height*.7 : b.y;
                for (let y=Math.floor(top/l.height*170); y<Math.ceil((b.y+b.height)/l.height*170); y++)
                    for (let x=Math.floor(b.x/l.width*371); x<Math.ceil((b.x+b.width)/l.width*371); x++)
                        min = Math.min(min, surface[y*371+x]);
                if (min<240) fail.push(id+' crosses transparent artwork (alpha '+min+')');
            }
            const hit = box(c.switch);
            if (hit.width*hit.height < 44*44-.1 || hit.width < 32 || hit.height < 43.99) fail.push('undersized hit area');
            const blocked = {...l.monitors,stick:l.stick,hand:l.hand,base:l.mount};
            const extended = (selector, pseudo) => {
                const el = document.querySelector(selector), b = box(el), cs = getComputedStyle(el, pseudo);
                if (cs.content === 'none') return b;
                const inset = side => Math.min(0,parseFloat(cs[side]) || 0);
                return {x:b.x+inset('left'),y:b.y+inset('top'),width:b.width-inset('left')-inset('right'),height:b.height-inset('top')-inset('bottom')};
            };
            blocked.hyper = extended('#hyperdrive-card','::after');
            if (l.touch) {
                for (const sel of ['[data-touch-throttle]','#touch-fire','#touch-missile'])
                    blocked[sel] = box(document.querySelector(sel));
                for (const sel of ['#touch-launcher-cycle','.touch-boost-right']) blocked[sel] = extended(sel,'::before');
            }
            const overlaps = (a,b) => Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x) > .05
                && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y) > .05;
            for (const [id,b] of Object.entries(blocked)) {
                if (overlaps(hit,b)) fail.push('XPDR hit area overlaps '+id);
                // LOCK ignores pointers, so it may sit over the invisible stick
                // touch zone; it must still clear the hand and base sprites.
                if (id !== 'stick' && overlaps(faces.lock,b)) fail.push('LOCK overlaps '+id);
            }
            if (overlaps(hit,faces.lock)) fail.push('XPDR overlaps LOCK');
            for (const px of [hit.x+1,hit.x+hit.width/2,hit.x+hit.width-1])
                for (const py of [hit.y+1,hit.y+hit.height/2,hit.y+hit.height-1])
                    if (document.elementFromPoint(l.left+px,l.top+py)?.closest('.painted-xpdr') !== c.switch)
                        fail.push('switch hit area intercepted at '+[px,py]);
            return fail;
        }, hull);
        geometryErrors.push(...failures.map(f => hull+' '+f));
        if (!capture) continue;
        const out = 'output/annunciator/'+profile+'/'+hull;
        await mkdir(out, {recursive:true});
        for (const state of ['off','acquiring','locked','missile']) for (const broadcasting of [true,false]) {
            await page.evaluate(([state,on]) => {
                const c = __VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork;
                c.setHardware(state,on,true,true);
                // Capture the lit phase of each flashing lens.
                for (const a of c.lamp.firstElementChild.getAnimations()) { a.pause(); a.currentTime=0; }
            }, [state,broadcasting]);
            await page.screenshot({path:out+'/'+state+'-'+(broadcasting?'on':'off')+'.jpg',quality:87,scale:'css'});
        }
    }
    assert.deepEqual(geometryErrors, [], profile);
    await checkLiveLock(page);
    await checkReviewTransponder(page);
    assert.deepEqual(errors, []);
    console.log(profile, hulls.length, 'painted hulls passed geometry and switch checks');
} finally {
    await browser.close();
}
