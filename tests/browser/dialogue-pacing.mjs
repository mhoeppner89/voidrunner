import{chromium,webkit,devices}from'playwright';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{isolateBrowserProfiles}from'../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);const out='output/dialogue-pacing';await mkdir(out,{recursive:true});
for(const[name,engine,device]of[['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{const p=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],report=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await p.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4193')+'/game.html?startup-probe=1');await p.waitForFunction(()=>window.__VOID_PRIVATEER__);await p.evaluate(()=>void __VOID_PRIVATEER__.newGame());await p.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 for(const lang of['de','en'])for(const script of['paul-rescue','loot'])for(const details of[false,true]){
 await p.evaluate(async({lang,script})=>{const r=__VOID_PRIVATEER__.getRuntime(),{setLanguage}=await import('/src/game/i18n.js');cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);setLanguage(lang);r.ui.adventureQueue=[];r.ui.closeAdventure(false);r.ui.hideStory();r.ui.dismissStory();r.ui.hideDock();r.save.player.dockedAt=undefined;r.ui.openStoryAdventure(script==='loot'?'Rin':'Paul','', 'ally','tutorial-'+script);},{lang,script});
 const nodes=[];while(await p.locator('#adventure-panel').isVisible()){
 const state=await p.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;return{id:u.adventure.nodeId,paused:u.isModalOpen};});assert.ok(state.paused);nodes.push(state.id);
 const layout=await p.locator('.adventure-speech').evaluate(e=>{const a=e.getBoundingClientRect(),bs=[...document.querySelectorAll('.adventure-choices button')].map(b=>b.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&a.bottom<=Math.min(...bs.map(b=>b.top))+1&&bs.every(b=>b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1);});assert.ok(layout,`${name}/${lang}/${script}/${state.id}`);
 const intro=state.id==='find'||state.id==='repairs';if(intro||state.id==='rarity'||state.id==='support')await p.screenshot({path:`${out}/${name}-${lang}-${script}-${state.id}.png`});
 const buttons=p.locator('#adventure-panel [data-ui-command="adventure-choice"]');await buttons.nth(intro&&!details?1:0).click();assert.ok(nodes.length<8);
 }
 assert.equal(nodes.includes(script==='loot'?'rarity':'support'),details);report.push({lang,script,details,nodes});
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({report,errors},null,2));console.log(name,'optional and direct dialogue paths passed in German and English');
 }finally{await browser.close();}
}
