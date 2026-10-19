import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/location-buttons';
await mkdir(out,{recursive:true});const report=[];
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
for(const[name,engine,device]of profiles){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(90000);const errors=[],screens=[],failures=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/game.html?revision=0.8.2jd`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.evaluate(async()=>{window.arrivalEvents=[];const{ConcourseShip}=await import('/src/game/concourseShip.js');for(const method of ['animate','playStation','playAtmosphere']){const original=ConcourseShip.prototype[method];ConcourseShip.prototype[method]=function(...args){arrivalEvents.push([method,args[0]]);return original.apply(this,args);};}});
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();
  const ready=()=>page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});await ready();
  const fresh=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);return{events:[...arrivalEvents],phase:r.ui.concourseShip.phase,waiting:r.ui.concourseShip.waitingArrival,story:r.ui.storyOpen,disabled:document.querySelector('.concourse-hover-ship').disabled};});
  assert.deepEqual(fresh.events,[],'A fresh career must not fly in or enter a station/atmosphere');assert.equal(fresh.phase,'idle');assert.ok(fresh.story&&!fresh.waiting&&!fresh.disabled);await page.locator('[data-ui-command="close-story"]').click();
  await page.evaluate(async()=>{await __VOID_PRIVATEER__.getRuntime().ui.actions.startNew(false);window.r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);});await ready();
  const skipped=await page.evaluate(()=>({events:[...arrivalEvents],phase:r.ui.concourseShip.phase,story:r.ui.storyOpen}));assert.deepEqual(skipped.events,[]);assert.equal(skipped.phase,'idle');assert.equal(skipped.story,false);
  if(process.env.VR_HULL)await page.evaluate(async hull=>{const{createOutfittingState}=await import('/src/game/outfitting.js');r.save.player.shipId=hull;r.save.player.outfitting=createOutfittingState([hull]);r._statsDirty=true;},process.env.VR_HULL);
  const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const check=async(label,capture=false)=>{
   await settle();const state=await page.evaluate(()=>{
    const scene=document.querySelector('#dock-screen .station-scene'),bounds=scene?.getBoundingClientRect(),mobile=matchMedia('(max-width:900px), (pointer:coarse)').matches,issues=[],rects=[];
    const controls=[...document.querySelectorAll('#dock-screen .scene-pointer,#dock-screen .dock-header button,#dock-screen .service-card button,#dock-screen .service-card select,#dock-screen .mission-dossier-actions button,#dock-screen .guild-card button,#dock-screen .trade-ticket button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
    for(const el of controls){
     const b=el.getBoundingClientRect(),text=el.textContent.trim().replace(/\s+/g,' '),sceneButton=el.matches('.scene-pointers > .scene-pointer'),visible=b.width&&b.height&&b.right>0&&b.left<innerWidth&&b.bottom>0&&b.top<innerHeight;
     if(!visible)continue;
     if(sceneButton){
      if(b.left<bounds.left+3||b.right>bounds.right-3||b.top<bounds.top+3||b.bottom>bounds.bottom-3)issues.push(`${text}: scene clipping`);
      if(b.height<43)issues.push(`${text}: touch target below 44px`);
      const title=el.querySelector('b'),t=title.getBoundingClientRect();if(t.left<b.left+3||t.right>b.right-3||t.top<b.top+3||t.bottom>b.bottom-3)issues.push(`${text}: label clipping`);
      if(mobile){const range=document.createRange();range.selectNodeContents(title);const ink=range.getBoundingClientRect();if(Math.abs((ink.left+ink.right-b.left-b.right)/2)>2||Math.abs((t.top+t.bottom-b.top-b.bottom)/2)>2)issues.push(`${text}: off-centre phone label`);for(const detail of el.querySelectorAll('i,small,em'))if(getComputedStyle(detail).display!=='none')issues.push(`${text}: phone detail is still visible`);}
      const hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);if(!el.contains(hit))issues.push(`${text}: another element blocks its centre`);
      rects.push({text,x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height});
     }
     if(el.scrollWidth>el.clientWidth+2)issues.push(`${text}: content wider than button`);
     if(el.closest('.dock-header')&&(b.left<0||b.right>innerWidth+1||b.top<0||b.bottom>innerHeight))issues.push(`${text}: header clipping`);
    }
    for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++){const x=rects[a],y=rects[b];if(Math.min(x.right,y.right)-Math.max(x.x,y.x)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>1)issues.push(`${x.text} / ${y.text}: overlapping buttons`);}
    const ship=scene?.querySelector('.concourse-model-stage.has-model + .concourse-hover-ship');if(ship&&!ship.disabled){const b=ship.getBoundingClientRect();for(const p of rects)if(Math.min(p.right,b.right)-Math.max(p.x,b.left)>1&&Math.min(p.bottom,b.bottom)-Math.max(p.y,b.top)>1)issues.push(`${p.text}: overlaps ship launch area`);const hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);if(!ship.contains(hit))issues.push('Ship launch area is blocked');}
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Page has horizontal overflow');
    return{location:r.ui.dockLocation,terminal:r.ui.dockTerminal,viewport:[innerWidth,innerHeight],mobile,rects,issues};
   });screens.push({label,...state});if(state.issues.length)failures.push({label,issues:state.issues});if(capture||state.issues.length)await page.screenshot({path:`${out}/${name}-${label}.png`});return state;
  };
  const locations=await page.evaluate(async()=>[...(await import('/src/game/data.js')).DOCK_LOCATION_IDS]);
  for(const id of locations){
   await page.evaluate(async id=>{const{LOCATIONS}=await import('/src/game/data.js');r.save.player.dockedAt=id;r.save.player.systemId=LOCATIONS[id].systemId;r.ui.showDock(r.save,id);await r.ui.prepareDockView();},id);await ready();
   const capture=['helix','vesper','cairn','nacre'].includes(id);await check(`${id}-concourse`,capture);
   for(const terminal of process.env.VR_CONCOURSE_ONLY?[]:['market','bar','services']){
    const entry=page.locator(`[data-dock-hotspot="${terminal}"]`);if(!await entry.count())continue;await entry.click();await check(`${id}-${terminal}`,capture);
    if(terminal==='market'){
     for(const point of ['commodities','equipment','shipyard']){
      const link=page.locator(`[data-market-point="${point}"]`).first();if(!await link.count())continue;await link.click();await check(`${id}-${point}`,capture&&point==='equipment');
      if(point==='commodities'){const commodity=page.locator('[data-commodity-id="food"]');if(await commodity.count()){await commodity.click();await check(`${id}-trade-ticket`,capture);}}
     }
    }
    if(terminal==='bar'){
     for(const panel of ['missions','guilds']){await page.evaluate(panel=>{r.ui.barPanel=panel;r.ui.renderDock();},panel);await check(`${id}-${panel}`,capture);}
     await page.evaluate(()=>{r.ui.barPanel='people';r.ui.barPersonId=r.ui.barPeople()[0]?.id;r.ui.renderDock();});await check(`${id}-dialogue`,capture);
    }
    await page.evaluate(()=>r.ui.switchToTerminal('concourse'));await ready();
   }
   console.log(name,id,'location buttons checked');
  }
  if(process.env.VR_CONCOURSE_ONLY){assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-${process.env.VR_HULL??'wayfarer'}-concourse-report.json`,JSON.stringify({screens,errors},null,2));continue;}
  // Extra contacts, unlocked den and cramped windows exercise the layouts
  // that do not occur at the very beginning of the prologue.
  await page.evaluate(()=>{r.save.world.underworld??={};r.save.world.underworld.helix=100;r.ui.showDock(r.save,'helix');});await ready();await check('helix-unlocked-den',true);
  if(name==='desktop'){
   for(const viewport of [{width:1024,height:768},{width:800,height:600}]){await page.setViewportSize(viewport);await check(`compact-${viewport.width}-concourse`);await page.evaluate(()=>r.ui.switchToTerminal('bar'));await check(`compact-${viewport.width}-bar`);await page.evaluate(()=>r.ui.switchToTerminal('concourse'));await ready();}
   await page.setViewportSize(device.viewport);
  }
  if(name==='iphone'){
   for(const viewport of [{width:667,height:375},{width:568,height:320}]){
    await page.setViewportSize(viewport);await check(`small-${viewport.width}-concourse`,true);
    await page.locator('[data-dock-hotspot="market"]').click();await check(`small-${viewport.width}-market`,true);
    await page.locator('[data-market-point="equipment"]').click();await check(`small-${viewport.width}-equipment`);
    await page.evaluate(()=>r.ui.switchToTerminal('bar'));await check(`small-${viewport.width}-bar`,true);
    await page.evaluate(()=>r.ui.switchToTerminal('concourse'));await ready();
   }
   await page.setViewportSize(device.viewport);
  }
  assert.deepEqual(await page.evaluate(()=>arrivalEvents),[],'Restoring a docked view must not replay an arrival');
  // A real arrival still owns its films and disables the scene until parked.
  await page.evaluate(()=>{arrivalEvents.length=0;r.ui.showDock(r.save,'helix',{arrival:true});});await page.waitForFunction(()=>r.ui.concourseShip?.phase==='landing');assert.ok(await page.locator('.scene-pointers').evaluate(e=>e.inert));await ready();
  const landing=await page.evaluate(()=>({events:[...arrivalEvents],phase:r.ui.concourseShip.phase,inert:document.querySelector('.scene-pointers').inert}));assert.ok(landing.events.some(([method,phase])=>method==='animate'&&phase==='landing'));assert.equal(landing.phase,'idle');assert.equal(landing.inert,false);
  report.push({name,fresh,skipped,landing,screens,failures,errors});await writeFile(`${out}/report-${name}.json`,JSON.stringify(report.at(-1),null,2));assert.deepEqual(errors,[]);assert.deepEqual(failures,[],`${name}: ${JSON.stringify(failures)}`);console.log(name,'fresh starts, all locations and tabs, centred labels, clipping, hit targets and actual arrival passed');
 }finally{await browser.close();}
}
