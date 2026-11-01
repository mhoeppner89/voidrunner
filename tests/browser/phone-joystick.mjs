import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/phone-joystick';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,steering:'tilt'}));window.motionPermissionsRequested=0;Object.defineProperty(window,'DeviceOrientationEvent',{configurable:true,value:class extends Event{static requestPermission(){window.motionPermissionsRequested++;return Promise.resolve('granted');}}});const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(()=>void __VOID_PRIVATEER__.newGame());await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);r.ui.hideStory();r.skipTutorial();await r.launch();cancelAnimationFrame(r.frameId);r.ui.showHud();});
  const stick=page.locator('[data-touch-stick]'),throttle=page.locator('[data-touch-throttle]');assert.ok(await stick.isVisible());assert.ok(await throttle.isVisible());
  const initial=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();window.dispatchEvent(new Event('deviceorientation'));return{settings:r.save.settings.steering,active:r.input.tiltActive,permission:window.motionPermissionsRequested};});
  assert.deepEqual(initial,{settings:'stick',active:false,permission:0});
  const box=await stick.boundingBox(),screen=page.viewportSize();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=screen.width&&box.y+box.height<=screen.height,JSON.stringify(box));
  const x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=engine===chromium?await context.newCDPSession(page):undefined;
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+box.width*.34,y:y-box.height*.28,id:1}]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+box.width*.34,y-box.height*.28);}
  const steering=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),a=r.input.getActions(),before=[...r.save.player.rotation];for(let i=0;i<12;i++)r.updatePlayer(1/60,a);return {yaw:a.yaw,pitch:a.pitch,turned:before.some((v,i)=>Math.abs(v-r.save.player.rotation[i])>1e-5)};});assert.ok(steering.yaw>.3&&steering.pitch<-.3&&steering.turned,JSON.stringify(steering));
  await page.screenshot({path:`${out}/${name}-steering.png`});
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  if(!process.env.VR_FAST){await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().persistSave());await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.resume);await page.evaluate(()=>void __VOID_PRIVATEER__.resume());await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
   assert.ok(await stick.isVisible(),'joystick remains visible after reloading an in-flight save');assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.settings.steering),'stick');}
  assert.deepEqual(errors,[]);
  console.log(name,'legacy tilt migration, visible joystick, steering and reload passed',JSON.stringify(steering));
 }finally{await browser.close();}
}
