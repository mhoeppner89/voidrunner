// Reproduce a post-mining return jump with steering still held at engagement.
import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4212',out='output/tutorial-return-hyperdrive';await mkdir(out,{recursive:true});
for(const [name,device]of [['desktop',{viewport:{width:1280,height:800}}],['android',devices['Pixel 7 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});let page;
 try{
  page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Frame error'))errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  const setup=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.ui.hideStory();
   q.stepId='mining-contract';q.flags.miningExplained=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');r.ensureTutorialMiningContract();r.acceptMission(r.save.world.offers.vesper.find(m=>m.id==='tutorial-vesper-mining').id);
   await r.launch();cancelAnimationFrame(r.frameId);const T=await import('/vendor/three.module.min.js'),{LOCATIONS}=await import('/src/game/data.js');
   window.returnCheck={
    step(){r.lastFrame=performance.now()-100;r.frame(performance.now());cancelAnimationFrame(r.frameId);if(r.frameErrorAt)throw Error('Flight frame failed');},
    aim(){const dir=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...p.position)).normalize();p.rotation.splice(0,4,...new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),dir).toArray());p.angularVelocity.fill(0);},
    finish(){let n=0;while(r.ui.adventure&&n++<30){const choices=r.ui.adventureNode().choices;r.ui.advanceAdventure(choices?Math.max(0,choices.findIndex(c=>c.complete)):0);}r.refreshStoryLine();},
   };
   // Enter through the real tutorial handoff, intercept, surrender and capture.
   p.position.splice(0,3,...q.flags.miningEntryPosition);p.velocity.fill(0);p.throttle=.3;r.updateActiveInstance(true);p.cargo.ore=6;
   r.handleTutorialEvent('extracted',{source:'mining',nodeId:q.flags.oreTargetId,instanceId:'shardbelt',amount:6});r.selectTarget('location','vesper','map');returnCheck.aim();r.toggleHyperdrive();
   for(let i=0;i<300&&q.stepId==='return-mining';i++)returnCheck.step();for(let i=0;i<150&&q.stepId==='raider-standoff';i++)returnCheck.step();returnCheck.finish();
   const enemy=r.ships.find(s=>s.tutorialEncounter==='mining'&&s.hull>0);enemy.shield=0;r.damageShip(enemy,100000,'player',enemy.position);returnCheck.finish();p.position.splice(0,3,enemy.position[0]+120,enemy.position[1],enemy.position[2]);for(let i=0;i<130&&!enemy.captured;i++)r.updateBoarding(1/60);
   if(!enemy.captured||q.stepId!=='land-mining')throw Error('Tutorial capture failed');returnCheck.finish();
   const wreck=r.wreckNodes.find(n=>n.id===q.flags.tutorialLootWreckId);p.position.splice(0,3,...wreck.position);p.position[1]+=wreck.radius+25;for(let i=0;i<40;i++)returnCheck.step();
   r.selectTarget('location','vesper','map');returnCheck.aim();if(r.hyperdriveBlockReason())throw Error(JSON.stringify(r.hyperdriveBlockReason()));r.ui.updateHud(r.buildHudModel());r.renderer.render();
   return {step:q.stepId,drones:Object.keys(p.droneFleet.unitsById),throttle:p.throttle};
  });
  let cdp,touches;
  const holdSteering=async()=>{
   if(name==='desktop'){await page.keyboard.down('d');return;}
   const b=await page.locator('[data-touch-stick]').boundingBox();touches=[{x:b.x+b.width*.5,y:b.y+b.height*.5,id:1}];
   cdp??=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
   touches[0].x+=b.width*.35;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches});
  };
  const releaseSteering=async()=>{if(name==='desktop')await page.keyboard.up('d');else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  const pressDrive=async held=>{
   if(name==='desktop'){await page.locator('#hyperdrive-card').click();return;}
   const b=await page.locator('#hyperdrive-card').boundingBox(),button={x:b.x+b.width*.5,y:b.y+b.height*.5,id:2};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...(held?touches:[]),button]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:held?touches:[]});
  };
  await holdSteering();await pressDrive(true);
  const spool=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),before=[...r.save.player.position];for(let i=0;i<15;i++)returnCheck.step();return {active:r.autopilot,fx:r.hyperdriveFx,before,position:[...r.save.player.position],status:r.hyperdriveStatus};});
  assert.equal(spool.active,true,JSON.stringify(spool));assert.equal(spool.fx,'spooling');assert.deepEqual(spool.position,spool.before);await page.screenshot({path:`${out}/${name}-spooling.png`});
  await releaseSteering();
  assert.equal(await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();for(let i=0;i<9;i++)returnCheck.step();return r.autopilot&&r.hyperdriveFx==='active';}),true,'releasing the old alignment gesture preserves the jump');
  await holdSteering();
  assert.equal(await page.evaluate(()=>{returnCheck.step();return __VOID_PRIVATEER__.getRuntime().autopilot;}),false,'a fresh steering gesture still disengages');await releaseSteering();
  await page.evaluate(()=>returnCheck.aim());await pressDrive(false);
  const arrival=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();returnCheck.step();if(!r.autopilot)throw Error('Neutral re-engagement failed');for(let i=0;i<300&&r.autopilot;i++)returnCheck.step();return {active:r.autopilot,status:r.hyperdriveStatus,drones:Object.entries(r.save.player.droneFleet.unitsById).map(([id,u])=>({id,state:u.state})),frameError:r.frameErrorAt};});
  assert.equal(arrival.active,false);assert.match(arrival.status,/ANKUNFT|ARRIVAL/);assert.deepEqual(arrival.drones.map(d=>d.id),setup.drones);assert.ok(arrival.drones.every(d=>d.state==='stowed'));assert.equal(arrival.frameError,undefined);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${name}-arrival.png`});await writeFile(`${out}/${name}.json`,JSON.stringify({setup,spool,arrival,errors},null,2));console.log(name,'post-fight held steering, warm-up, release, fresh override and return arrival passed');
 }catch(error){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
}
