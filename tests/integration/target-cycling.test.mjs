import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';

function fixture(t) {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const s = session();
    s.save.activeMissions = [];
    s.asteroids = []; s.wreckNodes = []; s.pickups = [];
    s.tutorialFieldTarget = () => undefined;
    s.currentNavLocationIds = () => [];
    s.playerSeesShip = ship => ship.visible !== false;
    s.handleTutorialEvent = () => {};
    s.updateAssetWarmup = () => {};
    s.renderer.setTarget = () => {};
    s.ships = ['a', 'b', 'c'].map((id, i) => ({id, name:id, position:[100 * (i + 1), 0, 0], hostile:true, hull:100}));
    return {s, advance(ms) {clock += ms;}, pick() {s.cycleTarget(); return s.save.player.currentTargetId;}};
}

test('quick taps pick first, second and third enemies in a stable nearest-first burst', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.s.ships[0].position[0] = 900; // the first enemy moves behind the others
    f.advance(100); assert.equal(f.pick(), 'b');
    f.advance(100); assert.equal(f.pick(), 'c');
    f.advance(100); assert.equal(f.pick(), 'a');
});
test('after two seconds a moving or flying-away target is replaced by the currently closest enemy', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.s.ships[0].position[0] = 900;
    f.advance(2000);
    assert.equal(f.s.save.player.currentTargetId, 'a', 'idle timeout alone does not drop the lock');
    assert.equal(f.pick(), 'b');
    f.advance(10); assert.equal(f.pick(), 'c');
});
test('an expired burst retains the same nearest enemy, then a quick repeat selects second closest', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.s.ships[0].playerLockOccludedUntil = 17;
    f.s.monitorStatus = 'Existing target readout';
    f.advance(2000); assert.equal(f.pick(), 'a');
    assert.equal(f.s.ships[0].playerLockOccludedUntil, 17, 'checking an unchanged target cannot extend cover grace');
    assert.equal(f.s.monitorStatus, 'Existing target readout');
    f.advance(50); assert.equal(f.pick(), 'b');
});
test('each selection restarts the two-second window, independently of simulation time', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.advance(1999); assert.equal(f.pick(), 'b');
    f.advance(1999); assert.equal(f.pick(), 'c');
    assert.equal(f.s.save.world.time, 0, 'paused/slow simulation does not own gesture timing');
    f.advance(2000); assert.equal(f.pick(), 'a');
});
test('rapid cycling skips destroyed or invisible contacts and refreshes when none of the old list survives', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.s.ships[1].hull = 0;
    f.advance(20); assert.equal(f.pick(), 'c');
    f.s.ships[0].visible = false; f.s.ships[2].hull = 0;
    f.s.ships.push({id:'new', name:'new', position:[50, 0, 0], hostile:true, hull:100});
    f.advance(20); assert.equal(f.pick(), 'new');
});
test('manual selections, cleared locks and surrendered opponents restart at the highest-priority live contact', t => {
    const f = fixture(t);
    assert.equal(f.pick(), 'a');
    f.s.selectTarget('ship', 'c');
    f.advance(10); assert.equal(f.pick(), 'a');
    f.s.ships[0].surrendered = true; f.s.ships[0].hostile = false;
    f.advance(10); assert.equal(f.pick(), 'b');
    f.s.clearTarget(); f.advance(10); assert.equal(f.pick(), 'b');
});
test('enemy, mission and ordinary-contact priority is preserved without duplicate warrant targets', t => {
    const f = fixture(t);
    f.s.ships[0].missionId = 'warrant';
    f.s.ships.push({id:'friend', name:'friend', position:[1, 0, 0], hostile:false, hull:100});
    f.s.save.activeMissions = [{id:'warrant', kind:'bounty'}, {id:'delivery', kind:'delivery', destination:'helix'}];
    const order = Array.from({length:5}, () => {f.advance(10); return f.pick();});
    assert.deepEqual(order, ['a', 'b', 'c', 'helix', 'friend']);
    assert.equal(f.s.save.player.navTargetId, 'helix');
});
test('empty sensor results clear the lock and allow the next contact to start a new burst', t => {
    const f = fixture(t);
    f.pick(); f.s.ships = [];
    f.pick(); assert.equal(f.s.save.player.currentTargetId, undefined);
    f.s.ships = [{id:'returning', name:'returning', position:[200, 0, 0], hostile:true, hull:100}];
    assert.equal(f.pick(), 'returning');
});
test('cycling through a remote mission goal preserves route planning and the rapid-cycle position', t => {
    const f = fixture(t), remote = f.s.localNavigationTarget('meridian-prime');
    assert.equal(remote.remoteDestinationId, 'meridian-prime');
    f.s.targetCandidates = () => [remote, {kind:'ship', ...f.s.ships[0]}];
    f.s.setNav = id => f.s.changeNavTarget(id);
    f.s.ui.pushSensor = () => {};
    assert.equal(f.pick(), remote.id);
    assert.equal(f.s.save.world.plannedDestinationId, 'meridian-prime');
    f.advance(10); assert.equal(f.pick(), 'a');
    f.advance(2000); assert.equal(f.pick(), remote.id);
    assert.equal(f.s.save.player.navTargetId, remote.id);
});

