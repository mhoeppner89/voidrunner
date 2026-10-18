import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../../vendor/three.module.min.js';
import {SHIP_COLLIDERS,shipVsShip} from '../../src/game/shipCollision.js';
import {boxBoxContact,boxBoxOverlap} from '../../src/game/collisionSat.js';

const origin=new THREE.Vector3(),identity=new THREE.Quaternion();
function randomSource(){let seed=175;return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);}
function matrix(q){const e=new THREE.Matrix4().makeRotationFromQuaternion(q).elements;return [e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]];}
// Independent flat-cell oracle: no tree, node predicates or traversal ordering.
function linearContact(variantA,variantB,position,rotation,ratio){
 const a=SHIP_COLLIDERS[variantA].boxes,b=SHIP_COLLIDERS[variantB].boxes,m=matrix(rotation),ha=[],hb=[],out={};
 for(let j=0;j<b.length;j+=6){
  const x=(b[j]+b[j+3])*ratio/2,y=(b[j+1]+b[j+4])*ratio/2,z=(b[j+2]+b[j+5])*ratio/2;
  const bx=m[0]*x+m[1]*y+m[2]*z+position.x,by=m[3]*x+m[4]*y+m[5]*z+position.y,bz=m[6]*x+m[7]*y+m[8]*z+position.z;
  hb[0]=(b[j+3]-b[j])*ratio/2;hb[1]=(b[j+4]-b[j+1])*ratio/2;hb[2]=(b[j+5]-b[j+2])*ratio/2;
  const ex=Math.abs(m[0])*hb[0]+Math.abs(m[1])*hb[1]+Math.abs(m[2])*hb[2],ey=Math.abs(m[3])*hb[0]+Math.abs(m[4])*hb[1]+Math.abs(m[5])*hb[2],ez=Math.abs(m[6])*hb[0]+Math.abs(m[7])*hb[1]+Math.abs(m[8])*hb[2];
  for(let i=0;i<a.length;i+=6){
   if(a[i]>bx+ex||a[i+3]<bx-ex||a[i+1]>by+ey||a[i+4]<by-ey||a[i+2]>bz+ez||a[i+5]<bz-ez)continue;
   ha[0]=(a[i+3]-a[i])/2;ha[1]=(a[i+4]-a[i+1])/2;ha[2]=(a[i+5]-a[i+2])/2;
   if(boxBoxContact(bx-(a[i]+a[i+3])/2,by-(a[i+1]+a[i+4])/2,bz-(a[i+2]+a[i+5])/2,ha,hb,m,out)&&out.push>0)return true;
  }
 }
 return false;
}
test('conservative node SAT never discards exact rotated box contacts',()=>{
 const random=randomSource(),a=[],b=[],out={};
 for(let i=0;i<5000;i++){
  for(let axis=0;axis<3;axis++){a[axis]=.1+random()*10;b[axis]=.1+random()*10;}
  const m=matrix(new THREE.Quaternion().setFromEuler(new THREE.Euler(random()*3,random()*3,random()*3)));
  const x=(random()-.5)*40,y=(random()-.5)*40,z=(random()-.5)*40;
  if(boxBoxContact(x,y,z,a,b,m,out))assert.ok(boxBoxOverlap(x,y,z,a,b,m));
 }
});
test('close racing prunes cell pairs and agrees with flat hull contacts',()=>{
 const random=randomSource(),stats={},position=new THREE.Vector3(),q=new THREE.Quaternion(),variants=['talon','lancer','kestrel'];let hits=0,misses=0;
 for(let i=0;i<120;i++){
  const a=variants[i%3],b=variants[(i+1)%3],scaleA=i%2?1.6:.96,scaleB=1.6;
  position.set((random()-.5)*34,(random()-.5)*12,(random()-.5)*34);
  q.setFromEuler(new THREE.Euler((random()-.5)*.5,(random()-.5)*.8,(random()-.5)*.3));
  const actual=shipVsShip(origin,identity,a,scaleA,position,q,b,scaleB,{},stats);
  assert.equal(actual,linearContact(a,b,position.clone().divideScalar(scaleA),q,scaleB/scaleA),`pose ${i}`);
  if(actual)hits++;else misses++;
 }
 assert.ok(hits>0&&misses>0);
 assert.ok(stats.partTests<24000,`exact cell tests: ${stats.partTests}`);
 assert.ok(stats.boundsTests<200000,`node tests: ${stats.boundsTests}`);
});
