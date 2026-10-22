import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/combat-feedback';await mkdir(out,{recursive:true});const report=[];
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]) {
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try {
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArena).catch(async e=>{await writeFile(`${out}/${name}-failure.json`,JSON.stringify({errors,message:String(e)},null,2));throw e;});
  await page.evaluate(()=>__VOID_PRIVATEER__.startArena('open','2v3','veteran'));
  const collapse=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);const calls=[];r.audio.playCockpit=(effect)=>calls.push(effect);
   r.deathTimer=0;r.shieldBreakFeedbackAt=undefined;r.save.settings.easyMode=false;r.save.player.shield=5;r.save.player.hull=r.playerStats().hull;r.damagePlayer(8,'test',false);
   const target=r.ships.find(s=>s.hostile);target.shield=5;target.hull=100;target.poweredDown=true;r.save.player.currentTargetId=target.id;r.damageShip(target,6,'player');
   r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();
   const ticker=document.querySelector('#screen-event-ticker .ticker-line'),bounds=ticker.getBoundingClientRect();
   return{calls,status:r.ownMonitorStatus,title:ticker.title,label:ticker.textContent,target:r.monitorStatus,fits:ticker.scrollWidth<=ticker.clientWidth+1&&bounds.left>=0&&bounds.right<=innerWidth+1};
  });
  assert.deepEqual(collapse.calls,['shieldBreak','hit','targetShieldBreak']);assert.equal(collapse.title,collapse.status);assert.equal(collapse.label,collapse.status);assert.ok(collapse.target);assert.ok(collapse.fits,`${name}: collapse notice overflow`);
  await page.screenshot({path:`${out}/${name}-collapse.png`});
  const empty=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime(),calls=[];r.audio.playCockpit=effect=>calls.push(effect);r.save.player.energy=0;
   for(let i=0;i<60;i++){r.save.world.time+=1/60;r.gunCooldown=0;r.fireMountedPlayerGuns();}
   r.ui.updateHud(r.buildHudModel());const ticker=document.querySelector('#screen-event-ticker .ticker-line');return{calls,status:r.ownMonitorStatus,title:ticker.title,fits:ticker.scrollWidth<=ticker.clientWidth+1};
  });
  assert.deepEqual(empty.calls,['capacitorEmpty']);assert.equal(empty.title,empty.status);assert.ok(empty.fits);assert.deepEqual(errors,[]);
  report.push({name,collapse,empty,errors});console.log(name,'combat feedback stays on cockpit monitors; muted');
 } finally {await browser.close();}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
