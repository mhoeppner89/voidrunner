import test from 'node:test';
import assert from 'node:assert/strict';
import {GameUI} from '../../src/game/ui.js';
import {session} from '../helpers/session.mjs';
import {combatWreckNode,updateCombatLoot,recoverWreckEntry} from '../../src/game/careerLoot.js';
import {createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {BASE_OUTFIT_ITEMS,OUTFIT_ITEMS} from '../../src/game/outfitting.js';
import {equipmentName} from '../../src/game/equipmentCatalog.js';
import {setLanguage} from '../../src/game/i18n.js';

function uiFixture(){
 const ui=Object.create(GameUI.prototype),classes=new Set();
 const layout={classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}};
 const panel={hidden:true,innerHTML:'',style:{setProperty(k,v){this[k]=v;}},setAttribute(k,v){this[k]=v;}};
 Object.assign(ui,{save:{world:{time:10},player:{}},el:s=>s==='#space-pickup-receipt'?panel:layout});
 Object.defineProperty(ui,'isModalOpen',{get:()=>Boolean(ui.adventure)});
 return {ui,panel,classes};
}
test('pickup icons wait for dialogue, aggregate actual quantities and expire on simulation time',()=>{
 const {ui,panel,classes}=uiFixture();ui.adventure={};
 ui.queueSpacePickup({kind:'cargo',commodity:'electronics',quantity:2});ui.queueSpacePickup({kind:'cargo',commodity:'electronics',quantity:3});
 ui.updateSpacePickup();assert.equal(panel.hidden,true);assert.equal(ui.spacePickupReceipt,undefined);
 ui.adventure=undefined;ui.updateSpacePickup();assert.equal(panel.hidden,false);assert.match(panel.innerHTML,/data-commodity-icon="electronics"/);assert.match(panel.innerHTML,/>\+5</);assert.ok(classes.has('has-space-pickup'));
 ui.queueSpacePickup({kind:'cargo',commodity:'electronics',quantity:1});ui.updateSpacePickup();assert.match(panel.innerHTML,/>\+6</);
 ui.queueSpacePickup({kind:'cargo',commodity:'gold',quantity:2});ui.save.world.time+=6;ui.updateSpacePickup();assert.match(panel.innerHTML,/data-commodity-icon="gold"/);
 ui.save.world.time+=6;ui.updateSpacePickup();assert.equal(panel.hidden,true);assert.ok(!classes.has('has-space-pickup'));
});
test('equipment and drone receipts retain their actual icons and equipment rarity/tier marks',()=>{
 const {ui,panel}=uiFixture();const item=createEquipmentRecord('seeker-launcher',{tier:1,rarity:'uncommon'});
 ui.queueSpacePickup({kind:'equipment',item,quantity:1});ui.updateSpacePickup();assert.match(panel.innerHTML,/data-icon="seeker-launcher"/);assert.match(panel.innerHTML,/data-tier="1"/);assert.equal(panel.style['--item-color'],'#72df95');
 ui.queueSpacePickup({kind:'drone',type:'mining'});ui.save.world.time+=6;ui.updateSpacePickup();assert.match(panel.innerHTML,/data-icon="mining-drone"/);
});
test('raw salvage records resolve readable catalogue names for every equipment type and drone in both languages',()=>{
 for(const language of ['de','en']){
  setLanguage(language);
  for(const baseId of Object.keys(BASE_OUTFIT_ITEMS)){
   const {ui}=uiFixture(),item=createEquipmentRecord(baseId,{tier:2,rarity:'uncommon'});
   assert.equal(item.name,undefined,'the persisted record intentionally has no label');
   ui.queueSpacePickup({kind:'equipment',item});
   const receipt=ui.spacePickupQueue[0];assert.ok(receipt,baseId);
   assert.equal(receipt.name,equipmentName(OUTFIT_ITEMS[item.id]),baseId);assert.doesNotMatch(receipt.name,/undefined|\[object Object\]/);
  }
  for(const type of ['mining','pdc','repair']){const {ui}=uiFixture();ui.queueSpacePickup({kind:'drone',type});assert.equal(ui.spacePickupQueue[0].name,equipmentName(OUTFIT_ITEMS[type+'-drone']));}
 }
 setLanguage('de');
});
test('space salvage reports only transferred cargo, preserving full/partial holds and other loot types',()=>{
 const s=session(),received=[];delete s.arena;s.save.player.position=[0,0,0];s.save.player.prevPosition=undefined;
 s.ui.queueSpacePickup=e=>received.push(e);s.lineBlocked=()=>false;s.setOwnMonitorStatus=()=>{};s.persistSave=()=>{};
 const item=createEquipmentRecord('seeker-launcher',{tier:1,rarity:'uncommon'});
 const record={id:'wreck-receipt',systemId:s.save.player.systemId,position:[0,0,0],radius:3,contents:[{id:'cargo-ore',kind:'cargo',commodity:'ore',quantity:2},{id:item.id,kind:'equipment',item}]};
 s.save.world.combatWrecks={[record.id]:record};s.wreckNodes=[combatWreckNode(record)];
 s.save.player.cargo={ore:100000};updateCombatLoot(s);assert.equal(received.length,0);
 s.save.player.cargo={};s.save.world.time++;assert.ok(recoverWreckEntry(s,record.id,'cargo-ore').ok);assert.equal(received[0].quantity,1);assert.equal(record.contents[0].quantity,1);
 updateCombatLoot(s);assert.deepEqual(received.map(e=>[e.kind,e.quantity]),[['cargo',1],['cargo',1],['equipment',1]]);
});
