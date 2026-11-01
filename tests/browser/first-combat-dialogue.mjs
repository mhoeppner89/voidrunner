import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/first-combat-dialogue';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});await context.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/output/exploration-review/index.html?scene=feedback`);await page.waitForFunction(()=>window.discoveryReview?.ready&&discoveryReview.scene==='feedback');
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.closeAdventure(false);r.ui.hideDock();r.ui.dockLocation=undefined;r.save.player.dockedAt=undefined;});
  const open=async(id,lang)=>page.evaluate(async({id,lang})=>{const r=__VOID_PRIVATEER__.getRuntime(),{setLanguage}=await import('/src/game/i18n.js');r.ui.closeAdventure(false);setLanguage(lang);r.ui.openStoryAdventure('Rin Vek','','ally',`tutorial-${id}`);},{id,lang});
  const speech=page.locator('.adventure-speech'),buttons=page.locator('#adventure-panel [data-ui-command="adventure-choice"]');
  const checkFit=async()=>{const fit=await speech.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.adventure-dialogue').getBoundingClientRect();return{horizontal:e.scrollWidth<=e.clientWidth+1,inside:r.left>=p.left-1&&r.right<=p.right+1};});assert.ok(fit.horizontal&&fit.inside,JSON.stringify(fit));};
  for(const lang of ['de','en']){
   await open('combat',lang);assert.match(await speech.innerText(),lang==='de'?/Pirat in einer rostigen Balor/:/pirate in a rusty Balor/i);await checkFit();await page.screenshot({path:`${out}/${name}-${lang}-combat.png`});
   await buttons.last().click();assert.match(await speech.innerText(),lang==='de'?/Feuertaste rechts/:/fire button on the right/);await buttons.last().click();assert.match(await speech.innerText(),lang==='de'?/Anzeige oben rechts/:/display at the top right/);
   await open('surrender',lang);await buttons.last().click();assert.match(await speech.innerText(),/400 km/);await checkFit();await page.screenshot({path:`${out}/${name}-${lang}-capture.png`});
   await open('loot',lang);assert.match(await speech.innerText(),lang==='de'?/Teile oder die Fracht/:/equipment or cargo/);await buttons.first().click();assert.match(await speech.innerText(),lang==='de'?/Stufe I/:/tier I/);await checkFit();await page.screenshot({path:`${out}/${name}-${lang}-rarity.png`});
   await open('loot-surrender-killed',lang);assert.match(await speech.innerText(),lang==='de'?/hatte aufgegeben/:/had surrendered/);await buttons.last().click();assert.match(await speech.innerText(),lang==='de'?/Aus dem Wrack/:/recover equipment or cargo/);
  }
  assert.deepEqual(errors,[]);console.log(name,'German and English combat, capture, loot and surrender branches passed');
 }finally{await browser.close();}
}
