// Muted, isolated career reproduction. Reports go only under ignored output/.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/mining-performance',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
 await page.goto(`${base}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
 await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime(),p=r.save.player,q=r.save.quests.find(q=>q.id==='the-spare-key');r.audio.setVolumes(0,0);cancelAnimationFrame(r.frameId);r.ui.hideStory();q.stepId='mining-contract';q.flags.miningExplained=true;p.dockedAt='vesper';r.ui.showDock(r.save,'vesper');r.ensureTutorialMiningContract();r.acceptMission('tutorial-vesper-mining');await r.launch();cancelAnimationFrame(r.frameId);
  const {asteroidCollisionRadius}=await import('/src/game/worldData.js'),{LOCATIONS}=await import('/src/game/data.js'),T=await import('three'),node=r.asteroids.find(n=>n.id===q.flags.oreTargetId);node.remaining=Math.max(node.remaining,100);
  const away=new T.Vector3(...LOCATIONS.vesper.position).sub(new T.Vector3(...node.position)).normalize(),position=new T.Vector3(...node.position).addScaledVector(away,asteroidCollisionRadius(node)+40);r.ensurePlayerEntryClearance(position,'shardbelt',away);p.position.splice(0,3,...position.toArray());p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;r.updateActiveInstance(true);r.selectTarget('asteroid',node.id);r.scanTarget();r.resetPlayerInterpolation(true);const result=r.toggleMiningDrones();if(!result.ok)throw Error(JSON.stringify(result));
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime(),q=r.save.quests.find(q=>q.id==='the-spare-key'),timings={},frames=[],originals=[],compiles=[];
  const renderer=r.renderer.renderer,gl=renderer.getContext(),renderDirect=renderer.renderBufferDirect,infoLog=gl.getProgramInfoLog;let material;
  renderer.renderBufferDirect=function(...args){material={type:args[3]?.type,name:args[3]?.name,object:args[4]?.name,shadowType:this.shadowMap.type};return renderDirect.apply(this,args);};
  gl.getProgramInfoLog=function(...args){const start=performance.now();const result=infoLog.apply(this,args),ms=performance.now()-start;if(ms>10)compiles.push({...material,ms,ore:r.save.player.cargo.ore,frame:frames.length});return result;};
  for(const name of ['updateSimulation','updateTutorialCampaignRuntime','ensureTutorialCompanion','updateShips','updateMiningDrones','persistSave','firstObstacleHitInfo','ensureObstacleGrid','playerStats','syncRender'])if(typeof r[name]==='function'){
   const original=r[name];originals.push([name,original]);r[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const row=timings[name]??={calls:0,total:0,max:0,slow:0};const ms=performance.now()-start;row.calls++;row.total+=ms;row.max=Math.max(row.max,ms);if(ms>8)row.slow++;}};
  }
  try{for(let i=0;i<420;i++){
   await new Promise(requestAnimationFrame);const start=performance.now();r.lastFrame=start-100;r.frame(start);cancelAnimationFrame(r.frameId);frames.push({ms:performance.now()-start,step:q.stepId,ore:r.save.player.cargo.ore??0});
  }}finally{for(const[name,original]of originals)r[name]=original;renderer.renderBufferDirect=renderDirect;gl.getProgramInfoLog=infoLog;}
  return{timings,frames,compiles,step:q.stepId,ore:r.save.player.cargo.ore,ships:r.ships.map(s=>({role:s.role,hull:s.hullId})),asteroids:r.asteroids.length,resources:{...r.renderer.renderer.info.memory},frameError:r.frameErrorAt};
 });
 const {profile}=await cdp.send('Profiler.stop');await page.screenshot({path:`${out}/${process.env.VR_LABEL??'current'}.png`});
 const self=new Map();for(const node of profile.nodes){const f=node.callFrame,key=`${f.functionName} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber+1}`;self.set(key,(self.get(key)??0)+(node.hitCount??0));}
 const summary={...result,errors,self:[...self].sort((a,b)=>b[1]-a[1]).slice(0,40)};
 await writeFile(`${out}/${process.env.VR_LABEL??'current'}.json`,JSON.stringify(summary,null,2));await writeFile(`${out}/${process.env.VR_LABEL??'current'}.cpuprofile`,JSON.stringify(profile));
 console.log(JSON.stringify({...summary,frames:undefined},null,2));if(errors.length||result.frameError)process.exitCode=1;
}finally{await browser.close();}
