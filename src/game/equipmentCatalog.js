// Resolved item definitions are cached on inventory changes, never rolled or
// allocated in flight. The fixed shop catalogue remains independently iterable.
const resolved = new Map();
export const equipmentRecord = id => resolved.get(id);
export const registerEquipmentDefinition = (id, definition) => resolved.set(id, definition);
export const forgetEquipmentDefinition = id => resolved.delete(id);
export const equipmentBaseId = id => resolved.get(id)?.baseId ?? id;
export const EQUIPMENT_RARITIES = Object.freeze({common:{name:'Common',color:'#f1f4f7',affixes:0,value:1},uncommon:{name:'Uncommon',color:'#72df95',affixes:1,value:1.25},rare:{name:'Rare',color:'#79b8ff',affixes:2,value:1.65},named:{name:'Named',color:'#e5bc61',affixes:0,value:2}});
export const EQUIPMENT_AFFIXES = Object.freeze({
 efficient:{name:'Efficient',categories:['gun','launcher','turret'],energy:.86},
 precise:{name:'Precise',categories:['gun','launcher','turret'],accuracy:1.12},
 rapid:{name:'Rapid',categories:['gun','launcher','turret'],cooldown:.92,energy:1.06},
 longRange:{name:'Long-range',categories:['gun','launcher','turret'],range:1.1},
 light:{name:'Lightweight',categories:['gun','launcher','turret','power','drive','defense','utility'],mass:.75},
 tuned:{name:'Tuned',categories:['power','drive','defense','utility'],effect:1.08},
 compact:{name:'Compact',categories:['power','drive','defense','utility'],mass:.85,effect:1.04},
});
export const NAMED_EQUIPMENT = Object.freeze({
 'gauss-cannon':{name:'Dead Reckoning',damage:1.12,cooldown:1.12,energy:1.12,range:1.15},
 'pulse-cannon':{name:'Needle Array',damage:.94,cooldown:.88,energy:.88,accuracy:1.15},
 'beam-emitter':{name:'Quiet Sun',damage:1.08,energy:.85,range:.9},
 'torpedo-launcher':{name:'Siegebreaker',damage:1.12,cooldown:1.2,energy:1.15},
 'shield-mk2':{name:'Bastion',effect:1.18,mass:1.3},
});
export function resolveEquipmentDefinition(base, record) {
 const tier=Math.max(base.tier??1,Math.min(3,record.tier??1)),rarity=EQUIPMENT_RARITIES[record.rarity]??EQUIPMENT_RARITIES.common;
 const extra=Math.max(0,tier-(base.tier??1));
 const modifiers={damage:1+extra*.1,energy:1+extra*.14,cooldown:1,range:1,accuracy:1,mass:1,effect:1+extra*.1};
 const affixes=(record.affixes??[]).map(id=>EQUIPMENT_AFFIXES[id]).filter(a=>a?.categories.includes(base.category));
 for(const a of affixes)for(const key of Object.keys(modifiers))modifiers[key]*=a[key]??1;
 const named=record.rarity==='named'?NAMED_EQUIPMENT[record.baseId]:undefined;
 if(named)for(const key of Object.keys(modifiers))modifiers[key]*=named[key]??1;
 const effects={...base.effects};
 for(const [key,value] of Object.entries(effects))if(typeof value==='number'){
  if(key.endsWith('Multiplier'))effects[key]=1+(value-1)*modifiers.effect;
  else if(['cargoCapacity','shieldCapacity','hullCapacity','salvageRange','salvageRate','radarMultiplier','scanMultiplier'].includes(key))effects[key]=value*modifiers.effect;
 }
 const name=named?.name??[...affixes.map(a=>a.name),base.name].join(' ');
 return {...base,id:record.id,baseId:base.id,tier,rarity:record.rarity,affixIds:[...(record.affixes??[])],name:`${name} · ${['I','II','III'][tier-1]}`,effects,modifiers,
  energyCost:(base.energyCost??0)*modifiers.energy,mass:(base.mass??(base.category==='gun'?2:base.category==='launcher'?3:1))*modifiers.mass,
  price:Math.round(base.price*(1+extra*.35)*rarity.value),factoryFit:base.factoryFit};
}
const weaponCache=new WeakMap();
export function modifiedWeapon(base,item) {
 if(!base||!item?.modifiers)return base;
 let cache=weaponCache.get(item);if(!cache){cache=new Map();weaponCache.set(item,cache);}if(cache.has(base))return cache.get(base);
 const m=item.modifiers;
 const value={...base,damageFlat:base.damageFlat==null?undefined:base.damageFlat*m.damage,damage:base.damage==null?undefined:base.damage*m.damage,
  splashDamage:base.splashDamage==null?undefined:base.splashDamage*m.damage,energyCost:(base.energyCost??0)*m.energy,cooldown:base.cooldown*m.cooldown,
  range:base.range==null?undefined:base.range*m.range,lockRange:base.lockRange==null?undefined:base.lockRange*m.range,
  life:base.life*m.range,shotInterval:base.shotInterval==null?undefined:base.shotInterval*m.cooldown,burstPause:base.burstPause==null?undefined:base.burstPause*m.cooldown,interceptEnergy:base.interceptEnergy==null?undefined:base.interceptEnergy*m.energy,gunneryAccuracy:m.accuracy,homingTurn:base.homingTurn==null?undefined:base.homingTurn*m.accuracy,assist:(base.assist??1)*m.accuracy,spreadRad:(base.spreadRad??0)/m.accuracy};cache.set(base,value);return value;
}
