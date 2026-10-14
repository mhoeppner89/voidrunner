import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../../vendor/three.module.min.js';
import {SpaceRenderer} from '../../src/game/render.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {GameSession} from '../../src/game/game.js';
import {cargoCapacity,cargoMass} from '../../src/game/economy.js';
import {createNewSave} from '../../src/game/save.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
function fixture(){
 const r=Object.create(SpaceRenderer.prototype),store=new EntityStore();
 Object.assign(r,{projectileMeshes:new Map(),projectileSyncRevision:0,dynamicRoot:new THREE.Group(),tmpPrevPos:new THREE.Vector3(),forward:new THREE.Vector3(),tmpQuaternion:new THREE.Quaternion()});
 return {r,store,shot:(faction='player')=>{const slot=store.alloc();store.setPos(slot,1,2,-30);store.setVel(slot,0,0,-100);return{slot,kind:'pdc',faction};}};
}
test('repeated salvos reuse their GPU resources without changing transforms or faction',()=>{
 const {r,store,shot}=fixture(),a=shot();r.syncProjectiles([a],store);
 const mesh=r.projectileMeshes.get(a.slot);let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);
 r.syncProjectiles([],store);assert.equal(mesh.parent,null);
 store.free(a.slot);const b=shot();store.setPos(b.slot,4,5,-60);store.setVel(b.slot,100,0,0);r.syncProjectiles([b],store);
 assert.equal(r.projectileMeshes.get(b.slot),mesh);assert.deepEqual(mesh.position.toArray(),[4,5,-60]);
 assert.ok(new THREE.Vector3(0,0,-1).applyQuaternion(mesh.quaternion).distanceTo(new THREE.Vector3(1,0,0))<1e-12);
 const c={...b,faction:'pirates'};r.syncProjectiles([c],store);const enemy=r.projectileMeshes.get(c.slot);assert.notEqual(enemy,mesh);assert.equal(enemy.material.color.getHex(),0xff8a5b);
 r.syncProjectiles([b],store);assert.equal(r.projectileMeshes.get(b.slot),mesh);assert.equal(disposed,0);
 r.syncProjectiles([],store);r.clearProjectilePools();assert.equal(disposed,2);assert.equal(r.pooledProjectileCount,0);r.clearProjectilePools();assert.equal(disposed,2);
});
test('idle visual stock is bounded per type and overall; overflow is released',()=>{
 const {r,store,shot}=fixture();let disposed=0;
 const shots=Array.from({length:20},()=>shot());r.syncProjectiles(shots,store);for(const m of r.projectileMeshes.values())m.geometry.addEventListener('dispose',()=>disposed++);
 r.syncProjectiles([],store);assert.equal(r.pooledProjectileCount,12);assert.equal(disposed,8);
 for(let i=0;i<100;i++){const p=shot(`test-${i}`);r.syncProjectiles([p],store);r.syncProjectiles([],store);}
 assert.equal(r.pooledProjectileCount,96);assert.ok([...r.projectilePools.values()].every(p=>p.length<=12));
 r.clearProjectilePools();assert.equal(r.projectilePools.size,0);assert.equal(r.pooledProjectileCount,0);
});
test('reuse resets close-camera scale and the heading of stationary ordnance',()=>{
 const {r,store,shot}=fixture(),a=shot();r.syncProjectiles([a],store);const mesh=r.projectileMeshes.get(a.slot);mesh.scale.setScalar(.15);mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),1);
 r.syncProjectiles([],store);store.setVel(a.slot,0,0,0);r.syncProjectiles([a],store);assert.deepEqual(mesh.scale.toArray(),[1,1,1]);assert.deepEqual(mesh.quaternion.toArray(),[0,0,0,1]);
});
test('cargo handling uses cached capacity while still reflecting cargo changes and refits',()=>{
 const player=createNewSave(17,{tutorial:false}).player;player.cargo={ore:3};let calls=0,stats=getEffectiveShipStats(player);
 const session={save:{player},playerStats:()=>{calls++;return stats;}};
 const expected=()=>1-.1*Math.min(1,cargoMass(player)/cargoCapacity(player));
 assert.equal(GameSession.prototype.flightLoadScale.call(session),expected());
 player.cargo={ore:30};assert.equal(GameSession.prototype.flightLoadScale.call(session),expected());
 stats={...stats,cargo:10};assert.equal(GameSession.prototype.flightLoadScale.call(session),1-.1*Math.min(1,cargoMass(player)/10));assert.equal(calls,3);
});

test('retiring a flash preserves the quad used by other live sprites',()=>{
 const {r}=fixture();const flash=new THREE.Sprite(new THREE.SpriteMaterial()),engine=new THREE.Sprite(new THREE.SpriteMaterial());
 assert.equal(flash.geometry,engine.geometry);let geometryDisposals=0,materialDisposals=0;
 const count=()=>geometryDisposals++;flash.geometry.addEventListener('dispose',count);flash.material.addEventListener('dispose',()=>materialDisposals++);
 r.disposeObject(flash);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,1);
 assert.equal(engine.geometry.attributes.position.count,4);flash.geometry.removeEventListener('dispose',count);engine.material.dispose();
});
