import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stabilizeMaterialNormals} from '../../src/game/materialNormals.js';
import {prepareGraveyardModel,createGraveyardPlating} from '../../src/game/graveyardArt.js';

test('normal stabilization preserves paint hooks, textures and separately cloned materials',()=>{
 const map=new THREE.Texture(),m=new THREE.MeshStandardMaterial({normalMap:map});let painted=0;
 m.onBeforeCompile=shader=>{painted++;shader.fragmentShader+='\n// existing paint';};
 stabilizeMaterialNormals(m);const hook=m.onBeforeCompile,key=m.customProgramCacheKey();stabilizeMaterialNormals(m);assert.equal(m.onBeforeCompile,hook);
 const shader={fragmentShader:'#include <normal_fragment_maps>'};m.onBeforeCompile(shader,{});
 assert.equal(painted,1);assert.match(shader.fragmentShader,/existing paint/);assert.match(shader.fragmentShader,/mappedLength>1e-8&&mappedLength<1e8/);assert.equal(m.normalMap,map);
 const clone=m.clone();stabilizeMaterialNormals(clone);const other={fragmentShader:'#include <normal_fragment_maps>'};clone.onBeforeCompile(other,{});assert.match(other.fragmentShader,/mappedLength/);assert.equal(clone.normalMap,map);assert.equal(m.customProgramCacheKey(),key);
 const plain=new THREE.MeshStandardMaterial(),plainHook=plain.onBeforeCompile;stabilizeMaterialNormals(plain);assert.equal(plain.onBeforeCompile,plainHook);
});

test('wreck paint retains its original plating and safe normal mapping',()=>{
 const root=new THREE.Group(),map=new THREE.Texture(),plating=createGraveyardPlating(),source=new THREE.MeshStandardMaterial({normalMap:map});root.add(new THREE.Mesh(new THREE.BoxGeometry(),source));
 prepareGraveyardModel(root,plating);const m=root.children[0].material,shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>',uniforms:{}};
 m.onBeforeCompile(shader,{});assert.equal(m.normalMap,map);assert.match(shader.fragmentShader,/gyPlating/);assert.match(shader.fragmentShader,/mappedLength/);assert.equal(shader.uniforms.gyPlating.value,plating);
});
