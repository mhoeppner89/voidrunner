import * as THREE from 'three';
import {FRIGATE_MOUNTS,FRIGATE_ENGINE_MOUNTS,FRIGATE_TORPEDO_LAYOUT} from './frigateMounts.js';
// Equipment is built in world-sized ship coordinates, shared by game and review.
const colors={navy:0x203852,armor:0xa7b4c2,steel:0x495c6e,gold:0xb79956,dark:0x101b26,char:0x543c2a,cyan:0x62d9ff};
const materials=Object.fromEntries(Object.entries(colors).map(([k,c])=>[k,new THREE.MeshStandardMaterial({color:c,metalness:k==='dark'?.45:.72,roughness:.55,emissive:k==='cyan'?0x20b8ff:0,emissiveIntensity:k==='cyan'?.65:0})]));
for(const m of Object.values(materials))m.userData.shared=true;
const geometryCache=new Map();
function geom(key,make){if(!geometryCache.has(key)){const g=make();g.userData.shared=true;geometryCache.set(key,g);}return geometryCache.get(key);}
function mesh(root,g,mat,x=0,y=0,z=0){const m=new THREE.Mesh(g,materials[mat]);m.position.set(x,y,z);root.add(m);return m;}
function box(root,w,h,d,mat,x=0,y=0,z=0){return mesh(root,geom(`box-${w}-${h}-${d}`,()=>new THREE.BoxGeometry(w,h,d)),mat,x,y,z);}
function cylinder(root,r,h,mat,x=0,y=0,z=0){return mesh(root,geom(`cyl-${r}-${h}`,()=>new THREE.CylinderGeometry(r,r,h,12)),mat,x,y,z);}
function armorGeometry(verts,indices){
 const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));indexed.setIndex(indices);
 // Split corners so planar armor and cell walls cannot share rounded normals.
 const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();return g;
}
function plate(root,w,d,lo,hi,mat){
 const cut=.75,ring=[[-w/2+cut,-d/2],[w/2-cut,-d/2],[w/2,-d/2+cut],[w/2,d/2-cut],[w/2-cut,d/2],[-w/2+cut,d/2],[-w/2,d/2-cut],[-w/2,-d/2+cut]];
 const key=`plate-${w}-${d}-${lo}-${hi}`;
 const housing=mesh(root,geom(key,()=>{const verts=[];for(const y of [lo,hi])for(const [x,z] of ring)verts.push(x,y,z);const ix=[];for(let i=1;i<7;i++){ix.push(0,i,i+1,8,8+i+1,8+i);}for(let i=0;i<8;i++){const j=(i+1)%8;ix.push(i,8+j,j,i,8+i,8+j);}return armorGeometry(verts,ix);}),mat);
 housing.name='armored-housing';return housing;
}
function scars(root,w,d,y){
 const g=new THREE.Group();g.name='damage-scars';root.add(g);g.visible=false;
 const patch=geom('burn-patch',()=>{const points=[[-.46,-.21],[-.18,-.45],[.19,-.30],[.47,-.10],[.39,.29],[.1,.43],[-.33,.24],[-.5,.03]],ix=[];for(let i=1;i<7;i++)ix.push(0,i+1,i);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[x,0,z]),3));geometry.setIndex(ix);geometry.computeVertexNormals();return geometry;});
 for(const [x,z,angle] of [[-.2,-.22,.22],[.23,.19,-.3]]){
  const edge=mesh(g,patch,'char',x*w,y,z*d);edge.scale.set(w*.65,1,d*.28);edge.rotation.y=angle;
  const center=mesh(g,patch,'dark',x*w,y+.025,z*d);center.scale.set(w*.48,1,d*.2);center.rotation.y=angle;
 }
 root.userData.scars=g;
}
function generator(){
 const r=new THREE.Group();plate(r,8,12,-.65,1.2,'steel');plate(r,7.2,10.8,1.2,4.8,'navy');plate(r,6.5,10,4.8,5.4,'armor');
 for(const x of [-2.75,2.75])box(r,.32,4.9,10.2,'gold',x,2.8,0);
 for(const z of [-3,0,3]){box(r,4,.28,.55,'dark',0,5.56,z);box(r,3.5,.3,.22,'cyan',0,5.58,z);}

 scars(r,6.5,10,5.6);return r;
}
function torpedo(){
 const r=new THREE.Group();
 const l=FRIGATE_TORPEDO_LAYOUT;
 // A shallow deck socket seats directly in the centerline armor.
 plate(r,l.width,l.depth,-.5,.45,'steel');
 plate(r,l.width-.4,l.depth-.4,.45,1.95,'navy');plate(r,l.width-.2,l.depth-.2,1.95,l.capHeight,'armor');
 for(const x of [-l.cellX,l.cellX])for(const z of [-l.cellZ,l.cellZ]){
  const ring=geom('torpedo-cell',()=>{const p=[],ix=[],n=6;for(const [rad,y]of [[l.cellOuter,l.capHeight-.15],[l.cellOuter,l.rimHeight],[l.cellInner,l.rimHeight],[l.cellInner,l.capHeight+.02]])for(let j=0;j<n;j++)p.push(rad*Math.cos(j*2*Math.PI/n),y,rad*Math.sin(j*2*Math.PI/n));for(let k=0;k<3;k++)for(let j=0;j<n;j++){const a=k*n+j,b=k*n+(j+1)%n;ix.push(a,b+n,b,a,a+n,b+n);}return armorGeometry(p,ix);});
  mesh(r,ring,'steel',x,0,z).name='launch-cell-rim';
  // Keep the dark cavity floor above the closed armor cap, which otherwise hides it.
  const bottom=mesh(r,geom('cell-floor',()=>new THREE.CircleGeometry(l.cellInner,6)),'dark',x,l.capHeight+.02,z);bottom.name='launch-cell-floor';bottom.rotation.x=-Math.PI/2;
 }
 for(const x of [-l.width/2+.13,l.width/2-.13]){box(r,.12,.15,10,'gold',x,1.7,0);box(r,.14,.6,2.5,'steel',x,1,0);}
 box(r,3.4,.05,.3,'cyan',0,l.capHeight+.03,0);scars(r,10,14,l.capHeight+.035);return r;
}
function engine(radius){
 const r=new THREE.Group();
 const disc=(rad,mat,y)=>{const o=mesh(r,geom(`disc-${rad}`,()=>new THREE.CircleGeometry(rad,12)),mat,0,y,0);o.rotation.x=-Math.PI/2;return o;};
 const throat=disc(radius*.71,'dark',.2);throat.name='engine-output';r.userData.output=throat;
 // Charred collars cover the baked cyan band when this individual drive fails.
 const soot=mesh(r,geom(`collar-${radius}`,()=>new THREE.CylinderGeometry(radius*1.012,radius*1.012,1.8,16,1,true)),'dark',0,-11.7,0);soot.name='burned-engine-band';soot.visible=false;r.userData.soot=soot;
 const cap=disc(radius*.71,'dark',.35);cap.name='dead-engine-throat';cap.visible=false;r.userData.deadCap=cap;
 scars(r,radius*1.2,radius*1.2,.55);return r;
}
export function orientFrigateComponent(root,m){if(m.normal)root.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().fromArray(m.normal));else if(m.axis===0)root.rotation.z=-m.side*Math.PI/2;else if(m.axis===2)root.rotation.x=m.side*Math.PI/2;else if(m.side<0)root.rotation.x=Math.PI;}
export function createFrigateSystems(ownerId){
 const root=new THREE.Group();root.name='frigate-systems';root.userData.components=new Map();
 for(let i=8;i<FRIGATE_MOUNTS.length;i++){
  const m=FRIGATE_MOUNTS[i],part=m.kind==='generator'?generator():m.kind==='torpedo'?torpedo():engine(m.radius);
  part.name=m.label;part.position.fromArray(m.position).multiply(new THREE.Vector3(37.46,44.92,112.9));orientFrigateComponent(part,m);
  part.userData.targetKind='ship';part.userData.targetId=ownerId;part.userData.targetMount=i;
  root.add(part);root.userData.components.set(i,part);
 }
 return root;
}
export function setFrigateComponentDamage(root,health,maxHealth){
 const fraction=Math.max(0,Math.min(1,health/maxHealth));if(root.userData.healthFraction===fraction)return;
 root.userData.healthFraction=fraction;
 root.userData.visualParts??=(()=>{const parts=[];root.traverse(o=>{if(o.isMesh)parts.push(o)});return parts;})();
 const destroyed=fraction===0;
 for(const o of root.userData.visualParts){
  o.userData.healthyMaterial??=o.material;
  if(!destroyed){if(o.userData.damageMaterial){o.userData.damageMaterial.dispose();delete o.userData.damageMaterial;}o.material=o.userData.healthyMaterial;continue;}
  const m=o.userData.damageMaterial??=o.userData.healthyMaterial.clone();m.userData.shared=false;o.material=m;
  m.color.copy(o.userData.healthyMaterial.color).multiplyScalar(.3);m.roughness=.92;m.emissive.copy(o.userData.healthyMaterial.emissive);m.emissiveIntensity=0;
 }
 if(root.userData.scars)root.userData.scars.visible=destroyed;
 if(root.userData.pitch)root.userData.pitch.visible=!destroyed;
 if(root.userData.output)root.userData.output.visible=!destroyed;
 if(root.userData.soot)root.userData.soot.visible=destroyed;
 if(root.userData.deadCap)root.userData.deadCap.visible=destroyed;
}
export function updateFrigateSystems(root,ship){for(const [i,part] of root.userData.components)setFrigateComponentDamage(part,ship.capitalMountHull[i]??FRIGATE_MOUNTS[i].hull,FRIGATE_MOUNTS[i].hull);}
export function frigateEngineFraction(ship,flareIndex){const i=FRIGATE_ENGINE_MOUNTS[flareIndex];return ship.capitalMountHull?Math.max(0,(ship.capitalMountHull[i]??160)/160):1;}
