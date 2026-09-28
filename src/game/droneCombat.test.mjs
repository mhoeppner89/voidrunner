import assert from 'node:assert/strict';
import { createDroneFleet, createDroneUnit } from './droneData.js';
import { createPdcDroneController } from './dronePdc.js';
import { GameSession } from './game.js';
const ship=(id,x,changes={})=>({id,position:[x,0,0],velocity:[0,0,0],hull:100,hostile:true,...changes});
function run(opponents,threats=[],canFire=()=>true) {
 const fleet=createDroneFleet();fleet.unitsById.drone=createDroneUnit('drone','pdc');
 const point={position:[0,0,0],velocity:[0,0,0]},assignments=new Map();
 const c={ownerId:'player',unitIds:['drone'],shipPosition:[0,0,0],shipVelocity:[0,0,0],ownerRadius:2,inFlight:true,now:0,threats,opponents,assignments,canFire,bayAnchors:{drone:{launch:point,dock:point}},escortAnchors:{drone:point}};
 const events=createPdcDroneController().update(fleet,1/60,c,[]);
 return {fire:events.find(e=>e.type==='fire'),fleet,assignments};
}
let result=run([ship('enemy',299)]);assert.equal(result.fire.targetKind,'ship');assert.equal(result.fire.threatId,'enemy');assert.equal(result.fleet.unitsById.drone.ammo,119);assert.equal(result.assignments.size,0);
assert.equal(run([ship('edge',300)]).fire?.threatId,'edge');
assert.equal(run([ship('far',301)]).fire,undefined);
assert.equal(run([ship('friend',50,{hostile:false}),ship('dead',60,{hull:0}),ship('racer',70,{race:true})]).fire,undefined);
assert.equal(run([ship('near',50),ship('far',100)]).fire.threatId,'near');
assert.equal(run([ship('blocked',50),ship('clear',100)],[],(_,s)=>s.id!=='blocked').fire.threatId,'clear');
const missile={id:'missile',kind:'missile',hostile:true,ownerId:'enemy',targetId:'player',position:[150,0,0],velocity:[-100,0,0],life:5};
result=run([ship('enemy',50)],[missile]);assert.equal(result.fire.targetKind,'missile');assert.equal(result.fire.threatId,'missile');assert.equal(result.assignments.size,1);
const attackFleet=createDroneFleet();attackFleet.unitsById.strike=createDroneUnit('strike','attack');
const attackPoint={position:[0,0,0],velocity:[0,0,0]};
const attackContext={ownerId:'player',unitIds:['strike'],shipPosition:[0,0,0],shipVelocity:[0,0,0],ownerRadius:2,inFlight:true,now:0,
 threats:[],opponents:[ship('unselected',35),ship('locked',180)],attackTargetId:'locked',assignments:new Map(),
 bayAnchors:{strike:{launch:attackPoint,dock:attackPoint}},escortAnchors:{strike:attackPoint}};
const attackController=createPdcDroneController(),attackEvents=[];
for(let step=0;step<4;step++){attackContext.now=step/60;attackController.update(attackFleet,1/60,attackContext,attackEvents);}
assert.equal(attackEvents.find(e=>e.type==='fire')?.threatId,'locked','attack drones stay on the mothership selected target');
assert.equal(attackFleet.unitsById.strike.ammo,179);
const idleFleet=createDroneFleet();idleFleet.unitsById.strike=createDroneUnit('strike','attack');
const idleEvents=[];
for(let step=0;step<4;step++){attackContext.now=step/60;attackController.update(idleFleet,1/60,{...attackContext,attackTargetId:null},idleEvents);}
assert.equal(idleEvents.some(e=>e.type==='fire'),false,'attack drones wait until the mothership selects a hostile');
// Orbiting drones cannot shoot through their mothership or intervening ships.
const rt={save:{player:{position:[0,0,0]}},playerCollisionRadius:()=>5,ships:[],npcHullExtents:()=>[3,3,3]};
const blocked=GameSession.prototype.pdcDroneShotBlocked.bind(rt);
assert.equal(blocked({x:-20,y:0,z:0},{x:100,y:0,z:0},'enemy'),true);
rt.ships=[ship('friend',50,{position:[50,20,0],hostile:false})];
assert.equal(blocked({x:0,y:20,z:0},{x:100,y:20,z:0},'enemy'),true);
assert.equal(blocked({x:0,y:30,z:0},{x:100,y:30,z:0},'enemy'),false);
console.log('Drone combat passed: range, hostility, nearest clear target, missile priority, ammo, reservations and hull occlusion.');
