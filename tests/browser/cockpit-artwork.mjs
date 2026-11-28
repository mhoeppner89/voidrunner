// Approved cockpit in the real game. Silent desktop, Android, WebKit
// and small-phone checks.
import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles,isolateBrowserHulls} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone','small']);
await isolateBrowserHulls(import.meta.url);
const hulls=(process.env.VR_COCKPIT_HULLS??process.env.VR_COCKPIT_HULL??'wayfarer').split(',');
for(const hull of hulls){
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out=`output/cockpit-artwork/${hull}/checks`;await mkdir(out,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']],['small',chromium,{viewport:{width:667,height:375},deviceScaleFactor:2,isMobile:true,hasTouch:true}]];
for(const [name,engine,device]of profiles){
 if(!(process.env.VR_PROFILES??'desktop,android,iphone,small').split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;
 const errors=[],legacy=[],pending=new Set(),networkFailures=[];
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);
  page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>{pending.delete(r.url());networkFailures.push({url:r.url(),error:r.failure()?.errorText});});page.on('response',r=>{if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});page.on('console',m=>{if(m.type()==='error')console.error('Browser console:',m.text());});page.on('request',r=>{if(/cockpit-(wayfarer|talon|speedster|scrapper|prospector|demon|mule|legionary|andromeda|torsas|vanguard|lancer|atlas|astra)-sprite/.test(r.url()))legacy.push(r.url());});
  await page.addInitScript(()=>{
   localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,vibration:false}));
   const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};
   window.testPad={index:0,id:'Cockpit test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[testPad]});
  });
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.evaluate(async hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);r.skipTutorial();if(hull!=='wayfarer'){
   r.save.player.credits=10000000;const {LOCATIONS}=await import('/src/game/data.js'),home=r.save.player.dockedAt;
   const yard=Object.values(LOCATIONS).find(l=>l.id===home&&l.shipsForSale?.includes(hull))??Object.values(LOCATIONS).find(l=>l.services?.shipyard&&l.shipsForSale?.includes(hull));
   if(!yard)throw Error(`No shipyard stocks ${hull}`);if(yard.id!==home)r.dockAt(yard.id,true);
   const result=r.buyShip(hull);if(!result.ok)throw Error(JSON.stringify(result));if(yard.id!==home)r.dockAt(home,true);
  }await r.launch();},hull);
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.ui.cockpitArtwork?.layout);
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.ui.cockpitArtwork.ready;r.ui.cockpitArtwork.invalidate();});
  await page.waitForTimeout(150);
  if(name==='android'){
   // CDP supplies real CSS safe-area env() values in either landscape orientation.
   const cdp=await page.context().newCDPSession(page);
   const positions=()=>page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect();
    return {throttle:box('[data-touch-throttle]').left,rail:box('.painted-throttle-rail').left,
     boost:innerWidth-box('.touch-boost-right').right,fire:innerWidth-box('.touch-fire').right,
     stick:box('[data-touch-stick]').x,base:box('.painted-stick-mount image').x,screen:box('.cockpit-screen-target').x};
   });
   const original=await positions();
   for(const insets of [{left:62,right:0},{left:0,right:62}]){
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets});
    const p=await positions();
    assert.equal(p.throttle,Math.max(original.throttle,insets.left));
    assert.equal(p.rail-p.throttle,original.rail-original.throttle);
    assert.equal(p.boost,Math.max(original.boost,insets.right));
    assert.equal(p.fire,Math.max(original.fire,insets.right));
    for(const part of ['stick','base','screen'])assert.equal(p[part],original[part],part);
   }
   await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{}});
   await cdp.detach();
  }
  const geometry=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=r.ui.cockpitArtwork,box=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
   return {hull:r.save.player.shipId,underlap:c.definition.glassUnderlap??3,source:c.definition.shell,layout:structuredClone(c.layout),frame:box('.painted-cockpit-frame'),screens:Object.fromEntries(['own','radar','target'].map(k=>[k,box('.cockpit-screen-'+k)])),hand:box('.painted-pilot-hand'),jump:box('#hyperdrive-card'),rail:box('.painted-throttle-rail'),throttle:box('[data-touch-throttle]'),stick:box('[data-touch-stick]'),base:box('.painted-stick-mount image'),baseSource:document.querySelector('.painted-stick-mount image').getAttribute('href'),baseShapes:document.querySelectorAll('.painted-stick-mount path,.painted-stick-mount ellipse').length,mask:document.querySelector('.canopy-art-mask').getAttribute('href'),touch:document.querySelector('#game-shell').dataset.cockpitTouch,damage:(()=>{for(let y=2;y<110;y++)for(let x=70;x<300;x++)if(c.alpha[y*371+x]>240)return r.ui.cockpitPointVisible(c.layout.left+(x+.5)/371*c.layout.width,c.layout.top+(y+.5)/170*c.layout.height);throw Error('No opaque canopy sample');})(),glass:r.ui.cockpitPointVisible(innerWidth*.5,innerHeight*.38),monitor:r.ui.cockpitPointVisible(innerWidth*.5,innerHeight*.85),loadError:c.loadError};
  });
  const hullLayer=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=r.ui.cockpitArtwork,l=c.layout;
   const element=c.forwardHull,rect=element.getBoundingClientRect(),frame=c.frame.getBoundingClientRect();
   let sample=null;
   if(c.definition.forwardHull){
    for(let y=1;y<120&&!sample;y++)for(let x=1;x<370;x++){
     const i=y*371+x;if(c.hullAlpha[i]>240){const px=l.left+(x+.5)/371*l.width,py=l.top+(y+.5)/170*l.height;
      if(!l.blockers.some(b=>px-l.left>=b.x&&px-l.left<=b.x+b.width&&py-l.top>=b.y&&py-l.top<=b.y+b.height)){sample={visible:r.ui.cockpitPointVisible(px,py),alpha:c.alpha[i]};break;}}
    }
   }
   return {expected:Boolean(c.definition.forwardHull),visible:getComputedStyle(element).display!=='none',decoded:element.complete&&element.naturalWidth>0,source:element.getAttribute('src'),sample,rect:rect.toJSON(),frame:frame.toJSON(),mask:c.damageHullMask.getAttribute('href'),placement:c.definition.forwardHullPlacement};
  });
  assert.equal(hullLayer.visible,hullLayer.expected);
  if(hullLayer.expected){assert.equal(hullLayer.decoded,true);assert.ok(/demon-forward-hull-v1\.(png|webp)$/.test(hullLayer.source));assert.equal(hullLayer.mask,hullLayer.source);assert.equal(hullLayer.sample?.visible,false,'exterior armor hides HUD markers using cached alpha');assert.ok(hullLayer.sample.alpha>240,'cached union retains the sampled armor opacity');assert.deepEqual(hullLayer.rect,hullLayer.frame);assert.equal(hullLayer.placement.forward,13);assert.equal(hullLayer.placement.outward,18);}
  assert.equal(geometry.loadError,undefined);assert.equal(geometry.touch,String(name!=='desktop'));assert.equal(await page.locator('.touch-right').isVisible(),name!=='desktop');
  assert.ok(await page.locator('.painted-pilot-hand').isVisible());assert.equal(legacy.length,0,'no legacy approved-hull plate is loaded');
  assert.ok(/wayfarer-stick-base-v1\.(png|webp)$/.test(geometry.baseSource));assert.equal(geometry.baseShapes,0,'fixed base uses its sprite, not drawn placeholder shapes');
  assert.equal(geometry.hull,hull);assert.equal(geometry.mask,geometry.source);assert.equal(geometry.damage,false,'beam hides HUD target');assert.equal(geometry.glass,true,'open glass allows HUD target');assert.equal(geometry.monitor,false,'monitor hides HUD target');
  for(const [id,b]of Object.entries(geometry.screens)){const q=geometry.layout.monitors[id];assert.ok(b.x<=q.x&&b.y<=q.y&&b.right>=q.x+q.width&&b.bottom>=q.y+q.height,`${id} glass underlaps the exact sprite opening`);const bleed=Math.max(1.5,geometry.underlap*Math.max(geometry.layout.width/1851,geometry.layout.height/850));assert.ok(q.x-b.x<=bleed+.05&&q.y-b.y<=bleed+.05);}
  const bitmapFit=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),ratio=r.ui.monitorRatio;return [...document.querySelectorAll('#radar,#own-hull-outline')].map(c=>({width:c.width/ratio,height:c.height/ratio,cssWidth:c.clientWidth,cssHeight:c.clientHeight}));});
  for(const c of bitmapFit)assert.ok(Math.abs(c.width-c.cssWidth)<=1&&Math.abs(c.height-c.cssHeight)<=1,'canvas pixels match actual display dimensions, including small screens');
  const layers=await page.evaluate(()=>({frame:Number(getComputedStyle(document.querySelector('.painted-cockpit-frame')).zIndex),screen:Number(getComputedStyle(document.querySelector('.cockpit-screen-own')).zIndex),handArea:document.querySelector('.painted-hand-layer').clientWidth*document.querySelector('.painted-hand-layer').clientHeight,fullArea:innerWidth*innerHeight}));
  assert.ok(layers.frame>layers.screen,'the whole frame masks live glass edges');assert.ok(layers.handArea<layers.fullArea*.15,'hand repaints are confined to a small region');
  assert.ok(geometry.hand.right<geometry.screens.own.x);
  // The backing deliberately bleeds underneath the painted rim. Check the
  // visible aperture against the button, not that hidden backing rectangle.
  assert.ok(geometry.layout.monitors.radar.y>=geometry.jump.bottom);
  assert.equal(await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),h=r.ui.cockpitArtwork.layout.hand;return r.ui.cockpitPointVisible(h.x+h.width*175/320,h.y+h.height*130/240);}),false,'hand hides HUD target using its cached pose alpha');
  await page.screenshot({path:`${out}/${name}-flight.png`});
  const stick=await page.locator('[data-touch-stick]').boundingBox(),sx=stick.x+stick.width*.7,sy=stick.y+stick.height*.4;
  await page.mouse.move(sx,sy);await page.mouse.down();assert.deepEqual(await page.evaluate(()=>{const i=__VOID_PRIVATEER__.getRuntime().input;return[i.joystickX,i.joystickY];}),[0,0]);
  await page.mouse.move(sx+stick.width*.3,sy-stick.height*.3);
  // Software mobile rendering can spend the first 250ms rasterising the new
  // hand pose. Verify an actual rendered input response, not a fixed sleep.
  await page.waitForFunction(()=>{const c=__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork;return c.pose.x>.25&&c.pose.y<-.25;},null,{timeout:5000});
  const steer=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return {input:[r.input.joystickX,r.input.joystickY],pose:{...r.ui.cockpitArtwork.pose}};});
  assert.ok(steer.input[0]>.5&&steer.input[1]<-.5);assert.ok(steer.pose.x>.25&&steer.pose.y<-.25,'real flight inputs animate the hand');
  const movingRects=await page.evaluate(()=>Object.fromEntries(['own','radar','target'].map(k=>{const b=document.querySelector('.cockpit-screen-'+k).getBoundingClientRect();return[k,{x:b.x,y:b.y,w:b.width,h:b.height}];})));
  for(const [id,b]of Object.entries(movingRects)){const a=geometry.screens[id];for(const key of ['x','y','w','h'])assert.ok(Math.abs(a[key]-b[key])<.05,'monitor geometry stays fixed while steering');}
  const baseAfter=await page.locator('.painted-stick-mount image').boundingBox();for(const [a,b]of [['x','x'],['y','y'],['w','width'],['h','height']])assert.ok(Math.abs(geometry.base[a]-baseAfter[b])<.05,'base stays anchored during real steering');
  await page.screenshot({path:`${out}/${name}-steering.png`});await page.mouse.up();
  if(name!=='desktop'){
   const boost=await page.locator('.touch-boost-right').boundingBox();await page.mouse.move(boost.x-14,boost.y-14);await page.mouse.down();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().input.touchHeld.has('afterburner')),true);await page.mouse.up();
   const throttle=await page.locator('[data-touch-throttle]').boundingBox();await page.mouse.click(throttle.x+3,throttle.y+throttle.height*.2);await page.waitForFunction(()=>Math.abs(__VOID_PRIVATEER__.getRuntime().save.player.throttle-.8)<.04,null,{timeout:5000});
  }
  await page.waitForFunction(()=>{const i=__VOID_PRIVATEER__.getRuntime().input;return !i.gamepadBlocked&&!i.gamepadNeedsNeutral;});
  await page.evaluate(()=>{testPad.axes[0]=-.8;testPad.axes[1]=.8;});
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork.pose.x<-.35,{},{timeout:5000}).catch(async error=>{console.error('Controller state',await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{pose:r.ui.cockpitArtwork.pose,axes:testPad.axes,blocked:r.input.gamepadBlocked,neutral:r.input.gamepadNeedsNeutral,modal:r.ui.isModalOpen,menu:r.ui.controller?.blocksFlight,docked:r.save.player.dockedAt,input:[r.input.joystickX,r.input.joystickY]};}));throw error;});
  await page.evaluate(()=>testPad.axes.fill(0));
  await page.locator('.cockpit-screen-own').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.isModalOpen);
  assert.ok(await page.locator('[data-ui-command="close-ship"]').isVisible(),'own monitor opens the live ship panel');await page.locator('[data-ui-command="close-ship"]').click();
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.isModalOpen);
  // Every player hull is painted now. Switching to a different approved hull
  // must replace the frame and remove the previous hull's optional fitting.
  const alternate=hull==='wayfarer'?'talon':'wayfarer';
  const switched=await page.evaluate(next=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipId=next;r.ui.setCockpitShip(next);return {paint:r.ui.root.dataset.cockpitPaint,container:r.ui.el('.cockpit-screen-target').style.containerType,art:r.ui.el('.cockpit-art').style.backgroundImage};},alternate);
  await page.evaluate(async()=>{const c=__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork;await c.ready;});
  assert.equal(await page.locator('.painted-cockpit-forward-hull').isVisible(),false,'optional exterior overlay hides when switching to another hull');assert.equal(switched.paint,alternate);assert.equal(switched.container,'','previous monitor query sizing is restored');assert.equal(switched.art,'none');
  await page.evaluate(hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipId=hull;r.ui.setCockpitShip(hull);},hull);await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork.layout);
  await page.evaluate(async()=>{const c=__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork;await c.ready;});
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork.shipId),hull);
  assert.deepEqual(errors,[]);
  const cost=await page.evaluate(()=>{const c=__VOID_PRIVATEER__.getRuntime().ui.cockpitArtwork,t=performance.now();for(let i=0;i<300;i++)c.update(1/60,{yaw:Math.sin(i),pitch:Math.cos(i)});return (performance.now()-t)/300;});
  await writeFile(`${out}/${name}.json`,JSON.stringify({geometry,hullLayer,steer,updateMs:cost,errors},null,2));console.log(name,hull,'approved cockpit passed, update ms',cost.toFixed(3));
 }catch(error){console.error('Cockpit failure diagnostics',JSON.stringify({hull,name,errors,pending:[...pending],networkFailures}));await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw error;}
 finally{await browser.close();}
}

}
