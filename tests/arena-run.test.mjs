import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './combat-variety.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
import {newArenaRun,runRewardPlan,readArenaRun,writeArenaRun,arenaRecord,RUN_WAVES,ARENA_RUN_KEY,runOffers,chooseRunReward,fitRunItem,changeRunHull,recoverRun} from '../src/game/arenaRun.js';
import {loadoutFor,createOutfittingState,validateLoadout,HULL_HARDPOINTS,LOADOUT_KEYS,OUTFIT_ITEMS,itemFitsMount} from '../src/game/outfitting.js';
import {getEffectiveShipStats} from '../src/game/shipStats.js';
import {launcherMagazineEntries} from '../src/game/weapons.js';
import {GameUI} from '../src/game/ui.js';
import {setLanguage} from '../src/game/i18n.js';
import {DE_CATALOG} from '../src/game/i18n-de.js';
function storage(){const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};return data;}
function runSession(wave=1){const s=fixture();s.save=newArenaRun(false,718);s.save.arenaRun.wave=wave;s.arena={run:true};
 s.ui={pushEvent(){},showArenaRun(){},hideArena(){},hidePause(){},showHud(){}};s.audio={setStationMode(){}};
 s.updateActiveInstance=()=>{};s.setFieldArenaPosition=()=>{};s.setFieldEntryPosition=()=>{};s.tmpEntryDirection=new THREE.Vector3();
 s.clearTransientSpace=()=>{for(const p of s.projectiles)s.projStore.free(p.slot);s.projectiles=[];s.ships=[];};
 s.selectTarget=(kind,id)=>s.save.player.currentTargetId=id;s.setupRun();return s;
}
test('ten actual waves advance once, wait for reinforcements, and unlock hard mode only on victory',()=>{
 const data=storage();data.set('void-privateer-save-v1','career sentinel');const s=runSession(0);
 for(let wave=0;wave<RUN_WAVES.length;wave++){
  const r=s.save.arenaRun;assert.equal(r.wave,wave);assert.equal(r.phase,wave===0?'combat':'prepare');
  if(!r.hullChosen){assert.equal(changeRunHull(s.save,wave===3?'talon':'vanguard'),true);}
  if(!r.rewardChosen)assert.equal(chooseRunReward(s.save,r.offers.includes('repair')?'repair':r.offers[0]),true);
  const hp=s.save.player.hull,missiles=s.save.player.missiles;s.startRunWave();s.tickArenaRun(3);assert.equal(r.phase,'combat');assert.equal(s.save.player.hull,hp);assert.equal(s.save.player.missiles,missiles);
  assert.ok(s.ships.length>0);assert.ok(s.ships.every(x=>x.hostile&&x.noSurrender&&x.position.every(Number.isFinite)));
  if(RUN_WAVES[wave].enemies.some(e=>e[3]>0)){s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);assert.equal(r.phase,'combat','a pending opponent must prevent early victory');}
  s.save.world.time=r.startedAt+20;s.tickArenaRun(20);assert.equal(r.nextEnemy,RUN_WAVES[wave].enemies.length);
  s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);assert.equal(r.cleared,wave+1);
  const recovered=s.save.player.hull;s.tickArenaRun(1);assert.equal(s.save.player.hull,recovered,'recovery cannot repeat');
 }
 assert.equal(s.save.arenaRun.phase,'won');assert.equal(arenaRecord().unlockedHard,true);assert.equal(data.get('void-privateer-save-v1'),'career sentinel');
});
test('offers and accepted equipment survive reload; a reward cannot be taken twice',()=>{
 storage();const save=newArenaRun(false,123),r=save.arenaRun;r.wave=1;r.rewardChosen=false;r.offers=runOffers(save);
 assert.deepEqual(runOffers(save),r.offers);writeArenaRun(save);const restored=readArenaRun();assert.deepEqual(restored.arenaRun.offers,r.offers);
 const id=r.offers[0],plan=runRewardPlan(restored,id);assert.equal(chooseRunReward(restored,id),true);assert.equal(chooseRunReward(restored,id),false);for(const c of plan.changes)assert.equal(loadoutFor(restored.player)[c.key][c.index],id);
 const m=Object.values(HULL_HARDPOINTS.wayfarer.mounts).flat().find(m=>itemFitsMount(OUTFIT_ITEMS[id],m));const key=LOADOUT_KEYS.find(k=>HULL_HARDPOINTS.wayfarer[k].includes(m));
 assert.equal(fitRunItem(restored,key,HULL_HARDPOINTS.wayfarer[key].indexOf(m),id),true);writeArenaRun(restored);assert.ok(loadoutFor(readArenaRun().player)[key].includes(id));
});
test('hull changes preserve all copies, health fraction and limited ordnance; no empty forward fit',()=>{
 for(const id of ['talon','vanguard','prospector','lancer','atlas']){const s=newArenaRun(false,88);s.arenaRun.wave=3;s.arenaRun.hullChosen=false;s.player.hull=getEffectiveShipStats(s.player).hull*.37;
  const count=p=>{const counts={...p.outfitting.locker};for(const k of LOADOUT_KEYS)for(const item of loadoutFor(p)[k])if(item)counts[item]=(counts[item]??0)+1;return Object.fromEntries(Object.entries(counts).filter(([,n])=>n));};
  const before=count(s.player),rounds=s.player.missiles;assert.equal(changeRunHull(s,id),true);assert.deepEqual(count(s.player),before);assert.ok(Math.abs(s.player.hull/getEffectiveShipStats(s.player).hull-.37)<1e-9);assert.ok(s.player.missiles<=rounds);assert.ok(loadoutFor(s.player).guns.some(Boolean));assert.equal(changeRunHull(s,'wayfarer'),false);
 }
});
test('baseline service restores limited hull and one missile; loss remains lost on reload',()=>{
 storage();const s=runSession(),p=s.save.player,stats=getEffectiveShipStats(p);p.hull=stats.hull*.3;
 const magazine=launcherMagazineEntries(p)[0];p.launcherMagazines[magazine.mount.id].rounds=0;
 recoverRun(s.save);assert.ok(Math.abs(p.hull-stats.hull*.5)<1e-8);assert.equal(p.missiles,1);
 s.startRunWave();p.hull=0;s.recoverPlayer();assert.equal(s.save.arenaRun.phase,'lost');assert.equal(readArenaRun().arenaRun.phase,'lost');assert.equal(Boolean(arenaRecord().unlockedHard),false);
});
test('interrupted combat returns to its fixed preparation checkpoint without changing offers or granting repairs',()=>{
 storage();const s=runSession();s.save.player.hull=30;s.startRunWave();const before=readArenaRun();s.save.player.hull=2;s.save.arenaRun.damage=999;s.persistSave();
 assert.deepEqual(readArenaRun(),before);const retained=readArenaRun();const next=runSession();next.save=retained;next.setupRun();assert.equal(next.save.player.hull,30);assert.equal(next.save.arenaRun.damage,0);assert.equal(next.save.arenaRun.phase,'prepare');
});
test('preparation screens render in both languages and every wave briefing is translated',()=>{
 storage();for(const language of ['en','de']){setLanguage(language);const save=newArenaRun(false,77),ui=Object.create(GameUI.prototype),panel={classList:{remove(){}},innerHTML:''};ui.root={querySelector:()=>panel};ui.updateOrientationNotice=()=>{};ui.save=save;ui.runFitOpen=true;ui.showArenaRun(save);assert.match(panel.innerHTML,/run-launch/);assert.match(panel.innerHTML,/run-scroll/);
 save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.arenaRun.offers=runOffers(save);ui.showArenaRun(save);assert.equal((panel.innerHTML.match(/data-run-action="reward"/g)??[]).length,3);assert.match(panel.innerHTML,/data-run-action="accept"[^>]*disabled/);
 }
 for(const wave of RUN_WAVES){assert.ok(DE_CATALOG[wave.name]);assert.ok(DE_CATALOG[wave.hint]);}setLanguage('en');
});

