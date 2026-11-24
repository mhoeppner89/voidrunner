import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fieldWorld} from '../helpers/field-world.mjs';
import {session} from '../helpers/session.mjs';
import {GameSession} from '../../src/game/game.js';
const {requestFieldRoadmap,advanceFieldRoadmap,planCombatRoute,combatRouteWaypoint,ROUTE_BLOCKED_DELAY}=await import('../../src/game/fieldRoadmap.js');
const {combatThrottle}=await import('../../src/game/combatPiloting.js');
const {fieldClearDistance,fieldCombatSteering}=await import('../../src/game/fieldCombatNav.js');
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

test('a fighter threads an offset opening at speed and still brakes for a closed face',()=>{
 const s=session(),goal=v([0,0,-500]),stationary=new THREE.Vector3();
 s.tmpCollide=new THREE.Vector3();s.tmpEuler=new THREE.Euler();
 goal.toArray(s.save.player.position);
 const plate=(id,left,right)=>({
  id,shape:'debris-mesh',x:(left+right)/2,y:0,z:0,radius:Math.hypot((right-left)/2,110,20),
  box:{hx:(right-left)/2,hy:110,hz:20,qx:0,qy:0,qz:0,qw:1}
 });
 s.obstacles=[plate('port',-160,6),plate('starboard',72,200)];
 const ship=s.spawnShip('pirate',[0,0,160],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'talon'});
 ship.targetId='player';ship.rotation=[0,0,0,1];ship.velocity=[0,0,-65];
 ship.combatFit.turrets=[];ship.combatFit.missiles=0;s.fireNpcGun=()=>{};
 let lowest=Infinity;
 for(let tick=0;tick<600&&ship.position[2]>-25;tick++){
  s.save.world.time=tick/60;
  s.updateAttackAI(ship,goal,stationary,1/60);
  s.resolveNpcCollisions(ship);
  lowest=Math.min(lowest,Math.hypot(...ship.velocity));
 }
 assert.ok(ship.position[2]<=-25 && ship.position[0]>6 && ship.position[0]<72,'crossed between the plates');
 assert.ok(lowest>ship.speed*.65,'kept at least 65% of cruise through the opening');
 assert.equal(ship.combatBumpAt,undefined);
 // Close the opening immediately ahead of the nose. The planner must
 // respect the physical stopping envelope even with open space to one side.
 s.obstacles=[plate('closed',-160,200)];ship.fieldNav=undefined;
 ship.position=[35,0,22];ship.velocity=[0,0,-65];ship.rotation=[0,0,0,1];
 const nav=fieldCombatSteering(s,ship,goal,v([0,0,-1]),1/60,new THREE.Vector3());
 assert.equal(nav.speedLimit,0);
});

test('opponents inside one field lattice keep the same roadmap while it builds',()=>{
 const s=fieldWorld(718);s.stageArenaSite('shardbelt-heart');
 const map=s.fieldRoadmap,[x,y,z]=map.center;
 assert.equal(requestFieldRoadmap(s,[x+1050,y,z]),map);
 assert.equal(requestFieldRoadmap(s,[x-1050,y,z]),map);
 assert.notEqual(requestFieldRoadmap(s,[x+2500,y,z]),map);
});

test('steering sees the end of a long wreck section before its centre enters the local query',()=>{
 const s=session(),goal=v([0,0,-300]),heading=v([0,0,-1]),out=new THREE.Vector3();
 const plate={id:'long-plate',shape:'debris-mesh',x:650,y:0,z:-65,radius:710,losRadius:710,
  box:{hx:700,hy:80,hz:5,qx:0,qy:0,qz:0,qw:1}};
 s.obstacles=[plate];s.forEachObstacleInBox=GameSession.prototype.forEachObstacleInBox;
 s.obstacleCellSize=180;s.obstacleQueryStamp=0;
 const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
 s.npcFlightStats(ship);ship.rotation=[0,0,0,1];ship.velocity=[0,0,-50];
 const nav=fieldCombatSteering(s,ship,goal,heading,1/60,out);
 assert.deepEqual(nav.obstacles,[plate]);
 assert.ok(nav.active,'the pilot starts a turn before reaching the plate');
 ship.position[0]=650;s.save.world.time+=.3;
 fieldCombatSteering(s,ship,goal,heading,1/60,out);
 assert.deepEqual(nav.obstacles,[plate],'a large section in both queries is counted once');
});

