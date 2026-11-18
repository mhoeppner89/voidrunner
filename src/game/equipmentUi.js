import {PDC_TURRET} from './turrets.js';
import {TRACKING_LASER,weaponForOutfit,launcherForOutfit} from './weapons.js';
import {modifiedWeapon,equipmentName,EQUIPMENT_RARITIES,resolveEquipmentDefinition,registerEquipmentDefinition} from './equipmentCatalog.js';
import {OUTFIT_ITEMS,BASE_OUTFIT_ITEMS,itemAvailable} from './outfitting.js';
import {inventoryMounts,mountItemId,normalizeEquipmentInventory,shopEquipmentTiers,specialEquipmentOffers,equipmentFitsMount,equipmentInstallMount,equipmentSaleEligibility,equipmentSaleValue} from './equipmentInventory.js';
import {getEffectiveShipStats,higherTierLoadFraction} from './shipStats.js';
import {cargoMass} from './economy.js';
import {COMMODITIES,LOCATIONS,SHIPS} from './data.js';
import {t} from './i18n.js';
import {DRONE_TYPES} from './droneData.js';
import {equipmentIcon,commodityIcon} from './itemIcons.js';
import {equipmentStatChanges,equipmentEffectStats} from './equipmentStatPresentation.js';
import {uiIcon} from './uiIcons.js';

const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,digits=1)=>Number(n??0).toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
const button=(action,label,data='',disabled=false,cls='')=>`<button type="button" ${cls?`class="${cls}" `:''}data-inventory-action="${action}" ${data} ${disabled?'disabled':''}>${html(t(label))}</button>`;
const ROMAN=['','I','II','III','IV','V'];
const CATEGORY_GROUP={gun:'weapons',launcher:'weapons',turret:'turrets',drone:'drones'};
const groupOf=d=>CATEGORY_GROUP[d?.category]??'systems';
const GROUPS=[['weapons','Weapons'],['turrets','Turrets'],['systems','Systems'],['drones','Drones']];
const CATEGORY_LABEL={gun:'Gun',launcher:'Launcher',turret:'Turret',drone:'Drone'};
const quality=d=>Object.hasOwn(EQUIPMENT_RARITIES,d?.rarity)?d.rarity:'common';
const rarityStyle=d=>`data-rarity="${quality(d)}" style="--item-color:var(--loot-${quality(d)})"`;
const itemName=d=>equipmentName(d);
const itemLabel=d=>equipmentName(d,{affixes:false});
const flight=d=>!d?undefined:d.category==='turret'?modifiedWeapon(d.turretKind==='pdc'?PDC_TURRET:TRACKING_LASER,d):weaponForOutfit(d.id)??launcherForOutfit(d.id);
const tabLabels={cargo:'CARGO',storage:'STORAGE',shop:'SHOP',remote:'Other stations',loot:'Loot'};

