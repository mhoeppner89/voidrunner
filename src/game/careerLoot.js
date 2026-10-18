import {highestLootRarity} from './lootVisuals.js';
import {FRIGATE_MOUNTS} from './frigateMounts.js';
import {CRUISER_MOUNTS} from './cruiserModelData.js';
import {registerInventoryDefinitions} from './equipmentInventory.js';
import {weaponForOutfit} from './weapons.js';
import {OUTFIT_ITEMS,BASE_OUTFIT_ITEMS,LOADOUT_KEYS} from './outfitting.js';
import {createEquipmentRecord,rollEquipmentRecord,receiveEquipment,ITEM_SURVIVAL_CHANCE,CARGO_SURVIVAL_CHANCE} from './equipmentInventory.js';
import {equipmentBaseId,migratePulseRecord,forgetEquipmentDefinition} from './equipmentCatalog.js';
import {seededRandom} from './random.js';
import {getEffectiveShipStats} from './shipStats.js';
import {cargoFree} from './economy.js';
import {hasSystem} from './galaxy.js';
import {COMMODITIES} from './data.js';
import {createDroneUnit,DRONE_TYPES,canonicalDroneType} from './droneData.js';
export function equipCareerItems(session,ship,{tutorialMiningPirate=false}={}){
 if(session.arena||ship.capitalClass||ship.equipmentRecords)return;
 const fit=ship.combatFit;if(!fit)return;
 const serial=++session.save.world.lootShipCounter|| (session.save.world.lootShipCounter=1);
 ship.lootKey=`loot-${session.save.world.seed}-${serial}`;
 const rng=seededRandom(ship.lootKey),region=session.careerRegionAt(ship.position),tier=region.danger>=2.1?3:region.danger>=1.15?2:1;
 ship.equipmentRecords=[];
 for(const key of LOADOUT_KEYS)for(let i=0;i<(fit[key]?.length??0);i++)if(fit[key][i]){
  const baseId=equipmentBaseId(fit[key][i]),id=`${ship.lootKey}-${key}-${i}`;
  // The first pirate carries the exact green tier I weapon that introduces loot.
  const guaranteed=tutorialMiningPirate&&key==='guns'&&!ship.guaranteedLootId;
  const item=guaranteed?createEquipmentRecord(baseId,{id,tier:1,rarity:'uncommon',affixes:['efficient']}):rollEquipmentRecord(baseId,rng,Math.max(tier,OUTFIT_ITEMS[fit[key][i]]?.tier??1),id);if(!item)continue;
  if(guaranteed)ship.guaranteedLootId=item.id;
  fit[key][i]=item.id;ship.equipmentRecords.push({item,key,index:i});
 }
 fit.weaponDefinitions=fit.gunIndices.map(i=>weaponForOutfit(fit.guns[i]));
 const stats=getEffectiveShipStats({shipId:fit.hullId,outfitting:{schema:4,locker:{},loadouts:{[fit.hullId]:{...fit,mountSchema:4}}}});
 fit.stats=stats;fit.resources={...stats,shield:stats.shield};ship.energy=stats.energyCapacity;
 for(let i=0;i<(fit.racks?.length??0);i++){const item=fit.launchers.filter(Boolean)[i];fit.racks[i].itemId=item;}
}
export function equipCapitalLoot(session,ship){
 if(session.arena)return;
 for(const {item} of ship.equipmentRecords??[])forgetEquipmentDefinition(item.id);
 ship.equipmentRecords=[];
 const mounts=ship.capitalClass==='frigate'?FRIGATE_MOUNTS:ship.capitalClass==='cruiser'?CRUISER_MOUNTS:[];
 for(const [index,m] of mounts.entries()){
  const base=m.kind==='engine'?'engine-mk2':m.kind==='generator'?'capital-shield-generator':m.kind==='torpedo'?'torpedo-launcher':m.label==='PDC'||m.kind==='pdc'?'pdc':ship.capitalClass==='cruiser'?'cruiser-battery':'frigate-battery';
  const item=createEquipmentRecord(base,{id:`${ship.lootKey}-capital-${index}`,tier:BASE_OUTFIT_ITEMS[base]?.tier??1});
  ship.equipmentRecords.push({item,key:'capital',index});
 }
 for(const baseId of ['sustained-reactor',...(mounts.length?[]:['shield-mk2','engine-mk2','engine-mk2','pulse-cannon'])])ship.equipmentRecords.push({item:createEquipmentRecord(baseId),key:'utility',index:-1});
}
export function combatWreckNode(wreck){
 for(const entry of wreck.contents)if(entry.item)registerInventoryDefinitions({items:{[entry.item.id]:entry.item}});
 const count=wreck.contents.reduce((n,e)=>n+(e.quantity??1),0);
 return {id:wreck.id,name:wreck.name,position:[...wreck.position],rotation:[0,0,0],radius:wreck.radius,shape:0,salvage:'scrap',remaining:count,scanned:wreck.scanned??false,combatLoot:true,lootRarity:highestLootRarity(wreck.contents),systemId:wreck.systemId,instanceId:wreck.instanceId,velocity:[0,0,0]};
}
export function makeCareerWreck(session,ship,{captured=false}={}){
 if(session.arena||ship.lootResolved)return null;
 ship.lootResolved=true;
 session.save.world.combatWrecks??={};
 if(!ship.lootKey){const serial=(session.save.world.lootShipCounter??0)+1;session.save.world.lootShipCounter=serial;ship.lootKey=`loot-${session.save.world.seed}-${serial}`;}
 const rng=seededRandom(`${ship.lootKey}:survival`),contents=[];
 const equipment=ship.equipmentRecords??[];
 for(const {item,key,index} of equipment){
  if(['turrets','capital'].includes(key)&&ship.capitalMountHull?.[index]<=0){forgetEquipmentDefinition(item.id);continue;}
  const rack=ship.combatFit?.racks?.find(r=>r.itemId===item.id);if(rack)item.rounds=rack.missiles;
  if(captured||rng()<ITEM_SURVIVAL_CHANCE||item.id===ship.guaranteedLootId)contents.push({id:item.id,kind:'equipment',item:{...item,factory:false,location:{kind:'wreck'}}});
  else forgetEquipmentDefinition(item.id);
 }
 for(const [commodity,raw] of Object.entries(ship.cargo??{})){
  if(!COMMODITIES[commodity])continue;let quantity=0;
  for(let i=0;i<Math.min(100000,Math.max(0,Math.floor(raw)));i++)if(captured||rng()<CARGO_SURVIVAL_CHANCE)quantity++;
  if(quantity)contents.push({id:`${ship.lootKey}-cargo-${commodity}`,kind:'cargo',commodity,quantity});
 }
 for(const unit of Object.values(ship.droneFleet?.unitsById??{}))if(unit.hull>0){
  if(!captured&&unit.state!=='stowed'&&unit.position){unit.orphaned=true;unit.state='orphaned';unit.targetId=undefined;session.save.world.orphanDrones??={};session.save.world.orphanDrones[unit.id]={id:unit.id,type:unit.type,hull:unit.hull,ammo:unit.ammo,position:[...unit.position],velocity:[...(unit.velocity??[0,0,0])],rotation:[...(unit.rotation??[0,0,0,1])],systemId:session.save.player.systemId};continue;}
  if(captured||rng()<ITEM_SURVIVAL_CHANCE)contents.push({id:`${ship.lootKey}-${unit.id}`,kind:'drone',type:unit.type,hull:unit.hull,ammo:unit.ammo});
 }
 // Cosmetic debris always appears; an empty hull does not advertise loot.
 if(!contents.length)return null;
 const ext=session.npcHullExtents(ship),wreck={id:`wreck-${ship.lootKey}`,name:`${ship.name} — salvage`,position:[...ship.position],velocity:[0,0,0],radius:Math.max(3,Math.min(35,Math.max(...ext)*.5)),systemId:session.save.player.systemId,instanceId:session.activeInstanceId,contents,scanned:captured};
 session.save.world.combatWrecks[wreck.id]=wreck;return wreck;
}
export function recoverWreckEntry(session,wreckId,entryId){
 if(session.arena)return {ok:false,code:'Career salvage only.'};
 const wreck=session.save.world.combatWrecks?.[wreckId],node=session.wreckNodes.find(n=>n.id===wreckId);
 if(!wreck||!node||wreck.systemId!==session.save.player.systemId||!node.scanned)return {ok:false,code:'Scan this wreck first.'};
 const distance=Math.hypot(...wreck.position.map((v,i)=>v-session.save.player.position[i]));
 if(distance>session.playerStats().salvageRange+node.radius)return {ok:false,code:'Wreck is outside salvage range.'};
 if(session.lineBlocked&&session.tmpP3&&session.tmpP4&&session.lineBlocked(session.tmpP3.fromArray(session.save.player.position),session.tmpP4.fromArray(wreck.position),wreck.id))return {ok:false,code:'BEAM OBSTRUCTED'};
 const index=wreck.contents.findIndex(e=>e.id===entryId),entry=wreck.contents[index];if(!entry)return {ok:false,code:'Already recovered.'};
 let result;
 if(entry.kind==='equipment')result=receiveEquipment(session.save.player,entry.item);
 else if(entry.kind==='cargo'){
  if(cargoFree(session.save.player)<COMMODITIES[entry.commodity].mass)return {ok:false,code:'Cargo hold is full.'};
  session.save.player.cargo[entry.commodity]=(session.save.player.cargo[entry.commodity]??0)+1;entry.quantity--;result={ok:true};
 }else{
  if(cargoFree(session.save.player)<1)return {ok:false,code:'Cargo hold is full.'};
  const fleet=session.save.player.droneFleet,id=`drone-unit-${fleet.nextUnitId++}`;fleet.unitsById[id]=createDroneUnit(id,entry.type);if(entry.hull!=null)fleet.unitsById[id].hull=entry.hull;if(entry.ammo!=null)fleet.unitsById[id].ammo=entry.ammo;fleet.lockerIds.push(id);result={ok:true};
 }
 if(!result.ok)return result;
 session.recordExtractionProgress?.('salvage',1);
 if(entry.kind!=='cargo'||entry.quantity<=0)wreck.contents.splice(index,1);
 node.lootRarity=highestLootRarity(wreck.contents);
 node.remaining=wreck.contents.reduce((n,e)=>n+(e.quantity??1),0);session._statsDirty=true;
 if(!node.remaining){delete session.save.world.combatWrecks[wreck.id];session.wreckNodes.splice(session.wreckNodes.indexOf(node),1);session.renderer?.removeCombatLootNode?.(node.id);if(session.save.player.currentTargetId===node.id)session.save.player.currentTargetId=undefined;}
 return {ok:true,code:'Recovered into cargo.'};
}

