import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/story-menus',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(60000);const errors=[],dialogues=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2go`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();await page.locator('[data-ui-command="close-story"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);});page.setDefaultTimeout(20000);
  const finish=async(label,pattern)=>{
   await page.locator('#adventure-panel').waitFor({state:'visible'});let text='',count=0;
   while(await page.locator('#adventure-panel').isVisible()){
    const info=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),n=r.ui.adventureNode();return{id:r.ui.adventure.nodeId,final:!!n.choices?.some(c=>c.complete)};});
    text+='\n'+await page.locator('.adventure-speech').innerText();
    const layout=await page.locator('.adventure-speech').evaluate(e=>{const s=e.getBoundingClientRect(),buttons=[...document.querySelectorAll('.adventure-choices button')].map(b=>b.getBoundingClientRect());return{overflow:e.scrollWidth>e.clientWidth+1,speechBottom:s.bottom,buttonTop:Math.min(...buttons.map(b=>b.top)),allOnScreen:buttons.every(b=>b.x>=0&&b.right<=innerWidth+1&&b.y>=0&&b.bottom<=innerHeight+1)};});
    assert.ok(!layout.overflow&&layout.speechBottom<=layout.buttonTop+1&&layout.allOnScreen,`${name} ${label}/${info.id}: dialogue overlaps/clips`);
    if(count===0||info.final){await page.waitForFunction(()=>{const i=document.querySelector('.adventure-portrait img');return i?.complete&&i.naturalWidth>0;});await page.screenshot({path:`${out}/${name}-${label}-${info.id}.png`});}
    await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().click();if(++count>12)throw Error('Conversation did not finish');
   }
   await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());assert.match(text,pattern);dialogues.push({label,nodes:count,text});
  };
  const concourse=async()=>{for(let i=0;i<3&&await page.locator('.dock-header .dock-back-button').count();i++)await page.locator('.dock-header .dock-back-button').click();};
  const bar=async()=>{await concourse();await page.locator('[data-dock-hotspot="bar"]').click();};
  const stock=async(tab)=>{const select=page.locator('[data-inventory-tab]');if(await select.isVisible())await select.selectOption(tab);else await page.locator(`[data-inventory-action="tab"][data-tab="${tab}"]`).click();};
  await bar();assert.deepEqual(await page.locator('[data-person-id]').evaluateAll(es=>es.map(e=>e.dataset.personId)),['mara-vek','rin-vek']);await page.locator('[data-person-id="mara-vek"]').click();await finish('mara',/Protein.*Vesper/s);await page.locator('[data-person-id="rin-vek"]').click();await finish('rin-buying',/MARKTPLATZ.*Handel.*MAXIMAL KAUFEN/s);
  await concourse();await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.locator('[data-commodity-id="food"]').click();
  assert.ok(await page.locator('[data-trade="buy:food:999"] small').isVisible());await page.screenshot({path:`${out}/${name}-normal-buy.png`});
  await page.locator('[data-trade="buy:food:1"]').click();assert.ok(await page.locator('#adventure-panel').isHidden());await page.locator('[data-trade="buy:food:999"]').click();await finish('cargo-ready',/DOCKHALLE.*Wayfarer/s);
  const purchased=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.cargo.food);assert.ok(purchased>=16);
  // Travel/combat are covered by tutorial-campaign.mjs; use the real landing handler at the corresponding story stages here.
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{LOCATIONS}=await import('/src/game/data.js');r.save.quests.find(q=>q.id==='the-spare-key').stepId='fly-vesper';r.save.player.dockedAt=undefined;r.ui.hideDock();r.save.player.position.splice(0,3,...LOCATIONS.vesper.position);r.dockAt('vesper',true);});
  await finish('vesper-arrival',/Handel.*ALLES VERKAUFEN/s);await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="commodities"]').click();await page.locator('[data-commodity-id="food"]').click();assert.ok(await page.locator('[data-trade="sell:food:999"] small').isVisible());await page.screenshot({path:`${out}/${name}-normal-sell.png`});await page.locator('[data-trade="sell:food:999"]').click();await finish('reactor-gift',/LAGER.*EINBAUEN/s);
  await page.locator('[data-market-point="equipment"]').click();await stock('storage');const gift=await page.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='sustained-reactor'&&i.location.kind==='station').id);await page.locator(`[data-inventory-id="${gift}"]`).click();await page.locator('[data-inventory-action="install"]').click();await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());await finish('reactor-ready',/Bar.*Abbauauftrag/s);
  await bar();await page.locator('[data-person-id="rin-vek"]').click();await finish('mining-lesson',/AUFTRAGSTAFEL.*ANNEHMEN.*automatisch zurück/s);
  await page.locator('[data-bar-panel="missions"]').click();await page.locator('[data-mission-select="tutorial-vesper-mining"]').click();await page.screenshot({path:`${out}/${name}-normal-contract.png`});await page.locator('[data-mission-id="tutorial-vesper-mining"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'mine-shardbelt');
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key'),m=r.save.activeMissions.find(m=>m.id==='tutorial-vesper-mining');r.recordClaimMining(m.claimNodeId,6);r.save.player.cargo[m.commodity]=6;q.stepId='land-mining';r.dockAt('vesper',true);r.refreshStoryLine();});assert.ok(await page.locator('.mission-settlement').isVisible());assert.ok(await page.locator('#adventure-panel').isHidden());await page.locator('[data-ui-command="dismiss-mission-settlements"]').click();await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());await finish('mining-return',/bezahlt.*Bar/s);
  await bar();await page.locator('[data-person-id="rin-vek"]').click();await finish('salvage-pdc-lesson',/BERGEN.*Computer M.*DROHNEN.*PDC.*automatisch/s);
  await concourse();await page.locator('[data-dock-hotspot="market"]').click();await page.locator('[data-market-point="equipment"]').click();assert.equal(await page.locator('.inventory-identity').count(),0,'Equipment reopened the old reactor detail');await stock('drones');await page.screenshot({path:`${out}/${name}-normal-drone-switch.png`});await page.locator('[data-ui-command="drone-bay-mode"][data-drone-mode="pdc"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId==='survey-graveyard');
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.hideDock();r.save.player.dockedAt=undefined;r.playTutorialBriefing('paul-rescue');});await finish('paul-repair-lesson',/200 km.*Schilde.*zusammen/s);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.playTutorialBriefing('paul-hide');});await finish('paul-stealth-lesson',/Transponder.*Kennung.*Sensoren/s);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.quests.find(q=>q.id==='the-spare-key').stepId='mara-debrief';r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');});await bar();await page.locator('[data-person-id="mara-vek"]').click();await finish('mara-open-world',/Sprungtor.*geschlossen/s);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.credits=100000;r.queueTutorialMaraCall();});await finish('mara-cairn-call',/Cairn.*Bar|Bar.*Cairn/s);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.dockAt('cairn',true);});await bar();await page.locator('[data-person-id="rin-vek"]').click();await finish('rin-black-box',/BLACKBOX-SIGNAL.*BERGEN.*Computer M.*Paul/s);
  await page.locator('[data-person-id="paul"]').click();await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').first().click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.quests.find(q=>q.id==='the-spare-key').flags.paulInvited),true);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.quests.find(q=>q.id==='the-spare-key').stepId='decode-black-box';r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');});await bar();await page.locator('[data-person-id="mara-vek"]').click();await finish('mara-decoding',/Entschlüsselung.*Tor ist offen/s);assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'complete');
  const desks=[];
  for(const id of ['rook','vesper','cairn']){
   await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt=id;r.ui.showDock(r.save,id);r.ui.switchToTerminal('bar');},id);
   assert.equal(await page.locator('[data-person-id]').count(),0,`${id}: filler contact remains`);
   await page.waitForFunction(()=>{const i=document.querySelector('#dock-screen .dock-backdrop img');return i?.complete&&i.naturalWidth>0;});await page.screenshot({path:`${out}/${name}-${id}-story-only-bar.png`});
   await page.locator('[data-bar-panel="missions"]').click();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.barPanel),'missions');assert.ok(await page.locator('.mission-terminal').isVisible());
   if(id==='cairn')assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.offers.cairn.some(m=>m.kind==='race')),'race entries remain available');
   await page.locator('[data-ui-command="bar-scene"]').click();
   if(id==='rook'){
    await page.locator('[data-bar-panel="guilds"]').click();assert.equal(await page.locator('.guild-card-head img').count(),0,'Removed representatives must not reappear on guild cards');
    const join=page.locator('[data-guild-id]:not(:disabled)').first(),guild=await join.getAttribute('data-guild-id');await join.click();assert.ok(await page.evaluate(guild=>__VOID_PRIVATEER__.getRuntime().save.player.guildRep[guild]>0,guild),'guild registration still works');await page.screenshot({path:`${out}/${name}-rook-guild-desk.png`});
   }
   desks.push(id);
  }
  assert.deepEqual(errors,[]);report.push({name,purchased,normalContract:true,normalDroneSwitch:true,paulInvited:true,storyOnlyBars:true,desks,dialogues,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'authored story conversations, story-only bars, contract/race boards and guild registration passed');
 }finally{await browser.close();}
}
