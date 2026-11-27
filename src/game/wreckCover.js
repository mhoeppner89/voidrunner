// Fixed-step wreck bodies use the same flight-space cuts as the detailed hull.
import * as T from 'three';
import {SHIP_COLLIDERS} from './shipCollision.js';
import {fractureLeaves} from './shipWreckFx.js';
import {seededRandom} from './random.js';
import {hullVsAsteroid,hullVsBox,hullVsSphere} from './hullCollision.js';

const profiles=new Map();
const axis=new T.Vector3(),delta=new T.Quaternion(),normal=new T.Vector3(),arm=new T.Vector3();
const terrainContact={},inverse=new T.Quaternion();
let terrainScratch=new Float32Array(0);
const SPIN=Math.PI/30, DRIFT=4, LIMIT=10, BUMP_SPEED=150;
export const WRECK_IMPACT=Object.freeze({shieldBypass:1});

export function fractureBounds(variant,scale){
    const p=SHIP_COLLIDERS[variant];
    if(!p)return undefined;
    return new T.Box3(new T.Vector3(...p.min).multiplyScalar(scale),new T.Vector3(...p.max).multiplyScalar(scale));
}

export function sectionProfiles(variant,collisionVariant,scale){
    const key=collisionVariant+':'+scale;
    if(profiles.has(key))return profiles.get(key);
    const hull=SHIP_COLLIDERS[collisionVariant],bounds=fractureBounds(variant,scale);
    const vertices=[],tris=[],v=hull.meshVerts,idx=hull.meshIndices;
    const n=[0,1,0],uv=[0,0],c=[1,1,1];
    for(let i=0;i<v.length;i+=3)vertices.push({p:[v[i]*scale,v[i+1]*scale,v[i+2]*scale],n,uv,c});
    for(let i=0;i<idx.length;i+=3)tris.push({v:[vertices[idx[i]],vertices[idx[i+1]],vertices[idx[i+2]]],mat:0});
    const job=fractureLeaves(tris,bounds,variant);
    let result;do{result=job.next();}while(!result.done);
    const shapes=result.value.map(({tris,key})=>{
        const box=new T.Box3(),unique=new Map(),coords=[],indices=[];
        for(const face of tris)for(const vertex of face.v){
            let i=unique.get(vertex.p);
            if(i===undefined){i=coords.length/3;unique.set(vertex.p,i);coords.push(...vertex.p);box.expandByPoint(axis.fromArray(vertex.p));}
            indices.push(i);
        }
        const origin=box.getCenter(new T.Vector3()),half=box.getSize(new T.Vector3()).multiplyScalar(.5);
        for(let i=0;i<coords.length;i+=3){coords[i]-=origin.x;coords[i+1]-=origin.y;coords[i+2]-=origin.z;}
        return {key,origin,half:half.toArray(),radius:half.length(),volume:8*half.x*half.y*half.z,
            meshVerts:new Float32Array(coords),meshIndices:new Uint32Array(indices)};
    }).sort((a,b)=>b.volume-a.volume);
    if(profiles.size>=40)profiles.delete(profiles.keys().next().value);
    profiles.set(key,shapes);
    return shapes;
}
function syncBox(body){
    const q=body.rotation,b=body.box,p=body.position;
    body.x=p.x;body.y=p.y;body.z=p.z;
    b.qx=q.x;b.qy=q.y;b.qz=q.z;b.qw=q.w;
}
function retire(session,index){
    session.coverSections[index].retired=true;
    session.coverSections.splice(index,1);
    session.obstacleGridBuiltAt=-Infinity;
}
export function spawnCover(session,ship,variant,scale){
    if(!SHIP_COLLIDERS[variant])return [];
    const shapes=sectionProfiles(variant,ship.collisionVariant??variant,scale);
    const limit=ship.capitalClass==='corvette'?4:ship.capitalClass?6:1;
    const active=session.coverSections??=[],added=[];
    const player=new T.Vector3(...session.save.player.position),q=new T.Quaternion(...ship.rotation);
    const length=fractureBounds(variant,scale).getSize(axis).length(),heft=Math.min(1,(36/length)**1.75);
    const random=seededRandom(ship.id+':wreck-motion');
    for(const shape of shapes){
        if(added.length>=limit||shape.volume<1000)break;
        if(active.length>=LIMIT){
            const i=active.findIndex(b=>b.position.distanceTo(player)>b.radius+100);
            if(i<0)break;
            retire(session,i);
        }
        const position=shape.origin.clone().applyQuaternion(q).add(new T.Vector3(...ship.position));
        const rotation=q.clone(),settle=Math.min(1,Math.max(0,(length-36)/40));
        const blast=shape.origin.clone().normalize().applyQuaternion(q).multiplyScalar(length*(.5+.4*random())*heft*(1-.4*settle));
        const spin=new T.Vector3(random()-.5,random()-.5,random()-.5).normalize().multiplyScalar((.5+random())*heft);
        const body={...shape,id:'wreck-cover-'+ship.id+'-'+shape.key,cover:true,shape:'wreck-mesh',surfaceOnly:true,
            position,prevPosition:position.clone(),rotation,prevRotation:rotation.clone(),velocity:new T.Vector3(...ship.velocity),
            angularVelocity:new T.Vector3(),blast,spin,hold:.16+.5*settle,ramp:1.4*settle,age:0,
            radius:shape.radius,losRadius:shape.radius,collisionRadius:shape.radius,maxReach:shape.radius,
            box:{hx:shape.half[0],hy:shape.half[1],hz:shape.half[2]},contacts:new Map()};
        syncBox(body);active.push(body);added.push(body);
    }
    if(added.length)session.obstacleGridBuiltAt=-Infinity;
    return added;
}

