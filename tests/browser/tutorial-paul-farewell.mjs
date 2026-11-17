import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4214',out='output/tutorial-paul-farewell';await mkdir(out,{recursive:true});
for(const [name,device]of [['desktop',{viewport:{width:1440,height:900}}],['android',devices['Pixel 7 landscape']]].filter(([n])=>(process.env.VR_PROFILES??'desktop,android').split(',').includes(n))){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  const queued=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),{setLanguage}=await import('/src/game/i18n.js'),{LOCATIONS}=await import('/src/game/data.js');setLanguage('de');r.audio.setVolumes(0,0);r.ui.closeAdventure(false);r.ui.dismissStory();r.pendingStoryConversations=[];r.pendingTutorialBriefings=new Set();r.storyLineUntil=undefined;
   const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='black-box-fight';q.flags.paulInvited=true;await r.launch();cancelAnimationFrame(r.frameId);r.ui.closeAdventure(false);r.ui.dismissStory();r.storyLineUntil=undefined;
   const p=r.save.player;p.position.splice(0,3,...LOCATIONS['mourning-line'].position);p.position[1]+=2500;p.velocity.fill(0);p.throttle=0;p.rotation.splice(0,4,0,0,0,1);r.updateActiveInstance(true);r.activeInstanceId='mourning-line';q.flags['origin-black-box']=[...p.position];r.ensureTutorialEnemy();r.ships=r.ships.filter(s=>s.tutorialCompanion||s.tutorialEnemy);
   const paul=r.ships.find(s=>s.storyPersonId==='paul'&&s.hull>0);if(!paul)throw Error('Paul missing before fight');paul.position.splice(0,3,p.position[0]-90,p.position[1]+30,p.position[2]-260);paul.rotation.splice(0,4,0,0,0,1);paul.velocity.fill(0);window.paulStart=[...paul.position];window.paulId=paul.id;
   for(const enemy of r.ships.filter(s=>s.tutorialEncounter==='black-box'&&s.hull>0))r.damageShip(enemy,100000,'player',enemy.position);
   r.flightDialogueAfter=r.save.world.time+4;r.updateTutorialCampaignRuntime();r.selectTarget('ship',paul.id);r.syncRender(0,performance.now());r.renderer.render();
   return {step:q.stepId,alive:paul.hull>0,position:[...paul.position],queued:r.pendingStoryConversations.some(c=>c.conversationId==='tutorial-paul-farewell')};
  });assert.equal(queued.step,'deliver-black-box');assert.equal(queued.alive,true);assert.equal(queued.queued,true);assert.deepEqual(queued.position,await page.evaluate(()=>paulStart));
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.world.time+=4.1;r.refreshStoryLine();});
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.adventure?.conversationId==='tutorial-paul-farewell');
  assert.match(await page.locator('#adventure-panel').innerText(),/Du hast den Rekorder.*Bring ihn zu Mara/s);await page.screenshot({path:`${out}/${name}-goodbye.png`});
  await page.locator('#adventure-panel [data-ui-command="adventure-choice"]').click();
  const departure=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key'),paul=r.ships.find(s=>s.id===paulId);r.refreshStoryLine();const initial=[...paul.position];
   let streaks=0;const spawn=r.renderer.spawnHyperdriveStreak.bind(r.renderer);r.renderer.spawnHyperdriveStreak=(...args)=>{streaks++;return spawn(...args);};
   for(let n=0;n<120;n++){r.save.world.time+=1/60;r.updateTutorialCompanion(paul,1/60);}
   const moved=Math.hypot(...paul.position.map((v,i)=>v-initial[i])),aliveDuringDeparture=paul.hull>0;
   for(let n=0;n<250;n++){r.save.world.time+=1/60;r.updateTutorialCompanion(paul,1/60);if(paul.hull<0)break;}
   r.cleanupEntities();r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();
   return {read:q.flags['briefingRead-paul-farewell'],departed:q.flags.paulDeparted,moved,aliveDuringDeparture,streaks,paulPresent:r.ships.some(s=>s.id===paulId&&s.hull>0),rinPresent:r.ships.some(s=>s.storyPersonId==='rin'&&s.hull>0),step:q.stepId};
  });assert.equal(departure.read,true);assert.equal(departure.aliveDuringDeparture,true);assert.ok(departure.moved>10,'Paul actually flies away');assert.equal(departure.streaks,1);assert.equal(departure.departed,true);assert.equal(departure.paulPresent,false);assert.equal(departure.rinPresent,true);assert.equal(departure.step,'deliver-black-box');assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${name}-departure.png`});await writeFile(`${out}/${name}.json`,JSON.stringify({queued,departure,errors},null,2));console.log(name,'Paul stays for his German closing dialogue, flies away, then jumps out once');
 }finally{await browser.close();}
}
