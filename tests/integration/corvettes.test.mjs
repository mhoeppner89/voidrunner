import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {EntityStore} from '../../src/game/entityStore.js';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {CAPITAL_MARKER_COUNT} from '../../src/game/capitalMarkerCount.js';
import {CapitalMarkers} from '../../src/game/capitalMarkers.js';
import {convoyTraffic,raidCorvette} from '../../src/game/corvetteMounts.js';
import {updateCorvetteWeapons,updateCapitalBroadsideAttack} from '../../src/game/capitalCombat.js';
import {segmentShipColliderHit} from '../../src/game/shipCollision.js';
import {LAUNCHERS,CORVETTE_BROADSIDE} from '../../src/game/weapons.js';
import {seededRandom} from '../../src/game/random.js';

function stage(variant,arena=false){
    const s=fixture();s.arena=arena?{}:undefined;s.save.player.dockedAt=undefined;
    s.save.player.position=[0,100,400];s.save.player.velocity=[0,0,0];
    s.tmpAvoidance=new THREE.Vector3();s.hyperdriveInterceptIds=new Set();s.pickupStore=new EntityStore(32);s.pickups=[];s.pickupCounter=0;s.audio={play(){},playAtDirection(){}};
    s.ui={pushEvent(){},pushSensor(){},isModalOpen:false};s.chatterOpen=()=>false;
    const ship=s.spawnCorvette(variant,[0,0,0]);ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
    return {s,ship,mounts:CAPITAL_HULLS[variant].mounts};
}
function hit(s,ship,m,amount=m.hull){
    const p=new THREE.Vector3().fromArray(m.hitCenter).applyQuaternion(new THREE.Quaternion(...ship.rotation)).add(new THREE.Vector3(...ship.position));
    s.damageShip(ship,amount,'environment',p.toArray());
}

