import {chromium} from '/Users/mhoeppner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out='/Users/mhoeppner/Desktop/Voidrunner/docs/cockpit-controls-test';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try {
const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:4184/game.html?drone-test=1');await page.waitForFunction(()=>window.__DRONE_TEST_READY__,null,{timeout:90000});
await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.ui.closeAdventure(false);r.ui.hideTitle();r.ui.hidePause();r.ui.clearToasts();r.setSetting('steering','stick');r.syncRender(0,performance.now());});
await page.locator('[data-ui-command=use-stick]').evaluate(e=>e.click());

const result=await page.evaluate(()=>{
 const r=__VOID_PRIVATEER__.getRuntime(),u=r.ui;
 const target=r.getTargetRef();const asteroid=r.asteroids.find(a=>a.id===target.id);
 asteroid.scanned=false;r.scanCooldown=0;r.autoScanTarget();
 const scanned=asteroid.scanned;
 u.updateWeaponButtons('asteroid');const asteroidHidden=u.el('#touch-missile').dataset.touchAction==='miningDrones';
 u.updateWeaponButtons('wreck');const wreckHidden=u.el('#touch-missile').dataset.touchAction==='utility';
 u.updateWeaponButtons('ship');const combatVisible=u.el('#touch-missile').dataset.touchAction==='missile';
 u.updateWeaponButtons({kind:'ship',surrendered:true,captureAvailable:true});
 if(u.el('#touch-missile').dataset.touchAction!=='capture'||u.el('#touch-fire').dataset.touchAction!=='fire')throw Error('Capture/fire mapping failed');
 u.updateWeaponButtons('asteroid');
 return {scanned,asteroidHidden,wreckHidden,combatVisible,radarClear:!document.querySelector('#screen-radar-transponder')};
});
if(Object.values(result).some(v=>!v))throw Error(JSON.stringify(result));
await page.locator('#touch-missile').tap();
const action=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions());
if(!action.miningDrones||action.missile||action.scan)throw Error('Drone button emitted wrong action');
await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.updateWeaponButtons('wreck'));
const pad=await page.locator('#touch-missile').boundingBox();
await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);await page.mouse.down();
if(!await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().utility))throw Error('Tractor hold failed');
await page.mouse.up();
if(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.getActions().utility))throw Error('Tractor release failed');
await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.updateWeaponButtons('asteroid');u.showShipMenu();});
const before=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder);
await page.locator('[data-ui-command=transponder-toggle]').tap();
const after=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder);
if(before===after)throw Error('Ship-menu transponder toggle failed');
await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideShipMenu();r.syncRender(0,performance.now());});
await page.locator('#radar').click();
await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.hideMap());
await page.screenshot({path:`${out}/phone-flight.png`});
console.log(JSON.stringify({...result,transponderToggle:true,errors}));
if(errors.length)throw Error(errors.join('\n'));
} finally {await browser.close();}
