import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {GLB_SHIP_CONFIG,npcShipScaleForVariant,SpaceRenderer} from '../../src/game/render.js';
import {paintShipMaterial} from '../../src/game/shipLivery.js';
import {SHIP_MOUNT_ANCHORS} from '../../src/game/shipMounts.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {fixture} from '../helpers/session.mjs';
import {WEAPONS} from '../../src/game/weapons.js';
import {HULL_HARDPOINTS} from '../../src/game/outfitting.js';
async function hull(t){
 globalThis.createImageBitmap??=async()=>({});
 t.mock.method(globalThis,'createImageBitmap',async blob=>{const b=Buffer.from(await blob.arrayBuffer());return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};});
 const b=await readFile(new URL('../../assets/models/ships/scrapper.glb',import.meta.url));return buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
}
test('Scrapper ships under 5k triangles, three small embedded maps and finite normal-map tangents',async t=>{
 const model=await hull(t);let triangles=0,meshes=0;
 model.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;triangles+=g.index.count/3;
  assert.deepEqual([o.material.map.image.width,o.material.map.image.height],[512,512]);
  assert.deepEqual([o.material.normalMap.image.width,o.material.normalMap.image.height],[512,512]);
  assert.deepEqual([o.material.roughnessMap.image.width,o.material.roughnessMap.image.height],[128,128]);
  assert.equal(g.attributes.tangent.count,g.attributes.position.count);
  assert.ok([...g.attributes.position.array,...g.attributes.normal.array,...g.attributes.tangent.array].every(Number.isFinite));
  for(const li of g.index.array){assert.ok(Math.hypot(g.attributes.tangent.getX(li),g.attributes.tangent.getY(li),g.attributes.tangent.getZ(li))>.99);}
 });assert.equal(meshes,1);assert.equal(triangles,4604);assert.ok(triangles<5000);
 const source=JSON.parse(await readFile(new URL('../fixtures/current-fleet/scrapper/model-report.json',import.meta.url)));assert.deepEqual(source.nonManifoldParts,[]);
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
 for(const[actual,original]of[[size.x,1.9954],[size.y,.5251],[size.z,1.7094]])assert.ok(Math.abs(actual-original)/original<.025,'measured source dimensions stay within 2.5%');
});
test('all four gun origins and both engine flares sit immediately outside the modeled openings',async t=>{
 const model=await hull(t),cfg=GLB_SHIP_CONFIG.scrapper;model.rotation.y=cfg.yaw;model.scale.setScalar(cfg.scale);model.updateMatrixWorld(true);
 for(const anchor of SHIP_MOUNT_ANCHORS.scrapper.guns){
  const hit=new THREE.Raycaster(new THREE.Vector3(...anchor),new THREE.Vector3(0,0,1),0,.22).intersectObject(model,true)[0];assert.ok(hit,'a gun muzzle ray must meet the recessed barrel floor');assert.ok(hit.distance<.16);
 }
 for(const anchor of SHIP_MOUNT_ANCHORS.scrapper.drive){const hit=new THREE.Raycaster(new THREE.Vector3(...anchor),new THREE.Vector3(0,0,-1),0,.22).intersectObject(model,true)[0];assert.ok(hit,'engine flare sits at its nozzle');}
 assert.equal(npcShipScaleForVariant('scrapper'),1.6);
});
test('authored pirate paint survives faction styling and renderer instancing',async t=>{
 const model=await hull(t);model.traverse(o=>{if(o.isMesh)assert.equal(paintShipMaterial(o.material,'pirates',new THREE.Matrix4(),'scrapper'),false);});
 const r=Object.create(SpaceRenderer.prototype);r.radialTexture=()=>new THREE.Texture();r.createDronePorts=()=>new THREE.Group();r.prepareGlbShip(model,GLB_SHIP_CONFIG.scrapper,'scrapper');
 const ship=r.createGlbShipMesh({id:'test-scrapper',role:'pirate',variant:'scrapper',faction:'pirates'},model,GLB_SHIP_CONFIG.scrapper);
 ship.traverse(o=>{if(o.isMesh){assert.equal(o.material.color.getHex(),0xffffff);assert.equal(o.material.userData.livery,undefined);}});
 assert.equal(ship.userData.engineFlares.length,2);
});
test('pirate encounters use Scrapper while explicitly requested Talons remain Talons',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0]);assert.equal(ship.variant,'scrapper');assert.equal(ship.hullId,'scrapper');assert.equal(ship.combatFit.hullId,'scrapper');assert.equal(ship.combatFit.guns.filter(Boolean).length,4);assert.equal(ship.combatFit.turrets.length,0);
 const old=s.spawnShip('pirate',[50,0,0],undefined,undefined,undefined,{hullId:'talon'});assert.equal(old.variant,'talon');assert.equal(old.combatFit.guns.length,HULL_HARDPOINTS.talon.guns.length);
 for(const fitIndex of [0,1,2]){const f=createEnemyLoadout(ship,fitIndex);assert.equal(f.weapons.length,4);assert.equal(f.profile.role,'fighter');}
 assert.ok(s.observerCatalog().some(o=>o.id==='scrapper'));
});
test('Scrapper fires from every rotated wingtip rather than a central placeholder',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[30,8,-90],undefined,undefined,{tier:'ace'});
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.6);ship.rotation=q.toArray();ship.targetId=undefined;
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(q),shots=[];s.spawnGunProjectile=(_owner,w,start,dir)=>shots.push({start:start.clone(),dir:dir.clone(),weapon:w.id});
 for(let i=0;i<4;i++){ship.energy=1000;ship.combatWeaponIndex=i;ship.combatFit.fireAt[i]=0;ship.combatFit.weapons[i]='pulse';s.save.world.time=i+1;s.fireNpcGun(ship,forward);}
 assert.equal(shots.length,4);
 for(let i=0;i<4;i++){const expected=new THREE.Vector3(...SHIP_MOUNT_ANCHORS.scrapper.guns[i]).multiplyScalar(1.6).applyQuaternion(q).add(new THREE.Vector3(...ship.position));assert.ok(shots[i].start.distanceTo(expected)<1e-6);assert.equal(shots[i].weapon,'pulse');assert.ok(shots[i].dir.dot(forward)>.99);}
});
test('Scrapper uses its measured collision size and takes shield and hull damage',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0]);assert.deepEqual(s.npcHullExtents(ship).map(n=>+n.toFixed(4)),[10.5144,2.7924,9.0064]);
 const shield=ship.shield,hull=ship.hull;s.damageShip(ship,20,'environment');assert.ok(ship.shield<shield);assert.equal(ship.hull,hull);
 ship.shield=0;s.damageShip(ship,20,'environment',undefined,WEAPONS.pulse);assert.ok(ship.hull<hull);assert.ok(ship.shieldDelay>0);
});

