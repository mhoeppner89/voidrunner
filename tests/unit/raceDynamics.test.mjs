import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRaceDrive,stepRaceDrive,collectRaceStabilizer,raceDraft,sweptBoostHit,raceDistance,RACE_BOOST_SECONDS,RACE_STABILIZER_SECONDS} from '../../src/game/raceDynamics.js';
import {generateRaceCourse,createRaceRacers,updateRaceRacer} from '../../src/game/racing.js';
test('holding boost exhausts a finite charge; full recovery is required after exhaustion',()=>{
 const d=createRaceDrive();let burning=0;
 for(let i=0;i<8*60;i++)if(stepRaceDrive(d,true,1/60))burning++;
 assert.ok(burning>=190&&burning<=193);assert.ok(d.locked);assert.ok(d.charge<RACE_BOOST_SECONDS);
 for(let i=0;i<60;i++)stepRaceDrive(d,false,1/60);
 assert.equal(d.locked,false);assert.equal(d.charge,RACE_BOOST_SECONDS);
});
test('short bursts recover after a pause; stabilizer pickups do not refill thrust charge',()=>{
 const d=createRaceDrive();stepRaceDrive(d,true,1);assert.equal(d.charge,2.2);
 stepRaceDrive(d,false,.4);assert.equal(d.charge,2.2);stepRaceDrive(d,false,1);assert.ok(d.charge>2.2);
 d.charge=.7;const charge=d.charge,locked=d.locked;
 collectRaceStabilizer(d);assert.equal(d.stabilizerTime,RACE_STABILIZER_SECONDS);assert.equal(d.charge,charge);assert.equal(d.locked,locked);
 stepRaceDrive(d,true,1);assert.equal(d.charge,0);assert.equal(d.stabilizerTime,4);assert.equal(d.locked,true);
 stepRaceDrive(d,false,4);assert.equal(d.stabilizerTime,0);
});
test('drafting requires a matching forward wake and benefits either pilot',()=>{
 const a={position:[0,0,0],velocity:[0,0,100]},b={position:[0,0,40],velocity:[0,0,100],hull:1};
 assert.ok(raceDraft(a,[b])>.8);assert.equal(raceDraft(b,[a]),0);
 b.velocity[2]=-100;assert.equal(raceDraft(a,[b]),0);b.velocity[2]=100;b.position[0]=23;assert.equal(raceDraft(a,[b]),0);
 const normal=createRaceDrive(),draft=createRaceDrive();stepRaceDrive(normal,true,1);stepRaceDrive(draft,true,1,.9);assert.ok(draft.charge>normal.charge);
});
test('pickup collection sweeps the full step and cannot hit a nearby parallel line',()=>{
 assert.ok(sweptBoostHit([-100,0,0],[100,0,0],[0,0,0]));
 assert.equal(sweptBoostHit([-100,13,0],[100,13,0],[0,0,0]),false);
});
test('dedicated rivals accelerate from rest without a rechargeable boost reserve; progress cannot skip unchecked gates',()=>{
 const c=generateRaceCourse('mourning-breach'),r=createRaceRacers(c)[0];
 updateRaceRacer(r,c,1/60,1/60);assert.ok(Math.hypot(...r.velocity)<3);
 assert.ok(r.raceDrive.burning);assert.equal(r.raceDrive.charge,RACE_BOOST_SECONDS);
 const gate=r.raceGateIndex;r.position.splice(0,3,...c.gates.at(-1).position);
 assert.ok(raceDistance(r,c)<=c.gates[gate].pathDistance,'only current validated sector contributes');
});
