import {PDC_TURRET} from './turrets.js';
import {TRACKING_LASER,weaponForOutfit,launcherForOutfit} from './weapons.js';
import {modifiedWeapon,equipmentName,EQUIPMENT_RARITIES,resolveEquipmentDefinition,registerEquipmentDefinition} from './equipmentCatalog.js';
import {OUTFIT_ITEMS,BASE_OUTFIT_ITEMS,itemAvailable} from './outfitting.js';
import {inventoryMounts,mountItemId,normalizeEquipmentInventory,shopEquipmentTiers} from './equipmentInventory.js';
import {getEffectiveShipStats} from './shipStats.js';
import {cargoMass} from './economy.js';
import {COMMODITIES,LOCATIONS} from './data.js';
import {t} from './i18n.js';
import {equipmentIcon,commodityIcon} from './itemIcons.js';
import {equipmentStatChanges,equipmentEffectStats} from './equipmentStatPresentation.js';

const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,digits=1)=>Number(n??0).toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
const button=(action,label,data='',disabled=false)=>`<button type="button" data-inventory-action="${action}" ${data} ${disabled?'disabled':''}>${html(t(label))}</button>`;
const quality=d=>Object.hasOwn(EQUIPMENT_RARITIES,d?.rarity)?d.rarity:'common';
const rarityStyle=d=>`data-rarity="${quality(d)}" style="--item-color:var(--loot-${quality(d)})"`;
const itemName=d=>equipmentName(d);
const itemLabel=d=>equipmentName(d,{affixes:false});
const flight=d=>!d?undefined:d.category==='turret'?modifiedWeapon(d.turretKind==='pdc'?PDC_TURRET:TRACKING_LASER,d):weaponForOutfit(d.id)??launcherForOutfit(d.id);
const tabLabels={cargo:'CARGO',storage:'STORAGE',shop:'SHOP',remote:'Elsewhere',loot:'Loot',drones:'Drones'};

