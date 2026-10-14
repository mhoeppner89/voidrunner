// Bake exact spatially ordered weapon surfaces + merged voxel boxes for contacts.
// No textures, renderer meshes, voxelisation or BVH construction occurs in flight.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../vendor/three.module.min.js';
import {GLB_SHIP_CONFIG} from '../src/game/render.js';
import {buildGlbScene} from '../src/game/glbLoader.js';
import {prepareSurfaceMeshIndex} from '../src/game/surfaceMeshCandidates.js';
import {triangleBoxContact} from '../src/game/collisionSat.js';
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const packed={},report=[];
const encode=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
for(const [variant,config] of Object.entries(GLB_SHIP_CONFIG)){
 const path=config.path??`assets/models/ships/${config.file}`,bytes=await readFile(path);
 const root=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 root.rotation.y=config.yaw;root.scale.setScalar(config.scale*(config.baseScale??1));root.updateMatrixWorld(true);
 const vertices=[],indices=[],unique=new Map(),point=new T.Vector3();
 root.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count??p.count;
  for(let i=0;i<count;i++){point.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
   const key=point.toArray().map(n=>Math.round(n*1e7)).join(',');let v=unique.get(key);
   if(v===undefined){v=vertices.length/3;unique.set(key,v);vertices.push(point.x,point.y,point.z);}indices.push(v);
  }
 });
 const verts=new Float32Array(vertices),original=new Uint32Array(indices),tree=prepareSurfaceMeshIndex(verts,original);
 const ordered=new Uint32Array(original.length);for(let i=0;i<tree.order.length;i++)ordered.set(original.subarray(tree.order[i],tree.order[i]+3),i*3);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<verts.length;i++){const a=i%3;min[a]=Math.min(min[a],verts[i]);max[a]=Math.max(max[a],verts[i]);}
 const preciseBounds=new T.Box3().setFromObject(root);
 const extent=['x','y','z'].map(a=>Math.max(Math.abs(preciseBounds.min[a]),Math.abs(preciseBounds.max[a]))),span=max.map((n,i)=>n-min[i]);
 const longest=Math.max(...span),grid=span.map(n=>Math.max(48,Math.ceil(n/longest*128))),step=span.map((n,i)=>n/grid[i]);
 const [w,h,d]=grid,mask=new Uint8Array(w*h*d),at=(x,y,z)=>(z*h+y)*w+x;
 for(let i=0;i<ordered.length;i+=3){
  const a=ordered[i]*3,b=ordered[i+1]*3,c=ordered[i+2]*3;
  const lo=[0,1,2].map(k=>Math.max(0,Math.floor((Math.min(verts[a+k],verts[b+k],verts[c+k])-min[k])/step[k])));
  const hi=[0,1,2].map(k=>Math.min(grid[k]-1,Math.floor((Math.max(verts[a+k],verts[b+k],verts[c+k])-min[k])/step[k])));
  for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
   const id=at(x,y,z);if(mask[id])continue;
   if(triangleBoxContact(...verts.subarray(a,a+3),...verts.subarray(b,b+3),...verts.subarray(c,c+3),min[0]+(x+.5)*step[0],min[1]+(y+.5)*step[1],min[2]+(z+.5)*step[2],step[0]/2,step[1]/2,step[2]/2))mask[id]=1;
  }
 }
 // Flood only exterior empty cells. Closed hull interiors become solid; open
 // bores and hangars stay empty. Cells occupied by surfaces remain conservative.
 const queue=new Uint32Array(mask.length);let first=0,last=0;
 function seed(x,y,z){const id=at(x,y,z);if(!mask[id]){mask[id]=2;queue[last++]=id;}}
 for(let z=0;z<d;z++)for(let y=0;y<h;y++){seed(0,y,z);seed(w-1,y,z);}
 for(let z=0;z<d;z++)for(let x=0;x<w;x++){seed(x,0,z);seed(x,h-1,z);}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){seed(x,y,0);seed(x,y,d-1);}
 while(first<last){const id=queue[first++],x=id%w,y=Math.floor(id/w)%h,z=Math.floor(id/(w*h));
  if(x>0)seed(x-1,y,z);if(x+1<w)seed(x+1,y,z);if(y>0)seed(x,y-1,z);if(y+1<h)seed(x,y+1,z);if(z>0)seed(x,y,z-1);if(z+1<d)seed(x,y,z+1);
 }
 for(let i=0;i<mask.length;i++)mask[i]=mask[i]===2?0:1;
 const boxes=[];
 for(let z=0;z<d;z++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!mask[at(x,y,z)])continue;
  let ex=x+1;while(ex<w&&mask[at(ex,y,z)])ex++;
  let ey=y+1,ez=z+1;
  outerY:while(ey<h){for(let xx=x;xx<ex;xx++)if(!mask[at(xx,ey,z)])break outerY;ey++;}
  outerZ:while(ez<d){for(let yy=y;yy<ey;yy++)for(let xx=x;xx<ex;xx++)if(!mask[at(xx,yy,ez)])break outerZ;ez++;}
  boxes.push(min[0]+x*step[0],min[1]+y*step[1],min[2]+z*step[2],min[0]+ex*step[0],min[1]+ey*step[1],min[2]+ez*step[2]);
  for(let zz=z;zz<ez;zz++)for(let yy=y;yy<ey;yy++)for(let xx=x;xx<ex;xx++)mask[at(xx,yy,zz)]=0;
 }
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const IndexType=verts.length/3<=65535?Uint16Array:Uint32Array;
 packed[variant]={min,max,extent,grid,sha256,indexBytes:IndexType.BYTES_PER_ELEMENT,vertices:encode(verts),indices:encode(new IndexType(ordered)),boxes:encode(new Float32Array(boxes))};
 report.push({variant,path,sha256,triangles:ordered.length/3,vertices:verts.length/3,boxes:boxes.length/6,grid,extent});
 console.log(variant,report.at(-1).boxes+' boxes',report.at(-1).vertices+' vertices');
 root.traverse(o=>{o.geometry?.dispose();if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});
}
await writeFile('src/game/shipCollisionData.js','// Generated by scripts/bake-ship-colliders.mjs from current shipping GLBs.\nexport const SHIP_COLLISION_DATA='+JSON.stringify(packed)+';\n');
await mkdir('docs/ship-collision',{recursive:true});await writeFile('docs/ship-collision/bake.json',JSON.stringify(report,null,2)+'\n');
