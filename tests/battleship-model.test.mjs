import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.min.js';
import {SpaceRenderer,GLB_SHIP_CONFIG} from '../src/game/render.js';
import {buildGlbScene} from '../src/game/glbLoader.js';
import {BATTLESHIP_MOUNTS,BATTLESHIP_ENGINE_GLOWS} from '../src/game/battleshipModelData.js';
import {updateCapitalEngineExhaust} from '../src/game/capitalEngineExhaust.js';

const variant='concord-battleship',config=GLB_SHIP_CONFIG[variant];
const review=new URL('./fixtures/current-fleet/concord-battleship/',import.meta.url);
const handoff=JSON.parse(readFileSync(new URL('runtime-handoff.json',review)));
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
const bytes=path=>readFileSync(new URL('../'+path,import.meta.url));
const decode=path=>{const b=bytes(path);return buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
function renderer(){const r=Object.create(SpaceRenderer.prototype);r.glbShipModels=new Map();r.glbShipLoading=new Map();r.createDronePorts=()=>new THREE.Group();r.radialTexture=()=>new THREE.Texture();return r;}

test('shipping hull is byte-identical to the approved model; packed armament paint contains only one hidden carrier triangle',async()=>{
 assert.equal(createHash('sha256').update(bytes(config.path)).digest('hex'),handoff.verification.sha256);
 const carrier=await decode(config.armamentPaintPath);let triangles=0,paint;
 carrier.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;paint=o.material;}});
 assert.equal(triangles,1);assert.equal(paint.name,'Battleship armament atlas');
 const source=await buildGlbScene((()=>{const b=bytes('assets/models/capital/concord-battleship-armament.glb');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);})());
 let original;source.traverse(o=>{if(o.isMesh&&!original)original=o.material;});
 for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])assert.equal(!!paint[key],!!original[key],key);
 assert.deepEqual(paint.color.toArray(),original.color.toArray());assert.equal(paint.roughness,original.roughness);
});

test('real async loader installs 40 painted mounts, clears all 80 muzzles and carries them with the rigid hull',async()=>{
 const previousFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async path=>{requests.push(path);const b=bytes(path);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 const r=renderer();
 try{
  r.ensureGlbShipModel(variant);await r.glbShipLoading.get(variant);
  assert.deepEqual(requests,[config.path,config.armamentPaintPath]);
  const model=r.glbShipModels.get(variant);assert.ok(model);assert.deepEqual(model.scale.toArray(),[1130,1130,1130]);
  const ship={id:'battle',variant,faction:'concord',role:'patrol',velocity:[0,0,0],speed:5};
  const body=r.createGlbShipMesh(ship,model,config,variant),guns=body.userData.battleshipArmament.children;
  assert.equal(guns.length,40);assert.equal(BATTLESHIP_MOUNTS.filter(m=>m.kind==='battery').length,20);assert.equal(BATTLESHIP_MOUNTS.filter(m=>m.kind==='pdc').length,20);
  assert.equal(body.userData.engineFlares.length,0);assert.equal(body.userData.capitalExhaust.children.length,4);
  const glass=body.userData.emissiveMaterials.find(m=>m.name.startsWith('VR_Canopy_'));
  assert.equal(glass.userData.minimumEmissiveIntensity,1);assert.equal(glass.polygonOffset,true);assert.equal(glass.polygonOffsetUnits,-4);
  body.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.near=.001;ray.far=4520;
  for(const [i,gun] of guns.entries()){
   const m=handoff.armament[i];assert.deepEqual(gun.position.toArray(),m.positionRuntime);assert.equal(gun.scale.x,m.size);
   gun.traverse(o=>{if(o.isMesh){assert.equal(o.material.map,body.userData.battleshipArmorMaterial.map);assert.equal(o.userData.targetId,'battle');assert.equal(o.userData.targetKind,'ship');}});
   const d=new THREE.Vector3(0,0,-1).transformDirection(gun.userData.pitch.matrixWorld),spacing=m.kind==='battery'?.34:.18,tip=m.kind==='battery'?2.65:1.24;
   for(const [j,x] of [-spacing,spacing].entries()){
    const p=gun.userData.pitch.localToWorld(new THREE.Vector3(x,0,-tip));
    assert.ok(p.distanceTo(new THREE.Vector3().fromArray(m.muzzlesRuntime[j]))<.001,m.label+' socket');
    ray.set(p.clone().addScaledVector(d,.004),d);assert.equal(ray.intersectObject(body,true).length,0,m.label+' muzzle clearance');
   }
  }
  body.position.set(50,100,250);body.rotation.set(.3,.4,1.2);body.updateMatrixWorld(true);
  for(const [i,gun] of guns.entries())assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(body.localToWorld(new THREE.Vector3().fromArray(BATTLESHIP_MOUNTS[i].position)))<1e-8);
  for(const [i,e] of body.userData.capitalExhaust.children.entries()){
   assert.deepEqual(e.position.toArray(),handoff.engines[i].glow.positionRuntime);assert.equal(e.userData.face.scale.x,handoff.engines[i].glow.radiiRuntime[0]*2);assert.equal(e.userData.halo.visible,false);
  }
  updateCapitalEngineExhaust(body.userData.capitalExhaust,ship,1);const jet=body.userData.capitalExhaust.children[0].userData.jets[0],idle=jet.scale.y;
  ship.burning=true;updateCapitalEngineExhaust(body.userData.capitalExhaust,ship,2);assert.ok(jet.scale.y>idle*2);
  ship.stationDock={phase:'docked'};updateCapitalEngineExhaust(body.userData.capitalExhaust,ship,3);assert.ok(body.userData.capitalExhaust.children.every(e=>!e.visible));
  assert.equal(BATTLESHIP_ENGINE_GLOWS.length,4);
 }finally{globalThis.fetch=previousFetch;}
});
