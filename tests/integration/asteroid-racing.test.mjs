import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {session} from '../helpers/session.mjs';
import {GameSession} from '../../src/game/game.js';
import {LOCATIONS} from '../../src/game/data.js';
import {generateShardbeltDeposits,shardbeltSolidDistance} from '../../src/game/asteroidFieldLayout.js';
import {generateRaceCourse,createRaceRacers,raceRacerTarget,updateRaceRacer,advanceRaceRacerGates,crossedRaceGate} from '../../src/game/racing.js';
import {steerRacePilot} from '../../src/game/raceNavigation.js';
import {createRaceContacts,raceBody,resolveRaceContacts} from '../../src/game/raceContact.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
import {planRaceTactics} from '../../src/game/raceTactics.js';
import {mkdir,writeFile} from 'node:fs/promises';
const ids=['shard-gauntlet','shard-switchback','shard-miners-knife'],results=[];
function field(seed){const s=session();s.activeInstanceId='shardbelt';s.asteroids=generateShardbeltDeposits(seed);s.graveyard=[];s.wreckNodes=[];s.tmpCollide=new T.Vector3();s.obstacleCellSize=180;s.obstacleQueryStamp=0;
 s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;s.obstacles=s.activeFieldObstacles();s.hyperdriveInterceptIds=new Set();s.save.player.position=LOCATIONS.shardbelt.position.map(v=>v+15000);
 for(const key of ['forEachObstacleInBox','forEachObstacleAlongSegment'])s[key]=GameSession.prototype[key];return s;}
