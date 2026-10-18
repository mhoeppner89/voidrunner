import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const out='output/cockpit-comms',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',report=process.env.VR_PROFILES?await readFile(`${out}/report.json`,'utf8').then(JSON.parse).then(r=>r.report.filter(p=>!process.env.VR_PROFILES.split(',').includes(p.profile))).catch(()=>[]):[];
await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage(device),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0})));
  await page.goto(`${base}/output/race-session/index.html?revision=0.8.2hn`);
  await page.waitForFunction(()=>window.isolatedRace?.ready);
  const silent=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);document.querySelector('#race-ready').hidden=true;document.querySelector('#race-restart').hidden=false;
   const sounds=[],play=r.audio.play;r.audio.play=(...args)=>sounds.push(args);
   const gate=r.activeRace.course.gates[0],before=gate.position.map((v,i)=>v-gate.direction[i]*20),after=gate.position.map((v,i)=>v+gate.direction[i]*20);
   const crossed=r.raceAdvanceMainGate(r.activeRace,before,after,r.save.world.time+1);r.audio.play=play;
   return {crossed,sounds,index:r.save.player.raceGateIndex};
  });
  assert.ok(silent.crossed);assert.equal(silent.index,1);assert.deepEqual(silent.sounds,[]);
  const hulls=await page.evaluate(async()=>Object.keys((await import('/src/game/data.js')).SHIPS));
  for(const ship of hulls){
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
    return {bar,w:innerWidth,h:innerHeight,overlaps:[...document.querySelectorAll('.cockpit-screen-own,.cockpit-screen-target,.cockpit-screen-radar,#hyperdrive-card,#race-restart')].filter(e=>overlap(bar,box(e))).map(e=>e.className||e.id),text:box(document.querySelector('#comms-bar .talker-text'))};
   });
   const idle=await measure();assert.ok(idle.bar.right<=idle.w&&idle.bar.top>=0&&idle.bar.top<idle.h*.15,`${name}/${ship} idle edge`);
   assert.deepEqual(idle.overlaps,[],`${name}/${ship} idle overlaps ${JSON.stringify(idle)}`);
   await page.screenshot({path:`${out}/${name}-${ship}-idle.png`});
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.showStoryLine('Rin Vek','Bleib dicht bei den Wracks und achte auf die nächste Kurve. Wenn du sauber aus der Kurve kommst, kannst du mit dem Nachbrenner am anderen Piloten vorbeiziehen.'));
   await page.waitForFunction(()=>{const i=document.querySelector('#comms-bar img');return !i||i.complete;});
   const active=await measure();assert.ok((active.bar.left>=active.w*.6||active.bar.bottom<=active.h*.3)&&active.bar.right<=active.w&&active.bar.top>=0&&active.bar.bottom<active.h*.8,`${name}/${ship} active stays at the edge`);
   assert.deepEqual(active.overlaps,[],`${name}/${ship} active overlaps ${JSON.stringify(active)}`);
   assert.ok(active.text.width>75&&active.text.height>24,`${name}/${ship} readable message`);
   await page.screenshot({path:`${out}/${name}-${ship}-active.png`});
   report.push({profile:name,ship,idle,active});console.log(name,ship,'idle/story clear');
  }
  await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;u.showPilotLine('Patrol','Alles in Ordnung?','neutral',60000);document.querySelector('#patrol-reply-chip').classList.remove('is-hidden');});
  assert.ok(await page.locator('#patrol-reply-chip').evaluate(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=40&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
  await page.evaluate(()=>{document.querySelector('#patrol-reply-chip').classList.add('is-hidden');__VOID_PRIVATEER__.getRuntime().ui.clearPilotLine();});await page.locator('#comms-bar').click();assert.ok(await page.locator('#chat-panel').isVisible());await page.locator('[data-ui-command="close-chat"]').click();
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({report,errors},null,2));
 }finally{let timer;await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(r,5000);})]);clearTimeout(timer);}
}process.exit(0);