export function renderEquipmentInventory(ui,{embedded=false}={}){
 const player=ui.save.player;
 normalizeEquipmentInventory(player);
 const fit=player.outfitting.loadouts[player.shipId],stats=getEffectiveShipStats(player),mounts=inventoryMounts(player.shipId);
 let selectedMount=mounts.find(m=>m.mount.id===ui.inventoryMountId);const docked=Boolean(player.dockedAt);
 const wreck=!docked?ui.save.world.combatWrecks?.[player.currentTargetId]:undefined;
 const orphans=!docked?(ui.actions?.orphanDrones?.()??[]):[];
 const owned=Object.values(player.inventory.items);
 const remote=owned.filter(i=>i.location.kind==='station'&&i.location.stationId!==player.dockedAt);
 const tabs=['cargo',...(docked?['storage','shop',...(remote.length?['remote']:[])]:wreck||orphans.length?['loot']:[])];
 const view=tabs.includes(ui.inventoryTab)?ui.inventoryTab:!docked&&wreck?'loot':'cargo';
 const selectedId=ui.inventoryItemId;
 const shop=[];
 if(docked&&LOCATIONS[player.dockedAt]?.services?.outfitting)for(const base of Object.values(BASE_OUTFIT_ITEMS))if(!base.lootOnly&&itemAvailable(player,base,player.dockedAt))for(const tier of shopEquipmentTiers(player.dockedAt).filter(tier=>tier>=(base.tier??1)&&(base.category!=='drone'||tier===1))){
  const id=`shop-${base.id}-${tier}`,definition=resolveEquipmentDefinition(base,{id,baseId:base.id,tier,rarity:'common',affixes:[]});
  registerEquipmentDefinition(id,definition);shop.push({id,baseId:base.id,tier,shop:true});
 }
 if(docked)for(const offer of specialEquipmentOffers(player,player.dockedAt,ui.save.world)){
  const id=`shop-special-${offer.offerId}`,base=BASE_OUTFIT_ITEMS[offer.baseId];
  registerEquipmentDefinition(id,resolveEquipmentDefinition(base,{id,...offer}));shop.push({id,...offer,shop:true});
 }
 if(view==='remote')selectedMount=undefined;
 const compatible=item=>!selectedMount||equipmentFitsMount(item,selectedMount);
 const candidates=view==='shop'?shop:owned.filter(i=>view==='cargo'?i.location.kind==='cargo':view==='storage'?i.location.kind==='station'&&i.location.stationId===player.dockedAt:view==='remote'?i.location.kind==='station'&&i.location.stationId!==player.dockedAt:false);
 const presentGroups=GROUPS.filter(([g])=>candidates.some(r=>compatible(OUTFIT_ITEMS[r.id])&&groupOf(OUTFIT_ITEMS[r.id])===g));
 const category=presentGroups.some(([g])=>g===ui.inventoryCategory)?ui.inventoryCategory:'all';
 const visible=candidates.filter(r=>compatible(OUTFIT_ITEMS[r.id])&&(category==='all'||groupOf(OUTFIT_ITEMS[r.id])===category)).sort((a,b)=>ui.inventorySort==='mass'?OUTFIT_ITEMS[a.id].mass-OUTFIT_ITEMS[b.id].mass:ui.inventorySort==='tier'?b.tier-a.tier:OUTFIT_ITEMS[a.id].name.localeCompare(OUTFIT_ITEMS[b.id].name));
 const lootEntry=view==='loot'&&wreck?.scanned?wreck.contents.find(e=>e.item?.id===selectedId):undefined;
 const record=lootEntry?{...lootEntry.item,loot:true}:owned.find(i=>i.id===selectedId)??shop.find(i=>i.id===selectedId);
 const item=record?OUTFIT_ITEMS[selectedId]:undefined;
 const canInstall=(docked||item?.category==='drone')&&item&&!record.shop&&!record.loot&&(record.location.kind==='cargo'||record.location.kind==='station'&&record.location.stationId===player.dockedAt);
 if(canInstall)selectedMount=mounts.find(s=>s.key==='droneBays'&&fit.droneBays[s.index]?.pendingInventoryDrone?.id===record.id)??equipmentInstallMount(player,item,ui.inventoryFitExplicit?ui.inventoryMountId:undefined);
 else if(record?.location?.kind==='installed')selectedMount=mounts.find(s=>s.mount.id===record.location.mountId)??selectedMount;
 let old=selectedMount?OUTFIT_ITEMS[mountItemId(fit,selectedMount)]:undefined;
 const mountLabel=s=>t(s.key==='weapons'?'Weapon':s.key==='turrets'?'Turret':s.key==='droneBays'?'Drone bay':'Utility')+' '+(s.index+1);
 const fitTag=d=>{if(!docked&&view!=='loot'||!d)return '';const free=mounts.some(m=>equipmentFitsMount(d,m)&&!mountItemId(fit,m)),any=mounts.some(m=>equipmentFitsMount(d,m));return free?`<em class="inventory-fit is-free">${t('Free mount')}</em>`:any?`<em class="inventory-fit is-swap">${t('Replace')}</em>`:`<em class="inventory-fit">${t('No mount')}</em>`;};
 const card=r=>{const d=OUTFIT_ITEMS[r.id],rare=EQUIPMENT_RARITIES[quality(d)];return `<button type="button" class="inventory-item ${r.id===selectedId?'selected':''}" ${rarityStyle(d)} aria-label="${html(itemName(d)+', '+t(rare.name))}" aria-selected="${r.id===selectedId}" draggable="${!r.shop}" data-inventory-id="${html(r.id)}"><span class="inventory-item-art">${equipmentIcon(d)}<i class="inventory-tier">${ROMAN[d.tier??1]??d.tier}</i></span><span class="inventory-item-copy"><b>${html(itemLabel(d))}</b><small>${html(t(CATEGORY_LABEL[d.category]??'System'))} · ${number(d.mass)} ${t('MASS')}</small></span><span class="inventory-item-foot"><small class="sx-price">${view==='remote'?html(LOCATIONS[r.location.stationId]?.shortName??r.location.stationId):r.shop?number(d.price)+' CR':number(d.mass)+' '+t('MASS')}</small>${fitTag(d)}</span><i class="rarity-mark" aria-hidden="true">◆</i></button>`;};
 const cargoSummary=view==='cargo'?Object.entries(player.cargo??{}).filter(([id,n])=>COMMODITIES[id]&&n>0).map(([id,n])=>`<div class="inventory-commodity ${COMMODITIES[id].legal?'':'is-illegal'}">${commodityIcon(id)}<b>${number(n)}× ${html(t(COMMODITIES[id].name))}</b><small>${number(n*COMMODITIES[id].mass)} ${t('MASS')}</small>${docked||n<1?'':`<label class="inventory-jettison-quantity">${t('QUANTITY')} <input type="number" inputmode="numeric" min="1" max="${Math.min(100000,Math.floor(n))}" step="1" value="1" data-jettison-quantity aria-label="${html(t('QUANTITY')+' · '+t(COMMODITIES[id].name))}"></label>${button('jettison-cargo','JETTISON',`data-jettison-commodity="${html(id)}"`)}`}</div>`).join('')+(player.sealedCargo??[]).map(c=>`<div class="inventory-commodity"><b>${html(c.label)} · ${number(c.units)}</b><small>${t('MISSION CARGO')}</small></div>`).join(''):'';
 let demand=0,salvo=0;
 for(const id of [...fit.guns,...fit.launchers,...fit.turrets].filter(Boolean)){const w=flight(OUTFIT_ITEMS[id]);if(w){const interval=w.burstSize?((w.shotInterval??w.cooldown)*w.burstSize+(w.burstPause??0))/w.burstSize:w.cooldown;if(interval>0)demand+=(w.energyCost??0)/interval;salvo+=w.energyCost??0;}}
 const budgetMarkup=`<dl class="inventory-readouts"><div><dt>${t('Energy capacity')}</dt><dd>${number(stats.energyCapacity)}</dd></div><div><dt>${t('Energy regeneration')}</dt><dd>${number(stats.reactorOutput)}/s</dd></div>${stats.overTierLoad>0?`<div class="power-demand-high"><dt>${t('Higher-tier load')}</dt><dd>−${number(stats.overTierLoad)}/s</dd></div>`:''}<div class="${demand>stats.reactorOutput?'power-demand-high':''}"><dt>${t('Weapon draw')}</dt><dd>${number(demand)}/s</dd></div><div><dt>${t('Cargo')}</dt><dd>${number(cargoMass(player))}/${number(stats.cargo)}</dd></div></dl>`;
 let panel='';
 if(item){
  const buyMount=record.shop&&docked&&item.category!=='drone'?equipmentInstallMount(player,item,ui.inventoryMountId):undefined;
  // A shop item compares against the mount Buy & install would fill.
  const cmpMount=selectedMount??buyMount;if(!selectedMount&&buyMount)old=OUTFIT_ITEMS[mountItemId(fit,buyMount)];
  const w=flight(item),before=flight(old),rare=EQUIPMENT_RARITIES[quality(item)];
  const stat=(label,a,b,digits=1,lowerBetter=false)=>{const same=a==null||item.id===old?.id,diff=same?0:(b??0)-(a??0),cls=same||Math.abs(diff)<1e-6?'':(lowerBetter?diff<0:diff>0)?'is-better':'is-worse',max=Math.max(a??0,b??0)*1.15||1;return `<div class="inventory-stat ${cls}"><span>${html(t(label))}</span><b>${same?'':`<small>${number(a,digits)} → </small>`}${number(b,digits)}${cls?`<em>${diff>0?'+':'−'}${number(Math.abs(diff),digits)}</em>`:''}</b><i class="inventory-stat-bar" aria-hidden="true" style="--a:${((a??0)/max*100).toFixed(1)}%;--b:${((b??0)/max*100).toFixed(1)}%"></i></div>`;};
  let values='';
  if(item.category==='drone'){
   const d=DRONE_TYPES[item.droneType],unit=player.droneFleet?.unitsById[record.droneUnitId];
   values=stat('Hull',undefined,unit?.hull??d.maxHull)+stat('Range',undefined,item.droneType==='repair'?200:item.droneType==='mining'?100:300);
   if(item.droneType==='mining')values+=stat('Yield per trip',undefined,d.payloadUnits)+stat('Mining time',undefined,d.cutSecondsPerUnit);
   if(item.droneType==='repair')values+=stat('Repair per second',undefined,d.repairRate);
   if(selectedMount&&fit.droneBays[selectedMount.index]?.pendingInventoryDrone)values+=`<p role="status">${t('Drones are returning automatically.')}</p>`;
  }else if(w){values=stat('Damage',before?(before.damageFlat??before.damage):undefined,(w.damageFlat??w.damage))+stat('Energy per shot',before?.energyCost,w.energyCost,1,true)+stat('Shot interval',before?.cooldown??before?.shotInterval,w.cooldown??w.shotInterval,3,true)+stat('Range',before?.range??before?.lockRange,w.range??w.lockRange);if((w.gunneryAccuracy??1)!==1||(before?.gunneryAccuracy??1)!==1)values+=stat('Aim correction',before?(before.gunneryAccuracy??1)*100:undefined,(w.gunneryAccuracy??1)*100);}
  else if(cmpMount?.key==='utility'){
   const preview=JSON.parse(JSON.stringify(player.outfitting)),afterFit=preview.loadouts[player.shipId];
   afterFit.utility[cmpMount.index]=item.id;const after=getEffectiveShipStats({...player,outfitting:preview});
   for(const row of equipmentStatChanges(stats,after,item,true)){
    const changed=item.id!==old?.id&&Math.abs(row.after-row.before)>1e-6,max=Math.max(row.before,row.after)*1.15||1;
    values+=`<div class="inventory-stat ${changed?(row.improved?'is-better':'is-worse'):''}" data-stat="${row.key}"><span>${html(t(row.label))}</span><b>${item.id===old?.id?'':`<small>${number(row.before)} → </small>`}${number(row.after)}${row.unit?`<small class="stat-unit">${row.unit}</small>`:''}${changed?`<em>${row.after>row.before?'+':'−'}${number(Math.abs(row.after-row.before))}</em>`:''}</b><i class="inventory-stat-bar" aria-hidden="true" style="--a:${(row.before/max*100).toFixed(1)}%;--b:${(row.after/max*100).toFixed(1)}%"></i></div>`;
   }
  }else values=equipmentEffectStats(item).map(row=>`<div class="inventory-stat ${row.value>0?'is-better':row.value<0?'is-worse':''}" data-stat="${row.key}"><span>${html(t(row.label))}</span><b>${row.value>0?'+':''}${number(row.value)}${row.unit}</b></div>`).join('')||`<p class="inventory-hint">${html(t('Select a mount.'))}</p>`;
  const tierLoad=higherTierLoadFraction(item.tier,SHIPS[player.shipId]?.tier);
  if(tierLoad)values+=`<p class="inventory-hint">${html(t('Higher-tier load: up to −{amount}/s.',{amount:number((SHIPS[player.shipId]?.reactorOutput??0)*tierLoad)}))}</p>`;
  let actions='';
  if(record.loot)actions=`<p class="inventory-hint">${t('Fly over dropped loot to collect it.')}</p>`;
  else if(record.shop){
   // Buy & install in one key when a mount can take it (the chosen mount, else a free one).
   const offer=`data-base-id="${html(record.baseId)}" data-tier="${record.tier}" ${record.offerId?`data-offer-id="${html(record.offerId)}"`: ''}`,poor=player.credits<item.price;
   if(buyMount){const occupied=OUTFIT_ITEMS[mountItemId(fit,buyMount)];actions=button('buy-install',`${t(occupied?'Buy & replace':'Buy & install')} · ${mountLabel(buyMount)} · ${number(item.price)} CR`,`${offer} data-mount-id="${html(buyMount.mount.id)}"`,poor,'sx-btn sx-btn-primary inventory-buy-install')+button('buy',`${t('Buy only')} · ${number(item.price)} CR`,offer,poor,'sx-btn sx-btn-ghost');if(occupied)actions+=`<p class="inventory-hint sx-hint is-warn">${t('Replaces {item}. The old item stays in station storage.',{item:itemLabel(occupied)})}</p>`;}
   else actions=button('buy',`${t('BUY')} · ${number(item.price)} CR`,offer,poor,'sx-btn sx-btn-primary');
  }
  else if(docked||item.category==='drone'){
   const pendingDrone=item.category==='drone'&&selectedMount&&fit.droneBays[selectedMount.index]?.pendingInventoryDrone;
   if(record.location.kind==='installed')actions=button('remove','Remove',`data-item-id="${html(record.id)}"`,Boolean(pendingDrone),'sx-btn sx-btn-secondary');
   else if(record.location.kind==='cargo'||record.location.kind==='station'&&record.location.stationId===player.dockedAt){
    if(selectedMount)actions+=button('install',`${t(old?'Replace':'Install')} · ${mountLabel(selectedMount)}`,`data-item-id="${html(record.id)}" data-mount-id="${html(selectedMount.mount.id)}"`,Boolean(pendingDrone),'sx-btn sx-btn-primary');
    const choices=mounts.filter(s=>equipmentFitsMount(item,s));
    if(old)actions+=`<p class="inventory-hint sx-hint is-warn">${t(item.category==='drone'?'Replaces {item}. The old drone stays in cargo.':'Replaces {item}. The old item stays in station storage.',{item:itemLabel(old)})}</p>`;
    if(!selectedMount)actions+=`<p class="inventory-hint sx-hint">${t(choices.length?'All compatible mounts are occupied. Choose what to replace.':'This ship has no compatible mount.')}</p>`;
    if(choices.length)actions+=`<details class="inventory-mount-picker" ${selectedMount?'':'open'}><summary>${t(selectedMount?'Choose another mount':'Choose a mount')}</summary>${choices.map(s=>{const d=OUTFIT_ITEMS[mountItemId(fit,s)];return button('fit-mount',`${mountLabel(s)} · ${d?itemLabel(d):t('EMPTY')}`,`data-mount-id="${html(s.mount.id)}" aria-pressed="${s.mount.id===selectedMount?.mount.id}"`);}).join('')}</details>`;
    if(docked)actions+=button(record.location.kind==='cargo'?'store':'carry',record.location.kind==='cargo'?'Store':'CARGO',`data-item-id="${html(record.id)}"`,false,'sx-btn sx-btn-ghost');
    if(docked&&!record.factory){const sale=equipmentSaleEligibility(player,record);actions+=button('sell',`${t('SELL')} · ${equipmentSaleValue(player,record)} CR`,`data-item-id="${html(record.id)}" title="${html(sale.ok?'':t(sale.code))}"`,!sale.ok,'sx-btn sx-btn-ghost');if(!sale.ok)actions+=`<p class="inventory-hint sx-hint is-warn">${html(t(sale.code))}</p>`;}
   }
  }
  if(!docked&&!record.loot&&!record.shop&&record.location?.kind==='cargo')actions+=button('jettison','JETTISON',`data-item-id="${html(record.id)}"`,false,'sx-btn sx-btn-danger');
  const group=selectedMount?.key==='weapons'&&item.category==='gun'&&record.location?.kind==='installed'?`<div class="inventory-fire-group"><span>${t('FIRE GROUP')}</span>${['A','B'].map(g=>button('group',g,`data-mount-id="${selectedMount.mount.id}" data-group="${g}" aria-pressed="${fit.fireGroups.assignments[selectedMount.mount.id]===g}"`)).join('')}</div>`:'';
  const compareLabel=cmpMount&&w?`${t('Compared with')} ${mountLabel(cmpMount)} · ${old?itemLabel(old):t('EMPTY')}`:cmpMount?mountLabel(cmpMount):t('Effect');
  panel=`<aside class="inventory-comparison sx-panel" ${rarityStyle(item)}><div class="inventory-detail-scroll"><section class="inventory-identity"><div class="inventory-detail-heading"><span class="inventory-meta"><b class="is-rarity">${html(t(rare.name))}</b><b>${t('TIER')} ${ROMAN[item.tier??1]??item.tier}</b><b>${number(item.mass)} ${t('MASS')}</b>${record.location?.kind==='station'?`<b>${html(LOCATIONS[record.location.stationId]?.shortName??record.location.stationId)}</b>`:''}</span>${button('close-detail','×',`aria-label="${html(t('Items'))}" title="${html(t('Items'))}"`,false,'inventory-close sx-icon-button')}</div><div class="inventory-identity-main"><span class="inventory-art-plate">${equipmentIcon(item,"inventory-detail-art")}</span><div><h3>${html(itemName(item))}</h3><p class="inventory-description">${html(t(item.description))}${record.factory?` ${t('Bundled — no resale')}`:''}</p></div></div></section><section class="inventory-stat-block"><span class="sx-label">${html(compareLabel)}</span><div class="inventory-stats">${values}</div>${group}</section><section class="inventory-context">${budgetMarkup}</section></div><div class="inventory-actions">${actions}</div></aside>`;
 }
 const orphanRows=orphans.map(u=>{const distance=Math.hypot(...u.position.map((v,i)=>v-player.position[i]));return `<div class="inventory-loot"><span><b>${html(t(u.type+' drone'))}</b><small>${number(distance)} km</small></span>${button('recover-drone','Recover',`data-item-id="${html(u.id)}"`,distance>stats.salvageRange)}</div>`;}).join('');
 const lootRows=wreck?.scanned?wreck.contents.map(e=>{
  const d=e.item?OUTFIT_ITEMS[e.item.id]:undefined;
  return `<div class="inventory-loot" ${rarityStyle(d)}>${d?card({...e.item,shop:false}):`<span class="inventory-loot-commodity ${e.kind==='cargo'&&COMMODITIES[e.commodity]?.legal===false?'is-illegal':''}">${e.kind==='cargo'?commodityIcon(e.commodity):''}<b>${html(e.kind==='cargo'?`${e.quantity}× ${t(COMMODITIES[e.commodity]?.name)}`:t(e.type+' drone'))}</b></span>`}</div>`;
 }).join(''):'';
 const list=view==='loot'?`<div class="inventory-loot-list"><h3>${html(wreck?.name??t('Loot'))}</h3>${wreck&&!wreck.scanned?`<p>${t('Scan this wreck first.')}</p>`:lootRows||(!orphanRows?`<p>${t('No equipment here.')}</p>`:'')}${orphanRows}</div>`:`<div class="inventory-items">${cargoSummary}${visible.map(card).join('')||(cargoSummary?'':`<p class="inventory-hint">${t('No equipment here.')}</p>`)}</div>`;
 const holdMass=cargoMass(player),holdCapacity=stats.cargo,holdPercent=holdCapacity>0?Math.round(holdMass/holdCapacity*100):0;
 const cargoUsage=view==='cargo'?`<div class="inventory-cargo-usage ${holdMass>=holdCapacity?'is-full':''}"><div><span>${t('CARGO')}</span><b>${number(holdMass)} / ${number(holdCapacity)} ${t('MASS')} · ${holdPercent}%</b></div><div class="inventory-cargo-meter" role="progressbar" aria-label="${t('CARGO')}" aria-valuemin="0" aria-valuemax="${holdCapacity}" aria-valuenow="${Math.min(holdMass,holdCapacity)}" aria-valuetext="${number(holdMass)} / ${number(holdCapacity)} ${t('MASS')}"><i style="width:${Math.max(0,Math.min(100,holdPercent))}%"></i></div></div>`:'';
 const hideMounts=view==='loot';
 const mountButton=s=>{const id=mountItemId(fit,s),d=OUTFIT_ITEMS[id];return `<button type="button" class="inventory-mount ${d?'':'is-empty'} ${s.mount.id===ui.inventoryMountId?'selected':''}" ${rarityStyle(d)} data-inventory-mount="${html(s.mount.id)}" aria-pressed="${s.mount.id===ui.inventoryMountId}" title="${html(mountLabel(s)+' · '+(d?itemLabel(d):t('EMPTY')))}"><span class="inventory-mount-art">${d?equipmentIcon(d):uiIcon('plus',18)}</span><span class="inventory-mount-copy"><small>${html(mountLabel(s))}</small><b>${html(d?itemLabel(d):t('EMPTY'))}</b></span>${d?`<i class="inventory-tier">${ROMAN[d.tier??1]??d.tier}</i>`:''}</button>`;};
 const mountGroups=[['weapons','Weapons'],['turrets','Turrets'],['utility','Systems'],['droneBays','Drones']].map(([key,label])=>[label,mounts.filter(s=>s.key===key)]).filter(([,list])=>list.length).map(([label,list])=>`<div class="inventory-mount-group"><span class="sx-label">${t(label)}</span>${list.map(mountButton).join('')}</div>`).join('');
 const ship=SHIPS[player.shipId];
 const sortMenu=hideMounts?'':`<details class="inventory-sort"><summary aria-label="${html(t('Sort inventory')+': '+t(({name:'Name',tier:'Tier',mass:'Mass'})[ui.inventorySort]??'Name'))}"><span>${t(({name:'Name',tier:'Tier',mass:'Mass'})[ui.inventorySort]??'Name')}</span><i aria-hidden="true">▾</i></summary><div class="inventory-sort-menu" role="group" aria-label="${html(t('Sort inventory'))}">${[['name','Name'],['tier','Tier'],['mass','Mass']].map(([value,label])=>button('sort',label,`data-sort="${value}" aria-pressed="${(ui.inventorySort??'name')===value}"`)).join('')}</div></details>`;
 const chips=view==='loot'?'':`<div class="inventory-filters sx-chips">${hideMounts||view==='remote'||!selectedMount?'':button('clear-mount','All items',`aria-label="${t('All items')}"`,false,'sx-filter inventory-clear-mount')}${presentGroups.length>1?[['all','All'],...presentGroups].map(([g,label])=>button('category',label,`data-category="${g}" aria-pressed="${category===g}"`,false,'sx-filter')).join(''):''}</div>`;
 return `<section data-inventory-view="${view}" data-inventory-context="${docked?'station':'flight'}" class="equipment-inventory ${hideMounts?'inventory-focused':''} ${item?'has-detail':''} ${embedded?'is-embedded':''}">${docked||embedded?'':`<header><button type="button" data-ui-command="close-ship" aria-label="${t('BACK')}">◀</button><h2>${t('EQUIPMENT & CARGO')}</h2><b>${number(player.credits)} CR</b></header>`}${ui.inventoryNotice?`<p class="inventory-notice sx-hint is-danger" role="status">${html(t(ui.inventoryNotice))}</p>`:''}<div class="inventory-layout">${hideMounts?'':`<section class="inventory-loadout sx-panel" aria-label="${t('INSTALLED EQUIPMENT')}"><header class="inventory-ship"><span class="sx-label">${html(t(ship?.role??''))}${ship?.tier?` · T${ship.tier}`:''}</span><h3>${html(ship?.name??'')}</h3></header><div class="inventory-mounts">${mountGroups}</div></section>`}<section class="inventory-stock sx-panel ${item?'has-detail':''}">${cargoUsage}<nav class="inventory-tabs"><select class="inventory-tab-select" data-inventory-tab aria-label="${t('Inventory section')}">${tabs.map(v=>`<option value="${v}" ${view===v?'selected':''}>${t(tabLabels[v])}</option>`).join('')}</select><div class="inventory-tab-buttons sx-seg">${tabs.map(v=>button('tab',tabLabels[v],`data-tab="${v}" aria-pressed="${view===v}"`)).join('')}</div>${sortMenu}</nav>${chips}<div class="inventory-stock-body sx-scroll">${list}</div></section>${panel||(!hideMounts?`<aside class="inventory-comparison inventory-empty inventory-overview sx-panel"><div class="inventory-detail-scroll"><p class="inventory-empty-hint sx-hint">${uiIcon('info',16)}<span>${t('Select an item to compare it with your equipment.')}</span></p><section class="inventory-context">${budgetMarkup}</section></div></aside>`:'')}</div></section>`;
}

