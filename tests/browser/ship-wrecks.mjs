import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out='output/ship-wrecks',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=process.env.VR_PROFILES?await readFile(`${out}/report.json`,'utf8').then(JSON.parse).catch(()=>[]):[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});const errors=[];let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gy`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);const p=r.save.player;p.position.splice(0,3,0,100000,0);p.velocity.fill(0);p.throttle=0;p.rotation.splice(0,4,0,0,0,1);r.ships=[];r.autopilot=false;r.resetPlayerInterpolation(true);});
  const ids=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().observerCatalog().map(t=>t.id)),hulls=name==='desktop'?ids:['andromeda','frigate'];const checks=[];
  const spawn=async id=>{
   assert.ok(ids.includes(id),'Unknown test hull '+id);
   await page.evaluate(async id=>{const r=__VOID_PRIVATEER__.getRuntime(),type=r.observerShipType(id);window.wreckShip=type.capitalVariant?r.spawnCapitalShip(type.capitalVariant,[0,100000,-90]):r.spawnShip(type.role,[0,100000,-90],undefined,undefined,{tier:'veteran'},{hullId:type.hullId});const s=wreckShip;s.rotation.splice(0,4,0,0,0,1);s.velocity.splice(0,3,6,-1,-2);r.renderer.ensureGlbShipModel(s.variant);await r.renderer.glbShipLoading.get(s.variant);r.syncRender(0,performance.now());},id);
   await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r.renderer.shipMeshes.get(wreckShip.id)?.userData.glb&&r.renderer.wreckFactory?.jobs.size===0;});
  };
  for(const id of hulls){
   await spawn(id);
   const state=await page.evaluate(()=>{
    const r=__VOID_PRIVATEER__.getRuntime(),renderer=r.renderer,s=wreckShip,source=renderer.shipMeshes.get(s.id),factory=renderer.wreckFactory,cache=factory.cache.size,textureIds=[];source.traverse(m=>{for(const mat of Array.isArray(m.material)?m.material:[m.material])if(mat?.map)textureIds.push(mat.map.id);});
    const start=performance.now();r.destroyShip(s,'player');const spawnMs=performance.now()-start,e=renderer.effects.findLast(e=>e.combatWreck);if(!e)throw Error('No model-based wreck');
    const node=r.wreckNodes.findLast(n=>n.combatLoot),loot=node?[...node.position]:null;
    const positions=e.sections.map(p=>p.group.position.toArray());renderer.updateEffects(0);renderer.updateEffects(1);renderer.updateEffects(1);const spins=e.sections.map(p=>p.group.quaternion.toArray());
    r.ships=[];r.syncRender(0,performance.now());const centre=e.object.position;
    const size=e.sections.reduce((n,p)=>Math.max(n,p.origin.length()+p.velocity.length()*2),1),camera=renderer.camera;camera.position.set(centre.x-size*1.25,centre.y+size*.8,centre.z-size*1.7);camera.lookAt(centre);camera.updateMatrixWorld();renderer.render();
    const result={variant:s.variant,sections:e.sections.length,spawnMs,cacheBefore:cache,cacheAfter:factory.cache.size,positions,after:e.sections.map(p=>p.group.position.toArray()),spins,lootBefore:loot,lootAfter:node?[...node.position]:null,memory:{...renderer.renderer.info.memory},sharedMaps:e.sections.flatMap(p=>p.group.children.flatMap(m=>(Array.isArray(m.material)?m.material:[m.material]).map(m=>m.map?.id))).filter(id=>textureIds.includes(id)).length};
    return result;
   });
   assert.ok(state.sections>=5&&state.sections<=9,id);assert.equal(state.cacheAfter,state.cacheBefore,id+' missed prewarm cache');assert.notDeepEqual(state.after,state.positions,id+' did not separate');assert.ok(state.spins.some(q=>Math.abs(q[3])<.9999));assert.deepEqual(state.lootAfter,state.lootBefore);assert.ok(state.sharedMaps>0,id+' duplicated hull textures');
   if(name!=='desktop'||['andromeda','astra','atlas','carrier','scrapper'].includes(id))await page.screenshot({path:`${out}/${name}-${id}.png`});
   checks.push(state);await writeFile(`${out}/${name}-hulls.json`,JSON.stringify(checks,null,2));await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(const e of r.renderer.effects){e.life=0;e.presented=true;}r.renderer.updateEffects(0);for(let i=r.wreckNodes.length-1;i>=0;i--)if(r.wreckNodes[i].combatLoot){r.renderer.removeCombatLootNode(r.wreckNodes[i].id);delete r.save.world.combatWrecks[r.wreckNodes[i].id];r.wreckNodes.splice(i,1);}r.renderer.render();});console.log(name,id,'breakup passed');
  }
  // Repeated kills of a warmed hull must not retain owned geometry/textures.
  await spawn('andromeda');const stress=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),renderer=r.renderer,s=wreckShip;renderer.render();const before={...renderer.renderer.info.memory};let max=0;
   for(let i=0;i<16;i++){renderer.spawnShipWreck(s,s.variant,1);renderer.updateEffects(0);renderer.updateEffects(.1);renderer.render();max=Math.max(max,renderer.effects.filter(e=>e.combatWreck&&e.life>0).length);for(const e of renderer.effects){e.life=0;e.presented=true;}renderer.updateEffects(0);renderer.render();}
   for(let i=0;i<8;i++)renderer.spawnShipWreck(s,s.variant,1);renderer.updateEffects(0);renderer.updateEffects(0);const bounded=renderer.effects.filter(e=>e.combatWreck&&e.life>0).length;for(const e of renderer.effects){e.life=0;e.presented=true;}renderer.updateEffects(0);renderer.render();return{before,after:{...renderer.renderer.info.memory},max,bounded,limit:renderer.touchDevice||renderer.isIOS||renderer.viewportWidth<1000||renderer.qualityMode==='low'?3:6};
  });assert.equal(stress.after.geometries,stress.before.geometries);assert.equal(stress.after.textures,stress.before.textures);assert.ok(stress.bounded<=stress.limit);
  // Real mode transitions tear down the factory and its shared resources.
  const modes=[];for(const mode of ['arena-run','spectator']){
   await page.evaluate(async mode=>{if(mode==='arena-run'){await __VOID_PRIVATEER__.startArenaRun(false);const r=__VOID_PRIVATEER__.getRuntime();r.arenaRunAction('hull','wayfarer');for(let i=0;i<2;i++){r.arenaRunAction('reward',r.save.arenaRun.offers.find(x=>x!=='repair')??r.save.arenaRun.offers[0]);r.arenaRunAction('accept');}r.arenaRunAction('launch');for(let i=0;i<360&&!r.ships.some(s=>s.hull>0);i++)r.updateSimulation(1/60,{});}else{await __VOID_PRIVATEER__.startObserver('open');const r=__VOID_PRIVATEER__.getRuntime();r.observerSelectShip('scrapper');r.observerPreset('1v1');r.observerStartBattle();}const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);window.wreckShip=r.ships.find(s=>s.hull>0);r.renderer.ensureGlbShipModel(wreckShip.variant);await r.renderer.glbShipLoading.get(wreckShip.variant);r.syncRender(0,performance.now());},mode);
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().renderer.wreckFactory?.jobs.size===0);
   modes.push(await page.evaluate(mode=>{const r=__VOID_PRIVATEER__.getRuntime();r.destroyShip(wreckShip,'player');r.renderer.updateEffects(0);r.renderer.updateEffects(.5);r.syncRender(0,performance.now());r.renderer.render();return{mode,pieces:r.renderer.effects.findLast(e=>e.combatWreck)?.sections.length};},mode));assert.ok(modes.at(-1).pieces>=5);
  }
  assert.deepEqual(errors,[]);const old=report.findIndex(r=>r.name===name);if(old>=0)report.splice(old,1);report.push({name,checks,stress,modes,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'retention, resources and all mode transitions passed');
 }catch(e){await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors},null,2));if(page)await page.screenshot({path:`${out}/${name}-failure.png`});throw e;}finally{await browser.close();}
}
