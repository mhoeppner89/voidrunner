import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../vendor/three.module.min.js';
import {SpaceRenderer,GLB_SHIP_CONFIG} from '../../src/game/render.js';
import {GameSession} from '../../src/game/game.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {CARRIER_MOUNTS,CARRIER_ENGINE_GLOWS} from '../../src/game/carrierModelData.js';
import {updateCapitalEngineExhaust} from '../../src/game/capitalEngineExhaust.js';

const variant='concord-carrier',config=GLB_SHIP_CONFIG[variant],base='../fixtures/current-fleet/concord-carrier/';
const read=p=>JSON.parse(readFileSync(new URL(base+p,import.meta.url)));
const handoff=read('handoff.json'),runtime=read('runtime-handoff.json'),installed=read('integration/install-report.json');
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
const bytes=path=>readFileSync(new URL('../../'+path,import.meta.url));
function renderer(){const r=Object.create(SpaceRenderer.prototype);r.glbShipModels=new Map();r.glbShipLoading=new Map();r.createDronePorts=()=>new THREE.Group();r.radialTexture=()=>new THREE.Texture();return r;}

test('shipping carrier is exactly the approved export with metric PBR and no duplicate guns',async()=>{
 const b=bytes(config.path);assert.equal(createHash('sha256').update(b).digest('hex'),handoff.files['candidate.glb'].sha256);
 const root=await buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 let triangles=0;root.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  if(o.material.map)assert.ok(o.geometry.attributes.uv);
  if(o.material.normalMap)assert.ok(o.geometry.attributes.tangent);
  if(o.material.name.startsWith('Carrier scale')){assert.equal(o.material.map.image.width,1024);assert.equal(o.material.normalMap.image.width,1024);assert.equal(o.material.roughnessMap.image.width,256);}
 });
 assert.equal(triangles,23978);assert.equal(installed.hullTriangles,19490);assert.ok(installed.hullTriangles<20000);
 assert.equal(CARRIER_MOUNTS.length,14);assert.equal(CARRIER_MOUNTS.filter(m=>m.kind==='battery').length,4);
 assert.equal(runtime.windows.windowPanes,5767);assert.equal(handoff.changes.removedNavigationWindowHousings.length,10);
 assert.equal(config.scale,451.2754);assert.equal(config.baseScale,1);
 const extents=GameSession.prototype.npcHullExtents.call({}, {variant});
 extents.forEach((v,i)=>assert.ok(Math.abs(v-installed.halfExtents[i]*2)<1e-8));
});

test('async game loader retains all articulated gun geometry, paint, clear muzzles and window emission',async()=>{
 const previousFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async path=>{requests.push(path);const b=bytes(path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 try{
  const r=renderer();r.ensureGlbShipModel(variant);await r.glbShipLoading.get(variant);
  assert.deepEqual(requests,[config.path]);const model=r.glbShipModels.get(variant);assert.ok(model);
  assert.deepEqual(model.scale.toArray(),[902.5508,902.5508,902.5508]);
  const ship={id:'carrier',variant,faction:'concord',role:'patrol',velocity:[0,0,0],speed:4.5};
  const body=r.createGlbShipMesh(ship,model,config,variant),guns=body.userData.carrierArmament.children;
  body.updateMatrixWorld(true);assert.equal(guns.length,14);
  const ray=new THREE.Raycaster();ray.near=.004;ray.far=3600;
  for(const [i,gun]of guns.entries()){
   const m=runtime.turrets[i],pitch=gun.userData.pitch;
   assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...m.runtimePosition))<.001);
   assert.equal(gun.userData.yaw.matrixAutoUpdate,true);assert.equal(pitch.matrixAutoUpdate,true);
   gun.traverse(o=>{if(o.isMesh){assert.ok(o.material.map);assert.equal(o.userData.targetId,'carrier');}});
   const forward=new THREE.Vector3(0,0,-1).transformDirection(pitch.matrixWorld),spacing=m.kind==='battery'?.34:.18,tip=m.kind==='battery'?2.65:1.24;
   for(const [j,x]of [-spacing,spacing].entries()){
    const point=pitch.localToWorld(new THREE.Vector3(x,0,-tip).multiplyScalar(m.size/902.5508));
    assert.ok(point.distanceTo(new THREE.Vector3(...m.runtimeMuzzles[j]))<.001,m.id+' muzzle socket');
    ray.set(point,forward);assert.equal(ray.intersectObject(body,true).length,0,m.id+' clear muzzle');
   }
  }
  const glazing=body.userData.emissiveMaterials.find(m=>m.name.startsWith('Carrier habitation glazing'));
  let sourceGlazing;model.traverse(o=>{if(o.material?.name.startsWith('Carrier habitation glazing'))sourceGlazing=o.material;});
  assert.ok(glazing);assert.ok(sourceGlazing.emissiveIntensity>0);assert.equal(glazing.userData.minimumEmissiveIntensity,sourceGlazing.emissiveIntensity);assert.equal(glazing.polygonOffset,true);
  const other=r.createGlbShipMesh({...ship,id:'other'},model,config,variant);
  const a=guns[0].userData.yaw,b=other.userData.carrierArmament.children[0].userData.yaw;
  a.rotation.y=.2;a.updateMatrixWorld(true);assert.equal(b.rotation.y,0);assert.notEqual(a,b);
  body.position.set(50,100,250);body.rotation.set(.3,.4,1.2);body.updateMatrixWorld(true);
  for(const [i,gun]of guns.entries())assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(body.localToWorld(new THREE.Vector3(...runtime.turrets[i].runtimePosition)))<.001);
 }finally{globalThis.fetch=previousFetch;}
});

test('carrier glow stays in the measured annuli, clears its nozzles and keeps the centre plugs visible',async()=>{
 const b=bytes(config.path),model=await buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),r=renderer();r.prepareGlbShip(model,config,variant);
 const ship={id:'carrier',variant,faction:'concord',role:'patrol',velocity:[0,0,0],speed:4.5},body=r.createGlbShipMesh(ship,model,config,variant);
 body.updateMatrixWorld(true);assert.equal(body.userData.engineFlares.length,0);const fx=body.userData.capitalExhaust;assert.equal(fx.children.length,3);
 const ray=new THREE.Raycaster();ray.near=.01;ray.far=3600;
 for(const [i,e]of fx.children.entries()){
  const m=CARRIER_ENGINE_GLOWS[i];assert.deepEqual(e.position.toArray(),runtime.exhausts[i].runtimeGlowCenter);
  assert.equal(e.userData.face.scale.x,m.radius*2);assert.equal(e.userData.face.material.uniforms.uInnerRadius.value,m.innerRadius);
  assert.ok(m.innerRadius>.7);assert.equal(e.userData.halo.visible,false);assert.equal(e.userData.jets.length,0);
  for(let k=0;k<32;k++)for(const fraction of [.79,.85,.93]){
   const p=e.position.clone().add(new THREE.Vector3(Math.cos(k*Math.PI/16)*m.radius*fraction,Math.sin(k*Math.PI/16)*m.radius*fraction,0));
   ray.set(p,new THREE.Vector3(0,0,1));assert.equal(ray.intersectObject(body,true).length,0,'annular exit clears the nozzle');
  }
 }
 updateCapitalEngineExhaust(fx,ship,2);assert.ok(fx.children.every(e=>e.visible));
 ship.stationDock={phase:'docked'};updateCapitalEngineExhaust(fx,ship,3);assert.ok(fx.children.every(e=>!e.visible));
});
