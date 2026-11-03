// Hold flight preparation open and exercise the actual session loop. The
// player cannot see or control the scene during this period. Audio is muted.
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/flight-preparation';
await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1280,height:720}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{const store=new Map();Storage.prototype.getItem=function(k){return store.get(String(k))??null;};Storage.prototype.setItem=function(k,v){store.set(String(k),String(v));};Storage.prototype.removeItem=function(k){store.delete(String(k));};Storage.prototype.clear=function(){store.clear();};store.set('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArena);
  await page.evaluate(async()=>{
   const {GameSession}=await import('/src/game/game.js'),proto=GameSession.prototype,prepare=proto.prepareFlightScene,sim=proto.updateSimulation,sync=proto.syncRender;
   window.preparationAudit={steps:0,renders:0,frames:0};
   proto.prepareFlightScene=async function(...args){await new Promise(resolve=>window.releaseFlightPreparation=resolve);return prepare.apply(this,args);};
   proto.updateSimulation=function(...args){if(!this.flightPrepared)preparationAudit.steps++;return sim.apply(this,args);};
   proto.syncRender=function(...args){if(!this.flightPrepared)preparationAudit.renders++;return sync.apply(this,args);};
   const frame=proto.updateFrame;proto.updateFrame=function(...args){if(!this.flightPrepared)preparationAudit.frames++;return frame.apply(this,args);};
   void __VOID_PRIVATEER__.startArena('asteroid-field','1v3');
  });
  await page.waitForFunction(()=>window.releaseFlightPreparation&&__VOID_PRIVATEER__.getRuntime()?.arena);
  const before=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{time:r.save.world.time,steps:preparationAudit.steps,renders:preparationAudit.renders,frames:preparationAudit.frames};});
  await page.waitForTimeout(1600);
  const blocked=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return{time:r.save.world.time,steps:preparationAudit.steps,renders:preparationAudit.renders,frames:preparationAudit.frames,loading:!document.querySelector('#loading-screen').classList.contains('is-hidden')};});
  assert.ok(blocked.frames>before.frames+2,'the browser continued producing animation callbacks');
  assert.equal(blocked.time,before.time,`${name}: simulation advanced while loading: ${JSON.stringify({before,blocked})}`);
  assert.equal(blocked.steps,before.steps,`${name}: no combat simulation while loading`);
  assert.equal(blocked.renders,before.renders,`${name}: no flight draws while loading`);
  assert.ok(blocked.loading);
  await page.evaluate(()=>releaseFlightPreparation());
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  const readyTime=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.time);
  await page.waitForFunction(t=>__VOID_PRIVATEER__.getRuntime().save.world.time>t+.05,readyTime);
  await page.screenshot({path:`${out}/${name}-ready.png`});
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({before,blocked,readyTime,errors},null,2));
  console.log(name,JSON.stringify({before,blocked,readyTime}));await context.close();
 }finally{await browser.close();}
}
