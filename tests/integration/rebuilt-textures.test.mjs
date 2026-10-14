import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import * as THREE from '../../vendor/three.module.min.js';import{paintShipMaterial}from'../../src/game/shipLivery.js';
// The subsequent approved carrier has its own metric PBR and runtime tests.
const ships=[['blade','ships',4878],['demon','ships',1778],['mule','ships',6180]];
function glb(id,folder){const b=readFileSync(new URL(`../../assets/models/${folder}/${id}.glb`,import.meta.url)),len=b.readUInt32LE(12);return{json:JSON.parse(b.toString('utf8',20,20+len)),bin:b.subarray(28+len)};}
for(const[id,folder,count]of ships)test(`${id}: complete PBR maps, tangents and authored total triangle count`,()=>{
 const{json:j,bin}=glb(id,folder);let triangles=0,armor=0,hullTriangles=0,equipmentTriangles=0;
 const size=index=>{const image=j.images[j.textures[index].source],v=j.bufferViews[image.bufferView],b=bin.subarray(v.byteOffset??0);return[b.readUInt32BE(16),b.readUInt32BE(20)];};
 const visit=index=>{const node=j.nodes[index];if(node.mesh!==undefined)for(const p of j.meshes[node.mesh].primitives){const tris=j.accessors[p.indices??p.attributes.POSITION].count/3;triangles+=tris;if(id==='mule'){if(node.name==='MuleApprovedHull')hullTriangles+=tris;else if(/^Mule\.(Port|Starboard)\.Frigate PDC /.test(node.name??''))equipmentTriangles+=tris;}const m=j.materials[p.material];if(!m.normalTexture)continue;armor++;assert.ok(p.attributes.TEXCOORD_0!==undefined);assert.equal(j.accessors[p.attributes.TANGENT].type,'VEC4');for(const texture of [m.normalTexture.index,m.pbrMetallicRoughness.baseColorTexture?.index,m.pbrMetallicRoughness.metallicRoughnessTexture?.index].filter(x=>x!==undefined)){const dims=size(texture);assert.ok(dims[0]>0&&dims[1]>0,`${id}: embedded texture dimensions`);}}for(const child of node.children??[])visit(child);};
 for(const index of j.scenes[j.scene??0].nodes)visit(index);
 assert.equal(triangles,count);assert.ok(armor>=2);assert.ok(j.materials.some(m=>/canopy|glazing/i.test(m.name)),'Glass is separate from painted armor');
 if(id==='mule'){assert.equal(hullTriangles,4948,'authored hull stays within its 5k triangle budget');assert.equal(equipmentTriangles,1232,'28 embedded PDC bases are reported as equipment');assert.equal(triangles,hullTriangles+equipmentTriangles);}
});
test('authored Concord and Pirate textures survive faction application; alternate liveries remain available',()=>{
 for(const[id,faction]of[['blade','concord'],['concord-carrier','concord'],['demon','pirates'],['scrapper','pirates'],['mule','independents']]){
  const m=new THREE.MeshStandardMaterial({map:new THREE.Texture()}),hook=m.onBeforeCompile;assert.equal(paintShipMaterial(m,faction,new THREE.Matrix4(),id),false);assert.equal(m.onBeforeCompile,hook);
  assert.equal(paintShipMaterial(m,'alliance',new THREE.Matrix4(),id),true);
 }
});