export function bindEquipmentInventory(ui){
 const activeInventory=()=>ui.root.querySelector('#ship-panel:not(.is-hidden) .equipment-inventory')??ui.root.querySelector('#dock-screen:not(.is-hidden) .equipment-inventory');
 const redraw=()=>{
  const selectors=['.inventory-mounts','.inventory-stock-body','.inventory-detail-scroll'];
  const previous=activeInventory(),oldView=previous?.dataset.inventoryView;
  ui.inventoryScroll??={};
  for(const selector of selectors){const e=previous?.querySelector(selector);if(e?.getClientRects().length)ui.inventoryScroll[`${oldView}:${selector}`]=e.scrollTop;}
  if(ui.root.querySelector('#ship-panel:not(.is-hidden)'))ui.showShipMenu();else ui.refreshDock(ui.save);
  const next=activeInventory(),nextView=next?.dataset.inventoryView;
  for(const selector of selectors){const e=next?.querySelector(selector);if(e)e.scrollTop=ui.inventoryScroll[`${nextView}:${selector}`]??0;}
 };
 ui.root.addEventListener('click',event=>{
  for(const menu of ui.root.querySelectorAll('.inventory-sort[open]'))if(!menu.contains(event.target))menu.open=false;
  const b=event.target.closest('[data-inventory-id],[data-inventory-mount],[data-inventory-action]');if(!b)return;
  if(b.dataset.inventoryId){ui.inventoryItemId=b.dataset.inventoryId;ui.inventoryFitExplicit=false;redraw();return;}
  if(b.dataset.inventoryMount){ui.inventoryMountId=b.dataset.inventoryMount;const slot=inventoryMounts(ui.save.player.shipId).find(s=>s.mount.id===ui.inventoryMountId);ui.inventoryItemId=mountItemId(ui.save.player.outfitting.loadouts[ui.save.player.shipId],slot);if(!ui.inventoryItemId)ui.inventoryTab=ui.save.player.dockedAt?'shop':'cargo';redraw();return;}
  const action=b.dataset.inventoryAction;
  if(action==='fit-mount'){ui.inventoryMountId=b.dataset.mountId;ui.inventoryFitExplicit=true;redraw();return;}
  if(action==='open'){ui.inventoryView=true;ui.showShipMenu();return;}
  if(action==='tab'){ui.inventoryTab=b.dataset.tab;ui.inventoryItemId=undefined;redraw();return;}
  if(action==='category'){ui.inventoryCategory=b.dataset.category;redraw();return;}
  if(action==='sort'&&['name','tier','mass'].includes(b.dataset.sort)){ui.inventorySort=b.dataset.sort;redraw();activeInventory()?.querySelector('.inventory-sort > summary')?.focus({preventScroll:true});return;}
  if(action==='close-detail'){ui.inventoryItemId=undefined;redraw();return;}
  if(action==='clear-mount'){ui.inventoryMountId=undefined;ui.inventoryItemId=undefined;redraw();return;}
  if(action==='buy-install'){
   const bought=ui.actions.inventoryCommand('buy',{baseId:b.dataset.baseId,tier:b.dataset.tier,offerId:b.dataset.offerId});
   const result=bought?.ok&&bought.id?ui.actions.inventoryCommand('install',{id:bought.id,mountId:b.dataset.mountId}):bought;
   ui.inventoryNotice=result?.ok?undefined:result?.code==='cargo-full'?'Cargo hold is full.':result?.code;
   if(bought?.ok&&bought.id){ui.inventoryItemId=bought.id;ui.inventoryFitExplicit=false;}
   redraw();return;
  }
  if(action==='jettison-cargo'){
   const input=b.closest('.inventory-commodity')?.querySelector('[data-jettison-quantity]');
   if(!input||!input.reportValidity())return;
   ui.actions.jettison(b.dataset.jettisonCommodity,input.valueAsNumber);redraw();return;
  }
  const result=ui.actions.inventoryCommand(action,{id:b.dataset.itemId,baseId:b.dataset.baseId,tier:b.dataset.tier,offerId:b.dataset.offerId,mountId:b.dataset.mountId,wreckId:b.dataset.wreckId,group:b.dataset.group});
  // Success is already visible in the updated cards. Keep only failures as text.
  ui.inventoryNotice=result?.ok?undefined:result?.code==='cargo-full'?'Cargo hold is full.':result?.code;
  if(result?.ok&&result.id)ui.inventoryItemId=result.id;
  if(result?.ok&&['buy','install','remove'].includes(action))ui.inventoryFitExplicit=false;
  if(result?.ok&&['recover','recover-drone','sell','jettison'].includes(action))ui.inventoryItemId=undefined;
  redraw();
 });
 ui.root.addEventListener('change',e=>{if(e.target.matches('[data-inventory-tab]')){ui.inventoryTab=e.target.value;ui.inventoryItemId=undefined;ui.inventoryNotice=undefined;redraw();}});
 ui.root.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const menu=e.target.closest('.inventory-sort[open]');if(menu){e.preventDefault();e.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus();}},true);
 ui.root.addEventListener('dragstart',e=>{const b=e.target.closest('[data-inventory-id]');if(b)e.dataTransfer.setData('text/plain',b.dataset.inventoryId);});
 ui.root.addEventListener('dragover',e=>{if(e.target.closest('[data-inventory-mount]'))e.preventDefault();});
 ui.root.addEventListener('drop',e=>{const b=e.target.closest('[data-inventory-mount]');if(!b)return;e.preventDefault();const result=ui.actions.inventoryCommand('install',{id:e.dataTransfer.getData('text/plain'),mountId:b.dataset.inventoryMount});ui.inventoryNotice=result.ok?undefined:result.code;redraw();});
}