test('all capital hulls declare their health, labels, sockets, hit areas and selectable systems',()=>{
    const counts={'concord-frigate':14,'concord-cruiser':14,drover:12,ironjaw:8,caravan:14,rookery:13};
    for(const [id,count] of Object.entries(counts)){
        const {mounts}=CAPITAL_HULLS[id];assert.equal(mounts.length,count);assert.ok(mounts.length<=CAPITAL_MARKER_COUNT);
        for(const m of mounts){
            assert.ok(m.hull>0&&m.labelKey&&m.radius>0);
            assert.ok(m.localPosition.every(Number.isFinite)&&m.hitCenter.every(Number.isFinite));
            assert.ok(Math.abs(Math.hypot(...m.normal)-1)<.01);assert.equal(m.targetable,['generator','engine'].includes(m.kind));
        }
        const s=fixture(),ship=s.spawnCapitalShip(id,[0,0,0],'rook');s.save.player.currentTargetId=ship.id;
        const expected=mounts.filter(m=>m.targetable).map(m=>m.index);
        for(const index of [...expected,undefined]){s.cycleCapitalSubtarget();assert.equal(s.getTargetRef().mount,index);}
    }
});
test('one engine halves speed, two preserve momentum, and only a career Drover offers boarding',()=>{
    for(const id of ['drover','ironjaw'])for(const arena of [false,true]){
        const {ship,s,mounts}=stage(id,arena);ship.shield=0;const engines=mounts.filter(m=>m.kind==='engine'),speed=ship.speed;
        hit(s,ship,engines[0]);assert.equal(ship.speed,speed/2);assert.equal(ship.engineThrust,.5);
        hit(s,ship,engines[1]);assert.equal(ship.speed,0);assert.equal(ship.engineThrust,0);
        assert.equal(!!ship.surrendered,id==='drover'&&!arena);assert.equal(s.boardable(ship),id==='drover'&&!arena);
        ship.velocity=[2,0,0];s.updateTravelAI(ship,.5);assert.deepEqual(ship.position,[1,0,0]);assert.deepEqual(ship.velocity,[2,0,0]);
    }
});
test('a disabled booster loses the extra five speed and a destroyed generator collapses its shield',()=>{
    const {s,ship,mounts}=stage('ironjaw');ship.shield=0;
    hit(s,ship,mounts.find(m=>m.kind==='booster'));assert.equal(ship.speed,25);
    const generator=mounts.find(m=>m.kind==='generator');ship.shield=200;
    s.damageShip(ship,360,'environment',generator.hitCenter,LAUNCHERS.torpedo);
    assert.equal(ship.maxShield,0);assert.equal(ship.shield,0);assert.equal(ship.shieldRegen,0);
});
test('a torpedo bypasses corvette shields on a direct hit and preserves ordinary hull damage',()=>{
    const {s,ship}=stage('drover',true),rack=LAUNCHERS.torpedo,slot=s.projStore.alloc();
    s.renderer.spawnExplosion=()=>{};s.tmpAudioLocal=new THREE.Vector3();s.tmpAudioOrientation=new THREE.Quaternion();
    s.projStore.setPos(slot,0,0,-80);s.projStore.setVel(slot,0,0,200);
    s.projectiles.push({slot,kind:'missile',ownerId:'player',hitWeapon:rack,damage:rack.damage,life:2,
        acceleration:0,splashMin:rack.splashMin,splashRadius:rack.splashRadius});
    s.updateProjectiles(.5);
    assert.equal(ship.shield,300);assert.equal(ship.hull,540);
});
test('each released pod clears its collision surface and spills its commodity share once in career',()=>{
    for(const arena of [false,true]){
        const {s,ship,mounts}=stage('drover',arena);ship.shield=0;ship.cargo={ore:24,machinery:12};
        const pod=mounts.find(m=>m.node==='pod_0'),a=new THREE.Vector3(-20,0,-10),b=new THREE.Vector3(-3,0,-10);
        assert.notEqual(segmentShipColliderHit(a,b,ship.position,ship.rotation,ship.variant,2),undefined);
        hit(s,ship,pod);hit(s,ship,pod);s.corvetteSubsystemDestroyed(ship,pod.index);
        assert.equal(segmentShipColliderHit(a,b,ship.position,ship.rotation,ship.collisionVariant,2),undefined);
        assert.deepEqual(s.pickups.map(p=>[p.commodity,p.amount]),arena?[]:[['ore',4],['machinery',2]]);
        assert.deepEqual(ship.cargo,arena?{ore:24,machinery:12}:{ore:20,machinery:10});
    }
});
test('indivisible cargo stays in the same pod in either destruction order',()=>{
    for(const order of [[5,0],[0,5]]){
        const {s,ship,mounts}=stage('drover');ship.shield=0;ship.cargo={machinery:1};
        for(const index of order){
            const before=s.pickups.length;
            hit(s,ship,mounts.find(m=>m.node==='pod_'+index));
            assert.equal(s.pickups.length-before,index===0?1:0);
        }
        assert.equal(ship.cargo.machinery,0);
    }
});
test('Ironjaw tracks an abeam fighter with its exposed broadside and ceases firing when it is destroyed',()=>{
    const {s,ship,mounts}=stage('ironjaw',true),enemy=s.spawnShip('trader',[400,0,0]);
    enemy.velocity.fill(0);ship.targetId=enemy.id;ship.holdFire=false;s.save.player.position=[0,900,500];
    const target=new THREE.Vector3(...enemy.position),velocity=new THREE.Vector3(),shots=[];
    s.spawnGunProjectile=(id,w)=>{if(w.id===CORVETTE_BROADSIDE.id)shots.push(s.save.world.time);};
    const advance=n=>{for(let i=0;i<n;i++){s.save.world.time+=1/60;updateCorvetteWeapons(s,ship,1/60,target,velocity);}};
    advance(240);assert.ok(shots.length>=3);assert.ok(shots[1]-shots[0]>=1.2-1e-8);
    assert.deepEqual([CORVETTE_BROADSIDE.damageFlat,CORVETTE_BROADSIDE.speed,CORVETTE_BROADSIDE.range],[50,520,550]);
    ship.shield=0;hit(s,ship,mounts.find(m=>m.bearing===1));const before=shots.length;advance(180);assert.equal(shots.length,before);
});
test('Ironjaw closes on a fighter and holds it abeam inside broadside range',()=>{
    const {s,ship}=stage('ironjaw',true);
    s.save.player.position=[0,0,-900];ship.targetId='player';ship.holdFire=true;
    const target=new THREE.Vector3(...s.save.player.position),velocity=new THREE.Vector3(),position=new THREE.Vector3();
    let closest=Infinity;
    for(let i=0;i<7200;i++){
        s.save.world.time+=1/60;updateCapitalBroadsideAttack(s,ship,target,velocity,1/60);
        closest=Math.min(closest,position.fromArray(ship.position).distanceTo(target));
    }
    const bearing=target.clone().sub(position).normalize().applyQuaternion(new THREE.Quaternion(...ship.rotation).invert());
    assert.ok(closest>450&&position.distanceTo(target)<550);assert.ok(Math.abs(bearing.x)>.9);
});
test('capital markers cull facing and hull occlusion separately, fade, and hide destroyed and selected parts',()=>{
    const {ship,mounts}=stage('drover'),markers=new CapitalMarkers(),turret=mounts.find(m=>m.node==='mount_laser_dorsal');
    const settle=(camera,selected)=>{for(let i=0;i<50;i++)markers.update(ship,camera,1/60,selected);return markers.entries[turret.index];};
    const front=new THREE.Vector3(0,80,-500),behindCrane=new THREE.Vector3(-354,7.17,354);
    assert.equal(settle(front).opacity,.7);
    let transition=0;
    for(let i=0;i<30;i++){markers.update(ship,behindCrane,1/60);const opacity=markers.entries[turret.index].opacity;if(opacity>0&&opacity<.7)transition++;}
    assert.ok(transition>=7&&transition<=10,'occlusion fades over approximately nine frames');
    assert.equal(settle(behindCrane).facing,true);assert.equal(markers.entries[turret.index].opacity,0);
    assert.equal(settle(front).opacity,.7);assert.equal(settle(new THREE.Vector3(0,-500,0)).facing,false);
    assert.ok(Math.abs(settle(new THREE.Vector3(0,1750,0)).opacity-.35)<.001);
    assert.equal(settle(new THREE.Vector3(0,2000,0)).opacity,0);assert.equal(settle(front,turret.index).opacity,0);
    ship.capitalMountHull[turret.index]=0;assert.equal(settle(front).opacity,0);
    assert.equal(markers.entries[mounts.find(m=>m.kind==='generator').index].diamond,true);
});
test('career rolls gate corvettes by lane and raid danger, and an active encounter suppresses a new raid',()=>{
    const rng=seededRandom('corvette rates');let convoys=0,raids=0;
    for(let i=0;i<5000;i++){convoys+=Number(convoyTraffic('independents',rng));raids+=Number(raidCorvette({danger:.8,piratePressure:1},rng));}
    for(const count of [convoys,raids])assert.ok(count>650&&count<850);
    assert.equal(convoyTraffic('concord',()=>0),false);assert.equal(raidCorvette({danger:.29},()=>0),false);assert.equal(raidCorvette({danger:.3,piratePressure:1},()=>0),true);
    const {s,ship}=stage('drover');s.save.player.position=[100,0,0];ship.hostile=true;s.nextEncounterAt=0;
    s.updateStationTraffic=s.updateCapitalTraffic=()=>{};s.updateDynamicEncounters();assert.equal(s.ships.length,1);
    const trader=s.spawnShip('trader',[700,0,0],undefined,undefined,undefined,{convoy:true});
    const escorts=s.ships.filter(s=>s.convoyLeader===trader);assert.ok(escorts.length>=1&&escorts.length<=2);assert.ok(escorts.every(s=>s.faction==='independents'));
    s.damageShip(trader,10,'player',[700,0,0]);assert.ok(trader.convoyEscape);assert.ok(escorts.every(s=>s.targetId==='player'));
    const group=[];s.addRaidCorvette(ship,group,{danger:.7,piratePressure:1},()=>0);assert.equal(group[0].variant,'ironjaw');assert.equal(group[0].convoyLeader,ship);
});

