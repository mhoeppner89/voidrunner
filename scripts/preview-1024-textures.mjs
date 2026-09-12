// Preview only. Start from approved runtime models; never sharpen cumulatively.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.GLTF_TOOLS_ROOT??'/tmp/voidrunner-gltf-tools','package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {listTextureSlots}=require('@gltf-transform/functions');
const sharp=require('sharp'),validator=require('gltf-validator');
const io=new NodeIO(),destination='.freebuff/texture-1024';
await mkdir(destination,{recursive:true});await mkdir('docs/texture-1024',{recursive:true});
const report=[];
for(const hull of ['wayfarer','talon','vanguard','prospector','lancer','atlas']){
 const source=`assets/models/ships/${hull}.glb`,d=await io.read(source),textures=[];
 const geometry=d.getRoot().listAccessors().map(a=>Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength).toString('base64'));
 for(const texture of d.getRoot().listTextures()){
  const color=listTextureSlots(texture).includes('baseColorTexture');
  const input=texture.getImage(),before=await sharp(input).metadata();
  let bytes=input;
  if(color){
   bytes=await sharp(input).resize(1024,1024,{fit:'inside',kernel:'lanczos3',withoutEnlargement:true})
    .linear(1.07,-8.96).sharpen({sigma:.6,m1:.6,m2:1.2,x1:2,y2:4,y3:8})
    .jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
   texture.setMimeType('image/jpeg');
  }else if(before.width>1024||before.height>1024){
   bytes=await sharp(input).resize(1024,1024,{fit:'inside',kernel:'lanczos3'}).png().toBuffer();texture.setMimeType('image/png');
  }
  texture.setImage(bytes);
  const after=await sharp(bytes).metadata();assert.ok(after.width<=1024&&after.height<=1024);
  textures.push({slot:color?'color':'material',before:[before.width,before.height],after:[after.width,after.height],adjustedContrast:color});
 }
 const output=`${destination}/${hull}.glb`;await io.write(output,d);
 const reloaded=await io.read(output);
 assert.deepEqual(reloaded.getRoot().listAccessors().map(a=>Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength).toString('base64')),geometry,'Geometry/UVs changed');
 const bytes=await io.writeBinary(reloaded),validation=await validator.validateBytes(bytes);
 assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
 report.push({hull,beforeBytes:(await stat(source)).size,afterBytes:(await stat(output)).size,textures,geometryUnchanged:true,errors:0,warnings:0});
}
await writeFile('docs/texture-1024/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({hull,beforeBytes,afterBytes})=>({hull,beforeBytes,afterBytes})),null,2));
