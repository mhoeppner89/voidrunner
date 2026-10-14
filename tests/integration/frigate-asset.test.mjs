import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {paintShipMaterial} from '../../src/game/shipLivery.js';

test('frigate turret UVs reuse the hull maps without painting other ships or damaged neighbors',async()=>{
 const {createTurretModel,paintFrigateTurret}=await import('../../src/game/turretModels.js');
 const {setFrigateComponentDamage}=await import('../../src/game/frigateComponents.js');
 const hull=new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture(),metalnessMap:new THREE.Texture(),emissiveMap:new THREE.Texture(),emissive:0xffffff});
 let shared;
 for(const kind of ['laser','pdc']){
  const a=createTurretModel(kind,'M'),b=createTurretModel(kind,'M'),plain=createTurretModel(kind,'M');paintFrigateTurret(a,hull);paintFrigateTurret(b,hull);
  a.traverse(o=>{if(!o.isMesh)return;const m=o.material;shared??=m;assert.equal(m,shared);
   for(const slot of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])assert.equal(m[slot],hull[slot]);
   const g=o.geometry;assert.equal(g.attributes.uv.count,g.attributes.position.count);assert.equal(g.attributes.tangent.itemSize,4);
   for(const i of g.index.array){for(const x of [g.attributes.uv.getX(i),g.attributes.uv.getY(i)])assert.ok(x>0&&x<1);assert.ok(Math.hypot(g.attributes.tangent.getX(i),g.attributes.tangent.getY(i),g.attributes.tangent.getZ(i))>.99,'used vertices have valid normal-map tangents');}
  });
  plain.traverse(o=>{if(o.isMesh)assert.equal(o.material.map,null,'generic turrets retain their own paint');});
  setFrigateComponentDamage(a,30,100);b.traverse(o=>{if(o.isMesh)assert.equal(o.material,shared);});
  setFrigateComponentDamage(a,100,100);a.traverse(o=>{if(o.isMesh)assert.equal(o.material,shared);});
 }
 const laser=createTurretModel('laser','M'),tip=laser.userData.pitch.children.find(o=>o.material.color.g>.6);
 assert.ok([...tip.geometry.attributes.uv.array].filter((_,i)=>i%2===1).every(v=>v<.125),'cyan emission tile uses the glTF texture row convention');
});

test('forward frigate batteries attach to the marked bow bevel and keep its normal through interpolated roll',async()=>{
 const {SpaceRenderer}=await import('../../src/game/render.js');
 const {FRIGATE_MOUNTS}=await import('../../src/game/frigateMounts.js');
 const {FRIGATE_COLLISION_TRIANGLES}=await import('../../src/game/frigateCollisionData.js');
 const {equipFrigate,frigateMountPosition}=await import('../../src/game/capitalCombat.js');
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(FRIGATE_COLLISION_TRIANGLES,3));
 const hull=new THREE.Mesh(g,new THREE.MeshBasicMaterial());hull.updateMatrixWorld(true);
 for(const index of [0,2]){
  const m=FRIGATE_MOUNTS[index],normal=new THREE.Vector3().fromArray(m.normal),point=new THREE.Vector3().fromArray(m.position).multiply(new THREE.Vector3(37.46,44.92,112.9));
  assert.ok(point.z<-65&&point.y<0,'battery sits on the bow bevel ahead of the collar');
  const hit=new THREE.Raycaster(point,normal.clone().negate()).intersectObject(hull)[0];
  assert.ok(hit);assert.ok(hit.face.normal.dot(normal)>.999,'turret aligns to the actual hull facet');
  const baseDepth=.59*1.3*112.9/18;assert.ok(Math.abs(hit.distance-(baseDepth-.12))<.015,'mount base penetrates armor slightly without floating');
  const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();r.shipMeshes=new Map();const body=new THREE.Group();r.shipMeshes.set('fit',body);
  const actor={id:'fit',capitalClass:'frigate',position:[20,30,40],rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,.3)).toArray(),speed:18,lifetime:1};equipFrigate(actor);
  const q=new THREE.Quaternion().fromArray(actor.rotation),start=frigateMountPosition(actor,index,new THREE.Vector3()),direction=normal.clone().applyQuaternion(q);
  r.showTurret(`fit-main-${index}`,start,direction,'M','laser',q,m.side,0,112.9/18,m.axis,actor);
  for(const alpha of [0,.4,1]){
   body.position.set(-10,20,35).lerp(new THREE.Vector3(...actor.position),alpha);body.quaternion.identity().slerp(q,alpha);r.syncTurretAttachments(alpha);
   const gun=r.turretMeshes.get(`fit-main-${index}`),actual=new THREE.Vector3(0,1,0).applyQuaternion(gun.quaternion).applyQuaternion(body.quaternion.clone().invert());
   assert.ok(actual.distanceTo(normal)<1e-6,'mount normal follows interpolated hull rotation');
   assert.ok(gun.position.clone().sub(body.position).applyQuaternion(body.quaternion.clone().invert()).distanceTo(point)<1e-8);
  }
 }
});

