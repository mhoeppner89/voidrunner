import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {BASE_OUTFIT_ITEMS,OUTFIT_ITEMS,HULL_HARDPOINTS,LOADOUT_KEYS,normalizeOutfitting} from '../../src/game/outfitting.js';
import {normalizeEquipmentInventory,equipmentAction,createEquipmentRecord,receiveEquipment,refreshInventoryProjection} from '../../src/game/equipmentInventory.js';
import {weaponForOutfit,mountedLauncherEntries,normalizeLauncherMagazines} from '../../src/game/weapons.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {cargoMass} from '../../src/game/economy.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {equipCareerItems,makeCareerWreck,combatWreckNode,recoverWreckEntry} from '../../src/game/careerLoot.js';
const make=()=>createNewSave(714,{tutorial:false});
const ids=p=>Object.keys(p.inventory.items).sort();
test('all hulls expose four physical mount types without size restrictions',()=>{
 for(const spec of Object.values(HULL_HARDPOINTS)){
  assert.deepEqual(Object.keys(spec.mounts),['weapon','turret','utility']);
  assert.equal(spec.guns,spec.launchers,'runtime views share the same weapon seats');
  for(const m of [...spec.weapons,...spec.utility])assert.equal(m.size,undefined);
 }
});
test('schema 3 fits and counted stock migrate once with all paid/factory copies intact',()=>{
 const s=make(),p=s.player;p.inventory=undefined;p.outfitting={schema:3,locker:{'pulse-cannon':2,'shield-mk2':1},factoryLocker:{},loadouts:{wayfarer:{guns:['beam-emitter','gauss-cannon'],launchers:['seeker-launcher'],turrets:['pdc'],power:['capacitor-bank'],drive:['engine-mk2'],defense:['shield-mk2'],utility:['radar-mk2','cargo-pods'],droneBays:p.outfitting.loadouts.wayfarer.droneBays,fireGroups:{activeGroup:'B',assignments:{'wayfarer-gun-0':'A','wayfarer-gun-1':'B'}}}},factory:{wayfarer:{guns:[true,false],launchers:[true],turrets:[false],power:[false],drive:[false],defense:[false],utility:[false,false]}}};p.equipment=[];
 normalizeEquipmentInventory(p);assert.equal(ids(p).length,12);assert.equal(p.outfitting.loadouts.wayfarer.launchers[2]!=null,true);
 assert.equal(p.outfitting.loadouts.wayfarer.utility.filter(Boolean).length,5);const before=ids(p);
 for(let i=0;i<4;i++)normalizeEquipmentInventory(p);assert.deepEqual(ids(p),before);
 const restored=hydrateSave(JSON.parse(JSON.stringify(s)));assert.deepEqual(ids(restored.player),before);assert.equal(restored.player.outfitting.loadouts.wayfarer.fireGroups.assignments['wayfarer-weapon-1'],'B');
 assert.equal(Object.values(p.inventory.items).filter(i=>i.factory).length,2);
});
test('gun and launcher replacements share a seat; ammo persists with stable mount IDs',()=>{
 const p=make().player,original=ids(p),b=equipmentAction(p,'buy',{baseId:'gauss-cannon'});assert.ok(b.ok);
 assert.ok(equipmentAction(p,'install',{id:b.id,mountId:'wayfarer-weapon-2'}).ok);assert.equal(p.outfitting.loadouts.wayfarer.launchers[2],null);
 const old=original.find(id=>p.inventory.items[id].baseId==='seeker-launcher');assert.equal(p.inventory.items[old].location.kind,'station');
 assert.ok(equipmentAction(p,'install',{id:old,mountId:'wayfarer-weapon-0'}).ok);assert.equal(p.outfitting.loadouts.wayfarer.guns[0],null);normalizeLauncherMagazines(p);p.launcherMagazines['wayfarer-weapon-0'].rounds=2;normalizeLauncherMagazines(p);assert.equal(p.launcherMagazines['wayfarer-weapon-0'].rounds,2);
 assert.equal(mountedLauncherEntries(p).length,1);assert.equal(new Set(Object.values(p.outfitting.loadouts).flatMap(f=>LOADOUT_KEYS.flatMap(k=>f[k]).filter(Boolean))).size,3);
});
test('rare stats used in flight match the recovered item; common migration preserves baseline',()=>{
 const p=make().player,item=createEquipmentRecord('gauss-cannon',{tier:3,rarity:'rare',affixes:['efficient','rapid'],location:{kind:'station',stationId:'helix'}});p.inventory.items[item.id]=item;refreshInventoryProjection(p);
 assert.ok(equipmentAction(p,'install',{id:item.id,mountId:'wayfarer-weapon-0'}).ok);const w=weaponForOutfit(item.id);assert.ok(w.damageFlat>weaponForOutfit('gauss-cannon').damageFlat);assert.ok(w.cooldown<1.1);assert.equal(weaponForOutfit(item.id),w,'resolved flight object is cached');assert.ok(w.energyCost>0);
 const stats=getEffectiveShipStats(p);assert.equal(stats.energyCapacity,60);assert.equal(stats.reactorOutput,12);
});
test('station storage is local, cargo is mass-limited, sales are atomic and bundled parts cannot be sold',()=>{
 const p=make().player,b=equipmentAction(p,'buy',{baseId:'gauss-cannon'});assert.ok(b.ok);assert.ok(equipmentAction(p,'carry',{id:b.id}).ok);assert.equal(cargoMass(p),4);assert.ok(equipmentAction(p,'store',{id:b.id}).ok);
 p.dockedAt='rook';assert.equal(equipmentAction(p,'install',{id:b.id,mountId:'wayfarer-weapon-0'}).ok,false);p.dockedAt='helix';
 const factory=Object.values(p.inventory.items).find(i=>i.factory);assert.ok(equipmentAction(p,'remove',{id:factory.id}).ok);assert.equal(equipmentAction(p,'sell',{id:factory.id}).ok,false);
 const credit=p.credits;assert.ok(equipmentAction(p,'sell',{id:b.id}).ok);assert.ok(p.credits>credit);assert.equal(equipmentAction(p,'sell',{id:b.id}).ok,false);
 p.cargo.ore=1000;const next=equipmentAction(p,'buy',{baseId:'pulse-cannon'});assert.ok(next.ok,'station purchases do not need cargo space');const wallet=p.credits;assert.equal(equipmentAction(p,'carry',{id:next.id}).ok,false);assert.equal(p.credits,wallet);assert.equal(p.inventory.items[next.id].location.kind,'station');
});
function session(seed=714){const save=createNewSave(seed,{tutorial:false});save.player.dockedAt=undefined;save.player.position=[0,0,0];return {save,ships:[],activeInstanceId:'shardbelt',npcHullExtents:()=>[4,3,12],careerRegionAt:()=>({danger:1.4}),playerStats:()=>getEffectiveShipStats(save.player),wreckNodes:[]};}
function ship(s){const a={id:'ship-1',name:'Test NPC',role:'pirate',hullId:'talon',pilot:{tier:'veteran'},position:[20,0,0],velocity:[0,0,0],cargo:{ore:12,food:3}};a.combatFit=createEnemyLoadout(a,1);equipCareerItems(s,a);return a;}
test('career destruction rolls actual cargo/equipment once and keeps the result through reload',()=>{
 const s=session(),a=ship(s),w=makeCareerWreck(s,a);assert.ok(w);assert.equal(makeCareerWreck(s,a),null);for(const e of w.contents)if(e.item)assert.ok(a.equipmentRecords.some(r=>r.item.id===e.item.id));
 assert.ok(w.contents.filter(e=>e.kind==='cargo').every(e=>e.quantity<=a.cargo[e.commodity]));const snapshot=JSON.stringify(w);const restored=hydrateSave(JSON.parse(JSON.stringify(s.save)));assert.equal(JSON.stringify(restored.world.combatWrecks[w.id]),snapshot);
});
test('arena, arena run and spectator never roll career loot or instantiate rarity',()=>{
 for(const arena of [{},{run:true},{observer:true}]){const s=session();s.arena=arena;const a=ship(s);assert.equal(a.equipmentRecords,undefined);assert.equal(makeCareerWreck(s,a),null);assert.equal(s.save.world.combatWrecks,undefined);}
});
test('capture preserves intact modules, destroyed turrets cannot drop, and recovery cannot duplicate',()=>{
 const s=session(),a=ship(s);a.capitalMountHull=[0];a.equipmentRecords.push({key:'turrets',index:0,item:createEquipmentRecord('pdc')});const w=makeCareerWreck(s,a,{captured:true});s.wreckNodes.push(combatWreckNode(w));assert.equal(w.contents.some(e=>e.item?.baseId==='pdc'),false);
 const e=w.contents.find(e=>e.kind==='equipment'),before=ids(s.save.player).length;assert.ok(recoverWreckEntry(s,w.id,e.id).ok);assert.equal(ids(s.save.player).length,before+1);assert.equal(recoverWreckEntry(s,w.id,e.id).ok,false);assert.equal(s.save.player.inventory.items[e.id].location.kind,'cargo');
});
test('a full hold leaves the selected salvage in the wreck',()=>{
 const s=session(),a=ship(s),w=makeCareerWreck(s,a,{captured:true});s.wreckNodes.push(combatWreckNode(w));s.save.player.cargo.ore=1000;const e=w.contents.find(e=>e.kind==='equipment');assert.equal(recoverWreckEntry(s,w.id,e.id).ok,false);assert.ok(w.contents.includes(e));assert.equal(receiveEquipment(s.save.player,e.item).ok,false);
});

