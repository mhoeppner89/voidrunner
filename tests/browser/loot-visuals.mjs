import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/loot-visuals',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'}),errors=[];page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Frame error'))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gx`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const overview=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);await r.launch();cancelAnimationFrame(r.frameId);
   const {createEquipmentRecord}=await import('/src/game/equipmentInventory.js'),{combatWreckNode}=await import('/src/game/careerLoot.js');
   const p=r.save.player;p.position.splice(0,3,0,100000,0);p.velocity.fill(0);p.angularVelocity.fill(0);p.rotation.splice(0,4,0,0,0,1);p.throttle=0;p.mode='combat';r.autopilot=false;r.ships=[];r.clearTarget();r.updateActiveInstance(true);r.resetPlayerInterpolation(true);r.ui.clearPilotLine();
   r.save.world.combatWrecks={};window.lootCases=['common','uncommon','rare','named'].map((rarity,i)=>{
    const item=createEquipmentRecord('pulse-cannon',{tier:1,rarity,affixes:rarity==='uncommon'?['efficient']:rarity==='rare'?['efficient','precise']:[]});
    const items=[item];if(rarity==='rare')items.push(createEquipmentRecord('pulse-cannon',{rarity:'uncommon',affixes:['efficient']}),createEquipmentRecord('pulse-cannon'));
    const w={id:`wreck-visual-${rarity}`,name:`${rarity} loot`,position:[(i-1.5)*54,100008,-210],velocity:[0,0,0],radius:3,systemId:p.systemId,contents:items.map(item=>({id:item.id,kind:'equipment',item})),scanned:false};
    r.save.world.combatWrecks[w.id]=w;const node=combatWreckNode(w);r.wreckNodes.push(node);r.renderer.addCombatLootNode(node);return{rarity,id:w.id,item:item.id};
   });r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.scene.updateMatrixWorld(true);
   return lootCases.map(c=>{const root=r.renderer.combatLootMeshes.get(c.id),beacon=root.userData.lootBeacon,pos=beacon.getWorldPosition(new r.renderer.camera.position.constructor());const point=r.renderer.projectToScreen(pos);const rect=r.renderer.canvas.getBoundingClientRect();const hit=r.renderer.pickTarget(point.x+rect.x,point.y+rect.y);return{rarity:c.rarity,colour:root.userData.lootFace.material.color.getHexString(),visible:root.visible&&beacon.visible,point,hit,depthTest:root.userData.lootFace.material.depthTest};});
  });assert.deepEqual(overview.map(x=>x.colour),['f1f4f7','72df95','79b8ff','e5bc61']);assert.ok(overview.every(x=>x.visible&&x.point.visible&&x.depthTest));for(const c of overview)assert.equal(c.hit?.id,`wreck-visual-${c.rarity}`);
  const stationary=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),nodes=lootCases.map(c=>r.wreckNodes.find(n=>n.id===c.id));
   const before=nodes.map(n=>[...n.position]),crate=r.spawnPickup('ore',[180,100020,-260],'combat');
   const read=()=>Array.from(r.pickupStore.pos.subarray(crate.slot*3,crate.slot*3+3)),cargoBefore=read();
   r.utilityActive=false;for(let i=0;i<600;i++)r.updatePickups(1/60);
   r.syncRender(0,performance.now());r.renderer.scene.updateMatrixWorld(true);
   return{before,after:nodes.map(n=>[...n.position]),rendered:nodes.map(n=>r.renderer.combatLootMeshes.get(n.id).position.toArray()),cargoBefore,cargoAfter:read()};
  });assert.deepEqual(stationary.after,stationary.before);assert.deepEqual(stationary.rendered,stationary.before);assert.deepEqual(stationary.cargoAfter,stationary.cargoBefore);
  await page.screenshot({path:`${out}/${name}-all-rarities.png`});
  const downgraded=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,c=lootCases[2],w=r.save.world.combatWrecks[c.id],node=r.wreckNodes.find(n=>n.id===c.id);p.position.splice(0,3,w.position[0],w.position[1],w.position[2]+2);r.resetPlayerInterpolation(true);r.selectTarget('wreck',c.id);r.autoScanTarget();
   const results=[];for(const rarity of ['rare','uncommon']){const item=w.contents.find(e=>e.item?.rarity===rarity);const result=r.inventoryCommand('recover',{wreckId:w.id,id:item.id});if(!result.ok)throw Error(result.code);r.syncRender(0,performance.now());const root=r.renderer.combatLootMeshes.get(c.id);results.push({rarity:node.lootRarity,rendered:root.userData.lootRarity,colour:root.userData.lootFace.material.color.getHexString()});}
   r.ui.updateHud(r.buildHudModel());return results;
  });assert.deepEqual(downgraded.map(x=>x.rarity),['uncommon','common']);assert.deepEqual(downgraded.map(x=>x.colour),['72df95','f1f4f7']);await page.screenshot({path:`${out}/${name}-remaining-common.png`});
  const cleanup=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),c=lootCases[2],w=r.save.world.combatWrecks[c.id],entry=w.contents[0];if(!r.inventoryCommand('recover',{wreckId:w.id,id:entry.id}).ok)throw Error('Final recovery failed');r.renderer.render();
   const before=r.renderer.renderer.info.memory.geometries,resources=r.renderer.combatLootResources;
   for(let i=0;i<40;i++){const n={id:`temp-loot-${i}`,position:[0,100000,-50],radius:3,remaining:1,systemId:r.save.player.systemId,lootRarity:'rare'};r.renderer.addCombatLootNode(n);r.renderer.render();r.renderer.removeCombatLootNode(n.id);}
   r.renderer.render();const after=r.renderer.renderer.info.memory.geometries;
   return{removed:!r.renderer.combatLootMeshes.has(c.id)&&!r.save.world.combatWrecks[c.id],before,after,shared:resources===r.renderer.combatLootResources};
  });assert.ok(cleanup.removed&&cleanup.shared);assert.ok(cleanup.after<=cleanup.before,'temporary drops leaked geometry');assert.deepEqual(errors,[]);
  report.push({name,overview,stationary,downgraded,cleanup,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'stationary drops, rarity visuals, world picking, recovery and resource reuse passed');
 }finally{await browser.close();}
}
