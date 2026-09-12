// Preview only: preserve shipped wrecks until visual/interior review is approved.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.GLTF_TOOLS_ROOT??'/tmp/voidrunner-gltf-tools','package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {copyToDocument,prune,unpartition,listTextureSlots}=require('@gltf-transform/functions');
const sharp=require('sharp'),validator=require('gltf-validator');
const files=['concord-battleship-wreck-v4','concord-carrier-wreck-v4','concord-cruiser-wreck-v4','concord-frigate-wreck-v3','wayfarer-wreck','talon-wreck'];
const io=new NodeIO(),destination='.freebuff/wreck-optimization';
await mkdir(destination,{recursive:true});await mkdir('docs/wreck-optimization',{recursive:true});
const triangles=d=>d.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
const transforms=d=>d.getRoot().listNodes().map(n=>({name:n.getName(),matrix:n.getMatrix()}));
const report=[];
for(const file of files){
 const source=`assets/models/wrecks/${file}.glb`,original=await io.read(source),rebuilt=file==='talon-wreck',d=rebuilt?await io.read(`${destination}/rebuilt/${file}.glb`):original,beforeTriangles=triangles(original),nodes=transforms(d),textures=[];
 if(!rebuilt){
 const reduced=await io.read(`${destination}/geometry/${file}.glb`);
 const materials=new Map(d.getRoot().listMaterials().map(m=>[m.getName(),m]));
 const map=copyToDocument(d,reduced,reduced.getRoot().listMeshes());
 for(const node of d.getRoot().listNodes()){
  const other=reduced.getRoot().listNodes().find(n=>n.getName()===node.getName());
  assert.ok(other);assert.ok(node.getMatrix().every((x,i)=>Math.abs(x-other.getMatrix()[i])<1e-6));
  const mesh=map.get(other.getMesh());
  for(const prim of mesh.listPrimitives()){const material=materials.get(prim.getMaterial()?.getName());assert.ok(material);prim.setMaterial(material);}
  node.setMesh(mesh);
 }
 await d.transform(prune({keepAttributes:true}),unpartition());
 }
 for(const t of d.getRoot().listTextures()){
  const color=listTextureSlots(t).includes('baseColorTexture'),input=t.getImage(),before=await sharp(input).metadata();
  // Faded paint retains authored markings; no UV-stretched procedural scratches.
  let pipeline=sharp(input).resize(512,512,{fit:'inside',kernel:'lanczos3',withoutEnlargement:true});
  const output=color?await pipeline.modulate({saturation:.68}).linear(.92,10).sharpen({sigma:.5,m1:.4,m2:.8,x1:2,y2:3,y3:5}).jpeg({quality:88,chromaSubsampling:'4:4:4'}).toBuffer():await pipeline.jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
  t.setImage(output).setMimeType('image/jpeg');
  const after=await sharp(t.getImage()).metadata();textures.push({color,before:[before.width,before.height],after:[after.width,after.height],bytesBefore:input.length,bytesAfter:t.getImage().length,adjusted:t.getImage()!==input});
 }
 const output=`${destination}/${file}.glb`;await io.write(output,d);const loaded=await io.read(output);assert.deepEqual(transforms(loaded),nodes);
 const validation=await validator.validateBytes(await io.writeBinary(loaded));assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
 report.push({file,beforeTriangles,afterTriangles:triangles(loaded),beforeBytes:(await stat(source)).size,afterBytes:(await stat(output)).size,textures,nodeTransformsUnchanged:!rebuilt,talonBreakupRebuilt:rebuilt,errors:0,warnings:0});
 console.log(report.at(-1));
}
await writeFile('docs/wreck-optimization/validation.json',JSON.stringify(report,null,2)+'\n');