test('hard mode raises pilot tiers and reduces automatic repairs',()=>{
 storage();const s=runSession();s.save.arenaRun.hard=true;s.save.player.hull=20;const max=getEffectiveShipStats(s.save.player).hull;recoverRun(s.save);assert.equal(s.save.player.hull,20+max*.1);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships[0].pilot.tier,'veteran');assert.ok(s.ships[0].combatFit.weapons.length>1);
});

test('repair is offered at 80% or below, replaced above it, including saved offers without rerolling the others',()=>{
 storage();for(const fraction of [.79,.8,.80001,1]){const save=newArenaRun(false,73);save.player.hull=getEffectiveShipStats(save.player).hull*fraction;save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;
 const offers=runOffers(save);assert.equal(offers.length,3);assert.equal(new Set(offers).size,3);assert.equal(offers.includes('repair'),fraction<=.8);
 }
 const save=newArenaRun(false,73);save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.player.hull=getEffectiveShipStats(save.player).hull*.8;
 save.arenaRun.offers=runOffers(save);const first=save.arenaRun.offers.slice(0,2);save.player.hull=getEffectiveShipStats(save.player).hull;writeArenaRun(save);
 const restored=readArenaRun();assert.deepEqual(restored.arenaRun.offers.slice(0,2),first);assert.equal(restored.arenaRun.offers.includes('repair'),false);assert.equal(chooseRunReward(restored,'repair'),false);
});

