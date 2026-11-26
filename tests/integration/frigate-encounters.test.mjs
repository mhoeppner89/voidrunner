import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {createNewSave,loadGame} from '../../src/game/save.js';
import {LOCATIONS} from '../../src/game/data.js';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {updateTrafficLaunches,battleState} from '../../src/game/arenaBattle.js';
import {ROOKERY_LAUNCH,raidCarrier,raidCorvette} from '../../src/game/corvetteMounts.js';
import {careerRegion} from '../../src/game/careerDanger.js';
import {applyCapitalSubsystemEffects,updateCapitalBroadsideAttack} from '../../src/game/capitalCombat.js';
import {updateNpcDrones,damageNpcDrone} from '../../src/game/npcDrones.js';
import {repairTargetEligible,selectRepairTarget} from '../../src/game/repairDrones.js';
import {RUN_WAVES} from '../../src/game/arenaRun.js';

function session(seed=718){
    const s=tutorialFixture('earn-standing').session;
    s.save=createNewSave(seed,{tutorial:false});s.save.world.time=0;
    Object.assign(s.save.player,{dockedAt:undefined,position:[0,90000,400],rotation:[0,0,0,1]});
    s.arena=undefined;s.chatterOpen=()=>false;s.encounterCounter=0;
    delete s.persistSave;delete s.updateAttackAI;delete s.updateTravelAI;
    return s;
}
function reload(s){
    const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}};
    assert.ok(s.persistSave());const save=loadGame();const resumed=session();resumed.save=save;resumed.spawnInitialTraffic();return resumed;
}
function carrier(s){
    const c=s.spawnTrafficCapital('rookery',[0,90000,0],true);c.rotation=[0,0,0,1];c.targetId='player';return c;
}
const launched=(s,c)=>s.ships.filter(f=>f.launchOwner===c.id&&f.hull>0);
function deploy(s){for(let i=0;i<360;i++){s.save.world.time+=1/60;updateNpcDrones(s,1/60);}}
function drones(ship){return Object.values(ship.droneFleet.unitsById).map(u=>[u.id,u.hull,u.state,[...u.position]]);}
test('a late Boreal checkpoint restores the same moving convoy, cargo, escorts and physical drones twice',()=>{
    let s=session(2);s.save.player.systemId='pale-ring';s.save.player.lastDockedAt='boreal';s.save.player.position=[...LOCATIONS.boreal.position];s.spawnInitialTraffic();
    const c=s.ships.find(x=>x.variant==='caravan');assert.ok(c);const origin=[...c.position];c.rotation=[0,0,0,1];c.position[2]+=200;c.shield=0;c.cargo={ore:19};
    const stack=CAPITAL_HULLS.caravan.mounts.find(m=>m.node==='stack_0');
    s.damageShip(c,150,'environment',stack.hitCenter.map((n,i)=>n+c.position[i]));
    s.save.world.time=66;deploy(s);const units=Object.values(c.droneFleet.unitsById);damageNpcDrone(s,units[0],5);damageNpcDrone(s,units[1],units[1].hull);
    const state=drones(c),escorts=s.ships.filter(x=>x.convoyLeader===c).map(x=>x.id);
    for(let i=0;i<2;i++){
        s=reload(s);const ship=s.ships.find(x=>x.id===c.id&&x.variant==='caravan');assert.ok(ship);
        assert.deepEqual(ship.position,c.position);assert.equal(ship.missingPods,1);assert.equal(ship.cargo.ore,14);
        assert.equal(ship.capitalMountHull[stack.index],0);assert.equal(ship.hull,c.hull);
        assert.deepEqual(drones(ship),state);assert.deepEqual(s.ships.filter(x=>x.convoyLeader===ship).map(x=>x.id),escorts);
        const count=s.ships.length;
        assert.equal(s.spawnShip('trader',origin,undefined,undefined,undefined,{convoy:'caravan'}),ship);
        assert.equal(s.ships.length,count);assert.equal(new Set(s.ships.map(x=>x.id)).size,count);
    }
});
test('carrier reload preserves moving hulls, damaged launched fighters and the two live bay clocks',()=>{
    let s=session();const c=carrier(s);updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);
    const flight=launched(s,c);assert.equal(flight.length,4);flight[0].hull-=17;flight[1].position[0]+=15;c.position[2]+=70;
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,7);
    const expected=flight.map(f=>[f.id,f.hull,f.position]);
    for(let pass=0;pass<2;pass++){s=reload(s);const restored=s.ships.find(x=>x.variant==='rookery');assert.equal(restored?.id,c.id);
        assert.deepEqual(restored.carrierBattle.lanes.map(b=>b.remaining),[18,18]);assert.deepEqual(launched(s,restored).map(f=>[f.id,f.hull,f.position]),expected);}
});
test('the same saved spawn restores only once, and surviving launches retain their IDs after carrier loss',()=>{
    let s=session();const c=carrier(s);updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);
    const ids=launched(s,c).map(ship=>ship.id);const savedKey=c.capitalSpawnKey;
    s=reload(s);
    assert.equal(s.spawnTrafficCapital('rookery',[0,90000,0],true),s.ships.find(ship=>ship.capitalSpawnKey===savedKey));
    assert.equal(s.ships.length,5);
    const restored=s.ships.find(ship=>ship.id===c.id);restored.hull=0;s.checkpointCorvette(restored);
    for(let i=0;i<2;i++){
        s=reload(s);assert.deepEqual(s.ships.map(ship=>ship.id),ids);
        assert.equal(s.spawnTrafficCapital('rookery',[0,90000,0],true),undefined);
    }
    assert.ok(!ids.includes(s.spawnShip('escort',[0,90500,0]).id));
});
test('a rock across the port rail holds its pair and the clear starboard bay launches',()=>{
    const s=session(),c=carrier(s),a=ROOKERY_LAUNCH.sockets.launch_port;
    const p=new THREE.Vector3(...a.game_position).add(new THREE.Vector3(...c.position)).addScaledVector(new THREE.Vector3(...a.direction_game),52);
    s.activeFieldObstacles=()=>[{x:p.x,y:p.y,z:p.z,radius:16,collisionRadius:16}];
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);
    assert.equal(launched(s,c).length,2);assert.ok(launched(s,c).every(f=>f.position[0]>0));
});
test('a fighter occupying a rail endpoint holds that bay until the exit is clear',()=>{
    const first=session(),model=carrier(first);updateTrafficLaunches(first,model,ROOKERY_LAUNCH,25);
    const s=session(),c=carrier(s),guard=s.spawnShip('escort',[...launched(first,model)[0].position],undefined,undefined,undefined,{hullId:'scrapper'});
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);assert.equal(launched(s,c).length,2);guard.position[1]+=500;
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,1);assert.equal(launched(s,c).length,2);
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,1);assert.equal(launched(s,c).length,4);
});
test('continuous rail obstruction backs off each bay for two simulated seconds',()=>{
    const s=session(),c=carrier(s);s.activeFieldObstacles=()=>[{x:0,y:90000,z:-190,radius:1,box:{hx:85,hy:40,hz:131,qx:0,qy:0,qz:0,qw:1}}];
    let checks=0;const clear=s.siteSpotClear.bind(s);s.siteSpotClear=(...args)=>{checks++;return clear(...args);};
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);checks=0;
    for(let i=0;i<60;i++)updateTrafficLaunches(s,c,ROOKERY_LAUNCH,1/60);
    assert.equal(launched(s,c).length,0);assert.equal(checks,0);
    const plans=c.carrierBattle.lanes.map(bay=>bay.plans);
    for(let i=0;i<120;i++)updateTrafficLaunches(s,c,ROOKERY_LAUNCH,1/60);
    assert.ok(checks>0);const perRetry=checks;
    for(let i=0;i<120;i++)updateTrafficLaunches(s,c,ROOKERY_LAUNCH,1/60);
    assert.equal(checks,2*perRetry);
    c.carrierBattle.lanes.forEach((bay,index)=>assert.equal(bay.plans,plans[index]));
});
test('Rookery avoids the measured 55-unit rock across its pursuit course',()=>{
    const s=session(),c=carrier(s);s.arena={};s.save.player.position=[0,90000,-2200];c.holdFire=true;
    const rock={x:-190.09708851259063,y:90000,z:-301.51753225468127,radius:55,collisionRadius:55,losRadius:55,id:'rock'};
    s.activeFieldObstacles=()=>[rock];s.forEachObstacleInBox=(...args)=>args.at(-1)(rock);s.forEachObstacleAlongSegment=(a,b,fn)=>fn(rock);delete s.lineBlocked;
    const target=new THREE.Vector3(...s.save.player.position),v=new THREE.Vector3();let contacts=0;
    for(let i=0;i<9000;i++){s.save.world.time+=1/60;updateCapitalBroadsideAttack(s,c,target,v,1/60);s.resolveNpcCollisions(c);if(c.combatBumpAt===s.save.world.time)contacts++;}
    assert.equal(contacts,0);assert.equal(c.shield,500);assert.ok(target.distanceTo(new THREE.Vector3(...c.position))<2100);
});
test('live passive shield recovery follows each hull and its remaining generators',()=>{
    for(const [variant,rates] of [['caravan',[10,5,0]],['rookery',[10,5,0]],['concord-frigate',[16,8,0]],['drover',[10,0]],['ironjaw',[10,0]]]){
        const s=session(),c=s.spawnCapitalShip(variant,[0,90000,0]);c.holdFire=true;c.demandUntil=Infinity;c.shield=100;c.shieldDelay=0;
        const generators=CAPITAL_HULLS[variant].mounts.filter(m=>m.kind==='generator');
        for(const [i,rate] of rates.entries()){
            if(i){c.capitalMountHull[generators[i-1].index]=0;applyCapitalSubsystemEffects(c);}
            c.engineThrust=0;const before=c.shield;for(let j=0;j<60;j++){s.save.world.time+=1/60;s.updateShips(1/60);}
            assert.ok(Math.abs(c.shield-before-rate)<.001,variant+' '+(c.shield-before));
        }
    }
});
test('a fleeing Caravan denies repairs to the attacker even before it turns hostile',()=>{
    const s=session(),p=s.save.player;p.position=[0,90012,100];p.hull=s.playerStats().hull-10;
    const c=s.spawnShip('trader',[0,90000,0],undefined,undefined,undefined,{convoy:'caravan'});
    s.damageShip(c,275,'player',c.position);assert.ok(c.convoyEscape);assert.equal(repairTargetEligible(s,c,p),false);
    c.targetId=undefined;c.combatThreatUntil=0;assert.notEqual(selectRepairTarget(s,c,{}),p);
});
test('orphaned Caravan drones drift for twenty seconds across reload, stay targetable and cannot be salvaged',()=>{
    let s=session();const c=s.spawnTrafficCapital('caravan',[0,90000,0],true);deploy(s);
    const unit=Object.values(c.droneFleet.unitsById)[0],id=unit.id;unit.velocity=[1,0,0];s.addCareerWreck(c);c.hull=0;s.ships=[];
    const x=unit.position[0];s.save.world.time+=5;updateNpcDrones(s,5);
    assert.ok(s.targetableRepairDrone(id));assert.equal(unit.position[0],x+5);assert.equal(unit.prevPosition[0],x);
    s=reload(s);updateNpcDrones(s,1/60);const orphan=s.targetableRepairDrone(id);assert.ok(orphan);s.save.player.position=[...orphan.position];
    assert.equal(s.inventoryCommand('recover-drone',{id}).ok,false);
    for(let i=0;i<899;i++){s.save.world.time+=1/60;updateNpcDrones(s,1/60);}assert.ok(s.targetableRepairDrone(id));
    for(let i=0;i<2;i++){s.save.world.time+=1/60;updateNpcDrones(s,1/60);}assert.equal(s.npcDroneUnits[id],undefined);assert.equal(s.save.world.orphanDrones[id],undefined);
});
test('an active neutral convoy suppresses ambient encounters before any trader or pirate spawns',()=>{
    const s=session();s.save.player.systemId='redwake';s.save.player.position=[0,100000,10000];s.save.world.time=90;s.updateStationTraffic=s.updateCapitalTraffic=()=>{};
    s.spawnShip('trader',[0,100000,10800],undefined,undefined,undefined,{convoy:'caravan'});const before=s.ships.length;
    for(let i=0;i<50;i++){s.nextEncounterAt=0;s.updateDynamicEncounters();s.save.world.time+=90;}
    assert.equal(s.ships.length,before);
});
test('eligible pirate raids roll capitals by local danger and pirate presence across systems',()=>{
    const pale=careerRegion('pale-ring','pale-rings');
    assert.equal(raidCarrier('pale-ring',pale,()=>0),true);assert.equal(raidCorvette(pale,()=>0),true);
    assert.equal(raidCarrier('pale-ring',{...pale,piratePressure:0},()=>0),false);
    assert.equal(raidCorvette({...pale,piratePressure:0},()=>0),false);
});
test('spectator carriers pass their selected tier to Balors independently of Arena normal and hard tiers',()=>{
    const s=session();s.arena={observer:true};s.observerDifficulty='ace';s.observerAimError=1;
    const c=s.spawnObserverDraftUnit({id:'rooks',shipType:'rookery',team:'red',tier:'ace',fit:'varied',position:[0,0,0]});
    updateTrafficLaunches(s,c,ROOKERY_LAUNCH,25);assert.equal(c.pilot.tier,'ace');assert.deepEqual(launched(s,c).map(f=>f.pilot.tier),Array(4).fill('ace'));
    assert.deepEqual([false,true].map(h=>battleState(RUN_WAVES[9],9,h).launchFighter.tier),['veteran','ace']);
});