test('three natural routes have spaced checkpoints, clear flying corridors and useful lengths',()=>{
 const lengths=[];
 for(const id of ids){const c=generateRaceCourse(id);lengths.push(c.routeLength);assert.ok(c.gates.slice(0,-1).every(g=>g.radius===80*1.4));assert.equal(c.gates.at(-1).radius,110*1.4);assert.deepEqual(c.shortcuts,[]);let previous=c.gathering.localPosition;
 for(const g of c.gates){assert.ok(Math.hypot(...g.localPosition.map((v,i)=>v-previous[i]))>220,`${id}: crowded gates`);previous=g.localPosition;
  // Enlarged checkpoint hoops may extend into the unchanged tunnel wall;
  // retain the authored 160 km clear flying corridor through each marker.
  const forward=new T.Vector3(...g.direction),right=new T.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right).normalize();
  for(let j=0;j<16;j++){const p=new T.Vector3(...g.localPosition).addScaledVector(right,Math.cos(j*Math.PI/8)*Math.min(80,g.radius)).addScaledVector(up,Math.sin(j*Math.PI/8)*Math.min(80,g.radius));assert.ok(shardbeltSolidDistance(...p.toArray())>0,`${id} gate ${g.index+1} clips rock`);}
 }
 assert.ok(c.localPoints.every(p=>shardbeltSolidDistance(...p)>80),`${id}: centre-line clearance`);
 }
 assert.deepEqual(lengths.map(Math.round),[10742,10911,19621],'player benchmark routes stay unchanged');
 assert.deepEqual(ids.map(id=>generateRaceCourse(id).gates.length),[35,36,65]);
 assert.ok(lengths[0]>10000&&lengths[0]<12000);assert.ok(lengths[1]>10000&&lengths[1]<14000);assert.ok(lengths[2]>18000&&lengths[2]<23000);
});
for(const seed of (process.env.VR_SHARD_SEED?[Number(process.env.VR_SHARD_SEED)]:[175,718]))for(const id of ids.filter(id=>!process.env.VR_SHARD_COURSE||id===process.env.VR_SHARD_COURSE))for(const playerHull of (process.env.VR_SHARD_HULL?[process.env.VR_SHARD_HULL]:['lancer','talon']))test(`${id}: rival field completes using real terrain, collisions and ${playerHull} player loaner (seed ${seed})`,()=>{
 const s=field(seed),course=generateRaceCourse(id),racers=createRaceRacers(course,seed,0,playerHull);s.ships=racers;
 const contacts=createRaceContacts(racers.map(r=>raceBody(r,r.variant,npcShipScaleForVariant(r.variant)))),goal=new T.Vector3(),steering=new T.Vector3(),terrainContacts=[0,0,0],invalidPasses=[0,0,0],contactDetails=[[],[],[]],recovery=[0,0,0],recoveryTime=[0,0,0],recoveryDetails=[[],[],[]],wasRecovering=[false,false,false];
 for(let tick=1;tick<=60*240&&racers.some(r=>!r.raceFinished);tick++){
  const elapsed=tick/60;s.save.world.time=elapsed;
  for(const r of racers)if(!r.raceFinished&&r.hull>0){planRaceTactics(r,course,racers,undefined,1/60,elapsed);goal.fromArray(raceRacerTarget(r,course));const brake=steerRacePilot(s,r,goal,1/60,steering);updateRaceRacer(r,course,1/60,elapsed,{direction:steering,brake,peers:racers,deferGates:true});}
  resolveRaceContacts(contacts,1/60,elapsed);
  racers.forEach((r,i)=>{if(r.raceFinished||r.hull<=0)return;const before=r.position.slice();s.resolveNpcCollisions(r);if(r.position.some((v,k)=>Math.abs(v-before[k])>.001)){terrainContacts[i]++;if(contactDetails[i].length<5)contactDetails[i].push({time:elapsed,gate:r.raceGateIndex,position:r.position.map((v,j)=>v-course.center[j]),speed:Math.hypot(...r.velocity),lane:r.raceLane,clear:r.raceNavigation?.clear});}const gateIndex=r.raceGateIndex,gate=course.gates[gateIndex];advanceRaceRacerGates(r,course,r.racePreviousPosition,r.position,elapsed);if(r.raceGateIndex>gateIndex&&!crossedRaceGate(r.racePreviousPosition,r.position,gate))invalidPasses[i]++;if(r.raceGateRecovery){recoveryTime[i]+=1/60;if(!wasRecovering[i]){recovery[i]++;recoveryDetails[i].push({time:elapsed,gate:r.raceGateIndex,position:r.position.map((v,j)=>v-course.center[j])});}}wasRecovering[i]=!!r.raceGateRecovery;});
 }
 const result={id,seed,playerHull,contacts:contacts.hits,racers:racers.map((r,i)=>({hull:r.variant,hullRemaining:r.hull,finished:r.raceFinished,time:r.raceFinishTime,gate:r.raceGateIndex,terrainContacts:terrainContacts[i],recoveries:recovery[i],recoveryTime:recoveryTime[i],recoveryDetails:recoveryDetails[i],invalidPasses:invalidPasses[i],contactDetails:contactDetails[i]}))};results.push(result);console.log(JSON.stringify(result));
 for(const r of result.racers){assert.equal(r.invalidPasses,0,`${id}: ${r.hull} passed outside the player aperture`);assert.ok(r.hullRemaining>0,`${id}: ${r.hull} was destroyed`);assert.ok(r.finished,`${id}: ${r.hull} stalled at ${r.gate}`);assert.ok(r.terrainContacts<=30,`${id}: ${r.hull} spent more than half a second scraping terrain (${r.terrainContacts})`);assert.ok(r.recoveryTime<=r.recoveries*10+.1,`${id}: ${r.hull} circles too long after a missed gate`);assert.ok(r.recoveries<=3,`${id}: ${r.hull} missed too many gates`);}
 const ranked=result.racers.map(r=>r.time).sort((a,b)=>a-b),benchmark={'shard-gauntlet':35.3,'shard-switchback':42.9,'shard-miners-knife':66.5}[id];
 assert.ok(ranked[0]<benchmark*.95,`${id}: lead rival ${ranked[0].toFixed(1)}s must beat the player's first-try benchmark ${benchmark}s`);
 assert.ok(ranked[1]-ranked[0]>3,`${id}: the midfield must leave room for a small player mistake`);
 assert.ok(ranked[2]-ranked[0]>9,`${id}: field should have a range of driving skill`);
});
test.after(async()=>{await mkdir('output/asteroid-review',{recursive:true});await writeFile('output/asteroid-review/race-pilots.json',JSON.stringify(results,null,2));});
