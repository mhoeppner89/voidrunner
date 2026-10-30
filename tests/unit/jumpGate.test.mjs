import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createJumpGateStructure} from '../../src/game/jumpGate.js';

test('gate has batched detail and a clear crossing aperture from either side', () => {
    const radius=460, root=createJumpGateStructure(radius,new THREE.Color('#80bad0'));
    root.updateMatrixWorld(true);
    const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});
    assert.ok(meshes.length<=12, 'architectural detail is batched for mobile rendering');
    assert.ok(root.getObjectByName('armored-pressure-ring'));
    assert.ok(root.getObjectByName('gate-detail-windows'));
    const ray=new THREE.Raycaster();
    for(const side of [-1,1])for(const radial of [0,0.25,0.50,0.514])for(let i=0;i<16;i++) {
        const a=i*Math.PI/8;
        ray.set(new THREE.Vector3(Math.cos(a)*radial*radius,Math.sin(a)*radial*radius,side*radius),new THREE.Vector3(0,0,-side));
        assert.equal(ray.intersectObject(root,true).length,0,`blocked crossing at ${radial}, ${i}, ${side}`);
    }
    ray.set(new THREE.Vector3(0.65*radius,0,radius),new THREE.Vector3(0,0,-1));
    assert.ok(ray.intersectObject(root,true).length>0,'the surrounding frame is solid geometry');
});
