import {createNewSave,hydrateSave} from './save.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,LOADOUT_KEYS,loadoutFor,createOutfittingState,itemFitsMount,validateLoadout,projectLegacyEquipment,projectLegacyWeaponId} from './outfitting.js';
import {getEffectiveShipStats} from './shipStats.js';
import {launcherMagazineEntries,normalizeLauncherMagazines,fillLauncherMagazines} from './weapons.js';
import {seededRandom} from './random.js';
export const ARENA_RUN_KEY='voidrunner-arena-run-v1';
export const ARENA_RECORD_KEY='voidrunner-arena-record-v1';
// Enemy entries: role, pilot tier, gun fit, arrival delay, optional finite ordnance.
// Omitted ordnance means no missiles, independently of the normal flight loadout.
// Each wave specifies guns and turrets explicitly, independent of world presets.
const enemy=(role,tier,guns,delay=0,ordnance={})=>[role,tier,0,delay,{guns,turrets:['pdc','pdc'],...ordnance}];
export const RUN_WAVES=[
 {name:'First contact',hint:'One hesitant pilot. Take your time and watch your energy.',environment:'open',enemies:[enemy('pirate','novice',['beam-emitter',null,null])]},
 {name:'Second contact',hint:'A second novice joins after twelve seconds. Watch the entry marker.',environment:'open',enemies:[enemy('pirate','novice',['pulse-cannon','pulse-cannon',null]),enemy('escort','novice',['pulse-cannon','beam-emitter'],12)]},
 {name:'Interceptor',hint:'An agile veteran. Turn early and fire during the close pass.',environment:'open',enemies:[enemy('pirate','veteran',['pulse-cannon','pulse-cannon',null])]},
 {name:'Broken formation',hint:'Two novices enter first. A veteran arrives after twenty seconds. Use wrecks against their seekers.',environment:'debris-field',enemies:[enemy('escort','novice',['pulse-cannon','beam-emitter'],0,{launcher:'seeker',missiles:2}),enemy('pirate','novice',['pulse-cannon','pulse-cannon',null]),enemy('pirate','veteran',['pulse-cannon','pulse-cannon',null],20)]},
 {name:'Heavy escort',hint:'The gunship carries two seekers. Its light escort is easier to isolate.',environment:'asteroid-field',enemies:[enemy('bounty','veteran',['pulse-cannon','mortar'],0,{launcher:'seeker',missiles:2}),enemy('pirate','novice',['pulse-cannon','pulse-cannon','beam-emitter'])]},
 {name:'The duellist',hint:'An ace uses drift and reversals. Save energy for the opening.',environment:'open',enemies:[enemy('pirate','ace',['pulse-cannon','pulse-cannon','beam-emitter'])]},
 {name:'Crossfire',hint:'A close-range veteran enters first. A missile gunship joins after eight seconds. Separate them.',environment:'debris-field',enemies:[enemy('pirate','veteran',['ripper','ripper','ion-blaster']),enemy('bounty','veteran',['pulse-cannon','gauss-cannon'],8,{launcher:'seeker',missiles:3})]},
 {name:'Final flight',hint:'The ace carries two torpedoes. A veteran escort arrives after ten seconds.',environment:'asteroid-field',enemies:[enemy('bounty','ace',['pulse-cannon','mortar'],0,{launcher:'torpedo',missiles:2}),enemy('escort','veteran',['pulse-cannon','beam-emitter'],10,{launcher:'seeker',missiles:2})]},
 {name:'Vanguard pair',hint:'Two Vanguards cover each other. Use wrecks to isolate one and escape their turret arcs.',environment:'debris-field',enemies:[enemy('patrol','veteran',['ripper','ion-blaster']),enemy('patrol','ace',['pulse-cannon','gauss-cannon'],0,{launcher:'seeker',missiles:2})]},
 {name:'The frigate',hint:'Batteries fire in two waves: watch the charge and take cover. Attack during recovery. Plasma and torpedoes penetrate the armored hull; use the aim button to target exposed batteries.',environment:'asteroid-field',enemies:[['frigate','ace',0,0]]},
];
export function newArenaRun(hard=false,seed=Date.now()) {
 const save=createNewSave(seed,{tutorial:false});save.arena={run:true};save.player.credits=0;save.player.cargo={};save.player.throttle=.35;
 save.arenaRun={version:2,totalWaves:RUN_WAVES.length,seed,hard,wave:0,phase:'prepare',rewardChosen:true,hullChosen:true,offers:[],cleared:0,elapsed:0,damage:0,missiles:0};return save;
}
export function readArenaRun(){try{
 const raw=JSON.parse(window.localStorage.getItem(ARENA_RUN_KEY)),r=raw?.arenaRun;
 if(![1,2].includes(r?.version)||!['prepare','combat','won','lost'].includes(r.phase)||!Number.isInteger(r.wave)||r.wave<0||r.wave>=(r.version===1?8:RUN_WAVES.length))return null;
 // Finished eight-wave records remain finished. Active checkpoints gain waves 9–10.
 if(r.version===1){r.totalWaves=['won','lost'].includes(r.phase)?8:RUN_WAVES.length;r.version=2;}
 const save=hydrateSave(raw);save.arenaRun=r;save.arena={run:true};refreshRunRewardOffers(save);return save;
 }catch{return null;}}

