import {SHIP_COLLISION_DATA} from './shipCollisionData.js';
import {segmentMeshHit,prepareMeshQueryIndex} from './meshQueries.js';
import {prepareSurfaceMeshIndex} from './surfaceMeshCandidates.js';
import {triangleBoxContact,boxBoxContact,boxBoxOverlap} from './collisionSat.js';
import {graveyardCollisionMesh} from './worldData.js';
// Small contact tolerance only. Weapon hulls are identical for player/NPC.
export const PLAYER_CONTACT_SCALE=.96;
function decode(text,Type){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Type(bytes.buffer);}
function boxTree(boxes){
    const nodes=[],order=Array.from({length:boxes.length/6},(_,i)=>i*6);
    function build(first,end){
        const n={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity,first,end,leaf:end-first<=4,skip:0};nodes.push(n);
        for(let i=first;i<end;i++){const b=order[i];n.minX=Math.min(n.minX,boxes[b]);n.minY=Math.min(n.minY,boxes[b+1]);n.minZ=Math.min(n.minZ,boxes[b+2]);n.maxX=Math.max(n.maxX,boxes[b+3]);n.maxY=Math.max(n.maxY,boxes[b+4]);n.maxZ=Math.max(n.maxZ,boxes[b+5]);}
        if(!n.leaf){const span=[n.maxX-n.minX,n.maxY-n.minY,n.maxZ-n.minZ],axis=span.indexOf(Math.max(...span));
            const sorted=order.slice(first,end).sort((a,b)=>boxes[a+axis]+boxes[a+axis+3]-boxes[b+axis]-boxes[b+axis+3]);
            for(let i=0;i<sorted.length;i++)order[first+i]=sorted[i];const middle=(first+end)>>1;build(first,middle);build(middle,end);
        }n.skip=nodes.length;
    }build(0,order.length);return {nodes,order:Uint32Array.from(order)};
}
export const SHIP_COLLIDERS=Object.fromEntries(Object.entries(SHIP_COLLISION_DATA).map(([variant,data])=>{
    const meshVerts=decode(data.vertices,Float32Array),meshIndices=decode(data.indices,data.indexBytes===2?Uint16Array:Uint32Array),boxes=decode(data.boxes,Float32Array);
    prepareMeshQueryIndex(meshVerts,meshIndices);
    return [variant,{extent:data.extent,min:data.min,max:data.max,sha256:data.sha256,meshVerts,meshIndices,boxes,...boxTree(boxes),radius:Math.hypot(...data.extent)}];
}));
// Warm data is numeric and shared. No renderer traversal, arrays, clones or
// vectors are allocated by the queries below; scratches never alias live state.
const localStart={x:0,y:0,z:0},localEnd={x:0,y:0,z:0},rotated={x:0,y:0,z:0};
function rotate(x,y,z,qx,qy,qz,qw,out){const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);out.x=x+qw*tx+qy*tz-qz*ty;out.y=y+qw*ty+qz*tx-qx*tz;out.z=z+qw*tz+qx*ty-qy*tx;return out;}
const rayObstacle={x:0,y:0,z:0,losRadius:0,meshVerts:null,meshIndices:null,box:{qx:0,qy:0,qz:0,qw:1}};
export function segmentShipColliderHit(start,end,position,rotation,variant,scale=1,padding=0,stats){
    const p=SHIP_COLLIDERS[variant]??SHIP_COLLIDERS.kestrel;
    rotate(start.x-position[0],start.y-position[1],start.z-position[2],-rotation[0],-rotation[1],-rotation[2],rotation[3],localStart);
    rotate(end.x-position[0],end.y-position[1],end.z-position[2],-rotation[0],-rotation[1],-rotation[2],rotation[3],localEnd);
    localStart.x/=scale;localStart.y/=scale;localStart.z/=scale;localEnd.x/=scale;localEnd.y/=scale;localEnd.z/=scale;
    const pad=padding/scale;
    if(Math.max(localStart.x,localEnd.x)<p.min[0]-pad||Math.min(localStart.x,localEnd.x)>p.max[0]+pad
        ||Math.max(localStart.y,localEnd.y)<p.min[1]-pad||Math.min(localStart.y,localEnd.y)>p.max[1]+pad
        ||Math.max(localStart.z,localEnd.z)<p.min[2]-pad||Math.min(localStart.z,localEnd.z)>p.max[2]+pad)return undefined;
    rayObstacle.meshVerts=p.meshVerts;rayObstacle.meshIndices=p.meshIndices;rayObstacle.losRadius=p.radius+pad;
    let hit=segmentMeshHit(localStart,localEnd,rayObstacle,false,stats);
    if(hit!==undefined||pad<=0)return hit;
    // Four offset rays provide the existing small projectile contact margin.
    // They still hit real triangles: padding never turns an engine gap solid.
    const dx=localEnd.x-localStart.x,dy=localEnd.y-localStart.y,dz=localEnd.z-localStart.z,len=Math.hypot(dx,dy,dz);
    if(len<1e-12)return undefined;
    let ux=-dz,uy=0,uz=dx,ul=Math.hypot(ux,uz);if(ul<1e-12){ux=1;uz=0;ul=1;}
    ux/=ul;uz/=ul;const vx=dy*uz/len,vy=(dz*ux-dx*uz)/len,vz=-dy*ux/len;
    const sx=localStart.x,sy=localStart.y,sz=localStart.z,ex=localEnd.x,ey=localEnd.y,ez=localEnd.z;
    for(let i=0;i<4;i++){const sign=i%2?1:-1,x=sign*pad*(i<2?ux:vx),y=sign*pad*(i<2?uy:vy),z=sign*pad*(i<2?uz:vz);
        localStart.x=sx+x;localStart.y=sy+y;localStart.z=sz+z;localEnd.x=ex+x;localEnd.y=ey+y;localEnd.z=ez+z;
        const t=segmentMeshHit(localStart,localEnd,rayObstacle,false,stats);if(t!==undefined&&(hit===undefined||t<hit))hit=t;
    }return hit;
}
// Review/test query for the same solid boxes used by hard contacts.
export function segmentShipContactHullHit(start,end,position,rotation,variant,scale=1){
    const p=SHIP_COLLIDERS[variant]??SHIP_COLLIDERS.kestrel;
    rotate(start.x-position[0],start.y-position[1],start.z-position[2],-rotation[0],-rotation[1],-rotation[2],rotation[3],localStart);
    rotate(end.x-position[0],end.y-position[1],end.z-position[2],-rotation[0],-rotation[1],-rotation[2],rotation[3],localEnd);
    const sx=localStart.x/scale,sy=localStart.y/scale,sz=localStart.z/scale,dx=(localEnd.x-localStart.x)/scale,dy=(localEnd.y-localStart.y)/scale,dz=(localEnd.z-localStart.z)/scale,b=p.boxes;
    let hit=Infinity;
    function box(loX,loY,loZ,hiX,hiY,hiZ){let near=0,far=Math.min(1,hit);for(let a=0;a<3;a++){const s=a===0?sx:a===1?sy:sz,d=a===0?dx:a===1?dy:dz,lo=a===0?loX:a===1?loY:loZ,hi=a===0?hiX:a===1?hiY:hiZ;
        if(Math.abs(d)<1e-14){if(s<lo||s>hi)return Infinity;}else{const u=(lo-s)/d,v=(hi-s)/d;near=Math.max(near,Math.min(u,v));far=Math.min(far,Math.max(u,v));if(near>far)return Infinity;}}
        return near;
    }
    for(let at=0;at<p.nodes.length;){const n=p.nodes[at];if(!Number.isFinite(box(n.minX,n.minY,n.minZ,n.maxX,n.maxY,n.maxZ))){at=n.skip;continue;}at++;if(!n.leaf)continue;
        for(let i=n.first;i<n.end;i++){const j=p.order[i];hit=Math.min(hit,box(b[j],b[j+1],b[j+2],b[j+3],b[j+4],b[j+5]));}
    }return hit<=1?hit:undefined;
}