test('launcher and generator armor is closed, faces outward and has planar normals',async()=>{
 const {createFrigateSystems}=await import('../../src/game/frigateComponents.js');
 const {FRIGATE_TORPEDO_LAYOUT:l}=await import('../../src/game/frigateMounts.js');
 const systems=createFrigateSystems('geometry-check');
 for(const index of [9,10,11]){
  const part=systems.userData.components.get(index),housings=part.children.filter(o=>o.name==='armored-housing');
  assert.equal(housings.length,3);
  for(const housing of housings){
   const g=housing.geometry,p=g.attributes.position,n=g.attributes.normal,edges=new Map();let volume=0;
   const v=k=>new THREE.Vector3().fromBufferAttribute(p,k),key=v=>v.toArray().map(x=>x.toFixed(5)).join(',');
   for(let i=0;i<p.count;i+=3){
    const a=v(i),b=v(i+1),c=v(i+2),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    volume+=a.dot(b.clone().cross(c))/6;
    for(let j=0;j<3;j++)assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(n,i+j))>.99999,'armor corners retain flat face normals');
    for(const [u,w]of [[a,b],[b,c],[c,a]]){const edge=[key(u),key(w)].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
   }
   assert.ok(volume>0,'sealed housing has outward winding');
   assert.ok([...edges.values()].every(count=>count===2),'every welded edge belongs to two faces');
   const probe=new THREE.Mesh(g,housing.material);probe.updateMatrixWorld(true);g.computeBoundingBox();
   const center=g.boundingBox.getCenter(new THREE.Vector3());
   for(const axis of [0,1,2])for(const side of [-1,1]){
    const direction=new THREE.Vector3().setComponent(axis,side),origin=center.clone().addScaledVector(direction,30);
    const hit=new THREE.Raycaster(origin,direction.clone().negate()).intersectObject(probe)[0];
    assert.ok(hit,`outside face visible on axis ${axis}, side ${side}`);
    assert.ok(hit.face.normal.dot(direction)>.99,'outside ray hits the near wall');
   }
  }
  if(index<11)continue;
  const floors=part.children.filter(o=>o.name==='launch-cell-floor'),cap=housings.at(-1);
  cap.geometry.computeBoundingBox();assert.equal(floors.length,4);
  for(const floor of floors){assert.ok(floor.position.y>cap.geometry.boundingBox.max.y,'dark cell floor remains above the solid armor cap');assert.ok(floor.position.y<l.rimHeight,'cell floor remains inside the raised rim');}
  const rim=part.children.find(o=>o.name==='launch-cell-rim'),probe=new THREE.Mesh(rim.geometry,rim.material);probe.updateMatrixWorld(true);
  const radial=new THREE.Vector3(Math.cos(Math.PI/6),0,Math.sin(Math.PI/6));
  const outside=new THREE.Raycaster(radial.clone().multiplyScalar(4).setY(l.capHeight+.15),radial.clone().negate()).intersectObject(probe)[0];
  const inside=new THREE.Raycaster(new THREE.Vector3(0,l.capHeight+.15,0),radial).intersectObject(probe)[0];
  const top=new THREE.Raycaster(radial.clone().multiplyScalar(1.4).setY(10),new THREE.Vector3(0,-1,0)).intersectObject(probe)[0];
  assert.ok(outside?.face.normal.dot(radial)>.99,'cell exterior faces out');
  assert.ok(inside?.face.normal.dot(radial)<-.99,'cell interior faces the cavity');
  assert.ok(top?.face.normal.y>.99,'cell lip faces up');
 }
});

