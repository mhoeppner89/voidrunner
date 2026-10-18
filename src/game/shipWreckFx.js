import * as THREE from 'three';
import {seededRandom} from './random.js';

// Cosmetic only. The hull is clipped once into closed, textured sections;
// subsequent deaths reuse the buffers. Nothing enters collision or loot stores.
const axisY = new THREE.Vector3(0,1,0);
const isSolid = mesh => mesh.isMesh && mesh.geometry?.attributes.position &&
    (Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.isMeshStandardMaterial);
const interpolate = (a,b,t) => ({p:a.p.map((x,i)=>x+(b.p[i]-x)*t),n:a.n.map((x,i)=>x+(b.n[i]-x)*t),uv:a.uv.map((x,i)=>x+(b.uv[i]-x)*t),c:a.c.map((x,i)=>x+(b.c[i]-x)*t),pp:(a.pp??a.p).map((x,i)=>x+((b.pp??b.p)[i]-x)*t),pn:(a.pn??a.n).map((x,i)=>x+((b.pn??b.n)[i]-x)*t)});
const distance = (v,plane) => v.p[0]*plane.n.x+v.p[1]*plane.n.y+v.p[2]*plane.n.z-plane.d;
function clip(vertices,distances,positive) {
    const out=[];
    for(let i=0;i<vertices.length;i++){
        const a=vertices[i],b=vertices[(i+1)%vertices.length],da=distances[i],db=distances[(i+1)%vertices.length];
        if(positive?da>=0:da<=0)out.push(a);
        if((da<0&&db>0)||(da>0&&db<0))out.push(interpolate(a,b,da/(da-db)));
    }
    return out;
}
const fan=(out,vertices,mat)=>{for(let i=1;i+1<vertices.length;i++)out.push({v:[vertices[0],vertices[i],vertices[i+1]],mat});};
function closeCut(segments,plane,negative,positive,epsilon,tile) {
    const nodes=new Map(),key=p=>p.map(x=>Math.round(x/epsilon)).join(',');
    for(const [a,b]of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;
        for(const [k,p,next]of [[ka,a,kb],[kb,b,ka]]){if(!nodes.has(k))nodes.set(k,{p,next:new Set()});nodes.get(k).next.add(next);}
    }
    const used=new Set(),edge=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
    const u=new THREE.Vector3().crossVectors(Math.abs(plane.n.y)<.9?axisY:new THREE.Vector3(1,0,0),plane.n).normalize(),v=new THREE.Vector3().crossVectors(plane.n,u);
    const project=p=>new THREE.Vector2(p[0]*u.x+p[1]*u.y+p[2]*u.z,p[0]*v.x+p[1]*v.y+p[2]*v.z);
    for(const [start,node]of nodes)for(const next of node.next){if(used.has(edge(start,next)))continue;
        const loop=[node.p];let previous=start,current=next,closed=false;
        for(let guard=0;guard<=nodes.size;guard++){
            used.add(edge(previous,current));if(current===start){closed=true;break;}loop.push(nodes.get(current).p);
            const choices=[...nodes.get(current).next].filter(k=>k!==previous&&!used.has(edge(current,k)));
            if(!choices.length)break;previous=current;current=choices[0];
        }
        if(!closed||loop.length<3)continue;
        const points=loop.map(project),faces=THREE.ShapeUtils.triangulateShape(points,[]);
        for(const face of faces){
            const vertices=face.map(i=>({p:loop[i],n:plane.n.toArray(),uv:[points[i].x/tile,points[i].y/tile],c:[1,1,1]}));
            // Correct outward winding on both sides; the original UVs/normals
            // on the exterior are left untouched.
            const a=new THREE.Vector3(...vertices[1].p).sub(new THREE.Vector3(...vertices[0].p)),b=new THREE.Vector3(...vertices[2].p).sub(new THREE.Vector3(...vertices[0].p));
            if(a.cross(b).dot(plane.n)<0)vertices.reverse();negative.push({v:vertices,mat:-1});
            positive.push({v:[...vertices].reverse().map(x=>({...x,n:x.n.map(n=>-n)})),mat:-1});
        }
    }
}
function* split(triangles,plane,epsilon,tile){
    const negative=[],positive=[],segments=[];
    let processed=0;
    for(const t of triangles){if(++processed%512===0)yield;const ds=t.v.map(v=>distance(v,plane));
        if(ds.every(d=>d>=-epsilon)){positive.push(t);continue;}
        if(ds.every(d=>d<=epsilon)){negative.push(t);continue;}
        const snapped=ds.map(d=>Math.abs(d)<epsilon?0:d);
        const lo=clip(t.v,snapped,false),hi=clip(t.v,snapped,true);fan(negative,lo,t.mat);fan(positive,hi,t.mat);
        const cut=[];for(let i=0;i<3;i++){if(snapped[i]===0)cut.push(t.v[i].p);const j=(i+1)%3;if(snapped[i]*snapped[j]<0)cut.push(interpolate(t.v[i],t.v[j],snapped[i]/(snapped[i]-snapped[j])).p);}
        if(cut.length===2)segments.push(cut);
    }
    closeCut(segments,plane,negative,positive,epsilon*4,tile);return[negative,positive];
}
function fractureTree(bounds){
    const size=bounds.getSize(new THREE.Vector3()),c=bounds.getCenter(new THREE.Vector3()),random=seededRandom(size.toArray().map(n=>n.toFixed(3)).join(':'));
    const plane=(normal,point)=>{const n=new THREE.Vector3(...normal).normalize();return{n,d:n.dot(point)};};
    const p=(x,y,z)=>new THREE.Vector3(c.x+x*size.x,c.y+y*size.y,c.z+z*size.z);
    // Bow/canopy, offset midship break and separate port/centre/starboard
    // propulsion sections. Slightly oblique planes avoid identical bread slices.
    return {plane:plane([.11,.13,1],p(0,0,-.23+(random()-.5)*.07)),lo:{plane:plane([.12,1,.18],p(0,.015,-.35))},hi:{plane:plane([-.09,-.12,1],p(0,0,.15+(random()-.5)*.08)),lo:{plane:plane([1,.16,-.12],p(-.06+(random()-.5)*.08,0,0))},hi:{plane:plane([1,-.13,.08],p(-.19,0,.35)),hi:{plane:plane([1,.11,-.06],p(.19,0,.35))}}}};
}
function collect(source){
    source.updateWorldMatrix(true,true);
    const inverse=source.matrixWorld.clone().invert(),hull=source.userData.glb?source.children[0]:source,meshes=[],hardware=[],bounds=new THREE.Box3();
    hull.traverseVisible(mesh=>{if(!isSolid(mesh))return;const matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
        for(let p=mesh;p&&p!==hull;p=p.parent)if(p.userData.yaw||p.userData.pitch||/(?:[_.](?:yaw|pitch)|armament)$/i.test(p.name)){hardware.push({mesh,matrix});return;}
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);bounds.union(box);
        meshes.push({mesh,matrix});
    });
    // Material sharing is part of the key, but UUIDs are not: livery clones
    // retain the same slot relationships while owning their colour/textures.
    const ids=new Map(),materials=[],slots=[];
    const signature=meshes.map(({mesh,matrix},i)=>{
        const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        slots[i]=mats.map((m,j)=>{if(!ids.has(m)){ids.set(m,materials.length);materials.push({mesh:i,slot:j});}return ids.get(m);});
        return `${mesh.geometry.id}:${matrix.elements.map(n=>Math.round(n*1e5)).join(',')}:${slots[i]}`;
    }).join(';');
    return{meshes,hardware,bounds,materials,slots,signature};
}
function geometryFor(triangles,origin,planes=[],size=new THREE.Vector3(1,1,1)){
    const length=Math.max(size.x,size.y,size.z),tearScale=Math.min(size.x,size.z)*.004;
    const positions=[],normals=[],uvs=[],colors=[],paintPositions=[],paintNormals=[];
    for(const t of triangles)for(const v of t.v){
        const near=Math.min(...planes.map(plane=>Math.abs(distance(v,plane)))),edge=Math.max(0,1-near/(length*.018));
        const tear=near<length*1e-5?Math.sin((v.p[0]*4.7+v.p[1]*3.3+v.p[2]*4.1)/Math.max(.01,tearScale*30))*tearScale:0;
        // Matching edge noise crumples the shared tear, while the back plate
        // sits inside the hull rather than sealing it with a flat painted lid.
        const recess=t.mat===-1?length*.012:0;
        positions.push(v.p[0]+tear*.35-v.n[0]*recess-origin.x,v.p[1]+tear*.8-v.n[1]*recess-origin.y,v.p[2]+tear*.45-v.n[2]*recess-origin.z);
        normals.push(...v.n);paintPositions.push(...(v.pp??v.p));paintNormals.push(...(v.pn??v.n));uvs.push(...v.uv);colors.push(...v.c.map(c=>c*(t.mat>=0?1-edge*.72:1)));
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('wreckSourcePosition',new THREE.Float32BufferAttribute(paintPositions,3));g.setAttribute('wreckSourceNormal',new THREE.Float32BufferAttribute(paintNormals,3));g.computeBoundingSphere();g.userData.shared=true;return g;
}
// Extruded cut rims and transverse internal frames. Bars are clipped to the
// actual cross-section, including separated engine nacelles and thin wings.
function* structureFor(triangles,origin,size){
    const groups=new Map(),length=Math.max(size.x,size.y,size.z),width=length*.0022,depth=length*.012,positions=[];
    for(const t of triangles)if(t.mat===-1){const key=t.v[0].n.map(x=>Math.round(x*1e5)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    const add=(p)=>positions.push(p.x-origin.x,p.y-origin.y,p.z-origin.z);
    const quad=(a,b,c,d)=>{for(const p of [a,b,c,a,c,d])add(p);};
    const bar=(a,b,n)=>{const delta=b.clone().sub(a);if(delta.length()<width*4)return;const side=new THREE.Vector3().crossVectors(delta,n).normalize().multiplyScalar(width),thick=n.clone().multiplyScalar(width*1.6);
        a.addScaledVector(n,-depth*.45);b.addScaledVector(n,-depth*.45);
        const corners=[a.clone().sub(side).sub(thick),a.clone().add(side).sub(thick),b.clone().add(side).sub(thick),b.clone().sub(side).sub(thick),a.clone().sub(side).add(thick),a.clone().add(side).add(thick),b.clone().add(side).add(thick),b.clone().sub(side).add(thick)];
        for(const ids of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]])quad(...ids.map(i=>corners[i]));
    };
    for(const ts of groups.values()){
        yield;const n=new THREE.Vector3(...ts[0].v[0].n),u=new THREE.Vector3().crossVectors(Math.abs(n.y)<.9?axisY:new THREE.Vector3(1,0,0),n).normalize(),v=new THREE.Vector3().crossVectors(n,u),d=n.dot(new THREE.Vector3(...ts[0].v[0].p)),edges=new Map();
        const points=ts.map(t=>t.v.map(p=>new THREE.Vector3(...p.p))),projected=points.map(t=>t.map(p=>[p.dot(u),p.dot(v)]));
        const coord=(x,y)=>u.clone().multiplyScalar(x).addScaledVector(v,y).addScaledVector(n,d);
        for(const t of points)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],ka=a.toArray().map(x=>Math.round(x/(length*1e-6))).join(','),kb=b.toArray().map(x=>Math.round(x/(length*1e-6))).join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
        for(const [a,b]of edges.values()){quad(a,b,b.clone().addScaledVector(n,-depth),a.clone().addScaledVector(n,-depth));}
        for(const axis of [0,1]){const values=projected.flat().map(p=>p[axis]),lo=Math.min(...values),hi=Math.max(...values);if(hi-lo<width*12)continue;
            for(let i=1;i<=3;i++){const at=lo+(hi-lo)*i/4,intervals=[];
                for(const t of projected){const cuts=[];for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3];if((a[axis]<=at&&b[axis]>at)||(b[axis]<=at&&a[axis]>at))cuts.push(a[1-axis]+(b[1-axis]-a[1-axis])*(at-a[axis])/(b[axis]-a[axis]));}if(cuts.length===2)intervals.push(cuts.sort((a,b)=>a-b));}
                intervals.sort((a,b)=>a[0]-b[0]);const merged=[];for(const pair of intervals){const last=merged.at(-1);if(last&&pair[0]<=last[1]+width*.1)last[1]=Math.max(last[1],pair[1]);else merged.push([...pair]);}
                for(const [a,b]of merged)bar(axis===0?coord(at,a):coord(a,at),axis===0?coord(at,b):coord(b,at),n);
            }
        }
    }
    if(!positions.length)return null;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData.shared=true;return geometry;
}
function* compile(data,owned){
    const triangles=[],p=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<data.meshes.length;i++){const {mesh,matrix}=data.meshes[i],g=mesh.geometry,a=g.attributes,normal=new THREE.Matrix3().getNormalMatrix(matrix),vertices=[];
        for(let j=0;j<a.position.count;j++){
            if(j%2048===0)yield;
            p.fromBufferAttribute(a.position,j).applyMatrix4(matrix);if(a.normal)n.fromBufferAttribute(a.normal,j).applyMatrix3(normal).normalize();else n.set(0,1,0);
            vertices.push({p:p.toArray(),n:n.toArray(),pp:[a.position.getX(j),a.position.getY(j),a.position.getZ(j)],pn:a.normal?[a.normal.getX(j),a.normal.getY(j),a.normal.getZ(j)]:[0,1,0],uv:a.uv?[a.uv.getX(j),a.uv.getY(j)]:[0,0],c:a.color?[a.color.getX(j),a.color.getY(j),a.color.getZ(j)]:[1,1,1]});
        }
        const ranges=g.groups.length?g.groups:[{start:0,count:g.index?.count??a.position.count,materialIndex:0}];
        for(const range of ranges)for(let j=range.start;j<range.start+range.count;j+=3){if(j%3072===0)yield;triangles.push({v:[0,1,2].map(k=>vertices[g.index?g.index.getX(j+k):j+k]),mat:data.slots[i][range.materialIndex??0]??data.slots[i][0]});}
    }
    const size=data.bounds.getSize(new THREE.Vector3()),epsilon=Math.max(...size.toArray())*1e-6,tile=Math.max(.1,Math.min(size.x,size.z)*.12),leaves=[];
    function* visit(tris,node,planes=[]){if(!tris.length)return;if(!node){leaves.push({tris,planes});return;}const [lo,hi]=yield* split(tris,node.plane,epsilon,tile);yield;yield* visit(lo,node.lo,[...planes,node.plane]);yield* visit(hi,node.hi,[...planes,node.plane]);}yield* visit(triangles,fractureTree(data.bounds));
    const sections=[];for(const {tris,planes}of leaves){
        yield;
        const box=new THREE.Box3();let mass=0;const a=new THREE.Vector3(),b=new THREE.Vector3();
        for(const t of tris){for(const v of t.v)box.expandByPoint(p.fromArray(v.p));if(t.mat!==-1){a.fromArray(t.v[1].p).sub(p.fromArray(t.v[0].p));b.fromArray(t.v[2].p).sub(p);mass+=a.cross(b).length()*.5;}}
        const origin=box.getCenter(new THREE.Vector3()),byMaterial=new Map();
        for(const t of tris){if(!byMaterial.has(t.mat))byMaterial.set(t.mat,[]);byMaterial.get(t.mat).push(t);}
        const parts=[];for(const [slot,t]of byMaterial){yield;const geometry=geometryFor(t,origin,planes,size);owned.add(geometry);parts.push({slot,geometry});}
        yield;const structure=yield* structureFor(tris,origin,size);if(structure){owned.add(structure);parts.push({slot:-2,geometry:structure});}
        sections.push({origin,mass:Math.max(epsilon,mass),radius:box.getSize(new THREE.Vector3()).length()*.5,parts});
    }
    return{sections,size,materials:data.materials};
}
function interiorTexture(){
    const size=128,bytes=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const xx=x%64,yy=y%64,rim=xx<3||yy<3,well=xx>9&&xx<54&&yy>12&&yy<53,vent=well&&yy%7<2;
        const cable=xx>44&&xx<48&&yy>8&&yy<58,bolt=(xx-6)**2+(yy-6)**2<3;
        const value=bolt?120:rim?88:vent?12:well?26:46+((x*17+y*31)%7),i=(y*size+x)*4;
        bytes.set(cable?[89,66,39,255]:[value*.93,value,value*1.03,255],i);
    }
    const texture=new THREE.DataTexture(bytes,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;texture.userData.shared=true;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export class ShipWreckFactory {
    cache=new Map();jobs=new Map();geometries=new Set();disposed=false;
    job(data){if(!this.jobs.has(data.signature))this.jobs.set(data.signature,compile(data,this.geometries));return this.jobs.get(data.signature);}
    step(key,job){const result=job.next();if(result.done){this.cache.set(key,result.value);this.jobs.delete(key);}return result.done;}
    prepare(source){
        if(this.disposed)return;const data=collect(source);if(!data.meshes.length)return;
        if(!this.cache.has(data.signature)){const job=this.job(data);while(!this.step(data.signature,job)){} }
        return{template:this.cache.get(data.signature),data};
    }
    schedule(source){
        if(this.disposed)return;const data=collect(source);if(!data.meshes.length||this.cache.has(data.signature))return;this.job(data);
        if(this.task!==undefined)return;
        // Mesh reads, clipping and internal frames yield separately. A large
        // carrier must not consume its entire preparation cost in one frame.
        const run=deadline=>{this.task=undefined;if(this.disposed)return;const entry=this.jobs.entries().next().value;if(!entry)return;
            const until=performance.now()+4;do{if(this.step(...entry))break;}while(performance.now()<until&&(!deadline||deadline.timeRemaining()>1));
            if(this.jobs.size)this.queue(run);
        };this.queue(run);
    }
    queue(run){this.task=globalThis.requestIdleCallback?requestIdleCallback(run,{timeout:1500}):setTimeout(run,16);}
    create(source,ship,externalHardware=[]){
        const prepared=this.prepare(source);if(!prepared)return null;
        const {template,data}=prepared,root=new THREE.Group();source.getWorldPosition(root.position);source.getWorldQuaternion(root.quaternion);source.getWorldScale(root.scale);
        const random=seededRandom(`${ship.id}:${ship.position.join(':')}:fracture`),materials=new Map(),ownedHardware=new Set();
        // Borrow the live hull atlas; custom effect cleanup owns only these
        // material clones. Duplicating texture handles would upload the same
        // large atlas again for every wreck in a battle.
        const damaged=original=>{if(materials.has(original))return materials.get(original);const m=original.clone();m.userData.shared=false;m.emissiveIntensity=0;m.roughness=Math.max(.82,m.roughness);m.side=THREE.DoubleSide;m.vertexColors=true;m.onBeforeCompile=shader=>{
                original.onBeforeCompile.call(m,shader);
                // Faction patterns are projected in the original mesh's frame.
                // Moving/recentering fragments must not slide those patterns.
                shader.vertexShader='attribute vec3 wreckSourcePosition;attribute vec3 wreckSourceNormal;\n'+shader.vertexShader.replace(/(vrPaintFrame|wfPaintFrame|ipFrame)\*vec4\(position,/g,'$1*vec4(wreckSourcePosition,').replace(/mat3\((vrPaintFrame|ipFrame)\)\*normal/g,'mat3($1)*wreckSourceNormal');
            };m.customProgramCacheKey=()=>original.customProgramCacheKey.call(original)+':wreck-source-frame';
            materials.set(original,m);return m;};
        this.texture??=interiorTexture();const interior=new THREE.MeshStandardMaterial({color:0xaaa69a,map:this.texture,roughness:.94,metalness:.58,emissive:0x8e3211,emissiveIntensity:.25,flatShading:true,side:THREE.DoubleSide});
        const structureMaterial=new THREE.MeshStandardMaterial({color:0x727d85,roughness:.76,metalness:.62,side:THREE.DoubleSide});
        const length=template.size.length(),worldLength=length*Math.max(root.scale.x,root.scale.y,root.scale.z),centre=data.bounds.getCenter(new THREE.Vector3()),parts=[],momentum=new THREE.Vector3();let mass=0;
        for(const section of template.sections){
            const group=new THREE.Group();group.position.copy(section.origin);root.add(group);
            for(const p of section.parts){const slot=template.materials[p.slot],original=slot?(Array.isArray(data.meshes[slot.mesh].mesh.material)?data.meshes[slot.mesh].mesh.material[slot.slot]:data.meshes[slot.mesh].mesh.material):null;
                const mesh=new THREE.Mesh(p.geometry,p.slot===-1?interior:p.slot===-2?structureMaterial:damaged(original));mesh.raycast=()=>undefined;group.add(mesh);}
            const direction=section.origin.clone().sub(centre);if(direction.lengthSq()<1e-6)direction.set(1,.4,.3);direction.normalize().add(new THREE.Vector3(random()-.5,random()-.5,random()-.5).multiplyScalar(.3)).normalize();
            const speed=length*(.018+random()*.028)*Math.min(1.7,Math.sqrt(length/Math.max(section.radius,1e-3))*.55),velocity=direction.multiplyScalar(speed);
            const spinAxis=new THREE.Vector3(random()-.5,random()-.5,random()-.5).normalize(),spinRate=(.015+random()**2*.4)*Math.min(2,Math.sqrt(length/Math.max(section.radius,1e-3))*.5)*THREE.MathUtils.clamp(Math.sqrt(35/Math.max(worldLength,1)),.18,1.4);
            const part={group,origin:section.origin,velocity,spinAxis,spinRate,mass:section.mass};parts.push(part);momentum.addScaledVector(velocity,part.mass);mass+=part.mass;
        }
        momentum.divideScalar(Math.max(1e-9,mass));for(const p of parts)p.velocity.sub(momentum);
        // Keep mounted external hardware with the nearest section. Glows,
        // forcefields and docked drone proxies are intentionally not wreckage.
        const inverse=source.matrixWorld.clone().invert(),point=new THREE.Vector3();
        const attach=(child,local)=>{
            if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();point.copy(child.geometry.boundingBox.getCenter(new THREE.Vector3())).applyMatrix4(local);
            let closest=parts[0];for(const p of parts)if(p.origin.distanceToSquared(point)<closest.origin.distanceToSquared(point))closest=p;
            const mesh=new THREE.Mesh(child.geometry.clone(),Array.isArray(child.material)?child.material.map(damaged):damaged(child.material));mesh.geometry.userData.shared=false;ownedHardware.add(mesh.geometry);if(!mesh.geometry.attributes.color){const colors=new Float32Array(mesh.geometry.attributes.position.count*3);colors.fill(1);mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));}mesh.geometry.setAttribute('wreckSourcePosition',mesh.geometry.attributes.position);mesh.geometry.setAttribute('wreckSourceNormal',mesh.geometry.attributes.normal);mesh.matrixAutoUpdate=false;mesh.matrix.makeTranslation(-closest.origin.x,-closest.origin.y,-closest.origin.z).multiply(local);mesh.raycast=()=>undefined;closest.group.add(mesh);
        };
        for(const {mesh,matrix}of data.hardware)attach(mesh,matrix);
        if(source.userData.glb)for(const extra of source.children.slice(1)){if(extra.name==='drone-docking-ports')continue;extra.traverseVisible(child=>{if(isSolid(child))attach(child,new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld));});}
        for(const extra of externalHardware){extra.updateWorldMatrix(true,true);extra.traverseVisible(child=>{if(isSolid(child))attach(child,new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld));});}
        root.name=`wreck-${ship.id}`;root.userData.wreckSections=parts;const drift=new THREE.Vector3().fromArray(ship.velocity??[0,0,0]),q=new THREE.Quaternion(),colors=[...materials.values()].filter(m=>m.color).map(m=>[m,m.color.clone()]);let age=0,disposed=false;
        const effect={object:root,combatWreck:true,life:180,maxLife:180,sections:parts,update(dt){
            age+=dt;root.position.addScaledVector(drift,dt);const elapsed=Math.max(0,age-.16);
            for(const p of parts){p.group.position.copy(p.origin).addScaledVector(p.velocity,elapsed);q.setFromAxisAngle(p.spinAxis,p.spinRate*elapsed);p.group.quaternion.copy(q);p.group.scale.setScalar(Math.min(1,Math.max(0,(180-age)/8)));}
            const cooling=Math.exp(-age*.65);interior.emissiveIntensity=Math.exp(-age*1.5)*.25;
            for(const [m,color]of colors)m.color.copy(color).multiplyScalar(.64+cooling*.18);
        },dispose(){
            if(disposed)return;disposed=true;for(const material of materials.values())material.dispose();interior.dispose();structureMaterial.dispose();for(const geometry of ownedHardware)geometry.dispose();
        }};effect.update(0);return effect;
    }
    dispose(){
        if(this.disposed)return;this.disposed=true;if(this.task!==undefined){if(globalThis.cancelIdleCallback)cancelIdleCallback(this.task);else clearTimeout(this.task);}
        for(const job of this.jobs.values())job.return();this.jobs.clear();for(const geometry of this.geometries)geometry.dispose();this.geometries.clear();this.cache.clear();this.texture?.dispose();
    }
}

// Offline graveyard authoring reuses the exact hull clipping and sealed-cut
// construction used by combat wrecks; this does not add runtime work.
export {split as splitWreckTriangles, geometryFor as wreckGeometryFor};