const contactScratch={x:0,y:0,z:0,push:0},halfA=new Float64Array(3),halfB=new Float64Array(3),matrix=new Float64Array(9);
const bounds=new Float64Array(6),triangle=new Float64Array(9);
let currentProfile,currentScale,qx,qy,qz,qw,deepest,result,queryStats;
function begin(position,q,variant,scale,out,stats){currentProfile=SHIP_COLLIDERS[variant]??SHIP_COLLIDERS.kestrel;currentScale=scale;qx=q.x;qy=q.y;qz=q.z;qw=q.w;deepest=0;result=out;queryStats=stats;}
function record(){const push=contactScratch.push*currentScale+.015;if(push<=deepest)return;
    rotate(contactScratch.x,contactScratch.y,contactScratch.z,qx,qy,qz,qw,rotated);
    result.x=rotated.x;result.y=rotated.y;result.z=rotated.z;result.push=push;deepest=push;
}
function visits(callback){const p=currentProfile,b=p.boxes;
    for(let at=0;at<p.nodes.length;){const n=p.nodes[at];if(queryStats)queryStats.boundsTests=(queryStats.boundsTests??0)+1;
        if(n.maxX<bounds[0]||n.minX>bounds[3]||n.maxY<bounds[1]||n.minY>bounds[4]||n.maxZ<bounds[2]||n.minZ>bounds[5]){at=n.skip;continue;}at++;if(!n.leaf)continue;
        for(let i=n.first;i<n.end;i++){const j=p.order[i];if(b[j+3]<bounds[0]||b[j]>bounds[3]||b[j+4]<bounds[1]||b[j+1]>bounds[4]||b[j+5]<bounds[2]||b[j+2]>bounds[5])continue;
            if(queryStats)queryStats.partTests=(queryStats.partTests??0)+1;callback(j);
        }
    }
}
function triangleContact(j){const b=currentProfile.boxes;
    const cx=(b[j]+b[j+3])/2,cy=(b[j+1]+b[j+4])/2,cz=(b[j+2]+b[j+5])/2,hx=(b[j+3]-b[j])/2,hy=(b[j+4]-b[j+1])/2,hz=(b[j+5]-b[j+2])/2;
    if(triangleBoxContact(triangle[0],triangle[1],triangle[2],triangle[3],triangle[4],triangle[5],triangle[6],triangle[7],triangle[8],cx,cy,cz,hx,hy,hz,contactScratch)){
        // An individual cell can cross a wall before the ship centre does.
        // Resolve toward the actor's side, not toward that penetrated cell's
        // side, which would pull the whole ship farther into a solid wall.
        let x=contactScratch.x,y=contactScratch.y,z=contactScratch.z;
        if(x*(triangle[0]+triangle[3]+triangle[6])+y*(triangle[1]+triangle[4]+triangle[7])+z*(triangle[2]+triangle[5]+triangle[8])>0){
            x=-x;y=-y;z=-z;contactScratch.x=x;contactScratch.y=y;contactScratch.z=z;
            const hi=Math.max(x*triangle[0]+y*triangle[1]+z*triangle[2],x*triangle[3]+y*triangle[4]+z*triangle[5],x*triangle[6]+y*triangle[7]+z*triangle[8]);
            contactScratch.push=Math.max(0,hi-(cx*x+cy*y+cz*z-hx*Math.abs(x)-hy*Math.abs(y)-hz*Math.abs(z)));
        }record();
    }
}
function queryTriangle(){for(let a=0;a<3;a++){bounds[a]=Math.min(triangle[a],triangle[a+3],triangle[a+6]);bounds[a+3]=Math.max(triangle[a],triangle[a+3],triangle[a+6]);}visits(triangleContact);}
export function shipVsStation(position,q,variant,scale,collider,out,stats){
    if(!collider?.nodes.length)return false;begin(position,q,variant,scale,out,stats);
    const x=position.x-collider.origin[0],y=position.y-collider.origin[1],z=position.z-collider.origin[2],reach=currentProfile.radius*scale;
    const {nodes,stack,vertices,order}=collider;let pending=1;stack[0]=0;
    while(pending){const n=nodes[stack[--pending]],{min,max}=n;
        if(x+reach<min[0]||x-reach>max[0]||y+reach<min[1]||y-reach>max[1]||z+reach<min[2]||z-reach>max[2])continue;
        if(n.left>=0){stack[pending++]=n.left;stack[pending++]=n.right;continue;}
        for(let i=n.first;i<n.last;i++){const t=order[i]*9;for(let k=0;k<9;k+=3){rotate(vertices[t+k]-x,vertices[t+k+1]-y,vertices[t+k+2]-z,-qx,-qy,-qz,qw,rotated);triangle[k]=rotated.x/scale;triangle[k+1]=rotated.y/scale;triangle[k+2]=rotated.z/scale;}queryTriangle();}
    }return deepest>0;
}
let sphereX,sphereY,sphereZ,sphereRadius;
function sphereContact(j){const b=currentProfile.boxes,x=Math.max(b[j],Math.min(b[j+3],sphereX)),y=Math.max(b[j+1],Math.min(b[j+4],sphereY)),z=Math.max(b[j+2],Math.min(b[j+5],sphereZ));
    const dx=x-sphereX,dy=y-sphereY,dz=z-sphereZ,d=Math.hypot(dx,dy,dz);if(d>=sphereRadius)return;
    if(d>1e-12){contactScratch.x=dx/d;contactScratch.y=dy/d;contactScratch.z=dz/d;contactScratch.push=sphereRadius-d;}
    else{let best=Infinity,axis=0,sign=1;for(let a=0;a<3;a++){const c=a===0?sphereX:a===1?sphereY:sphereZ,lo=c-b[j+a],hi=b[j+a+3]-c;if(lo<best){best=lo;axis=a;sign=1;}if(hi<best){best=hi;axis=a;sign=-1;}}
        contactScratch.x=axis===0?sign:0;contactScratch.y=axis===1?sign:0;contactScratch.z=axis===2?sign:0;contactScratch.push=best+sphereRadius;
    }record();
}
export function shipVsSphere(position,q,variant,scale,x,y,z,radius,out,stats){
    begin(position,q,variant,scale,out,stats);rotate(x-position.x,y-position.y,z-position.z,-qx,-qy,-qz,qw,rotated);
    sphereX=rotated.x/scale;sphereY=rotated.y/scale;sphereZ=rotated.z/scale;sphereRadius=radius/scale;
    bounds[0]=sphereX-sphereRadius;bounds[1]=sphereY-sphereRadius;bounds[2]=sphereZ-sphereRadius;bounds[3]=sphereX+sphereRadius;bounds[4]=sphereY+sphereRadius;bounds[5]=sphereZ+sphereRadius;
    visits(sphereContact);return deepest>0;
}
function relativeMatrix(bq){
    rotate(1,0,0,bq.x,bq.y,bq.z,bq.w,rotated);rotate(rotated.x,rotated.y,rotated.z,-qx,-qy,-qz,qw,rotated);matrix[0]=rotated.x;matrix[3]=rotated.y;matrix[6]=rotated.z;
    rotate(0,1,0,bq.x,bq.y,bq.z,bq.w,rotated);rotate(rotated.x,rotated.y,rotated.z,-qx,-qy,-qz,qw,rotated);matrix[1]=rotated.x;matrix[4]=rotated.y;matrix[7]=rotated.z;
    rotate(0,0,1,bq.x,bq.y,bq.z,bq.w,rotated);rotate(rotated.x,rotated.y,rotated.z,-qx,-qy,-qz,qw,rotated);matrix[2]=rotated.x;matrix[5]=rotated.y;matrix[8]=rotated.z;
}
let boxX,boxY,boxZ;
function boxContact(j){const b=currentProfile.boxes;halfA[0]=(b[j+3]-b[j])/2;halfA[1]=(b[j+4]-b[j+1])/2;halfA[2]=(b[j+5]-b[j+2])/2;
    if(boxBoxContact(boxX-(b[j]+b[j+3])/2,boxY-(b[j+1]+b[j+4])/2,boxZ-(b[j+2]+b[j+5])/2,halfA,halfB,matrix,contactScratch))record();
}
function boxBounds(){const ex=Math.abs(matrix[0])*halfB[0]+Math.abs(matrix[1])*halfB[1]+Math.abs(matrix[2])*halfB[2],ey=Math.abs(matrix[3])*halfB[0]+Math.abs(matrix[4])*halfB[1]+Math.abs(matrix[5])*halfB[2],ez=Math.abs(matrix[6])*halfB[0]+Math.abs(matrix[7])*halfB[1]+Math.abs(matrix[8])*halfB[2];
    bounds[0]=boxX-ex;bounds[1]=boxY-ey;bounds[2]=boxZ-ez;bounds[3]=boxX+ex;bounds[4]=boxY+ey;bounds[5]=boxZ+ez;
}
const obstacleQuaternion={x:0,y:0,z:0,w:1};
export function shipVsBox(position,q,variant,scale,obstacle,out,stats){
    begin(position,q,variant,scale,out,stats);const b=obstacle.box;obstacleQuaternion.x=b.qx;obstacleQuaternion.y=b.qy;obstacleQuaternion.z=b.qz;obstacleQuaternion.w=b.qw;relativeMatrix(obstacleQuaternion);
    rotate(obstacle.x-position.x,obstacle.y-position.y,obstacle.z-position.z,-qx,-qy,-qz,qw,rotated);boxX=rotated.x/scale;boxY=rotated.y/scale;boxZ=rotated.z/scale;
    halfB[0]=b.hx/scale;halfB[1]=b.hy/scale;halfB[2]=b.hz/scale;boxBounds();visits(boxContact);return deepest>0;
}
export function shipVsMesh(position,q,variant,scale,obstacle,out,stats){
    begin(position,q,variant,scale,out,stats);const v=obstacle.meshVerts,indices=obstacle.meshIndices;if(!v||!indices)return false;
    const b=obstacle.box;obstacleQuaternion.x=b.qx;obstacleQuaternion.y=b.qy;obstacleQuaternion.z=b.qz;obstacleQuaternion.w=b.qw;relativeMatrix(obstacleQuaternion);
    const tree=prepareSurfaceMeshIndex(v,indices),reach=currentProfile.radius*scale;
    rotate(position.x-obstacle.x,position.y-obstacle.y,position.z-obstacle.z,-b.qx,-b.qy,-b.qz,b.qw,rotated);
    const lx=rotated.x,ly=rotated.y,lz=rotated.z;
    rotate(obstacle.x-position.x,obstacle.y-position.y,obstacle.z-position.z,-qx,-qy,-qz,qw,rotated);
    const ox=rotated.x,oy=rotated.y,oz=rotated.z;
    for(let at=0;at<tree.nodes.length;){const n=tree.nodes[at];if(n.maxX<lx-reach||n.minX>lx+reach||n.maxY<ly-reach||n.minY>ly+reach||n.maxZ<lz-reach||n.minZ>lz+reach){at=n.skip;continue;}at++;if(!n.leaf)continue;
        for(let i=n.first;i<n.end;i++){const t=tree.order[i];for(let k=0;k<3;k++){const j=indices[t+k]*3,x=v[j],y=v[j+1],z=v[j+2];triangle[k*3]=(matrix[0]*x+matrix[1]*y+matrix[2]*z+ox)/scale;triangle[k*3+1]=(matrix[3]*x+matrix[4]*y+matrix[5]*z+oy)/scale;triangle[k*3+2]=(matrix[6]*x+matrix[7]*y+matrix[8]*z+oz)/scale;}queryTriangle();}
    }
    if(!deepest&&!obstacle.surfaceOnly&&obstacle.minReach>0){
        const dx=position.x-obstacle.x,dy=position.y-obstacle.y,dz=position.z-obstacle.z;
        // Only an actual inscribed solid core permits embedded-spawn recovery.
        // Never infer a filled interior for wreck shells, rings or engine bores.
        if(dx*dx+dy*dy+dz*dz<obstacle.minReach*obstacle.minReach)
            return shipVsSphere(position,q,variant,scale,obstacle.x,obstacle.y,obstacle.z,obstacle.minReach,out,stats);
    }return deepest>0;
}
const hollowMeshes=new WeakMap();
export function shipVsObstacle(position,q,variant,scale,obstacle,out,stats){
    if(obstacle.meshVerts)return shipVsMesh(position,q,variant,scale,obstacle,out,stats);
    if(obstacle.shape==='ring'||obstacle.shape==='engine'){
        let mesh=hollowMeshes.get(obstacle);
        if(!mesh){const source=graveyardCollisionMesh({kind:obstacle.shape,scale:obstacle.scale});mesh={...obstacle,meshVerts:source.verts,meshIndices:source.indices,surfaceOnly:true};hollowMeshes.set(obstacle,mesh);}
        return shipVsMesh(position,q,variant,scale,mesh,out,stats);
    }
    if(obstacle.box)return shipVsBox(position,q,variant,scale,obstacle,out,stats);
    return shipVsSphere(position,q,variant,scale,obstacle.x,obstacle.y,obstacle.z,obstacle.collisionRadius??obstacle.radius,out,stats);
}
const pairs=new Uint32Array(1024);
export function shipVsShip(posA,qA,variantA,scaleA,posB,qB,variantB,scaleB,out,stats){
    begin(posA,qA,variantA,scaleA,out,stats);const a=currentProfile,b=SHIP_COLLIDERS[variantB]??SHIP_COLLIDERS.kestrel,ratio=scaleB/scaleA;
    relativeMatrix(qB);rotate(posB.x-posA.x,posB.y-posA.y,posB.z-posA.z,-qx,-qy,-qz,qw,rotated);const ox=rotated.x/scaleA,oy=rotated.y/scaleA,oz=rotated.z/scaleA;
    let pending=2;pairs[0]=0;pairs[1]=0;
    while(pending){const ib=pairs[--pending],ia=pairs[--pending],na=a.nodes[ia],nb=b.nodes[ib];
        const x=(nb.minX+nb.maxX)*ratio/2,y=(nb.minY+nb.maxY)*ratio/2,z=(nb.minZ+nb.maxZ)*ratio/2;
        boxX=matrix[0]*x+matrix[1]*y+matrix[2]*z+ox;boxY=matrix[3]*x+matrix[4]*y+matrix[5]*z+oy;boxZ=matrix[6]*x+matrix[7]*y+matrix[8]*z+oz;
        halfB[0]=(nb.maxX-nb.minX)*ratio/2;halfB[1]=(nb.maxY-nb.minY)*ratio/2;halfB[2]=(nb.maxZ-nb.minZ)*ratio/2;boxBounds();
        if(stats)stats.boundsTests=(stats.boundsTests??0)+1;
        if(na.maxX<bounds[0]||na.minX>bounds[3]||na.maxY<bounds[1]||na.minY>bounds[4]||na.maxZ<bounds[2]||na.minZ>bounds[5])continue;
        halfA[0]=(na.maxX-na.minX)*.5;halfA[1]=(na.maxY-na.minY)*.5;halfA[2]=(na.maxZ-na.minZ)*.5;
        if(!boxBoxOverlap(boxX-(na.minX+na.maxX)*.5,boxY-(na.minY+na.maxY)*.5,boxZ-(na.minZ+na.maxZ)*.5,halfA,halfB,matrix))continue;
        // Keep authored traversal order: the first solid cell supplies the
        // response normal. Prune empty regions without changing that contact.
        if(!na.leaf){pairs[pending++]=ia+1;pairs[pending++]=ib;pairs[pending++]=a.nodes[ia+1].skip;pairs[pending++]=ib;continue;}
        if(!nb.leaf){pairs[pending++]=ia;pairs[pending++]=ib+1;pairs[pending++]=ia;pairs[pending++]=b.nodes[ib+1].skip;continue;}
        for(let j=nb.first;j<nb.end;j++){const k=b.order[j],v=b.boxes,x=(v[k]+v[k+3])*ratio/2,y=(v[k+1]+v[k+4])*ratio/2,z=(v[k+2]+v[k+5])*ratio/2;
            boxX=matrix[0]*x+matrix[1]*y+matrix[2]*z+ox;boxY=matrix[3]*x+matrix[4]*y+matrix[5]*z+oy;boxZ=matrix[6]*x+matrix[7]*y+matrix[8]*z+oz;
            halfB[0]=(v[k+3]-v[k])*ratio/2;halfB[1]=(v[k+4]-v[k+1])*ratio/2;halfB[2]=(v[k+5]-v[k+2])*ratio/2;
            boxBounds();
            for(let i=na.first;i<na.end;i++){
                const part=a.order[i],cells=a.boxes;
                if(cells[part+3]<bounds[0]-1e-9||cells[part]>bounds[3]+1e-9||cells[part+4]<bounds[1]-1e-9||cells[part+1]>bounds[4]+1e-9||cells[part+5]<bounds[2]-1e-9||cells[part+2]>bounds[5]+1e-9)continue;
                if(stats)stats.partTests=(stats.partTests??0)+1;boxContact(part);
                if(deepest>0){
                    // One real solid contact is sufficient to detect a pair.
                    // Deep spawn/ram overlaps need a whole-body exit, otherwise
                    // thousands of internal cell pairs add work but barely push.
                    const ar=a.nodes[0],br=b.nodes[0];
                    const acx=(ar.minX+ar.maxX)/2,acy=(ar.minY+ar.maxY)/2,acz=(ar.minZ+ar.maxZ)/2;
                    const bx=(br.minX+br.maxX)*ratio/2,by=(br.minY+br.maxY)*ratio/2,bz=(br.minZ+br.maxZ)*ratio/2;
                    const rx=matrix[0]*bx+matrix[1]*by+matrix[2]*bz+ox-acx,ry=matrix[3]*bx+matrix[4]*by+matrix[5]*bz+oy-acy,rz=matrix[6]*bx+matrix[7]*by+matrix[8]*bz+oz-acz;
                    halfA[0]=(ar.maxX-ar.minX)/2;halfA[1]=(ar.maxY-ar.minY)/2;halfA[2]=(ar.maxZ-ar.minZ)/2;
                    if((rx/halfA[0])**2+(ry/halfA[1])**2+(rz/halfA[2])**2<.36){
                        halfB[0]=(br.maxX-br.minX)*ratio/2;halfB[1]=(br.maxY-br.minY)*ratio/2;halfB[2]=(br.maxZ-br.minZ)*ratio/2;
                        if(boxBoxContact(rx,ry,rz,halfA,halfB,matrix,contactScratch))record();
                    }
                    return true;
                }
            }
        }
    }return deepest>0;
}
