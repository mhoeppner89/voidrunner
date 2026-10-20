import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/mining-navigation';await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1280,height:800}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],report=[];page.setDefaultTimeout(90000);
  page.on('pageerror',e=>{errors.push(e.stack);console.error(name,e.stack);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(name,m.text());}});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const mining=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key'),{asteroidCollisionRadius}=await import('/src/game/worldData.js');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='mining-contract';q.flags.miningExplained=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');r.ensureTutorialMiningContract();r.acceptMission('tutorial-vesper-mining');await r.launch();cancelAnimationFrame(r.frameId);
   const {LOCATIONS}=await import('/src/game/data.js'),T=await import('/vendor/three.module.min.js'),n=r.asteroids.find(n=>n.id===q.flags.oreTargetId),away=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...n.position)).normalize();n.remaining=80;p.position.splice(0,3,...new T.Vector3(...n.position).addScaledVector(away,asteroidCollisionRadius(n)+40).toArray());p.rotation.splice(0,4,...new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),away.clone().negate()).toArray());p.angularVelocity.fill(0);p.velocity.fill(0);p.throttle=0;r.activeInstanceId='shardbelt';r.selectTarget('asteroid',n.id);n.scanned=true;r.resetPlayerInterpolation(true);r.toggleMiningDrones();
   for(let i=0;i<600&&!Object.values(p.droneFleet.unitsById).some(u=>u.state==='mining');i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   const unit=Object.values(p.droneFleet.unitsById).find(u=>u.state==='mining');if(!unit)throw Error('No working miner');r.ui.updateHud(r.buildHudModel());return{node:n.id,unit:unit.id,key:p.droneFleet.controller.targetNodeKey,time:r.save.world.time,ore:p.cargo.ore??0};
  });
  if(name==='desktop'){await page.locator('#radar').click();await page.locator('[data-map-target-id="vesper"]').first().click();}
  else{await page.locator('#radar').tap();await page.locator('[data-map-target-id="vesper"]').first().tap();}
  if(name==='desktop'){
   const before=await page.evaluate(()=>{
    const r=__VOID_PRIVATEER__.getRuntime(),rin=r.ships.find(s=>s.storyPersonId==='rin'),hull=r.renderer.shipMeshes.get(rin.id),maps=new Set();
    hull.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m??{}))if(t?.isTexture)maps.add(t);});
    window.miningTurn={disposed:0,uploads:[],frames:[],images:[...maps].map(t=>t.image)};
    for(const t of maps)t.addEventListener('dispose',()=>window.miningTurn.disposed++);
    const gl=r.renderer.renderer.getContext(),upload=gl.texSubImage2D;
    gl.texSubImage2D=function(...args){const start=performance.now();try{return upload.apply(this,args);}finally{const index=window.miningTurn.images.indexOf(args.at(-1));if(index>=0)window.miningTurn.uploads.push({index,ms:performance.now()-start});}};
    return{time:r.save.world.time,rotation:[...r.save.player.rotation],maps:maps.size};
   });assert.ok(before.maps>0);
   await page.keyboard.down('d');
   // Turn with actual held input while the miner cuts, returns its payload,
   // and relaunches. A quaternion teleport missed the player's slow-frame path.
   for(let burst=0;burst<20;burst++){
    if(burst===14)await page.keyboard.up('d');
    await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),start=performance.now();for(let i=0;i<4;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}window.miningTurn.frames.push(performance.now()-start);});
   }
   const turn=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),t=window.miningTurn;return{disposed:t.disposed,uploads:t.uploads,maxBurst:Math.max(...t.frames),rotation:[...r.save.player.rotation],time:r.save.world.time,phase:r.save.player.droneFleet.controller.phase,error:r.frameErrorAt??null};});
   assert.equal(turn.disposed,0,'retiring a borrowed turret must not evict Rin’s live hull textures');
   for(const {index}of turn.uploads)assert.ok(turn.uploads.filter(u=>u.index===index).length<=1,'turning must not repeatedly upload an unchanged hull map');
   assert.ok(turn.time>before.time+7&&turn.rotation.some((v,i)=>Math.abs(v-before.rotation[i])>.1));assert.equal(turn.phase,'running');assert.equal(turn.error,null,errors.join('\n'));report.push({turn});console.log(name,'mining turn',JSON.stringify(turn));
  }
  const selected=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<240;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}return{time:r.save.world.time,target:r.save.player.currentTargetId,phase:r.save.player.droneFleet.controller.phase,key:r.save.player.droneFleet.controller.targetNodeKey,ore:r.save.player.cargo.ore??0,modal:r.ui.isModalOpen,error:r.frameErrorAt??null};});
  assert.equal(selected.target,'vesper');assert.equal(selected.key,mining.key);assert.equal(selected.phase,'running');assert.ok(selected.time>mining.time+15&&selected.ore>mining.ore);assert.equal(selected.modal,false);assert.equal(selected.error,null,errors.join('\n'));
  await page.screenshot({path:`${out}/${name}-selected-while-mining.png`});report.push({mining,selected});
  const navigation=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,{LOCATIONS}=await import('/src/game/data.js');const c=r.radarContacts().find(c=>c.id==='vesper');if(!c)throw Error('Selected planet missing at horizon');
   return{distance:Math.hypot(...LOCATIONS.vesper.position.map((v,i)=>v-p.position[i])),range:r.playerStats().radarRange,radius:Math.hypot(c.x,c.y),selected:c.selected};
  });assert.ok(navigation.distance>navigation.range*1.45);assert.ok(Math.abs(navigation.radius-1)<1e-6&&navigation.selected);report.push({navigation});
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,T=await import('/vendor/three.module.min.js'),{LOCATIONS}=await import('/src/game/data.js');for(let i=0;i<300&&!Object.values(p.droneFleet.unitsById).some(u=>u.payload);i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}const direction=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...p.position)).normalize();p.rotation.splice(0,4,...new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),direction).toArray());p.angularVelocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());});
  if(name==='desktop')await page.keyboard.press('j');else await page.locator('#hyperdrive-card').tap();
  const departure=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),before=r.save.world.time;let queued=false;for(let i=0;i<400;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);queued||=!!r.pendingDroneDeparture;if(queued&&r.dronesSafelyStowed()&&!r.pendingDroneDeparture)break;}const result={queued,stowed:r.dronesSafelyStowed(),pending:!!r.pendingDroneDeparture,time:r.save.world.time-before,error:r.frameErrorAt??null};if(r.autopilot)r.disengageHyperdrive();r.ui.closeAdventure(false);return result;});
  assert.ok(departure.queued&&departure.stowed&&!departure.pending&&departure.time>0);assert.equal(departure.error,null);report.push({departure});
  // Every actual cockpit plate must hide the cue only through its transparent
  // window; a target behind the live console or opaque paint keeps its arrow.
  for(const hull of ['wayfarer','vanguard','talon','prospector','lancer','atlas','speedster','legionary','andromeda','torsas','astra']){
   await page.evaluate(async hull=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipId=hull;r.ui.setCockpitShip(hull);await Promise.all([...r.ui.warmImageRecords.values()].map(v=>v.promise));r.ui.cockpitVisibilityDirty=true;},hull);
   const result=await page.evaluate(()=>{
    const r=__VOID_PRIVATEER__.getRuntime(),u=r.ui,w=r.renderer.viewportWidth,h=r.renderer.viewportHeight,box=document.querySelector('.cockpit-screen-own').getBoundingClientRect();const p={x:box.left+box.width/2,y:box.top+box.height/2,visible:true,behind:false};
    if(!r.targetEdge(p))throw Error('Target behind console lost its arrow');let opening,paint;
    for(let y=.12;y<.65;y+=.04)for(let x=.12;x<.9;x+=.04){const sx=w*x,sy=h*y,visible=u.cockpitPointVisible(sx,sy);if(visible&&!opening)opening={x:sx,y:sy,visible:true,behind:false};if(!visible&&!paint)paint={x:sx,y:sy,visible:true,behind:false};}
    if(!opening||!paint||r.targetEdge(opening)||!r.targetEdge(paint))throw Error('Cockpit glass/paint visibility mismatch');
    if(!r.targetEdge({x:w+1,y:h/2,visible:true,behind:false}))throw Error('Arrow vanished outside viewport');
    return{hull:u.cockpitShipId,opening,paint,console:p};
   });report.push(result);
   if(['wayfarer','lancer','atlas'].includes(hull)){
    await page.evaluate(p=>{const r=__VOID_PRIVATEER__.getRuntime(),edge=r.targetEdge(p);r.ui.updateTarget({kind:'location',name:'Vesper',distance:100000,screenX:p.x,screenY:p.y,onScreen:false,edge});},result.console);
    assert.ok(await page.locator('#target-edge-pointer').isVisible());await page.screenshot({path:`${out}/${name}-${hull}-occluded-arrow.png`});
   }
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-report.json`,JSON.stringify(report,null,2));console.log(name,'working miner radar selection, persistent planet bearing and all 11 cockpit plates passed');
 }finally{await browser.close();}
}
