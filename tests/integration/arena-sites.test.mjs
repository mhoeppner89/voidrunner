import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fieldWorld} from '../helpers/field-world.mjs';
const {ARENA_SITES,ARENA_SITE_IDS}=await import('../../src/game/arenaSites.js');
const {MIN_ENTRY_DISTANCE,ENTRY_CLEARANCE}=await import('../../src/game/arenaStaging.js');
const {RUN_WAVES}=await import('../../src/game/arenaRun.js');
const {SHARDBELT_PASSAGES}=await import('../../src/game/asteroidRoutes.js');
const {LOCATIONS}=await import('../../src/game/data.js');

const world=seed=>fieldWorld(seed);
const v=a=>new THREE.Vector3(...a);

test('every Arena site stages a clear start in its own system with front and flanking entries',()=>{
 for(const seed of [175,718,941])for(const id of ARENA_SITE_IDS){
  const s=world(seed),site=ARENA_SITES[id],pose=s.stageArenaSite(id),p=s.save.player,label=`${id}@${seed}`;
  assert.equal(p.systemId,site.systemId,label);assert.equal(s.renderer.systemId,site.systemId,label);
  assert.equal(s.activeInstanceId,site.instanceId,label+' activates its field');
  assert.ok(p.position.every(Number.isFinite)&&p.rotation.every(Number.isFinite),label);
  assert.ok(LOCATIONS[p.navTargetId]?.systemId===site.systemId,label+' nav target in system');
  if(site.instanceId)assert.ok(s.siteSpotClear(site,v(p.position),s.activeFieldObstacles(site.instanceId),10),label+' start is clear of rock');
  const entries=s.arenaStage.entries;
  assert.ok(entries.filter(e=>e.front).length>=2,`${label} has two opening entries`);
  assert.ok(entries.some(e=>!e.front),`${label} has a flanking entry for reinforcements`);
  for(const e of entries){
   assert.ok(v(e.position).distanceTo(v(p.position))>=MIN_ENTRY_DISTANCE,`${label} ${e.label} keeps its distance`);
   if(site.instanceId)assert.ok(s.siteSpotClear(site,v(e.position),s.activeFieldObstacles(site.instanceId),ENTRY_CLEARANCE),`${label} ${e.label} is clear`);
  }
  const opening=s.arenaSiteEntry(0,false),reinforcement=s.arenaSiteEntry(1,true);
  assert.ok(opening?.front,label);assert.ok(reinforcement&&!reinforcement.front,`${label} reinforcement comes from another side`);
 }
});

test('all 25 level groups have a staged opening and reinforcement entry on their authored site',()=>{
 for(const seed of [175,718,941]){
  const s=world(seed);
  for(const wave of RUN_WAVES){
   s.stageArenaSite(wave.site);
   assert.equal(s.arenaStage.siteId,wave.site);
   for(const [i,group] of wave.groups.entries()){
    assert.ok(group.enemies.length);
    assert.ok(s.arenaSiteEntry(i,i>0),wave.name+' group '+(i+1));
   }
  }
 }
});

test('sites use their terrain on purpose',()=>{
 const s=world(718);s.stageArenaSite('shardbelt-heart');
 const bore=SHARDBELT_PASSAGES.find(p=>p.id==='heart'),origin=v(LOCATIONS.shardbelt.position);
 const inBore=point=>bore.points.some(q=>v(q).add(origin).distanceTo(v(point))<bore.radius);
 assert.ok(inBore(s.save.player.position),'the tunnel start is inside the bore');
 assert.ok(s.arenaStage.entries.filter(e=>e.where==='ahead').every(e=>inBore(e.position)),'opponents enter down the same bore');
 const cover=world(718);cover.stageArenaSite('redwake-belt');
 const hidden=cover.arenaStage.entries.filter(e=>e.where==='cover');
 assert.ok(hidden.length>=1&&hidden.every(e=>cover.lineBlocked(v(cover.save.player.position),v(e.position))),'redwake contacts start behind rock');
 const bay=world(718);bay.stageArenaSite('mourning-carrier');
 const deck=bay.arenaStage.entries.filter(e=>e.label.includes('hangar deck'));
 assert.ok(deck.length>=1,'the hangar joust has entries at the far end of the deck');
 const axis=bay.carrierBayAxis(),along=p=>v(p).sub(axis.center).dot(axis.axis),off=p=>{const d=v(p).sub(axis.center);return d.sub(axis.axis.clone().multiplyScalar(d.dot(axis.axis))).length();};
 assert.ok(along(bay.save.player.position)<-axis.halfLength&&off(bay.save.player.position)<160,'the pilot starts off the open end');
 assert.ok([0,.45,.9].every(k=>!bay.lineBlocked(v(bay.save.player.position),axis.center.clone().addScaledVector(axis.axis,axis.halfLength*k))),'and sees down the whole deck');
 assert.ok(deck.every(e=>along(e.position)>axis.halfLength&&off(e.position)<100),'deck contacts enter at the far end, on the same axis');
 const lane=world(718);lane.stageArenaSite('foundry-lanes');
 assert.ok(lane.arenaStage.entries.filter(e=>e.where==='ahead').every(e=>!lane.lineBlocked(v(lane.save.player.position),v(e.position))),'the lane joust is a clear line');
 const sheet=world(718);sheet.stageArenaSite('pale-rings');
 assert.ok(sheet.arenaStage.entries.filter(e=>e.where==='below').every(e=>e.position[1]<sheet.save.player.position[1]-300),'ring contacts rise from below');
});

test('Arena Run visits every site and changes site between consecutive waves',()=>{
 assert.equal(RUN_WAVES.length,25);
 for(const wave of RUN_WAVES){assert.ok(ARENA_SITES[wave.site],wave.name);assert.equal(wave.environment,ARENA_SITES[wave.site].environment);}
 assert.deepEqual(new Set(RUN_WAVES.map(w=>w.site)),new Set(ARENA_SITE_IDS));
 for(let i=1;i<RUN_WAVES.length;i++)assert.notEqual(RUN_WAVES[i].site,RUN_WAVES[i-1].site,`waves ${i} and ${i+1}`);
 assert.equal(new Set(RUN_WAVES.map(w=>ARENA_SITES[w.site].systemId)).size,5,'all five systems host a fight');
});