// Reject broken records at the save boundary; do not reroll valid wrecks.
export function normalizeCareerLoot(world, player) {
 const tuple=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
 const used=new Set(Object.keys(player.inventory?.items??{})),wrecks={};
 for(const [id,raw] of Object.entries(world.combatWrecks??{})) {
  if(!raw||raw.id!==id||!id.startsWith('wreck-')||!hasSystem(raw.systemId)||!tuple(raw.position,3)||!Array.isArray(raw.contents))continue;
  const contents=[];
  for(const entry of raw.contents) {
   if(!entry||typeof entry.id!=='string'||used.has(entry.id))continue;
   if(entry.kind==='equipment') {
    const item=migratePulseRecord(entry.item);
    if(!item||item.id!==entry.id||!Object.hasOwn(BASE_OUTFIT_ITEMS,item.baseId)||!item.id.startsWith('eq-')&&!item.id.startsWith('loot-'))continue;
    registerInventoryDefinitions({items:{[item.id]:item}});
   } else if(entry.kind==='cargo') {
    if(!Object.hasOwn(COMMODITIES,entry.commodity)||!Number.isFinite(entry.quantity)||entry.quantity<1)continue;
    entry.quantity=Math.min(100000,Math.floor(entry.quantity));
   } else if(entry.kind==='drone') {
    entry.type=canonicalDroneType(entry.type);
    if(!Object.hasOwn(DRONE_TYPES,entry.type))continue;
    entry.hull=Math.max(1,Math.min(DRONE_TYPES[entry.type].maxHull,Number(entry.hull)||DRONE_TYPES[entry.type].maxHull));
   } else continue;
   used.add(entry.id);contents.push(entry);
  }
  if(!contents.length)continue;
  wrecks[id]={...raw,name:String(raw.name??'Ship wreck').slice(0,150),contents,radius:Math.max(1,Math.min(35,Number(raw.radius)||3)),velocity:[0,0,0],scanned:Boolean(raw.scanned)};
 }
 if(world.combatWrecks)world.combatWrecks=wrecks;
 const orphans={};
 for(const [id,raw] of Object.entries(world.orphanDrones??{})) {
  if(raw)raw.type=canonicalDroneType(raw.type);
  if(!raw||raw.id!==id||!Object.hasOwn(DRONE_TYPES,raw.type)||!hasSystem(raw.systemId)||!tuple(raw.position,3)||!(raw.hull>0)||player.droneFleet?.unitsById?.[id])continue;
  orphans[id]={...raw,hull:Math.min(DRONE_TYPES[raw.type].maxHull,raw.hull),velocity:tuple(raw.velocity,3)?raw.velocity:[0,0,0],rotation:tuple(raw.rotation,4)&&Math.hypot(...raw.rotation)>.001?raw.rotation:[0,0,0,1]};
 }
 if(world.orphanDrones)world.orphanDrones=orphans;
 world.lootShipCounter=Number.isFinite(Number(world.lootShipCounter))?Math.max(0,Math.floor(Number(world.lootShipCounter))):0;
}
