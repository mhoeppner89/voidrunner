import {createNewSave,hydrateSave} from './save.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,LOADOUT_KEYS,loadoutFor,createOutfittingState,itemFitsMount,validateLoadout,projectLegacyEquipment,projectLegacyWeaponId} from './outfitting.js';
import {getEffectiveShipStats} from './shipStats.js';
import {launcherMagazineEntries,normalizeLauncherMagazines,fillLauncherMagazines} from './weapons.js';
import {seededRandom} from './random.js';
export const ARENA_RUN_KEY='voidrunner-arena-run-v1';
export const ARENA_RECORD_KEY='voidrunner-arena-record-v1';
// Enemy entries: role, pilot tier, gun fit, arrival delay, optional finite ordnance.
// Omitted ordnance means no missiles, independently of the normal flight loadout.
export const RUN_WAVES=[
 {name:'First contact',hint:'One hesitant pilot. Take your time and watch your energy.',environment:'open',enemies:[['pirate','novice',3,0]]},
 {name:'Second contact',hint:'A second novice joins after twelve seconds. Watch the entry marker.',environment:'open',enemies:[['pirate','novice',0,0],['escort','novice',3,12]]},
 {name:'Interceptor',hint:'An agile veteran. Turn early and fire during the close pass.',environment:'open',enemies:[['pirate','veteran',1,0]]},
 {name:'Broken formation',hint:'Your first missile carrier has two seekers. Turn out of its sights or use wrecks to break its lock.',environment:'debris-field',enemies:[['escort','novice',0,0,{launcher:'seeker',missiles:2}],['pirate','veteran',1,0],['pirate','novice',3,14]]},
 {name:'Heavy escort',hint:'The gunship carries two seekers. Its light escort is easier to isolate.',environment:'asteroid-field',enemies:[['bounty','veteran',2,0,{launcher:'seeker',missiles:2}],['pirate','novice',0,0]]},
 {name:'The duellist',hint:'An ace uses drift and reversals. Save energy for the opening.',environment:'open',enemies:[['pirate','ace',1,0]]},
 {name:'Crossfire',hint:'One veteran attacks shields; the other carries three seekers. Separate them.',environment:'debris-field',enemies:[['pirate','veteran',1,0],['bounty','veteran',0,0,{launcher:'seeker',missiles:3}]]},
 {name:'Final flight',hint:'The ace carries two torpedoes. An escort with two seekers arrives after fifteen seconds.',environment:'asteroid-field',enemies:[['bounty','ace',2,0,{launcher:'torpedo',missiles:2}],['pirate','veteran',1,0],['escort','veteran',3,15,{launcher:'seeker',missiles:2}]]},
 {name:'Vanguard pair',hint:'Two Vanguards cover each other. Isolate one and keep moving through their turret arcs.',environment:'open',enemies:[['patrol','veteran',1,0],['patrol','ace',0,0,{launcher:'seeker',missiles:2}]]},
 {name:'The frigate',hint:'Watch the charge, then change course or take cover. Attack during recovery. The aim button selects visible batteries; disabling them weakens later salvos.',environment:'asteroid-field',enemies:[['frigate','ace',0,0]]},
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
const pool=['pulse-cannon','ripper','gauss-cannon','ion-blaster','mortar','pdc','tracking-turret','engine-mk2','thrusters-mk2','capacitor-bank','sustained-reactor','shield-mk2','recovery-shield'];
export function runOffers(save){const r=save.arenaRun,spec=HULL_HARDPOINTS[save.player.shipId],fit=loadoutFor(save.player),owned=LOADOUT_KEYS.flatMap(k=>fit[k]).filter(Boolean);const rng=seededRandom(`${r.seed}:reward:${r.wave}:${save.player.shipId}`);
 const choices=pool.filter(id=>runRewardPlan(save,id) && (OUTFIT_ITEMS[id].category==='gun'||!owned.includes(id)) && !(save.player.outfitting.locker[id]>0)).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).map(x=>x.id);
 return save.player.hull>getEffectiveShipStats(save.player).hull*.8?choices.slice(0,3):[...choices.slice(0,2),'repair'];
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
 r.offers=valid;if(!valid.includes(r.selectedReward))r.selectedReward=null;
}
export function recoverRun(save,extra=false){const p=save.player,stats=getEffectiveShipStats(p),r=save.arenaRun;p.hull=Math.min(stats.hull,p.hull+stats.hull*(extra?.4:r.hard?.1:.2));p.shield=stats.shield;p.energy=stats.energyCapacity;p.fuel=stats.fuel;
 if(extra)fillLauncherMagazines(p);else {const entry=launcherMagazineEntries(p).find(e=>e.rounds<e.capacity);if(entry){normalizeLauncherMagazines(p);p.launcherMagazines[entry.mount.id].rounds++;normalizeLauncherMagazines(p);}}
}
// A reward is a complete, mass-checked replacement plan, not a loose gun.
export function runRewardPlan(save,id){
 if(id==='repair')return {id,count:1,changes:[],replaced:[]};
 const p=save.player,item=OUTFIT_ITEMS[id],spec=HULL_HARDPOINTS[p.shipId];if(!item)return null;
 const fit=loadoutFor(p),key=LOADOUT_KEYS.find(k=>spec[k].some(m=>itemFitsMount(item,m)));if(!key)return null;
 let indices=spec[key].map((m,i)=>itemFitsMount(item,m)?i:-1).filter(i=>i>=0);
 if(key==='guns'){
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
export function changeRunHull(save,id){const r=save.arenaRun,p=save.player;if(r.phase!=='prepare'||r.hullChosen||![3,6].includes(r.wave)||!['wayfarer','talon','vanguard','prospector','lancer','atlas'].includes(id))return false;
 if(id!==p.shipId){const fraction=p.hull/getEffectiveShipStats(p).hull,rounds=p.missiles??0,old=loadoutFor(p),locker={...p.outfitting.locker};for(const key of LOADOUT_KEYS)for(const item of old[key])if(item)locker[item]=(locker[item]??0)+1;
 p.shipId=id;p.ownedShips=[id];p.outfitting=createOutfittingState([id]);const fit=p.outfitting.loadouts[id],spec=HULL_HARDPOINTS[id];for(const key of LOADOUT_KEYS){fit[key].fill(null);p.outfitting.factory[id][key].fill(false);}p.outfitting.locker=locker;p.outfitting.factoryLocker={};
 let mass=0;for(const key of LOADOUT_KEYS)for(const [i,m] of spec[key].entries()){const item=Object.keys(locker).find(x=>locker[x]>0&&itemFitsMount(OUTFIT_ITEMS[x],m)&&mass+OUTFIT_ITEMS[x].mass<=spec.massBudget);if(item){fit[key][i]=item;locker[item]--;mass+=OUTFIT_ITEMS[item].mass;}}
 fit.fireGroups.activeGroup='ALL';p.hull=getEffectiveShipStats(p).hull*fraction;p.launcherMagazines={};p.missiles=rounds;normalizeLauncherMagazines(p,{legacyMissiles:rounds});
 }
 r.hullChosen=true;r.offers=runOffers(save);return true;
}
