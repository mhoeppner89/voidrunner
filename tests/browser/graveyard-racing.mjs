import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/graveyard-review',results=process.env.VR_PROFILES?await readFile('output/graveyard-review/curved-race-browser.json','utf8').then(JSON.parse).catch(()=>[]):[];
await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2ih`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  for(const courseId of ['mourning-run','mourning-breach','mourning-relict-gauntlet']){
  await page.evaluate(async(courseId)=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);window.raceLib=await import('/src/game/racing.js');window.RaceT=await import('/vendor/three.module.min.js');const c=raceLib.generateRaceCourse(courseId);r.save.player.position.splice(0,3,...c.gathering.position);r.save.player.velocity.fill(0);r.ships=[];r.autopilot=false;r.updateActiveInstance(true);await r.renderer.ensureGraveyardModels();const racers=raceLib.createRaceRacers(c);r.ships=racers;r.activeRace={course:c,state:'running',startedAt:r.save.world.time,playerStartTime:r.save.world.time,racers,playerSplits:[],centerFuelRewarded:new Set()};r.save.player.raceGateIndex=0;const direction=new RaceT.Vector3(...c.gates[0].position).sub(new RaceT.Vector3(...c.gathering.position)).normalize();r.save.player.rotation.splice(0,4,...new RaceT.Quaternion().setFromUnitVectors(new RaceT.Vector3(0,0,-1),direction).toArray());r.resetPlayerInterpolation(true);r.syncRaceCourse(r.activeRace);r.syncRender(0,performance.now());r.renderer.render();},courseId);
  const presentation=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace,meshes=r.renderer.raceGateMeshes;
   const visible=()=>meshes.flatMap((m,i)=>m.visible?[i]:[]);
   race.state='travel';r.syncRaceCourse(race);
   const travel={gates:visible().length,start:r.renderer.raceStartRoot?.visible===true};
   race.state='countdown';r.syncRaceCourse(race);
   const countdown={gates:visible(),start:r.renderer.raceStartRoot?.visible===true};
   race.state='running';r.syncRaceCourse(race);
   const colors=meshes.slice(0,5).map(m=>m.children[0].material.color.getHex());
   return {travel,countdown,colors};
  });
  assert.deepEqual(presentation.travel,{gates:0,start:true});
  assert.deepEqual(presentation.countdown,{gates:[0,1,2,3,4],start:false});
  assert.deepEqual(presentation.colors,[0x3dff6e,0xffd24a,0x9aa6b0,0x9aa6b0,0x9aa6b0]);
  await page.screenshot({path:`${out}/curved-race-${name}-${courseId}-start.png`});
  const result=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace,start=r.save.world.time;let contacts=0,steps=0;const began=performance.now();let maxVisible=r.renderer.raceGateMeshes.filter(m=>m.visible).length;
   for(let tick=1;tick<18000&&race.racers.some(s=>!s.raceFinished);tick++){
    steps++;r.save.world.time=start+tick/60;r.updateRace(1/60);
    if(tick%6===0)for(const ship of race.racers){const before=[...ship.position];r.resolveNpcCollisions(ship);if(ship.position.some((v,j)=>Math.abs(v-before[j])>.001))contacts++;}
   }
   r.save.player.raceGateIndex=35;r.syncRaceCourse(race);maxVisible=Math.max(maxVisible,r.renderer.raceGateMeshes.filter(m=>m.visible).length);r.syncRender(0,performance.now());r.renderer.render();
   const endIndices=[];
   r.save.player.raceGateIndex=race.course.gates.length-1;r.syncRaceCourse(race);
   for(let i=0;i<r.renderer.raceGateMeshes.length;i++)if(r.renderer.raceGateMeshes[i].visible)endIndices.push(i);
   const finishColor=r.renderer.raceGateMeshes[race.course.gates.length-1].children[0].material.color.getHex();
   race.state='finished';r.syncRaceCourse(race);
   const terminalVisible=r.renderer.raceGateMeshes.filter(m=>m.visible).length;
   return {msPerStep:(performance.now()-began)/Math.max(1,steps),endIndices,finishColor,terminalVisible,finished:race.racers.map(s=>s.raceFinished),times:race.racers.map(s=>s.raceFinishTime-start),contacts,shipContacts:race.contacts?.hits??0,playerContacts:race.contacts?.playerHits??0,health:race.racers.map(s=>({hull:s.hull,shield:s.shield})),maxVisible,pooled:r.renderer.raceGateMeshes.length,wrecks:r.renderer.graveyardModelMeshes.length};
  });
  assert.ok(result.finished.every(Boolean));assert.equal(result.contacts,0);assert.equal(result.endIndices.length,1);assert.equal(result.finishColor,0x3dff6e);assert.equal(result.terminalVisible,0);assert.equal(result.maxVisible,5);assert.equal(result.wrecks,14);assert.deepEqual(errors,[]);const prior=results.findIndex(r=>r.name===name&&r.courseId===courseId);if(prior>=0)results.splice(prior,1);results.push({name,courseId,presentation,...result,errors});console.log(name,courseId,JSON.stringify(result));await writeFile(`${out}/curved-race-browser.json`,JSON.stringify(results,null,2));
  }
 }finally{let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}finally{clearTimeout(timer);}}
}
process.exit(0);
