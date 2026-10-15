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
  await page.goto(`${base}/game.html?revision=0.8.2gp`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  const setup=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='mining-contract';q.flags.miningExplained=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');r.ensureTutorialMiningContract();const offer=r.save.world.offers.vesper.find(m=>m.id==='tutorial-vesper-mining');r.acceptMission(offer.id);await r.launch();cancelAnimationFrame(r.frameId);
   const {asteroidCollisionRadius}=await import('/src/game/worldData.js'),{LOCATIONS}=await import('/src/game/data.js'),T=await import('/vendor/three.module.min.js');const node=r.asteroids.find(n=>n.id===q.flags.oreTargetId);node.remaining=Math.max(node.remaining,20);
   const away=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...node.position)).normalize(),position=new T.Vector3(...node.position).addScaledVector(away,asteroidCollisionRadius(node)+40);r.ensurePlayerEntryClearance(position,'shardbelt',away);p.position.splice(0,3,...position.toArray());p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;r.updateActiveInstance(true);r.selectTarget('asteroid',node.id);r.scanTarget();r.resetPlayerInterpolation(true);const deployed=r.toggleMiningDrones();if(!deployed.ok)throw Error('Cannot deploy '+JSON.stringify(deployed));
   return{node:node.id,quantity:offer.quantity,reward:offer.reward,range:Math.hypot(...node.position.map((v,i)=>v-q.flags.miningEntryPosition[i]))};
  });assert.equal(setup.quantity,6);assert.equal(setup.reward,3000);assert.ok(setup.range>=750&&setup.range<=1250);
  const mined=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key'),rock=q.flags.oreTargetId;let handoff;
   // Drive the complete frame loop, including HUD, interpolation, rendering and
   // event processing. A drone-only loop missed this player-facing transition.
   for(let i=0;i<600;i++){
    r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);
    if(q.stepId==='return-mining'&&!handoff){handoff={cargo:p.cargo.ore,target:p.currentTargetId,phase:p.droneFleet.controller.phase,nav:p.navTargetId};if(p.currentTargetId!==rock)throw Error('Contract completion hijacked target');}
    if(handoff&&(p.cargo.ore??0)>=8)break;
   }
   if(!handoff)throw Error('Contract never completed');if((p.cargo.ore??0)<8)throw Error('Miners stopped at the contract threshold');
   if(r.ui.isModalOpen)throw Error('Unexpected modal blocked flight');if(r.ui.tutorialHint)throw Error('Repeated travel instructions immediately after mining');
   return{handoff,cargo:p.cargo.ore,time:r.save.world.time,position:[...p.position],rotation:[...p.rotation]};
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
  report.push({name,setup,mined,departure,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,'full frame mining, continued extraction, steering, automatic recall and intercept passed');
 }finally{await browser.close();}
}
