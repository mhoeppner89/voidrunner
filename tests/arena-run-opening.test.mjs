import test from 'node:test';
import assert from 'node:assert/strict';
import {newArenaRun,runHullOffers,changeRunHull,runOffers,chooseRunReward,runWingmanOffers,refreshRunWingmanOffers,hireRunWingman,DECISION_STAGES} from '../src/game/arenaRun.js';
import {loadoutFor,LOADOUT_KEYS,OUTFIT_ITEMS,validateLoadout} from '../src/game/outfitting.js';
import {GameUI} from '../src/game/ui.js';
import {ArenaRunMethods} from '../src/game/arenaRunSession.js';
function panel(save){const node={innerHTML:'',classList:{remove(){}}};const ui=Object.create(GameUI.prototype);ui.root={querySelector:()=>node};ui.updateOrientationNotice=()=>{};ui.showArenaRun(save);return node.innerHTML;}
test('opening always offers three player hulls, each starts empty and gets two equipment choices',()=>{
 for(let seed=0;seed<12;seed++)for(const hull of ['wayfarer','scrapper','speedster']){
  const save=newArenaRun(false,seed),r=save.arenaRun;
  assert.equal(r.hullOffers.length,3);assert.ok(r.hullOffers.includes(hull));
  assert.equal((panel(save).match(/data-run-action="hull"/g)??[]).length,3);
  assert.ok(changeRunHull(save,hull));assert.equal(r.hullChosen,true);
  assert.deepEqual(LOADOUT_KEYS.flatMap(k=>loadoutFor(save.player)[k]).filter(Boolean),[]);
  assert.equal(r.offers.length,3);assert.ok(r.offers.every(id=>OUTFIT_ITEMS[id].category==='gun'));
  assert.equal((panel(save).match(/data-run-action="reward"/g)??[]).length,3);
  assert.ok(chooseRunReward(save,r.offers[seed%3]));assert.equal(r.rewardChosen,false);assert.equal(r.openingPicks,1);
  assert.ok(loadoutFor(save.player).guns.some(Boolean));assert.equal(r.offers.length,3);
  assert.ok(chooseRunReward(save,r.offers[0]));assert.equal(r.openingPicks,2);assert.equal(r.rewardChosen,true);
  assert.ok(validateLoadout(save.player,hull,loadoutFor(save.player)).ok);
 }
});
test('every later hull and wingman stage offers three, including refreshed partial rosters',()=>{
 for(const [wave,stage] of Object.entries(DECISION_STAGES)){
  const save=newArenaRun(false,88);save.arenaRun.wave=Number(wave);
  if(stage.type==='hull')assert.equal(runHullOffers(save).length,3);
  else{const r=save.arenaRun;r.wingmanOffers=runWingmanOffers(save).slice(0,1);refreshRunWingmanOffers(save);assert.equal(r.wingmanOffers.length,3);assert.equal((panel(save).match(/data-run-action="wingman"/g)??[]).length,3);}
 }
});
test('equipment offers remain three even after the ordinary upgrade pool is exhausted',()=>{
 const save=newArenaRun(false,32);save.arenaRun.wave=10;
 for(const id of Object.keys(OUTFIT_ITEMS))save.player.outfitting.locker[id]=1;
 assert.equal(runOffers(save).length,3);assert.equal(new Set(runOffers(save)).size,3);
});
test('accepting the first opening reward stays in preparation; the second can launch',()=>{
 const save=newArenaRun(false,7),r=save.arenaRun;r.hullOffers=runHullOffers(save);changeRunHull(save,'scrapper');
 let launched=0,shown=0;const session={save,ui:{runFitNotice:'',setCockpitShip(){}},playerStats:()=>({shield:1000,hull:1000,energyCapacity:1000,fuel:1000}),syncWeaponProjection(){},showRunPreparation(){shown++},startRunWave(){launched++}};
 session.arenaRunAction=ArenaRunMethods.arenaRunAction;
 r.selectedReward=r.offers[0];session.arenaRunAction('accept');assert.equal(launched,0);assert.equal(shown,1);
 r.selectedReward=r.offers[0];session.arenaRunAction('accept');assert.equal(launched,1);
});

test('upgrade stages replace lost pilots but keep surviving pilots and their orders',()=>{
 for(const alive of [true,false]){
  const save=newArenaRun(false,23),r=save.arenaRun;r.wave=12;
  r.wingmen=[{id:'original-pilot',name:'Old Pilot',hullId:'speedster',alive,order:'defensive'}];
  r.wingmanOffers=runWingmanOffers(save);const candidate=r.wingmanOffers[0],wing=hireRunWingman(save,candidate.id);
  assert.equal(wing.alive,true);assert.equal(r.wingmen.length,1);assert.equal(r.decisions[12],true);
  assert.equal(wing.name,alive?'Old Pilot':candidate.name);assert.equal(wing.id,alive?'original-pilot':candidate.id);
  if(alive)assert.equal(wing.order,'defensive');
 }
 const save=newArenaRun(false,4);save.arenaRun.wave=12;save.arenaRun.wingmanOffers=runWingmanOffers(save);
 assert.ok(hireRunWingman(save,save.arenaRun.wingmanOffers[0].id));
});

test('the complete ladder passes every decision and reward without skipping a stage',async()=>{
 const {fixture}=await import('./combat-variety.test.mjs');
 const THREE=await import('../vendor/three.module.min.js');
 const {RUN_WAVES,runRewardPlan,isPendingDecision}=await import('../src/game/arenaRun.js');
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}};
 const s=fixture();s.save=newArenaRun(false,718);s.arena={run:true};
 s.ui={pushEvent(){},showArenaRun(){},hideArena(){},hidePause(){},showHud(){}};s.audio={setStationMode(){}};
 s.updateActiveInstance=()=>{};s.setFieldArenaPosition=()=>{};s.setFieldEntryPosition=()=>{};s.tmpEntryDirection=new THREE.Vector3();
 s.clearTransientSpace=()=>{for(const p of s.projectiles)s.projStore.free(p.slot);s.projectiles=[];s.ships=[];};
 s.selectTarget=(kind,id)=>s.save.player.currentTargetId=id;s.setupRun();
 for(let wave=0;wave<RUN_WAVES.length;wave++){
  const r=s.save.arenaRun;assert.equal(r.wave,wave);
  if(isPendingDecision(s.save)){
   const stage=DECISION_STAGES[wave];
   if(stage.type==='hull'){
    assert.equal(r.hullOffers.length,3);assert.ok(r.hullOffers.some(id=>changeRunHull(s.save,id)));
   }else{
    assert.equal(r.wingmanOffers.length,3);assert.ok(hireRunWingman(s.save,r.wingmanOffers[0].id));
   }
  }
  while(!r.rewardChosen){assert.equal(r.offers.length,3);assert.ok(chooseRunReward(s.save,r.offers.find(id=>runRewardPlan(s.save,id))));}
  s.startRunWave();assert.equal(r.phase,'combat');
  s.tickArenaRun(3);s.save.world.time=r.startedAt+40;s.tickArenaRun(40);
  assert.equal(r.nextEnemy,RUN_WAVES[wave].enemies.length);
  s.ships.forEach(ship=>ship.hull=0);s.tickArenaRun(0);s.save.world.time+=2;s.tickArenaRun(2);
  assert.equal(r.cleared,wave+1);
 }
 assert.equal(s.save.arenaRun.phase,'won');
});
