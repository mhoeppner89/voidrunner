import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {equipmentAction,inventoryMounts,mountItemId,normalizeEquipmentInventory,refreshInventoryProjection} from '../../src/game/equipmentInventory.js';
import {createDroneUnit,droneInventoryId,DRONE_TYPES,DRONE_BAY_LAYOUTS} from '../../src/game/droneData.js';
import {droneDock} from '../../src/game/fleetEquipmentData.js';
import {cargoMass} from '../../src/game/economy.js';
import {playerStrengthValue} from '../../src/game/playerStrength.js';
import {createDroneFleet} from '../../src/game/droneData.js';
import {startMining,reserveMiningJob,transitionMinerUnit,advanceMiningCut,miningReservedMass,deliverMiningPayload} from '../../src/game/droneMining.js';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {asteroidCollisionRadius} from '../../src/game/worldData.js';
const slot='wayfarer-drone-1';

test('new careers have two ordinary lasers, one miner and an empty launcher seat',()=>{
 for(const tutorial of [false,true]){
  const s=createNewSave(918,{tutorial}),p=s.player,fit=p.outfitting.loadouts.wayfarer;
  assert.ok(fit.launchers.every(id=>id===null));assert.equal(p.missiles,0);
  assert.equal(Object.values(p.inventory.items).filter(i=>i.baseId==='seeker-launcher').length,0);
  assert.equal(Object.values(p.inventory.items).filter(i=>i.baseId==='beam-emitter'&&!i.factory).length,2);
  assert.equal(fit.droneBays[0].unitIds.length,1);assert.equal(cargoMass(p),0);
  const restored=hydrateSave(s);assert.deepEqual(restored.player.outfitting.loadouts.wayfarer.launchers,fit.launchers);
 }
});
test('ordinary lasers sell only while another installed ammo-free weapon remains',()=>{
 const p=createNewSave(919).player,lasers=p.outfitting.loadouts.wayfarer.guns.filter(Boolean);
 assert.ok(equipmentAction(p,'remove',{id:lasers[0]}).ok);assert.ok(equipmentAction(p,'sell',{id:lasers[0]}).ok);
 assert.ok(equipmentAction(p,'remove',{id:lasers[1]}).ok);
 const b=equipmentAction(p,'buy',{baseId:'torpedo-launcher',stationId:'helix'});assert.equal(b.ok,false,'restricted shop stock still applies');
 const missile=equipmentAction(p,'buy',{baseId:'seeker-launcher'});assert.ok(equipmentAction(p,'install',{id:missile.id,mountId:'wayfarer-weapon-0'}).ok);
 const before=p.credits;assert.equal(equipmentAction(p,'sell',{id:lasers[1]}).ok,false);assert.equal(p.credits,before);
 const gun=equipmentAction(p,'buy',{baseId:'pulse-cannon'});assert.ok(equipmentAction(p,'install',{id:gun.id,mountId:'wayfarer-weapon-1'}).ok);
 assert.ok(equipmentAction(p,'sell',{id:lasers[1]}).ok);
});
test('drones buy, replace, store and sell through ordinary equipment without duplicate ownership',()=>{
 const p=createNewSave(920).player,mounts=inventoryMounts(p.shipId),fit=p.outfitting.loadouts.wayfarer,miner=mountItemId(fit,mounts.at(-1));
 assert.equal(mounts.at(-1).mount.id,slot);assert.equal(mounts.at(-2).key,'utility');assert.equal(mounts.at(-2).index,2);
 const value=playerStrengthValue(p),buy=equipmentAction(p,'buy',{baseId:'pdc-drone'});assert.ok(buy.ok);assert.equal(playerStrengthValue(p)-value,750,'drone investment counts once under the existing equipment plus half-cash formula');assert.equal(p.inventory.items[buy.id].location.kind,'station');assert.equal(cargoMass(p),0);
 assert.ok(equipmentAction(p,'install',{id:buy.id,mountId:slot}).ok);assert.equal(p.outfitting.loadouts.wayfarer.droneBays[0].mode,'pdc');
 assert.equal(p.inventory.items[miner].location.kind,'cargo');assert.equal(cargoMass(p),1);
 const id=p.inventory.items[buy.id].droneUnitId;p.droneFleet.unitsById[id].hull=17;
 for(let i=0;i<3;i++)normalizeEquipmentInventory(p);assert.equal(p.droneFleet.unitsById[id].hull,17);assert.equal(Object.keys(p.droneFleet.unitsById).length,2);
 assert.ok(equipmentAction(p,'remove',{id:buy.id}).ok);assert.ok(equipmentAction(p,'sell',{id:buy.id}).ok);
 assert.equal(p.droneFleet.unitsById[id],undefined);assert.equal(p.inventory.items[buy.id],undefined);
 assert.ok(equipmentAction(p,'install',{id:miner,mountId:slot}).ok);assert.equal(cargoMass(p),0);
});
test('old two-miner saves retain the second drone and single-unit payload through repeated reloads',()=>{
 const s=createNewSave(921),p=s.player,bay=p.outfitting.loadouts.wayfarer.droneBays[0],extra=createDroneUnit('drone-unit-2');extra.hull=9;
 p.droneFleet.unitsById[extra.id]=extra;p.droneFleet.nextUnitId=3;bay.unitIds.push(extra.id);
 const original=JSON.stringify(s),a=hydrateSave(s),b=hydrateSave(a);
 assert.equal(JSON.stringify(s),original);assert.equal(a.player.outfitting.loadouts.wayfarer.droneBays[0].unitIds.length,1);
 assert.ok(a.player.droneFleet.lockerIds.includes(extra.id));assert.equal(a.player.droneFleet.unitsById[extra.id].hull,9);assert.equal(cargoMass(a.player),1);
 assert.deepEqual(b.player.droneFleet,a.player.droneFleet);assert.deepEqual(b.player.inventory,a.player.inventory);
});
test('drone storage stays at its station and destroyed units never become ghost inventory',()=>{
 const p=createNewSave(922).player,buy=equipmentAction(p,'buy',{baseId:'repair-drone'}),id=p.inventory.items[buy.id].droneUnitId;
 p.dockedAt='vesper';assert.equal(equipmentAction(p,'install',{id:buy.id,mountId:slot}).ok,false);assert.equal(cargoMass(p),0);
 p.dockedAt='helix';assert.ok(equipmentAction(p,'install',{id:buy.id,mountId:slot}).ok);
 p.droneFleet.unitsById[id].hull=0;p.droneFleet.unitsById[id].state='destroyed';p.outfitting.loadouts.wayfarer.droneBays[0].unitIds=[null];refreshInventoryProjection(p);
 assert.equal(p.inventory.items[buy.id],undefined);
});
test('jettisoning and salvaging a drone preserves its damage without duplicating ownership',()=>{
 const {session:r,save}=tutorialFixture('earn-standing'),p=save.player,buy=equipmentAction(p,'buy',{baseId:'repair-drone'});
 assert.ok(equipmentAction(p,'carry',{id:buy.id}).ok);const unitId=p.inventory.items[buy.id].droneUnitId;p.droneFleet.unitsById[unitId].hull=11;p.dockedAt=undefined;
 assert.ok(r.inventoryCommand('jettison',{id:buy.id}).ok);assert.equal(p.inventory.items[buy.id],undefined);assert.equal(p.droneFleet.unitsById[unitId],undefined);
 const wreck=save.world.combatWrecks[`wreck-${buy.id}`];assert.equal(wreck.contents.length,1);assert.equal(wreck.contents[0].kind,'drone');assert.equal(wreck.contents[0].hull,11);
 save.world.time=wreck.collectAfter; p.position.splice(0,3,...wreck.position);
 assert.ok(r.inventoryCommand('recover',{wreckId:wreck.id,id:buy.id}).ok);
 const recovered=Object.values(p.droneFleet.unitsById).filter(u=>u.type==='repair');assert.equal(recovered.length,1);assert.equal(recovered[0].hull,11);
 assert.equal(Object.values(p.inventory.items).filter(i=>i.baseId==='repair-drone').length,1);assert.equal(cargoMass(p),1);
 assert.equal(r.inventoryCommand('recover',{wreckId:wreck.id,id:buy.id}).ok,false);
});
test('one miner delivers two units per trip and retains safe partial loads at the boundary',()=>{
 const fleet=createDroneFleet(),id='miner';fleet.unitsById[id]=createDroneUnit(id);
 const c={unitIds:[id],targetNodeKey:'test:ore',deposit:{remaining:3},scanned:true,distance:10,commodityId:'ore',unitMass:1,cargoMass:0,cargoCapacity:2,cargo:{}};
 assert.ok(startMining(fleet,c).ok);assert.equal(reserveMiningJob(fleet,id,c).units,2);assert.equal(miningReservedMass(fleet),2);
 transitionMinerUnit(fleet,id,'outbound');transitionMinerUnit(fleet,id,'mining');const cut=advanceMiningCut(fleet,id,DRONE_TYPES.mining.cutSecondsPerUnit,c);
 assert.equal(cut.units,2);assert.equal(c.deposit.remaining,1);transitionMinerUnit(fleet,id,'docking');assert.equal(deliverMiningPayload(fleet,id,c).units,2);assert.equal(c.cargo.ore,2);
 assert.equal(deliverMiningPayload(fleet,id,c).ok,false);transitionMinerUnit(fleet,id,'stowed');
 c.cargoMass=1;assert.equal(reserveMiningJob(fleet,id,c).units,1);assert.equal(miningReservedMass(fleet),1);
});
test('every drone role uses the same physical docking mouth on every supported hull',()=>{
 for(const [hull,bays]of Object.entries(DRONE_BAY_LAYOUTS))for(let i=0;i<bays.length;i++){
  const port=droneDock(hull,'pdc',i);assert.ok(port,hull);assert.equal(droneDock(hull,'mining',i),port);assert.equal(droneDock(hull,'repair',i),port);
 }
});
test('normal in-flight equipment swaps recall the working miner and deliver ore before PDC deployment',()=>{
 const {session:r,save}=tutorialFixture('earn-standing'),p=save.player,buy=equipmentAction(p,'buy',{baseId:'pdc-drone'});
 assert.ok(equipmentAction(p,'carry',{id:buy.id}).ok);p.dockedAt=undefined;const node=r.asteroids[0];p.position=[...node.position];p.position[2]+=asteroidCollisionRadius(node)+35;p.velocity.fill(0);p.throttle=0;p.currentTargetId=node.id;node.scanned=true;r.activeInstanceId='shardbelt';r.initializeMiningDrones();assert.ok(r.toggleMiningDrones().ok);
 const advance=until=>{for(let i=0;i<5400&&!until();i++){save.world.time+=1/60;r.updateMiningDrones(1/60);r.updatePdcDrones(1/60);}assert.ok(until());};
 advance(()=>Object.values(p.droneFleet.unitsById).some(u=>u.payload));const amount=Object.values(p.droneFleet.unitsById).find(u=>u.payload).payload.units;
 assert.equal(r.inventoryCommand('install',{id:buy.id,mountId:slot}).code,'Drones are returning automatically.');
 normalizeEquipmentInventory(p);assert.ok(p.outfitting.loadouts.wayfarer.droneBays[0].pendingInventoryDrone,'opening equipment retains the queued change');
 advance(()=>p.outfitting.loadouts.wayfarer.droneBays[0].mode==='pdc');assert.equal(p.cargo.ore,amount);
 assert.equal(p.inventory.items[droneInventoryId('drone-unit-1')].location.kind,'cargo');
});

