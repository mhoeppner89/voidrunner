// Arena combat benchmark: every Arena site's first wave, flown by the live
// runtime in headless Chrome while the pilot holds still (and cannot die).
// Measures how quickly and how much the opponents actually fight:
//   firstShot  seconds from spawn to the first shot at the pilot
//   lofr       share of time with line of sight inside weapon range
//   spm        shots per minute at the pilot, hits = landed hits per minute
//   stuck      share of time below 15% of max speed
//   limited    share of time the terrain controller caps speed below 60%
//   search     share of time searching for a lost contact
//   maxHidden  longest stretch (s) with opponents alive and none tracking the pilot
//   bumps      terrain contacts per minute
//
//   node tools/playtest/probes/arena-combat.mjs     (VR_BASE_URL, SITES, SECONDS, OUT)
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const seed=Number(process.env.SEED??718);
if(!Number.isSafeInteger(seed))throw new Error('SEED must be an integer');
const SECONDS=+(process.env.SECONDS??60),OUT=process.env.OUT??'output/arena-combat/benchmark.json';
await mkdir(OUT.replace(/\/[^/]*$/,''),{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--mute-audio']});
const page=await browser.newPage({viewport:{width:960,height:600},serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(600000);
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));});
await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4173'}/game.html?startup-probe=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
await page.evaluate(async seed=>{
 const {newArenaRun,writeArenaRun}=await import('/src/game/arenaRun.js');
 if(!writeArenaRun(newArenaRun(false,seed)))throw new Error('Cannot stage seeded Arena run');
 await __VOID_PRIVATEER__.startArenaRun(true);
 if(__VOID_PRIVATEER__.getRuntime().save.arenaRun.seed!==seed)throw new Error('Arena seed mismatch');
},seed);
await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.arenaRunAction('hull','wayfarer');for(let pick=0;pick<2;pick++){const offers=r.save.arenaRun.offers;r.arenaRunAction('reward',offers.find(x=>x!=='repair')??offers[0]);r.arenaRunAction('accept');}});
const sites=await page.evaluate(async()=>{const {RUN_WAVES}=await import('/src/game/arenaRun.js');const seen=new Map();RUN_WAVES.forEach((w,i)=>{if(!seen.has(w.site))seen.set(w.site,i);});return [...seen];});
const results=[];
for(const [site,wave] of (process.env.SITES?sites.filter(([s])=>process.env.SITES.split(',').includes(s)):sites)){
 const result=await page.evaluate(async({wave,seconds})=>{
  const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);
  r.clearTransientSpace();r.ships=r.ships.filter(s=>s.arenaRunWingman);const run=r.save.arenaRun;run.wave=wave;run.phase='prepare';run.decisions[wave]=true;run.hullChosen=true;run.rewardChosen=true;run.wingmen=[];
  r.startRunWave();
  const p=r.save.player,stats=r.playerStats(),hold=[...p.position],per=new Map(),T=await import('/vendor/three.module.min.js'),a=new T.Vector3(),b=new T.Vector3();
  const {weaponRange}=await import('/src/game/weapons.js');
  const metric=ship=>{let m=per.get(ship.id);if(!m)per.set(ship.id,m={range:Math.max(0,...(ship.combatFit?.weaponDefinitions??[]).filter(Boolean).map(w=>weaponRange(w))),hull:ship.hullId,tier:ship.pilot?.tier,spawned:r.save.world.time,firstShot:null,shots:0,hits:0,steps:0,lofr:0,samples:0,stuck:0,limited:0,search:0,bumps:0,lastBump:-9,dist:0,merges:0,close:false,entered:null});return m;};
  const fire=r.fireNpcGun.bind(r),damage=r.damagePlayer.bind(r);
  r.fireNpcGun=(ship,...rest)=>{const energy=ship.energy,counter=r.projectileCounter;const out=fire(ship,...rest);if((ship.energy<energy||counter!==r.projectileCounter)&&ship.targetId==='player'&&ship.arenaRunEnemy){const m=metric(ship);m.shots++;m.firstShot??=r.save.world.time-m.spawned;}return out;};
  let hits=0;r.damagePlayer=(amount,source,...rest)=>{if(['weapons fire','beam fire','missile strike'].includes(source))hits++;return damage(amount,source,...rest);};
  const t0=performance.now();let simMs=0;let hidden=0,maxHidden=0,hiddenSeconds=0;
  for(let i=0;i<seconds*60;i++){
   p.position=[...hold];p.velocity=[0,0,0];p.throttle=0;p.hull=stats.hull;p.shield=stats.shield;
   const s0=performance.now();r.updateSimulation(1/60,{});simMs+=performance.now()-s0;
   const alive=r.ships.filter(ship=>ship.arenaRunEnemy&&ship.hull>0);
   hidden=alive.length&&!alive.some(ship=>r.shipTracksPlayer(ship))?hidden+1/60:0;maxHidden=Math.max(maxHidden,hidden);if(hidden)hiddenSeconds+=1/60;
   for(const ship of r.ships){
    if(!ship.arenaRunEnemy||ship.hull<=0)continue;const m=metric(ship),max=r.npcFlightStats(ship)?.maxSpeed??100;
    m.steps++;const speed=Math.hypot(...ship.velocity);if(speed<max*.15)m.stuck++;if((ship.fieldNav?.speedLimit??Infinity)<max*.6)m.limited++;if(ship.search)m.search++;
    if(ship.combatBumpAt===r.save.world.time&&r.save.world.time-m.lastBump>.5){m.bumps++;m.lastBump=r.save.world.time;}
    if(i%10===0){a.fromArray(ship.position);b.fromArray(p.position);const d=a.distanceTo(b);if(d<m.range)m.entered??=r.save.world.time-m.spawned;
     if(d<100&&!m.close){m.merges++;m.close=true;}else if(d>160)m.close=false;
     m.dist+=d;m.samples++;if(d<m.range&&!r.lineBlocked(a,b,ship.id))m.lofr++;}
   }
  }
  r.fireNpcGun=fire;r.damagePlayer=damage;
  const ships=[...per.values()].map(m=>{const min=m.steps/3600;return {range:m.range,mergesPerMin:m.merges/Math.max(min,1e-6),fromRange:m.entered==null||m.firstShot==null?null:Math.max(0,m.firstShot-m.entered),hull:m.hull,tier:m.tier,firstShot:m.firstShot==null?null:+m.firstShot.toFixed(1),spm:+(m.shots/Math.max(min,1e-6)).toFixed(1),lofr:+(m.lofr/Math.max(1,m.samples)).toFixed(2),stuck:+(m.stuck/Math.max(1,m.steps)).toFixed(2),limited:+(m.limited/Math.max(1,m.steps)).toFixed(2),search:+(m.search/Math.max(1,m.steps)).toFixed(2),bumps:+(m.bumps/Math.max(min,1e-6)).toFixed(1),meanDist:Math.round(m.dist/Math.max(1,m.samples))};});
  return {ships,hiddenSeconds,maxHidden:+maxHidden.toFixed(1),hitsPerMin:+(hits/(seconds/60)).toFixed(1),msPerStep:+(simMs/(seconds*60)).toFixed(2)};
 },{wave,seconds:SECONDS});
 const avg=k=>{const v=result.ships.map(s=>s[k]).filter(x=>x!=null);return v.length?+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2):null;};
 const summary={site,wave,hiddenSeconds:result.hiddenSeconds,mergesPerMin:avg('mergesPerMin'),fromRange:avg('fromRange'),firstShot:avg('firstShot'),spm:avg('spm'),hitsPerMin:result.hitsPerMin,lofr:avg('lofr'),stuck:avg('stuck'),limited:avg('limited'),search:avg('search'),bumps:avg('bumps'),meanDist:avg('meanDist'),neverFired:result.ships.filter(s=>s.firstShot==null).length,maxHidden:result.maxHidden,msPerStep:result.msPerStep};
 results.push({...summary,ships:result.ships});console.log(JSON.stringify(summary));
}
const keys=['mergesPerMin','hiddenSeconds','fromRange','firstShot','spm','hitsPerMin','lofr','stuck','limited','search','bumps','maxHidden'];
const overall=Object.fromEntries(keys.map(k=>{const v=results.map(r=>r[k]).filter(x=>x!=null);return [k,+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2)];}));
console.log('overall',JSON.stringify(overall));console.log('errors',errors.length?errors:'none');
await writeFile(OUT,JSON.stringify({seed,seconds:SECONDS,overall,results,errors},null,2));
await browser.close();
