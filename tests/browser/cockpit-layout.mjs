import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/cockpit-layout/checks';
await mkdir(out,{recursive:true});const reports=[];
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]];
for(const [name,engine,device]of profiles.filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name))){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']}:{})});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});const errors=[],pending=new Set();page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>{pending.delete(r.url());console.error(r.url(),r.failure()?.errorText);});
  await page.addInitScript(()=>{
   localStorage.setItem('void-privateer-save-v1','{"reviewSentinel":true}');
   localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,controllerBindings:{flight:{fire:7,afterburner:0}}}));
   window.pad={index:0,id:'Cockpit review controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
  });
  await page.goto(`${base}/output/cockpit-layout/index.html?revision=cockpit-art-04`);await page.waitForFunction(()=>window.ready||window.reviewError).catch(error=>{console.error('Pending preview requests:',[...pending]);throw error;});assert.equal(await page.evaluate(()=>window.reviewError),undefined);
  const mobile=name!=='desktop';await page.waitForTimeout(150);
  assert.equal(await page.locator('.touch-right').isVisible(),mobile,'button bank is mobile only');
  assert.equal(await page.locator('[data-touch-throttle]').isVisible(),mobile,'throttle is mobile only');
  assert.equal(await page.locator('#pilot-hand').isVisible(),true,'hand remains on every device');
  assert.equal(await page.locator('.dashboard').count(),0,'no flat dashboard filler');
  assert.equal(await page.locator('#cockpit-paint').count(),0,'no reconstructed atlas frame');
  const geometry=await page.evaluate(()=>{
   const host=document.querySelector('#cockpit'),o=host.getBoundingClientRect(),s=o.width/host.offsetWidth;
   const r=sel=>{const b=document.querySelector(sel).getBoundingClientRect();return {x:(b.x-o.x)/s,y:(b.y-o.y)/s,w:b.width/s,h:b.height/s,right:(b.right-o.x)/s,bottom:(b.bottom-o.y)/s};};
   return {width:host.offsetWidth,height:host.offsetHeight,monitors:Object.fromEntries(['own','radar','target'].map(id=>[id,r(`.cockpit-screen-${id}`)])),jump:r('#hyperdrive-card'),hand:r('#pilot-hand'),stick:r('[data-touch-stick]'),frame:r('#cockpit-frame-sprite'),corners:r('.hud-corner-buttons'),wing:r('.hud-wing-btn'),comms:r('.comms-channel'),rail:r('.review-throttle-rail'),railParent:document.querySelector('[data-touch-throttle]').clientWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  const manifest=await page.evaluate(()=>cockpitReview.artwork.manifest);
  for(const [id,b]of Object.entries(geometry.monitors)){
   const a=manifest.monitors[id];
   assert.ok(Math.abs(b.x-a.x/manifest.width*geometry.width)<.6&&Math.abs(b.y-a.y/manifest.height*geometry.height)<.6,'contents align with full sprite aperture');
   assert.ok(Math.abs(b.w-a.width/manifest.width*geometry.width)<.6&&Math.abs(b.h-a.height/manifest.height*geometry.height)<.6);
  }
  assert.equal(geometry.overflow,false);assert.ok(geometry.hand.right<geometry.monitors.own.x);
  assert.ok(geometry.hand.w<geometry.stick.w);assert.ok(Math.abs(geometry.rail.w/geometry.railParent-.5)<.02,'visible slider is half width');
  assert.equal(geometry.frame.w,geometry.width);assert.equal(geometry.frame.h,geometry.height);
  assert.ok(Math.abs(geometry.jump.bottom-manifest.housingTop/manifest.height*geometry.height)<.6);
  assert.ok(Math.abs(geometry.corners.y-geometry.wing.y)<.75&&Math.abs(geometry.corners.h-geometry.wing.h)<.75);
  assert.ok(Math.abs(geometry.comms.x+geometry.comms.w/2-geometry.width/2)<.75);
  await page.screenshot({path:`${out}/${name}-layout.png`});

  // Derive the actual rendered joint from the SVG transforms and source
  // anchors; every extreme yaw/pitch must land on the same fixed mount.
  const pivots=[];
  for(const [label,yaw,pitch]of [['neutral',0,0],['forward',1,-1],['back',-1,1]]){
   const point=await page.evaluate(([yaw,pitch])=>{
    const review=cockpitReview;Object.assign(review.state,{paused:true,handX:yaw,handY:pitch});review.artwork.updateStick(yaw,pitch);
    const rig=document.querySelector('#hand-rig'),index=Number(rig.dataset.pitchPose),f=review.artwork.manifest.handStrip.frames[index];
    const pin=new DOMPoint(...f.pivot).matrixTransform(document.querySelector('#hand-pose').getScreenCTM());
    return {x:pin.x,y:pin.y,index,pivot:document.querySelector('#cockpit').dataset.stickPivot};
   },[yaw,pitch]);pivots.push(point);
   await page.screenshot({path:`${out}/${name}-hand-${label}.png`});
  }
  assert.deepEqual(pivots.map(p=>p.index),[1,0,2]);
  for(const point of pivots)assert.ok(Math.hypot(point.x-pivots[0].x,point.y-pivots[0].y)<.1,'shaft pivot is anchored through all poses');
  const exposedCuts=await page.evaluate(async()=>{
   const review=cockpitReview,sheet=review.artwork.manifest.handStrip,img=new Image();img.src=sheet.path;await img.decode();
   const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
   const pixels=ctx.getImageData(0,0,c.width,c.height).data,host=document.querySelector('#cockpit').getBoundingClientRect(),bad=[];
   for(const yaw of [-1,0,1])for(const pitch of [-1,0,1]){
    review.artwork.updateStick(yaw,pitch);
    const index=Number(document.querySelector('#hand-rig').dataset.pitchPose),f=sheet.frames[index],mat=document.querySelector('#hand-pose').getScreenCTM();
    const check=(x,y)=>{
     if(pixels[(y*c.width+f.x+x)*4+3]<100)return;
     const p=new DOMPoint(x,y).matrixTransform(mat);
     if(p.x>host.left+1&&p.x<host.right-1&&p.y>host.top+1&&p.y<host.bottom-1)bad.push({yaw,pitch,x,y});
    };
    for(let y=0;y<sheet.height;y+=2)check(0,y);
    for(let x=0;x<sheet.frameWidth;x+=2)check(x,sheet.height-1);
   }
   return bad;
  });
  assert.deepEqual(exposedCuts,[],'no opaque cut edge of the sleeve enters the screen at full steering');
  await page.evaluate(()=>Object.assign(cockpitReview.state,{paused:false,handX:0,handY:0}));
  const before=await page.locator('.cockpit-screen-own').boundingBox();
  await page.locator('#review-open').click();await page.locator('#artwork-enabled').uncheck();await page.locator('#review-close').click();
  assert.deepEqual(await page.locator('.cockpit-screen-own').boundingBox(),before,'frame visibility does not move readouts');
  await page.locator('#review-open').click();await page.locator('#artwork-enabled').check();await page.locator('#review-close').click();
  await page.keyboard.down('KeyD');await page.waitForTimeout(180);assert.ok(await page.evaluate(()=>cockpitReview.state.handX)>.8);await page.keyboard.up('KeyD');await page.waitForTimeout(280);
  const stick=await page.locator('[data-touch-stick]').boundingBox();
  await page.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);await page.mouse.down();await page.mouse.move(stick.x+stick.width*.76,stick.y+stick.height*.32);await page.waitForTimeout(170);
  const hand=await page.evaluate(()=>[cockpitReview.state.handX,cockpitReview.state.handY]);assert.ok(hand[0]>.3&&hand[1]<-.2);await page.mouse.up();await page.waitForTimeout(260);
  if(name==='android'){
   const cdp=await page.context().newCDPSession(page),fire=await page.locator('#touch-fire').boundingBox();
   const left={id:1,x:stick.x+stick.width/2,y:stick.y+stick.height/2},right={id:2,x:fire.x+fire.width/2,y:fire.y+fire.height/2};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...left,x:left.x+stick.width*.2},right]});await page.waitForTimeout(170);
   assert.ok(await page.evaluate(()=>cockpitReview.state.handX)>.3);assert.equal(await page.evaluate(()=>cockpitReview.state.firing),true);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>cockpitReview.state.firing),false);await cdp.detach();
  }
  if(mobile){
   // Expanded button targets must receive real pointer input outside their
   // painted rectangles, without moving/enlarging the painted controls.
   const boost=await page.locator('.touch-boost-right').boundingBox();
   await page.mouse.move(boost.x-14,boost.y-14);await page.mouse.down();await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>cockpitReview.state.boost),true,'afterburner has a top-left hit extension');
   await page.mouse.up();await page.waitForTimeout(70);assert.equal(await page.evaluate(()=>cockpitReview.state.boost),false);
   const launcher=await page.locator('#touch-launcher-cycle').boundingBox();
   await page.mouse.click(launcher.x-14,launcher.y+launcher.height/2);await page.waitForTimeout(80);
   assert.match(await page.locator('#comms-bar').textContent(),/Launcher selection/,'selector responds left of its visible cap');
   // Starting off-centre is still neutral; movement is relative to that touch.
   await page.mouse.move(stick.x+stick.width*.75,stick.y+stick.height*.25);await page.mouse.down();await page.waitForTimeout(80);
   assert.deepEqual(await page.evaluate(()=>[cockpitReview.input.joystickX,cockpitReview.input.joystickY]),[0,0]);
   await page.mouse.move(stick.x+stick.width*.9,stick.y+stick.height*.35);await page.waitForTimeout(100);
   assert.ok(await page.evaluate(()=>cockpitReview.input.joystickX)>.15);assert.ok(await page.evaluate(()=>cockpitReview.input.joystickY)>.1);
   await page.mouse.up();await page.waitForTimeout(160);
   const throttle=await page.locator('[data-touch-throttle]').boundingBox();await page.mouse.move(throttle.x+3,throttle.y+throttle.height*.2);await page.mouse.down();await page.mouse.up();await page.waitForTimeout(100);assert.ok(Math.abs(await page.evaluate(()=>cockpitReview.state.throttle)-.8)<.03,'wide invisible slider margin remains draggable');
  }
  await page.locator('.cockpit-screen-own').click();assert.match(await page.locator('.review-cargo-page').innerText(),/CARGO.*12 \/ 30/);
  await page.locator('#review-open').click();await page.locator('#scene').selectOption('salvage');await page.locator('#review-close').click();
  if(mobile){await page.locator('#touch-missile').click();await page.waitForTimeout(80);assert.match(await page.locator('#comms-bar').textContent(),/Scan complete/);}
  assert.match(await page.locator('#screen-target-contents').innerText(),/Coolant.*4 units/s);
  await page.waitForFunction(()=>!cockpitReview.input.gamepadBlocked&&!cockpitReview.input.gamepadNeedsNeutral);
  await page.evaluate(()=>{pad.axes[0]=.75;pad.axes[1]=-.5;pad.buttons[7]={pressed:true,value:1};});await page.waitForTimeout(180);
  assert.ok(await page.evaluate(()=>cockpitReview.state.handX)>.5);assert.ok(await page.evaluate(()=>cockpitReview.state.firing));assert.equal(await page.evaluate(()=>cockpitReview.state.boost),false);
  await page.evaluate(()=>{pad.axes.fill(0);pad.buttons[7]={pressed:false,value:0};});await page.waitForTimeout(250);
  await page.locator('.cockpit-screen-own').click();
  const fits=await page.evaluate(()=>{const own=document.querySelector('.cockpit-screen-own').getBoundingClientRect(),bars=document.querySelector('.cockpit-screen-own .screen-bars').getBoundingClientRect();return bars.bottom<=own.bottom+1;});assert.equal(fits,true,'readouts fit the sprite aperture');
  await page.locator('#review-open').click();await page.locator('#model-open').click();await page.waitForFunction(()=>document.querySelector('#model-stage canvas'));await page.locator('#model-close').click();await page.locator('#review-close').click();
  await page.locator('.pause-button').click();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>cockpitReview.state.paused),true);await page.keyboard.press('KeyP');
  const wingBefore=await page.locator('.hud-wing-btn').innerText();await page.locator('.hud-wing-btn').click();assert.notEqual(await page.locator('.hud-wing-btn').innerText(),wingBefore);
  if(name==='desktop'){
   await page.locator('#review-open').click();await page.locator('#review-viewport').selectOption('phone');await page.locator('#review-close').click();assert.equal(await page.locator('.touch-right').isVisible(),true);
   await page.locator('#review-open').click();await page.locator('#review-viewport').selectOption('desktop');await page.locator('#review-close').click();assert.equal(await page.locator('.touch-right').isVisible(),false);
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('void-privateer-save-v1')),'{"reviewSentinel":true}');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('void-privateer-settings-v1'))),{music:0,effects:0,controllerBindings:{flight:{fire:7,afterburner:0}}});assert.deepEqual(errors,[]);
  reports.push({profile:name,geometry,pivots,errors});console.log(name,'cockpit layout passed');
 }catch(error){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw error;}
 finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
