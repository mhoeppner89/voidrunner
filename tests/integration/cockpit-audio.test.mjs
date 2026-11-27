import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from '../helpers/session.mjs';
import {AudioManager} from '../../src/game/audio.js';
import {SOUND_EVENTS} from '../../src/game/soundEvents.js';
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

test('collapse, target confirmation and dry capacitor are distinct, dedicated cues',()=>{
 const cues=['shieldBreak','targetShieldBreak','capacitorEmpty'].map(id=>SOUND_EVENTS[id]);
 for(const cue of cues){assert.ok(cue,'cue must not fall back to the generic impact');assert.ok(cue.spacing>=1.5,'status cues are throttled');}
 assert.equal(new Set(cues.map(cue=>cue.layers[0][0])).size,3,'each cue has its own designed sound');
 // Losing your own shields is a physical event; the target confirmation is HUD-only.
 assert.ok(SOUND_EVENTS.shieldBreak.duck&&SOUND_EVENTS.shieldBreak.muffle>0);assert.equal(SOUND_EVENTS.targetShieldBreak.bus,'ui');
 assert.ok(!cues.some(cue=>cue.layers.some(([id])=>SOUND_EVENTS.hit.layers[0][0]===id)),'a status cue never reuses the hull-hit body');
 const a=new AudioManager();for(const effect of ['shieldBreak','targetShieldBreak','capacitorEmpty'])assert.doesNotThrow(()=>a.playCockpit(effect));
});

test('cues throttle before creating audio nodes and release every node they made',()=>{
 let created=0,disconnected=0;const sources=[];
 const node=()=>{created++;return{gain:{value:0},pan:{value:0},frequency:{value:0},Q:{value:0},playbackRate:{value:1},connect(){},disconnect(){disconnected++;},start(){sources.push(this);}};};
 const a=new AudioManager(),bus=()=>({connect(){},disconnect(){}}),effects=[];
 Object.assign(a,{context:{currentTime:10,createGain:node,createBufferSource:node,createBiquadFilter:node,createStereoPanner:node},enabled:true,effectsVolume:1,
  effectsGain:bus(),cockpitBus:bus(),uiBus:bus(),worldBus:bus(),roomSend:bus(),effectsReverbGain:bus(),effectTimes:new Map(),effectReleases:new Set(),
  bank:{buffer:()=>({duration:.3})},duck:()=>effects.push('duck'),concuss:()=>effects.push('muffle')});
 for(const effect of ['shieldBreak','targetShieldBreak','capacitorEmpty']){
  a.playCockpit(effect);const afterFirst=created;assert.ok(afterFirst>0);
  a.playCockpit(effect);assert.equal(created,afterFirst,`${effect}: the throttled repeat allocates nothing`);
  created=0;
 }
 assert.equal(a.activeVoices,3);assert.equal(a.effectReleases.size,3);assert.deepEqual(effects,['duck','muffle'],'only the shield collapse shakes the mix');
 // A cue whose sounds have not loaded yet leaves nothing behind.
 const loaded=a.bank;a.bank={buffer:()=>undefined};a.context.currentTime=20;a.playCockpit('hit');assert.equal(a.activeVoices,3);a.bank=loaded;
 // The longest layer ending releases the voice exactly once.
 for(const source of sources){source.onended?.();source.onended?.();}
 assert.equal(a.activeVoices,0);assert.equal(a.effectReleases.size,0);assert.ok(disconnected>0);
});

test('the mixer preserves mount channels and centres a non-finite pan',()=>{
 const a=new AudioManager(),calls=[];
 Object.assign(a,{context:{currentTime:0},enabled:true,effectsGain:{},trigger:(...args)=>calls.push(args)});
 a.play('laser',.72,-.3,0,false,'wayfarer-gun-0');
 a.play('laser',.72,NaN,0,false,'wayfarer-gun-1');
 assert.deepEqual(calls.map(args=>[args[2],args[7]]),[[-.3,'wayfarer-gun-0'],[0,'wayfarer-gun-1']]);
});

test('distant fire is panned, delayed by range and dropped beyond earshot',()=>{
 const a=new AudioManager(),calls=[];Object.assign(a,{context:{currentTime:0},enabled:true,effectsVolume:1,effectsGain:{},trigger:(...args)=>calls.push(args)});
 a.playAtDirection('explosion',1,5000,10,0);assert.equal(calls.length,0,'out of range');
 a.playAtDirection('explosion',1,450,300,0);a.playAtDirection('explosion',1,450,-300,400);a.playAtDirection('laser',NaN,NaN,NaN,NaN);
 const [right,leftBehind,invalid]=calls;
 assert.ok(right[2]>0&&leftBehind[2]<0,'pan follows the side');assert.equal(right[5],0);assert.ok(leftBehind[5]>0,'sources behind the ship are marked rear');
 assert.ok(right[6]>0.15&&right[6]<=0.45,'far blasts arrive after the flash');assert.ok(right[1]<0.5,'distance costs level');
 assert.equal(invalid,undefined,'non-finite input stays silent instead of reaching the graph');
});


test('launcher energy refusal uses the same own-monitor cue and preserves ammunition',()=>{
 const s=session(),p=s.save.player,calls=[];s.audio.playCockpit=(...a)=>calls.push(a);p.shipId='lancer';p.ownedShips=['lancer'];p.mode='combat';
 const fit=loadoutFor(p);fit.launchers=['shield-seeker-launcher',null];p.outfitting.loadouts.lancer=fit;fillLauncherMagazines(p);p.energy=0;
 const before=launcherMagazineEntries(p)[0].rounds;const target=s.spawnShip('pirate',[0,0,-100]);s.getTargetRef=()=>({kind:'ship',id:target.id});
 p.currentTargetId=target.id;s.updatePlayerRackLocks(3);calls.length=0;
 s.fireMissile();s.fireMissile();assert.deepEqual(calls.map(c=>c[0]),['capacitorEmpty']);assert.ok(s.ownMonitorStatus);assert.equal(s.projectiles.length,0);assert.equal(launcherMagazineEntries(p)[0].rounds,before);
});
