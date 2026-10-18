import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRaceContacts,raceBody,resolveRaceContacts} from '../../src/game/raceContact.js';
import {advanceRaceRacerGates} from '../../src/game/racing.js';
import {planRaceTactics} from '../../src/game/raceTactics.js';
const ship=(id,position,velocity=[0,0,-100])=>({id,position:[...position],racePreviousPosition:[...position],velocity:[...velocity],rotation:[0,0,0,1],hull:180,raceGateIndex:0,laneOffset:0,raceLane:0,raceAggression:.95});
test('swept race hulls exchange momentum before passing through one another',()=>{
 const a=ship('a',[0,0,-30],[0,0,-120]),b=ship('b',[0,0,30],[0,0,120]);
 a.racePreviousPosition=[0,0,30];b.racePreviousPosition=[0,0,-30];
 const state=createRaceContacts([raceBody(a,'talon',1,true),raceBody(b,'talon')]);let damage;
 assert.equal(resolveRaceContacts(state,1/60,1,(_a,_b,d)=>damage=d),1);
 assert.ok(a.position[2]>b.position[2],'hulls remain on their incoming sides');
 assert.ok(a.velocity[2]>0&&b.velocity[2]<0,'head-on contact reverses closing motion');assert.ok(damage<=35&&damage>0);
 assert.ok(a.raceContactUntil>1&&b.raceContactUntil>1);assert.equal(state.playerHits,1);
 assert.ok(Math.abs(a.velocity[2]+b.velocity[2])<1e-9,'equal-mass momentum conserved');
 advanceRaceRacerGates(a,{gates:[{id:'finish',position:[0,0,0],direction:[0,0,-1],radius:20}],shortcuts:[]},a.racePreviousPosition,a.position,1);
 assert.ok(!a.raceFinished,'contact stops a racer before its unearned finish crossing');
});
test('parallel grazing contact separates hulls without damage from absolute speed',()=>{
 const a=ship('a',[0,0,0]),b=ship('b',[.2,0,0]);const state=createRaceContacts([raceBody(a,'talon'),raceBody(b,'talon')]);let callbacks=0;
 assert.ok(resolveRaceContacts(state,1/60,1,()=>callbacks++)>0);assert.equal(callbacks,0);
 assert.deepEqual(a.velocity,b.velocity);assert.ok(a.position.some((v,i)=>Math.abs(v-b.position[i])>.5));
});
test('distant racers do no narrow-phase work, finished racers and grid hold are unaffected',()=>{
 const a=ship('a',[0,0,0]),b=ship('b',[100,0,0]);const state=createRaceContacts([raceBody(a,'talon'),raceBody(b,'talon')]);
 assert.equal(resolveRaceContacts(state,1/60,1),0);b.position.fill(0);assert.equal(resolveRaceContacts(state,0,1),0,'zero-time render probes do not apply physical contact');b.raceFinished=true;assert.equal(resolveRaceContacts(state,1/60,1),0);
});
test('rivals defend, draft and contest a shoulder against player or peers',()=>{
 const c={racerLaneWidth:12,gates:[{position:[0,0,-1000]}]},a=ship('a',[0,0,0]),b=ship('b',[8,0,-60]);
 assert.equal(planRaceTactics(a,c,[a,b],undefined,.1,1).mode,'draft');
 b.position[2]=-15;assert.equal(planRaceTactics(a,c,[a,b],undefined,.1,1.1).mode,'shoulder');assert.ok(Math.abs(a.raceLane)<=1.65);
 b.position[2]=30;const player={...b,id:undefined};assert.equal(planRaceTactics(a,c,[a],player,.1,2).mode,'defend');assert.equal(a.raceTactics.targetId,'player');
 b.velocity[2]=100;assert.equal(planRaceTactics(a,c,[a,b],undefined,.1,3).mode,'line','no attack on opposing traffic/crossed route legs');
});

for(const id of ['shard-gauntlet','shard-switchback','shard-miners-knife'])test(`${id}: contact racing retains all mandatory and shortcut crossings`,async()=>{
 const {generateRaceCourse,createRaceRacers,updateRaceRacer}=await import('../../src/game/racing.js');
 const c=generateRaceCourse(id),racers=createRaceRacers(c),state=createRaceContacts(racers.map(s=>raceBody(s,s.variant,1.6)));
 for(let tick=1;tick<60*240&&racers.some(r=>!r.raceFinished);tick++){
  const now=tick/60;
  for(const r of racers){if(r.raceFinished)continue;planRaceTactics(r,c,racers,undefined,1/60,now);updateRaceRacer(r,c,1/60,now,{peers:racers,deferGates:true});}
  resolveRaceContacts(state,1/60,now);
  for(const r of racers)advanceRaceRacerGates(r,c,r.racePreviousPosition,r.position,now);
 }
 assert.ok(racers.every(r=>r.raceFinished&&r.raceGateIndex===c.gates.length));
});
