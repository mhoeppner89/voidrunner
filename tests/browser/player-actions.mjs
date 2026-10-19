import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';
const out=process.env.VR_OUTPUT_DIR??'output/playtest';await mkdir(out,{recursive:true});
const results=[];
for(const [name,type,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await type.launch({headless:true,...(type===chromium?{...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.setDefaultTimeout(60000);
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArenaRun);
  await page.evaluate(()=>__VOID_PRIVATEER__.startArena('open','2v3','veteran'));
  const combat=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);
   const T=await import('/vendor/three.module.min.js'),{WEAPONS}=await import('/src/game/weapons.js');
   const target=r.ships.find(s=>s.hostile);r.ships=r.ships.filter(s=>s===target||!s.hostile);target.poweredDown=true;
   target.position.splice(0,3,r.save.player.position[0],r.save.player.position[1],r.save.player.position[2]-65);target.rotation=[0,0,0,1];r.save.player.rotation=[0,0,0,1];r.save.player.velocity.fill(0);r.save.player.throttle=0;r.save.player.currentTargetId=target.id;
   const health=target.shield+target.hull;let rounds=0;for(let i=0;i<180;i++){r.updateSimulation(1/60,{fire:true});rounds=Math.max(rounds,r.projectiles.length);}
   const loss=health-target.shield-target.hull;if(!(loss>0))throw Error('Player fire misses a directly aligned visible enemy');
   const playerBefore=r.save.player.shield+r.save.player.hull,p=new T.Vector3(...r.save.player.position),start=p.clone().add(new T.Vector3(0,0,-20));
   r.fireBeam(target.id,WEAPONS.beam,start,new T.Vector3(0,0,1),'incoming-check');
   const incoming=playerBefore-r.save.player.shield-r.save.player.hull;if(!(incoming>0))throw Error('Incoming beam fails to hit visible player hull');
   r.syncRender(0,performance.now());r.renderer.render();return{loss,incoming,rounds,ships:r.ships.length};
  });await page.screenshot({path:`${out}/${name}-player-hits.png`});
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  const landing=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.skipTutorial();r.save.player.dockedAt='helix';await r.launch();cancelAnimationFrame(r.frameId);
   const T=await import('/vendor/three.module.min.js'),{LOCATIONS}=await import('/src/game/data.js'),{stationVisualSurfaceRadius,stationSurfaceDistance}=await import('/src/game/stationTraffic.js'),b=r.stationTransitData('helix').berth;r.ships=[];if(stationSurfaceDistance('helix',r.save.player.position)<50)throw Error('Station departure did not clear the hull');
   const l=LOCATIONS.helix;r.save.player.position.splice(0,3,l.position[0],l.position[1],l.position[2]+stationVisualSurfaceRadius('helix')+150);r.save.player.velocity.fill(0);r.save.player.currentTargetId='helix';r.save.player.navTargetId='helix';r.activeInstanceId='helix';
   new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(...b.pad).sub(new T.Vector3(...b.gate)).normalize()).toArray(r.save.player.rotation);
   r.updateStationLandingGuidance();r.autoDockCheck();if(r.save.player.dockedAt!=='helix'||r.playerDocking)throw Error('Station outer approach did not hand over to the arrival film');
   return{dockedAt:r.save.player.dockedAt,padId:b.padId,position:[...r.save.player.position]};
  });await page.screenshot({path:`${out}/${name}-landed.png`});
  assert.deepEqual(errors,[]);results.push({name,combat,landing,errors});await writeFile(`${out}/player-actions.json`,JSON.stringify(results,null,2));console.log(name,JSON.stringify(results.at(-1)));
 }finally{await browser.close();}
}
