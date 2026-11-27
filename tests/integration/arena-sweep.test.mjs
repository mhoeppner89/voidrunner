import {test} from 'node:test';
import assert from 'node:assert/strict';
import {t} from '../../src/game/i18n.js';
import {session} from '../helpers/session.mjs';
import {updateArenaSweep,SWEEP_GRACE,SWEEP_WARNING,SWEEP_INTERVAL} from '../../src/game/arenaSweep.js';

function hiddenFight(){
 const s=session();s.arena={run:true};const events=[];s.ui={pushEvent:(message,tone)=>events.push({message,tone})};
 const sounds=[];s.audio={play:(id)=>sounds.push(id)};
 const a=s.spawnShip('pirate',[0,0,600]),b=s.spawnShip('pirate',[300,0,600]);
 for(const ship of [a,b])Object.assign(ship,{hostile:true,targetId:'player',playerAwareness:0});
 const seen=new Set();s.shipTracksPlayer=(ship)=>seen.has(ship);
 const step=(seconds)=>{for(let i=0;i<Math.round(seconds*60);i++){s.save.world.time+=1/60;updateArenaSweep(s,1/60);}};
 return {s,a,b,seen,events,sounds,step};
}

test('a hidden pilot gets a warned grace, then range control hands the hunters a snapshot of the position',()=>{
 const {s,a,b,events,sounds,step}=hiddenFight();
 const cards=[];s.ui.showRangeCue=(...card)=>cards.push(card);
 s.save.player.position=[40,-20,10];
 step(SWEEP_GRACE-SWEEP_WARNING-.1);
 assert.equal(events.length,0,'no warning inside the free part of the grace');
 assert.equal(a.search,undefined);
 step(.2);
 assert.equal(events.length,1);assert.equal(events[0].tone,'warning');
 assert.deepEqual(cards,[[t('SWEEP {seconds} S',{seconds:SWEEP_WARNING}),'']]);
 assert.deepEqual(sounds,['rangeTick']);
 step(SWEEP_WARNING);
 assert.equal(events.at(-1).tone,'danger');assert.ok(sounds.includes('scan'));
 for(const ship of [a,b]){
  assert.equal(ship.search?.phase,'approach');
  assert.deepEqual(ship.search.anchor,[40,-20,10]);
 }
 // A snapshot, not a live track: moving after the ping leaves the anchor.
 s.save.player.position=[400,0,0];step(1);
 assert.deepEqual(a.search.anchor,[40,-20,10]);
 // Still hidden: the next sweep follows SWEEP_INTERVAL later.
 step(SWEEP_INTERVAL);
 assert.deepEqual(a.search.anchor,[400,0,0]);
});

test('any sighting resets the grace and calls the spot out to teammates',()=>{
 const {s,a,b,seen,events,step}=hiddenFight();
 step(SWEEP_GRACE-1);
 seen.add(a);a.lastResolvedPlayer=[10,0,0];b.search={phase:'sweep',anchor:[900,0,900]};
 step(.1);
 assert.deepEqual(b.search.anchor,[10,0,0],'the searching teammate re-anchors on the sighting');
 assert.equal(b.search.phase,'approach');
 // A teammate that never had the pilot (it entered behind cover) joins too.
 const c=s.spawnShip('pirate',[0,300,900]);Object.assign(c,{hostile:true,targetId:'player'});
 step(1.1);assert.deepEqual(c.search?.anchor,[10,0,0]);assert.equal(c.search.urgent,true);
 const started=c.search.startedAt;step(2);assert.equal(c.search.startedAt,started,'an unchanged sighting keeps the approach');
 seen.clear();const before=events.length;
 step(SWEEP_GRACE-SWEEP_WARNING-.2);
 assert.equal(events.length,before,'the grace restarts after a sighting');
});

test('career sessions and spectator Arena never sweep',()=>{
 for(const arena of [null,{observer:true}]){
  const {s,a,events,step}=hiddenFight();s.arena=arena;
  step(SWEEP_GRACE*2);
  assert.equal(events.length,0);assert.equal(a.search,undefined);
 }
});
