import {BASE_OUTFIT_ITEMS,OUTFIT_ITEMS,HULL_HARDPOINTS,LOADOUT_KEYS,normalizeOutfitting,normalizeLoadout,projectLegacyEquipment,projectLegacyWeaponId,itemAvailable} from './outfitting.js';
import {resolveEquipmentDefinition,migratePulseRecord,runtimeEquipmentId,registerEquipmentDefinition,equipmentBaseId,forgetEquipmentDefinition,EQUIPMENT_RARITIES,EQUIPMENT_AFFIXES,NAMED_EQUIPMENT} from './equipmentCatalog.js';
import {getEffectiveShipStats} from './shipStats.js';
import {normalizeLauncherMagazines,launcherMagazineEntries,mountedLauncherEntries,weaponForOutfit} from './weapons.js';
import {DRONE_ITEM_IDS,DRONE_TYPES,createDroneUnit,droneInventoryId,droneUnitAccessible} from './droneData.js';
import {LOCATIONS,COMMODITIES} from './data.js';
import {cargoMass} from './economy.js';
import {seededRandom} from './random.js';
const clone=value=>JSON.parse(JSON.stringify(value));
export const ITEM_SURVIVAL_CHANCE=.18;
export const CARGO_SURVIVAL_CHANCE=.55;
export function registerInventoryDefinitions(inventory){
 for(const [id,record] of Object.entries(inventory?.items??{})){
  migratePulseRecord(record);const base=BASE_OUTFIT_ITEMS[record?.baseId];if(!Object.hasOwn(BASE_OUTFIT_ITEMS,record?.baseId)||!base||record.id!==id||!id.startsWith('eq-')&&!id.startsWith('loot-'))continue;
  if(base.id==='beam-emitter')record.factory=false;
  record.tier=Math.max(base.tier??1,Math.min(3,Math.floor(Number(record.tier)||1)));
  if(!EQUIPMENT_RARITIES[record.rarity])record.rarity='common';
  if(record.rarity==='named'&&!NAMED_EQUIPMENT[record.baseId])record.rarity='rare';
  record.affixes=[...new Set((Array.isArray(record.affixes)?record.affixes:[]).filter(a=>EQUIPMENT_AFFIXES[a]?.categories.includes(base.category)))].slice(0,EQUIPMENT_RARITIES[record.rarity].affixes);
  registerEquipmentDefinition(id,resolveEquipmentDefinition(base,record));
 }
}
export function createEquipmentRecord(baseId,{id,tier=1,rarity='common',affixes=[],factory=false,location={kind:'cargo'}}={}){
 tier=Math.max(tier,OUTFIT_ITEMS[baseId]?.tier??1);baseId=equipmentBaseId(baseId);if(!Object.hasOwn(BASE_OUTFIT_ITEMS,baseId))return null;
 const item={id:id??`eq-${globalThis.crypto?.randomUUID?.()??Date.now()+'-'+Math.random().toString(36).slice(2)}`,baseId,tier,rarity,affixes:[...affixes],factory,location:{...location}};
 registerInventoryDefinitions({items:{[item.id]:item}});return item;
}
export function rollEquipmentRecord(baseId,rng,tier=1,id){
 const chance=rng(),rarity=BASE_OUTFIT_ITEMS[baseId]?.category==='drone'?'common':chance<.003&&NAMED_EQUIPMENT[baseId]?'named':chance<.025?'rare':chance<.12?'uncommon':'common';
 const candidates=Object.keys(EQUIPMENT_AFFIXES).filter(a=>EQUIPMENT_AFFIXES[a].categories.includes(BASE_OUTFIT_ITEMS[baseId]?.category));
 const affixes=[];while(affixes.length<EQUIPMENT_RARITIES[rarity].affixes&&candidates.length)affixes.push(candidates.splice(Math.floor(rng()*candidates.length),1)[0]);
 return createEquipmentRecord(baseId,{id,tier,rarity,affixes});
}
export function refreshInventoryProjection(player){
 const inventory=player.inventory;if(!inventory)return;
 syncDroneInventory(player);
 registerInventoryDefinitions(inventory);
 const installed=new Set();
 for(const [shipId,fit] of Object.entries(player.outfitting?.loadouts??{}))for(const key of LOADOUT_KEYS)for(const [index,id] of (fit[key]??[]).entries())if(id){
  const item=inventory.items[id];if(!item)continue;
  item.location={kind:'installed',shipId,mountId:HULL_HARDPOINTS[shipId]?.[key]?.[index]?.id};installed.add(id);
 }
 for(const item of Object.values(inventory.items))if(!item.droneUnitId&&item.location?.kind==='installed'&&!installed.has(item.id))item.location=player.dockedAt?{kind:'station',stationId:player.dockedAt}:{kind:'cargo'};
 const locker={},factoryLocker={};let cargo=0;
 for(const item of Object.values(inventory.items)){
  if(item.droneUnitId)continue; // Physical fleet ownership is counted once by cargoMass.
  if(item.location?.kind==='cargo')cargo+=OUTFIT_ITEMS[item.id]?.mass??1;
  if(item.location?.kind==='cargo'||item.location?.kind==='station'&&item.location.stationId===player.dockedAt){locker[item.id]=1;if(item.factory)factoryLocker[item.id]=1;}
 }
 player._inventoryCargoMass=cargo;player.outfitting.locker=locker;player.outfitting.factoryLocker=factoryLocker;
 player.equipment=projectLegacyEquipment(player);player.weaponId=projectLegacyWeaponId(player);
}
// Equipment records own presentation/storage; fleet units own live health and
// flight state. A stable one-to-one ID keeps reloads, losses and role changes
// from creating extra stock. Existing two-miner bays retain the spare in cargo.
function syncDroneInventory(player){
 const fleet=player.droneFleet;if(!fleet)return;
 const inventory=player.inventory,assigned=new Map();
 for(const [shipId,fit]of Object.entries(player.outfitting?.loadouts??{}))for(const bay of fit.droneBays??[])for(const id of bay.unitIds)if(id)assigned.set(id,{kind:'installed',shipId,mountId:`${shipId}-${bay.bayId}`});
 for(const item of Object.values(inventory.items))if(item.droneUnitId&&(!fleet.unitsById[item.droneUnitId]||fleet.unitsById[item.droneUnitId].hull<=0||fleet.unitsById[item.droneUnitId].state==='destroyed')){delete inventory.items[item.id];forgetEquipmentDefinition(item.id);}
 for(const unit of Object.values(fleet.unitsById)){
  if(unit.hull<=0||unit.state==='destroyed')continue;
  const id=droneInventoryId(unit.id);let item=inventory.items[id];
  if(!item)item=inventory.items[id]=createEquipmentRecord(DRONE_ITEM_IDS[unit.type],{id});
  item.droneUnitId=unit.id;item.factory=false;
  item.location=assigned.get(unit.id)??(item.location?.kind==='station'?item.location:{kind:'cargo'});
 }
}
export function normalizeEquipmentInventory(player,{disabled=false}={}){
 if(disabled){registerInventoryDefinitions(player.inventory);for(const fit of Object.values(player.outfitting?.loadouts??{}))for(const key of LOADOUT_KEYS)fit[key]=(fit[key]??[]).map(id=>id?runtimeEquipmentId(id):null);const stock={};for(const [id,n] of Object.entries(player.outfitting?.locker??{})){const base=runtimeEquipmentId(id);stock[base]=(stock[base]??0)+n;}if(player.outfitting)player.outfitting.locker=stock;delete player.inventory;delete player._inventoryCargoMass;return;}
 const had=Boolean(player.inventory?.version===1);
 player.inventory=had?player.inventory:{version:1,items:{}};
 if(!player.inventory.items||typeof player.inventory.items!=='object'||Array.isArray(player.inventory.items))player.inventory.items={};registerInventoryDefinitions(player.inventory);
 const state=normalizeOutfitting(player),seen=new Set();
 const retain=(raw,location,factory)=>{
  if(player.inventory.items[raw]){if(seen.has(raw))return null;seen.add(raw);return raw;}
  const base=equipmentBaseId(raw);if(!BASE_OUTFIT_ITEMS[base])return null;
  const item=createEquipmentRecord(raw,{location,factory});player.inventory.items[item.id]=item;seen.add(item.id);return item.id;
 };
 for(const [shipId,fit] of Object.entries(state.loadouts))for(const key of LOADOUT_KEYS)for(let i=0;i<fit[key].length;i++)if(fit[key][i])fit[key][i]=retain(fit[key][i],{kind:'installed',shipId,mountId:HULL_HARDPOINTS[shipId][key][i].id},state.factory?.[shipId]?.[key]?.[i]===true);
 for(const [raw,n] of Object.entries(state.locker))for(let i=0;i<n;i++)retain(raw,{kind:'station',stationId:player.dockedAt??player.lastDockedAt??'helix'},i<(state.factoryLocker?.[raw]??0));
 for(const [id,item] of Object.entries(player.inventory.items)){
  if(!Object.hasOwn(BASE_OUTFIT_ITEMS,item?.baseId)||item.id!==id||!id.startsWith('eq-')&&!id.startsWith('loot-')){delete player.inventory.items[id];continue;}
  if(!['installed','cargo','station'].includes(item.location?.kind)||item.location.kind==='station'&&!LOCATIONS[item.location.stationId])item.location=player.dockedAt?{kind:'station',stationId:player.dockedAt}:{kind:'cargo'};
 }
 refreshInventoryProjection(player);
}
export const inventoryMounts=shipId=>{
 const spec=HULL_HARDPOINTS[shipId];if(!spec)return [];
 return [...spec.weapons.map((mount,index)=>({mount,index,key:'weapons'})),...spec.turrets.map((mount,index)=>({mount,index,key:'turrets'})),...spec.utility.map((mount,index)=>({mount,index,key:'utility'})),...spec.droneBays.map((bay,index)=>({mount:{id:`${shipId}-${bay.bayId}`,category:'drone',bayId:bay.bayId},index,key:'droneBays'}))];
};
export const mountItemId=(fit,mount)=>!mount?undefined:mount.key==='weapons'?fit.guns[mount.index]??fit.launchers[mount.index]:mount.key==='droneBays'?(fit.droneBays[mount.index]?.unitIds[0]?droneInventoryId(fit.droneBays[mount.index].unitIds[0]):undefined):fit[mount.key]?.[mount.index];
export const equipmentFitsMount=(item,slot)=>Boolean(item&&slot&&(slot.key==='weapons'?['gun','launcher'].includes(item.category):slot.key==='turrets'?item.category==='turret':slot.key==='droneBays'?item.category==='drone':['power','drive','defense','utility'].includes(item.category)));
export function equipmentInstallMount(player,item,requestedId){
 const slots=inventoryMounts(player.shipId).filter(slot=>equipmentFitsMount(item,slot)),fit=player.outfitting.loadouts[player.shipId];
 return slots.find(slot=>slot.mount.id===requestedId)??slots.find(slot=>!mountItemId(fit,slot));
}
export function shopEquipmentTiers(stationId){return ['rook','argent','league-yard','haven','cinderfall'].includes(stationId)?[1,2,3]:['helix','azure','vesper','blackglass'].includes(stationId)?[1,2]:[1];}
// Small, rotating station stock. The generated offers depend only on the
// saved world seed and time; a purchase ledger prevents duplicates after reload.
export function specialEquipmentOffers(player, stationId, world = {}) {
 if(!LOCATIONS[stationId]?.services?.outfitting)return [];
 const period=Math.floor(Math.max(0,Number(world.time)||0)/1800);
 const rng=seededRandom(`${world.seed??0}:special-equipment:${stationId}:${period}`);
 if(rng()>=.7)return [];
 const candidates=Object.values(BASE_OUTFIT_ITEMS).filter(base=>!base.lootOnly&&base.category!=='drone'&&itemAvailable(player,base,stationId));
 const result=[];
 for(let i=0;i<2&&candidates.length;i++){
  const base=candidates.splice(Math.floor(rng()*candidates.length),1)[0];
  const tiers=shopEquipmentTiers(stationId).filter(t=>t>=(base.tier??1));if(!tiers.length)continue;
  const tier=tiers[Math.floor(rng()*tiers.length)],rarity=rng()<.22?'rare':'uncommon';
  const pool=Object.keys(EQUIPMENT_AFFIXES).filter(id=>EQUIPMENT_AFFIXES[id].categories.includes(base.category));
  const affixes=[];while(affixes.length<EQUIPMENT_RARITIES[rarity].affixes&&pool.length)affixes.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
  const offerId=`${stationId}:${period}:${i}`;
  if(!player.inventory?.shopPurchases?.[offerId])result.push({offerId,baseId:base.id,tier,rarity,affixes});
 }
 return result;
}
export function captureEquipmentAmmo(player){
 if(!player.inventory)return;
 for(const entry of launcherMagazineEntries(player)){const item=player.inventory.items[entry.itemId];if(item)item.rounds=entry.rounds;}
}
export function equipmentSaleEligibility(player,item){
 if(item?.factory)return {ok:false,code:'Bundled equipment has no separate resale value.'};
 if(item?.baseId==='beam-emitter'){
  const fit=player.outfitting?.loadouts?.[player.shipId];
  if(!fit?.guns?.some(id=>id&&id!==item.id&&weaponForOutfit(id)&&!weaponForOutfit(id).ammoId))return {ok:false,code:'Install another ammo-free weapon before selling this laser.'};
 }
 return {ok:true};
}
export const equipmentSaleValue=(player,item)=>Math.floor((OUTFIT_ITEMS[item.id]?.price??0)*.7*(item.droneUnitId?Math.max(0,player.droneFleet?.unitsById[item.droneUnitId]?.hull??0)/DRONE_TYPES[OUTFIT_ITEMS[item.id].droneType].maxHull:1));
export function equipmentAction(player,action,{id,baseId,tier=1,mountId,stationId=player.dockedAt,offerId,world}={}){
 if(!['buy','install','remove','store','carry','sell'].includes(action))return {ok:false,code:'Invalid equipment action.'};
 const droneRefit=['install','remove'].includes(action)&&Boolean(player.inventory?.items?.[id]?.droneUnitId);
 if((!player.dockedAt&&!droneRefit)||stationId!==player.dockedAt)return {ok:false,code:'Dock at a station to change equipment.'};
 normalizeEquipmentInventory(player);captureEquipmentAmmo(player);const draft=clone(player),inventory=draft.inventory;delete draft.prevPosition;delete draft.prevRotation;delete draft.turretRuntime;
 const accessible=item=>item&&(item.location.kind==='cargo'||item.location.kind==='station'&&item.location.stationId===stationId);
 let item=inventory.items[id],credit=0;
 if(action==='buy'){
  if(!LOCATIONS[stationId]?.services?.outfitting)return {ok:false,code:'Equipment unavailable.'};
  if(!Object.hasOwn(BASE_OUTFIT_ITEMS,baseId)||BASE_OUTFIT_ITEMS[baseId].lootOnly||!itemAvailable(player,baseId,stationId)||Number(tier)<(BASE_OUTFIT_ITEMS[baseId].tier??1)||!shopEquipmentTiers(stationId).includes(Number(tier)))return {ok:false,code:'Equipment unavailable.'};
  const offer=offerId?specialEquipmentOffers(player,stationId,world).find(entry=>entry.offerId===offerId):undefined;
  if(offerId&&(!offer||offer.baseId!==baseId||offer.tier!==Number(tier)))return {ok:false,code:'Equipment unavailable.'};
  const type=BASE_OUTFIT_ITEMS[baseId].droneType,fleet=draft.droneFleet;
  if(type&&(Number(tier)!==1||!Number.isSafeInteger(fleet?.nextUnitId)||fleet.nextUnitId>=Number.MAX_SAFE_INTEGER))return {ok:false,code:'Equipment unavailable.'};
  const unitId=type?`drone-unit-${fleet.nextUnitId}`:undefined;
  const record=createEquipmentRecord(baseId,{id:unitId?droneInventoryId(unitId):undefined,tier:Number(tier),rarity:offer?.rarity??'common',affixes:offer?.affixes??[],location:{kind:'station',stationId}}),price=OUTFIT_ITEMS[record.id].price;
  if(draft.credits<price){forgetEquipmentDefinition(record.id);return {ok:false,code:'Not enough credits.'};}inventory.items[record.id]=record;draft.credits-=price;item=record;id=record.id;credit=-price;
  if(offer){inventory.shopPurchases??={};inventory.shopPurchases[offer.offerId]=true;}
  if(type){record.droneUnitId=unitId;fleet.nextUnitId++;fleet.unitsById[unitId]=createDroneUnit(unitId,type);fleet.lockerIds.push(unitId);}
 }else if(!item)return {ok:false,code:'Item is no longer available.'};
 const fit=draft.outfitting.loadouts[draft.shipId];
 const drone=item.droneUnitId?draft.droneFleet?.unitsById[item.droneUnitId]:undefined;
 if(item.droneUnitId&&!drone)return {ok:false,code:'Item is no longer available.'};
 if(drone&&['install','remove','store','carry','sell'].includes(action)&&drone.state!=='stowed')return {ok:false,code:'Drones are returning automatically.'};
 if(drone&&['install','remove'].includes(action)){
  if(action==='install'&&!accessible(item)&&!(item.location.kind==='installed'&&item.location.shipId===draft.shipId))return {ok:false,code:'Item is stored elsewhere.'};
  const slot=inventoryMounts(draft.shipId).find(s=>s.mount.id===(mountId??item.location.mountId)&&s.key==='droneBays');
  if(!slot)return {ok:false,code:'Select a mount.'};
  const bay=fit.droneBays[slot.index],fleet=draft.droneFleet;
  if(bay.unitIds.some(id=>fleet.unitsById[id]?.state!=='stowed'&&fleet.unitsById[id]))return {ok:false,code:'Drones are returning automatically.'};
  if(action==='remove'&&!bay.unitIds.includes(drone.id))return {ok:false,code:'Item is not installed here.'};
  for(const b of fit.droneBays)if(b.unitIds.includes(drone.id))b.unitIds=[null];
  for(const oldId of bay.unitIds)if(oldId&&oldId!==drone.id){fleet.lockerIds.push(oldId);const old=inventory.items[droneInventoryId(oldId)];if(old)old.location={kind:'cargo'};}
  delete bay.pendingMode;delete bay.pendingInventoryDrone;
  bay.unitIds=action==='install'?[drone.id]:[null];if(action==='install')bay.mode=drone.type;
  fleet.lockerIds=fleet.lockerIds.filter(value=>value!==drone.id);if(action==='remove'){fleet.lockerIds.push(drone.id);item.location=draft.dockedAt?{kind:'station',stationId}:{kind:'cargo'};}
 }else
 if(action==='install'){
  if(!accessible(item)&&!(item.location.kind==='installed'&&item.location.shipId===draft.shipId))return {ok:false,code:'Item is stored elsewhere.'};
  const slot=inventoryMounts(draft.shipId).find(s=>s.mount.id===mountId);if(!slot)return {ok:false,code:'Select a mount.'};
  const definition=OUTFIT_ITEMS[id],valid=equipmentFitsMount(definition,slot);
  if(!valid)return {ok:false,code:'This equipment does not fit this mount.'};
  for(const key of LOADOUT_KEYS)for(let i=0;i<fit[key].length;i++)if(fit[key][i]===id){fit[key][i]=null;draft.outfitting.factory[draft.shipId][key][i]=false;}
  const displaced=mountItemId(fit,slot);if(displaced&&inventory.items[displaced])inventory.items[displaced].location={kind:'station',stationId};
  const key=slot.key==='weapons'?(definition.category==='gun'?'guns':'launchers'):slot.key;
  if(slot.key==='weapons'){fit.guns[slot.index]=null;fit.launchers[slot.index]=null;}
  fit[key][slot.index]=id;draft.outfitting.factory[draft.shipId][key][slot.index]=Boolean(item.factory);
 }else if(action==='remove'){
  if(item.location.kind!=='installed'||item.location.shipId!==draft.shipId)return {ok:false,code:'Item is not installed here.'};
  for(const key of LOADOUT_KEYS)for(let i=0;i<fit[key].length;i++)if(fit[key][i]===id){fit[key][i]=null;draft.outfitting.factory[draft.shipId][key][i]=false;}
  item.location={kind:'station',stationId};
 }else if(action==='store'||action==='carry'){
  if(!accessible(item))return {ok:false,code:'Remove the item before transferring it.'};item.location=action==='store'?{kind:'station',stationId}:{kind:'cargo'};
 }else if(action==='sell'){
  if(!accessible(item))return {ok:false,code:'Remove the item before selling it.'};const eligibility=equipmentSaleEligibility(draft,item);if(!eligibility.ok)return eligibility;
  credit=equipmentSaleValue(draft,item);draft.credits+=credit;delete inventory.items[id];
  if(drone){delete draft.droneFleet.unitsById[drone.id];draft.droneFleet.lockerIds=draft.droneFleet.lockerIds.filter(value=>value!==drone.id);}
 }
 refreshInventoryProjection(draft);
 if(['carry','install','remove'].includes(action)&&cargoMass(draft)>getEffectiveShipStats(draft).cargo+1e-6)return {ok:false,code:'Cargo hold is full.'};
 const magazines={};for(const entry of mountedLauncherEntries(draft)){const item=inventory.items[entry.itemId];magazines[entry.mount.id]={launcherId:entry.launcherId,rounds:item?.rounds??0};}draft.launcherMagazines=magazines;
 normalizeLauncherMagazines(draft);const prevPosition=player.prevPosition,prevRotation=player.prevRotation;Object.assign(player,draft);if(prevPosition)player.prevPosition=prevPosition;if(prevRotation)player.prevRotation=prevRotation;
 if(action==='sell')forgetEquipmentDefinition(id);
 return {ok:true,id,credit,code:action==='buy'?'Purchased into station storage.':'Equipment updated.'};
}
export function receiveEquipment(player,record){
 migratePulseRecord(record);
 if(!record?.id||!record.id.startsWith('eq-')&&!record.id.startsWith('loot-')||!Object.hasOwn(BASE_OUTFIT_ITEMS,record.baseId)||player.inventory?.items?.[record.id])return {ok:false,code:'invalid-item'};
 registerInventoryDefinitions({items:{[record.id]:record}});
 const mass=OUTFIT_ITEMS[record.id].mass;if(cargoMass(player)+mass>getEffectiveShipStats(player).cargo+1e-6)return {ok:false,code:'cargo-full'};
 player.inventory??={version:1,items:{}};
 if(OUTFIT_ITEMS[record.id]?.droneType){
  const fleet=player.droneFleet;if(!Number.isSafeInteger(fleet?.nextUnitId)||fleet.nextUnitId>=Number.MAX_SAFE_INTEGER)return {ok:false,code:'invalid-fleet'};
  const id=`drone-unit-${fleet.nextUnitId++}`;fleet.unitsById[id]=createDroneUnit(id,OUTFIT_ITEMS[record.id].droneType);fleet.lockerIds.push(id);
  record={...clone(record),id:droneInventoryId(id),droneUnitId:id};
 }
 player.inventory.items[record.id]={...clone(record),factory:Boolean(record.factory),location:{kind:'cargo'}};refreshInventoryProjection(player);return {ok:true};
}
