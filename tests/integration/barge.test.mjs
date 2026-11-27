import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {flakPanel} from '../helpers/flak-flight.mjs';
import {seededRandom} from '../../src/game/random.js';
import {fixture} from '../helpers/session.mjs';
import {EntityStore} from '../../src/game/entityStore.js';
import {CAPITAL_HULLS,capitalReadout} from '../../src/game/capitalHulls.js';
import {BARGE,FLAK,bargeLockRate,updateBargeLaunchers} from '../../src/game/bargeLaunchers.js';
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
const warheads=s=>s.projectiles.filter(p=>p.kind==='missile'&&p.hitWeapon===FLAK);
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
test('a slow, steady pilot draws a CHARGING warning, then a six-rocket ripple three seconds later',()=>{
    const {s,ship}=stage();pilot(s,900,[0,0,10]);
    run(s,ship,1);assert.ok(ship.combatFit.lock>0&&ship.combatFit.lock<1,'the lock builds');assert.equal(warheads(s).length,0);
    let warnedAt;
    for(let t=0;t<10&&!warnedAt;t+=STEP){run(s,ship,STEP);if(ship.capitalAttack==='CHARGING')warnedAt=s.save.world.time;}
    assert.ok(warnedAt,'the salvo is announced');assert.equal(warheads(s).length,0);
    run(s,ship,BARGE.warning-.1);assert.equal(warheads(s).length,0,'no launch before the warning ends');
    run(s,ship,.2);assert.equal(warheads(s).length,1);
    const launches=[s.save.world.time];
    while(warheads(s).length<6&&s.save.world.time-launches[0]<1){
        run(s,ship,STEP);
        if(warheads(s).length>launches.length)launches.push(s.save.world.time);
    }
    assert.equal(launches.length,6);
    for(let i=2;i<6;i++)assert.ok(Math.abs(launches[i]-launches[i-1]-.15)<1e-7);
    assert.equal(new Set(warheads(s).map(p=>s.projStore.pos.slice(p.slot*3,p.slot*3+3).join())).size,6);
    assert.equal(FLAK.speed,LAUNCHERS.torpedo.speed);
    assert.equal(new Set(warheads(s).map(p=>p.salvo)).size,1,'one salvo');
    assert.ok(warheads(s).every(p=>p.targetId==='player'&&p.launcherId==='flak'));
    run(s,ship,BARGE.every-1);assert.equal(warheads(s).length,6,'reloads for fifteen seconds');
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
test('a rush draws one snap volley per approach',()=>{
    const {s,ship}=stage();pilot(s,1100,[-70,0,0]);
    run(s,ship,8);
    assert.equal(warheads(s).length,3,'three rockets inside snap range');
    assert.ok(s.save.player.position[0]<BARGE.snapRange);
    s.save.player.position=[400,0,0];run(s,ship,1);assert.equal(warheads(s).length,3,'not again on the same approach');
    s.save.player.position=[BARGE.snapRearm+50,0,0];s.save.player.velocity=[0,0,0];run(s,ship,STEP);
    s.save.player.velocity=[-70,0,0];run(s,ship,5);assert.equal(warheads(s).length,6,'rearmed after leaving');
});
test('inside the minimum range the racks stay silent',()=>{
    const {s,ship}=stage();pilot(s,BARGE.minRange-20,[0,0,0]);
    run(s,ship,20);assert.equal(warheads(s).length,0);assert.equal(ship.combatFit.lock,0);
});
test('lost racks shrink the salvo and drop their collision; losing the dish halves the lock range',()=>{
    const {s,ship,mounts}=stage();
    const racks=mounts.filter(m=>m.kind==='rack');
    hit(s,ship,racks[0]);hit(s,ship,racks[3]);
    assert.match(capitalReadout(ship),/ 4\/6$/);
    assert.equal(ship.missingPods,racks[0].partBit|racks[3].partBit);assert.notEqual(ship.collisionVariant,'barge');
    pilot(s,900,[0,0,10]);
    for(let t=0;t<12&&!warheads(s).length;t+=STEP)run(s,ship,STEP);
    run(s,ship,1);assert.equal(warheads(s).length,4);
    const blind=stage();hit(blind.s,blind.ship,blind.mounts.find(m=>m.kind==='dish'));
    pilot(blind.s,900,[0,0,10]);run(blind.s,blind.ship,20);
    assert.equal(warheads(blind.s).length,0,'beyond the halved range');
    for(const r of racks)ship.capitalMountHull[r.index]=0;
    run(s,ship,24);assert.equal(ship.capitalDisarmed,true);assert.equal(warheads(s).length,4);
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

test('flak scatters inside its cone, samples the whole disk, and jitters each fuze',t=>{
    t.mock.method(Math,'random',seededRandom(415));
    const {s,ship}=stage();pilot(s,900);
    const direction=new THREE.Vector3(),muzzle=new THREE.Vector3(),ray=new THREE.Vector3();
    let smallest=Infinity,largest=0,early=0,late=0;
    for(let salvo=0;salvo<16;salvo++){
        run(s,ship,25);
        for(const shot of s.projectiles.splice(0)){
            s.projStore.getPos(shot.slot,muzzle);s.projStore.getVel(shot.slot,direction);
            ray.fromArray(s.save.player.position).sub(muzzle);
            const angle=ray.angleTo(direction),jitter=shot.life-ray.length()/FLAK.speed;
            assert.ok(angle<=FLAK.spread+1e-6&&Math.abs(jitter)<=FLAK.jitter+1e-6);
            smallest=Math.min(smallest,angle);largest=Math.max(largest,angle);
            early=Math.min(early,jitter);late=Math.max(late,jitter);
        }
    }
    assert.ok(smallest<FLAK.spread*.5&&largest>FLAK.spread*.85);
    assert.ok(early<-.2&&late>.2);
});

test('timed, proximity and terrain bursts respect the earliest hit and damage nearby hostiles once',()=>{
    const {s,ship}=stage(),p=s.save.player,point=new THREE.Vector3(),velocity=new THREE.Vector3(0,0,-90);
    function rocket(life){
        return {slot:s.projStore.alloc(),life,flightTime:life,ownerId:ship.id,faction:ship.faction,targetId:'player',
            threatensPilot:true,wobbleX:0,wobbleY:0,wobbleZ:0,wobblePhase:0};
    }
    s.firstObstacleHitInfo=()=>undefined;
    const blasts=[];s.renderer.spawnFlakBurst=v=>blasts.push(v.toArray());
    p.position=[0,0,-1000];
    let shot=rocket(0);s.advanceFlak(shot,point,velocity,.01);assert.equal(blasts.length,1);
    assert.ok(Math.abs(blasts[0][2]+.9)<1e-7);
    s.firstObstacleHitInfo=()=>({t:.25});shot=rocket(1);s.advanceFlak(shot,point,velocity,STEP);
    assert.ok(Math.abs(blasts[1][2]+.375)<1e-7);
    s.firstObstacleHitInfo=()=>undefined;p.position=[0,0,-1-FLAK.proximity];p.rotation=[0,0,0,1];
    const actor=(id,faction,x)=>({id,faction,hull:100,rotation:[0,0,0,1],position:[x,0,-1]});
    s.ships=[ship,actor('near','independents',0),actor('halfway','independents',36),actor('edge','independents',71),actor('outside','independents',72),actor('ally',ship.faction,0)];
    // Place NPCs after the proximity crossing to measure a single blast's falloff.
    const group=s.ships;s.ships=[ship];s.damagePlayer=()=>{};s.kickCamera=()=>{};
    shot=rocket(1);s.advanceFlak(shot,point,velocity,STEP);assert.equal(shot.life,0);
    assert.ok(Math.abs(blasts[2][2]+1)<1e-7);
    s.ships=group;s.npcHullExtents=()=>[1,1,1];
    const hits=[];s.damageShip=(target,amount)=>hits.push([target.id,amount]);
    s.burstFlak(rocket(1),new THREE.Vector3(0,0,-1));
    assert.deepEqual(hits.map(([id])=>id),['near','halfway','edge']);
    const expected=[45,27.5,10];
    for(const [i,[,amount]] of hits.entries())assert.ok(Math.abs(amount-expected[i])<1e-6);
});

test('a single BREAK falls inside the measured evasion window in the fixed-step trials',()=>{
    const steady=flakPanel('straight'),jink=flakPanel('break'),drover=flakPanel('drover'),rush=flakPanel('rush');
    assert.ok(steady.damage>=100&&steady.damage<=140);
    // BREAK follows the mid-course re-lead (40% of a ~10 s flight).
    assert.equal(jink.cues,1);assert.ok(jink.firstCue>4&&jink.firstCue<4.6);
    assert.ok(jink.damage<=30);
    // The re-led snap volley can clip a rushing pilot, but rushing stays the answer.
    assert.ok(rush.damage<=20);
    assert.ok(drover.damage>=165);
});

test('each flak rocket re-leads once mid-flight, turning at most correctTurn, and retimes its fuze',()=>{
    const {s,ship}=stage(),p=s.save.player;
    s.firstObstacleHitInfo=()=>undefined;s.renderer.spawnFlakBurst=()=>{};
    p.position=[300,0,-900];p.velocity=[40,0,0];
    const slot=s.projStore.alloc(),start=new THREE.Vector3(0,0,-300),velocity=new THREE.Vector3(0,0,-90);
    s.projStore.setPosV(slot,start);s.projStore.setVelV(slot,velocity);
    const shot={slot,life:6,flightTime:10,correctAt:4,fuseJitter:0,ownerId:ship.id,faction:ship.faction,targetId:'player',
        threatensPilot:true,wobbleX:0,wobbleY:0,wobbleZ:0,wobblePhase:0};
    const before=velocity.clone();
    s.advanceFlak(shot,start.clone(),velocity,STEP);
    assert.equal(shot.corrected,true);
    assert.ok(before.angleTo(velocity)<=FLAK.correctTurn+1e-6,'turn is capped');
    assert.ok(before.angleTo(velocity)>FLAK.correctTurn*.5,'it really turns toward the new lead');
    assert.ok(Math.abs(shot.flightTime-shot.life-4)<1e-6,'elapsed flight time is preserved');
    const life=shot.life;s.advanceFlak(shot,start.clone(),velocity,STEP);
    assert.ok(Math.abs(life-shot.life)<1e-9,'no second correction');
});

test('a long but reachable flak intercept uses the full flight time',()=>{
    const {s,ship}=stage();pilot(s,900);
    for(let i=0;i<600&&ship.capitalAttack!=='CHARGING';i++)run(s,ship,STEP);
    assert.equal(ship.capitalAttack,'CHARGING');
    // The pilot accelerates along the same bearing just before ignition.
    run(s,ship,BARGE.warning-.1);
    s.save.player.velocity=[70,0,0];run(s,ship,.2);
    assert.ok(warheads(s)[0].life>40);
});
