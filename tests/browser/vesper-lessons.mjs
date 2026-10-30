import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/vesper-lessons',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gn`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await page.locator('[data-ui-command="close-story"]').click();
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);for(const personId of ['mara-vek','rin-vek'])r.handleTutorialEvent('talked',{personId,locationId:'helix'});});
  // Real trading controls: no tutorial-only auto-selection, hidden controls or transactions.
  await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.locator('[data-commodity-id="food"]').click();
  assert.equal(await page.locator('.trade-quantity').count(),1);assert.equal(await page.locator('.trade-actions-ticket [data-trade]').count(),4);
  await page.locator('[data-trade="buy:food:999"]').click();
  await page.locator('#adventure-panel').waitFor({state:'visible'});while(await page.locator('#adventure-panel').isVisible())await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').first().click();
  const purchased=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.cargo.food);assert.ok(purchased>=16);
  // Use the real landing handler at the end of the first flight.
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{LOCATIONS}=await import('/src/game/data.js');r.save.quests.find(q=>q.id==='the-spare-key').stepId='fly-vesper';r.save.player.dockedAt=undefined;r.ui.hideDock();r.save.player.position.splice(0,3,...LOCATIONS.vesper.position);r.save.player.currentTargetId=r.save.player.navTargetId='vesper';r.dockAt('vesper',true);});
  const read=async(label,pattern)=>{
   await page.locator('#adventure-panel').waitFor({state:'visible'});
   assert.match(await page.locator('#adventure-panel').innerText(),pattern);
   await page.waitForFunction(()=>{const p=document.querySelector('.adventure-portrait img');return p?.complete&&p.naturalWidth>0;});
   const bounds=await page.locator('.adventure-choices button').first().evaluate(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:innerWidth,height:innerHeight};});
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,`${name} ${label}: reply outside viewport`);
   await page.screenshot({path:`${out}/${name}-${label}.png`});await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').first().click();
  };
  await read('arrival',/Wie war dein erster Flug/);await read('flight-reply',/Hat auch so ausgesehen/);await read('sell-instructions',/ALLES VERKAUFEN/);
  assert.ok(await page.locator('#adventure-panel').isHidden());assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.cargo.food),purchased);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<3;i++)r.refreshStoryLine();r.restoreTutorialRuntime();r.refreshStoryLine();});assert.ok(await page.locator('#adventure-panel').isHidden());
  await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.locator('[data-commodity-id="food"]').click();
  await page.screenshot({path:`${out}/${name}-normal-trade.png`});
  await page.locator('[data-trade="sell:food:1"]').click();assert.ok(await page.locator('#adventure-panel').isHidden(),'partial sale cannot trigger the gift');
  await page.locator('[data-trade="sell:food:999"]').click();
  await read('reactor-gift',/Energieregeneration.*Lager/s);await read('install-instructions',/LAGER.*EINBAUEN/s);
  assert.ok(await page.locator('#adventure-panel').isHidden());
  const before=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{credits:r.save.player.credits,regen:r.playerStats().reactorOutput};});
  await page.locator('[data-ui-command="story"]').click();assert.equal(await page.locator('#story-panel [data-ui-command="tutorial-reactor"]').count(),0);await page.locator('[data-ui-command="close-story"]').click();
  await page.locator('[data-market-point="equipment"]').click();if(await page.locator('[data-inventory-tab]').isVisible())await page.locator('[data-inventory-tab]').selectOption('storage');else await page.locator('[data-inventory-action="tab"][data-tab="storage"]').click();
  const gift=await page.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='sustained-reactor'&&i.location.kind==='station').id);
  await page.locator(`[data-inventory-id="${gift}"]`).click();await page.screenshot({path:`${out}/${name}-normal-install.png`});await page.locator('[data-inventory-action="install"]').click();
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());await read('reactor-ready',/Reaktor läuft/);
  const after=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<3;i++)r.refreshStoryLine();return{credits:r.save.player.credits,regen:r.playerStats().reactorOutput,step:r.tutorialSummary().stepId,gifts:Object.values(r.save.player.inventory.items).filter(i=>i.baseId==='sustained-reactor').length};});
  assert.equal(after.credits,before.credits);assert.ok(after.regen>before.regen);assert.equal(after.step,'mining-contract');assert.equal(after.gifts,1);assert.ok(await page.locator('#adventure-panel').isHidden());
  if(name==='desktop'){
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().quitToTitle());await page.locator('[data-ui-command="resume"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));assert.ok(await page.locator('#adventure-panel').isHidden());assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'mining-contract');
  }
  assert.deepEqual(errors,[]);report.push({name,purchased,before,after,errors});console.log(name,'automatic arrival/gift dialogues and normal trade/storage/install passed');
 }finally{await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
