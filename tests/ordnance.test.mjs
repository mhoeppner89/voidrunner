import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {session} from './weapon-overhaul.test.mjs';
import {LAUNCHERS,fillLauncherMagazines,launcherMagazineEntries} from '../src/game/weapons.js';
import {weaponDamage} from '../src/game/weaponDamage.js';
import {loadoutFor} from '../src/game/outfitting.js';
import {ORDNANCE_MODEL_DATA} from '../src/game/ordnanceModelData.js';
import {createOrdnanceModel} from '../src/game/ordnanceModels.js';
import {SpaceRenderer} from '../src/game/render.js';
import {LaserFx} from '../src/game/laserFx.js';
import * as THREE from '../vendor/three.module.min.js';

const profiles={seeker:[100,50],'shield-seeker':[50,100],swarm:[20,10],'shield-swarm':[10,20]};
test('rocket damage matches requested hull/shield values and seeker beats a full cluster salvo',()=>{
 for(const [id,[hull,shield]] of Object.entries(profiles)){
  const l=LAUNCHERS[id];assert.deepEqual(weaponDamage(0,l.damage,l),{shield:0,hull});
  assert.deepEqual(weaponDamage(1000,l.damage,l),{shield,hull:0});
 }
 assert.equal(LAUNCHERS.swarm.volley,4);assert.equal(LAUNCHERS['shield-swarm'].volley,4);
 for(const prefix of ['', 'shield-'])for(const layer of ['hull','shield']){
  const single=LAUNCHERS[prefix+'seeker'],cluster=LAUNCHERS[prefix+'swarm'];
  assert.ok(weaponDamage(layer==='shield'?1000:0,single.damage,single)[layer]>weaponDamage(layer==='shield'?1000:0,cluster.damage,cluster)[layer]*4);
 }
});
test('partial shields consume only the matching damage budget, with correct hull overflow',()=>{
 assert.deepEqual(weaponDamage(25,50,LAUNCHERS.seeker),{shield:25,hull:50});
 assert.deepEqual(weaponDamage(50,50,LAUNCHERS['shield-seeker']),{shield:50,hull:25});
 assert.deepEqual(weaponDamage(5,10,LAUNCHERS.swarm),{shield:5,hull:10});
 assert.deepEqual(weaponDamage(10,10,LAUNCHERS['shield-swarm']),{shield:10,hull:5});
});
test('all four profiles reach actual NPC/player damage entry points with identical results',()=>{
 for(const [id,[hullDamage,shieldDamage]] of Object.entries(profiles))for(const shield of [0,500]){
  const s=session(),p=s.save.player;p.hull=500;p.shield=shield;
  const ship={tutorialCompanion:true,hull:500,shield,position:[0,0,0]};
  s.damagePlayer(LAUNCHERS[id].damage,'test',false,LAUNCHERS[id]);s.damageShip(ship,LAUNCHERS[id].damage,'enemy',undefined,LAUNCHERS[id]);
  assert.equal(p.hull,500-(shield?0:hullDamage));assert.equal(p.shield,shield-(shield?shieldDamage:0));
  assert.equal(p.hull,ship.hull);assert.equal(p.shield,ship.shield);
 }
});
test('anti-shield racks fire their typed volleys and persist separate one-canister magazines',()=>{
 for(const id of ['shield-seeker','shield-swarm']){
  const s=session(),p=s.save.player;p.shipId='lancer';p.ownedShips=['lancer'];
  const fit=loadoutFor(p);fit.launchers=[id+'-launcher',null];p.outfitting.loadouts.lancer=fit;
  fillLauncherMagazines(p);const before=launcherMagazineEntries(p)[0].rounds;
  const enemy=s.spawnShip('pirate',[0,0,-100]);s.getTargetRef=()=>({kind:'ship',id:enemy.id});
  s.fireMissile();assert.equal(s.projectiles.length,LAUNCHERS[id].volley);
  assert.equal(launcherMagazineEntries(p)[0].rounds,before-1);
  assert.ok(s.projectiles.every(m=>m.launcherId===id&&m.damage===LAUNCHERS[id].damage));
 }
});
test('swept missile impacts preserve anti-shield and anti-hull profiles',()=>{
 for(const [id,[hullDamage,shieldDamage]] of Object.entries(profiles))for(const shield of [0,500]){
  const s=session();s.save.player.position=[1000,1000,0];const ship=s.spawnShip('pirate',[0,0,0]);
  ship.tutorialCompanion=true;ship.hull=500;ship.shield=shield;
  const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,-10);s.projStore.setVel(slot,0,0,200);
  s.projectiles.push({slot,kind:'missile',launcherId:id,ownerId:'player',damage:LAUNCHERS[id].damage,life:1,acceleration:0});
  s.updateProjectiles(.1);assert.equal(ship.hull,500-(shield?0:hullDamage),id);assert.equal(ship.shield,shield-(shield?shieldDamage:0),id);
 }
});
test('Blender assets stay under 300 triangles, have UVs and closed nondegenerate surfaces',()=>{
 for(const [id,d] of Object.entries(ORDNANCE_MODEL_DATA)){
  assert.ok(d.triangles<=300);assert.equal(d.positions.length,d.triangles*9);assert.equal(d.normals.length,d.positions.length);assert.equal(d.uvs.length,d.triangles*6);
  assert.ok(d.positions.every(Number.isFinite));assert.ok(d.uvs.every(v=>v>=0&&v<=1));
  const edges=new Map();
  for(let i=0;i<d.positions.length;i+=9){
   const a=new THREE.Vector3(...d.positions.slice(i,i+3)),b=new THREE.Vector3(...d.positions.slice(i+3,i+6)),c=new THREE.Vector3(...d.positions.slice(i+6,i+9));
   assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-12,id);
   const keys=[a,b,c].map(p=>p.toArray().join(','));
   for(let k=0;k<3;k++){const key=[keys[k],keys[(k+1)%3]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n%2===0),id+' has an open edge');
  const glb=readFileSync(new URL('../assets/models/ordnance/'+id+'.glb',import.meta.url));assert.equal(glb.toString('ascii',0,4),'glTF');
  const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));assert.equal(json.meshes.length,1);assert.equal(json.meshes[0].primitives.length,1);assert.equal(json.images.length,1);
 }
});
test('projectile disposal keeps shared ordnance geometry and material alive for the next salvo',()=>{
 const a=createOrdnanceModel('seeker'),b=createOrdnanceModel('seeker');assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
 let disposed=0;a.geometry.addEventListener('dispose',()=>disposed++);a.material.addEventListener('dispose',()=>disposed++);
 SpaceRenderer.prototype.disposeObject.call({deferShaderDisposal:()=>false},a);assert.equal(disposed,0);
});

