import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSave} from '../../src/game/save.js';
import {renderEquipmentInventory} from '../../src/game/equipmentUi.js';
import {cargoMass,cargoCapacity} from '../../src/game/economy.js';
import {createEquipmentRecord,receiveEquipment} from '../../src/game/equipmentInventory.js';
const meter=markup=>Object.fromEntries([...markup.matchAll(/aria-value(min|max|now)="([^"]+)"/g)].map(m=>[m[1],Number(m[2])]));
test('cargo view exposes actual used/total mass in empty, mixed and full holds',()=>{
 const save=createNewSave(175,{tutorial:false}),p=save.player;delete p.dockedAt;p.cargo={};
 const ui={save,inventoryTab:'cargo'};
 const check=()=>{const markup=renderEquipmentInventory(ui,{embedded:true}),mass=cargoMass(p),capacity=cargoCapacity(p);assert.deepEqual(meter(markup),{min:0,max:capacity,now:Math.min(mass,capacity)});assert.match(markup,/inventory-cargo-usage/);return markup;};
 check();p.cargo={ore:3,gold:1};p.sealedCargo=[{label:'Test shipment',units:2}];assert.ok(receiveEquipment(p,createEquipmentRecord('shield-mk2')).ok);check();
 p.cargo={food:100000};const full=check();assert.match(full,/inventory-cargo-usage is-full/);assert.match(full,/width:100%/);
});
test('cargo usage remains visible in equipment detail; storage has no misleading cargo header',()=>{
 const save=createNewSave(175,{tutorial:false}),p=save.player,item=createEquipmentRecord('shield-mk2');assert.ok(receiveEquipment(p,item).ok);
 const ui={save,inventoryTab:'cargo',inventoryItemId:item.id};assert.match(renderEquipmentInventory(ui,{embedded:true}),/inventory-cargo-usage/);
 ui.inventoryTab='storage';assert.doesNotMatch(renderEquipmentInventory(ui),/inventory-cargo-usage/);
});
