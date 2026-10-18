import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.min.js';
import {ShipWreckFactory} from '../../src/game/shipWreckFx.js';
import {SpaceRenderer,GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';
import {createHullDebris} from '../../src/game/explosionFx.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {readFile} from 'node:fs/promises';
import {paintShipMaterial} from '../../src/game/shipLivery.js';
const actor={id:'wreck-test',position:[40,70,-90],velocity:[5,-2,7]};
const source=()=>{const root=new T.Group(),texture=new T.DataTexture(new Uint8Array([150,190,210,255]),1,1),material=new T.MeshStandardMaterial({color:0x5678ab,map:texture});root.add(new T.Mesh(new T.BoxGeometry(8,3,18),material));root.position.fromArray(actor.position);root.rotation.set(.2,.4,-.1);return root;};
const disposer={deferShaderDisposal:()=>false};
const dispose=o=>SpaceRenderer.prototype.disposeObject.call(disposer,o);
function finite(effect){for(const s of effect.sections)for(const m of s.group.children){const g=m.geometry;for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));assert.ok(g.attributes.position.count>0);}}
test('closed model sections retain exterior UVs, expose recessed structure, preserve source buffers and reuse templates',()=>{
 const root=source(),factory=new ShipWreckFactory(),original=root.children[0],positions=Array.from(original.geometry.attributes.position.array),uvs=Array.from(original.geometry.attributes.uv.array);
 const ready=factory.prepare(root),e=factory.create(root,actor);assert.equal(e.sections.length,7);finite(e);
 assert.deepEqual(Array.from(original.geometry.attributes.position.array),positions);assert.deepEqual(Array.from(original.geometry.attributes.uv.array),uvs);
 assert.ok(ready.template.sections.every(s=>s.parts.some(p=>p.slot===-1)&&s.parts.some(p=>p.slot===-2)));
 for(const s of ready.template.sections)for(const p of s.parts)assert.equal(p.geometry.userData.shared,true);
 const copy=root.clone(true);copy.children[0].material=original.material.clone();copy.children[0].material.color.setHex(0x339944);
 const next=factory.create(copy,{...actor,id:'other'});assert.equal(factory.cache.size,1);assert.equal(e.sections[0].group.children[0].geometry,next.sections[0].group.children[0].geometry);
 assert.notEqual(e.sections[0].group.children[0].material,next.sections[0].group.children[0].material);assert.notEqual(e.sections[0].group.children[0].material.color.getHex(),next.sections[0].group.children[0].material.color.getHex());
 e.dispose();next.dispose();factory.dispose();
});
test('independent ballistic motion conserves inherited centre velocity and spin keeps progressing without drag',()=>{
 const root=source(),factory=new ShipWreckFactory(),e=factory.create(root,actor),initial=root.position.clone();
 const relative=new T.Vector3();for(const p of e.sections)relative.addScaledVector(p.velocity,p.mass);assert.ok(relative.length()<1e-7);
 e.update(1);const q=e.sections.map(p=>p.group.quaternion.clone()),before=e.sections.map(p=>p.group.position.clone());e.update(1);
 for(const [i,p]of e.sections.entries()){assert.ok(p.group.position.clone().sub(before[i]).distanceTo(p.velocity)<1e-7);assert.ok(p.group.quaternion.angleTo(q[i])>0);}
 assert.ok(e.object.position.distanceTo(initial.addScaledVector(new T.Vector3(...actor.velocity),2))<1e-7);
 assert.ok(new Set(e.sections.map(p=>p.spinRate.toFixed(4))).size>3);
 e.update(5);const middle=e.sections[0].group.position.clone();e.update(1);assert.ok(e.sections[0].group.position.clone().sub(middle).distanceTo(e.sections[0].velocity)<1e-7);
 e.dispose();factory.dispose();
});
test('retiring wrecks never disposes a live ship texture/geometry; cached fracture buffers release once on shutdown',()=>{
 const root=source(),factory=new ShipWreckFactory(),e=factory.create(root,actor);let texture=0,geometry=0,cached=0;root.children[0].material.map.addEventListener('dispose',()=>texture++);root.children[0].geometry.addEventListener('dispose',()=>geometry++);
 const resource=e.sections[0].group.children[0].geometry;resource.addEventListener('dispose',()=>cached++);e.dispose();assert.equal(texture,0);assert.equal(geometry,0);assert.equal(cached,0);factory.dispose();factory.dispose();assert.equal(cached,1);assert.equal(texture,0);assert.equal(geometry,0);
});
test('moving turret joints attach to sections without invalidating the hull fracture cache',()=>{
 const root=source();root.userData.glb=true;const hull=root.children[0];const gun=new T.Group();gun.name='gun_yaw';gun.add(new T.Mesh(new T.BoxGeometry(.4,.4,1),new T.MeshStandardMaterial()));hull.add(gun);
 const factory=new ShipWreckFactory();factory.prepare(root);gun.rotation.y=1.2;const e=factory.create(root,actor);assert.equal(factory.cache.size,1);assert.ok(e.sections.some(p=>p.group.children.some(m=>!m.geometry.userData.shared)));e.dispose();factory.dispose();
});
test('projected faction paint remains in the original mesh frame as fragments separate and rotate',()=>{
 const root=source(),original=root.children[0].material;paintShipMaterial(original,'pirates',new T.Matrix4(),'andromeda');const factory=new ShipWreckFactory(),e=factory.create(root,actor),mesh=e.sections[0].group.children.find(m=>m.material.map===original.map),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>'};
 mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/vrPaintFrame\*vec4\(wreckSourcePosition/);assert.match(shader.vertexShader,/mat3\(vrPaintFrame\)\*wreckSourceNormal/);
 const data=Array.from(mesh.geometry.attributes.wreckSourcePosition.array);e.update(12);assert.deepEqual(Array.from(mesh.geometry.attributes.wreckSourcePosition.array),data);assert.ok(mesh.geometry.attributes.wreckSourceNormal);e.dispose();factory.dispose();
});
test('debris plates are non-rectangular instanced meshes and keep drifting/spinning',()=>{
 const e=createHullDebris(actor.position,1,actor.velocity),m=e.object.children[0];assert.ok(m.isInstancedMesh);assert.equal(m.count,20);assert.ok(m.geometry.attributes.position.count>8);const first=Array.from(m.instanceMatrix.array);e.update(1);assert.notDeepEqual(Array.from(m.instanceMatrix.array),first);assert.deepEqual(e.object.position.toArray(),[45,68,-83]);dispose(e.object);
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),p=m.geometry.attributes.position,index=m.geometry.index;let volume=0;
 for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));volume+=a.dot(b.cross(c))/6;}
 assert.ok(volume>0,'closed plate faces must point outwards');
});
test('separate scene-mounted turrets retain their world pose, receive valid colour attributes and expire without touching live assets',()=>{
 const root=source(),factory=new ShipWreckFactory(),turret=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,1,2),root.children[0].material);turret.add(mesh);turret.position.set(40,73,-85);turret.rotation.y=.7;
 const e=factory.create(root,actor,[turret]);e.object.updateMatrixWorld(true);const part=e.sections.flatMap(p=>p.group.children).find(m=>!m.geometry.userData.shared);assert.ok(part);
 assert.ok(part.getWorldPosition(new T.Vector3()).distanceTo(turret.position)<1e-6);assert.equal(part.geometry.attributes.color.count,part.geometry.attributes.position.count);assert.equal(part.material.map,mesh.material.map);
 let live=0;mesh.material.map.addEventListener('dispose',()=>live++);const renderer=Object.assign(Object.create(SpaceRenderer.prototype),{scene:new T.Scene(),effects:[e],deferShaderDisposal:()=>false});renderer.scene.add(e.object);e.life=.01;e.presented=true;renderer.updateEffects(.02);
 assert.equal(renderer.effects.length,0);assert.equal(e.object.parent,null);assert.equal(live,0);factory.dispose();
});
test('idle prewarm is resumable; interrupted preparation reuses the same job and disposal cancels outstanding work',()=>{
 const callbacks=[],old=globalThis.requestIdleCallback,cancel=globalThis.cancelIdleCallback;globalThis.requestIdleCallback=fn=>(callbacks.push(fn),callbacks.length);globalThis.cancelIdleCallback=()=>{};
 try{const factory=new ShipWreckFactory(),root=source();factory.schedule(root);assert.equal(factory.jobs.size,1);callbacks.shift()({timeRemaining:()=>0});assert.equal(factory.jobs.size,1);const e=factory.create(root,actor);assert.equal(factory.jobs.size,0);assert.equal(factory.cache.size,1);while(callbacks.length)callbacks.shift()({timeRemaining:()=>0});e.dispose();factory.dispose();assert.equal(factory.cache.size,0);assert.equal(factory.geometries.size,0);}finally{globalThis.requestIdleCallback=old;globalThis.cancelIdleCallback=cancel;}
});
test('all current GLB hulls fracture into finite, bounded, textured sections',async()=>{
 const previous=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:1,height:1});const factory=new ShipWreckFactory(),report=[];
 try{for(const [variant,config]of Object.entries(GLB_SHIP_CONFIG)){
  const bytes=await readFile(config.path??`assets/models/ships/${config.file}`),model=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));model.rotation.y=config.yaw;model.scale.setScalar(config.scale*npcShipScaleForVariant(variant));const root=new T.Group();root.userData.glb=true;root.add(model);
  const t=performance.now(),prepared=factory.prepare(root),build=performance.now()-t,warm=performance.now(),e=factory.create(root,{...actor,id:variant}),spawn=performance.now()-warm;
  assert.ok(e.sections.length>=5&&e.sections.length<=9,variant);finite(e);assert.ok(prepared.template.sections.every(s=>s.parts.some(p=>p.slot>=0)),variant+' missing exterior');
  const tris=prepared.template.sections.reduce((n,s)=>n+s.parts.reduce((n,p)=>n+p.geometry.attributes.position.count/3,0),0),draws=prepared.template.sections.reduce((n,s)=>n+s.parts.length,0);assert.ok(draws<90,variant+' excess draw calls');
  e.update(120);for(const p of e.sections)assert.ok(p.group.position.toArray().every(Number.isFinite));report.push({variant,sections:e.sections.length,triangles:tris,draws,buildMs:+build.toFixed(2),spawnMs:+spawn.toFixed(2)});e.dispose();dispose(root);
 }console.log(JSON.stringify({wreckAudit:report}));}finally{factory.dispose();globalThis.createImageBitmap=previous;}
});
