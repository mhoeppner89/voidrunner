import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';
import {AudioManager} from '../../src/game/audio.js';
import {loadoutFor} from '../../src/game/outfitting.js';
import {fillLauncherMagazines,launcherMagazineEntries} from '../../src/game/weapons.js';
test('small impacts and beam hits remain audible without vibration feedback',()=>{
 for(const shields of [0,100])for(const amount of [.2,12]){
  const s=session();s.save.player.shield=shields;const calls=[];s.audio.playCockpit=(...args)=>calls.push(args);
  s.damagePlayer(amount,'test',false);
  assert.equal(calls.length,1);assert.equal(calls[0][0],shields?'shield':'hit');assert.ok(calls[0][1]>=.85);
 }
});
test('own PDC missile interception emits cockpit audio at useful gain',()=>{
 const s=session(),p=s.save.player;p.mode='mining';p.outfitting.loadouts.wayfarer.turrets=['pdc'];const calls=[];s.audio.playCockpit=(...a)=>calls.push(a);
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,-280,0);s.projStore.setVel(slot,0,260,0);
 s.projectiles.push({id:'incoming',slot,kind:'missile',ownerId:'enemy',targetId:'player',life:8,damage:42});
 for(let i=0;i<100&&!calls.length;i++){s.save.world.time=i/60;s.updateTurrets(p,'player',1/60);}
 assert.equal(calls[0]?.[0],'pdc');assert.ok(calls[0][1]>=.8);
});
test('cockpit routing explicitly requests its separate priority channel',()=>{
 const a=new AudioManager();let args;a.play=(...v)=>args=v;a.playCockpit('shield',.9);assert.deepEqual(args,['shield',.9,0,0,true]);
});

test('own laser turret emits cockpit beam sound when firing',()=>{
 const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];
 s.ships=[{id:'target',hostile:true,hull:100,position:[0,-50,0],velocity:[0,0,0]}];s.getTargetRef=()=>({kind:'ship',id:'target'});
 let shots=0;const calls=[];s.fireBeam=()=>shots++;s.audio.playCockpit=(...a)=>calls.push(a);
 for(let i=0;i<180;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}
 assert.ok(shots>0);assert.ok(calls.some(([effect,gain])=>effect==='beam'&&gain>=.8));
});


test('shield collapse gets a distinct cue, compact notice and real overflow impact',()=>{
 const s=session(),p=s.save.player,calls=[],events=[];s.audio.playCockpit=(...a)=>calls.push(a);s.ui.pushEvent=(...a)=>events.push(a);
 p.shield=5;p.hull=100;s.damagePlayer(8,'test',false);
 assert.deepEqual(calls.map(c=>c[0]),['shieldBreak','hit']);assert.equal(p.shield,0);assert.equal(p.hull,97);
 assert.ok(s.ownMonitorStatus);assert.equal(events.length,1);assert.equal(s.ownMonitorStatusUntil,s.save.world.time+2);
 calls.length=0;s.damagePlayer(2,'test',false);assert.deepEqual(calls.map(c=>c[0]),['hit']);assert.equal(events.length,1);
 // A nearly empty regenerating shield cannot retrigger the warning rapidly.
 p.shield=1;s.save.world.time+=.5;calls.length=0;s.damagePlayer(1,'test',false);
 assert.deepEqual(calls.map(c=>c[0]),['shield']);assert.equal(events.length,1);
});

test('bypassing a live shield is a hull hit, never a false shield-collapse cue',()=>{
 const s=session(),p=s.save.player,calls=[];s.audio.playCockpit=(...a)=>calls.push(a);p.shield=50;
 s.damagePlayer(5,'test',false,{shieldBypass:1});
 assert.deepEqual(calls.map(c=>c[0]),['hit']);assert.equal(p.shield,50);assert.equal(s.shieldBreakFeedbackAt,undefined);
});

