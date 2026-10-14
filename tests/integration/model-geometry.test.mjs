import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildGlbScene} from '../../src/game/glbLoader.js';
const manifest=JSON.parse(await readFile('assets/models/fleet-manifest.json','utf8'));
// Retains the useful shipping-geometry checks from the old rebuild audit without
// depending on abandoned Blender revisions, duplicate exports or screenshots.
test('every shipping hull and drone has finite, indexed geometry and usable mapped material attributes',async t=>{
 globalThis.createImageBitmap??=async()=>({});
 t.mock.method(globalThis,'createImageBitmap',async()=>({width:1,height:1,close(){}}));
 for(const model of manifest.models){
  const bytes=await readFile(model.path),root=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));let meshes=0;
  root.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry,p=g.attributes.position;
   assert.ok(p?.count>0,`${model.id}/${o.name}: no vertices`);assert.equal(g.index.count%3,0);
   for(const index of g.index.array)assert.ok(index<p.count,`${model.id}: index outside vertex buffer`);
   for(const [name,a] of Object.entries(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v),`${model.id}/${o.name}: invalid ${name}`);
   for(const material of Array.isArray(o.material)?o.material:[o.material]){
    if(material.map||material.normalMap||material.roughnessMap)assert.equal(g.attributes.uv?.count,p.count,`${model.id}: missing UVs`);
    if(material.normalMap)assert.equal(g.attributes.tangent?.count,p.count,`${model.id}: missing normal-map tangents`);
   }
  });assert.ok(meshes>0,`${model.id}: empty shipping model`);
 }
});
