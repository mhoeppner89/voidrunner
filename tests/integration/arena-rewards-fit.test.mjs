import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newArenaRun,runOffers,runRewardPlan,chooseRunReward,rewardFitScore} from '../../src/game/arenaRun.js';
import {createOutfittingState,OUTFIT_ITEMS,loadoutFor} from '../../src/game/outfitting.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {createEquipmentRecord,registerInventoryDefinitions} from '../../src/game/equipmentInventory.js';

function ready(seed=718,hull='talon',wave=5){
 const save=newArenaRun(false,seed),p=save.player;
 p.shipId=hull;p.ownedShips=[hull];p.outfitting=createOutfittingState([hull]);
 Object.assign(save.arenaRun,{wave,phase:'prepare',hullChosen:true,rewardChosen:false,openingPicks:2});
 p.hull=getEffectiveShipStats(p).hull;return save;
}

test('a run starts without the useless mining drone, so a combat drone can take its bay',()=>{
 const p=newArenaRun(false,9).player;
 assert.ok(Object.values(p.droneFleet.unitsById).every(unit=>unit.type!=='mining'));
 assert.ok(loadoutFor(p).droneBays.every(bay=>bay.unitIds.every(id=>!id)));
});

test('hulls with drone bays are offered combat drones, which install into the bay',()=>{
 let offered=0;
 for(let seed=0;seed<40;seed++){const save=ready(seed,'atlas',4);if(runOffers(save).some(id=>OUTFIT_ITEMS[id]?.category==='drone'))offered++;}
 assert.ok(offered>0,'Atlas (four bays) sees drone rewards');
 for(const seed of [1,2,3])assert.ok(runOffers(ready(seed,'talon',4)).every(id=>OUTFIT_ITEMS[id]?.category!=='drone'),'a hull without bays never does');
 const save=ready(3,'atlas',4);save.arenaRun.offers=['pdc-drone'];
 assert.ok(chooseRunReward(save,'pdc-drone'));
 const p=save.player,bay=loadoutFor(p).droneBays[0],unit=p.droneFleet.unitsById[bay.unitIds[0]];
 assert.equal(unit?.type,'pdc');assert.equal(bay.mode,'pdc');
 const next=runRewardPlan(save,'pdc-drone');
 assert.notEqual(next?.changes[0].index,0,'the next PDC drone goes to another bay');
});

test('rewards are scored against what they replace: upgrades and empty bays first, downgrades last',()=>{
 const save=ready(5,'talon',6),fit=save.player.outfitting.loadouts.talon;
 const better=createEquipmentRecord('pulse-cannon',{id:'eq-test-better',tier:2,rarity:'rare',affixes:[]});
 const worse=createEquipmentRecord('pulse-cannon',{id:'eq-test-worse',tier:1,rarity:'common',affixes:[]});
 registerInventoryDefinitions({items:{[better.id]:better,[worse.id]:worse}});
 // Every bay full: the plain gun can only replace a better one.
 fit.guns.fill(better.id);
 assert.ok(rewardFitScore(save,worse.id)<1,'a plain gun over a better one is a downgrade');
 const upgrade=createEquipmentRecord('pulse-cannon',{id:'eq-test-upgrade',tier:3,rarity:'rare',affixes:[]});
 registerInventoryDefinitions({items:{[upgrade.id]:upgrade}});
 assert.ok(rewardFitScore(save,upgrade.id)>1,'a higher grade over it is an upgrade');
 fit.turrets.fill(null);
 const turret=runRewardPlan(save,'tracking-turret');
 if(turret)assert.ok(rewardFitScore(save,'tracking-turret',turret)>=1.5,'filling an empty bay ranks high');
});

test('a better rack replaces the old rack, not a gun',()=>{
 const save=ready(7,'legionary',6),fit=save.player.outfitting.loadouts.legionary;
 const rackIndex=fit.launchers.findIndex(Boolean);assert.ok(rackIndex>=0,'fixture: stock rack fitted');
 const plan=runRewardPlan(save,'swarm-launcher');
 assert.ok(plan);assert.equal(plan.changes[0].index,rackIndex);assert.equal(plan.changes[0].key,'launchers');
});

test('moving a launcher between mounts keeps its missiles; the fullest stored rack goes back in first',async()=>{
 const {fitRunItem}=await import('../../src/game/arenaRun.js');
 const {HULL_HARDPOINTS}=await import('../../src/game/outfitting.js');
 const {normalizeLauncherMagazines,launcherMagazineEntries}=await import('../../src/game/weapons.js');
 const save=ready(11,'andromeda',6),p=save.player;save.arenaRun.rewardChosen=true;
 p.outfitting.loadouts.andromeda.launchers[1]=null;normalizeLauncherMagazines(p,{fill:true});
 const spec=HULL_HARDPOINTS.andromeda,fit=p.outfitting.loadouts.andromeda,from=fit.launchers.findIndex(Boolean),rack=fit.launchers[from];
 const to=spec.launchers.findIndex((m,i)=>i!==from&&!fit.launchers[i]);
 assert.ok(from>=0&&to>=0,'fixture: a fitted rack and a free weapon mount');
 p.launcherMagazines[spec.launchers[from].id].rounds=2;normalizeLauncherMagazines(p);
 assert.ok(fitRunItem(save,'launchers',from,null),'take the rack off');
 assert.ok(fitRunItem(save,'launchers',to,rack),'mount it elsewhere');
 assert.equal(launcherMagazineEntries(p).find(e=>e.mount.id===spec.launchers[to].id)?.rounds,2);
 assert.equal(save.arenaRun.storedRounds?.[rack],undefined,'the stored count was used up');
});
