import * as THREE from 'three';
import {raceHull} from './raceHulls.js';
import {SHIP_COLLIDERS, shipVsShip} from './shipCollision.js';

// Four racers, six pairs. Scratch belongs to this race and never aliases live
// flight vectors. Sweeps use the same detailed hull boxes as normal contacts.
export function createRaceContacts(bodies) {
    return {bodies,positionA:new THREE.Vector3(),positionB:new THREE.Vector3(),
        rotationA:new THREE.Quaternion(),rotationB:new THREE.Quaternion(),
        contact:{},cooldowns:new Float64Array(bodies.length*bodies.length),
        point:[0,0,0],hits:0,playerHits:0};
}
export function raceBody(ship,variant,scale=1,player=false) {
    const profile=SHIP_COLLIDERS[variant]??SHIP_COLLIDERS.kestrel;
    return {ship,variant,scale,player,radius:profile.radius*scale,
        mass:ship.raceHull||ship.raceReturn?raceHull(ship.raceHull??ship.shipId).mass*100:Math.max(1,profile.radius**2*scale**2),root:profile.nodes[0],
        offset:new Float64Array(3),half:new Float64Array(3)};
}
function updateBounds(body){
    const q=body.ship.rotation,[x,y,z,w]=q,n=body.root,s=body.scale;
    const xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
    const a=1-2*(yy+zz),b=2*(xy-wz),c=2*(xz+wy),d=2*(xy+wz),e=1-2*(xx+zz),f=2*(yz-wx),g=2*(xz-wy),h=2*(yz+wx),i=1-2*(xx+yy);
    const cx=(n.minX+n.maxX)*s*.5,cy=(n.minY+n.maxY)*s*.5,cz=(n.minZ+n.maxZ)*s*.5;
    const hx=(n.maxX-n.minX)*s*.5,hy=(n.maxY-n.minY)*s*.5,hz=(n.maxZ-n.minZ)*s*.5;
    body.offset[0]=a*cx+b*cy+c*cz;body.offset[1]=d*cx+e*cy+f*cz;body.offset[2]=g*cx+h*cy+i*cz;
    body.half[0]=Math.abs(a)*hx+Math.abs(b)*hy+Math.abs(c)*hz;
    body.half[1]=Math.abs(d)*hx+Math.abs(e)*hy+Math.abs(f)*hz;
    body.half[2]=Math.abs(g)*hx+Math.abs(h)*hy+Math.abs(i)*hz;
}
function query(state,a,b,t) {
    const ap=a.ship.racePreviousPosition??a.ship.prevPosition??a.ship.position;
    const bp=b.ship.racePreviousPosition??b.ship.prevPosition??b.ship.position;
    const ae=a.ship.position,be=b.ship.position;
    state.positionA.set(ap[0]+(ae[0]-ap[0])*t,ap[1]+(ae[1]-ap[1])*t,ap[2]+(ae[2]-ap[2])*t);
    state.positionB.set(bp[0]+(be[0]-bp[0])*t,bp[1]+(be[1]-bp[1])*t,bp[2]+(be[2]-bp[2])*t);
    if(Math.abs(state.positionA.x+a.offset[0]-state.positionB.x-b.offset[0])>a.half[0]+b.half[0]||
       Math.abs(state.positionA.y+a.offset[1]-state.positionB.y-b.offset[1])>a.half[1]+b.half[1]||
       Math.abs(state.positionA.z+a.offset[2]-state.positionB.z-b.offset[2])>a.half[2]+b.half[2])return false;
    return shipVsShip(state.positionA,state.rotationA,a.variant,a.scale,state.positionB,state.rotationB,b.variant,b.scale,state.contact);
}
export function resolveRaceContacts(state,dt,now,onImpact) {
    if(!(dt>0))return 0;
    let hits=0;
    const bodies=state.bodies;
    for(const body of bodies)updateBounds(body);
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
        const a=bodies[i],b=bodies[j],as=a.ship,bs=b.ship;
        if(as.hull<=0||bs.hull<=0||as.raceFinished||bs.raceFinished)continue;
        const ap=as.racePreviousPosition??as.prevPosition??as.position,bp=bs.racePreviousPosition??bs.prevPosition??bs.position;
        const ae=as.position,be=bs.position,av=as.velocity,bv=bs.velocity;
        const dx=ae[0]-be[0],dy=ae[1]-be[1],dz=ae[2]-be[2];
        const tx=(ae[0]-ap[0])-(be[0]-bp[0]),ty=(ae[1]-ap[1])-(be[1]-bp[1]),tz=(ae[2]-ap[2])-(be[2]-bp[2]);
        const travel=Math.hypot(tx,ty,tz),reach=a.radius+b.radius+travel;
        if(dx*dx+dy*dy+dz*dz>reach*reach)continue;
        state.rotationA.fromArray(as.rotation);state.rotationB.fromArray(bs.rotation);
        // At 60 Hz even opposite boosted racers move only a few metres per
        // step. Bound work for malformed input without enlarging thin wings.
        const samples=Math.min(32,Math.max(1,Math.ceil(travel/.65)));
        let t=0,hit=false;
        for(let sample=0;sample<=samples;sample++)if(query(state,a,b,sample/samples)){
            t=sample/samples;hit=true;
            if(sample>0){let low=(sample-1)/samples,high=t;for(let refine=0;refine<9;refine++){const middle=(low+high)*.5;if(query(state,a,b,middle))high=middle;else low=middle;}t=high;query(state,a,b,t);}
            break;
        }
        if(!hit)continue;
        const c=state.contact;if(!Number.isFinite(c.push)||c.push<=0)continue;
        const nx=c.x,ny=c.y,nz=c.z,shareA=b.mass/(a.mass+b.mass),shareB=1-shareA;
        const cx=state.positionA.x-state.positionB.x,cy=state.positionA.y-state.positionB.y,cz=state.positionA.z-state.positionB.z,centerLength=Math.hypot(cx,cy,cz);
        // Voxel cells can report a thin wing's vertical exit even during a
        // nose-to-nose sweep. Use the line of centres for momentum transfer;
        // retain the detailed surface normal for penetration correction.
        const ix=centerLength>1e-6?cx/centerLength:nx,iy=centerLength>1e-6?cy/centerLength:ny,iz=centerLength>1e-6?cz/centerLength:nz;
        const closing=Math.max(0,-((av[0]-bv[0])*ix+(av[1]-bv[1])*iy+(av[2]-bv[2])*iz));
        const impulse=closing*1.12;
        for(let axis=0;axis<3;axis++){
            const n=axis===0?nx:axis===1?ny:nz;
            ae[axis]=ap[axis]+(ae[axis]-ap[axis])*t+n*(c.push+.025)*shareA;
            be[axis]=bp[axis]+(be[axis]-bp[axis])*t-n*(c.push+.025)*shareB;
            const pushAxis=axis===0?ix:axis===1?iy:iz;
            av[axis]+=pushAxis*impulse*shareA;bv[axis]-=pushAxis*impulse*shareB;
            ae[axis]+=av[axis]*dt*(1-t);be[axis]+=bv[axis]*dt*(1-t);
        }
        // Resolve compound hulls fully, including overlapping wing boxes.
        for(let pass=0;pass<5;pass++){
            if(!query(state,a,b,1))break;
            for(let k=0;k<3;k++){const n=k===0?c.x:k===1?c.y:c.z;ae[k]+=n*(c.push+.025)*shareA;be[k]-=n*(c.push+.025)*shareB;}
        }
        as.raceTouchedAt=now;bs.raceTouchedAt=now;
        hits++;state.hits++;if(a.player||b.player)state.playerHits++;
        const key=i*bodies.length+j;
        if(closing>2&&now>=state.cooldowns[key]){
            state.cooldowns[key]=now+.4;
            const sideways=nx*av[2]-nz*av[0],escape=Math.abs(sideways)>1e-4?Math.sign(sideways):(i%2?1:-1);
            as.raceEscapeSign=escape;bs.raceEscapeSign=-escape;
            as.raceRecoverUntil=now+1.1;bs.raceRecoverUntil=now+1.1;
            const stagger=Math.min(.5,.08+closing*.009);
            as.raceContactUntil=Math.max(as.raceContactUntil??0,now+stagger);
            bs.raceContactUntil=Math.max(bs.raceContactUntil??0,now+stagger);
            const damage=Math.min(35,Math.max(0,closing-6)**2*.008);
            for(let side=0;side<2;side++){
                const body=side===0?a:b;
                const drive=body.player?state.playerDrive:body.ship.raceDrive;
                if(drive&&!body.ship.raceHull&&!body.ship.raceReturn)drive.charge=Math.max(0,drive.charge-Math.min(.9,closing*.012));
            }
            for(let k=0;k<3;k++)state.point[k]=(ae[k]+be[k])*.5;
            onImpact?.(a,b,damage,closing,state.point);
        }
    }
    return hits;
}
