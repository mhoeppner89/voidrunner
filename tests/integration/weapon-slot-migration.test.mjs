import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSave, hydrateSave} from '../../src/game/save.js';
import {createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {createOutfittingState, HULL_HARDPOINTS} from '../../src/game/outfitting.js';
import {newArenaRun, RUN_WAVES, runEnemyFit, fitRunItem} from '../../src/game/arenaRun.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {wingmanFitFor} from '../../src/game/shipPool.js';
import {SHIP_MOUNT_ANCHORS} from '../../src/game/shipMounts.js';

// Historical gun and rack positions, followed by the new independent capacities.
const fleet={
 wayfarer:[2,1,2,1],scrapper:[4,1,4,1],speedster:[2,1,2,1],demon:[4,1,4,1],talon:[3,1,3,1],
 legionary:[2,1,4,1],andromeda:[2,2,2,3],torsas:[2,1,3,1],prospector:[1,1,2,1],mule:[2,1,2,1],
 vanguard:[2,3,3,3],lancer:[2,2,3,2],blade:[2,2,4,2],astra:[2,1,3,2],atlas:[1,1,2,2],
};
function oldPlayer(p,hull){
 Object.assign(p,{shipId:hull,ownedShips:[hull],equipment:[],outfitting:createOutfittingState([hull]),inventory:{version:1,items:{}},launcherMagazines:{}});
 p.outfitting.schema=5;
 const fit=p.outfitting.loadouts[hull], [guns,racks]=fleet[hull],n=guns+racks;
 Object.assign(fit,{mountSchema:4,guns:Array(n).fill(null),launchers:Array(n).fill(null),fireGroups:{activeGroup:'B',assignments:{}}});
 p.outfitting.factory[hull].guns=Array(n).fill(false);
 p.outfitting.factory[hull].launchers=Array(n).fill(false);
 return fit;
}
for(const [hull,[oldGuns,oldRacks,guns,racks]] of Object.entries(fleet)){
 test(`${hull} migrates every old gun and fire group and stores guns from rack positions`,()=>{
  const save=createNewSave(361),p=save.player,fit=oldPlayer(p,hull),ids=[];
  save.version=20;
  for(let i=0;i<oldGuns+oldRacks;i++){
   const mountId=`${hull}-weapon-${i}`;
   const record=createEquipmentRecord('pulse-cannon',{id:`eq-test-${hull}-${i}`,rarity:'rare',affixes:['efficient','rapid'],rolls:[.72,.93],location:{kind:'installed',shipId:hull,mountId}});
   fit.guns[i]=record.id;ids.push(record.id);p.inventory.items[record.id]=record;
   fit.fireGroups.assignments[mountId]=i%2?'A':'B';
  }
  const migrated=hydrateSave(save),result=migrated.player,newFit=result.outfitting.loadouts[hull];
  assert.deepEqual(newFit.guns,[...ids.slice(0,oldGuns),...Array(guns-oldGuns).fill(null)]);
  assert.deepEqual(newFit.launchers,Array(racks).fill(null));
  assert.equal(newFit.fireGroups.assignments[`${hull}-gun-0`],'B');
  assert.deepEqual(Object.keys(newFit.fireGroups.assignments).sort(),HULL_HARDPOINTS[hull].guns.map(m=>m.id).sort());
  for(const id of ids.slice(oldGuns)){
   const item=result.inventory.items[id];
   assert.deepEqual(item.location,{kind:'station',stationId:'helix'});assert.equal(result.outfitting.locker[id],1);
   assert.deepEqual(item.rolls,[.72,.93]);assert.equal(item.rarity,'rare');
  }
  const again=hydrateSave(migrated).player;
  assert.deepEqual(again.outfitting,result.outfitting);assert.deepEqual(again.inventory.items,result.inventory.items);
 });
}
test('both Victoria racks keep their individual magazines and selected rack',()=>{
 const save=createNewSave(11),p=save.player,fit=oldPlayer(p,'blade');
 save.version=20;fit.launchers=[null,null,'seeker-launcher','seeker-launcher'];p.activeLauncherMountId='blade-weapon-3';
 p.launcherMagazines={'blade-weapon-2':{launcherId:'seeker',rounds:1},'blade-weapon-3':{launcherId:'seeker',rounds:3}};
 const pilot=hydrateSave(save).player;
 assert.equal(pilot.launcherMagazines['blade-launcher-0'].rounds,1);
 assert.equal(pilot.launcherMagazines['blade-launcher-1'].rounds,3);
 assert.equal(pilot.activeLauncherMountId,'blade-launcher-1');
});
test('a rack from an old gun socket goes to home storage with its magazine during flight',()=>{
 const save=createNewSave(207),p=save.player,fit=oldPlayer(p,'wayfarer');
 save.version=20;p.dockedAt=null;p.lastDockedAt='rook';fit.launchers={'wayfarer-weapon-0':'seeker-launcher'};
 p.launcherMagazines={'wayfarer-weapon-0':{launcherId:'seeker',rounds:3}};
 const migrated=hydrateSave(save),pilot=migrated.player;
 const copies=Object.values(pilot.inventory.items).filter(item=>item.baseId==='seeker-launcher');
 assert.equal(copies.length,1);assert.equal(copies[0].rounds,3);assert.deepEqual(copies[0].location,{kind:'station',stationId:'rook'});
 assert.equal(pilot.missiles,0);assert.deepEqual(hydrateSave(migrated).player.inventory.items,pilot.inventory.items);
});
test('an old Arena save and its independent retry checkpoint store the rack with their respective rounds',()=>{
 const save=newArenaRun(false,18),p=save.player,run=save.arenaRun;
 oldPlayer(p,'wayfarer');delete p.inventory;
 const fit=p.outfitting.loadouts.wayfarer;fit.guns[0]='pulse-cannon';fit.launchers[1]='seeker-launcher';
 p.launcherMagazines={'wayfarer-weapon-1':{launcherId:'seeker',rounds:1}};
 run.checkpoint=structuredClone(p);run.checkpoint.launcherMagazines['wayfarer-weapon-1'].rounds=3;
 save.version=20;const migrated=hydrateSave(save);
 assert.equal(migrated.player.outfitting.locker['seeker-launcher'],1);
 assert.equal(migrated.arenaRun.checkpoint.outfitting.locker['seeker-launcher'],1);
 assert.deepEqual(migrated.arenaRun.storedRounds,{'seeker-launcher':[1]});
 assert.deepEqual(migrated.arenaRun.checkpointStoredRounds,{'seeker-launcher':[3]});
 assert.deepEqual(hydrateSave(migrated).arenaRun.checkpointStoredRounds,{'seeker-launcher':[3]});
 Object.assign(migrated.arenaRun,{phase:'prepare',rewardChosen:true});
 assert.ok(fitRunItem(migrated,'launchers',0,'seeker-launcher'));
 assert.equal(migrated.player.launcherMagazines['wayfarer-launcher-0'].rounds,1);
});
test('each wave opponent and wingman has a full set of guns and physical racks for its hull',()=>{
 const check=(hull,fit)=>{
  const [,,guns,racks]=fleet[hull];
  assert.equal(fit.guns.filter(Boolean).length,guns,hull);
  assert.equal(fit.launchers.filter(Boolean).length,racks,hull);
  assert.equal(SHIP_MOUNT_ANCHORS[hull].guns.length,guns,hull);
  assert.equal(SHIP_MOUNT_ANCHORS[hull].launchers.length,racks,hull);
 };
 for(const hull of Object.keys(fleet))check(hull,createEnemyLoadout({hullId:hull},0,wingmanFitFor(hull)));
 for(const wave of RUN_WAVES)for(const spec of wave.enemies){
  if(spec.capital)continue;
  const fit=createEnemyLoadout(spec,0,runEnemyFit(spec));check(spec.hullId,fit);
  assert.ok((spec.missiles??0)<=fit.racks.reduce((sum,rack)=>sum+rack.missiles,0));
 }
});

test('a retained hull migrates its stored magazines at its own dock',()=>{
 const save=createNewSave(71),p=save.player,spare={};
 const fit=oldPlayer(spare,'blade');fit.launchers=['seeker-launcher',null,'seeker-launcher','seeker-launcher'];
 p.ownedShips.push('blade');p.outfitting.loadouts.blade=fit;p.outfitting.factory.blade=spare.outfitting.factory.blade;
 p.storedShips.blade={locationId:'rook',resources:{launcherMagazines:Object.fromEntries([0,2,3].map((i,j)=>[`blade-weapon-${i}`,{launcherId:'seeker',rounds:j+1}])),activeLauncherMountId:'blade-weapon-3'}};
 const pilot=hydrateSave(save).player,resources=pilot.storedShips.blade.resources;
 assert.equal(resources.launcherMagazines['blade-launcher-0'].rounds,2);
 assert.equal(resources.launcherMagazines['blade-launcher-1'].rounds,3);
 assert.equal(resources.activeLauncherMountId,'blade-launcher-1');
 const displaced=Object.values(pilot.inventory.items).find(i=>i.baseId==='seeker-launcher'&&i.location.kind==='station');
 assert.equal(displaced?.location.stationId,'rook');assert.equal(displaced.rounds,1);
});

for(const keyed of [false,true]) test('v20 singular gun and launcher slots retain items and rounds: '+(keyed?'mount IDs':'arrays'),()=>{
 const save=createNewSave(17),p=save.player,fit=oldPlayer(p,'wayfarer');
 save.version=20;
 const records=['pulse-cannon','gauss-cannon','seeker-launcher'].map((baseId,i)=>{
  const id='eq-legacy-singular-'+i,mountId='wayfarer-weapon-'+i;
  p.inventory.items[id]=createEquipmentRecord(baseId,{id,location:{kind:'installed',shipId:'wayfarer',mountId}});
  return id;
 });
 const slots=arr=>keyed?Object.fromEntries(arr.map((id,i)=>['wayfarer-weapon-'+i,id])):arr;
 fit.gun=slots([records[0],records[1],null]);fit.launcher=slots([null,null,records[2]]);delete fit.guns;delete fit.launchers;
 p.launcherMagazines={'wayfarer-weapon-2':{launcherId:'seeker',rounds:3}};
 const migrated=hydrateSave(save).player;
 assert.deepEqual(migrated.outfitting.loadouts.wayfarer.guns,records.slice(0,2));
 assert.deepEqual(migrated.outfitting.loadouts.wayfarer.launchers,[records[2]]);
 assert.equal(migrated.launcherMagazines['wayfarer-launcher-0'].rounds,3);
 assert.equal(migrated.inventory.items[records[2]].rounds,3);
});
