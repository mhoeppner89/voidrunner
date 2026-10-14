import {displaySpeed} from './data.js';
import {SHIELD_RECHARGE_RATE} from './combatResources.js';
// Shared concrete labels/conversions for comparisons. Values come from the
// actual staged ship stats, including losses caused by replaced equipment.
export const EQUIPMENT_STAT_FIELDS=[
 {key:'energyCapacity',label:'Energy capacity',effects:['capacityMultiplier']},
 {key:'reactorOutput',label:'Energy regeneration',unit:'/s',effects:['outputMultiplier']},
 {key:'shield',label:'Shield capacity',effects:['shieldCapacity','shieldMultiplier']},
 {key:'shieldRechargeMultiplier',label:'Shield regeneration',unit:'/s',scale:SHIELD_RECHARGE_RATE,effects:['rechargeMultiplier']},
 {key:'hull',label:'Hull integrity',effects:['hullCapacity']},
 {key:'maxSpeed',label:'Max speed',unit:'km/s',convert:displaySpeed,effects:['speedMultiplier']},
 {key:'acceleration',label:'Acceleration',unit:'km/s²',convert:displaySpeed,effects:['accelerationMultiplier']},
 {key:'angularAcceleration',label:'Turn accel.',unit:'°/s²',scale:180/Math.PI,effects:['turnMultiplier']},
 {key:'cargo',label:'Cargo capacity',effects:['cargoCapacity']},
 {key:'radarRange',label:'Radar range',unit:'km',effects:['radarMultiplier']},
 {key:'scanRange',label:'Scan range',unit:'km',effects:['scanMultiplier']},
 {key:'salvageRange',label:'Salvage range',unit:'km',effects:['salvageRange']},
 {key:'salvageRate',label:'Salvage rate',unit:'×',effects:['salvageRate']},
 {key:'burnFuelMultiplier',label:'Boost fuel use',unit:'%',scale:100,lowerBetter:true,effects:['burnFuelMultiplier']},
 {key:'lateralMultiplier',label:'Drift correction',unit:'%',scale:100,effects:['lateralMultiplier']},
];
export function equipmentStatChanges(before,after,item,includeUnchanged=false){
 const convert=(field,value)=>field.convert?field.convert(value):value*(field.scale??1);
 return EQUIPMENT_STAT_FIELDS.filter(f=>Number.isFinite(before[f.key])&&Number.isFinite(after[f.key])&&(Math.abs(after[f.key]-before[f.key])>.001||includeUnchanged&&f.effects.some(key=>item?.effects?.[key]!=null)))
  .map(field=>({...field,before:convert(field,before[field.key]),after:convert(field,after[field.key]),delta:before[field.key]?(after[field.key]/before[field.key]-1)*100:undefined,improved:field.lowerBetter?after[field.key]<before[field.key]:after[field.key]>before[field.key],primary:field.effects.some(key=>item?.effects?.[key]!=null)}))
  .sort((a,b)=>Number(b.primary)-Number(a.primary));
}

// Unmounted shop/loot utilities show their actual bonuses, without guessing a
// mount or presenting the ship's current total as the item's own effect.
export function equipmentEffectStats(item){
 return EQUIPMENT_STAT_FIELDS.flatMap(field=>{
  const effect=field.effects.find(key=>typeof item?.effects?.[key]==='number');
  if(!effect)return [];
  const ratio=effect.endsWith('Multiplier')||effect==='salvageRate';
  const value=ratio?(item.effects[effect]-1)*100:item.effects[effect];
  return [{key:field.key,label:field.label,value,unit:ratio?'%':['salvageRange'].includes(effect)?' km':''}];
 });
}
