import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {SpaceRenderer,GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';
import {GameSession} from '../../src/game/game.js';
import {SHIP_MOUNT_ANCHORS} from '../../src/game/shipMounts.js';
import {TURRET_LAYOUTS} from '../../src/game/turretLayouts.js';
import {TURRET_CLEARANCE} from '../../src/game/turretClearance.js';
import {clearTurretArc} from '../../src/game/turrets.js';
import {disposeObject} from '../../src/game/shipPreview.js';
const path='tests/fixtures/current-fleet/vanguard/',handoff=JSON.parse(await readFile(path+'handoff.json')),runtime=JSON.parse(await readFile(path+'runtime-handoff.json'));
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
const load=async p=>{const b=await readFile(p);return buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const hull=await load('assets/models/ships/vanguard.glb'),cfg=GLB_SHIP_CONFIG.warden;
hull.rotation.y=cfg.yaw;hull.scale.setScalar(cfg.scale);hull.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(hull),extent=[0,1,2].map(i=>Math.max(Math.abs(box.min.getComponent(i)),Math.abs(box.max.getComponent(i))));
hull.traverse(o=>{if(o.isMesh)o.material.side=T.DoubleSide;});
const ray=(p,d,far=100)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),1e-5,far).intersectObject(hull,true);
test('shipyard disposal keeps shared turret templates and releases its own atlas once',()=>{
 const root=new T.Group(),sharedGeometry=new T.BoxGeometry(),sharedMaterial=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry(),texture=new T.Texture(),material=new T.MeshStandardMaterial({map:texture,normalMap:texture});
 sharedGeometry.userData.shared=true;sharedMaterial.userData.shared=true;
 const counts={sharedGeometry:0,sharedMaterial:0,geometry:0,texture:0,material:0};
 for(const [key,value]of Object.entries({sharedGeometry,sharedMaterial,geometry,texture,material}))value.addEventListener('dispose',()=>counts[key]++);
 root.add(new T.Mesh(sharedGeometry,sharedMaterial),new T.Mesh(sharedGeometry,material),new T.Mesh(geometry,material));disposeObject(root);
 assert.deepEqual(counts,{sharedGeometry:0,sharedMaterial:0,geometry:1,texture:1,material:1});
});
test('shipping Vanguard is the exact approved clean hull with packed paint',async()=>{
 const bytes=await readFile('assets/models/ships/vanguard.glb');assert.equal(createHash('sha256').update(bytes).digest('hex'),handoff.candidateSHA256);
 let triangles=0;hull.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.geometry.attributes.uv);assert.ok(o.geometry.attributes.tangent);});assert.equal(triangles,4674);assert.ok(triangles<5000);

});
test('player and NPC collision calibration and all firing/nozzle anchors match the approved geometry',()=>{
 extent.forEach((v,i)=>assert.ok(Math.abs(v-runtime.recommendedCollisionHalfExtentsPlayer[i])<1e-8));
 const npc=GameSession.prototype.npcHullExtents.call({}, {variant:'warden'});npc.forEach((v,i)=>assert.ok(Math.abs(v-extent[i]*npcShipScaleForVariant('warden'))<1e-8));
 for(const [key,rows]of [['guns',runtime.guns],['launchers',runtime.launchers],['drive',runtime.engines]])assert.deepEqual(SHIP_MOUNT_ANCHORS.vanguard[key],rows.map(m=>m.runtimePlayer[key==='drive'?'center':'position']));
 for(const m of [...runtime.guns,...runtime.launchers]){assert.equal(ray(m.runtimePlayer.position,[0,0,-1]).length,0);assert.ok(ray(m.runtimePlayer.position,[0,0,1],1).length);}
 assert.equal(cfg.enginePorts.length,runtime.engines.length);
 for(const m of runtime.engines){assert.equal(ray(m.runtimePlayer.center,[0,0,1]).length,0);assert.ok(ray(m.runtimePlayer.center,[0,0,-1],1).length);}
});
test('both turret rings are physically seated, forward muzzles clear the hull and inward firing stays blocked',()=>{
 for(const [i,m]of TURRET_LAYOUTS.vanguard.entries()){
  assert.equal(m.reviewed,true);assert.deepEqual(m.restDirection,[0,0,-1]);
  const pivot=m.position.map((v,k)=>v*extent[k]),scale=extent[2]/m.hullHalfLength;
  const normal=new T.Vector3(...m.normal),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),normal),
   radius=.48*(m.footprintScale??1),points=[[0,0],...Array.from({length:64},(_,k)=>[Math.cos(k*Math.PI/32)*radius,Math.sin(k*Math.PI/32)*radius])];
  for(const [x,z]of points){const p=new T.Vector3(x*scale,0,z*scale).applyQuaternion(q).add(new T.Vector3(...pivot));const hit=ray(p.toArray(),normal.clone().negate().toArray(),2*scale)[0];
   assert.ok(hit,`${m.label}: base ring must contact the hull`);
   const gap=hit.distance/scale-.59;
   if(gap>0){const seatRadius=.42+(.48-.42)*Math.min(1,gap/(m.pedestal||1));
    assert.ok(gap<=(m.pedestal??0)+.01,`${m.label}: seat connector spans the hull gap`);
    assert.ok(radius<=seatRadius+.015,`${m.label}: tapered connector supports the fitted foot edge`);
   }else assert.ok(gap>=-.12,`${m.label}: foot is not buried into the hull`);
  }
  assert.equal(ray([pivot[0],pivot[1],pivot[2]-.82*scale],[0,0,-1]).length,0);
  assert.equal(TURRET_CLEARANCE.vanguard[i].length,73*37);
  const state={clearance:TURRET_CLEARANCE.vanguard[i],local:new T.Vector3(),scratch:new T.Vector3(),inverse:new T.Quaternion()};
  assert.equal(clearTurretArc({position:[0,0,0]},m,extent,new T.Vector3(pivot[0],pivot[1],pivot[2]-80),state),true);
  assert.equal(clearTurretArc({position:[0,0,0]},m,extent,new T.Vector3(0,pivot[1],pivot[2]),state),false);
 }
});
test('game renderer paints both articulated side turrets and preserves warm engine emission at full health',async()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new T.Scene();r.shipMeshes=new Map();r.glbShipModels=new Map();r.glbShipLoading=new Map();r.radialTexture=()=>new T.Texture();r.createDronePorts=()=>new T.Group();r.tagTargetable=()=>{};
 const paint=await load('assets/models/capital/concord-frigate.glb');r.glbShipModels.set('concord-frigate',paint);
 const actor={id:'vanguard-test',variant:'warden',role:'patrol',faction:'concord',combatFit:{hullId:'vanguard'},position:[0,0,0],rotation:[0,0,0,1],hull:100,maxHull:100,lifetime:1};
 const model=await load('assets/models/ships/vanguard.glb');r.prepareGlbShip(model,cfg,'warden');const body=r.createGlbShipMesh(actor,model,cfg,'warden');r.shipMeshes.set(actor.id,body);
 assert.equal(body.userData.engineFlares.length,4);assert.ok(body.userData.emissiveMaterials.some(m=>m.userData.minimumEmissiveIntensity>=2));
 for(const [i,m]of TURRET_LAYOUTS.vanguard.entries()){
  const pivot=m.position.map((v,k)=>v*extent[k]*npcShipScaleForVariant('warden'));
  r.showTurret(actor.id+'-'+i,new T.Vector3(...pivot),new T.Vector3(0,0,-1),'S','laser',new T.Quaternion(),m.side,m.pedestal??0,extent[2]*npcShipScaleForVariant('warden')/m.hullHalfLength,0,actor);
  const turret=r.turretMeshes.get(actor.id+'-'+i);assert.ok(turret.userData.armorAtlas);assert.ok(Math.abs(turret.userData.yaw.rotation.y)<1e-10);assert.ok(Math.abs(turret.scale.x-runtime.turrets.mounts[i].runtimeNpc.turretScale)<1e-8);
  assert.equal(turret.userData.footprintScale,m.footprintScale);assert.ok(turret.children.some(o=>o.userData.turretSeatConnector));
  turret.traverse(o=>{if(o.isMesh){assert.ok(o.material.map);assert.ok(o.geometry.attributes.uv);}});
 }
 assert.equal(r.turretMeshes.size,2);
});
