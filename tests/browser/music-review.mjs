// Music review page: every score piece is listed, auditions play through
// the real director (approved or not), combat escalates and resolves, the
// rotation runs for a chosen place, and the game's approvals stay untouched.
import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android']);
const out='output/music-review',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
for(const [name,device]of [['desktop',{viewport:{width:1440,height:1000}}],['android',devices['Pixel 7']]].filter(([n])=>(process.env.VR_PROFILES??'desktop,android').split(',').includes(n))){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/output/audio-mix/'))errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>localStorage.setItem('void-privateer-save-v1','{"musicReviewSentinel":true}'));
  await page.goto(`${base}/tools/playtest/sound-review/music.html`);await page.waitForFunction(()=>window.musicReview);
  assert.equal(await page.evaluate(()=>musicReview.audio.context),undefined,'no audio before a gesture');
  const listed=await page.evaluate(async()=>{const {MUSIC_PIECES,APPROVED_PIECES}=await import('/src/game/musicScore.js');return {cards:document.querySelectorAll('[data-piece]').length,pieces:MUSIC_PIECES.length,pending:document.querySelectorAll('.chip.pending').length,approved:[...APPROVED_PIECES].sort()};});
  assert.equal(listed.cards,listed.pieces,'every piece has a card');assert.equal(listed.pending,listed.pieces-listed.approved.length);
  await page.locator('#enable').click();await page.waitForFunction(()=>musicReview.enabled);
  await page.evaluate(()=>{const a=musicReview.audio;window.tap=a.context.createAnalyser();tap.fftSize=2048;a.master.connect(tap);});
  const playing=id=>page.waitForFunction(id=>musicReview.audio.music.piece?.id===id,id);
  // An open-space piece, a docked theme and a 7/8 combat piece.
  await page.locator('[data-piece="open-pale-rime"] .actions button',{hasText:'Play'}).click();await playing('open-pale-rime');
  await page.locator('[data-piece="dock-blackglass"] .actions button',{hasText:'Play'}).click();await playing('dock-blackglass');
  assert.equal(await page.evaluate(()=>musicReview.audio.currentContext),'station');
  await page.waitForFunction(()=>musicReview.audio.music.bar>=2);
  const signal=await page.evaluate(()=>{const data=new Float32Array(2048);tap.getFloatTimeDomainData(data);return {finite:data.every(Number.isFinite),peak:Math.max(...data.map(Math.abs))};});
  assert.equal(signal.finite,true);assert.ok(signal.peak>0,'the director produces samples');
  await page.locator('[data-piece="combat-cutthroat"] .actions button',{hasText:'Play'}).click();await playing('combat-cutthroat');
  await page.locator('[data-piece="combat-cutthroat"] .actions button',{hasText:'Three hostiles'}).click();
  await page.waitForFunction(()=>musicReview.audio.music.tier===2);
  await page.locator('[data-piece="combat-cutthroat"] .actions button',{hasText:'End the fight'}).click();
  await page.waitForFunction(()=>musicReview.audio.currentContext==='open',undefined,{timeout:30000});
  // The game's rotation for a docked place, including pieces awaiting review.
  await page.locator('#rot-system').selectOption('pale-ring');await page.locator('#rot-place').selectOption('dock:nacre');
  await page.locator('#rot-play').click();await playing('dock-nacre');
  // Verdicts are kept per piece and exported; the game's approval list is untouched.
  await page.locator('[data-piece="open-pale-rime"] [data-verdict="approve"]').click();
  await page.locator('[data-piece="open-pale-rime"] textarea').fill('Lovely and cold.');
  const download=page.waitForEvent('download');await page.locator('#export').click();assert.equal((await download).suggestedFilename(),'voidrunner-music-review.json');
  await page.locator('#stop').click();
  const after=await page.evaluate(async()=>{const {APPROVED_PIECES}=await import('/src/game/musicScore.js');return {approved:[...APPROVED_PIECES].sort(),saved:localStorage.getItem('void-privateer-save-v1'),scroll:document.documentElement.scrollWidth,width:innerWidth};});
  assert.deepEqual(after.approved,listed.approved,'reviewing never changes the game\'s approvals');
  assert.equal(after.saved,'{"musicReviewSentinel":true}');assert.ok(after.scroll<=after.width+1,'no horizontal scroll');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${name}.png`});
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({listed,signal,after,errors},null,2));
  console.log(name,`${listed.cards} pieces listed; auditions, combat tiers, rotation and verdict export work`);
 }finally{await browser.close();}
}
