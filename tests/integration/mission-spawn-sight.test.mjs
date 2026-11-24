import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';

// A rock sits between the pilot at the origin and a spawn 600 km ahead.
function blocked(){
    const s=session();
    s.save.player.position=[0,0,0];
    s.obstacles=[{id:'rock',shape:'asteroid',x:0,y:0,z:-300,radius:80,collisionRadius:80,losRadius:80}];
    return s;
}

test('a mission hostile hidden behind rock moves to the nearest visible bearing at the same range',()=>{
    const s=blocked(),eye=new THREE.Vector3(),start=new THREE.Vector3(0,0,-600);
    assert.ok(s.lineBlocked(eye,start),'fixture: the rock hides the authored point');
    const point=s.visibleSpawnPosition(start.clone());
    assert.ok(!s.lineBlocked(eye,point),'the pilot can see the new point');
    assert.ok(s.entryPositionClear(point,s.activeFieldObstacles(),22),'and it is clear of the rock');
    assert.ok(Math.abs(point.length()-600)<1e-6,'range is kept when a nearby bearing works');
    assert.ok(point.angleTo(start)<=31*Math.PI/180,'the nearest working bearing wins');
});

test('visible, clear or obstacle-free spawns keep their authored point',()=>{
    const s=blocked(),visible=new THREE.Vector3(400,0,-450);
    assert.deepEqual(s.visibleSpawnPosition(visible.clone()).toArray(),visible.toArray());
    s.obstacles=[];
    const behind=new THREE.Vector3(0,0,-600);
    assert.deepEqual(s.visibleSpawnPosition(behind.clone()).toArray(),behind.toArray());
});

test('a bearing limit keeps formations near their anchor and falls back when nothing fits',()=>{
    const s=blocked();
    s.obstacles=[{id:'wall',shape:'asteroid',x:0,y:0,z:-300,radius:290,collisionRadius:290,losRadius:290}];
    const start=new THREE.Vector3(0,0,-600),point=s.visibleSpawnPosition(start.clone(),{maxAngle:15});
    assert.deepEqual(point.toArray(),start.toArray(),'no visible spot within 15°: the authored point stays');
});
