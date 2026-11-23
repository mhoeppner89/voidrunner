import {arenaSite} from './arenaSites.js';
import {equipmentBaseId,RARITY_ORDER,NAMED_EQUIPMENT} from './equipmentCatalog.js';
import {createEquipmentRecord,rollAffixes,registerInventoryDefinitions,normalizeEquipmentInventory} from './equipmentInventory.js';
import {createNewSave,hydrateSave} from './save.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,canonicalOutfitId,LOADOUT_KEYS,loadoutFor,createOutfittingState,itemFitsMount,validateLoadout,projectLegacyEquipment,projectLegacyWeaponId} from './outfitting.js';
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
   {name:'First contact',hint:'Choose your starting hull. One novice.',site:'verge-lanes',enemies:[enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice'})]},
   {name:'Scavengers',hint:'Two novice scavengers.',site:'acheron-horizon',enemies:[enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice'}),enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice',delay:8})]},
   {name:'Cut loose',hint:'A veteran runner.',site:'mourning-carrier',enemies:[enemy('demon',{faction:'pirates',role:'pirate',tier:'veteran',missiles:1})]},
   {name:'Hit and run',hint:'Agile escort pair.',site:'shardbelt-heart',enemies:[enemy('speedster',{faction:'pirates',role:'escort',tier:'veteran'}),enemy('speedster',{faction:'pirates',role:'escort',tier:'novice',delay:6})]},
   {name:'Tier climb',hint:'Upgrade to a tier-2 hull.',site:'redwake-belt',enemies:[enemy('demon',{faction:'pirates',role:'pirate',tier:'veteran',missiles:2}),enemy('scrapper',{faction:'pirates',role:'pirate',tier:'novice',delay:10})]},
  ],
 },
 {
  id:'merchants',name:'Free Merchants',faction:'independents',
  waves:[
   {name:'Freight lane',hint:'Armed convoy.',site:'foundry-lanes',enemies:[enemy('wayfarer',{faction:'independents',role:'escort',tier:'veteran',missiles:1}),enemy('mule',{faction:'independents',role:'trader',tier:'novice'})]},
   {name:'Claim jumpers',hint:'Gaia under escort.',site:'shardbelt-chimney',enemies:[enemy('prospector',{faction:'independents',role:'miner',tier:'veteran'}),enemy('wayfarer',{faction:'independents',role:'escort',tier:'novice',delay:8})]},
   {name:'Haul trouble',hint:'Heavy haulers and escort.',site:'mourning-center',enemies:[enemy('torsas',{faction:'independents',role:'trader',tier:'veteran',missiles:2}),enemy('atlas',{faction:'independents',role:'trader',tier:'veteran',delay:6}),enemy('speedster',{faction:'independents',role:'escort',tier:'novice',delay:12})]},
   {name:'Crossfire',hint:'Three veterans converge.',site:'verge-lanes',enemies:[enemy('speedster',{faction:'independents',role:'escort',tier:'veteran'}),enemy('scrapper',{faction:'pirates',role:'pirate',tier:'veteran',delay:3,missiles:1}),enemy('demon',{faction:'pirates',role:'pirate',tier:'veteran',delay:6,missiles:1})]},
   {name:'Rookie wing',hint:'Freighter and two veteran escorts.',site:'pale-rings',enemies:[enemy('mule',{faction:'independents',role:'trader',tier:'veteran',missiles:1}),enemy('wayfarer',{faction:'independents',role:'escort',tier:'veteran',delay:3}),enemy('speedster',{faction:'independents',role:'escort',tier:'veteran',delay:6,missiles:1})]},
  ],
 },
 {
  id:'league',name:'Frontier League',faction:'alliance',
  waves:[
   {name:'Patrol shift',hint:'League line.',site:'acheron-horizon',enemies:[enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',missiles:1}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:4,missiles:1})]},
   {name:'Courier run',hint:'Three ships working together.',site:'shardbelt-rim',enemies:[enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',missiles:1}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:3}),enemy('andromeda',{faction:'alliance',role:'escort',tier:'veteran',delay:6,missiles:1})]},
   {name:'Strike',hint:'Bomber package.',site:'pale-rings',enemies:[enemy('andromeda',{faction:'alliance',role:'bounty',tier:'ace',missiles:2}),enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',delay:3,missiles:1})]},
   {name:'Honorguard',hint:'Hunter and two escorts.',site:'mourning-battleship',enemies:[enemy('lancer',{faction:'alliance',role:'patrol',tier:'veteran',missiles:2}),enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',delay:3}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:6,missiles:1})]},
   {name:'Veteran wing',hint:'Ace-led League wing.',site:'shardbelt-chimney',enemies:[enemy('astra',{faction:'alliance',role:'escort',tier:'ace',missiles:1}),enemy('speedster',{faction:'alliance',role:'escort',tier:'veteran',delay:3}),enemy('legionary',{faction:'alliance',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
  ],
 },
 {
  id:'concord',name:'Concord Frontier Fleet',faction:'concord',
  waves:[
   {name:'Show of force',hint:'Concord interception wing.',site:'verge-lanes',enemies:[enemy('talon',{faction:'concord',role:'patrol',tier:'ace',missiles:1}),enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',delay:4,missiles:1})]},
   {name:'Victoria dance',hint:'Heavy fighters with a courier.',site:'mourning-carrier',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:3}),enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
   {name:'Battery test',hint:'Bellona with support.',site:'acheron-horizon',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',delay:3,missiles:1}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
   {name:'Screened',hint:'Hunter screened by Victoria.',site:'foundry-lanes',enemies:[enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('blade',{faction:'concord',role:'patrol',tier:'veteran',delay:3}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
   {name:'Heavy metal',hint:'Elite Concord strike wing.',site:'pale-rings',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('vanguard',{faction:'concord',role:'patrol',tier:'veteran',delay:3,missiles:1}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
  ],
 },
 {
  id:'capital',name:'Concord Capital',faction:'concord',
  waves:[
   {name:'Picket',hint:'Two heavies and a courier.',site:'mourning-battleship',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',delay:4,missiles:2}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:7,missiles:1})]},
   {name:'Reserves',hint:'Mixed heavy pack.',site:'redwake-belt',enemies:[enemy('blade',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',delay:3,missiles:2}),enemy('talon',{faction:'concord',role:'patrol',tier:'veteran',delay:6,missiles:1})]},
   {name:'Ace screen',hint:'Three aces.',site:'verge-lanes',enemies:[enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('blade',{faction:'concord',role:'patrol',tier:'ace',delay:3,missiles:2}),enemy('talon',{faction:'concord',role:'patrol',tier:'ace',delay:6,missiles:1})]},
   {name:'Elite guard',hint:'Elite heavy wing.',site:'mourning-center',enemies:[enemy('lancer',{faction:'concord',role:'patrol',tier:'ace',missiles:2}),enemy('vanguard',{faction:'concord',role:'patrol',tier:'ace',delay:3,missiles:2}),enemy('blade',{faction:'concord',role:'patrol',tier:'ace',delay:6,missiles:1})]},
   {name:'The line',hint:'Choose your second wingman (Tier 3). Frigate with two Victoria escorts, all aces.',site:'shardbelt-rim',enemies:[enemy('concord-frigate',{faction:'concord',role:'frigate',tier:'ace'}),enemy('blade',{faction:'concord',role:'patrol',tier:'ace',delay:4,missiles:2}),enemy('blade',{faction:'concord',role:'patrol',tier:'ace',delay:8,missiles:2})]},
  ],
 },
];
// Each wave names its Arena site; the environment (open / asteroid / debris)
// follows from the site for the code that still reads it.
for(const act of RUN_ACTS)act.waves=act.waves.map(wave=>Object.freeze({...wave,environment:arenaSite(wave.site).environment}));
export const RUN_WAVES=RUN_ACTS.flatMap(act=>act.waves);
export const waveActIndex=(wave)=>RUN_ACTS.findIndex(act=>act.waves.includes(RUN_WAVES[wave]));
export const waveAct=(wave)=>RUN_ACTS[waveActIndex(wave)];
// Decision stages: hull choices and wingman hires/upgrades happen at separate waves.
// - wave 0: choose tier 1 hull (3 possibilities)
// - wave 4: choose tier 2 hull (3 possibilities)
// - wave 8: choose first wingman, tier 1 (3 possibilities)
// - wave 12: upgrade first wingman to tier 2 (3 possibilities)
// - wave 16: choose tier 3 hull (3 possibilities)
// - wave 20: upgrade first wingman to tier 3 (3 possibilities)
// - wave 24: choose second wingman, tier 3 (3 possibilities)
export const DECISION_STAGES=Object.freeze({
 0:Object.freeze({type:'hull',tier:1,factions:null,label:'Choose your starting hull'}),
 4:Object.freeze({type:'hull',tier:2,factions:null,label:'Choose a tier-2 hull'}),
 8:Object.freeze({type:'wingman-hire',wingIndex:0,tier:1,factions:null,label:'Choose your first wingman (Tier 1)'}),
 12:Object.freeze({type:'wingman-upgrade',wingIndex:0,tier:2,factions:null,label:'Upgrade your first wingman to Tier 2'}),
 16:Object.freeze({type:'hull',tier:3,factions:null,label:'Choose a tier-3 hull'}),
 20:Object.freeze({type:'wingman-upgrade',wingIndex:0,tier:3,factions:null,label:'Upgrade your first wingman to Tier 3'}),
 24:Object.freeze({type:'wingman-hire',wingIndex:1,tier:3,factions:null,label:'Choose your second wingman (Tier 3)'}),
});
export const HULL_STAGES=Object.freeze(Object.fromEntries(
  Object.entries(DECISION_STAGES).filter(([_,s])=>s.type==='hull').map(([w,s])=>[w,{tier:s.tier,factions:s.factions??null,label:s.label}])
));
export const HULL_STAGE_WAVES=Object.freeze(Object.keys(HULL_STAGES).map(Number));
export const DECISION_WAVES=Object.freeze(Object.keys(DECISION_STAGES).map(Number).sort((a,b)=>a-b));
export function newArenaRun(hard=false,seed=Date.now()) {
 const save=createNewSave(seed,{tutorial:false});save.arena={run:true};normalizeEquipmentInventory(save.player,{disabled:true});save.player.credits=0;save.player.cargo={};save.player.throttle=.35;
 for(const key of LOADOUT_KEYS){save.player.outfitting.loadouts[save.player.shipId][key].fill(null);save.player.outfitting.factory[save.player.shipId][key].fill(false);}
 save.player.equipment=[];save.player.weaponId=null;save.player.launcherMagazines={};save.player.missiles=0;
 save.arenaRun={openingPicks:0,version:3,totalWaves:RUN_WAVES.length,seed,hard,wave:0,phase:'prepare',rewardChosen:false,hullChosen:false,decisions:{},offers:[],hullOffers:[],wingmanOffers:[],wingmen:[],wingOrder:'aggressive',cleared:0,elapsed:0,damage:0,missiles:0};save.arenaRun.hullOffers=runHullOffers(save);return save;
}
const OLD_WAVE_TOTALS={1:8,2:10};
// Map an old checkpoint's wave index onto the same fractional position in the
// current run, so a saved sortie resumes roughly where it was instead of jumping.
const migrateWave=(wave,version)=>Math.max(0,Math.min(RUN_WAVES.length-1,Math.floor((wave+0.5)/OLD_WAVE_TOTALS[version]*RUN_WAVES.length)));
export function readArenaRun(){try{
 const raw=JSON.parse(window.localStorage.getItem(ARENA_RUN_KEY)),r=raw?.arenaRun;
 const totals={...OLD_WAVE_TOTALS,3:RUN_WAVES.length};
 if(![1,2,3].includes(r?.version)||!['prepare','combat','won','lost'].includes(r.phase)||!Number.isInteger(r.wave)||r.wave<0||r.wave>=totals[r.version])return null;
 registerInventoryDefinitions({items:r.rewardRecords});
 const save=hydrateSave(raw);save.arenaRun=r;r.offers=[...new Set((r.offers??[]).map(canonicalOutfitId))];if(r.selectedReward)r.selectedReward=canonicalOutfitId(r.selectedReward);save.arena={run:true};normalizeEquipmentInventory(save.player,{disabled:true});
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
 if(!r.decisions||typeof r.decisions!=='object')r.decisions={};
 r.wingOrder=normalizeWingOrder(r.wingOrder);
 refreshRunHullOffers(save);refreshRunWingmanOffers(save);refreshRunRewardOffers(save);return save;
 }catch{return null;}}

export function writeArenaRun(save){try{const clean={...save,player:{...save.player}};delete clean.player.turretRuntime;delete clean.player.prevPosition;delete clean.player.prevRotation;window.localStorage.setItem(ARENA_RUN_KEY,JSON.stringify(clean));return true;}catch{return false;}}
export function arenaRecord(){try{return JSON.parse(window.localStorage.getItem(ARENA_RECORD_KEY))??{};}catch{return {};}}
export function recordArenaRun(save){const r=save.arenaRun,old=arenaRecord();try{window.localStorage.setItem(ARENA_RECORD_KEY,JSON.stringify({unlockedHard:old.unlockedHard||r.phase==='won',best:Math.max(old.best??0,runScore(r)),last:{cleared:r.cleared,score:runScore(r)}}));}catch{}}
export const runScore=r=>Math.max(0,Math.round(r.cleared*1000+(r.phase==='won'?2000:0)-r.elapsed*2-r.damage*2-r.missiles*20));
// Arena Run draws from fixed pools. RUN_EQUIPMENT_RARITY is each pool item's
// usual grade; coloured grades, hull-tier upgrades and skip bonuses become
// deterministic eq-arena records with rolled affixes (and, at the top, a
// legendary trait) from the shared equipment catalog.
export const RUN_EQUIPMENT_RARITY=Object.freeze({
 'pulse-cannon':'common','beam-emitter':'common','ripper':'common','seeker-launcher':'common','pdc':'common',
 'gauss-cannon':'uncommon','ion-blaster':'uncommon','mortar':'uncommon','tracking-turret':'uncommon',
 'engine-mk2':'uncommon','thrusters-mk2':'uncommon','capacitor-bank':'uncommon','sustained-reactor':'uncommon','shield-mk2':'uncommon','shield-seeker-launcher':'uncommon',
 'pulse-cannon-t2':'uncommon','pulse-cannon-t3':'rare','swarm-launcher':'rare','shield-swarm-launcher':'rare','torpedo-launcher':'rare','recovery-shield':'rare',
});
const rewardPools={
 offense:['pulse-cannon','ripper','gauss-cannon','ion-blaster','mortar','pulse-cannon-t2','pulse-cannon-t3','shield-seeker-launcher','swarm-launcher','shield-swarm-launcher','torpedo-launcher'],
 survival:['pdc','tracking-turret','shield-mk2','recovery-shield'],
 handling:['engine-mk2','thrusters-mk2','capacitor-bank','sustained-reactor'],
};
const rewardWave={'pulse-cannon-t2':3,'pulse-cannon-t3':8,'swarm-launcher':3,'torpedo-launcher':5,'mortar':2,'gauss-cannon':2};
const REWARD_GRADES=RARITY_ORDER;
function runRewardItem(save,id){
 const item=OUTFIT_ITEMS[id];if(!item)return id;
 const r=save.arenaRun,hull=Math.max(1,hullTier(save.player.shipId)??1);
 const bonus=r.rarityBonusWave===r.wave;
 const tier=Math.max(item.tier??1,hull===2&&seededRandom(`${r.seed}:reward-tier:${r.wave}:${id}`)()<.2?3:hull);
 const baseId=equipmentBaseId(id);
 const usual=item.rarity??RUN_EQUIPMENT_RARITY[id]??'common';
 // A coloured reward is a real record of that grade (bonus and rolled
 // affixes), so its colour means the same as in career. Only plain common
 // stock at the item's own tier stays a base id.
 if(tier<=(item.tier??1)&&!bonus&&usual==='common')return id;
 const baseRank=Math.max(0,REWARD_GRADES.indexOf(usual));
 let rank=Math.min(REWARD_GRADES.length-1,baseRank+(hull>=3?1:0)+(bonus?1:0));
 if(hull>=3&&bonus&&rank===3&&NAMED_EQUIPMENT[baseId]&&seededRandom(`${r.seed}:reward-named:${r.wave}:${id}`)()<.4)rank=4;
 if(rank===4&&!NAMED_EQUIPMENT[baseId])rank=3;
 const rarity=REWARD_GRADES[rank];
 const key=`eq-arena-${r.seed}-${r.wave}-${id}-t${tier}-${rarity}`;
 r.rewardRecords??={};
 const record=r.rewardRecords[key]??createEquipmentRecord(id,{id:key,tier,rarity,...rollAffixes(item.category,rarity,seededRandom(`${r.seed}:reward-affix:${r.wave}:${id}:${tier}:${rarity}`))});
 r.rewardRecords[key]=record;return record.id;
}
function enoughRunEquipment(save,id,owned){
 const p=save.player,item=OUTFIT_ITEMS[id],grade=REWARD_GRADES.indexOf(item.rarity??RUN_EQUIPMENT_RARITY[equipmentBaseId(id)]??'common');
 const asGood=other=>equipmentBaseId(other)===equipmentBaseId(id)&&(OUTFIT_ITEMS[other]?.tier??1)>=(item.tier??1)
  &&REWARD_GRADES.indexOf(OUTFIT_ITEMS[other]?.rarity??RUN_EQUIPMENT_RARITY[equipmentBaseId(other)]??'common')>=grade;
 let count=owned.filter(asGood).length;
 for(const [other,n] of Object.entries(p.outfitting.locker))if(asGood(other))count+=n;
 return count>=(item.category==='gun'?HULL_HARDPOINTS[p.shipId].guns.filter(m=>itemFitsMount(item,m)).length:1);
}
export function runOffers(save){
 const r=save.arenaRun,p=save.player,fit=loadoutFor(p),owned=LOADOUT_KEYS.flatMap(k=>fit[k]).filter(Boolean);
 if(r.wave===0&&r.openingPicks===0)return ['pulse-cannon','beam-emitter','ripper'].filter(id=>runRewardPlan(save,id));
 const rng=seededRandom(`${r.seed}:reward:${r.wave}:${p.shipId}`);
 const eligible=id=>runRewardPlan(save,id)&&!enoughRunEquipment(save,id,owned);
 const candidates=Object.fromEntries(Object.entries(rewardPools).map(([key,ids])=>[key,ids.filter(id=>r.wave===0||r.wave>=(rewardWave[id]??1)).map(id=>runRewardItem(save,id)).filter(eligible).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).map(x=>x.id)]));
 const offers=[];
 // Offer a heavy boss weapon where mounts permit it; small hulls get
 // scatterguns for exposed batteries. Stored copies do not block this offer.
 if(r.wave===RUN_WAVES.length-1){
  const heavy=HULL_HARDPOINTS[p.shipId].weapons.length>1;
  const counters=heavy?['torpedo-launcher','mortar']:['ripper'];
  if(!owned.some(id=>counters.includes(equipmentBaseId(id)))){const counter=counters.map(id=>runRewardItem(save,id)).find(id=>runRewardPlan(save,id));if(counter)offers.push(counter);}
 }
 for(const key of ['offense','survival','handling']){if(key==='offense'&&offers.length)continue;const id=candidates[key].find(id=>!offers.includes(id));if(id)offers.push(id);}
 for(const id of Object.values(candidates).flat())if(offers.length<3&&!offers.includes(id))offers.push(id);
 if(p.hull<=getEffectiveShipStats(p).hull*.8)offers.splice(2,1,'repair');
 // A long run can own every upgrade a hull can take, leaving nothing eligible.
 // The stage must never be empty: startRunWave needs a chosen reward, so offer a
 // three service choices instead of stranding the sortie.
 for(const id of ['repair','rearm','resupply'])if(offers.length<3&&!offers.includes(id))offers.push(id);
 return offers;
}
// Preserve the two already-offered items when an old checkpoint has an unnecessary repair.
export function refreshRunRepairOffer(save){const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!r.offers.includes('repair')||save.player.hull<=getEffectiveShipStats(save.player).hull*.8)return;
 const replacement=runOffers(save).find(id=>id!=='repair'&&!r.offers.includes(id));if(replacement)r.offers=r.offers.map(id=>id==='repair'?replacement:id);
}
export function refreshRunRewardOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen)return;
 const highHull=save.player.hull>getEffectiveShipStats(save.player).hull*.8, fresh=runOffers(save);
 const current=(r.offers??[]).map(id=>OUTFIT_ITEMS[id]&&(OUTFIT_ITEMS[id].tier??1)<(hullTier(save.player.shipId)??1)?runRewardItem(save,equipmentBaseId(id)):id);
 const valid=[...new Set(current)].filter(id=>runRewardPlan(save,id)&&!(highHull&&id==='repair'&&!fresh.includes('repair')));
 for(const id of fresh)if(valid.length<3&&!valid.includes(id))valid.push(id);
 const bossOffer=fresh[0];if(r.wave===RUN_WAVES.length-1&&['torpedo-launcher','mortar','ripper'].includes(equipmentBaseId(bossOffer))&&!valid.includes(bossOffer))valid[0]=bossOffer;
 r.offers=valid.slice(0,3);if(!valid.includes(r.selectedReward))r.selectedReward=null;
}
export function recoverRun(save,extra=false){const p=save.player,stats=getEffectiveShipStats(p),r=save.arenaRun;p.hull=Math.min(stats.hull,p.hull+stats.hull*(extra?.5:r.hard?.1:.3));p.shield=stats.shield;p.energy=stats.energyCapacity;p.fuel=stats.fuel;
 if(extra)fillLauncherMagazines(p);else {for(const entry of normalizeLauncherMagazines(p))if(entry.rounds<entry.capacity)p.launcherMagazines[entry.mount.id].rounds++;normalizeLauncherMagazines(p);}
}
// A reward is a complete, mount-checked replacement plan, not a loose gun.
export function runRewardPlan(save,id){
 if(['repair','rearm','resupply'].includes(id))return {id,count:1,changes:[],replaced:[]};
 const p=save.player,item=OUTFIT_ITEMS[id],spec=HULL_HARDPOINTS[p.shipId];if(!item||equipmentBaseId(id)==='ion-blaster'&&spec.guns.length<2)return null;
 const fit=loadoutFor(p),key=item.category==='gun'?'guns':item.category==='launcher'?'launchers':item.category==='turret'?'turrets':'utility';if(!key)return null;
 let indices=spec[key].map((m,i)=>itemFitsMount(item,m)?i:-1).filter(i=>i>=0);
 if(!indices.length)return null;
 if(['guns','launchers'].includes(key)){
  // Guns and launchers are two views of the same physical bays. An empty
  // launcher slot is not free if a gun occupies that index (and vice versa).
  const free=indices.filter(i=>!fit.guns[i]&&!fit.launchers[i]);
  if(free.length){
   const count=equipmentBaseId(id)==='ion-blaster'?1:Math.min(2,spec.weapons.length,key==='launchers'?Math.max(0,fit.guns.filter(Boolean).length+free.length-1):2);
   indices=free.slice(0,count);
  }else if(key==='guns'&&equipmentBaseId(id)!=='ion-blaster'){
   // When every bay is occupied, prefer the usual pair but do not waste a
   // duplicate on a mount that already carries this exact gun.
   const paired=indices.slice(0,Math.min(2,spec.weapons.length));
   const replace=paired.filter(i=>fit.guns[i]!==id);
   indices=replace.length?replace:spec[key].map((m,i)=>itemFitsMount(item,m)&&fit.guns[i]!==id?i:-1).filter(i=>i>=0).slice(0,2);
  }else indices=[indices.find(i=>fit[key][i]!==id)??indices[0]];
 }else indices=[indices.find(i=>!fit[key][i])??indices.find(i=>fit[key][i]!==id)??indices[0]];
 if(indices.every(i=>fit[key][i]===id))return null;
 const changes=indices.map(index=>({key,index,old:fit[key][index],otherKey:key==='guns'?'launchers':key==='launchers'?'guns':null,other:(key==='guns'?fit.launchers:key==='launchers'?fit.guns:[])?.[index]}));
 for(const change of changes){fit[key][change.index]=id;if(change.otherKey)fit[change.otherKey][change.index]=null;}
 if(!validateLoadout(p,p.shipId,fit).ok||!fit.guns.some(Boolean))return null;
 return {id,count:['gun','launcher','turret'].includes(item.category)?2:changes.length,changes,replaced:changes.flatMap(c=>[c.old,c.other]).filter(Boolean)};
}
export function chooseRunReward(save,id){
 refreshRunRepairOffer(save);const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!r.offers.includes(id))return false;
 const plan=runRewardPlan(save,id);if(!plan)return false;
 if(id==='repair')recoverRun(save,true);
 else if(id==='rearm')fillLauncherMagazines(save.player);
 else if(id==='resupply'){const stats=getEffectiveShipStats(save.player);save.player.fuel=stats.fuel;save.player.energy=stats.energyCapacity;}
 else{
  // Commit the complete fit together so a pair cannot fail halfway through.
  const p=save.player,state=JSON.parse(JSON.stringify(p.outfitting)),fit=state.loadouts[p.shipId];
  for(const {key,index,old,other,otherKey} of plan.changes){
   if(other){state.locker[other]=(state.locker[other]??0)+1;fit[otherKey][index]=null;state.factory[p.shipId][otherKey][index]=false;}
   if(old){state.locker[old]=(state.locker[old]??0)+1;if(state.factory[p.shipId][key][index])state.factoryLocker[old]=(state.factoryLocker[old]??0)+1;}
   fit[key][index]=id;state.factory[p.shipId][key][index]=false;
  }
  const stored=Math.max(0,plan.count-plan.changes.length);
  if(stored)state.locker[id]=(state.locker[id]??0)+stored;
  if(OUTFIT_ITEMS[id].category==='launcher'&&stored){r.freshLaunchers??={};r.freshLaunchers[id]=(r.freshLaunchers[id]??0)+stored;}
  const equipped={...p,outfitting:state};p.equipment=projectLegacyEquipment(equipped,state);p.weaponId=projectLegacyWeaponId(equipped);p.outfitting=state;normalizeLauncherMagazines(p);
  if(OUTFIT_ITEMS[id].category==='launcher'){for(const entry of launcherMagazineEntries(p))if(plan.changes.some(c=>c.key==='launchers'&&HULL_HARDPOINTS[p.shipId].launchers[c.index].id===entry.mount.id)){p.launcherMagazines[entry.mount.id].rounds=entry.capacity;p.activeLauncherMountId=entry.mount.id;}normalizeLauncherMagazines(p);}
 }
 if(r.wave===0&&r.openingPicks!==undefined){r.openingPicks++;r.rewardChosen=r.openingPicks>=2;}else r.rewardChosen=true;
 r.selectedReward=null;if(!r.rewardChosen)r.offers=runOffers(save);return true;
}
export function skipRunReward(save){
 const r=save.arenaRun;
 if(!save.arena?.run||r?.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!loadoutFor(save.player).guns.some(Boolean))return false;
 recoverRun(save,true);r.rewardChosen=true;r.selectedReward=null;r.rarityBonusWave=r.wave+1;
 if(r.wave===0)r.openingPicks=2;
 return true;
}
export function fitRunItem(save,key,index,id){
 const r=save.arenaRun;if(!save.arena?.run||r.phase!=='prepare'||!r.rewardChosen)return false;
 const p=save.player,draft=loadoutFor(p);if(![...LOADOUT_KEYS,'weapons'].includes(key)||!Number.isInteger(index)||index<0||index>=(key==='weapons'?HULL_HARDPOINTS[p.shipId].weapons.length:draft[key].length))return false;
 if(key==='weapons')key=id&&OUTFIT_ITEMS[id]?.category==='launcher'?'launchers':draft.launchers[index]&&!draft.guns[index]?'launchers':'guns';
 const old=draft[key][index]??(['guns','launchers'].includes(key)?draft[key==='guns'?'launchers':'guns'][index]:null),next=id||null;if(next===old)return true;
 if(next&&!(p.outfitting.locker[next]>0))return false;
 if(['guns','launchers'].includes(key)){draft.guns[index]=null;draft.launchers[index]=null;}
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
 normalizeLauncherMagazines(p);
 if(next&&OUTFIT_ITEMS[next]?.category==='launcher'&&(r.freshLaunchers?.[next]??0)>0){
  const entry=launcherMagazineEntries(p).find(e=>e.mount.id===HULL_HARDPOINTS[p.shipId][key][index].id);
  if(entry){p.launcherMagazines[entry.mount.id].rounds=entry.capacity;r.freshLaunchers[next]--;normalizeLauncherMagazines(p);}
 }
 return true;
}
// The hulls a stage offers: the stage's tier, filtered to the faction blocs the
// run has reached, minus the pilot's current hull (staying put is the wingman
// option instead). A fresh draw per stage, stable across re-renders and reloads.
export function runHullOffers(save){
 const r=save.arenaRun,p=save.player,stage=HULL_STAGES[r.wave];
 if(!stage)return [];
 const inBloc=id=>!stage.factions||(HULL_FACTIONS[id]??[]).some(faction=>stage.factions.includes(faction));
 const rng=seededRandom(`${r.seed}:hull:${r.wave}:${p.shipId}`);
 return PLAYER_FLYABLE_HULLS.filter(id=>(r.wave===0||id!==p.shipId)&&hullTier(id)===stage.tier&&inBloc(id)).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).slice(0,ARENA_HULL_OFFER_COUNT).map(entry=>entry.id);
}
// Keep an already-shown offer list when it is still legal; otherwise fill it
// from a fresh draw. Runs on load so a checkpoint saved mid-stage renders the
// same hulls it showed before.
export function isPendingDecision(save){
 const w=save.arenaRun?.wave; const d=DECISION_STAGES[w]; if(!d)return false;
 save.arenaRun.decisions=save.arenaRun.decisions||{};
 return !save.arenaRun.decisions[w];
}
export function isPendingHullDecision(save){ const w=save.arenaRun?.wave; const d=DECISION_STAGES[w]; if(!d||d.type!=='hull')return false; save.arenaRun.decisions=save.arenaRun.decisions||{}; return !save.arenaRun.decisions[w]; }
export function isPendingWingmanDecision(save){ const w=save.arenaRun?.wave; const d=DECISION_STAGES[w]; if(!d||d.type!=='wingman-hire'&&d.type!=='wingman-upgrade')return false; save.arenaRun.decisions=save.arenaRun.decisions||{}; return !save.arenaRun.decisions[w]; }
export function markDecision(save,wave){ const r=save.arenaRun; r.decisions=r.decisions||{}; if(wave===undefined)wave=r.wave; r.decisions[wave]=true; if(wave===r.wave)r.hullChosen=true; }
export function refreshRunHullOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||!isPendingHullDecision(save))return;
 const valid=(Array.isArray(r.hullOffers)?r.hullOffers:[]).filter(id=>isFlyableHull(id)&&(r.wave===0||id!==save.player.shipId));
 for(const id of runHullOffers(save))if(valid.length<ARENA_HULL_OFFER_COUNT&&!valid.includes(id))valid.push(id);
 r.hullOffers=valid.slice(0,ARENA_HULL_OFFER_COUNT);
}
// The sixth hull-stage choice: keep the current ship and add a veteran. Three
// candidates are drawn from the complete pool and held for the stage, so the
// pilot chooses who joins the wing instead of taking a blind roll.
export function runWingmanOffers(save){
 const r=save.arenaRun; const stage=DECISION_STAGES[r.wave];
 if(r.phase!=='prepare'||!isPendingWingmanDecision(save))return [];
 const rng=seededRandom(`${r.seed}:wingman:${r.wave}`);
 let pool=PLAYER_FLYABLE_HULLS;
 if(stage?.tier)pool=pool.filter(id=>hullTier(id)===stage.tier);
 if(!pool.length)pool=PLAYER_FLYABLE_HULLS;
 return pool.map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).slice(0,WINGMAN_OFFER_COUNT)
  .map((entry,index)=>({id:`wingman-${r.wave}-${index}`,hullId:entry.id,fit:wingmanFitFor(entry.id),name:proceduralCallsign(rng),upgrade:stage?.type==='wingman-upgrade'}));
}
// Keep an already-shown roster while the stage is open; otherwise draw one.
// Runs on load so a checkpoint saved mid-stage offers the same three pilots.
export function refreshRunWingmanOffers(save){
 const r=save.arenaRun;if(r.phase!=='prepare'||!isPendingWingmanDecision(save)){r.wingmanOffers=[];return;}
 const valid=(Array.isArray(r.wingmanOffers)?r.wingmanOffers:[]).filter(candidate=>candidate&&isFlyableHull(candidate.hullId)&&typeof candidate.name==='string');
 for(const candidate of runWingmanOffers(save))if(valid.length<WINGMAN_OFFER_COUNT&&!valid.some(entry=>entry.id===candidate.id))valid.push(candidate);
 r.wingmanOffers=valid.slice(0,WINGMAN_OFFER_COUNT);
}
// Hire one of the stage's candidates. One hire per stage, at most two veterans
// per run, and only a name that is actually on offer can be taken.
export function upgradeRunWingman(save,wingIndex,candidate){
 const r=save.arenaRun; const list=Array.isArray(r.wingmen)?r.wingmen:[];
 let wingman=list[wingIndex];
 if(!wingman||wingman.alive===false){
  wingman={id:candidate.id,name:candidate.name,role:'patrol',alive:true,order:normalizeWingOrder(r.wingOrder)};
  list[wingIndex]=wingman;r.wingmen=list;
 }
 wingman.hullId=candidate.hullId;wingman.fit=candidate.fit;
 // A surviving pilot keeps their name and identity when changing hulls.

 return wingman;
}
export function hireRunWingman(save,id){
 const r=save.arenaRun; const stage=DECISION_STAGES[r.wave];
 if(r.phase!=='prepare'||!isPendingWingmanDecision(save))return null;
 const list=Array.isArray(r.wingmen)?r.wingmen:[];
 if(!(r.wingmanOffers??[]).length)r.wingmanOffers=runWingmanOffers(save);
 const candidate=r.wingmanOffers.find(entry=>entry.id===id);if(!candidate)return null;
 if(stage?.type==='wingman-upgrade' && typeof stage.wingIndex==='number'){
  const upgraded=upgradeRunWingman(save,stage.wingIndex,candidate);
  if(upgraded){ r.wingmanOffers=[]; markDecision(save); r.offers=runOffers(save); return upgraded; }
  return null;
 }
 if(list.filter(wingman=>wingman.alive!==false).length>=MAX_RUN_WINGMEN)return null;
 const wingman={id:candidate.id,hullId:candidate.hullId,role:'patrol',fit:candidate.fit,name:candidate.name,alive:true,order:normalizeWingOrder(r.wingOrder)};
 list[stage.wingIndex??list.length]=wingman;r.wingmen=list;r.wingmanOffers=[];
 markDecision(save);r.offers=runOffers(save);
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
 const r=save.arenaRun,p=save.player;if(r.phase!=='prepare'||!isPendingHullDecision(save)||!PLAYER_FLYABLE_HULLS.includes(id)||!(r.hullOffers??[]).includes(id))return false;
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
   const mount=spec[key][index];if(!item||fit[key][index]||(['guns','launchers'].includes(key)&&(fit.guns[index]||fit.launchers[index]))||!locker[item]||!itemFitsMount(OUTFIT_ITEMS[item],mount))return false;
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
  if(r.wave!==0&&!loadoutFor(p).guns.some(Boolean)){Object.assign(p,JSON.parse(JSON.stringify(snapshot)));return false;}
 }
 markDecision(save);r.wingmanOffers=[];r.offers=runOffers(save);return true;
}
