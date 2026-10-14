// Read-only inspection of the GLBs actually configured by the game renderer.
// Run: node --import ./tests/helpers/offline-imports.mjs tools/assets/audit-ship-models.mjs
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../vendor/three.module.min.js';
import {SHIPS} from '../../src/game/data.js';
import {GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';
import {HULL_OBSERVER_ROLE} from '../../src/game/shipPool.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';

const sourceIndex=JSON.parse(await readFile('authoring/manifest.json','utf8'));
const authoring=Object.fromEntries(sourceIndex.models.map(m=>[m.id,m.source]));

function imageSize(bytes) {
    const b=Buffer.from(bytes);
    if(b.subarray(1,4).toString()==='PNG')return[b.readUInt32BE(16),b.readUInt32BE(20)];
    if(b[0]===255&&b[1]===216){
        let i=2;
        while(i<b.length){if(b[i++]!==255)continue;while(b[i]===255)i++;const code=b[i++];
            if(code===0xd9||code===0xda)break;if(code===0x01||code>=0xd0&&code<=0xd7)continue;
            const n=b.readUInt16BE(i);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(code))return[b.readUInt16BE(i+5),b.readUInt16BE(i+3)];i+=n;
        }
    }
    throw Error('Unsupported image header');
}
globalThis.createImageBitmap=async blob=>{const [width,height]=imageSize(await blob.arrayBuffer());return{width,height,close(){}};};
const exists=async path=>{try{await access(path);return path;}catch{return null;}};
const descriptors=Object.entries(SHIPS).map(([id,ship])=>({id,name:ship.name,variant:ship.variant,role:HULL_OBSERVER_ROLE[id],className:ship.className,tier:ship.tier,category:'flyable'}));
for(const variant of Object.keys(GLB_SHIP_CONFIG).filter(id=>id.startsWith('concord-')))
    descriptors.push({id:variant,name:`Concord ${variant.slice(8)[0].toUpperCase()+variant.slice(9)}`,variant,role:'patrol',className:variant.slice(8),category:'capital',tier:null});
