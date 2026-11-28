import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {t} from '../../src/game/i18n.js';
import {fixture} from '../helpers/session.mjs';
import {newArenaRun,RUN_WAVES,readArenaRun,writeArenaRun} from '../../src/game/arenaRun.js';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {tickBattle} from '../../src/game/arenaBattle.js';
import {CAPITAL_BLAST_HOLD} from '../../src/game/game.js';

function stage(level,hard=false) {
 const store=new Map();
 globalThis.window={localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
 const s=fixture(),save=s.save=newArenaRun(hard,718),run=save.arenaRun;
 Object.assign(run,{wave:level-1,rewardChosen:true,hullChosen:true,openingPicks:2,decisions:{[level-1]:true}});
 save.player.outfitting.loadouts[save.player.shipId].guns[0]='pulse-cannon';
 s.arena={run:true};s.ui={pushEvent(){},hideArena(){},hidePause(){},showHud(){},showArenaRun(){},logCommsLine(name,line){s.log.push(line);},showPilotLine(name,line){s.radio.push(line);}};
 s.audio={setStationMode(){}};s.log=[];s.radio=[];s.jumps=[];
 s.renderer.spawnHyperdriveStreak=(...args)=>s.jumps.push(args);
 s.updateActiveInstance=()=>{};s.tmpEntryDirection=new THREE.Vector3();
 s.clearTransientSpace=()=>{s.ships=[];};s.selectTarget=(_,id)=>save.player.currentTargetId=id;
 s.startRunWave();s.tickArenaRun(3);return s;
}
function advance(s,dt){s.save.world.time+=dt;s.tickArenaRun(dt);}
const opponents=s=>s.ships.filter(x=>x.arenaRunEnemy&&x.hull>0);

function reachPrimary(s) {
 for(let i=0;i<300&&!s.runBattle.target;i++){
  for(const ship of opponents(s))ship.hull=0;
  advance(s,1);
 }
 assert.ok(s.runBattle.target);
 return s;
}
test('one survivor starts a five-second warning, with one monitor cue and a flanking group',()=>{
 const s=stage(6),cards=[];s.ui.showRangeCue=(...args)=>cards.push(args);
 s.nextChatterAt=999;assert.equal(opponents(s).length,2);
 advance(s,1);assert.equal(s.runBattle.warning,undefined);
 opponents(s)[0].hull=0;advance(s,9);assert.ok(s.runBattle.warning);
 assert.deepEqual(cards,[[t('WAVE {wave}/{total}',{wave:2,total:3}),t('INBOUND {seconds} S',{seconds:5})]]);assert.deepEqual(s.radio,[]);assert.ok(s.log.includes(s.runBattle.warning.line));
 assert.equal(s.nextChatterAt,999);s.nextChatterAt=0;assert.equal(s.chatterOpen(),true);const point=s.runBattle.warning.entry.position;
 advance(s,4.99);assert.equal(s.runBattle.group,1);
 advance(s,.02);assert.equal(s.runBattle.group,2);assert.equal(opponents(s).length,3);
 assert.deepEqual(opponents(s)[1].position,point);assert.equal(cards.length,1);
});
test('Act I timer warns after 40 s. The next pair waits until both fighters fit',()=>{
 // Use a pair from the opening screen to exercise the capacity and timer independently.
 const pair=s=>{s.runBattle.groups[1].enemies=s.runBattle.groups[0].enemies.map(e=>({...e}));return s;};
 const s=pair(stage(5));advance(s,45);assert.equal(s.runBattle.group,1);
 assert.equal(s.runBattle.warning,undefined,'two alive plus two incoming exceeds three');
 opponents(s)[1].hull=0;advance(s,1);advance(s,5);assert.equal(s.runBattle.group,2);
 const v=pair(stage(5));v.runBattle.groups[1].enemies.pop();
 advance(v,39.99);assert.equal(v.runBattle.warning,undefined);
 advance(v,.02);assert.ok(v.runBattle.warning);advance(v,5);assert.equal(v.runBattle.group,2);
 const duel=stage(3);duel.runBattle.group=duel.runBattle.groups.length-1;
 advance(duel,60);assert.equal(duel.runBattle.warning,undefined);
 opponents(duel)[0].hull=0;advance(duel,1);advance(duel,5);
 assert.deepEqual(opponents(duel).map(ship=>ship.hullId),['demon']);
});
test('a later act sends a fitting solo reinforcement after 60 seconds with two survivors',()=>{
 const s=stage(7);s.runBattle.groups[2].enemies=s.runBattle.groups[2].enemies.slice(0,1);opponents(s)[0].hull=0;advance(s,10);advance(s,5);
 assert.equal(s.runBattle.group,2);
 opponents(s)[0].hull=0;assert.equal(opponents(s).length,2);
 advance(s,54.99);assert.equal(s.runBattle.warning,null);
 advance(s,.01);assert.ok(s.runBattle.warning);
 advance(s,5);assert.equal(s.runBattle.group,3);assert.equal(opponents(s).length,3);
});
test('Act V hull trigger and 60-second fallback both wait for free ace slots',()=>{
 for(const damaged of [false,true]){
  const s=stage(25,true),b=s.runBattle;
  b.target.hull=b.target.maxHull*(damaged?.5:1);
  advance(s,damaged?1:60);assert.equal(b.warning,undefined);
  for(const ship of opponents(s))if(ship!==b.target)ship.hull=0;
  advance(s,10);assert.ok(b.warning);advance(s,5);assert.equal(b.group,2);
  assert.equal(opponents(s).filter(x=>!x.capitalClass&&x.pilot.tier==='ace').length,2);
 }
});
test('intercept ends on hull or both engines; retreat jumps leave the pilot alive and the objective in the log',()=>{
 for(const engines of [false,true]){
  const s=reachPrimary(stage(8)),b=s.runBattle,target=b.target;
  if(engines)for(const m of CAPITAL_HULLS.drover.engines)target.capitalMountHull[m.index]=0;
  else target.hull=0;
  advance(s,1);assert.equal(b.outcome,'success');
  assert.ok(opponents(s).every(x=>x.arenaExit&&x.holdFire&&!x.surrendered));
  advance(s,9);assert.equal(opponents(s).length,0);if(engines)assert.ok(target.hull>0&&!target.arenaJumped);assert.ok(s.jumps.length>=2);assert.ok(s.log.length>=2);
  advance(s,2);assert.equal(s.save.arenaRun.wave,8);assert.equal(s.save.arenaRun.rewardChosen,false);
 }
});
test('transport escape skips equipment, preserves the level-nine hire, and checkpoints at that decision',()=>{
 const s=reachPrimary(stage(8)),b=s.runBattle,r=s.save.arenaRun;
 b.target.position=[...b.target.arenaJumpPoint];advance(s,1);assert.equal(b.outcome,'failed');
 assert.equal(b.target.arenaJumped,true);advance(s,9);advance(s,2);
 assert.equal(r.cleared,8);assert.equal(r.phase,'prepare');assert.equal(r.rewardChosen,true);assert.equal(r.hullChosen,false);
 assert.equal(r.offers.length,0);s.arenaRunAction('wingman',r.wingmanOffers[0].id);assert.equal(r.offers.length,0);
 assert.equal(readArenaRun().arenaRun.rewardChosen,true);
});
test('escort broadcasts each threshold and wins only when the living Drover jumps',()=>{
 const s=stage(13),b=s.runBattle,d=b.target;
 const at=seconds=>{d.position=[d.arenaJumpPoint[0]+seconds*d.arenaCruise,...d.arenaJumpPoint.slice(1)];advance(s,1);};
 assert.equal(d.hostile,false);assert.ok(d.velocity.some(Boolean));
 for(const time of [60,30,10])at(time);assert.equal(s.log.length,4);
 at(0);assert.equal(b.outcome,'success');assert.equal(d.arenaJumped,true);
 const fail=stage(13);
 fail.runBattle.target.hull=0;advance(fail,1);assert.equal(fail.runBattle.outcome,'failed');
});
test('Arena carriers fill their own hangars once and replace only losses from intact bays',()=>{
 for(const [level,id,count] of [[10,'rookery',4],[15,'skidbladnir',6]]){
  const s=reachPrimary(stage(level));
  const wave=RUN_WAVES[level-1],b=s.runBattle,carrier=b.target,mounts=CAPITAL_HULLS[id].mounts;
  assert.equal(carrier.variant,id);assert.equal(wave.launch.bays.length,count);
  const step=duration=>{for(let i=0;i<Math.round(duration*10);i++)advance(s,.1);};
  const alive=()=>opponents(s).filter(x=>x.arenaLaunched);
  for(let i=0;i<24;i++){
   step(1);
   for(const fighter of alive())fighter.position[1]+=100;
  }
  assert.equal(alive().length,count);
  assert.equal(new Set(alive().map(f=>f.launchBay)).size,count);
  const original=alive().map(f=>f.id);
  step(60);assert.deepEqual(alive().map(f=>f.id),original);
  const [disabled,loss]=alive();
  const mount=mounts.find(m=>m.node===disabled.launchBay);
  carrier.capitalMountHull[mount.index]=0;
  const mast=mounts.find(m=>m.kind==='mast');if(mast)carrier.capitalMountHull[mast.index]=0;
  assert.equal(alive().length,count,'disabling a bay leaves its deployed fighter aloft');
  disabled.hull=0;loss.hull=0;
  step(.1); // The scripted loss is observed on the next fixed step.
  step(29.9);assert.equal(alive().length,count-2);
  step(.1);assert.equal(alive().length,count-1);
  assert.ok(alive().some(f=>f.launchBay===loss.launchBay&&f.id!==loss.id));
  assert.ok(!alive().some(f=>f.launchBay===disabled.launchBay));
  step(60);assert.equal(alive().length,count-1);
 }
});
test('destroy objectives resolve on the primary; the carrier also requires all launched fighters',()=>{
 const s=reachPrimary(stage(10)),b=s.runBattle;
 advance(s,25);advance(s,5);const launched=opponents(s).filter(x=>x.arenaLaunched);
 assert.equal(launched.length,4);b.target.hull=0;advance(s,1);assert.equal(b.outcome,null);
 launched.forEach(x=>x.hull=0);advance(s,1);assert.equal(b.outcome,'success');
 for(const level of [5,10,25]){
  const s=stage(level);s.loseArenaRun();assert.equal(s.save.arenaRun.phase,'lost');
  const complete=reachPrimary(stage(level));complete.runBattle.target.hull=0;advance(complete,1);assert.equal(complete.runBattle.outcome,'success');
 }
});
test('a destroyed big ship keeps the level running until its explosion has played out',()=>{
 const s=reachPrimary(stage(4)),b=s.runBattle,run=s.save.arenaRun;
 assert.equal(b.target.variant,'barge');
 Object.assign(s.renderer,{spawnExplosion(){},spawnImpact(){}});s.audio.playAtDirection=()=>{};s.audio.play=()=>{};s.hyperdriveInterceptIds=new Set();s.tmpAudioLocal=new THREE.Vector3();s.tmpAudioOrientation=new THREE.Quaternion();
 for(const ship of opponents(s))if(ship!==b.target)ship.hull=0;
 b.target.shield=0;s.damageShip(b.target,1e6,'player',b.target.position);
 const killed=s.save.world.time;assert.ok(s.capitalBlastUntil>=killed+CAPITAL_BLAST_HOLD.corvette);
 const before=run.cleared;
 for(let t=0;t<CAPITAL_BLAST_HOLD.corvette-.5;t+=.5){advance(s,.5);assert.equal(run.cleared,before,'still watching at '+t);}
 advance(s,1);advance(s,.5);assert.equal(run.cleared,4);
});
test('old level-start combat checkpoints restore the same level with a fresh opening group',()=>{
 const s=stage(8),run=s.save.arenaRun;
 run.nextEnemy=3;run.entry=[40,8,0];run.warned=2;
 assert.ok(writeArenaRun(s.save));s.save=readArenaRun();s.setupRun();
 assert.equal(s.save.arenaRun.wave,7);assert.equal(s.save.arenaRun.phase,'prepare');
 s.startRunWave();s.tickArenaRun(3);assert.equal(s.runBattle.group,1);
 assert.equal(s.runBattle.target,undefined);assert.equal(opponents(s).length,RUN_WAVES[7].groups[0].enemies.length);
});

test('an undisturbed Thor holds a real torpedo lock on the escort objective',()=>{
 const s=stage(13),d=s.runBattle.target,bomber=s.ships.find(x=>x.arenaObjectiveAttacker);
 const dir=new THREE.Vector3(...d.velocity).normalize();
 bomber.position=new THREE.Vector3(...d.position).addScaledVector(dir,-410).toArray();
 bomber.rotation=[...d.rotation];bomber.velocity=[...d.velocity];s.pilotLineHistory=new Map();
 const rounds=bomber.combatFit.racks.reduce((sum,r)=>sum+r.missiles,0);
 for(let i=0;i<420&&!s.projectiles.some(p=>p.launcherId==='torpedo');i++){
  s.save.world.time+=1/60;s.flyRunBombingPass(bomber,1/60);
 }
 const torpedo=s.projectiles.find(p=>p.launcherId==='torpedo');
 assert.equal(torpedo?.ownerId,bomber.id);assert.equal(torpedo.targetId,d.id);
 assert.equal(bomber.combatFit.racks.reduce((sum,r)=>sum+r.missiles,0),rounds-1);
});
