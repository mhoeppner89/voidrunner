// Authoring review uses the actual production renderer, with a separate viewport
// for each device preset. Never touches a career, does not alter a career.
import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone','small']);
const selectedHulls=(process.env.VR_REVIEW_HULLS??'talon,wayfarer,prospector,scrapper,speedster').split(',');
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out=selectedHulls.length===1?`output/cockpit-layout/${selectedHulls[0]}/checks`:'output/cockpit-layout/checks';await mkdir(out,{recursive:true});
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
  for(const hull of selectedHulls){
   await page.goto(`${base}/output/cockpit-layout/index.html?hull=${hull}`);await page.waitForFunction(()=>window.ready||window.reviewError);
   assert.equal(await page.evaluate(()=>window.reviewError),undefined);
   const f=page.frames().find(f=>f.url().includes('embedded=1'));assert.ok(f);
   await f.waitForFunction(()=>window.ready);await f.waitForTimeout(120);
   const data=await f.evaluate(async()=>{
    const r=cockpitReview,c=r.artwork,production=await import('/src/game/cockpitArtwork.js');
    const box=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
    return {styling:Object.fromEntries(['.cockpit-screen-radar','.screen-flight','.screen-own-weapon','.screen-target-readout','#hyperdrive-card'].map(s=>{const t=getComputedStyle(document.querySelector(s));return [s,[t.fontFamily,t.fontSize,t.lineHeight,t.borderRadius]];})),referenceWidth:r.definition.width,underlap:r.definition.glassUnderlap??3,sameRenderer:c instanceof production.PaintedCockpit,definition:r.definition.id,approval:r.definition.status,approved:production.hasPaintedCockpit(r.definition.id),layout:structuredClone(c.layout),screens:Object.fromEntries(['own','radar','target'].map(k=>[k,box('.cockpit-screen-'+k)])),frame:box('.painted-cockpit-frame'),hand:box('.painted-pilot-hand'),rail:box('.painted-throttle-rail'),throttle:box('[data-touch-throttle]'),throttleClientWidth:document.querySelector('[data-touch-throttle]').clientWidth,touch:document.querySelector('#game-shell').dataset.cockpitTouch,source:c.frame.src,expectedSource:r.definition.shell,error:c.loadError,canopy:JSON.parse(render_game_to_text()).canopy};
   });
   assert.equal(data.sameRenderer,true);assert.equal(data.approved,data.approval==='approved');assert.equal(data.error,undefined);assert.equal(data.touch,String(name!=='desktop'));
   assert.equal(await f.locator('.touch-right').isVisible(),name!=='desktop');assert.equal(await f.locator('[data-touch-throttle]').isVisible(),name!=='desktop');assert.equal(await f.locator('.painted-pilot-hand').isVisible(),true);
   assert.equal(data.frame.w,data.layout.width);assert.equal(data.frame.h,data.layout.height);assert.ok(data.hand.right<data.screens.own.x);
   if(name!=='desktop')assert.ok(Math.abs(data.rail.w/data.throttleClientWidth-.5)<.03);
   for(const [key,b]of Object.entries(data.screens)){
    const q=data.layout.monitors[key],bleed=Math.max(1.5,data.underlap*Math.max(data.layout.width/data.referenceWidth,data.layout.height/850));
    assert.ok(Math.abs(b.x-(q.x-bleed))<.1&&Math.abs(b.y-(q.y-bleed))<.1&&Math.abs(b.w-(q.width+bleed*2))<.1,'production glass underlap matches the source opening');
   }
   assert.ok(data.canopy.triangles>0);assert.equal(data.canopy.shipId,hull);
   if(data.expectedSource){
    const source={talon:/talon-paint-v4.png$/,scrapper:/scrapper-paint-v2.png$/,speedster:/speedster-paint-v2.png$/};assert.equal(data.source,data.expectedSource);if(source[hull])assert.match(data.source,source[hull]);
    if(hull==='talon')assert.equal(data.canopy.beams.length,8);
    if(hull==='scrapper'){assert.equal(data.approval,'approved');assert.equal(data.canopy.beams.length,5);assert.equal(data.canopy.triangles,72,'Balor glass tile excludes packed armor');}
    if(hull==='speedster')assert.equal(data.canopy.triangles,36,'Loki survey retains its actual three thickened panes');
    assert.equal(await f.evaluate(()=>getComputedStyle(cockpitReview.artwork.frame).clipPath),'none','original painted bevels stay intact');
    const fit=await f.evaluate(()=>{
     const c=cockpitReview.artwork,image=c.frame,canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
     const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,W=canvas.width,H=canvas.height;
     return Object.entries(c.definition.monitors).map(([id,rect])=>{
      const scaleX=W/c.definition.width,scaleY=H/c.definition.height,r={x:rect.x*scaleX,y:rect.y*scaleY,width:rect.width*scaleX,height:rect.height*scaleY};
      const seen=new Uint8Array(W*H),queue=[Math.floor(r.y+r.height/2)*W+Math.floor(r.x+r.width/2)];seen[queue[0]]=1;
      let minX=W,minY=H,maxX=0,maxY=0,sx=0,sy=0;
      for(let i=0;i<queue.length;i++){const at=queue[i],x=at%W,y=Math.floor(at/W);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sx+=x;sy+=y;
       for(const next of [at-1,at+1,at-W,at+W])if(next>=0&&next<W*H&&!seen[next]&&pixels[next*4+3]<40){seen[next]=1;queue.push(next);}
      }
      return {id,r,bounds:[minX,minY,maxX+1,maxY+1],center:[sx/queue.length+.5,sy/queue.length+.5]};
     });
    });
    for(const {id,r,bounds:b,center:p}of fit){assert.ok(b[0]>=r.x-1e-6&&b[1]>=r.y-1e-6&&b[2]<=r.x+r.width+1e-6&&b[3]<=r.y+r.height+1e-6,`${hull}/${id}: glass fills the actual transparent opening`);assert.ok(Math.abs(p[0]-(r.x+r.width/2))<2&&Math.abs(p[1]-(r.y+r.height/2))<2,`${id}: display centers on the painted opening`);}
   }
   else if(hull==='wayfarer')assert.match(data.source,/wayfarer-paint-atlas-v2.png/);
   else{assert.ok(data.source.startsWith('data:image/svg+xml'));assert.equal(data.approval,'layout-review');if(hull==='scrapper')assert.equal(data.canopy.triangles,72,'Balor glass tile excludes the packed armor');if(hull==='speedster')assert.equal(data.canopy.triangles,36,'Loki survey retains its actual three thickened panes');if(hull==='prospector'){assert.equal(data.canopy.beams.length,3);assert.ok(data.canopy.triangles<30,'exclude Gaia nose-sensor glazing');}}
   await page.screenshot({path:`${out}/${name}-${hull}.png`});
   if(reports.length){
    assert.ok(reports[0].layout.hyper.y+reports[0].layout.hyper.height<reports[0].layout.monitors.radar.y,'hyperdrive mounts inside its frame above radar');
    for(const [key,style]of Object.entries(data.styling)){const reference=reports[0].styling[key];assert.equal(style[0],reference[0],'shared font family');assert.equal(style[3],reference[3],'shared display shape');assert.ok(Math.abs(parseFloat(style[1])-parseFloat(reference[1]))<2,'responsive type remains readable in measured apertures');}
   }
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
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-report.json`,JSON.stringify(reports,null,2));console.log(`${name}: shared cockpit review passed`);
 }catch(error){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
}
