// Touch browsers must never tint the flight controls or sprites: no tap
// highlight (Android's blue box), no text/image selection, no long-press
// callout, no image drag. Checks the computed styles on every control and
// sprite in live career flight, then long-presses the stick and the frame.
//   VR_BASE_URL=http://127.0.0.1:4192 node tests/browser/touch-highlight.mjs
import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for(const [name,engine,device] of [['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:chrome,args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));});
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command=new]').click();await page.locator('[data-ui-command=skip-new-career]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();await r.ui.cockpitArtwork?.ready;});
  await page.waitForFunction(()=>document.querySelector('[data-touch-stick]')?.getClientRects().length);
  const report=await page.evaluate(()=>{
   const selectors=['.painted-xpdr','.painted-xpdr .dash-face','.painted-lock','[data-touch-stick]','[data-touch-stick-knob]','[data-touch-throttle]','[data-touch-throttle-thumb]','.touch-fire','.touch-missile','.touch-boost','.painted-hand-layer','.painted-hand-layer image','.painted-cockpit-frame','#screen-target-readout','canvas'];
   const bad=[];
   for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
    const cs=getComputedStyle(el),tap=cs.webkitTapHighlightColor??cs.getPropertyValue('-webkit-tap-highlight-color');
    const transparent=!tap||/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(tap);
    const select=cs.userSelect||cs.webkitUserSelect;
    const callout=cs.webkitTouchCallout??cs.getPropertyValue('-webkit-touch-callout');
    if(!transparent)bad.push(`${selector}: tap highlight ${tap}`);
    if(select&&select!=='none')bad.push(`${selector}: user-select ${select}`);
    if(callout&&callout!=='none')bad.push(`${selector}: touch callout ${callout}`);
    if(el instanceof HTMLImageElement&&el.draggable)bad.push(`${selector}: draggable image`);
   }
   return bad;
  });
  assert.deepEqual(report,[],`${name}: controls and sprites must not highlight`);
  const nativeHoldAllowed=element=>['touchstart','selectstart','contextmenu'].map(type=>
   element.dispatchEvent(new Event(type,{bubbles:true,cancelable:true})));
  for(const pad of ['[data-touch-stick]','[data-touch-throttle]']){
   assert.deepEqual(await page.locator(pad).evaluate(nativeHoldAllowed),[false,false,false]);
  }
  if(engine===chromium){
   const cdp=await page.context().newCDPSession(page);
   const stick=await page.locator('[data-touch-stick]').boundingBox();
   const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await page.waitForTimeout(1000);
   const initial=await page.evaluate(()=>[...__VOID_PRIVATEER__.getRuntime().save.player.rotation]);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30,y}]});
   await page.waitForFunction(initial=>{
    const r=__VOID_PRIVATEER__.getRuntime(),dot=r.save.player.rotation.reduce((n,v,i)=>n+v*initial[i],0);
    return r.input.joystickX>.2&&Math.abs(dot)<.9999;
   },initial,{timeout:5000});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().input.joystickX===0);
   await cdp.detach();
  }
  // A long press on the stick and on the painted frame selects nothing.
  for(const selector of ['[data-touch-stick]','.painted-cockpit-frame','.painted-xpdr']){
   const box=await page.locator(selector).first().boundingBox();if(!box)continue;
   const x=box.x+box.width/2,y=box.y+box.height/2;
   await page.touchscreen.tap(x,y);
   await page.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);for(const type of ['touchstart','contextmenu'])el?.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));},[x,y]);
   await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>String(window.getSelection()??'')),'',`${name}: ${selector} long press selects nothing`);
  }
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().quitToTitle());
  await page.locator('[data-ui-command="multiplayer"]').tap();
  const field=page.locator('[data-match-field="name"]');
  assert.deepEqual(await field.evaluate(nativeHoldAllowed),[true,true,true]);
  await field.fill('Pilot Name');
  await field.press('End');await field.press('Shift+ArrowLeft');
  assert.equal(await field.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'e');
  console.log(name,'flight controls suppress native holds and pilot names stay editable');
 }finally{await browser.close();}
}
