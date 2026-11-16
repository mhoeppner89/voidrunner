import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newArenaRun,changeRunHull,chooseRunReward,skipRunReward,runOffers,RUN_EQUIPMENT_RARITY,readArenaRun,writeArenaRun,fitRunItem} from '../../src/game/arenaRun.js';
import {loadoutFor,OUTFIT_ITEMS,HULL_HARDPOINTS,LOADOUT_KEYS} from '../../src/game/outfitting.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {launcherMagazineEntries} from '../../src/game/weapons.js';
import {forgetEquipmentDefinition} from '../../src/game/equipmentCatalog.js';
import {session} from '../helpers/session.mjs';
function ready(hull='scrapper'){const s=newArenaRun(false,718);changeRunHull(s,hull);chooseRunReward(s,s.arenaRun.offers[0]);Object.assign(s.arenaRun,{wave:1,openingPicks:2,rewardChosen:false});return s;}
const count=(s,id)=>LOADOUT_KEYS.flatMap(k=>loadoutFor(s.player)[k]).filter(x=>x===id).length+(s.player.outfitting.locker[id]??0);
test('weapon and launcher rewards grant exactly two copies, with full new magazines',()=>{
 for(const id of ['beam-emitter','ion-blaster','torpedo-launcher','tracking-turret']){
  const s=ready(id==='tracking-turret'?'wayfarer':'scrapper');s.arenaRun.offers=[id];const before=count(s,id);
  if(!chooseRunReward(s,id))continue;
  assert.equal(count(s,id),before+2,id);
  if(OUTFIT_ITEMS[id].category==='launcher')for(const e of launcherMagazineEntries(s.player))assert.equal(e.rounds,e.capacity);
 }
});
test('skipping pays once, keeps an armed opening, and boosts only the next round across reload',()=>{
 const values=new Map();globalThis.window={localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}};
 const empty=newArenaRun(false,718);changeRunHull(empty,'scrapper');assert.equal(skipRunReward(empty),false);
 const s=ready(),r=s.arenaRun,stats=getEffectiveShipStats(s.player);s.player.hull=stats.hull*.2;
 r.offers=['torpedo-launcher'];chooseRunReward(s,'torpedo-launcher');r.rewardChosen=false;
 for(const e of launcherMagazineEntries(s.player))s.player.launcherMagazines[e.mount.id].rounds=0;
 assert.equal(skipRunReward(s),true);assert.ok(Math.abs(s.player.hull-stats.hull*.7)<1e-8);
 for(const e of launcherMagazineEntries(s.player))assert.equal(e.rounds,e.capacity);
 assert.equal(skipRunReward(s),false);assert.equal(r.rarityBonusWave,2);
 r.wave=2;r.rewardChosen=false;r.offers=runOffers(s);
 const equipment=r.offers.filter(id=>OUTFIT_ITEMS[id]);assert.ok(equipment.length>0);assert.ok(equipment.every(id=>{const d=OUTFIT_ITEMS[id],grades=['common','uncommon','rare','named'];return grades.indexOf(d.rarity)>grades.indexOf(OUTFIT_ITEMS[d.baseId].rarity??RUN_EQUIPMENT_RARITY[d.baseId]??'common');}));
 assert.deepEqual(runOffers(s),r.offers,'no reroll on redraw');writeArenaRun(s);equipment.forEach(forgetEquipmentDefinition);
 const restored=readArenaRun();assert.ok(restored);assert.deepEqual(restored.arenaRun.offers,r.offers);
 assert.equal(chooseRunReward(restored,equipment[0]),true);writeArenaRun(restored);equipment.forEach(forgetEquipmentDefinition);
 const again=readArenaRun();assert.ok(count(again,equipment[0])>0);assert.notEqual(OUTFIT_ITEMS[equipment[0]].rarity,'common');
 again.arenaRun.wave=3;again.arenaRun.rewardChosen=false;assert.ok(runOffers(again).filter(id=>OUTFIT_ITEMS[id]).every(id=>!id.startsWith('eq-arena-')));
});
test('a spare earned launcher starts full once; repeatedly refitting a spent launcher cannot reload it',()=>{
 const s=ready('wayfarer');s.arenaRun.offers=['torpedo-launcher'];assert.ok(chooseRunReward(s,'torpedo-launcher'));
 const e=launcherMagazineEntries(s.player)[0],index=HULL_HARDPOINTS[s.player.shipId].weapons.findIndex(m=>m.id===e.mount.id);
 assert.equal(s.player.outfitting.locker['torpedo-launcher'],1);
 assert.ok(fitRunItem(s,'weapons',index,''));assert.ok(fitRunItem(s,'weapons',index,'torpedo-launcher'));
 assert.equal(launcherMagazineEntries(s.player)[0].rounds,e.capacity);
 s.player.launcherMagazines[e.mount.id].rounds=0;
 assert.ok(fitRunItem(s,'weapons',index,''));assert.ok(fitRunItem(s,'weapons',index,'torpedo-launcher'));
 assert.equal(launcherMagazineEntries(s.player)[0].rounds,0);
});
test('Arena and career use identical weapon and collision impact',()=>{
 for(const arena of [false,true]){
  const s=session();s.arena=arena?{run:true}:null;s.save.arenaRun={damage:0};s.save.settings.easyMode=false;s.save.player.shield=0;s.save.player.hull=200;
  s.damagePlayer(10,'weapons fire',false,{kind:'laser'});assert.equal(s.save.player.hull,190);
  s.damagePlayer(10,'collision');assert.equal(s.save.player.hull,180);
 }
});
