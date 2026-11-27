import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {session} from '../helpers/session.mjs';
import {SpaceRenderer,npcShipScaleForVariant} from '../../src/game/render.js';
import {advanceCover,spawnCover} from '../../src/game/wreckCover.js';
import {capitalCollisionVariant} from '../../src/game/shipCollision.js';
import {saveGame} from '../../src/game/save.js';

function world(){
    const s=session();
    delete s.activeFieldObstacles;delete s.forEachObstacleInBox;delete s.forEachObstacleAlongSegment;
    s.obstacleCellSize=180;s.obstacleQueryStamp=0;
    return s;
}
function wreck(s,variant='ironjaw',capitalClass='corvette',options={}){
    const actor={id:'source',position:[0,0,-120],rotation:[0,0,0,1],velocity:[0,0,0],capitalClass,...options};
    return spawnCover(s,actor,variant,npcShipScaleForVariant(variant));
}
function surface(body){
    const p=new T.Vector3(),a=new T.Vector3();
    for(let i=0;i<3;i++)p.add(a.fromArray(body.meshVerts,body.meshIndices[i]*3));
    return p.divideScalar(3).applyQuaternion(body.rotation).add(body.position);
}
test('device-independent cover counts follow section size and hull class, including lost pods',()=>{
    for(const [id,kind,count] of [['andromeda',null,1],['talon',null,0],['drover','corvette',4],['barge','corvette',4],['caravan','frigate',6],['concord-cruiser','cruiser',6]]){
        const s=world();s.renderer.qualityMode='low';s.renderer.touchDevice=true;
        assert.equal(wreck(s,id,kind).length,count,id);
    }
    const damaged=wreck(world(),'drover','corvette',{collisionVariant:capitalCollisionVariant('drover',63)});
    const intact=wreck(world(),'drover');
    assert.ok(damaged.length>0&&damaged[0].meshVerts.length!==intact[0].meshVerts.length);
});
test('moving sections block real visibility and absorb gunfire on the clipped mesh',()=>{
    const s=world(),[b]=wreck(s);
    const eye=new T.Vector3(),end=surface(b).multiplyScalar(1.3);
    const hit=s.firstObstacleHitInfo(eye,end);
    assert.ok(hit.obstacle.cover&&s.lineBlocked(eye,end));
    assert.ok(s.launchRailObstacles().includes(b));
    let impacts=0;s.renderer.weaponImpact=actor=>{assert.ok(actor.cover);impacts++;};
    const slot=s.projStore.alloc(),shot={slot,kind:'laser',ownerId:'player',damage:20,life:2};
    s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,end.x,end.y,end.z);
    s.projectiles.push(shot);s.updateProjectiles(1);
    assert.equal(shot.life,0);assert.equal(impacts,1);
    assert.equal(s.coverSections.length,4);
});
test('an off-centre ship contact recoils, scuffs plating once and leaves shield recovery alone',()=>{
    const s=world(),[b]=wreck(s),actor=s.save.player;
    s.coverSections=[b];s.playerShieldDelay=2;s.kickCamera=()=>{};
    const p=surface(b),q=new T.Quaternion(),v=new T.Vector3(),ext=s.playerHullExtents(),original=p.clone();
    // Establish the surface normal for this exact pose, then strike inward.
    const contact={};
    s.resolveCoverContacts(actor,p,v,q,'kestrel',1,ext,contact);
    assert.ok(contact.push>0);
    b.position.copy(b.prevPosition);b.x=b.position.x;b.y=b.position.y;b.z=b.position.z;
    p.copy(original);v.set(contact.x,contact.y,contact.z).multiplyScalar(-120);
    const hull=actor.hull;
    s.resolveCoverContacts(actor,p,v,q,'kestrel',1,ext,contact);
    assert.equal(hull-actor.hull,5);assert.equal(s.playerShieldDelay,2);
    assert.ok(b.velocity.length()>0&&b.angularVelocity.length()>0);
    const after=actor.hull;p.copy(original);v.set(contact.x,contact.y,contact.z).multiplyScalar(-120);
    s.resolveCoverContacts(actor,p,v,q,'kestrel',1,ext,contact);
    assert.equal(actor.hull,after);
    for(let i=0;i<180;i++)advanceCover(s,1/60,400);
    assert.ok(b.velocity.length()<=4.01&&b.angularVelocity.length()<=Math.PI/30+.001);
});
test('career retires sections at 3 km or ten minutes and serializes only career data',()=>{
    const s=world();s.arena=undefined;const bodies=wreck(s);
    let stored;const old=globalThis.window;
    try{
        globalThis.window={localStorage:{setItem:(_,v)=>{stored=v;},getItem:()=>null}};
        assert.ok(saveGame(s.save));assert.doesNotMatch(stored,/wreck-cover-|coverSections|meshVerts/);
    }finally{globalThis.window=old;}
    bodies[0].position.x=3100;bodies[1].age=600;
    advanceCover(s,1/60,400);
    assert.equal(s.coverSections.length,2);
    s.arena={};s.coverSections[0].age=601;s.coverSections[1].position.x=5000;
    advanceCover(s,1/60,400);assert.equal(s.coverSections.length,2);
});
test('ten active sections protect nearby cover and retire the oldest distant body',()=>{
    const s=world(),near=wreck(s,'ironjaw','corvette',{position:[0,0,0]});
    const far=wreck(s,'caravan','frigate',{position:[0,0,-400]});
    assert.equal(s.coverSections.length,10);
    wreck(s,'andromeda',null);
    assert.ok(far[0].retired);assert.ok(near.every(b=>!b.retired));
    assert.equal(s.coverSections.length,10);
});
test('restaging an Arena site removes debris, attached effects and frees their resources',()=>{
    const s=world(),r=Object.create(SpaceRenderer.prototype);
    Object.assign(r,{scene:new T.Scene(),effects:[],shipMeshes:new Map(),qualityMode:'low',systemId:'acheron'});
    s.renderer=r;s.save.player.systemId='acheron';
    const bodies=wreck(s),actor={position:[0,0,-120],velocity:[0,0,0]};
    r.spawnShipWreck(actor,'ironjaw',1,bodies);
    const parent=new T.Group(),sprite=new T.Sprite();let disposed=0;
    parent.add(sprite);r.effects.push({object:sprite,dispose(){disposed++;}});
    const view=r.coverVisuals.get(bodies[0]);view.mesh.geometry.addEventListener('dispose',()=>disposed++);
    s.siteStartPose=()=>({position:new T.Vector3(),forward:new T.Vector3(0,0,-1),entries:[]});
    s.siteFillEntries=()=>[];s.updateActiveInstance=()=>{};
    s.stageArenaSite('acheron-horizon');
    assert.equal(r.effects.length,0);assert.equal(r.coverVisuals.size,0);assert.equal(parent.children.length,0);
    assert.equal(r.scene.children.length,0);assert.equal(s.coverSections.length,0);assert.equal(disposed,2);
    assert.equal(s.lineBlocked(new T.Vector3(),new T.Vector3(0,0,-200)),false);
});
test('NPC collisions use the same light contact and avoid terrain recovery',()=>{
    const s=world(),[b]=wreck(s);
    const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,undefined,{hullId:'wayfarer'});
    const p=surface(b);
    ship.position=p.toArray();ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
    s.coverSections=[b];const start=b.position.clone();
    s.resolveNpcCollisions(ship);
    const direction=new T.Vector3(...ship.position).sub(p).normalize();assert.ok(direction.length()>.9);
    b.position.copy(start);b.x=start.x;b.y=start.y;b.z=start.z;
    ship.position=p.toArray();ship.velocity=direction.multiplyScalar(-150).toArray();ship.shieldDelay=1;
    const hull=ship.hull;s.resolveNpcCollisions(ship);
    assert.equal(hull-ship.hull,5);assert.equal(ship.shieldDelay,1);
    assert.equal(ship.combatBumpAt,undefined);assert.ok(b.angularVelocity.length()>0);
});
test('a section rebounds from a field surface and loses inward speed',()=>{
    const s=world(),[b]=wreck(s);
    s.coverSections=[b];s.activeInstanceId='mourning-line';b.age=5;b.velocity.set(0,0,-15);
    const geometry=new T.PlaneGeometry(100,100),o={x:b.x,y:b.y,z:b.z-b.half[2]*.8,
        radius:72,losRadius:72,surfaceOnly:true,shape:'wreck-mesh',box:{hx:50,hy:50,hz:.01,qx:0,qy:0,qz:0,qw:1},
        meshVerts:geometry.attributes.position.array,meshIndices:geometry.index.array};
    s.forEachHullObstacle=(_p,_m,_r,fn)=>fn(o);
    advanceCover(s,1/60,400);
    assert.ok(b.velocity.z>0&&b.velocity.z<15);
});
test('a drive leg into drifting cover drops to combat speed and never flings the section',()=>{
    const s=world(),[b]=wreck(s),actor=s.save.player;
    s.coverSections=[b];s.kickCamera=()=>{};s.autopilot=true;s.hyperdriveReturnThrottle=.5;
    s.snapToCombatSpeed=Object.getPrototypeOf(s).snapToCombatSpeed;
    const p=surface(b),q=new T.Quaternion(),v=new T.Vector3(),ext=s.playerHullExtents(),contact={};
    s.resolveCoverContacts(actor,p,v,q,'kestrel',1,ext,contact);
    assert.ok(contact.push>0);
    b.position.copy(b.prevPosition);b.velocity.set(0,0,0);
    p.copy(surface(b));v.set(contact.x,contact.y,contact.z).multiplyScalar(-50000);actor.velocity=v.toArray();s.autopilot=true;
    s.resolveCoverContacts(actor,p,v,q,'kestrel',1,ext,contact);
    assert.equal(s.autopilot,false);
    assert.ok(b.velocity.length()<=1.5*150+1,`section speed ${b.velocity.length()}`);
    assert.ok(v.length()<1000,`ship speed ${v.length()}`);
});
test('a section that closes on a slow round during the step still stops it',()=>{
    const s=world(),[b]=wreck(s);
    const hit=surface(b),v=[0,1,2].map(k=>new T.Vector3().fromArray(b.meshVerts,b.meshIndices[k]*3).applyQuaternion(b.rotation));
    const out=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
    if(out.dot(hit.clone().sub(b.position))<0)out.negate();
    // The plate moved 0.5 outward this step, over a round that lies just inside
    // its new pose for the whole step: only the relative sweep sees the crossing.
    b.prevPosition.copy(b.position).addScaledVector(out,-.5);
    const start=hit.clone().addScaledVector(out,-.15),end=hit.clone().addScaledVector(out,-.3);
    const slot=s.projStore.alloc(),round={slot,kind:'laser',ownerId:'player',damage:20,life:2};
    s.projStore.setPosV(slot,start);
    s.projStore.setVelV(slot,end.sub(start).multiplyScalar(60));
    s.projectiles.push(round);s.updateProjectiles(1/60);
    assert.equal(round.life,0);
});
test('the cached roadmap is built against the field alone, never temporary cover',()=>{
    const s=world();wreck(s);
    let seen=0;s.ignoreCover=true;
    s.forEachObstacleAlongSegment(new T.Vector3(),new T.Vector3(0,0,-400),o=>{if(o.cover)seen++;});
    assert.equal(seen,0);s.ignoreCover=false;
    s.forEachObstacleAlongSegment(new T.Vector3(),new T.Vector3(0,0,-400),o=>{if(o.cover)seen++;});
    assert.ok(seen>0);
});
