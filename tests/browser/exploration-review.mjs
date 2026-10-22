import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);
const out='output/exploration-review/checks',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});
  await context.addInitScript(()=>{const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  const audit=await context.newPage();await audit.goto(base+'/game.html?startup-probe=1');await audit.waitForFunction(()=>window.__VOID_PRIVATEER__);
  const original=await audit.evaluate(()=>{const career='review-career-untouched',settings=JSON.stringify({music:.2,effects:.6,language:'de'});localStorage.setItem('void-privateer-save-v1',career);localStorage.setItem('void-privateer-settings-v1',settings);return{career,settings};});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(base+'/output/exploration-review/index.html');await page.waitForFunction(()=>window.discoveryReview?.ready);
  const press=async locator=>device.isMobile?locator.tap():locator.click();
  assert.equal(await page.locator('[data-scene]').count(),12);assert.equal(await page.locator('[data-scene]:disabled').count(),0);
  assert.ok(await page.locator('#discovery-review').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${name}-menu.png`});
  const select=async id=>{console.log(name,'scene',id);if(await page.locator('#discovery-review').getAttribute('hidden')!==null)await press(page.locator('#review-menu'));await press(page.locator(`[data-scene="${id}"]`));await page.waitForFunction(id=>window.discoveryReview?.error||discoveryReview?.ready&&discoveryReview.scene===id,id);assert.equal(await page.evaluate(()=>discoveryReview.error),undefined);};
  await select('trail');
  await page.evaluate(()=>cancelAnimationFrame(__VOID_PRIVATEER__.getRuntime().frameId));
  const collect=async id=>{
   const flight=await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.throttle=.7;for(let i=0;i<900&&!r.save.world.exploration.recovered.includes(id);i++)r.updateSimulation(1/60,{});r.save.player.throttle=0;r.save.player.velocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());return{id,collected:r.save.world.exploration.recovered.includes(id),cargo:{...r.save.player.cargo}};},id);assert.ok(flight.collected,JSON.stringify(flight));
  };
  for(const id of ['wake','silence','last-light']){await collect(id);assert.ok((await page.locator('.adventure-speech').innerText()).length>40);await press(page.locator('[data-ui-command="adventure-choice"]').first());if(id!=='last-light')await press(page.locator('#review-next'));}
  await page.waitForFunction(()=>document.querySelector('#review-next').textContent==='Zum Wrack');await press(page.locator('#review-next'));
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().hyperdriveDestination().kind),'waypoint');
  await select('claim');assert.equal(await page.locator('[data-ui-command="adventure-choice"]').count(),2);await press(page.locator('[data-ui-command="adventure-choice"]').first());assert.equal(await page.evaluate(()=>discoveryReview.snapshot().finale),'shared');
  await press(page.locator('#review-restart'));await page.waitForFunction(()=>discoveryReview.ready&&discoveryReview.snapshot().finale==='available');await press(page.locator('[data-ui-command="adventure-choice"]').nth(1));assert.equal(await page.evaluate(()=>discoveryReview.snapshot().finale),'fighting');
  for(const id of ['pod-0','pod-1','pod-2','cache-0','cache-1','cache-2','approach','salvage']){
   await select(id);assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.position.every(Number.isFinite)));
   if(id.startsWith('cache-'))await collect(['carrier','battleship','cruiser'][Number(id.slice(6))]);
   if(id==='salvage'){await collect('finale');assert.equal(await page.evaluate(()=>discoveryReview.snapshot().finale),'won');}
  }
  await select('convoy');assert.match(await page.locator('.adventure-speech').innerText(),/Lantern/);await press(page.locator('[data-ui-command="adventure-choice"]').first());assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ships.filter(s=>s.explorationGroup==='convoy').length),4);
  await select('feedback');
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),play=r.audio.playCockpit.bind(r.audio);window.reviewCues=[];r.audio.playCockpit=(effect,...args)=>{reviewCues.push(effect);return play(effect,...args);};});
  for(const cue of ['shield','hull','collapse','target','empty'])await press(page.locator(`[data-feedback="${cue}"]`));
  const cues=await page.evaluate(()=>reviewCues);for(const cue of ['shield','hit','shieldBreak','targetShieldBreak','capacitorEmpty'])assert.ok(cues.includes(cue),JSON.stringify(cues));
  await page.screenshot({path:`${out}/${name}-feedback.png`});
  await press(page.locator('#review-sound'));assert.equal(await page.locator('#review-sound').getAttribute('aria-pressed'),'true');await press(page.locator('#review-sound'));assert.equal(await page.locator('#review-sound').getAttribute('aria-pressed'),'false');
  if(name==='iphone'){
   await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.damagePlayer(1e6,'test',false);for(let i=0;i<200&&document.querySelector('#discovery-review').hidden;i++)r.updateSimulation(1/60,{});});
   assert.ok(await page.locator('#discovery-review').isVisible());assert.match(await page.locator('#review-status').innerText(),/Schiff zerstört/);await select('feedback');assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.hull>0));
  }

  await press(page.locator('#review-menu'));const before=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.time);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.time),before);
  const preserved=await audit.evaluate(()=>({career:localStorage.getItem('void-privateer-save-v1'),settings:localStorage.getItem('void-privateer-settings-v1')}));assert.deepEqual(preserved,original);
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({cues,preserved,errors},null,2));console.log(name,'review scenes, replay, controls and save isolation passed');
 }catch(e){await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors,status:page?await page.locator('#review-status').textContent().catch(()=>null):null},null,2));if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{await browser.close();}
}
