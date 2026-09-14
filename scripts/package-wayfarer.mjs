// Build-time tools only; see scripts/package-ship-models.mjs for installation.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile,stat} from 'node:fs/promises';
const require=createRequire(resolve(process.env.GLTF_TOOLS_ROOT??'/tmp/voidrunner-gltf-tools','package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {prune,dedup,listTextureSlots}=require('@gltf-transform/functions');
const sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const input='.freebuff/wayfarer-rebuild/wayfarer.glb',output='.freebuff/wayfarer-rebuild/packed.glb';
const doc=await io.read(input);
for(const texture of doc.getRoot().listTextures()){
    if(listTextureSlots(texture).includes('baseColorTexture')) {
        const bytes=await sharp(texture.getImage()).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
        texture.setImage(bytes).setMimeType('image/jpeg');
    }
}
await doc.transform(dedup(),prune());
await io.write(output,doc);
const report={fileBytes:(await stat(output)).size,textures:doc.getRoot().listTextures().length,materials:doc.getRoot().listMaterials().map(m=>({name:m.getName(),color:m.getBaseColorFactor(),metallic:m.getMetallicFactor(),roughness:m.getRoughnessFactor()}))};
await writeFile('docs/wayfarer-rebuild/packed.json',JSON.stringify(report,null,2)+'\n');console.log(report);
