import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {EntityStore} from '../../src/game/entityStore.js';
import {CAPITAL_HULLS,capitalReadout} from '../../src/game/capitalHulls.js';
import {BARGE,BARGE_SWARM,bargeLockRate,bargeWarheadCount,updateBargeLaunchers} from '../../src/game/bargeLaunchers.js';
import {LAUNCHERS} from '../../src/game/weapons.js';
import {SHIP_COLLIDERS} from '../../src/game/shipCollision.js';
import {TRAFFIC_HULLS} from '../../src/game/corvetteMounts.js';
const CAPITAL_TRAFFIC_CRUISE={barge:TRAFFIC_HULLS.barge.standoffCruise,ironjaw:TRAFFIC_HULLS.ironjaw.standoffCruise};

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
test('crossing fast during the warning breaks the track and the racks reload short',()=>{
    const {s,ship}=stage();pilot(s,1000,[0,0,10]);
    for(let t=0;t<10&&ship.capitalAttack!=='CHARGING';t+=STEP)run(s,ship,STEP);
    assert.equal(ship.capitalAttack,'CHARGING');
    s.save.player.velocity=[0,0,120];run(s,ship,BARGE.warning+.5);
    assert.equal(warheads(s).length,0);assert.notEqual(ship.capitalAttack,'CHARGING');
});
test('speed only slows the lock, four times at 100 and beyond; line-of-sight rate breaks it',()=>{
    const deg=Math.PI/180,near=(a,b)=>Math.abs(a-b)<1e-9;
    assert.ok([[0,1],[50,1],[75,.4],[100,.25],[200,.25]].every(([v,r])=>near(bargeLockRate(v,0),r)));
    assert.ok([[3,1],[4.5,.5],[6,0],[20,0]].every(([w,r])=>near(bargeLockRate(0,w*deg),r)));
    // A fast pilot on a steady line is still locked, only slower.
    const parked=stage();pilot(parked.s,400);run(parked.s,parked.ship,1);
    const fast=stage();pilot(fast.s,400,[90,0,0]);run(fast.s,fast.ship,1);
    assert.ok(fast.ship.combatFit.lock>0);
    assert.ok(Math.abs(fast.ship.combatFit.lock/parked.ship.combatFit.lock-1/(1+3*.8))<.01);
    // Crossing its view fast enough keeps the tracker off, and closer in a
    // slower pass is enough. (A straight pass slows its own line-of-sight
    // rate as it opens the range, so a pilot has to keep turning around it.)
    for(const [range,speed] of [[900,110],[400,50]]){
        const {s,ship}=stage();pilot(s,range,[0,0,speed]);run(s,ship,2);
        assert.equal(ship.combatFit.lock,0,`${speed} across at ${range}`);
    }
});
test('a rush draws one snap canister per approach',()=>{
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
// Bug report: ramming the Barrage flung it out of the fight at more than its
// own cruise speed, and a hull without engines then never slowed down.
function rammed(variant){
    const {s}=stage();s.ships=[];s.damagePlayer=()=>{};s.ui.pushEvent=()=>{};
    for(const key of ['ShipPos','ShipPlayer','RadarPos','RadarPlayer','AudioLocal'])s['tmp'+key]??=new THREE.Vector3();
    const ship=s.spawnCorvette(variant,[0,0,300]);ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
    ship.hostile=true;ship.targetId='player';ship.holdFire=true;
    s.save.player.position=[0,0,250];s.save.player.velocity=[0,0,140];
    let peak=0;
    for(let i=0;i<60*6;i++){
        s.save.world.time+=STEP;const p=s.save.player;p.position=p.position.map((x,k)=>x+p.velocity[k]*STEP);
        s.resolveShipContacts();s.updateShips(STEP);peak=Math.max(peak,Math.hypot(...ship.velocity));
    }
    return {ship,peak};
}
test('a fighter ramming a capital hull nudges it instead of flinging it away',()=>{
    for(const variant of ['barge','ironjaw','drover']){
        const {ship,peak}=rammed(variant);
        assert.ok(peak<=ship.capitalBaseSpeed*1.05,`${variant} peaks at ${peak.toFixed(1)}, cruise ${ship.capitalBaseSpeed}`);
    }
});
test('a hull without engines bleeds off its drift',()=>{
    const {s}=stage();s.ships=[];
    for(const key of ['ShipPos','ShipPlayer','RadarPos','RadarPlayer','AudioLocal'])s['tmp'+key]??=new THREE.Vector3();
    const ship=s.spawnCorvette('drover',[0,0,300]);ship.engineThrust=0;ship.velocity=[0,0,200];
    for(let i=0;i<60*10;i++){s.save.world.time+=STEP;s.updateShips(STEP);}
    assert.ok(Math.hypot(...ship.velocity)<2,'drift has died down');
    assert.ok(ship.position[2]<300+200/0.5+1,'coasts at most speed/decay');
});
test('in range a corvette keeps moving on its broadside orbit, and the barge relocates after a salvo',()=>{
    for(const variant of ['barge','ironjaw']){
        const {s}=stage();s.ships=[];
        for(const key of ['ShipPos','ShipPlayer','RadarPos','RadarPlayer','AudioLocal'])s['tmp'+key]??=new THREE.Vector3();
        const ship=s.spawnCorvette(variant,[0,0,0]);ship.hostile=true;ship.targetId='player';ship.holdFire=false;
        const range=variant==='barge'?900:520;s.save.player.position=[range,0,0];
        let slowest=Infinity,fastest=0,far=0;
        for(let i=0;i<60*40;i++){
            s.save.world.time+=STEP;s.updateShips(STEP);
            if(i<60*15)continue;
            const v=Math.hypot(...ship.velocity);slowest=Math.min(slowest,v);fastest=Math.max(fastest,v);
            far=Math.max(far,Math.abs(Math.hypot(...ship.position.map((x,k)=>x-s.save.player.position[k]))-range));
        }
        const cruise=ship.capitalBaseSpeed*CAPITAL_TRAFFIC_CRUISE[variant];
        assert.ok(slowest>cruise*.6,`${variant} keeps moving (${slowest.toFixed(1)})`);
        assert.ok(far<150,`${variant} holds its stand-off (${far.toFixed(0)})`);
        if(variant==='barge'){
            assert.ok(warheads(s).length>0,'it fired');
            assert.ok(fastest>ship.capitalBaseSpeed*.8,`it relocates after a salvo (${fastest.toFixed(1)})`);
        }
    }
});
