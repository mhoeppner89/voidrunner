import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIPS, LOCATIONS} from '../../src/game/data.js';
import {BASE_OUTFIT_ITEMS, HULL_HARDPOINTS} from '../../src/game/outfitting.js';
import {resolveEquipmentDefinition, NAMED_EQUIPMENT, TIER_CURVE, EQUIPMENT_RARITIES, equipmentRating} from '../../src/game/equipmentCatalog.js';
import {createEquipmentRecord, equipmentAction, specialEquipmentOffers, rollEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {createNewSave, hydrateSave} from '../../src/game/save.js';
import {balanceFit, firingTrace} from '../helpers/player-balance.mjs';
import {weaponForOutfit} from '../../src/game/weapons.js';

const def=(base,tier,rarity='common',affixes=[])=>resolveEquipmentDefinition(base,{id:'probe',baseId:base.id,tier,rarity,affixes});
test('every purchasable hull is twice its former price and the starter stays free',()=>{
 const former={wayfarer:0,vanguard:105000,scrapper:18000,demon:45000,mule:65000,talon:40000,prospector:35000,lancer:90000,atlas:110000,blade:120000,speedster:20000,legionary:50000,andromeda:55000,torsas:45000,astra:90000};
 assert.deepEqual(Object.keys(SHIPS).sort(),Object.keys(former).sort());
 for(const [id,price] of Object.entries(former))assert.equal(SHIPS[id].price,price*2,id);
});
test('each non-drone model gains a real primary benefit with tier and rarity',()=>{
 for(const base of Object.values(BASE_OUTFIT_ITEMS).filter(x=>x.category!=='drone')){
  const tier=base.tier??1, rank=x=>{
   if(['gun','launcher','turret'].includes(base.category))return x.modifiers.damage;
   if(base.id==='loot-collector')return x.effects.lootRange;
   // The model's own primary effect, not a bonus a legendary trait adds.
   const key=Object.keys(base.effects).find(k=>typeof base.effects[k]==='number'&&(k.endsWith('Multiplier')&&base.effects[k]>1||['shieldCapacity','hullCapacity','cargoCapacity','salvageRange','salvageRate'].includes(k)));
   assert.ok(key,base.id);return x.effects[key];
  };
  const common=def(base,tier),green=def(base,tier,'uncommon'),blue=def(base,tier,'rare'),purple=def(base,tier,'epic');
  assert.ok(rank(green)>rank(common),`${base.id} green`);assert.ok(rank(blue)>rank(green),`${base.id} blue`);assert.ok(rank(purple)>rank(blue),`${base.id} epic`);
  if(NAMED_EQUIPMENT[base.id])assert.ok(rank(def(base,tier,'named'))>=rank(purple),`${base.id} named`);
  if(tier<3){
   assert.ok(rank(def(base,tier+1))>rank(common),`${base.id} tier`);
   // A technology generation is worth more than a rarity step.
   if(base.id!=='loot-collector')assert.ok(rank(def(base,tier+1))/rank(common)>rank(purple)/rank(common)*.99,`${base.id} tier outweighs rarity`);
  }
 }
});
test('all hulls gain defenses and energy from matching fitted upgrades without flight penalties',()=>{
 for(const hull of Object.keys(HULL_HARDPOINTS)){
  const empty=balanceFit(hull), shield=balanceFit(hull,[],['shield-mk2']), armor=balanceFit(hull,[],['armor-mk2']), power=balanceFit(hull,[],['sustained-reactor']);
  assert.ok(shield.stats.shield>empty.stats.shield,hull);assert.ok(armor.stats.hull>empty.stats.hull,hull);assert.ok(power.stats.reactorOutput>empty.stats.reactorOutput,hull);
  for(const fit of [shield,armor,power]){assert.equal(fit.stats.maxSpeed,empty.stats.maxSpeed,hull);assert.equal(fit.stats.angularAcceleration,empty.stats.angularAcceleration,hull);}
 }
});
test('fully upgraded matching loadouts outperform bare hulls in sustained real-energy firing',()=>{
 for(const [hull,spec] of Object.entries(HULL_HARDPOINTS)){
  const tier=SHIPS[hull].tier,gun=createEquipmentRecord('pulse-cannon',{tier,rarity:'rare',affixes:['efficient','rapid']}),reactor=createEquipmentRecord('sustained-reactor',{tier,rarity:'rare',affixes:['tuned','compact']});
  const baseline=balanceFit(hull,Array(spec.weapons.length).fill('pulse-cannon'));
  const upgraded=balanceFit(hull,Array(spec.weapons.length).fill(gun.id),Array(spec.utility.length).fill(reactor.id));
  const before=firingTrace(baseline),after=firingTrace(upgraded);
  assert.ok(after.hullDamage>before.hullDamage,`${hull}: ${after.hullDamage} vs ${before.hullDamage}`);
  assert.ok(after.shieldDamage>before.shieldDamage,hull);
  assert.ok(upgraded.stats.reactorOutput>baseline.stats.reactorOutput,hull);
 }
});
test('matching higher-tier guns do not lose sustained damage to lower-tier versions',()=>{
 for(const [hull,spec] of Object.entries(HULL_HARDPOINTS)){
  const tier=SHIPS[hull].tier;if(tier<2)continue;
  for(const base of ['pulse-cannon','beam-emitter','gauss-cannon','ripper','ion-blaster','mortar']){
   const lower=createEquipmentRecord(base,{tier:tier-1}),higher=createEquipmentRecord(base,{tier});
   const before=firingTrace(balanceFit(hull,Array(spec.weapons.length).fill(lower.id)));
   const after=firingTrace(balanceFit(hull,Array(spec.weapons.length).fill(higher.id)));
   assert.ok(after.hullDamage>=before.hullDamage,`${hull} ${base}`);
  }
 }
});
test('above-tier equipment loads regeneration, matching tiers do not, and output stays usable',()=>{
 for(const hull of Object.keys(HULL_HARDPOINTS)){
  const base=SHIPS[hull],matching=createEquipmentRecord('pulse-cannon',{tier:base.tier}),fit=balanceFit(hull,[matching.id]);
  assert.equal(fit.stats.overTierLoad,0,hull);
  if(base.tier<3){const high=createEquipmentRecord('pulse-cannon',{tier:base.tier+1}),oversized=balanceFit(hull,[high.id]);assert.ok(oversized.stats.reactorOutput<fit.stats.reactorOutput,hull);assert.ok(oversized.stats.reactorOutput>=base.reactorOutput*.1,hull);assert.ok(weaponForOutfit(high.id).damageFlat>weaponForOutfit(matching.id).damageFlat,hull);}
 }
 const low=balanceFit('wayfarer',Array(3).fill('mortar'),Array(3).fill('sustained-reactor'));
 assert.ok(firingTrace(low).blocked>0,'small hull cannot sustain three heavy guns indefinitely');
});
test('oversized equipment imposes large cumulative loads, with a steeper two-tier jump',()=>{
 const tier1=createEquipmentRecord('pulse-cannon',{tier:1}),tier2=createEquipmentRecord('pulse-cannon',{tier:2}),tier3=createEquipmentRecord('pulse-cannon',{tier:3});
 const base=balanceFit('wayfarer',[tier1.id]).stats;
 for(const [guns,fraction,levels] of [[[tier2.id],.75,1],[[tier2.id,tier2.id],.5,2],[[tier3.id],.25,2],[[tier3.id,tier3.id],.1,4]]){
  const fit=balanceFit('wayfarer',guns).stats;
  assert.ok(Math.abs(fit.reactorOutput-base.reactorOutput*fraction)<1e-9);
  assert.equal(createEnemyLoadout({hullId:'wayfarer'},0,{guns}).stats.reactorOutput,fit.reactorOutput,'NPC and player fits pay the same load');
  assert.equal(fit.overTierLevels,levels);assert.ok(Math.abs(fit.overTierLoad-(base.reactorOutput-fit.reactorOutput))<1e-9);
  assert.equal(fit.energyCapacity,base.energyCapacity,'penalty affects supply, not capacitor size');
 }
 const fighter=balanceFit('talon',[tier2.id]).stats,over=balanceFit('talon',[tier3.id]).stats;
 assert.equal(fighter.overTierLoad,0);assert.equal(over.reactorOutput,fighter.reactorOutput*.75);
});
test('matching guns sustain more fire than oversized guns after the capacitor is spent',()=>{
 const guns=[1,2,3].map(tier=>createEquipmentRecord('beam-emitter',{tier}));
 const fits=guns.map(gun=>balanceFit('wayfarer',[gun.id,gun.id]));
 const traces=fits.map(fit=>firingTrace(fit,{duration:60}));
 assert.ok(traces[0].shots>traces[1].shots&&traces[1].shots>traces[2].shots);
 assert.ok(traces[0].hullDamage>traces[1].hullDamage&&traces[1].hullDamage>traces[2].hullDamage);
 for(let i=0;i<3;i++)assert.ok(Math.abs(weaponForOutfit(guns[i].id).energyCost-3.5*TIER_CURVE.energy[i])<1e-9,'shared per-shot cost stays independent of the hull');
});
test('oversized power modules also pay the load, while returning to matching gear removes it',()=>{
 const records=[1,2,3].map(tier=>createEquipmentRecord('sustained-reactor',{tier}));
 const fits=records.map(r=>balanceFit('wayfarer',[],[r.id]).stats);
 assert.equal(fits[0].overTierLoad,0);assert.ok(fits[0].reactorOutput>fits[1].reactorOutput&&fits[1].reactorOutput>fits[2].reactorOutput);
 const returned=balanceFit('wayfarer',[],[records[0].id]).stats;assert.deepEqual(returned,fits[0]);
});
test('ordinary rolls are mostly plain, and luck from danger and pilot rank shifts them toward better grades',()=>{
 const roll=luck=>{const counts={common:0,uncommon:0,rare:0,epic:0,named:0};let x=123456;
  const rng=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
  for(let i=0;i<10000;i++){const r=rollEquipmentRecord('beam-emitter',rng,1,`eq-roll-${i}`,{luck});counts[r.rarity]++;}return counts;};
 const base=roll(0),deep=roll(.85);
 // Drops stay scarce: dealers are the dependable source, colour is an event.
 assert.ok(base.common>8600&&base.common<9000,JSON.stringify(base));assert.ok(base.uncommon>780&&base.uncommon<1060,JSON.stringify(base));
 assert.ok(base.rare>160&&base.rare<290,JSON.stringify(base));assert.ok(base.epic>20&&base.epic<80,JSON.stringify(base));assert.ok(base.named<35,JSON.stringify(base));
 assert.ok(deep.common<base.common*.9&&deep.epic>base.epic*3&&deep.named>base.named*4,JSON.stringify(deep));
 // Hardware without a legendary design rolls epic instead.
 let y=7;const rng=()=>{y=(Math.imul(y,1664525)+1013904223)>>>0;return y/4294967296;};
 for(let i=0;i<4000;i++)assert.notEqual(rollEquipmentRecord('radar-mk2',rng,1,`eq-radar-${i}`,{luck:2}).rarity,'named');
 // A legendary you already own is unique: it rolls as epic instead.
 let z=11;const lucky=()=>{z=(Math.imul(z,1664525)+1013904223)>>>0;return z/4294967296;};const owned=new Set(['pulse-cannon']);
 for(let i=0;i<4000;i++)assert.notEqual(rollEquipmentRecord('pulse-cannon',lucky,1,`eq-unique-${i}`,{luck:3,owned}).rarity,'named');
});
test('signature colours follow the specialising affix or the legendary and reach the flight weapon',()=>{
 const base=BASE_OUTFIT_ITEMS['pulse-cannon'];
 assert.equal(def(base,1).signature,undefined);assert.equal(weaponForOutfit('pulse-cannon').tint,undefined);
 const two=resolveEquipmentDefinition(base,{id:'sig',baseId:base.id,tier:1,rarity:'rare',affixes:['disruptive','siphoning'],rolls:[.2,.9]});
 assert.equal(two.signature.id,'siphoning','the better-rolled specialisation wins');
 const plainAffix=resolveEquipmentDefinition(base,{id:'sig2',baseId:base.id,tier:1,rarity:'uncommon',affixes:['rapid'],rolls:[1]});assert.equal(plainAffix.signature,undefined);
 const named=createEquipmentRecord('gauss-cannon',{rarity:'named'});assert.equal(weaponForOutfit(named.id).tint,NAMED_EQUIPMENT['gauss-cannon'].signature);
});
test('rarity grades roll more and stronger affixes, and rating orders tier and rarity',()=>{
 const rng=()=>.5;
 for(const [rarity,count] of Object.entries({common:0,uncommon:1,rare:2,epic:3})){
  let n=0;const r=rollEquipmentRecord('pulse-cannon',()=>{n++;return rarity==='common'?.01:rarity==='uncommon'?.9:rarity==='rare'?.985:.996;},1,`eq-grade-${rarity}`);
  assert.equal(r.rarity,rarity);assert.equal(r.affixes.length,count);assert.equal(r.rolls?.length??0,count);
 }
 const base=BASE_OUTFIT_ITEMS['pulse-cannon'],low=resolveEquipmentDefinition(base,{id:'lo',baseId:base.id,tier:1,rarity:'rare',affixes:['overcharged'],rolls:[0]}),high=resolveEquipmentDefinition(base,{id:'hi',baseId:base.id,tier:1,rarity:'epic',affixes:['overcharged'],rolls:[0]});
 assert.ok(high.modifiers.damage>low.modifiers.damage,'better grades raise the roll floor');
 const ratings=[1,2,3].map(tier=>['common','uncommon','rare','epic','named'].map(rarity=>equipmentRating(def(base,tier,rarity))));
 for(const row of ratings)for(let i=1;i<row.length;i++)assert.ok(row[i]>row[i-1],JSON.stringify(ratings));
 for(let t=1;t<3;t++)assert.ok(ratings[t][0]>ratings[t-1][2],'a new generation outclasses last generation rares');
 assert.equal(equipmentRating(def(base,1)),100);
});
test('legendary traits change the hardware and better parts survive destruction more often',()=>{
 const named=id=>weaponForOutfit(createEquipmentRecord(id,{tier:1,rarity:'named'}).id);
 assert.equal(named('ripper').pellets,10);assert.equal(named('gauss-cannon').pierce,1);assert.equal(named('ion-blaster').jamSeconds,2);
 assert.equal(named('pulse-cannon').critEvery,4);assert.ok(named('beam-emitter').siphon>=.35);
 const plain=weaponForOutfit('mortar'),dawn=named('mortar');assert.ok(dawn.splashRadius>plain.splashRadius*1.5);
 const order=['common','uncommon','rare','epic','named'].map(r=>EQUIPMENT_RARITIES[r].survival);
 assert.ok(order[0]>=.15&&order[0]<=.18,'common parts survive at about the former rate');
 for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1]);assert.equal(order.at(-1),1);
});
test('special dealer offers are expensive, fixed within a rotation, bought once and persist across saves',()=>{
 let found;for(let seed=0;seed<100&&!found;seed++){
  const save=createNewSave(seed,{tutorial:false});save.player.dockedAt='helix';save.player.credits=1000000;
  const offers=specialEquipmentOffers(save.player,'helix',save.world);if(offers.length)found={save,offer:offers[0]};
 }
 assert.ok(found);const {save,offer}=found,p=save.player,common=def(BASE_OUTFIT_ITEMS[offer.baseId],offer.tier),special=def(BASE_OUTFIT_ITEMS[offer.baseId],offer.tier,offer.rarity,offer.affixes);
 assert.ok(special.price>=common.price*4);assert.deepEqual(specialEquipmentOffers(p,'helix',save.world)[0],offer);
 const before=p.credits,result=equipmentAction(p,'buy',{baseId:offer.baseId,tier:offer.tier,offerId:offer.offerId,world:save.world});
 assert.ok(result.ok,result.code);assert.equal(before-p.credits,special.price);assert.equal(p.inventory.items[result.id].rarity,offer.rarity);
 assert.equal(equipmentAction(p,'buy',{baseId:offer.baseId,tier:offer.tier,offerId:offer.offerId,world:save.world}).ok,false);
 const restored=hydrateSave(JSON.parse(JSON.stringify(save)));assert.equal(specialEquipmentOffers(restored.player,'helix',restored.world).some(o=>o.offerId===offer.offerId),false);
 assert.equal(equipmentAction(restored.player,'buy',{baseId:offer.baseId,tier:offer.tier,offerId:offer.offerId,world:{...restored.world,time:restored.world.time+1800}}).ok,false);
});
