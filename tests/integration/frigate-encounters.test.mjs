import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {createNewSave,loadGame} from '../../src/game/save.js';
import {LOCATIONS} from '../../src/game/data.js';
import {CAPITAL_HULLS} from '../../src/game/capitalHulls.js';
import {carrierFighterDestroyed,updateCarrierDeparture,updateTrafficLaunches,battleState} from '../../src/game/arenaBattle.js';
import {ROOKERY_LAUNCH,SKIDBLADNIR_LAUNCH,patrolCapital,raidCarrier,raidCorvette} from '../../src/game/corvetteMounts.js';
import {careerRegion} from '../../src/game/careerDanger.js';
import {applyCapitalSubsystemEffects,updateCapitalBroadsideAttack} from '../../src/game/capitalCombat.js';
import {updateNpcDrones,damageNpcDrone} from '../../src/game/npcDrones.js';
import {repairTargetEligible,selectRepairTarget} from '../../src/game/repairDrones.js';
import {RUN_WAVES} from '../../src/game/arenaRun.js';
import {shipVsShip} from '../../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
import {checkpointFrigateEncounter} from '../../src/game/frigateEncounters.js';

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
function launchStep(s,c,dt,config=ROOKERY_LAUNCH){
    s.save.world.time+=dt;
    updateTrafficLaunches(s,c,config);
}

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
test('carrier reload restores a living berth and the exact remaining replacement clock',()=>{
    let s=session();const c=carrier(s);launchStep(s,c,12);
    const flight=launched(s,c);assert.equal(flight.length,4);flight[1].hull-=17;c.position[2]+=70;
    flight[0].hull=0;carrierFighterDestroyed(s,flight[0]);
    launchStep(s,c,7);
    const surviving=flight[1], expected=flight.slice(1).map(fighter=>[fighter.id,fighter.hull,fighter.position]);
    for(let pass=0;pass<2;pass++){
        s=reload(s);const restored=s.ships.find(x=>x.variant==='rookery');assert.equal(restored?.id,c.id);
        const [lost,live]=restored.carrierBattle.lanes;
        assert.equal(lost.nextAt-s.save.world.time,23);
        assert.equal(live.fighter.id,surviving.id);
        assert.deepEqual(launched(s,restored).map(f=>[f.id,f.hull,f.position]),expected);
    }
    const restored=s.ships.find(x=>x.id===c.id);
    launchStep(s,restored,22.99);assert.equal(launched(s,restored).length,3);
    launchStep(s,restored,.01);assert.equal(launched(s,restored).length,4);
});
test('the same saved spawn restores only once, and surviving launches retain their IDs after carrier loss',()=>{
    let s=session();const c=carrier(s);launchStep(s,c,12);
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
test('old carrier checkpoints keep excess fighters without letting the carrier add to them',()=>{
    const s=session(),c=carrier(s);launchStep(s,c,12);
    const extra=s.spawnShip('escort',[0,90500,0],undefined,undefined,undefined,{faction:'pirates',hullId:'scrapper'});
    extra.launchOwner=c.id;extra.frigateEncounterId=c.id;
    checkpointFrigateEncounter(s);
    const saved=structuredClone(s.save);
    for(const member of saved.world.frigateEncounter.members){
        delete member.state.launchBay;
        if(member.lanes)member.lanes=member.lanes.map(({subsystem})=>({subsystem,remaining:0,retryIn:0}));
    }
    const resumed=session();resumed.save=saved;resumed.spawnInitialTraffic();
    const restored=resumed.ships.find(ship=>ship.id===c.id);
    const wing=launched(resumed,restored);
    assert.equal(wing.length,5);
    assert.equal(wing.filter(ship=>Boolean(ship.launchBay)).length,4);
    wing[0].hull=0;carrierFighterDestroyed(resumed,wing[0]);
    launchStep(resumed,restored,31);assert.equal(launched(resumed,restored).length,4);
    wing.find(ship=>ship.id===extra.id).hull=0;
    launchStep(resumed,restored,1);assert.equal(launched(resumed,restored).length,4);
    assert.ok(launched(resumed,restored).every(ship=>ship.launchBay));
});
test('four Balors visibly exit their own hangars, following a moving and turning carrier',()=>{
    const s=session(),c=carrier(s);
    launchStep(s,c,12);
    const wing=launched(s,c);
    assert.equal(wing.length,4);
    const forward=new THREE.Vector3(0,0,-1), axis=new THREE.Vector3(0,1,0);
    const point=new THREE.Vector3(),origin=new THREE.Vector3(),heading=new THREE.Vector3();
    const parent=new THREE.Quaternion(),inverse=new THREE.Quaternion(),rotation=new THREE.Quaternion();
    for(const f of wing){
        const socket=ROOKERY_LAUNCH.sockets[f.launchBay.replace('bay_','launch_')];
        assert.deepEqual(point.fromArray(f.position).sub(origin.fromArray(c.position)).toArray(),socket.start_game_position);
    }
    const durations=new Map(wing.map(f=>[f,f.carrierLaunch.duration]));
    for(let step=0;step<150;step++){
        c.position[0]+=4/60;c.position[2]+=9/60;
        parent.setFromAxisAngle(axis,step/260).toArray(c.rotation);
        inverse.copy(parent).invert();origin.fromArray(c.position);
        for(const f of wing){
            if(!f.carrierLaunch)continue;
            assert.equal(updateCarrierDeparture(s,f,1/60),true);
            const socket=ROOKERY_LAUNCH.sockets[f.launchBay.replace('bay_','launch_')];
            rotation.fromArray(f.rotation);
            heading.copy(forward).applyQuaternion(rotation).applyQuaternion(inverse);
            assert.ok(heading.dot(new THREE.Vector3().fromArray(socket.direction_game))>.9999);
            point.fromArray(f.position);
            assert.equal(shipVsShip(origin,parent,'rookery',npcShipScaleForVariant('rookery'),
                point,rotation,'scrapper',npcShipScaleForVariant('scrapper'),{}),false,
                `${f.launchBay} intersects the carrier at step ${step}`);
            point.sub(origin).applyQuaternion(inverse);
            assert.ok(Math.abs(point.y)<.00001&&Math.abs(point.z-socket.game_position[2])<.00001);
            if(step/60<durations.get(f)-.03)assert.ok(f.carrierLaunch);
            if(!f.carrierLaunch)assert.ok(Math.abs(point.x)>Math.abs(socket.game_position[0])+10);
        }
    }
    assert.ok(wing.every(f=>!f.carrierLaunch));
});
test('reloading during a launch preserves the current rail position and never duplicates the fighter',()=>{
    let s=session();const c=carrier(s);
    launchStep(s,c,6);
    const [f]=launched(s,c);
    updateCarrierDeparture(s,f,.7);
    const expected=structuredClone({launch:f.carrierLaunch,position:f.position});
    s=reload(s);
    const restored=s.ships.find(ship=>ship.id===c.id),fighter=s.ships.find(ship=>ship.id===f.id);
    assert.deepEqual({launch:fighter.carrierLaunch,position:fighter.position},expected);
    updateTrafficLaunches(s,restored,ROOKERY_LAUNCH);
    assert.deepEqual(launched(s,restored),[fighter]);
    const before=fighter.position[0];updateCarrierDeparture(s,fighter,.1);
    assert.ok(fighter.position[0]<before);
});
test('a Balor already on the rail continues outward after the carrier is destroyed',()=>{
    const s=session(),c=carrier(s);c.velocity=[0,0,5];
    launchStep(s,c,6);
    const [f]=launched(s,c);updateCarrierDeparture(s,f,.4);
    const before=[...f.position];
    c.hull=0;s.ships.splice(s.ships.indexOf(c),1);
    updateCarrierDeparture(s,f,.5);
    assert.ok(f.position[0]<before[0]);
    assert.equal(f.position[2],before[2]+2.5,'the last carrier frame keeps drifting');
    updateCarrierDeparture(s,f,2);
    assert.equal(f.carrierLaunch,undefined);
    assert.ok(f.position.every(Number.isFinite)&&f.hull>0);
});
test('a legacy two-bay carrier restores the damaged side and its occupied fighter slot',()=>{
    const s=session(),c=carrier(s);launchStep(s,c,7.5);
    checkpointFrigateEncounter(s);
    const saved=structuredClone(s.save);
    const carrierRecord=saved.world.frigateEncounter.members.find(member=>member.state.id===c.id);
    carrierRecord.state.capitalMountHull=[...c.capitalMountHull.slice(0,11),0,150];
    carrierRecord.state.missingPods=1;
    carrierRecord.state.combatFit.turrets.length=13;
    carrierRecord.lanes=carrierRecord.lanes.slice(0,2);
    for(const lane of carrierRecord.lanes)lane.subsystem=lane.subsystem.replace('_1','');
    for(const {state} of saved.world.frigateEncounter.members)if(state.launchOwner===c.id){
        state.launchBay=state.launchBay.replace('_1','');
        delete state.carrierLaunch;
    }
    const resumed=session();resumed.save=saved;resumed.spawnInitialTraffic();
    const restored=resumed.ships.find(ship=>ship.id===c.id),wing=launched(resumed,restored);
    assert.deepEqual(restored.capitalMountHull.slice(11),[0,0,90,90]);
    assert.equal(restored.missingPods,0);
    assert.equal(restored.combatFit.turrets.length,15);
    assert.deepEqual(wing.map(f=>f.launchBay),['bay_port_1','bay_starboard_1']);
    assert.deepEqual(restored.carrierBattle.lanes.slice(0,2).map(bay=>bay.fighterId),wing.map(f=>f.id));
});
test('a rock across the port rail holds that berth while the other three bays launch',()=>{
    const s=session(),c=carrier(s);
    const [x,y,z]=ROOKERY_LAUNCH.sockets.launch_port_1.game_position;
    s.activeFieldObstacles=()=>[{x:x-10,y:y+90000,z,radius:4,collisionRadius:4}];
    launchStep(s,c,12);
    assert.equal(launched(s,c).length,3);
    assert.ok(!launched(s,c).some(f=>f.launchBay==='bay_port_1'));
});
test('a fighter occupying a rail endpoint holds that bay until the exit is clear',()=>{
    const first=session(),model=carrier(first);launchStep(first,model,6);
    const [pilot]=launched(first,model);updateCarrierDeparture(first,pilot,pilot.carrierLaunch.duration);
    const s=session(),c=carrier(s),guard=s.spawnShip('escort',pilot.position,undefined,undefined,undefined,{hullId:'scrapper'});
    launchStep(s,c,12);assert.equal(launched(s,c).length,3);guard.position[1]+=500;
    launchStep(s,c,1);assert.equal(launched(s,c).length,3);
    launchStep(s,c,1);assert.equal(launched(s,c).length,4);
});
test('continuous rail obstruction backs off each bay for two simulated seconds',()=>{
    const s=session(),c=carrier(s);s.activeFieldObstacles=()=>[{x:0,y:90000,z:0,radius:1,box:{hx:90,hy:40,hz:90,qx:0,qy:0,qz:0,qw:1}}];
    let checks=0;const clear=s.siteSpotClear.bind(s);s.siteSpotClear=(...args)=>{checks++;return clear(...args);};
    launchStep(s,c,12);checks=0;
    for(let i=0;i<60;i++)launchStep(s,c,1/60);
    assert.equal(launched(s,c).length,0);assert.equal(checks,0);
    const poses=c.carrierBattle.lanes.map(bay=>bay.pose);
    for(let i=0;i<120;i++)launchStep(s,c,1/60);
    assert.ok(checks>0);const perRetry=checks;
    for(let i=0;i<120;i++)launchStep(s,c,1/60);
    assert.equal(checks,2*perRetry);
    c.carrierBattle.lanes.forEach((bay,index)=>assert.equal(bay.pose,poses[index]));
});
test('a League patrol fields six Lokis on its own hangars without an extra scripted escort pair',()=>{
    assert.equal(patrolCapital('alliance',{danger:.99},()=>.12),'skidbladnir');
    assert.notEqual(patrolCapital('alliance',{danger:.48},()=>.12),'skidbladnir');
    const s=session();s.save.player.systemId='acheron';
    const options=s.leagueTrafficOptions('patrol','acheron-belt',()=>.12);
    assert.equal(options.patrolCapital,'skidbladnir');
    const carrier=s.spawnShip('patrol',[0,90000,0],undefined,undefined,undefined,options);
    carrier.rotation=[0,0,0,1];assert.equal(s.ships.length,1);
    for(let i=0;i<16;i++){
        launchStep(s,carrier,1,SKIDBLADNIR_LAUNCH);
        for(const fighter of launched(s,carrier))fighter.position[1]+=100;
    }
    const wing=launched(s,carrier);
    assert.equal(wing.length,6);
    assert.ok(wing.every(f=>f.hullId==='speedster'&&f.faction==='alliance'&&f.convoyLeader===carrier&&!f.hostile));
    for(const f of wing){
        const socket=SKIDBLADNIR_LAUNCH.sockets[f.launchBay.replace('bay_','launch_')];
        assert.equal(Math.sign(f.position[0]),Math.sign(socket.direction_game[0]));
        assert.equal(f.position[2],socket.game_position[2]);
        assert.ok(f.velocity[0]*socket.direction_game[0]>0);
    }
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
    launchStep(s,c,12);assert.equal(c.pilot.tier,'ace');assert.deepEqual(launched(s,c).map(f=>f.pilot.tier),Array(4).fill('ace'));
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
