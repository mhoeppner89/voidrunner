import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '../../vendor/three.module.min.js';
import {spawnSync} from 'node:child_process';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {t} from '../../src/game/i18n.js';
import {capitalHull} from '../../src/game/capitalHulls.js';
import {session} from '../helpers/session.mjs';
import {updateSiegeLance,LANCE} from '../../src/game/siegeLance.js';
import {damageCapitalMount,updatePatrolCapitalAttack} from '../../src/game/capitalCombat.js';
import {picketDishTilt,jammed,ordnanceEnemy,fieldRackProgress,leavingScreen} from '../../src/game/picketField.js';
import {SHIPS} from '../../src/game/data.js';
import {integrateFlightTurn,integrateFlightVelocity} from '../../src/game/flightDynamics.js';
import {checkpointFrigateEncounter,restoreFrigateEncounter} from '../../src/game/frigateEncounters.js';
import {patrolCorvette} from '../../src/game/corvetteMounts.js';
import {RUN_WAVES} from '../../src/game/arenaRun.js';
import {updateAutomaticTurrets} from '../../src/game/turrets.js';
import {segmentShipColliderHit} from '../../src/game/shipCollision.js';

const step=1/60;
function setup(variant){
    const game=session(),ship=game.spawnCorvette(variant,[0,0,0]);
    Object.assign(ship,{rotation:[0,0,0,1],hostile:true,targetId:'player',holdFire:false});
    game.save.world.time=0;game.playWorldSound=()=>{};
    return {game,ship,player:game.save.player};
}
function trial(id,range,toward,breakAway){
    const {game,ship,player}=setup('siege'),stats=SHIPS[id];
    player.shipId=id;
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),toward?Math.PI:0);
    const velocity=new Vector3(0,0,-stats.maxSpeed).applyQuaternion(rotation),spin=new Vector3(),nose=new Vector3();
    // The pilot crosses the stated range at the white freeze cue.
    const position=new Vector3(0,0,-range-velocity.z*1.5);
    let cue,shots=0,hits=0;
    let audioCues=0;game.audio.playCockpit=id=>{if(id==='lance-freeze')audioCues++;};
    game.ui.flashBreakCue=()=>{assert.equal(cue,undefined);cue=game.save.world.time;};
    game.damagePlayer=amount=>{assert.equal(amount,LANCE.damageFlat);hits++;};
    game.renderer.showCombatBeam=id=>{if(id.endsWith(':rail'))shots++;};
    for(let tick=0;tick<=181;tick++){
        game.save.world.time=tick*step;
        position.toArray(player.position);rotation.toArray(player.rotation);
        updateSiegeLance(game,ship,position);
        const pitch=breakAway&&game.save.world.time>=cue+.3?1:0;
        integrateFlightTurn(rotation,spin,pitch,0,0,stats.angularAcceleration,stats.angularDamping,true,false,step);
        nose.set(0,0,-1).applyQuaternion(rotation);
        integrateFlightVelocity(velocity,nose,stats.maxSpeed,stats.maxSpeed,stats.acceleration,true,false,1,step,stats.lateralMultiplier);
        position.addScaledVector(velocity,step);
    }
    assert.equal(cue,1.5);assert.equal(audioCues,1);assert.equal(shots,1);
    return hits;
}
test('axial Mercury, Loki and Tyr pilots can pitch off the frozen ray at cruise after a 0.3 s reaction',()=>{
    for(const id of ['talon','speedster','legionary'])for(const range of [800,1400])for(const toward of [true,false]){
        const context=[id,range,toward].join('/');
        assert.equal(trial(id,range,toward,false),1,'straight '+context);
        assert.equal(trial(id,range,toward,true),0,'break '+context);
    }
});
test('a destroyed rangefinder shortens lance reach and freezes two seconds early, and the capacitor disables it',()=>{
    const {game,ship}=setup('siege');ship.capitalMountHull[1]=0;
    const target=new Vector3(0,0,-1200);updateSiegeLance(game,ship,target);assert.ok(!ship.lance.active);
    target.z=-900;updateSiegeLance(game,ship,target);game.save.world.time=1;updateSiegeLance(game,ship,target);
    assert.ok(ship.lance.frozen);ship.capitalMountHull[0]=0;updateSiegeLance(game,ship,target);
    assert.ok(ship.capitalDisarmed&&!ship.lance.active);
});
test('each half-second lights one rod joint through freeze, discharge and capacitor loss',()=>{
    for(const blind of [false,true]){
        const {game,ship}=setup('siege'),target=new Vector3(0,0,-450);
        if(blind)ship.capitalMountHull[1]=0;
        const frozenAt=blind?60:90;
        for(let i=0;i<=190;i++){
            game.save.world.time=i/60;
            updateSiegeLance(game,ship,target);
            assert.equal(ship.lanceCoils,i<180?Math.floor(i/30):i<186?6:0,'tick '+i);
            assert.equal(ship.lance.frozen,i>=frozenAt&&i<180);
            assert.deepEqual(ship.lance.origin.toArray(),[0,0,-32]);
        }
        game.save.world.time=16;updateSiegeLance(game,ship,target);
        game.save.world.time=18;updateSiegeLance(game,ship,target);assert.equal(ship.lanceCoils,4);
        ship.capitalMountHull[0]=0;updateSiegeLance(game,ship,target);assert.equal(ship.lanceCoils,0);
    }
});
test('both Heimdall flank lasers fire and take damage independently',()=>{
    for(const destroyed of [5,6]){
        const {game,ship,player}=setup('siege');player.position=[0,170,-60];
        const shots=new Set();game.fireBeam=(_id,_weapon,muzzle,_direction,key)=>shots.add(Math.sign(muzzle.x));
        function fire(){
            for(let i=0;i<240;i++){
                game.save.world.time+=step;ship.energy=200;
                updateAutomaticTurrets(game,ship,ship.id,step);
            }
            return [...shots].sort();
        }
        assert.deepEqual(fire(),[-1,1]);
        const mount=capitalHull(ship).mounts[destroyed];
        assert.equal(damageCapitalMount(ship,mount.hitCenter,100),destroyed);
        shots.clear();assert.deepEqual(fire(),[destroyed===5?1:-1]);
    }
});
test('the Heimdall bore stays clear up to the breech and both drums take capacitor hits',()=>{
    const {ship}=setup('siege');
    const trace=(a,b)=>segmentShipColliderHit(a,b,ship.position,ship.rotation,'siege',2);
    for(const [x,y] of [[0,0],[.5,0],[-.5,0],[0,.5],[0,-.5]]){
        assert.equal(trace(new Vector3(x,y,-33),new Vector3(x,y,4.4)),undefined);
    }
    for(const z of [8.45,16.05]){
        const a=new Vector3(0,20,z),b=new Vector3(0,0,z),hit=trace(a,b);
        assert.notEqual(hit,undefined);
        assert.equal(damageCapitalMount(ship,a.lerp(b,hit).toArray(),10),0);
    }
});
test('the lance stops at terrain and fractured wrecks and withholds a shot through its escort',()=>{
    const {game,ship,player}=setup('siege');player.position=[0,0,-800];let hits=0;
    game.damagePlayer=()=>{hits++;};
    const start=new Vector3(0,.1,-32),dir=new Vector3(0,0,-1),fire=()=>game.fireBeam(ship.id,LANCE,start,dir,'rail');
    game.obstacles.push({id:'rock',x:0,y:0,z:-300,losRadius:25});fire();assert.equal(hits,0);
    const wreck={id:'wreck',shape:'wreck-mesh',prevPosition:new Vector3(0,0,-300),position:new Vector3(0,0,-300),cover:true,surfaceOnly:true,x:0,y:0,z:-300,losRadius:30,
        box:{hx:20,hy:20,hz:2,qx:0,qy:0,qz:0,qw:1},meshVerts:new Float32Array([-20,-20,0,20,-20,0,0,20,0]),meshIndices:new Uint16Array([0,1,2])};
    game.obstacles[0]=wreck;fire();assert.equal(hits,0);
    game.obstacles.length=0;const escort=game.spawnShip('patrol',[0,0,-300],undefined,undefined,undefined,{faction:'alliance',hullId:'legionary'});
    escort.rotation=[0,0,0,1];assert.equal(fire(),false);assert.equal(hits,0);
    let collateral;
    escort.faction='independents';game.damageShip=victim=>{collateral=victim;};fire();
    assert.equal(collateral,escort);assert.equal(hits,0);
    escort.position[0]=100;fire();assert.equal(hits,1);
});
test('the field doubles acquisition at either end, drops overdue tracks and spares friendly locks',()=>{
    const {game,ship,player}=setup('picket'),foe={position:[400,8.54,12.96]};
    const launcher={lockTime:2,lockRange:800,acquireCone:90,holdCone:90},record={};
    player.position=[600,0,0];assert.ok(jammed(game,player,player.position,foe.position));assert.ok(!jammed(game,ship,foe.position));
    const acquire=(actor,mobility=1)=>{
        let progress=0;
        for(let tick=1;tick<=240;tick++){
            const next=fieldRackProgress(game,actor,foe,record,progress,launcher,null,500,1,0,step,mobility);
            if(next===1 || next===0&&progress>0)return [tick,next];
            progress=next;
        }
    };
    assert.deepEqual(acquire(ship),[90,1]);assert.deepEqual(acquire(player),[180,1]);
    assert.deepEqual(acquire(player,.5),[181,0]);player.position=[0,0,0];foe.position=[700,0,0];assert.deepEqual(acquire(player),[180,1]);
    const a=new Vector3(0,11.68,16),b=new Vector3(0,11.68,9);
    const fraction=segmentShipColliderHit(a,b,ship.position,ship.rotation,'picket',2);
    assert.notEqual(fraction,undefined);
    assert.equal(damageCapitalMount(ship,a.clone().lerp(b,fraction).toArray(),150),0);
    game.corvetteSubsystemDestroyed(ship,0);assert.deepEqual(acquire(player),[90,1]);
    assert.equal(segmentShipColliderHit(a,b,ship.position,ship.rotation,ship.collisionVariant,2),undefined);
});
test('fixed-step radar rotates both its display pose and its hittable metal, then freezes on destruction',()=>{
    function flight(){
        const {ship,game}=setup('picket');
        // An idle observer still runs the fixed clock without combat steering.
        game.arena={observer:true};game.pickups=[];game.renderer.updateWorld=()=>{};
        return {ship,game};
    }
    const a=flight(),b=flight();
    const tick=({game})=>game.updateSimulation(step,{});
    tick(a);tick(b);
    const initial=a.ship.rotorAngle;
    for(let i=0;i<180;i++){tick(a);tick(b);}
    assert.ok(Math.abs(a.ship.rotorAngle-initial-Math.PI/2)<1e-10);
    assert.ok(Math.abs(a.ship.rotorAngle-a.ship.prevRotorAngle-Math.PI/360)<1e-10);
    assert.equal(a.ship.rotorAngle,b.ship.rotorAngle);
    // Cross the high aft rim. A quarter turn puts the lower side rim below this segment.
    function sight(angle){
        const x=3.63*Math.sin(angle);
        const z=12.96+3.63*Math.cos(angle);
        return [new Vector3(x,12,z),new Vector3(x,10.05,z)];
    }
    const ship=a.ship,live=ship.rotorAngle;
    assert.equal(picketDishTilt(ship),0);
    const hit=ray=>segmentShipColliderHit(...ray,ship.position,ship.rotation,ship.collisionVariant??'picket',2,0,undefined,ship.rotorAngle);
    const ray=sight(live),fraction=hit(ray);
    assert.notEqual(fraction,undefined);assert.equal(hit(sight(initial)),undefined);
    assert.equal(damageCapitalMount(ship,ray[0].clone().lerp(ray[1],fraction).toArray(),150),0);
    a.game.corvetteSubsystemDestroyed(ship,0);
    for(let i=0;i<60;i++)tick(a);
    assert.equal(ship.rotorAngle,live);assert.equal(ship.prevRotorAngle,live);
    assert.equal(hit(ray),undefined);
    ship.frigateEncounterId=ship.id;
    checkpointFrigateEncounter(a.game);
    const snapshot=structuredClone(a.game.save);
    const state=snapshot.world.frigateEncounter.members[0].state;
    assert.ok(!('rotorAngle' in state)&&!('rotorPhase' in state));
    const restored=session();restored.arena=undefined;restored.save=snapshot;
    assert.ok(restoreFrigateEncounter(restored));restored.pickups=[];
    restored.snapshotInterpolationState(step);
    assert.equal(restored.ships[0].rotorAngle,live);
    assert.equal(picketDishTilt(ship),25*Math.PI/180);
    assert.equal(picketDishTilt(restored.ships[0]),picketDishTilt(ship));
});
test('Tacita wires its four dorsal turrets to their authored seats',()=>{
    const {ship}=setup('picket');
    const weapons=capitalHull(ship).weapons;
    assert.deepEqual(weapons.map(m=>m.node),['mount_laser_port','mount_laser_starboard','mount_pdc_port','mount_pdc_starboard']);
    for(const mount of weapons){
        assert.deepEqual(mount.normal,[0,1,0]);
        assert.equal(damageCapitalMount(ship,mount.hitCenter,mount.hull),mount.index);
    }
});
test('legacy Tacita checkpoints carry damage and fittings to both replacement PDCs',()=>{
    const {game,ship}=setup('picket');
    ship.frigateEncounterId=ship.id;
    checkpointFrigateEncounter(game);
    const snapshot=structuredClone(game.save);
    const {state}=snapshot.world.frigateEncounter.members[0];
    delete state.picketLayout;
    state.capitalMountHull=[150,100,120,20,110,17,31,0];
    state.combatFit.turrets=[null,null,null,null,null,'tracking-turret','tracking-turret','pdc'];
    const resumed=session();resumed.arena=undefined;resumed.save=snapshot;
    assert.ok(restoreFrigateEncounter(resumed));
    assert.deepEqual(resumed.ships[0].capitalMountHull,[150,100,120,20,17,31,0,0]);
    assert.deepEqual(resumed.ships[0].combatFit.turrets.slice(4),['tracking-turret','tracking-turret','pdc','pdc']);
});
test('hostile rounds lose guidance permanently and the dorsal PDCs defend nearby escorts',()=>{
    const {game,ship,player}=setup('picket');player.position=[0,500,0];ship.targetId=undefined;
    const escort=game.spawnShip('patrol',[140,80,-10],undefined,undefined,undefined,{faction:'concord'});
    const slot=game.projStore.alloc();game.projStore.setPos(slot,0,80,-10);game.projStore.setVel(slot,10,0,0);
    const missile={id:'guided',kind:'missile',ownerId:'player',targetId:escort.id,slot,hull:1,life:8,damage:20};
    game.projectiles.push(missile);game.updateProjectiles(step);
    assert.ok(missile.lostTrack);assert.equal(game.projStore.vel[slot*3],10);
    for(let i=0;i<120&&missile.life>0;i++){
        game.save.world.time+=step;updateAutomaticTurrets(game,ship,ship.id,step);game.updateProjectiles(step);
    }
    assert.ok(missile.life<=0,'intercepted before its lifetime expired');
});
test('tier two patrol rolls, two escorts, subsystem checkpoint and Arena lineups',()=>{
    for(const [faction,id,level] of [['alliance','siege',14],['concord','picket',19]]){
        for(const [danger,count] of [[.25,0],[.4,10],[.8,10]]){
            let n=0;for(let i=0;i<100;i++)if(patrolCorvette(faction,{danger},()=>i/100)===id)n++;
            assert.equal(n,count);
        }
        const game=session();game.arena=undefined;
        const ship=game.spawnShip('patrol',[0,0,600],undefined,undefined,undefined,{patrolCapital:id});
        assert.equal(game.ships.filter(s=>s.convoyLeader===ship).length,2);
        assert.equal(game.careerFrigateEncounterOpen(),false);
        ship.capitalMountHull[0]=0;game.corvetteSubsystemDestroyed(ship,0);
        checkpointFrigateEncounter(game);const saved=structuredClone(game.save);
        const resumed=session();resumed.arena=undefined;resumed.save=saved;assert.ok(restoreFrigateEncounter(resumed));
        const restored=resumed.ships.find(s=>s.variant===id);assert.equal(restored.capitalMountHull[0],0);
        assert.equal(resumed.ships.filter(s=>s.convoyLeader===restored).length,2);
        if(id==='picket'){
            const escort=resumed.ships.find(s=>s.convoyLeader);escort.position=[400,0,600];
            assert.ok(leavingScreen(escort,[700,0,600]));assert.ok(!leavingScreen(escort,[200,0,600]));
        }
        assert.ok(RUN_WAVES[level-1].groups.some(g=>g.enemies.some(e=>e.capital&&e.hullId===id)));
    }
});

