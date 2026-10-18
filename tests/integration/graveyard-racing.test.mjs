import {shipVsObstacle} from '../../src/game/shipCollision.js';
import {npcShipScaleForVariant} from '../../src/game/render.js';
import {createRaceContacts,raceBody,resolveRaceContacts} from '../../src/game/raceContact.js';
import {planRaceTactics} from '../../src/game/raceTactics.js';
import {raceCornerSpeed} from '../../src/game/racePilot.js';
import {advanceRaceRacerGates,crossedRaceGate} from '../../src/game/racing.js';
import * as T from 'three';import {session} from '../helpers/session.mjs';import {GameSession} from '../../src/game/game.js';import {generateGraveyardPieces,generateWreckNodes} from '../../src/game/worldData.js';import {LOCATIONS} from '../../src/game/data.js';import {createRaceRacers,generateRaceCourse,raceRacerTarget,updateRaceRacer} from '../../src/game/racing.js';import {steerRacePilot} from '../../src/game/raceNavigation.js';import {hullVsAsteroid,hullVsRing,hullVsEngine} from '../../src/game/hullCollision.js';import {writeFile,mkdir} from 'node:fs/promises';import {test} from 'node:test';import assert from 'node:assert/strict';
const results=[];
const gateCrossRadius=(previous,current,gate)=>{const d=gate.direction,g=gate.position,s0=(previous[0]-g[0])*d[0]+(previous[1]-g[1])*d[1]+(previous[2]-g[2])*d[2],s1=(current[0]-g[0])*d[0]+(current[1]-g[1])*d[1]+(current[2]-g[2])*d[2];if(s0>0||s1<0||s1-s0<1e-8)return Infinity;const t=s0/(s0-s1),x=previous[0]+(current[0]-previous[0])*t-g[0],y=previous[1]+(current[1]-previous[1])*t-g[1],z=previous[2]+(current[2]-previous[2])*t-g[2],a=x*d[0]+y*d[1]+z*d[2];return Math.hypot(x-a*d[0],y-a*d[1],z-a*d[2]);};
for(const seed of [175,718])for(const id of ['mourning-run','mourning-breach','mourning-relict-gauntlet'])for(const playerHullId of ['talon','speedster','demon','lancer'])if(!process.env.VR_RACE_CASE||process.env.VR_RACE_CASE.split(',').includes(`${id}:${seed}:${playerHullId}`))test(`${id}: all three pilots finish without clipping with ${playerHullId} loaner (seed ${seed})`,()=>{
 const s=session();s.activeInstanceId='mourning-line';s.tmpCollide=new T.Vector3();s.hyperdriveInterceptIds=new Set();s.save.player.position=LOCATIONS['mourning-line'].position.map(v=>v+15000);s.graveyard=generateGraveyardPieces(seed);s.wreckNodes=generateWreckNodes(seed,{});s.obstacles=GameSession.prototype.activeFieldObstacles.call(s);s.forEachObstacleInBox=(x0,y0,z0,x1,y1,z1,fn)=>{for(const o of s.obstacles){const r=o.radius;if(o.x+r>=x0&&o.x-r<=x1&&o.y+r>=y0&&o.y-r<=y1&&o.z+r>=z0&&o.z-r<=z1)fn(o);}};
 const course=generateRaceCourse(id),racers=createRaceRacers(course,seed,undefined,playerHullId),goal=new T.Vector3(),steering=new T.Vector3(),p=new T.Vector3(),q=new T.Quaternion(),inv=new T.Quaternion(),scratch=new Float32Array(100000),contact={},hits=[0,0,0],firstHits=[null,null,null];s.ships=racers;const contacts=createRaceContacts(racers.map(r=>raceBody(r,r.variant,npcShipScaleForVariant(r.variant))));
 let solveTime=0,solveSteps=0;const recoverySeconds=[0,0,0],recoveryStarts=[0,0,0],recoveryGates=[[],[],[]],wasRecovering=[false,false,false],speedSum=[0,0,0],speedPeak=[0,0,0],targetSpeedSum=[0,0,0],brakeSeconds=[0,0,0],collisionResponses=[0,0,0],collisionDetails=[[],[],[]],invalidPasses=[0,0,0],wideGatePasses=[0,0,0],gateMissOffsets=[[],[],[]],missedGateCrossings=[[],[],[]];
 for(let tick=1;tick<=60*330&&racers.some(r=>!r.raceFinished);tick++){
  const elapsed=tick/60;s.save.world.time=elapsed;
  for(const [i,r]of racers.entries())if(!r.raceFinished){
   planRaceTactics(r,course,racers,undefined,1/60,elapsed);
   const target=raceRacerTarget(r,course);goal.fromArray(target);const brake=steerRacePilot(s,r,goal,1/60,steering);updateRaceRacer(r,course,1/60,elapsed,{direction:steering,brake,peers:racers,deferGates:true});const liveSpeed=Math.hypot(...r.velocity);speedSum[i]+=liveSpeed;speedPeak[i]=Math.max(speedPeak[i],liveSpeed);targetSpeedSum[i]+=raceCornerSpeed(r,course,r.raceResources,r.raceResources.afterburnSpeed,liveSpeed);if(r.raceBraking>.1)brakeSeconds[i]+=1/60;

  }
  const began=performance.now();resolveRaceContacts(contacts,1/60,elapsed);solveTime+=performance.now()-began;solveSteps++;
  for(const [i,racer]of racers.entries())if(racer.hull>0&&!racer.raceFinished){const before=[...racer.position];s.resolveNpcCollisions(racer);if(racer.position.some((v,j)=>Math.abs(v-before[j])>.001)){collisionResponses[i]++;if(collisionDetails[i].length<3)collisionDetails[i].push({time:elapsed,gate:racer.raceGateIndex,before,after:[...racer.position],clear:racer.raceNavigation?.clear});}}
  for(const [i,r]of racers.entries())if(!r.raceFinished){
   const gate=course.gates[r.raceGateIndex];if(gate&&!crossedRaceGate(r.racePreviousPosition,r.position,gate)&&crossedRaceGate(r.racePreviousPosition,r.position,gate,40)){wideGatePasses[i]++;gateMissOffsets[i].push(+(gateCrossRadius(r.racePreviousPosition,r.position,gate)-gate.radius).toFixed(2));}
   const gateIndexBefore=r.raceGateIndex,missRadius=gate?gateCrossRadius(r.racePreviousPosition,r.position,gate):Infinity;advanceRaceRacerGates(r,course,r.racePreviousPosition,r.position,elapsed);if(r.raceGateIndex>gateIndexBefore&&!crossedRaceGate(r.racePreviousPosition,r.position,gate))invalidPasses[i]++;if(r.raceGateIndex===gateIndexBefore&&Number.isFinite(missRadius))missedGateCrossings[i].push({gate:gateIndexBefore,offset:+(missRadius-gate.radius).toFixed(2),position:[...r.position],velocity:[...r.velocity],lineDistance:r.raceLineDistance,gateDistance:gate.pathDistance,navClear:r.raceNavigation?.clear,navWait:r.raceNavigation?.wait});
   if(r.raceGateRecovery)recoverySeconds[i]+=1/60;if(r.raceGateRecovery&&!wasRecovering[i]){recoveryStarts[i]++;recoveryGates[i].push(r.raceGateIndex);}wasRecovering[i]=Boolean(r.raceGateRecovery);
   if(tick%2===0){p.fromArray(r.position);q.fromArray(r.rotation);inv.copy(q).invert();const ext=s.npcHullExtents(r);const hit=s.obstacles.find(o=>p.distanceToSquared(new T.Vector3(o.x,o.y,o.z))<(o.radius+Math.hypot(...ext))**2&&shipVsObstacle(p,q,r.variant,npcShipScaleForVariant(r.variant),o,contact));if(hit){hits[i]++;firstHits[i]??={time:elapsed,gate:r.raceGateIndex,id:hit.id,part:hit.sectionName,navClear:r.raceNavigation?.clear,lineDistance:r.raceLineDistance,raceLane:r.raceLane,laneOffset:r.laneOffset,position:[...r.position],velocity:[...r.velocity]};}}
  }
 }
 const result={id,seed,playerHullId,shipContacts:contacts.hits,contactMsPerStep:solveTime/solveSteps,racers:racers.map((r,i)=>({name:r.name,finished:r.raceFinished,time:r.raceFinishTime,averageSpeed:speedSum[i]/(r.raceFinishTime*60),peakSpeed:speedPeak[i],averageTargetSpeed:targetSpeedSum[i]/(r.raceFinishTime*60),brakeSeconds:brakeSeconds[i],gate:r.raceGateIndex,shortcut:r.raceShortcutState,pickups:r.raceBoostCollected?.size,contacts:hits[i],firstHit:firstHits[i],mistakeTriggered:r.raceMistakeTriggered,mistakeGate:r.raceMistakeGate,collisionResponses:collisionResponses[i],collisionDetails:collisionDetails[i],invalidPasses:invalidPasses[i],wideGatePasses:wideGatePasses[i],gateMissOffsets:gateMissOffsets[i],missedGateCrossings:missedGateCrossings[i],recoverySeconds:recoverySeconds[i],recoveryStarts:recoveryStarts[i],recoveryGates:recoveryGates[i],splits:r.raceSplits,position:r.position}))};results.push(result);
 for(const r of result.racers){
  assert.equal(r.invalidPasses,0,`${id}: ${r.name} passed outside the player aperture`);
  // Racing allows a brief physical brush, but never sustained scraping.
  assert.ok(r.collisionResponses<=2,`${id}: ${r.name} scraped wrecks for more than two simulation steps`);
  assert.ok(r.recoverySeconds<=r.recoveryStarts*12+.1,`${id}: ${r.name} circled too long after a miss`);
  assert.ok(r.finished&&r.time<180,`${id} seed ${seed} ${playerHullId} loaner: ${r.name} did not finish`);
  assert.ok(r.recoveryStarts<=4,`${r.name} repeated too many missed-gate recoveries (${r.recoveryStarts})`);
  assert.equal(r.contacts,0,`${id} seed ${seed}: ${r.name} clipped wreck geometry`);
 }
 assert.equal(racers.filter(r=>r.raceMistakeTriggered).length,1,`${id} seed ${seed}: one seeded rival should make its on-course corner mistake`);
 const bands={
  'mourning-run':[[34,45],[43,55],[52,70]],
  'mourning-breach':[[43,55],[50,65],[62,79]],
  'mourning-relict-gauntlet':[[95,118],[105,131],[115,145]],
 }[id];
 const ranked=result.racers.map(r=>r.time).sort((a,b)=>a-b);
 assert.ok(ranked[1]-ranked[0]>4&&ranked[2]-ranked[1]>5,`${id}: rival tiers should leave room for player mistakes`);
 for(let rank=0;rank<ranked.length;rank++)assert.ok(ranked[rank]>=bands[rank][0]&&ranked[rank]<=bands[rank][1],`${id} seed ${seed} rank ${rank+1}: ${ranked[rank].toFixed(1)}s outside target band ${bands[rank][0]}–${bands[rank][1]}s`);
});
test.after(async()=>{await mkdir('output/graveyard-review',{recursive:true});await writeFile('output/graveyard-review/race-pilots.json',JSON.stringify(results,null,2));});

