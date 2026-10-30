import * as THREE from 'three';
import {EQUIPMENT_RARITIES} from './equipmentCatalog.js';

const QUALITIES=['common','uncommon','rare','named'];
export function highestLootRarity(contents=[]){
    let best=0;
    for(const entry of contents)best=Math.max(best,QUALITIES.indexOf(entry.item?.rarity));
    return QUALITIES[best];
}
const diamond=(radius)=>new THREE.Shape([
    new THREE.Vector2(0,radius),new THREE.Vector2(radius,0),
    new THREE.Vector2(0,-radius),new THREE.Vector2(-radius,0),
]);
function beaconGeometry(level){
    const ring=diamond(.5),hole=diamond(.37);
    ring.holes.push(new THREE.Path(hole.getPoints()));
    const shapes=[ring,diamond(.09)];
    for(let i=0;i<level;i++){
        const x=(i-(level-1)/2)*.19;
        shapes.push(new THREE.Shape([
            new THREE.Vector2(x-.055,-.62),new THREE.Vector2(x+.055,-.62),
            new THREE.Vector2(x+.055,-.75),new THREE.Vector2(x-.055,-.75),
        ]));
    }
    return new THREE.ShapeGeometry(shapes);
}
export function createLootVisualResources(){
    const box=new THREE.BoxGeometry(1,.65,.8),edges=new THREE.EdgesGeometry(box);
    const shape=new THREE.Shape();shape.moveTo(-.52,-.24);shape.lineTo(-.35,-.38);shape.lineTo(.02,-.31);shape.lineTo(.17,-.43);shape.lineTo(.54,-.2);shape.lineTo(.46,.28);shape.lineTo(.2,.39);shape.lineTo(-.03,.28);shape.lineTo(-.29,.4);shape.lineTo(-.55,.16);shape.closePath();
    const fragment=new THREE.ExtrudeGeometry(shape,{depth:.52,bevelEnabled:false});fragment.translate(0,0,-.26);
    const fragmentEdges=new THREE.EdgesGeometry(fragment);
    const hull=new THREE.MeshStandardMaterial({color:0x283846,roughness:.7,metalness:.65});
    const outline=new THREE.MeshBasicMaterial({color:0x020910,side:THREE.DoubleSide,toneMapped:false});
    const qualities=new Map(QUALITIES.map((rarity,index)=>[rarity,{
        geometry:beaconGeometry(index+1),
        beacon:new THREE.MeshBasicMaterial({color:EQUIPMENT_RARITIES[rarity].color,side:THREE.DoubleSide,toneMapped:false}),
        frame:new THREE.LineBasicMaterial({color:EQUIPMENT_RARITIES[rarity].color,toneMapped:false}),
    }]));
    for(const resource of [box,edges,fragment,fragmentEdges,hull,outline,...[...qualities.values()].flatMap(q=>[q.geometry,q.beacon,q.frame])])resource.userData.shared=true;
    return {box,edges,fragment,fragmentEdges,hull,outline,qualities};
}
export function setLootVisualRarity(root,resources,rarity){
    const quality=resources.qualities.get(rarity)??resources.qualities.get('common');
    const {lootFrame,lootFace,lootOutline}=root.userData;
    lootFrame.material=quality.frame;lootFace.material=quality.beacon;
    lootFace.geometry=quality.geometry;lootOutline.geometry=quality.geometry;
    root.userData.lootRarity=resources.qualities.has(rarity)?rarity:'common';
}
export function createLootVisual(node,resources){
    const root=new THREE.Group(),body=new THREE.Mesh(node.salvageFragment?resources.fragment:resources.box,resources.hull);
    const frame=new THREE.LineSegments(node.salvageFragment?resources.fragmentEdges:resources.edges,resources.qualities.get('common').frame);
    const common=resources.qualities.get('common');
    const beacon=new THREE.Group(),face=new THREE.Mesh(common.geometry,common.beacon),outline=new THREE.Mesh(common.geometry,resources.outline);
    // Build both meshes from cached resources; no per-drop material/geometry.
    face.geometry=outline.geometry=resources.qualities.get('common').geometry;
    face.material=resources.qualities.get('common').beacon;
    outline.scale.setScalar(1.22);outline.position.z=-.015;
    // A large ship's recovery radius must not turn its equipment crate into
    // another ship-sized block in the middle of the breakup.
    const bodySize=Math.min(2.2,node.radius);
    beacon.add(outline,face);body.add(frame);body.scale.setScalar(bodySize);
    body.rotation.set(.2,.35,.15);root.add(body,beacon);root.position.fromArray(node.position);
    Object.assign(root.userData,{lootNode:node,lootFrame:frame,lootFace:face,lootOutline:outline,lootBeacon:beacon,lootBodySize:bodySize});
    setLootVisualRarity(root,resources,node.lootRarity);
    return root;
}
export function disposeLootVisualResources(resources){
    if(!resources)return;
    for(const resource of [resources.box,resources.edges,resources.fragment,resources.fragmentEdges,resources.hull,resources.outline,...[...resources.qualities.values()].flatMap(q=>[q.geometry,q.beacon,q.frame])])resource.dispose();
    resources.qualities.clear();
}