test('Heimdall turns its actual bow and fires at a hostile NPC under the same freeze and range rules',()=>{
    const {game,ship,player}=setup('siege');
    player.position=[0,2000,0];
    const enemy=game.spawnShip('patrol',[1200,0,0],undefined,undefined,undefined,{faction:'concord',hullId:'talon'});
    ship.targetId=enemy.id;game.getAvoidanceVector=()=>undefined;
    const point=new Vector3(...enemy.position);
    let hits=0;game.damageShip=(victim,amount)=>{assert.equal(victim,enemy);assert.equal(amount,150);hits++;};
    // Only the lance participates in this broadside-to-bow acquisition trial.
    for(const gun of capitalHull(ship).weapons)ship.capitalMountHull[gun.index]=0;
    for(let i=0;i<820&&!hits;i++){
        game.save.world.time=i*step;
        updatePatrolCapitalAttack(game,ship,point,enemy.velocity,step);
        if(i===120)assert.ok(!ship.lance.active,'still turning through the blind arc');
    }
    assert.equal(hits,1);assert.ok(ship.capitalRelocateUntil>game.save.world.time);
});

test('cold encounter restore rebuilds damaged capital colliders before wreck fracture',()=>{
    const game=session();
    for(const variant of ['picket','drover','barge','caravan','rookery','ironjaw','siege']){
        const ship=game.spawnCorvette(variant,[0,0,600]);
        ship.frigateEncounterId='checkpoint';
        const mounts=capitalHull(ship).mounts;
        const part=mounts.find(m=>m.partBit||m.kind==='pod')??mounts[0];
        ship.capitalMountHull[part.index]=0;
        game.corvetteSubsystemDestroyed(ship,part.index);
    }
    checkpointFrigateEncounter(game);
    const child=spawnSync(process.execPath,['--import','./tests/helpers/offline-imports.mjs','--input-type=module','-e',`
        import assert from 'node:assert/strict';
        import {readFileSync} from 'node:fs';
        import {session} from './tests/helpers/session.mjs';
        import {restoreFrigateEncounter} from './src/game/frigateEncounters.js';
        import {spawnCover} from './src/game/wreckCover.js';
        import {SHIP_COLLIDERS} from './src/game/shipCollision.js';
        const game=session();
        game.arena=undefined;
        game.save=JSON.parse(readFileSync(0,'utf8'));
        assert.equal(SHIP_COLLIDERS['picket-pods-1'],undefined);
        assert.ok(restoreFrigateEncounter(game));
        for(const ship of game.ships){
            const key=ship.missingPods?ship.variant+'-pods-'+ship.missingPods:ship.variant;
            assert.equal(ship.collisionVariant??ship.variant,key);
            assert.ok(SHIP_COLLIDERS[key],key);
            game.coverSections=[];
            assert.ok(spawnCover(game,ship,ship.variant,2).length,key);
        }
    `],{input:JSON.stringify(game.save),encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
});

test('a wreck drifting at three units per second blocks the frozen lance and sightline',()=>{
    const {game,ship,player}=setup('siege');
    player.position=[0,0,-800];
    // The current right edge covers the frozen ray by 0.01 units.
    const position=new Vector3(0,0,-300);
    game.obstacles.push({id:'edge',shape:'wreck-mesh',cover:true,surfaceOnly:true,
        position,prevPosition:position.clone().add(new Vector3(-3*step,0,0)),
        x:0,y:0,z:-300,losRadius:30,box:{hx:20,hy:20,hz:2,qx:0,qy:0,qz:0,qw:1},
        meshVerts:new Float32Array([-20,0,0,.01,-20,0,.01,20,0]),meshIndices:new Uint16Array([0,1,2])});
    const start=new Vector3(0,.1,-32);
    let hits=0;game.damagePlayer=()=>hits++;
    game.fireBeam(ship.id,LANCE,start,new Vector3(0,0,-1),'rail');
    assert.equal(hits,0);
    assert.ok(game.lineBlocked(start,new Vector3(...player.position),ship.id));
});

test('neutral Tacita defends its group against the first targeted salvo',()=>{
    const {game,ship,player}=setup('picket');
    game.arena=undefined;ship.hostile=false;ship.targetId=undefined;player.position=[0,500,0];
    const escort=game.spawnShip('patrol',[140,80,-10],undefined,undefined,undefined,{faction:'concord'});
    escort.convoyLeader=ship;
    const shooter=game.spawnShip('trader',[0,550,0],undefined,undefined,undefined,{faction:'independents'});
    const wing=game.spawnShip('escort',[0,600,0]);wing.arenaRunWingman=true;
    const launcher={lockTime:2,lockRange:800,acquireCone:90,holdCone:90};
    const progress=(actor,target)=>fieldRackProgress(game,actor,target,{},0,launcher,null,500,1,0,step,1);
    for(const actor of [player,wing,shooter]){
        const ownerId=actor===player?'player':actor.id;
        const base=progress(actor,shooter);
        for(const target of [ship,escort]){
            assert.equal(progress(actor,target),base/2);
            assert.ok(ordnanceEnemy(game,ship,{ownerId,targetId:target.id}));
        }
        assert.equal(ordnanceEnemy(game,ship,{ownerId,targetId:shooter.id}),false);
    }
    const slot=game.projStore.alloc();game.projStore.setPos(slot,0,80,-10);game.projStore.setVel(slot,10,0,0);
    const missile={id:'first',kind:'missile',ownerId:'player',targetId:escort.id,slot,hull:1,life:8,damage:20};
    game.projectiles.push(missile);game.updateProjectiles(step);
    assert.ok(missile.lostTrack);
    for(let i=0;i<120&&missile.life>0;i++){
        game.save.world.time+=step;updateAutomaticTurrets(game,ship,ship.id,step);game.updateProjectiles(step);
    }
    assert.ok(missile.life<=0);
    ship.combatThreatId=shooter.id;ship.combatThreatUntil=game.save.world.time+2;
    assert.ok(ordnanceEnemy(game,ship,{ownerId:shooter.id,targetId:wing.id}));
    ship.hostile=true;
    for(const ownerId of ['player',wing.id])assert.ok(ordnanceEnemy(game,ship,{ownerId,targetId:shooter.id}));
});

test('Heimdall holds the lance when the first hit is an allied drone',()=>{
    const {game,ship,player}=setup('siege');ship.hostile=false;
    player.position=[100,0,-300];
    const drone={id:'screen',type:'pdc',hull:10,state:'escort',position:[0,.1,-250]};
    player.droneFleet.unitsById[drone.id]=drone;
    const fire=()=>game.fireBeam(ship.id,LANCE,new Vector3(0,.1,-32),new Vector3(0,0,-1),'rail');
    let hits=0;game.damagePdcDrone=()=>hits++;
    assert.equal(fire(),false);assert.equal(hits,0);
    delete player.droneFleet.unitsById[drone.id];
    const ally=game.spawnShip('patrol',[100,0,-200],undefined,undefined,undefined,{faction:'alliance'});
    drone.ownerId=ally.id;game.npcDroneUnits={[drone.id]:drone};
    assert.equal(fire(),false);assert.equal(drone.hull,10);
    drone.ownerId=ship.id;assert.equal(fire(),false);
    drone.position[0]=100;assert.notEqual(fire(),false);
});

test('target monitor reports jamming at the pilot end of a lock',()=>{
    const {session:game,save}=tutorialFixture();
    save.player.dockedAt=undefined;save.player.position=[0,0,0];
    const picket=game.spawnCorvette('picket',[0,0,100]);picket.hostile=true;
    const target=game.spawnCorvette('siege',[0,0,-800]);
    game.renderer.projectTargetToScreen=()=>({visible:false,x:0,y:0});
    game.targetEdge=()=>undefined;
    game.getTargetRef=()=>({kind:'ship',id:target.id,position:target.position});
    assert.equal(game.buildHudModel().target.readout,t('JAMMED'));
    save.player.position=[0,0,-600];assert.notEqual(game.buildHudModel().target.readout,t('JAMMED'));
});