test('race navigation detects actual wreck plating and sizes its scratch for the whole indexed mesh',()=>{
 const s=session();s.activeInstanceId='mourning-line';s.graveyard=[];s.wreckNodes=[];
 const obstacles=GameSession.prototype.activeFieldObstacles.call(s);
 const o=obstacles.filter(o=>o.modelWreckId).sort((a,b)=>b.meshVerts.length-a.meshVerts.length)[0];
 s.obstacles=[o];s.forEachObstacleInBox=(...args)=>args.at(-1)(o);
 const q=new T.Quaternion(o.box.qx,o.box.qy,o.box.qz,o.box.qw),points=[];
 // A high vertex-index triangle also catches undersized collision scratch.
 for(let i=o.meshIndices.length-3;i>=0;i-=3){
  points.length=0;for(let j=0;j<3;j++)points.push(new T.Vector3().fromArray(o.meshVerts,o.meshIndices[i+j]*3).applyQuaternion(q).add(new T.Vector3(o.x,o.y,o.z)));
  if(points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq()>1)break;
 }
 const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3);
 const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
 const r=createRaceRacers(generateRaceCourse('mourning-run'))[1];r.position=center.clone().addScaledVector(normal,20).toArray();r.velocity.fill(0);
 const goal=center.clone().addScaledVector(normal,-20),out=new T.Vector3();steerRacePilot(s,r,goal,1/60,out);
 assert.equal(r.raceNavigation.clear,false,'a real hull surface blocks the direct racing line');
 assert.ok(r.raceNavigation.scratch.length>=o.meshVerts.length,'scratch includes vertices referenced by every indexed face');
 assert.ok(out.toArray().every(Number.isFinite),'blocked pilots fall back to finite avoidance steering');
});


