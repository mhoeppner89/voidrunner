import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const out='output/cockpit-comms',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',report=process.env.VR_PROFILES?await readFile(`${out}/report.json`,'utf8').then(JSON.parse).then(r=>r.report.filter(p=>!process.env.VR_PROFILES.split(',').includes(p.profile))).catch(()=>[]):[];
await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(name,e.message);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?startup-probe=1&revision=0.8.2jc`);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.launch();cancelAnimationFrame(r.frameId);r.save.player.position.splice(0,3,0,90000,0);r.save.player.velocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());});
  console.log(name,'flight ready');
  const message=name==='desktop'?'Bleib dicht bei den Wracks und achte auf die nächste Kurve. Wenn du sauber aus der Kurve kommst, kannst du mit dem Nachbrenner am anderen Piloten vorbeiziehen.':'Das reicht für den Auftrag. Wir können nach Vesper zurück, sobald du bereit bist.';
  const hulls=await page.evaluate(async()=>Object.keys((await import('/src/game/data.js')).SHIPS));
  const failures=[];
  for(const ship of hulls){
   try{
   await page.evaluate(async ship=>{
    const r=__VOID_PRIVATEER__.getRuntime(),{createOutfittingState}=await import('/src/game/outfitting.js');
    r.save.player.shipId=ship;r.save.player.outfitting=createOutfittingState([ship]);r._statsDirty=true;
    r.ui.updateHud(r.buildHudModel());r.ui.clearPilotLine();
    const art=getComputedStyle(document.querySelector('.cockpit-art')).backgroundImage.slice(5,-2);
    await r.ui.preloadImageSet('comms-qa',[art],{priority:'high'});
   },ship);
   const measure=()=>page.evaluate(()=>{
    const box=e=>e?.getBoundingClientRect().toJSON(),bar=box(document.querySelector('#comms-bar'));
    const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    return {bar,w:innerWidth,h:innerHeight,overlaps:[...document.querySelectorAll('.cockpit-screen-own,.cockpit-screen-target,.cockpit-screen-radar,#hyperdrive-card,#race-restart,.touch-fire,.touch-missile,.touch-boost-right,.touch-throttle,.touch-stick,.hud-wing-btn')].filter(e=>overlap(bar,box(e))).map(e=>e.className||e.id),text:box(document.querySelector('#comms-bar .talker-text')),fit:(()=>{const e=document.querySelector('#comms-bar .talker-text');return e?{h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth,overflow:getComputedStyle(e).overflowY,font:getComputedStyle(e).fontFamily,page:document.querySelector('#comms-bar').dataset.page,content:e.textContent}:null})()};
   });
   await page.waitForFunction(()=>!document.querySelector('#comms-bar').classList.contains('active'));
   await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.commsFitFrame);
   const stats=await page.evaluate(()=>['#screen-own-speed','#screen-own-fuel'].map(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect(),panel=e.closest('.cockpit-screen').getBoundingClientRect();return{selector,font:getComputedStyle(e).fontFamily,w:e.clientWidth,sw:e.scrollWidth,inside:b.left>=panel.left&&b.right<=panel.right+1&&b.bottom<=panel.bottom+1};}));
   for(const stat of stats){assert.ok(stat.font.includes('Courier'));assert.ok(stat.sw<=stat.w+1&&stat.inside,`${name}/${ship} ${JSON.stringify(stat)}`);}
   const idle=await measure();await page.screenshot({path:`${out}/${name}-${ship}-idle.png`});assert.ok(idle.bar.right<=idle.w&&idle.bar.top>=0&&(idle.bar.top<idle.h*.15||idle.bar.right<=idle.w*.45),`${name}/${ship} idle edge`);
   assert.deepEqual(idle.overlaps,[],`${name}/${ship} idle overlaps ${JSON.stringify(idle)}`);
   await page.screenshot({path:`${out}/${name}-${ship}-idle.png`});
   await page.evaluate(message=>__VOID_PRIVATEER__.getRuntime().ui.showStoryLine('Rin Vek',message),message);
   await page.waitForFunction(()=>{const i=document.querySelector('#comms-bar img');return !i||i.complete;});
   await page.waitForFunction(()=>document.querySelector('#comms-bar').dataset.page);
   const active=await measure();await page.screenshot({path:`${out}/${name}-${ship}-active.png`});assert.ok((active.bar.left>=active.w*.6||active.bar.right<=active.w*.45||active.bar.bottom<=active.h*.3)&&active.bar.right<=active.w&&active.bar.top>=0&&active.bar.bottom<active.h*.8,`${name}/${ship} active stays at the edge`);
   assert.deepEqual(active.overlaps,[],`${name}/${ship} active overlaps ${JSON.stringify(active)}`);
   assert.equal(active.fit.overflow,'hidden');assert.ok(active.fit.sh<=active.fit.h+1&&active.fit.sw<=active.fit.w+1,`${name}/${ship} message fits ${JSON.stringify(active.fit)}`);assert.ok(active.fit.font.includes('Courier')&&!active.fit.font.includes('Void VGA'));
   assert.equal(active.fit.page,'1/1',`${name}/${ship} ordinary transmission needs its full text: ${JSON.stringify(active)}`);assert.equal(active.fit.content,`Rin: ${message}`);
   assert.ok(active.text.width>75&&active.text.height>24,`${name}/${ship} readable message`);
   await page.screenshot({path:`${out}/${name}-${ship}-active.png`});
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.setWingTactics([0,1].map(index=>({index,order:'defensive',hull:100,maxHull:100,shield:100,maxShield:100})),2));
   await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.commsFitFrame);
   const wing=await measure();assert.deepEqual(wing.overlaps,[],`${name}/${ship} wing overlaps ${JSON.stringify(wing)}`);assert.ok(wing.fit.sh<=wing.fit.h+1&&wing.fit.sw<=wing.fit.w+1);
   await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.clearPilotLine();});await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.commsFitFrame);
   const wingIdle=await measure();assert.deepEqual(wingIdle.overlaps,[],`${name}/${ship} idle wing overlaps ${JSON.stringify(wingIdle)}`);
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.setWingTactics([],0));
   report.push({profile:name,ship,idle,active,wing,wingIdle});console.log(name,ship,'idle/story/wing clear');
   }catch(error){failures.push(error.message);console.error(name,ship,error.message);await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.setWingTactics([],0);u.clearPilotLine();});}
  }
  assert.deepEqual(failures,[]);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.showPilotLine('Rin Vek','Halte Abstand zu den Trümmern. '.repeat(100),'ally',60000,true));
  await page.waitForFunction(()=>Number(document.querySelector('#comms-bar').dataset.page?.split('/')[1])>1);
  await page.waitForFunction(()=>document.querySelector('#comms-bar').dataset.page.startsWith('2/'));
  assert.ok(await page.locator('#comms-bar .talker-text').evaluate(e=>e.scrollHeight<=e.clientHeight+1));
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.showGroupLine(['Schattenfalke','Nachtschwärmer','Sternenjäger','Rotklinge','Eisenfaust'],'Bleib auf Kurs und halte Abstand.','hostile',60000));
  await page.waitForFunction(()=>document.querySelector('#comms-bar').dataset.page);
  assert.ok(await page.locator('#comms-bar .talker-text').evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.textContent.startsWith('Schattenfal… +4:')));
  await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.showPilotLine('Patrol','Alles in Ordnung?','neutral',60000);document.querySelector('#patrol-reply-chip').classList.remove('is-hidden');});
  assert.ok(await page.locator('#patrol-reply-chip').evaluate(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=40&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
  await page.evaluate(()=>{document.querySelector('#patrol-reply-chip').classList.add('is-hidden');__VOID_PRIVATEER__.getRuntime().ui.clearPilotLine();});await page.locator('#comms-bar').click();assert.ok(await page.locator('#chat-panel').isVisible());await page.locator('[data-ui-command="close-chat"]').click();
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({report,errors},null,2));
 }finally{let timer;await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(r,5000);})]);clearTimeout(timer);}
}process.exit(0);
