import {t} from './i18n.js';
// Resolved item definitions are cached on inventory changes, never rolled or
// allocated in flight. The fixed shop catalogue remains independently iterable.
const resolved = new Map();
export const equipmentRecord = id => resolved.get(id);
export const registerEquipmentDefinition = (id, definition) => resolved.set(id, definition);
export const forgetEquipmentDefinition = id => resolved.delete(id);
export const equipmentBaseId = id => resolved.get(id)?.baseId ?? id;

// Progression has two independent axes, both meant to be felt:
//  * Tier is the technology generation. Each step is a clear jump in primary
//    output (a common tier II gun matches a good tier I rare), paid for with a
//    slightly higher energy cost per shot and the reactor load of fitting
//    above the hull's tier (shipStats.higherTierLoadFraction).
//  * Rarity adds a modest primary gain plus rolled affixes; better rarities
//    roll more affixes and roll them closer to the top of their range.
//    Legendary ("named" in saves) items carry a unique trait that changes how
//    the hardware behaves.
// Indices are tiers above the item's own minimum tier.
export const TIER_CURVE = Object.freeze({damage: [1, 1.3, 1.65], energy: [1, 1.12, 1.25], effect: [1, 1.4, 1.8], price: [1, 1.6, 2.4]});
export const RARITY_ORDER = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'named']);
// gain: primary multiplier; value: price multiplier; floor: lowest affix roll quality; survival: chance
// the part survives its ship's destruction (better hardware is sturdier).
export const EQUIPMENT_RARITIES = Object.freeze({
 common: {name: 'Common', color: '#f1f4f7', affixes: 0, value: 1, gain: 1, floor: 0, survival: .16},
 uncommon: {name: 'Uncommon', color: '#72df95', affixes: 1, value: 2.5, gain: 1.08, floor: 0, survival: .22},
 rare: {name: 'Rare', color: '#79b8ff', affixes: 2, value: 5, gain: 1.16, floor: .15, survival: .3},
 epic: {name: 'Epic', color: '#c18cff', affixes: 3, value: 10, gain: 1.25, floor: .3, survival: .5},
 named: {name: 'Legendary', color: '#ffa046', affixes: 2, value: 18, gain: 1.3, floor: .45, survival: 1},
});
export const rarityRank = rarity => Math.max(0, RARITY_ORDER.indexOf(rarity));
const WEAPON = ['gun', 'launcher', 'turret'], GUN = ['gun', 'turret'], SYSTEM = ['power', 'drive', 'defense', 'utility'];
// mod: a resolved modifier the affix multiplies (siphon adds); bonus: a ship
// effect it adds, scaled by tier like the item's own effect. range: the value
// at roll quality 0 and 1.
export const EQUIPMENT_AFFIXES = Object.freeze({
 overcharged: {name: 'Overcharged', categories: WEAPON, mod: 'damage', range: [1.05, 1.15], signature: 0xff5ad6},
 efficient: {name: 'Efficient', categories: GUN, mod: 'energy', range: [.9, .8]},
 quickLock: {name: 'Quick-lock', categories: ['launcher'], mod: 'lockTime', range: [.9, .75]},
 rapid: {name: 'Rapid', categories: WEAPON, mod: 'cooldown', range: [.95, .85]},
 precise: {name: 'Precise', categories: WEAPON, mod: 'accuracy', range: [1.1, 1.25]},
 longRange: {name: 'Long-range', categories: WEAPON, mod: 'range', range: [1.1, 1.2]},
 disruptive: {name: 'Disruptive', categories: GUN, mod: 'shield', range: [1.15, 1.35], signature: 0x8f6bff},
 piercing: {name: 'Armor-piercing', categories: GUN, mod: 'hull', range: [1.15, 1.35], signature: 0xeef4ff},
 siphoning: {name: 'Siphoning', categories: ['gun'], mod: 'siphon', range: [.15, .3], signature: 0x5dff8f},
 light: {name: 'Lightweight', categories: [...WEAPON, ...SYSTEM], mod: 'mass', range: [.8, .6]},
 tuned: {name: 'Tuned', categories: SYSTEM, mod: 'effect', range: [1.05, 1.15]},
 compact: {name: 'Compact', categories: SYSTEM, mod: 'mass', range: [.9, .8], also: {effect: [1.03, 1.06]}},
 reinforced: {name: 'Reinforced', categories: SYSTEM, bonus: 'hullCapacity', range: [10, 20], signature: 0xffb35c},
 warded: {name: 'Warded', categories: SYSTEM, bonus: 'shieldCapacity', range: [10, 20], signature: 0x6fc4ff},
 overclocked: {name: 'Overclocked', categories: SYSTEM, bonus: 'outputMultiplier', range: [1.05, 1.1], signature: 0xfff06a},
});
// Signature colour: the specialisation an item is built around tints its
// shots, impacts and icon accent (equipmentSignature). Legendaries have their
// own; otherwise the best-rolled specialising affix decides.
// Legendary hardware: a proper name, a modest stat edge and one trait.
//   mods   — resolved modifier multipliers (siphon adds)
//   weapon — flight fields replaced on the projectile definition
//   scale  — flight fields multiplied
//   effects — ship effects added to the item's own
export const NAMED_EQUIPMENT = Object.freeze({
 'pulse-cannon': {signature: 0xffe14d, name: 'Needle Array', trait: 'Every fourth bolt strikes for double damage.', mods: {accuracy: 1.15}, weapon: {critEvery: 4, critMultiplier: 2}},
 'beam-emitter': {signature: 0xfff0c0, name: 'Quiet Sun', trait: 'Each hit returns half of its energy.', mods: {damage: 1.1, siphon: .5}},
 'gauss-cannon': {signature: 0x38ffe0, name: 'Dead Reckoning', trait: 'Slugs pass through the first ship they hit.', mods: {damage: 1.1, range: 1.15}, weapon: {pierce: 1}},
 'ripper': {signature: 0xa8e6ff, name: 'Hailstorm', trait: 'Fires nine pellets instead of seven.', weapon: {pellets: 9}},
 'ion-blaster': {signature: 0xc06bff, name: 'Static Bloom', trait: 'Weapon jamming lasts twice as long.', mods: {damage: 1.1}, weapon: {jamSeconds: 2}},
 'mortar': {signature: 0xff5a8a, name: 'Dawnbreaker', trait: 'A 60% wider blast that hits 30% harder.', mods: {damage: 1.1}, scale: {splashRadius: 1.6, splashDamage: 1.3}},
 'seeker-launcher': {signature: 0xffd27a, name: 'Longbow', trait: '30% longer lock range and sharper tracking.', mods: {range: 1.3, accuracy: 1.3}},
 'torpedo-launcher': {signature: 0xff8a4d, name: 'Siegebreaker', trait: 'A 50% wider warhead blast.', mods: {damage: 1.12}, scale: {splashRadius: 1.5}},
 'shield-mk2': {signature: 0x6fc4ff, name: 'Bastion', trait: 'Also regenerates shields 25% faster.', mods: {effect: 1.18}, effects: {rechargeMultiplier: 1.25}},
 'armor-mk2': {signature: 0xffb35c, name: 'Ironclad', trait: 'Also adds 30 shield capacity.', effects: {shieldCapacity: 30}},
 'sustained-reactor': {signature: 0xff6a3d, name: 'Heartfire', trait: 'Also stores 20% more energy.', effects: {capacityMultiplier: 1.2}},
 'engine-mk2': {signature: 0x9fe8ff, name: 'Comet Tail', trait: 'Boost burns 30% less fuel.', mods: {effect: 1.15}, effects: {burnFuelMultiplier: .7}},
 'thrusters-mk2': {signature: 0x7cffc8, name: 'Dervish', trait: 'Also adds 10% top speed.', effects: {speedMultiplier: 1.1}},
});
// Technology tier is independent of rarity and of the hardware model name.
// Named loot still shows its hardware type; affixes stay out of compact lists.
export function equipmentName(item, {affixes = true} = {}) {
 if (!item) return '';
 const tier = Math.max(1, Math.min(3, Math.trunc(item.tier ?? 1)));
 const base = t(item.baseName ?? item.name);
 const nickname = item.rarity === 'named' ? NAMED_EQUIPMENT[item.baseId]?.name : undefined;
 const modifiers = affixes ? (item.affixIds ?? []).map(id => EQUIPMENT_AFFIXES[id]).filter(Boolean).map(a => t(a.name)) : [];
 return [`${base} ${['I', 'II', 'III'][tier - 1]}`, ...(nickname ? [t(nickname)] : []), ...modifiers].join(' · ');
}
export function migratePulseRecord(record){
 if(record?.baseId==='pulse-mk2'){
  record.baseId='pulse-cannon';record.tier=Math.min(3,Math.max(1,Math.floor(Number(record.tier)||1))+1);
  if(record.rarity==='named')record.rarity='rare';
 }
 return record;
}
export const runtimeEquipmentId=id=>{
 const item=equipmentRecord(id),base=equipmentBaseId(id);
 if(item&&String(id).startsWith('eq-arena-'))return id;
 return base==='pulse-cannon'&&(item?.tier??1)>1?`pulse-cannon-t${Math.min(3,item.tier)}`:base;
};
const lerp=(a,b,q)=>a+(b-a)*q;
const CAPACITY_KEYS=['cargoCapacity','shieldCapacity','hullCapacity','salvageRange','salvageRate','radarMultiplier','scanMultiplier'];
// Records saved before rolled affixes have no rolls; they resolve at mid-range.
export const affixQuality=(record,index,rarity=EQUIPMENT_RARITIES[record?.rarity]??EQUIPMENT_RARITIES.common)=>{
 const roll=Number(record?.rolls?.[index]);
 return lerp(rarity.floor,1,Number.isFinite(roll)?Math.max(0,Math.min(1,roll)):.5);
};
const addEffect=(effects,key,value)=>{
 if(key.endsWith('Multiplier'))effects[key]=(effects[key]??1)+(value-1);
 else effects[key]=(effects[key]??0)+value;
};
export function resolveEquipmentDefinition(base, record) {
 const minTier=base.tier??1,tier=Math.max(minTier,Math.min(3,record.tier??1)),extra=Math.max(0,Math.min(2,tier-minTier));
 const rarityId=Object.hasOwn(EQUIPMENT_RARITIES,record.rarity)?record.rarity:'common',rarity=EQUIPMENT_RARITIES[rarityId];
 const modifiers={damage:TIER_CURVE.damage[extra]*rarity.gain,energy:TIER_CURVE.energy[extra],cooldown:1,lockTime:1,range:1,accuracy:1,mass:1,effect:TIER_CURVE.effect[extra]*rarity.gain,shield:1,hull:1,siphon:0};
 const affixRolls=[],bonuses=[];
 for(const [index,id] of (record.affixes??[]).entries()){
  const a=EQUIPMENT_AFFIXES[id];if(!a?.categories.includes(base.category))continue;
  const q=affixQuality(record,index,rarity),value=lerp(a.range[0],a.range[1],q);
  const amount=a.bonus?(a.bonus.endsWith('Multiplier')?1+(value-1)*TIER_CURVE.effect[extra]:value*TIER_CURVE.effect[extra]):value;
  affixRolls.push({id,value:amount,quality:q});
  if(a.bonus)bonuses.push([a.bonus,amount]);
  else if(a.mod==='siphon')modifiers.siphon+=value;
  else modifiers[a.mod]*=value;
  for(const [key,range] of Object.entries(a.also??{}))modifiers[key]*=lerp(range[0],range[1],q);
 }
 const named=rarityId==='named'?NAMED_EQUIPMENT[record.baseId??base.id]:undefined;
 for(const [key,value] of Object.entries(named?.mods??{}))if(key==='siphon')modifiers.siphon+=value;else modifiers[key]*=value;
 const effects={...base.effects};
 for(const [key,value] of Object.entries(effects))if(typeof value==='number'){
  if(key.endsWith('Multiplier'))effects[key]=1+(value-1)*modifiers.effect;
  else if(CAPACITY_KEYS.includes(key))effects[key]=value*modifiers.effect;
 }
 // Collection distance is a fixed technology specification, never an affix roll.
 if(base.id==='loot-collector')effects.lootRange=[150,200,250][tier-1]*(1+rarityRank(rarityId)*.05);
 for(const [key,value] of bonuses)addEffect(effects,key,value);
 for(const [key,value] of Object.entries(named?.effects??{}))addEffect(effects,key,value);
 const name=named?.name??[...affixRolls.map(a=>EQUIPMENT_AFFIXES[a.id].name),base.name].join(' ');
 const definition={...base,id:record.id,baseId:base.id,baseName:base.name,tier,rarity:record.rarity,affixIds:affixRolls.map(a=>a.id),affixRolls,
  trait:named?.trait,weaponTraits:named&&(named.weapon||named.scale)?{set:named.weapon,scale:named.scale}:undefined,
  name:`${name} · ${['I','II','III'][tier-1]}`,effects,modifiers,
  energyCost:(base.energyCost??0)*modifiers.energy,mass:(base.mass??(base.category==='gun'?2:base.category==='launcher'?3:1))*modifiers.mass,
  price:Math.round(base.price*TIER_CURVE.price[extra]*rarity.value),factoryFit:base.factoryFit};
 definition.signature=equipmentSignature(definition);
 return definition;
}
export function equipmentSignature(item){
 if(item?.rarity==='named'&&NAMED_EQUIPMENT[item.baseId]?.signature)return {id:item.baseId,color:NAMED_EQUIPMENT[item.baseId].signature};
 let best;for(const roll of item?.affixRolls??[]){const a=EQUIPMENT_AFFIXES[roll.id];if(a?.signature&&(!best||roll.quality>best.quality))best={id:roll.id,color:a.signature,quality:roll.quality};}
 return best?{id:best.id,color:best.color}:undefined;
}
// One number per item for quick comparisons: 100 is the common tier I model of
// the same hardware. It reads the resolved modifiers, so tier, rarity, affix
// rolls and legendary traits all move it.
export function equipmentRating(item){
 const m=item?.modifiers;if(!m)return 100;
 const named=item.rarity==='named'&&item.trait?1.12:1;
 let score;
 if(WEAPON.includes(item.category))score=m.damage/m.cooldown*(m.lockTime??1)**-.35*m.energy**-.35*m.range**.35*m.accuracy**.25*((m.shield??1)*(m.hull??1))**.35*(1+(m.siphon??0)*.6)*m.mass**-.05;
 else score=m.effect*m.mass**-.05*(1+(item.affixRolls??[]).filter(a=>EQUIPMENT_AFFIXES[a.id]?.bonus).length*.06);
 return Math.round(100*score*named);
}
const percent=v=>Math.round(Math.abs(v)*100);
// Readable affix lines for item details: what each roll does, and how close
// to the top of its range it landed.
export function equipmentAffixLines(item){
 return (item?.affixRolls??[]).map(({id,value,quality})=>{
  const a=EQUIPMENT_AFFIXES[id],key=a.bonus??a.mod;let text;
  if(a.bonus==='hullCapacity')text=t('+{value} hull integrity',{value:Math.round(value)});
  else if(a.bonus==='shieldCapacity')text=t('+{value} shield capacity',{value:Math.round(value)});
  else if(a.bonus==='outputMultiplier')text=t('+{value}% energy regeneration',{value:percent(value-1)});
  else if(key==='damage')text=t('+{value}% damage',{value:percent(value-1)});
  else if(key==='energy')text=t('−{value}% energy per shot',{value:percent(1-value)});
  else if(key==='cooldown')text=t('+{value}% fire rate',{value:percent(1/value-1)});
  else if(key==='lockTime')text=t('−{value}% lock time',{value:percent(1-value)});
  else if(key==='accuracy'&&item.category==='launcher')text=t('+{value}% seeker cone and turn rate',{value:percent(value-1)});
  else if(key==='accuracy')text=t('+{value}% aim correction',{value:percent(value-1)});
  else if(key==='range')text=t('+{value}% range',{value:percent(value-1)});
  else if(key==='shield')text=t('+{value}% shield damage',{value:percent(value-1)});
  else if(key==='hull')text=t('+{value}% hull damage',{value:percent(value-1)});
  else if(key==='siphon')text=t('{value}% of shot energy returned on hit',{value:percent(value)});
  else if(key==='mass')text=t('−{value}% mass',{value:percent(1-value)});
  else text=t('+{value}% effect',{value:percent(value-1)});
  if(a.also)text+=` · ${t('+{value}% effect',{value:percent(lerp(a.also.effect[0],a.also.effect[1],quality)-1)})}`;
  return {id,name:t(a.name),text,quality};
 });
}
const weaponCache=new WeakMap();
export function modifiedWeapon(base,item) {
 if(!base||!item?.modifiers)return base;
 let cache=weaponCache.get(item);if(!cache){cache=new Map();weaponCache.set(item,cache);}if(cache.has(base))return cache.get(base);
 const m=item.modifiers,shield=m.shield??1,hull=m.hull??1;
 const value={...base,damageFlat:base.damageFlat==null?undefined:base.damageFlat*m.damage,damage:base.damage==null?undefined:base.damage*m.damage,
  splashDamage:base.splashDamage==null?undefined:base.splashDamage*m.damage,energyCost:(base.energyCost??0)*m.energy,cooldown:base.cooldown*m.cooldown,
  range:base.range==null?undefined:base.range*m.range,lockRange:base.lockRange==null?undefined:base.lockRange*m.range,
  plumeFraction:base.plumeFraction==null?undefined:base.plumeFraction/m.accuracy,
  lockTime:base.lockTime==null?undefined:base.lockTime*m.lockTime,trackRate:base.trackRate==null?undefined:base.trackRate*m.accuracy,seekerCone:base.seekerCone==null?undefined:base.seekerCone*m.accuracy,
  life:base.category==='launcher'?base.life:base.life*m.range,shotInterval:base.shotInterval==null?undefined:base.shotInterval*m.cooldown,burstPause:base.burstPause==null?undefined:base.burstPause*m.cooldown,interceptEnergy:base.interceptEnergy==null?undefined:base.interceptEnergy*m.energy,gunneryAccuracy:m.accuracy,homingTurn:base.homingTurn==null?undefined:base.homingTurn*m.accuracy,assist:(base.assist??1)*m.accuracy,spreadRad:(base.spreadRad??0)/m.accuracy,
  shieldMul:base.shieldMul==null&&shield===1?base.shieldMul:(base.shieldMul??1)*shield,hullMul:base.hullMul==null&&hull===1?base.hullMul:(base.hullMul??1)*hull,
  siphon:m.siphon>0?m.siphon:undefined,tint:item.signature?.color};
 const traits=item.weaponTraits;
 if(traits){Object.assign(value,traits.set);for(const [key,factor] of Object.entries(traits.scale??{}))if(value[key]!=null)value[key]*=factor;}
 cache.set(base,value);return value;
}
