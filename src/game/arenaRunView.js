// Arena Run preparation screens: hull and wingman picks, reward draws, the
// ready-room loadout and fitting, and the result. Pure markup from the save;
// GameUI.showArenaRun mounts it and the shared click handler reads the
// data-ui-command / data-run-* attributes (kept stable for controller and tests).
import {arenaSite} from './arenaSites.js';
import {EQUIPMENT_RARITIES,equipmentName,modifiedWeapon,equipmentBaseId,equipmentRating,equipmentAffixLines,NAMED_EQUIPMENT} from './equipmentCatalog.js';
import {RUN_EQUIPMENT_RARITY,RUN_WAVES,DECISION_STAGES,isPendingDecision,waveAct,runScore,runRewardPlan,runHullOffers,runWingmanOffers,WING_ORDERS,WING_ORDER_LABEL,wingmanOrder} from './arenaRun.js';
import {SHIPS,displaySpeed} from './data.js';
import {getEffectiveShipStats} from './shipStats.js';
import {TRACKING_LASER,weaponForOutfit,launcherForOutfit} from './weapons.js';
import {PDC_TURRET} from './turrets.js';
import {equipmentIcon} from './itemIcons.js';
import {uiIcon} from './uiIcons.js';
import {DRONE_TYPES} from './droneData.js';
import {magazineLabel,equipmentStatChanges} from './equipmentStatPresentation.js';
import {shipTopDownProfile,shipProfilePath} from './shipTopDownProfile.js';
import {HARDPOINT_SPECS,LOADOUT_KEYS,OUTFIT_ITEMS,itemFitsMount,loadoutFor} from './outfitting.js';
import {getLanguage,t} from './i18n.js';

const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]);
const ROMAN=['','I','II','III'];
const CATEGORY={gun:'Gun',launcher:'Launcher',turret:'Turret',drone:'Drone'};
const SERVICES=['repair','rearm','resupply'];
const shipRole=role=>({allrounder:'All-rounder',industrial:'Industrial freighter',interceptor:'Interceptor',fighter:'Fighter',bomber:'Bomber',transport:'Transport'}[role]??role);
// Hull bars compare against the strongest hull in the whole roster, so a
// tier III pick visibly outclasses tier I across runs.
let rosterMax;
const hullMaxima=()=>rosterMax??=Object.values(SHIPS).reduce((m,h)=>({shield:Math.max(m.shield,h.shield),hull:Math.max(m.hull,h.hull),speed:Math.max(m.speed,h.maxSpeed),power:Math.max(m.power,h.reactorOutput??0),turn:Math.max(m.turn,h.angularAcceleration??0)}),{shield:1,hull:1,speed:1,power:1,turn:1});

// The drawn silhouette's own bounds (profile.min/max describe the source grid).
const profileBox=profile=>{
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 const add=(x,z)=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);};
 for(const c of [...(profile.contours??[]),...(profile.details??[])])for(const [x,z] of c.points)add(x,z);
 for(const [x1,z1,x2,z2] of profile.edges??[]){add(x1,z1);add(x2,z2);}
 if(!Number.isFinite(minX))return [profile.minX,profile.minZ,profile.maxX-profile.minX,profile.maxZ-profile.minZ];
 const pad=Math.max(maxX-minX,maxZ-minZ)*.06;
 return [minX-pad,minZ-pad,maxX-minX+pad*2,maxZ-minZ+pad*2];
};
// Sustained damage per second of one mount (bursts, pellets, crit cadence).
const sustainedDps=w=>{
 if(!w||w.ordnanceId)return undefined;
 const rate=w.burstSize?w.burstSize/((w.shotInterval??w.cooldown)*w.burstSize+(w.burstPause??0)):1/(w.cooldown||1);
 const crit=w.critEvery?1+((w.critMultiplier??2)-1)/w.critEvery:1;
 return (w.damageFlat??w.damage??0)*(w.pellets??1)*rate*crit;
};

