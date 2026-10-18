import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));localStorage.setItem('void-privateer-save-v1','career-safety-marker');const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/output/race-session/index.html?course=shard-gauntlet&revision=0.8.2ih`);await page.waitForFunction(()=>window.isolatedRace?.ready);
 for(const id of ['shard-gauntlet','shard-switchback','shard-miners-knife']){
  if(id!=='shard-gauntlet')await page.evaluate(id=>isolatedRace.selectCourse(id),id);
  const state=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);return {id:r.activeRace.course.id,field:r.activeInstanceId,gates:r.activeRace.course.gates.length,racers:r.activeRace.racers.map(s=>s.raceTunnelCourse),hull:r.save.player.shipId,terrain:!!r.renderer.asteroidTerrain};});
  assert.equal(state.id,id);assert.equal(state.field,'shardbelt');assert.ok(state.gates>=35&&state.racers.every(Boolean)&&state.terrain);assert.equal(state.hull,'talon');console.log('Ready',state.id,state.gates);
 }
 await page.locator('#race-go').click();
 const flight=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;cancelAnimationFrame(r.frameId);r.activeRace.startedAt=r.save.world.time;r.activeRace.playerStartTime=r.save.world.time;r.activeRace.state='running';const before=[...p.position];for(let i=0;i<120;i++)r.updateSimulation(1/60,{pitch:0,yaw:0,roll:0,throttleDelta:0,afterburner:true,fire:false});r.syncRender(.016,performance.now());r.renderer.renderer.render(r.renderer.scene,r.renderer.camera);return {speed:Math.hypot(...p.velocity),moved:p.position.some((v,i)=>Math.abs(v-before[i])>5),finite:p.position.every(Number.isFinite),visibleGates:r.renderer.raceGateMeshes.filter(m=>m.visible).length,raceState:r.activeRace.state,contactUntil:p.raceContactUntil,time:r.save.world.time,position:[...p.position],errors:document.querySelector('#race-specs').textContent};});
 console.log(flight);await page.screenshot({path:'output/asteroid-review/race-in-game.png'});assert.ok(flight.speed>10&&flight.moved&&flight.finite);assert.equal(flight.visibleGates,5);
 const rivals=await page.evaluate(()=>{
  const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,race=r.activeRace;cancelAnimationFrame(r.frameId);p.position.splice(0,3,...race.course.center.map((v,i)=>v+(i===1?1800:0)));p.velocity.fill(0);p.throttle=0;r.resetPlayerInterpolation(true);
  const actions={pitch:0,yaw:0,roll:0,throttleDelta:0,afterburner:false,fire:false};
  for(let i=0;i<60*130&&race.racers.some(s=>!s.raceFinished);i++)r.updateSimulation(1/60,actions);
  return race.racers.map(s=>({hull:s.variant,finished:s.raceFinished,time:s.raceFinishTime-race.startedAt,hullRemaining:s.hull}));
 });
 console.log('Runtime rivals',rivals);assert.ok(rivals.every(r=>r.finished&&r.hullRemaining>0),'real runtime opponents complete the course alive');assert.ok(Math.min(...rivals.map(r=>r.time))<66.5*.95,'the real-runtime lead rival beats the player first-try benchmark');assert.deepEqual(errors,[]);
}finally{await browser.close();}process.exit(0);
