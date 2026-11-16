import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android']);
const profile=process.env.VR_PROFILES??'desktop',out=process.env.VR_OUTPUT_DIR??'output/npc-ai-followup';
const environment=process.env.VR_ENVIRONMENT??'open',difficulty=process.env.VR_DIFFICULTY??'veteran';
const temperament=process.env.VR_TEMPERAMENT;
await mkdir(out,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({...(existsSync(chrome)?{executablePath:chrome}:{}),headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio',`--use-angle=${process.env.VR_ANGLE??(process.platform==='darwin'?'metal':'swiftshader')}`]});
try {
 const page=await browser.newPage({...profile==='android'?devices['Pixel 7 landscape']:{viewport:{width:1440,height:900}},serviceWorkers:'block'});
 page.setDefaultTimeout(90000);const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));
  const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};
 });
 await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4212'}/game.html?startup-probe=1`);
 await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.startArena);
 // Dispatch without returning the circular session graph, then bound readiness.
 await page.evaluate(({environment,difficulty})=>{window.npcFlightReady=false;window.npcFlightError=null;__VOID_PRIVATEER__.startArena(environment,'2v3',difficulty).then(()=>{window.npcFlightReady=true;}).catch(e=>{window.npcFlightError=String(e.stack??e);});},{environment,difficulty});
 await page.waitForFunction(()=>window.npcFlightReady||window.npcFlightError);
 assert.equal(await page.evaluate(()=>window.npcFlightError),null);
 if(temperament)await page.evaluate(async nature=>{
  const {rollPilot}=await import('/src/game/pilots.js');
  for(const ship of __VOID_PRIVATEER__.getRuntime().ships)ship.pilot=rollPilot(ship.aiRng,.5,ship.faction,{tier:ship.pilot?.tier??'veteran',temperament:nature});
 },temperament);
 const combat=await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);
  for(let i=0;i<60;i++)r.updateSimulation(1/60,{});
  const before=new Map(r.ships.map(s=>[s.id,s.position.slice()]));let shots=0,hits=0,switches=0;const targets=new Map(),times=[];
  const fire=r.spawnGunProjectile,damage=r.damageShip;
  r.spawnGunProjectile=function(...args){shots++;return fire.apply(this,args);};
  r.damageShip=function(...args){if(args[1]>0)hits++;return damage.apply(this,args);};
  try {
   for(let i=0;i<720;i++){
    const begin=performance.now();r.updateSimulation(1/60,{});times.push(performance.now()-begin);
    if(i%12===11)r.syncRender(.2,performance.now());
    for(const ship of r.ships){const previous=targets.get(ship.id);if(previous&&ship.targetId&&ship.targetId!==previous)switches++;targets.set(ship.id,ship.targetId);}
   }
  }finally{r.spawnGunProjectile=fire;r.damageShip=damage;}
  const T=await import('/vendor/three.module.min.js'),target=r.ships.find(s=>s.hull>0&&s.hostile);
  if(target){r.save.player.currentTargetId=target.id;r.save.player.rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(new T.Vector3(...r.save.player.position),new T.Vector3(...target.position),new T.Vector3(0,1,0))).toArray();r.resetPlayerInterpolation(true);}
  r.syncRender(0,performance.now());r.ui.updateHud(r.buildHudModel());r.renderer.render();times.sort((a,b)=>a-b);
  return {shots,hits,switches,ships:r.ships.length,moved:r.ships.some(s=>before.has(s.id)&&Math.hypot(...s.position.map((v,k)=>v-before.get(s.id)[k]))>20),finite:r.ships.every(s=>s.position.every(Number.isFinite)&&s.velocity.every(Number.isFinite)),p50Ms:times[360],p95Ms:times[684]};
 });
 assert.ok(combat.shots>0&&combat.hits>0&&combat.moved&&combat.finite,JSON.stringify(combat));
 await page.screenshot({path:`${out}/${profile}-combat.png`});
 const civilian=await page.evaluate(async()=>{
  const r=__VOID_PRIVATEER__.getRuntime(),{updateShipAI}=await import('/src/game/shipAI.js');
  cancelAnimationFrame(r.frameId);r.arena=undefined;r.ships=[];
  const base=r.save.player.position.slice();r.save.player.position=[base[0]+5000,base[1]+5000,base[2]+5000];
  const trader=r.spawnShip('trader',base,undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'wayfarer'});
  trader.rotation=[0,0,0,1];trader.velocity=[0,0,-30];trader.stationQueue=undefined;trader.destination=[base[0],base[1],base[2]-3000];
  trader.task={kind:'trade',phase:'leg',port:'helix',origin:'vesper'};
  const pirate=r.spawnShip('pirate',[base[0],base[1],base[2]+180],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'scrapper'});
  pirate.targetId=trader.id;pirate.pursuitHoldFire=false;pirate.holdFire=false;pirate.pendingMug=false;
  let escaped=false,shotAtPursuer=false;const first=trader.position.slice();
  for(let i=0;i<240;i++){
   r.save.world.time+=1/60;updateShipAI(r,trader,1/60);
   escaped ||= trader.task?.kind==='flee';shotAtPursuer ||= trader.targetId===pirate.id;
  }
  return {escaped,shotAtPursuer,moved:Math.hypot(...trader.position.map((v,k)=>v-first[k])),finite:trader.position.every(Number.isFinite)};
 });
 assert.ok(civilian.escaped&&!civilian.shotAtPursuer&&civilian.moved>10&&civilian.finite,JSON.stringify(civilian));
 assert.deepEqual(errors,[]);
 const report={profile,environment,difficulty,temperament,combat,civilian,errors};await writeFile(`${out}/${profile}-browser.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