export function renderArenaRun(ui,save){
 const r=save.arenaRun,p=save.player,stats=getEffectiveShipStats(p),wave=RUN_WAVES[r.wave],fit=loadoutFor(p),spec=HARDPOINT_SPECS[p.shipId];
 const done=r.phase==='won'||r.phase==='lost',pending=!done&&isPendingDecision(save);
 const formatter=new Intl.NumberFormat(getLanguage(),{maximumFractionDigits:1});
 const num=value=>formatter.format(Number(value)||0);
 const item=id=>OUTFIT_ITEMS[id];
 const quality=id=>item(id)?.rarity??RUN_EQUIPMENT_RARITY[id]??'common';
 const paint=id=>`data-rarity="${quality(id)}" style="--item-color:var(--loot-${quality(id)})"`;
 // Hardware and tier; a legendary's own name is shown separately.
 const name=id=>{const d=item(id);return d?`${t(d.baseName??d.name)}\u00a0${ROMAN[d.tier??1]}`:'';};
 const nickname=id=>item(id)?.rarity==='named'?NAMED_EQUIPMENT[item(id).baseId]?.name:undefined;
 const icon=(id,cls='run-item-image')=>equipmentIcon(item(id),cls);
 const command=(action,value,label,extra='')=>`<button type="button" data-ui-command="run-action" data-run-action="${action}" data-run-value="${esc(value)}" ${extra}>${label}</button>`;
 const key=(cls,label,extra='')=>`<button type="button" class="sx-btn ${cls}" ${extra}>${label}</button>`;
 const flight=id=>{const d=item(id);if(!d)return;return d.category==='turret'?modifiedWeapon(d.turretKind==='pdc'?PDC_TURRET:TRACKING_LASER,d):weaponForOutfit(id)??launcherForOutfit(id);};
 const fittedRating={};
 for(const k of ['guns','launchers','turrets','utility'])for(const id of fit[k]??[]){const d=id&&item(id);if(d&&d.category!=='drone'){const base=equipmentBaseId(id),value=equipmentRating(d);fittedRating[base]=Math.min(fittedRating[base]??Infinity,value);}}

 // ── item presentation ───────────────────────────────────────────
 const artPlate=(id,big=true)=>`<span class="run-art-plate${big?'':' is-small'}" ${paint(id)}>${icon(id)}<i class="run-tier">${ROMAN[item(id)?.tier??1]??''}</i></span>`;
 const ratingBadge=(id,against)=>{
  const d=item(id);if(!d)return '';
  const value=equipmentRating(d),base=equipmentBaseId(id),compare=against!==undefined?against:fittedRating[base],up=compare!=null&&compare!==Infinity&&value>compare;
  return `<span class="run-rating${up?' is-up':''}" title="${esc(t('Rating')+(up?' · '+t('Upgrade'):''))}"><small>${esc(t('Rating'))}</small><b>${up?'▲':''}${value}</b></span>`;
 };
 // What the grade itself and each roll do, then the legendary trait.
 const modifierRows=id=>{
  const d=item(id);if(!d)return [];
  const rows=[],gain=EQUIPMENT_RARITIES[d.rarity]?.gain??1;
  if(gain>1)rows.push({kind:'grade',label:t(EQUIPMENT_RARITIES[d.rarity].name),text:t(['gun','launcher','turret'].includes(d.category)?'+{value}% damage':'+{value}% effect',{value:Math.round((gain-1)*100)})});
  for(const a of equipmentAffixLines(d))rows.push({kind:'affix',id:a.id,label:a.name,text:a.text,quality:a.quality});
  return rows;
 };
 const modifiers=(id,{compact=false}={})=>{
  const rows=modifierRows(id),trait=item(id)?.trait;
  if(!rows.length&&!trait)return '';
  const list=rows.length?`<ul class="run-rarity-effects">${rows.map(row=>`<li class="${row.kind==='grade'?'is-grade':''}" ${row.id?`data-affix="${esc(row.id)}"`:''}><b>${esc(row.label)}</b><span>${esc(row.text)}</span>${row.quality!=null&&!compact?`<i class="run-roll" style="--q:${Math.round(row.quality*100)}%" aria-hidden="true"></i>`:''}</li>`).join('')}</ul>`:'';
  return list+(trait?`<p class="run-trait"><b>★ ${esc(t('Legendary trait'))}</b><span>${esc(t(trait))}</span></p>`:'');
 };
 // One line for lists and tooltips: grade, modifier names, trait.
 const summary=(id,full=false)=>{
  const d=item(id);if(!d)return '';
  const q=quality(id),parts=[];
  if(q!=='common')parts.push(t(EQUIPMENT_RARITIES[q].name));
  parts.push(...(d.affixIds??[]).map(a=>equipmentAffixLines(d).find(x=>x.id===a)?.name).filter(Boolean));
  if(d.trait&&full)parts.push(`★ ${t(d.trait)}`);
  else if(d.trait)parts.push(`★ ${t('Legendary trait')}`);
  return parts.join(' · ');
 };
 const titleBlock=id=>{const nick=nickname(id),d=item(id);return `<span class="run-offer-title"><b class="run-item-label" ${paint(id)}>${esc(name(id))}</b>${nick?`<em class="run-nickname">${esc(t(nick))}</em>`:''}<span class="run-grade"><span class="run-rarity-badge">${esc(t(EQUIPMENT_RARITIES[quality(id)].name))}</span><span>${esc(t(CATEGORY[d?.category]??'System'))} · ${esc(t('TIER'))} ${ROMAN[d?.tier??1]}</span></span></span>`;};
 // Stat tiles with the change against what the reward replaces.
 const tile=(label,value,unit='',delta,lowerBetter=false,stat)=>{
  const shown=delta!=null&&Math.abs(delta)>1e-6,good=shown&&(lowerBetter?delta<0:delta>0);
  return `<span class="run-stat"${stat?` data-stat="${stat}"`:''}><small>${esc(t(label))}</small><b>${typeof value==='string'?esc(value):num(value)}${unit?`<span class="run-unit">${esc(unit)}</span>`:''}</b>${shown?`<em class="${good?'up':'down'}">${delta>0?'+':'−'}${num(Math.abs(delta))}</em>`:''}</span>`;
 };
 const statTiles=(id,replaced)=>{
  const d=item(id),w=flight(id);
  if(w){
   const old=replaced&&item(replaced)?.category===d.category?flight(replaced):undefined,diff=(a,b)=>old&&a!=null&&b!=null?a-b:undefined;
   if(d.category==='launcher')return `<span class="run-stats run-launcher-stats">${tile('Shield damage',magazineLabel(w,'shield'))}${tile('Hull damage',magazineLabel(w,'hull'))}${tile('Lock time',w.lockTime,' s',diff(w.lockTime,old?.lockTime),true)}${tile('Range',w.lockRange,' km',diff(w.lockRange,old?.lockRange))}</span>`;
   const dps=sustainedDps(w);
   return `<span class="run-stats">${tile('Damage per second',dps,'',diff(dps,sustainedDps(old)))}${tile('Energy per shot',w.energyCost??0,'',diff(w.energyCost,old?.energyCost),true)}${tile('Range',w.range??0,' km',diff(w.range,old?.range))}</span>`;
  }
  // Drones: what the unit is, not a stat projection of the ship.
  if(d?.category==='drone'){
   const type=DRONE_TYPES[d.droneType];
   return `<span class="run-stats">${tile('Hull',type?.maxHull??0)}${tile('Range',d.droneType==='repair'?200:300,' km')}${d.droneType==='repair'?tile('Repair per second',type?.repairRate??0):tile('Intercepts',t('Missiles'))}</span>`;
  }
  // Systems preview the actual fitted outcome, including trade-offs.
  const plan=runRewardPlan(save,id),outfitting=JSON.parse(JSON.stringify(p.outfitting)),afterFit=outfitting.loadouts[p.shipId];
  for(const c of plan?.changes??[]){afterFit[c.key][c.index]=id;if(c.otherKey)afterFit[c.otherKey][c.index]=null;}
  const rows=equipmentStatChanges(stats,getEffectiveShipStats({...p,outfitting}),d),primary=rows.filter(row=>row.primary),tradeoffs=rows.filter(row=>!row.primary);
  const unit=row=>row.unit&&row.unit!=='%'?` ${row.unit.trim()}`:row.unit??'';
  // Every loss from the item this replaces stays visible as a compact chip.
  const chips=tradeoffs.length?`<span class="run-tradeoffs">${tradeoffs.map(row=>`<i data-stat="${row.key}" title="${esc(`${num(row.before)} → ${num(row.after)}${unit(row)}`)}"><small>${esc(t(row.label))}</small><em class="${row.improved?'up':'down'}">${row.after>row.before?'+':'−'}${num(Math.abs(row.after-row.before))}</em></i>`).join('')}</span>`:'';
  return (primary.length?`<span class="run-stats">${primary.map(row=>tile(row.label,row.after,unit(row),row.after-row.before,row.lowerBetter,row.key)).join('')}</span>`:'')+chips;
 };

 const leave=key('sx-btn-ghost run-leave',uiIcon('back',18),`data-ui-command="quit-title" aria-label="${esc(t('Save and leave'))}" title="${esc(t('Save and leave'))}"`);
 let body='',footer='',view=done?'result':pending?'hulls':!r.rewardChosen?'rewards':ui.runFitOpen?'fitting':'ready';

 if(done){
  const won=r.phase==='won';
  body=`<div class="run-result ${won?'is-won':'is-lost'}"><small>${esc(t(won?'Run complete':'Run ended'))}</small><b class="run-score">${num(runScore(r))}</b><span class="run-score-label">${esc(t('Score'))}</span><dl class="run-result-stats"><div><dt>${esc(t('Waves cleared'))}</dt><dd>${r.cleared}/${r.totalWaves??RUN_WAVES.length}</dd></div><div><dt>${esc(t('Damage taken'))}</dt><dd>${num(Math.round(r.damage))}</dd></div></dl></div>`;
  footer=`${leave}<span class="run-spacer"></span>${key('sx-btn-primary',esc(t('New run')),'data-ui-command="new-arena-run"')}`;
 }else if(pending){
  const stage=DECISION_STAGES[r.wave],isHull=stage.type==='hull';
  const hulls=isHull?(r.hullOffers?.length?r.hullOffers:runHullOffers(save)):[];
  const candidates=isHull?[]:(r.wingmanOffers?.length?r.wingmanOffers:runWingmanOffers(save));
  const currentWing=r.wingmen?.[stage.wingIndex],upgrading=stage.type==='wingman-upgrade'&&currentWing?.alive!==false&&Boolean(currentWing);
  const max=hullMaxima();
  const bar=(label,value,limit,shown)=>`<span class="run-bar"><small>${esc(t(label))}</small><i style="--v:${Math.max(4,Math.min(100,value/limit*100)).toFixed(1)}%"></i><b>${shown}</b></span>`;
  const hullCard=(id,pilot)=>{
   const h=SHIPS[id],mounts=HARDPOINT_SPECS[id],profile=shipTopDownProfile(h.variant);
   const silhouette=`<svg class="run-hull-image" viewBox="${profileBox(profile).map(v=>+v.toFixed(2)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(h.name)}"><path d="${shipProfilePath(profile)}" fill="rgba(105,228,242,.07)" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path d="${shipProfilePath(profile,true)}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".6" stroke-linejoin="round"/></svg>`;
   const counts=[['Guns',mounts.guns.length,'equipment'],['Missiles',mounts.launchers.length,'missile'],['Turrets',mounts.turrets.length],['Systems',mounts.utility.length],['Drones',mounts.droneBays.length]];
   return `<span class="run-hull-head"><b class="run-hull-name">${esc(h.name)}</b><span class="run-hull-role">T${h.tier} · ${esc(t(shipRole(h.role)))}</span>${pilot?`<span class="run-pilot">${esc(pilot)}</span>`:''}</span><span class="run-hull-plate">${silhouette}<i class="run-tier">${ROMAN[h.tier]}</i></span><span class="run-bars">${bar('SHIELD',h.shield,max.shield,num(h.shield))}${bar('HULL',h.hull,max.hull,num(h.hull))}${bar('Speed',h.maxSpeed,max.speed,num(displaySpeed(h.maxSpeed)))}${bar('ENERGY',h.reactorOutput??0,max.power,`${num(h.reactorOutput??0)}/s`)}</span><span class="run-mount-counts">${counts.map(([label,n,icon])=>`<i title="${esc(t(label))}"><b>${icon?uiIcon(icon,12):''}${n}</b><small>${esc(t(label))}</small></i>`).join('')}</span>`;
  };
  const cards=isHull?hulls.map(id=>command('hull',id,hullCard(id),'class="run-offer run-hull-card"')).join('')
   :candidates.map(c=>command('wingman',c.id,hullCard(c.hullId,upgrading?currentWing.name:c.name),'class="run-offer run-hull-card"')).join('');
  body=`<div class="run-offers ${isHull?'run-hulls':'run-wingmen'}">${cards}</div>`;
  footer=leave;
 }else if(!r.rewardChosen){
  const opening=r.wave===0&&r.openingPicks===0;
  body=`<div class="run-offers">${r.offers.map(id=>{
   const plan=runRewardPlan(save,id);if(!plan)return '';
   const selected=r.selectedReward===id,mark='<span class="run-selected-mark" aria-hidden="true">✓</span>';
   if(SERVICES.includes(id)){
    const title=id==='resupply'?t('Refuel and recharge'):id==='rearm'?t('Reload missiles'):t('Field repairs');
    const blurb=t(id==='repair'?'Patch up half the hull damage and reload every launcher.':id==='rearm'?'Reload every launcher to full.':'Top up energy and fuel before the next wave.');
    const lines=id==='repair'?[['HULL','+50%'],['MISSILES','100%']]:id==='rearm'?[['MISSILES','100%']]:[['ENERGY','100%'],['FUEL','100%']];
    return command('reward',id,`<span class="run-offer-head"><span class="run-art-plate is-service">${uiIcon(id==='repair'?'repair':id==='rearm'?'weapons':'fuel',30)}</span><span class="run-offer-title"><b class="run-item-label">${esc(title)}</b></span></span><p class="run-service-blurb">${esc(blurb)}</p><span class="run-stats">${lines.map(([label,value])=>tile(label,value)).join('')}</span>${mark}`,`class="run-offer is-service ${selected?'is-selected':''}" data-service="true" title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${selected}"`);
   }
   const replaced=[...new Set(plan.replaced)],first=replaced[0],against=first&&equipmentBaseId(first)===equipmentBaseId(id)?equipmentRating(item(first)):undefined;
   const swap=`<span class="run-replacement"><small>${esc(t(replaced.length?'Replaces':'Empty mount'))}</small>${replaced.length?replaced.map(old=>`<span class="run-swap-item" ${paint(old)}>${icon(old)}<span>${esc(name(old))}</span></span>`).join(''):'<span class="run-empty-mount">+</span>'}${plan.count>1?`<em class="run-quantity">×${plan.count}</em>`:''}</span>`;
   const label=`${plan.count}× ${name(id)} · ${t(EQUIPMENT_RARITIES[quality(id)].name)}`;
   return command('reward',id,`<span class="run-offer-head">${artPlate(id)}${titleBlock(id)}${ratingBadge(id,against)}</span>${statTiles(id,first)}<span class="run-offer-mods">${modifiers(id)}</span>${swap}${mark}`,`class="run-offer ${selected?'is-selected':''}" ${paint(id)} title="${esc([equipmentName(item(id)),summary(id,true)].filter(Boolean).join(' — '))}" aria-label="${esc(label)}" aria-pressed="${selected}"`);
  }).join('')}</div>`;
  const armed=fit.guns.some(Boolean),chosen=r.offers.includes(r.selectedReward)&&runRewardPlan(save,r.selectedReward);
  footer=`${leave}${armed?command('skip','',`${esc(t('Skip draw'))}<small>${esc(t('+50% hull · rarity +1'))}</small>`,`class="sx-btn sx-btn-secondary" title="${esc(t('Repair 50% hull, refill missiles; next round rewards are one rarity higher.'))}"`):''}<span class="run-spacer"></span>${opening?'':command('equip','',esc(t('Fitting')),`class="sx-btn sx-btn-secondary" ${chosen?'':'disabled'}`)}${command('accept','',esc(t(opening?'NEXT':'LAUNCH')),`class="sx-btn sx-btn-primary" ${chosen?'':'disabled'}`)}`;
 }else{
  const slots=['guns','launchers','turrets','utility'].flatMap(k=>spec[k].map((mount,index)=>({key:k,mount,index,id:fit[k][index]})));
  const slotLabel=s=>`${t(s.key==='guns'?'Gun':s.key==='launchers'?'Missile':s.key==='turrets'?'Turret':'Utility')} ${s.index+1}`;
  if(ui.runFitOpen){
   const selected=slots.find(s=>s.mount.id===ui.runMountId)??slots[0];ui.runMountId=selected.mount.id;
   const attrs=`data-run-key="${selected.key}" data-run-index="${selected.index}"`;
   const locker=Object.entries(p.outfitting.locker).filter(([id,n])=>n>0&&itemFitsMount(item(id),selected.mount));
   const current=selected.id?equipmentRating(item(selected.id)):undefined;
   const mountList=slots.map(s=>`<button type="button" class="run-mount" data-ui-command="run-mount" data-run-value="${s.mount.id}" aria-pressed="${s.mount.id===selected.mount.id}" ${s.id?paint(s.id):''}>${s.id?artPlate(s.id,false):'<span class="run-art-plate is-small is-empty"><span class="run-empty-mount">+</span></span>'}<span class="run-mount-copy"><small>${s.key==='guns'?uiIcon('equipment',12):s.key==='launchers'?uiIcon('missile',12):''}${esc(slotLabel(s))}</small>${s.id?`<b class="run-item-label" ${paint(s.id)}>${esc(name(s.id))}</b>`:`<b>${esc(t('EMPTY'))}</b>`}</span></button>`).join('');
   const detail=selected.id?`<div class="run-fit-detail" ${paint(selected.id)}><span class="run-offer-head">${artPlate(selected.id)}${titleBlock(selected.id)}${ratingBadge(selected.id,null)}</span>${statTiles(selected.id)}<span class="run-offer-mods">${modifiers(selected.id)}</span></div>`:`<p class="run-empty-stock">${esc(t('EMPTY'))}</p>`;
   const spares=locker.map(([id,n])=>command('fit',id,`${artPlate(id,false)}<span class="run-mount-copy"><b class="run-item-label" ${paint(id)}>${esc(name(id))}</b><small>${esc(summary(id)||t(EQUIPMENT_RARITIES.common.name))}</small></span>${ratingBadge(id,selected.id&&equipmentBaseId(selected.id)===equipmentBaseId(id)?current:null)}${n>1?`<em class="run-quantity">×${n}</em>`:''}`,`class="run-spare" ${attrs} ${paint(id)} title="${esc([equipmentName(item(id)),summary(id,true)].filter(Boolean).join(' — '))}"`)).join('');
   const tools=`${selected.key==='guns'&&fit.guns[selected.index]?command('group',selected.mount.id,`${esc(t('FIRE GROUP'))} <b>${fit.fireGroups.assignments[selected.mount.id]}</b>`,`class="sx-btn sx-btn-ghost run-group" title="${esc(t('FIRE GROUP'))}"`):''}${command('fit','',esc(t('REMOVE')),`class="sx-btn sx-btn-ghost run-remove" ${attrs} ${selected.id?'':'disabled'}`)}`;
   body=`<div class="run-fit-layout"><nav class="run-mount-list" aria-label="${esc(t('INSTALLED EQUIPMENT'))}">${mountList}</nav><section class="run-fit-stock"><header class="run-section-head"><span>${esc(slotLabel(selected))}</span><span class="run-spacer"></span>${tools}</header>${detail}<header class="run-section-head"><span>${esc(t('Spare parts'))}</span></header><div class="run-locker-list">${spares||`<span class="run-empty-stock">${esc(t('No equipment here.'))}</span>`}</div></section></div>`;
  }else{
   const groups=[['guns','Guns'],['launchers','Missiles'],['turrets','Turrets'],['utility','Systems']].map(([k,label])=>[label,slots.filter(s=>s.key===k)]).filter(([,list])=>list.length);
   const row=s=>!s.id?`<div class="run-loadout-row is-empty"><span class="run-art-plate is-small is-empty"><span class="run-empty-mount">+</span></span><span class="run-mount-copy"><b>${esc(t('EMPTY'))}</b><small>${s.key==='guns'?uiIcon('equipment',12):s.key==='launchers'?uiIcon('missile',12):''}${esc(slotLabel(s))}</small></span></div>`:`<div class="run-loadout-row" ${paint(s.id)}>${artPlate(s.id,false)}<span class="run-mount-copy"><b class="run-item-label" ${paint(s.id)}>${esc(name(s.id))}${nickname(s.id)?` <em class="run-nickname">${esc(t(nickname(s.id)))}</em>`:''}</b><small>${esc(slotLabel(s))}${summary(s.id)?` · ${esc(summary(s.id))}`:''}</small></span>${ratingBadge(s.id,null)}</div>`;
   const loadout=`<section class="run-loadout"><header class="run-section-head"><span>${esc(t('Loadout'))}</span></header>${groups.map(([label,list])=>`<div class="run-loadout-group"><small class="run-group-label">${label==='Guns'?uiIcon('equipment',12):label==='Missiles'?uiIcon('missile',12):''}${esc(t(label))} · ${list.length}</small>${list.map(row).join('')}</div>`).join('')}</section>`;
   const readout=`<dl class="run-readout">${[['SHIELD',num(stats.shield)],['HULL',`${num(Math.max(0,p.hull))}/${num(stats.hull)}`],['Energy capacity',num(stats.energyCapacity)],['Energy regeneration',`${num(stats.reactorOutput)}/s`,stats.overTierLoad>0],['Speed',num(displaySpeed(stats.maxSpeed))],stats.missileCapacity>0?['MISSILES',`${num(p.missiles??0)}/${num(stats.missileCapacity)}`]:['Turn accel.',`${num((stats.angularAcceleration??0)*180/Math.PI)}°/s²`]].map(([label,value,warn])=>`<div${warn?' class="is-warn"':''}><dt>${esc(t(label))}</dt><dd>${value}</dd></div>`).join('')}</dl>${stats.overTierLoad>0?`<p class="run-warning">${esc(t('Higher-tier load: up to −{amount}/s.',{amount:num(stats.overTierLoad)}))}</p>`:''}`;
   const wingCrew=(Array.isArray(r.wingmen)?r.wingmen:[]).filter(w=>w.alive!==false);
   const crew=wingCrew.length?`<details class="run-crew" open><summary>${esc(t('WING'))} · ${wingCrew.length}</summary>${wingCrew.map((w,i)=>{const current=wingmanOrder(w,r);return `<div class="run-orders run-orders-wing"><b>${esc(w.name)}</b>${WING_ORDERS.map(order=>command('order',order,esc(t(WING_ORDER_LABEL[order])),`data-run-index="${i}" class="${current===order?'is-selected':''}" aria-pressed="${current===order}"`)).join('')}</div>`;}).join('')}</details>`:'';
   const site=arenaSite(wave.site);
   const next=`<div class="run-next-wave" data-site="${esc(wave.site)}"><small>${esc(t('Next wave'))}</small><b>${esc(t(wave.name))}</b><span class="run-site"><i>${esc(t(site.name))}</i> · ${esc(t(site.place))}</span><span>${esc(t(waveAct(r.wave).name))} · ${esc(t(wave.hint))}</span><span class="run-site-tip">${esc(t(site.tip))}</span></div>`;
   body=`<div class="run-ready">${loadout}<section class="run-ship-panel"><header class="run-section-head"><span>${esc(SHIPS[p.shipId].name)}</span></header>${next}${readout}${crew}</section></div>`;
  }
  footer=`${leave}<span class="run-spacer"></span><button type="button" class="sx-btn sx-btn-secondary" data-ui-command="run-fit-toggle" aria-pressed="${Boolean(ui.runFitOpen)}">${esc(ui.runFitOpen?t('BACK'):t('Fitting'))}</button><button type="button" class="sx-btn sx-btn-primary primary" data-ui-command="run-launch">${esc(t('LAUNCH'))}</button>`;
 }
 const step=done?'':pending?t(DECISION_STAGES[r.wave].type==='hull'?'HULL CHOICE':'WINGMAN CHOICE'):!r.rewardChosen?t(r.wave===0&&r.openingPicks===0?'WEAPONS · 1/2':r.wave===0&&r.openingPicks===1?'EQUIPMENT · 2/2':'EQUIPMENT CHOICE'):ui.runFitOpen?t('Fitting'):t('READY TO LAUNCH');
 const count=done?r.cleared:r.wave+1,total=r.totalWaves??RUN_WAVES.length,health=stats.hull>0?Math.max(0,Math.min(100,p.hull/stats.hull*100)):0;
 const header=`<header class="run-head"><div class="run-title"><h2>${esc(t('Arena Run'))}</h2><b class="run-wave" title="${esc(t('Waves cleared'))}: ${r.cleared}">${String(count).padStart(2,'0')}<small>/${total}</small></b>${r.hard?`<span class="run-hard">${esc(t('HARD'))}</span>`:''}</div>${done?'':`<div class="run-stage"><b>${esc(step)}</b><details class="run-next"><summary>${esc(t(wave.name))} · ${esc(t(arenaSite(wave.site).name))}</summary><p>${esc(t(arenaSite(wave.site).place))} · ${esc(t(waveAct(r.wave).name))} · ${esc(t(wave.hint))}</p><p>${esc(t(arenaSite(wave.site).tip))}</p></details></div>`}<span class="run-ship-status"><span>${esc(SHIPS[p.shipId].name)}</span><span class="run-health${health<35?' is-low':''}" role="progressbar" aria-valuemin="0" aria-valuemax="${stats.hull}" aria-valuenow="${Math.max(0,p.hull)}" aria-label="${esc(t('HULL'))}" title="${esc(t('HULL'))} ${Math.round(health)}%"><i style="width:${health.toFixed(1)}%"></i></span></span></header>`;
 const progress=done?'':`<div class="run-progress" role="progressbar" aria-label="${esc(t('Waves cleared'))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${r.cleared}">${Array.from({length:total},(_,i)=>`<i class="${i<r.cleared?'is-cleared':i===r.wave?'is-current':''}${DECISION_STAGES[i]?' is-decision':''}"></i>`).join('')}</div>`;
 return `<div class="modal-card run-card" data-run-view="${view}">${header}${progress}<div class="run-scroll">${ui.runFitNotice?`<p class="run-notice" role="status">${esc(ui.runFitNotice)}</p>`:''}${body}</div><footer class="run-actions">${footer}</footer></div>`;
}
