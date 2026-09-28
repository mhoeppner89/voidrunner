import test from 'node:test';import assert from 'node:assert/strict';
import {SHIPS} from '../src/game/data.js';
import {createNewSave,hydrateSave} from '../src/game/save.js';
import {createOutfittingState,HULL_HARDPOINTS} from '../src/game/outfitting.js';
import {quoteShipTrade,commitShipTrade} from '../src/game/shipTrade.js';
import {canMineWithHull,droneBayLayoutFor} from '../src/game/droneData.js';
import {DRONE_PORTS} from '../src/game/droneFlight.js';
import {createEnemyLoadout} from '../src/game/enemyLoadouts.js';
const career=()=>{const s=createNewSave();s.player.credits=500000;return s};
test('career paths, industrial bays and physical ports agree',()=>{
 for(const [id,tier,role] of [['speedster',1,'interceptor'],['talon',2,'interceptor'],['lancer',3,'interceptor'],['legionary',2,'fighter'],['blade',3,'fighter'],['andromeda',2,'bomber'],['vanguard',3,'bomber'],['wayfarer',1,'allrounder'],['torsas',2,'allrounder'],['astra',3,'allrounder'],['prospector',2,'industrial'],['atlas',3,'industrial']]){assert.equal(SHIPS[id].tier,tier);assert.equal(SHIPS[id].role,role);}
 for(const [id,count] of [['wayfarer',1],['torsas',2],['astra',2],['prospector',3],['atlas',4]]){assert.ok(canMineWithHull(id));assert.equal(droneBayLayoutFor(id).length,count);assert.equal(DRONE_PORTS[id].length,count);}
 assert.equal(HULL_HARDPOINTS.atlas.turrets.length,4);assert.equal(HULL_HARDPOINTS.blade.turrets.length,3);assert.equal(HULL_HARDPOINTS.vanguard.launchers.length,3);
 assert.equal(createEnemyLoadout({hullId:'vanguard',role:'patrol'},0).racks.length,3);
});
test('keep, reload and switch preserve hull, ammunition and equipment without free repairs',()=>{
 let save=career(),p=save.player;p.hull=77;p.fuel=43;p.ammo.gauss=3;
 const fit=structuredClone(p.outfitting.loadouts.wayfarer),q=quoteShipTrade(p,'talon',{keepCurrent:true});assert.ok(q.ok);assert.equal(q.tradeIn,0);assert.ok(commitShipTrade(p,q).ok);
 assert.deepEqual(p.outfitting.loadouts.wayfarer,fit);assert.equal(p.storedShips.wayfarer.resources.hull,77);
 save=hydrateSave(JSON.parse(JSON.stringify(save)));p=save.player;assert.deepEqual(new Set(p.ownedShips),new Set(['wayfarer','talon']));assert.equal(p.credits,500000-SHIPS.talon.price);
 const credits=p.credits;assert.ok(commitShipTrade(p,quoteShipTrade(p,'wayfarer')).ok);assert.equal(p.hull,77);assert.equal(p.fuel,43);assert.equal(p.ammo.gauss,3);assert.equal(p.credits,credits);
 save=hydrateSave(JSON.parse(JSON.stringify(save)));assert.equal(save.player.credits,credits);assert.ok(save.player.storedShips.talon);
});
test('switching is local, cargo-safe, and stale quotes do not mutate resources',()=>{
 const p=career().player;commitShipTrade(p,quoteShipTrade(p,'atlas',{keepCurrent:true}));p.dockedAt='rook';assert.equal(quoteShipTrade(p,'wayfarer').code,'stored-elsewhere');p.dockedAt='helix';p.cargo={ore:40};assert.equal(quoteShipTrade(p,'wayfarer').code,'cargo-over-capacity');p.cargo={};const q=quoteShipTrade(p,'wayfarer');p.hull--;assert.equal(commitShipTrade(p,q).code,'stale-quote');assert.equal(p.shipId,'atlas');
});
test('trading active hull leaves another stored hull and its equipment intact',()=>{
 const p=career().player;commitShipTrade(p,quoteShipTrade(p,'talon',{keepCurrent:true}));const saved=structuredClone(p.outfitting.loadouts.wayfarer);assert.ok(commitShipTrade(p,quoteShipTrade(p,'atlas')).ok);assert.deepEqual(p.ownedShips,['wayfarer','atlas']);assert.deepEqual(p.outfitting.loadouts.wayfarer,saved);assert.ok(p.storedShips.wayfarer);assert.equal(p.outfitting.loadouts.talon,undefined);
});
