import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {session} from '../helpers/session.mjs';
import {planCoverBreak, planTerrainFlank, flyFieldTactic, tryFieldAmbush} from '../../src/game/combatTactics.js';
import {advanceFieldRoadmap, requestFieldRoadmap, corridorClear} from '../../src/game/fieldRoadmap.js';
import {regenerateCombatResources, registerCombatShieldHit} from '../../src/game/combatResources.js';
import {updateShipAI} from '../../src/game/shipAI.js';
import {GameUI} from '../../src/game/ui.js';
import {wingTailThreat} from '../../src/game/wingOrders.js';

const vector = a => new THREE.Vector3().fromArray(a);
const forward = new THREE.Vector3(0,0,-1);
function field(x, z, radius) {
    const s = session();
    s.activeInstanceId = 'shardbelt';
    s.tmpCollide = new THREE.Vector3();
    s.tmpEuler = new THREE.Euler();
    s.playerExposureRange = () => 2000;
    s.announceSearchStart = () => {};
    s.obstacles = [{id:'rock',shape:'asteroid',x,y:0,z,radius,collisionRadius:radius,losRadius:radius}];
    requestFieldRoadmap(s, [0,0,0]);
    advanceFieldRoadmap(s, Infinity);
    return s;
}
function fighter(s, at) {
    const ship = s.spawnShip('pirate', at, undefined, undefined, {tier:'veteran',temperament:'steady'}, {hullId:'talon'});
    Object.assign(ship, {targetId:'player', hostile:true, playerAwareness:1, velocity:[0,0,0]});
    ship.combatFit.turrets = [];
    ship.combatFit.missiles = 0;
    s.npcFlightStats(ship);
    return ship;
}
function waitForCover(s, ship) {
    for (let i=0; i<60 && !ship.fieldTactic?.kind; i++) {
        s.save.world.time += 1/60;
        updateShipAI(s, ship, 1/60);
    }
    assert.equal(ship.fieldTactic?.kind, 'cover');
}
function concealedHunter(s) {
    const ship = fighter(s, [0,0,100]);
    Object.assign(ship, {fireRange:400, passPhase:0, playerTrackOccluded:true,
        gunAim:{targetId:'player',observedAt:s.save.world.time,velocity:vector([120,0,0])}});
    s.beginSearch(ship, [0,0,-100], 'hostile');
    return ship;
}

