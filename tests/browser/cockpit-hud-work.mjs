// Compare identical live cockpit updates and exercise control-state changes.
// The baseline bypasses only the control cache and the shared drone snapshot.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/cockpit-hud-work';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArena);
  await page.evaluate(()=>__VOID_PRIVATEER__.startArena('open','1v1','rookie'));
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared);
  const result=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),u=r.ui;cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.ships=[];r.save.player.currentTargetId=undefined;r.syncRender(0,performance.now()+100);
   const model=r.buildHudModel(),original=u.updateWeaponButtons,action=u.actions.miningDrones;let reads=0;
   u.actions.miningDrones=()=>{reads++;return action();};
   const observer=new MutationObserver(()=>{});observer.observe(u.root,{subtree:true,attributes:true,childList:true,characterData:true});
   const measure=baseline=>{
    u.updateWeaponButtons=baseline?function(target,mode){this.weaponButtonState=undefined;return original.call(this,target,mode);}:original;
    u.updateHud(model);observer.takeRecords();reads=0;const samples=[];let mutations=0;
    for(let batch=0;batch<7;batch++){const start=performance.now();for(let i=0;i<40;i++)u.updateHud(model);samples.push((performance.now()-start)/40);mutations+=observer.takeRecords().length;}
    samples.sort((a,b)=>a-b);return{updates:280,mutations,droneReads:reads,medianMs:samples[3]};
   };
   // Warm both paths, then measure the same stopped world and monitor contents.
   measure(true);measure(false);const before=measure(true),after=measure(false);
   observer.disconnect();u.updateWeaponButtons=original;
   const fire=u.el('#touch-fire'),missile=u.el('#touch-missile'),count=u.el('#touch-missile-count');
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const drones={phase:'idle',bays:[],action:{ok:true,label:'Mine'}};
   u.updateWeaponButtons({kind:'asteroid'},'mining',drones);check(missile.dataset.touchAction==='miningDrones'&&!missile.disabled,'mine action');
   drones.phase='recalling';drones.action={ok:false,label:'Returning'};u.updateWeaponButtons({kind:'asteroid'},'mining',drones);check(missile.disabled&&missile.classList.contains('is-recalling'),'recall updates immediately');
   u.updateWeaponButtons({kind:'wreck'},'salvage',drones);check(missile.classList.contains('is-hidden')&&fire.dataset.touchAction==='fire'&&!fire.disabled,'wreck salvage uses fire');
   u.updateWeaponButtons({kind:'ship',surrendered:true,captureAvailable:false,captureClaimable:true},'combat',drones);check(missile.disabled,'distant capture disabled');
   u.updateWeaponButtons({kind:'ship',surrendered:true,captureAvailable:true,captureClaimable:true},'combat',drones);check(!missile.disabled&&missile.dataset.touchAction==='capture','capture ready');
   model.launcher={name:'Test launcher',shortCode:'M',displayCode:'M2',current:2,capacity:4,index:0,count:2};u.lastHud=model;
   u.updateWeaponButtons(undefined,'combat',drones);check(count.textContent==='2'&&!u.el('#touch-launcher-cycle').disabled,'launcher loaded');
   model.launcher.current=0;u.updateWeaponButtons(undefined,'combat',drones);check(count.textContent==='0'&&missile.classList.contains('is-empty'),'empty magazine updates');
   r.save.player.raceReturn={};u.updateWeaponButtons(undefined,'combat',drones);check(fire.querySelector('[data-icon="brake"]')&&!fire.querySelector('[data-icon="brake"]').classList.contains('is-hidden'),'race brake');
   delete r.save.player.raceReturn;u.updateWeaponButtons(undefined,'combat',drones);check(!fire.querySelector('[data-icon="fire"]').classList.contains('is-hidden'),'normal fire restored');
   u.weaponButtonState=undefined;reads=0;u.updateWeaponButtons({kind:'asteroid'});check(reads===1,'direct selection still reads current drone status');
   u.actions.miningDrones=action;r.ui.updateHud(r.buildHudModel());r.renderer.render();
   return{before,after,controls:'mining, recall, salvage, capture, launcher, racing, direct selection'};
  });
  assert.equal(result.after.droneReads,0);assert.equal(result.before.droneReads,280);assert.ok(result.after.mutations<result.before.mutations*.7,JSON.stringify(result));
  await page.screenshot({path:`${out}/${name}.png`});assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({...result,errors},null,2));console.log(name,JSON.stringify(result));
 }finally{await browser.close();}
}
