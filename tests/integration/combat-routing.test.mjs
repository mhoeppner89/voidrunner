import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fieldWorld} from '../helpers/field-world.mjs';
const {advanceFieldRoadmap,planCombatRoute,combatRouteWaypoint,ROUTE_BLOCKED_DELAY}=await import('../../src/game/fieldRoadmap.js');
const {combatThrottle}=await import('../../src/game/combatPiloting.js');
const {fieldClearDistance}=await import('../../src/game/fieldCombatNav.js');
const {SHARDBELT_PASSAGES}=await import('../../src/game/asteroidRoutes.js');
const {LOCATIONS}=await import('../../src/game/data.js');
const v=a=>new THREE.Vector3(...a);
const built=(site,seed=718)=>{const s=fieldWorld(seed);s.stageArenaSite(site);for(let i=0;i<4000&&!s.fieldRoadmap?.ready;i++)advanceFieldRoadmap(s,50);return s;};

test('the roadmap builds for every field site and routes every hidden entry to a firing position',()=>{
 let routed=0;
 for(const site of ['shardbelt-chimney','shardbelt-rim','mourning-center','mourning-battleship','redwake-belt']){
  const s=built(site),map=s.fieldRoadmap,start=v(s.save.player.position);
  assert.ok(map.ready&&map.nodeCount>300&&map.edgeCount>map.nodeCount*3,`${site} roadmap ${map.nodeCount}/${map.edgeCount}`);
  const hidden=s.arenaStage.entries.filter(e=>s.lineBlocked(v(e.position),start));
  for(const e of hidden){
   const plan=planCombatRoute(s,null,v(e.position),start,450);
   assert.ok(plan?.length,`${site} routes ${e.label}`);
   let from=v(e.position);
   for(const wp of plan){assert.ok(!s.lineBlocked(from,v(wp)),`${site} route legs are clear`);from=v(wp);}
   assert.ok(from.distanceTo(start)<=450&&!s.lineBlocked(from,start),`${site} route ends with the target in sight and range`);
   routed++;
  }
 }
 assert.ok(routed>=4,`routed ${routed} hidden entries`);
});

test('a pursuit into the Heart tunnel enters through the bore',()=>{
 const s=built('shardbelt-heart'),start=v(s.save.player.position),bore=SHARDBELT_PASSAGES.find(p=>p.id==='heart'),origin=v(LOCATIONS.shardbelt.position);
 // From outside the rock, beside the parent asteroid, with no line of sight.
 const outside=[[0,900,0],[900,0,0],[-900,0,0],[0,-900,0]].map(o=>start.clone().add(v(o))).find(p=>s.entryPositionClear(p,s.activeFieldObstacles('shardbelt'),40)&&s.lineBlocked(p,start));
 assert.ok(outside,'found a hidden point outside the rock');
 const plan=planCombatRoute(s,null,outside,start,300);
 assert.ok(plan?.length,'routes into the tunnel');
 const inBore=p=>bore.points.some(q=>v(q).add(origin).distanceTo(v(p))<bore.radius+40);
 assert.ok(plan.some(inBore),'the route passes through the bore');
});

test('a blocked pursuit flies the route after a short delay and drops it once the target is in sight',()=>{
 let s,start,entry;
 for(const site of ['shardbelt-chimney','redwake-belt','shardbelt-rim']){s=built(site);start=v(s.save.player.position);entry=s.arenaStage.entries.find(e=>s.lineBlocked(v(e.position),start));if(entry)break;}
 assert.ok(entry,'a hidden entry to pursue from');
 const ship={id:'probe',position:[...entry.position]},out=new THREE.Vector3();
 s.save.world.time=10;assert.equal(combatRouteWaypoint(s,ship,v(ship.position),start,450,out),undefined,'a fresh occlusion is the local controller\'s');
 s.save.world.time=10+ROUTE_BLOCKED_DELAY+.25;
 const waypoint=combatRouteWaypoint(s,ship,v(ship.position),start,450,out);
 assert.ok(waypoint&&ship.combatRoute.active,'the route takes over');
 ship.position=[...ship.combatRoute.waypoints.at(-1)];s.save.world.time+=.3;
 assert.equal(combatRouteWaypoint(s,ship,v(ship.position),start,450,out),undefined);assert.equal(ship.combatRoute.active,false,'in sight: normal combat resumes');
});

test('wreck sections are measured by their mesh, so a hangar deck is open',()=>{
 const s=fieldWorld(718);s.stageArenaSite('mourning-carrier');
 const bay=s.carrierBayAxis(),inside=bay.center.clone(),state={obstacles:s.activeFieldObstacles('mourning-line').filter(o=>o.modelWreckId==='concord-carrier-wreck'),local:new THREE.Vector3(),ray:new THREE.Vector3(),q:new THREE.Quaternion(),rayTests:0};
 assert.ok(state.obstacles.length);
 assert.ok(fieldClearDistance(state,inside,bay.axis.clone(),18,200)>150,'down the deck is open');
});

test('a long clear approach is flown on the afterburner, keeping a fuel reserve',()=>{
 const ship={combatIntent:'hunt',combatFit:{stats:{fuel:20,acceleration:30,angularDamping:2,angularAcceleration:4,energyCapacity:60},weapons:[]},fuel:20,speed:80,afterburnSpeed:130,velocity:[0,0,-80],pilot:{tier:'veteran'},shield:100,hull:100};
 assert.equal(combatThrottle(ship,0,1000,60,0,.95,235,true),130);assert.equal(ship.burning,true);
 ship.fuel=5;assert.notEqual(combatThrottle(ship,0,1000,60,0,.95,235,true),130,'the reserve stays for the fight');
 ship.fuel=20;assert.notEqual(combatThrottle(ship,0,400,60,0,.95,235,true),130,'no closing burn inside the fight');
});
