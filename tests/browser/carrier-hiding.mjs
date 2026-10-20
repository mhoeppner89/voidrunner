import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);
const out='output/carrier-hiding';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 let page;const errors=[];
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const contact=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key'),T=await import('/vendor/three.module.min.js');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='carrier-wait';q.flags.surveyIndex=4;q.flags['briefingRead-paul-hide']=q.flags['briefingRead-paul-clear']=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');await r.launch();cancelAnimationFrame(r.frameId);r.ships=[];
   const marker=r.tutorialFieldTarget();p.position.splice(0,3,...marker.position);p.velocity.fill(0);p.throttle=0;r.updateActiveInstance(true);await r.renderer.ensureGraveyardModels();r.handleTutorialEvent('patrol-arrived');
   const hiding=r.ensureTutorialHidePosition();if(!hiding)throw Error('Carrier cover missing');p.position.splice(0,3,...hiding);p.velocity.fill(0);p.throttle=0;p.transponder=false;r.playerEmissionHeat=0;r.utilityActive=false;r.resetPlayerInterpolation(true);
   const paul=r.ships.find(s=>s.storyPersonId==='paul'),goal=r.tutorialFormationGoal().clone().addScaledVector(r.tmpTutorialRight,-96);let collision;
   for(const o of r.activeFieldObstacles().filter(o=>o.modelWreckId==='concord-carrier-wreck')){
    // Place Paul's visible hull on a real carrier triangle, then use the
    // ordinary collision resolver that cleared the user's travel destination.
    const v=o.meshVerts,ix=o.meshIndices;if(!v||!ix?.length)continue;const center=new T.Vector3();for(let i=0;i<3;i++)center.add(new T.Vector3(v[ix[i]*3],v[ix[i]*3+1],v[ix[i]*3+2]));center.multiplyScalar(1/3).applyQuaternion(new T.Quaternion(o.box.qx,o.box.qy,o.box.qz,o.box.qw)).add(new T.Vector3(o.x,o.y,o.z));
    paul.position.splice(0,3,...center.toArray());paul.velocity.splice(0,3,25,0,0);paul.destination=goal.toArray();r.resolveNpcCollisions(paul);if(!paul.destination){collision=o.id;break;}
   }
   if(!collision)throw Error('No real carrier contact cleared the route');if(paul.poweredDown)throw Error('Fixture disabled Paul before formation recovery');
   paul.position.splice(0,3,goal.x+80,goal.y,goal.z);paul.velocity.fill(0);if(paul.destination!==undefined)throw Error('Regression precondition lost');
   window.carrierProbe={start:r.save.world.time,samples:[],resets:0};const sim=r.updateSimulation;r.updateSimulation=function(...args){const t=performance.now();try{return sim.apply(this,args);}finally{carrierProbe.samples.push(performance.now()-t);}};
   r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);carrierProbe.buffer=paul.tutorialFormationDestination;return{collision,recovered:carrierProbe.buffer?.length===3,error:r.frameErrorAt??null};
  });assert.ok(contact.recovered);assert.equal(contact.error,null);console.log(name,'real carrier contact recovered',contact.collision);
  for(let batch=0;batch<10;batch++)await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),paul=r.ships.find(s=>s.storyPersonId==='paul');
   // A long stationary wait and repeated contacts exercise the medium-range
   // path; the old error never appeared in a jump that teleported the wing.
   for(let frame=0;frame<48;frame++){
    if(frame%12===0){const goal=r.tutorialFormationGoal().clone().addScaledVector(r.tmpTutorialRight,-96);paul.position.splice(0,3,goal.x+80,goal.y,goal.z);paul.velocity.fill(0);r.clearSearch(paul);carrierProbe.resets++;}
    r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);
   }
  });
  const result=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),a=[...carrierProbe.samples].sort((a,b)=>a-b);return{step:r.tutorialSummary().stepId,elapsed:r.save.world.time-carrierProbe.start,resets:carrierProbe.resets,bufferStable:carrierProbe.buffer===r.ships.find(s=>s.storyPersonId==='paul').tutorialFormationDestination,steps:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1),error:r.frameErrorAt??null};});
  assert.equal(result.error,null);assert.ok(result.bufferStable);assert.ok(result.elapsed>35&&result.steps>2000,JSON.stringify(result));assert.equal(result.step,'return-helix');assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${name}-after-wait.png`});
  if(name==='desktop')await page.locator('.cockpit-screen-own .screen-bars').click();else await page.locator('.cockpit-screen-own .screen-bars').tap();await page.locator('.ship-console').waitFor();await page.screenshot({path:`${out}/${name}-menu.png`});
  if(name==='desktop')await page.locator('[data-ui-command="close-ship"]').click();else await page.locator('[data-ui-command="close-ship"]').tap();
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<20;i++){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);}});assert.deepEqual(errors,[]);
  await writeFile(`${out}/${name}-report.json`,JSON.stringify({contact,result,errors},null,2));console.log(name,JSON.stringify(result));
 }catch(e){if(page)await page.screenshot({path:`${out}/${name}-failure.png`});await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(e),errors},null,2));throw e;}finally{await browser.close();}
}