for (const arena of [false,true]) {
    test((arena ? 'Arena' : 'Career')+' fighter restores collapsed shields in actual cover and resumes fire', () => {
        const s = field(120, 160, 60);
        s.arena = arena ? {run:true} : undefined;
        const ship = fighter(s, [0,0,180]);
        ship.rotation = new THREE.Quaternion().setFromUnitVectors(forward,vector([1,0,1]).normalize()).toArray();
        ship.shield = 0;
        ship.shieldDelay = 4.5;
        registerCombatShieldHit(ship);
        let held = 0, breaks = 0, shieldAtExit, lastShot = 0;
        s.onFieldTactic = (_,kind) => { if (kind === 'cover') breaks++; };
        for (let i=0;i<60*40;i++) {
            s.save.world.time = i/60;
            ship.shieldDelay -= 1/60;
            ship.fireCooldown -= 1/60;
            regenerateCombatResources(ship,ship.combatFit.resources,1/60,ship.shieldDelay);
            const before = s.projectileCounter;
            updateShipAI(s, ship, 1/60);
            s.resolveNpcCollisions(ship);
            if (s.projectileCounter > before) lastShot = i/60;
            if (ship.fieldTactic?.kind === 'cover' && ship.fieldTactic.holdUntil) {
                if (s.lineBlocked(vector(ship.position),vector(s.save.player.position))) held++;
            } else if (held && shieldAtExit === undefined) shieldAtExit = ship.shield;
            if (arena) assert.ok(!ship.surrendered && !ship.fleeing && ship.task?.kind !== 'flee');
        }
        assert.equal(breaks,1);
        assert.ok(held >= 60 && shieldAtExit > 0, 'at least a second in shadow and real capacitor-funded recharge');
        assert.ok(held <= 301,'concealment hold is capped at five seconds');
        assert.ok(ship.combatPlan.recovery.finishedAt <= 15);
        assert.ok(lastShot > ship.combatPlan.recovery.finishedAt);
    });
}
test('a cover break abandons an exposed shadow when its pilot sees the attacker round the rock', () => {
    const s = field(120,160,60), ship = fighter(s,[0,0,180]);
    ship.shield = 0;
    ship.shieldDelay = 4.5;
    registerCombatShieldHit(ship);
    waitForCover(s, ship);
    const tactic = ship.fieldTactic;
    assert.equal(tactic?.kind,'cover');
    const goal = vector(tactic.route.at(-1));
    assert.ok(s.lineBlocked(vector(s.save.player.position),goal));
    s.save.player.position = [0,500,180];
    const attacker = vector(s.save.player.position);
    assert.ok(!s.lineBlocked(attacker,goal) && !s.lineBlocked(attacker,vector(ship.position)));
    s.save.world.time += .5;
    do {
        flyFieldTactic(s,ship,1/60);
        s.save.world.time += 1/60;
    } while (tactic.kind && tactic.replanning && s.save.world.time < 3);
    assert.deepEqual(tactic.anchor,s.save.player.position);
    if (tactic.kind) {
        const newGoal = vector(tactic.route.at(-1));
        assert.ok(!newGoal.equals(goal) && s.lineBlocked(attacker,newGoal));
    } else assert.equal(ship.combatPlan.recovery.active,false);
});
test('one fighter holds pressure while its partner flies a hull-clear roadmap route to a side firing position', () => {
    const s = field(180,130,100);
    const bait = fighter(s,[0,0,350]), ship = fighter(s,[0,-50,200]);
    const target = vector(s.save.player.position), start = vector(ship.position);
    const plan = {position:start,visible:true,recovery:{active:false}};
    bait.combatPlan = {visible:true};
    bait.fireRange = 450;
    ship.fireRange = 450;
    const team = {members:s.ships,leader:bait};
    planTerrainFlank(s,bait,plan,team,target,0);
    assert.ok(!bait.fieldTactic?.kind);
    planTerrainFlank(s,ship,plan,team,target,0);
    const route = ship.fieldTactic.route;
    let from = start;
    for (const waypoint of route) {
        const to = vector(waypoint);
        assert.ok(corridorClear(s,from,to));
        from = to;
    }
    assert.ok(route.length >= 2 && s.lineBlocked(start, from));
    assert.ok(!s.lineBlocked(from,target) && from.distanceTo(target) <= ship.fireRange);
    assert.ok(from.clone().sub(target).dot(vector(bait.position).sub(target)) <= 0);
    ship.rotation = new THREE.Quaternion().setFromUnitVectors(forward,vector(route[0]).sub(start).normalize()).toArray();
    for (let i=0;i<=660;i++) {
        s.save.world.time=i/60;
        if (!flyFieldTactic(s,ship,1/60)) break;
        s.resolveNpcCollisions(ship);
    }
    const arrival = vector(ship.position);
    assert.ok(!ship.fieldTactic.kind && arrival.distanceTo(start) > 100);
    assert.ok(arrival.distanceTo(target) <= ship.fireRange && !s.lineBlocked(arrival,target));
    assert.ok(arrival.sub(target).dot(vector(bait.position).sub(target)) <= 0);
    assert.equal(ship.combatBumpAt,undefined);
});
test('a flanker reaches the live target’s side as the target moves past rock', () => {
    const s=field(180,130,100), bait=fighter(s,[0,0,350]), ship=fighter(s,[0,-50,200]);
    const start=vector(ship.position), target=vector(s.save.player.position), motion=vector([-20,0,0]);
    const plan={position:start,visible:true,recovery:{active:false},targetVelocity:motion};
    bait.combatPlan={visible:true};
    bait.fireRange=450;
    ship.fireRange=450;
    motion.toArray(s.save.player.velocity);
    const events=[];
    s.onFieldTactic=(_,event)=>events.push(event);
    planTerrainFlank(s,ship,plan,{members:s.ships,leader:bait},target,0);
    assert.equal(ship.fieldTactic?.kind,'flank');
    for(let i=0;i<840 && ship.fieldTactic.kind;i++){
        s.save.world.time=i/60;
        target.copy(motion).multiplyScalar(i/60).toArray(s.save.player.position);
        flyFieldTactic(s,ship,1/60);
        s.resolveNpcCollisions(ship);
    }
    const arrival=vector(ship.position);
    assert.deepEqual(events,['flank','flankArrival']);
    assert.ok(target.length()>40 && arrival.distanceTo(start)>100);
    assert.ok(arrival.distanceTo(target)<=ship.fireRange && !s.lineBlocked(arrival,target));
    assert.ok(arrival.sub(target).dot(vector(bait.position).sub(target))<=0);
});

