import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {createDroneUnit,DRONE_TYPES} from '../../src/game/droneData.js';
import {dockServiceQuote,repaintCost,getEffectiveShipStats} from '../../src/game/shipStats.js';
import {quoteDroneService,commitDroneService} from '../../src/game/droneService.js';
import {hydrateSave} from '../../src/game/save.js';
function setup(){const f=tutorialFixture();const p=f.save.player;p.credits=10000;p.hull-=20;p.fuel-=15;const fleet=p.droneFleet;const id=`drone-unit-${fleet.nextUnitId++}`;fleet.unitsById[id]=createDroneUnit(id,'pdc');fleet.lockerIds.push(id);fleet.unitsById[id].hull-=5;fleet.unitsById[id].ammo=0;return {...f,id};}
test('repair and refill each bill once, service carried drones and never buy missing units',()=>{
 const {session:r,save,id}=setup(),p=save.player;const fit=p.outfitting.loadouts[p.shipId],bay=fit.droneBays[0],lost=bay.unitIds.pop();bay.unitIds.push(null);delete p.droneFleet.unitsById[lost];
 const ids=Object.keys(p.droneFleet.unitsById),repair=dockServiceQuote(p,'repair'),before=p.credits;r.repair();assert.equal(p.credits,before-repair.total);assert.equal(p.hull,getEffectiveShipStats(p).hull);assert.equal(p.droneFleet.unitsById[id].hull,DRONE_TYPES.pdc.maxHull);assert.equal(p.droneFleet.unitsById[id].ammo,0);assert.deepEqual(Object.keys(p.droneFleet.unitsById),ids);assert.equal(p.outfitting.loadouts[p.shipId].droneBays[0].unitIds.at(-1),null);
 const refill=dockServiceQuote(p,'refill'),credits=p.credits;r.refuel();assert.equal(p.credits,credits-refill.total);assert.equal(p.fuel,getEffectiveShipStats(p).fuel);assert.equal(p.droneFleet.unitsById[id].ammo,0);const full=JSON.stringify(p);r.repair();r.refuel();assert.equal(JSON.stringify(p),full);
});
test('insufficient credits, unavailable docks and deployed drones leave combined services untouched',()=>{
 for(const reason of ['credits','dock','deployed']){const {session:r,save,id}=setup(),p=save.player;if(reason==='credits')p.credits=1;if(reason==='dock')p.dockedAt=undefined;if(reason==='deployed')p.droneFleet.unitsById[id].state='returning';const before=JSON.stringify(p);r.repair();assert.equal(JSON.stringify(p),before,reason);if(reason!=='deployed'){r.refuel();assert.equal(JSON.stringify(p),before,reason);}}
});
test('maintenance quotes retain their scope and reject changed drone state',()=>{const {save,id}=setup(),p=save.player,q=quoteDroneService(p,{fillSlots:[],includeLocker:true});assert(q.lines.every(l=>l.kind==='repair'));p.droneFleet.unitsById[id].hull--;const before=JSON.stringify(p);assert.equal(commitDroneService(p,{authorized:true,expected:q}).code,'stale-quote');assert.equal(JSON.stringify(p),before);});
test('paint requires a serviced dock and credits, bills once and survives save hydration',()=>{
 const {session:r,save}=setup(),p=save.player,cost=repaintCost(p),before=p.credits;assert.equal(r.setShipPaint('bogus'),false);assert.equal(r.setShipPaint('original'),false);assert.equal(p.credits,before);assert.equal(r.setShipPaint('independent-bands'),true);assert.equal(p.credits,before-cost);assert.equal(r.setShipPaint('independent-bands'),false);assert.equal(hydrateSave(save).player.shipPaints[p.shipId],'independent-bands');
 p.dockedAt=undefined;assert.equal(r.setShipPaint('original'),false);p.dockedAt='helix';p.credits=cost-1;assert.equal(r.setShipPaint('original'),false);assert.equal(p.shipPaints[p.shipId],'independent-bands');
});
