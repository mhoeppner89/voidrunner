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
//   bumps      terrain contacts per live fighter-minute (mean of fighter rates)
//   TRACE_CONTACTS=1 records controls and two seconds of approach for each counted impact.
//
//   node tools/playtest/probes/arena-combat.mjs     (VR_BASE_URL, SITES, SECONDS, OUT)
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const seed=Number(process.env.SEED??718);
if(!Number.isSafeInteger(seed))throw new Error('SEED must be an integer');
// PILOT=engage pursues and fires. PILOT=defend returns fire from the spawn point.
// PILOT=bomber WAVE="The line" flies a Thor with three stock tubes and a plasma cannon.
// It tracks the frigate while also measuring potential torpedo locks on the escorts.
const pilot=process.env.PILOT??'hold';
if(!['hold','engage','defend','bomber'].includes(pilot))throw new Error('PILOT accepts hold, engage, defend or bomber');
const SECONDS=+(process.env.SECONDS??60),OUT=process.env.OUT??'output/arena-combat/benchmark.json';
await mkdir(OUT.replace(/\/[^/]*$/,''),{recursive:true});
const chrome=process.env.VR_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
const sites=await page.evaluate(async name=>{
 const {RUN_WAVES}=await import('/src/game/arenaRun.js');
 if(name){
  const index=RUN_WAVES.findIndex(w=>w.name===name);
  if(index<0)throw new Error(`Unknown Arena wave: ${name}`);
  return [[RUN_WAVES[index].site,index]];
 }
 const seen=new Map();RUN_WAVES.forEach((w,i)=>{if(!seen.has(w.site))seen.set(w.site,i);});return [...seen];
},process.env.WAVE??(pilot==='bomber'?'The line':undefined));
const results=[];
for(const [site,wave] of (process.env.SITES?sites.filter(([s])=>process.env.SITES.split(',').includes(s)):sites)){
 const result=await page.evaluate(async({wave,seconds,pilot,traceContacts})=>{
  const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);
  r.clearTransientSpace();r.ships=r.ships.filter(s=>s.arenaRunWingman);const run=r.save.arenaRun;run.wave=wave;run.phase='prepare';run.decisions[wave]=true;run.hullChosen=true;run.rewardChosen=true;run.wingmen=[];
  const bomber=pilot==='bomber';
  const {LAUNCHERS,fillLauncherMagazines}=await import('/src/game/weapons.js');
  const flight=await import('/src/game/weaponFlight.js');
  if(bomber){
   const {createOutfittingState}=await import('/src/game/outfitting.js');
   const p=r.save.player;p.shipId='andromeda';p.ownedShips=[p.shipId];p.outfitting=createOutfittingState(p.ownedShips);
   const fit=p.outfitting.loadouts[p.shipId];fit.launchers.fill('torpedo-launcher');fit.guns=['mortar',null];fit.fireGroups.activeGroup='ALL';
   fillLauncherMagazines(p);p.launcherFireMode='together';r._statsDirty=true;r.syncWeaponProjection();
  }
  r.startRunWave();
  const p=r.save.player,stats=r.playerStats(),hold=[...p.position],per=new Map(),T=await import('/vendor/three.module.min.js'),a=new T.Vector3(),b=new T.Vector3();
  const tactics={cover:0,covered:0,flank:0,flankArrival:0,ambush:0,spring:0};
  const attempts=[],active=new Map();
  const sample=ship=>{
   const t=ship.fieldTactic, pos=a.fromArray(ship.position),goal=b.fromArray(t.route.at(-1));
   return {toGoal:Math.round(pos.distanceTo(goal)),legs:t.route.length,speed:Math.round(Math.hypot(...ship.velocity)),
    cruise:Math.round(ship.speed),hull:Math.round(ship.hull),hidden:r.lineBlocked(pos,b.fromArray(p.position)),
    range:Math.round(pos.distanceTo(b)),targetSpeed:Math.round(Math.hypot(...p.velocity))};
  };
  r.onFieldTactic=(ship,kind)=>{
   if(!ship.arenaRunEnemy)return;
   tactics[kind]++;
   if(kind==='cover'||kind==='flank'||kind==='ambush'){
    const row={kind,ship:ship.id,at:r.save.world.time,start:sample(ship),completed:false};
    active.set(ship,row);attempts.push(row);
   }else if(active.has(ship)){
    const row=active.get(ship);row.completed=true;row.completedAt=r.save.world.time;
   }
  };
  r.onFieldTacticEnd=(ship,reason)=>{
   const row=active.get(ship);if(!row)return;
   row.reason=reason;row.age=+(r.save.world.time-row.at).toFixed(2);row.end=sample(ship);active.delete(ship);
  };
  let dry=0,maxDry=0,enemySteps=0,steps=0;
  const nose=new T.Vector3(0,0,-1),desired=new T.Quaternion(),attitude=new T.Quaternion();
  const {weaponRange}=await import('/src/game/weapons.js');
  const metric=ship=>{let m=per.get(ship.id);if(!m)per.set(ship.id,m={range:Math.max(0,...(ship.combatFit?.weaponDefinitions??[]).filter(Boolean).map(w=>weaponRange(w))),hull:ship.hullId,tier:ship.pilot?.tier,spawned:r.save.world.time,firstShot:null,shots:0,hits:0,steps:0,lofr:0,samples:0,stuck:0,limited:0,search:0,bumps:0,lastBump:-9,dist:0,merges:0,close:false,entered:null});return m;};
  const contacts=[], histories=new Map(), commands=new Map(), lastTactic=new Map();
  const integrate=r.integrateNpcFlight, travel=r.updateTravelAI;
  let step=0;
  function tacticState(ship,now){
   const t=ship.fieldTactic;
   if(t?.kind==='cover') return t.holdUntil?'cover hold':'cover approach';
   if(t?.kind==='flank') return 'flank leg';
   if(t?.kind==='ambush'){
    if(t.firingUntil) return 'ambush shot';
    if(!t.holdUntil) return 'ambush approach';
    return now<t.peekAt?'ambush hold':'ambush step-out';
   }
   const prior=lastTactic.get(ship);
   return prior?.kind==='cover'&&now-prior.at<2?'leaving cover':'ordinary';
  }
  if(traceContacts){
   const originalEnd=r.onFieldTacticEnd;
   r.onFieldTacticEnd=(ship,reason)=>{
    if(ship.fieldTactic?.kind) lastTactic.set(ship,{kind:ship.fieldTactic.kind,at:r.save.world.time,reason});
    originalEnd(ship,reason);
   };
   r.onNpcThrottle=(ship,gun,requested,firing,drifting,routed,ace,judgment,terrain)=>{
    const nav=ship.fieldNav;
    let command=(ace||judgment||terrain)?.kind??(firing?'firing pass':ship.combatIntent??'pursuit');
    if(routed) command='route';
    if(nav.active) command='detour';
    if(nav.speedLimit<requested) command='terrain brake';
    if(nav.noExit) command='no exit';
    if(drifting) command='drift';
    commands.set(ship,{mode:'attack',command});
   };
   r.updateTravelAI=function(ship,dt,waypoint,speed){
    let command=ship.search?'search '+ship.search.phase:'travel';
    if(waypoint) command=speed===0?'hold':ship.fieldTactic?.direct?'direct leg':'route leg';
    commands.set(ship,{mode:'travel',command});
    return travel.call(this,ship,dt,waypoint,speed);
   };
   // Sample before integration. Both velocity and position change on a bounce.
   r.integrateNpcFlight=function(ship,pos,vel,rot,goal,speed,boost,assist,...rest){
    let row;
    if(ship.arenaRunEnemy){
     const nav=ship.fieldNav,tactic=ship.fieldTactic,now=r.save.world.time;
     let history=histories.get(ship);
     if(!history){history={samples:[]};histories.set(ship,history);}
     row={step,at:now,state:tacticState(ship,now),...commands.get(ship),
      position:pos.toArray(),velocity:vel.toArray(),rotation:rot.toArray(),angular:ship.flightAngularVelocity?.toArray(),
      heading:goal.toArray(),throttle:speed,boost,assist,cap:nav?.speedLimit,path:nav?.pathClear,detour:nav?.active,
      recovery:nav?.recovering,noExit:nav?.noExit,waypoint:tactic?.route?.[tactic.index]?.slice(),
      destination:ship.destination?.slice(),shieldDelay:ship.shieldDelay,threat:ship.combatThreatId,
      target:p.position.slice(),targetVelocity:p.velocity.slice(),previousTactic:lastTactic.get(ship)};
     history.current=row;
     if(step%12===0){history.samples.push(row);if(history.samples.length>11)history.samples.shift();}
    }
    const result=integrate.call(this,ship,pos,vel,rot,goal,speed,boost,assist,...rest);
    if(row&&ship.fieldNav?.escapeUntil>row.at){
     row.requestedCommand=row.command;
     row.command=ship.fieldNav.brakeOnly?'surface brake':'surface escape';
     row.escapeBearing=ship.fieldNav.escapeBearing?.toArray();
    }
    return result;
   };
  }
  const fire=r.fireNpcGun.bind(r),damage=r.damagePlayer.bind(r);
  r.fireNpcGun=(ship,...rest)=>{const energy=ship.energy,counter=r.projectileCounter;const out=fire(ship,...rest);if((ship.energy<energy||counter!==r.projectileCounter)&&ship.targetId==='player'&&ship.arenaRunEnemy){const m=metric(ship);m.shots++;dry=0;m.firstShot??=r.save.world.time-m.spawned;}return out;};
  let hits=0;r.damagePlayer=(amount,source,...rest)=>{if(['weapons fire','beam fire','missile strike'].includes(source))hits++;return damage(amount,source,...rest);};
  const t0=performance.now();let simMs=0;let hidden=0,maxHidden=0,hiddenSeconds=0;
  const escortLocks=new Map(),line=new T.Vector3(),escortNose=new T.Vector3(),escortAttitude=new T.Quaternion();
  let frigate,spawnTime,frigateTTK=null,torpedoHits=0,escortSteps=0,progressSteps=0,lockedSteps=0;
  const damageShip=r.damageShip;
  if(bomber)r.damageShip=function(ship,amount,owner,position,weapon,...rest){
   if(ship===frigate&&owner==='player'&&position&&weapon?.id==='torpedo')torpedoHits++;
   return damageShip.call(this,ship,amount,owner,position,weapon,...rest);
  };
  for(let i=0;i<seconds*60;i++){
   step=i;
   const actions={};
   if(pilot!=='engage'&&!bomber){p.position=[...hold];p.velocity=[0,0,0];p.throttle=0;}
   if(pilot!=='hold'){
    if(run.phase!=='combat')break;
    const target=bomber?frigate:r.ships.find(s=>s.arenaRunEnemy&&s.hull>0&&!r.lineBlocked(a.fromArray(p.position),b.fromArray(s.position)));
    if(pilot==='engage')p.throttle=target ? .5 : .25;
    if(target){
     b.fromArray(target.position).sub(a.fromArray(p.position)).normalize();
     desired.setFromUnitVectors(nose,b);attitude.fromArray(p.rotation).rotateTowards(desired,2/60).toArray(p.rotation);
     actions.fire=attitude.angleTo(desired)<.1;
     if(bomber){
      p.throttle=a.distanceTo(line.fromArray(target.position))>250?.85:0;
      if(p.currentTargetId!==target.id)r.selectTarget('ship',target.id,'automatic');
      if(p.missiles>0&&r.rackProgress===1)r.fireMissile();
      actions.fire=actions.fire&&p.missiles===0;
     }
    }
   }
   p.hull=stats.hull;p.shield=stats.shield;steps++;
   const s0=performance.now();r.updateSimulation(1/60,actions);simMs+=performance.now()-s0;
   const alive=r.ships.filter(ship=>ship.arenaRunEnemy&&ship.hull>0);
   if(bomber){
    if(!frigate){frigate=alive.find(s=>s.capitalClass==='frigate');if(frigate)spawnTime=r.save.world.time;}
    if(frigate?.hull<=0){frigateTTK=+(r.save.world.time-spawnTime).toFixed(2);break;}
    for(const ship of alive){
     if(ship.capitalClass)continue;
     const distance=line.fromArray(ship.position).sub(a.fromArray(p.position)).length();line.normalize();
     const rack=LAUNCHERS.torpedo;
     const factor=flight.torpedoMobilityFactor?.(rack,p.velocity,ship.velocity,line,distance)??1;
     const aspect=escortNose.copy(nose).applyQuaternion(escortAttitude.fromArray(ship.rotation)).dot(line);
     // Best case for the bomber: keep its sight on each escort independently.
     const visible=distance<=rack.lockRange&&!r.lineBlocked(a,b.fromArray(ship.position),ship.id);
     const progress=visible?flight.rackLockProgress(escortLocks.get(ship)??0,rack,null,distance,1,aspect,1/60,factor):0;
     escortLocks.set(ship,progress);escortSteps++;
     if(visible&&factor>0)progressSteps++;
     if(progress===1)lockedSteps++;
    }
   }
   for(const ship of active.keys())if(ship.hull<=0||!r.ships.includes(ship))r.onFieldTacticEnd(ship,ship.hull<=0?'killed':'removed');
   enemySteps+=alive.length;dry=alive.length?dry+1/60:0;maxDry=Math.max(maxDry,dry);
   hidden=alive.length&&!alive.some(ship=>r.shipTracksPlayer(ship))?hidden+1/60:0;maxHidden=Math.max(maxHidden,hidden);if(hidden)hiddenSeconds+=1/60;
   for(const ship of r.ships){
    if(!ship.arenaRunEnemy||ship.hull<=0)continue;const m=metric(ship),max=r.npcFlightStats(ship)?.maxSpeed??100;
    m.steps++;const speed=Math.hypot(...ship.velocity);if(speed<max*.15)m.stuck++;if((ship.fieldNav?.speedLimit??Infinity)<max*.6)m.limited++;if(ship.search)m.search++;
    if(ship.combatBumpAt===r.save.world.time&&r.save.world.time-m.lastBump>.5){m.bumps++;m.lastBump=r.save.world.time;
     const h=histories.get(ship);
     if(h)contacts.push({ship:ship.id,hull:ship.hullId,normal:ship.fieldNav?.contactNormal?.toArray(),
      impact:h.current,approach:h.samples.filter(sample=>sample.step<step&&sample.step>=step-120)});}
    if(i%10===0){a.fromArray(ship.position);b.fromArray(p.position);const d=a.distanceTo(b);if(d<m.range)m.entered??=r.save.world.time-m.spawned;
     if(d<100&&!m.close){m.merges++;m.close=true;}else if(d>160)m.close=false;
     m.dist+=d;m.samples++;if(d<m.range&&!r.lineBlocked(a,b,ship.id))m.lofr++;}
   }
  }
  for(const ship of active.keys())r.onFieldTacticEnd(ship,'panelEnd');
  if(bomber)r.damageShip=damageShip;
  r.fireNpcGun=fire;r.damagePlayer=damage;delete r.onFieldTactic;delete r.onFieldTacticEnd;
  if(traceContacts){r.integrateNpcFlight=integrate;r.updateTravelAI=travel;delete r.onNpcThrottle;}
  const ships=[...per.values()].map(m=>{const min=m.steps/3600;return {range:m.range,mergesPerMin:m.merges/Math.max(min,1e-6),fromRange:m.entered==null||m.firstShot==null?null:Math.max(0,m.firstShot-m.entered),hull:m.hull,tier:m.tier,firstShot:m.firstShot==null?null:+m.firstShot.toFixed(1),spm:+(m.shots/Math.max(min,1e-6)).toFixed(1),lofr:+(m.lofr/Math.max(1,m.samples)).toFixed(2),stuck:+(m.stuck/Math.max(1,m.steps)).toFixed(2),limited:+(m.limited/Math.max(1,m.steps)).toFixed(2),search:+(m.search/Math.max(1,m.steps)).toFixed(2),bumps:+(m.bumps/Math.max(min,1e-6)).toFixed(1),meanDist:Math.round(m.dist/Math.max(1,m.samples))};});
  const boss=bomber?{frigateTTK,torpedoHits,remainingHull:frigate?.hull,torpedoesFired:6-p.missiles,escortSteps,progressSteps,lockedSteps}:undefined;
  return {ships,tactics,attempts,contacts,boss,fighterMinutes:enemySteps/3600,maxDry,hiddenSeconds,maxHidden:+maxHidden.toFixed(1),hitsPerMin:+(hits/(steps/3600)).toFixed(1),msPerStep:+(simMs/steps).toFixed(2)};
 },{wave,seconds:SECONDS,pilot,traceContacts:process.env.TRACE_CONTACTS==='1'});
 const avg=k=>{const v=result.ships.map(s=>s[k]).filter(x=>x!=null);return v.length?+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2):null;};
 const summary={site,wave,boss:result.boss,tactics:result.tactics,fighterMinutes:result.fighterMinutes,maxDry:result.maxDry,hiddenSeconds:result.hiddenSeconds,mergesPerMin:avg('mergesPerMin'),fromRange:avg('fromRange'),firstShot:avg('firstShot'),spm:avg('spm'),hitsPerMin:result.hitsPerMin,lofr:avg('lofr'),stuck:avg('stuck'),limited:avg('limited'),search:avg('search'),bumps:avg('bumps'),meanDist:avg('meanDist'),neverFired:result.ships.filter(s=>s.firstShot==null).length,maxHidden:result.maxHidden,msPerStep:result.msPerStep};
 results.push({...summary,ships:result.ships,attempts:result.attempts,...(process.env.TRACE_CONTACTS==='1'?{contacts:result.contacts}:{})});console.log(JSON.stringify(summary));
}
const keys=['mergesPerMin','hiddenSeconds','fromRange','firstShot','spm','hitsPerMin','lofr','stuck','limited','search','bumps','maxHidden'];
const overall=Object.fromEntries(keys.map(k=>{const v=results.map(r=>r[k]).filter(x=>x!=null);return [k,+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2)];}));
console.log('overall',JSON.stringify(overall));console.log('errors',errors.length?errors:'none');
await writeFile(OUT,JSON.stringify({seed,pilot,seconds:SECONDS,overall,results,errors},null,2));
await browser.close();
