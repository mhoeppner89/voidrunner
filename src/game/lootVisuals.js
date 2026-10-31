import * as THREE from 'three';
import {EQUIPMENT_RARITIES} from './equipmentCatalog.js';

const QUALITIES=['common','uncommon','rare','named'];
export function highestLootRarity(contents=[]){
    let best=0;
    for(const entry of contents)best=Math.max(best,QUALITIES.indexOf(entry.item?.rarity));
    return QUALITIES[best];
}
export function createLootVisualResources(){
    const box=new THREE.BoxGeometry(1,.65,.8),edges=new THREE.EdgesGeometry(box);
    const hull=new THREE.MeshStandardMaterial({color:0x283846,roughness:.7,metalness:.65});
    const qualities=new Map(QUALITIES.map(rarity=>[rarity,{
        frame:new THREE.LineBasicMaterial({color:EQUIPMENT_RARITIES[rarity].color,toneMapped:false}),
    }]));
    for(const resource of [box,edges,hull,...[...qualities.values()].map(q=>q.frame)])resource.userData.shared=true;
    return {box,edges,hull,qualities};
}
export function setLootVisualRarity(root,resources,rarity){
    const quality=resources.qualities.get(rarity)??resources.qualities.get('common');
    root.userData.lootFrame.material=quality.frame;
    root.userData.lootRarity=resources.qualities.has(rarity)?rarity:'common';
}
export function createLootVisual(node,resources){
    const root=new THREE.Group(),body=new THREE.Mesh(resources.box,resources.hull);
    const frame=new THREE.LineSegments(resources.edges,resources.qualities.get('common').frame);
    // Keep the visible crate small even when its collection radius is large.
    const bodySize=Math.min(2.2,node.radius);
    body.add(frame);body.scale.setScalar(bodySize);
    body.rotation.set(.2,.35,.15);root.add(body);root.position.fromArray(node.position);
    Object.assign(root.userData,{lootNode:node,lootFrame:frame,lootBodySize:bodySize});
    setLootVisualRarity(root,resources,node.lootRarity);
    return root;
}
export function disposeLootVisualResources(resources){
    if(!resources)return;
    for(const resource of [resources.box,resources.edges,resources.hull,...[...resources.qualities.values()].map(q=>q.frame)])resource.dispose();
    resources.qualities.clear();
}
