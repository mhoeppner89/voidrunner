import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GameSession} from '../../src/game/game.js';
import {fieldWorld} from '../helpers/field-world.mjs';
import {newArenaRun,RUN_WAVES} from '../../src/game/arenaRun.js';
import {wingmanFitFor} from '../../src/game/shipPool.js';
import {shipVsSphere} from '../../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
import {capitalHull} from '../../src/game/capitalHulls.js';
import {damageCapitalMount} from '../../src/game/capitalCombat.js';
import {tickBattle} from '../../src/game/arenaBattle.js';
const mem=new Map();
globalThis.window={localStorage:{getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v)}};
function stage(level,hard=false,seed=718) {
 const s=fieldWorld(seed),save=s.save=newArenaRun(hard,seed),r=save.arenaRun;
 Object.assign(r,{wave:level-1,rewardChosen:true,hullChosen:true,openingPicks:2,decisions:{[level-1]:true},
   wingmen:level>=9?[{id:'w',hullId:'talon',fit:wingmanFitFor('talon'),name:'Wing',alive:true,order:'aggressive'}]:[]});
 save.player.outfitting.loadouts[save.player.shipId].guns[0]='pulse-cannon';
 s.jumps=[];s.events=[];s.radio=[];s.logs=[];s.arena={run:true};s.ui={pushEvent(...a){s.events.push(a)},pushSensor(){},hideArena(){},hidePause(){},showHud(){},showArenaRun(){},logCommsLine(_,line){s.logs.push(line)},showPilotLine(_,line){s.radio.push(line)}};
 Object.assign(s.renderer,{spawnHyperdriveStreak(...args){s.jumps.push(args)},spawnExplosion(){},spawnImpact(){},ensureGlbShipModel(){}});
 s.audio={setStationMode(){},play(){},playAtDirection(){}};s.pilotLineHistory=new Map();
 for(const key of ['tmpRadarPlayer','tmpRadarPos','tmpShipPlayer','tmpShipPos'])s[key]=new T.Vector3();
 s.hyperdriveInterceptIds=new Set();s.capitalSpawnedHomes=new Set();s.pdcAssignments=new Map();s.pdcDefenseChannels=new Map();s.speakerDeaths=new Set();s.shakeStrength=0;
 s.clearTransientSpace=()=>{s.ships.length=0;};
 s.selectTarget=(_,id)=>save.player.currentTargetId=id;s.startRunWave();s.tickArenaRun(3);return s;
}
const tick=(s,dt)=>{s.save.world.time+=dt;s.tickArenaRun(dt)};
const opp=s=>s.ships.filter(x=>x.hull>0&&x.arenaRunEnemy);
function reach(s){for(let i=0;i<270&&!s.runBattle.target;i++){opp(s).forEach(x=>x.hull=0);tick(s,1)}return s.runBattle.target;}