test('a committed move interrupted on the next tick stays off the radio', () => {
    const s=field(120,160,60),ship=fighter(s,[0,0,180]),calls=[],reasons=[];
    s.tacticalBark=(_,kind)=>calls.push(kind);
    s.onFieldTacticEnd=(_,reason)=>reasons.push(reason);
    ship.shield=0;
    ship.shieldDelay=4.5;
    waitForCover(s, ship);
    ship.targetId=undefined;
    s.save.world.time+=.3;
    assert.equal(flyFieldTactic(s,ship,1/60),false);
    assert.deepEqual(reasons,['targetChanged']);
    assert.deepEqual(calls,[]);
});

test('a concealed ambusher needs observed motion and a real track, and waits at most four seconds', () => {
    const s = field(0,0,60), ship = fighter(s,[0,0,100]);
    ship.fireRange = 400;
    const calls=[];
    s.tacticalBark=(_,kind)=>calls.push(kind);
    s.save.player.position=[0,0,-100];
    ship.passPhase=0;
    ship.playerTrackOccluded=true;
    s.beginSearch(ship,s.save.player.position,'hostile');
    tryFieldAmbush(s,ship,0);
    assert.ok(!ship.fieldTactic, 'a stationary last-known position gives no opening');
    ship.gunAim={targetId:'player',observedAt:0,velocity:vector([120,0,0])};
    tryFieldAmbush(s,ship,1);
    assert.equal(ship.fieldTactic.kind,'ambush');
    s.save.world.time=1;
    assert.ok(flyFieldTactic(s,ship,1/60));
    assert.deepEqual(calls,[]);
    ship.playerTrackOccluded=false;
    s.save.player.position=[80,0,100];
    s.save.world.time=2;
    assert.equal(flyFieldTactic(s,ship,1/60),false);
    assert.deepEqual(calls,[],'reacquisition alone cannot announce a shot');
    assert.ok(ship.fieldTactic.firingUntil);
    s.save.world.time=ship.fieldTactic.firingUntil+.3;
    flyFieldTactic(s,ship,1/60);
    assert.equal(ship.fieldTactic.kind,null);
    const second=fighter(s,[0,0,100]);
    Object.assign(second,{fireRange:400,passPhase:0,playerTrackOccluded:true,search:{kind:'hostile',anchor:[0,0,-100]}});
    second.gunAim={targetId:'player',observedAt:2,velocity:vector([120,0,0])};
    tryFieldAmbush(s,second,2);
    assert.equal(second.fieldTactic.kind,'ambush');
    s.save.world.time=6;
    assert.equal(flyFieldTactic(s,second,1/60),false);
    assert.deepEqual(calls,[]);
});
test('tactical comms share one global gap, rotate lines across speakers and yield to mission dialogue', () => {
    const s=session(), a=fighter(s,[0,0,100]), b=fighter(s,[50,0,100]);
    a.portraitIndex=b.portraitIndex=0;
    const heard=[];
    s.ui.showPilotLine=(name,line)=>heard.push(line);
    s.tacticalBark(a,'flank');
    s.tacticalBark(b,'drive');
    assert.equal(heard.length,1);
    s.save.world.time=8;
    s.tacticalBark(a,'flank');
    assert.equal(heard.length,1);
    for (let i=1;i<=6;i++) {
        s.save.world.time=i*9;
        s.tacticalBark(i%2?a:b,'flank');
        assert.notEqual(heard.at(-1),heard.at(-2));
    }
    assert.equal(new Set(heard).size,3);
    s.save.world.time=70;
    s.storyLineUntil=80;
    s.tacticalBark(a,'cover');
    assert.equal(heard.length,7);
    s.save.world.time=81;
    s.ui.commsMessage={story:true,pinned:false};
    s.tacticalBark(a,'cover');
    assert.equal(heard.length,7);
    s.ui.commsMessage={pinned:true};
    s.tacticalBark(a,'cover');
    assert.equal(heard.length,7);
});
test('a wingman only calls a tracking pursuer in the rear hemisphere', () => {
    const s=session(), ally=fighter(s,[0,50,0]), enemy=fighter(s,[0,0,150]);
    ally.hostile=false;
    enemy.rotation=[0,0,0,1];enemy.fireRange=400;
    const detect=()=>wingTailThreat(s,ally,vector(ally.position),vector(s.save.player.position),new THREE.Vector3(),new THREE.Vector3());
    assert.equal(detect(),enemy.id);
    enemy.playerTrackOccluded=true;assert.equal(detect(),undefined);
    enemy.playerTrackOccluded=false;enemy.rotation=[0,1,0,0];assert.equal(detect(),undefined);
    enemy.rotation=[0,0,0,1];enemy.position=[0,0,-150];assert.equal(detect(),undefined);
});

