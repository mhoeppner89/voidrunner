import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.min.js';
import {createGraveyardPlating,prepareGraveyardModel,arrangeGraveyardModel} from '../../src/game/graveyardArt.js';
import {GRAVEYARD_MODEL_WRECKS,generateGraveyardPieces,generateWreckNodes,graveyardCollisionMesh} from '../../src/game/worldData.js';
import {LOCATIONS} from '../../src/game/data.js';
import {hullVsAsteroid} from '../../src/game/hullCollision.js';
const identity=new T.Quaternion(),origin=new T.Vector3(...LOCATIONS['mourning-line'].position);
function obstacle(p){const mesh=graveyardCollisionMesh(p),q=new T.Quaternion().setFromEuler(new T.Euler(...p.rotation));return {id:p.id,x:p.position[0],y:p.position[1],z:p.position[2],radius:mesh.radius,meshVerts:mesh.verts,meshIndices:mesh.indices,minReach:mesh.minReach,box:{qx:q.x,qy:q.y,qz:q.z,qw:q.w}};}
function hits(position,reach,obstacles){const contact={};return obstacles.filter(o=>position.distanceTo(new T.Vector3(o.x,o.y,o.z))<=o.radius+reach&&hullVsAsteroid(position,[reach,reach,reach],identity,identity,o,new Float32Array(o.meshVerts.length),contact));}
test('structural ribs preserve the bay flight lane and every salvage pocket across seeds',()=>{
 for(const seed of [1,91,73201]){
  const pieces=generateGraveyardPieces(seed),structure=pieces.filter(p=>p.attachedWreckId),obstacles=structure.map(obstacle);
  assert.ok(structure.filter(p=>!p.interiorPart).length>=16);assert.ok(structure.every(p=>!p.moving&&p.collidable!==false&&p.render!==false));
  assert.ok(pieces.every(p=>!p.id.startsWith('route-')&&p.render!==false),'no invisible legacy hulls or training hoops');
  for(const w of GRAVEYARD_MODEL_WRECKS.filter(w=>w.interior)){
   const bay=w.interior;for(const f of [-.92,-.6,0,.6,.92])for(const y of [-.4,0,.4])for(const z of [-.4,0,.4]){
    const p=new T.Vector3(bay.center[0]+bay.halfLength*f,bay.center[1]+bay.halfHeight*y,bay.center[2]+bay.halfWidth*z).multiplyScalar(w.scale).applyEuler(new T.Euler(...w.rotation)).add(new T.Vector3(...w.local)).add(origin);
    assert.deepEqual(hits(p,12,obstacles),[],`${w.id} flight corridor obstructed`);
   }
  }
  for(const node of generateWreckNodes(seed,{}).filter(n=>n.insideWreckId))assert.deepEqual(hits(new T.Vector3(...node.position),node.radius*1.8,obstacles),[],node.id+' salvage overlaps a structural rib');
 }
});
test('the plating is shared, deterministic and remains fixed to the original hull frame',()=>{
 const texture=createGraveyardPlating(),copy=createGraveyardPlating();assert.equal(texture.image.width,512);assert.deepEqual(texture.image.data,copy.image.data);
 const root=new T.Group(),source=new T.Mesh(new T.BoxGeometry(2,1,1),new T.MeshStandardMaterial({map:new T.Texture(),emissive:0xff0000}));source.name='Test section';root.add(source);const geometry=source.geometry,original=source.material;
 prepareGraveyardModel(root,texture);const config=GRAVEYARD_MODEL_WRECKS[0],a=arrangeGraveyardModel(root,config),b=arrangeGraveyardModel(root,config);
 assert.equal(a.children[0].material,b.children[0].material);assert.equal(a.children[0].geometry,geometry);assert.notEqual(source.material,original);assert.equal(source.material.map,original.map);assert.equal(source.material.emissive.getHex(),0);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>'};source.material.onBeforeCompile(shader);assert.equal(shader.uniforms.gyPlating.value,texture);assert.match(shader.fragmentShader,/gl_FrontFacing/);assert.match(shader.vertexShader,/gyFrame\*vec4\(position/);
 texture.dispose();copy.dispose();geometry.dispose();original.dispose();source.material.dispose();
});