test('an older damage-only ledger restores the nearby Boreal hull after its minute seed changes',()=>{
    const old=session(2);
    old.save.player.systemId='pale-ring';old.save.player.lastDockedAt='boreal';
    old.save.player.position=[...LOCATIONS.boreal.position];old.spawnInitialTraffic();
    const c=old.ships.find(ship=>ship.variant==='caravan');c.rotation=[0,0,0,1];c.shield=0;c.cargo={ore:19};
    const stack=CAPITAL_HULLS.caravan.mounts.find(m=>m.node==='stack_0');
    old.damageShip(c,150,'environment',stack.hitCenter.map((v,i)=>v+c.position[i]));
    old.checkpointCorvette(c);old.save.world.time=72;delete old.save.world.frigateEncounter;
    const s=session();s.save=JSON.parse(JSON.stringify(old.save));s.spawnInitialTraffic();
    const recovered=s.ships.find(ship=>ship.capitalSpawnKey===c.capitalSpawnKey);
    assert.ok(recovered);assert.equal(recovered.hull,c.hull);assert.equal(recovered.missingPods,1);
    assert.equal(recovered.cargo.ore,14);assert.equal(recovered.capitalMountHull[stack.index],0);
    assert.equal(reload(s).ships.find(ship=>ship.id===recovered.id)?.cargo.ore,14);
});
