import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameSession } from '../../src/game/game.js';
import { createNewSave } from '../../src/game/save.js';

function session() {
    const s=Object.create(GameSession.prototype);
    s.save=createNewSave(42);s.save.player.currentTargetId='ship';
    s.ships=[{id:'ship',hull:100,position:[0,0,100],name:'Ship'}];
    s.asteroids=[{id:'rock',remaining:1,position:[0,0,200]}];
    s.wreckNodes=[{id:'wreck',remaining:1,position:[0,0,300],name:'Wreck'}];
    s.tutorialFieldTarget=()=>undefined;s.playerSeesShip=()=>true;
    s.applyTarget=target=>{s.save.player.currentTargetId=target.id;};
    return s;
}

test('target selection automatically chooses ship, mining and salvage contexts',()=>{
    const s=session();
    s.save.player.mode='salvage';s.selectTarget('ship','ship');
    assert.equal(s.save.player.mode,'combat');
    s.activeInstanceId='shardbelt';s.selectTarget('asteroid','rock');
    assert.equal(s.save.player.mode,'mining');assert.equal(s.save.player.currentTargetId,'rock');
    s.activeInstanceId='mourning-line';s.selectTarget('wreck','wreck');
    assert.equal(s.save.player.mode,'salvage');assert.equal(s.save.player.currentTargetId,'wreck');
    s.selectTarget('ship','ship');assert.equal(s.save.player.mode,'combat');
});

test('a stale manual-switch action cannot change activity or clear the target',()=>{
    const s=session();s.save.player.mode='mining';s.save.player.currentTargetId='rock';
    s.renderer={setTarget(){assert.fail('old action must not clear the target');}};
    s.audio={play(){assert.fail('old action must not play a switch sound');}};
    s.handleActions({cycleMode:true});
    assert.equal(s.save.player.mode,'mining');assert.equal(s.save.player.currentTargetId,'rock');
});
