import * as THREE from 'three';
import {applyAsteroidLightResponse} from './asteroidMaterials.js';
import { LOCATIONS } from './data.js';
import { SHARDBELT_FRAGMENTS, fragmentDistance, fragmentToWorld, worldToFragment, parentSkinDistance, parentRockDistance, rockNoise, stoneNoise } from './asteroidFieldLayout.js';
import { prepareMeshQueryIndex, segmentMeshHit } from './meshQueries.js';
import { prepareSurfaceMeshIndex } from './surfaceMeshCandidates.js';

// Polygonize once on entering flight; all subsequent sessions reuse the same
// immutable geometry. Closed, volumetric fragments contain real open bores.
// Rendering uses ten meshes; collision divides those exact triangles into
// small surface tiles so the spatial grid never queries a field-sized sphere.
const STEP = 56, TILE = 168;
let cached,preparing;
// A regular task boundary gives browsers a chance to paint the loading UI;
// scheduler.yield() may repeatedly prioritize its own continuation.
const yieldTerrainWork=()=>new Promise(resolve=>setTimeout(resolve,0));
const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const tetrahedra = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const edges = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
// Angle-weighted normals avoid bias from the long, thin marching-tetrahedron
// triangles. Only real geometric creases split normal vertices; nearby broad
// surfaces stay continuous rather than acquiring a painted shading boundary.
function* smoothRockNormals(geometry,fragment) {
    const position=geometry.attributes.position,color=geometry.attributes.color,uv=geometry.attributes.uv,index=geometry.index.array;
    const faces=new Float32Array(index.length),weights=new Float32Array(index.length),adjacent=Array.from({length:position.count},()=>[]);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
    for(let t=0;t<index.length;t+=3){
        a.fromBufferAttribute(position,index[t]);b.fromBufferAttribute(position,index[t+1]);c.fromBufferAttribute(position,index[t+2]);
        normal.crossVectors(ab.copy(b).sub(a),ac.copy(c).sub(a)).normalize();normal.toArray(faces,t);
        weights[t]=ab.angleTo(ac);weights[t+1]=ab.copy(a).sub(b).angleTo(ac.copy(c).sub(b));weights[t+2]=Math.max(0,Math.PI-weights[t]-weights[t+1]);
        for(let k=0;k<3;k++)adjacent[index[t+k]].push(t+k);
        if(t%1536===1533)yield;
    }
    const positions=[],normals=[],colors=[],uvs=[],indices=[],cache=new Map(),limit=Math.cos(70*Math.PI/180);
    const smoothNormals=new Float32Array(position.count*3),sampled=new Uint8Array(position.count),fractureVertices=new Uint8Array(position.count);
    const smoothIndices=new Uint32Array(position.count);
    const onFracture=id=>{
        if(!fractureVertices[id]){
            const [x,y,z]=worldToFragment(fragment,position.getX(id),position.getY(id),position.getZ(id)),rough=rockNoise(x,y,z)*.52;
            fractureVertices[id]=fragment.planes.some(p=>x*p[0]+y*p[1]+z*p[2]-p[3]+34+rough>=-20)?2:1;
        }
        return fractureVertices[id]===2;
    };
    const smoothNormal=id=>{
        if(!sampled[id]){
            const [x,y,z]=worldToFragment(fragment,position.getX(id),position.getY(id),position.getZ(id)),h=2;
            const nx=fragmentDistance(fragment,x+h,y,z)-fragmentDistance(fragment,x-h,y,z),
                ny=fragmentDistance(fragment,x,y+h,z)-fragmentDistance(fragment,x,y-h,z),
                nz=fragmentDistance(fragment,x,y,z+h)-fragmentDistance(fragment,x,y,z-h);
            a.set(nx*fragment.c+nz*fragment.s,ny,-nx*fragment.s+nz*fragment.c).normalize();a.toArray(smoothNormals,id*3);sampled[id]=1;
        }
        normal.fromArray(smoothNormals,id*3);
    };
    for(let corner=0;corner<index.length;corner++){
        const id=index[corner],face=corner-corner%3;
        // Away from a fracture every corner uses the same gradient normal.
        // Reuse that output vertex directly; only a fracture can split it.
        let next=smoothIndices[id]-1, key;
        if(next<0){
            if(onFracture(id)){
                normal.set(0,0,0);let crease=false;
                for(const other of adjacent[id]){
                    const f=other-other%3;
                    if(faces[face]*faces[f]+faces[face+1]*faces[f+1]+faces[face+2]*faces[f+2]<limit){crease=true;continue;}
                    normal.x+=faces[f]*weights[other];normal.y+=faces[f+1]*weights[other];normal.z+=faces[f+2]*weights[other];
                }
                if(crease)normal.normalize();else smoothNormal(id);
                key=id+':'+Math.round(normal.x*1e5)+':'+Math.round(normal.y*1e5)+':'+Math.round(normal.z*1e5);
                next=cache.get(key);
            }else{smoothNormal(id);next=undefined;}
        }
        if(next===undefined){
            next=positions.length/3;
            if(key===undefined)smoothIndices[id]=next+1;else cache.set(key,next);
            positions.push(position.getX(id),position.getY(id),position.getZ(id));
            normals.push(normal.x,normal.y,normal.z);colors.push(color.getX(id),color.getY(id),color.getZ(id));uvs.push(uv.getX(id),uv.getY(id));
        }
        indices.push(next);
        if((corner&127)===127)yield;
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
}
function* buildAsteroidTerrain() {
    const fragments = [], tiles = new Map();
    const origin = LOCATIONS.shardbelt.position;
    // Every fragment samples the same parent asteroid on the same grid.
    // Compute those expensive noise/crater terms once, at full precision;
    // each fragment still applies its own fractures and passages below.
    const min = [-1512,-1120,-1792], max = [1512,1120,1792];
    const nx = Math.round((max[0]-min[0])/STEP)+1, ny = Math.round((max[1]-min[1])/STEP)+1, nz = Math.round((max[2]-min[2])/STEP)+1;
    const at = (x,y,z) => (z*ny+y)*nx+x, count=nx*ny*nz;
    const cornerOffsets = corners.map(c => at(c[0], c[1], c[2]));
    const cornerMasks = corners.map(c => c[0] + 2*c[1] + 4*c[2]);
    const values = new Float32Array(8);
    const parentSamples=new Float64Array(count),roughSamples=new Float64Array(count);
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
        for(let x=0;x<nx;x++){
            const i=at(x,y,z),px=min[0]+x*STEP,py=min[1]+y*STEP,pz=min[2]+z*STEP;
            const noise=rockNoise(px,py,pz);
            parentSamples[i]=parentRockDistance(px,py,pz,noise);roughSamples[i]=noise*.52;
        }
        if((y&3)===3)yield;
    }
    for (const f of SHARDBELT_FRAGMENTS) {
        const positions = [], colors = [], uv = [], indices = [], welded = new Map(), edgeVertices = new Map();
        const samples = new Float32Array(count);
        for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
            for(let x=0;x<nx;x++)samples[at(x,y,z)] = fragmentDistance(f,min[0]+x*STEP,min[1]+y*STEP,min[2]+z*STEP,parentSamples[at(x,y,z)],roughSamples[at(x,y,z)]);
            if((y&3)===3)yield;
        }
        const vertex = (p) => {
            // Adjacent tetrahedra interpolate the same lattice edge. Only
            // its first vertex needs a world transform and a weld-key string.
            const previous=edgeVertices.get(p.edge);
            if(previous!==undefined)return previous;
            const w = fragmentToWorld(f,...p), key = w.map(v=>Math.round(v*1e6)).join(':');
            let id = welded.get(key);
            if(id!==undefined){edgeVertices.set(p.edge,id);return id;}
            id = positions.length/3; welded.set(key,id); positions.push(...w);
            edgeVertices.set(p.edge,id);
            // Weathered charcoal crust, exposed warm grey stone, mineral seams
            // and sediment bands. Shared source strata align across fractures.
            const crust = THREE.MathUtils.smoothstep(parentSkinDistance(...p),-100,-12);
            const broad=rockNoise(p[0]*.27+540,p[1]*.31,p[2]*.27-720)/44;
            const mottling=rockNoise(p[0]*1.8,p[1]*1.8+310,p[2]*1.8)/44;
            const band=.5+.5*stoneNoise(p[0]*.006+19,p[1]*.009-54,p[2]*.006+83);
            const seam=stoneNoise(p[0]*.004+mottling*.35+71,p[1]*.007-23,p[2]*.004+46);
            const vein=(1-THREE.MathUtils.smoothstep(Math.abs(seam),.01,.035))*THREE.MathUtils.smoothstep(broad,-.2,.3);
            const basalt=THREE.MathUtils.smoothstep(broad,-.35,.4);
            const dust=THREE.MathUtils.smoothstep(rockNoise(p[0]*.6-820,p[1]*.6+140,p[2]*.6)/44,.12,.65)*crust;
            const light=.30+band*.085+mottling*.035;
            colors.push(
                light*(1-crust*.44)*(1-basalt*.37)+dust*.12+vein*.23,
                light*.95*(1-crust*.39)*(1-basalt*.24)+dust*.077+vein*.17,
                light*.91*(1-crust*.31)*(1-basalt*.13)+dust*.031+vein*.085);
            uv.push((p[0]+p[2]*.37)/105,(p[1]+p[2]*.61)/105);
            return id;
        };
        const triangle = (a,b,c,inside) => {
            const abx=b[0]-a[0],aby=b[1]-a[1],abz=b[2]-a[2],acx=c[0]-a[0],acy=c[1]-a[1],acz=c[2]-a[2];
            const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
            if(Math.hypot(nx,ny,nz)<1e-10)return;
            if(nx*(inside[0]-a[0])+ny*(inside[1]-a[1])+nz*(inside[2]-a[2])>0){const swap=b;b=c;c=swap;}
            const ia=vertex(a),ib=vertex(b),ic=vertex(c); indices.push(ia,ib,ic);
            const tileCoord=axis=>Math.floor((positions[ia*3+axis]+positions[ib*3+axis]+positions[ic*3+axis])/3/TILE);
            const key=tileCoord(0)+':'+tileCoord(1)+':'+tileCoord(2);
            let tile=tiles.get(key);
            if(!tile){tile={triangles:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};tiles.set(key,tile);}
            for(let k=indices.length-3;k<indices.length;k++)for(let axis=0;axis<3;axis++){
                const v=positions[indices[k]*3+axis];tile.triangles.push(v);
                tile.min[axis]=Math.min(tile.min[axis],v);tile.max[axis]=Math.max(tile.max[axis],v);
            }
        };
        for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++){
          for(let x=0;x<nx-1;x++){
            const base=at(x,y,z),inside=samples[base]<0;
            let corner=1;
            while(corner<8 && (samples[base+cornerOffsets[corner]]<0)===inside)corner++;
            if(corner===8)continue;
            for(let i=0;i<8;i++)values[i]=samples[base+cornerOffsets[i]];
            const points=corners.map(c=>[min[0]+(x+c[0])*STEP,min[1]+(y+c[1])*STEP,min[2]+(z+c[2])*STEP]);
            for(const tet of tetrahedra){
                const cuts=[],inside=[];
                for(const i of tet)if(values[i]<0)inside.push(points[i]);
                if(!inside.length||inside.length===4)continue;
                const centre=inside[0];
                for(const [u,v] of edges){const a=tet[u],b=tet[v];if((values[a]<0)===(values[b]<0))continue;
                    const t=values[a]/(values[a]-values[b]),cut=points[a].map((p,i)=>p+(points[b][i]-p)*t);
                    cut.edge=(base+Math.min(cornerOffsets[a],cornerOffsets[b]))*8+(cornerMasks[a]^cornerMasks[b]);
                    cuts.push(cut);}
                if(cuts.length===3)triangle(cuts[0],cuts[1],cuts[2],centre);
                else if(cuts.length===4){
                    // Edge order around a 2-in/2-out tetrahedron is 0,1,3,2.
                    triangle(cuts[0],cuts[1],cuts[3],centre);triangle(cuts[0],cuts[3],cuts[2],centre);
                }
            }
          }
          if((y&3)===3)yield;
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        geometry.setIndex(indices);yield* smoothRockNormals(geometry,f);geometry.computeBoundingSphere();
        fragments.push({id:f.id,geometry,triangles:indices.length/3});
    }
    const obstacles=[];
    let tileCount=0;
    for(const [key,tile] of tiles){
        const center=tile.min.map((v,i)=>(v+tile.max[i])*.5),half=tile.max.map((v,i)=>(v-tile.min[i])*.5);
        const verts=new Float32Array(tile.triangles.length),indices=new Uint16Array(verts.length/3);
        let radius=0;
        for(let i=0;i<verts.length;i+=3){for(let j=0;j<3;j++)verts[i+j]=tile.triangles[i+j]-center[j];indices[i/3]=i/3;radius=Math.max(radius,Math.hypot(verts[i],verts[i+1],verts[i+2]));}
        prepareMeshQueryIndex(verts,indices);
        prepareSurfaceMeshIndex(verts,indices);
        obstacles.push({id:`shardbelt-terrain:${key}`,x:origin[0]+center[0],y:origin[1]+center[1],z:origin[2]+center[2],
            radius,losRadius:radius,collisionRadius:radius,shape:'asteroid',terrain:true,surfaceOnly:true,minReach:0,
            meshVerts:verts,meshIndices:indices,box:{hx:half[0],hy:half[1],hz:half[2],qx:0,qy:0,qz:0,qw:1}});
        if((++tileCount&15)===0)yield;
    }
    return {fragments,obstacles,triangles:fragments.reduce((sum,f)=>sum+f.triangles,0)};
}