test('opponents with collapsed shields do not both break away', () => {
    const s=field(120,160,60);
    s.save.player.position=[10000,0,0];
    const first=fighter(s,[0,0,180]), second=fighter(s,[0,0,0]);
    // Hold both poses while their decisions share the session's planning budget.
    s.integrateNpcFlight=()=>{};
    for(const [ship,target] of [[first,second],[second,first]]) {
        ship.targetId=target.id;
        ship.shield=0;
        ship.shieldDelay=4.5;
        s.updateAttackAI(ship, vector(target.position), vector(target.velocity), 1/60);
    }
    for(let i=1;i<=60 && !first.fieldTactic?.kind;i++) {
        s.save.world.time=i/60;
        for(const [ship,target] of [[first,second],[second,first]]) {
            s.updateAttackAI(ship, vector(target.position), vector(target.velocity), 1/60);
        }
    }
    assert.equal(first.fieldTactic?.kind,'cover');
    assert.equal(second.combatPlan.recovery.active,false);
});

test('a hunter takes a shadow on a moving pilot’s approach and fires after the pilot passes', () => {
    const s=field(120,160,60), ship=fighter(s,[50,0,230]);
    ship.passPhase=0;
    ship.rotation=new THREE.Quaternion().setFromUnitVectors(forward,vector([1,0,1]).normalize()).toArray();
    const events=[];
    s.onFieldTactic=(_,kind)=>events.push({kind,time:s.save.world.time,searching:Boolean(ship.search)});
    const radio=[];
    s.tacticalBark=(_,kind)=>radio.push({kind,shots:s.projectileCounter});
    const shotTimes=[];
    let hiddenTicks=0;
    for(let step=0;step<720;step++) {
        s.save.world.time=step/60;
        s.save.player.position[2]=step/60*30;
        s.save.player.velocity[2]=30;
        ship.fireCooldown-=1/60;
        const before=s.projectileCounter;
        updateShipAI(s,ship,1/60);
        s.resolveNpcCollisions(ship);
        if(ship.fieldTactic?.kind==='ambush'&&ship.fieldTactic.holdUntil&&!s.shipTracksPlayer(ship))hiddenTicks++;
        if(s.projectileCounter>before)shotTimes.push(s.save.world.time);
    }
    assert.deepEqual(events.map(e=>e.kind),['ambush','spring']);
    assert.equal(events[0].searching,false,'pilot chose cover from a sighting');
    assert.ok(hiddenTicks>=30);
    assert.ok(shotTimes.includes(events[1].time),'spring coincides with a real shot on the same simulation tick');
    assert.equal(radio.length,1);
    assert.ok(radio[0].kind==='spring' && radio[0].shots>0,'opening salvo has already left the gun');
});

test('a simulator opponent outside the career traffic radius stays in the fight', () => {
    const s=field(120,160,60);
    s.arena={scenario:'1v1'};
    const ship=fighter(s,[0,0,s.playerStats().radarRange*2]);
    ship.lifetime=60;
    ship.shield=0;
    s.updateShips(1/60);
    assert.ok(ship.hull>0 && !ship.surrendered && !ship.fleeing);
    assert.equal(ship.targetId,'player');
});

