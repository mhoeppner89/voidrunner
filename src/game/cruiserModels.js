import * as THREE from 'three';
import {CRUISER_TURRET_DATA,CRUISER_PDC_DATA,CRUISER_MOUNTS,CRUISER_ARMAMENT_COUNT} from './cruiserModelData.js';
import {paintFrigateTurret} from './turretModels.js';
import {setFrigateComponentDamage} from './frigateComponents.js';
const templateCache=new Map();
const material=new THREE.MeshStandardMaterial({color:0x52667e,metalness:.68,roughness:.55});material.userData.shared=true;
function createArticulatedTurret(data,name,pivot){
 let templates=templateCache.get(name);
 if(!templates){
  // One draw per articulated part, with shared geometry across all cruisers.
  const groups=new Map();
  for(const p of data){let data=groups.get(p.part);if(!data){data={positions:[],normals:[],uvs:[]};groups.set(p.part,data);}data.positions.push(...p.positions);data.normals.push(...p.normals);data.uvs.push(...p.uvs);}
  templates=[...groups].map(([part,p])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(p.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(p.uvs,2));g.computeBoundingBox();g.userData.shared=true;return {part,geometry:g};});templateCache.set(name,templates);
 }
 const root=new THREE.Group(),yaw=new THREE.Group(),pitch=new THREE.Group();root.name=name;root.add(yaw);yaw.add(pitch);pitch.position.y=pivot;
 for(const p of templates)(p.part==='base'?root:p.part==='yaw'?yaw:pitch).add(new THREE.Mesh(p.geometry,material));
 root.userData.yaw=yaw;root.userData.pitch=pitch;root.userData.inverse=new THREE.Quaternion();root.userData.local=new THREE.Vector3();root.userData.pedestal=0;
 return root;
}
export function createCruiserTurret(){return createArticulatedTurret(CRUISER_TURRET_DATA,'capital-M',.72);}
export function createCruiserPdc(){return createArticulatedTurret(CRUISER_PDC_DATA,'pdc-S',.5);}
export function createCruiserArmament(ownerId,hullMaterial){
 const root=new THREE.Group();root.name='cruiser-armament';
 for(const m of CRUISER_MOUNTS.slice(0,CRUISER_ARMAMENT_COUNT)){
  const gun=m.kind==='battery'?createCruiserTurret():createCruiserPdc();
  gun.position.fromArray(m.position);gun.scale.setScalar(m.size);if(m.axis===0)gun.rotation.z=-m.side*Math.PI/2;
  if(m.kind==='pdc')gun.userData.pitch.rotation.x=Math.PI/4;
  paintFrigateTurret(gun,hullMaterial);gun.name=m.label;gun.userData.targetId=ownerId;gun.userData.targetKind='ship';gun.userData.targetMount=m.index;
  root.add(gun);
 }
 return root;
}
const deadMaterial=new THREE.MeshStandardMaterial({color:0x202328,roughness:.94,metalness:.2,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});deadMaterial.userData.shared=true;
export function createCruiserEngineDamage(){
 const root=new THREE.Group();root.name='cruiser-engine-damage';
 for(const m of CRUISER_MOUNTS.slice(CRUISER_ARMAMENT_COUNT)){
  const g=new THREE.CylinderGeometry(m.radius*1.03,m.radius*1.03,m.halfLength*2+.5,16);g.rotateX(Math.PI/2);
  const mesh=new THREE.Mesh(g,deadMaterial);mesh.position.fromArray(m.position);mesh.visible=false;root.add(mesh);
 }
 return root;
}
export function updateCruiserEngineDamage(root,ship){root.children.forEach((o,i)=>{o.visible=ship.capitalMountHull[i+CRUISER_ARMAMENT_COUNT]===0;});}
export function setCruiserReviewDamage(root,ship){root.children.forEach((gun,i)=>setFrigateComponentDamage(gun,ship.capitalMountHull[i],CRUISER_MOUNTS[i].hull));}