export function renderEquipmentInventory(ui){
 const player=ui.save.player;
 normalizeEquipmentInventory(player);
 const fit=player.outfitting.loadouts[player.shipId],stats=getEffectiveShipStats(player),mounts=inventoryMounts(player.shipId);
 const selectedMount=mounts.find(m=>m.mount.id===ui.inventoryMountId),docked=Boolean(player.dockedAt);
 const wreck=!docked?ui.save.world.combatWrecks?.[player.currentTargetId]:undefined;
 const orphans=!docked?(ui.actions?.orphanDrones?.()??[]):[];
 const tabs=['cargo',...(docked?['storage','shop','remote']:wreck||orphans.length?['loot']:[]),'drones'];
 const view=tabs.includes(ui.inventoryTab)?ui.inventoryTab:!docked&&wreck?'loot':'cargo';
 const selectedId=ui.inventoryItemId;
 const shop=[];
 if(docked&&LOCATIONS[player.dockedAt]?.services?.outfitting)for(const base of Object.values(BASE_OUTFIT_ITEMS))if(!base.lootOnly&&itemAvailable(player,base,player.dockedAt))for(const tier of shopEquipmentTiers(player.dockedAt).filter(tier=>tier>=(base.tier??1))){
  const id=`shop-${base.id}-${tier}`,definition=resolveEquipmentDefinition(base,{id,baseId:base.id,tier,rarity:'common',affixes:[]});
  registerEquipmentDefinition(id,definition);shop.push({id,baseId:base.id,tier,shop:true});
 }
 const owned=Object.values(player.inventory.items);
 const compatible=item=>!selectedMount||(selectedMount.key==='weapons'?['gun','launcher'].includes(item.category):selectedMount.key==='turrets'?item.category==='turret':['power','drive','defense','utility'].includes(item.category));
 const candidates=view==='shop'?shop:owned.filter(i=>view==='cargo'?i.location.kind==='cargo':view==='storage'?i.location.kind==='station'&&i.location.stationId===player.dockedAt:view==='remote'?i.location.kind==='station'&&i.location.stationId!==player.dockedAt:false);
 const visible=candidates.filter(r=>compatible(OUTFIT_ITEMS[r.id])).sort((a,b)=>ui.inventorySort==='mass'?OUTFIT_ITEMS[a.id].mass-OUTFIT_ITEMS[b.id].mass:ui.inventorySort==='tier'?b.tier-a.tier:OUTFIT_ITEMS[a.id].name.localeCompare(OUTFIT_ITEMS[b.id].name));
 const lootEntry=view==='loot'&&wreck?.scanned?wreck.contents.find(e=>e.item?.id===selectedId):undefined;
 const record=lootEntry?{...lootEntry.item,loot:true}:owned.find(i=>i.id===selectedId)??shop.find(i=>i.id===selectedId);
 const item=record?OUTFIT_ITEMS[selectedId]:undefined,old=selectedMount?OUTFIT_ITEMS[mountItemId(fit,selectedMount)]:undefined;
 const card=r=>{const d=OUTFIT_ITEMS[r.id],rare=EQUIPMENT_RARITIES[quality(d)];return `<button type="button" class="inventory-item ${r.id===selectedId?'selected':''}" ${rarityStyle(d)} aria-label="${html(itemName(d)+', '+t(rare.name))}" draggable="${!r.shop}" data-inventory-id="${html(r.id)}">${equipmentIcon(d)}<span><b>${html(itemLabel(d))}</b><small>${r.shop?number(d.price)+' CR':number(d.mass)+' '+t('MASS')}</small></span><i class="rarity-mark" aria-hidden="true">◆</i></button>`;};
 const cargoSummary=view==='cargo'?Object.entries(player.cargo??{}).filter(([id,n])=>COMMODITIES[id]&&n>0).map(([id,n])=>`<div class="inventory-commodity">${commodityIcon(id)}<b>${number(n)}× ${html(t(COMMODITIES[id].name))}</b><small>${number(n*COMMODITIES[id].mass)} ${t('MASS')}</small></div>`).join('')+(player.sealedCargo??[]).map(c=>`<div class="inventory-commodity"><b>${html(c.label)} · ${number(c.units)}</b><small>${t('MISSION CARGO')}</small></div>`).join(''):'';
 let demand=0,salvo=0;
 for(const id of [...fit.guns,...fit.launchers,...fit.turrets].filter(Boolean)){const w=flight(OUTFIT_ITEMS[id]);if(w){const interval=w.burstSize?((w.shotInterval??w.cooldown)*w.burstSize+(w.burstPause??0))/w.burstSize:w.cooldown;if(interval>0)demand+=(w.energyCost??0)/interval;salvo+=w.energyCost??0;}}
 const budgetMarkup=`<dl class="inventory-readouts"><div><dt>${t('Energy capacity')}</dt><dd>${number(stats.energyCapacity)}</dd></div><div><dt>${t('Energy regeneration')}</dt><dd>${number(stats.reactorOutput)}/s</dd></div><div class="${demand>stats.reactorOutput?'power-demand-high':''}"><dt>${t('Weapon draw')}</dt><dd>${number(demand)}/s</dd></div><div><dt>${t('Cargo')}</dt><dd>${number(cargoMass(player))}/${number(stats.cargo)}</dd></div></dl>`;
 let panel='';
 if(item){
  const w=flight(item),before=flight(old),rare=EQUIPMENT_RARITIES[quality(item)];
  const stat=(label,a,b,digits=1)=>`<div class="inventory-stat"><span>${html(t(label))}</span><b>${a==null||item.id===old?.id?'':`<small>${number(a,digits)} → </small>`}${number(b,digits)}</b></div>`;
  let values='';
  if(w){values=stat('Damage',before?.damageFlat??before?.damage,w.damageFlat??w.damage)+stat('Energy per shot',before?.energyCost,w.energyCost)+stat('Shot interval',before?.cooldown??before?.shotInterval,w.cooldown??w.shotInterval,3)+stat('Range',before?.range??before?.lockRange,w.range??w.lockRange);if((w.gunneryAccuracy??1)!==1||(before?.gunneryAccuracy??1)!==1)values+=stat('Aim correction',before?(before.gunneryAccuracy??1)*100:undefined,(w.gunneryAccuracy??1)*100);}
  else if(selectedMount?.key==='utility'){
   const preview=JSON.parse(JSON.stringify(player.outfitting)),afterFit=preview.loadouts[player.shipId];
   afterFit.utility[selectedMount.index]=item.id;const after=getEffectiveShipStats({...player,outfitting:preview});
   for(const row of equipmentStatChanges(stats,after,item,true)){
    values+=`<div class="inventory-stat" data-stat="${row.key}"><span>${html(t(row.label))}</span><b>${item.id===old?.id?'':`<small>${number(row.before)} → </small>`}${number(row.after)}${row.unit?`<small class="stat-unit">${row.unit}</small>`:''}</b></div>`;
   }
  }else values=equipmentEffectStats(item).map(row=>`<div class="inventory-stat" data-stat="${row.key}"><span>${html(t(row.label))}</span><b>${row.value>0?'+':''}${number(row.value)}${row.unit}</b></div>`).join('')||`<p class="inventory-hint">${html(t('Select a mount.'))}</p>`;
  let actions='';
  if(record.loot)actions=button('recover','Recover',`data-item-id="${html(record.id)}" data-wreck-id="${html(wreck.id)}"`)+button('select-loot','Priority',`data-item-id="${html(record.id)}"`);
  else if(record.shop)actions=button('buy','BUY',`data-base-id="${html(record.baseId)}" data-tier="${record.tier}"`,player.credits<item.price);
  else if(docked){
   if(record.location.kind==='installed')actions=button('remove','Remove',`data-item-id="${html(record.id)}"`);
   else if(record.location.kind==='cargo'||record.location.kind==='station'&&record.location.stationId===player.dockedAt){
    if(selectedMount)actions+=button('install','Install',`data-item-id="${html(record.id)}" data-mount-id="${html(selectedMount.mount.id)}"`,!compatible(item));
    actions+=button(record.location.kind==='cargo'?'store':'carry',record.location.kind==='cargo'?'Store':'CARGO',`data-item-id="${html(record.id)}"`);
    if(!record.factory)actions+=button('sell',`${t('SELL')} · ${Math.floor(item.price*.7)} CR`,`data-item-id="${html(record.id)}"`);
   }
  }else if(record.location.kind==='cargo')actions=button('jettison','JETTISON',`data-item-id="${html(record.id)}"`);
  const group=docked&&selectedMount?.key==='weapons'&&item.category==='gun'&&record.location?.kind==='installed'?`<div class="inventory-fire-group"><span>${t('FIRE GROUP')}</span>${['A','B'].map(g=>button('group',g,`data-mount-id="${selectedMount.mount.id}" data-group="${g}" aria-pressed="${fit.fireGroups.assignments[selectedMount.mount.id]===g}"`)).join('')}</div>`:'';
  panel=`<aside class="inventory-comparison" ${rarityStyle(item)}><div class="inventory-detail-scroll"><section class="inventory-identity"><div class="inventory-detail-heading">${button('close-detail','◀ '+t('Items'))}<span>${selectedMount?html(t(selectedMount.key==='weapons'?'Weapon':selectedMount.key==='turrets'?'Turret':'Utility')+' '+(selectedMount.index+1))+' · ':''}${html(t(rare.name))}</span></div>${equipmentIcon(item,"inventory-detail-art")}<h3>${html(itemName(item))}</h3><div class="inventory-item-meta">${number(item.mass)} ${t('MASS')} · ${number(item.price)} CR${record.location?.kind==='station'?' · '+html(LOCATIONS[record.location.stationId]?.shortName??record.location.stationId):''}</div><details class="inventory-description"><summary>${t('Details')}</summary><p>${html(t(item.description))}</p>${record.factory?`<p>${t('Bundled — no resale')}</p>`:''}</details></section><section class="inventory-stat-block"><div class="inventory-stats">${values}</div>${group}</section><section class="inventory-context">${budgetMarkup}<div class="inventory-actions">${actions}</div></section></div></aside>`;
 }
 const orphanRows=orphans.map(u=>{const distance=Math.hypot(...u.position.map((v,i)=>v-player.position[i]));return `<div class="inventory-loot"><span><b>${html(t(u.type+' drone'))}</b><small>${number(distance)} km</small></span>${button('recover-drone','Recover',`data-item-id="${html(u.id)}"`,distance>stats.salvageRange)}</div>`;}).join('');
 const lootRows=wreck?.scanned?wreck.contents.map(e=>{
  const d=e.item?OUTFIT_ITEMS[e.item.id]:undefined;
  return `<div class="inventory-loot" ${rarityStyle(d)}>${d?card({...e.item,shop:false}):`<span class="inventory-loot-commodity">${e.kind==='cargo'?commodityIcon(e.commodity):''}<b>${html(e.kind==='cargo'?`${e.quantity}× ${t(COMMODITIES[e.commodity]?.name)}`:t(e.type+' drone'))}</b></span>`}<div class="inventory-loot-actions">${button('recover','Recover',`data-item-id="${html(e.id)}" data-wreck-id="${html(wreck.id)}"`)}${button('select-loot','Priority',`data-item-id="${html(e.id)}"`)}</div></div>`;
 }).join(''):'';
 const list=view==='loot'?`<div class="inventory-loot-list"><h3>${html(wreck?.name??t('Loot'))}</h3>${wreck&&!wreck.scanned?`<p>${t('Scan this wreck first.')}</p>`:lootRows||(!orphanRows?`<p>${t('No equipment here.')}</p>`:'')}${orphanRows}</div>`:view==='drones'?`<div class="inventory-drone-list">${ui.renderDroneBayRows?.(ui.droneHudSnapshot(),true)??''}${ui.renderDroneStock?.(docked)??''}</div>`:`<div class="inventory-items">${cargoSummary}${visible.map(card).join('')||`<p class="inventory-hint">${t('No equipment here.')}</p>`}</div>`;
 const hideMounts=view==='loot'||view==='drones';
 return `<section data-inventory-view="${view}" data-inventory-context="${docked?'station':'flight'}" class="equipment-inventory ${hideMounts?'inventory-focused':''} ${item?'has-detail':''}">${docked?'':`<header><button type="button" data-ui-command="close-ship" aria-label="${t('BACK')}">◀</button><h2>${t('EQUIPMENT & CARGO')}</h2><b>${number(player.credits)} CR</b></header>`}${ui.inventoryNotice?`<p class="inventory-notice" role="status">${html(t(ui.inventoryNotice))}</p>`:''}<div class="inventory-layout"><section class="inventory-mounts" aria-label="${t('INSTALLED EQUIPMENT')}">${mounts.map(s=>{const id=mountItemId(fit,s),d=OUTFIT_ITEMS[id];return `<button type="button" class="inventory-mount ${s.mount.id===ui.inventoryMountId?'selected':''}" ${rarityStyle(d)} data-inventory-mount="${html(s.mount.id)}"><small>${t(s.key==='weapons'?'Weapon':s.key==='turrets'?'Turret':'Utility')} ${s.index+1}</small><b>${html(d?itemLabel(d):t('EMPTY'))}</b></button>`;}).join('')}${button('tab',`${t('Drones')} · ${fit.droneBays.length}`,`data-tab="drones"`)}</section><section class="inventory-stock ${item?'has-detail':''}"><nav><select class="inventory-tab-select" data-inventory-tab aria-label="${t('Inventory section')}">${tabs.map(v=>`<option value="${v}" ${view===v?'selected':''}>${t(tabLabels[v])}</option>`).join('')}</select><div class="inventory-tab-buttons">${tabs.map(v=>button('tab',tabLabels[v],`data-tab="${v}" aria-pressed="${view===v}"`)).join('')}</div>${hideMounts?'':button('clear-mount',selectedMount?t(selectedMount.key==='weapons'?'Weapon':selectedMount.key==='turrets'?'Turret':'Utility')+' '+(selectedMount.index+1)+' ×':'All items',`aria-label="${t('All items')}"`)}${hideMounts?'':`<select data-inventory-sort aria-label="${t('Sort inventory')}"><option value="name">${t('Name')}</option><option value="tier" ${ui.inventorySort==='tier'?'selected':''}>${t('Tier')}</option><option value="mass" ${ui.inventorySort==='mass'?'selected':''}>${t('Mass')}</option></select>`}</nav><div class="inventory-stock-body">${list}${panel||(!hideMounts?`<aside class="inventory-comparison inventory-empty inventory-overview">${budgetMarkup}</aside>`:'')}</div></section></div></section>`;
}

