// Build-only tools: use the same GLTF_TOOLS_ROOT as package-ship-models.mjs.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.env.GLTF_TOOLS_ROOT??'/tmp/voidrunner-gltf-tools','package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {dedup,prune}=require('@gltf-transform/functions');
const io=new NodeIO(),path='.freebuff/lancer-paint/lancer.glb';
const document=await io.read(path);
for(const material of document.getRoot().listMaterials())material.setName(material.getName().replace(/\.\d+$/,''));
await document.transform(dedup(),prune());
await io.write(path,document);
