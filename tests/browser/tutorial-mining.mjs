import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/tutorial-mining',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1280,height:800}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Frame error'))errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2gu`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  const setup=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='mining-contract';q.flags.miningExplained=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');r.ensureTutorialMiningContract();const offer=r.save.world.offers.vesper.find(m=>m.id==='tutorial-vesper-mining');r.acceptMission(offer.id);await r.launch();cancelAnimationFrame(r.frameId);
   const {asteroidCollisionRadius}=await import('/src/game/worldData.js'),{LOCATIONS}=await import('/src/game/data.js'),T=await import('/vendor/three.module.min.js');const node=r.asteroids.find(n=>n.id===q.flags.oreTargetId);node.remaining=Math.max(node.remaining,20);
   const away=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...node.position)).normalize(),position=new T.Vector3(...node.position).addScaledVector(away,asteroidCollisionRadius(node)+40);r.ensurePlayerEntryClearance(position,'shardbelt',away);p.position.splice(0,3,...position.toArray());p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;r.updateActiveInstance(true);r.selectTarget('asteroid',node.id);r.scanTarget();r.resetPlayerInterpolation(true);const deployed=r.toggleMiningDrones();if(!deployed.ok)throw Error('Cannot deploy '+JSON.stringify(deployed));
   return{node:node.id,quantity:offer.quantity,reward:offer.reward,range:Math.hypot(...node.position.map((v,i)=>v-q.flags.miningEntryPosition[i]))};
  });assert.equal(setup.quantity,6);assert.equal(setup.reward,3000);assert.ok(setup.range>=750&&setup.range<=1250);
  const mined=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key'),rock=q.flags.oreTargetId,minerVisuals=new Map();let handoff;
   // Drive the complete frame loop, including HUD, interpolation, rendering and
   // event processing. A drone-only loop missed this player-facing transition.
   for(let i=0;i<600;i++){
    r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);
    for(const[id,visual]of Object.entries(r.renderer.droneVisuals)){
     if(minerVisuals.has(id)&&minerVisuals.get(id)!==visual.root)throw Error('Mining delivery rebuilt a drone render graph');
     minerVisuals.set(id,visual.root);
    }
    if(q.stepId==='return-mining'&&!handoff){handoff={cargo:p.cargo.ore,target:p.currentTargetId,phase:p.droneFleet.controller.phase,nav:p.navTargetId};if(p.currentTargetId!==rock)throw Error('Contract completion hijacked target');}
    if(handoff&&(p.cargo.ore??0)>=8)break;
   }
   if(!handoff)throw Error('Contract never completed');if((p.cargo.ore??0)<8)throw Error('Miners stopped at the contract threshold');
   if(r.ui.isModalOpen)throw Error('Unexpected modal blocked flight');if(r.ui.tutorialHint)throw Error('Repeated travel instructions immediately after mining');
   if(minerVisuals.size<2)throw Error('Both miners must participate in the retention check');
   return{handoff,cargo:p.cargo.ore,time:r.save.world.time,position:[...p.position],rotation:[...p.rotation],retainedMiners:minerVisuals.size};
  });assert.equal(mined.handoff.target,setup.node);assert.equal(mined.handoff.phase,'running');assert.equal(mined.handoff.nav,'shardbelt');await page.screenshot({path:`${out}/${name}-continue-mining.png`});
  if(name==='desktop')await page.keyboard.down('w');
  await page.evaluate(async mobile=>{
   const r=__VOID_PRIVATEER__.getRuntime();
   const sensor=(beta,gamma)=>{const event=new Event('deviceorientation');Object.defineProperties(event,{beta:{value:beta},gamma:{value:gamma}});window.dispatchEvent(event);};
   if(mobile){await r.input.enableTilt(true);sensor(0,0);r.input.calibrateTilt();for(let i=0;i<8;i++)sensor(30,30);}
   for(let i=0;i<4;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(mobile){for(let i=0;i<16;i++)sensor(0,0);r.input.calibrateTilt();}
  },name!=='desktop');
  if(name==='desktop')await page.keyboard.up('w');
  const turned=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.rotation);assert.ok(turned.some((v,i)=>Math.abs(v-mined.rotation[i])>.001),'Steering stopped working after the ore threshold');
  const departure=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key'),{LOCATIONS}=await import('/src/game/data.js'),T=await import('/vendor/three.module.min.js');r.selectTarget('location','vesper','map');const direction=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...p.position)).normalize();p.rotation.splice(0,4,...new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),direction).toArray());p.angularVelocity.fill(0);r.toggleHyperdrive();const queued=!!r.pendingDroneDeparture;
   if(!queued&&!r.autopilot)throw Error('Departure neither queued nor started');
   for(let i=0;i<600&&q.stepId==='return-mining';i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(q.stepId!=='raider-standoff')throw Error('Recall or departure stuck at '+q.stepId);
   const enemy=r.ships.find(s=>s.tutorialEncounter==='mining'&&s.hull>0);const before=r.save.world.time;r.lastFrame=performance.now();r.frameId=requestAnimationFrame(r.frame);const deadline=performance.now()+10000;while(r.save.world.time-before<.3&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));cancelAnimationFrame(r.frameId);
   return{queued,step:q.stepId,clockAdvanced:r.save.world.time-before,enemy:!!enemy,heldFire:enemy?.holdFire,phase:p.droneFleet.controller.phase,cargo:p.cargo.ore,modal:r.ui.isModalOpen,hidden:document.hidden,frameErrorAt:r.frameErrorAt};
  });assert.ok(departure.clockAdvanced>.25,'The live frame loop stopped: '+JSON.stringify(departure));assert.ok(departure.enemy&&departure.heldFire);assert.equal(departure.phase,'idle');await page.screenshot({path:`${out}/${name}-return-intercept.png`});assert.deepEqual(errors,[]);
  const briefing=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime();
   for(let i=0;i<120&&!r.ui.adventure;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(r.ui.adventure?.conversationId!=='tutorial-combat')throw Error('Rin combat dialogue did not open');
   const before={time:r.save.world.time,position:[...r.save.player.position],hull:r.save.player.hull,ships:r.ships.map(s=>({id:s.id,position:[...s.position],hull:s.hull}))};
   for(let i=0;i<10;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(r.save.world.time!==before.time||r.save.player.position.some((v,i)=>v!==before.position[i])||r.save.player.hull!==before.hull)throw Error('Player/simulation advanced during combat dialogue');
   if(r.ships.some(s=>{const prev=before.ships.find(p=>p.id===s.id);return !prev||s.hull!==prev.hull||s.position.some((v,i)=>v!==prev.position[i]);}))throw Error('Combat continued behind dialogue');
   return{time:before.time,conversation:r.ui.adventure.conversationId};
  });
  let nodes=0;while(await page.locator('#adventure-panel').isVisible()){
   const speech=page.locator('.adventure-speech');assert.ok(await speech.isVisible());
   const fit=await speech.evaluate(e=>{const b=e.getBoundingClientRect(),buttons=[...document.querySelectorAll('.adventure-choices button')].map(x=>x.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&buttons.every(x=>x.top>=b.bottom-1&&x.left>=0&&x.right<=innerWidth+1&&x.bottom<=innerHeight+1);});assert.ok(fit,`${name}: combat dialogue overlaps or clips`);
   await page.screenshot({path:`${out}/${name}-combat-lesson-${nodes}.png`});
   await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().click();assert.ok(++nodes<=4);
  }
  assert.equal(nodes,3);
  const combat=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key');r.refreshStoryLine();
   if(!q.flags['briefingRead-combat']||r.ui.isModalOpen)throw Error('Combat lesson did not release flight');
   const rin=r.ships.find(s=>s.storyPersonId==='rin'),before={time:r.save.world.time,position:[...rin.position]};
   // The old test stopped at the standoff. Drive actual combat frames to catch
   // companion AI exceptions, which the RAF guard otherwise logs repeatedly.
   for(let i=0;i<60;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(r.frameErrorAt)throw Error('A flight frame failed during the first fight');
   if(r.save.world.time-before.time<4||rin.position.every((v,i)=>v===before.position[i]))throw Error('Combat did not resume');
   const enemy=r.ships.find(s=>s.tutorialEncounter==='mining'&&s.hull>0);if(!enemy)throw Error('Pirate disappeared during lesson');
   const elapsed=r.save.world.time-before.time;r.damageShip(enemy,100000,window.innerWidth<1000?rin.id:'player',enemy.position);
   if(q.stepId!=='land-mining')throw Error('First combat did not complete');
   return{elapsed,rinMoved:true,read:q.flags['briefingRead-combat'],step:q.stepId};
  });await page.screenshot({path:`${out}/${name}-combat-resumed.png`});assert.deepEqual(errors,[]);
  const loot=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key'),w=r.save.world.combatWrecks[q.flags.tutorialLootWreckId];
   if(r.ui.adventure?.conversationId!=='tutorial-loot')throw Error('Rin loot explanation did not open');
   const item=w?.contents.find(e=>e.item?.rarity==='uncommon'&&e.item?.tier===1)?.item;if(!item)throw Error('No guaranteed green tier I loot');
   const before=r.save.world.time;for(let i=0;i<5;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}
   if(before!==r.save.world.time)throw Error('Loot explanation did not pause flight');
   return{wreck:w.id,item:item.id};
  });
  let lootNodes=0,explanation='';while(await page.locator('#adventure-panel').isVisible()){
   explanation+=' '+await page.locator('.adventure-speech').innerText();
   const fits=await page.locator('.adventure-speech').evaluate(e=>{const b=e.getBoundingClientRect(),buttons=[...document.querySelectorAll('.adventure-choices button')].map(x=>x.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&buttons.every(x=>x.top>=b.bottom-1&&x.left>=0&&x.right<=innerWidth+1&&x.bottom<=innerHeight+1);});assert.ok(fits,`${name}: loot lesson clips`);
   await page.screenshot({path:`${out}/${name}-loot-lesson-${lootNodes}.png`});await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().click();assert.ok(++lootNodes<=4);
  }assert.equal(lootNodes,3);assert.match(explanation,/Technikstufe.*Seltenheit.*weiß.*grün.*blau.*unabhängig.*BERGEN/s);
  await page.evaluate(({wreck})=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,w=r.save.world.combatWrecks[wreck],node=r.wreckNodes.find(n=>n.id===wreck);r.refreshStoryLine();
   p.position.splice(0,3,w.position[0],w.position[1]+node.radius+25,w.position[2]);p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;node.velocity.fill(0);w.velocity.fill(0);r.resetPlayerInterpolation(true);r.selectTarget('wreck',wreck);r.autoScanTarget();
   if(!node.scanned)throw Error('Loot wreck did not scan automatically');r.ui.updateHud(r.buildHudModel());r.ui.showShipMenu();
  },loot);
  await page.locator('[data-ui-command="ship-section"][data-ship-section="equipment"]').click();
  const green=page.locator(`[data-inventory-id="${loot.item}"]`);assert.equal(await green.getAttribute('data-rarity'),'uncommon');assert.match(await green.innerText(),/I/);assert.equal(await green.evaluate(e=>getComputedStyle(e).getPropertyValue('--item-color').trim()),'#72df95');await page.screenshot({path:`${out}/${name}-green-loot.png`});await page.locator('[data-ui-command="close-ship"]').click();
  if(name==='desktop')await page.keyboard.down('m');else{const box=await page.locator('#touch-missile').boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();}
  await page.evaluate(({item})=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<100&&!r.save.player.inventory.items[item];i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}if(!r.save.player.inventory.items[item])throw Error('Normal salvage input did not recover the guaranteed item: '+r.utilityReadout);},loot);
  if(name==='desktop')await page.keyboard.up('m');else await page.mouse.up();
  const recovered=await page.evaluate(({item})=>{const r=__VOID_PRIVATEER__.getRuntime(),i=r.save.player.inventory.items[item];if(r.frameErrorAt)throw Error('Loot recovery raised a frame error');return{tier:i.tier,rarity:i.rarity,location:i.location.kind,lessonRead:r.save.quests.find(q=>q.id==='the-spare-key').flags['briefingRead-loot']};},loot);assert.deepEqual(recovered,{tier:1,rarity:'uncommon',location:'cargo',lessonRead:true});assert.deepEqual(errors,[]);
  report.push({name,setup,mined,departure,briefing,combat,loot,recovered,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'full frame mining, continued extraction, steering, automatic recall, paused combat/loot lessons, live combat and green tier I salvage passed');
 }finally{await browser.close();}
}
