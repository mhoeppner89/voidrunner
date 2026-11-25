// Live career cockpit, real assets and FX. Freeze the fixed-step clock between
// review poses so phone and desktop cameras see the same event.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
const profile=process.env.VR_PROFILES,desktop=profile==='desktop',engine=profile==='iphone'?webkit:chromium;
const device=desktop?{viewport:{width:1440,height:900}}:devices[profile==='iphone'?'iPhone 13 landscape':'Pixel 7 landscape'];
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out='output/corvettes',base=process.env.VR_BASE_URL??'http://127.0.0.1:4212';
await mkdir(out,{recursive:true});
const browser=await engine.launch(engine===chromium?{...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{}),errors=[],reports=[];
try{
 const page=await browser.newPage({...device,serviceWorkers:'block'});page.setDefaultTimeout(120000);
 page.on('pageerror',error=>errors.push(String(error)));page.on('console',m=>{if(m.text().includes('Frame error'))errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('voidrunner-lang','en');localStorage.setItem('__VOID_PRIVATEER_PROBE_LANG__','en');localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0,vibration:false,language:'en'}));
  const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};
 });
 await page.goto(base+'/game.html?startup-probe=1');await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
 await page.evaluate(()=>__VOID_PRIVATEER__.newGame());
 await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime();r.skipTutorial();await r.launch();
 });
 await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.ui.cockpitArtwork?.layout);
 await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();await r.ui.cockpitArtwork.ready;r.ui.cockpitArtwork.invalidate();});
 await page.waitForTimeout(150);
 await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime();
  cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);
  const T=await import('three'),{capitalHull}=await import('/src/game/capitalHulls.js'),{updateCorvetteWeapons}=await import('/src/game/capitalCombat.js');
  const p=r.save.player;
  p.position.splice(0,3,2000,50000,0);p.velocity.fill(0);p.rotation.splice(0,4,0,0,0,1);p.angularVelocity.fill(0);p.throttle=0;
  r.clearTarget();r.ships.length=0;r.activeInstanceId=undefined;r.ui.clearComms?.();
  const review=window.review={r,T,p,capitalHull,updateCorvetteWeapons,now:performance.now()};
  review.draw=(steps=1)=>{
   r.snapshotInterpolationState();
   for(let i=0;i<steps;i++){review.now+=1000/60;r.syncRender(1/60,review.now);}
  };
  review.stage=async(variant,distance,x=0)=>{
   r.clearTarget();r.ships.length=0;r.projectiles.length=0;r.renderer.clearEffects();r.pickups.length=0;
   const id=__VOID_PRIVATEER__.spawnCorvette(variant),ship=r.ships.find(s=>s.id===id);review.ship=ship;
   ship.position.splice(0,3,p.position[0]+x,p.position[1]+distance*.08,p.position[2]-distance);ship.velocity.fill(0);
   new T.Quaternion().setFromEuler(new T.Euler(.53,1.06,-.08,'YXZ')).toArray(ship.rotation);
   ship.hostile=variant==='ironjaw';ship.identifiedByPlayer=ship.scanned=true;ship.playerSensorAwareness=ship.playerAwareness=1;
   r.save.world.time+=1;r.snapshotInterpolationState();review.draw();
   await r.renderer.glbShipLoading.get(variant);r.renderer.syncShips(r.ships,1);
   review.draw(2);
   if(!r.renderer.shipMeshes.get(id)?.userData.glb)throw Error('Missing live '+variant+' model');
   updateCorvetteWeapons(r,ship,1/60);
   r.selectTarget('ship',id);r.monitorStatusUntil=0;r.monitorStatus='';r.lastHudUpdate=0;review.draw(30);
  };
 });
 async function stage(v,d,x=0){await page.evaluate(async args=>review.stage(...args),[v,d,x]);}
 async function shot(name,markers=false){
  const state=await page.evaluate(()=>{
   const {r,ship}=review,els=[...document.querySelector('#capital-markers').children];
   const canvas=document.querySelector('#target-hull-outline'),bounds=canvas.getBoundingClientRect();
   const schematic=bounds.width>0&&bounds.height>0&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0);
   const paint=r.ui.cockpitArtwork.active&&r.ui.cockpitArtwork.frame.complete&&r.ui.cockpitArtwork.frame.naturalWidth>0;
   return {paint,schematic,target:r.save.player.currentTargetId,variant:ship.variant,markers:els.filter(e=>!e.hidden).length,
    dots:els.filter(e=>!e.hidden&&!e.classList.contains('diamond')).length,diamonds:els.filter(e=>!e.hidden&&e.classList.contains('diamond')).length,
    readout:document.querySelector('#screen-target-readout').textContent,selected:r.capitalSubtarget?.index,
    parts:r.renderer.shipMeshes.get(ship.id)?.userData.glb,pickups:r.pickups.length};
  });
  if(markers)assert.ok(state.markers>0&&state.schematic&&state.paint,JSON.stringify(state));
  if(desktop||profile==='android')await page.screenshot({path:out+'/'+(desktop?'':profile+'-')+name+'.png'});
  reports.push({name,...state});
 }
 for(const variant of ['drover','ironjaw']){
  await stage(variant,800);await shot(variant+'-800',true);assert.ok(reports.at(-1).dots&&reports.at(-1).diamonds);
  const readout=reports.at(-1).readout;assert.match(readout,variant==='drover'?/TURRETS 3\/3.*PODS 6\/6/:/GUNS 2\/2.*TURRETS 2\/2/);
  await stage(variant,1600);await shot(variant+'-1600',true);
 }
 await stage('drover',170);
 await page.locator('#capital-subtarget').click();await page.evaluate(()=>{const {r,ship,capitalHull}=review,index=r.capitalSubtarget.index;ship.capitalMountHull[index]=capitalHull(ship).mounts[index].hull/2;review.draw(20);});
 assert.equal(await page.locator('#screen-target-hull').evaluate(e=>e.style.width),'50%');await shot('generator-selected',true);
 assert.equal(await page.evaluate(()=>review.capitalHull(review.ship).mounts[review.r.capitalSubtarget.index].kind),'generator');
 await page.keyboard.press('v');
 const edge=await page.evaluate(()=>{const {r,ship,capitalHull}=review;r.handleActions(r.input.getActions());return capitalHull(ship).mounts[r.capitalSubtarget.index].node;});
 assert.equal(edge,'engine_port');
 const controller=await page.evaluate(()=>{
  const {r,ship,capitalHull}=review,pad={index:0,id:'Test standard',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  const read=()=>r.handleActions(r.input.getActions());read();pad.buttons[11]={pressed:true,value:1};read();read();
  const chosen=capitalHull(ship).mounts[r.capitalSubtarget.index].node;pad.buttons[11]={pressed:false,value:0};read();
  pad.buttons[11]={pressed:true,value:1};read();delete navigator.getGamepads;
  return [chosen,r.capitalSubtarget?.index??null];
 });assert.deepEqual(controller,['engine_starboard',null]);
 if(desktop){
  await stage('drover',115);
  const drops=await page.evaluate(()=>{
   const {r,ship,capitalHull,T}=review;ship.shield=0;ship.cargo={ore:24,machinery:12};
   for(const m of capitalHull(ship).mounts.filter(m=>m.node==='pod_0'||m.node==='pod_2')){
    const point=new T.Vector3().fromArray(m.hitCenter).applyQuaternion(new T.Quaternion().fromArray(ship.rotation)).add(new T.Vector3(...ship.position));
    r.damageShip(ship,100,'player',point.toArray(),{id:'pulse',kind:'laser'});
   }
   for(let i=0;i<192;i++){r.save.world.time+=1/60;r.renderer.updateEffects(1/60);r.updatePickups(1/60);}
   review.draw(20);return r.pickups.map(x=>[x.commodity,x.amount]);
  });
  assert.ok(drops.length>=2);await shot('drover-two-pods',true);
  await stage('ironjaw',170,-36);
  const bolts=await page.evaluate(()=>{
   const {r,ship,T,updateCorvetteWeapons}=review;
   const q=new T.Quaternion().setFromEuler(new T.Euler(.42,.48,0,'YXZ'));q.toArray(ship.rotation);
   const target=new T.Vector3(90,10,0).applyQuaternion(q).add(new T.Vector3(...ship.position));
   const fighter=r.spawnShip('escort',target.toArray(),undefined,'Escort',undefined,{faction:'independents'});
   fighter.velocity.fill(0);fighter.rotation=[0,0,0,1];ship.targetId=fighter.id;
   const v=new T.Vector3();
   for(let i=0;i<120;i++){
    r.save.world.time+=1/60;updateCorvetteWeapons(r,ship,1/60,target,v);
    if(r.projectiles.some(p=>p.weaponId==='corvette-broadside'))break;
   }
   for(let i=0;i<4;i++)r.updateProjectiles(1/60);
   review.draw(20);return fighter.hull>0&&r.projectiles.filter(p=>p.weaponId==='corvette-broadside').length;
  });
  assert.ok(bolts);await shot('ironjaw-broadside',true);
  for(const variant of ['drover','ironjaw']){
   await stage(variant,140);
   const wreck=await page.evaluate(()=>{
    const {r,ship}=review;r.destroyShip(ship,'environment');r.ships=r.ships.filter(s=>s!==ship);r.clearTarget();
    for(let i=0;i<70;i++)r.renderer.updateEffects(1/60);
    review.draw(2);return r.renderer.effects.some(e=>e.combatWreck&&e.sections.length>0);
   });
   assert.ok(wreck);await shot(variant+'-breakup');
  }
 }
 const formation=await page.evaluate(()=>{
  const {r,p}=review;r.clearTarget();r.ships.length=0;
  const origin=[p.position[0]+600,p.position[1],p.position[2]-300];
  const convoy=r.spawnShip('trader',origin,undefined,undefined,undefined,{convoy:true});
  const escorts=r.ships.filter(s=>s.convoyLeader===convoy);
  const pirate=r.spawnShip('pirate',[origin[0]+1000,origin[1],origin[2]]);
  const gunboat=r.addRaidCorvette(pirate,[],{danger:.8},()=>0);
  const tracked=[convoy,...escorts,gunboat],actions=r.input.getActions();
  for(let i=0;i<20;i++)r.updateSimulation(1/60,actions);
  return {count:escorts.length,finite:tracked.every(s=>s.position.every(Number.isFinite)&&s.velocity.every(Number.isFinite)),task:convoy.task.kind};
 });
 assert.ok(formation.count>=1&&formation.count<=2&&formation.finite,JSON.stringify(formation));
 assert.equal(formation.task,'trade');
 assert.deepEqual(errors,[]);await writeFile(out+'/'+profile+'-review.json',JSON.stringify(reports,null,2));
 console.log(profile,reports.length,'live corvette views passed');
}finally{await browser.close();}
