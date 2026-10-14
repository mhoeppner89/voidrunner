import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.VR_OUTPUT_DIR??'output/playtest';await mkdir(out,{recursive:true});const report=[];
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
for(const [name,type,device] of profiles){
 const browser=await type.launch({headless:true,...(type===chromium?{...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const stop=()=>page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);});
  const simulate=seconds=>page.evaluate(seconds=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);const times=[];let rounds=0,damage=0;
   const original=r.damageShip.bind(r);r.damageShip=(ship,amount,...args)=>{damage+=amount;return original(ship,amount,...args);};
   for(let i=0;i<seconds*60;i++){const t=performance.now();r.updateSimulation(1/60,{});times.push(performance.now()-t);rounds=Math.max(rounds,r.projectiles.length);}
   r.damageShip=original;r.syncRender(0,performance.now());r.renderer.render();times.sort((a,b)=>a-b);
   if(!r.save.player.position.every(Number.isFinite)||r.ships.some(s=>!s.position.every(Number.isFinite)))throw Error('Invalid flight position');
   return {steps:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],rounds,damage,ships:r.ships.length,alive:r.ships.filter(s=>s.hull>0).length,playerHull:r.save.player.hull};
  },seconds);
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());await stop();
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.skipTutorial();await r.launch();});await stop();
  const career=await simulate(3);console.log(name,'career passed');await page.screenshot({path:`${out}/${name}-career-flight.png`});
  // Use the loaded, real Helix surfaces and a validated berth for launch/landing.
  const docking=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);
   const {LOCATIONS}=await import('/src/game/data.js'),{fittedPlayerBerths}=await import('/src/game/shipLanding.js'),{shipVsStation,PLAYER_CONTACT_SCALE}=await import('/src/game/shipCollision.js'),T=await import('/vendor/three.module.min.js');
   const id='helix';r.save.player.systemId=LOCATIONS[id].systemId;await r.renderer.ensureStationModels(r.save.player.systemId);
   const c=r.renderer.stationColliders.get(id);if(!c)throw Error('Helix geometry missing');
   const checks=[];for(const variant of ['kestrel','lancer','atlas-freighter']){
    const b=fittedPlayerBerths(id,variant,c)[0],q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(...b.pad).sub(new T.Vector3(...b.gate)).normalize()),contact={};
    for(let i=0;i<=60;i++){const p=new T.Vector3(...b.gate).lerp(new T.Vector3(...b.pad),i/60);if(shipVsStation(p,q,variant,PLAYER_CONTACT_SCALE,c,contact))throw Error(`${variant} clips Helix`);}
    checks.push({variant,pad:b.pad,padId:b.padId});
   }return checks;
  });
  await page.evaluate(()=>__VOID_PRIVATEER__.startArena('open','3v3','veteran'));await stop();const arena=await simulate(15);console.log(name,'arena passed');await page.screenshot({path:`${out}/${name}-arena-combat.png`});assert(arena.rounds>0);
  await page.evaluate(()=>__VOID_PRIVATEER__.startArenaRun(false));await stop();
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.arenaRunAction('hull','wayfarer');for(let pick=0;pick<2;pick++){const offers=r.save.arenaRun.offers;r.arenaRunAction('reward',offers.find(x=>x!=='repair')??offers[0]);r.arenaRunAction('accept');}});
  const run=await simulate(12);console.log(name,'arena run passed');await page.screenshot({path:`${out}/${name}-arena-run.png`});
  await page.evaluate(()=>__VOID_PRIVATEER__.startObserver('shardbelt'));await stop();
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.observerSelectShip('lancer');r.observerPreset('3v3');r.observerStartBattle();});
  const spectator=await simulate(18);console.log(name,'spectator passed');await page.screenshot({path:`${out}/${name}-spectator.png`});assert(spectator.rounds>0);
  // Every observer model is available and survives a deterministic combat pass.
  const roster=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().observerCatalog().map(t=>t.id));
  for(const hull of roster){await page.evaluate(hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.observerReturnToEditor();r.observerSelectShip(hull);r.observerPreset('1v1');r.observerStartBattle();},hull);await simulate(1);}
  assert.deepEqual(errors,[]);report.push({name,career,docking,arena,run,spectator,roster,errors});await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');console.log(name,JSON.stringify(report.at(-1)));
 }finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