export function bindEquipmentInventory(ui){
 const activeInventory=()=>ui.root.querySelector('#ship-panel:not(.is-hidden) .equipment-inventory')??ui.root.querySelector('#dock-screen:not(.is-hidden) .equipment-inventory');
 const redraw=()=>{
  const selectors=['.inventory-mounts','.inventory-items','.inventory-loot-list'];
  const previous=activeInventory(),oldView=previous?.dataset.inventoryView;
  ui.inventoryScroll??={};
  for(const selector of selectors){const e=previous?.querySelector(selector);if(e?.getClientRects().length)ui.inventoryScroll[`${oldView}:${selector}`]=e.scrollTop;}
  if(ui.root.querySelector('#ship-panel:not(.is-hidden)'))ui.showShipMenu();else ui.refreshDock(ui.save);
  const next=activeInventory(),nextView=next?.dataset.inventoryView;
  for(const selector of selectors){const e=next?.querySelector(selector);if(e)e.scrollTop=ui.inventoryScroll[`${nextView}:${selector}`]??0;}
 };
 ui.root.addEventListener('click',event=>{
  const b=event.target.closest('[data-inventory-id],[data-inventory-mount],[data-inventory-action]');if(!b)return;
  if(b.dataset.inventoryId){ui.inventoryItemId=b.dataset.inventoryId;redraw();return;}
  if(b.dataset.inventoryMount){ui.inventoryMountId=b.dataset.inventoryMount;const slot=inventoryMounts(ui.save.player.shipId).find(s=>s.mount.id===ui.inventoryMountId);ui.inventoryItemId=mountItemId(ui.save.player.outfitting.loadouts[ui.save.player.shipId],slot);if(!ui.inventoryItemId)ui.inventoryTab=ui.save.player.dockedAt?'shop':'cargo';redraw();return;}
  const action=b.dataset.inventoryAction;
  if(action==='open'){ui.inventoryView=true;ui.showShipMenu();return;}
  if(action==='tab'){ui.inventoryTab=b.dataset.tab;ui.inventoryItemId=undefined;redraw();return;}
  if(action==='close-detail'){ui.inventoryItemId=undefined;redraw();return;}
  if(action==='clear-mount'){ui.inventoryMountId=undefined;ui.inventoryItemId=undefined;redraw();return;}
  const result=ui.actions.inventoryCommand(action,{id:b.dataset.itemId,baseId:b.dataset.baseId,tier:b.dataset.tier,mountId:b.dataset.mountId,wreckId:b.dataset.wreckId,group:b.dataset.group});
  // Success is already visible in the updated cards. Keep only failures as text.
  ui.inventoryNotice=result?.ok?undefined:result?.code==='cargo-full'?'Cargo hold is full.':result?.code;
  if(result?.ok&&result.id)ui.inventoryItemId=result.id;
  if(result?.ok&&['recover','recover-drone','sell','jettison'].includes(action))ui.inventoryItemId=undefined;
  redraw();
 });
 ui.root.addEventListener('change',e=>{if(e.target.matches('[data-inventory-tab]')){ui.inventoryTab=e.target.value;ui.inventoryItemId=undefined;ui.inventoryNotice=undefined;redraw();}if(e.target.matches('[data-inventory-sort]')){ui.inventorySort=e.target.value;redraw();}});
 ui.root.addEventListener('dragstart',e=>{const b=e.target.closest('[data-inventory-id]');if(b)e.dataTransfer.setData('text/plain',b.dataset.inventoryId);});
 ui.root.addEventListener('dragover',e=>{if(e.target.closest('[data-inventory-mount]'))e.preventDefault();});
 ui.root.addEventListener('drop',e=>{const b=e.target.closest('[data-inventory-mount]');if(!b)return;e.preventDefault();const result=ui.actions.inventoryCommand('install',{id:e.dataTransfer.getData('text/plain'),mountId:b.dataset.inventoryMount});ui.inventoryNotice=result.ok?undefined:result.code;redraw();});
}
