// Install build tools separately: npm install --prefix /tmp/voidrunner-gltf-tools @gltf-transform/cli@4.5.0
// No runtime decoder or compressed geometry is required by these GLBs.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile,stat} from 'node:fs/promises';
const require=createRequire(resolve(process.env.GLTF_TOOLS_ROOT??'/tmp/voidrunner-gltf-tools','package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {dedup,prune,listTextureSlots}=require('@gltf-transform/functions');
const sharp=require('sharp');
const io=new NodeIO();
const destination='.freebuff/ship-cleanup/packed';
await mkdir(destination,{recursive:true});
const report=[];
for(const hull of ['wayfarer','talon','vanguard','prospector','lancer','atlas']) {
    const document=await io.read(`.freebuff/ship-cleanup/candidate/${hull}.glb`);
    const textures=[];
    for(const texture of document.getRoot().listTextures()) {
        const color=listTextureSlots(texture).includes('baseColorTexture');
        // Restore 2k paint where original source detail exists, retain 1k
        // material masks. PNG/JPEG are decoded by the existing static loader.
        const bytes=await sharp(texture.getImage()).resize({width:color?2048:1024,height:color?2048:1024,fit:'inside',withoutEnlargement:true})
            .jpeg({quality:color?94:90,chromaSubsampling:color?'4:4:4':'4:2:0'}).toBuffer();
        texture.setImage(bytes).setMimeType('image/jpeg');
        const meta=await sharp(bytes).metadata();
        textures.push({slot:color?'baseColor':'metallicRoughness',width:meta.width,height:meta.height,bytes:bytes.length});
    }
    await document.transform(dedup(),prune());
    await io.write(`${destination}/${hull}.glb`,document);
    let triangles=0;
    for(const mesh of document.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
    report.push({hull,triangles,fileBytes:(await stat(`${destination}/${hull}.glb`)).size,textures});
}
await writeFile('docs/ship-cleanup/packed-stats.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