test('all in-game rocket and torpedo bodies keep authored size at near and far camera distances',()=>{
 const s=session(),r=Object.create(SpaceRenderer.prototype);
 Object.assign(r,{projectileMeshes:new Map(),projectileSyncRevision:0,dynamicRoot:new THREE.Group(),camera:new THREE.PerspectiveCamera(),tmpPrevPos:new THREE.Vector3(),forward:new THREE.Vector3(),tmpQuaternion:new THREE.Quaternion(),skyTime:0,radialTexture:()=>new THREE.Texture(),laserFx:{attenuate:LaserFx.prototype.attenuate}});
 for(const id of Object.keys(LAUNCHERS)){
  const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,0,0,-100);
  s.projectiles.push({slot,kind:'missile',launcherId:id,shield:12});
 }
 for(const distance of [0,1,100,1000]){
  r.camera.position.set(0,0,distance);r.syncProjectiles(s.projectiles,s.projStore);
  for(const p of s.projectiles){
   const root=r.projectileMeshes.get(p.slot),body=root.getObjectByName('ordnance-'+p.launcherId),d=ORDNANCE_MODEL_DATA[p.launcherId];
   assert.equal(root.getObjectByName('torpedo-shield'),undefined,'No blue wireframe cage');assert.equal(p.shield,12,'Interception protection remains intact');assert.deepEqual(root.scale.toArray(),[1,1,1]);assert.deepEqual(body.getWorldScale(new THREE.Vector3()).toArray(),[1,1,1]);
   const extent=new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
   assert.ok(Math.abs(extent.z-body.geometry.boundingBox.getSize(new THREE.Vector3()).z)<1e-6,p.launcherId);
   assert.ok(extent.z>=d.length*.9);
   assert.ok(root.getObjectByName('ordnance-exhaust').scale.x<=1);
  }
 }
});
