import {chromium} from '/Users/mhoeppner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out='/Users/mhoeppner/Desktop/Voidrunner/docs/cockpit-controls-test';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try {
const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:4184/game.html?drone-test=1');await page.waitForFunction(()=>window.__DRONE_TEST_READY__,null,{timeout:90000});
await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.ui.closeAdventure(false);r.ui.hideTitle();r.ui.hidePause();r.ui.clearToasts();r.setSetting('steering','stick');r.syncRender(0,performance.now());});
await page.locator('[data-ui-command=use-stick]').evaluate(e=>e.click());
const stick=page.locator('[data-touch-stick]');const box=await stick.boundingBox();if(!box)throw Error('Joystick missing');
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width,box.y+box.height/2);
const x=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.joystickX);if(x<.95)throw Error(`Steering failed ${x}`);
await page.mouse.up();if(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.joystickX)!==0)throw Error('Stick did not recenter');
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width,box.y);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
if(await page.evaluate(()=>Math.hypot(__VOID_PRIVATEER__.getRuntime().input.joystickX,__VOID_PRIVATEER__.getRuntime().input.joystickY))!==0)throw Error('Blur failed');
await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.hidePause());
const cdp=await page.context().newCDPSession(page);
const touch=(id,x,y)=>({id,x,y});
const cx=box.x+box.width/2,cy=box.y+box.height/2;
const boost=await page.locator('.touch-boost-right').boundingBox();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,cx,cy)]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,cx+25,cy)]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,cx+25,cy),touch(2,boost.x+boost.width/2,boost.y+boost.height/2)]});
if(!await page.evaluate(()=>{const i=__VOID_PRIVATEER__.getRuntime().input;return i.joystickX>0&&i.touchHeld.has('afterburner');}))throw Error('Simultaneous steering and boost failed');
await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
if(!await page.evaluate(()=>{const i=__VOID_PRIVATEER__.getRuntime().input;return i.joystickX===0&&!i.touchHeld.has('afterburner');}))throw Error('Touch cancellation failed');
console.log('Simultaneous steering/boost and touch cancellation passed');
for(const [name,width,height] of [['phone',844,390],['small-phone',667,375],['tablet',1024,768],['desktop',1440,900]]) {
 await page.setViewportSize({width,height});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hidePause();r.ui.hideDock();r.ui.showHud();r.save.player.dockedAt=null;r.syncRender(0,performance.now());});await page.screenshot({path:`${out}/${name}-flight.png`});
 await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');r.ui.dockTerminal='services';r.ui.renderDock();r.ui.clearToasts();});await page.screenshot({path:`${out}/${name}-services.png`});
 await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.dockTerminal='market';u.marketPoint='equipment';u.renderDock();});await page.screenshot({path:`${out}/${name}-equipment.png`});console.log(name,'captured');
}
console.log(JSON.stringify({steering:x,recenter:true,blur:true,errors}));if(errors.length)throw Error(errors.join('\n'));
} finally {await browser.close();}
