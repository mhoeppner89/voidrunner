import {test} from 'node:test';
import assert from 'node:assert/strict';
import {raceCornerSpeed} from '../../src/game/racePilot.js';
import {raceHull} from '../../src/game/raceHulls.js';
import {generateRaceCourse,createRaceRacers,raceRacerTarget} from '../../src/game/racing.js';

for(const id of ['shard-gauntlet','mourning-run','mourning-breach','mourning-relict-gauntlet'])test(`${id}: corner skill changes braking plans without changing ship capability`,()=>{
 const course=generateRaceCourse(id),hull=raceHull('talon');
 const driver={raceLineIndex:10,raceLineDistance:course.racingLineDistances[10],raceAggression:.5,velocity:[0,0,300]};
 const expert=raceCornerSpeed({...driver,raceCorneringSkill:1.2},course,hull,hull.afterburnSpeed,300);
 const cautious=raceCornerSpeed({...driver,raceCorneringSkill:.8},course,hull,hull.afterburnSpeed,300);
 assert.ok(expert>cautious*1.1,'a skilled rival should carry more speed through the same physical bend');
 assert.ok(expert<=hull.afterburnSpeed,'the plan respects the unchanged ship speed ceiling');
});
for(const id of ['shard-switchback','mourning-run','mourning-breach','mourning-relict-gauntlet'])test(`${id}: lookahead stays continuous as the active checkpoint advances`,()=>{
 const course=generateRaceCourse(id),racer=createRaceRacers(course,175,0)[0],gate=course.gates[7];
 racer.position.splice(0,3,...gate.position);racer.velocity.splice(0,3,...gate.direction.map(v=>v*300));racer.raceGateIndex=7;
 racer.raceLineDistance=gate.pathDistance-10;racer.raceLineIndex=1;
 const before=raceRacerTarget(racer,course);racer.raceGateIndex++;const after=raceRacerTarget(racer,course);
 assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))<1,'changing the gate must not jump the steering target');
 assert.ok(Math.hypot(...before.map((v,i)=>v-racer.position[i]))>200,'the pilot still anticipates the upcoming turn');
});
for(const id of ['shard-miners-knife','mourning-run','mourning-breach','mourning-relict-gauntlet'])test(`${id}: rivals use the player aperture and retain distinct seeded driving tiers`,()=>{
 const course=generateRaceCourse(id),racers=createRaceRacers(course,175,0),other=createRaceRacers(course,718,0);
 assert.ok(racers.every(r=>r.raceGateTolerance===0),'rivals cannot clip a wider invisible ring');
 assert.ok(racers[0].racePaceMultiplier>racers[1].racePaceMultiplier&&racers[1].racePaceMultiplier>racers[2].racePaceMultiplier);
 assert.notDeepEqual(racers.map(r=>r.raceVariance),other.map(r=>r.raceVariance),'seeded races retain variation');
});
test('a tight bend keeps its braking budget briefly after the apex',()=>{
 const course={tunnelCourse:true,racingLine:[[0,0,0],[0,0,200],[200,0,200],[400,0,200],[600,0,200]],racingLineDistances:[0,200,400,600,800]};
 const hull=raceHull('talon'),ship={raceLineIndex:2,raceLineDistance:270,raceCorneringSkill:1.2,raceAggression:.5,velocity:[250,0,0]};
 const exiting=raceCornerSpeed(ship,course,hull,500,250);ship.raceLineDistance=500;ship.raceLineIndex=3;
 const settled=raceCornerSpeed(ship,course,hull,500,250);
 assert.ok(exiting<settled*.7,'the pilot must settle its turn before accelerating down the straight');assert.equal(settled,500);
});
