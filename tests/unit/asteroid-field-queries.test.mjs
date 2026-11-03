import test from 'node:test';
import assert from 'node:assert/strict';
import {passageDistance,rockNoise,shardbeltRaceClear} from '../../src/game/asteroidFieldLayout.js';
import {SHARDBELT_PASSAGES,SHARD_RACE_LAYOUTS} from '../../src/game/asteroidRoutes.js';

// Exhaustive references intentionally do no spatial rejection.
const segment=(a,b,radius)=>{const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];return{a,dx,dy,dz,inv:1/(dx*dx+dy*dy+dz*dz),radius};};
const extend=(a,b)=>{const d=a.map((v,i)=>v-b[i]),l=Math.hypot(...d);return a.map((v,i)=>v+d[i]/l*220);};
const bores=SHARDBELT_PASSAGES.flatMap(route=>{const p=route.points,q=[extend(p[0],p[1]),...p,extend(p.at(-1),p.at(-2))];return q.slice(1).map((v,i)=>segment(q[i],v,route.radius));});
const courses=Object.values(SHARD_RACE_LAYOUTS).flatMap(route=>route.points.slice(1).map((v,i)=>segment(route.points[i],v,110)));
const distance=(x,y,z,b)=>{const ox=x-b.a[0],oy=y-b.a[1],oz=z-b.a[2],t=Math.max(0,Math.min(1,(ox*b.dx+oy*b.dy+oz*b.dz)*b.inv));return Math.hypot(ox-t*b.dx,oy-t*b.dy,oz-t*b.dz);};
test('tunnel and race clearance broadphase matches exhaustive segment distances',()=>{
 let seed=0x41c6ce57;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 const points=[];for(let i=0;i<1500;i++)points.push([(random()-.5)*6000,(random()-.5)*4000,(random()-.5)*6000]);
 for(const route of SHARDBELT_PASSAGES)for(const p of route.points)for(const d of [0,route.radius-1,route.radius+1])points.push([p[0]+d,p[1],p[2]]);
 for(const [x,y,z] of points){
  let expected=Infinity;for(const bore of bores)expected=Math.min(expected,distance(x,y,z,bore)-bore.radius);
  expected+=rockNoise(x*1.4,y*1.4,z*1.4)*.28;
  assert.equal(passageDistance(x,y,z),expected,`tunnel distance at ${[x,y,z]}`);
  for(const reach of [0,40,140])assert.equal(shardbeltRaceClear([x,y,z],reach),courses.every(b=>distance(x,y,z,b)>reach+b.radius+8),`race clearance at ${[x,y,z]}, ${reach}`);
 }
});
