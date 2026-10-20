// Muted station/film profiling. Phone viewports and throttled Chromium expose
// CPU stalls; these are relative diagnostics, not physical-phone FPS claims.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';
const out=`output/station-performance/${process.env.VR_LABEL??'current'}`;await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);const errors=[],warnings=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}else if(m.type()==='warning')warnings.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?station-performance`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const cdp=engine===chromium?await page.context().newCDPSession(page):null;
  await page.evaluate(async()=>{
   const {SpaceRenderer}=await import('/src/game/render.js'),{ConcourseShip}=await import('/src/game/concourseShip.js'),{StationTransit}=await import('/src/game/stationTransit.js'),{GameSession}=await import('/src/game/game.js'),{GameUI}=await import('/src/game/ui.js');
   window.stationPerf={stage:'startup',samples:{},newPrograms:[],longTasks:[],frames:[],start:performance.now()};
   const record=(name,ms)=>{const key=stationPerf.stage+':'+name;const s=stationPerf.samples[key]??=([]);if(s.length<10000)s.push(ms);};
   const wrap=(proto,key,name)=>{const fn=proto[key];if(!fn)return;proto[key]=function(...args){const t=performance.now(),count=this.renderer?.info?.programs?.length??0;try{return fn.apply(this,args);}finally{record(name+(name==='dock.render'?'.'+this.phase:''),performance.now()-t);if(name==='flight.render'){const programs=this.renderer.info.programs;if(programs.length>count)stationPerf.newPrograms.push({stage:stationPerf.stage,keys:programs.slice(count).map(p=>({name:p.name,key:p.cacheKey}))});}}};};
   for(const key of ['render','updateWorldVisuals','syncShips','sync'])wrap(SpaceRenderer.prototype,key,'flight.'+key);
   for(const key of ['syncRender','buildHudModel','updateSimulation','resolvePlayerCollisions','autoDockCheck','updateActiveInstance','launch','dockAt'])wrap(GameSession.prototype,key,'game.'+key);
   for(const key of ['updateHud','setCockpitShip','renderDock','showHud','hideDock'])wrap(GameUI.prototype,key,'ui.'+key);
   for(const key of ['render','resize','applyPose','setBackdrop'])wrap(ConcourseShip.prototype,key,'dock.'+key);
   wrap(StationTransit.prototype,'update','film.update');
   for(const key of ['bufferData','texImage2D','generateMipmap'])wrap(WebGL2RenderingContext.prototype,key,'gl.'+key);
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())stationPerf.longTasks.push({stage:stationPerf.stage,at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:false});}catch{}
   let last=performance.now();function frame(now){stationPerf.frames.push({stage:stationPerf.stage,ms:now-last});last=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  if(cdp&&process.env.VR_TRACE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  const ready=async()=>{await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared);await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.prepareDockView());await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return !r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});};await ready();console.log(name,'startup ready');if(name==='android')await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.VR_CPU_RATE??4)});
  await page.evaluate(()=>{stationPerf.draws={};const r=__VOID_PRIVATEER__.getRuntime();for(const [name,renderer]of [['flight',r.renderer.renderer],['dock',r.ui.concourseShip.renderer]]){const render=renderer.render;renderer.render=function(scene,camera){const start=performance.now();try{return render.call(this,scene,camera);}finally{const key=stationPerf.stage+':'+name+':'+(scene.isScene?'scene':'resolve'),a=stationPerf.draws[key]??=[];if(a.length<2000)a.push({ms:performance.now()-start,...this.info.render});}};}});
  const ids=(process.env.VR_STATIONS??'helix,argent,blackglass').split(',');
  const report=[];
  for(const id of ids){
   console.log(name,id,'flyby');
   await page.evaluate(async id=>{stationPerf.stage=id+':load';const r=__VOID_PRIVATEER__.getRuntime(),{LOCATIONS}=await import('/src/game/data.js'),{stationModelOffsetZ,stationVisualSurfaceRadius}=await import('/src/game/stationTraffic.js');r.ui.cancelVesperLaunchTransition();r.save.player.systemId=LOCATIONS[id].systemId;r.renderer.setSystem(r.save.player.systemId);await r.renderer.ensureStationModels(r.save.player.systemId);r.save.player.dockedAt=undefined;r.save.player.currentTargetId=id;r.save.player.navTargetId=id;r.save.player.position=[...LOCATIONS[id].position];r.save.player.position[2]+=stationModelOffsetZ(id)+stationVisualSurfaceRadius(id)+180;r.save.player.rotation=[0,0,0,1];r.save.player.velocity.fill(0);r.save.player.throttle=0;r.activeInstanceId=id;r.ui.hideDock();r.ui.showHud();window.perfAutoDock=r.autoDockCheck;r.autoDockCheck=()=>{};r.updateActiveInstance(true);stationPerf.stage=id+':flyby';},id);
   await page.waitForTimeout(5000);
   await page.evaluate(()=>stationPerf.stage+=':capture');await page.screenshot({path:`${out}/${name}-${id}-flyby.png`});
   await page.evaluate(id=>{stationPerf.stage=id+':arrival';const r=__VOID_PRIVATEER__.getRuntime();r.autoDockCheck=perfAutoDock;r.dockAt(id);},id);
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='entry');
   await page.waitForTimeout(2000);await page.screenshot({path:`${out}/${name}-${id}-entry.png`});await ready();
   await page.evaluate(id=>stationPerf.stage=id+':idle',id);await page.waitForTimeout(1500);
   await page.evaluate(id=>{stationPerf.stage=id+':departure';__VOID_PRIVATEER__.getRuntime().ui.startVesperLaunchTransition();},id);
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='exit');await page.waitForTimeout(1500);await page.screenshot({path:`${out}/${name}-${id}-exit.png`});
   await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);await page.evaluate(id=>stationPerf.stage=id+':return',id);await page.waitForTimeout(1000);
   report.push(await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime(),v=r.ui.concourseShip;return{id,flight:{memory:r.renderer.renderer.info.memory,programs:r.renderer.renderer.info.programs.length,draw:r.renderer.renderer.info.render},dock:{memory:v.renderer.info.memory,programs:v.renderer.info.programs.length,draw:v.renderer.info.render}};},id));
  }
  if(cdp&&process.env.VR_TRACE){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/${name}.cpuprofile`,JSON.stringify(profile));}
  const result=await page.evaluate(()=>stationPerf);result.ports=report;result.errors=errors;result.warnings=warnings;
  const summarize=a=>{a.sort((x,y)=>x-y);return{n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1),over50:a.filter(x=>x>50).length};};
  const summary=Object.fromEntries(Object.entries(result.samples).filter(([key])=>!key.includes('gl.')).map(([key,a])=>[key,summarize(a)]));
  await writeFile(`${out}/${name}.json`,JSON.stringify(result,null,2));await writeFile(`${out}/${name}-summary.json`,JSON.stringify(summary,null,2));
  console.log(name,JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([key])=>key.includes('.render')))));assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
