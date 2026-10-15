import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {createDroneUnit,DRONE_TYPES} from '../../src/game/droneData.js';
import {hydrateSave} from '../../src/game/save.js';
import {asteroidCollisionRadius} from '../../src/game/worldData.js';

function stock(session){
 const f=session.save.player.droneFleet;
 for(const type of ['pdc','repair']){const id=`drone-unit-${f.nextUnitId++}`;f.unitsById[id]=createDroneUnit(id,type);f.lockerIds.push(id);}
}
function advance(session,until,limit=3600){
 for(let i=0;i<limit&&!until();i++){session.save.world.time+=1/60;session.updateMiningDrones(1/60);session.updatePdcDrones(1/60);}
 assert.ok(until(),'automatic role change did not finish');
}

test('legacy attack drones become PDC without losing ownership; repair drones keep their role',()=>{
 const {session,save}=tutorialFixture();stock(session);const p=save.player,f=p.droneFleet,bay=p.outfitting.loadouts[p.shipId].droneBays[0],id=bay.unitIds[0];
 bay.mode='attack';bay.unitIds=[id];f.unitsById[id]={...createDroneUnit(id,'pdc'),type:'attack',hull:19,ammo:37};
 const repair=Object.values(f.unitsById).find(u=>u.type==='repair');repair.hull=11;
 save.world.orphanDrones={old:{id:'old',type:'attack',hull:21,ammo:17,position:[0,0,0],systemId:p.systemId}};
 f.pdcPolicy='stow';const original=JSON.stringify(save),loaded=hydrateSave(save),again=hydrateSave(loaded),lb=loaded.player.outfitting.loadouts[p.shipId].droneBays[0];
 assert.equal(JSON.stringify(save),original);assert.equal(lb.mode,'pdc');assert.equal(lb.unitIds[0],id);
 assert.equal(loaded.player.droneFleet.unitsById[id].hull,19);assert.equal(loaded.player.droneFleet.unitsById[id].ammo,37);
 assert.equal(loaded.player.droneFleet.unitsById[repair.id].type,'repair');assert.equal(loaded.player.droneFleet.unitsById[repair.id].hull,11);
 assert.equal(loaded.world.orphanDrones.old.type,'pdc');assert.deepEqual(again.player.droneFleet,loaded.player.droneFleet);
 assert.equal(loaded.player.droneFleet.pdcPolicy,'defend');
 assert.deepEqual(Object.keys(DRONE_TYPES).sort(),['mining','pdc','repair']);
});

test('docked roles switch directly between mining, PDC and repair using owned cargo',()=>{
 const {session,save}=tutorialFixture();stock(session);const p=save.player,bay=p.outfitting.loadouts[p.shipId].droneBays[0],miners=[...bay.unitIds],credits=p.credits;
 for(const mode of ['pdc','repair','mining']){assert.ok(session.setDroneBayMode(bay.bayId,mode).ok);const active=p.outfitting.loadouts[p.shipId].droneBays[0];assert.equal(active.mode,mode);assert.ok(active.unitIds.every(id=>id&&p.droneFleet.unitsById[id].type===mode));}
 assert.deepEqual(p.outfitting.loadouts[p.shipId].droneBays[0].unitIds,miners);assert.equal(p.credits,credits);
 const current=p.outfitting.loadouts[p.shipId].droneBays[0];p.droneFleet.lockerIds.push(...miners);current.unitIds.fill(null);
 assert.ok(session.setDroneBayMode(current.bayId,'mining').ok);assert.deepEqual(p.outfitting.loadouts[p.shipId].droneBays[0].unitIds,miners,'selecting an empty bay’s current role loads available stock');
});

test('a mining-to-PDC switch returns the ore payload, then PDC-to-repair switches automatically in flight',()=>{
 const {session:r,save}=tutorialFixture('earn-standing');stock(r);const p=save.player,node=r.asteroids[0];
 p.dockedAt=undefined;p.position=[...node.position];p.position[2]+=asteroidCollisionRadius(node)+35;p.velocity.fill(0);p.throttle=0;p.currentTargetId=node.id;node.scanned=true;r.activeInstanceId='shardbelt';
 r.initializeMiningDrones();const start=r.toggleMiningDrones();assert.ok(start.ok,JSON.stringify(start));advance(r,()=>Object.values(p.droneFleet.unitsById).some(u=>u.payload?.units>0));
 const ore=p.cargo.ore??0,bay=p.outfitting.loadouts[p.shipId].droneBays[0],miners=[...bay.unitIds];
 assert.equal(r.setDroneBayMode(bay.bayId,'pdc').code,'recalling');assert.equal(bay.pendingMode,'pdc');
 advance(r,()=>p.outfitting.loadouts[p.shipId].droneBays[0].mode==='pdc');
 assert.ok((p.cargo.ore??0)>ore,'the returning payload must be delivered');assert.ok(miners.every(id=>p.droneFleet.lockerIds.includes(id)));
 advance(r,()=>Object.values(p.droneFleet.unitsById).some(u=>u.type==='pdc'&&u.state==='escorting'));
 assert.equal(r.setDroneBayMode(bay.bayId,'repair').code,'recalling');
 advance(r,()=>p.outfitting.loadouts[p.shipId].droneBays[0].mode==='repair');
 const hull=p.hull-=12;advance(r,()=>p.hull>hull,7200);assert.ok(p.hull>hull,'repair drones must still repair the hull');
});
