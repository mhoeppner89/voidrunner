// Authoring review uses the actual production renderer, with a separate viewport
// for each device preset. Never touches a career, does not alter a career.
import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone','small']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/cockpit-layout/checks';await mkdir(out,{recursive:true});
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']],['small',chromium,{viewport:{width:667,height:375},deviceScaleFactor:2,isMobile:true,hasTouch:true}]];
for(const [name,engine,device]of profiles.filter(([n])=>process.env.VR_PROFILES.split(',').includes(n))){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('void-privateer-save-v1','{"reviewSentinel":true}');localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));
   window.pad={index:0,id:'Cockpit review controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
  });
  const reports=[];
  for(const hull of ['talon','wayfarer']){
   await page.goto(`${base}/output/cockpit-layout/index.html?hull=${hull}`);await page.waitForFunction(()=>window.ready||window.reviewError);
   assert.equal(await page.evaluate(()=>window.reviewError),undefined);
   const f=page.frames().find(f=>f.url().includes('embedded=1'));assert.ok(f);
   await f.waitForFunction(()=>window.ready);await f.waitForTimeout(120);
   const data=await f.evaluate(async()=>{
    const r=cockpitReview,c=r.artwork,production=await import('/src/game/cockpitArtwork.js');
    const box=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
    return {styling:Object.fromEntries(['.cockpit-screen-radar','.screen-flight','.screen-own-weapon','.screen-target-readout','#hyperdrive-card'].map(s=>{const t=getComputedStyle(document.querySelector(s));return [s,[t.fontFamily,t.fontSize,t.lineHeight,t.borderRadius]];})),underlap:r.definition.glassUnderlap??3,sameRenderer:c instanceof production.PaintedCockpit,definition:r.definition.id,approved:production.hasPaintedCockpit(r.definition.id),layout:structuredClone(c.layout),screens:Object.fromEntries(['own','radar','target'].map(k=>[k,box('.cockpit-screen-'+k)])),frame:box('.painted-cockpit-frame'),hand:box('.painted-pilot-hand'),rail:box('.painted-throttle-rail'),throttle:box('[data-touch-throttle]'),throttleClientWidth:document.querySelector('[data-touch-throttle]').clientWidth,touch:document.querySelector('#game-shell').dataset.cockpitTouch,source:c.frame.src,error:c.loadError,canopy:JSON.parse(render_game_to_text()).canopy};
   });
   assert.equal(data.sameRenderer,true);assert.equal(data.approved,true);assert.equal(data.error,undefined);assert.equal(data.touch,String(name!=='desktop'));
   assert.equal(await f.locator('.touch-right').isVisible(),name!=='desktop');assert.equal(await f.locator('[data-touch-throttle]').isVisible(),name!=='desktop');assert.equal(await f.locator('.painted-pilot-hand').isVisible(),true);
   assert.equal(data.frame.w,data.layout.width);assert.equal(data.frame.h,data.layout.height);assert.ok(data.hand.right<data.screens.own.x);
   if(name!=='desktop')assert.ok(Math.abs(data.rail.w/data.throttleClientWidth-.5)<.03);
   for(const [key,b]of Object.entries(data.screens)){
    const q=data.layout.monitors[key],bleed=Math.max(1.5,data.underlap*Math.max(data.layout.width/1851,data.layout.height/850));
    assert.ok(Math.abs(b.x-(q.x-bleed))<.1&&Math.abs(b.y-(q.y-bleed))<.1&&Math.abs(b.w-(q.width+bleed*2))<.1,'production glass underlap matches the source opening');
   }
   assert.ok(data.canopy.triangles>0);assert.equal(data.canopy.shipId,hull);
   if(hull==='talon'){assert.match(data.source,/talon-paint-v8.png$/);assert.equal(data.canopy.beams.length,8);
    assert.equal(await f.evaluate(()=>getComputedStyle(cockpitReview.artwork.frame).clipPath.includes(cockpitReview.artwork.clipId)),true,'frame uses the locked glass stencil');}
   else assert.match(data.source,/wayfarer-paint-atlas-v2.png/);
   await page.screenshot({path:`${out}/${name}-${hull}.png`});
   if(reports.length){for(const key of ['own','target'])assert.deepEqual(data.layout.monitors[key],reports[0].layout.monitors[key],'outer monitors retain approved geometry');
    assert.ok(Math.abs(reports[0].layout.monitors.radar.y-data.layout.monitors.radar.y-14/850*data.layout.height)<.01,'Mercury radar is only slightly lower');
    assert.ok(reports[0].layout.hyper.y>=560/850*data.layout.height-.1&&reports[0].layout.hyper.y+reports[0].layout.hyper.height<reports[0].layout.monitors.radar.y,'hyperdrive mounts inside its frame above radar');assert.deepEqual(data.styling,reports[0].styling,'review hull uses production shared typography and instrument styling');}
   reports.push(data);
   // All pitch poses and full yaw preserve the exact base socket, and do not relayout.
   const pivots=await f.evaluate(()=>{
    const c=cockpitReview.artwork,points=[];cockpitReview.state.paused=true;
    c.relayout=()=>{throw new Error('Unexpected layout during steering');};
    for(const [yaw,pitch]of [[0,0],[1,-1],[-1,1]]){
     c.showPose(yaw,pitch);const i=c.frameIndex,p=new DOMPoint(...c.definition.strip.frames[i].pivot).matrixTransform(c.poseLayer.getScreenCTM());points.push({x:p.x,y:p.y,index:i});
    }
    c.showPose(0,0);return points;
   });
   assert.deepEqual(pivots.map(p=>p.index),[1,0,2]);for(const p of pivots)assert.ok(Math.hypot(p.x-pivots[0].x,p.y-pivots[0].y)<.1);
   // Restore layout method after the guard, then exercise real shared input.
   await f.evaluate(async()=>{cockpitReview.artwork.relayout=(await import('/src/game/cockpitArtwork.js')).PaintedCockpit.prototype.relayout;cockpitReview.state.paused=false;});
   await f.locator('#cockpit').click({position:{x:400,y:130}});await page.keyboard.down('KeyD');await f.waitForTimeout(180);assert.ok(await f.evaluate(()=>cockpitReview.state.handX)>.8);await page.keyboard.up('KeyD');
   const stick=await f.locator('[data-touch-stick]').boundingBox();
   await page.mouse.move(stick.x+stick.width*.7,stick.y+stick.height*.3);await page.mouse.down();await f.waitForTimeout(80);assert.deepEqual(await f.evaluate(()=>[cockpitReview.input.joystickX,cockpitReview.input.joystickY]),[0,0]);
   await page.mouse.move(stick.x+stick.width*.9,stick.y+stick.height*.1);await f.waitForTimeout(140);assert.ok(await f.evaluate(()=>cockpitReview.state.handX)>.25);await page.mouse.up();
   if(name!=='desktop'){
    const boost=await f.locator('.touch-boost-right').boundingBox();await page.mouse.move(boost.x-14,boost.y-14);await page.mouse.down();await f.waitForTimeout(90);assert.equal(await f.evaluate(()=>cockpitReview.state.boost),true);await page.mouse.up();
   }
   await f.locator('.cockpit-screen-own').click();assert.match(await f.locator('.review-cargo-page').innerText(),/12 \/ 30/);
   await f.waitForFunction(()=>!cockpitReview.input.gamepadBlocked&&!cockpitReview.input.gamepadNeedsNeutral);await f.evaluate(()=>{pad.axes[0]=-.8;});await f.waitForTimeout(180);assert.ok(await f.evaluate(()=>cockpitReview.state.handX)<-.4);await f.evaluate(()=>pad.axes.fill(0));
   assert.equal(await f.evaluate(()=>localStorage.getItem('void-privateer-save-v1')),'{"reviewSentinel":true}');assert.deepEqual(await f.evaluate(()=>JSON.parse(localStorage.getItem('void-privateer-settings-v1'))),{music:0,effects:0});
  }
  // Phone preview on desktop must use phone media queries and real viewport dimensions.
  if(name==='desktop'){
   await page.locator('#review-open').click();await page.locator('#review-viewport').selectOption('phone');await page.waitForFunction(()=>window.ready);await page.locator('#review-close').click();
   const f=page.frames().find(f=>f.url().includes('embedded=1'));assert.deepEqual(await f.evaluate(()=>[innerWidth,innerHeight]),[844,390]);assert.equal(await f.locator('.touch-right').isVisible(),true);
   await page.screenshot({path:`${out}/desktop-phone-preset.png`});
   await page.locator('#review-open').click();await page.locator('#model-open').click();await f.waitForFunction(()=>document.querySelector('#model-stage canvas'));await page.screenshot({path:`${out}/model-reference.png`});await f.locator('#model-close').click();
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-report.json`,JSON.stringify(reports,null,2));console.log(`${name}: shared Mercury/starter review passed`);
 }catch(error){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
}
