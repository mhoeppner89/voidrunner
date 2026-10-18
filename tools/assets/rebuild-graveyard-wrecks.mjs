// Rebuild the six graveyard assets from the currently shipped hull meshes.
// Run with: node --import ./tests/helpers/offline-imports.mjs tools/assets/rebuild-graveyard-wrecks.mjs
// Candidates and provenance are written to ignored output/ for inspection.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {splitWreckTriangles, wreckGeometryFor} from '../../src/game/shipWreckFx.js';
import {GRAVEYARD_MODEL_WRECKS} from '../../src/game/missionWorldData.js';
import {solidifyWreckSurfaces} from './wreck-solidify.mjs';
const out='output/graveyard-rebuild';await fs.mkdir(out,{recursive:true});
const sources={battleship:'capital/concord-battleship',carrier:'capital/concord-carrier',cruiser:'capital/concord-cruiser',frigate:'capital/concord-frigate',wayfarer:'ships/wayfarer',talon:'ships/talon'};
const names={battleship:['Battleship wreck forward section','Battleship wreck midsection','Battleship wreck engine section'],carrier:['Carrier wreck bow','Carrier wreck flight deck','Carrier wreck engine block'],cruiser:['Cruiser wreck prow','Cruiser wreck command hull','Cruiser wreck engine cluster'],frigate:['Frigate wreck forward section','Frigate wreck engine section'],wayfarer:['Wayfarer wreck prow','Wayfarer wreck cabin','Wayfarer wreck drive'],talon:['Talon wreck nose','Talon wreck wing core','Talon wreck engine']};
const finish=generator=>{let next;do{next=generator.next();}while(!next.done);return next.value;};
const plane=(n,d)=>({n:new T.Vector3(...n).normalize(),d});
const subtractBox=(tris,minimum,maximum,removed)=>{
 let inside=tris;const outside=[];
 for(let axis=0;axis<3;axis++)for(const side of [-1,1]) {
  const n=[0,0,0];n[axis]=side;const d=side<0?-minimum[axis]:maximum[axis];
  const [lo,hi]=finish(splitWreckTriangles(inside,plane(n,d),1e-7,.08));outside.push(...hi);inside=lo;
 }
 if(removed)removed.push(...inside.filter(t=>t.mat>=0));
 return outside;
};
// Cut in a warped coordinate frame, then undo the warp. Adjacent sections
// share the same torn contour, rather than unrelated noise on their vertices.
const tooth=v=>1-4*Math.abs(Math.round(v)-v);
const tearOffset=(y,z)=>.023*tooth(y*11+z*4)+.015*tooth(z*17-y*3+.3)+.009*tooth(y*31+z*23);
const remap=(tris,fn)=>tris.map(t=>({...t,v:t.v.map(v=>({...v,p:fn(v.p)}))}));
function rupture(tris,center,radii){
 let inside=tris;const outside=[];
 // An irregular, faceted pressure rupture, not a circular cookie-cutter hole.
 const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,1],[-1,1,-1],[1,-1,-1],[-1,-1,1],[1,0,-1],[-1,0,1]];
 for(const [i,direction]of directions.entries()){
  const n=new T.Vector3(...direction.map((v,j)=>v/radii[j])).normalize();
  const reach=1/Math.hypot(...direction.map((v,j)=>v/radii[j]));
  const boundary={n,d:n.dot(new T.Vector3(...center))+reach*(i<6?1:.88)};
  const [lo,hi]=finish(splitWreckTriangles(inside,boundary,1e-7,.08));outside.push(...hi);inside=lo;
 }
 return outside;
}
function peeledEdges(tris,boundaries,sign,steel){
 const key=p=>p.map(v=>Math.round(v*1e6)).join(','),edges=new Map();
 for(const t of tris)if(t.mat===-1)for(let i=0;i<3;i++){
  const a=t.v[i].p,b=t.v[(i+1)%3].p,ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;
  if(edges.has(k))edges.delete(k);else edges.set(k,[a,b]);
 }
 const candidates=[...edges.values()].filter(([a,b])=>{
  const mid=a.map((v,j)=>(v+b[j])*.5),x=mid[0]-tearOffset(mid[1],mid[2]);
  return boundaries.some(c=>Math.abs(x+.026*mid[1]-.02*mid[2]-c)<.012)&&Math.hypot(a[1]-b[1],a[2]-b[2])>.012;
 }).sort((a,b)=>new T.Vector3(...b[0]).distanceToSquared(new T.Vector3(...b[1]))-new T.Vector3(...a[0]).distanceToSquared(new T.Vector3(...a[1]))).slice(0,32);
 const result=[];
 for(const [i,[a,b]]of candidates.entries()){
  const length=new T.Vector3(...a).distanceTo(new T.Vector3(...b));if(length>.27)continue;
  const radial=new T.Vector3(0,(a[1]+b[1])*.5,(a[2]+b[2])*.5).normalize();
  const extension=.018+(i%5)*.006,skew=.65+(i%3)*.25;
  const outer=p=>[p[0]+sign*extension,p[1]+radial.y*extension*skew,p[2]+radial.z*extension*skew];
  const tip=p=>[p[0]+sign*extension*1.35,p[1]+radial.y*extension*2,p[2]+radial.z*extension*2];
  // A closed folded sheet: both skins and all six perimeter walls. Averaged
  // offsets at the crease keep the two segments joined without overlapping
  // separate prisms or a paper-thin DoubleSide surface.
  const points=[a,b,outer(a),outer(b),tip(a),tip(b)].map(p=>new T.Vector3(...p));
  const faceNormal=(a,b,c)=>points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a])).normalize();
  const n0=faceNormal(0,1,3),n1=faceNormal(2,3,5),crease=n0.clone().add(n1).normalize();
  const thickness=.003,offsets=[n0,n0,crease,crease,n1,n1].map(n=>n.clone().multiplyScalar(thickness*.5));
  const front=points.map((p,j)=>p.clone().add(offsets[j])),back=points.map((p,j)=>p.clone().sub(offsets[j]));
  const quad=(a,b,c,d)=>{
   const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize().toArray();
   const vertices=[a,b,c,d].map((p,j)=>({p:p.toArray(),n:normal,uv:[[0,0],[1,0],[1,1],[0,1]][j],c:[1,1,1]}));
   result.push({mat:steel,v:[vertices[0],vertices[1],vertices[2]]},{mat:steel,v:[vertices[0],vertices[2],vertices[3]]});
  };
  for(const face of [[0,1,3,2],[2,3,5,4]]){quad(...face.map(j=>front[j]));quad(...[...face].reverse().map(j=>back[j]));}
  const perimeter=[0,1,3,5,4,2];
  for(let j=0;j<perimeter.length;j++){const a=perimeter[j],b=perimeter[(j+1)%perimeter.length];quad(front[b],front[a],back[a],back[b]);}

 }
 return result;
}
function glb(parts,sourceJson,sourceBin,materials,provenance) {
 const json={asset:{version:'2.0',generator:'Voidrunner current-hull graveyard builder',extras:provenance},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials,accessors:[],bufferViews:[],buffers:[{byteLength:0}],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}]},chunks=[];let offset=0;
 const add=data=>{const b=Buffer.from(data.buffer??data,data.byteOffset??0,data.byteLength??data.length),index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length});const padded=Buffer.alloc(Math.ceil(b.length/4)*4);b.copy(padded);chunks.push(padded);offset+=padded.length;return index;};
 for(const image of sourceJson.images??[]){const v=sourceJson.bufferViews[image.bufferView];json.images.push({bufferView:add(sourceBin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)),mimeType:image.mimeType??'image/png'});}
 json.textures=(sourceJson.textures??[]).map(t=>({source:t.source,sampler:0}));
 const attribute=(a,type,componentType=5126)=>{const index=json.accessors.length,entry={bufferView:add(a),componentType,count:a.length/({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type]),type};if(type==='VEC3'){entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++) {const axis=i%3;entry.min[axis]=Math.min(entry.min[axis],a[i]);entry.max[axis]=Math.max(entry.max[axis],a[i]);}}json.accessors.push(entry);return index;};
 for(const part of parts){
  // Do this after geometryFor: its cut-face recess/tear displacement can
  // separate a formerly closed cap from the hull and expose a flat sheet.
  const rendered=[];
  for(const [slot,tris]of part.groups){if(!tris.length)continue;const g=wreckGeometryFor(tris,new T.Vector3(),part.planes,new T.Vector3(2.24,1,1)),a=g.attributes;
   for(let i=0;i<a.position.count;i+=3)rendered.push({mat:slot,v:[0,1,2].map(j=>({p:Array.from(a.position.array.subarray((i+j)*3,(i+j+1)*3)),n:Array.from(a.normal.array.subarray((i+j)*3,(i+j+1)*3)),uv:Array.from(a.uv.array.subarray((i+j)*2,(i+j+1)*2)),c:[1,1,1]}))});g.dispose();
  }
  const solid=solidifyWreckSurfaces(rendered,materials.length-2),groups=new Map();
  provenance.solidSurfaces??=[];provenance.solidSurfaces.push({part:part.name,...solid.stats});
  for(const t of solid.triangles){if(!groups.has(t.mat))groups.set(t.mat,[]);groups.get(t.mat).push(t);}
  const primitives=[];for(const [slot,tris]of groups){
    // The triangles are already displaced; mat=0 prevents a second cap recess.
    const g=wreckGeometryFor(tris.map(t=>({...t,mat:0})),new T.Vector3(),[],new T.Vector3(2.24,1,1));
    const unique=new Map(),positions=[],normals=[],uvs=[],indices=[];
    for(let i=0;i<g.attributes.position.count;i++) {
        const p=Array.from(g.attributes.position.array.subarray(i*3,i*3+3)),n=Array.from(g.attributes.normal.array.subarray(i*3,i*3+3)),uv=Array.from(g.attributes.uv.array.subarray(i*2,i*2+2));
        const key=[...p,...n,...uv].map(v=>Math.round(v*1e6)).join(',');
        if(!unique.has(key)){unique.set(key,positions.length/3);positions.push(...p);normals.push(...n);uvs.push(...uv);}
        indices.push(unique.get(key));
    }
    const attributes={POSITION:attribute(new Float32Array(positions),'VEC3'),NORMAL:attribute(new Float32Array(normals),'VEC3'),TEXCOORD_0:attribute(new Float32Array(uvs),'VEC2')},Index=unique.size<65536?Uint16Array:Uint32Array;
    primitives.push({attributes,indices:attribute(new Index(indices),'SCALAR',Index===Uint16Array?5123:5125),material:slot<0?materials.length-1:slot,mode:4});g.dispose();}
  const mesh=json.meshes.length,node=json.nodes.length;json.meshes.push({name:part.name,primitives});json.nodes.push({name:part.name,mesh});json.scenes[0].nodes.push(node);
 }
 json.buffers[0].byteLength=offset;const encoded=Buffer.from(JSON.stringify(json)),text=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(text);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+text.length+8+bin.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,text,binHeader,bin]);
}
const report=[];
for(const config of GRAVEYARD_MODEL_WRECKS.filter((w,i,a)=>a.findIndex(v=>v.file===w.file)===i)) {
 const kind=config.class,path=sources[kind],profileKey=config.modelKey??kind;
 const sourcePath=`assets/models/${path}.glb`,buffer=await fs.readFile(sourcePath),jl=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+jl)),bin=buffer.subarray(28+jl);let imageIndex=0;
 globalThis.createImageBitmap=async()=>({width:512,height:512,index:imageIndex++});
 const root=await buildGlbScene(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
 if(['wayfarer','talon'].includes(kind))root.rotation.y=Math.PI;
 root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),factor=2.24/size.x;
 const normalization=new T.Matrix4().makeScale(factor,factor,factor).multiply(new T.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
 const triangles=[],p=new T.Vector3(),normal=new T.Vector3();
 const materials=(json.materials??[]).map(m=>({...m,extensions:undefined,emissiveFactor:[0,0,0],emissiveTexture:undefined,alphaMode:'OPAQUE',doubleSided:true}));
 const steel=materials.length;materials.push({name:'Torn structural alloy',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.25,.29,.31,1],metallicFactor:.7,roughnessFactor:.69}});
 materials.push({name:'Charred torn hull',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.05,.065,.075,1],metallicFactor:.3,roughnessFactor:.92}});
 root.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,a=g.attributes,matrix=normalization.clone().multiply(mesh.matrixWorld),nm=new T.Matrix3().getNormalMatrix(matrix),vertices=[];
  for(let i=0;i<a.position.count;i++){p.fromBufferAttribute(a.position,i).applyMatrix4(matrix);normal.fromBufferAttribute(a.normal,i).applyMatrix3(nm).normalize();vertices.push({p:p.toArray(),n:normal.toArray(),uv:a.uv?[a.uv.getX(i),a.uv.getY(i)]:[0,0],c:[1,1,1]});}
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const group of g.groups.length?g.groups:[{start:0,count:g.index?.count??a.position.count,materialIndex:0}]){const material=mats[group.materialIndex??0],slot=json.materials.findIndex(m=>m.name===material.name);if(slot<0)throw Error('Missing source material '+material.name);for(let i=group.start;i<group.start+group.count;i+=3)triangles.push({v:[0,1,2].map(j=>vertices[g.index?g.index.getX(i+j):i+j]),mat:slot});}
 });
 const broadside=profileKey.includes('broadside'), label=kind[0].toUpperCase()+kind.slice(1);
 const warp=([x,y,z])=>broadside?[x,y,z-tearOffset(y,x)*1.3]:[x-tearOffset(y,z),y,z];
 const unwarp=([x,y,z])=>broadside?[x,y,z+tearOffset(y,x)*1.3]:[x+tearOffset(y,z),y,z];
 const cutSpecs=kind==='carrier'?[[[1,-.20,.24],-.61]]:
  profileKey==='cruiser'?[[[1,.08,-.24],.56]]:
  profileKey==='frigate-drive-loss'?[[[1,-.18,.10],.62]]:
  profileKey==='frigate'?[[[1,.38,.16],-.06]]:
  broadside?[[[.10,.12,1],kind==='cruiser'?.22:-.13]]:
  (kind==='battleship'||kind==='wayfarer'||kind==='talon')?[[[1,.026,-.02],-.44],[[1,.026,-.02],.56]]:[];
 const cuts=cutSpecs.map(s=>s[1]),sections=[];let remainder=remap(triangles,warp);
 for(const [normal,d]of cutSpecs){const boundary=plane(normal,d),[lo,hi]=finish(splitWreckTriangles(remainder,boundary,1e-7,.08));sections.push({tris:lo,planes:[boundary]});remainder=hi;}
 sections.push({tris:remainder,planes:cutSpecs.map(([n,d])=>plane(n,d))});
 if(broadside){
  if(kind==='frigate')sections.reverse();
  sections[0].name=kind==='cruiser'?'Cruiser wreck command hull':'Frigate wreck forward section';
  sections[1].name=kind==='cruiser'?'Cruiser wreck broadside shell':'Frigate wreck port armour';
  // A broadside tear exposes the original inner hull, not a new full-length
  // planar lid stretched across its cross-section.
  for(const section of sections)section.tris=section.tris.filter(t=>t.mat>=0);
 }else if(kind==='carrier'){
  sections[0].name='Carrier wreck bow';sections[1].name='Carrier wreck flight deck';
 }else if(profileKey==='cruiser'){
  sections[0].name='Cruiser wreck command hull';sections[1].name='Cruiser wreck engine cluster';
 }
 // Only the spine-fractured battleship and aft-sheared cruiser lose a whole
 // stern segment. The carrier retains its keel and port drive; one damaged
 // starboard pod is peeled out of that otherwise connected assembly.
 if(kind==='battleship'||profileKey==='cruiser'){
  const rear=sections.at(-1),boundary=plane([0,.13,1],size.z*factor*.19),[body,pod]=finish(splitWreckTriangles(rear.tris,boundary,1e-7,.08));
  rear.tris=body;sections.push({tris:pod,planes:[...rear.planes,boundary],name:label+' wreck detached engine pod',stern:true});
 }
 const bay=config.interior,parts=[],removedSupport=[],grouped=tris=>{const map=new Map();for(const t of tris){if(!map.has(t.mat))map.set(t.mat,[]);map.get(t.mat).push(t);}return map;};
 const mainIndex=kind==='carrier'||kind==='battleship'?1:0;
 for(const [i,section]of sections.entries()) {
  let tris=remap(section.tris,unwarp);
  const boundaries=broadside?[]:cuts.length===1?cuts:i===0?[cuts[0]]:i>=cuts.length?[cuts.at(-1)]:cuts;
  const skirt=peeledEdges(tris,boundaries,i===0?1:-1,steel),ny=size.y*factor,nz=size.z*factor;
  for(const cut of boundaries)tris=rupture(tris,[cut,-ny*.07,nz*.035],[.075,Math.min(.11,ny*.19),Math.min(.15,nz*.22)]);
  tris.push(...skirt);
  // The tower/island is retained from the current source hull, before the
  // exploration bay is opened. It tilts independently of the surviving keel.
  if(kind==='carrier'&&i===mainIndex){
   const island=[];tris=subtractBox(tris,[.11,.15,-.13],[.53,.44,.13],island);
   if(island.length)parts.push({name:'Carrier wreck command island',groups:grouped(island),planes:[]});
   const pod=[];tris=subtractBox(tris,[.79,-.4,.17],[1.3,.3,.62],pod);
   if(pod.length)parts.push({name:'Carrier wreck detached engine pod',groups:grouped(pod),planes:[]});
  }
  if((kind==='cruiser'&&i===mainIndex)||kind==='frigate'){
   const tower=[],minimum=kind==='cruiser'?[-.055,.28,-.15]:[.21,.10,-.065],maximum=kind==='cruiser'?[.37,.75,.15]:[.43,.53,.065];
   tris=subtractBox(tris,minimum,maximum,tower);
   if(tower.length){
    const name=label+' wreck command tower',prior=parts.find(p=>p.name===name);
    if(prior)for(const [slot,ts]of grouped(tower)){if(!prior.groups.has(slot))prior.groups.set(slot,[]);prior.groups.get(slot).push(...ts);}
    else parts.push({name,groups:grouped(tower),planes:[]});
   }
   if(kind==='frigate')tris=subtractBox(tris,[.20,.07,-.07],[.44,.10,.07],removedSupport);
  }
  if(bay&&i===mainIndex){const w=bay.halfWidth+.045,h=bay.halfHeight+.045;
   tris=subtractBox(tris,[-.62,bay.center[1]-h,bay.center[2]-w],[.75,bay.center[1]+h,bay.center[2]+w],removedSupport);
   // Distinct rupture entrances: the carrier loses a hangar side, while the
   // broadside cruiser keeps its large side tear instead of another roof slot.
   const minX=kind==='carrier'?-.31:-.26,maxX=kind==='carrier'?-.08:-.13;
   if(!broadside)tris=subtractBox(tris,[minX,bay.center[1],bay.center[2]-w-.1],[maxX,bay.center[1]+h+.35,bay.center[2]+w],removedSupport);
  }
  let shift=[0,0,0];
  if(kind==='battleship'||kind==='wayfarer'||kind==='talon')shift=i===0?[-.065,-.025,.025]:i>=cuts.length?[.075,-.035,-.025]:[0,0,0];
  else if(kind==='carrier'&&i===0)shift=[-.065,-.025,.025];
  else if(!broadside&&i===1)shift=[.075,-.035,-.025];
  else if(section.stern)shift=[.075,-.035,-.025];
  const moved=tris.map(t=>({...t,v:t.v.map(v=>({...v,p:v.p.map((x,j)=>x+shift[j])}))}));
  parts.push({name:section.name??names[kind][i],groups:grouped(moved),planes:section.planes});
 }
 if(kind==='battleship'){
  const mid=parts.find(p=>p.name===names[kind][1]),all=[...mid.groups.values()].flat();
  const [body,bridge]=finish(splitWreckTriangles(all,plane([0,1,0],.245),1e-7,.08));
  mid.groups=grouped(body);parts.push({name:'Battleship wreck bridge',groups:grouped(bridge),planes:[]});
  let support=removedSupport.filter(t=>t.v.some(v=>v.p[0]>.29&&v.p[0]<.56&&v.p[1]>.08&&Math.abs(v.p[2])<.085));
  support=finish(splitWreckTriangles(support,plane([1,0,0],.29),1e-7,.08))[1];
  support=finish(splitWreckTriangles(support,plane([0,1,0],.08),1e-7,.08))[1];
  support=finish(splitWreckTriangles(support,plane([0,0,1],.085),1e-7,.08))[0];
  support=finish(splitWreckTriangles(support,plane([0,0,1],-.085),1e-7,.08))[1];
  for(const [i,cut]of [.38,.46,.57].entries()){
   const [piece,rest]=finish(splitWreckTriangles(support,plane([1,.2,-.1],cut),1e-7,.08));support=rest;
   if(piece.length)parts.push({name:`Battleship wreck bridge support ${i+1}`,groups:grouped(piece),planes:[]});
  }
 }else if(removedSupport.length){
  // Keep all original surfaces removed from the bay/tower base as displaced
  // structural fragments. Different fragment sizes and tear planes follow
  // the carrier roof, cruiser spine and smaller frigate bridge pedestals.
  let rest=removedSupport;
  const box=new T.Box3();for(const t of rest)for(const v of t.v)box.expandByPoint(new T.Vector3(...v.p));
  const count=kind==='carrier'?4:2,fractions=kind==='carrier'?[.22,.55,.8,1]:[.43,1];
  for(let i=0;i<count;i++){
   const cut=box.min.x+(box.max.x-box.min.x)*fractions[i];
   const [piece,next]=i===count-1?[rest,[]]:finish(splitWreckTriangles(rest,plane(kind==='carrier'?[1,.24,-.19]:[1,-.18,.13],cut),1e-7,.08));rest=next;
   if(piece.some(t=>t.mat>=0))parts.push({name:`${label} wreck ejected structure ${i+1}`,groups:grouped(piece),planes:[]});
  }
 }
 const provenance={damageProfile:profileKey,cutPlanes:cutSpecs,source:sourcePath,sha256:createHash('sha256').update(buffer).digest('hex'),passages:config.passages??[],damage:'pressure-ruptures-and-peeled-armour',peeledMetalThickness:.003,shellThickness:.006},output=config.file.split('/').at(-1),result=glb(parts,json,bin,materials,provenance);await fs.writeFile(`${out}/${output}`,result);report.push({kind:profileKey,hullClass:kind,output,...provenance,bytes:result.length,triangles:provenance.solidSurfaces.reduce((n,s)=>n+s.originalTriangles+s.backedTriangles+s.edgeTriangles,0)});console.log(report.at(-1));
}
await fs.writeFile(`${out}/sources.json`,JSON.stringify(report,null,2));
