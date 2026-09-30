import * as THREE from 'three';
import { ORDNANCE_MODEL_DATA } from './ordnanceModelData.js';

const templates=new Map();
let material;
export function createOrdnanceModel(kind='seeker') {
    const id=ORDNANCE_MODEL_DATA[kind]?kind:'seeker',data=ORDNANCE_MODEL_DATA[id];
    if(!material){
        material=new THREE.MeshStandardMaterial({color:0xffffff,metalness:.45,roughness:.52});
        material.userData.shared=true;
        if(typeof document!=='undefined'){
            const map=new THREE.TextureLoader().load(new URL('../../assets/models/ordnance/ordnance-atlas.png',import.meta.url).href);
            map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;map.userData.shared=true;material.map=map;
        }
    }
    if(!templates.has(id)){
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));
        geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.shared=true;
        templates.set(id,geometry);
    }
    const model=new THREE.Mesh(templates.get(id),material);
    model.name=`ordnance-${id}`;model.userData.ordnanceId=id;model.userData.triangles=data.triangles;model.userData.length=data.length;
    return model;
}
