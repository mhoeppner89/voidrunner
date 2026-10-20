import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {prepareGraveyardModel,arrangeGraveyardModel,batchGraveyardModel,batchGraveyardModelAsync,createGraveyardPlating} from '../../src/game/graveyardArt.js';
import {GRAVEYARD_MODEL_WRECKS} from '../../src/game/missionWorldData.js';
import {freezeStaticTransforms} from '../../src/game/renderWork.js';
import {addStationOccupants} from '../../src/game/stationOccupants.js';

test('batched wrecks preserve every vertex, normal, UV, damage coordinate and triangle index',async()=>{
 const previous=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:1024,height:1024});
 const sources=new Map(),seen=new Set(),plating=createGraveyardPlating();let beforeCalls=0,afterCalls=0,checked=0;
 try{for(const config of GRAVEYARD_MODEL_WRECKS){
  const key=config.file+'|'+(config.variant??0);if(seen.has(key))continue;seen.add(key);
  if(!sources.has(config.file)){const bytes=await readFile(new URL('../../'+config.file,import.meta.url));sources.set(config.file,prepareGraveyardModel(await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),plating));}
  const wreck=arrangeGraveyardModel(sources.get(config.file),config);wreck.updateMatrixWorld(true);
  const inverse=wreck.matrixWorld.clone().invert(),originals=new Map();
  const bounds=new THREE.Box3().setFromObject(wreck,true),point=new THREE.Vector3(),normal=new THREE.Vector3();let triangles=0;
  wreck.traverse(mesh=>{if(!mesh.isMesh||!mesh.visible)return;beforeCalls++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;originals.set(mesh.uuid,{mesh,matrix:new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)});});
  batchGraveyardModel(wreck);let nextTriangles=0;
  wreck.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.visible)return;afterCalls++;nextTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
   let indexStart=0;
   for(const section of mesh.userData.graveyardSections??[]){
    const {mesh:old,matrix}=originals.get(section.source),a=old.geometry.attributes,b=mesh.geometry.attributes;
    const data=old.material.userData.graveyardBatch,normals=new THREE.Matrix3().getNormalMatrix(matrix),linear=data&&new THREE.Matrix3().setFromMatrix4(data.frame);
    assert.equal(mesh.material.map,old.material.map,'the original atlas remains shared');
    for(let i=0;i<section.count;i++){
     point.fromBufferAttribute(a.position,i).applyMatrix4(matrix);
     assert.ok(Math.abs(point.x-b.position.getX(section.start+i))<.00002&&Math.abs(point.y-b.position.getY(section.start+i))<.00002&&Math.abs(point.z-b.position.getZ(section.start+i))<.00002,config.id+' position');
     normal.fromBufferAttribute(a.normal,i).applyNormalMatrix(normals);
     assert.ok(normal.distanceTo(point.fromBufferAttribute(b.normal,section.start+i))<.000002,config.id+' normal');
     if(a.uv){assert.equal(b.uv.getX(section.start+i),a.uv.getX(i));assert.equal(b.uv.getY(section.start+i),a.uv.getY(i));}
     if(data){
      point.fromBufferAttribute(a.position,i).applyMatrix4(data.frame);
      assert.ok(point.distanceTo(normal.fromBufferAttribute(b.gyLocalPosition,section.start+i))<.000002,'paint stays in its authored frame');
      point.fromBufferAttribute(a.normal,i).applyMatrix3(linear).normalize();
      assert.ok(point.distanceTo(normal.fromBufferAttribute(b.gyLocalNormal,section.start+i))<.000002);
      assert.equal(b.gyCutBounds.getX(section.start+i),Math.fround(data.cutX.x));assert.equal(b.gyCutBounds.getY(section.start+i),Math.fround(data.cutX.y));
     }
     checked++;
    }
    const count=old.geometry.index?.count??a.position.count;
    for(let i=0;i<count;i++)assert.equal(mesh.geometry.index.getX(indexStart+i),(old.geometry.index?.getX(i)??i)+section.start,'triangle order/winding survives');
    indexStart+=count;
    if(data){const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>'};mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/gyPosition=gyLocalPosition/);assert.doesNotMatch(shader.vertexShader,/gyFrame\*vec4/);assert.match(shader.fragmentShader,/varying vec2 gyCutX/);assert.equal(shader.uniforms.gyPlating.value,plating);}
   }
  });
  assert.equal(nextTriangles,triangles);const nextBounds=new THREE.Box3().setFromObject(wreck,true);assert.ok(bounds.min.distanceTo(nextBounds.min)<.02&&bounds.max.distanceTo(nextBounds.max)<.02,config.id+' bounds');
  const count=wreck.children.length;assert.equal(batchGraveyardModel(wreck),wreck);assert.equal(wreck.children.length,count,'preparation is idempotent');
 }}finally{if(previous)globalThis.createImageBitmap=previous;else delete globalThis.createImageBitmap;}
 assert.ok(checked>100000);assert.ok(afterCalls<beforeCalls*.7,`${beforeCalls} → ${afterCalls} submissions`);
});

