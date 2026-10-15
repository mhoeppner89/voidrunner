import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {updateNpcDrones} from '../../src/game/npcDrones.js';
import {selectRepairTarget,repairTargetEligible,applyDroneRepair,createRepairDroneState} from '../../src/game/repairDrones.js';

function fixture(){
 const f=tutorialFixture('survey-carrier'),r=f.session,p=f.save.player;
 p.dockedAt=undefined;p.position=[0,90000,0];p.velocity.fill(0);p.rotation=[0,0,0,1];p.hull=r.playerStats().hull;
 const paul=r.ensureTutorialCompanion();paul.position=[80,90000,0];paul.velocity.fill(0);paul.rotation=[0,0,0,1];paul.hull=paul.maxHull;
 return {...f,p,paul};
}
function advance(r,until,limit=14400){for(let i=0;i<limit&&!until();i++){r.save.world.time+=1/60;for(const s of r.ships)if(s.combatFit)s.energy=s.combatFit.stats.energyCapacity;updateNpcDrones(r,1/60);}assert.ok(until(),'physical drones never reached repair contact');}

test('Paul launches two repair drones, repairs himself first, then actually repairs the player',()=>{
 const {session:r,p,paul}=fixture();paul.hull-=10;p.hull-=20;const before=p.hull,shield=p.shield;
 updateNpcDrones(r,1/60);const units=Object.values(paul.droneFleet.unitsById);
 assert.equal(units.length,2);assert.ok(units.every(u=>u.type==='repair'));assert.notDeepEqual(r.ships[0].npcDrones.context.escortAnchors[units[0].id].position,r.ships[0].npcDrones.context.escortAnchors[units[1].id].position);
 advance(r,()=>paul.hull===paul.maxHull);assert.equal(p.hull,before,'own hull takes priority');
 advance(r,()=>p.hull>before);assert.equal(p.shield,shield);assert.ok(units.some(u=>u.repairing&&u.repairTargetId==='player'));
});

test('repair support enforces 200 km, friend/team eligibility, energy reserve and no overhealing',()=>{
 const {session:r,p,paul}=fixture(),state=createRepairDroneState();p.hull-=10;
 const u={repairTargetId:'player',repairAttached:true,position:[...p.position]};
 paul.position=[200,90000,0];assert.ok(repairTargetEligible(r,paul,p));assert.equal(selectRepairTarget(r,paul,u),p);
 paul.position[0]=200.001;assert.equal(repairTargetEligible(r,paul,p),false);assert.equal(applyDroneRepair(r,paul,u,1,state),0);
 paul.position[0]=100;paul.hostile=true;assert.equal(repairTargetEligible(r,paul,p),false);paul.hostile=false;
 paul.energy=paul.combatFit.stats.energyCapacity*.2;assert.equal(applyDroneRepair(r,paul,u,1,state),0);
 paul.energy+=1;const energy=paul.energy;assert.equal(applyDroneRepair(r,paul,u,1,state),.5);assert.equal(paul.energy,energy-1);
 p.hull=r.playerStats().hull-.02;paul.energy+=10;assert.ok(applyDroneRepair(r,paul,u,1,state)<=.020001);assert.equal(p.hull,r.playerStats().hull);
 p.hull-=10;p.poweredDown=true;assert.equal(applyDroneRepair(r,paul,u,1,state),0);delete p.poweredDown;
 r.lineBlocked=()=>true;assert.equal(applyDroneRepair(r,paul,u,1,state),0);r.lineBlocked=()=>false;
 const friend=r.spawnShip('patrol',[100,90000,0],undefined,'Ally',undefined,{hullId:'lancer',faction:'independents'});friend.hostile=false;friend.hull-=20;
 assert.equal(selectRepairTarget(r,paul,{}),friend);friend.observerTeam='red';paul.observerTeam='blue';assert.equal(repairTargetEligible(r,paul,friend),false);friend.observerTeam='blue';assert.ok(repairTargetEligible(r,paul,friend));friend.captured=true;assert.equal(repairTargetEligible(r,paul,friend),false);
});

test('disabled Paul keeps his drones, cannot be repaired/reactivated; carrier hiding recalls them',()=>{
 const {session:r,paul,quest}=fixture();updateNpcDrones(r,1/60);const units=Object.values(paul.droneFleet.unitsById);
 paul.hull=1;paul.poweredDown=true;advance(r,()=>units.every(u=>u.state==='stowed'));assert.ok(units.every(u=>u.hull>0));assert.equal(paul.hull,1);
 paul.poweredDown=false;paul.hull=paul.maxHull;advance(r,()=>units.every(u=>u.state==='escorting'));
 quest.stepId='hide-patrol';r.ensureTutorialCompanion();advance(r,()=>units.every(u=>u.state==='stowed'));assert.equal(paul.repairDronesHeld,true);
});

test('player repair drones physically service a friendly fighter and stop when it leaves support range',async()=>{
 const {session:r,p,paul}=fixture();paul.hull-=20;
 const {createDroneUnit}=await import('../../src/game/droneData.js'),f=p.droneFleet,id=`drone-unit-${f.nextUnitId++}`;
 f.unitsById[id]=createDroneUnit(id,'repair');f.lockerIds.push(id);assert.ok(r.setDroneBayMode(p.outfitting.loadouts[p.shipId].droneBays[0].bayId,'repair').ok);
 r.initializeMiningDrones();const hull=paul.hull;
 for(let i=0;i<14400&&paul.hull===hull;i++){r.save.world.time+=1/60;p.energy=r.playerStats().energyCapacity;r.updatePdcDrones(1/60);}
 assert.ok(paul.hull>hull);const u=f.unitsById[id];assert.equal(u.repairTargetId,paul.id);
 paul.position[0]=201;const before=paul.hull;r.updatePdcDrones(1/60);assert.equal(paul.hull,before);assert.equal(u.repairing,false);assert.equal(u.repairAttached,false);
});
