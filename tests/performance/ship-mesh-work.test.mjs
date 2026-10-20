import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as T from '../../vendor/three.module.min.js';
import {SHIP_COLLIDERS,shipVsMesh,shipVsSphere} from '../../src/game/shipCollision.js';
import {triangleBoxContact} from '../../src/game/collisionSat.js';

// Exhaustive triangle/cell oracle: independent transforms, no mesh/hull trees.
function exhaustive(position,q,variant,scale,obstacle){
 const boxes=SHIP_COLLIDERS[variant].boxes,v=obstacle.meshVerts,indices=obstacle.meshIndices,inv=q.clone().invert();
 const b=obstacle.box,rotation=new T.Quaternion(b.qx,b.qy,b.qz,b.qw),offset=new T.Vector3(obstacle.x,obstacle.y,obstacle.z);
 const vertices=[];for(let i=0;i<v.length;i+=3)vertices.push(new T.Vector3().fromArray(v,i).applyQuaternion(rotation).add(offset).sub(position).applyQuaternion(inv).divideScalar(scale));
 let push=0;const out={};
 for(let t=0;t<indices.length;t+=3){
  const a=vertices[indices[t]],b=vertices[indices[t+1]],c=vertices[indices[t+2]];
  for(let j=0;j<boxes.length;j+=6){
   const x=(boxes[j]+boxes[j+3])/2,y=(boxes[j+1]+boxes[j+4])/2,z=(boxes[j+2]+boxes[j+5])/2;
   if(boxes[j]>Math.max(a.x,b.x,c.x)||boxes[j+3]<Math.min(a.x,b.x,c.x)||boxes[j+1]>Math.max(a.y,b.y,c.y)||boxes[j+4]<Math.min(a.y,b.y,c.y)||boxes[j+2]>Math.max(a.z,b.z,c.z)||boxes[j+5]<Math.min(a.z,b.z,c.z))continue;
   const hx=(boxes[j+3]-boxes[j])/2,hy=(boxes[j+4]-boxes[j+1])/2,hz=(boxes[j+5]-boxes[j+2])/2;
   if(!triangleBoxContact(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,x,y,z,hx,hy,hz,out))continue;
   if(out.x*(a.x+b.x+c.x)+out.y*(a.y+b.y+c.y)+out.z*(a.z+b.z+c.z)>0){
    const nx=-out.x,ny=-out.y,nz=-out.z;
    out.push=Math.max(0,Math.max(a.x*nx+a.y*ny+a.z*nz,b.x*nx+b.y*ny+b.z*nz,c.x*nx+c.y*ny+c.z*nz)-(x*nx+y*ny+z*nz-hx*Math.abs(nx)-hy*Math.abs(ny)-hz*Math.abs(nz)));
   }
   push=Math.max(push,out.push*scale+.015);
  }
 }
 return push;
}
function surfaces(size=30){
 const v=[-size,0,-size,size,0,-size,size,0,size,-size,0,size,0,-size,-size,0,size,-size,0,size,size,0,-size,size];
 return {x:210000,y:-17000,z:380000,surfaceOnly:true,meshVerts:Float32Array.from(v),meshIndices:Uint16Array.from([0,1,2,0,2,3,4,5,6,4,6,7]),box:{qx:0,qy:0,qz:0,qw:1}};
}
test('all fitted hulls agree with exhaustive mesh contacts under rotation, translation and scale',()=>{
 let seed=712,hits=0,misses=0;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(const [variant,profile] of Object.entries(SHIP_COLLIDERS))for(let i=0;i<16;i++){
  const scale=(i%2?.96:1.6)*Math.min(1,16/profile.radius),obstacle=surfaces(25),q=new T.Quaternion().setFromEuler(new T.Euler(random()*6,random()*6,random()*6));
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(random()*6,random()*6,random()*6));
  Object.assign(obstacle.box,{qx:rotation.x,qy:rotation.y,qz:rotation.z,qw:rotation.w});
  const p=new T.Vector3((random()-.5)*24,(random()-.5)*24,(random()-.5)*24).applyQuaternion(rotation).add(new T.Vector3(obstacle.x,obstacle.y,obstacle.z));
  const expected=exhaustive(p,q,variant,scale,obstacle),out={},actual=shipVsMesh(p,q,variant,scale,obstacle,out);
  assert.equal(actual,expected>0,`${variant} pose ${i}`);
  if(actual){hits++;assert.ok(Math.abs(out.push-expected)<1e-7,`${variant}: ${out.push} != ${expected}`);assert.ok(Math.abs(Math.hypot(out.x,out.y,out.z)-1)<1e-8);}else misses++;
 }
 assert.ok(hits>50&&misses>50,`${hits} contacts, ${misses} misses`);
});
test('thin hulls reject a nearby plane before any exact cell or triangle work',()=>{
 const mesh=surfaces(500);mesh.meshIndices=Uint16Array.from([0,1,2,0,2,3]);
 const p=new T.Vector3(mesh.x,mesh.y+4,mesh.z),stats={};
 assert.equal(shipVsMesh(p,new T.Quaternion(),'talon',1,mesh,{},stats),false);
 assert.equal(stats.meshTriangles??0,0);assert.equal(stats.partTests??0,0);
 p.y+=100;const far={};assert.equal(shipVsMesh(p,new T.Quaternion(),'talon',1,mesh,{},far),false);
 assert.equal(far.meshRejects,1);assert.equal(far.meshBoundsTests??0,0);
});
test('a mixed leaf only transforms triangles that can touch the fitted hull',()=>{
 const mesh=surfaces(),v=Array.from(mesh.meshVerts.slice(0,9));
 for(const x of [-100,100])v.push(x,0,-5,x+10,0,-5,x,0,5);
 mesh.meshVerts=Float32Array.from(v);mesh.meshIndices=Uint16Array.from([0,1,2,3,4,5,6,7,8]);
 const p=new T.Vector3(mesh.x,mesh.y,mesh.z),q=new T.Quaternion(),stats={},out={};
 assert.equal(shipVsMesh(p,q,'lancer',1,mesh,out,stats),true);
 assert.ok(Math.abs(out.push-exhaustive(p,q,'lancer',1,mesh))<1e-8);
 assert.equal(stats.meshTriangles,1);
});
test('early mesh rejection keeps solid-core recovery and hollow/empty surfaces unchanged',()=>{
 const mesh=surfaces();mesh.meshVerts=Float32Array.from(mesh.meshVerts,v=>v+1000);mesh.surfaceOnly=false;mesh.minReach=100;
 const p=new T.Vector3(mesh.x,mesh.y,mesh.z),q=new T.Quaternion(),a={},b={};
 assert.equal(shipVsMesh(p,q,'scrapper',1,mesh,a),true);
 assert.equal(shipVsSphere(p,q,'scrapper',1,mesh.x,mesh.y,mesh.z,100,b),true);assert.deepEqual(a,b);
 mesh.surfaceOnly=true;assert.equal(shipVsMesh(p,q,'scrapper',1,mesh,{}),false);
 mesh.meshIndices=new Uint16Array();assert.equal(shipVsMesh(p,q,'scrapper',1,mesh,{}),false);
 mesh.surfaceOnly=false;assert.equal(shipVsMesh(p,q,'scrapper',1,mesh,a),true);assert.deepEqual(a,b);
});
