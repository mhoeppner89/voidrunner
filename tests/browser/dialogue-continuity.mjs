import{chromium,webkit,devices}from'playwright';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{isolateBrowserProfiles}from'../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);const out='output/dialogue-continuity';await mkdir(out,{recursive:true});
for(const[name,engine,device]of[['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{const p=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],report=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await p.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4193')+'/game.html?startup-probe=1');await p.waitForFunction(()=>window.__VOID_PRIVATEER__);await p.evaluate(()=>void __VOID_PRIVATEER__.newGame());await p.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 const click=async selector=>device.isMobile?p.locator(selector).tap():p.locator(selector).click();
 const read=async(label,choose=()=>0)=>{const rows=[];while(await p.locator('#adventure-panel').isVisible()){
 const row=await p.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;return{id:u.adventure.nodeId,text:document.querySelector('.adventure-speech').textContent};});rows.push(row);
 const fits=await p.locator('.adventure-speech').evaluate(e=>{const a=e.getBoundingClientRect(),bs=[...document.querySelectorAll('.adventure-choices button')].map(b=>b.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&a.bottom<=Math.min(...bs.map(b=>b.top))+1&&bs.every(b=>b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1);});assert.ok(fits,label+'/'+row.id);
 await p.screenshot({path:`${out}/${name}-${label}-${row.id}.png`});await click(`#adventure-panel [data-ui-command="adventure-choice"]:nth-child(${choose(row.id)+1})`);assert.ok(rows.length<10);
 }report.push({label,rows});return rows;};
 for(const lang of['de','en']){
 for(const answer of[0,1]){
 await p.evaluate(async lang=>{const r=__VOID_PRIVATEER__.getRuntime(),{setLanguage}=await import('/src/game/i18n.js');cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);setLanguage(lang);r.ui.adventureQueue=[];r.ui.closeAdventure(false);r.ui.hideStory();r.ui.dismissStory();r.ui.concourseArrivalPending=false;r.save.player.dockedAt='vesper';const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='sell-supplies';q.flags.skipped=false;r.ui.showDock(r.save,'vesper');r.ui.openStoryAdventure('Rin Vek','','ally','tutorial-vesper-arrival');},lang);
 const rows=await read(`${lang}-arrival-${answer}`,id=>id==='landing'?answer:0);assert.deepEqual(rows.map(r=>r.id),['landing',answer?'rough':'smooth','market']);assert.equal(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'sell-supplies');
 }
 await p.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key');r.ui.hideStory();r.ui.dismissStory();r.save.player.dockedAt='cairn';q.stepId='rin-cairn';q.flags.paulInvited=false;r.ui.showDock(r.save,'cairn');});
 await click('[data-dock-hotspot="bar"]');await click('[data-person-id="paul"]');assert.deepEqual((await read(`${lang}-paul-before`)).map(r=>r.id),['hello']);assert.equal(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'rin-cairn');
 await click('[data-person-id="rin-vek"]');const rin=await read(`${lang}-rin`);assert.deepEqual(rin.map(r=>r.id),['gate','box','company','gate-status']);assert.match(rin[1].text,lang==='de'?/Flottenbericht.*vielleicht/i:/fleet report.*might/i);assert.doesNotMatch(rin[1].text,/Evakuierungskonvoi|evacuation convoy/i);assert.equal(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'launch-black-box');
 await click('[data-person-id="paul"]');await read(`${lang}-paul-after`);assert.ok(await p.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.quests.find(q=>q.id==='the-spare-key').flags.paulInvited));
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({report,errors},null,2));console.log(name,'both flight replies, Paul-before-Rin reunion, optional gate news and Paul escort passed in German and English');
 }finally{await browser.close();}
}