for(const kind of ['mining','combat'])descriptors.push({id:`${kind}-drone`,name:`${kind[0].toUpperCase()+kind.slice(1)} drone`,category:'drone',variant:`${kind}-drone`,role:'drone',className:kind==='mining'?'Mining / repair drone':'PDC / attack drone',tier:null});
async function inspectArchive(path){
    if(!path)return null;
    const bytes=await readFile(path),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    let triangles=0,primitives=0;
    const visit=id=>{const node=json.nodes[id];if(node.mesh!==undefined)for(const p of json.meshes[node.mesh].primitives){
        if((p.mode??4)!==4)throw Error(`Non-triangle archive: ${path}`);
        triangles+=json.accessors[p.indices??p.attributes.POSITION].count/3;primitives++;
    }for(const child of node.children??[])visit(child);};
    for(const node of json.scenes[json.scene??0].nodes)visit(node);
    return{triangles,primitives,fileBytes:bytes.length};
}
const models=[];
for(const entry of descriptors){
    const config=GLB_SHIP_CONFIG[entry.variant],path=config?.path??(config?`assets/models/ships/${config.file}`:`assets/models/drones/${entry.variant}.glb`);
    const bytes=await readFile(path),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),binOffset=20+bytes.readUInt32LE(12)+8;
    const images=(json.images??[]).map((image,index)=>{const v=json.bufferViews[image.bufferView],data=bytes.subarray(binOffset+(v.byteOffset??0),binOffset+(v.byteOffset??0)+v.byteLength),[width,height]=imageSize(data);
        const slots=new Set();for(const m of json.materials??[])for(const [slot,t]of Object.entries({...m.pbrMetallicRoughness,normalTexture:m.normalTexture,emissiveTexture:m.emissiveTexture,occlusionTexture:m.occlusionTexture}))if(t?.index!==undefined&&json.textures[t.index].source===index)slots.add(slot.replace('Texture',''));
        return{width,height,bytes:data.length,mimeType:image.mimeType,slots:[...slots]};});
    let hullTriangles=0,equipmentTriangles=0;
    const countShippingParts=id=>{const node=json.nodes[id];if(node.mesh!==undefined)for(const p of json.meshes[node.mesh].primitives){
        const count=json.accessors[p.indices??p.attributes.POSITION].count/3;
        const isMulePdc=entry.id==='mule'&&/^Mule\.(Port|Starboard)\.Frigate PDC /.test(node.name??'');
        if(isMulePdc)equipmentTriangles+=count;else hullTriangles+=count;
    }for(const child of node.children??[])countShippingParts(child);};
    for(const node of json.scenes[json.scene??0].nodes)countShippingParts(node);
    const sourceTriangles=hullTriangles+equipmentTriangles;
    const scene=await buildGlbScene(buffer);scene.rotation.y=config?.yaw??0;
    const runtimeScale=config?config.scale*npcShipScaleForVariant(entry.variant):1.15;
    const baseScale=config?(config.baseScale??(entry.variant==='atlas-freighter'?.92:entry.role==='miner'?1.04:entry.role==='bounty'?1.02:1)):1;
    scene.scale.setScalar(runtimeScale*baseScale);scene.updateMatrixWorld(true);
    let triangles=0,vertices=0,degenerateTriangles=0,nonFiniteVertices=0,primitives=0,missingUV=0;
    scene.traverse(o=>{if(!o.isMesh)return;primitives++;const p=o.geometry.attributes.position,indices=o.geometry.index;
        vertices+=p.count;triangles+=(indices?.count??p.count)/3;if(!o.geometry.attributes.uv)missingUV++;
        for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))nonFiniteVertices++;
        const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
        for(let i=0;i<(indices?.count??p.count);i+=3){a.fromBufferAttribute(p,indices?indices.getX(i):i);b.fromBufferAttribute(p,indices?indices.getX(i+1):i+1).sub(a);c.fromBufferAttribute(p,indices?indices.getX(i+2):i+2).sub(a);if(b.cross(c).lengthSq()<1e-20)degenerateTriangles++;}
    });
    if(triangles!==sourceTriangles)throw Error(`${entry.id}: decoded triangle count differs from GLB accessors`);
    const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()).toArray();
    const rebuilt=Boolean(authoring[entry.id])||entry.category==='drone';
    const original=await exists(`authoring/references/glb_models/ships/${entry.id}.glb`);
    models.push({...entry,path,sha256:createHash('sha256').update(bytes).digest('hex'),hullTriangles,equipmentTriangles,provenance:rebuilt?'rebuilt':'adapted',provenanceLabel:rebuilt?'Blender rebuild':'Adapted original',
        note:entry.id==='mule'?'Approved transporter, renamed Mule.':entry.id==='blade'?'Rebuilt hull with fitted Concord armor, normal and surface maps.':entry.id==='concord-carrier'?'Approved carrier with six hangars, 5,767 tiny windows, physically scaled armor and 14 dorsal/ventral gun mounts.':rebuilt?'Reconstructed in Blender with fitted low-resolution PBR armor and separate glazing.':entry.category==='capital'?'Original hull adapted for game scale and materials.':'Original geometry simplified; canopy / texture fixes where recorded.',
        originalStats:await inspectArchive(original),
        authoring:await exists(authoring[entry.id]??'output/invalid-source'),original,
        triangles,vertices,primitives,materials:(json.materials??[]).length,fileBytes:bytes.length,images,degenerateTriangles,nonFiniteVertices,missingUV,
        gameSize:size,gameLength:size[2],runtimeScale,baseScale,
    });
}
await mkdir('output/model-audit',{recursive:true});
const version=(await readFile('src/game/ui.js','utf8')).match(/GAME_VERSION\s*=\s*'([^']+)'/)?.[1];
if(!version)throw Error('Missing game release version');
const report={version,shipCount:models.filter(m=>m.category!=='drone').length,droneCount:models.filter(m=>m.category==='drone').length,models};
await writeFile('output/model-audit/inventory.json',JSON.stringify(report,null,2)+'\n');
console.log(models.map(m=>`${m.name}: ${m.triangles} triangles, ${m.images.map(i=>`${i.width}×${i.height}`).join(',')||'material colors'}, ${m.provenanceLabel}`).join('\n'));
