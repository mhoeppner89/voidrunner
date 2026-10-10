import {createNewSave,hydrateSave} from './save.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,LOADOUT_KEYS,loadoutFor,createOutfittingState,itemFitsMount,validateLoadout,projectLegacyEquipment,projectLegacyWeaponId} from './outfitting.js';
import {getEffectiveShipStats} from './shipStats.js';
import {launcherMagazineEntries,normalizeLauncherMagazines,fillLauncherMagazines} from './weapons.js';
import {proceduralCallsign,seededRandom} from './random.js';
import {HULL_NPC_FITS} from './enemyLoadouts.js';
import {ARENA_HULL_OFFER_COUNT,MAX_RUN_WINGMEN,PLAYER_FLYABLE_HULLS,WINGMAN_OFFER_COUNT,HULL_FACTIONS,isFlyableHull,hullTier,wingmanFitFor} from './shipPool.js';
import {WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_HINT,WING_ORDER_SHORT,WING_ORDER_GATE,normalizeWingOrder,nextWingOrder} from './wingOrders.js';
export const ARENA_RUN_KEY='voidrunner-arena-run-v1';
export const ARENA_RECORD_KEY='voidrunner-arena-record-v1';
// Enemy entries are named opponents, not positional tuples: a hull id, the
// faction that fields it, the NPC role it flies as, a pilot tier, and an optional
// arrival delay. Guns, turrets, launchers and equipment default to the hull's
// real stock NPC fit (HULL_NPC_FITS), so an Arena Run opponent flies the same
// ship the career world would spawn; any of them can be overridden per wave
// (a lighter first contact, a bigger missile load) without re-authoring the fit.
const enemy=(hullId,options={})=>({hullId,faction:'pirates',role:'pirate',tier:'novice',delay:0,...options});
export const runEnemyFit=(spec)=>{
 const base=HULL_NPC_FITS[spec.hullId]??{};
 const merged={...base};
 for(const key of ['guns','turrets','launchers','launcher','turret','power','drive','defense','utility','missiles'])
  if(spec[key]!==undefined)merged[key]=spec[key];
 return merged;
};
// The run is five named acts, one faction and one tier band each, so it walks
// the whole flyable roster and every faction in the game. Wave names and hints
// are authored and fixed: the levels are determined, not rolled.
//
//   Act I   Red Talons          pirates       scrapper, speedster, demon
//   Act II  Free Merchants      independents  wayfarer, prospector, mule, torsas
//   Act III Frontier League     alliance      legionary, andromeda, speedster, astra, lancer
//   Act IV  Concord Fleet       concord       talon, blade, vanguard, lancer, atlas, mule
//   Act V   Concord capital     concord       the frigate and its line
export const RUN_ACTS=[
 {
  id:'talons',name:'Red Talons',faction:'pirates',
  waves:[
   {name:'First contact',hint:'One hesitant pilot. Take your time and watch your energy.',environment:'open',enemies:[enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice',guns:['beam-emitter',null,null,null],turrets:[]})]},
   {name:'Cutthroat pair',hint:'A second novice joins after twelve seconds. Watch the entry marker.',environment:'open',enemies:[enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice'}),enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice',delay:12})]},
   {name:'Red Talon runner',hint:'An agile veteran. Turn early and fire during the close pass.',environment:'open',enemies:[enemy('speedster',{faction:'pirates',role:'escort',tier:'veteran',missiles:2})]},
   {name:'Demon wing',hint:'A veteran twin-hull enters first. Its novice wing arrives after twenty seconds. Use wrecks against their seekers.',environment:'debris-field',enemies:[enemy('demon',{faction:'pirates',role:'pirate',tier:'veteran',missiles:2}),enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice',delay:20})]},
  ],
 },
 {
  id:'merchants',name:'Free Merchants',faction:'independents',
  waves:[
   {name:'Convoy escort',hint:'An armed transport with a freighter behind it. Isolate the escort first.',environment:'open',enemies:[enemy('wayfarer',{faction:'independents',role:'escort',tier:'veteran',missiles:2}),enemy('mule',{faction:'independents',role:'trader',tier:'novice'})]},
   {name:'Mining claim',hint:'A rock hauler under escort. Its drones are faster than its guns.',environment:'asteroid-field',enemies:[enemy('prospector',{faction:'independents',role:'miner',tier:'veteran'}),enemy('wayfarer',{faction:'independents',role:'escort',tier:'veteran',delay:8})]},
   {name:'Heavy hauler',hint:'A deep and slow transport. Close on it before its escort settles in.',environment:'open',enemies:[enemy('torsas',{faction:'independents',role:'trader',tier:'veteran',missiles:3}),enemy('wayfarer',{faction:'independents',role:'escort',tier:'novice',delay:6}),enemy('wayfarer',{faction:'independents',role:'escort',tier:'novice',delay:18})]},
   {name:'Freighter screen',hint:'A veteran freighter with two screening escorts. Break the screen, then the hull.',environment:'debris-field',enemies:[enemy('mule',{faction:'independents',role:'trader',tier:'veteran'}),enemy('speedster',{faction:'independents',role:'escort',tier:'veteran',delay:8}),enemy('speedster',{faction:'independents',role:'escort',tier:'veteran',delay:20})]},
   {name:'Merchant gunship',hint:'An ace cutter and a pirate veteran in the same sky. Keep them apart.',environment:'debris-field',enemies:[enemy('torsas',{faction:'independents',role:'trader',tier:'ace',missiles:3}),enemy('demon',{faction:'pirates',role:'pirate',tier:'veteran',delay:10,missiles:2})]},
  ],
 },
 {
  id:'league',name:'Frontier League',faction:'alliance',
  waves:[
   {name:'League line',hint:'An Alliance line fighter. It will try to keep you at arm’s length.',environment:'open',enemies:[enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',missiles:2})]},
   {name:'League pair',hint:'A line fighter and a courier working together. Separate the fast one.',environment:'open',enemies:[enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran'}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:10})]},
   {name:'Strike package',hint:'A torpedo bomber. Break its run before it can line you up.',environment:'open',enemies:[enemy('andromeda',{faction:'alliance',role:'bounty',tier:'veteran',missiles:2}),enemy('legionary',{faction:'alliance',role:'patrol',tier:'novice',delay:12})]},
   {name:'League honorguard',hint:'A pursuit hunter and its line escort. Do not let the hunter sit behind you.',environment:'debris-field',enemies:[enemy('lancer',{faction:'alliance',role:'patrol',tier:'veteran',missiles:3}),enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',delay:8})]},
   {name:'Expedition cutter',hint:'An ace cutter with a long reach and an escort. Close the range fast.',environment:'asteroid-field',enemies:[enemy('astra',{faction:'alliance',role:'escort',tier:'ace',missiles:2}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:10})]},
  ],
 },
 {
  id:'concord',name:'Concord Frontier Fleet',faction:'concord',
  waves:[
   {name:'Concord patrol',hint:'A Concord courier. Fast, thin, and quick to break off.',environment:'open',enemies:[enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',missiles:2})]},
   {name:'Blade flight',hint:'A heavy fighter with a courier on its wing. Punish the courier first.',environment:'open',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',missiles:3}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:10})]},
   {name:'Vanguard battery',hint:'A heavy bomber carrying torpedoes and swarms. Stay out of its forward arc.',environment:'open',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'veteran',missiles:2}),enemy('mule',{faction:'concord',role:'trader',tier:'novice',delay:12})]},
   {name:'Fleet screen',hint:'An ace hunter screened by a heavy fighter. Kill the screen or the hunter, not neither.',environment:'debris-field',enemies:[enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',missiles:3}),enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',delay:8})]},
   {name:'Concord line',hint:'Two ace heavies. Use the rocks, break their firing line, and take them one at a time.',environment:'asteroid-field',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'ace',missiles:3}),enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',delay:12,missiles:2})]},
  ],
 },
 {
  id:'capital',name:'Concord Capital',faction:'concord',
  waves:[
   {name:'Capital approach',hint:'Two aces on the picket line. Break them before the capital arrives.',environment:'debris-field',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',delay:12,missiles:3})]},
   {name:'Supply line',hint:'A loaded freighter column. Cut the escorts off the hulls and clean up.',environment:'open',enemies:[enemy('atlas',{faction:'concord',role:'trader',tier:'veteran'}),enemy('mule',{faction:'concord',role:'trader',tier:'veteran',delay:8}),enemy('wayfarer',{faction:'concord',role:'escort',tier:'veteran',delay:16})]},
   {name:'Vanguard pair',hint:'A veteran enters first. The ace arrives after twelve seconds, giving you a short window to isolate one through the wrecks.',environment:'debris-field',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'veteran',missiles:2}),enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',delay:12,missiles:2})]},
   {name:'Fleet reserve',hint:'A heavy fighter, a hunter and a bomber at once. Fight them in the rocks, never in the open.',environment:'open',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'ace',missiles:3}),enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',delay:8,missiles:3}),enemy('vanguard',{faction:'concord',role:'patrol',tier:'veteran',delay:18,missiles:2})]},
   {name:'The frigate',hint:'Lure the frigate into the rocks to break its firing line. Approach the stern and aim shielded torpedoes at MAIN ENGINES, then disable turrets and shield generators. Torpedoes bypass shields but turn poorly. Watch battery charges and torpedo locks.',environment:'asteroid-field',enemies:[enemy('concord-frigate',{faction:'concord',role:'frigate',tier:'ace'})]},
  ],
 },
];
export const RUN_WAVES=RUN_ACTS.flatMap(act=>act.waves);
export const waveActIndex=(wave)=>RUN_ACTS.findIndex(act=>act.waves.includes(RUN_WAVES[wave]));
export const waveAct=(wave)=>RUN_ACTS[waveActIndex(wave)];
// Hull stages are pinned to tier climbs, not random draws: the run opens with a
// tier-1 pick, and each later stage offers the next tier from the faction blocs
// the pilot has just fought. Keeping the current ship is always the veteran-winger
// option instead.
export const HULL_STAGES=Object.freeze({
 0:Object.freeze({tier:1,factions:null,label:'Choose your starting hull'}),
 9:Object.freeze({tier:2,factions:Object.freeze(['pirates','independents']),label:'Choose a tier-2 hull'}),
 14:Object.freeze({tier:3,factions:Object.freeze(['alliance','concord']),label:'Choose a tier-3 hull'}),
});
export const HULL_STAGE_WAVES=Object.freeze(Object.keys(HULL_STAGES).map(Number));
export function newArenaRun(hard=false,seed=Date.now()) {
 const save=createNewSave(seed,{tutorial:false});save.arena={run:true};save.player.credits=0;save.player.cargo={};save.player.throttle=.35;
 // A fresh run opens on its starting-hull stage: the pilot picks a tier-1 ship
 // (or keeps the Wayfarer) before the first wave, and wingmen are hired at the
 // later stages only.
 save.arenaRun={version:3,totalWaves:RUN_WAVES.length,seed,hard,wave:0,phase:'prepare',rewardChosen:true,hullChosen:false,offers:[],hullOffers:[],wingmanOffers:[],wingmen:[],wingOrder:'aggressive',cleared:0,elapsed:0,damage:0,missiles:0};return save;
}
const OLD_WAVE_TOTALS={1:8,2:10};
// Map an old checkpoint's wave index onto the same fractional position in the
// current run, so a saved sortie resumes roughly where it was instead of jumping.
const migrateWave=(wave,version)=>Math.max(0,Math.min(RUN_WAVES.length-1,Math.floor((wave+0.5)/OLD_WAVE_TOTALS[version]*RUN_WAVES.length)));
export function readArenaRun(){try{
 const raw=JSON.parse(window.localStorage.getItem(ARENA_RUN_KEY)),r=raw?.arenaRun;
 const totals={...OLD_WAVE_TOTALS,3:RUN_WAVES.length};
 if(![1,2,3].includes(r?.version)||!['prepare','combat','won','lost'].includes(r.phase)||!Number.isInteger(r.wave)||r.wave<0||r.wave>=totals[r.version])return null;
 const save=hydrateSave(raw);save.arenaRun=r;save.arena={run:true};
 // Finished short runs stay finished with their old totals; an active one moves
 // into the current five-act run at the same fraction of the way through.
 if(r.version<3){
  if(['won','lost'].includes(r.phase)){r.totalWaves=OLD_WAVE_TOTALS[r.version];}
  else{r.wave=migrateWave(r.wave,r.version);r.cleared=Math.min(r.cleared??0,r.wave);r.totalWaves=RUN_WAVES.length;r.hullChosen=!HULL_STAGE_WAVES.includes(r.wave);}
  r.version=3;
 }
 // Additive run fields arrive with older checkpoints: a hull stage opened
 // before the shared pool existed still needs its five fresh offers, and a
 // malformed wing list must never break the run.
 if(!Array.isArray(r.wingmen))r.wingmen=[];
 if(!Array.isArray(r.wingmanOffers))r.wingmanOffers=[];
 r.wingOrder=normalizeWingOrder(r.wingOrder);
 refreshRunHullOffers(save);refreshRunWingmanOffers(save);refreshRunRewardOffers(save);return save;
 }catch{return null;}}

export function writeArenaRun(save){try{const clean={...save,player:{...save.player}};delete clean.player.turretRuntime;delete clean.player.prevPosition;delete clean.player.prevRotation;window.localStorage.setItem(ARENA_RUN_KEY,JSON.stringify(clean));return true;}catch{return false;}}
export function arenaRecord(){try{return JSON.parse(window.localStorage.getItem(ARENA_RECORD_KEY))??{};}catch{return {};}}
export function recordArenaRun(save){const r=save.arenaRun,old=arenaRecord();try{window.localStorage.setItem(ARENA_RECORD_KEY,JSON.stringify({unlockedHard:old.unlockedHard||r.phase==='won',best:Math.max(old.best??0,runScore(r)),last:{cleared:r.cleared,score:runScore(r)}}));}catch{}}
export const runScore=r=>Math.max(0,Math.round(r.cleared*1000+(r.phase==='won'?2000:0)-r.elapsed*2-r.damage*2-r.missiles*20));
const rewardPools={
 offense:['pulse-cannon','ripper','gauss-cannon','ion-blaster','mortar','pulse-mk2','shield-seeker-launcher','swarm-launcher','shield-swarm-launcher','torpedo-launcher'],
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
 if(r.wave===RUN_WAVES.length-1){
  const heavy=HULL_HARDPOINTS[p.shipId].guns.some(m=>m.size==='M')||HULL_HARDPOINTS[p.shipId].launchers.some(m=>m.size==='M');
  const counters=heavy?['torpedo-launcher','mortar']:['ripper'];
  if(!owned.some(id=>counters.includes(id))){const counter=counters.find(id=>runRewardPlan(save,id));if(counter)offers.push(counter);}
 }
 for(const key of ['offense','survival','handling']){if(key==='offense'&&offers.length)continue;const id=candidates[key].find(id=>!offers.includes(id));if(id)offers.push(id);}
 for(const id of Object.values(candidates).flat())if(offers.length<3&&!offers.includes(id))offers.push(id);
 if(p.hull<=getEffectiveShipStats(p).hull*.8)offers.splice(2,1,'repair');
 // A long run can own every upgrade a hull can take, leaving nothing eligible.
 // The stage must never be empty: startRunWave needs a chosen reward, so offer a
 // repair as the always-available choice instead of stranding the sortie.
 if(!offers.length)offers.push('repair');
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
 const bossOffer=runOffers(save)[0];if(r.wave===RUN_WAVES.length-1&&['torpedo-launcher','mortar','ripper'].includes(bossOffer)&&!valid.includes(bossOffer))valid[0]=bossOffer;
 r.offers=valid;if(!valid.includes(r.selectedReward))r.selectedReward=null;
}
export function recoverRun(save,extra=false){const p=save.player,stats=getEffectiveShipStats(p),r=save.arenaRun;p.hull=Math.min(stats.hull,p.hull+stats.hull*(extra?.5:r.hard?.1:.3));p.shield=stats.shield;p.energy=stats.energyCapacity;p.fuel=stats.fuel;
 if(extra)fillLauncherMagazines(p);else {for(const entry of normalizeLauncherMagazines(p))if(entry.rounds<entry.capacity)p.launcherMagazines[entry.mount.id].rounds++;normalizeLauncherMagazines(p);}
}
// A reward is a complete, mount-checked replacement plan, not a loose gun.
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
// The hulls a stage offers: the stage's tier, filtered to the faction blocs the
// run has reached, minus the pilot's current hull (staying put is the wingman
// option instead). A fresh draw per stage, stable across re-renders and reloads.
export function runHullOffers(save){
 const r=save.arenaRun,p=save.player,stage=HULL_STAGES[r.wave];
 if(!stage)return [];
 const inBloc=id=>!stage.factions||(HULL_FACTIONS[id]??[]).some(faction=>stage.factions.includes(faction));
 const rng=seededRandom(`${r.seed}:hull:${r.wave}:${p.shipId}`);
 return PLAYER_FLYABLE_HULLS.filter(id=>id!==p.shipId&&hullTier(id)===stage.tier&&inBloc(id)).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).slice(0,ARENA_HULL_OFFER_COUNT).map(entry=>entry.id);
}
// Keep an already-shown offer list when it is still legal; otherwise fill it
// from a fresh draw. Runs on load so a checkpoint saved mid-stage renders the
// same hulls it showed before.
export function refreshRunHullOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.hullChosen)return;
 const valid=(Array.isArray(r.hullOffers)?r.hullOffers:[]).filter(id=>isFlyableHull(id)&&id!==save.player.shipId);
 for(const id of runHullOffers(save))if(valid.length<ARENA_HULL_OFFER_COUNT&&!valid.includes(id))valid.push(id);
 r.hullOffers=valid.slice(0,ARENA_HULL_OFFER_COUNT);
}
// The sixth hull-stage choice: keep the current ship and add a veteran. Three
// candidates are drawn from the complete pool and held for the stage, so the
// pilot chooses who joins the wing instead of taking a blind roll.
export function runWingmanOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.hullChosen)return [];
 const rng=seededRandom(`${r.seed}:wingman:${r.wave}`);
 return PLAYER_FLYABLE_HULLS.map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).slice(0,WINGMAN_OFFER_COUNT)
  .map((entry,index)=>({id:`wingman-${r.wave}-${index}`,hullId:entry.id,fit:wingmanFitFor(entry.id),name:proceduralCallsign(rng)}));
}
// Keep an already-shown roster while the stage is open; otherwise draw one.
// Runs on load so a checkpoint saved mid-stage offers the same three pilots.
export function refreshRunWingmanOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.hullChosen){r.wingmanOffers=[];return;}
 const valid=(Array.isArray(r.wingmanOffers)?r.wingmanOffers:[]).filter(candidate=>candidate&&isFlyableHull(candidate.hullId)&&typeof candidate.name==='string');
 r.wingmanOffers=valid.length?valid.slice(0,WINGMAN_OFFER_COUNT):runWingmanOffers(save);
}
// Hire one of the stage's candidates. One hire per stage, at most two veterans
// per run, and only a name that is actually on offer can be taken.
export function hireRunWingman(save,id){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.hullChosen)return null;
 const list=Array.isArray(r.wingmen)?r.wingmen:[];
 if(list.filter(wingman=>wingman.alive!==false).length>=MAX_RUN_WINGMEN)return null;
 if(!(r.wingmanOffers??[]).length)r.wingmanOffers=runWingmanOffers(save);
 const candidate=r.wingmanOffers.find(entry=>entry.id===id);if(!candidate)return null;
 const wingman={id:candidate.id,hullId:candidate.hullId,role:'patrol',fit:candidate.fit,name:candidate.name,alive:true,order:normalizeWingOrder(r.wingOrder)};
 r.wingmen=[...list,wingman];r.wingmanOffers=[];
 r.hullChosen=true;r.offers=runOffers(save);
 return wingman;
}
// The standing-order vocabulary and the range gates live in wingOrders.js,
// shared with the campaign's companion. Arena Run re-exports them so the run
// screen, the HUD wing rail and the saved-run migration keep one import site.
export {WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_HINT,WING_ORDER_SHORT,WING_ORDER_GATE,normalizeWingOrder,nextWingOrder};
// A wingman's own standing order, falling back to the run default for
// checkpoints written before per-wingman orders existed (normalizeWingOrder
// never returns undefined, so the fallback has to be chosen before it runs).
export const wingmanOrder=(wingman,run)=>normalizeWingOrder(WING_ORDERS.includes(wingman?.order)?wingman.order:run?.wingOrder);
export function changeRunHull(save,id){
 const r=save.arenaRun,p=save.player;if(r.phase!=='prepare'||r.hullChosen||!HULL_STAGES[r.wave]||!PLAYER_FLYABLE_HULLS.includes(id)||!(r.hullOffers??[]).includes(id))return false;
 if(id!==p.shipId){
  // Snapshot just the fields the transfer rebuilds. A hull whose mounts cannot
  // take any installed or stored forward gun would strand the sortie
  // (startRunWave refuses a gunless fit), so an un-fittable swap is undone
  // rather than accepted.
  const snapshot=JSON.parse(JSON.stringify({shipId:p.shipId,ownedShips:p.ownedShips,outfitting:p.outfitting,equipment:p.equipment,weaponId:p.weaponId,hull:p.hull,launcherMagazines:p.launcherMagazines,missiles:p.missiles}));
  const fraction=p.hull/getEffectiveShipStats(p).hull,old=loadoutFor(p),oldSpec=HULL_HARDPOINTS[p.shipId],oldFactory=p.outfitting.factory[p.shipId];
  const magazines=launcherMagazineEntries(p),locker={...p.outfitting.locker},factoryLocker={...p.outfitting.factoryLocker};
  for(const key of LOADOUT_KEYS)for(const [i,item] of old[key].entries())if(item){locker[item]=(locker[item]??0)+1;if(oldFactory[key][i])factoryLocker[item]=(factoryLocker[item]??0)+1;}
  p.shipId=id;p.ownedShips=[id];p.outfitting=createOutfittingState([id]);const fit=p.outfitting.loadouts[id],spec=HULL_HARDPOINTS[id],flags=p.outfitting.factory[id];
  for(const key of LOADOUT_KEYS){fit[key].fill(null);flags[key].fill(false);}p.outfitting.locker=locker;p.outfitting.factoryLocker=factoryLocker;
  const install=(key,index,item,sourceIndex)=>{
   const mount=spec[key][index];if(!item||fit[key][index]||!locker[item]||!itemFitsMount(OUTFIT_ITEMS[item],mount))return false;
   fit[key][index]=item;locker[item]--;
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
  if(!loadoutFor(p).guns.some(Boolean)){Object.assign(p,JSON.parse(JSON.stringify(snapshot)));return false;}
 }
 r.hullChosen=true;r.wingmanOffers=[];r.offers=runOffers(save);return true;
}
