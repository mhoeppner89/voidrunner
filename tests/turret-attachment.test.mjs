import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {SpaceRenderer} from '../src/game/render.js';
import {TURRET_LAYOUTS} from '../src/game/turretLayouts.js';
function renderer(){const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();r.shipMeshes=new Map();r.dynamicRoot=new THREE.Group();r.glbShipModels=new Map();r.glbShipLoading=new Map();r.shipSyncRevision=0;r.tmpPrevPos=new THREE.Vector3();r.tmpPrevQuat=new THREE.Quaternion();r.tmpCurQuat=new THREE.Quaternion();return r;}
test('all hull turret bases follow the interpolated hull through motion, roll and multiple simulation steps',()=>{
 for(const [hull,mounts] of Object.entries(TURRET_LAYOUTS))for(const [index,m] of mounts.entries()){
 const r=renderer(),body=new THREE.Group();body.visible=true;r.shipMeshes.set('npc',body);
 const actor={id:'npc',position:[20,30,40],rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,.3)).toArray(),lifetime:1};
 const offset=new THREE.Vector3(m.position[0]*8,m.position[1]*9,m.position[2]*30),q=new THREE.Quaternion().fromArray(actor.rotation),point=offset.clone().applyQuaternion(q).add(new THREE.Vector3(...actor.position)),direction=new THREE.Vector3(.3,.4,-.8).normalize();
 r.showTurret('npc-'+index,point,direction,m.size,'pdc',q,m.side,m.pedestal,1,m.axis??1,actor);
 // Rendering can lag the current simulation pose by part of one fixed step.
 for(const alpha of [0,.01,.4,.9,1]){body.position.set(-10,20,35).lerp(new THREE.Vector3(...actor.position),alpha);body.quaternion.identity().slerp(q,alpha);r.syncTurretAttachments(alpha);
 const turret=r.turretMeshes.get('npc-'+index),local=turret.position.clone().sub(body.position).applyQuaternion(body.quaternion.clone().invert());
 assert.ok(local.distanceTo(offset)<1e-10,`${hull} ${index}, alpha ${alpha}`);const normal=new THREE.Vector3(0,1,0).applyQuaternion(turret.quaternion).applyQuaternion(body.quaternion.clone().invert());assert.ok(normal.distanceTo(new THREE.Vector3().setComponent(m.axis??1,m.side))<1e-10);
 }
 body.visible=false;r.syncTurretAttachments(.5);assert.equal(r.turretMeshes.get('npc-'+index).visible,false);
 }
});
test('hulls remain rigid and alpha zero renders the previous simulation pose',()=>{const r=renderer();const body=new THREE.Group();body.userData.variant='talon';body.userData.baseScale=1;r.shipMeshes.set('npc',body);r.glbShipModels.set('talon',null);const actor={id:'npc',variant:'talon',role:'pirate',position:[20,30,40],prevPosition:[19,28,37],rotation:[0,0,0,1],prevRotation:[0,0,0,1],hull:100,maxHull:100};for(const alpha of [0,.2,.8,1]){r.syncShips([actor],alpha);assert.deepEqual(body.scale.toArray(),[1,1,1]);assert.ok(body.position.distanceTo(new THREE.Vector3(19,28,37).lerp(new THREE.Vector3(20,30,40),alpha))<1e-10);}});