test('shipped frigate keeps its source frame, low-poly budget and normal-map tangents',async t=>{
 // Image pixels are decoded in the browser smoke check; here inspect PNG dimensions.
 globalThis.createImageBitmap??=async()=>({});
 t.mock.method(globalThis,'createImageBitmap',async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};});
 const bytes=await readFile(new URL('../../assets/models/capital/concord-frigate.glb',import.meta.url));
 const model=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 let tris=0,mesh;model.traverse(o=>{if(o.isMesh){mesh=o;tris+=o.geometry.index.count/3;}});
 assert.equal(tris,3821);assert.ok(tris<5000);
 assert.equal(mesh.geometry.attributes.tangent.itemSize,4);
 assert.equal(mesh.geometry.attributes.tangent.count,mesh.geometry.attributes.position.count);
 assert.deepEqual([mesh.material.normalMap.image.width,mesh.material.normalMap.image.height],[512,512]);
 assert.equal(mesh.material.normalMap.colorSpace,THREE.NoColorSpace);
 assert.ok(Math.abs(mesh.material.normalScale.x-.55)<1e-6);
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-30.215/16)<.005,'length remains on the original X axis');
 assert.ok(Math.abs(size.z-10.6/16)<.005,'width preserves existing capital scale');
 assert.ok(box.min.x<-.88 && box.max.x>.99,'origin is not recentered');
 assert.equal(paintShipMaterial(mesh.material,'concord',undefined,'concord-frigate'),false);
 const redMaterial=mesh.material.clone();
 assert.equal(paintShipMaterial(redMaterial,'pirates',undefined,'concord-frigate'),true,'explicit alternate paint still works');
 assert.match(redMaterial.customProgramCacheKey(),/frigate-atlas-detail/);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>'};redMaterial.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/clamp\(0\.58\+\(paintLum-0\.5\)\*1\.65,0\.12,1\.25\)/,'Red Talons keep strong atlas luminance contrast for panel seams, scuffs and pale armor');
});

test('complete frigate equipment stays below ten thousand triangles and damage is isolated and repairable',async()=>{
 const {createFrigateSystems,setFrigateComponentDamage,updateFrigateSystems,frigateEngineFraction}=await import('../../src/game/frigateComponents.js');
 const {createTurretModel}=await import('../../src/game/turretModels.js');
 const {FRIGATE_MOUNTS,FRIGATE_ENGINE_MOUNTS}=await import('../../src/game/frigateMounts.js');
 const {equipFrigate,damageFrigateMount,frigateMountPosition}=await import('../../src/game/capitalCombat.js');
 const systems=createFrigateSystems('test'),other=createFrigateSystems('other');let triangles=3821;
 const count=o=>o.traverse(m=>{if(m.isMesh)triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});count(systems);
 for(let i=0;i<8;i++)count(createTurretModel(i<4?'laser':'pdc',i<4?'M':'S'));
 assert.equal(triangles,9301);assert.ok(triangles<10000);assert.equal(systems.userData.components.size,6);
 const ship={capitalClass:'frigate',position:[0,0,0],rotation:[0,0,0,1],speed:18};equipFrigate(ship);
 for(const [i,part]of systems.userData.components){
  const healthy=part.children.find(m=>m.isMesh).material;
  setFrigateComponentDamage(part,FRIGATE_MOUNTS[i].hull*.4,FRIGATE_MOUNTS[i].hull);assert.equal(part.userData.scars.visible,false,'avoid stepwise scorch marks before a component is destroyed');
  assert.equal(other.userData.components.get(i).children.find(m=>m.isMesh).material,healthy,'neighboring ship retains healthy shared material');
  setFrigateComponentDamage(part,0,FRIGATE_MOUNTS[i].hull);assert.equal(part.userData.scars.visible,true,'show damage marks when the component is destroyed');
  if(FRIGATE_MOUNTS[i].kind==='engine'){assert.equal(part.userData.output.visible,false);assert.equal(part.userData.soot.visible,true);assert.equal(part.userData.deadCap.visible,true);}
  setFrigateComponentDamage(part,FRIGATE_MOUNTS[i].hull,FRIGATE_MOUNTS[i].hull);assert.equal(part.children.find(m=>m.isMesh).material,healthy);assert.equal(part.userData.scars.visible,false);
 }
 for(let flare=0;flare<3;flare++){
  const index=FRIGATE_ENGINE_MOUNTS[flare];damageFrigateMount(ship,frigateMountPosition(ship,index,new THREE.Vector3()).toArray(),160);
  assert.equal(frigateEngineFraction(ship,flare),0);
 }
 assert.ok(Math.abs(ship.speed-2.7)<1e-6);assert.ok(Math.abs(ship.turnRate-.0144)<1e-6);
 equipFrigate(ship);updateFrigateSystems(systems,ship);assert.equal(ship.speed,18);assert.equal(ship.turnRate,.12);
 for(let i=0;i<3;i++)assert.equal(frigateEngineFraction(ship,i),1);
});
