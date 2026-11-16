import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { Haptics, gamepadActuator } from '../../src/game/haptics.js';

let pad, calls, phone, enabled, clock, haptics, saved;
beforeEach(() => {
    saved = ['navigator','document'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]);
    calls=[];phone=[];enabled=true;clock=0;
    pad={connected:true,index:0,vibrationActuator:{effects:['dual-rumble'],playEffect(type,parameters){calls.push({type,...parameters});return Promise.resolve('complete');},reset(){calls.push({reset:true});return Promise.resolve('complete');}}};
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad],vibrate:value=>{phone.push(value);return true;},userActivation:{hasBeenActive:true}}});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
    haptics=new Haptics(()=>enabled,()=>pad,()=>clock);
});
afterEach(()=>{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('controller receives dual-rumble motor strengths and bounded duration',()=>{
    assert.equal(haptics.pulse(1000,2,-1),true);
    assert.deepEqual(calls,[{type:'dual-rumble',duration:250,startDelay:0,strongMagnitude:1,weakMagnitude:0}]);
    assert.deepEqual(phone,[]);
});
test('rapid barrels are coalesced and gunfire cannot replace an impact',()=>{
    haptics.pulse(35,.04,.22);
    for(let i=0;i<20;i++)haptics.pulse(35,.04,.22);
    assert.equal(calls.length,1);
    clock=5;haptics.pulse(120,.65,.5,2);
    clock=100;assert.equal(haptics.pulse(35,.04,.22),false);
    clock=126;assert.equal(haptics.pulse(35,.04,.22),true);
    assert.equal(calls.length,3);
});
test('disabled and hidden feedback emits no controller or phone commands',()=>{
    enabled=false;assert.equal(haptics.pulse(60,.4,.4,2,60),false);
    enabled=true;document.hidden=true;assert.equal(haptics.pulse(60,.4,.4,2,60),false);
    assert.equal(calls.length,0);assert.equal(phone.length,0);
});
test('legacy pulse actuator works and stop resets both kinds of actuator',()=>{
    pad={connected:true,hapticActuators:[{pulse(strength,duration){calls.push([strength,duration]);return Promise.resolve(true);}}]};
    assert.equal(haptics.pulse(80,.3,.7),true);assert.deepEqual(calls,[[.7,80]]);
    haptics.stop();assert.deepEqual(calls.at(-1),[0,0]);
});
test('phone fallback still works and can be stopped',()=>{
    pad=undefined;assert.equal(haptics.pulse(50,.2,.2,2,[10,12,10]),true);
    haptics.stop();assert.deepEqual(phone,[[10,12,10],0]);
    clock=100;navigator.userActivation.hasBeenActive=false;
    assert.equal(haptics.pulse(50,.2,.2,2,20),false);
});
test('test reports support truthfully instead of assuming vibration happened',async()=>{
    assert.equal(await haptics.test(),'sent');
    assert.equal(calls.at(-1).duration,300);
    enabled=false;assert.equal(await haptics.test(),'disabled');enabled=true;
    pad=undefined;assert.equal(await haptics.test(),'not-connected');
    pad={connected:true};assert.equal(await haptics.test(),'unsupported');
    pad.vibrationActuator={effects:[],playEffect(){throw Error('must not call');}};
    assert.equal(gamepadActuator(pad),undefined);
    assert.equal(await haptics.test(),'unsupported');
    pad.vibrationActuator={playEffect:()=>Promise.reject(Error('not supported'))};
    assert.equal(await haptics.test(),'failed');
});
test('rejected runtime requests are contained and not retried every shot',async()=>{
    pad.vibrationActuator.playEffect=()=>{calls.push('rejected');return Promise.reject(Error('disconnected'));};
    assert.equal(haptics.pulse(35,.1,.2),true);await Promise.resolve();
    clock=200;assert.equal(haptics.pulse(35,.1,.2),false);
    assert.deepEqual(calls,['rejected']);
    haptics.stop();clock=400;assert.equal(haptics.pulse(35,.1,.2),true,'reconnect/setting change permits a retry');
    await Promise.resolve();
});
test('stopping a pending test cancels it and sends reset',async()=>{
    let finish;pad.vibrationActuator.playEffect=()=>new Promise(resolve=>{finish=resolve;});
    const pending=haptics.test();haptics.stop();finish('complete');
    assert.equal(await pending,'cancelled');assert.ok(calls.some(call=>call.reset));
});
