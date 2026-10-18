import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/race-session',results=process.env.VR_PROFILES?await readFile('output/race-session/boost-checks.json','utf8').then(JSON.parse).catch(()=>[]):[];await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle',`--use-angle=${process.env.VR_ANGLE??'swiftshader'}`]}:{})});
 try{
  const context=await browser.newContext({...device,serviceWorkers:'allow'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));});
  await page.goto(`${base}/output/race-session/index.html?revision=0.8.2hr`);await page.waitForFunction(()=>window.isolatedRace?.ready);
  await page.locator('#race-go').click();await page.waitForFunction(()=>document.querySelector('#race-ready').hidden);await page.evaluate(()=>advanceTime(4500));
  const drive=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.frameId=0;
   r.save.player.position[1]+=3000;const start=[...r.save.player.position];r.save.player.throttle=1;
   const actions={afterburner:true,throttleDelta:0,pitch:0,yaw:0,roll:0};
   for(let i=0;i<240;i++)r.updateSimulation(1/60,actions);
   r.syncRender(0,performance.now());r.renderer.render();
   return {charge:r.activeRace.drive.charge,speed:Math.hypot(...r.save.player.velocity),fov:r.renderer.fovTarget,lines:r.renderer.raceSpeedLines?.visible,modal:r.ui.isModalOpen,moved:Math.hypot(...r.save.player.position.map((v,j)=>v-start[j])),fuelLabel:document.querySelector('#screen-own-fuel-label').textContent};
  });console.log(name,'drive',JSON.stringify(drive));assert.equal(drive.charge,3.2);assert.ok(drive.speed>60&&drive.moved>50);assert.ok(!drive.modal);assert.ok(drive.lines&&drive.fov>80&&drive.fov<=83);assert.equal(drive.fuelLabel,'SCHUB');
  const pickups=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace,records=[];
   for(const pickup of race.course.boostPickups){
    r.save.player.raceGateIndex=race.course.gates.findIndex(g=>g.pathDistance>pickup.pathDistance);
    const prev=pickup.position.map((v,j)=>v-pickup.direction[j]*22),next=pickup.position.map((v,j)=>v+pickup.direction[j]*22);
    r.save.player.position.splice(0,3,...next);r.save.player.prevPosition.set(prev);r.updateRace(1/60);
    const first=race.drive.stabilizerTime,charge=race.drive.charge;r.updateRace(1/60);
    records.push({index:pickup.index,first,repeated:race.drive.stabilizerTime,chargeBefore:charge,chargeAfter:race.drive.charge,collected:race.boostCollected.has(pickup.index),hidden:!r.renderer.raceBoostMeshes[pickup.index].visible});
   }
   r.syncRender(0,performance.now());r.renderer.render();
   return records;
  });assert.equal(pickups.length,3);assert.ok(pickups.every(p=>p.first===5&&p.repeated===5&&p.chargeBefore===p.chargeAfter&&p.collected&&p.hidden));
  const picture=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),race=r.activeRace,pickup=race.course.boostPickups[1],T=await import('/vendor/three.module.min.js');
   race.boostCollected.delete(1);r.save.player.raceGateIndex=race.course.gates.findIndex(g=>g.pathDistance>pickup.pathDistance);
   r.save.player.position.splice(0,3,...pickup.approach);r.save.player.velocity.splice(0,3,...pickup.direction.map(v=>v*320));
   const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(...pickup.position).sub(new T.Vector3(...pickup.approach)).normalize());r.save.player.rotation.splice(0,4,...q.toArray());r.resetPlayerInterpolation(true);
   r.syncRaceCourse(race);r.updateRace(0);r.save.player.throttle=1;for(let i=0;i<30;i++)r.updateSimulation(1/60,{afterburner:true,throttleDelta:0,pitch:0,yaw:0,roll:0});r.syncRender(.016,performance.now());r.renderer.render();r.ui.updateHud(r.buildHudModel());
   const fuel=document.querySelector('#screen-own-fuel'),strip=document.querySelector('#screen-race-strip'),target=document.querySelector('#screen-target-readout');
   const label=document.querySelector('#screen-own-fuel-label');
   return {raceClass:r.ui.root.classList.contains('is-racing'),fireDisplay:getComputedStyle(document.querySelector('#touch-fire')).display,shipSpeed:Math.hypot(...r.save.player.velocity),afterburnLimit:r.playerStats().afterburnSpeed,target:r.save.player.currentTargetId,expectedTarget:race.course.gates[r.save.player.raceGateIndex].id,stabilizer:race.drive.stabilizerTime,fuel: fuel.textContent,label:label.textContent,shortLabel:label.dataset.short,effect:fuel.dataset.boost,gap:r.raceHud().gap,stripFits:strip.scrollWidth<=strip.clientWidth+1,targetFits:target.scrollWidth<=target.clientWidth+1,visible:r.renderer.raceBoostMeshes.filter(m=>m.visible).length};
  });assert.ok(picture.raceClass);if(name==='iphone')assert.notEqual(picture.fireDisplay,'none');assert.ok(picture.shipSpeed<picture.afterburnLimit*1.05,'pickup must not raise top speed');assert.ok(picture.stabilizer>0);assert.equal(picture.fuel,'5s');assert.ok(['STABILISATOR','STABILIZER'].includes(picture.label));assert.equal(picture.shortLabel,'STAB');assert.equal(picture.effect,'stabilizer');assert.ok(Number.isFinite(picture.gap));assert.ok(picture.stripFits&&picture.targetFits);assert.ok(picture.visible>=1);assert.equal(picture.target,picture.expectedTarget);
  await page.screenshot({path:`${out}/boost-${name}.png`});
  await page.locator('#race-restart').click();assert.ok(await page.locator('#race-ready').isVisible());
  const reset=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();return {charge:r.activeRace.drive.charge,stabilizer:r.activeRace.drive.stabilizerTime,collected:r.activeRace.boostCollected.size,markers:r.renderer.raceBoostMeshes.filter(m=>m.visible).length};});
  assert.deepEqual(reset,{charge:3.2,stabilizer:0,collected:0,markers:0});assert.deepEqual(errors,[]);const prior=results.findIndex(p=>p.name===name);if(prior>=0)results.splice(prior,1);results.push({name,drive,pickups,picture,reset,errors});console.log(name,JSON.stringify(results.at(-1)));
 }finally{let timer;await Promise.race([browser.close(),new Promise(resolve=>timer=setTimeout(resolve,5000))]);clearTimeout(timer);}
}
await writeFile(`${out}/boost-checks.json`,JSON.stringify(results,null,2));process.exit(0);