test('a hunter with no entry gets a lattice covering its approach and its target',()=>{
 const s=built('shardbelt-rim'), original=s.fieldRoadmap;
 const start=v([18390,-8100,-195530]), target=v([18390,-8100,-196697]);
 assert.equal(s.lineBlocked(start,target),true);
 planCombatRoute(s,{id:'hunter'},start,target,420);
 assert.ok(s.fieldRoadmap!==original);
 advanceFieldRoadmap(s,Infinity);
 assert.ok(planCombatRoute(s,{id:'hunter'},start,target,420)?.length);
});

test('waypoint arrival checks the real shortcut, including both wings',()=>{
 const s=built('shardbelt-rim'), origin=v([0,0,0]),target=v([200,0,100]),out=v([]);
 const corner=v([0,0,50]),next=v([100,0,50]),side=next.clone().cross(v([0,1,0])).normalize();
 s.save.world.time=10;
 const blocked=s.lineBlocked.bind(s);
 for(const offset of [v([]),side.clone().multiplyScalar(-16),v([0,16,0])]){
  const center=next.clone().multiplyScalar(.5).add(offset);
  const plate={id:'corner',shape:'debris-mesh',x:center.x,y:center.y,z:center.z,radius:9,
   box:{hx:4,hy:4,hz:4,qx:0,qy:0,qz:0,qw:1}};
  s.activeDockObstacle=()=>undefined;
  s.forEachObstacleAlongSegment=(a,b,visit)=>visit(plate);
  s.lineBlocked=(a,b)=>b.equals(target)||blocked(a,b);
  const ship={combatRoute:{waypoints:[corner.toArray(),next.toArray()],index:0,plannedAt:10,target:target.toArray(),
   blockedSince:1,checkAt:0,blocked:true,active:true,failedUntil:0,scratch:v([])}};
  assert.deepEqual(combatRouteWaypoint(s,ship,origin,target,60,out)?.toArray(),corner.toArray());
 }
});

test('search travel brakes for the edge of a plate outside its centre query',()=>{
 const s=session(),plate={id:'long',shape:'debris-mesh',x:650,y:0,z:-35,radius:710,losRadius:710,
  box:{hx:700,hy:80,hz:5,qx:0,qy:0,qz:0,qw:1}};
 s.obstacles=[plate];s.forEachObstacleInBox=GameSession.prototype.forEachObstacleInBox;
 s.obstacleCellSize=180;s.obstacleQueryStamp=0;
 const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
 s.npcFlightStats(ship);ship.rotation=[0,0,0,1];ship.velocity=[0,0,-50];
 const nav=fieldCombatSteering(s,ship,v([0,0,-300]),v([0,0,-1]),1/60,v([]),false);
 assert.deepEqual(nav.obstacles,[plate]);assert.ok(nav.speedLimit<50);
});

test('recovery inside a solid reports no exit and takes the physical contact normal',()=>{
 const s=session();s.obstacles=[{id:'solid',shape:'asteroid',x:0,y:0,z:0,radius:80}];
 const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'talon'});
 s.npcFlightStats(ship);ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
 const goal=v([0,0,-200]),heading=v([0,0,-1]),out=v([]);
 for(let tick=0;tick<90;tick++){
  s.save.world.time=tick/60;fieldCombatSteering(s,ship,goal,heading,1/60,out);
 }
 assert.equal(ship.fieldNav.active,false);assert.equal(ship.fieldNav.noExit,true);
 assert.equal(ship.fieldNav.speedLimit,0);
 s.tmpCollide=v([]);s.resolveNpcCollisions(ship);
 assert.ok(Math.hypot(...ship.position)>80);
 s.save.world.time+=.3;
 fieldCombatSteering(s,ship,goal,heading,1/60,out);
 assert.equal(ship.fieldNav.noExit,false);
});

test('the rim, chimney and Heart bore approaches leave room around both wings',()=>{
 for(const site of ['shardbelt-rim','shardbelt-chimney','shardbelt-heart']){
  const s=built(site,175),target=v(s.save.player.position);
  const from=site==='shardbelt-heart'?target.clone().add(v([0,-900,0])):
   v(s.arenaStage.entries.find(entry=>entry.label==='Contact behind cover ahead.').position);
  const route=planCombatRoute(s,null,from,target,site==='shardbelt-heart'?300:450);
  assert.ok(route?.length,site);
  for(const point of route){
   const to=v(point),direction=to.clone().sub(from).normalize();
   const side=direction.clone().cross(Math.abs(direction.y)>.9?v([1,0,0]):v([0,1,0])).normalize();
   const up=side.clone().cross(direction);
   for(const radius of [4,8,12,16])for(let i=0;i<16;i++){
    const offset=side.clone().multiplyScalar(radius*Math.cos(i*Math.PI/8)).addScaledVector(up,radius*Math.sin(i*Math.PI/8));
    assert.equal(s.lineBlocked(from.clone().add(offset),to.clone().add(offset)),false,site);
   }
   from.copy(to);
  }
 }
});

