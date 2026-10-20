import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const out='output/tutorial-survey';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const press=locator=>name==='desktop'?locator.click():locator.tap();
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 let page;const errors=[],report=[];
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,language:'de'}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='survey-graveyard';q.flags.surveyIndex=0;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');await r.launch();cancelAnimationFrame(r.frameId);
   window.surveyT=await import('/vendor/three.module.min.js');window.surveyData=await import('/src/game/data.js');window.survey={
    tick(seconds){const axes={pitch:0,yaw:0,roll:0,throttleDelta:0};for(let i=0;i<Math.ceil(seconds*60)&&!r.ui.isModalOpen;i++){r.updateSimulation(1/60,axes);}this.frame();},
    frame(){r.lastFrame=performance.now()-20;r.frame(performance.now());cancelAnimationFrame(r.frameId);r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();},
    aim(position,target){p.position.splice(0,3,...position);p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;const dir=new surveyT.Vector3(...target).sub(new surveyT.Vector3(...position)).normalize();p.rotation.splice(0,4,...new surveyT.Quaternion().setFromUnitVectors(new surveyT.Vector3(0,0,-1),dir).toArray());r.resetPlayerInterpolation(true);r.updateActiveInstance(true);},
   };
   r.ships=[];const m=r.ensureTutorialFieldTarget();survey.aim(m.position.map((v,i)=>v+(i===2?500:0)),m.position);await r.renderer.ensureGraveyardModels();survey.frame();
  });
  await page.screenshot({path:`${out}/${name}-survey-star.png`});
  const star=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),m=r.renderer.missionMarker,b=r.buildHudModel();return{type:m.children[0].geometry.type,visible:m.visible,readout:b.target.readout,step:r.tutorialSummary().stepId};});
  assert.equal(star.type,'ShapeGeometry');assert.ok(star.visible);assert.doesNotMatch(star.readout,/SLOW|LANGSAM/);report.push(star);
  const visit=async expected=>{
   const result=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,m=r.tutorialFieldTarget();r.tutorialSurveyTrack=undefined;const direction=new surveyT.Vector3(...p.position).sub(new surveyT.Vector3(...m.position)).normalize(),near=new surveyT.Vector3(...m.position).addScaledVector(direction,79);survey.aim(near.toArray(),m.position);p.velocity.splice(0,3,...direction.multiplyScalar(-180).toArray());survey.tick(.1);return{step:r.tutorialSummary().stepId,index:r.save.quests.find(q=>q.id==='the-spare-key').flags.surveyIndex,error:r.frameErrorAt??null};});assert.equal(result.step,expected);assert.equal(result.error,null);return result;
  };
  await visit('survey-graveyard');
  for(const index of [1,2,3,4]){
   const setup=await page.evaluate(()=>{
    const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,m=r.ensureTutorialFieldTarget(),end=new surveyT.Vector3(...m.position),base=new surveyT.Vector3(...p.position),obstacles=r.activeFieldObstacles();let chosen;
    // Keep real collision/LOS checks: move a short distance out from behind a
    // wreck if its hull blocks the next leg rather than jumping through it.
    for(const radius of [0,200,400]){for(let j=0;j<48;j++){
     const y=1-2*(j+.5)/48,a=j*2.39996,from=new surveyT.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)).multiplyScalar(radius).add(base),drop=from.clone().sub(end).normalize().multiplyScalar(508).add(end);
     p.rotation.splice(0,4,...new surveyT.Quaternion().setFromUnitVectors(new surveyT.Vector3(0,0,-1),end.clone().sub(from).normalize()).toArray());if(r.tutorialHidingPositionClear(from,obstacles)&&r.tutorialHidingPositionClear(drop,obstacles)&&!r.lineBlocked(from,drop)){chosen=from;break;}
    }if(chosen)break;}
    if(!chosen)throw Error('No clear departure vector');survey.aim(chosen.toArray(),m.position);survey.frame();return{index:r.save.quests.find(q=>q.id==='the-spare-key').flags.surveyIndex,distance:chosen.distanceTo(end),block:r.hyperdriveBlockReason(),nav:p.navTargetId};
   });assert.equal(setup.index,index);assert.ok(setup.distance>2000);assert.equal(setup.block,null);
   if(name==='desktop')await page.keyboard.press('j');else await page.locator('#hyperdrive-card').tap();
   const jump=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();survey.frame();if(!r.autopilot)throw Error(`Jump refused: ${r.hyperdriveStatus}`);const marker=r.tutorialFieldTarget();survey.tick(8);return{distance:Math.hypot(...r.save.player.position.map((v,i)=>v-marker.position[i])),autopilot:r.autopilot,nav:r.save.player.navTargetId,index:r.save.quests.find(q=>q.id==='the-spare-key').flags.surveyIndex,error:r.frameErrorAt??null,status:r.hyperdriveStatus,death:r.deathTimer,events:r.ui.recentEvents.slice(-3).map(e=>e.message)};});
   assert.equal(jump.autopilot,false);assert.ok(jump.distance>=490&&jump.distance<550,JSON.stringify(jump));assert.equal(jump.index,index);assert.equal(jump.nav,'mourning-line');assert.equal(jump.error,null);report.push({setup,jump});console.log(name,'jump',index,jump.distance);
   await visit(index===2?'rescue-paul':index===4?'carrier-wait':index<2?'survey-graveyard':'survey-carrier');
   if(index===2){
    await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(const enemy of r.ships.filter(s=>s.tutorialEncounter==='rescue'))r.damageShip(enemy,100000,'player',enemy.position);r.updateTutorialCampaignRuntime();survey.frame();});
    while(await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().isVisible())await press(page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last());
    await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.refreshStoryLine();if(r.tutorialSummary().stepId!=='survey-carrier')throw Error('Paul rescue did not resume survey');survey.frame();});
   }
  }
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.velocity.fill(0);r.save.player.throttle=0;survey.tick(12);});
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'hide-patrol');
  const lesson=async label=>{
   let count=0;
   while(await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last().isVisible()){
    const fits=await page.locator('#adventure-panel').evaluate(e=>{const b=e.getBoundingClientRect(),buttons=[...e.querySelectorAll('.adventure-choices button')].map(x=>x.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&buttons.every(x=>x.left>=0&&x.right<=innerWidth+1&&x.bottom<=innerHeight+1)&&b.top>=0;});assert.ok(fits,`${name}: ${label} clips`);
    await page.screenshot({path:`${out}/${name}-${label}-${count}.png`});await press(page.locator('#adventure-panel [data-ui-command="adventure-choice"]').last());assert.ok(++count<=4);
   }
   assert.equal(count,2,`${label}: expected two concise pages`);await page.evaluate(()=>{__VOID_PRIVATEER__.getRuntime().refreshStoryLine();survey.frame();});
  };
  await lesson('paul-hide');
  const toggle=async()=>{
   if(name==='desktop'){await page.keyboard.press('b');await page.evaluate(()=>survey.frame());}
   else{await page.locator('.cockpit-screen-own .screen-bars').tap();await press(page.locator('[data-ship-section="flight"]'));await press(page.locator('[data-ui-command="transponder-toggle"]'));await press(page.locator('[data-ui-command="close-ship"]'));await page.evaluate(()=>survey.frame());}
  };
  await toggle();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder),false);
  const hiding=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,goal=r.ensureTutorialHidePosition();if(!goal)throw Error('No cover position');survey.aim(goal,r.tutorialFieldTarget().position.map((v,i)=>v+(i===2?-100:0)));p.velocity.fill(0);p.throttle=0;r.playerEmissionHeat=0;r.utilityActive=false;survey.tick(1.1);const q=r.save.quests.find(q=>q.id==='the-spare-key');return{hidden:q.flags.hiddenSince!==undefined,clear:r.tutorialHidingPositionClear(new surveyT.Vector3(...goal)),context:r.tutorialMusicContext(),audio:r.audio.currentContext};});
  assert.ok(hiding.hidden&&hiding.clear);assert.equal(hiding.context,'stealth');assert.equal(hiding.audio,'stealth');report.push(hiding);await page.screenshot({path:`${out}/${name}-hidden.png`});
  await page.evaluate(()=>survey.tick(20.5));assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().stepId),'return-helix');await lesson('paul-clear');
  await toggle();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.transponder),true);
  const ending=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key');return{step:q.stepId,chatter:[q.flags.hideRemark,q.flags.hideMemory,q.flags.hideDebt],context:r.tutorialMusicContext()??null,error:r.frameErrorAt??null};});assert.ok(ending.chatter.filter(Boolean).length>=2,'Paul should talk while the patrol passes; remaining lines stop once it clears');assert.equal(ending.error,null);assert.equal(ending.context,null);report.push(ending);assert.deepEqual(errors,[]);
  await writeFile(`${out}/${name}-report.json`,JSON.stringify(report,null,2));console.log(name,'survey jumps, fast visits, rescue, carrier stealth and transponder controls passed');
 }catch(e){if(page)await page.screenshot({path:`${out}/${name}-failure.png`});await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors,report},null,2));throw e;}finally{await browser.close();}
}
