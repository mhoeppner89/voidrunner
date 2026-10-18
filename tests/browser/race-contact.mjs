import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/race-session',results=[];await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle',`--use-angle=${process.env.VR_ANGLE??'swiftshader'}`]}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0})));
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/output/race-session/index.html?revision=0.8.2hr`);await page.waitForFunction(()=>window.isolatedRace?.ready);
  assert.equal(await page.locator('#race-go').isEnabled(),true);
  assert.equal(await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r.ships.every(s=>r.renderer.shipMeshes.get(s.id)?.userData.glb)&&Boolean(r.renderer.raceSpeedLines)&&!r.renderer.raceSpeedLines.visible;}),true,'actual rival hulls and speed effects are prepared before Start');
  await page.locator('#race-go').click();await page.waitForFunction(()=>document.querySelector('#race-ready').hidden);
  const result=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace;cancelAnimationFrame(r.frameId);race.state='running';race.startedAt=r.save.world.time;race.playerStartTime=r.save.world.time;
   const {createRaceDrive}=await import('/src/game/raceDynamics.js'),T=await import('/vendor/three.module.min.js'),{shipVsShip,PLAYER_CONTACT_SCALE}=await import('/src/game/shipCollision.js'),{npcShipScaleForVariant}=await import('/src/game/render.js');
   const programsBefore=r.renderer.renderer.info.programs.length;
   const player=r.save.player,lead=race.racers[0],base=race.course.gathering.position.map((v,i)=>v+(i===1?2500:0)),beforeShield=player.shield;
   for(const [i,ship]of race.racers.entries()){ship.position.splice(0,3,base[0]+i*300,base[1],base[2]);ship.racePreviousPosition.splice(0,3,...ship.position);ship.velocity.splice(0,3,0,0,-70);ship.rotation.splice(0,4,0,0,0,1);}
   player.position.splice(0,3,base[0],base[1],base[2]-2);player.prevPosition.set([base[0],base[1],base[2]+25]);player.rotation.splice(0,4,0,0,0,1);player.velocity.splice(0,3,0,0,-150);player.throttle=1;race.drive=createRaceDrive();race.contacts=undefined;
   r.resolveRaceShipContacts(race,1/60);
   const overlap=shipVsShip(new T.Vector3(...player.position),new T.Quaternion(...player.rotation),'talon',r.playerHullScale(),new T.Vector3(...lead.position),new T.Quaternion(...lead.rotation),lead.variant,npcShipScaleForVariant(lead.variant),{});
   const impact={hits:race.contacts.hits,playerHits:race.contacts.playerHits,shieldLoss:beforeShield-player.shield,ownSpeed:Math.hypot(...player.velocity),rivalSpeed:Math.hypot(...lead.velocity),charge:race.drive.charge,stagger:player.raceContactUntil-r.save.world.time,overlap,hostile:lead.hostile,positions:[...player.position,...lead.position]};
   r.resetPlayerInterpolation(true);r.syncRender(.016,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();
   impact.newPrograms=r.renderer.renderer.info.programs.length-programsBefore;
   return impact;
  });assert.ok(result.playerHits>0&&result.hits>0);assert.ok(result.shieldLoss>0);assert.ok(result.ownSpeed<150&&result.rivalSpeed>70);assert.equal(result.charge,3.2);assert.ok(result.stagger>0);assert.equal(result.overlap,false);assert.equal(result.hostile,false);assert.equal(result.newPrograms,0,'a contact must not compile new effect shaders during the race');
  await page.screenshot({path:`${out}/contact-${name}.png`});
  const tactics=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace,p=r.save.player,lead=race.racers[0];
   lead.position.splice(0,3,p.position[0],p.position[1],p.position[2]+23);lead.velocity.splice(0,3,0,0,-110);lead.raceTactics=undefined;lead.raceRecoverUntil=0;
   p.velocity.splice(0,3,0,0,-80);r.resetPlayerInterpolation();race.contacts=undefined;r.updateRace(1/60);
   return {mode:lead.raceTactics.mode,target:lead.raceTactics.targetId,lane:lead.raceLane};
  });assert.ok(['shoulder','draft'].includes(tactics.mode));assert.equal(tactics.target,'player');
  await page.locator('#race-restart').click();const reset=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return {state:r.activeRace.state,contacts:r.activeRace.contacts===undefined,stagger:r.save.player.raceContactUntil,charge:r.activeRace.drive.charge};});assert.deepEqual(reset,{state:'countdown',contacts:true,stagger:0,charge:3.2});
  const dnf=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.activeRace.state='running';r.activeRace.startedAt=r.save.world.time;r.save.player.hull=0;r.updateRace(1/60);const cleared=!r.activeRace&&r.ships.every(s=>!s.race)&&r.renderer.raceBoostMeshes.every(m=>!m.visible);isolatedRace.restart();return {cleared,canRestart:r.activeRace.state==='countdown'&&r.save.player.hull>0};});assert.deepEqual(dnf,{cleared:true,canRestart:true});
  assert.deepEqual(errors,[]);results.push({name,...result,tactics,reset,dnf,errors});console.log(name,JSON.stringify(results.at(-1)));
 }finally{let timer;await Promise.race([browser.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);clearTimeout(timer);}
}
await writeFile(`${out}/contact-checks.json`,JSON.stringify(results,null,2));process.exit(0);