test('holding fire with depleted capacitor gives throttled feedback without flooding the log',()=>{
 const s=session(),calls=[],events=[];s.audio.playCockpit=(...a)=>calls.push(a);s.ui.pushEvent=(...a)=>events.push(a);
 s.save.player.mode='combat';s.save.player.energy=0;
 for(let i=0;i<120;i++){s.save.world.time=i/60;s.gunCooldown=0;s.fireMountedPlayerGuns();}
 assert.deepEqual(calls.map(c=>c[0]),['capacitorEmpty']);assert.equal(events.length,0);assert.ok(s.ownMonitorStatus);
 s.save.world.time=2.1;s.fireMountedPlayerGuns();assert.equal(calls.length,2);
});

test('only a player hit collapsing the locked target shield gets confirmation',()=>{
 for(const locked of [false,true])for(const attacker of ['enemy','player']){
  const s=session(),calls=[];s.audio.playCockpit=(...a)=>calls.push(a);s.playStoryLine=()=>{};
  const ship={id:'test-target',tutorialCompanion:true,hull:100,shield:5,position:[0,0,0]};
  s.save.player.currentTargetId=locked?ship.id:undefined;
  s.damageShip(ship,6,attacker);
  assert.equal(calls.some(c=>c[0]==='targetShieldBreak'),locked&&attacker==='player');
  assert.equal(Boolean(s.monitorStatus),locked&&attacker==='player');
 }
});

test('collapse, target confirmation and dry capacitor cues have distinct envelopes',()=>{
 const a=new AudioManager(),voices=[];a.playTone=v=>voices.push(v);
 a.playShieldBreak(0,1,{});assert.equal(voices.length,2);assert.ok(voices[0].endFrequency<voices[0].frequency);assert.ok(voices[0].duration>.3);
 voices.length=0;a.playTargetShieldBreak(0,1,{});assert.equal(voices.length,2);assert.ok(voices[1].frequency>voices[0].frequency);
 voices.length=0;a.playCapacitorEmpty(0,1,{});assert.equal(voices.length,2);assert.ok(voices.every(v=>v.duration<.1&&v.frequency<200));
 for(const effect of ['shieldBreak','targetShieldBreak','capacitorEmpty'])assert.doesNotThrow(()=>a.playCockpit(effect));
});

test('new cues route explicitly and throttle before creating audio nodes',()=>{
 const a=new AudioManager(),routed=[];let chains=0;
 const node=()=>({gain:{value:0},connect(){},disconnect(){}});
 a.context={currentTime:10,createGain:node};a.effectsGain=node();a.effectsReverbGain=node();a.reverbInput=node();a.enabled=true;a.effectsVolume=1;
 a.eventChain=()=>{chains++;return{input:node(),filter:node(),output:node()};};
 a.playShieldBreak=()=>routed.push('shieldBreak');a.playTargetShieldBreak=()=>routed.push('targetShieldBreak');a.playCapacitorEmpty=()=>routed.push('capacitorEmpty');a.playImpact=()=>assert.fail('new cue fell back to impact');
 for(const effect of ['shieldBreak','targetShieldBreak','capacitorEmpty']){a.playCockpit(effect);a.playCockpit(effect);}
 assert.deepEqual(routed,['shieldBreak','targetShieldBreak','capacitorEmpty']);assert.equal(chains,3);
 for(const release of a.effectReleases)release();assert.equal(a.effectReleases.size,0);
});


test('launcher energy refusal uses the same own-monitor cue and preserves ammunition',()=>{
 const s=session(),p=s.save.player,calls=[];s.audio.playCockpit=(...a)=>calls.push(a);p.shipId='lancer';p.ownedShips=['lancer'];p.mode='combat';
 const fit=loadoutFor(p);fit.launchers=['shield-seeker-launcher',null];p.outfitting.loadouts.lancer=fit;fillLauncherMagazines(p);p.energy=0;
 const before=launcherMagazineEntries(p)[0].rounds;const target=s.spawnShip('pirate',[0,0,-100]);s.getTargetRef=()=>({kind:'ship',id:target.id});
 s.fireMissile();s.fireMissile();assert.deepEqual(calls.map(c=>c[0]),['capacitorEmpty']);assert.ok(s.ownMonitorStatus);assert.equal(s.projectiles.length,0);assert.equal(launcherMagazineEntries(p)[0].rounds,before);
});
