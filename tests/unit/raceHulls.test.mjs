import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as T from '../../vendor/three.module.min.js';
import {RACE_HULLS,raceHull,integrateRaceVelocity,integrateRaceTurn,integrateRacePilotVelocity,applyRaceStabilizer,takeRaceHull,returnRaceHull} from '../../src/game/raceHulls.js';
import {integrateFlightVelocity,integrateFlightTurn} from '../../src/game/flightDynamics.js';
import {createNewSave,saveGame,SAVE_KEY} from '../../src/game/save.js';
import {createRaceRacers,generateRaceCourse} from '../../src/game/racing.js';
const forward=new T.Vector3(0,0,-1);
for(const h of Object.values(RACE_HULLS)){
 test(`${h.name}: permanent afterburner flight matches the standard integrators`,()=>{
  for(const assisted of [true,false])for(const {throttle,brake,draft} of [{throttle:0,brake:0,draft:0},{throttle:1,brake:0,draft:0},{throttle:0,brake:1,draft:0},{throttle:1,brake:0,draft:.5}]){
   const limit=h.afterburnSpeed*(1+draft*.14),v=new T.Vector3(30,20,-150),actual=v.clone();
   const target=brake?0:throttle?limit:Math.max(0,v.dot(forward)),accel=brake?h.braking/1.25:h.acceleration*(1+draft*.18),expected=v.clone();
   integrateRaceVelocity(actual,forward,h,throttle,brake,true,1/60,draft,false,assisted);
   if(brake&&!assisted){const speed=expected.length();expected.multiplyScalar(Math.max(0,speed-h.braking/1.25/60)/speed);}
   else integrateFlightVelocity(expected,forward,target,limit,accel,assisted,true,throttle,1/60,h.lateralMultiplier);
   assert.deepEqual(actual,expected,'racer uses the same afterburner velocity integration and the player’s flight-assist setting');
  }
  for(const assisted of [true,false]){
   const w=new T.Vector3(.1,.2,-.3),actualW=w.clone(),q=new T.Quaternion(),actualQ=q.clone();
   integrateRaceTurn(actualQ,actualW,.4,-.3,.2,h,0,1/60,assisted);
   integrateFlightTurn(q,w,.4,-.3,.2,h.angularAcceleration,h.angularDamping,assisted,true,1/60);
   assert.deepEqual(actualW,w);assert.deepEqual(actualQ,q,'racer uses the same afterburner turn integration and the player’s flight-assist setting');
  }
  const velocity=new T.Vector3();for(let i=0;i<1200;i++)integrateRaceVelocity(velocity,forward,h,1,0,true,1/60);
  assert.ok(Math.abs(velocity.length()-h.afterburnSpeed)<1e-6,'thrust reaches the afterburner speed ceiling');
  for(let i=0;i<300;i++)integrateRaceVelocity(velocity,forward,h,1,0,true,1/60,0,true);
  assert.ok(Math.abs(velocity.length()-h.afterburnSpeed)<1e-6,'stabilizer never raises the afterburner speed ceiling');
 });
}
test('stabilizer quickly damps lateral drift without increasing speed or forward thrust',()=>{
 const hull=raceHull('talon'),nose=new T.Vector3(0,0,-1),drifting=new T.Vector3(100,0,-200),normal=drifting.clone();
 integrateRaceVelocity(normal,nose,hull,0,0,false,.5,0,false,false);
 integrateRaceVelocity(drifting,nose,hull,0,0,false,.5,0,true,false);
 assert.ok(Math.abs(drifting.z-normal.z)<1e-8,'stabilizer does not add forward thrust');
 assert.ok(Math.abs(drifting.x)<normal.x*.2,'stabilizer damps sideways motion toward the nose');
 assert.ok(drifting.length()<=normal.length()+1e-8,'stabilizer does not increase total speed');
 const assisted=new T.Vector3(100,0,-200),ordinary=assisted.clone();
 applyRaceStabilizer(assisted,nose,.5,true);
 assert.ok(Math.abs(assisted.x)<ordinary.x*.2,'stabilizer also works when flight assist is enabled');
 assert.ok(Math.abs(assisted.z-ordinary.z)<1e-8);
});
test('every selection faces the other three race hulls',()=>{
 for(const id of Object.keys(RACE_HULLS))for(const c of ['mourning-breach','shard-gauntlet']){
  const racers=createRaceRacers(generateRaceCourse(c),175,0,id);
  assert.deepEqual(new Set([id,...racers.map(s=>s.raceHull)]),new Set(Object.keys(RACE_HULLS)));
  assert.ok(racers.every(s=>s.maxHull===400&&s.maxShield===400&&s.energy===100));
 }
});
test('NPC gate recovery rapidly sheds lateral drift; stabilizer improves nose tracking',()=>{
 const hull=raceHull('talon'),nose=new T.Vector3(0,0,-1),ordinary=new T.Vector3(50,0,-80),recovering=ordinary.clone();
 integrateRacePilotVelocity(ordinary,nose,hull,80,1/60,0,false,false);
 const stabilized=ordinary.clone();integrateRacePilotVelocity(stabilized,nose,hull,80,1/60,0,true,false);
 integrateRacePilotVelocity(recovering,nose,hull,80,1/60,0,false,true);
 assert.ok(recovering.x<ordinary.x*.9,'gate recovery arrests cross-track motion');
 assert.ok(ordinary.x>49,'normal racing keeps the permanent-afterburner drift feel');
 assert.ok(stabilized.x<ordinary.x*.98,'pickup temporarily damps NPC lateral drift');
 assert.ok(stabilized.length()<=ordinary.length()+1e-8,'NPC stabilization does not add speed');
});
test('loaner serializes and restores the parked career ship, resources and equipment',()=>{
 const save=createNewSave(175,{tutorial:false}),player=save.player;
 player.position=[1,2,3];player.velocity=[0,0,0];player.angularVelocity=[0,0,0];
 const original=structuredClone(player);takeRaceHull(player,'demon');
 const wallet=player.credits;player.hull=1;player.shield=2;player.position[0]=500;player.credits+=1000;
 const store=new Map(),previous=globalThis.window;
 globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}};
 try{
  assert.equal(saveGame(save),true);const saved=JSON.parse(store.get(SAVE_KEY)).player;
  assert.equal(saved.shipId,original.shipId);assert.equal(saved.hull,original.hull);assert.deepEqual(saved.position,original.position);assert.equal(saved.raceReturn,undefined);
  assert.deepEqual(saved.inventory,original.inventory);assert.deepEqual(saved.outfitting,original.outfitting);
  assert.equal(saved.credits,wallet+1000,'race winnings remain career progress');
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
 assert.ok(returnRaceHull(player));assert.equal(player.shipId,original.shipId);assert.equal(player.shield,original.shield);assert.deepEqual(player.droneFleet,original.droneFleet);
 assert.equal(player.credits,wallet+1000);assert.equal(returnRaceHull(player),false);assert.equal(raceHull('bad').id,'talon');
});
