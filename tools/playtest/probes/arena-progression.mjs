// Run against a served checkout. Use the same settings with VR_BASE_URL pointing
// to a separately served git archive of HEAD to measure the previous run.
import {chromium} from 'playwright';
import {progressionSampleFactory,movingTerrainSignature} from './arena-progression-samples.mjs';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

if ((process.env.PILOT ?? 'engage') !== 'engage') throw Error('This probe uses PILOT=engage');
const seeds=(process.env.SEEDS??'175,718,941').split(',').map(Number);
const levels=process.env.LEVELS?.split(',').map(Number)??Array.from({length:25},(_,i)=>i+1);
const seconds=Number(process.env.SECONDS??360);
// Match arena-combat's engage panel. LETHAL=1 also measures survival with ordinary damage.
const lethal=process.env.LETHAL==='1';
const out=process.env.OUT??'output/arena-progression/new.json';
await mkdir(dirname(out),{recursive:true});
// Cold WebGL launches on macOS can stall when Chrome tears down one seed
// and starts the next in the same process. Isolate runs like the hull probes.
if(seeds.length>1){
 const rows=[];
 for(const seed of seeds){
  const file=out.replace(/\.json$/,'.'+seed+'.json');
  const status=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',env:{...process.env,SEEDS:String(seed),OUT:file}});
   child.once('error',reject);child.once('exit',resolve);
  });
  if(status!==0)throw Error('Seed '+seed+' exited with '+status);
  rows.push(...JSON.parse(await readFile(file,'utf8')));
  await writeFile(out,JSON.stringify(rows,null,2)+'\n');
 }
 process.exit(0);
}
const chrome=process.env.VR_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({executablePath:existsSync(chrome)?chrome:undefined,args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
const rows=[];
try {
 for(const seed of seeds){
  const page=await browser.newPage({viewport:{width:960,height:600},serviceWorkers:'block'});
  await page.goto((process.env.VR_BASE_URL??'http://127.0.0.1:4173')+'/game.html?startup-probe=1');
  await page.waitForFunction(()=>!!window.__VOID_PRIVATEER__?.startArenaRun,null,{polling:100,timeout:180000});
  await page.evaluate(async seed=>{
   const {newArenaRun,writeArenaRun}=await import('/src/game/arenaRun.js');
   // Visual shader compilation is unnecessary for a fixed-step instrument.
   const {GameSession}=await import('/src/game/game.js');
   GameSession.prototype.prepareFlightScene=async()=>{};
   writeArenaRun(newArenaRun(false,seed));await __VOID_PRIVATEER__.startArenaRun(true);
  },seed);
  // Install this checkout's probe functions separately from the served game
  // so an archived build can be measured with the same sampling protocol.
  const fresh=await page.evaluateHandle(progressionSampleFactory,seed);
  let initialTerrain;
  for(const level of levels){
   // Compare every moving rock and wreck, including orientation. The same
   // check runs for reordered and repeated levels, e.g. LEVELS=7,4,7 SECONDS=6.
   const sample=await fresh.evaluateHandle(async(make,{seed,level})=>{
    const {seededRandom}=await import('/src/game/random.js');
    const original=Math.random;Math.random=seededRandom(seed+level*997);
    try{return make();}finally{Math.random=original;}
   },{seed,level});
   const terrain=await sample.evaluate(movingTerrainSignature);
   initialTerrain??=terrain;
   if(terrain!==initialTerrain)throw Error('Moving field geometry carried over to level '+level);

   const row=await sample.evaluate(async(s,{level,seed,seconds,lethal})=>{
    const {RUN_WAVES}=await import('/src/game/arenaRun.js');
    const {seededRandom}=await import('/src/game/random.js');
    const {createOutfittingState}=await import('/src/game/outfitting.js');
    const {wingmanFitFor}=await import('/src/game/shipPool.js');
    const T=await import('/vendor/three.module.min.js');
    const p=s.save.player,run=s.save.arenaRun;
    const wave=level-1,tier=level<=4?1:level<=16?2:3;
    const wingHull=level<=12?'scrapper':level<=20?'talon':'blade';
    const wingmen=Array.from({length:level<9?0:level===25?2:1},(_,i)=>({id:'wing-'+i,name:'Wing '+(i+1),hullId:wingHull,fit:wingmanFitFor(wingHull),order:'aggressive',alive:true}));
    Object.assign(run,{wave,hullChosen:true,rewardChosen:true,openingPicks:2,decisions:{[wave]:true},wingmen});
    p.shipId=['wayfarer','talon','blade'][tier-1];p.ownedShips=[p.shipId];p.outfitting=createOutfittingState(p.ownedShips);
    const fit=p.outfitting.loadouts[p.shipId];fit.guns.fill(['pulse-cannon','pulse-cannon-t2','pulse-cannon-t3'][tier-1]);
    fit.fireGroups.activeGroup='ALL';s._statsDirty=true;s.syncWeaponProjection();
    const stats=s.playerStats();Object.assign(p,{hull:stats.hull,shield:stats.shield,energy:stats.energyCapacity});
    const originalRandom=Math.random;Math.random=seededRandom(seed+level*997);
    try{
     s.startRunWave();
     if(run.phase!=='combat')throw Error('Sortie did not start');
     const a=new T.Vector3(),b=new T.Vector3(),nose=new T.Vector3(0,0,-1),att=new T.Quaternion(),desired=new T.Quaternion();
     const step=1/60;let peak=0,ticks=0,objective=null,mark;
     for(;ticks<(seconds+3)*60&&run.phase==='combat'&&p.hull>0;ticks++){
      const enemies=s.ships.filter(x=>x.arenaRunEnemy&&x.hull>0);
      peak=Math.max(peak,enemies.length);
      // Pick a visible mark. Strike intercepts the bombers first. Destroy and
      // intercept sorties concentrate fire on their primary while it is visible.
      if(ticks%12===0||!mark||mark.hull<=0){
       const distance=h=>a.fromArray(p.position).distanceTo(b.fromArray(h.position));
       // The final frigate carries its own batteries. Break the escort screen
       // before attacking it, on both the previous and current sortie.
       const rank=h=>level===25?Number(Boolean(h.capitalClass)):h.arenaObjectiveAttacker?0:h.capitalClass?1:2;
       mark=enemies.filter(h=>!s.lineBlocked(a.fromArray(p.position),b.fromArray(h.position))).sort((l,r)=>rank(l)-rank(r)||distance(l)-distance(r))[0];
       if(mark&&p.currentTargetId!==mark.id)s.selectTarget('ship',mark.id,'automatic');
      }
      const actions={};
      if(mark&&mark.hull>0){
       a.fromArray(p.position);const range=b.fromArray(mark.position).distanceTo(a);
       const lead=Math.min(.7,range/620);
       for(let i=0;i<3;i++)b.setComponent(i,b.getComponent(i)+(mark.velocity[i]-p.velocity[i])*lead);
       desired.setFromUnitVectors(nose,b.sub(a).normalize());
       att.fromArray(p.rotation).rotateTowards(desired,2*step).toArray(p.rotation);
       actions.fire=att.angleTo(desired)<.09;
       p.throttle=range>480?.85:range<150?.15:.55;
      }else p.throttle=.25;
      if(!lethal){p.hull=stats.hull;p.shield=stats.shield;}
      s.updateSimulation(step,actions);
      objective=s.runBattle?.outcome??objective;
     }
     return {level,seed,panel:lethal?'flight':'endurance',site:RUN_WAVES[wave].site,player:p.shipId,wingmen:wingmen.map(w=>w.hullId),seconds:+Math.max(0,ticks/60-3).toFixed(2),damage:+run.damage.toFixed(1),peak,
      outcome:p.hull<=0||run.phase==='lost'?'pilot lost':run.phase==='combat'?'timeout':objective??'clear',objective,cutoff:seconds};
    }finally{Math.random=originalRandom;}
   },{level,seed,seconds,lethal});
   await sample.dispose();
   rows.push(row);await writeFile(out,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(row));
  }
  await page.close();
 }
}finally{await browser.close();}
