// Controlled fitting/resource experiments. No test suites or game state imports.
import {SHIPS} from '../../src/game/data.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,normalizeLoadout} from '../../src/game/outfitting.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {weaponForOutfit} from '../../src/game/weapons.js';
import {registerEquipmentDefinition,resolveEquipmentDefinition} from '../../src/game/equipmentCatalog.js';
import {regenerateCombatResources,spendEnergy} from '../../src/game/combatResources.js';
import {activationWeaponDamage,weaponDamage} from '../../src/game/weaponDamage.js';
export const GUNS=['pulse-cannon','beam-emitter','gauss-cannon','ripper','ion-blaster','mortar','frigate-battery','cruiser-battery'];
export function itemAtTier(baseId,tier=1){
 const base=OUTFIT_ITEMS[baseId];if(tier===1||base.tier>=tier)return baseId;
 const id=`balance-${baseId}-${tier}`;
 registerEquipmentDefinition(id,resolveEquipmentDefinition(base,{id,baseId,tier,rarity:'rare',affixes:base.category==='gun'?['efficient','rapid']:['tuned','compact']}));return id;
}
export function balanceFit(hull,guns=[],utilities=[],turrets=[],launchers=[]){
 const fit=normalizeLoadout(hull,{mountSchema:4,guns,utility:utilities,turrets,launchers});
 const player={shipId:hull,outfitting:{schema:4,locker:{},loadouts:{[hull]:fit}}},stats=getEffectiveShipStats(player);
 const items=['guns','launchers','utility','turrets'].flatMap(k=>fit[k].filter(Boolean));
 return {hull,guns:fit.guns.filter(Boolean),utilities:fit.utility.filter(Boolean),turrets:fit.turrets.filter(Boolean),launchers:fit.launchers.filter(Boolean),stats,cost:SHIPS[hull].price+items.reduce((v,id)=>v+OUTFIT_ITEMS[id].price,0)};
}
// Same 60 Hz capacitor, cooldown, pellet and shield-activation rules as flight.
// Perfect aim bounds equipment potential; it is not a prediction of AI wins.
export function firingTrace(fit,{duration=24,passes=false,recharging=false}={}){
 const weapons=fit.guns.map(weaponForOutfit),ready=weapons.map(()=>0),p={energy:fit.stats.energyCapacity,shield:recharging?0:fit.stats.shield};
 const target={shield:1e9};let hullDamage=0,shieldDamage=0,openingHull=0,openingShield=0,shots=0,blocked=0,energySpent=0;
 for(let tick=0;tick<duration*60;tick++){
  const now=tick/60;if(!passes||now%8<2.4)for(let offset=0;offset<weapons.length;offset++){
   const i=(tick+offset)%weapons.length,w=weapons[i];if(now+1e-8<ready[i])continue;
   if(!spendEnergy(p,w.energyCost)){blocked++;continue;}
   ready[i]=now+w.cooldown;energySpent+=w.energyCost;shots++;
   for(let pellet=0;pellet<(w.pellets??1);pellet++){
    const h=weaponDamage(0,w.damageFlat,w).hull,s=activationWeaponDamage(target,1e9,w.damageFlat,w,now).shield;target.shield-=s;
    hullDamage+=h;shieldDamage+=s;if(now<2.4){openingHull+=h;openingShield+=s;}
   }
  }
  regenerateCombatResources(p,fit.stats,1/60,0);
 }
 return {hullDamage,shieldDamage,openingHull,openingShield,shots,blocked,energySpent,energy:p.energy,shield:p.shield};
}
export function bestFits(hull,budget,tier=1){
 const n=HULL_HARDPOINTS[hull].weapons.length,u=HULL_HARDPOINTS[hull].utility.length;let sustained,passes;let tested=0;
 for(const baseId of GUNS)for(let count=1;count<=n;count++)for(let r=0;r<=u;r++)for(let c=0;c<=u-r;c++){
  const guns=Array(count).fill(itemAtTier(baseId,tier)),utilities=[...Array(r).fill(itemAtTier('sustained-reactor',tier)),...Array(c).fill(itemAtTier('capacitor-bank',tier))];
  const fit=balanceFit(hull,guns,utilities);if(fit.cost>budget)continue;tested++;
  const continuous=firingTrace(fit,{duration:12}),pass=firingTrace(fit,{duration:24,passes:true});
  // Both defenses matter; an ion-only build cannot win by stripping shields.
  const a=Math.min(continuous.hullDamage,continuous.shieldDamage)/12,b=Math.min(pass.hullDamage,pass.shieldDamage)/24;
  if(!sustained||a>sustained.score)sustained={score:a,fit,trace:continuous};
  if(!passes||b>passes.score)passes={score:b,fit,trace:pass};
 }
 return {tested,sustained,passes};
}
