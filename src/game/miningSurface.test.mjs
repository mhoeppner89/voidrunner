import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMiningContacts,updateMiningContacts} from './miningSurface.js';
const node={radius:8,scale:[1,1.3,.8],rotation:[.3,.7,.1],position:[100,20,30],shape:2,moving:false};
const cache=createMiningContacts(node,[100,20,90],6),ids=Array.from({length:6},(_,i)=>String(i)),points=Object.fromEntries(ids.map(id=>[id,{position:[0,0,0],velocity:[0,0,0]}]));
updateMiningContacts(cache,points,ids,0);
assert.equal(new Set(ids.map(id=>points[id].position.join(','))).size,6);
for(let i=0;i<6;i++)for(let j=0;j<i;j++)assert.ok(cache.contacts[i].position.distanceTo(cache.contacts[j].position)>=3,'miners have room for their cutter arms');
for(const id of ids){const p=points[id],q=new THREE.Quaternion().fromArray(p.rotation),up=new THREE.Vector3(0,1,0).applyQuaternion(q);assert.ok(up.dot(new THREE.Vector3().fromArray(p.normal))>.99999,'belly faces rock');}
const before=[...points['0'].position];node.position[0]+=1;updateMiningContacts(cache,points,ids,.1);assert.ok(Math.abs(points['0'].position[0]-before[0]-1)<1e-8,'contact follows rock');assert.ok(Math.abs(points['0'].velocity[0]-10)<1e-8);
for(const id of ids){const p=points[id];assert.ok(Math.abs(Math.hypot(...p.lift.position.map((v,k)=>v-p.position[k]))-3)<1e-8,'takeoff clears surface');}
console.log('Mining contact: separate surface patches, belly alignment, moving-rock attachment and lift clearance passed.');