export function getAsteroidTerrain() {
    if(cached)return cached;
    const work=buildAsteroidTerrain();let result;
    do result=work.next();while(!result.done);
    cached=result.value;return cached;
}

// The game starts this before constructing its flight renderer, while the
// loading veil is visible. Small slices allow the browser to paint and handle
// input; tests/tools that need an immediate result keep the synchronous API.
export async function prepareAsteroidTerrain() {
    if(cached)return cached;
    if(preparing)return preparing;
    const task=(async()=>{
        const work=buildAsteroidTerrain();let deadline=performance.now()+8;
        while(!cached){
            const result=work.next();
            if(result.done){cached=result.value;break;}
            if(performance.now()>=deadline){await yieldTerrainWork();deadline=performance.now()+8;}
        }
        return cached;
    })();
    preparing=task;
    try{return await task;}finally{if(preparing===task)preparing=undefined;}
}

export function createAsteroidTerrain() {
    const group=new THREE.Group();group.name='shardbelt-shattered-parent';
    group.position.fromArray(LOCATIONS.shardbelt.position);
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:.025});
    // Position-based stone pixels stay sharp on walls and bores without UV
    // stretching. Quantize only the color, keeping broad surface normals smooth.
    // No texture uploads, relief derivatives or per-frame uniforms.
    material.onBeforeCompile=shader=>{
        applyAsteroidLightResponse(shader);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPosition;')
            .replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPosition=position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vRockPosition;
float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float rockGrain(vec3 p){p=mat3(.8,-.48,.36,.36,.8,-.48,-.48,.36,.8)*p;vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
            .replace('#include <color_fragment>',`#include <color_fragment>
float rockFootprint=max(length(dFdx(vRockPosition)),length(dFdy(vRockPosition)));
float rockDistant=smoothstep(20000.0,80000.0,length(vViewPosition));
float rockFine=1.0-smoothstep(3.0,14.0,rockFootprint)*rockDistant;
vec3 rockPixel=mix(floor(vRockPosition/4.0)*4.0,vRockPosition,smoothstep(2.0,8.0,rockFootprint)*rockDistant);
float deposit=rockGrain(rockPixel*.006+vec3(31.0,17.0,53.0));
float grain=rockGrain(rockPixel*.045+deposit*2.7);
float stoneTone=mix(.5,floor(grain*7.0)/6.0,rockFine);
float mineral=(1.0-smoothstep(.012,.028,abs(deposit-.52)))*rockFine;
float fleck=step(.90,rockHash(floor(vRockPosition/4.0)))*(1.0-smoothstep(1.0,4.0,rockFootprint));
diffuseColor.rgb*=.68+stoneTone*.62+fleck*.055;
diffuseColor.rgb+=mineral*vec3(.026,.019,.009);`);
    };
    material.customProgramCacheKey=()=> 'shardbelt-rock-v9-distant-haze';
    for(const f of getAsteroidTerrain().fragments){const mesh=new THREE.Mesh(f.geometry,material);mesh.name=f.id;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    return group;
}

// A terrain tile's bounding sphere contains empty tunnel space. Navigation
// probes the visible surface instead, with five hull-width rays. Scratch is
// private to the pilot/session and reused after its first planning call.
export function terrainFlightDistance(obstacle, position, direction, reach, limit, scratch) {
    const ox=position.x-obstacle.x,oy=position.y-obstacle.y,oz=position.z-obstacle.z;
    const along=Math.max(0,Math.min(limit,-(ox*direction.x+oy*direction.y+oz*direction.z)));
    const dx=ox+direction.x*along,dy=oy+direction.y*along,dz=oz+direction.z*along;
    if(dx*dx+dy*dy+dz*dz>(obstacle.radius+reach)**2)return limit;
    scratch.terrainStart??=new THREE.Vector3();scratch.terrainEnd??=new THREE.Vector3();
    scratch.terrainSide??=new THREE.Vector3();scratch.terrainUp??=new THREE.Vector3();
    const side=scratch.terrainSide.set(direction.z,0,-direction.x).normalize();
    if(side.lengthSq()<.01)side.set(1,0,0);
    const up=scratch.terrainUp.crossVectors(direction,side).normalize();
    let best=limit;
    for(let i=0;i<5;i++){
        const start=scratch.terrainStart.copy(position);
        if(i>0)start.addScaledVector(i<3?side:up,i%2===0?-reach:reach);
        scratch.terrainEnd.copy(start).addScaledVector(direction,best);
        const hit=segmentMeshHit(start,scratch.terrainEnd,obstacle);
        if(hit!==undefined)best*=hit;
    }
    return best;
}
