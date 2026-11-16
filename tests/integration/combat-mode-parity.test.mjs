import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {updateShipAI} from '../../src/game/shipAI.js';
import {terrainFlightDistance} from '../../src/game/asteroidTerrain.js';
import {fieldCombatSteering} from '../../src/game/fieldCombatNav.js';

function fight(arena){
 const s=session();s.arena=arena?{run:true}:null;s.save.player.position=[0,0,-180];
 s.announceSearchStart=()=>{};s.playerExposureRange=()=>2000;s.tmpCollide=new THREE.Vector3();s.tmpEuler=new THREE.Euler();
 const ship=s.spawnShip('pirate',[100,0,180],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'talon'});
 Object.assign(ship,{targetId:'player',hostile:true,noSurrender:true,playerAwareness:1,resolvedPlayerLast:true,lastResolvedPlayer:[0,0,-180]});
 ship.rotation=[0,0,0,1];ship.velocity=[0,0,-40];ship.combatFit.turrets=[];ship.combatFit.missiles=0;
 s.obstacles=[{id:'cover',shape:'asteroid',x:0,y:0,z:0,radius:65,collisionRadius:65,losRadius:65}];
 let search=0,combat=0;
 for(let i=0;i<900;i++){
  s.save.world.time=i/60;s.save.player.position=i<360?[0,0,-180]:[220,0,-80];
  ship.fireCooldown-=1/60;updateShipAI(s,ship,1/60);s.resolveNpcCollisions(ship);
  if(ship.search)search++;else if(ship.combatPlan)combat++;
  for(const p of s.projectiles)s.projStore.free(p.slot);s.projectiles.length=0;
 }
 return {position:ship.position,velocity:ship.velocity,rotation:ship.rotation,search,combat};
}
test('career and Arena use identical combat/search flight through occlusion and reacquisition',()=>{
 const career=fight(false),arena=fight(true);
 assert.deepEqual(arena,career);assert.ok(arena.search>0);assert.ok(arena.combat>100);
 assert.ok(arena.position.every(Number.isFinite));
});
test('occlusion never overwrites the last seen point with hidden player motion in either mode',()=>{
 for(const arena of [false,true]){
  const s=session();s.arena=arena?{run:true}:null;s.playerExposureRange=()=>2000;
  const p=s.spawnShip('pirate',[0,0,180]);p.playerAwareness=1;p.lastResolvedPlayer=[100,0,-180];
  s.save.player.position=[0,0,-180];s.obstacles=[{id:'rock',x:0,y:0,z:0,radius:60,collisionRadius:60,losRadius:60}];
  s.updateSensorAwareness(p,1/60);assert.equal(s.shipTracksPlayer(p),false);assert.deepEqual(p.lastResolvedPlayer,[100,0,-180]);
  s.save.player.position=[200,0,180];s.updateSensorAwareness(p,1/60);assert.equal(s.shipTracksPlayer(p),true);assert.deepEqual(p.lastResolvedPlayer,[200,0,180]);
 }
});
test('fractured terrain permits a short clear shoulder instead of a waypoint beyond its huge bounding box',()=>{
 const s=session();s.save.world.time=1;
 const p=s.spawnShip('pirate',[0,0,45],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'talon'});s.npcFlightStats(p);
 p.rotation=[0,0,0,1];p.velocity=[0,0,-40];p.combatIntent='hunt';
 // A real triangular rock face, with a larger parent-fragment bound.
 s.obstacles=[{id:'fragment',terrain:true,shape:'asteroid',x:0,y:0,z:0,radius:300,losRadius:300,
  box:{hx:300,hy:300,hz:100,qx:0,qy:0,qz:0,qw:1},
  meshVerts:new Float32Array([-35,-100,0,35,-100,0,35,100,0,-35,100,0]),meshIndices:new Uint32Array([0,1,2,0,2,3])}];
 const out=new THREE.Vector3(),goal=new THREE.Vector3(0,0,-180),heading=new THREE.Vector3(0,0,-1);
 const nav=fieldCombatSteering(s,p,goal,heading,1/60,out);
 assert.ok(nav.active);assert.ok(nav.waypoint.distanceTo(new THREE.Vector3(...p.position))<=180,JSON.stringify({waypoint:nav.waypoint.toArray(),out:out.toArray(),extents:s.npcHullExtents(p),p:p.position}));
 assert.ok(Math.abs(out.x)>.3,'choose a clear shoulder');assert.ok(out.z<-.5,'retain useful forward progress');
});

test('terrain probes reserve forward hull clearance without closing clear tunnel space',()=>{
 const wall={terrain:true,x:0,y:0,z:0,radius:300,box:{hx:100,hy:100,hz:1,qx:0,qy:0,qz:0,qw:1},
  meshVerts:new Float32Array([-100,-100,0,100,-100,0,100,100,0,-100,100,0]),meshIndices:new Uint32Array([0,1,2,0,2,3])};
 const heading=new THREE.Vector3(0,0,-1),scratch={};
 assert.equal(terrainFlightDistance(wall,new THREE.Vector3(0,0,50),heading,12,100,scratch,12),38);
 assert.equal(terrainFlightDistance(wall,new THREE.Vector3(0,0,5),heading,12,100,scratch,12),0);
 assert.equal(terrainFlightDistance(wall,new THREE.Vector3(0,0,50),heading,12,45,scratch,12),38,'detect nose contact even when centre ray would end short');
 assert.equal(terrainFlightDistance(wall,new THREE.Vector3(150,0,50),heading,12,100,scratch,12),100,'clear space in the parent bound stays flyable');
 assert.equal(terrainFlightDistance(wall,new THREE.Vector3(0,0,50),heading,0,100,scratch),50,'zero-width line queries keep their surface distance');
});
