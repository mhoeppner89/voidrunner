// Run: node --import ./tests/helpers/offline-imports.mjs tools/assets/bake-ship-schematics.mjs
// Project the shipping GLBs with their node transforms and flight yaw. A centered
// sampling grid and mirrored half-contours remove tiny export/raster differences.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {SCHEMATIC_DETAILS} from './ship-schematic-details.mjs';
import {GLB_SHIP_CONFIG} from '../../src/game/render.js';
globalThis.createImageBitmap=async()=>({width:1,height:1}); // Geometry only; no texture decode needed.
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function raster(tris,width,height,map){
 const mask=new Uint8Array(width*height);
 for(const tr of tris){const p=tr.map(map),area=cross(p[0],p[1],p[2]);if(Math.abs(area)<1e-9)continue;
  const x0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),x1=Math.min(width-1,Math.ceil(Math.max(...p.map(v=>v[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),y1=Math.min(height-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const v=[x+.5,y+.5],a=cross(p[0],p[1],v),b=cross(p[1],p[2],v),c=cross(p[2],p[0],v);if(area>0?a>=0&&b>=0&&c>=0:a<=0&&b<=0&&c<=0)mask[y*width+x]=1;}
 }
 for(let y=0;y<height;y++)for(let x=0;x<width/2;x++){const i=y*width+x,j=y*width+width-1-x;mask[i]=mask[j]=mask[i]|mask[j];}
 return mask;
}
function edgesFor(mask,w,h){const edges=[],has=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&mask[y*w+x];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(has(x,y)){
 if(!has(x,y-1))edges.push([[x,y],[x+1,y]]);if(!has(x+1,y))edges.push([[x+1,y],[x+1,y+1]]);if(!has(x,y+1))edges.push([[x+1,y+1],[x,y+1]]);if(!has(x-1,y))edges.push([[x,y+1],[x,y]]);
 }return edges;}
function loopsFor(edges){const key=p=>p.join(','),next=new Map(),used=new Set(),loops=[];edges.forEach((e,i)=>{let k=key(e[0]);if(!next.has(k))next.set(k,[]);next.get(k).push(i);});for(let i=0;i<edges.length;i++){if(used.has(i))continue;const points=[];let j=i;while(j!==undefined&&!used.has(j)){used.add(j);points.push(edges[j][0]);let options=(next.get(key(edges[j][1]))??[]).filter(k=>!used.has(k));if(options.length>1){const d=edges[j][1].map((v,k)=>v-edges[j][0][k]);options.sort((a,b)=>{const turn=k=>{const e=edges[k][1].map((v,i)=>v-edges[k][0][i]);return Math.atan2(d[0]*e[1]-d[1]*e[0],d[0]*e[0]+d[1]*e[1]);};return turn(b)-turn(a);});}j=options[0];}if(points.length>3)loops.push(points);}return loops;}
function simplify(points,tolerance=1.2){if(points.length<=2)return points;const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;let max=0,index=0;for(let i=1;i<points.length-1;i++){const p=points[i],t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0,d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;if(d>max){max=d;index=i;}}return max>tolerance*tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b];}
function halfContours(loops,axis){const result=[];for(const loop of loops){const right=loop.map((p,i)=>(p[0]+loop[(i+1)%loop.length][0])/2>axis);if(right.every(Boolean)){const k=Math.floor(loop.length/2),points=[...simplify(loop.slice(0,k+1)).slice(0,-1),...simplify([...loop.slice(k),loop[0]]).slice(0,-1)];result.push({points,closed:true});continue;}for(let i=0;i<loop.length;i++)if(right[i]&&!right[(i-1+loop.length)%loop.length]){let points=[loop[i]],j=i;do{points.push(loop[(j+1)%loop.length]);j=(j+1)%loop.length;}while(right[j]&&j!==i);result.push({points:simplify(points),closed:false});}}return result;}
const profiles={},evidence=[];
for(const[id,config]of Object.entries(GLB_SHIP_CONFIG)){
 const path=config.path??`assets/models/ships/${config.file}`,bytes=await readFile(path),root=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));root.rotation.y=config.yaw;root.updateMatrixWorld(true);
 const tris=[],glass=[];root.traverse(o=>{if(!o.isMesh)return;const pos=o.geometry.attributes.position,index=o.geometry.index,mat=Array.isArray(o.material)?o.material:[o.material],groups=o.geometry.groups.length?o.geometry.groups:[{start:0,count:index?.count??pos.count,materialIndex:0}];for(const group of groups){for(let i=group.start;i<group.start+group.count;i+=3){const tr=[0,1,2].map(k=>{const v=new T.Vector3().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(o.matrixWorld);return[v.x,v.z];});tris.push(tr);if(mat[group.materialIndex]?.name.startsWith('VR_Canopy'))glass.push(tr);}}});
 let half=0,z0=Infinity,z1=-Infinity;for(const tr of tris)for(const[x,z]of tr){half=Math.max(half,Math.abs(x));z0=Math.min(z0,z);z1=Math.max(z1,z);}const length=z1-z0,unit=length/192,w=2*Math.ceil(half/unit)+4,h=196,cols=2*Math.ceil(half/(length/42))+2,rows=44;
 const map=([x,z])=>[x/unit+w/2,(z-z0)/unit+2],mask=raster(tris,w,h,map),loops=loopsFor(edgesFor(mask,w,h)),halfPaths=halfContours(loops,w/2);
 const convert=p=>[+((p[0]-w/2)*42/192+cols/2).toFixed(4),+((p[1]-2)*42/192+1).toFixed(4)];
 const contours=halfPaths.filter(c=>c.points.length>2).flatMap(({points,closed})=>{const a=points.map(convert);return [{points:a,closed},{points:a.map(([x,z])=>[+(cols-x).toFixed(4),z]),closed}];});
 const low=raster(tris,cols,rows,([x,z])=>[x/(length/42)+cols/2,(z-z0)/(length/42)+1]),cells=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(low[y*cols+x])cells.push([x,y]);
 const edges=edgesFor(low,cols,rows).map(([a,b])=>[...a,...b]);
 const details=glass.length?halfContours(loopsFor(edgesFor(raster(glass,w,h,map),w,h)),w/2).filter(c=>c.points.length>2&&Math.max(...c.points.map(p=>p[0]))-Math.min(...c.points.map(p=>p[0]))>2&&Math.max(...c.points.map(p=>p[1]))-Math.min(...c.points.map(p=>p[1]))>3).flatMap(({points,closed})=>{const a=points.map(convert);return [{points:a,closed},{points:a.map(([x,z])=>[+(cols-x).toFixed(4),z]),closed}];}):[];
 const all=contours.flatMap(c=>c.points),bounds={minX:Math.min(...all.map(p=>p[0])),maxX:Math.max(...all.map(p=>p[0])),minZ:Math.min(...all.map(p=>p[1])),maxZ:Math.max(...all.map(p=>p[1]))};
 const hints=SCHEMATIC_DETAILS[id];
 for(const path of hints.paths){
  // Clip to the measured footprint. A panel mark must not invent an appendage
  // or bridge the open gap between two separate hull sections.
  let run=[];
  const finish=()=>{if(run.length>1){const a=simplify(run,.12).map(([x,z])=>[+x.toFixed(4),+z.toFixed(4)]);details.push({points:a,closed:false},{points:a.map(([x,z])=>[+(cols-x).toFixed(4),z]),closed:false});}run=[];};
  const mapped=path.map(([x,z])=>[cols/2+x*(bounds.maxX-bounds.minX)/2,bounds.minZ+z*(bounds.maxZ-bounds.minZ)]);
  for(let j=1;j<mapped.length;j++){const a=mapped[j-1],b=mapped[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*192/42);for(let k=0;k<=steps;k++){const t=k/steps,p=a.map((v,i)=>v+(b[i]-v)*t),gx=Math.floor((p[0]-cols/2)*192/42+w/2),gy=Math.floor((p[1]-1)*192/42+2);if(gx>=0&&gx<w&&gy>=0&&gy<h&&mask[gy*w+gx])run.push(p);else finish();}}
  finish();
 }
 profiles[id]={cols,rows,cells,edges,bounds,contours,details,features:hints.features};evidence.push({variant:id,path,sha256:createHash('sha256').update(bytes).digest('hex'),contourVertices:all.length,glassContours:details.length,aspect:(bounds.maxX-bounds.minX)/(bounds.maxZ-bounds.minZ)});console.log(id,'outline',all.length,'canopy',details.length);
}
await writeFile('src/game/shipProfiles.js','// Generated by tools/assets/bake-ship-schematics.mjs from shipping GLBs.\nexport const GLB_TOP_DOWN_PROFILES='+JSON.stringify(profiles)+';\n');
await writeFile('docs/ship-schematics.json',JSON.stringify(evidence,null,2)+'\n');