test('actual undocked preparation fits earned thrusters and preserves inventory through swaps and reloads',()=>{
 storage();const s=runSession(),p=s.save.player;assert.equal(p.dockedAt,undefined);p.outfitting.locker['thrusters-mk2']=1;
 const before=getEffectiveShipStats(p);s.arenaRunAction('fit','thrusters-mk2','drive','0');assert.equal(loadoutFor(p).drive[0],'thrusters-mk2');assert.ok(getEffectiveShipStats(p).angularAcceleration>before.angularAcceleration);assert.equal(p.dockedAt,undefined);assert.equal(p.credits,0);
 assert.equal(loadoutFor(readArenaRun().player).drive[0],'thrusters-mk2');
 assert.equal(fitRunItem(s.save,'drive',0,'engine-mk2'),false,'unearned equipment is not available');
 assert.equal(fitRunItem(s.save,'guns',0,'thrusters-mk2'),false,'mount rules still apply');
 assert.equal(fitRunItem(s.save,'drive',0,''),true);assert.equal(p.outfitting.locker['thrusters-mk2'],1);
 assert.equal(fitRunItem(s.save,'guns',0,''),true);assert.equal(fitRunItem(s.save,'guns',1,''),false,'at least one gun must remain');
 assert.equal(fitRunItem(s.save,'guns',0,'beam-emitter'),true);writeArenaRun(s.save);assert.equal(loadoutFor(readArenaRun().player).guns.filter(x=>x==='beam-emitter').length,2);
 s.startRunWave();assert.equal(fitRunItem(s.save,'drive',0,'thrusters-mk2'),false,'combat fitting remains blocked');
});
test('normal and hard runs introduce finite ordnance only at wave four',()=>{
 for(const hard of [false,true])for(let wave=0;wave<RUN_WAVES.length;wave++){
  storage();const s=runSession();s.save.arenaRun.hard=hard;s.save.arenaRun.wave=wave;
  const notices=[];s.ui.pushEvent=message=>notices.push(message);
  RUN_WAVES[wave].enemies.forEach((spec,index)=>{s.save.arenaRun.entry=[index*50,0,-200];assert.equal(s.spawnRunEnemy(spec,index),true);});
  const stocks=s.ships.map(ship=>ship.combatFit.missiles);
  assert.deepEqual(stocks,[[0],[0,0],[0],[2,0,0],[2,0],[0],[0,3],[2,0,2],[0,2],[0]][wave]);
  assert.equal(notices.filter(message=>/Raketenträger|Missile carrier/.test(message)).length,stocks.filter(n=>n>0).length);
 }
});
test('new runs enter a frozen countdown directly, preserving throttle at every wave and resume',()=>{
 storage();const s=runSession(0),r=s.save.arenaRun,p=s.save.player;
 assert.equal(r.phase,'combat');assert.equal(r.countdown,3);assert.equal(s.ships.length,0);
 const position=[...p.position];p.throttle=.83;s.updateSimulation(1,{});
 assert.deepEqual(p.position,position);assert.equal(p.throttle,.83);assert.equal(r.countdown,2);assert.equal(s.ships.length,0);
 s.tickArenaRun(2);assert.equal(s.ships.length,1);s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);
 assert.equal(r.phase,'prepare');assert.equal(p.throttle,.83);
 const id=r.offers.find(x=>x!=='repair');s.arenaRunAction('reward',id);assert.equal(r.rewardChosen,false);
 s.arenaRunAction('accept');assert.equal(r.phase,'combat');assert.equal(r.countdown,3);assert.equal(p.throttle,.83);
 const saved=readArenaRun();const resumed=runSession();resumed.save=saved;resumed.setupRun();assert.equal(resumed.save.player.throttle,.83);
 resumed.startRunWave();assert.equal(resumed.save.player.throttle,.83);
});
test('weapon sets fit matching mounts atomically and preserve replaced equipment',()=>{
 for(const hull of ['wayfarer','lancer','talon']){
  storage();const save=newArenaRun(false,70);save.player.shipId=hull;save.player.ownedShips=[hull];
  save.player.outfitting=createOutfittingState([hull]);save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.arenaRun.offers=['pulse-cannon'];
  const fit=loadoutFor(save.player),plan=runRewardPlan(save,'pulse-cannon'),centre=fit.guns[2];
  assert.equal(plan.count,2);assert.equal(chooseRunReward(save,'pulse-cannon'),true);
  const after=loadoutFor(save.player);assert.equal(after.guns[0],'pulse-cannon');assert.equal(after.guns[1],'pulse-cannon');
  if(hull==='talon')assert.equal(after.guns[2],centre);
  assert.ok(validateLoadout(save.player,hull,after).ok);
  for(const id of plan.replaced)assert.ok(save.player.outfitting.locker[id]>=plan.replaced.filter(x=>x===id).length);
  const before=JSON.stringify(save.player.outfitting);assert.equal(chooseRunReward(save,'pulse-cannon'),false);assert.equal(JSON.stringify(save.player.outfitting),before);
  writeArenaRun(save);assert.equal(loadoutFor(readArenaRun().player).guns.filter(x=>x==='pulse-cannon').length,after.guns.filter(x=>x==='pulse-cannon').length);
 }
});
test('legacy completed runs stay completed and active checkpoints extend to ten waves',()=>{
 const data=storage();for(const phase of ['prepare','combat','won','lost']){const save=newArenaRun();Object.assign(save.arenaRun,{version:1,wave:7,phase,cleared:phase==='won'?8:7});delete save.arenaRun.totalWaves;data.set(ARENA_RUN_KEY,JSON.stringify(save));const r=readArenaRun().arenaRun;assert.equal(r.phase,phase);assert.equal(r.totalWaves,['won','lost'].includes(phase)?8:10);assert.equal(r.version,2);}
});
test('Vanguard wave precedes a fully serviced frigate boss',()=>{storage();const s=runSession(8);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships.length,2);assert.ok(s.ships.every(x=>x.combatFit.hullId==='vanguard'));s.save.player.hull=5;s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);assert.equal(s.save.arenaRun.wave,9);assert.equal(s.save.player.hull,getEffectiveShipStats(s.save.player).hull);chooseRunReward(s.save,s.save.arenaRun.offers[0]);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships.length,1);assert.equal(s.ships[0].capitalBoss,true);assert.equal(s.ships[0].combatFit.turrets.filter(Boolean).length,4);});

test('frigate spawn search stays ahead even when early positions are obstructed',()=>{storage();const s=runSession(9);s.startRunWave();let attempts=0;s.entryPositionClear=()=>++attempts>18;s.save.arenaRun.entry=[0,0,-200];assert.equal(s.spawnRunEnemy(RUN_WAVES[9].enemies[0],0),true);const delta=new THREE.Vector3(...s.ships[0].position).sub(new THREE.Vector3(...s.save.player.position)),ahead=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...s.save.player.rotation));assert.ok(delta.dot(ahead)>0);});