test('sliced wreck preparation can be cancelled before touching the model',async()=>{
 const root=new THREE.Group();assert.equal(await batchGraveyardModelAsync(root,{shouldCancel:()=>true}),null);assert.equal(root.userData.graveyardBatched,undefined);
});

test('static transforms stop redundant world products while dynamic children and moved parents remain exact',()=>{
 const make=()=>{const scene=new THREE.Scene(),root=new THREE.Group(),part=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),lift=new THREE.Group();root.position.set(2,3,4);part.position.set(-4,5,1);root.add(part,lift);scene.add(root);return {scene,root,part,lift};};
 const a=make(),b=make();b.scene.matrixAutoUpdate=false;freezeStaticTransforms(b.root,new Set([b.lift]));
 let products=0;const multiply=b.part.matrixWorld.multiplyMatrices;b.part.matrixWorld.multiplyMatrices=function(...args){products++;return multiply.apply(this,args);};
 for(let i=0;i<120;i++){
  for(const model of [a,b]){if(i===60){model.root.position.x=12;model.root.updateMatrix();}model.lift.position.y=Math.sin(i*.03);model.scene.updateMatrixWorld();}
  assert.deepEqual(b.part.matrixWorld.elements,a.part.matrixWorld.elements);assert.deepEqual(b.lift.matrixWorld.elements,a.lift.matrixWorld.elements);
 }
 assert.equal(products,2,'only initial placement and explicit parent movement touch the static part');
});

test('station service fixtures retain their dimensions, finishes and conservative bounds in three or fewer draws',async()=>{
 const load=async()=>new THREE.Mesh(new THREE.BoxGeometry(2,1,3),new THREE.MeshStandardMaterial());
 for(const [id,count,batches]of [['helix',12,2],['argent',42,3]]){
  const dock=await addStationOccupants(new THREE.Group(),id,load);
  const meshes=dock.children.filter(o=>o.isInstancedMesh);assert.equal(meshes.length,batches);assert.equal(meshes.reduce((n,m)=>n+m.count,0),count);
  const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  for(const mesh of meshes)for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);const spec=mesh.userData.fixtures[i];
   for(let corner=0;corner<8;corner++){
    point.set(corner&1?.5:-.5,corner&2?.5:-.5,corner&4?.5:-.5).applyMatrix4(matrix);
    for(let axis=0;axis<3;axis++)assert.ok(Math.abs(point.getComponent(axis)-(spec.position[axis]+(corner&(1<<axis)?.5:-.5)*spec.size[axis]))<.00001);
    assert.ok(mesh.boundingBox.clone().expandByScalar(.00001).containsPoint(point),'partial view bounds include every fixture');
   }
  }
 }
});
