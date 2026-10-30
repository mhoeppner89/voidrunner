import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIPS} from '../../src/game/data.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,normalizeOutfitting,installedItemIds} from '../../src/game/outfitting.js';
import {getEffectiveShipStats,stackedMultiplier} from '../../src/game/shipStats.js';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {weaponForOutfit} from '../../src/game/weapons.js';
import {regenerateCombatResources,spendEnergy} from '../../src/game/combatResources.js';
import {activationWeaponDamage} from '../../src/game/weaponDamage.js';
import {balanceFit,itemAtTier,firingTrace} from '../helpers/player-balance.mjs';
test('all flyable base capacities are multiples of five and regeneration uses whole numbers',()=>{
 for(const id of Object.keys(HULL_HARDPOINTS)){const s=SHIPS[id];for(const k of ['hull','shield','energyCapacity'])assert.equal(s[k]%5,0,`${id}: ${k}`);for(const k of ['reactorOutput','shieldRegen'])assert.ok(Number.isInteger(s[k])&&s[k]>0,`${id}: ${k}`);}
});
test('module stacking is bounded, order independent and gives progressively smaller gains',()=>{
 const values=[1.3,1.42,.9,1.15,.88];assert.equal(stackedMultiplier(values),stackedMultiplier(values.toReversed()));
 const one=stackedMultiplier([1.3]),two=stackedMultiplier([1.3,1.3]),three=stackedMultiplier([1.3,1.3,1.3]);assert.ok(one-1>two-one&&two-one>three-two);assert.ok(stackedMultiplier(Array(30).fill(1.3))<1.6);
 const strong=itemAtTier('sustained-reactor',3),weak='sustained-reactor',a=balanceFit('wayfarer',[],[weak,strong,'capacitor-bank']),b=balanceFit('wayfarer',[],['capacitor-bank',strong,weak]);assert.equal(a.stats.reactorOutput,b.stats.reactorOutput);assert.equal(a.stats.energyCapacity,b.stats.energyCapacity);
});
test('starter reactor stacks cannot sustain a full heavy battery or equal elite power systems',()=>{
 for(const tier of [1,3]){
  const fit=balanceFit('wayfarer',Array(3).fill(itemAtTier('mortar',tier)),Array(3).fill(itemAtTier('sustained-reactor',tier))),trace=firingTrace(fit);
  assert.ok(fit.stats.reactorOutput<20);assert.ok(fit.stats.reactorOutput<SHIPS.blade.reactorOutput*.6);assert.ok(trace.blocked>0);assert.equal(fit.stats.maxSpeed,SHIPS.wayfarer.maxSpeed);
 }
 assert.ok(HULL_HARDPOINTS.wayfarer.utility.length<HULL_HARDPOINTS.astra.utility.length);
});
test('capital weapons demand meaningful capacitor energy and base/loot equipment has identical mass',()=>{
 for(const id of ['frigate-battery','cruiser-battery'])assert.equal(OUTFIT_ITEMS[id].energyCost,weaponForOutfit(id).energyCost);
 assert.ok(weaponForOutfit('frigate-battery').energyCost>=40);assert.ok(weaponForOutfit('cruiser-battery').energyCost>SHIPS.wayfarer.energyCapacity);
 for(const baseId of ['gauss-cannon','mortar','sustained-reactor']){const r=createEquipmentRecord(baseId);assert.equal(OUTFIT_ITEMS[r.id].mass,OUTFIT_ITEMS[baseId].mass);}
});
test('hull-specific shield regeneration is shared by player and NPC and spends reactor energy',()=>{
 for(const hull of Object.keys(HULL_HARDPOINTS)){
  const fit=balanceFit(hull,['beam-emitter'],['sustained-reactor']),npc=createEnemyLoadout({hullId:hull},0,{guns:fit.guns,utilities:fit.utilities});assert.equal(npc.stats.shieldRegeneration,fit.stats.shieldRegeneration);assert.equal(npc.stats.reactorOutput,fit.stats.reactorOutput);
  const p={energy:0,shield:0};const tick=regenerateCombatResources(p,fit.stats,1,0);assert.equal(tick.shieldRestored,fit.stats.shieldRegeneration);assert.ok(p.energy<fit.stats.reactorOutput);
 }
 const fit=balanceFit('wayfarer',['pulse-cannon','pulse-cannon'],['sustained-reactor']);assert.ok(firingTrace(fit,{recharging:true}).energySpent<firingTrace(fit).energySpent);
});
test('healthy fighters survive one coordinated ordinary gun pass without an extra burst reserve',()=>{
 const attacker=balanceFit('scrapper',Array(4).fill('pulse-cannon'));
 for(const hull of ['speedster','scrapper','talon','legionary','blade']){
  const stats=SHIPS[hull],victim={shield:stats.shield,hull:stats.hull};const actors=Array.from({length:2},()=>({energy:attacker.stats.energyCapacity,shield:attacker.stats.shield})),ready=actors.map(()=>Array(4).fill(0));const w=weaponForOutfit('pulse-cannon');
  for(let tick=0;tick<144;tick++)for(let a=0;a<actors.length;a++){
   const now=tick/60;for(let g=0;g<4;g++)if(now>=ready[a][g]&&spendEnergy(actors[a],w.energyCost)){ready[a][g]=now+w.cooldown;const hit=activationWeaponDamage(victim,stats.shield,w.damageFlat,w,now);victim.shield-=hit.shield;victim.hull-=hit.hull;}
   regenerateCombatResources(actors[a],attacker.stats,1/60,0);
  }
  assert.ok(victim.hull>0,hull);assert.ok(victim.shield<stats.shield,hull);
 }
});
test('shrinking schema-4 mounts preserves every physical loot ID once, docked and in flight',()=>{
 for(const docked of [true,false]){
  const save=createNewSave(62),p=save.player,fit=p.outfitting.loadouts.wayfarer;if(!docked)p.dockedAt=undefined;p.outfitting.schema=4;
  const ids=[];for(let i=0;i<5;i++){const record=createEquipmentRecord('sustained-reactor',{tier:i%3+1,rarity:'rare',affixes:['tuned'],location:{kind:'installed',shipId:'wayfarer',mountId:`wayfarer-utility-${i}`}});p.inventory.items[record.id]=record;fit.utility[i]=record.id;ids.push(record.id);}
  const a=hydrateSave(JSON.parse(JSON.stringify(save))),b=hydrateSave(JSON.parse(JSON.stringify(a)));assert.deepEqual(Object.keys(a.player.inventory.items).sort(),Object.keys(b.player.inventory.items).sort());
  for(const s of [a,b]){assert.equal(s.player.outfitting.loadouts.wayfarer.utility.length,3);for(const id of ids)assert.ok(s.player.inventory.items[id]);for(const id of ids.slice(3))assert.equal(s.player.inventory.items[id].location.kind,docked?'station':'cargo');}
 }
});
test('counted legacy duplicate modules are returned to the locker without duplication',()=>{
 const p={shipId:'wayfarer',ownedShips:['wayfarer'],outfitting:{schema:4,locker:{},loadouts:{wayfarer:{mountSchema:4,utility:Array(5).fill('sustained-reactor')}}}};normalizeOutfitting(p);assert.equal(p.outfitting.locker['sustained-reactor'],2);assert.equal(installedItemIds(p).filter(id=>id==='sustained-reactor').length,3);normalizeOutfitting(p);assert.equal(p.outfitting.locker['sustained-reactor'],2);
});
