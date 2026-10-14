import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../../vendor/three.module.min.js';
import {GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {segmentMeshHit} from '../../src/game/meshQueries.js';
import {SHIP_COLLIDERS,PLAYER_CONTACT_SCALE,segmentShipColliderHit,segmentShipContactHullHit,shipVsSphere,shipVsShip,shipVsStation,shipVsObstacle} from '../../src/game/shipCollision.js';
import {GameSession} from '../../src/game/game.js';
import {createNewSave} from '../../src/game/save.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {stationModel} from '../helpers/station-model.mjs';
import {buildStationCollider} from '../../src/game/stationCollision.js';
import {STATION_DOCKS} from '../../src/game/stationDocks.js';
import {LOCATIONS} from '../../src/game/data.js';
import {stationBerth,stationPlayerBerths} from '../../src/game/stationTraffic.js';
import {fittedPlayerBerths} from '../../src/game/shipLanding.js';
import {FLEET_EQUIPMENT} from '../../src/game/fleetEquipmentData.js';
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const rotation=[0,0,0,1],origin=[0,0,0],q=new T.Quaternion(),zero=new T.Vector3();
const witnesses=new Map();
for(const [variant,config] of Object.entries(GLB_SHIP_CONFIG))test(`${variant}: baked weapons match current model surfaces and contact cells retain the hull`,async()=>{
 const p=SHIP_COLLIDERS[variant],file=config.path??`assets/models/ships/${config.file}`,bytes=await readFile(file);
 assert.equal(p.sha256,createHash('sha256').update(bytes).digest('hex'),'model edits require a fresh collision bake');
 const root=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 root.rotation.y=config.yaw;root.scale.setScalar(config.scale*(config.baseScale??1));root.updateMatrixWorld(true);
 const vertices=[],indices=[],point=new T.Vector3();
 root.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,offset=vertices.length/3;
  for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);vertices.push(point.x,point.y,point.z);}
  for(let i=0;i<(index?.count??pos.count);i++)indices.push(offset+(index?index.getX(i):i));
 });
 const reference={x:0,y:0,z:0,losRadius:p.radius*1.01,meshVerts:new Float32Array(vertices),meshIndices:new Uint32Array(indices),box:{qx:0,qy:0,qz:0,qw:1}};
 let rays=0,hits=0,empty=0;
 for(const [a,b,depth] of [[0,2,1],[2,1,0],[0,1,2]])for(let y=0;y<24;y++)for(let x=0;x<24;x++){
  const start=new T.Vector3().setComponent(a,(x+.5)/24*(p.max[a]-p.min[a])+p.min[a]).setComponent(b,(y+.5)/24*(p.max[b]-p.min[b])+p.min[b]).setComponent(depth,-p.radius*2);
  const end=start.clone().setComponent(depth,p.radius*2),expected=segmentMeshHit(start,end,reference),actual=segmentShipColliderHit(start,end,origin,rotation,variant);
  assert.equal(actual!==undefined,expected!==undefined,`ray ${a}/${x}/${y}`);
  if(expected!==undefined){hits++;assert.ok(Math.abs(expected-actual)<2e-5);assert.notEqual(segmentShipContactHullHit(start,end,origin,rotation,variant),undefined,'contact shape must retain visible surfaces');
   if(!witnesses.has(variant))witnesses.set(variant,{start,end});
  }else empty++;rays++;
 }
 assert.ok(hits>100&&empty>20);assert.equal(rays,1728);
 // Translation, arbitrary roll/pitch/yaw and differing NPC scales preserve hits.
 const w=witnesses.get(variant),turn=new T.Quaternion().setFromEuler(new T.Euler(.4,.7,-.2)),position=[350,-125,480],scale=npcShipScaleForVariant(variant),offset=new T.Vector3(...position);
 const a=w.start.clone().multiplyScalar(scale).applyQuaternion(turn).add(offset),b=w.end.clone().multiplyScalar(scale).applyQuaternion(turn).add(offset);
 const beforeA=a.toArray(),beforeB=b.toArray();assert.notEqual(segmentShipColliderHit(a,b,position,turn.toArray(),variant,scale),undefined);assert.deepEqual(a.toArray(),beforeA);assert.deepEqual(b.toArray(),beforeB);
});