const vec=a=>new T.Vector3().fromArray(a);
const quat=a=>new T.Quaternion().fromArray(a);
function until(s,predicate) {
 for(let i=0;i<2200&&!predicate();i++)tick(s,.1);
 assert.ok(predicate(),'director did not reach the requested state');
}
test('friendly Drover takes friendly fire without retaliating or turning its witnesses hostile',()=>{
 const s=stage(13),d=s.runBattle.target,w=s.ships.find(x=>x.arenaRunWingman),faction=d.faction;
 s.save.player.position=vec(d.position).add(new T.Vector3(0,0,65)).toArray();
 w.position=vec(d.position).add(new T.Vector3(0,0,80)).toArray();
 const health=d.hull+d.shield;
 s.damageShip(d,190,'player');
 assert.ok(d.hull+d.shield<health);
 assert.equal(d.hostile,false);assert.equal(w.hostile,false);assert.equal(d.faction,faction);
 assert.notEqual(d.targetId,'player');
 s.save.player.currentTargetId=d.id;s.setWingOrder('defensive');
 assert.notEqual(w.wingmanTargetId,d.id);
 assert.equal(s.projectileCanHitShip({ownerId:w.id,faction:w.faction,targetId:d.id},d),false);
 // A torpedo remains live after its bomber's wreck has been cleaned up.
 const attacker=opp(s).find(other=>other.arenaObjectiveAttacker);
 s.ships.splice(s.ships.indexOf(attacker),1);
 assert.equal(s.projectileCanHitShip({ownerId:attacker.id,faction:attacker.faction,targetId:d.id},d),true);
 s.damageShip(d,10000,'player');tick(s,.1);assert.equal(s.runBattle.outcome,'failed');
});
for(const level of [8,13])test('crippled Drover keeps half cruise on level '+level,()=>{
 const s=stage(level),d=reach(s),engines=capitalHull(d).engines;
 for(const [i,m] of engines.entries()){
  const hit=vec(m.hitCenter).applyQuaternion(quat(d.rotation)).add(vec(d.position)).toArray();
  damageCapitalMount(d,hit,i===0?10000:m.hull-1);
  assert.equal(d.capitalMountHull[m.index],level===13||i===1?1:0);
 }
 assert.equal(d.engineThrust,.5);assert.ok(vec(d.position).distanceTo(vec(d.arenaJumpPoint))/(d.arenaCruise*d.engineThrust)<300.01);
});
test('aggressive escort reassesses armed bombers by distance to the transport and releases out of range',()=>{
 const s=stage(13),d=s.runBattle.target,w=s.ships.find(x=>x.arenaRunWingman),first=opp(s).find(x=>x.arenaObjectiveAttacker);
 opp(s).filter(x=>x!==first).forEach(x=>x.hull=0);
 until(s,()=>opp(s).filter(x=>x.arenaObjectiveAttacker).length===2);
 const second=opp(s).filter(x=>x.arenaObjectiveAttacker).at(-1);
 const move=(h,x)=>{h.position=vec(d.position).add(new T.Vector3(x,0,0)).toArray();};
 s.save.player.position=[...d.position];move(first,80);move(second,320);
 first.combatFit.racks.forEach(r=>r.missiles=0);
 tick(s,1.01);assert.equal(w.wingmanTargetId,second.id);
 first.combatFit.racks[0].missiles=2;tick(s,.1);assert.equal(w.wingmanTargetId,second.id);
 tick(s,1);assert.equal(w.wingmanTargetId,first.id);
 move(first,3100);move(second,3100);s.syncWingmanOrders();assert.equal(w.wingmanTargetId,undefined);
});
for(const obstructed of [false,true])test('warned entry only moves locally for a physical obstruction: '+obstructed,()=>{
 const s=stage(4);opp(s)[0].hull=0;until(s,()=>s.runBattle.warning?.announced);
 const warned=vec(s.runBattle.warning.entry.position),existing=new Set(opp(s));
 s.save.player.position=warned.clone().lerp(vec(s.save.player.position),.2).toArray();
 if(obstructed){
  const clear=s.siteSpotClear.bind(s);
  s.siteSpotClear=(site,p,...args)=>p.distanceTo(warned)>34&&clear(site,p,...args);
 }
 until(s,()=>s.runBattle.group===2);
 const arrival=opp(s).find(x=>!existing.has(x)),distance=vec(arrival.position).distanceTo(warned);
 if(obstructed)assert.ok(distance>34&&distance<=50,'distance '+distance);
 else assert.equal(distance,0);
});
for(const level of [5,8,10])test('capital arrival preserves a live pilot selection on level '+level,()=>{
 const s=stage(level),b=s.runBattle;
 const primary=b.groups.findIndex(g=>g.enemies.some(x=>x.primary));
 while(b.group<primary){opp(s).forEach(x=>x.hull=0);const before=b.group;until(s,()=>b.group>before);}
 const mark=opp(s)[0];opp(s).slice(1).forEach(x=>x.hull=0);
 s.renderer.setTarget=()=>{};s.selectTarget=GameSession.prototype.selectTarget;
 s.selectTarget('ship',mark.id);assert.equal(s.save.player.currentTargetId,mark.id);until(s,()=>!!b.target);
 assert.equal(s.save.player.currentTargetId,mark.id);
});
test('arriving fighters clear the capital collision hull with a margin at the Shardbelt rim',()=>{
 const s=stage(25),frigate=s.runBattle.target;
 const assertClear=()=>{
  for(const fighter of opp(s).filter(x=>x!==frigate)){
   assert.equal(shipVsSphere(vec(frigate.position),quat(frigate.rotation),frigate.variant,npcShipScaleForVariant(frigate.variant),...fighter.position,18,{}),false,fighter.id);
  }
 };
 assertClear();
 for(const ship of opp(s))if(ship!==frigate)ship.hull=0;
 until(s,()=>s.runBattle.warning?.announced);
 frigate.position=[...s.runBattle.warning.entry.position];
 until(s,()=>s.runBattle.group===2);assertClear();
});
test('an early survivor gate advances timed bombers with at least 15 seconds between arrivals',()=>{
 const s=stage(13),b=s.runBattle;
 for(const group of [2,3]){
  const t=s.save.world.time;opp(s).forEach(x=>x.hull=0);
  until(s,()=>b.group===group);
  const interval=s.save.world.time-t;assert.ok(interval>=15-1e-6&&interval<15.3,'interval '+interval);
 }
});
test('the timed picket relief joins two survivors and its guards target the pilot if the wing is down',()=>{
 const s=stage(21),wing=s.ships.find(ship=>ship.arenaRunWingman);
 const first=opp(s);
 assert.equal(first.length,4);
 assert.ok(first.some(ship=>ship.targetId===wing.id));
 s.powerDownRunWingman(wing);
 first.slice(2).forEach(ship=>ship.hull=0);
 const opening=s.save.world.time;
 until(s,()=>s.runBattle.group===2);
 const interval=s.save.world.time-opening;
 assert.ok(interval>=29.9&&interval<30.2);
 assert.equal(opp(s).filter(ship=>first.includes(ship)).length,2);
 const guards=opp(s).filter(ship=>!first.includes(ship)&&!ship.capitalClass);
 assert.equal(guards.length,2);assert.ok(guards.every(ship=>ship.targetId==='player'));
});
test('Hard promotes carrier-launched fighters',()=>{
 const level=10;
 const s=stage(level,true),d=reach(s);opp(s).filter(x=>x!==d).forEach(x=>x.hull=0);
 until(s,()=>opp(s).some(x=>x.arenaLaunched));
 assert.ok(opp(s).filter(x=>x.arenaLaunched).every(x=>x.pilot.tier==='ace'));
});
test('moving socket warning reuses its pose and its Three.js scratch objects',()=>{
 const s=stage(10),d=reach(s),b=s.runBattle,wave=RUN_WAVES[9];
 b.groups.length=b.group;
 s.renderer.camera=new T.PerspectiveCamera();s.renderer.viewportWidth=1440;s.renderer.viewportHeight=900;
 const markers=new Set();s.ui.setRunInbound=point=>{if(point)markers.add(point);};
 let elapsed=s.save.world.time-s.save.arenaRun.startedAt;
 const step=()=>{s.save.world.time+=1/60;tickBattle(s,wave,elapsed+=1/60);};
 for(let i=0;i<6*60&&!b.wingWarning;i++)step();
 assert.ok(b.wingWarning?.bay);
 markers.clear();
 const original=b.wingWarning.entry,position=original.position,before=position[0],vectors=new Set(),rotations=new Set();
 const watch=(type,set)=>{const fn=type.prototype.fromArray;type.prototype.fromArray=function(...args){set.add(this);return fn.apply(this,args);};return ()=>{type.prototype.fromArray=fn;};};
 const restoreV=watch(T.Vector3,vectors),restoreQ=watch(T.Quaternion,rotations);
 try{for(let i=0;i<60;i++){d.position[0]++;step();}}finally{restoreV();restoreQ();}
 assert.equal(b.wingWarning.entry,original);assert.equal(b.wingWarning.entry.position,position);assert.ok(Math.abs(position[0]-before-60)<.01);
 assert.ok(vectors.size<=3&&rotations.size<=2);assert.equal(markers.size,1);
});
test('a defended Drover thanks the pilot after the last wave, jumps 2.5 s later and the level ends a second after',()=>{
 const s=stage(13),r=s.save.arenaRun,d=s.runBattle.target,b=s.runBattle;
 s.banners=[];s.strips=[];s.ui.showObjectiveBanner=x=>s.banners.push(x);s.ui.setObjectiveStrip=m=>s.strips.push(m);
 tick(s,.2);
 assert.equal(s.banners.length,1,'the escort is announced once');assert.ok(s.banners[0].kicker&&s.banners[0].title&&s.banners[0].line);
 const live=s.strips.at(-1);
 assert.equal(live.tone,'friendly');assert.ok(live.shield>0&&live.hull>0,'the strip shows the Drover\'s shield and hull');
 assert.match(live.status,/\d+:\d\d/,'the strip counts down to the jump');
 for(let i=0;i<600&&!b.outcome;i++){opp(s).forEach(x=>x.hull=0);d.hull=Math.max(d.hull,1);tick(s,.5);}
 assert.equal(b.outcome,'success','beating every wave completes the escort');
 assert.equal(s.radio.length>0,true,'the Drover thanks the pilot');
 assert.ok(s.banners.some(x=>x.tone==='success'),'the outcome is announced');
 assert.ok(!d.arenaJumped,'it does not jump at once');
 for(let i=0;i<23;i++)tick(s,.1);assert.ok(!d.arenaJumped,'still waiting at 2.3 s');
 for(let i=0;i<4;i++)tick(s,.1);assert.ok(d.arenaJumped,'it jumps after 2.5 s');assert.equal(r.phase,'combat');
 for(let i=0;i<7;i++)tick(s,.1);assert.equal(r.phase,'combat','the level holds for a second after the jump');
 for(let i=0;i<6;i++)tick(s,.1);assert.notEqual(r.phase,'combat','then it ends');
});
test('a failed intercept is announced, its escorts jump out and the level ends a second after the last jump',()=>{
 const s=stage(8),r=s.save.arenaRun;
 s.banners=[];s.ui.showObjectiveBanner=x=>s.banners.push(x);s.ui.setObjectiveStrip=()=>{};
 const d=reach(s),b=s.runBattle;
 d.position=[...d.arenaJumpPoint];tick(s,.1);
 assert.equal(b.outcome,'failed','the Drover escaped');assert.ok(d.arenaJumped);assert.ok(s.banners.some(x=>x.tone==='failed'),'the failure is announced');
 for(let i=0;i<200&&r.phase==='combat'&&opp(s).length;i++)tick(s,.1);
 assert.equal(opp(s).length,0,'every hostile has jumped out');
 assert.equal(r.phase,'combat');for(let i=0;i<12;i++)tick(s,.1);assert.notEqual(r.phase,'combat');
});
