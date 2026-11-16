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