test('an ambush, cover or flank leg brakes for its waypoint and for the plate beyond it', () => {
    for (const kind of ['ambush','cover','flank']) {
        const s=field(500,500,10), ship=fighter(s,[0,0,0]);
        let waypoint=[0,0,-100];
        s.save.player.position=[500,0,0];
        s.obstacles=[{id:'plate',shape:'debris-mesh',x:0,y:0,z:-40,radius:75,
            box:{hx:50,hy:50,hz:2,qx:0,qy:0,qz:0,qw:1}}];
        ship.velocity=[0,0,-40];
        ship.rotation=[0,0,0,1];
        ship.fieldTactic={kind,direct:kind!=='flank'};
        const integrate=s.integrateNpcFlight;
        let terrainLimited=false, stopLimited=false;
        s.integrateNpcFlight=function(ship,pos,vel,rot,desired,speed,...rest){
            const cap=ship.fieldNav.speedLimit, stop=Math.sqrt(2*ship.combatFit.stats.acceleration*pos.distanceTo(vector(waypoint)));
            assert.ok(speed<=cap && speed<=stop,kind+' exceeds a speed cap');
            terrainLimited ||= cap<ship.speed && cap<stop;
            stopLimited ||= stop<ship.speed && stop<cap;
            return integrate.call(this,ship,pos,vel,rot,desired,speed,...rest);
        };
        // A longer leg into the same plate isolates the terrain limit on the first tick.
        s.updateTravelAI(ship,1/60,waypoint,ship.speed);
        waypoint=[0,0,-20];
        assert.ok(ship.fieldNav.speedLimit < ship.speed);
        ship.position=[0,0,0]; ship.velocity=[0,0,-40]; ship.rotation=[0,0,0,1];
        ship.flightAngularVelocity.set(0,0,0);
        for(let i=0;i<90;i++){
            s.save.world.time=(i+1)/60;
            s.updateTravelAI(ship,1/60,waypoint,ship.speed);
            s.resolveNpcCollisions(ship);
        }
        assert.ok(terrainLimited && stopLimited,kind+' exercised both limits');
        assert.equal(ship.combatBumpAt,undefined);
    }
});

test('two simultaneous cover searches share the heading budget and both make progress', () => {
    const s=field(1000,1000,10), ships=[fighter(s,[0,0,180]),fighter(s,[60,0,180])];
    s.save.player.velocity=[20,0,0]; // Only direct shadows are reachable against this pilot.
    let rays=0;
    s.lineBlocked=()=>{rays++;return false;};
    const target=vector(s.save.player.position);
    const plans=ships.map(ship=>({position:vector(ship.position),threatPosition:target}));
    const done=new Set();
    for(let step=0;step<60 && done.size<2;step++){
        s.save.world.time=step/60;
        rays=0;
        for(let n=0;n<2;n++){
            if(done.has(n))continue;
            assert.equal(planCoverBreak(s,ships[n],plans[n],s.save.world.time),undefined);
            if(!ships[n].coverSearch?.pending)done.add(n);
        }
        assert.ok(rays<=50,'five headings of ten half-second samples across both pilots');
        if(step===1)assert.ok(ships.every(ship=>ship.coverSearch.index>0));
    }
    assert.equal(done.size,2);
});

test('a flank cannot arrive once the pressure pilot loses track, line of sight or weapon range', () => {
    for(const loss of ['search','track','terrain','range']){
        const s=field(180,130,100), bait=fighter(s,[0,0,350]), ship=fighter(s,[0,-50,200]);
        const target=vector(s.save.player.position), events=[], exits=[], radio=[];
        bait.combatPlan={visible:true};
        bait.fireRange=ship.fireRange=450;
        s.onFieldTactic=(_,event)=>events.push(event);
        s.onFieldTacticEnd=(_,reason)=>exits.push(reason);
        s.tacticalBark=(_,kind)=>radio.push(kind);
        planTerrainFlank(s,ship,{position:vector(ship.position),visible:true,recovery:{}},{members:s.ships,leader:bait},target,0);
        assert.equal(ship.fieldTactic.kind,'flank');
        ship.position=[0,0,-200];
        if(loss==='search')bait.search={phase:'approach'};
        if(loss==='track')bait.playerAwareness=0;
        if(loss==='terrain')bait.position=[320,0,240];
        if(loss==='range')bait.position=[0,0,1200];
        assert.equal(flyFieldTactic(s,ship,1/60),false);
        assert.deepEqual(exits,['pressureLost'],loss);
        assert.deepEqual(events,['flank']);
        assert.deepEqual(radio,[]);
    }
});

