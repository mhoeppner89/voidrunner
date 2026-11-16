// Real monitor taps with a frozen combat scene and a real two-second UI clock.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/target-cycling';
await mkdir(out,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]];
for(const [name,engine,device]of profiles){
 if(!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,vibration:false}));
   const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};
  });
  await page.goto(`${base}/game.html?startup-probe=1&revision=0.8.2oj`);
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArena);
  await page.evaluate(()=>__VOID_PRIVATEER__.startArena('open','1v3','novice'));
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&!__VOID_PRIVATEER__.getRuntime().ui.isModalOpen&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;r.audio.setVolumes(0,0);
   r.updateSimulation=()=>{};p.position.splice(0,3,0,50000,0);p.rotation.splice(0,4,0,0,0,1);p.velocity.fill(0);p.throttle=0;
   r.ships=r.ships.filter(s=>s.hostile).slice(0,3);
   if(r.ships.length!==3)throw Error('Need three real opponents');
   for(const [i,s]of r.ships.entries()){
    s.name=`CYCLE ${String.fromCharCode(65+i)}`;s.position.splice(0,3,(i-1)*40,p.position[1],-140-i*120);s.velocity.fill(0);
    s.dark=false;s.scanned=true;s.identifiedByPlayer=true;s.playerSensorAwareness=1;
   }
   r.snapshotInterpolationState();r.clearTarget();
   if(r.targetCandidates().filter(t=>t.kind==='ship').length!==3)throw Error('Three opponents must be selectable');
   window.cycleTestIds=r.ships.map(s=>s.id);window.cycleTestWorldTime=r.save.world.time;
  });
  const history=[];
  async function tap(index,keyboard=false){
   const before=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().targetCycle?.selectedAt??-1);
   if(keyboard)await page.keyboard.press('t');
   else if(device.hasTouch)await page.locator('.cockpit-screen-target').tap();
   else await page.locator('.cockpit-screen-target').click();
   await page.waitForFunction(at=>(__VOID_PRIVATEER__.getRuntime().targetCycle?.selectedAt??-1)>at,before,{timeout:10000});
   const state=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return {id:r.save.player.currentTargetId,order:cycleTestIds,at:r.targetCycle.selectedAt};});
   assert.equal(state.id,state.order[index],JSON.stringify(state));history.push(state.id);
   await page.waitForFunction(i=>document.querySelector('#screen-target-name').textContent.includes(`CYCLE ${String.fromCharCode(65+i)}`),index);
  }
  await tap(0);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ships[0].position[2]=-480;r.snapshotInterpolationState();});
  await tap(1);await tap(2); // quick taps retain the original order despite the moved first target
  await page.waitForTimeout(2100);await tap(1); // new order is B, C, A
  await page.waitForTimeout(2100);await tap(1); // no closer enemy: keep B
  await tap(2);
  await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().clearTarget());await tap(1);
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ships[1].position[2]=-500;r.snapshotInterpolationState();});
  await page.waitForTimeout(2100);await tap(2); // B has flown away: closest is now C
  await tap(0,true); // keyboard shares the same rapid-cycle rules
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.world.time),await page.evaluate(()=>cycleTestWorldTime),'UI timeout works without simulation time advancing');
  await page.screenshot({path:`${out}/${name}.png`});assert.deepEqual(errors,[]);
  await writeFile(`${out}/${name}.json`,JSON.stringify({history,errors},null,2));console.log(name,'monitor/keyboard rapid cycle, moving targets and two-second real-time reset passed');
 }catch(e){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw e;}
 finally{await browser.close();}
}
