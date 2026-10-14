import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stationModel} from './helpers/station-model.mjs';
import {buildStationCollider,hullVsStation} from '../src/game/stationCollision.js';
import {GameSession} from '../src/game/game.js';
import {LOCATIONS} from '../src/game/data.js';
import {STATION_DOCKS} from '../src/game/stationDocks.js';
import {playerBerths} from '../src/game/playerDocking.js';
import {fittedPlayerBerths} from '../src/game/shipLanding.js';
import {stationModelOffsetZ,stationSurfaceDistance,stationVisualSurfaceRadius} from '../src/game/stationTraffic.js';

const inverse=new THREE.Quaternion();
function hits(collider,position,hull=[1,1,1],q=inverse){return hullVsStation(new THREE.Vector3(...position),hull,q,collider,{});}

test('concave station hulls leave a hangar mouth open and stop contact at its actual walls',()=>{
    const station=new THREE.Group();
    function box(x,y,z,w,h,d){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));mesh.position.set(x,y,z);station.add(mesh);}
    box(-11,0,0,2,20,40);box(11,0,0,2,20,40);box(0,-11,0,24,2,40);box(0,11,0,24,2,40);box(0,0,21,24,24,2);
    const collider=buildStationCollider(station,[0,0,0]);
    assert.equal(hits(collider,[0,0,-15]),false,'open mouth is empty');
    assert.equal(hits(collider,[0,0,0]),false,'interior is empty');
    assert.equal(hits(collider,[9.2,0,0]),true,'side jamb is solid');
    assert.equal(hits(collider,[0,9.2,0]),true,'roof is solid');
    assert.equal(hits(collider,[0,0,19.2]),true,'back wall is solid');
    const position=new THREE.Vector3(9.2,0,0),before=position.clone(),contact={};
    assert.ok(hullVsStation(position,[1,1,1],inverse,collider,contact));
    assert.ok(contact.x<-.99);assert.ok(contact.push>.19);assert.deepEqual(position,before,'query never overwrites a live player position');
    position.addScaledVector(new THREE.Vector3(contact.x,contact.y,contact.z),contact.push);assert.equal(hullVsStation(position,[1,1,1],inverse,collider,contact),false);
});

test('surface contacts respect scale, attachment offset, rotated hulls and degenerate faces',()=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(20,20,20));mesh.position.set(100,0,0);mesh.scale.setScalar(2);
    const collider=buildStationCollider(mesh,[40000,-50000,20000]);
    assert.equal(hits(collider,[40120.5,-50000,20000]),true);
    assert.equal(hits(collider,[40122,-50000,20000]),false);
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/4).invert();
    assert.equal(hits(collider,[40122,-50000,20000],[3,1,1],q),true);
    assert.equal(hits(collider,[40122.4,-50000,20000],[3,1,1],q),false);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0,0,0,0],3));
    assert.equal(hits(buildStationCollider(new THREE.Mesh(geo),[0,0,0]),[0,0,0]),false);
});

for(const id of Object.keys(STATION_DOCKS))test(`${id}: every authored landing and departure route remains accessible`,()=>{
    const location=LOCATIONS[id],collider=buildStationCollider(stationModel(id),location.position);
    assert.ok(collider.order.length>1000);assert.ok(collider.nodes.length>10);
    // Actual shipping hull surfaces remain solid outside cleared approaches.
    const face=new THREE.Triangle();
    for(let i=0;i<collider.vertices.length;i+=9) {
        face.a.fromArray(collider.vertices,i);face.b.fromArray(collider.vertices,i+3);face.c.fromArray(collider.vertices,i+6);
        if(face.getArea()<1e-4)continue;
        const center=face.getMidpoint(new THREE.Vector3()).add(new THREE.Vector3(...location.position));
        assert.ok(hullVsStation(center,[.5,.5,.5],inverse,collider,{}),'visible hull face is physical');
        break;
    }
    for(const berth of fittedPlayerBerths(id,'kestrel',collider)) {
        assert.ok(Math.abs(berth.gate[1]-berth.pad[1])<1e-8,'approach keeps the authored deck height');
        const session=Object.create(GameSession.prototype);
        Object.assign(session,{save:{player:{position:[...berth.gate],velocity:[0,0,0],rotation:[0,0,0,1],shipId:'wayfarer',systemId:location.systemId,currentTargetId:id,transponder:true}},
            activeInstanceId:id,currentDockLocationIds:()=>[id],playerHullExtents:()=>[12,6,22],tmpCollide:new THREE.Vector3(),ui:{pushEvent(){},showToast(){}},
            renderer:{stationColliders:new Map([[id,collider]]),setLandingGuide(){}},collisionMessageCooldown:0,damagePlayer(){throw Error('route damages player');}});
        session.stationLandingBeaconId=id;session.stationLandingBerths=fittedPlayerBerths(id,'kestrel',collider);session.stationLandingBerth=berth;
        const facing=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...berth.pad).sub(new THREE.Vector3(...berth.gate)).normalize());session.save.player.rotation=facing.toArray();
        for(let i=0;i<=60;i++) {
            const t=i/60,position=new THREE.Vector3().fromArray(berth.gate).lerp(new THREE.Vector3(...berth.pad),t);
            session.save.player.position=position.toArray();session.updateStationLandingGuidance();
            assert.equal(session.stationLandingBeaconId,id,'guidance exists through final approach');
            const before=position.clone();session.resolvePlayerCollisions(position,new THREE.Vector3());
            assert.ok(position.distanceTo(before)<1e-8,`${berth.label} approach is collision-free at ${t}`);
        }
        assert.equal(session.stationLandingClearanceGranted,true,'clearance is granted at the pad');
        assert.ok(stationSurfaceDistance(id,berth.pad)<200);
        session.clearStationLandingGuidance();session.departureClearance=berth;
        for(let i=0;i<=60;i++) {
            const position=new THREE.Vector3(...berth.pad).lerp(new THREE.Vector3(...berth.gate),i/60),before=position.clone();
            session.resolvePlayerCollisions(position,new THREE.Vector3());assert.ok(position.distanceTo(before)<1e-8,`${berth.label} departure stays clear`);
        }
    }
});

test('Blackglass clearance comes from its attached model; its moon stays solid',()=>{
    const id='blackglass',location=LOCATIONS[id],collider=buildStationCollider(stationModel(id),location.position),berth=playerBerths(id,6)[0];
    assert.ok(Math.hypot(...berth.pad.map((v,i)=>v-location.position[i]))-stationVisualSurfaceRadius(id)>400,'old moon-centered beacon test failed here');
    assert.ok(stationSurfaceDistance(id,berth.pad)<200);
    assert.equal(GameSession.prototype.surfaceDistance.call({},new THREE.Vector3(...berth.pad),{kind:'location',id,position:location.position}),stationSurfaceDistance(id,berth.pad),'target range and landing guidance share the attached model center');
    const s=Object.create(GameSession.prototype);Object.assign(s,{save:{player:{rotation:[0,0,0,1],transponder:true}},activeInstanceId:id,currentDockLocationIds:()=>[id],playerHullExtents:()=>[2,2,2],tmpCollide:new THREE.Vector3(),renderer:{stationColliders:new Map([[id,collider]])},damagePlayer(){},ui:{pushEvent(){}},collisionMessageCooldown:0});
    const p=new THREE.Vector3(...location.position).add(new THREE.Vector3(0,0,location.radius*.82-1)),before=p.clone();
    s.resolvePlayerCollisions(p,new THREE.Vector3());assert.ok(p.distanceTo(before)>1,'host moon still blocks ships');
});