function session(mode,hull){const s=Object.create(GameSession.prototype);s.save=createNewSave(8,{tutorial:false});Object.assign(s.save.player,{shipId:hull,position:[0,0,0],rotation:[0,0,0,1],dockedAt:undefined});s.ships=[];s.projectiles=[];s.projStore=new EntityStore(32);
 s.arena=mode==='career'?undefined:mode==='arena-run'?{run:true}:mode==='spectator'?{observer:true}:{started:true};
 s.firstObstacleHit=()=>undefined;s.firstObstacleHitInfo=()=>undefined;s.renderer={spawnImpact(){},showCombatBeam(){}};for(let i=0;i<=6;i++)s['tmpP'+i]=new T.Vector3();
 s.tmpAudioLocal=new T.Vector3();s.tmpAudioOrientation=new T.Quaternion();s.audio={playAtDirection(){}};s.maybeHitTaunt=()=>{};
 return s;
}
test('career, arena, arena run and spectator use fitted player/NPC beam and projectile hits on all 15 hulls',()=>{
 for(const [hull,config] of Object.entries(FLEET_EQUIPMENT))for(const mode of ['career','arena','arena-run','spectator']){
  const variant=config.variant,w=witnesses.get(variant),s=session(mode,hull),direction=w.end.clone().sub(w.start).normalize(),weapon={kind:'beam',range:w.start.distanceTo(w.end)+1,damageFlat:10};
  let hits=0;s.damagePlayer=()=>hits++;s.damageShip=()=>hits++;
  s.fireBeam('enemy',weapon,w.start,direction,'audit');assert.equal(hits,1,`${mode}/${hull}: player beam`);
  const n=npcShipScaleForVariant(variant);s.ships=[{id:'victim',variant,position:origin,rotation,hull:100}];
  s.fireBeam('player',{...weapon,range:weapon.range*n},w.start.clone().multiplyScalar(n),direction,'audit');assert.equal(hits,2,`${mode}/${hull}: NPC beam`);
  s.ships=[];const slot=s.projStore.alloc();s.projStore.setPosV(slot,w.start);s.projStore.setVelV(slot,w.end.clone().sub(w.start));
  s.projectiles=[{slot,kind:'laser',ownerId:'enemy',life:2,damage:10}];s.updateProjectiles(1);assert.equal(hits,3,`${mode}/${hull}: projectile`);
 }
});
test('a small sphere beside Wayfarer cannot collide in empty space; real nose and rotated contacts remain solid',()=>{
 const p=SHIP_COLLIDERS.kestrel,contact={},pos=new T.Vector3(),before=pos.toArray();
 assert.equal(shipVsSphere(pos,q,'kestrel',PLAYER_CONTACT_SCALE,1.7,0,2.4,.05,contact),false);
 assert.equal(shipVsSphere(pos,q,'kestrel',1,0,0,p.min[2],.15,contact),true);
 assert.ok(contact.push>0&&Number.isFinite(contact.push));assert.deepEqual(pos.toArray(),before);
 const turn=new T.Quaternion().setFromEuler(new T.Euler(.3,.4,.6)),point=new T.Vector3(0,0,p.min[2]).applyQuaternion(turn).add(new T.Vector3(100,200,300));
 assert.equal(shipVsSphere(new T.Vector3(100,200,300),turn,'kestrel',1,point.x,point.y,point.z,.15,contact),true);
});
test('compound ship contacts reject far pairs and resolve actual overlapping solids without mutating live state',()=>{
 for(const variant of Object.keys(SHIP_COLLIDERS)){
  const p=SHIP_COLLIDERS[variant],a=new T.Vector3(),b=new T.Vector3(p.radius*4,0,0),contact={},stats={};
  assert.equal(shipVsShip(a,q,variant,1,b,q,variant,1,contact,stats),false);assert.ok(stats.boundsTests<=1);
  b.set(.1,.1,.1);assert.equal(shipVsShip(a,q,variant,1,b,q,variant,1,contact),true,variant);assert.ok(Number.isFinite(contact.push));assert.deepEqual(a.toArray(),[0,0,0]);
 }
});
test('hollow wreck rings and engine bores stay open for fitted small ships and stop actual wall contacts',()=>{
 const box={qx:0,qy:0,qz:0,qw:1};
 for(const shape of ['ring','engine']){
  const obstacle={shape,x:0,y:0,z:0,scale:[30,30,30],box},contact={};
  assert.equal(shipVsObstacle(zero,q,'kestrel',1,obstacle,contact),false,`${shape} opening`);
  const point=shape==='ring'?new T.Vector3(30,0,0):new T.Vector3(25.5,0,0);
  assert.equal(shipVsObstacle(point,q,'kestrel',1,obstacle,contact),true,`${shape} wall`);
 }
});
test('all player hulls and NPC hulls clear every actual station landing and departure route',()=>{
 const failures=[];
 for(const id of Object.keys(STATION_DOCKS)){
  const collider=buildStationCollider(stationModel(id),LOCATIONS[id].position);
  for(const [hull,data] of Object.entries(FLEET_EQUIPMENT)){
   const p=SHIP_COLLIDERS[data.variant],n=npcShipScaleForVariant(data.variant);
   for(const npc of [false,true]){
    const scale=npc?n:PLAYER_CONTACT_SCALE,berths=npc?STATION_DOCKS[id].lanes.map((_,i)=>stationBerth(id,i,p.extent[1]*scale)):fittedPlayerBerths(id,data.variant,collider);
    assert.ok(berths.length>0,`${id}/${hull}: a usable berth must exist`);
    for(const berth of berths)for(let i=0;i<=20;i++){
     const pos=new T.Vector3(...berth.gate).lerp(new T.Vector3(...berth.pad),i/20),contact={};
     const facing=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(...berth.pad).sub(new T.Vector3(...berth.gate)).normalize());
     if(shipVsStation(pos,facing,data.variant,scale,collider,contact))failures.push(`${id}/${hull}/${npc?'NPC':'player'} at ${i}/20 ${JSON.stringify(contact)}`);
     if(id==='blackglass'&&shipVsSphere(pos,facing,data.variant,scale,...LOCATIONS[id].position,LOCATIONS[id].radius*.82,contact))failures.push(`${id}/${hull}: host moon blocks the approach`);
    }
   }
  }
 }
 assert.deepEqual(failures,[]);
});
