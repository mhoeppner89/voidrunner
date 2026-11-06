import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({...devices['Pixel 7 landscape'],serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(120000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
 await page.evaluate(async()=>{await __VOID_PRIVATEER__.newGame();const r=__VOID_PRIVATEER__.getRuntime();r.skipTutorial();await r.launch();});
 const result=await page.evaluate(()=>{
  const r=__VOID_PRIVATEER__.getRuntime();r.debugStartDistress('trap',0,{phase:'involved'});
  const id=r.save.world.distress.active.id;r.save.player.currentTargetId=id;r.save.player.shield=0;r.save.player.hull=1;
  r.damagePlayer(10000,'test',false);r.recoverPlayer();
  return {docked:!!r.save.player.dockedAt,active:r.save.world.distress.active,waypoint:r.distressWaypoint(),target:r.save.player.currentTargetId,history:r.save.world.distress.history[0],nextAt:r.save.world.distress.nextAt,time:r.save.world.time};
 });
 assert.ok(result.docked);assert.equal(result.active,null);assert.equal(result.waypoint,undefined);assert.equal(result.target,undefined);assert.equal(result.history.outcome,'lost');assert.ok(result.nextAt>result.time);assert.deepEqual(errors,[]);
 console.log('Android career: ambush loss clears the waypoint and schedules the next call');
}finally{await browser.close();}
