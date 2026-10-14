import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.min.js';
import {SHIPS,LOCATIONS} from '../../src/game/data.js';
import {createNewSave,hydrateSave} from '../../src/game/save.js';
import {fillLauncherMagazines,launcherMagazineEntries} from '../../src/game/weapons.js';
import {quoteShipTrade,commitShipTrade} from '../../src/game/shipTrade.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,itemFitsMount} from '../../src/game/outfitting.js';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {GLB_SHIP_CONFIG,npcShipScaleForVariant,SpaceRenderer} from '../../src/game/render.js';
import {SHIP_MOUNT_ANCHORS} from '../../src/game/shipMounts.js';
import {FLEET_EQUIPMENT} from '../../src/game/fleetEquipmentData.js';
import {FLEET_TURRET_CLEARANCE} from '../../src/game/fleetTurretClearance.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {TURRET_LAYOUTS} from '../../src/game/turretLayouts.js';
import {clearTurretArc} from '../../src/game/turrets.js';
import {PLAYER_FLYABLE_HULLS} from '../../src/game/shipPool.js';
import {shipTopDownProfile} from '../../src/game/shipTopDownProfile.js';
import {fixture} from '../helpers/session.mjs';
async function model(t,id){globalThis.createImageBitmap??=async()=>({});t.mock.method(globalThis,'createImageBitmap',async b=>{const a=Buffer.from(await b.arrayBuffer());return{width:a.readUInt32BE(16),height:a.readUInt32BE(20)};});const b=await readFile(new URL(`../../assets/models/ships/${id}.glb`,import.meta.url));return buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function triangleCount(root){let count=0;root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return count;}
test('approved careers have distinct tiers, capacities and legal stock fits',()=>{
 assert.equal(SHIPS.scrapper.role,'fighter');assert.equal(SHIPS.scrapper.tier,1);assert.ok(SHIPS.scrapper.shield<SHIPS.legionary.shield&&SHIPS.scrapper.maxSpeed<SHIPS.legionary.maxSpeed);
 assert.equal(HULL_HARDPOINTS.scrapper.stockGunCount,4);assert.equal(HULL_HARDPOINTS.scrapper.stockLauncherCount,1);
 assert.ok(HULL_HARDPOINTS.scrapper.guns.every(m=>m.category==='weapon'),'guns and launchers share physical, size-agnostic weapon mounts');
 assert.equal(SHIPS.demon.role,'interceptor');assert.equal(SHIPS.demon.tier,2);assert.equal(SHIPS.mule.role,'transport');assert.equal(SHIPS.mule.tier,2);assert.ok(SHIPS.mule.cargo<SHIPS.atlas.cargo&&SHIPS.mule.cargo>SHIPS.torsas.cargo);assert.equal(HULL_HARDPOINTS.mule.turrets.length,2);
 for(const[id,count]of[['scrapper',4],['demon',4],['mule',2]]){let stock;for(const index of [0,1,2,7]){const f=createEnemyLoadout({hullId:id,role:id==='mule'?'trader':'pirate'},index);assert.equal(f.weapons.length,count);for(const k of ['guns','launchers','turrets'])f[k].forEach((item,i)=>{if(item)assert.ok(itemFitsMount(OUTFIT_ITEMS[item],HULL_HARDPOINTS[id][k][i]));});const signature=[f.guns,f.launchers,f.turrets];if(stock)assert.deepEqual(signature,stock);stock=signature;}assert.ok(PLAYER_FLYABLE_HULLS.includes(id));}
 assert.equal(createEnemyLoadout({hullId:'demon'},0).profile.role,'interceptor');assert.deepEqual(createEnemyLoadout({hullId:'mule'},0).turrets,['pdc','pdc']);const explicit=createEnemyLoadout({hullId:'demon'},0,{guns:['ripper',null,null,null]});assert.deepEqual(explicit.guns.slice(0,HULL_HARDPOINTS.demon.stockGunCount),['ripper',null,null,null]);assert.equal(explicit.guns[HULL_HARDPOINTS.demon.stockGunCount],null,'the shared rack mount stays free of a gun');
});
test('both new hulls can be bought, retained and reloaded with the right ammunition and mounts',()=>{
 for(const id of ['demon','mule']){let s=createNewSave(818,{tutorial:false});s.player.credits=500000;s.player.dockedAt=id==='demon'?'blackglass':'helix';const q=quoteShipTrade(s.player,id,{keepCurrent:true});assert.ok(q.ok,q.code);assert.ok(commitShipTrade(s.player,q).ok);fillLauncherMagazines(s.player);const launcher=launcherMagazineEntries(s.player)[0];assert.equal(launcher.index,HULL_HARDPOINTS[id].stockGunCount,'the rack occupies the first shared weapon mount after the gun mounts');s.player.launcherMagazines[launcher.mount.id].rounds=2;s=hydrateSave(JSON.parse(JSON.stringify(s)));assert.equal(s.player.shipId,id);assert.ok(s.player.ownedShips.includes('wayfarer'));assert.equal(s.player.outfitting.loadouts[id].guns.length,HULL_HARDPOINTS[id].guns.length);const restored=launcherMagazineEntries(s.player)[0];assert.equal(restored.launcherId,'seeker','the owned equipment-instance definition survives the save round trip');assert.equal(restored.index,HULL_HARDPOINTS[id].stockGunCount);assert.equal(restored.rounds,2);if(id==='mule')assert.deepEqual(s.player.outfitting.loadouts[id].turrets.map(item=>OUTFIT_ITEMS[item]?.baseId),['pdc','pdc']);}
 assert.ok(LOCATIONS.helix.shipsForSale.includes('mule'));assert.ok(LOCATIONS.blackglass.shipsForSale.includes('demon'));assert.ok(LOCATIONS.blackglass.shipsForSale.includes('scrapper'));
});
test('Demon and Mule hull/equipment geometry, collision bounds and engine counts agree with runtime scale',async t=>{
 const reports=JSON.parse(await readFile(new URL('../fixtures/current-fleet/career-assets.json',import.meta.url)));
 for(const[id,hullTriangles,equipmentTriangles]of[['demon',1778,0],['mule',4948,1232]]){
  const m=await model(t,id),cfg=GLB_SHIP_CONFIG[id],hull=id==='mule'?m.getObjectByName('MuleApprovedHull'):m;
  m.traverse(o=>{if(o.isMesh){assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));assert.equal(o.material.map.image.width,512);assert.equal(o.material.roughnessMap.image.width,128);}});
  const totalTriangles=triangleCount(m),measuredHullTriangles=triangleCount(hull),measuredEquipmentTriangles=totalTriangles-measuredHullTriangles;
  assert.equal(measuredHullTriangles,hullTriangles);assert.equal(measuredEquipmentTriangles,equipmentTriangles);
  assert.equal(reports[id].triangles,totalTriangles);assert.equal(reports[id].hullTriangles,measuredHullTriangles);assert.equal(reports[id].equipmentTriangles,measuredEquipmentTriangles);assert.equal(reports[id].totalTriangles,totalTriangles);assert.ok(measuredHullTriangles<5000);
  m.rotation.y=cfg.yaw;m.scale.setScalar(cfg.scale);m.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(m),size=box.getSize(new THREE.Vector3());size.toArray().forEach((v,i)=>assert.ok(Math.abs(v/2-reports[id].halfExtents[i])<1e-6));
  if(id==='mule'){const hullSize=new THREE.Box3().setFromObject(hull).getSize(new THREE.Vector3());hullSize.toArray().forEach((v,i)=>assert.ok(Math.abs(v/2-reports[id].hullHalfExtents[i])<1e-6));}
  const s=fixture(),ship=s.spawnShip(id==='mule'?'trader':'pirate',[0,0,0],undefined,undefined,undefined,{hullId:id});assert.equal(ship.variant,id);assert.equal(ship.combatFit.hullId,id);s.npcHullExtents(ship).forEach((v,i)=>assert.ok(Math.abs(v-reports[id].halfExtents[i]*npcShipScaleForVariant(id))<1e-5));
  const r=Object.create(SpaceRenderer.prototype);r.radialTexture=()=>new THREE.Texture();r.createDronePorts=()=>new THREE.Group();r.prepareGlbShip(m,cfg,id);const rendered=r.createGlbShipMesh(ship,m,cfg);assert.equal(rendered.userData.engineFlares.length,id==='demon'?2:3);
  assert.notEqual(shipTopDownProfile(id),shipTopDownProfile('unknown'));assert.ok(shipTopDownProfile(id).cells.length>300);
 }
});
test('forward weapons and launchers clear the actual hull, with nozzles attached to their cavities',async t=>{
 for(const id of ['demon','mule']){const m=await model(t,id),c=GLB_SHIP_CONFIG[id];m.rotation.y=c.yaw;m.scale.setScalar(c.scale);m.traverse(o=>{if(o.isMesh)o.material.side=THREE.DoubleSide;});m.updateMatrixWorld(true);const ray=(a,d,far)=>new THREE.Raycaster(new THREE.Vector3(...a),new THREE.Vector3(...d),0,far).intersectObject(m,true);
 for(const a of SHIP_MOUNT_ANCHORS[id].guns){assert.equal(ray(a,[0,0,-1],30).length,0,'gun must clear the ship ahead');assert.ok(ray(a,[0,0,1],.2).length,'gun origin must lie immediately outside the front armor or barrel');}
 for(const a of SHIP_MOUNT_ANCHORS[id].launchers)assert.equal(ray(a,[0,0,-1],30).length,0,'missile must clear the belly armor');
 for(const a of SHIP_MOUNT_ANCHORS[id].drive){assert.equal(ray(a,[0,0,1],20).length,0,'exhaust is clear aft');assert.ok(ray(a,[0,0,-1],1).length,'engine emission is attached to a nozzle cavity');}
 }
});
test('Mule PDCs seat against both hull sides and cover their outward arcs without firing through the ship',async t=>{
 const m=await model(t,'mule'),c=GLB_SHIP_CONFIG.mule,config=FLEET_EQUIPMENT.mule;m.rotation.y=c.yaw;m.scale.setScalar(c.scale);m.updateMatrixWorld(true);
 const reports=JSON.parse(await readFile(new URL('../fixtures/current-fleet/career-assets.json',import.meta.url))),extents=reports.mule.halfExtents,hull=m.getObjectByName('01 Pressure hull');
 assert.equal(TURRET_LAYOUTS.mule.length,2);assert.equal(config.turrets.length,2);
 for(const[i,mount]of TURRET_LAYOUTS.mule.entries()){
  assert.equal(mount.reviewed,true);assert.equal(mount.axis,0);assert.ok(Math.abs(mount.normal[0])>.99999);
  const pivot=mount.position.map((v,k)=>v*extents[k]),normal=new THREE.Vector3(...mount.normal),root=m.getObjectByName(config.turrets[i].embedded);
  assert.ok(root);assert.ok(root.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...pivot))<1e-6,'authored embedded PDC root matches the runtime mount');
  const seatHit=new THREE.Raycaster(new THREE.Vector3(...pivot),normal.clone().negate(),0,1).intersectObject(hull,true)[0];
  assert.ok(seatHit&&seatHit.distance>.52&&seatHit.distance<.59,'the PDC base reaches the pressure hull from its side pivot');
  const state={local:new THREE.Vector3(),scratch:new THREE.Vector3(),inverse:new THREE.Quaternion(),clearance:FLEET_TURRET_CLEARANCE.mule[i]};
  assert.equal(state.clearance.length,73*37);
  assert.ok(clearTurretArc({position:[0,0,0]},mount,extents,new THREE.Vector3(...pivot).addScaledVector(normal,25),state),'outward flank is covered');
  assert.equal(clearTurretArc({position:[0,0,0]},mount,extents,new THREE.Vector3(...pivot).addScaledVector(normal,-12),state),false,'inward fire through the hull is blocked');
  assert.equal(clearTurretArc({position:[0,0,0]},mount,extents,new THREE.Vector3(0,0,60),state),false,'the centerline stern remains behind the hull');
 }
});
test('normal traffic, observer and rotated gun origins use the new hulls',()=>{
 const s=fixture();let pirates=[],traders=[];for(let i=0;i<12;i++){pirates.push(s.spawnShip('pirate',[100*i,0,500]));traders.push(s.spawnShip('trader',[100*i,0,1000]));}assert.ok(pirates.some(s=>s.variant==='demon')&&pirates.some(s=>s.variant==='scrapper'));assert.ok(traders.some(s=>s.hullId==='mule')&&traders.some(s=>s.hullId==='atlas'));for(const id of ['demon','mule'])assert.ok(s.observerCatalog().some(o=>o.id===id));
 for(const id of ['demon','mule']){const ship=s.spawnShip(id==='mule'?'trader':'pirate',[20,8,40],undefined,undefined,{tier:'ace'},{hullId:id}),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7);ship.rotation=q.toArray();ship.targetId=undefined;const shots=[];s.spawnGunProjectile=(_owner,w,start,dir)=>shots.push(start.clone());const direction=new THREE.Vector3(0,0,-1).applyQuaternion(q),fit=ship.combatFit;for(let i=0;i<fit.gunIndices.length;i++){const mountIndex=fit.gunIndices[i];fit.guns[mountIndex]='pulse-cannon';ship.energy=1000;ship.combatWeaponIndex=i;fit.fireAt[i]=0;s.save.world.time=i+1;s.fireNpcGun(ship,direction);}assert.equal(shots.length,fit.gunIndices.length);shots.forEach((p,i)=>{const mountIndex=fit.gunIndices[i];assert.ok(p.distanceTo(new THREE.Vector3(...SHIP_MOUNT_ANCHORS[id].guns[mountIndex]).multiplyScalar(npcShipScaleForVariant(id)).applyQuaternion(q).add(new THREE.Vector3(...ship.position)))<1e-6);});}
});

 test('Mule defensive PDCs intercept a side missile and reject a target behind the stern',()=>{
 const s=fixture();s.save.player.position=[1000,1000,1000];const ship=s.spawnShip('trader',[0,0,0],undefined,undefined,undefined,{hullId:'mule'});ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.energy=1000;ship.targetId=undefined;s.lineBlocked=()=>false;
 const missile=(id,position)=>{const slot=s.projStore.alloc();s.projStore.setPos(slot,...position);s.projStore.setVel(slot,0,0,0);const p={id,kind:'missile',slot,ownerId:'enemy',targetId:ship.id,life:10};s.projectiles.push(p);return p;};
 const flank=missile('incoming-flank',[35,0,-7]),stern=missile('incoming-stern',[0,0,50]),rounds=[];
 s.spawnGunProjectile=(owner,w,start,d)=>{const p={owner,weapon:w.id,start:start.clone(),direction:d.clone()};rounds.push(p);return p;};
 for(let i=0;i<90;i++){s.save.world.time+=1/60;s.updateTurrets(ship,ship.id,1/60);}
 assert.ok(rounds.some(p=>p.targetMissile===flank));assert.ok(rounds.every(p=>p.targetMissile!==stern));assert.equal(ship.turretRuntime.length,2);assert.ok(rounds.every(p=>Math.abs(p.start.x)>2));
 });