test('traffic frigates retain their own hull stats and lose a third of thrust per engine',()=>{
    for(const variant of ['caravan','rookery'])for(const arena of [false,true]){
        const {s,ship,mounts}=stage(variant,arena);
        assert.equal(ship.capitalClass,'frigate');
        assert.deepEqual([ship.maxShield,ship.maxHull,ship.speed,ship.turnRate],[500,variant==='caravan'?2000:2400,20,.15]);
        const cycle=mounts.filter(m=>m.targetable);
        assert.deepEqual(cycle.map(m=>m.kind).sort(),['engine','engine','engine','generator','generator']);
        ship.shield=0;
        const regen=ship.shieldRegen;
        for(const [i,m] of mounts.filter(m=>m.kind==='generator').entries()){
            assert.equal(m.hull,95);hit(s,ship,m);assert.equal(ship.shieldRegen,regen*(1-i)/2);
        }
        for(const [i,m] of mounts.filter(m=>m.kind==='engine').entries()){
            assert.equal(m.hull,150);hit(s,ship,m);assert.equal(ship.engineThrust,(2-i)/3);
            assert.ok(Math.abs(ship.speed-20*(2-i)/3)<1e-8);
        }
        assert.equal(Boolean(s.boardable(ship)),variant==='caravan'&&!arena);
        assert.equal(Boolean(ship.surrendered),variant==='caravan'&&!arena);
        ship.velocity=[2,0,0];s.updateTravelAI(ship,.5);assert.equal(ship.position[0],1);
    }
});

