import * as THREE from 'three';
import {EQUIPMENT_RARITIES,RARITY_ORDER} from './equipmentCatalog.js';

const QUALITIES=RARITY_ORDER;
// Rare and better crates raise a light beam so good drops read from a distance.
const BEAM_FROM=QUALITIES.indexOf('rare');
function beamGeometry(){
    const geometry=new THREE.CylinderGeometry(.32,.32,46,6,1,true);geometry.translate(0,23,0);
    const position=geometry.getAttribute('position'),alpha=new Float32Array(position.count*4);
    for(let i=0;i<position.count;i++){alpha.set([1,1,1,Math.max(0,1-position.getY(i)/46)**1.6],i*4);}
    geometry.setAttribute('color',new THREE.BufferAttribute(alpha,4));return geometry;
}
export function highestLootRarity(contents=[]){
    let best=0;
    for(const entry of contents)best=Math.max(best,QUALITIES.indexOf(entry.item?.rarity));
    return QUALITIES[best];
}
export function createLootVisualResources(){
    const box=new THREE.BoxGeometry(1,.65,.8),edges=new THREE.EdgesGeometry(box);
    const hull=new THREE.MeshStandardMaterial({color:0x283846,roughness:.7,metalness:.65});
    const beam=beamGeometry();
    const qualities=new Map(QUALITIES.map((rarity,rank)=>[rarity,{
        frame:new THREE.LineBasicMaterial({color:EQUIPMENT_RARITIES[rarity].color,toneMapped:false}),
        beam:rank>=BEAM_FROM?new THREE.MeshBasicMaterial({color:EQUIPMENT_RARITIES[rarity].color,vertexColors:true,transparent:true,opacity:rank>=QUALITIES.indexOf('epic')?.55:.38,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}):undefined,
    }]));
    const materials=[...qualities.values()].flatMap(q=>q.beam?[q.frame,q.beam]:[q.frame]);
    for(const resource of [box,edges,hull,beam,...materials])resource.userData.shared=true;
    return {box,edges,hull,beam,qualities};
}
export function setLootVisualRarity(root,resources,rarity){
    const quality=resources.qualities.get(rarity)??resources.qualities.get('common');
    root.userData.lootFrame.material=quality.frame;
    root.userData.lootRarity=resources.qualities.has(rarity)?rarity:'common';
    let beam=root.userData.lootBeam;
    if(quality.beam&&resources.beam){
        if(!beam){beam=new THREE.Mesh(resources.beam,quality.beam);beam.raycast=()=>{};beam.renderOrder=2;root.add(beam);root.userData.lootBeam=beam;}
        beam.material=quality.beam;beam.visible=true;
    }else if(beam)beam.visible=false;
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
// Epic and legendary beams breathe; shared materials, so one write per grade.
export function pulseLootBeams(resources,time){
    for(const [rarity,quality] of resources.qualities){
        if(!quality.beam||QUALITIES.indexOf(rarity)<QUALITIES.indexOf('epic'))continue;
        const fast=rarity==='named';quality.beam.opacity=(fast?.5:.42)+(fast?.22:.14)*Math.sin(time*(fast?4.2:2.6));
    }
}
export function disposeLootVisualResources(resources){
    if(!resources)return;
    for(const resource of [resources.box,resources.edges,resources.hull,resources.beam,...[...resources.qualities.values()].flatMap(q=>q.beam?[q.frame,q.beam]:[q.frame])])resource?.dispose();
    resources.qualities.clear();
}
