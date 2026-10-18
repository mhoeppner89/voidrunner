import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {GRAVEYARD_MODEL_WRECKS,generateGraveyardPieces,getGraveyardGeometry} from '../../src/game/worldData.js';

test('exposed skins and decks in every wreck have an opposing surface',async()=>{
    const bitmap=globalThis.createImageBitmap;
    globalThis.createImageBitmap=async()=>({width:512,height:512});
    try {
        for(const w of GRAVEYARD_MODEL_WRECKS.filter((w,i,a)=>a.findIndex(x=>x.file===w.file)===i)) {
            const b=await readFile(w.file),root=await buildGlbScene(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),meshes=[];
            root.updateMatrixWorld(true);root.traverse(m=>{if(m.isMesh)meshes.push(m);});
            for(const [name,parts]of Map.groupBy(meshes,m=>m.name)) {
                const samples=[];
                for(const m of parts) {
                    // Test the broad skins, rather than their new narrow edge
                    // walls. A side wall is an edge of a plate, not a sheet.
                    if(/Torn structural alloy/i.test(m.material.name))continue;
                    const p=m.geometry.attributes.position,idx=m.geometry.index;
                    for(let i=0;i<idx.count;i+=3) {
                        const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,idx.getX(i+j))),ab=b.clone().sub(a),ac=c.clone().sub(a),n=ab.clone().cross(ac),area=n.length()/2;
                        if(area<.000025||area/Math.max(ab.lengthSq(),ac.lengthSq(),b.distanceToSquared(c))<.08)continue;
                        samples.push({area,p:a.add(b).add(c).multiplyScalar(1/3),n:n.normalize()});
                    }
                }
                assert.ok(samples.length,name+' has no testable skin');
                samples.sort((a,b)=>b.area-a.area);
                for(let i=0;i<80;i++) {
                    const s=samples[Math.floor(i*samples.length/80)];
                    const hasBacking=sign=>new T.Raycaster(s.p.clone().addScaledVector(s.n,sign*.00003),s.n.clone().multiplyScalar(-sign),0,3).intersectObjects(parts,true).some(h=>h.distance>.00004);
                    assert.ok(hasBacking(1)||hasBacking(-1),`${w.class}: ${name} is a single skin at ${s.p.toArray()}`);
                }
            }
            for(const m of meshes){m.geometry.dispose();m.material.dispose();}
        }
    }finally{globalThis.createImageBitmap=bitmap;}
});

test('all debris types have volume and loose plates retain readable thickness',()=>{
    const pieces=generateGraveyardPieces(718);
    for(const kind of new Set(pieces.map(p=>p.kind))) {
        const g=getGraveyardGeometry(kind),p=g.attributes.position,idx=g.index;let volume=0;
        for(let i=0;i<(idx?.count??p.count);i+=3){const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j));volume+=a.dot(b.cross(c))/6;}
        assert.ok(Math.abs(volume)>.001,kind+' is a zero-volume surface');
    }
    const g=getGraveyardGeometry('panel');g.computeBoundingBox();const depth=g.boundingBox.max.y-g.boundingBox.min.y;
    for(const p of pieces.filter(p=>p.kind==='panel'))assert.ok(depth*p.scale[1]>=Math.max(.2,Math.min(p.scale[0],p.scale[2])*.045)-1e-6,p.id+' is scaled too thin');
});
