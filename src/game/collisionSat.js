// Scalar separating-axis tests shared by the offline bake and runtime.
// Scratch is module-local; calls are synchronous, never nested, and allocate nothing.
let best, nx, ny, nz, hx, hy, hz, ax, ay, az, bx, by, bz, cx, cy, cz;
function triangleAxis(x,y,z) {
    const length=Math.hypot(x,y,z);
    if(length<1e-12)return true;
    const a=ax*x+ay*y+az*z,b=bx*x+by*y+bz*z,c=cx*x+cy*y+cz*z;
    const lo=Math.min(a,b,c),hi=Math.max(a,b,c),r=hx*Math.abs(x)+hy*Math.abs(y)+hz*Math.abs(z);
    if(lo>r+1e-9||hi< -r-1e-9)return false;
    const positive=(hi+r)/length,negative=(r-lo)/length;
    const push=Math.min(positive,negative);
    if(push<best){best=push;const sign=positive<negative?1:-1;nx=sign*x/length;ny=sign*y/length;nz=sign*z/length;}
    return true;
}
export function triangleBoxContact(a0,a1,a2,b0,b1,b2,c0,c1,c2,x,y,z,ex,ey,ez,out) {
    ax=a0-x;ay=a1-y;az=a2-z;bx=b0-x;by=b1-y;bz=b2-z;cx=c0-x;cy=c1-y;cz=c2-z;
    hx=ex;hy=ey;hz=ez;best=Infinity;
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const tx=uy*vz-uz*vy,ty=uz*vx-ux*vz,tz=ux*vy-uy*vx;
    if(tx*tx+ty*ty+tz*tz<1e-22)return false;
    if(!triangleAxis(1,0,0)||!triangleAxis(0,1,0)||!triangleAxis(0,0,1)||!triangleAxis(tx,ty,tz))return false;
    if(!triangleAxis(0,-uz,uy)||!triangleAxis(uz,0,-ux)||!triangleAxis(-uy,ux,0)
       ||!triangleAxis(0,-vz,vy)||!triangleAxis(vz,0,-vx)||!triangleAxis(-vy,vx,0))return false;
    const wx=cx-bx,wy=cy-by,wz=cz-bz;
    if(!triangleAxis(0,-wz,wy)||!triangleAxis(wz,0,-wx)||!triangleAxis(-wy,wx,0))return false;
    if(out){out.x=nx;out.y=ny;out.z=nz;out.push=Math.max(0,best);}
    return true;
}
let dx,dy,dz,ahx,ahy,ahz,bhx,bhy,bhz,r;
function boxAxis(x,y,z) {
    const length=Math.hypot(x,y,z);if(length<1e-10)return true;
    const a=ahx*Math.abs(x)+ahy*Math.abs(y)+ahz*Math.abs(z);
    const b=bhx*Math.abs(x*r[0]+y*r[3]+z*r[6])+bhy*Math.abs(x*r[1]+y*r[4]+z*r[7])+bhz*Math.abs(x*r[2]+y*r[5]+z*r[8]);
    const delta=dx*x+dy*y+dz*z,overlap=(a+b-Math.abs(delta))/length;
    if(overlap< -1e-9)return false;
    if(overlap<best){best=overlap;const sign=delta>=0?-1:1;nx=sign*x/length;ny=sign*y/length;nz=sign*z/length;}
    return true;
}
// B's rotation/centre are expressed in A's frame. Normal points from B to A.
export function boxBoxContact(x,y,z,a,b,m,out) {
    dx=x;dy=y;dz=z;ahx=a[0];ahy=a[1];ahz=a[2];bhx=b[0];bhy=b[1];bhz=b[2];r=m;best=Infinity;
    if(!boxAxis(1,0,0)||!boxAxis(0,1,0)||!boxAxis(0,0,1))return false;
    for(let j=0;j<3;j++){
        const x=m[j],y=m[j+3],z=m[j+6];
        if(!boxAxis(x,y,z)||!boxAxis(0,-z,y)||!boxAxis(z,0,-x)||!boxAxis(-y,x,0))return false;
    }
    if(out){out.x=nx;out.y=ny;out.z=nz;out.push=Math.max(0,best);}
    return true;
}

// Conservative node test used after the A-frame AABB rejection. Check B's
// three face axes as well. Skipping cross axes may retain an empty node pair,
// but can never discard a real contact; exact leaf SAT still checks all 15.
export function boxBoxOverlap(x,y,z,a,b,m){
    for(let j=0;j<3;j++){
        const u=m[j],v=m[j+3],w=m[j+6];
        if(Math.abs(x*u+y*v+z*w)>a[0]*Math.abs(u)+a[1]*Math.abs(v)+a[2]*Math.abs(w)+b[j]+1e-8)return false;
    }
    return true;
}
