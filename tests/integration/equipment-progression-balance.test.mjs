import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIPS, LOCATIONS} from '../../src/game/data.js';
import {BASE_OUTFIT_ITEMS, HULL_HARDPOINTS} from '../../src/game/outfitting.js';
import {resolveEquipmentDefinition, NAMED_EQUIPMENT} from '../../src/game/equipmentCatalog.js';
import {createEquipmentRecord, equipmentAction, specialEquipmentOffers, rollEquipmentRecord} from '../../src/game/equipmentInventory.js';
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
   const effect=Object.entries(x.effects).find(([k,v])=>typeof v==='number'&&(k.endsWith('Multiplier')&&v>1||['shieldCapacity','hullCapacity','cargoCapacity','salvageRange','salvageRate'].includes(k)));
   assert.ok(effect,base.id);return effect[1];
  };
  const common=def(base,tier),green=def(base,tier,'uncommon'),blue=def(base,tier,'rare');
  assert.ok(rank(green)>rank(common),`${base.id} green`);assert.ok(rank(blue)>rank(green),`${base.id} blue`);
  if(NAMED_EQUIPMENT[base.id])assert.ok(rank(def(base,tier,'named'))>rank(blue),`${base.id} named`);
  if(tier<3)assert.ok(rank(def(base,tier+1))>rank(common),`${base.id} tier`);
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
  if(base.tier<3){const high=createEquipmentRecord('pulse-cannon',{tier:base.tier+1}),oversized=balanceFit(hull,[high.id]);assert.ok(oversized.stats.reactorOutput<fit.stats.reactorOutput,hull);assert.ok(oversized.stats.reactorOutput>=base.reactorOutput*.35,hull);assert.ok(weaponForOutfit(high.id).damageFlat>weaponForOutfit(matching.id).damageFlat,hull);}
 }
 const low=balanceFit('wayfarer',Array(3).fill('mortar'),Array(3).fill('sustained-reactor'));
 assert.ok(firingTrace(low).blocked>0,'small hull cannot sustain three heavy guns indefinitely');
});
test('colored equipment is rare in ordinary rolls while the named tutorial drop remains explicit',()=>{
 const counts={common:0,uncommon:0,rare:0,named:0};let x=123456;
 const rng=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
 for(let i=0;i<10000;i++){const r=rollEquipmentRecord('beam-emitter',rng,1,`eq-roll-${i}`);counts[r.rarity]++;}
 assert.ok(counts.common>8600,JSON.stringify(counts));assert.ok(counts.uncommon>700&&counts.uncommon<1200,JSON.stringify(counts));assert.ok(counts.rare>150&&counts.rare<300,JSON.stringify(counts));assert.ok(counts.named<50,JSON.stringify(counts));
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
