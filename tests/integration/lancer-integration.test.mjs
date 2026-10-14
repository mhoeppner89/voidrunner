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
import {GLB_TOP_DOWN_PROFILES} from '../../src/game/shipProfiles.js';
import {clearTurretArc} from '../../src/game/turrets.js';
const path='tests/fixtures/current-fleet/lancer/';
const qa=JSON.parse(await readFile(path+'export-qa.json')),cal=JSON.parse(await readFile(path+'integration/calibration.json')),runtime=JSON.parse(await readFile(path+'runtime-handoff.json'));
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
const load=async p=>{const b=await readFile(p);return buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const hull=await load('assets/models/ships/lancer.glb'),cfg=GLB_SHIP_CONFIG.lancer,N=npcShipScaleForVariant('lancer');
hull.rotation.y=cfg.yaw;hull.scale.setScalar(cfg.scale*cfg.baseScale);hull.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(hull),extent=[0,1,2].map(i=>Math.max(Math.abs(box.min.getComponent(i)),Math.abs(box.max.getComponent(i))));
hull.traverse(o=>{if(o.isMesh)o.material.side=T.DoubleSide;});
const ray=(p,d,far=100)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),1e-5,far).intersectObject(hull,true);
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-7,`${a} differs from ${b}`));
test('shipping Lancer is the exact approved export with 20 assemblies and packed detailed PBR',async()=>{
 for(const p of ['assets/models/ships/lancer.glb'])assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),qa.sha256);
 let triangles=0,meshes=0;hull.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.geometry.attributes.uv);assert.ok(o.geometry.attributes.tangent);if(!o.material.name.startsWith('VR_Canopy_')){assert.deepEqual([o.material.map.image.width,o.material.map.image.height],[4096,4096]);assert.equal(o.material.normalMap.image.width,4096);assert.equal(o.material.roughnessMap.image.width,2048);assert.ok(o.material.aoMap);}});
 assert.equal(triangles,4912);assert.equal(meshes,20);

});
test('player/NPC collision bounds, gun origins and all four drive/exhaust origins match the installed hull',()=>{
 near(extent,cal.playerHalfExtents);near(GameSession.prototype.npcHullExtents.call({}, {variant:'lancer'}),extent.map(v=>v*N));
 for(const [i,m]of [...runtime.guns].reverse().entries()){near(SHIP_MOUNT_ANCHORS.lancer.guns[i],m.runtime.map(v=>v/N));const p=SHIP_MOUNT_ANCHORS.lancer.guns[i];assert.equal(ray(p,[0,0,-1]).length,0);assert.ok(ray(p,[0,0,1],1).length);}
 assert.equal(cfg.enginePorts.length,runtime.exhausts.length);
 for(const [i,m]of runtime.exhausts.entries()){near(SHIP_MOUNT_ANCHORS.lancer.drive[i],m.runtime.proposedEffectAnchor.map(v=>v/N));const p=SHIP_MOUNT_ANCHORS.lancer.drive[i];assert.equal(ray(p,[0,0,1]).length,0);assert.ok(ray(p,[0,0,-1],1).length);}
});
test('actual game turret retains the approved pose, is supported across its full ring and clears its forward muzzles',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new T.Scene();r.shipMeshes=new Map();
 const actor={id:'lancer-test',variant:'lancer',combatFit:{hullId:'lancer'},position:[0,0,0],rotation:[0,0,0,1],lifetime:1};
 const m=TURRET_LAYOUTS.lancer[0],pivot=m.position.map((v,i)=>v*extent[i]),scale=extent[2]/m.hullHalfLength*1.3;
 assert.equal(m.reviewed,true);assert.ok(pivot.every(Number.isFinite));assert.ok(scale>0);
 r.showTurret(actor.id+'-0',new T.Vector3(...pivot),new T.Vector3(0,0,-1),'M','laser',new T.Quaternion(),m.side,m.pedestal??0,scale/1.3,1,actor);
 const turret=r.turretMeshes.get(actor.id+'-0');turret.updateMatrixWorld(true);assert.equal(turret.scale.x,scale);
 assert.equal(turret.userData.footprintScale,m.footprintScale);assert.ok(turret.children.some(o=>o.userData.turretSeatConnector));
 const normal=new T.Vector3(...m.normal),frame=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),normal),radius=.48*(m.footprintScale??1),offsets=[[0,0],...Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32)*radius,Math.sin(i*Math.PI/32)*radius])];
 for(const[x,z]of offsets){const p=new T.Vector3(x*scale,0,z*scale).applyQuaternion(frame).add(new T.Vector3(...pivot)),hit=ray(p.toArray(),normal.clone().negate().toArray(),2*scale)[0];assert.ok(hit,'Unsupported turret foot edge');
  const gap=hit.distance/scale-.59;
  if(gap>0){const seatRadius=.42+(.48-.42)*Math.min(1,gap/(m.pedestal||1));assert.ok(gap<=(m.pedestal??0)+.01,'Seat connector spans the actual wing-root gap');assert.ok(radius<=seatRadius+.015,'Tapered connector reaches the supported foot perimeter');}
  else assert.ok(gap>=-.12,'Turret foot is not buried into the lower wing root');}
 let muzzleSamples=0;for(const mesh of turret.userData.pitch.children){const p=mesh.geometry.attributes.position;let minZ=Infinity;for(let i=0;i<p.count;i++)minZ=Math.min(minZ,p.getZ(i));if(minZ>-.5)continue;for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-minZ)<1e-5){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);assert.equal(ray(v.toArray(),[0,0,-1]).length,0);muzzleSamples++;}}
 assert.equal(muzzleSamples,44);
});
test('rebaked cockpit silhouette and turret obstruction data follow the new geometry',()=>{
 assert.ok(GLB_TOP_DOWN_PROFILES.lancer.cells.length>500);assert.equal(TURRET_CLEARANCE.lancer[0].length,73*37);
 const m=TURRET_LAYOUTS.lancer[0],pivot=m.position.map((v,i)=>v*extent[i]),state={clearance:TURRET_CLEARANCE.lancer[0],local:new T.Vector3(),scratch:new T.Vector3(),inverse:new T.Quaternion()};
 assert.equal(clearTurretArc({position:[0,0,0]},m,extent,new T.Vector3(pivot[0],pivot[1],pivot[2]-80),state),true);
 assert.equal(clearTurretArc({position:[0,0,0]},m,extent,new T.Vector3(pivot[0],0,pivot[2]),state),false);
});
test('game factory preserves the approved Concord maps, separate glass and four aligned engine flares',async()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new T.Scene();r.radialTexture=()=>new T.Texture();r.createDronePorts=()=>new T.Group();r.tagTargetable=()=>{};
 const actor={id:'lancer-test',variant:'lancer',role:'bounty',faction:'concord'};const model=await load('assets/models/ships/lancer.glb');r.prepareGlbShip(model,cfg,'lancer');const body=r.createGlbShipMesh(actor,model,cfg,'lancer');
 assert.equal(body.userData.glb,true);assert.equal(body.userData.baseScale,1.02);assert.equal(body.userData.engineFlares.length,4);
 for(const[i,f]of body.userData.engineFlares.entries())near(f.position.toArray(),cfg.enginePorts[i]);
 let glass=0,armor=0;body.traverse(o=>{if(!o.isMesh)return;if(o.material.name.startsWith('VR_Canopy_'))glass++;else if(o.material.map){armor++;assert.equal(o.material.map.image.width,4096);assert.ok(o.material.normalMap);assert.ok(o.material.roughnessMap);assert.ok(!o.material.userData.livery);}});assert.ok(glass>0);assert.ok(armor>=19);
});
