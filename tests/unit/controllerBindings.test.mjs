import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLIGHT_CONTROLLER_BINDINGS, defaultControllerBindings, normalizeControllerBindings, rebindController } from '../../src/game/controllerBindings.js';

test('defaults are independent and preserve the approved layout',()=>{
    const a=defaultControllerBindings(),b=defaultControllerBindings();a.flight.fire=50;
    assert.equal(b.flight.fire,0);assert.equal(FLIGHT_CONTROLLER_BINDINGS.fire,0);
    assert.equal(b.flight.secondary,2);assert.equal(b.flight.afterburner,7);
    assert.equal(Object.hasOwn(b.flight,'cycleMode'),false);
});
test('normalization rejects invalid buttons and removed fields',()=>{
    const map=normalizeControllerBindings({flight:{fire:'7',afterburner:64,map:-1,secondary:null,cycleMode:1},menus:{confirm:null,back:null}});
    assert.equal(map.flight.fire,0);assert.equal(map.flight.afterburner,7);assert.equal(map.flight.map,8);
    assert.equal(map.flight.secondary,null);assert.equal(Object.hasOwn(map.flight,'cycleMode'),false);
    assert.equal(map.menus.confirm,0);assert.equal(map.menus.back,1);
});
test('malformed duplicate bindings never strand Confirm and Back',()=>{
    const map=normalizeControllerBindings({menus:{confirm:5,back:5,nextTab:5}}).menus;
    assert.equal(map.confirm,5);assert.notEqual(map.back,5);assert.notEqual(map.back,null);
    assert.equal(map.nextTab,null);
    const used=Object.values(map).filter(value=>value!==null);assert.equal(new Set(used).size,used.length);
});
test('occupied buttons swap actions within their context',()=>{
    const original=defaultControllerBindings(),result=rebindController(original,'flight','fire',7);
    assert.equal(result.swapped,'afterburner');assert.equal(result.bindings.flight.fire,7);assert.equal(result.bindings.flight.afterburner,0);
    assert.deepEqual(result.bindings.menus,original.menus);assert.equal(original.flight.fire,0);
});
test('optional actions can be cleared and extra controller buttons assigned',()=>{
    const clear=rebindController(undefined,'flight','fire',null);
    assert.equal(clear.bindings.flight.fire,null);
    const extra=rebindController(clear.bindings,'flight','fire',63);assert.equal(extra.bindings.flight.fire,63);
    assert.throws(()=>rebindController(extra.bindings,'flight','fire',64));
    assert.throws(()=>rebindController(extra.bindings,'flight','cycleMode',1));
});
test('essential menu actions can swap but cannot be cleared or displaced',()=>{
    const swap=rebindController(undefined,'menus','back',0);
    assert.equal(swap.bindings.menus.back,0);assert.equal(swap.bindings.menus.confirm,1);
    assert.throws(()=>rebindController(undefined,'menus','confirm',null),/required-menu-binding/);
    const clear=rebindController(undefined,'menus','nextControl',null);
    assert.throws(()=>rebindController(clear.bindings,'menus','nextControl',0),/required-menu-binding/);
});
