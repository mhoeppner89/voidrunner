// Live sound-design check: boots a real career flight with the audio engine
// on, stages a fight and inspects the running mix. Desktop Chrome runs the
// graph for real behind --mute-audio; iPhone/WebKit keeps the context
// suspended (never audible) and proves the same code builds its graph there.
import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url);
const out='output/sound-design',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
const profiles=[['desktop',chromium,{viewport:{width:1280,height:800}}],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
for(const [name,type,device] of profiles){
 const live=type===chromium;
 const browser=await type.launch({headless:true,...(live?{...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio','--autoplay-policy=no-user-gesture-required']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/Could not load sound/.test(m.text()))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(live=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:.34,effects:.68}));if(!live){const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};}},live);
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();
  await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.getRuntime()?.flightPrepared && document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().launch());
  // Bank: every group requested in flight decodes without a failure.
  const bank=await page.evaluate(async()=>{const a=__VOID_PRIVATEER__.getRuntime().audio;await a.samplesReady;await a.bank.load('music');await a.bank.load('dock');
   const {SOUNDS}=await import('/src/game/soundBank.js');const missing=Object.keys(SOUNDS).filter(id=>(a.bank.buffers.get(id)?.filter(Boolean).length??0)!==SOUNDS[id].files.length);
   let seconds=0,bytes=0;for(const list of a.bank.buffers.values())for(const b of list){seconds+=b.duration;bytes+=b.length*b.numberOfChannels*4;}
   return {sounds:a.bank.buffers.size,missing,failed:[...a.bank.failed],seconds,megabytes:bytes/1048576,state:a.context.state,rate:a.context.sampleRate};});
  assert.deepEqual(bank.missing,[]);assert.deepEqual(bank.failed,[]);assert.ok(bank.megabytes<80,`decoded audio ${bank.megabytes.toFixed(1)} MB`);
  const cue=await page.evaluate(()=>{
   const a=__VOID_PRIVATEER__.getRuntime().audio,played=[],play=a.play.bind(a);
   a.play=(id,...rest)=>{played.push(id);return play(id,...rest);};
   const flight={missileThreat:.8,missileBreak:true,missileCommitted:true};
   a.updateCockpit(1/60,false,0,flight);
   flight.missileBreak=false;
   for(let i=0;i<60;i++)a.updateCockpit(1/60,false,0,flight);
   a.play=play;
   return played.filter(id=>id==='missileBreak').length===1 && !played.includes('missileAlert');
  });
  assert.ok(cue,'the break cue plays once and the approach pips stay silent after it');
  // Check the flight menu before the firefight can open a death or recovery screen.
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.isModalOpen);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.showPause());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().audio.paused);
  const paused=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().audio.paused);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.hidePause());
  await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().audio.paused);
  const resumed=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().audio.paused);
  // Stage a fight next to the player and let the real frame loop run.
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;p.throttle=.8;
   window.soundTap=r.audio.context.createAnalyser();soundTap.fftSize=2048;r.audio.master.connect(soundTap);window.soundPeak=0;window.soundBad=0;
   const data=new Float32Array(2048);window.soundTimer=setInterval(()=>{soundTap.getFloatTimeDomainData(data);for(const v of data){if(!Number.isFinite(v))soundBad++;soundPeak=Math.max(soundPeak,Math.abs(v));}},50);
   for(let i=0;i<3;i++){const ship=r.spawnShip('pirate',[p.position[0]+(i-1)*60,p.position[1]+20,p.position[2]-180]);ship.hostile=true;ship.targetId='player';}});
  await page.waitForFunction(bars=>{const a=__VOID_PRIVATEER__.getRuntime().audio;return a.currentContext==='combat'&&a.engine.voices?.length===8&&a.music.bar>=bars;},live?2:1,{timeout:60000});
  const fight=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),a=r.audio,{SOUND_EVENTS}=await import('/src/game/soundEvents.js');let created=0;
   // Every designed event plays from the cockpit and from the world without throwing.
   for(const id of Object.keys(SOUND_EVENTS)){a.effectTimes.clear();a.play(id,.5);a.effectTimes.clear();a.playAtDirection(id,.5,40,25,-10);created++;}
   a.playComms('aggressive');a.play('mining',.5);a.stinger('threat');a.stinger('kill');
   const peakVoices=a.activeVoices;await new Promise(done=>setTimeout(done,1500));
   return {context:a.currentContext,tier:a.music.tier,bar:a.music.bar,engineVoices:a.engine.voices.length,created,peakVoices,voices:a.activeVoices,releases:a.effectReleases.size,danger:a.dangerLevel,state:a.context.state,time:a.context.currentTime};});
  assert.equal(fight.context,'combat');assert.equal(fight.engineVoices,8);assert.ok(fight.peakVoices<=36+fight.created,'voice limiting holds');assert.equal(fight.voices,fight.releases,'every live voice is tracked for release');
  if(live){
   // Voices release themselves once their tails end; nothing accumulates.
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().audio.activeVoices<12,undefined,{timeout:30000});
   const mix=await page.evaluate(()=>({peak:soundPeak,bad:soundBad,time:__VOID_PRIVATEER__.getRuntime().audio.context.currentTime}));
   assert.equal(mix.bad,0,'the master bus stays finite');assert.ok(mix.peak>.01,'the mix is audible');assert.ok(mix.peak<=1,'the limiter holds the master below full scale');assert.ok(mix.time>3,'the audio clock is running');fight.masterPeak=mix.peak;
  }
  // Docking swaps the ambience.
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().dockAt('helix',true));
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().audio.currentContext==='station');
  const states=await page.evaluate(({paused,resumed})=>{const r=__VOID_PRIVATEER__.getRuntime(),a=r.audio;
   const docked={place:a.ambience.place,context:a.currentContext,tunnel:Boolean(a.engine.tunnel)};
   clearInterval(soundTimer);r.dispose();return {paused,resumed,docked,closed:a.context===undefined&&a.enabled===false};},{paused,resumed});
  if(live){assert.equal(states.paused,true);assert.equal(states.resumed,false);assert.equal(states.docked.context,'station');assert.match(states.docked.place,/station|planetDock/);}
  assert.equal(states.closed,true,'disposing the session tears the audio graph down');
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({bank,fight,states},null,1));
  console.log(name,'sound design live check passed',JSON.stringify({sounds:bank.sounds,decodedMB:+bank.megabytes.toFixed(1),tier:fight.tier,bar:fight.bar,peakVoices:fight.peakVoices,masterPeak:fight.masterPeak}));
 }finally{await browser.close();}
}
