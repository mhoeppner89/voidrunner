import {ROOKERY_LAUNCH,SKIDBLADNIR_LAUNCH} from './corvetteMounts.js';
import {arenaSite} from './arenaSites.js';
import {equipmentBaseId,equipmentRating,RARITY_ORDER,NAMED_EQUIPMENT} from './equipmentCatalog.js';
import {DRONE_TYPES,createDroneUnit} from './droneData.js';
import {createEquipmentRecord,rollAffixes,registerInventoryDefinitions,normalizeEquipmentInventory} from './equipmentInventory.js';
import {createNewSave,hydrateSave} from './save.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,canonicalOutfitId,LOADOUT_KEYS,loadoutFor,createOutfittingState,itemFitsMount,validateLoadout,projectLegacyEquipment,projectLegacyWeaponId} from './outfitting.js';
import {getEffectiveShipStats} from './shipStats.js';
import {launcherMagazineEntries,normalizeLauncherMagazines,fillLauncherMagazines,weaponForOutfit} from './weapons.js';
import {proceduralCallsign,seededRandom} from './random.js';
import {HULL_NPC_FITS} from './enemyLoadouts.js';
import {ARENA_HULL_OFFER_COUNT,MAX_RUN_WINGMEN,PLAYER_FLYABLE_HULLS,WINGMAN_OFFER_COUNT,HULL_FACTIONS,isFlyableHull,hullTier,wingmanFitFor} from './shipPool.js';
import {WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_HINT,WING_ORDER_SHORT,WING_ORDER_GATE,normalizeWingOrder,nextWingOrder} from './wingOrders.js';
export const ARENA_RUN_KEY='voidrunner-arena-run-v1';
export const ARENA_RECORD_KEY='voidrunner-arena-record-v1';
// Enemy entries are named opponents, not positional tuples: a hull id, the
// faction that fields it, the NPC role it flies as, a pilot tier, and an optional
// arrival group. Guns, turrets, launchers and equipment default to the hull's
// real stock NPC fit (HULL_NPC_FITS), so an Arena Run opponent flies the same
// ship the career world would spawn; any of them can be overridden per wave
// (a lighter first contact, a bigger missile load) without re-authoring the fit.
const enemy=(hullId,options={})=>({hullId,...options});
export const runEnemyFit=(spec)=>{
 const base=HULL_NPC_FITS[spec.hullId]??{};
 const merged={...base};
 for(const key of ['guns','turrets','launchers','launcher','turret','power','drive','defense','utility','utilities','missiles'])
  if(spec[key]!==undefined)merged[key]=spec[key];
 return merged;
};
// Groups use the hull's stock fit unless a level names a different rack or gun.
// Objective clocks start when the primary ship enters.
const group=(...enemies)=>({enemies});
const novice=(id,options)=>enemy(id,{tier:'novice',...options});
const veteran=(id,missiles=0,options)=>enemy(id,{tier:'veteran',missiles,...options});
const ace=(id,missiles=0,options)=>enemy(id,{tier:'ace',missiles,...options});
// Fill every physical gun socket. Guards engage the wingman when one is flying.
const gunBank=(id,lead,other=lead)=>HULL_HARDPOINTS[id].guns.map((_,i)=>i===0?lead:other);
const fleetGuard=(id,defense='armor-mk2')=>veteran(id,0,{
 screenWing:true,guns:gunBank(id,'pulse-cannon','mortar'),
 utilities:['capital-shield-generator',defense,'engine-mk2','armor-mk2'],
});
const interceptor=(id,defense='armor-mk2')=>veteran(id,0,{
 guns:gunBank(id,'ion-blaster'),
 utilities:[defense,'recovery-shield','armor-mk2','shield-mk2'],
});
const ionGuard=(id,defense='armor-mk2')=>veteran(id,0,{
 screenWing:true,guns:gunBank(id,'ion-blaster','mortar'),
 utilities:['capital-shield-generator',defense,'engine-mk2','armor-mk2'],
});
const patrolGuard=(id,defense='armor-mk2')=>veteran(id,0,{
 screenWing:true,guns:gunBank(id,'pulse-cannon','mortar'),
 utilities:[defense,'capital-shield-generator','recovery-shield','armor-mk2'],
});
const batteryAce=(id,missiles=0)=>ace(id,missiles,{
 guns:gunBank(id,'mortar'),
 utilities:['capital-shield-generator','capital-shield-generator','armor-mk2','engine-mk2'],
});
const railAce=(id,missiles=0)=>ace(id,missiles,{
 guns:gunBank(id,'gauss-cannon','mortar'),
 utilities:['capital-shield-generator','capital-shield-generator','armor-mk2','engine-mk2'],
});
const strikeAce=(id,missiles=0)=>ace(id,missiles,{
 guns:gunBank(id,'mortar'),
 utilities:['capital-shield-generator','recovery-shield','armor-mk2','thrusters-mk2'],
});
const capital=(id,tier)=>enemy(id,{role:id==='concord-frigate'?'frigate':'capital',capital:true,tier,primary:true});
const bomber=tier=>enemy('andromeda',{role:'bounty',tier,launchers:['torpedo-launcher','torpedo-launcher','torpedo-launcher'],missiles:3,attackObjective:true});
const roles={scrapper:'pirate',demon:'pirate',mule:'trader',atlas:'trader',torsas:'trader',prospector:'miner',wayfarer:'escort',speedster:'escort'};
const level=(name,site,hint,groups,extra={})=>({name,site,hint,groups,...extra});
const balor=()=>novice('scrapper');
const ironjaw=()=>capital('ironjaw','veteran');
const barge=()=>capital('barge','veteran');
export const RUN_ACTS=[
 {id:'talons',name:'Red Talons',faction:'pirates',waves:[
  level("First contact","verge-lanes","Novice Balors patrol the lane entrance.",[
    group(balor()),
    group(balor(),balor())]),
  level("Scavengers","acheron-horizon","Watch the horizon for Balors and flanking Loki fighters.",[
    group(balor()),
    group(balor()),
    group(veteran('speedster'))]),
  level("Cut loose","mourning-carrier","Clear the scouts, then duel the four-gun Morrigan.",[
    group(balor()),
    group(balor()),
    {...group(veteran('demon',1,{guns:['pulse-cannon','pulse-cannon','beam-emitter','beam-emitter']})),limit:1}]),
  level("Hit and run","acheron-horizon","Two Loki fighters screen a Red Njord Barrage. Its fire control cannot follow a pilot crossing fast.",[
    group(novice('speedster')),
    group(barge(),novice('speedster'))],{objective:{kind:'destroy',label:'Destroy Barrage',done:'Barrage destroyed',failed:'Barrage escaped'}}),
  level("Red Njord","redwake-belt","Break through the scouts and destroy the Red Njord among its Balor escorts.",[
    group(veteran('scrapper',1),novice('speedster')),
    group(veteran('demon',1),balor(),balor()),
    group(ironjaw(),veteran('scrapper',1),veteran('scrapper',1))],{objective:{kind:'destroy',label:'Destroy Red Njord',done:'Red Njord destroyed',failed:'Red Njord escaped'}}),
 ]},
 {id:'merchants',name:'Free Merchants',faction:'independents',waves:[
  level("Freight lane","foundry-lanes","An Argo and its escort lead the merchant patrol.",[
    group(novice('mule'),veteran('wayfarer',1)),
    group(novice('wayfarer'),veteran('torsas')),
    group(novice('mule'),novice('wayfarer'),novice('wayfarer'))]),
  level("Claim jumpers","shardbelt-heart","The claims crews call for armed escorts inside the heart tunnel.",[
    group(veteran('prospector'),novice('wayfarer')),
    group(novice('prospector'),veteran('torsas',1)),
    group(veteran('prospector'),veteran('wayfarer'),veteran('wayfarer'))]),
  level("Convoy","pale-rings","Break through the convoy screen. Destroy the Njord or both engines before it jumps.",[
    group(veteran('prospector'),veteran('torsas'),veteran('mule')),
    group(capital('drover','novice'),veteran('wayfarer'),veteran('speedster')),
    {...group(veteran('torsas'),novice('wayfarer')),at:40}],{objective:{kind:'stop',label:'Stop the Njord',done:'Njord stopped',failed:'Njord escaped',seconds:150}}),
  level("Brigid","mourning-center","Intercept the Brigid and its escorts. Its drone hangar supplies repairs.",[
    group(novice('mule'),veteran('torsas')),
    group(veteran('atlas')),
    group(capital('caravan','veteran'),novice('wayfarer'))]),
  level("Red Brigid","verge-lanes","Red Brigid launches four Balors. Disable its hangars to stop replacements.",[
    group(veteran('demon'),novice('speedster')),
    group(capital('rookery','veteran')),
    {...group(veteran('scrapper'),novice('scrapper')),at:35,hullBelow:.6}],{faction:'pirates',objective:{kind:'destroy',label:'Destroy carrier',done:'Carrier destroyed',failed:'Carrier escaped',clearLaunches:true},launch:{...ROOKERY_LAUNCH,fighter:veteran(ROOKERY_LAUNCH.fighter)}}),
 ]},
 {id:'league',name:'Frontier League',faction:'alliance',waves:[
  level("Patrol shift","acheron-horizon","Intercept the League patrols above Acheron.",[
    group(veteran('legionary',1),novice('speedster'),fleetGuard('andromeda')),
    group(veteran('legionary'),fleetGuard('speedster')),
    group(fleetGuard('legionary'),fleetGuard('andromeda'),novice('speedster'))]),
  level("Courier run","shardbelt-rim","A Thor reinforces the courier screen at the rim.",[
    group(veteran('legionary',1),veteran('speedster')),
    group(veteran('andromeda',1),veteran('speedster'),veteran('legionary')),
    group(veteran('andromeda'),veteran('legionary'),veteran('speedster'))]),
  level("Strike","pale-rings","Protect the Njord until it jumps. Intercept the Thor torpedo bombers.",[
    group(bomber('veteran'),veteran('legionary'),veteran('speedster',1)),
    {...group(bomber('ace'),veteran('speedster')),at:40},
    {...group(bomber('veteran'),veteran('legionary'),veteran('legionary',1)),at:80}],{objective:{kind:'defend',label:'Defend Njord',done:'Njord safe',failed:'Njord lost',seconds:150,transport:capital('drover','novice')}}),
  level("Honorguard","mourning-battleship","Use the battleship wreck for cover when Heimdall charges its lance.",[
    group(patrolGuard('lancer'),patrolGuard('legionary'),patrolGuard('andromeda')),
    {...group(capital('siege','veteran'),veteran('speedster',1)),at:40},
    {...group(strikeAce('astra'),patrolGuard('legionary')),at:40,hullBelow:.65}]),
  level("Veteran wing","shardbelt-chimney","The Skidbladnir fields six Loki fighters. Disable its hangars to prevent replacements.",[
    group(strikeAce('astra',1),veteran('speedster'),patrolGuard('legionary')),
    group(patrolGuard('legionary'),veteran('andromeda',1),patrolGuard('astra')),
    group(capital('skidbladnir','veteran'))],{objective:{kind:'destroy',label:'Destroy carrier',done:'Carrier destroyed',failed:'Carrier escaped',clearLaunches:true},launch:{...SKIDBLADNIR_LAUNCH,fighter:veteran(SKIDBLADNIR_LAUNCH.fighter)}}),
 ]},
 {id:'concord',name:'Concord Frontier Fleet',faction:'concord',waves:[
  level("Show of force","verge-lanes","A Mercury ace leads the first patrol onto the lanes.",[
    group(ace('talon',1),veteran('blade',1),fleetGuard('vanguard')),
    group(veteran('talon'),fleetGuard('vanguard')),
    group(batteryAce('vanguard'),fleetGuard('talon'),veteran('blade'))]),
  level("Victoria dance","mourning-carrier","Victoria fighters take turns covering the carrier deck.",[
    group(ace('blade',2),interceptor('vanguard'),veteran('blade')),
    group(veteran('blade',1),interceptor('vanguard'),veteran('blade')),
    group(veteran('blade'),veteran('blade'),interceptor('vanguard','capital-shield-generator'))]),
  level("Battery test","acheron-horizon","Victoria fighters screen the Bellona batteries.",[
    group(railAce('vanguard',2),ionGuard('blade'),ionGuard('vanguard','capital-shield-generator')),
    group(railAce('vanguard',1),ionGuard('blade'),ionGuard('vanguard','capital-shield-generator')),
    group(ionGuard('vanguard'),ionGuard('vanguard'),ionGuard('vanguard','capital-shield-generator'))]),
  level("Screened","foundry-lanes","Break the Tacita screen. Destroy its emitter to restore missile guidance.",[
    group(ace('lancer',2),ionGuard('blade'),enemy('picket',{capital:true,role:'capital',tier:'veteran'})),
    group(ace('lancer',2),ionGuard('vanguard','capital-shield-generator'),ionGuard('lancer')),
    group(ace('blade',2),ionGuard('vanguard','capital-shield-generator'),veteran('talon',1))]),
  level("Heavy metal","pale-rings","Break the fleet screen before the heavy ace pair arrives.",[
    group(batteryAce('blade',2),fleetGuard('vanguard'),fleetGuard('vanguard','capital-shield-generator')),
    group(batteryAce('vanguard',2),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('blade')),
    group(batteryAce('blade',2),ace('vanguard',2),fleetGuard('vanguard','capital-shield-generator'))]),
 ]},
 {id:'capital',name:'Concord Capital',faction:'concord',waves:[
  level("Picket","mourning-battleship","The capital picket sends its aces in succession.",[
    group(batteryAce('vanguard',2),fleetGuard('talon'),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('blade')),
    {...group(capital('picket','veteran'),fleetGuard('lancer','capital-shield-generator'),fleetGuard('vanguard','capital-shield-generator')),at:30},
    group(batteryAce('blade',2),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('talon'),fleetGuard('vanguard','capital-shield-generator'))]),
  level("Reserves","redwake-belt","Fleet reserves are on station in the belt.",[
    group(strikeAce('blade',2),patrolGuard('lancer'),patrolGuard('vanguard','capital-shield-generator'),patrolGuard('vanguard')),
    {...group(strikeAce('talon',1),patrolGuard('vanguard','capital-shield-generator'),patrolGuard('blade','capital-shield-generator')),at:35},
    group(strikeAce('lancer',2),patrolGuard('blade'),patrolGuard('vanguard','capital-shield-generator'),patrolGuard('talon'))]),
  level("Ace screen","verge-lanes","Pairs of aces hold the Verge lanes.",[
    group(batteryAce('vanguard',2),fleetGuard('blade'),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('lancer')),
    {...group(batteryAce('talon',1),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('lancer','capital-shield-generator'),batteryAce('vanguard')),at:30},
    group(batteryAce('blade',2),batteryAce('vanguard',2),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('talon'))]),
  level("Elite guard","mourning-center","A reserve Mercury escorts the last Artemis ace.",[
    group(batteryAce('lancer',2),batteryAce('vanguard',2),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('blade','capital-shield-generator')),
    {...group(batteryAce('blade',2),batteryAce('talon',1),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('vanguard','capital-shield-generator')),at:30},
    group(batteryAce('lancer',2),fleetGuard('blade'),fleetGuard('vanguard','capital-shield-generator'),fleetGuard('talon'))]),
  level("The line","shardbelt-rim","Destroy the frigate. More escorts answer as its hull gives way.",[
    group(capital('concord-frigate','ace'),ace('blade',2),ace('blade',2),veteran('vanguard',2),veteran('blade',2)),
    {...group(ace('talon'),ace('talon')),at:60,hullBelow:.6},
    {...group(ace('vanguard',2),ace('blade',2)),at:120,hullBelow:.3}],{objective:{kind:'destroy',label:'Destroy frigate',done:'Frigate destroyed',failed:'Frigate escaped'}}),
 ]},
];
for(const act of RUN_ACTS)act.waves=act.waves.map(wave=>{
 const prepare=spec=>({...spec,faction:wave.faction??act.faction,role:spec.role??roles[spec.hullId]??'patrol'});
 const groups=wave.groups.map(g=>({...g,enemies:g.enemies.map(prepare)}));
 const launch=wave.launch&&{...wave.launch,fighter:prepare(wave.launch.fighter)};
 return Object.freeze({...wave,groups,enemies:groups.flatMap(g=>g.enemies),launch,environment:arenaSite(wave.site).environment});
});
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
 clearRunMiningDrones(save.player);
 save.arenaRun={openingPicks:0,version:3,totalWaves:RUN_WAVES.length,seed,hard,wave:0,phase:'prepare',rewardChosen:false,hullChosen:false,decisions:{},offers:[],hullOffers:[],wingmanOffers:[],wingmen:[],wingOrder:'aggressive',cleared:0,elapsed:0,damage:0,missiles:0};save.arenaRun.hullOffers=runHullOffers(save);return save;
}
// Mining drones have no work in the Arena: their bays start empty so a combat
// drone reward can fill them.
function clearRunMiningDrones(p){
 const fleet=p.droneFleet;if(!fleet)return;
 for(const fit of Object.values(p.outfitting?.loadouts??{}))for(const bay of fit.droneBays??[])bay.unitIds=bay.unitIds.map(id=>fleet.unitsById[id]?.type==='mining'?null:id);
 for(const [id,unit] of Object.entries(fleet.unitsById))if(unit.type==='mining'){delete fleet.unitsById[id];fleet.lockerIds=fleet.lockerIds.filter(value=>value!==id);}
}
const OLD_WAVE_TOTALS={1:8,2:10};
// Map an old checkpoint's wave index onto the same fractional position in the
// current run, so a saved sortie resumes roughly where it was instead of jumping.
const migrateWave=(wave,version)=>Math.max(0,Math.min(RUN_WAVES.length-1,Math.floor((wave+0.5)/OLD_WAVE_TOTALS[version]*RUN_WAVES.length)));
export function readArenaRun(){try{
 const raw=JSON.parse(window.localStorage.getItem(ARENA_RUN_KEY));
 let r=raw?.arenaRun;
 const totals={...OLD_WAVE_TOTALS,3:RUN_WAVES.length};
 if(![1,2,3].includes(r?.version)||!['prepare','combat','won','lost'].includes(r.phase)||!Number.isInteger(r.wave)||r.wave<0||r.wave>=totals[r.version])return null;
 registerInventoryDefinitions({items:r.rewardRecords});
 const save=hydrateSave(raw);
 r=save.arenaRun;delete r.nextEnemy;delete r.warned;delete r.entry;save.arena={run:true};normalizeEquipmentInventory(save.player,{disabled:true});
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
 survival:['pdc','tracking-turret','shield-mk2','recovery-shield','pdc-drone','repair-drone'],
 handling:['engine-mk2','thrusters-mk2','capacitor-bank','sustained-reactor'],
};
const rewardWave={'pulse-cannon-t2':3,'pulse-cannon-t3':8,'swarm-launcher':3,'torpedo-launcher':5,'mortar':2,'gauss-cannon':2};
const REWARD_GRADES=RARITY_ORDER;
function runRewardItem(save,id){
 const item=OUTFIT_ITEMS[id];if(!item||item.category==='drone')return id;
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
 return count>=(item.category==='gun'?HULL_HARDPOINTS[p.shipId].guns.length:item.category==='launcher'?HULL_HARDPOINTS[p.shipId].launchers.length:1);
}
// How much a reward does for this ship and fit. Above 1 it improves the
// build: a better grade than what it replaces, an empty bay filled, or
// relief for what the fit lacks. Below 1 it is a downgrade.
const FILLS_EMPTY_BAY=1.5;
export function rewardFitScore(save,id,plan=runRewardPlan(save,id)){
 if(!plan)return 0;
 if(['repair','rearm','resupply'].includes(id))return 1;
 const p=save.player,item=OUTFIT_ITEMS[id];if(!item)return 0;
 if(item.category==='drone')return plan.replaced.length?1.2:FILLS_EMPTY_BAY;
 const rating=equipmentRating(item),same=plan.replaced.filter(old=>OUTFIT_ITEMS[old]?.category===item.category).map(old=>equipmentRating(OUTFIT_ITEMS[old]));
 let score=!plan.replaced.length?FILLS_EMPTY_BAY:same.length?rating/Math.max(...same):1.05;
 const stats=getEffectiveShipStats(p),fit=loadoutFor(p);
 let draw=0;for(const gun of fit.guns){const w=gun&&weaponForOutfit(gun);if(w?.cooldown>0)draw+=(w.energyCost??0)/w.cooldown;}
 if(item.category==='power'&&draw>stats.reactorOutput*1.5)score*=1.3;
 if(item.category==='defense'&&stats.shield<120)score*=1.2;
 // A fit without missiles lacks a whole capability; offer one.
 if(item.category==='launcher'&&!fit.launchers.some(Boolean))score*=1.3;
 return score;
}
// The best few rewards of a pool, then a weighted draw among them so runs
// still vary. Downgrades only appear when nothing better fits.
function pickForFit(save,ids,rng){
 const scored=ids.map(id=>({id,score:rewardFitScore(save,id)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 const useful=scored.filter(x=>x.score>=1),pool=(useful.length?useful:scored).slice(0,3);
 if(!pool.length)return;
 let roll=rng()*pool.reduce((sum,x)=>sum+x.score,0);
 for(const x of pool)if((roll-=x.score)<=0)return x.id;
 return pool.at(-1).id;
}
export function runOffers(save){
 const r=save.arenaRun,p=save.player,fit=loadoutFor(p),owned=LOADOUT_KEYS.flatMap(k=>fit[k]).filter(Boolean);
 if(r.wave===0&&r.openingPicks===0)return ['pulse-cannon','beam-emitter','ripper'].filter(id=>runRewardPlan(save,id));
 const rng=seededRandom(`${r.seed}:reward:${r.wave}:${p.shipId}`);
 const eligible=id=>runRewardPlan(save,id)&&!enoughRunEquipment(save,id,owned);
 const candidates=Object.fromEntries(Object.entries(rewardPools).map(([key,ids])=>[key,ids.filter(id=>r.wave===0||r.wave>=(rewardWave[id]??1)).map(id=>runRewardItem(save,id)).filter(eligible).map(id=>({id,sort:rng()})).sort((a,b)=>a.sort-b.sort).map(x=>x.id)]));
 const offers=[];
 // Offer a fitted counter to the frigate. Stored copies do not block the offer.
 if(r.wave===RUN_WAVES.length-1){
  const counters=['torpedo-launcher','mortar'];
  if(!owned.some(id=>counters.includes(equipmentBaseId(id)))){const counter=counters.map(id=>runRewardItem(save,id)).find(id=>runRewardPlan(save,id));if(counter)offers.push(counter);}
 }
 for(const key of ['offense','survival','handling']){if(key==='offense'&&offers.length)continue;const id=pickForFit(save,candidates[key].filter(id=>!offers.includes(id)),rng);if(id)offers.push(id);}
 while(offers.length<3){const id=pickForFit(save,Object.values(candidates).flat().filter(id=>!offers.includes(id)),rng);if(!id)break;offers.push(id);}
 if(p.hull<=getEffectiveShipStats(p).hull*.8)offers.splice(2,1,'repair');
 // A long run can own every upgrade a hull can take, leaving nothing eligible.
 // The stage must never be empty: startRunWave needs a chosen reward, so offer a
 // three service choices instead of stranding the sortie.
 // Energy refills between levels, so the old resupply service is no longer offered;
 // a saved offer still resolves below.
 for(const id of ['repair','rearm'])if(offers.length<3&&!offers.includes(id))offers.push(id);
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
export function recoverRun(save,extra=false){const p=save.player,stats=getEffectiveShipStats(p),r=save.arenaRun,repair=extra?.5:r.hard?.1:.3;p.hull=Math.min(stats.hull,p.hull+stats.hull*repair);
 // Wingmen share the pilot's repair rule, including a wingman disabled last level.
 for(const wingman of r?.wingmen??[])if(wingman.alive!==false&&wingman.hullFraction!==undefined)wingman.hullFraction=Math.min(1,wingman.hullFraction+repair);p.shield=stats.shield;p.energy=stats.energyCapacity;
 if(extra)fillLauncherMagazines(p);else {for(const entry of normalizeLauncherMagazines(p))if(entry.rounds<entry.capacity)p.launcherMagazines[entry.mount.id].rounds++;normalizeLauncherMagazines(p);}
}
// A reward is a complete, mount-checked replacement plan, not a loose gun.
export function runRewardPlan(save,id){
 if(['repair','rearm','resupply'].includes(id))return {id,count:1,changes:[],replaced:[]};
 const p=save.player,item=OUTFIT_ITEMS[id],spec=HULL_HARDPOINTS[p.shipId];if(!item||equipmentBaseId(id)==='ion-blaster'&&spec.guns.length<2)return null;
 if(item.category==='drone'){
  // A combat drone takes an empty bay first, else one flying another role.
  const bays=loadoutFor(p).droneBays??[],typeOf=bay=>p.droneFleet?.unitsById?.[bay.unitIds?.[0]]?.type;
  const index=[bays.findIndex(bay=>!typeOf(bay)),bays.findIndex(bay=>typeOf(bay)&&typeOf(bay)!==item.droneType)].find(i=>i>=0);
  if(index===undefined||!DRONE_TYPES[item.droneType])return null;
  const old=typeOf(bays[index]);
  return {id,count:1,changes:[{key:'droneBays',index,old:old?`${old}-drone`:null}],replaced:old?[`${old}-drone`]:[]};
 }
 const fit=loadoutFor(p),key=item.category==='gun'?'guns':item.category==='launcher'?'launchers':item.category==='turret'?'turrets':'utility';if(!key)return null;
 let indices=spec[key].map((m,i)=>itemFitsMount(item,m)?i:-1).filter(i=>i>=0);
 if(!indices.length)return null;
 const free=indices.filter(i=>!fit[key][i]);
 const paired=(key==='guns' && equipmentBaseId(id)!=='ion-blaster') || (key==='launchers' && free.length>0);
 const maxChanges=paired?2:1;
 indices=(free.length?free:indices.filter(i=>fit[key][i]!==id)
  .sort((a,b)=>equipmentRating(OUTFIT_ITEMS[fit[key][a]])-equipmentRating(OUTFIT_ITEMS[fit[key][b]]))).slice(0,maxChanges);
 if(!indices.length)return null;
 const changes=indices.map(index=>({key,index,old:fit[key][index]}));
 for(const change of changes)fit[key][change.index]=id;
 if(!validateLoadout(p,p.shipId,fit).ok||!fit.guns.some(Boolean))return null;
 return {id,count:['gun','launcher','turret'].includes(item.category)?2:changes.length,changes,replaced:changes.map(c=>c.old).filter(Boolean)};
}
export function chooseRunReward(save,id){
 refreshRunRepairOffer(save);const r=save.arenaRun;if(r.phase!=='prepare'||r.rewardChosen||!r.hullChosen||!r.offers.includes(id))return false;
 const plan=runRewardPlan(save,id);if(!plan)return false;
 if(id==='repair')recoverRun(save,true);
 else if(id==='rearm')fillLauncherMagazines(save.player);
 else if(id==='resupply'){const stats=getEffectiveShipStats(save.player);save.player.energy=stats.energyCapacity;}
 else if(OUTFIT_ITEMS[id]?.category==='drone'){
  // loadoutFor returns a copy: write the live loadout.
  const p=save.player,fleet=p.droneFleet,live=p.outfitting.loadouts[p.shipId];live.droneBays=loadoutFor(p).droneBays;
  const bay=live.droneBays[plan.changes[0].index],unit=`drone-unit-${fleet.nextUnitId++}`;
  for(const old of bay.unitIds)if(old){delete fleet.unitsById[old];fleet.lockerIds=fleet.lockerIds.filter(value=>value!==old);}
  fleet.unitsById[unit]=createDroneUnit(unit,OUTFIT_ITEMS[id].droneType);bay.mode=OUTFIT_ITEMS[id].droneType;bay.unitIds=[unit];
 }
 else{
  // Commit the complete fit together so a pair cannot fail halfway through.
  const p=save.player,state=JSON.parse(JSON.stringify(p.outfitting)),fit=state.loadouts[p.shipId];
  for(const {index,old} of plan.changes)if(OUTFIT_ITEMS[old]?.category==='launcher')stashRackRounds(r,old,rackRoundsAt(p,index));
  for(const {key,index,old} of plan.changes){
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
// A rack taken off keeps its rounds with the stored copy, and a stored copy
// goes back in with them. Rounds are kept per copy (r.storedRounds[itemId]);
// the fullest copy is installed first. Freshly won racks arrive full.
function rackRoundsAt(p,index){return launcherMagazineEntries(p).find(e=>e.mount.id===HULL_HARDPOINTS[p.shipId].launchers[index]?.id)?.rounds;}
function stashRackRounds(r,itemId,rounds){if(!itemId||OUTFIT_ITEMS[itemId]?.category!=='launcher'||!Number.isFinite(rounds))return;(r.storedRounds??={})[itemId]=[...(r.storedRounds[itemId]??[]),rounds];}
function loadRackRounds(p,r,itemId,index){
 const entry=launcherMagazineEntries(p).find(e=>e.mount.id===HULL_HARDPOINTS[p.shipId].launchers[index]?.id);if(!entry)return;
 const pool=r.storedRounds?.[itemId];
 if(pool?.length){pool.sort((a,b)=>a-b);p.launcherMagazines[entry.mount.id].rounds=Math.min(entry.capacity,pool.pop());if(!pool.length)delete r.storedRounds[itemId];}
 else if((r.freshLaunchers?.[itemId]??0)>0){p.launcherMagazines[entry.mount.id].rounds=entry.capacity;r.freshLaunchers[itemId]--;}
 normalizeLauncherMagazines(p);
}
export function fitRunItem(save,key,index,id){
 const r=save.arenaRun;if(!save.arena?.run||r.phase!=='prepare'||!r.rewardChosen)return false;
 const p=save.player,draft=loadoutFor(p);
 if(!LOADOUT_KEYS.includes(key)||!Number.isInteger(index)||index<0||index>=draft[key].length)return false;
 const old=draft[key][index],next=id||null;if(next===old)return true;
 if(next&&!(p.outfitting.locker[next]>0))return false;
 draft[key][index]=next;
 const validation=validateLoadout(p,p.shipId,draft);if(!validation.ok||!draft.guns.some(Boolean))return false;
 const removedRounds=old&&OUTFIT_ITEMS[old]?.category==='launcher'?rackRoundsAt(p,index):undefined;
 // Arena equipment is earned into the locker. No purchase or simulated docking is involved.
 const state=JSON.parse(JSON.stringify(p.outfitting)),flags=state.factory[p.shipId][key];
 if(old){state.locker[old]=(state.locker[old]??0)+1;if(flags[index])state.factoryLocker[old]=(state.factoryLocker[old]??0)+1;}
 flags[index]=false;
 if(next){if(--state.locker[next]===0)delete state.locker[next];if(state.factoryLocker[next]>0){flags[index]=true;if(--state.factoryLocker[next]===0)delete state.factoryLocker[next];}}
 state.loadouts[p.shipId]=validation.loadout;
 const equipped={...p,outfitting:state};
 p.equipment=projectLegacyEquipment(equipped,state);p.weaponId=projectLegacyWeaponId(equipped);p.outfitting=state;
 normalizeLauncherMagazines(p);
 stashRackRounds(r,old,removedRounds);
 if(next&&OUTFIT_ITEMS[next]?.category==='launcher')loadRackRounds(p,r,next,index);
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
 wingman.hullId=candidate.hullId;wingman.fit=candidate.fit;wingman.hullFraction=undefined;
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
  if(upgraded){ r.wingmanOffers=[]; markDecision(save); r.offers=r.rewardForfeited?[]:runOffers(save); return upgraded; }
  return null;
 }
 if(list.filter(wingman=>wingman.alive!==false).length>=MAX_RUN_WINGMEN)return null;
 const wingman={id:candidate.id,hullId:candidate.hullId,role:'patrol',fit:candidate.fit,name:candidate.name,alive:true,order:normalizeWingOrder(r.wingOrder)};
 list[stage.wingIndex??list.length]=wingman;r.wingmen=list;r.wingmanOffers=[];
 markDecision(save);r.offers=r.rewardForfeited?[]:runOffers(save);
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
  const rackSources=new Map();
  const install=(key,index,item,sourceIndex)=>{
   const mount=spec[key][index];if(!item||fit[key][index]||!locker[item]||!itemFitsMount(OUTFIT_ITEMS[item],mount))return false;
   fit[key][index]=item;locker[item]--;
   if(factoryLocker[item]>0){flags[key][index]=true;factoryLocker[item]--;}
   if(key==='launchers'&&sourceIndex!==undefined)rackSources.set(index,sourceIndex);
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
  if(r.wave!==0&&!fit.guns.some(Boolean)){Object.assign(p,snapshot);return false;}
  p.hull=getEffectiveShipStats(p).hull*fraction;
  p.launcherMagazines={};p.missiles=0;
  const used=new Set(rackSources.values());
  for(const entry of magazines){
   if(!used.has(entry.index))stashRackRounds(r,entry.itemId,entry.rounds);
  }
  normalizeLauncherMagazines(p);
  for(const [i,item] of fit.launchers.entries()){
   if(!item)continue;
   const source=rackSources.get(i);
   if(source===undefined){loadRackRounds(p,r,item,i);continue;}
   const previous=magazines.find(e=>e.mount.id===oldSpec.launchers[source].id);
   if(!previous)continue;
   p.launcherMagazines[spec.launchers[i].id].rounds=previous.rounds;
   if(previous.selected)p.activeLauncherMountId=spec.launchers[i].id;
  }
  normalizeLauncherMagazines(p);
 }
 markDecision(save);r.wingmanOffers=[];r.offers=r.rewardForfeited?[]:runOffers(save);return true;
}
