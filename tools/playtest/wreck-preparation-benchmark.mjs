// Compare the previous packaged fracture builder with the working tree on
// real hulls. Pass an archived runtime root as the first argument; default is
// dist. This does not start the game.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {GLB_SHIP_CONFIG} from '../../src/game/render.js';
import {ShipWreckFactory as After} from '../../src/game/shipWreckFx.js';
const {ShipWreckFactory:Before}=await import(pathToFileURL(resolve(process.argv[2]??'dist','src/game/shipWreckFx.js')).href);

globalThis.createImageBitmap=async()=>({width:1,height:1});
globalThis.requestIdleCallback=()=>1;
globalThis.cancelIdleCallback=()=>{};
for(const variant of ['kestrel','lancer','atlas-freighter','concord-carrier']){
 const config=GLB_SHIP_CONFIG[variant],bytes=await readFile(config.path??`assets/models/ships/${config.file}`);
 const model=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 model.rotation.y=config.yaw;model.scale.setScalar(config.scale);
 const root=new THREE.Group();root.userData.glb=true;root.add(model);
 const run=Factory=>{
  const factory=new Factory();factory.schedule(root);
  const [key,job]=factory.jobs.entries().next().value,samples=[];let done=false;
  while(!done){const start=performance.now();done=factory.step(key,job);samples.push(performance.now()-start);}
  const template=factory.cache.get(key),hash=createHash('sha256');
  for(const section of template.sections){
   hash.update(JSON.stringify([section.origin.toArray(),section.mass,section.radius]));
   for(const part of section.parts){hash.update(String(part.slot));for(const [name,attribute] of Object.entries(part.geometry.attributes).sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));}}
  }
  samples.sort((a,b)=>a-b);const result={sections:template.sections.length,hash:hash.digest('hex'),steps:samples.length,maxMs:samples.at(-1),p99Ms:samples[Math.floor(samples.length*.99)]};factory.dispose();return result;
 };
 const before=run(Before),after=run(After);assert.equal(after.hash,before.hash,variant+' fracture geometry changed');
 console.log(JSON.stringify({variant,before,after}));
}
