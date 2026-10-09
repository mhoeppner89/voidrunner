// Political allegiance is separate from guild membership and local influence.
export const FACTION_NAMES = Object.freeze({concord:'Concord',alliance:'Alliance',independents:'Independents',pirates:'Pirates'});
export const FACTION_IDS = Object.freeze(Object.keys(FACTION_NAMES));
const LEGACY = Object.freeze({'frontier-league':'alliance','red-talons':'pirates','free-merchants':'independents','frontier-miners':'independents','salvage-union':'independents'});
export const canonicalFaction = id => Object.hasOwn(LEGACY,id) ? LEGACY[id] : id;
export const GUILD_FACTIONS = Object.freeze({merchant:'independents',bounty:'independents',mining:'independents',salvage:'independents',syndicate:'independents'});
export const GUILD_SHIP_PREFERENCES = Object.freeze({
 merchant:['mule','atlas','torsas'],bounty:['demon','lancer','legionary'],
 mining:['prospector','atlas'],salvage:['wayfarer','torsas','mule'],syndicate:['scrapper','demon'],
});
export const FACTION_FLEETS = Object.freeze({
 concord:{patrol:['talon','blade','vanguard'],escort:['talon','blade'],trader:['mule','atlas']},
 alliance:{patrol:['legionary','speedster','andromeda','lancer'],escort:['speedster','legionary'],trader:['torsas','astra']},
 independents:{trader:GUILD_SHIP_PREFERENCES.merchant,miner:GUILD_SHIP_PREFERENCES.mining,bounty:GUILD_SHIP_PREFERENCES.bounty,escort:['wayfarer','torsas','astra'],patrol:['legionary','lancer']},
 pirates:{pirate:['scrapper','scrapper','scrapper','scrapper','demon'],escort:['scrapper','demon'],bounty:['demon','scrapper'],trader:['scrapper','demon']},
});
export function preferredNpcHull(faction,role,index=0,guild){
 const fleet=FACTION_FLEETS[canonicalFaction(faction)],ids=guild&&canonicalFaction(faction)==='independents'?GUILD_SHIP_PREFERENCES[guild]:undefined;
 const choices=ids??fleet?.[role]??(canonicalFaction(faction)==='pirates'?fleet.pirate:undefined);
 return choices?.[((index%choices.length)+choices.length)%choices.length];
}
export const factionsOpposed=(a,b)=>{a=canonicalFaction(a);b=canonicalFaction(b);return Boolean(a&&b&&a!==b&&(a==='pirates'||b==='pirates'||a==='alliance'&&b==='concord'||a==='concord'&&b==='alliance'));};
export function migrateFactionReputation(source={},fallback={}){
 source=source&&typeof source==='object'?source:{};
 const result={...fallback};
 for(const id of FACTION_IDS){const aliases=Object.keys(LEGACY).filter(k=>LEGACY[k]===id),values=aliases.map(k=>source[k]).filter(v=>typeof v==='number'&&Number.isFinite(v));const value=source[id]??(values.length?values.reduce((a,b)=>a+b,0)/values.length:result[id]);result[id]=Math.max(-100,Math.min(100,Number(value)||0));}
 return result;
}
// Delta ledgers are additive; current standings use the averaging migration above.
export function migrateFactionDeltas(source={}){const result=Object.fromEntries(FACTION_IDS.map(id=>[id,0]));for(const[id,n]of Object.entries(source))if(FACTION_IDS.includes(canonicalFaction(id)))result[canonicalFaction(id)]+=Number(n)||0;return result;}
export function migrateFactionTags(value){
 if(!value||typeof value!=='object')return;
 for(const[key,entry]of Object.entries(value)){
  if(key==='faction'&&typeof entry==='string')value[key]=canonicalFaction(entry);
  else if(key==='reputationDelta'||key==='startReputation')value[key]=key==='startReputation'?migrateFactionReputation(entry):migrateFactionDeltas(entry);
  else if(key==='startSnapshot'&&entry&&typeof entry==='object'){
   if(entry.reputation)entry.reputation=migrateFactionReputation(entry.reputation);
   migrateFactionTags(entry);
  }
  else if(entry&&typeof entry==='object')migrateFactionTags(entry);
 }
}
