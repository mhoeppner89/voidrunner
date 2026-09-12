import {chromium} from '/Users/mhoeppner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const out='/Users/mhoeppner/Desktop/Voidrunner/docs/cockpit-controls-test';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try {
const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:4184/game.html?drone-test=1');await page.waitForFunction(()=>window.__DRONE_TEST_READY__,null,{timeout:90000});
await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.ui.closeAdventure(false);r.ui.hideTitle();r.ui.hidePause();r.ui.clearToasts();r.setSetting('steering','stick');r.syncRender(0,performance.now());});
await page.locator('[data-ui-command=use-stick]').evaluate(e=>e.click());

for(const [name,width,height] of [['phone',844,390],['small-phone',667,375],['tablet',1024,768],['desktop',1440,900]]) {
 await page.setViewportSize({width,height});
 for(const scale of [1,1.3]) {
 await page.evaluate(scale=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.setTouchScale(scale);r.syncRender(0,performance.now());},scale);
 const metrics=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();const a=b('.cockpit-art'),m=b('.cockpit-screen-own'),j=b('[data-touch-stick]'),k=b('[data-touch-stick-knob]');return {knob:k.width,gap:m.left-j.right,stick:j.width,alignment:Math.abs(m.left-(a.left+a.width*.188))};});
 if(metrics.knob!==21||metrics.alignment>1||metrics.gap < -2||(scale===1.3&&metrics.gap>12))throw Error(JSON.stringify({name,scale,...metrics}));
 const box=await page.locator('[data-touch-stick]').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width,box.y+box.height/2);
 if(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.joystickX)<.99)throw Error('Joystick range failed');
 await page.mouse.up();
 await page.screenshot({path:`${out}/${name}-fit-${scale}.png`});console.log(name,scale,JSON.stringify(metrics));
 }
}
if(errors.length)throw Error(errors.join('\n'));
console.log('No browser errors');
} finally {await browser.close();}