test('Mourning routes retain the requested lengths and flowing bends',()=>{
 const courses=['mourning-run','mourning-breach','mourning-relict-gauntlet'].map(generateRaceCourse);
 const lengths=courses.map(c=>c.localPoints.slice(1).reduce((sum,p,i)=>sum+new T.Vector3(...p).distanceTo(new T.Vector3(...c.localPoints[i])),0));
 assert.ok(lengths[2]>=20000&&lengths[2]<=22000,'the long course stays around 21 km');
 for(let i=0;i<2;i++)assert.ok(lengths[i]/lengths[2]>=.48&&lengths[i]/lengths[2]<=.55,'both shorter courses stay near half the Gauntlet length');
 for(const c of courses){
  for(let j=1;j<c.localPoints.length-1;j++){
   const a=new T.Vector3(...c.localPoints[j]).sub(new T.Vector3(...c.localPoints[j-1]));
   const b=new T.Vector3(...c.localPoints[j+1]).sub(new T.Vector3(...c.localPoints[j]));
   assert.ok(a.angleTo(b)<21*Math.PI/180,`${c.id}: abrupt bend at checkpoint ${j}`);
  }
  assert.ok(c.gates.length*c.centerFuelReward<=35,'extra curve checkpoints do not inflate fuel rewards');
 }
});

