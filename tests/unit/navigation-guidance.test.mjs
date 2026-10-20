import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LOCATIONS} from '../../src/game/data.js';
import {asteroidCollisionRadius} from '../../src/game/worldData.js';

test('selected same-system planets keep a rim bearing beyond sensors and follow player heading',()=>{
 const {session:r,save}=tutorialFixture('earn-standing'),p=save.player,range=r.playerStats().radarRange;
 p.dockedAt=undefined;p.position=[LOCATIONS.vesper.position[0]+range*20,LOCATIONS.vesper.position[1],LOCATIONS.vesper.position[2]];p.rotation=[0,0,0,1];p.currentTargetId='vesper';
 let c=r.radarContacts().find(c=>c.id==='vesper');assert.ok(c?.selected);assert.equal(c.x,-1);assert.equal(c.y,0);
 p.rotation=[0,Math.SQRT1_2,0,Math.SQRT1_2];c=r.radarContacts().find(c=>c.id==='vesper');assert.ok(Math.abs(c.x)<1e-8);assert.ok(Math.abs(c.y+1)<1e-8);
 p.currentTargetId='helix';assert.ok(!r.radarContacts().some(c=>c.id==='vesper'),'unselected far locations remain outside sensor display');
 p.currentTargetId='meridian-prime';assert.ok(!r.radarContacts().some(c=>c.id==='meridian-prime'),'the selected bearing cannot reveal another system');
});
test('target arrows remain for opaque cockpit points and the extended projection fringe',()=>{
 const {session:r}=tutorialFixture('earn-standing');r.renderer.viewportWidth=1280;r.renderer.viewportHeight=800;r.ui.cockpitPointVisible=(x,y)=>y<500;
 assert.equal(r.targetEdge({visible:true,behind:false,x:640,y:300}),undefined);
 for(const p of [{x:640,y:650},{x:1281,y:300},{x:-1,y:300},{x:640,y:801}]){const edge=r.targetEdge({...p,visible:true,behind:false});assert.ok(edge&&Object.values(edge).every(Number.isFinite));}
 assert.ok(r.targetEdge({visible:true,behind:true,x:660,y:300}));
});
for(const phase of ['outbound','mining','returning'])test(`selecting Vesper while the miner is ${phase} preserves its deposit and delivers ore`,()=>{
 const {session:r,save}=tutorialFixture('earn-standing'),p=save.player,n=r.asteroids.find(n=>n.remaining>10&&!n.tunnelPart);
 p.dockedAt=undefined;p.position=[n.position[0],n.position[1],n.position[2]+asteroidCollisionRadius(n)+40];p.velocity.fill(0);p.throttle=0;p.currentTargetId=n.id;r.activeInstanceId='shardbelt';n.scanned=true;r.initializeMiningDrones();assert.ok(r.toggleMiningDrones().ok);
 const step=()=>{save.world.time+=1/60;r.updateMiningDrones(1/60);};
 for(let i=0;i<2400&&!Object.values(p.droneFleet.unitsById).some(u=>u.state===phase);i++)step();
 assert.ok(Object.values(p.droneFleet.unitsById).some(u=>u.state===phase));const key=p.droneFleet.controller.targetNodeKey;
 r.selectTarget('location','vesper','map');for(let i=0;i<1200&&(p.cargo.ore??0)<2;i++)step();
 assert.equal(p.currentTargetId,'vesper');assert.equal(p.navTargetId,'vesper');assert.equal(p.droneFleet.controller.targetNodeKey,key);assert.ok(p.cargo.ore>=2);assert.equal(r.miningDroneContext.node,n);assert.ok(p.position.every(Number.isFinite));
});
