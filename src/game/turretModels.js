import {stabilizeMaterialNormals} from './materialNormals.js';
import * as THREE from 'three';
import {TURRET_MODEL_DATA} from './turretModelData.js';
// Blender-authored meshes shared across instances; each instance owns only pivots.
const templates = new Map();
const frigateMaterials=new WeakMap();
const unpaintedTurrets=new WeakMap();
const atlasGeometries=new Map();
// Each face uses a 56px panel inside the hull's existing 64px atlas tiles.
function armorUV(part,kind,index,geometry){
    const p=geometry.attributes.position,uv=new Float32Array(p.count*2),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<p.count;i++)for(let a=0;a<3;a++){const v=p.array[i*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);}
    const [r,g]=part.color,gold=r>.5,light=g>.6;
    for(let i=0;i<p.count;i+=3){
        const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2),n=b.sub(a).cross(c.sub(a));
        const axis=[0,1,2].reduce((best,k)=>Math.abs(n.getComponent(k))>Math.abs(n.getComponent(best))?k:best,0),dims=[0,1,2].filter(k=>k!==axis),face=axis*2+(n.getComponent(axis)>0?1:0);
        let tile;
        if(light)tile=56;
        else if(gold)tile=part.part==='yaw'?32+(index%2):kind==='pdc'&&part.part==='pitch'?24:49;
        else if(r<.1)tile=part.part==='base'?40:24;
        else if(part.part==='pitch'&&axis===1&&n.y>0)tile=32;
        else tile=[8,11,12,13,14,15][(face+index)%6];
        for(let j=0;j<3;j++){
            const k=i+j,u=(p.array[k*3+dims[0]]-min[dims[0]])/Math.max(1e-8,max[dims[0]]-min[dims[0]]),v=(p.array[k*3+dims[1]]-min[dims[1]])/Math.max(1e-8,max[dims[1]]-min[dims[1]]);
            uv[k*2]=(tile%8*64+4+u*56)/512;uv[k*2+1]=1-(Math.floor(tile/8)*64+4+v*56)/512;
        }
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeTangents();
}
export function paintFrigateTurret(root,hullMaterial){
    if(!hullMaterial?.map||root.userData.armorAtlas===hullMaterial.map)return;
    let material=frigateMaterials.get(hullMaterial.map);
    if(!material){material=hullMaterial.clone();material.name='Concord turret armor · shared hull atlas';material.userData.shared=true;material.userData.borrowedTextures=true;stabilizeMaterialNormals(material);frigateMaterials.set(hullMaterial.map,material);}
    root.traverse(o=>{if(!o.isMesh)return;if(o.userData.damageMaterial){o.userData.damageMaterial.dispose();delete o.userData.damageMaterial;}o.material=material;o.userData.healthyMaterial=material;});
    // With one hull atlas, pigment boundaries need no separate draws. The
    // connector remains independent because it has a different seat transform.
    const unpainted = unpaintedTurrets.get(root);
    if (unpainted) {
        for (const [pivot, meshes] of unpainted.parts) {
            const key = unpainted.kind + ':' + pivot;
            if (!atlasGeometries.has(key))
                atlasGeometries.set(key, joinGeometries(meshes.map(mesh => mesh.geometry)));
            meshes[0].geometry = atlasGeometries.get(key);
            for (let i = 1; i < meshes.length; i++) meshes[i].removeFromParent();
        }
        delete root.userData.visualParts;
        unpaintedTurrets.delete(root);
    }
    root.userData.armorAtlas=hullMaterial.map;delete root.userData.healthFraction;
}
function joinGeometries(parts) {
    if (parts.length === 1) return parts[0];
    const geometry = new THREE.BufferGeometry();
    const count = parts.reduce((n, part) => n + part.attributes.position.count, 0);
    for (const [name, sample] of Object.entries(parts[0].attributes)) {
        const values = new Float32Array(count * sample.itemSize);
        let offset = 0;
        for (const part of parts) {
            const src = part.attributes[name].array;
            values.set(src, offset);
            offset += src.length;
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(values, sample.itemSize));
    }
    const indices = [];
    let offset = 0;
    for (const part of parts) {
        for (const vertex of part.index.array) indices.push(offset + vertex);
        offset += part.attributes.position.count;
    }
    geometry.setIndex(indices);
    geometry.userData.shared = true;
    return geometry;
}

// Parts with identical paint that turn about the same pivot can use one draw.
function buildTurretTemplate(kind) {
    const batches = new Map();
    for (const [index, part] of TURRET_MODEL_DATA[kind].entries()) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
        // Rounded Blender export coordinates left collapsed bevel triangles in
        // the laser housing. Omit those faces once when caching the template.
        const p=geometry.attributes.position.array,indices=[];
        for(let i=0;i<p.length;i+=9){
            const ux=p[i+3]-p[i],uy=p[i+4]-p[i+1],uz=p[i+5]-p[i+2],vx=p[i+6]-p[i],vy=p[i+7]-p[i+1],vz=p[i+8]-p[i+2];
            const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
            if(x*x+y*y+z*z>1e-18)indices.push(i/3,i/3+1,i/3+2);
        }
        geometry.setIndex(indices);
        armorUV(part,kind,index,geometry);
        const key = part.part + ':' + part.color.join(',');
        if (!batches.has(key)) batches.set(key, {part:part.part, color:part.color, geometries:[]});
        batches.get(key).geometries.push(geometry);
    }
    return Array.from(batches.values(), batch => {
        const geometry = joinGeometries(batch.geometries);
        const material = new THREE.MeshStandardMaterial({color:new THREE.Color(...batch.color),metalness:.75,roughness:.4});
        geometry.userData.shared = material.userData.shared = true;
        return {part:batch.part, geometry, material};
    });
}

// A short tapered seat bridges the turret foot to the fitted hull surface.
// The slightly wider hull-side end follows the curved lower wings without
// changing the approved turret pivot or its firing axis.
const supportGeometry = new THREE.CylinderGeometry(.42,.48,1,12);
supportGeometry.userData.shared=true;
export function createTurretModel(kind, size, pedestal=0, footprintScale=1) {
    if (!templates.has(kind)) templates.set(kind, buildTurretTemplate(kind));
    const root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group();
    root.name = `${kind}-${size}`; root.userData.pedestal=pedestal;root.userData.footprintScale=footprintScale; root.add(yaw); yaw.add(pitch);
    const parts = new Map();
    unpaintedTurrets.set(root, {kind, parts});
    for (const part of templates.get(kind)) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        if (!parts.has(part.part)) parts.set(part.part, []);
        parts.get(part.part).push(mesh);
        if(part.part==='base'){
            mesh.userData.turretBaseFoot=true;
            mesh.scale.x=mesh.scale.z=footprintScale;
            root.add(mesh);
        }else (part.part === 'yaw' ? yaw : pitch).add(mesh);
    }
    if(pedestal>0){
        const support=new THREE.Mesh(supportGeometry,templates.get(kind)[0].material);
        support.userData.turretSeatConnector=true;
        support.position.y=-.59-pedestal/2;support.scale.y=pedestal;root.add(support);
    }
    root.scale.setScalar(size === 'M' ? 1.3 : 1);
    root.userData.yaw=yaw;root.userData.pitch=pitch;
    root.userData.inverse=new THREE.Quaternion();root.userData.local=new THREE.Vector3();
    return root;
}