export function writeArenaRun(save){try{const clean={...save,player:{...save.player}};delete clean.player.turretRuntime;delete clean.player.prevPosition;delete clean.player.prevRotation;window.localStorage.setItem(ARENA_RUN_KEY,JSON.stringify(clean));return true;}catch{return false;}}
export function arenaRecord(){try{return JSON.parse(window.localStorage.getItem(ARENA_RECORD_KEY))??{};}catch{return {};}}
export function recordArenaRun(save){const r=save.arenaRun,old=arenaRecord();try{window.localStorage.setItem(ARENA_RECORD_KEY,JSON.stringify({unlockedHard:old.unlockedHard||r.phase==='won',best:Math.max(old.best??0,runScore(r)),last:{cleared:r.cleared,score:runScore(r)}}));}catch{}}
export const runScore=r=>Math.max(0,Math.round(r.cleared*1000+(r.phase==='won'?2000:0)-r.elapsed*2-r.damage*2-r.missiles*20));
const rewardPools={
 offense:['pulse-cannon','ripper','gauss-cannon','ion-blaster','mortar','pulse-mk2','swarm-launcher','torpedo-launcher'],
 survival:['pdc','tracking-turret','shield-mk2','recovery-shield'],
 handling:['engine-mk2','thrusters-mk2','capacitor-bank','sustained-reactor'],
};
const rewardWave={'pulse-mk2':3,'swarm-launcher':3,'torpedo-launcher':5,'mortar':2,'gauss-cannon':2};
export function runOffers(save){
 const r=save.arenaRun,p=save.player,fit=loadoutFor(p),owned=LOADOUT_KEYS.flatMap(k=>fit[k]).filter(Boolean);
 const rng=seededRandom(`${r.seed}:reward:${r.wave}:${p.shipId}`);
 const eligible=id=>r.wave>=(rewardWave[id]??1)&&runRewardPlan(save,id)&&!p.outfitting.locker[id]&&(OUTFIT_ITEMS[id].category==='gun'||!owned.includes(id));
 const candidates=Object.fromEntries(Object.entries(rewardPools).map(([key,ids])=>[key,ids.filter(eligible).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).map(x=>x.id)]));
 const offers=[];
 // Offer a heavy boss weapon where mounts permit it; small hulls get
 // scatterguns for exposed batteries. Stored copies do not block this offer.
 if(r.wave===9){
  const heavy=HULL_HARDPOINTS[p.shipId].guns.some(m=>m.size==='M')||HULL_HARDPOINTS[p.shipId].launchers.some(m=>m.size==='M');
  const counters=heavy?['torpedo-launcher','mortar']:['ripper'];
  if(!owned.some(id=>counters.includes(id))){const counter=counters.find(id=>runRewardPlan(save,id));if(counter)offers.push(counter);}
 }
 for(const key of ['offense','survival','handling']){if(key==='offense'&&offers.length)continue;const id=candidates[key].find(id=>!offers.includes(id));if(id)offers.push(id);}
 for(const id of Object.values(candidates).flat())if(offers.length<3&&!offers.includes(id))offers.push(id);
 if(p.hull<=getEffectiveShipStats(p).hull*.8)offers.splice(2,1,'repair');
 return offers;
}
// Preserve the two already-offered items when an old checkpoint has an unnecessary repair.
export function refreshRunRepairOffer(save){const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!r.offers.includes('repair')||save.player.hull<=getEffectiveShipStats(save.player).hull*.8)return;
 const replacement=runOffers(save).find(id=>id!=='repair'&&!r.offers.includes(id));if(replacement)r.offers=r.offers.map(id=>id==='repair'?replacement:id);
}
export function refreshRunRewardOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen)return;
 const highHull=save.player.hull>getEffectiveShipStats(save.player).hull*.8;
 const valid=(r.offers??[]).filter(id=>runRewardPlan(save,id)&&!(highHull&&id==='repair'));
 for(const id of runOffers(save))if(valid.length<3&&!valid.includes(id))valid.push(id);
 const bossOffer=runOffers(save)[0];if(r.wave===9&&['torpedo-launcher','mortar','ripper'].includes(bossOffer)&&!valid.includes(bossOffer))valid[0]=bossOffer;
 r.offers=valid;if(!valid.includes(r.selectedReward))r.selectedReward=null;
}
export function recoverRun(save,extra=false){const p=save.player,stats=getEffectiveShipStats(p),r=save.arenaRun;p.hull=Math.min(stats.hull,p.hull+stats.hull*(extra?.4:r.hard?.1:.2));p.shield=stats.shield;p.energy=stats.energyCapacity;p.fuel=stats.fuel;
 if(extra)fillLauncherMagazines(p);else {for(const entry of normalizeLauncherMagazines(p))if(entry.rounds<entry.capacity)p.launcherMagazines[entry.mount.id].rounds++;normalizeLauncherMagazines(p);}
}
// A reward is a complete, mass-checked replacement plan, not a loose gun.
export function runRewardPlan(save,id){
 if(id==='repair')return {id,count:1,changes:[],replaced:[]};
 const p=save.player,item=OUTFIT_ITEMS[id],spec=HULL_HARDPOINTS[p.shipId];if(!item||id==='ion-blaster'&&spec.guns.length<2)return null;
 const fit=loadoutFor(p),key=LOADOUT_KEYS.find(k=>spec[k].some(m=>itemFitsMount(item,m)));if(!key)return null;
 let indices=spec[key].map((m,i)=>itemFitsMount(item,m)?i:-1).filter(i=>i>=0);
 if(key==='guns'&&id!=='ion-blaster'){
  // Pair matching wing mounts; retain the Talon's independent centre gun.
  const size=spec[key][indices[0]].size;indices=indices.filter(i=>spec[key][i].size===size);
 }else indices=[indices.find(i=>!fit[key][i])??indices.find(i=>fit[key][i]!==id)??indices[0]];
 if(indices.every(i=>fit[key][i]===id))return null;
 const changes=indices.map(index=>({key,index,old:fit[key][index]}));
 for(const change of changes)fit[key][change.index]=id;
 if(!validateLoadout(p,p.shipId,fit).ok)return null;
 return {id,count:changes.length,changes,replaced:changes.map(c=>c.old).filter(Boolean)};
}
export function chooseRunReward(save,id){
 refreshRunRepairOffer(save);const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!r.offers.includes(id))return false;
 const plan=runRewardPlan(save,id);if(!plan)return false;
 if(id==='repair')recoverRun(save,true);
 else{
  // Commit the complete fit together so a pair cannot fail halfway through.
  const p=save.player,state=JSON.parse(JSON.stringify(p.outfitting)),fit=state.loadouts[p.shipId];
  for(const {key,index,old} of plan.changes){
   if(old){state.locker[old]=(state.locker[old]??0)+1;if(state.factory[p.shipId][key][index])state.factoryLocker[old]=(state.factoryLocker[old]??0)+1;}
   fit[key][index]=id;state.factory[p.shipId][key][index]=false;
  }
  const equipped={...p,outfitting:state};p.equipment=projectLegacyEquipment(equipped,state);p.weaponId=projectLegacyWeaponId(equipped);p.outfitting=state;normalizeLauncherMagazines(p);
  if(OUTFIT_ITEMS[id].category==='launcher'){for(const entry of launcherMagazineEntries(p))if(plan.changes.some(c=>c.key==='launchers'&&HULL_HARDPOINTS[p.shipId].launchers[c.index].id===entry.mount.id)){p.launcherMagazines[entry.mount.id].rounds=entry.capacity;p.activeLauncherMountId=entry.mount.id;}normalizeLauncherMagazines(p);}
 }
 r.rewardChosen=true;r.selectedReward=null;return true;
}
export function fitRunItem(save,key,index,id){
 const r=save.arenaRun;if(!save.arena?.run||r.phase!=='prepare'||!r.rewardChosen)return false;
 const p=save.player,draft=loadoutFor(p);if(!LOADOUT_KEYS.includes(key)||!Number.isInteger(index)||index<0||index>=draft[key].length)return false;
 const old=draft[key][index],next=id||null;if(next===old)return true;
 if(next&&!(p.outfitting.locker[next]>0))return false;
 draft[key][index]=next;
 const validation=validateLoadout(p,p.shipId,draft);if(!validation.ok||!draft.guns.some(Boolean))return false;
 // Arena equipment is earned into the locker. No purchase or simulated docking is involved.
 const state=JSON.parse(JSON.stringify(p.outfitting)),flags=state.factory[p.shipId][key];
 if(old){state.locker[old]=(state.locker[old]??0)+1;if(flags[index])state.factoryLocker[old]=(state.factoryLocker[old]??0)+1;}
 flags[index]=false;
 if(next){if(--state.locker[next]===0)delete state.locker[next];if(state.factoryLocker[next]>0){flags[index]=true;if(--state.factoryLocker[next]===0)delete state.factoryLocker[next];}}
 state.loadouts[p.shipId]=validation.loadout;
 const equipped={...p,outfitting:state};
 p.equipment=projectLegacyEquipment(equipped,state);p.weaponId=projectLegacyWeaponId(equipped);p.outfitting=state;
 normalizeLauncherMagazines(p);return true;
}
export function changeRunHull(save,id){
 const r=save.arenaRun,p=save.player;if(r.phase!=='prepare'||r.hullChosen||![3,6].includes(r.wave)||!['wayfarer','talon','vanguard','prospector','lancer','atlas'].includes(id))return false;
 if(id!==p.shipId){
  const fraction=p.hull/getEffectiveShipStats(p).hull,old=loadoutFor(p),oldSpec=HULL_HARDPOINTS[p.shipId],oldFactory=p.outfitting.factory[p.shipId];
  const magazines=launcherMagazineEntries(p),locker={...p.outfitting.locker},factoryLocker={...p.outfitting.factoryLocker};
  for(const key of LOADOUT_KEYS)for(const [i,item] of old[key].entries())if(item){locker[item]=(locker[item]??0)+1;if(oldFactory[key][i])factoryLocker[item]=(factoryLocker[item]??0)+1;}
  p.shipId=id;p.ownedShips=[id];p.outfitting=createOutfittingState([id]);const fit=p.outfitting.loadouts[id],spec=HULL_HARDPOINTS[id],flags=p.outfitting.factory[id];
  for(const key of LOADOUT_KEYS){fit[key].fill(null);flags[key].fill(false);}p.outfitting.locker=locker;p.outfitting.factoryLocker=factoryLocker;
  let mass=0;
  const install=(key,index,item,sourceIndex)=>{
   const mount=spec[key][index];if(!item||fit[key][index]||!locker[item]||!itemFitsMount(OUTFIT_ITEMS[item],mount)||mass+OUTFIT_ITEMS[item].mass>spec.massBudget)return false;
   fit[key][index]=item;locker[item]--;mass+=OUTFIT_ITEMS[item].mass;
   if(factoryLocker[item]>0){flags[key][index]=true;factoryLocker[item]--;}
   if(key==='guns'&&sourceIndex!==undefined)fit.fireGroups.assignments[mount.id]=old.fireGroups.assignments[oldSpec.guns[sourceIndex].id];
   return true;
  };
  // Reserve compatible installed equipment before considering any stored items.
  // Matching positions first; then move surplus guns into compatible free mounts.
  for(const key of LOADOUT_KEYS)for(const [i,item] of old[key].entries()){
   if(i<spec[key].length&&install(key,i,item,i))continue;
   for(let j=0;j<spec[key].length;j++)if(install(key,j,item,i))break;
  }
  for(const key of LOADOUT_KEYS)for(let i=0;i<spec[key].length;i++)for(const item of Object.keys(locker))if(install(key,i,item))break;
  fit.fireGroups.activeGroup=old.fireGroups.activeGroup;
  if(fit.fireGroups.activeGroup!=='ALL'&&!spec.guns.some((m,i)=>fit.guns[i]&&fit.fireGroups.assignments[m.id]===fit.fireGroups.activeGroup))fit.fireGroups.activeGroup='ALL';
  p.equipment=projectLegacyEquipment(p,p.outfitting);p.weaponId=projectLegacyWeaponId(p);
  p.hull=getEffectiveShipStats(p).hull*fraction;p.launcherMagazines={};p.missiles=0;
  // Transfer ammunition only between racks of the same type; never turn seekers into torpedoes.
  const ammo={};for(const e of magazines)ammo[e.launcherId]=(ammo[e.launcherId]??0)+e.rounds;
  for(const e of normalizeLauncherMagazines(p)){const rounds=Math.min(e.capacity,ammo[e.launcherId]??0);p.launcherMagazines[e.mount.id].rounds=rounds;ammo[e.launcherId]-=rounds;}
  normalizeLauncherMagazines(p);
 }
 r.hullChosen=true;r.offers=runOffers(save);return true;
}