test('every current hull retains fitted equipment, and four dense clouds stay bounded and deterministic',()=>{
 const pieces=generateGraveyardPieces(91),again=generateGraveyardPieces(91);
 assert.deepEqual(pieces,again);
 for(const wreck of GRAVEYARD_MODEL_WRECKS)assert.ok(pieces.some(p=>p.attachedWreckId===wreck.id&&p.interiorPart),wreck.id+' is empty');
 const clouds=Map.groupBy(pieces.filter(p=>p.debrisCloud),p=>p.debrisCloud);assert.equal(clouds.size,4);
 for(const [id,cloud]of clouds){assert.equal(cloud.length,96,id);assert.ok(cloud.some(p=>p.collidable===false));assert.ok(cloud.some(p=>p.collidable!==false));
  const centre=cloud.reduce((v,p)=>v.add(new T.Vector3(...p.position)),new T.Vector3()).multiplyScalar(1/cloud.length);
  assert.ok(cloud.every(p=>new T.Vector3(...p.position).distanceTo(centre)<250),id+' is not a compact pocket');
  assert.ok(cloud.every(p=>Math.max(...p.scale)<=11&&p.render!==false&&!p.moving));
 }
});
test('installed wreck assets record their current ship sources and indexed geometry',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 for(const wreck of GRAVEYARD_MODEL_WRECKS.filter((w,i,all)=>all.findIndex(x=>x.file===w.file)===i)){
  const data=await readFile(wreck.file),json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12))),provenance=json.asset.extras;
  assert.equal(provenance.sha256,createHash('sha256').update(await readFile(provenance.source)).digest('hex'),wreck.id+' uses an outdated hull');
  assert.ok(json.meshes.every(m=>m.primitives.every(p=>p.indices!==undefined)),'wreck geometry must share indexed vertices');

 }
});


test('every passage is open from outside to outside in rendered geometry and real collision',async()=>{
 const {readFile}=await import('node:fs/promises'),{buildGlbScene}=await import('../../src/game/glbLoader.js'),{GRAVEYARD_MODEL_COLLIDERS}=await import('../../src/game/worldData.js');
 const models=GRAVEYARD_MODEL_COLLIDERS.map(p=>({id:p.id,x:p.position[0],y:p.position[1],z:p.position[2],radius:p.collisionRadius,meshVerts:p.meshVerts,meshIndices:p.meshIndices,minReach:p.minReach,surfaceOnly:p.surfaceOnly,box:{qx:p.quaternion[0],qy:p.quaternion[1],qz:p.quaternion[2],qw:p.quaternion[3]}}));
 const pieces=generateGraveyardPieces(91).filter(p=>p.collidable!==false&&p.kind!=='engine').map(obstacle),obstacles=[...models,...pieces];
 const oldBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:512,height:512});
 try{for(const wreck of GRAVEYARD_MODEL_WRECKS.filter(w=>w.passages?.length)){
  for(const route of wreck.passages){const rotation=new T.Euler(...wreck.rotation),world=p=>new T.Vector3(...p).multiplyScalar(wreck.scale).applyEuler(rotation).add(new T.Vector3(...wreck.local)).add(origin);
  const from=world([route.center[0],route.center[1],route.center[2]-route.halfLength]),to=world([route.center[0],route.center[1],route.center[2]+route.halfLength]);
  const data=await readFile(wreck.file),source=await buildGlbScene(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),mesh=arrangeGraveyardModel(source,wreck);mesh.position.fromArray(wreck.local).add(origin);mesh.updateMatrixWorld(true);
  const ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,from.distanceTo(to));
  assert.deepEqual(ray.intersectObject(mesh,true).map(h=>h.object.name),[],wreck.id+' visible wall blocks the end-to-end passage');
  for(const [x,y]of [[0,0],[-.35,0],[.35,0],[0,-.35],[0,.35]]){
   const steps=Math.ceil(from.distanceTo(to)/8);
   for(let i=0;i<=steps;i++){
    const point=world([route.center[0]+x*route.halfWidth,route.center[1]+y*route.halfHeight,route.center[2]+route.halfLength*(2*i/steps-1)]);
    assert.deepEqual(hits(point,12,obstacles).map(o=>o.id),[],wreck.id+' passage blocks a full-size hull at '+i+'/'+steps);
   }
  }
 }}}finally{globalThis.createImageBitmap=oldBitmap;}
});
