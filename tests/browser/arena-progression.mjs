// Staged review poses. NPCs acquire and fire their own torpedoes in Strike.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
import {progressionSampleFactory,movingTerrainSignature} from '../../tools/playtest/probes/arena-progression-samples.mjs';
import {assertArenaGlass,checkArenaTransitions} from '../helpers/arena-glass.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const profile=process.env.VR_PROFILES,desktop=profile==='desktop',engine=profile==='iphone'?webkit:chromium;
const device=desktop?{viewport:{width:1440,height:900}}:devices[profile==='iphone'?'iPhone 13 landscape':'Pixel 7 landscape'];
const chrome=process.env.VR_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out='output/arena-progression',base=process.env.VR_BASE_URL??'http://127.0.0.1:4173';
await mkdir(out,{recursive:true});
const browser=await engine.launch(engine===webkit?{}:{executablePath:existsSync(chrome)?chrome:undefined,args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({...device,serviceWorkers:'block'}),reports=[],errors=[];page.setDefaultTimeout(120000);
 page.on('pageerror',e=>{errors.push(e.message);console.error(profile,e.message);});
 page.on('requestfailed',req=>{if(req.resourceType()==='script')console.error(profile,req.failure(),req.url());});
 await page.addInitScript(()=>{localStorage.setItem('voidrunner-lang','en');localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__','en');localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,vibration:false,language:'en'}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await page.goto(base+'/game.html?startup-probe=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__VOID_PRIVATEER__?.startArenaRun,null,{polling:100});
 await page.evaluate(async()=>{
  const {newArenaRun,writeArenaRun}=await import('/src/game/arenaRun.js');
  writeArenaRun(newArenaRun(false,718));await __VOID_PRIVATEER__.startArenaRun(true);
  const s=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(s.frameId);s.audio.setVolumes(0,0);
  const T=await import('three'),{createOutfittingState}=await import('/src/game/outfitting.js'),{wingmanFitFor}=await import('/src/game/shipPool.js');
  const p=s.save.player,r=s.save.arenaRun,review=window.arenaReview={s,p,r,T,time:performance.now()};
  review.draw=()=>{s.snapshotInterpolationState();s.lastHudUpdate=0;for(let i=0;i<3;i++){review.time+=100;s.syncRender(.016,review.time);}s.renderer.render();};
  review.start=async level=>{
   s.clearTransientSpace();s.ui.clearComms?.();s.ui.recentEvents.length=0;
   const id=level<5?'wayfarer':level<17?'talon':'blade',wing=level<13?'scrapper':level<21?'talon':'blade';
   p.shipId=id;p.ownedShips=[id];p.outfitting=createOutfittingState([id]);p.outfitting.loadouts[id].guns.fill('pulse-cannon');p.throttle=0;
   s._statsDirty=true;const stats=s.playerStats();Object.assign(p,{hull:stats.hull,shield:stats.shield,energy:stats.energyCapacity});
   Object.assign(r,{phase:'prepare',wave:level-1,rewardChosen:true,hullChosen:true,decisions:{[level-1]:true},wingmen:Array.from({length:level===25?2:level>=9?1:0},(_,i)=>({id:'wing'+i,name:'Wing '+(i+1),order:'aggressive',hullId:wing,fit:wingmanFitFor(wing),alive:true}))});
   s.ui.setCockpitShip(id);s.startRunWave();s.tickArenaRun(3);s.nextChatterAt=0;
   s.ui.showRunCountdown?.(0,'','');await s.ui.cockpitArtwork?.ready;
   await Promise.allSettled([...s.renderer.glbShipLoading.values()]);
   // The capture pauses requestAnimationFrame. Run the same first flight
   // frame as a real launch so the painted apertures are placed before drawing.
   s.frameBody(s.lastFrame);review.draw();
  };
  review.watch=(target,offset,point=target.position,up)=>{
   const camera=new T.Vector3(...target.position).add(new T.Vector3(...offset));
   camera.toArray(p.position);p.velocity.fill(0);p.angularVelocity.fill(0);
   const aim=new T.Vector3(...point);
   const rotation=up?new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(camera,aim,up)):
    new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),aim.sub(camera).normalize());
   rotation.toArray(p.rotation);
   if(target.id){target.identifiedByPlayer=true;target.playerSensorAwareness=1;s.selectTarget('ship',target.id);}
   review.draw();
  };
 });
 for(const [level,name] of [[2,'inbound-group'],[8,'drover-intercept'],[13,'thor-torpedo-run'],[9,'caravan-convoy'],[10,'rookery-raid'],[14,'heimdall-charge'],[19,'tacita-screen'],[25,'final-second-group']].filter(([level])=>!process.env.LEVELS||process.env.LEVELS.split(',').includes(String(level)))){
  await page.evaluate(async level=>{
   const {s,p,r,T,start,watch,draw}=arenaReview;await start(level);
   const b=s.runBattle;
   const tick=dt=>{s.save.world.time+=dt;s.tickArenaRun(dt);};
   if(level===2){
    tick(10.1);if(!b.warning)throw Error('No group warning');
    watch({position:b.warning.entry.position},[0,15,610]);tick(.1);
   }
   if(level===8){
    for(let i=0;i<180&&!b.target;i++){for(const ship of s.ships)if(ship.arenaRunEnemy)ship.hull=0;tick(1);}
    const d=b.target;watch(d,[95,50,115]);s.updateSimulation(1/60,{});
    if(Math.hypot(...d.velocity)<1||!s.ui.commsLog.some(row=>row.line.includes('both engines')))throw Error('Missing moving intercept');
   }
   if(level===13){
    const wing=s.ships.find(x=>x.arenaRunWingman),attacker=s.ships.find(x=>x.arenaObjectiveAttacker);
    // Let the bomber enter the wing's acquisition band.
    for(let i=0;i<60*15&&wing.wingmanTargetId!==attacker.id;i++)s.updateSimulation(1/60,{});
    if(wing.wingmanTargetId!==attacker.id)throw Error('Aggressive wing missed the bomber');
    s.setWingOrder('breakoff'); // Let the first Thor finish a visible firing pass.
    const d=b.target;let missile,bomber;
    for(let i=0;i<60*55&&!missile;i++){
     s.updateSimulation(1/60,{});
     missile=s.projectiles.find(x=>x.launcherId==='torpedo'&&x.targetId===d.id);
    }
    if(!missile)throw Error('No Thor torpedo: '+JSON.stringify({phase:r.phase,drover:d.hull,bombers:s.ships.filter(x=>x.arenaObjectiveAttacker).map(x=>({hull:x.hull,pos:x.position,target:x.targetId,lock:x.combatFit.lock,rounds:x.combatFit.racks,search:x.search?.phase})),target:d.position}));
    bomber=s.ships.find(x=>x.id===missile.ownerId);if(!bomber?.arenaObjectiveAttacker)throw Error('Torpedo has wrong owner');
    for(let i=0;i<16;i++)s.updateSimulation(1/60,{});
    const a=new T.Vector3(...bomber.position),line=new T.Vector3(...d.position).sub(a).normalize();
    const side=line.clone().cross(new T.Vector3(0,1,0)).normalize(),up=side.clone().cross(line).normalize();
    const offset=line.clone().multiplyScalar(-60).addScaledVector(side,35).addScaledVector(up,15);
    const focus=a.clone().addScaledVector(line,95).addScaledVector(up,-10);
    watch(bomber,offset.toArray(),focus.toArray(),up);arenaReview.torpedo={owner:bomber.hullId,target:d.variant};
   }
   if(level===9){for(let i=0;i<180&&!b.target;i++){for(const ship of s.ships)if(ship.arenaRunEnemy)ship.hull=0;tick(1);}
    if(b.target?.variant!=='caravan')throw Error('Missing Caravan');
    for(let i=0;i<75&&b.group<2;i++)tick(1);
    s.renderer.ensureGlbShipModel('caravan');await s.renderer.glbShipLoading.get('caravan');watch(b.target,[105,55,145]);}
   if(level===10){
    for(let i=0;i<180&&!b.target;i++){for(const ship of s.ships)if(ship.arenaRunEnemy)ship.hull=0;tick(1);}
    if(b.target?.variant!=='rookery')throw Error('Wrong raid hull');
    s.renderer.ensureGlbShipModel('rookery');await s.renderer.glbShipLoading.get('rookery');watch(b.target,[100,48,135]);}
   if(level===14){
    let ship;
    for(let i=0;i<180&&!ship;i++){
     for(const escort of s.ships)if(escort.arenaRunEnemy)escort.hull=0;
     tick(1);ship=s.ships.find(x=>x.variant==='siege'&&x.hull>0);
    }
    if(!ship)throw Error('Missing Heimdall');
    await s.renderer.ensureGlbShipModel('siege');
    const {updateSiegeLance}=await import('/src/game/siegeLance.js');
    // The camera pilot watches from the flank. An NPC ahead of the muzzle
    // supplies a real target for the production aim ray and firing effect.
    const target=s.spawnShip('pirate',[0,0,0],undefined,undefined,undefined,{hullId:'talon',faction:'pirates'});
    ship.rotation=[0,0,0,1];ship.velocity.fill(0);
    const pos=new T.Vector3(...ship.position);
    const aim=pos.clone().add(new T.Vector3(0,0,-220));
    aim.toArray(target.position);ship.targetId=target.id;ship.holdFire=false;ship.hostile=true;
    watch(ship,[70,32,25],pos.clone().add(new T.Vector3(0,0,-8)).toArray(),new T.Vector3(0,1,0));
    const started=s.save.world.time;
    arenaReview.charge=tick=>{
     s.save.world.time=started+tick/60;
     updateSiegeLance(s,ship,aim);draw();
     const mesh=s.renderer.shipMeshes.get(ship.id);
     const glass=mesh.userData.emissiveMaterials.find(mat=>mat.name==='bridge_glass');
     if(!glass?.emissiveMap||!(glass.emissiveIntensity>=1))throw Error('Heimdall interior lights went dark');
     const lit=mesh.userData.lanceCoils.map(mat=>mat.emissiveIntensity>0);
     if(lit.filter(Boolean).length!==ship.lanceCoils)throw Error('Joint lighting differs from the simulation');
     return [ship.lanceCoils,ship.lance.frozen];
    };
    arenaReview.charge(0);arenaReview.charge(90);
   }
   if(level===19){
    const ship=s.ships.find(x=>x.variant==='picket');
    if(!ship)throw Error('Tacita missing from Screened');
    await s.renderer.ensureGlbShipModel('picket');
    for(let i=0;i<180;i++){
     s.updateSimulation(1/60,{});
     if(i>3&&Math.abs(Math.sin(ship.rotorAngle)-.55)<.025)break;
    }
    const q=new T.Quaternion().fromArray(ship.rotation);
    const offset=new T.Vector3(-38,33,-43).applyQuaternion(q);
    const aim=new T.Vector3(0,-3,0).applyQuaternion(q).add(new T.Vector3(...ship.position));
    watch(ship,offset.toArray(),aim.toArray(),new T.Vector3(0,1,0).applyQuaternion(q));
    s.cycleCapitalSubtarget();
    arenaReview.picket=ship;
   }
   if(level===25){
    for(const ship of s.ships)if(ship.arenaRunEnemy&&ship!==b.target)ship.hull=0;
    b.target.hull=.55*b.target.maxHull;tick(10.1);tick(5.1);
    if(b.group!==2)throw Error('The frigate did not bring in group two');
    const pair=s.ships.filter(x=>x.arenaRunEnemy&&x.hull>0&&x.hullId==='talon'&&x.pilot.tier==='ace');
    if(pair.length!==2)throw Error('Missing second group '+JSON.stringify(s.ships.filter(x=>x.arenaRunEnemy&&x.hull>0).map(x=>[x.variant,x.hullId,x.pilot?.tier])));
    const mid=new T.Vector3(...pair[0].position).lerp(new T.Vector3(...pair[1].position),.5);
    watch(pair[0],[25,22,110],mid.toArray());
   }
   draw();
  },level);
  await page.waitForTimeout(150);
  const state=await page.evaluate(()=>{
   const {s,r,torpedo,draw}=arenaReview;draw();
   return {wave:r.wave+1,group:s.runBattle.group,inbound:Boolean(document.querySelector('#run-inbound:not(.is-hidden)')),
    ticker:document.querySelector('#screen-event-ticker').textContent,paint:s.ui.cockpitArtwork?.active&&s.ui.cockpitArtwork?.frame?.naturalWidth>0,
    torpedo:r.wave===12?torpedo:undefined};
  });
  assert.ok(state.paint,JSON.stringify(state));if(level===2)assert.ok(state.inbound);
  await page.evaluate(assertArenaGlass);
  if(level===8)assert.match(state.ticker,/Njord|engines/i);
  if(desktop)await page.screenshot({path:out+'/'+name+'.png'});
  if(level===14){
   const directory='output/siege/ingame',deviceName=profile==='android'?'pixel-7':profile;
   await mkdir(directory,{recursive:true});
   assert.deepEqual(await page.evaluate(()=>arenaReview.charge(90)),[3,true]);
   await page.screenshot({path:directory+'/'+deviceName+'-mid-charge.png'});
   assert.deepEqual(await page.evaluate(()=>arenaReview.charge(180)),[6,false]);
   await page.screenshot({path:directory+'/'+deviceName+'-firing.png'});
   assert.deepEqual(await page.evaluate(()=>arenaReview.charge(187)),[0,false]);
  }
  if(level===19){
   const directory='output/picket/ingame',deviceName=profile==='android'?'pixel-7':profile;
   await mkdir(directory,{recursive:true});
   const measure=()=>page.evaluate(()=>{
    const {s,picket}=arenaReview,mesh=s.renderer.shipMeshes.get(picket.id);
    return {angle:mesh.userData.rotor.rotation.y,sim:picket.rotorAngle,tilt:mesh.userData.rotor.rotation.x,
     glow:mesh.userData.systemGlow.emissiveIntensity,visible:mesh.userData.rotor.parent.visible};
   });
   const active=await measure();assert.ok(active.visible&&active.glow>0);
   assert.ok(Math.abs(active.angle-active.sim)<1e-6);
   await page.screenshot({path:directory+'/'+deviceName+'-active.png'});
   await page.evaluate(async()=>{
    const {s,picket,draw,T}=arenaReview;
    const {damageCapitalMount}=await import('/src/game/capitalCombat.js');
    const point=new T.Vector3(0,11.89,12.96).applyQuaternion(new T.Quaternion().fromArray(picket.rotation)).add(new T.Vector3(...picket.position));
    if(damageCapitalMount(picket,point.toArray(),150)!==0)throw Error('Missed mast bearing');
    s.corvetteSubsystemDestroyed(picket,0);s.updateSimulation(1/60,{});draw();
   });
   const dead=await measure();assert.equal(dead.angle,active.angle);assert.ok(dead.visible);assert.equal(dead.glow,0);assert.equal(active.tilt,0);assert.ok(Math.abs(dead.tilt-25*Math.PI/180)<1e-6);
   await page.screenshot({path:directory+'/'+deviceName+'-destroyed.png'});
  }
  if(level===2){
   const hulls=await page.evaluate(async()=>Object.keys((await import('/src/game/cockpitDefinitions.js')).COCKPITS));
   for(const hull of hulls){
    const geometry=await page.evaluate(async hull=>{
     const {s}=arenaReview,ui=s.ui;
     ui.setCockpitShip(hull);await ui.cockpitArtwork.ready;ui.cockpitArtwork.relayout();
     ui.showRangeCue('WAVE 2/3','INBOUND 5 S');
     const card=document.querySelector('#range-cue'),animation=card.getAnimations()[0];
     animation.pause();animation.currentTime=600;
     const glass=ui.cockpitArtwork.layout.monitors.own;
     const band=card.firstElementChild,box=band.getBoundingClientRect(),monitor=card.getBoundingClientRect();
     const style=getComputedStyle(band);
     const framed=style.borderTopWidth==='2px'&&style.borderBottomWidth==='2px'&&Math.abs(box.width-monitor.width)<1
      &&Math.abs((box.top+box.bottom-monitor.top-monitor.bottom)/2)<1;
     const [title,detail]=band.children;
     return {framed,largeTitle:parseFloat(getComputedStyle(title).fontSize)>parseFloat(getComputedStyle(detail).fontSize),
      visible:getComputedStyle(card).opacity==='1',fits:[...band.children].every(child=>{
      const r=child.getBoundingClientRect();return r.width>0&&r.left>=glass.x&&r.right<=glass.x+glass.width&&r.top>=glass.y&&r.bottom<=glass.y+glass.height;
     })};
    },hull);
    assert.deepEqual(geometry,{framed:true,largeTitle:true,visible:true,fits:true},profile+' '+hull);
    if(profile!=='iphone'&&['wayfarer','talon'].includes(hull)){
     await mkdir('output/arena-waves',{recursive:true});
     await page.screenshot({path:'output/arena-waves/'+(desktop?'desktop':'pixel-7')+'-'+hull+'.png'});
    }
   }
   await page.evaluate(()=>{
    const ui=arenaReview.s.ui,card=document.querySelector('#range-cue');
    ui.flashBreakCue();ui.showRangeCue('SWEEP 3 S','');
    if(card.getAnimations().length||card.classList.contains('is-on'))throw Error('Range cue obscures BREAK');
    ui.setCockpitShip(arenaReview.p.shipId);
   });
  }
  reports.push({name,...state});console.log(profile,name,state.ticker);
 }
 if(profile!=='iphone'&&!process.env.LEVELS){
  const hulls=await checkArenaTransitions(page);
  console.log(profile,'25 level starts and three hull picks passed:',hulls.join(', '));
 }
 if(desktop&&!process.env.LEVELS){
  const factory=await page.evaluateHandle(progressionSampleFactory,718);
  const first=await factory.evaluateHandle(create=>create());
  const original=await first.evaluate(movingTerrainSignature);
  await first.evaluate(s=>{
   for(const id of ['shardbelt','mourning-line']){
    s.renderer.setActiveInstance(id);
    for(let i=0;i<60;i++)s.renderer.updateWorld(1/60);
   }
  });
  assert.notEqual(await first.evaluate(movingTerrainSignature),original);
  const second=await factory.evaluateHandle(create=>create());
  assert.equal(await second.evaluate(movingTerrainSignature),original);
  console.log('desktop progression samples reset moving asteroids and wrecks');
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/'+profile+'-checks.json',JSON.stringify(reports,null,2)+'\n');
}finally{await browser.close();}
