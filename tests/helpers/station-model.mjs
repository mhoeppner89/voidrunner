import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stationModelOffsetZ,stationVisualSurfaceRadius} from '../../src/game/stationTraffic.js';
import {stationYaw,stationRotatePoint} from '../../src/game/stationOrientation.js';

// Geometry-only GLB reader: test the shipping vertices and node transforms,
// without a browser/image decoder or an invented collision proxy.
export function stationModel(id) {
    const b=fs.readFileSync(new URL(`../../assets/models/stations/${id}.glb`,import.meta.url));
    const jsonLength=b.readUInt32LE(12), gltf=JSON.parse(b.toString('utf8',20,20+jsonLength));
    const binary=20+jsonLength+8;
    function attribute(index,size) {
        const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView];
        const bytes=({5126:4,5125:4,5123:2,5121:1})[a.componentType];
        const values=a.componentType===5126?new Float32Array(a.count*size):new Uint32Array(a.count*size);
        for(let i=0;i<a.count;i++) for(let j=0;j<size;j++) {
            const offset=binary+(view.byteOffset??0)+(a.byteOffset??0)+i*(view.byteStride??size*bytes)+j*bytes;
            values[i*size+j]=a.componentType===5126?b.readFloatLE(offset):bytes===4?b.readUInt32LE(offset):bytes===2?b.readUInt16LE(offset):b.readUInt8(offset);
        }
        return new THREE.BufferAttribute(values,size);
    }
    const nodes=gltf.nodes.map(node=>{
        const group=new THREE.Group();
        if(node.matrix){group.matrix.fromArray(node.matrix);group.matrixAutoUpdate=false;}
        else {if(node.translation)group.position.fromArray(node.translation);if(node.rotation)group.quaternion.fromArray(node.rotation);if(node.scale)group.scale.fromArray(node.scale);}
        if(node.mesh!==undefined) for(const p of gltf.meshes[node.mesh].primitives) {
            assert.equal(p.mode??4,4);
            const geo=new THREE.BufferGeometry();geo.setAttribute('position',attribute(p.attributes.POSITION,3));if(p.indices!==undefined)geo.setIndex(attribute(p.indices,1));
            group.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial()));
        }
        return group;
    });
    gltf.nodes.forEach((n,i)=>{for(const c of n.children??[])nodes[i].add(nodes[c]);});
    const root=new THREE.Group();for(const i of gltf.scenes[gltf.scene??0].nodes)root.add(nodes[i]);
    root.scale.setScalar(stationVisualSurfaceRadius(id)/100);root.position.fromArray(stationRotatePoint(id,[0,0,stationModelOffsetZ(id)]));root.rotation.y=stationYaw(id);
    return root;
}
