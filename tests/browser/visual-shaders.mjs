// Muted real-runtime coverage of the shared display finish and depth resolve.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/visual-shaders',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',reports=[];await mkdir(out,{recursive:true});
await writeFile(`${out}/depth-fixture.html`,`<link rel="icon" href="data:,"/><script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script><script type="module">
import * as T from 'three';import {createPixelResolveMaterial,createPixelSceneTarget,bindPixelResolve,pixelTargetSamples} from '/src/game/pixelResolve.js';
const r=new T.WebGLRenderer({preserveDrawingBuffer:true});r.setSize(128,128);document.body.append(r.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.5,1e8),target=createPixelSceneTarget(128,128,pixelTargetSamples(r)),resolve=createPixelResolveMaterial(),quad=new T.Mesh(new T.PlaneGeometry(2,2),resolve),ortho=new T.Camera();
const checker=new T.Mesh(new T.PlaneGeometry(1,1),new T.ShaderMaterial({vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;void main(){float c=mod(floor(v.x*93.)+floor(v.y*93.),2.);gl_FragColor=vec4(vec3(c),1.);}'}));scene.add(checker);
function sample(distance){checker.position.z=-distance;checker.scale.setScalar(distance*1.16);r.setRenderTarget(target);r.render(scene,camera);bindPixelResolve(resolve,target.texture,target,camera,1);r.setRenderTarget(null);r.render(quad,ortho);const bytes=new Uint8Array(128*128*4);const gl=r.getContext();gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let sum=0,sum2=0,count=0;for(let y=8;y<120;y++)for(let x=8;x<120;x++){const c=bytes[(y*128+x)*4];sum+=c;sum2+=c*c;count++;}return{mean:sum/count,variance:sum2/count-(sum/count)**2};}
window.result={near:sample(200),mid:sample(8000),far:sample(120000),samples:target.samples};window.ready=true;
</script>`);
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
 const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url);});
 await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await page.goto(`${base}/${out}/depth-fixture.html`);await page.waitForFunction(()=>window.ready);const depth=await page.evaluate(()=>window.result);console.log(name,'depth',JSON.stringify(depth));assert.ok(depth.near.variance>5000,JSON.stringify(depth));assert.ok(depth.far.variance<depth.near.variance*.85,JSON.stringify(depth));assert.ok(depth.mid.variance>depth.near.variance*.95,JSON.stringify(depth));
 await page.goto(`${base}/game.html?revision=0.8.2ix`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>document.fonts.ready);
 assert.ok(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Void VGA'&&f.status==='loaded')&&document.fonts.check('16px "Void VGA"','ÄÖÜäöüß')));assert.equal(await page.locator('#game-shell').getAttribute('data-pixel-finish'),'native');await page.screenshot({path:`${out}/${name}-title.png`});
 await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.screenshot({path:`${out}/${name}-market.png`});
 await page.locator('[data-market-point="equipment"]').click();await page.screenshot({path:`${out}/${name}-equipment.png`});
 const dock=await page.locator('#dock-screen').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,screen:innerWidth,filter:getComputedStyle(document.querySelector('#game-shell')).filter}));assert.ok(dock.scrollWidth<=dock.width+1,JSON.stringify(dock));
 await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideDock();await r.launch();cancelAnimationFrame(r.frameId);r.save.player.position.splice(0,3,0,90000,0);r.save.player.velocity.fill(0);r.save.player.throttle=0;r.ships=[];r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.renderer.render();});
 const sprite=await page.locator('.cockpit-art').evaluate(e=>({insideFinish:!!e.closest('[data-pixel-finish="native"]'),sampling:getComputedStyle(e).imageRendering,finish:getComputedStyle(e.closest('#game-shell')).filter}));assert.ok(sprite.insideFinish&&sprite.finish==='none');assert.equal(sprite.sampling,'pixelated');
 const hulls=[];
 for(const hull of ['wayfarer','talon','atlas']){
  await page.evaluate(async hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipId=hull;r._statsDirty=true;r.ui.setCockpitShip(hull);r.syncRender(0,performance.now());await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},hull);
  await page.evaluate(()=>Promise.all([...__VOID_PRIVATEER__.getRuntime().ui.warmImageSlots.get('flight-core')].map(url=>__VOID_PRIVATEER__.getRuntime().ui.warmImageRecords.get(url).promise)));
  const shot=await page.screenshot({path:`${out}/${name}-${hull}-cockpit.png`});
  if(hull==='wayfarer'){
   // DOM text can be present while a browser filter renders a black panel.
   // Read this one test capture, not live game frames, to catch that failure.
   const visible=await page.evaluate(async png=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const ratio=image.width/innerWidth,result={};
    for(const type of ['own','radar','target']){
     const b=document.querySelector('.cockpit-screen-'+type).getBoundingClientRect();
     const x=Math.round((b.x+b.width*.15)*ratio),y=Math.round((b.y+b.height*(type==='target'?.03:.15))*ratio),w=Math.max(1,Math.round(b.width*.7*ratio)),h=Math.max(1,Math.round(b.height*(type==='target'?.4:.7)*ratio));
     const bytes=ctx.getImageData(x,y,w,h).data;let bright=0;for(let i=0;i<bytes.length;i+=4)if(Math.max(bytes[i],bytes[i+1],bytes[i+2])>130)bright++;result[type]=bright;
    }return result;
   },shot.toString('base64'));assert.ok(Object.values(visible).every(count=>count>10),JSON.stringify({name,visible}));
  }
  hulls.push(await page.locator('#screen-own-fuel').evaluate(e=>({text:e.textContent,width:e.clientWidth,scrollWidth:e.scrollWidth})));assert.ok(hulls.at(-1).scrollWidth<=hulls.at(-1).width+1,JSON.stringify({name,hull,...hulls.at(-1)}));
 }
 await page.locator('.cockpit-screen-own').click({position:{x:10,y:10}});await page.locator('[data-ship-section="equipment"]').click();await page.screenshot({path:`${out}/${name}-console.png`});await page.locator('[data-ui-command="close-ship"]').click();
 assert.equal(await page.locator('#void-pixel-finish').count(),0,'no monitor colour filter is installed');
 assert.equal(await page.locator('[data-retro-sprite]').count(),0,'sprites keep their original pixels');
 const resources=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime().renderer,before={...r.renderer.info.memory};for(let i=0;i<20;i++)r.render();return{before,after:{...r.renderer.info.memory},scale:+r.renderer.domElement.dataset.pixelScale,size:r.renderer.domElement.dataset.renderResolution,phone:!!r.pixelSceneTarget,bloom:!!r.bloomSceneTarget};});assert.deepEqual(resources.after,resources.before);assert.ok(Number.isInteger(resources.scale)&&resources.scale>=1);if(name==='iphone'){assert.ok(resources.phone);assert.ok(!resources.bloom);}
 const budget=await page.evaluate(()=>{
  const r=__VOID_PRIVATEER__.getRuntime().renderer,root=document.querySelector('#game-shell'),mode=r.qualityMode,scale=r.lastQualityScale;
  r.setQualityMode('low');r.render();const low={filter:getComputedStyle(root).filter,instrument:getComputedStyle(document.querySelector('.cockpit-screen')).filter};
  r.setQualityMode('auto');r.setQualityScale(.7);r.render();const slow=getComputedStyle(document.querySelector('.cockpit-screen')).filter;
  r.setQualityMode(mode);r.setQualityScale(scale);r.render();return{low,slow,restored:getComputedStyle(document.querySelector('.cockpit-screen')).filter};
 });assert.equal(budget.low.instrument,'none');assert.ok(!budget.low.filter.includes('url('));assert.equal(budget.slow,budget.restored);
 let frameCost;
 if(process.env.VR_VISUAL_PERF==='1')frameCost=await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime().renderer,root=document.querySelector('#game-shell'),finish=root.style.filter,result={};
  for(const enabled of [false,true]){
   root.style.filter=enabled?finish:'none';const samples=[];
   for(let i=0;i<42;i++){const start=await new Promise(requestAnimationFrame);r.camera.rotation.y+=.001;r.render();document.querySelector('#screen-own-speed').textContent=String(i*10);const end=await new Promise(requestAnimationFrame);if(i>=6)samples.push(end-start);}
   samples.sort((a,b)=>a-b);result[enabled?'finish':'unfiltered']={median:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)]};
  }root.style.filter=finish;return result;
 });
 if(name==='desktop'){
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.renderer.resize();r.renderer.render();});
  await page.screenshot({path:`${out}/${name}-resized.png`});
 }
 assert.deepEqual(errors,[]);reports.push({name,depth,dock,sprite,hulls,resources,budget,frameCost,errors});await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(name,JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}
}