function limitExcess(v,limit,dt){
    const speed=v.length();
    if(speed>limit)v.multiplyScalar(Math.max(limit,speed*Math.exp(-2*dt))/speed);
}

export function bumpCover(body,actor,position,velocity,extents,contact,time){
    normal.set(contact.x,contact.y,contact.z);
    const mass=8*extents[0]*extents[1]*extents[2],share=mass/(mass+body.volume);
    let closing=body.velocity.dot(normal)-velocity.dot(normal);
    position.addScaledVector(normal,contact.push*(1-share));
    body.position.addScaledVector(normal,-contact.push*share);
    syncBox(body);
    if(closing<=0)return;
    // Rams faster than a boosted fighter (a drive leg, a broken solver) push no harder.
    closing=Math.min(closing,BUMP_SPEED);
    const impulse=1.5*closing*share;
    velocity.addScaledVector(normal,1.5*closing*(1-share));
    body.velocity.addScaledVector(normal,-impulse);
    arm.subVectors(position,body.position).cross(normal);
    body.angularVelocity.addScaledVector(arm,-impulse/(body.radius*body.radius));
    if(time<(body.contacts.get(actor.id??'player')??-Infinity))return;
    body.contacts.set(actor.id??'player',time+1);
    // Glancing wreck hits scuff plating without resetting shield recovery.
    return Math.min(5,Math.floor(closing/15));
}

const release=(time,ramp)=>time<=0?0:ramp?1-Math.exp(-time/ramp):1;
let moving;
function bounceTerrain(o){
    const b=moving;
    if(o.cover||b.position.distanceToSquared(o)>(b.radius+(o.maxReach??o.radius))**2)return;
    let hit;
    if(o.meshVerts){
        if(terrainScratch.length<o.meshVerts.length)terrainScratch=new Float32Array(o.meshVerts.length);
        hit=hullVsAsteroid(b.position,b.half,b.rotation,inverse,o,terrainScratch,terrainContact);
    }else if(o.box)hit=hullVsBox(b.position,b.half,inverse,o,terrainContact);
    else hit=hullVsSphere(b.position,b.half,inverse,o.x,o.y,o.z,o.radius,terrainContact);
    if(!hit)return;
    normal.set(terrainContact.x,terrainContact.y,terrainContact.z);
    b.position.addScaledVector(normal,terrainContact.push);
    const inward=-b.velocity.dot(normal);
    if(inward>0)b.velocity.addScaledVector(normal,1.4*inward);
}
export function advanceCover(session,dt,margin){
    const active=session.coverSections;
    if(!active?.length)return;
    for(let i=active.length-1;i>=0;i--){
        const b=active[i],p=b.position;
        b.age+=dt;
        if(!session.arena&&(b.age>=600||p.distanceToSquared(axis.fromArray(session.save.player.position))>3000**2)){
            retire(session,i);continue;
        }
        b.prevPosition.copy(p);b.prevRotation.copy(b.rotation);
        const elapsed=b.age-b.hold;
        if(elapsed>0&&elapsed-dt<Math.max(dt,b.ramp*6)){
            const gain=release(elapsed,b.ramp)-release(elapsed-dt,b.ramp);
            b.velocity.addScaledVector(b.blast,gain);b.angularVelocity.addScaledVector(b.spin,gain);
        }
        if(b.age>1){limitExcess(b.velocity,DRIFT,dt);limitExcess(b.angularVelocity,SPIN,dt);}
        p.addScaledVector(b.velocity,dt);
        const spin=b.angularVelocity.length();
        if(spin)b.rotation.premultiply(delta.setFromAxisAngle(axis.copy(b.angularVelocity).divideScalar(spin),spin*dt));
        if(session.activeInstanceId){
            moving=b;inverse.copy(b.rotation).invert();
            session.forEachHullObstacle(p,b.radius+margin,b.radius,bounceTerrain);
            moving=null;
        }
        syncBox(b);
    }
}