test('graveyard races have no shortcuts and 40% larger checkpoint and finish apertures',()=>{
 for(const [id,radius,finish] of [['mourning-run',100,128],['mourning-breach',84,108],['mourning-relict-gauntlet',68,92]]){
  const c=generateRaceCourse(id);
  assert.deepEqual(c.shortcuts,[]);
  assert.ok(c.gates.slice(0,-1).every(g=>g.radius===radius*1.4));
  assert.equal(c.gates.at(-1).radius,finish*1.4);
  assert.ok(createRaceRacers(c).every(r=>!r.raceShortcutChoice&&!r.shortcutChoice),'all rivals follow the full course');
 }
});


test('checkpoint spacing is independent of curve tessellation; the frigate-beta turn stays broad',()=>{
 for(const id of ['mourning-run','mourning-breach','mourning-relict-gauntlet']){
  const c=generateRaceCourse(id);let previous=c.gathering.localPosition,previousDistance=0;
  for(const gate of c.gates){
   assert.ok(Math.hypot(...gate.localPosition.map((v,i)=>v-previous[i]))>=250,`${id}: neighbouring rings must not bunch up`);
   assert.ok(gate.pathDistance-previousDistance>=360&&gate.pathDistance-previousDistance<=380,`${id}: regular distance along the flight path`);
   previous=gate.localPosition;previousDistance=gate.pathDistance;
  }
 }
 const ps=generateRaceCourse('mourning-relict-gauntlet').localPoints;let curvedSamples=0;
 for(let i=1;i<ps.length-1;i++){
  const b=new T.Vector3(...ps[i]);if(b.distanceTo(new T.Vector3(1900,-1400,100))>1100)continue;
  const u=b.clone().sub(new T.Vector3(...ps[i-1])),v=new T.Vector3(...ps[i+1]).sub(b),angle=u.angleTo(v);
  if(angle<.01)continue;
  const radius=Math.min(u.length(),v.length())/(2*Math.sin(angle/2));
  assert.ok(radius>=200,`old gate-73 region has a ${radius.toFixed(0)}m bend radius`);curvedSamples++;
 }
 assert.ok(curvedSamples>=8,'the regression exercises the actual extended frigate turn');
 const pieces=generateGraveyardPieces(175).filter(p=>p.id.startsWith('turn-debris-'));
 assert.equal(pieces.length,21,'three substantial seven-part wreckage assemblies');
 assert.ok(pieces.every(p=>p.render!==false&&p.collidable!==false),'turn landmarks are visible and physical');
});

