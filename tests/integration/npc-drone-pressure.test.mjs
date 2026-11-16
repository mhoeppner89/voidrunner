import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';
import {updateNpcDrones} from '../../src/game/npcDrones.js';

function deployedGroup(){
 const s=session();s.save.player.position=[0,100,0];
 const lead=s.spawnShip('pirate',[0,100,100],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
 const carrier=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'wayfarer'});
 for(const p of [lead,carrier]){p.hostile=true;p.targetId='player';p.rotation=[0,0,0,1];p.velocity=[0,0,0];p.combatIntent='hunt';p.holdFire=true;}
 carrier.combatFit.droneCount=1;carrier.combatFit.droneTypes=['pdc'];
 for(let i=0;i<360;i++){s.save.world.time=i/60;updateNpcDrones(s,1/60);}
 assert.equal(Object.values(carrier.droneFleet.unitsById)[0].state,'escorting');
 lead.holdFire=false;carrier.holdFire=false;return {s,carrier};
}

test('NPC escort drones wait for the carrier pass before attacking the player',()=>{
 const {s}=deployedGroup();
 for(let i=0;i<45;i++){s.save.world.time=6.4+i/60;updateNpcDrones(s,1/60);}
 assert.equal(s.projectiles.length,0,'the supporting carrier has no attack window yet');
 for(let i=0;i<45;i++){s.save.world.time=7.5+i/60;updateNpcDrones(s,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetId==='player'),'escort drones still attack during an open pass');
});

test('NPC escort drones intercept missiles during a closed offensive pass',()=>{
 const {s,carrier}=deployedGroup(),slot=s.projStore.alloc();
 s.projStore.setPos(slot,0,150,0);s.projStore.setVel(slot,0,-260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'player',targetId:carrier.id,life:3});
 for(let i=0;i<45;i++){s.save.world.time=6.4+i/60;updateNpcDrones(s,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetMissile?.id==='incoming'));
 assert.ok(s.projectiles.every(p=>p.id==='incoming'||p.targetMissile),'closed passes allow defense only');
});

test('NPC escort drones keep attacking NPC opponents outside player attack windows',()=>{
 const {s,carrier}=deployedGroup();s.save.player.position=[1000,0,0];
 const target=s.spawnShip('patrol',[0,100,0]);target.hostile=false;target.velocity=[0,0,0];target.rotation=[0,0,0,1];
 carrier.targetId=target.id;
 for(let i=0;i<45;i++){s.save.world.time=6.4+i/60;updateNpcDrones(s,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetId===target.id));
});

test('drones cannot use live hidden coordinates while their carrier finishes a cover maneuver',()=>{
 const {s,carrier}=deployedGroup();
 carrier.terrainManeuver={active:true,targetHidden:true};
 for(let i=0;i<45;i++){s.save.world.time=7.5+i/60;updateNpcDrones(s,1/60);}
 assert.equal(s.projectiles.length,0,'even an open attack pass requires reacquisition');
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,150,0);s.projStore.setVel(slot,0,-260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'player',targetId:carrier.id,life:3});
 for(let i=0;i<45;i++){s.save.world.time=8.3+i/60;updateNpcDrones(s,1/60);}
 assert.ok(s.projectiles.some(p=>p.targetMissile?.id==='incoming'),'defense keeps working');
});