for (const override of [false, true]) test(`a ship returning from cover ${override ? 'leaves a manual selection alone' : 'is reselected with a fresh missile lock'}`, t => {
    const {s} = fixture(t);
    delete s.playerSeesShip;
    s.tmpRadarPlayer = s.tmpA;
    s.tmpRadarPos = s.tmpB;
    const cues = [];
    s.audio.play = cue => cues.push(cue);
    s.selectTarget('ship', 'a');
    s.rackLocks = new Map([['rack', {progress:1}]]);
    s.rackProgress = 1;
    s.obstacles.push({id:'rock', x:50, y:0, z:0, losRadius:10});
    s.maintainTargetLock();
    s.save.world.time += 10;
    s.maintainTargetLock();
    assert.equal(s.save.player.currentTargetId, undefined);
    s.maintainTargetLock();
    assert.equal(s.save.player.currentTargetId, undefined);
    s.ships[1].position = [0,200,0];
    s.selectTarget('ship', 'b', 'automatic');
    assert.equal(s.save.player.currentTargetId, undefined, 'a scripted contact leaves the remembered ship alone');
    if (override) {
        s.selectTarget('ship', 'b');
    }
    s.obstacles.length = 0;
    s.maintainTargetLock();
    assert.equal(s.save.player.currentTargetId, override ? 'b' : 'a');
    assert.deepEqual(cues, ['targetCycle','targetCycle']);
    assert.equal(s.rackLocks.size, 0);
    assert.equal(s.rackProgress, 0);
});

for (const cancel of ['none','clear','destroy','despawn','capture','dock']) test(`career sensor return after ${cancel}`, t=>{
    const {s}=fixture(t);
    delete s.playerSeesShip;s.arena=undefined;s.tmpRadarPlayer=s.tmpA;s.tmpRadarPos=s.tmpB;
    const ship=s.ships[0];ship.playerSensorAwareness=1;
    s.selectTarget('ship',ship.id);ship.position=[100000,0,0];s.maintainTargetLock();
    assert.equal(s.save.player.currentTargetId,undefined);
    if(cancel==='clear')s.clearTarget();
    if(cancel==='destroy')ship.hull=0;
    if(cancel==='despawn')s.ships=[];
    if(cancel==='capture')ship.captured=true;
    if(cancel==='dock')ship.stationDock={phase:'docked'};
    s.maintainTargetLock();
    s.ships=[ship];Object.assign(ship,{position:[100,0,0],hull:100,captured:false,stationDock:undefined});
    s.maintainTargetLock();assert.equal(s.save.player.currentTargetId,cancel==='none'?ship.id:undefined);
});

function trackingFixture(t) {
    const {s} = fixture(t);
    delete s.playerSeesShip;
    s.tmpRadarPlayer = s.tmpA;
    s.tmpRadarPos = s.tmpB;
    s.ships.length = 1;
    return {s, ship:s.ships[0], step(seconds = 1/60) {
        s.save.world.time += seconds;
        s.maintainTargetLock();
    }};
}

test('a dark pirate beyond the lock horizon cannot chatter or be cycled back in', t => {
    const {s, ship, step} = trackingFixture(t);
    const cues = [];
    s.audio.play = cue => cues.push(cue);
    ship.dark = true;
    s.selectTarget('ship', ship.id);
    ship.position[0] = 1010;
    for (let i = 0; i < 12; i++) step();
    assert.deepEqual(cues, ['targetCycle']);
    assert.ok(!s.targetCandidates().some(candidate => candidate.id === ship.id));
    ship.position[0] = 990;
    step(1);
    assert.equal(s.save.player.currentTargetId, ship.id);
    for (let i = 0; i < 12; i++) { ship.position[0] = i % 2 ? 990 : 1010; step(); }
    assert.deepEqual(cues, ['targetCycle','targetCycle']);
});

test('a visible 2250 km hostile can be reacquired wherever cycling would keep it locked', t => {
    const {s,ship,step} = trackingFixture(t);
    ship.position[0] = 2250;
    s.cycleTarget();
    assert.equal(s.save.player.currentTargetId,ship.id);
    s.obstacles.push({id:'rock',x:750,y:0,z:0,losRadius:20});
    step();step(10);
    assert.equal(s.save.player.currentTargetId,undefined);
    s.obstacles.length=0;
    assert.ok(s.targetCandidates().some(candidate=>candidate.id===ship.id));
    step(1);step();
    assert.equal(s.save.player.currentTargetId,ship.id);
});

for (const change of ['surrender','neutral','power-down']) test('losing contact across a change of allegiance or prize state: '+change, t => {
    const {s,ship,step}=trackingFixture(t);
    s.selectTarget('ship',ship.id);
    ship.position[0]=100000;step();
    if(change==='surrender')ship.surrendered=true;
    if(change==='neutral')ship.hostile=false;
    if(change==='power-down')ship.poweredDown=true;
    step();
    Object.assign(ship,{hostile:true,surrendered:false,poweredDown:false});ship.position[0]=100;
    step(1);
    assert.equal(s.save.player.currentTargetId,undefined);
    assert.equal(s.lostTargetId,undefined);
});
