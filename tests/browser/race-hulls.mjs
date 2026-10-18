import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[],out='output/race-balance';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio',`--use-angle=${process.env.VR_ANGLE??'swiftshader'}`]}:{})});
 try{
 const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0})));
 await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/output/race-session/index.html?revision=0.8.2hv`);await page.waitForFunction(()=>window.isolatedRace?.ready);
 assert.equal(await page.locator('#race-hulls button').count(),4);
 await page.screenshot({path:`${out}/selection-${name}.png`});
 const hulls=[];
 for(const id of ['speedster','demon','talon','lancer']){
  await page.evaluate(id=>isolatedRace.selectHull(id),id);
  const grid=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);return {hull:r.save.player.shipId,npcs:r.ships.map(s=>s.raceHull),speed:r.playerStats().maxSpeed,afterburnSpeed:r.playerStats().afterburnSpeed,returnHull:r.save.player.raceReturn.shipId,valid:r.ships.every(s=>Number.isFinite(s.energy)&&s.hull===400),fits:document.querySelector('#race-ready section').scrollWidth<=document.querySelector('#race-ready section').clientWidth};});
  assert.equal(grid.hull,id);assert.equal(new Set([id,...grid.npcs]).size,4);assert.equal(grid.speed,145);assert.equal(grid.afterburnSpeed,500);assert.ok(grid.valid&&grid.fits);hulls.push(grid);
 }
 await page.locator('#race-go').click();
 await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player;cancelAnimationFrame(r.frameId);r.activeRace.state='running';r.activeRace.startedAt=r.save.world.time;r.activeRace.playerStartTime=r.save.world.time;p.position[1]+=3000;p.velocity.fill(0);p.angularVelocity.fill(0);r.resetPlayerInterpolation(true);r.ui.updateHud(r.buildHudModel());});
 const controls=await page.evaluate(()=>({throttle:getComputedStyle(document.querySelector('.touch-throttle')).display,brake:getComputedStyle(document.querySelector('#touch-fire')).display,brakeText:document.querySelector('#touch-drone-label').textContent,weaponRow:getComputedStyle(document.querySelector('.touch-secondary-row')).display}));
 assert.equal(controls.throttle,'none');assert.equal(controls.brakeText,'BREMSE');assert.equal(controls.weaponRow,'none');if(name==='iphone')assert.notEqual(controls.brake,'none');
 // Real keyboard holds feed the ordinary action path; sim stepping keeps the
 // test independent of the browser's software/hardware rendering frame rate.
 await page.keyboard.down('Shift');
 const thrust=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<120;i++)r.updateSimulation(1/60,r.input.getActions());return {speed:Math.hypot(...r.save.player.velocity),throttle:r.save.player.throttle,projectiles:r.projectiles.length};});
 await page.keyboard.up('Shift');assert.ok(thrust.speed>150);assert.equal(thrust.throttle,1);assert.equal(thrust.projectiles,0);
 const coast=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),v=[...r.save.player.velocity];for(let i=0;i<60;i++)r.updateSimulation(1/60,r.input.getActions());return {before:v,after:[...r.save.player.velocity],throttle:r.save.player.throttle};});
 assert.equal(coast.throttle,0);assert.ok(Math.hypot(...coast.after)<=Math.hypot(...coast.before)+1e-9,'release coasts with gentle afterburner drift assistance');
 const flightAssist=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,actions={pitch:0,yaw:0,roll:0,throttleDelta:0,afterburner:false,fire:false};p.rotation.splice(0,4,0,0,0,1);p.angularVelocity.fill(0);p.velocity.splice(0,3,50,0,-100);p.throttle=0;r.save.settings.flightAssist=true;r.updatePlayer(1/60,actions);const assisted=p.velocity[0];p.velocity.splice(0,3,50,0,-100);p.throttle=0;r.save.settings.flightAssist=false;r.updatePlayer(1/60,actions);const unassisted=p.velocity[0];p.velocity.splice(0,3,0,0,-100);r.updatePlayer(1/60,{...actions,fire:true});const unassistedBrake=Math.hypot(...p.velocity);r.save.settings.flightAssist=true;return {assisted,unassisted,unassistedBrake};});
 assert.ok(flightAssist.assisted<49.9&&Math.abs(flightAssist.unassisted-50)<1e-8,'race handling follows the normal Flight Assist toggle');assert.ok(flightAssist.unassistedBrake<100,'counterthrust still works with Flight Assist off');
 // Exercise the actual right-hand touch control, including pointer capture.
 const fire=page.locator('#touch-fire');
 if(name==='iphone'){
  const box=await fire.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 }else await page.keyboard.down('Space');
 const brake=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<45;i++)r.updateSimulation(1/60,r.input.getActions());r.syncRender(.016,performance.now());return {speed:Math.hypot(...r.save.player.velocity),shots:r.projectiles.length,active:r.input.getActions().fire};});
 if(name==='iphone')await page.mouse.up();else await page.keyboard.up('Space');assert.ok(brake.speed<thrust.speed*.4);assert.equal(brake.shots,0);assert.equal(brake.active,true);
 const pickup=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,pickup=r.activeRace.course.boostPickups[0];p.raceGateIndex=r.activeRace.course.gates.findIndex(g=>g.pathDistance>pickup.pathDistance);p.prevPosition.set(pickup.position.map((v,j)=>v-pickup.direction[j]*20));p.position.splice(0,3,...pickup.position.map((v,j)=>v+pickup.direction[j]*20));r.updateRace(0);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());return {time:r.activeRace.drive.stabilizerTime,collected:r.activeRace.boostCollected.has(0)};});
 assert.equal(pickup.time,5);assert.ok(pickup.collected);
 await page.screenshot({path:`${out}/flight-${name}.png`});
 const returned=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),original=r.save.player.raceReturn.shipId;r.endRaceField();return {original,hull:r.save.player.shipId,loaner:Boolean(r.save.player.raceReturn),speed:r.playerStats().maxSpeed};});assert.equal(returned.hull,returned.original);assert.equal(returned.loaner,false);assert.ok(returned.speed<220);
 const career=await page.evaluate(()=>{
  const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,original=p.shipId;
  p.dockedAt='cairn';p.credits=10000;r.chooseRaceHull('demon');
  const ticket=r.acceptRace('mourning-run');
  if(!ticket.ok)throw new Error(ticket.message);
  const accepted=r.activeRace.hullId,parked=p.shipId;
  // A later preference change must not alter the already-paid ticket.
  r.chooseRaceHull('speedster');r.activeRace=null;r.restoreActiveRace();
  const restored=r.activeRace.hullId;
  p.dockedAt=undefined;r.startRaceAt(r.activeRace.course);
  const started=p.shipId,npcs=r.activeRace.racers.map(s=>s.raceHull);
  r.endRaceField();return {original,parked,accepted,restored,started,npcs,returned:p.shipId};
 });
 assert.equal(career.parked,career.original);assert.equal(career.accepted,'demon');assert.equal(career.restored,'demon');assert.equal(career.started,'demon');assert.equal(new Set([career.started,...career.npcs]).size,4);assert.equal(career.returned,career.original);
 assert.deepEqual(errors,[]);results.push({name,hulls,controls,thrust,coast,flightAssist,brake,pickup,returned,career,errors});console.log(name,JSON.stringify(results.at(-1)));
 }finally{let timer;await Promise.race([browser.close(),new Promise(r=>timer=setTimeout(r,5000))]);clearTimeout(timer);}
}
await writeFile(`${out}/browser-checks.json`,JSON.stringify(results,null,2));process.exit(0);
