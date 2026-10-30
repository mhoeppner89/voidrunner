import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {combatWreckNode,lootInReach} from '../../src/game/careerLoot.js';
import {equipmentAction,createEquipmentRecord,refreshInventoryProjection} from '../../src/game/equipmentInventory.js';
import {OUTFIT_ITEMS} from '../../src/game/outfitting.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {cargoFree} from '../../src/game/economy.js';
import {hydrateSave} from '../../src/game/save.js';
import {equipmentEffectStats} from '../../src/game/equipmentStatPresentation.js';
import {equipmentName} from '../../src/game/equipmentCatalog.js';
import {setLanguage} from '../../src/game/i18n.js';

const fixture=()=>{const f=tutorialFixture('earn-standing');f.save.player.dockedAt=undefined;f.save.player.position.splice(0,3,0,0,0);f.save.player.prevPosition=new Float64Array(3);f.session.activeInstanceId=undefined;f.session.wreckNodes=[];f.save.world.combatWrecks={};return f;};
function drop(f,position,contents){
 const id=`wreck-collection-${Object.keys(f.save.world.combatWrecks).length}`;
 const item=createEquipmentRecord('seeker-launcher',{tier:1,rarity:'uncommon',affixes:['efficient']});
 const wreck={id,systemId:f.save.player.systemId,position:[...position],contents:contents??[{id:item.id,kind:'equipment',item}],radius:35,scanned:false};
 f.save.world.combatWrecks[id]=wreck;f.session.wreckNodes.push(combatWreckNode(wreck));return wreck;
}
function install(f,tier=1,slot='wayfarer-utility-0'){
 const p=f.save.player;p.dockedAt='rook';p.credits=100000;
 const result=equipmentAction(p,'buy',{baseId:'loot-collector',tier});assert.ok(result.ok,result.code);
 assert.ok(equipmentAction(p,'install',{id:result.id,mountId:slot}).ok);p.dockedAt=undefined;f.session._statsDirty=true;return result.id;
}
function tick(f){f.save.world.time+=1/60;f.session.updatePickups(1/60);}
test('existing and newly purchased collectors use the tractor-beam name in both languages',()=>{
 const f=fixture(),id=install(f,2),saved=hydrateSave(JSON.parse(JSON.stringify(f.save)));
 refreshInventoryProjection(saved.player);
 for(const [lang,name] of [['de','Traktorstrahl'],['en','Tractor Beam']]){
  setLanguage(lang);assert.match(equipmentName(OUTFIT_ITEMS[id]),new RegExp(`^${name}\\s+II`));
  assert.equal(saved.player.inventory.items[id].baseId,'loot-collector');
 }
 setLanguage('en');
});
test('fast fly-over collects an unselected, unscanned crate with exact item identity once',()=>{
 const f=fixture(),w=drop(f,[0,0,0]),entry=w.contents[0];f.save.player.prevPosition.set([-20,0,0]);f.save.player.position.splice(0,3,20,0,0);f.save.player.mode='combat';
 tick(f);const item=f.save.player.inventory.items[entry.id];assert.equal(item.rarity,'uncommon');assert.equal(item.baseId,'seeker-launcher');assert.deepEqual(item.affixes,['efficient']);assert.equal(item.location.kind,'cargo');assert.equal(f.save.world.combatWrecks[w.id],undefined);
 const count=Object.keys(f.save.player.inventory.items).length;tick(f);assert.equal(Object.keys(f.save.player.inventory.items).length,count);
 const restored=hydrateSave(JSON.parse(JSON.stringify(f.save)));assert.equal(restored.world.combatWrecks[w.id],undefined);assert.deepEqual(restored.player.inventory.items[entry.id],item);
});
test('fly-over also collects loose cargo at speed while keeping other drops stationary',()=>{
 const f=fixture(),p=f.session.spawnPickup('ore',[0,0,0],'combat');f.session.pickupStore.setPos(p.slot,0,0,0);f.save.player.prevPosition.set([-20,0,0]);f.save.player.position.splice(0,3,20,0,0);
 tick(f);assert.equal(f.save.player.cargo.ore,1);assert.equal(p.life,0);
});
test('flying near a drop or holding salvage does not grant free remote collection',()=>{
 const f=fixture(),w=drop(f,[60,0,0]);f.save.player.mode='salvage';f.session.utilityActive=true;for(let i=0;i<60;i++)tick(f);
 assert.ok(f.save.world.combatWrecks[w.id]);assert.equal(lootInReach(f.session,[60,0,0]),false);
});
for(const tier of [1,2,3])test(`collector tier ${tier} uses its exact range for cargo and equipment`,()=>{
 const f=fixture(),id=install(f,tier),range=[150,200,250][tier-1],w=drop(f,[range+.01,0,0]);
 assert.equal(f.session.playerStats().lootRange,range);assert.equal(OUTFIT_ITEMS[id].effects.lootRange,range);
 tick(f);assert.ok(f.save.world.combatWrecks[w.id]);w.position[0]=range;f.session.wreckNodes[0].position[0]=range;
 const p=f.session.spawnPickup('ore',[0,0,0],'combat');f.session.pickupStore.setPos(p.slot,0,range,0);tick(f);
 assert.equal(f.save.world.combatWrecks[w.id],undefined);assert.equal(p.life,0);assert.equal(f.save.player.cargo.ore,1);
});
test('tiers, rarity, storage, removal and sale respect the real fitted module',()=>{
 const f=fixture(),id=install(f,1);const p=f.save.player;
 const bonus=createEquipmentRecord('loot-collector',{tier:3,rarity:'rare',affixes:['tuned','compact'],location:{kind:'station',stationId:'rook'}});p.inventory.items[bonus.id]=bonus;refreshInventoryProjection(p);
 assert.equal(OUTFIT_ITEMS[bonus.id].effects.lootRange,275);assert.equal(getEffectiveShipStats(p).lootRange,150,'stored equipment has no effect');
 p.dockedAt='rook';assert.ok(equipmentAction(p,'install',{id:bonus.id,mountId:'wayfarer-utility-1'}).ok);assert.equal(getEffectiveShipStats(p).lootRange,275,'ranges never add');
 assert.ok(equipmentAction(p,'remove',{id:bonus.id}).ok);assert.equal(getEffectiveShipStats(p).lootRange,150);
 assert.ok(equipmentAction(p,'remove',{id}).ok);assert.equal(getEffectiveShipStats(p).lootRange,0);
 assert.ok(equipmentAction(p,'sell',{id}).ok);assert.equal(p.inventory.items[id],undefined);
 const row=equipmentEffectStats(OUTFIT_ITEMS[bonus.id]).find(r=>r.key==='lootRange');assert.equal(row.value,275);assert.equal(row.unit,' km');
});
test('a blocked beam collects neither equipment nor loose cargo; clear sight enables both',()=>{
 const f=fixture();install(f);const w=drop(f,[100,0,0]),p=f.session.spawnPickup('ore',[100,0,0],'combat');f.session.lineBlocked=()=>true;tick(f);assert.ok(f.save.world.combatWrecks[w.id]);assert.ok(p.life>0);
 f.session.lineBlocked=()=>false;tick(f);assert.equal(f.save.world.combatWrecks[w.id],undefined);assert.equal(p.life,0);
});
test('full holds leave loot intact, while partial cargo stacks transfer only what fits',()=>{
 const f=fixture();install(f);const w=drop(f,[100,0,0]);f.save.player.cargo.ore=1000;tick(f);assert.ok(f.save.world.combatWrecks[w.id]);
 f.save.player.cargo.ore=0;f.save.world.time+=1;tick(f);assert.equal(f.save.world.combatWrecks[w.id],undefined);
 const free=Math.floor(cargoFree(f.save.player));f.save.player.cargo.ore=free-3;
 const cargo=drop(f,[100,0,0],[{id:'cargo-stack',kind:'cargo',commodity:'ore',quantity:10}]);tick(f);assert.equal(cargo.contents[0].quantity,7);assert.equal(cargoFree(f.save.player),0);
});
test('reserved mining cargo space cannot be consumed by automatic equipment collection',()=>{
 const f=fixture();install(f);const p=f.save.player,unit=Object.values(p.droneFleet.unitsById)[0];unit.payload={commodityId:'ore',units:2,unitMass:1};unit.state='returning';
 const free=cargoFree(p);p.cargo.ore=free-2;const w=drop(f,[100,0,0]);tick(f);assert.ok(f.save.world.combatWrecks[w.id]);assert.equal(cargoFree(p),2);
});
test('collection skips hyperdrive, docking, foreign systems and teleport sweeps',()=>{
 const f=fixture();install(f);const w=drop(f,[100,0,0]);for(const key of ['autopilot','playerDocking','galaxyJump']){f.session[key]=true;tick(f);assert.ok(f.save.world.combatWrecks[w.id]);f.session[key]=false;}
 f.save.player.dockedAt='helix';tick(f);assert.ok(f.save.world.combatWrecks[w.id]);f.save.player.dockedAt=undefined;
 w.systemId='meridian';tick(f);assert.ok(f.save.world.combatWrecks[w.id]);
 const g=fixture();const untouched=drop(g,[0,0,0]);g.save.player.prevPosition.set([-1000,0,0]);g.save.player.position.splice(0,3,1000,0,0);tick(g);assert.ok(g.save.world.combatWrecks[untouched.id]);
});
test('ejected equipment and cargo observe their eight-second delay, including reloads',()=>{
 const f=fixture(),id=install(f),p=f.save.player;p.dockedAt='rook';const buy=equipmentAction(p,'buy',{baseId:'pulse-cannon'});assert.ok(equipmentAction(p,'carry',{id:buy.id}).ok);p.dockedAt=undefined;
 assert.ok(f.session.inventoryCommand('jettison',{id:buy.id}).ok);const w=f.save.world.combatWrecks[`wreck-${buy.id}`];assert.equal(w.collectAfter,f.save.world.time+8);tick(f);assert.ok(f.save.world.combatWrecks[w.id]);assert.equal(p.inventory.items[buy.id],undefined);
 const restored=hydrateSave(JSON.parse(JSON.stringify(f.save)));assert.equal(restored.world.combatWrecks[w.id].collectAfter,w.collectAfter);assert.ok(restored.player.inventory.items[id]);
 f.save.world.time=w.collectAfter;tick(f);assert.equal(f.save.world.combatWrecks[w.id],undefined);assert.equal(p.inventory.items[buy.id].location.kind,'cargo');
});

test('loot target distance matches collection range even for drops from capital ships',()=>{
 const f=fixture(),w=drop(f,[150,0,0]);f.save.player.currentTargetId=w.id;
 const ref=f.session.getTargetRef();assert.equal(ref.combatLoot,true);assert.equal(f.session.surfaceDistance(f.session.tmpP0.set(0,0,0),ref),150);
});
