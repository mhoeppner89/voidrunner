import * as THREE from 'three';
import {TURRET_MODEL_DATA} from './turretModelData.js';
// Blender-authored meshes shared across instances; each instance owns only pivots.
const templates = new Map();
const supportGeometry = new THREE.CylinderGeometry(.38,.46,1,12);
supportGeometry.userData.shared=true;
export function createTurretModel(kind, size, pedestal=0) {
    if (!templates.has(kind)) templates.set(kind, TURRET_MODEL_DATA[kind].map(part => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
        const material = new THREE.MeshStandardMaterial({color:new THREE.Color(...part.color),metalness:.75,roughness:.4});
        geometry.userData.shared=true;material.userData.shared=true;
        return {...part,geometry,material};
    }));
    const root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group();
    root.name = `${kind}-${size}`; root.userData.pedestal=pedestal; root.add(yaw); yaw.add(pitch);
    for (const part of templates.get(kind)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        (part.part === 'base' ? root : part.part === 'yaw' ? yaw : pitch).add(mesh);
    }
    if(pedestal>0){
        const support=new THREE.Mesh(supportGeometry,templates.get(kind)[0].material);
        support.position.y=-.59-pedestal/2;support.scale.y=pedestal;root.add(support);
    }
    root.scale.setScalar(size === 'M' ? 1.3 : 1);
    root.userData.yaw=yaw;root.userData.pitch=pitch;
    root.userData.inverse=new THREE.Quaternion();root.userData.local=new THREE.Vector3();
    return root;
}