test('a second miner already airborne in an older save returns its one-unit payload into cargo',()=>{
 const {session:r,save}=tutorialFixture('earn-standing'),p=save.player,node=r.asteroids[0];p.dockedAt=undefined;p.position=[...node.position];p.position[2]+=asteroidCollisionRadius(node)+35;p.velocity.fill(0);p.throttle=0;node.scanned=true;r.activeInstanceId='shardbelt';
 const extra=createDroneUnit('drone-unit-2');extra.state='returning';extra.position=[p.position[0],p.position[1]-22,p.position[2]];extra.velocity=[0,0,0];extra.rotation=[0,0,0,1];
 const key=`${save.world.seed}:${p.systemId}:asteroid:${node.id}`;extra.payload={packetId:'drone-packet-7',unitId:extra.id,targetNodeKey:key,cycleId:1,commodityId:'ore',units:1,unitMass:1};
 p.droneFleet.unitsById[extra.id]=extra;p.droneFleet.nextUnitId=3;p.droneFleet.controller={phase:'recalling',cycleId:1,targetNodeKey:key,stopReason:'loaded'};p.outfitting.loadouts.wayfarer.droneBays[0].unitIds.push(extra.id);
 r.save=hydrateSave(save);r.initializeMiningDrones();
 for(let i=0;i<6000&&r.save.player.droneFleet.unitsById[extra.id].state!=='stowed';i++){r.save.world.time+=1/60;r.updateMiningDrones(1/60);}
 const restored=r.save.player;assert.equal(restored.droneFleet.unitsById[extra.id].state,'stowed');assert.equal(restored.cargo.ore,1);assert.ok(restored.droneFleet.lockerIds.includes(extra.id));assert.equal(restored.droneFleet.unitsById[extra.id].hull,20);
});