test('Caravan stacks release once and the collision gap and reduced hold survive a career reload',()=>{
    const {s}=stage('caravan',false),origin=[2000,0,0];
    const ship=s.spawnCorvette('caravan',origin,true),m=CAPITAL_HULLS.caravan.mounts.find(m=>m.node==='stack_0');
    ship.shield=0;ship.cargo={ore:19};hit(s,ship,m);
    assert.equal(ship.missingPods,1);assert.equal(ship.cargo.ore,14);assert.equal(s.pickups.length,1);
    const saved=JSON.parse(JSON.stringify(s.save)),resumed=stage('caravan',false).s;
    resumed.save=saved;const next=resumed.spawnCorvette('caravan',origin,true);
    assert.equal(next.collisionVariant,ship.collisionVariant);assert.equal(next.capitalMountHull[m.index],0);
    resumed.corvetteSubsystemDestroyed(next,m.index);
    assert.equal(next.cargo.ore,14);assert.equal(resumed.pickups.length,0);
});

test('frigate traffic rolls only on qualifying routes and suppresses a new carrier during a fight',async()=>{
    const {convoyVariant,raidCarrier}=await import('../../src/game/corvetteMounts.js');
    const mid={danger:.4,piratePressure:1},high={danger:.9,piratePressure:1};
    const rolls=Array.from({length:100},(_,i)=>(i+.5)/100);
    assert.equal(rolls.filter(r=>convoyVariant('independents',mid,()=>r)==='caravan').length,5);
    assert.equal(rolls.filter(r=>raidCarrier('redwake',high,()=>r)).length,5);
    for(const [f,r,allow] of [['pirates',mid,true],['independents',{danger:.2},true],['independents',mid,false]])
        assert.notEqual(convoyVariant(f,r,()=>.17,allow),'caravan');
    assert.equal(raidCarrier('redwake',{...high,piratePressure:0},()=>0),false);assert.equal(raidCarrier('redwake',mid,()=>0),false);
    const {s}=stage('caravan',false);s.save.player.systemId='redwake';
    const convoy=s.spawnShip('trader',[0,0,800],undefined,undefined,undefined,{convoy:'caravan'});
    assert.equal(convoy.variant,'caravan');
    const escorts=s.ships.filter(x=>x.convoyLeader===convoy&&x.variant!=='drover');
    assert.ok(escorts.length>=2&&escorts.length<=3);assert.ok(escorts.every(x=>x.faction==='independents'));
    s.visibleSpawnPosition=p=>p;
    assert.equal(s.careerFrigateEncounterOpen(),false,'a local convoy counts as an active encounter');
    assert.notEqual(s.spawnCareerRaider('pirate',[0,0,900],high,()=>0,true).variant,'rookery');
    s.ships.length=0;
    s.save.world.distress={active:{id:'test-distress'}};
    assert.equal(s.careerFrigateEncounterOpen(),false);
    s.save.world.distress.active=null;
    const carrier=s.spawnCareerRaider('pirate',[0,0,900],high,()=>0,true);
    assert.equal(carrier.variant,'rookery');
    const balor=s.spawnCareerRaider('escort',[80,0,900],high,()=>0,true,carrier);
    assert.equal(balor.hullId,'scrapper');
    assert.notEqual(s.spawnCareerRaider('pirate',[0,0,600],high,()=>0,true).variant,'rookery');
});

test('career Rookery launches regional Balor pairs up to eight survivors and leaves them fighting',async()=>{
    const {updateTrafficLaunches}=await import('../../src/game/arenaBattle.js');
    const {ROOKERY_LAUNCH}=await import('../../src/game/corvetteMounts.js');
    const {s,ship}=stage('rookery',false);
    s.siteSpotClear=()=>true;s.careerRegionAt=()=>({danger:.9});ship.targetId='player';
    const tick=dt=>updateTrafficLaunches(s,ship,ROOKERY_LAUNCH,dt);
    const fighters=()=>s.ships.filter(s=>s.hull>0&&s.launchOwner===ship.id);
    tick(24);assert.equal(fighters().length,0);
    tick(1);assert.equal(fighters().length,4);
    assert.ok(fighters().every(f=>f.hullId==='scrapper'&&f.pilot.tier==='ace'&&f.targetId==='player'));
    for(const fighter of fighters())fighter.position[1]+=500; // Fly the first pair clear of each rail.
    tick(25);tick(25);assert.equal(fighters().length,8);
    ship.hull=0;tick(50);assert.equal(fighters().length,8);
});
