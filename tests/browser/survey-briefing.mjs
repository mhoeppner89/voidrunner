import{chromium,webkit,devices}from'playwright';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{isolateBrowserProfiles}from'../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);const out='output/survey-briefing';await mkdir(out,{recursive:true});
for(const[name,engine,device]of[['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{const p=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],report=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await p.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4193')+'/game.html?startup-probe=1');await p.waitForFunction(()=>window.__VOID_PRIVATEER__);await p.evaluate(()=>void __VOID_PRIVATEER__.newGame());await p.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 await p.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),{setLanguage}=await import('/src/game/i18n.js');cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);setLanguage('de');r.ui.adventureQueue=[];r.ui.closeAdventure(false);r.ui.hideStory();r.ui.dismissStory();r.ui.concourseArrivalPending=false;r.save.player.dockedAt='vesper';const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='salvage-briefing';q.flags['briefingRead-mining-return']=true;r.ui.showDock(r.save,'vesper');});
 console.log(name,'fixture ready');p.setDefaultTimeout(20000);
 const click=async selector=>device.isMobile?p.locator(selector).tap():p.locator(selector).click();
 const finish=async label=>{const nodes=[];while(await p.locator('#adventure-panel').isVisible()){
 const state=await p.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;return{id:u.adventure.nodeId,text:document.querySelector('.adventure-speech').textContent};});nodes.push(state);
 const fits=await p.locator('.adventure-speech').evaluate(e=>{const a=e.getBoundingClientRect(),bs=[...document.querySelectorAll('.adventure-choices button')].map(b=>b.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&a.bottom<=Math.min(...bs.map(b=>b.top))+1&&bs.every(b=>b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1);});assert.ok(fits,label+'/'+state.id);
 await p.screenshot({path:`${out}/${name}-${label}-${state.id}.png`});await click('#adventure-panel [data-ui-command="adventure-choice"]:first-child');assert.ok(nodes.length<8);
 }report.push({label,nodes});return nodes;};
 await p.screenshot({path:`${out}/${name}-setup.png`});await click('[data-dock-hotspot="bar"]');await click('[data-person-id="rin-vek"]');const prep=await finish('fitting');assert.deepEqual(prep.map(n=>n.id),['risk','fitting']);
 assert.equal(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'fit-pdc');
 await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());assert.ok(await p.locator('#adventure-panel').isHidden(),'survey briefing came before fitting');
 await click('.dock-header .dock-back-button');await click('[data-dock-hotspot="market"]');await click('[data-market-point="equipment"]');
 const tabs=p.locator('[data-inventory-tab]');if(await tabs.isVisible())await tabs.selectOption('cargo');else await click('[data-inventory-action="tab"][data-tab="cargo"]');
 const droneId=await p.evaluate(()=>Object.values(__VOID_PRIVATEER__.getRuntime().save.player.inventory.items).find(i=>i.baseId==='pdc-drone'&&i.location.kind==='cargo').id);
 await click(`[data-inventory-id="${droneId}"]`);await click('[data-inventory-action="fit-mount"][data-mount-id="wayfarer-drone-1"]');await click('[data-inventory-action="install"]');
 await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());await p.locator('#adventure-panel').waitFor({state:'visible'});
 assert.equal(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'survey-graveyard');
 const survey=await finish('survey');assert.deepEqual(survey.map(n=>n.id),['survey','farewell','salvage']);assert.match(survey[0].text,/100 km.*2000 km/);assert.match(survey[1].text,/Concord-Flotte.*Eltern verschwanden/);
 await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().refreshStoryLine());assert.ok(await p.locator('#adventure-panel').isHidden(),'survey introduction repeated');
 assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({report,errors},null,2));console.log(name,'normal PDC fitting → separate survey briefing, optional salvage and no repeats passed');
 }finally{await browser.close();}
}
