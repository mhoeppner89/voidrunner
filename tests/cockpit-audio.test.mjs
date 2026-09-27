import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import {AudioManager} from '../src/game/audio.js';
test('small impacts and beam hits remain audible without vibration feedback',()=>{
 for(const shields of [0,100])for(const amount of [.2,12]){
  const s=session();s.save.player.shield=shields;const calls=[];s.audio.playCockpit=(...args)=>calls.push(args);
  s.damagePlayer(amount,'test',false);
  assert.equal(calls.length,1);assert.equal(calls[0][0],shields?'shield':'hit');assert.ok(calls[0][1]>=.85);
 }
});
test('own PDC missile interception emits cockpit audio at useful gain',()=>{
 const s=session(),p=s.save.player;p.mode='mining';p.outfitting.loadouts.wayfarer.turrets=['pdc'];const calls=[];s.audio.playCockpit=(...a)=>calls.push(a);
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,280,0);s.projStore.setVel(slot,0,-260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'enemy',targetId:'player',life:8,damage:42});
 for(let i=0;i<100&&!calls.length;i++){s.save.world.time=i/60;s.updateTurrets(p,'player',1/60);}
 assert.equal(calls[0]?.[0],'pdc');assert.ok(calls[0][1]>=.8);
});
test('cockpit routing explicitly requests its separate priority channel',()=>{
 const a=new AudioManager();let args;a.play=(...v)=>args=v;a.playCockpit('shield',.9);assert.deepEqual(args,['shield',.9,0,0,true]);
});

test('own laser turret emits cockpit beam sound when firing',()=>{
 const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];
 s.ships=[{id:'target',hostile:true,hull:100,position:[0,50,0],velocity:[0,0,0]}];s.getTargetRef=()=>({kind:'ship',id:'target'});
 let shots=0;const calls=[];s.fireBeam=()=>shots++;s.audio.playCockpit=(...a)=>calls.push(a);
 for(let i=0;i<180;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}
 assert.ok(shots>0);assert.ok(calls.some(([effect,gain])=>effect==='beam'&&gain>=.8));
});
