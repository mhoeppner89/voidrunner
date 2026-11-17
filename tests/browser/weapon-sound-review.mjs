import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android']);
const out='output/weapon-sound-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4214';await mkdir(out,{recursive:true});
for(const [name,device]of [['desktop',{viewport:{width:1440,height:1000}}],['android',devices['Pixel 7 landscape']]].filter(([n])=>(process.env.VR_PROFILES??'desktop,android').split(',').includes(n))){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-save-v1','{"soundReviewSentinel":true}');localStorage.setItem('void-privateer-settings-v1','{"effects":0.4}');});
  await page.goto(`${base}/tools/playtest/sound-review/weapons.html`);await page.waitForFunction(()=>window.weaponSoundReview);
  assert.equal(await page.evaluate(()=>weaponSoundReview.audio.context),undefined,'no audio before a gesture');await page.locator('#enable').click();await page.waitForFunction(()=>weaponSoundReview.enabled);
  const coverage=await page.evaluate(async()=>{
   const r=weaponSoundReview,{WEAPONS,LAUNCHERS}=await import('/src/game/weapons.js'),{SOUND_EVENTS}=await import('/src/game/soundEvents.js');
   const expected=[...Object.values(WEAPONS).filter(w=>!w.legacyOnly),...Object.values(LAUNCHERS)];
   return {expected:[...new Set(expected.map(w=>w.audioKey))].sort(),actual:r.catalog.map(c=>c.event).sort(),profiles:r.catalog.flatMap(c=>c.profiles.map(p=>p.id)),expectedProfiles:expected.map(w=>w.id),failed:[...r.audio.bank.failed],lock:SOUND_EVENTS.lockWarning??null,legacySample:r.audio.bank.buffers.has('lock-warning'),scroll:document.documentElement.scrollWidth,width:innerWidth};
  });assert.deepEqual(coverage.actual,coverage.expected);for(const id of coverage.expectedProfiles)assert.ok(coverage.profiles.includes(id));assert.deepEqual(coverage.failed,[]);assert.equal(coverage.lock,null);assert.equal(coverage.legacySample,false);assert.ok(coverage.scroll<=coverage.width+1);
  await page.evaluate(()=>{const a=weaponSoundReview.audio;window.reviewTap=a.context.createAnalyser();reviewTap.fftSize=2048;a.master.connect(reviewTap);});
  for(const event of coverage.actual){await page.locator(`[data-sound="${event}"] [data-play="shot"]`).click();await page.waitForFunction(id=>weaponSoundReview.history.some(h=>h.event===id),event);}
  const signal=await page.evaluate(()=>{const data=new Float32Array(2048);reviewTap.getFloatTimeDomainData(data);return {finite:data.every(Number.isFinite),peak:Math.max(...data.map(Math.abs))};});assert.equal(signal.finite,true);assert.ok(signal.peak>0,'the live mixer produces samples');
  await page.evaluate(()=>{
   const a=weaponSoundReview.audio,create=a.context.createBufferSource.bind(a.context),trigger=a.trigger.bind(a);window.reviewBeamSources=[];let beam=false;
   a.context.createBufferSource=()=>{const source=create();if(beam)reviewBeamSources.push(source);return source;};
   a.trigger=(event,...args)=>{beam=event==='beam';try{return trigger(event,...args);}finally{beam=false;}};
  });
  await page.locator('[data-sound="beam"] [data-play="burst"]').click();await page.waitForFunction(()=>weaponSoundReview.active?.entry.event==='beam'&&weaponSoundReview.active.shots>=3);await page.locator('#stop').click();
  assert.equal(await page.evaluate(()=>weaponSoundReview.active),undefined);const stopped=await page.evaluate(()=>weaponSoundReview.history.length);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>weaponSoundReview.history.length),stopped,'stop cancels future shots');
  await page.evaluate(async()=>{
   const a=weaponSoundReview.audio;
   for(let i=0;i<6;i++){a.play('beam',.72);a.playAtDirection('beam',.55,100,i%2?60:-60,-80);await new Promise(resolve=>setTimeout(resolve,70));}
  });
  const beamVoice=await page.evaluate(()=>({count:reviewBeamSources.length,fixed:reviewBeamSources.every(s=>s.playbackRate.value===1),original:reviewBeamSources.every(s=>s.buffer===weaponSoundReview.audio.bank.buffers.get('beam')[0])}));
  assert.ok(beamVoice.count>=10,'multiple beam voices overlap');assert.equal(beamVoice.fixed,true,'overlapping beams never shift into different pitches');assert.equal(beamVoice.original,true,'each beam uses the original recorded body');
  await page.locator('#play-all').click();await page.waitForFunction(()=>weaponSoundReview.active?.entry.event==='beam');await page.locator('#stop').click();
  await page.locator('#perspective').selectOption('far');await page.locator('[data-sound="gauss"] [data-play="shot"]').click();assert.equal(await page.locator('#perspective').inputValue(),'far');
  await page.locator('[data-sound="laser"] textarea').fill('Review note');const download=page.waitForEvent('download');await page.locator('#export').click();assert.equal((await download).suggestedFilename(),'voidrunner-weapon-sound-feedback.json');
  assert.equal(await page.evaluate(()=>localStorage.getItem('void-privateer-save-v1')),'{"soundReviewSentinel":true}');assert.equal(await page.evaluate(()=>localStorage.getItem('void-privateer-settings-v1')),'{"effects":0.4}');
  await page.locator('#stop').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${name}.png`,fullPage:true});assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({coverage,signal,errors},null,2));console.log(name,'all weapon sounds decode/play, firing/stop work, notes export and saves stay untouched');
 }finally{await browser.close();}
}
