import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {getAsteroidTerrain} from '../../src/game/asteroidTerrain.js';
import {SHARDBELT_PASSAGES,generateShardbeltDeposits} from '../../src/game/asteroidFieldLayout.js';
import {miningClaimCandidates} from '../../src/game/missionWorldData.js';
import {segmentMeshHit} from '../../src/game/meshQueries.js';
import {LOCATIONS} from '../../src/game/data.js';
import {RACE_COURSES} from '../../src/game/racing.js';
import {session} from '../helpers/session.mjs';
import {GameSession} from '../../src/game/game.js';
const origin=new T.Vector3(...LOCATIONS.shardbelt.position),terrain=getAsteroidTerrain();
function field(seed=718){
 const s=session();s.asteroids=generateShardbeltDeposits(seed);s.graveyard=[];s.wreckNodes=[];s.activeInstanceId='shardbelt';s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;
 s.obstacles=s.activeFieldObstacles();s.obstacleCellSize=180;s.obstacleQueryStamp=0;s.tmpCollide=new T.Vector3();s.damagePlayer=()=>{};
 for(const key of ['forEachObstacleInBox','forEachObstacleAlongSegment'])s[key]=GameSession.prototype[key];
 return s;
}
test('the shattered parent reuses ten closed rock surfaces and bounded spatial collision tiles',()=>{
 assert.equal(terrain.fragments.length,10);assert.ok(terrain.triangles<160000);assert.ok(terrain.obstacles.length<2600);
 assert.strictEqual(getAsteroidTerrain(),terrain);
 for(const f of terrain.fragments){
  const p=f.geometry.attributes.position;assert.ok(p.count>1000);assert.equal(f.geometry.attributes.normal.count,p.count);
  const edges=new Map(),indices=f.geometry.index.array,points=new Map(),topology=[];
  // Normal splits preserve sharp breaks without opening the physical mesh.
  for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(':');if(!points.has(key))points.set(key,points.size);topology[i]=points.get(key);}
  for(let i=0;i<indices.length;i+=3)for(const [a,b]of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]].map(pair=>pair.map(v=>topology[v]))){const k=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(k,(edges.get(k)??0)+1);}
  // Every fragment is a volume, including its tunnel walls: no unpaired sheet edges.
  assert.equal([...edges.values()].filter(v=>v!==2).length,0,`${f.id} has open or non-manifold edges`);
  for(let i=0;i<p.count;i++)assert.ok(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))<2340);
 }
 const tiledTriangles=terrain.obstacles.reduce((n,o)=>n+o.meshIndices.length/3,0);assert.equal(tiledTriangles,terrain.triangles);
 assert.ok(terrain.obstacles.every(o=>o.surfaceOnly&&o.radius<230&&o.minReach===0));
});
test('all natural tunnels have an unobstructed 160 km flight core through the real player collision system',()=>{
 const s=field(),position=new T.Vector3(),velocity=new T.Vector3();let samples=0,maxPush=0;
 for(const route of SHARDBELT_PASSAGES)for(let j=1;j<route.points.length;j++){
  const a=new T.Vector3(...route.points[j-1]),b=new T.Vector3(...route.points[j]),dir=b.clone().sub(a).normalize();
  const right=new T.Vector3(0,1,0).cross(dir).normalize();if(right.length()<.1)right.set(1,0,0);const up=dir.clone().cross(right).normalize();
  s.save.player.rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),dir).toArray();
  for(let t=0;t<=1;t+=.5)for(let k=-1;k<8;k++){
   position.copy(a).lerp(b,t).add(origin);if(k>=0)position.addScaledVector(right,Math.cos(k*Math.PI/4)*80).addScaledVector(up,Math.sin(k*Math.PI/4)*80);
   const before=position.clone();velocity.set(0,0,0);s.resolvePlayerCollisions(position,velocity);maxPush=Math.max(maxPush,position.distanceTo(before));samples++;
  }
 }
 assert.ok(maxPush<.001,`tunnel flight core blocked: ${maxPush} km correction`);console.log({tunnelSamples:samples,maxPush});
});
test('existing Shardbelt race lines stay flyable through the newly carved solid terrain',()=>{
 const s=field(),position=new T.Vector3(),velocity=new T.Vector3();let maxPush=0;
 for(const course of Object.values(RACE_COURSES).filter(c=>c.zone==='shardbelt')){
  const lines=[course.localPoints,...course.shortcuts.map(r=>[course.localPoints[r.entryIndex],...r.gates.map(g=>g.localPosition),course.localPoints[r.exitIndex+1]])];
  for(const line of lines)for(let i=1;i<line.length;i++){
   const a=new T.Vector3(...line[i-1]),b=new T.Vector3(...line[i]);
   for(let j=0;j<=20;j++){position.copy(a).lerp(b,j/20).add(origin);const before=position.clone();s.resolvePlayerCollisions(position,velocity);maxPush=Math.max(maxPush,position.distanceTo(before));}
  }
 }
 assert.ok(maxPush<.001,`race line blocked by ${maxPush}`);
});
test('visible tunnel walls stop projectiles and collide with the hull at the same surface',()=>{
 const s=field(),start=origin.clone().add(new T.Vector3(90,80,0));let walls=0,contacts=0;
 for(let i=0;i<32;i++){
  const dir=new T.Vector3(Math.cos(i*Math.PI/16),Math.sin(i*Math.PI/16),.17).normalize(),end=start.clone().addScaledVector(dir,1300);
  let best=Infinity;
  for(const o of terrain.obstacles){const hit=segmentMeshHit(start,end,o);if(hit!==undefined)best=Math.min(best,hit);}
  if(!Number.isFinite(best))continue;walls++;
  const point=start.clone().lerp(end,best),before=point.clone();s.resolvePlayerCollisions(point,new T.Vector3());if(point.distanceTo(before)>.001)contacts++;
 }
 assert.ok(walls>=20);assert.equal(contacts,walls);
});
test('mining contracts, depletion and scans all refer to the same stable new field deposits',()=>{
 for(const seed of [1,718,941]){
  const nodes=generateShardbeltDeposits(seed),target=nodes[6],changed=generateShardbeltDeposits(seed,{[target.id]:2},[target.id]);
  assert.equal(nodes.length,560);assert.ok(nodes.every(n=>Math.hypot(...n.position.map((v,i)=>v-origin.toArray()[i]))+n.radius*Math.max(...n.scale)<2340));
  assert.deepEqual(nodes.map(n=>n.position),changed.map(n=>n.position));assert.equal(changed[6].remaining,2);assert.equal(changed[6].scanned,true);
  changed[0].position[0]=0;assert.notEqual(generateShardbeltDeposits(seed)[0].position[0],0);
  for(const claim of miningClaimCandidates(seed,{})){const live=nodes.find(n=>n.id===claim.id);assert.deepEqual(live.position,claim.position);assert.equal(live.remaining,claim.remaining);}
 }
});
test('spawn clearance rejects solid interiors and old embedded positions recover into open space',async()=>{
 const {SHARDBELT_FRAGMENTS,fragmentToWorld,shardbeltSolidDistance}=await import('../../src/game/asteroidFieldLayout.js');
 const s=field();for(const key of ['tmpEntryAnchor','tmpEntryCandidate','tmpEntryPreferredDirection','tmpEntryDirection'])s[key]=new T.Vector3();
 const local=SHARDBELT_FRAGMENTS.map(f=>fragmentToWorld(f,...f.seed)).find(p=>shardbeltSolidDistance(...p)<-80);assert.ok(local);
 const position=new T.Vector3(...local).add(origin);assert.equal(s.entryPositionClear(position,s.obstacles),false);
 s.ensurePlayerEntryClearance(position,'shardbelt');assert.equal(s.entryPositionClear(position,s.obstacles),true);assert.ok(position.toArray().every(Number.isFinite));
});
test('new sessions share immutable triangle buffers but never reuse mutable query stamps',()=>{
 const a=field(),b=field();const oa=a.obstacles.find(o=>o.terrain),ob=b.obstacles.find(o=>o.terrain);
 assert.notStrictEqual(oa,ob);assert.strictEqual(oa.meshVerts,ob.meshVerts);oa._queryStamp=1234;assert.notEqual(ob._queryStamp,1234);
});
test('NPC travel follows the three curved tunnel routes using visible-surface clearance',()=>{
 const results=[];
 for(const route of SHARDBELT_PASSAGES){
  const s=field(),from=new T.Vector3(...route.points[0]).add(origin),direction=new T.Vector3(...route.points[1]).sub(new T.Vector3(...route.points[0])).normalize();
  s.tmpEuler=new T.Euler();const ship=s.spawnShip('patrol',from.toArray(),undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'wayfarer'});
  ship.instanceId='shardbelt';ship.rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),direction).toArray();ship.velocity=direction.multiplyScalar(35).toArray();ship.task={kind:'patrol'};
  let goal=1,contacts=0,i=0;
  for(;i<12000&&goal<route.points.length;i++){
   const dest=new T.Vector3(...route.points[goal]).add(origin);ship.destination=dest.toArray();s.save.world.time+=1/60;s.updateTravelAI(ship,1/60);
   const before=[...ship.position];s.resolveNpcCollisions(ship);if(ship.position.some((v,j)=>Math.abs(v-before[j])>.001))contacts++;
   if(new T.Vector3(...ship.position).distanceTo(dest)<40)goal++;
  }
  results.push({route:route.id,goal,total:route.points.length,contacts,seconds:i/60});
  assert.equal(goal,route.points.length,JSON.stringify(results.at(-1)));assert.equal(contacts,0,JSON.stringify(results.at(-1)));
 }
 console.log('Tunnel NPCs',results);
});
