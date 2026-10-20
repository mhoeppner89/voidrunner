import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../../vendor/three.module.min.js';
import {highestLootRarity,createLootVisualResources,createLootVisual,setLootVisualRarity,disposeLootVisualResources} from '../../src/game/lootVisuals.js';
import {SpaceRenderer} from '../../src/game/render.js';
import {combatWreckNode,recoverWreckEntry,makeCareerWreck} from '../../src/game/careerLoot.js';
import {hydrateSave} from '../../src/game/save.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {EQUIPMENT_RARITIES} from '../../src/game/equipmentCatalog.js';

test('loot appearance uses the best remaining rarity and treats cargo/invalid rarity as common',()=>{
 const item=rarity=>({item:{rarity}});
 assert.equal(highestLootRarity([]),'common');assert.equal(highestLootRarity([{kind:'cargo'},item('unknown')]),'common');
 const entries=['uncommon','rare','common','named'].map(item);assert.equal(highestLootRarity(entries),'named');
 for(const rarity of ['common','uncommon','rare','named'])assert.equal(highestLootRarity([item(rarity)]),rarity);
 const res=createLootVisualResources();
 for(const rarity of ['common','uncommon','rare','named']){
  const root=createLootVisual({radius:3,position:[0,0,0],lootRarity:rarity},res);
  assert.equal(root.userData.lootFace.material.color.getHexString(),EQUIPMENT_RARITIES[rarity].color.slice(1));
  assert.equal(root.userData.lootFrame.material.color.getHexString(),EQUIPMENT_RARITIES[rarity].color.slice(1));
  assert.ok(root.userData.lootFace.material.depthTest,'world occlusion stays enabled');
 }
 disposeLootVisualResources(res);
});
test('capital recovery radius does not produce a ship-sized loot crate',()=>{
 const res=createLootVisualResources(),node={radius:35,position:[0,0,0],lootRarity:'rare'},root=createLootVisual(node,res);
 assert.equal(root.children[0].scale.x,2.2);assert.equal(root.userData.lootBodySize,2.2);assert.equal(node.radius,35);
 disposeLootVisualResources(res);
});
test('collecting the best item changes the actual wreck marker before it disappears when empty',()=>{
 const {session,save}=tutorialFixture('land-mining');save.player.dockedAt=undefined;
 const rare=createEquipmentRecord('pulse-cannon',{rarity:'rare'}),green=createEquipmentRecord('pulse-cannon',{rarity:'uncommon'});
 const w={id:'wreck-visual-test',name:'Loot',contents:[rare,green].map(item=>({id:item.id,kind:'equipment',item})),position:[...save.player.position],velocity:[0,0,0],radius:3,systemId:save.player.systemId,scanned:true};
 save.world.combatWrecks={[w.id]:w};const node=combatWreckNode(w);session.wreckNodes.push(node);assert.equal(node.lootRarity,'rare');
 assert.ok(recoverWreckEntry(session,w.id,rare.id).ok);assert.equal(node.lootRarity,'uncommon');assert.ok(recoverWreckEntry(session,w.id,green.id).ok);assert.equal(session.wreckNodes.includes(node),false);
});
test('loot rendering shares resources, updates colour, obeys system/range visibility and stays targetable',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();r.systemId='helios-verge';r.viewportHeight=800;r.camera=new THREE.PerspectiveCamera(60,1,.1,50000);
 const nodes=['common','uncommon','rare'].map((lootRarity,i)=>({id:`loot-${i}`,position:[i*20,0,-500],radius:3,remaining:1,systemId:r.systemId,lootRarity}));
 nodes.forEach(n=>r.addCombatLootNode(n));const meshes=[...r.combatLootMeshes.values()];
 assert.equal(meshes[0].children[0].geometry,meshes[1].children[0].geometry);
 assert.equal(meshes[0].children[0].material,meshes[1].children[0].material);
 const ids=meshes.map(m=>m.userData.lootFace.material.id);for(let i=0;i<50;i++)r.updateCombatLootNodes();assert.deepEqual(meshes.map(m=>m.userData.lootFace.material.id),ids);
 nodes[1].lootRarity='rare';r.updateCombatLootNodes();assert.equal(meshes[1].userData.lootFace.material,meshes[2].userData.lootFace.material);
 nodes[0].systemId='meridian';nodes[2].position[2]=-3000;r.updateCombatLootNodes();assert.equal(meshes[0].visible,false);assert.equal(meshes[2].userData.lootBeacon.visible,false);
 r.removeCombatLootNode(nodes[1].id);assert.equal(r.combatLootMeshes.size,2);assert.equal(meshes[1].parent,null);
 const ray=new THREE.Raycaster(new THREE.Vector3(40,0,0),new THREE.Vector3(0,0,-1));r.scene.updateMatrixWorld(true);assert.ok(ray.intersectObject(meshes[2],true).some(hit=>hit.object.userData.targetId===nodes[2].id));
 const resources=r.combatLootResources;const counts=[];for(const q of resources.qualities.values()){let count=0;q.beacon.addEventListener('dispose',()=>count++);counts.push(()=>count);}
 disposeLootVisualResources(resources);assert.ok(counts.every(f=>f()===1));
});
test('combat loot keeps its rarity on radar even outside salvage mode',()=>{
 const {session,save}=tutorialFixture('land-mining');save.player.dockedAt=undefined;save.player.mode='combat';session.ships=[];session.pickups=[];
 const node={id:'radar-loot',combatLoot:true,lootRarity:'uncommon',position:[...save.player.position],remaining:1,scanned:false,systemId:save.player.systemId};session.wreckNodes=[node];
 assert.equal(session.radarContacts().find(c=>c.type==='wreck')?.lootRarity,'uncommon');node.systemId='meridian';assert.equal(session.radarContacts().some(c=>c.type==='wreck'),false);
});
test('loot from a moving ship stays at the destruction position, including old saves',()=>{
 const {session,save}=tutorialFixture('defeat-raider');save.player.dockedAt=undefined;
 const ship=session.ensureTutorialEnemy();ship.velocity.splice(0,3,120,-30,80);
 const wreck=makeCareerWreck(session,ship);assert.ok(wreck);assert.deepEqual(wreck.velocity,[0,0,0]);assert.deepEqual(wreck.position,ship.position);
 // An earlier build stored the destroyed ship's momentum in the save.
 wreck.velocity=[120,-30,80];const restored=hydrateSave(JSON.parse(JSON.stringify(save))).world.combatWrecks[wreck.id];
 assert.deepEqual(restored.velocity,[0,0,0]);assert.deepEqual(restored.position,wreck.position);
 const node=combatWreckNode(wreck);session.wreckNodes.push(node);session.pickups=[];
 const before=[...node.position];for(let i=0;i<600;i++)session.updatePickups(1/60);
 assert.deepEqual(node.position,before);assert.deepEqual(wreck.position,before);assert.deepEqual(node.velocity,[0,0,0]);
});
test('loose cargo stays stationary even with the old salvage controls held',()=>{
 const {session,save}=tutorialFixture('land-mining');session.pickupStore=new EntityStore(8);session.pickups=[];session.pickupCounter=0;save.player.dockedAt=undefined;save.player.position.splice(0,3,0,0,0);save.player.prevPosition=new Float64Array(save.player.position);
 const pickup=session.spawnPickup('ore',[100,0,0],'combat'),read=()=>Array.from(session.pickupStore.pos.subarray(pickup.slot*3,pickup.slot*3+3));
 const before=read();save.player.mode='salvage';session.utilityActive=true;
 for(let i=0;i<120;i++)session.updatePickups(1/60);
 assert.deepEqual(read(),before);assert.ok(pickup.life>0);
 assert.deepEqual(Array.from(session.pickupStore.vel.subarray(pickup.slot*3,pickup.slot*3+3)),[0,0,0]);
});
