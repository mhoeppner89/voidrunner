import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {RACE_HULLS} from '../../src/game/raceHulls.js';
import {generateRaceCourse,createRaceRacers,raceRacerTarget,updateRaceRacer} from '../../src/game/racing.js';
import {raceCornerSpeed} from '../../src/game/racePilot.js';
const results=[];
for(const id of ['mourning-run','mourning-breach','mourning-relict-gauntlet'])for(const hull of Object.values(RACE_HULLS)){
 const course=generateRaceCourse(id),ship=createRaceRacers(course)[0];Object.assign(ship,{variant:hull.id,raceHull:hull.id,laneOffset:0,raceLane:0});
 let braking=0,maxSpeed=0,boost=0,speedTotal=0,targetTotal=0,measured=0;
 const start=performance.now();for(let tick=1;tick<60*360&&!ship.raceFinished;tick++){
  raceRacerTarget(ship,course);const beforeSpeed=Math.hypot(...ship.velocity);targetTotal+=raceCornerSpeed(ship,course,hull,hull.afterburnSpeed,beforeSpeed);updateRaceRacer(ship,course,1/60,tick/60);
  const speed=Math.hypot(...ship.velocity);speedTotal+=speed;measured++;
  if(ship.raceBraking>.1)braking++;if(ship.burning)boost++;maxSpeed=Math.max(maxSpeed,Math.hypot(...ship.velocity));
 }
 const result={course:id,hull:hull.id,finished:ship.raceFinished,time:ship.raceFinishTime,gate:ship.raceGateIndex,braking:braking/60,boost:boost/60,maxSpeed,averageSpeed:speedTotal/measured,averageTargetSpeed:targetTotal/measured,ms:performance.now()-start};results.push(result);console.log(JSON.stringify(result));
}
await mkdir('output/race-balance',{recursive:true});await writeFile('output/race-balance/clean-times.json',JSON.stringify(results,null,2));

for(const course of new Set(results.map(r=>r.course))){const times=results.filter(r=>r.course===course);assert.ok(times.every(r=>r.finished));assert.ok(Math.max(...times.map(r=>r.time))/Math.min(...times.map(r=>r.time))<1.08,`${course}: race hulls exceed 8% clean-time spread`);}
