import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { FLIGHT_CONTROLLER_BINDINGS as F } from '../../src/game/controllerBindings.js';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'output/controller', base = process.env.VR_BASE_URL ?? 'http://127.0.0.1:4212';
await mkdir(out, { recursive: true });
const reports = [];
for (const [profile, engine, device] of [['desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['android', chromium, devices['Pixel 7 landscape']], ['iphone', webkit, devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES || process.env.VR_PROFILES.split(',').includes(name))) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? {executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--disable-gpu-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=metal']} : {}) });
    let page;
    try {
        page = await browser.newPage({ ...device, serviceWorkers: 'allow' });
        page.setDefaultTimeout(90000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            localStorage.setItem('void-privateer-settings-v1', JSON.stringify({ music: 0, effects: 0 }));
            window.testPad = { index: 0, id: 'Virtual standard controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
            window.rumbleCalls=[];
            window.rumbleActuator={effects:['dual-rumble'],playEffect(type,parameters){rumbleCalls.push({type,...parameters});return Promise.resolve('complete');},reset(){rumbleCalls.push({reset:true});return Promise.resolve('complete');}};
            testPad.vibrationActuator=rumbleActuator;
            Object.defineProperty(navigator, 'getGamepads', { value: () => [testPad.connected ? testPad : null] });
            const Audio = window.AudioContext ?? window.webkitAudioContext;
            if (Audio) Audio.prototype.resume = async function () { await this.suspend(); };
        });
        await page.goto(`${base}/game.html?revision=0.8.2of`);
        await page.waitForFunction(() => window.__VOID_PRIVATEER__?.newGame);
        await page.waitForFunction(() => navigator.serviceWorker.controller);
        await page.reload();
        await page.waitForFunction(() => window.__VOID_PRIVATEER__?.newGame);
        await page.waitForTimeout(250);
        assert.match(await page.locator('.title-version').textContent(), /0\.8\.\d+[a-z]*/);
        const set = async (buttons = [], axes = [0, 0, 0, 0]) => {
            await page.evaluate(({ buttons, axes }) => { testPad.axes = axes; testPad.buttons.forEach((button, index) => { button.pressed = buttons.includes(index); button.value = button.pressed ? 1 : 0; }); }, { buttons, axes });
            await page.waitForTimeout(110);
        };
        const tap = async index => { await set([index]); await set(); };
        const focus = async selector => {
            // X is the documented linear fallback for complex menu layouts.
            for (let i = 0; i < 150; i++) {
                if (await page.evaluate(selector => document.activeElement?.matches(selector), selector)) return;
                await tap(2);
            }
            throw new Error(`Controller cannot reach ${selector}`);
        };
        // During the pad animation only its skip control may be activated,
        // even if the ship's launch hotspot is already in the same scene.
        await page.evaluate(()=>{
            const fixture=document.createElement('div');fixture.id='landing-controller-check';
            const launch=document.createElement('button');launch.textContent='Launch';launch.onclick=()=>{window.unwantedLaunch=true;};
            const skip=document.createElement('button');skip.className='planet-transit-skip concourse-landing-skip';skip.textContent='Skip';skip.onclick=()=>{window.skippedLanding=true;fixture.remove();};
            fixture.append(launch,skip);document.querySelector('#game-shell').append(fixture);
        });
        await page.waitForTimeout(200); await tap(0);
        assert.equal(await page.evaluate(()=>window.skippedLanding),true);
        assert.equal(await page.evaluate(()=>Boolean(window.unwantedLaunch)),false);
        await focus('[data-ui-command="options"]'); await tap(0);
        await page.locator('#pause-panel:not(.is-hidden)').waitFor();
        await tap(5); // flight -> controls tab
        assert.equal(await page.locator('[data-settings-tab="controls"]').getAttribute('aria-selected'), 'true');
        await focus('[data-ui-command="test-vibration"]'); await tap(0);
        assert.match(await page.locator('[data-vibration-status]').textContent(),/gesendet/);
        assert.equal(await page.evaluate(()=>rumbleCalls.filter(c=>c.duration===300).length),1);
        await focus('[data-setting="vibration"]'); await tap(0);
        await focus('[data-ui-command="test-vibration"]'); await tap(0);
        assert.match(await page.locator('[data-vibration-status]').textContent(),/Aktiviere/);
        await focus('[data-setting="vibration"]'); await tap(0);
        await page.evaluate(()=>{testPad.vibrationActuator=undefined;});
        await focus('[data-ui-command="test-vibration"]'); await tap(0);
        assert.match(await page.locator('[data-vibration-status]').textContent(),/keine Vibration/);
        await page.evaluate(()=>{testPad.vibrationActuator=rumbleActuator;});
        await focus('[data-setting="controllerDeadzone"]'); await tap(15);
        assert.equal(Number(await page.locator('[data-setting="controllerDeadzone"]').inputValue()), .14);
        await focus('[data-setting="controllerSensitivity"]'); await tap(15);
        assert.equal(Number(await page.locator('[data-setting="controllerSensitivity"]').inputValue()), 1.05);
        assert.equal(await page.locator('[data-setting="controllerLayout"]').count(),0);
        await page.screenshot({ path: `${out}/${profile}-settings.png` });
        await tap(1);
        await focus('[data-ui-command="new"]'); await tap(0);
        await page.locator('#new-career-panel:not(.is-hidden)').waitFor();
        await focus('[data-ui-command="skip-new-career"]'); await tap(0);
        await page.waitForFunction(() => __VOID_PRIVATEER__.getRuntime()?.flightPrepared && document.querySelector('#loading-screen').classList.contains('is-hidden'));
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().save.settings.controllerDeadzone), .14);
        await focus('[data-ui-command="launch"]'); await tap(0);
        await page.waitForFunction(() => !__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
        // Skip any real transit/landing shot with the controller alone.
        for (let i = 0; i < 5; i++) {
            if (!await page.locator('.planet-transit').count()) break;
            await tap(0); await page.waitForTimeout(150);
        }
        await page.waitForFunction(() => !__VOID_PRIVATEER__.getRuntime().ui.planetTransitOverlay);
        await set(); await page.waitForTimeout(200);
        // Isolate flight from encounters/collisions; preserve the actual frame loop.
        await page.evaluate(() => { const r = __VOID_PRIVATEER__.getRuntime(); r.save.player.position = [0, 90000, 0]; r.save.player.velocity.fill(0); r.save.player.throttle = 0; r.ships = []; r.resetPlayerInterpolation(true); });
        const contextBefore=await page.evaluate(()=>{const p=__VOID_PRIVATEER__.getRuntime().save.player;return {mode:p.mode,target:p.currentTargetId??null};});
        await page.keyboard.press('KeyC');
        assert.deepEqual(await page.evaluate(()=>{const p=__VOID_PRIVATEER__.getRuntime().save.player;return {mode:p.mode,target:p.currentTargetId??null};}),contextBefore,'removed C switch does not alter activity or target');
        const rotation = await page.evaluate(() => [...__VOID_PRIVATEER__.getRuntime().save.player.rotation]);
        await set([], [.8, -.5, .4, -.8]); await page.waitForTimeout(350); await set();
        const flown = await page.evaluate(() => { const r = __VOID_PRIVATEER__.getRuntime(); return { rotation: [...r.save.player.rotation], throttle: r.save.player.throttle }; });
        assert.notDeepEqual(flown.rotation, rotation); assert.ok(flown.throttle > 0);
        const transponder=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder);
        await set([F.afterburner]);
        assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().afterburner),true);
        assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder),transponder);
        await tap(14);
        assert.notEqual(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder),transponder);
        await tap(14);
        await set([4]);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().roll),0);
        await set([5]);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().roll),0);
        await set([F.secondary]);
        assert.deepEqual(await page.evaluate(()=>{const a=__VOID_PRIVATEER__.getRuntime().input.getActions();return [a.utility,a.throttleDelta];}),[true,0]);
        await set();
        await page.evaluate(()=>{rumbleCalls.length=0;});
        await set([F.fire]); await page.waitForTimeout(250);
        assert.ok(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().input.getActions().fire));
        await set();
        assert.ok(await page.evaluate(()=>rumbleCalls.some(c=>c.weakMagnitude>0&&c.duration<100)),'real firing sends motor commands');
        await page.evaluate(()=>{rumbleCalls.length=0;__VOID_PRIVATEER__.getRuntime().damagePlayer(8,'collision',true);});
        assert.ok(await page.evaluate(()=>rumbleCalls.some(c=>c.strongMagnitude>=.3)),'real damage sends a stronger pulse');
        await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().setSetting('vibration',false);rumbleCalls.length=0;});
        await set([F.fire]);await page.waitForTimeout(160);await set();
        await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().damagePlayer(8,'collision',true));
        assert.equal(await page.evaluate(()=>rumbleCalls.filter(c=>c.duration>0).length),0,'off blocks gameplay rumble');
        await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().setSetting('vibration',true));
        await set([F.fire]);await set();
        await tap(12); await page.locator('#ship-panel:not(.is-hidden)').waitFor();
        assert.ok(await page.evaluate(()=>rumbleCalls.some(c=>c.reset)),'opening a menu resets motors');
        await set([F.fire]);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().input.getActions().fire), false, 'menus suppress combat input');
        await set([1,F.fire]);
        await page.locator('#ship-panel').waitFor({state:'hidden'});
        await set([F.fire]);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().input.getActions().fire), false, 'held menu trigger cannot leak into flight');
        await set();
        await tap(8); await page.locator('#map-panel:not(.is-hidden)').waitFor();
        await tap(1); await page.locator('#map-panel').waitFor({state:'hidden'});
        await tap(9); await page.locator('#pause-panel:not(.is-hidden)').waitFor();
        await page.screenshot({ path: `${out}/${profile}-pause.png` });
        await tap(9); await page.locator('#pause-panel').waitFor({state:'hidden'});
        await set([], [.4, 0, 0, 0]); await set();
        await page.evaluate(() => { testPad.connected = false; });
        await page.locator('#pause-panel:not(.is-hidden)').waitFor();
        await page.keyboard.press('Escape');
        await page.locator('#pause-panel').waitFor({state:'hidden'});
        await page.evaluate(() => { testPad.connected = true; testPad.buttons[0].pressed = true; });
        await page.waitForTimeout(160);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().input.getActions().fire), false, 'hotplug held trigger is suppressed');
        await set(); await set([F.fire]);
        assert.equal(await page.evaluate(() => __VOID_PRIVATEER__.getRuntime().input.getActions().fire), true);
        await set();
        await page.screenshot({ path: `${out}/${profile}-flight.png` });
        await page.evaluate(() => {
            const r=__VOID_PRIVATEER__.getRuntime();
            r.ui.startAdventure(r.ui.barPeople('helix').find(person=>person.id==='rin-vek'), {start:'one',nodes:{one:{text:'Controller dialogue test.',choices:[{label:'Continue',next:'two'}]},two:{text:'Second dialogue page.',next:'@end'}}},true);
        });
        await page.waitForTimeout(200);
        await focus('[data-ui-command="adventure-choice"]'); await tap(0);
        assert.match(await page.locator('#adventure-panel').textContent(), /Second dialogue page/);
        await tap(1); await page.locator('#adventure-panel').waitFor({state:'hidden'});
        await tap(9);
        await focus('.pause-menu-actions > summary'); await tap(0);
        await focus('[data-ui-command="quit-title"]'); await tap(0);
        await page.locator('#title-screen').waitFor({state:'visible'});
        await focus('[data-ui-command="arena"]'); await tap(0);
        await focus('[data-ui-command="new-arena-run"]'); await tap(0);
        await page.locator('[data-run-action="hull"]').first().waitFor();
        await focus('[data-run-action="hull"]'); await tap(0);
        await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.save.arenaRun?.offers?.length>0);
        for(let pick=0;pick<2;pick++){
            await page.waitForTimeout(200);
            await focus('[data-run-action="reward"]'); await tap(0);
            await focus('[data-run-action="accept"]'); await tap(0);
        }
        await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.isModalOpen && !__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
        await set(); await tap(9); await page.locator('#pause-panel:not(.is-hidden)').waitFor();
        await page.screenshot({path:`${out}/${profile}-arena.png`});
        assert.deepEqual(errors, []);
        reports.push({ profile, controllerOnlyTitleSettingsCareerLaunch: true, flight: flown, menusAndDisconnect: true, haptics:true, dialogueAndArena: true, landingSkip: true, errors });
        console.log(profile, 'controller checks passed');
    } catch(error) {
        await page?.screenshot({path:`${out}/${profile}-failure.png`}).catch(()=>{});
        const state=await page?.evaluate(()=>{const r=window.__VOID_PRIVATEER__?.getRuntime();return {active:document.activeElement?.outerHTML?.slice(0,500),focus:r?.ui.controller?.focused?.outerHTML?.slice(0,500),scope:r?.ui.controller?.lastScope?.id,armed:r?.ui.controller?.armed,run:r?.save.arenaRun,modal:r?.ui.isModalOpen,docked:r?.save.player.dockedAt};}).catch(()=>null);
        await writeFile(`${out}/${profile}-failure.json`,JSON.stringify({message:error.message,state},null,2));
        throw error;
    } finally {
        // Chrome can finish its process before Playwright resolves close on
        // this host. Bound cleanup so the next device profile still runs.
        let timer;
        try { await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]); }
        finally {clearTimeout(timer);}
    }
}
await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2));
