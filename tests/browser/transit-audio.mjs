// Every browser stays muted. OfflineAudioContext renders checks into memory,
// never to the speakers; live animation checks retain effects volume zero.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/transit-audio',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
await writeFile(`${out}/offline.html`,'<link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script>');
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1280,height:800}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/${out}/offline.html`);
  const audio=await page.evaluate(async()=>{
   const {createTransitVoice,transitMix}=await import('/src/game/transitAudio.js'),{AudioManager}=await import('/src/game/audio.js'),results=[];
   for(const[phase,kind,expectedCues]of [['landing','planet-pad',2],['takeoff','station-pad',1],['entry','planet',0],['exit','station',0]]){
    const real=new OfflineAudioContext(2,48000*3,48000);let at=0,created=0;
    const context=new Proxy(real,{get(target,key){if(key==='currentTime')return at;const v=Reflect.get(target,key,target);if(typeof v!=='function')return v;return(...args)=>{if(String(key).startsWith('create'))created++;return v.apply(target,args);};}});
    const manager=new AudioManager();Object.assign(manager,{context,enabled:true,effectsGain:context.createGain(),effectsReverbGain:context.createGain(),musicGain:context.createGain(),musicReverbGain:context.createGain()});manager.effectsGain.connect(real.destination);manager.pinkBuffer=real.createBuffer(2,48000,48000);
    let seed=12345;for(let channel=0;channel<2;channel++){const d=manager.pinkBuffer.getChannelData(channel);let smooth=0;for(let i=0;i<d.length;i++){seed=(seed*1664525+1013904223)>>>0;smooth=smooth*.86+((seed/4294967296)*2-1)*.14;d[i]=smooth*.6;}}
    manager.setVolumes(.4,0);const beforeMute=created;manager.cinematicSound('start',phase,kind,0);if(created!==beforeMute||manager.cinematicVoice)throw Error('Muted cinematics allocate voices');
    manager.setVolumes(.4,.68);manager.cinematicSound('start',phase,kind,0);const voice=manager.cinematicVoice;
    const firstNodes=created;for(let i=0;i<12;i++)manager.cinematicSound('update',phase,kind,.2,-.2);if(created!==firstNodes)throw Error('Continuous updates allocate audio nodes');
    for(let i=0;i<67;i++){at=i/30;manager.cinematicSound('update',phase,kind,i/67,-.3+.6*i/67);}at=2.25;manager.cinematicSound('stop');if(manager.cinematicVoice||!voice.stopped)throw Error('Cinematic audio did not stop');
    const buffer=await real.startRendering();let peak=0,total=0,tail=0;for(let ch=0;ch<2;ch++){const d=buffer.getChannelData(ch);for(let i=0;i<d.length;i++){if(!Number.isFinite(d[i]))throw Error('Invalid audio sample');peak=Math.max(peak,Math.abs(d[i]));total+=d[i]*d[i];if(i>d.length-4800)tail+=d[i]*d[i];}}
    if(voice.cueCount!==expectedCues)throw Error(`${phase}: cues ${voice.cueCount}`);if(peak<.01||peak>.95)throw Error(`${phase}: bad peak ${peak}`);if(tail>.00001)throw Error('Audio tail does not stop');
    for(const release of manager.effectReleases??[])release();results.push({phase,kind,cues:voice.cueCount,peak,rms:Math.sqrt(total/(buffer.length*2)),tail,created});
   }
   if(transitMix('entry','station',.5).air!==0||transitMix('entry','planet',.5).air<=0)throw Error('Atmosphere/hangar sound must differ');
   return results;
  });console.log(name,'silent offline sound render',JSON.stringify(audio));
  if(!process.env.VR_AUDIO_ONLY){
   await page.goto(`${base}/game.html?revision=0.8.2iy`);await page.waitForFunction(()=>__VOID_PRIVATEER__?.newGame);await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
   const ready=()=>page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});await ready();
   const live=[];
   for(const port of ['helix','vesper']){
    await page.evaluate(port=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);window.soundEvents=[];window.originalSoundHook??=r.ui.actions.cinematicSound;const hook=window.originalSoundHook;r.ui.actions.cinematicSound=(event,phase,kind,t,pan)=>{soundEvents.push({event,phase,kind,t,pan});hook(event,phase,kind,t,pan);};r.save.player.dockedAt=port;r.ui.showDock(r.save,port,{arrival:true});},port);await ready();
    const arrival=await page.evaluate(()=>soundEvents.filter(e=>e.event==='start').map(e=>[e.phase,e.kind]));assert.deepEqual(arrival,[['entry',port==='helix'?'station':'planet'],['landing',port==='helix'?'station-pad':'planet-pad']]);
    await page.screenshot({path:`${out}/${name}-${port}-landed.png`});
    await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();soundEvents.length=0;r.ui.startVesperLaunchTransition();});await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.vesperLaunchTransition);
    const departure=await page.evaluate(()=>({phases:soundEvents.filter(e=>e.event==='start').map(e=>[e.phase,e.kind]),stopped:!__VOID_PRIVATEER__.getRuntime().ui.concourseShip.soundActive,voice:!!__VOID_PRIVATEER__.getRuntime().audio.cinematicVoice}));assert.deepEqual(departure.phases,[['takeoff',port==='helix'?'station-pad':'planet-pad'],['exit',port==='helix'?'station':'planet']]);assert.ok(departure.stopped&&!departure.voice);live.push({port,arrival,departure});
    // Restore the original action instead of wrapping it on the next port.
    await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().ui.actions.cinematicSound=originalSoundHook;});
   }
   await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;window.stops=0;v.onAnimationSound=e=>{if(e==='stop')stops++;};v.soundActive=true;v.stop();v.stop();if(stops!==1||v.soundActive)throw Error('Cancellation must stop once');});
   await writeFile(`${out}/${name}-live.json`,JSON.stringify(live,null,2));
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-audio.json`,JSON.stringify({audio,errors},null,2));console.log(name,'cinematic timing, source reuse, mute and stop checks passed');
 }finally{await browser.close();}
}
