import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/story-card',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILE&&process.env.VR_PROFILE!==name)continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gl`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const ready=async()=>{await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);});};
  await page.locator('[data-ui-command="new"]').click();assert.equal(await page.evaluate(()=>!!__VOID_PRIVATEER__.getRuntime()),false);assert.ok(await page.locator('#new-career-description').isHidden());await page.screenshot({path:`${out}/${name}-career-choice.png`});await page.locator('[data-ui-command="cancel-new-career"]').click();assert.ok(await page.locator('#title-screen').isVisible());
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await ready();
  assert.ok(await page.locator('#story-panel').isVisible());assert.deepEqual(await page.locator('#story-panel .tutorial-notice-copy > p').allTextContents(),['Triff Mara und Rin in der Bar.',"Klicke auf 'Story', um diese Hinweise zu sehen."]);assert.equal(await page.locator('#story-panel .tutorial-notice-copy > span,#story-panel .tutorial-notice-copy > b').count(),0);await page.screenshot({path:`${out}/${name}-opening-card.png`});await page.locator('[data-ui-command="close-story"]').click();
  assert.equal(await page.locator('#dock-screen .tutorial-dock-notice').count(),0);assert.equal(await page.locator('[data-tutorial-action="skip"],[data-tutorial-action="confirm-skip"]').count(),0);assert.ok(await page.locator('.dock-header [data-ui-command="story"]').isVisible());
  const headers=[];for(const terminal of ['concourse','services','market','bar']){
   await page.evaluate(terminal=>__VOID_PRIVATEER__.getRuntime().ui.switchToTerminal(terminal),terminal);
   if(terminal==='market')await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.openMarketPoint('equipment'));
   const layout=await page.locator('.dock-header').evaluate(e=>({height:e.getBoundingClientRect().height,width:innerWidth,overflow:e.scrollWidth>e.clientWidth+1,buttons:[...e.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom};})}));assert.ok(!layout.overflow,`${name} ${terminal}: header overflow`);for(const b of layout.buttons)assert.ok(b.x>=0&&b.right<=layout.width+1,`${name} ${terminal}: clipped header button`);headers.push({terminal,...layout});
  }
  await page.locator('[data-ui-command="story"]').click();assert.ok(await page.locator('#story-panel').isVisible());assert.ok(await page.locator('#story-panel').innerText().then(s=>/Mara.*Rin/.test(s)));assert.ok(await page.locator('#dock-screen').evaluate(e=>e.inert));await page.keyboard.press('Escape');assert.ok(await page.locator('#story-panel').isHidden());assert.equal(await page.locator('#dock-screen').evaluate(e=>e.inert),false);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='vesper';r.save.quests.find(q=>q.id==='the-spare-key').stepId='fit-upgrade';r.ensureTutorialEquipment();r.ui.showDock(r.save,'vesper');r.ui.switchToTerminal('services');});await page.screenshot({path:`${out}/${name}-services-no-strip.png`});
  await page.locator('[data-ui-command="story"]').click();const card=await page.locator('.story-card').evaluate(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:innerWidth,height:innerHeight,overflow:e.scrollWidth>e.clientWidth+1};});assert.ok(!card.overflow&&card.x>=0&&card.y>=0&&card.right<=card.width+1&&card.bottom<=card.height+1);await page.screenshot({path:`${out}/${name}-objective-card.png`});
  assert.equal(await page.locator('[data-ui-command="tutorial-reactor"]').count(),0);await page.locator('[data-ui-command="close-story"]').click();
  await page.locator('[data-ui-command="dock-concourse"]').click();await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="equipment"]').click();
  if(await page.locator('[data-inventory-tab]').isVisible())await page.locator('[data-inventory-tab]').selectOption('storage');else await page.locator('[data-inventory-action="tab"][data-tab="storage"]').click();
  const gift=await page.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='sustained-reactor'&&i.location.kind==='station').id);
  await page.locator(`[data-inventory-id="${gift}"]`).click();await page.locator('[data-inventory-action="install"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.quests.find(q=>q.id==='the-spare-key').stepId),'mining-contract');
  const cardIds=await page.evaluate(async()=>Object.keys((await import('/src/game/tutorialCampaign.js')).TUTORIAL_STEPS));
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.showStory());
  for(const id of cardIds){
   await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime();const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId=id;q.flags.miningExplained=false;r.ui.renderStory();},id);
   const size=await page.locator('.story-card').evaluate(e=>{const b=e.getBoundingClientRect();return{overflow:e.scrollWidth>e.clientWidth+1,vertical:e.scrollHeight>e.clientHeight+1,bottom:b.bottom,height:innerHeight};});assert.ok(!size.overflow&&!size.vertical&&size.bottom<=size.height+1,`${name} ${id}: Story content does not fit`);
   await page.locator('.story-card').screenshot({path:`${out}/${name}-task-${id}.png`});
  }
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.quests.find(q=>q.id==='the-spare-key').stepId='mining-contract';r.ui.hideStory();});
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().quitToTitle());await page.locator('[data-ui-command="resume"]').click();await ready();assert.ok(await page.locator('#new-career-panel').isHidden());assert.equal(await page.locator('[data-tutorial-action="skip"],[data-tutorial-action="confirm-skip"]').count(),0);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().quitToTitle());await page.locator('[data-ui-command="new"]').click();assert.ok(await page.locator('#new-career-description').isVisible());await page.locator('[data-ui-command="skip-new-career"]').click();await ready();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.quests.some(q=>q.id==='the-spare-key')),false);assert.equal(await page.locator('.dock-header [data-ui-command="story"]').count(),0);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().quitToTitle());await page.locator('[data-ui-command="resume"]').click();await ready();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.quests.some(q=>q.id==='the-spare-key')),false);assert.deepEqual(errors,[]);report.push({name,headers,card,errors});console.log(name,'tutorial choice, Story card, reactor install and resume/skip passed');
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