test('launcher ammunition follows its item through refits and save reloads',()=>{
 const s=make(),p=s.player,id=p.outfitting.loadouts.wayfarer.launchers[2];
 p.launcherMagazines['wayfarer-weapon-2'].rounds=2;
 assert.ok(equipmentAction(p,'remove',{id}).ok);assert.equal(p.inventory.items[id].rounds,2);
 assert.ok(equipmentAction(p,'install',{id,mountId:'wayfarer-weapon-1'}).ok);assert.equal(p.launcherMagazines['wayfarer-weapon-1'].rounds,2);
 const restored=hydrateSave(JSON.parse(JSON.stringify(s)));assert.equal(restored.player.launcherMagazines['wayfarer-weapon-1'].rounds,2);
});
test('trade-in preserves paid instances and retained ship switches preserve the same fit',async()=>{
 const {quoteShipTrade,commitShipTrade}=await import('../../src/game/shipTrade.js');
 const s=make(),p=s.player,b=equipmentAction(p,'buy',{baseId:'gauss-cannon'});assert.ok(equipmentAction(p,'install',{id:b.id,mountId:'wayfarer-weapon-0'}).ok);
 const factory=Object.values(p.inventory.items).filter(i=>i.factory&&i.location.kind==='installed').map(i=>i.id);
 const q=quoteShipTrade(p,'talon');assert.ok(q.ok,q.code);assert.ok(commitShipTrade(p,q).ok);
 assert.equal(p.inventory.items[b.id].location.stationId,'helix');for(const id of factory)assert.equal(p.inventory.items[id],undefined);
 const before=ids(p);const kept=quoteShipTrade(p,'atlas',{keepCurrent:true});assert.ok(commitShipTrade(p,kept).ok);const ownIds=ids(p);
 assert.ok(commitShipTrade(p,quoteShipTrade(p,'talon')).ok);assert.deepEqual(ids(p),ownIds);assert.ok(before.every(id=>ownIds.includes(id)));
});
test('save boundary rejects invalid and duplicated loot without rerolling intact gear',()=>{
 const s=session(),a=ship(s),w=makeCareerWreck(s,a,{captured:true}),item=w.contents.find(e=>e.item).item;
 s.save.world.combatWrecks.bad={id:'bad',position:[null,1,2],contents:[null]};w.contents.push({id:'bad',kind:'equipment',item:{id:'bad',baseId:'constructor'}});
 s.save.world.orphanDrones={bad:{id:'bad',type:'attack',systemId:s.save.player.systemId,position:[null,0,0],hull:1}};
 const next=hydrateSave(JSON.parse(JSON.stringify(s.save)));assert.equal(next.world.combatWrecks.bad,undefined);assert.deepEqual(next.world.orphanDrones,{});assert.equal(next.world.combatWrecks[w.id].contents.some(e=>e.id==='bad'),false);assert.ok(next.world.combatWrecks[w.id].contents.some(e=>e.id===item.id));
});
test('deployed drones remain recoverable and stored drones keep their damage and ammo',async()=>{
 const {createDroneUnit,createDroneFleet}=await import('../../src/game/droneData.js');
 const s=session(),a=ship(s);a.droneFleet=createDroneFleet();const active=createDroneUnit('deployed','pdc');Object.assign(active,{state:'escort',position:[5,0,0],hull:12,ammo:7});a.droneFleet.unitsById[active.id]=active;
 makeCareerWreck(s,a);assert.equal(active.orphaned,true);assert.equal(s.save.world.orphanDrones.deployed.hull,12);
 const b=ship(s);b.droneFleet=createDroneFleet();const stored=createDroneUnit('stored','pdc');Object.assign(stored,{hull:9,ammo:11});b.droneFleet.unitsById[stored.id]=stored;
 const w=makeCareerWreck(s,b,{captured:true});s.wreckNodes.push(combatWreckNode(w));const entry=w.contents.find(e=>e.kind==='drone');assert.ok(recoverWreckEntry(s,w.id,entry.id).ok);const recovered=Object.values(s.save.player.droneFleet.unitsById).find(u=>u.type==='pdc');assert.equal(recovered.hull,9);assert.equal(recovered.ammo,11);
});
test('unknown actions and unavailable items are rejected without spending credits',()=>{
 const p=make().player,before=p.credits;assert.equal(equipmentAction(p,'invent',{id:ids(p)[0]}).ok,false);assert.equal(equipmentAction(p,'buy',{baseId:'capital-shield-generator',tier:3}).ok,false);assert.equal(p.credits,before);
});

