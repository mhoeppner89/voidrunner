import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as THREE from '../../vendor/three.module.min.js';
import {createCapitalEngineExhaust,updateCapitalEngineExhaust,capitalExhaustLayout} from '../../src/game/capitalEngineExhaust.js';
import {CRUISER_MOUNTS} from '../../src/game/cruiserModelData.js';
import {FRIGATE_MOUNTS,FRIGATE_ENGINE_MOUNTS} from '../../src/game/frigateMounts.js';
import {SpaceRenderer,GLB_SHIP_CONFIG} from '../../src/game/render.js';

test('each cruiser and frigate drive has its own correctly sized exhaust and damage state',()=>{
 for(const [variant,mounts,count] of [['concord-cruiser',CRUISER_MOUNTS,4],['concord-frigate',FRIGATE_MOUNTS,3]]){
  const root=createCapitalEngineExhaust(variant),layout=capitalExhaustLayout(variant),ship={capitalMountHull:mounts.map(m=>m.hull),velocity:[0,0,0],speed:18};assert.equal(root.children.length,count);assert.equal(root.children[0].userData.face.material.polygonOffset,true);
  if(count===3)assert.deepEqual(layout.map(m=>m.index),FRIGATE_ENGINE_MOUNTS);
  for(const [i,m] of layout.entries()){
   assert.ok(m.radius>mounts[m.index].radius*.6&&m.radius<mounts[m.index].radius);assert.deepEqual(root.children[i].position.toArray(),m.position);
   ship.capitalMountHull[m.index]=0;updateCapitalEngineExhaust(root,ship,2);
   assert.equal(root.children[i].visible,false);assert.equal(root.children[i].userData.face.material.uniforms.uOutput.value,0);assert.equal(root.children[i].userData.halo.material.opacity,0);
   assert.equal(root.children.filter(o=>o.visible).length,count-1);ship.capitalMountHull[m.index]=m.maxHull;
  }
  updateCapitalEngineExhaust(root,ship,3);assert.ok(root.children.every(o=>o.visible));
 }
});
test('thrust increases the soft plume; docking hides all exhaust without replacing shared geometry',()=>{
 const root=createCapitalEngineExhaust('concord-cruiser'),ship={velocity:[0,0,0],speed:18};updateCapitalEngineExhaust(root,ship,1);const jet=root.children[0].userData.jets[0],idle=jet.scale.y,geometry=jet.geometry;
 ship.burning=true;updateCapitalEngineExhaust(root,ship,2);assert.ok(jet.scale.y>idle*2);assert.equal(jet.geometry,geometry);assert.ok(jet.material.transparent&&jet.material.depthWrite===false);
 ship.stationDock={phase:'docked'};updateCapitalEngineExhaust(root,ship,3);assert.ok(root.children.every(o=>!o.visible));
});
test('game ship clones use the same exhaust as the review and omit the old small flares',()=>{
 const renderer={createDronePorts:()=>new THREE.Group(),radialTexture:()=>new THREE.Texture(),tagTargetable(){}};
 for(const variant of ['concord-cruiser','concord-frigate']){
  const model=new THREE.Group(),ship={id:variant,variant,faction:'concord',role:'patrol'};
  const wrapper=SpaceRenderer.prototype.createGlbShipMesh.call(renderer,ship,model,GLB_SHIP_CONFIG[variant],variant);
  assert.equal(wrapper.userData.engineFlares.length,0);assert.equal(wrapper.userData.capitalExhaust.children.length,capitalExhaustLayout(variant).length);assert.ok(wrapper.children.includes(wrapper.userData.capitalExhaust));
 }
});
test('supported cruiser bases and complete ship including exhaust stay below ten thousand triangles',()=>{
 const report=JSON.parse(readFileSync(new URL('../fixtures/current-fleet/concord-cruiser/model-report.json',import.meta.url)));assert.equal(report.engineBasesFullySupported,true);
 let fx=0;createCapitalEngineExhaust('concord-cruiser').traverse(o=>{if(o.isMesh)fx+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;if(o.isSprite)fx+=2;});
 assert.equal(fx,32);assert.ok(report.allEnginesDestroyedTriangles+fx<10000);
});
