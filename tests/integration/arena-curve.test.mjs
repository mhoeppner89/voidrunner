import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newArenaRun,runOffers,refreshRunRewardOffers,chooseRunReward,writeArenaRun,readArenaRun} from '../../src/game/arenaRun.js';
import {createOutfittingState,OUTFIT_ITEMS,loadoutFor,validateLoadout} from '../../src/game/outfitting.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {equipmentBaseId,forgetEquipmentDefinition} from '../../src/game/equipmentCatalog.js';
import {session} from '../helpers/session.mjs';
import * as THREE from '../../vendor/three.module.min.js';
function ready(seed=718,hull='talon',wave=5){
 const save=newArenaRun(false,seed),p=save.player;
 p.shipId=hull;p.ownedShips=[hull];p.outfitting=createOutfittingState([hull]);
 Object.assign(save.arenaRun,{wave,phase:'prepare',hullChosen:true,rewardChosen:false,openingPicks:2});
 p.hull=getEffectiveShipStats(p).hull;return save;
}
test('tier-2 hull draws matching gear with occasional tier-3 upgrades; tier-3 hulls get tier-3 gear',()=>{
 let matching=0,higher=0;
 for(let seed=0;seed<100;seed++)for(const hull of ['talon','blade']){
  const save=ready(seed,hull),offers=runOffers(save);assert.equal(offers.length,3);
  assert.deepEqual(runOffers(save),offers,'redraw cannot reroll the tier');
  for(const id of offers){const d=OUTFIT_ITEMS[id];if(!d)continue;assert.ok(d.tier>=2);
   if(hull==='blade')assert.equal(d.tier,3);
   else if(d.tier===2)matching++;else higher++;
  }
 }
 assert.ok(higher>0&&higher/(matching+higher)>.08&&higher/(matching+higher)<.4,JSON.stringify({matching,higher}));
});
test('a saved tier-1 draw is upgraded, selection is reviewed and earned paired weapons survive reload',()=>{
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}};
 const save=ready();Object.assign(save.arenaRun,{offers:['pulse-cannon','shield-mk2','sustained-reactor'],selectedReward:'pulse-cannon'});
 writeArenaRun(save);const restored=readArenaRun();assert.ok(restored);
 assert.equal(restored.arenaRun.selectedReward,null);
 for(const id of restored.arenaRun.offers)assert.ok(OUTFIT_ITEMS[id].tier>=2);
 const gun=restored.arenaRun.offers.find(id=>OUTFIT_ITEMS[id].category==='gun'),tier=OUTFIT_ITEMS[gun].tier;
 assert.equal(chooseRunReward(restored,gun),true);assert.equal(loadoutFor(restored.player).guns.filter(id=>id===gun).length+(restored.player.outfitting.locker[gun]??0),2);
 writeArenaRun(restored);Object.keys(restored.arenaRun.rewardRecords).forEach(forgetEquipmentDefinition);
 const again=readArenaRun();assert.ok(again);assert.equal(OUTFIT_ITEMS[gun].tier,tier);assert.equal(loadoutFor(again.player).guns.filter(id=>id===gun).length+(again.player.outfitting.locker[gun]??0),2);
 assert.ok(validateLoadout(again.player,'talon',loadoutFor(again.player)).ok);
});
test('tiers cover guns, launchers, utilities and turrets, and lower-tier installed gear does not suppress an upgrade',()=>{
 const categories=new Set();let reactors=0;
 for(let seed=0;seed<80;seed++){
  const save=ready(seed,'legionary',10);loadoutFor(save.player);const fit=save.player.outfitting.loadouts.legionary;fit.utility[0]='sustained-reactor';
  for(const id of runOffers(save)){const d=OUTFIT_ITEMS[id];if(!d)continue;categories.add(d.category);assert.ok(d.tier>=2);if(equipmentBaseId(id)==='sustained-reactor')reactors++;}
 }
 for(const category of ['gun','launcher','turret','power','drive','defense'])assert.ok(categories.has(category),category);
 assert.ok(reactors>0,'an installed tier-I reactor does not suppress tier-II/III replacements');
});
test('announced Arena missile stocks remain finite through the actual rack firing path',()=>{
 for(const missiles of [0,1,2]){
  const s=session();s.save=ready();s.save.player.position=[0,0,0];s.save.player.dockedAt=undefined;
  s.save.arenaRun.entry=[0,0,1200];s.selectTarget=()=>{};s.setOwnMonitorStatus=()=>{};
  assert.ok(s.spawnRunEnemy({hullId:'blade',role:'patrol',tier:'veteran',missiles},0));
  const ship=s.ships.at(-1);ship.position=[0,0,200];ship.rotation=[0,0,0,1];ship.targetId='player';
  assert.equal(ship.combatFit.racks.reduce((sum,r)=>sum+r.missiles,0),missiles);
  for(let frame=0;frame<45*60;frame++){s.save.world.time=frame/60;s.updateNpcOrdnance(ship,new THREE.Vector3(),1/60);}
  assert.equal(s.projectiles.filter(p=>p.kind==='missile').length,missiles);
  assert.equal(ship.combatFit.racks.reduce((sum,r)=>sum+r.missiles,0),0);
 }
});
