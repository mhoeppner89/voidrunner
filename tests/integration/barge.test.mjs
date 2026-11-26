import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {EntityStore} from '../../src/game/entityStore.js';
import {CAPITAL_HULLS,capitalReadout} from '../../src/game/capitalHulls.js';
import {BARGE,BARGE_SWARM,bargeWarheadCount,updateBargeLaunchers} from '../../src/game/bargeLaunchers.js';
import {LAUNCHERS} from '../../src/game/weapons.js';
import {SHIP_COLLIDERS} from '../../src/game/shipCollision.js';

const STEP=1/60;
function stage(arena=true){
    const s=fixture();s.arena=arena?{}:undefined;s.save.player.dockedAt=undefined;
    s.save.player.velocity=[0,0,0];
    s.tmpAvoidance=new THREE.Vector3();s.hyperdriveInterceptIds=new Set();s.pickupStore=new EntityStore(32);s.pickups=[];s.pickupCounter=0;
    s.audio={play(){},playAtDirection(){},playCockpit(){}};
    s.ui={pushEvent(){},pushSensor(){},isModalOpen:false};s.chatterOpen=()=>false;
    const ship=s.spawnCorvette('barge',[0,0,0]);ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
    ship.hostile=true;ship.targetId='player';ship.holdFire=false;
    s.lineBlocked=()=>false;
    return {s,ship,mounts:CAPITAL_HULLS.barge.mounts};
}
// Place the pilot at a range on the beam, moving with the given velocity.
function pilot(s,distance,velocity=[0,0,0]){s.save.player.position=[distance,0,0];s.save.player.velocity=velocity;}
function run(s,ship,seconds){
    const target=new THREE.Vector3();
    for(let t=0;t<seconds;t+=STEP){
        s.save.world.time+=STEP;
        const p=s.save.player;p.position=p.position.map((x,i)=>x+p.velocity[i]*STEP);
        updateBargeLaunchers(s,ship,STEP,target.fromArray(p.position));
    }
}
const warheads=s=>s.projectiles.filter(p=>p.kind==='missile'&&p.hitWeapon===BARGE_SWARM);
function hit(s,ship,m){
    const p=new THREE.Vector3().fromArray(m.hitCenter).add(new THREE.Vector3(...ship.position));
    ship.shield=0;s.damageShip(ship,m.hull,'environment',p.toArray());
}

test('the Barrage carries six detachable racks, a fire-control dish, a laser and its drive systems',()=>{
    const {ship,mounts}=stage();
    assert.deepEqual(mounts.map(m=>m.kind).sort(),['dish','engine','engine','generator','laser',...Array(6).fill('rack')].sort());
    assert.match(capitalReadout(ship),/ 6\/6$/);
    assert.equal(ship.maxHull,700);assert.equal(ship.maxShield,200);
    assert.ok(SHIP_COLLIDERS.barge.contactRadius>0);
});
test('its warheads fly like stock swarm warheads, so the measured break window holds',()=>{
    for(const key of ['speed','homingSpeed','homingTurn','trackRate','seekerCone','terminalRange','acceleration','volley','damage'])
        assert.equal(BARGE_SWARM[key],LAUNCHERS.swarm[key],key);
    assert.ok(BARGE_SWARM.life*BARGE_SWARM.speed>BARGE.lockRange,'reaches across the lock range');
});
test('a slow, steady pilot draws a CHARGING warning, then a full eight-warhead salvo three seconds later',()=>{
    const {s,ship}=stage();pilot(s,900,[0,0,10]);
    run(s,ship,1);assert.ok(ship.combatFit.lock>0&&ship.combatFit.lock<1,'the lock builds');assert.equal(warheads(s).length,0);
    let warnedAt;
    for(let t=0;t<10&&!warnedAt;t+=STEP){run(s,ship,STEP);if(ship.capitalAttack==='CHARGING')warnedAt=s.save.world.time;}
    assert.ok(warnedAt,'the salvo is announced');assert.equal(warheads(s).length,0);
    run(s,ship,BARGE.warning-.1);assert.equal(warheads(s).length,0,'no launch before the warning ends');
    run(s,ship,.2);assert.equal(warheads(s).length,8);
    assert.equal(new Set(warheads(s).map(p=>p.salvo)).size,2,'two canisters');
    assert.ok(warheads(s).every(p=>p.targetId==='player'&&p.launcherId==='swarm'));
    run(s,ship,BARGE.every-1);assert.equal(warheads(s).length,8,'reloads for fifteen seconds');
});
test('speeding up during the warning breaks the lock and the racks reload short',()=>{
    const {s,ship}=stage();pilot(s,1000,[0,0,10]);
    for(let t=0;t<10&&ship.capitalAttack!=='CHARGING';t+=STEP)run(s,ship,STEP);
    assert.equal(ship.capitalAttack,'CHARGING');
    s.save.player.velocity=[0,0,70];run(s,ship,BARGE.warning+.5);
    assert.equal(warheads(s).length,0);assert.notEqual(ship.capitalAttack,'CHARGING');
});
test('a fast pilot gets no lock, but a rush draws one snap canister per approach',()=>{
    const {s,ship}=stage();pilot(s,1100,[-70,0,0]);
    run(s,ship,8);
    assert.equal(warheads(s).length,4,'one canister inside snap range');
    assert.ok(s.save.player.position[0]<BARGE.snapRange);
    s.save.player.position=[400,0,0];run(s,ship,1);assert.equal(warheads(s).length,4,'not again on the same approach');
    s.save.player.position=[BARGE.snapRearm+50,0,0];s.save.player.velocity=[0,0,0];run(s,ship,STEP);
    s.save.player.velocity=[-70,0,0];run(s,ship,5);assert.equal(warheads(s).length,8,'rearmed after leaving');
});
test('inside the minimum range the racks stay silent',()=>{
    const {s,ship}=stage();pilot(s,BARGE.minRange-20,[0,0,0]);
    run(s,ship,20);assert.equal(warheads(s).length,0);assert.equal(ship.combatFit.lock,0);
});
test('lost racks shrink the salvo and drop their collision; losing the dish halves the lock range',()=>{
    assert.deepEqual([6,5,4,3,2,1,0].map(bargeWarheadCount),[8,7,6,4,3,2,0]);
    const {s,ship,mounts}=stage();
    const racks=mounts.filter(m=>m.kind==='rack');
    hit(s,ship,racks[0]);hit(s,ship,racks[3]);
    assert.match(capitalReadout(ship),/ 4\/6$/);
    assert.equal(ship.missingPods,racks[0].partBit|racks[3].partBit);assert.notEqual(ship.collisionVariant,'barge');
    pilot(s,900,[0,0,10]);
    for(let t=0;t<12&&!warheads(s).length;t+=STEP)run(s,ship,STEP);
    assert.equal(warheads(s).length,6);
    const blind=stage();hit(blind.s,blind.ship,blind.mounts.find(m=>m.kind==='dish'));
    pilot(blind.s,900,[0,0,10]);run(blind.s,blind.ship,20);
    assert.equal(warheads(blind.s).length,0,'beyond the halved range');
    for(const r of racks)ship.capitalMountHull[r.index]=0;
    run(s,ship,STEP);assert.equal(ship.capitalDisarmed,true);
});