test('cockpit monitor uses the Scrapper hull footprint instead of the unknown-ship fallback',async()=>{
 const {shipTopDownProfile}=await import('../../src/game/shipTopDownProfile.js');
 const p=shipTopDownProfile('scrapper'),fallback=shipTopDownProfile('unknown');
 assert.notEqual(p,fallback);assert.ok(p.maxX>p.maxZ,'the split-wing fighter is wider than it is long');
 assert.ok(p.cells.length>250);assert.ok(p.edges.length>100);
});

test('intake depth, visible glazing, low canopy and swept nose remain intact',async t=>{
 const model=await hull(t);model.updateMatrixWorld(true);
 const roof=new THREE.Raycaster(new THREE.Vector3(0,.25,.29),new THREE.Vector3(0,-1,0),0,.3).intersectObject(model,true)[0];
 assert.ok(roof&&roof.point.y<.095,'canopy stays below the intake crown instead of towering above it');
 const tipAt=y=>new THREE.Raycaster(new THREE.Vector3(0,y,1),new THREE.Vector3(0,0,-1),0,.3).intersectObject(model,true)[0];
 const upper=tipAt(-.085),lower=tipAt(-.123);assert.ok(upper&&lower&&upper.point.z-lower.point.z>.01,'chisel nose projects forward at the upper lip and sweeps back beneath it');
 const ray=(x,y,z,dx,dy,dz)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(dx,dy,dz),0,.3).intersectObject(model,true)[0];
 for(const side of [-1,1]){
  const rib=ray(side*.218,0,.4,0,0,-1),gap=ray(side*.228,0,.4,0,0,-1);
  assert.ok(rib&&gap,'the grille and its cavity floor must both be closed');
  assert.ok(gap.distance-rib.distance>.020,'the grille gaps expose a recessed floor rather than a flat cover');
  const glass=ray(side*.16,.05,.29,-side,0,0);assert.ok(glass,'the main side window must be present');
  // Tile 3 is the glazing swatch, checked on the actual visible surface.
  assert.ok(glass.uv.x>.75&&glass.uv.y<.25,'side glass must sit outside its frame without being obscured');
 }
});

test('both complete exhaust apertures have clear aft paths through the tailplane',async t=>{
 const model=await hull(t);model.updateMatrixWorld(true);
 // Cast a disk of rays from just aft of each nozzle, including the old wing's
 // height. A clear center alone would miss an obstruction across the lower half.
 for(const side of [-1,1])for(const radius of [0,.020,.038])for(let j=0;j<12;j++){
  const a=j*Math.PI/6,x=side*.181+radius*Math.cos(a),y=-.016+radius*Math.sin(a);
  const hits=new THREE.Raycaster(new THREE.Vector3(x,y,-.816),new THREE.Vector3(0,0,-1),0,.15).intersectObject(model,true);
  assert.equal(hits.length,0,'tail armor must not intersect any part of the exhaust opening');
 }
});