test('only an active AI pilot can reserve the ambush slot', () => {
    for(const flag of ['surrendered','poweredDown','captured','jumpPursuit','race']){
        const s=field(0,0,60);
        s.save.player.position=[0,0,-100];
        const first=concealedHunter(s), second=concealedHunter(s), exits=[];
        s.onFieldTacticEnd=(ship,reason)=>exits.push([ship.id,reason]);
        tryFieldAmbush(s,first,0);
        assert.equal(first.fieldTactic?.kind,'ambush');
        tryFieldAmbush(s,second,0);
        assert.ok(!second.fieldTactic?.kind);
        first[flag]=true;
        // The second pilot may run before the disabled pilot's next update.
        tryFieldAmbush(s,second,0);
        assert.equal(second.fieldTactic?.kind,'ambush',flag);
        s.updateShips(1/60);
        assert.equal(first.fieldTactic.kind,null,flag);
        assert.deepEqual(exits,[[first.id,'unavailable']]);
    }
});

test('the same observed flyby offers an enemy an ambush and excludes a wingman', () => {
    for(const wingman of [true,false]){
        const s=field(0,0,60);
        s.save.player.position=[0,0,-100];
        const ship=concealedHunter(s);
        ship.arenaRunWingman=wingman;
        tryFieldAmbush(s,ship,0);
        assert.equal(ship.fieldTactic?.kind,wingman?undefined:'ambush');
    }
});

test('a wingman retries a suppressed tail warning and speaks once during the pursuit', () => {
    const s=field(1000,1000,10), ally=fighter(s,[0,50,0]), enemy=fighter(s,[0,0,150]);
    Object.assign(ally,{tutorialCompanion:true,hostile:false});
    s.updateTutorialCompanion=()=>{};
    s.pilotLineHistory=new Map();
    enemy.rotation=[0,0,0,1];
    enemy.fireRange=400;
    const lines=[];
    s.ui.showPilotLine=(name,line)=>lines.push([name,line]);
    s.nextChatterAt=9;
    for(const now of [0,5,9,20]){
        s.save.world.time=now;
        s.updateShips(1/60);
        assert.equal(lines.filter(([name])=>name===ally.name).length,now>=9?1:0);
    }
    assert.equal(ally.warnedTailId,enemy.id);
});

test('an unpinned mission transmission owns the bar until its display timer finishes', t => {
    const s=session(), enemy=fighter(s,[0,0,100]), companion=fighter(s,[0,20,0]);
    companion.storyPersonId='rin';
    const bar={classList:{add(){},remove(){}},style:{},setAttribute(){}};
    const ui=Object.assign(Object.create(GameUI.prototype),{
        el:id=>id==='#comms-bar'?bar:undefined,commsLog:[],pushEvent(){},scheduleCommsFit(){},
        renderCommsMessage(_bar,callsign,line,story){this.commsMessage={callsign,line,story,pinned:false};},
    });
    Object.defineProperty(ui,"isModalOpen",{value:false});
    s.ui=ui;
    const timers=new Map();
    let nextId=0;
    const previousWindow=globalThis.window;
    globalThis.window={setTimeout(fn,ms){timers.set(++nextId,{fn,ms});return nextId;},clearTimeout:id=>timers.delete(id)};
    t.after(()=>{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
    s.powerDownEssentialCompanion(companion);
    for(const [name,ms] of [['Rin Vek',9000],['Escort',6500]]){
        if(name==='Escort')ui.showPilotLine(name,'Vector received.','neutral',ms,false,'independents',0);
        const timer=timers.get(ui.commsBarTimer);
        assert.equal(timer.ms,ms);
        const mission=ui.commsMessage;
        assert.equal(mission.callsign,name);
        assert.ok(!mission.story && !mission.pinned);
        s.save.world.time+=10;
        s.tacticalBark(enemy,'cover');
        assert.equal(ui.commsMessage,mission);
        timer.fn();
        assert.equal(s.tacticalBark(enemy,'cover'),true);
        assert.equal(ui.commsMessage.callsign,enemy.name);
    }
});