// Collision proxies can omit a protruding engine face. Check the actual
// shipped render triangles too, including direct approaches between rings.
test('race lines and checkpoint approaches clear the rendered wreck surfaces with hull clearance',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {buildGlbScene}=await import('../../src/game/glbLoader.js');
 const {arrangeGraveyardModel}=await import('../../src/game/graveyardArt.js');
 const {GRAVEYARD_MODEL_WRECKS}=await import('../../src/game/worldData.js');
 const originalBitmap=globalThis.createImageBitmap,sources=new Map(),wrecks=[];
 globalThis.createImageBitmap=async()=>({width:512,height:512});
 try{
  for(const w of GRAVEYARD_MODEL_WRECKS){
   if(!sources.has(w.file)){
    const data=await readFile(w.file),source=await buildGlbScene(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
    source.traverse(m=>{if(m.isMesh)for(const mat of(Array.isArray(m.material)?m.material:[m.material]))mat.side=T.DoubleSide;});
    sources.set(w.file,source);
   }
   const mesh=arrangeGraveyardModel(sources.get(w.file),w);mesh.position.fromArray(w.local);mesh.updateMatrixWorld(true);wrecks.push(mesh);
  }
  for(const id of ['mourning-run','mourning-breach','mourning-relict-gauntlet']){
   const c=generateRaceCourse(id);
   for(const [kind,ps]of [['curve',c.localPoints],...c.gates.map(g=>['checkpoint tangent '+g.index,[-30,30].map(d=>g.localPosition.map((v,j)=>v+g.direction[j]*d))]),...c.boostPickups.map(p=>['boost detour '+p.index,[p.approach,p.position,p.rejoin].map(p=>p.map((v,j)=>v-c.center[j]))])]){
    for(let i=1;i<ps.length;i++)for(const offset of [[0,0,0],[15,0,0],[-15,0,0],[0,15,0],[0,-15,0],[0,0,15],[0,0,-15]]){
     const from=new T.Vector3(...ps[i-1]).add(new T.Vector3(...offset)),to=new T.Vector3(...ps[i]).add(new T.Vector3(...offset));
     const ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,from.distanceTo(to));
     const hits=ray.intersectObjects(wrecks,true);
     assert.equal(hits.length,0,`${id} ${kind} ${i} intersects rendered ${hits[0]?.object.name}`);
    }
   }
  }
 }finally{globalThis.createImageBitmap=originalBitmap;}
});

test('all nine pickup detours have hull clearance and nearby visible, physical debris',()=>{
 for(const seed of [175,718]){
  const s=session();s.activeInstanceId='mourning-line';s.graveyard=generateGraveyardPieces(seed);s.wreckNodes=generateWreckNodes(seed,{});
  const obstacles=GameSession.prototype.activeFieldObstacles.call(s),identity=new T.Quaternion(),scratch=new Float32Array(100000),contact={},p=new T.Vector3();
  for(const id of ['mourning-run','mourning-breach','mourning-relict-gauntlet']){
   const c=generateRaceCourse(id);assert.equal(c.boostPickups.length,3);
   for(const pickup of c.boostPickups){
    const debris=s.graveyard.find(p=>p.id===`boost-debris-${id}-${pickup.index}`);
    assert.ok(debris&&debris.render!==false&&debris.collidable!==false);assert.ok(Math.hypot(...debris.position.map((v,j)=>v-pickup.position[j]))<45);
    const route=[pickup.approach,pickup.position,pickup.rejoin];
    for(let i=1;i<route.length;i++)for(let t=0;t<=1;t+=.025){
     p.fromArray(route[i-1]).lerp(new T.Vector3(...route[i]),t);
     for(const o of obstacles){if(p.distanceToSquared(new T.Vector3(o.x,o.y,o.z))>(o.radius+21)**2)continue;
      const hit=o.shape==='ring'?hullVsRing(p,[12,12,12],identity,o,contact):o.shape==='engine'?hullVsEngine(p,[12,12,12],identity,o,contact):hullVsAsteroid(p,[12,12,12],identity,identity,o,scratch,contact);
      assert.ok(!hit,`${id} pickup ${pickup.index} intersects ${o.id}`);
     }
    }
   }
  }
 }
});