test('a magrail pilot matches a ready shot and resumes pursuit outside the firing window',()=>{
 const s=session(),ship=s.spawnShip('patrol',[0,0,175],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:'blade'});
 ship.targetId='player';ship.hostile=true;ship.fuel=0;s.tmpEuler=new THREE.Euler();
 const target=v([0,0,0]),velocity=v([]);
 s.fireNpcGun=()=>{};ship.combatFit.turrets=[];
 const integrate=s.integrateNpcFlight.bind(s);
 let requestedSpeed;
 s.integrateNpcFlight=(actor,position,motion,rotation,desired,speed,...controls)=>{
  requestedSpeed=speed;
  return integrate(actor,position,motion,rotation,desired,speed,...controls);
 };
 const rail=ship.combatFit.weapons.indexOf('gauss');assert.ok(rail>=0);
 function run(blocked,ready,rotation){
  requestedSpeed=undefined;s.lineBlocked=()=>blocked;
  for(let i=0;i<50;i++){
   s.save.world.time+=1/60;ship.position=[0,0,175];ship.velocity=[0,0,0];ship.rotation=[...rotation];
   ship.fireCooldown=0;ship.energy=ship.combatFit.stats.energyCapacity;
   ship.combatFit.fireAt.fill(Infinity);ship.combatFit.fireAt[rail]=ready?0:Infinity;
   s.updateAttackAI(ship,target,velocity,1/60);
  }
  return requestedSpeed;
 }
 const aligned=[0,0,0,1], away=[0,1,0,0];
 assert.ok(run(false,true,aligned)<ship.speed*.6);
 assert.equal(run(false,false,aligned),ship.speed,'a reloading mount resumes pursuit');
 assert.equal(run(false,true,away),ship.speed,'a target behind the gun does not slow the ship');
 assert.equal(run(true,true,aligned),ship.speed,'a blocked firing lane keeps pursuit speed');
});

test('a finishing artillery pilot keeps pursuit speed while its gun is cooling',()=>{
 for(const weapon of ['gauss','mortar']){
  const ship={combatIntent:'hunt',speed:80,fuel:0,combatFit:{stats:{fuel:20},weapons:[weapon]},
   combatPlan:{finishing:true,aimingRun:true},velocity:[0,0,-60]};
  assert.equal(combatThrottle(ship,1,90,0,0,1,300,false,0,false),80);
  assert.ok(combatThrottle(ship,1,90,0,0,1,300,false,0,true)<40);
 }
});

test('escape thrust stays on as slow velocity rolls toward a clear exit',()=>{
 const s=session(),goal=v([0,-28,-160]),heading=goal.clone().normalize(),out=v([]);
 const ship=s.spawnShip('patrol',[0,0,0],undefined,undefined,{tier:'veteran'},{hullId:'blade'});
 s.npcFlightStats(ship);
 ship.rotation=new THREE.Quaternion().setFromUnitVectors(v([0,0,-1]),heading).toArray();
 ship.velocity=[0,.6,-3];
 const reach=Math.max(...s.npcHullExtents(ship))+2;
 s.obstacles=[{id:'plate',shape:'debris-mesh',x:0,y:10+reach-.4,z:0,radius:145,
  box:{hx:100,hy:10,hz:100,qx:0,qy:0,qz:0,qw:1}}];
 const nav=fieldCombatSteering(s,ship,goal,heading,1/60,out);
 nav.until=5;nav.nextPlan=2;nav.waypoint.copy(goal);nav.recovering=true;
 s.save.world.time=1;
 fieldCombatSteering(s,ship,goal,heading,1/60,out);
 assert.ok(nav.nose.dot(nav.travel)>.25,'velocity no longer points opposite the nose');
 assert.equal(fieldClearDistance(nav,nav.position,nav.travel,reach,35),0);
 assert.ok(nav.speedLimit>=ship.speed*.3,'a physically clear departure can accelerate');
 s.obstacles[0].y-=reach*.7;
 fieldCombatSteering(s,ship,goal,heading,1/60,out);
 assert.equal(nav.speedLimit,0,'an obstructed sweep vetoes that thrust');
});
