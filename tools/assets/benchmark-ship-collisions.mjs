import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import * as T from '../../vendor/three.module.min.js';
import {SHIP_COLLIDERS,segmentShipColliderHit,shipVsShip,shipVsSphere} from '../../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
const variants=Object.keys(SHIP_COLLIDERS),rotation=[0,0,0,1],position=[0,0,0],start=new T.Vector3(),end=new T.Vector3(),q=new T.Quaternion(),a=new T.Vector3(),b=new T.Vector3(),contact={};
let seed=10413;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const samples=[],stats={},counts={rays:0,hits:0,pairs:0,contacts:0};
// 80% distant misses; 20% sweeps around the target. Includes all capital hulls.
for(let frame=0;frame<240;frame++){
 const before=performance.now();
 for(let shot=0;shot<240;shot++){
  const variant=variants[shot%variants.length],p=SHIP_COLLIDERS[variant],n=npcShipScaleForVariant(variant);
  if(shot%5){start.set(p.radius*n*3,50,100);end.set(start.x,start.y,start.z-20);}
  else{start.set((random()*2-1)*p.extent[0]*n,(random()*2-1)*p.extent[1]*n,-p.radius*n*2);end.copy(start);end.z=p.radius*n*2;}
  if(segmentShipColliderHit(start,end,position,rotation,variant,n,.12,stats)!==undefined)counts.hits++;counts.rays++;
 }
 for(let i=0;i<24;i++){
  const variant=variants[i%variants.length],p=SHIP_COLLIDERS[variant];b.set(p.extent[0]*(1.5+random()),0,0);
  if(shipVsShip(a,q,variant,1,b,q,variant,1,contact))counts.contacts++;counts.pairs++;
 }
 samples.push(performance.now()-before);
}
const embedding=[];
for(const variant of variants){const t=performance.now();for(let i=0;i<100;i++){b.set(.1,.1,.1);shipVsShip(a,q,variant,1,b,q,variant,1,contact);}embedding.push({variant,meanMs:(performance.now()-t)/100});}
const percentile=p=>[...samples].sort((a,b)=>a-b)[Math.floor(samples.length*p)];
const result={scenario:'240 weapon queries + 24 close ship pairs per batch, all 19 hulls; .12 projectile margin',counts,meanMs:samples.reduce((a,b)=>a+b)/samples.length,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),triangleTests:stats.triangleTests,meanTrianglesPerQuery:stats.triangleTests/counts.rays,treeBuildsDuringQueries:stats.treeBuilds??0,deepOverlaps:embedding};
if(result.treeBuildsDuringQueries!==0)throw Error('Collision trees built during the hot workload');
await writeFile('docs/ship-collision/performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
