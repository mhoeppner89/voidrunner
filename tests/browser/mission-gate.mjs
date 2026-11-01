import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4211';
const out='output/mission-gate';await mkdir(out,{recursive:true});
for(const [name,device] of [['desktop',{viewport:{width:1440,height:900}}],['android',devices['Pixel 7 landscape']]]){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0})));
  await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
  const before=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();r.ui.closeAdventure(false);
   const q=r.save.quests.find(q=>q.id==='the-spare-key');q.stepId='earn-standing';q.flags.openWorld=true;q.flags.gateOpen=false;
   r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');r.ui.dockTab='bar';r.ui.dockTerminal='bar';r.ui.barPanel='missions';r.ui.missionBoardTab='available';r.ui.renderDock();
   const {LOCATIONS}=await import('/src/game/data.js');
   const posted=r.save.world.offers.helix,shown=r.ui.missionBoardSource('available');
   const remote=m=>[m.destination,m.targetZone].some(id=>id&&LOCATIONS[id]?.systemId!=='helios-verge');
   window.gateBoardTest={remote,hidden:posted.filter(remote).map(m=>m.id)};
   return {shown:shown.map(m=>m.id),remoteShown:shown.filter(remote).length,hidden:window.gateBoardTest.hidden,rendered:document.querySelectorAll('[data-mission-select]').length};
  });
  assert.ok(before.hidden.length>0,JSON.stringify(before));assert.ok(before.shown.length>0,JSON.stringify(before));assert.equal(before.remoteShown,0);assert.equal(before.rendered,before.shown.length);
  await page.screenshot({path:`${out}/${name}-closed.png`});
  const after=await page.evaluate(()=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.save.quests.find(q=>q.id==='the-spare-key').flags.gateOpen=true;r.ui.renderDock();
   const shown=r.ui.missionBoardSource('available');return {ids:shown.map(m=>m.id),remote:shown.filter(window.gateBoardTest.remote).length,rendered:document.querySelectorAll('[data-mission-select]').length};
  });
  assert.ok(after.remote>0,JSON.stringify(after));assert.ok(before.hidden.every(id=>after.ids.includes(id)));assert.equal(after.rendered,after.ids.length);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${name}-open.png`});console.log(name,JSON.stringify({before,after}));
 }finally{await browser.close();}
}