test('survival rolls have the intended per-item and per-unit frequencies',()=>{
 let equipment=0,cargo=0;
 for(let i=0;i<1000;i++){
  const s=session(i),item=createEquipmentRecord('pulse-cannon',{id:`loot-frequency-${i}`}),a={lootKey:`loot-rate-${i}`,name:'Rate probe',position:[0,0,0],velocity:[0,0,0],equipmentRecords:[{item,key:'guns',index:0}],cargo:{ore:10}};
  const w=makeCareerWreck(s,a);equipment+=w?.contents.filter(e=>e.kind==='equipment').length??0;cargo+=w?.contents.find(e=>e.kind==='cargo')?.quantity??0;
 }
 assert.ok(equipment>145&&equipment<215,`equipment survivors: ${equipment}/1000`);assert.ok(cargo>5200&&cargo<5800,`cargo survivors: ${cargo}/10000`);
});

test('inventory recovery cannot reach through a blocked salvage line',()=>{
 const s=session(),a=ship(s),w=makeCareerWreck(s,a,{captured:true});s.wreckNodes.push(combatWreckNode(w));
 s.tmpP3=s.tmpP4={fromArray(){return this;}};s.lineBlocked=()=>true;
 const entry=w.contents.find(e=>e.item);assert.equal(recoverWreckEntry(s,w.id,entry.id).code,'BEAM OBSTRUCTED');assert.ok(w.contents.includes(entry));
});
test('old saves receive one untouched inventory-migration backup',async()=>{
 const {loadGame,SAVE_KEY,INVENTORY_MIGRATION_BACKUP_KEY}=await import('../../src/game/save.js');
 const previous=globalThis.window,store=new Map(),old=make();old.version=19;delete old.player.inventory;
 const original=JSON.stringify(old);store.set(SAVE_KEY,original);globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
 try{assert.ok(loadGame());assert.equal(store.get(INVENTORY_MIGRATION_BACKUP_KEY),original);store.set(SAVE_KEY,JSON.stringify({...old,player:{...old.player,credits:1}}));loadGame();assert.equal(store.get(INVENTORY_MIGRATION_BACKUP_KEY),original);}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('multiple launchers spend one energy charge per canister and cannot overdraw the capacitor',async()=>{
 const {GameSession}=await import('../../src/game/game.js');const {EntityStore}=await import('../../src/game/entityStore.js');const THREE=await import('../../vendor/three.module.min.js');const {normalizeLoadout}=await import('../../src/game/outfitting.js');const {fillLauncherMagazines}=await import('../../src/game/weapons.js');
 const s=Object.create(GameSession.prototype);s.save=make();s.projectiles=[];s.projStore=new EntityStore(64);s.projectileCounter=0;s.renderer={spawnMuzzleFlash(){}};s.audio={play(){},playCockpit(){}};s.setMonitorStatus=()=>{};s.addPlayerEmission=()=>{};s.tmpPlayerOrientation=new THREE.Quaternion();for(let i=0;i<7;i++)s['tmpP'+i]=new THREE.Vector3();const p=s.save.player;p.position=[0,0,0];p.rotation=[0,0,0,1];p.mode='combat';
 const fit=normalizeLoadout('wayfarer',{mountSchema:4,launchers:['swarm-launcher','swarm-launcher','swarm-launcher']});p.outfitting.loadouts.wayfarer=fit;
 const target={id:'energy-target',hull:1000,position:[0,0,-200]};s.ships=[target];s.getTargetRef=()=>({kind:'ship',id:target.id});fillLauncherMagazines(p);p.launcherFireMode='together';p.energy=30;
 const before=p.missiles;s.fireMissile();assert.equal(s.projectiles.length,8);assert.equal(p.energy,2);assert.equal(p.missiles,before-2);
 s.fireMissile();assert.equal(s.projectiles.length,8);assert.equal(p.energy,2);
 p.energy=60;s.save.world.time=100;s.fireMissile();assert.equal(s.projectiles.length,20);assert.equal(p.energy,18);
});

test('pulse tiers replace reinforced variants without changing tier-II NPC firepower',async()=>{
 const {WEAPONS,WEAPON_ORDER}=await import('../../src/game/weapons.js'),{equipmentName,resolveEquipmentDefinition,modifiedWeapon}=await import('../../src/game/equipmentCatalog.js'),{setLanguage,getLanguage}=await import('../../src/game/i18n.js');
 assert(!Object.hasOwn(BASE_OUTFIT_ITEMS,'pulse-mk2'));assert(!WEAPON_ORDER.includes('pulse-mk2'));
 const previous=getLanguage();try{setLanguage('de');for(const [tier,damage,energy]of [[1,9.2,3.2],[2,10.8,3.6],[3,12.4,4]]){
  const item=resolveEquipmentDefinition(BASE_OUTFIT_ITEMS['pulse-cannon'],{id:'probe',baseId:'pulse-cannon',tier,rarity:'common',affixes:[]}),weapon=modifiedWeapon(WEAPONS.pulse,item);
  assert(Math.abs(weapon.damageFlat-damage)<1e-8);assert(Math.abs(weapon.energyCost-energy)<1e-8);assert.equal(weapon.cooldown,.17);assert.equal(weapon.range,450);assert.equal(equipmentName(item),'Pulslaser\u00a0'+['I','II','III'][tier-1]);
 }}finally{setLanguage(previous);}
 const ship={hullId:'lancer',position:[0,0,0],pilot:{tier:'veteran'}};ship.combatFit=createEnemyLoadout(ship,0);
 assert.equal(ship.combatFit.guns[0],'pulse-cannon-t2');assert.equal(ship.combatFit.weapons[0],'pulse');assert(Math.abs(ship.combatFit.weaponDefinitions[0].damageFlat-10.8)<1e-8);
 const session={save:make(),arena:false,careerRegionAt:()=>({danger:.5})};equipCareerItems(session,ship);
 const pulse=ship.equipmentRecords.find(({item})=>item.baseId==='pulse-cannon').item;assert.equal(pulse.tier,2,'low-danger career does not discard the NPC weapon tier');
});

test('reinforced career items migrate once with their identity, affixes and storage intact',()=>{
 const save=make(),p=save.player,basePulse=Object.values(p.inventory.items).find(item=>item.baseId==='beam-emitter');
 basePulse.baseId='pulse-mk2';basePulse.tier=1;basePulse.rarity='rare';basePulse.affixes=['efficient','precise'];basePulse.factory=false;
 const stored={id:'eq-old-tiered-pulse',baseId:'pulse-mk2',tier:2,rarity:'uncommon',affixes:['light'],factory:false,location:{kind:'station',stationId:'rook'}};p.inventory.items[stored.id]=stored;
 save.world.combatWrecks={'wreck-old-pulse':{id:'wreck-old-pulse',systemId:p.systemId,position:[0,0,0],contents:[{id:'loot-old-pulse',kind:'equipment',item:{id:'loot-old-pulse',baseId:'pulse-mk2',tier:3,rarity:'rare',affixes:['rapid','longRange'],factory:false,location:{kind:'wreck'}}}]}};
 const first=hydrateSave(JSON.parse(JSON.stringify(save))),second=hydrateSave(JSON.parse(JSON.stringify(first)));
 for(const migrated of [first,second]){
  const item=migrated.player.inventory.items[basePulse.id];assert.equal(item.baseId,'pulse-cannon');assert.equal(item.tier,2);assert.equal(item.rarity,'rare');assert.deepEqual(item.affixes,['efficient','precise']);assert.deepEqual(item.location,basePulse.location);assert.equal(item.factory,false);
  const locker=migrated.player.inventory.items[stored.id];assert.equal(locker.tier,3);assert.equal(locker.baseId,'pulse-cannon');assert.deepEqual(locker.location,stored.location);assert.deepEqual(locker.affixes,['light']);
  const loot=migrated.world.combatWrecks['wreck-old-pulse'].contents[0].item;assert.equal(loot.baseId,'pulse-cannon');assert.equal(loot.tier,3);assert.deepEqual(loot.affixes,['rapid','longRange']);
 }
});

test('Arena checkpoint migration keeps earned pulse tiers and converts old offers',async()=>{
 const {newArenaRun,readArenaRun,writeArenaRun,chooseRunReward,markDecision}=await import('../../src/game/arenaRun.js');
 const save=newArenaRun(false,987);Object.assign(save.arenaRun,{wave:4,phase:'prepare',hullChosen:true,rewardChosen:false,offers:['pulse-mk2','ripper','gauss-cannon'],selectedReward:'pulse-mk2'});markDecision(save);
 save.player.outfitting.loadouts.wayfarer.guns[0]='pulse-mk2';save.player.outfitting.locker['pulse-mk2']=2;
 const storage=new Map(),previous=globalThis.window;globalThis.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}};
 try{assert(writeArenaRun(save));const loaded=readArenaRun();assert(loaded);assert(loaded.player.outfitting.loadouts.wayfarer.guns.includes('pulse-cannon-t2'));assert.equal(loaded.player.outfitting.locker['pulse-cannon-t2'],2);assert(!loaded.arenaRun.offers.includes('pulse-mk2'));
  loaded.arenaRun.offers=['pulse-cannon-t3'];loaded.arenaRun.selectedReward=null;assert(chooseRunReward(loaded,'pulse-cannon-t3'));assert(loaded.player.outfitting.loadouts.wayfarer.guns.includes('pulse-cannon-t3'));assert(writeArenaRun(loaded));assert(readArenaRun().player.outfitting.loadouts.wayfarer.guns.includes('pulse-cannon-t3'));
 }finally{globalThis.window=previous;}
});

test('resuming an interrupted Arena wave migrates the restored checkpoint loadout',async()=>{
 const {newArenaRun}=await import('../../src/game/arenaRun.js'),{ArenaRunMethods}=await import('../../src/game/arenaRunSession.js');const save=newArenaRun(false,888);
 const checkpoint=JSON.parse(JSON.stringify(save.player));checkpoint.outfitting.loadouts.wayfarer.guns[0]='pulse-mk2';checkpoint.outfitting.locker['pulse-mk2']=1;
 Object.assign(save.arenaRun,{phase:'combat',checkpoint,checkpointStats:{elapsed:4}});
 const session={save,setupArena(){},showRunPreparation(){}};ArenaRunMethods.setupRun.call(session);
 assert.equal(save.player.outfitting.loadouts.wayfarer.guns[0],'pulse-cannon-t2');assert.equal(save.player.outfitting.locker['pulse-cannon-t2'],1);assert.equal(save.arenaRun.phase,'prepare');
});
