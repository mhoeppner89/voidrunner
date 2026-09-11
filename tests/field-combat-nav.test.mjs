import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
const {generateGraveyardPieces,generateAsteroidField}=await import('../src/game/worldData.js');
const {GameSession}=await import('../src/game/game.js');
const {LOCATIONS}=await import('../src/game/data.js');
function fieldEncounter(seed,field,role,tier){
 const s=session();s.tmpCollide=new THREE.Vector3();s.tmpEuler=new THREE.Euler();s.damageShip=()=>{};s.fireNpcGun=()=>{};
  s.activeInstanceId=field==='debris'?'mourning-line':'shardbelt';s.asteroids=generateAsteroidField(seed,[]);s.graveyard=generateGraveyardPieces(seed);s.wreckNodes=[];
  s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;s.obstacles=s.activeFieldObstacles();
  const center=new THREE.Vector3(...LOCATIONS[s.activeInstanceId].position);
  for(const k of ['tmpEntryAnchor','tmpEntryCandidate','tmpEntryPreferredDirection'])s[k]=new THREE.Vector3();
  s.setFieldArenaPosition(center,s.activeInstanceId);const origin=center.toArray();
 s.save.player.position=[...origin];const enemyStart=new THREE.Vector3(origin[0]-110,origin[1]+80,origin[2]-240);
 s.ensurePlayerEntryClearance(enemyStart,s.activeInstanceId,new THREE.Vector3(0,0,-1));
 const ship=s.spawnShip(role,enemyStart.toArray(),undefined,undefined,{tier,temperament:'steady'});ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...origin).sub(enemyStart).normalize()).toArray();ship.velocity=new THREE.Vector3(0,0,-40).applyQuaternion(new THREE.Quaternion(...ship.rotation)).toArray();ship.targetId='player';ship.combatFit.turrets=[];ship.combatFit.missiles=0;
 return {s,ship};
}
test('all six hull profiles keep moving in generated fields, with bounded turns and ace manoeuvres',()=>{
const results=[];
for(const seed of [718,941])for(const field of ['debris','asteroids'])for(const role of ['pirate','escort','bounty','patrol','trader','miner'])for(const tier of ['novice','veteran','ace']){
 const {s,ship}=fieldEncounter(seed,field,role,tier);
 let slow=0,maxTurn=0,streak=0,maxStreak=0,meanSpeed=0,moves=new Set(),hits=0;s.damageShip=()=>hits++;
 for(let i=0;i<3600;i++){
  s.save.world.time=i/60;const before=new THREE.Quaternion().fromArray(ship.rotation);
  s.updateAttackAI(ship,new THREE.Vector3(...s.save.player.position),new THREE.Vector3(),1/60);s.resolveNpcCollisions(ship);
  const fraction=Math.hypot(...ship.velocity)/ship.speed;meanSpeed+=fraction;if(fraction<.2){slow++;streak++;}else streak=0;maxStreak=Math.max(maxStreak,streak);if(ship.aceMove)moves.add(ship.aceMove.kind);maxTurn=Math.max(maxTurn,before.angleTo(new THREE.Quaternion().fromArray(ship.rotation)));
 }
 const result={seed,field,role,tier,slow:slow/3600,maxStall:maxStreak/60,meanSpeed:meanSpeed/3600,maxTurn,hits,moves:[...moves],plans:ship.fieldNav.plans};results.push(result);
 assert.ok(maxTurn<.05,JSON.stringify(result));assert.ok(maxStreak<420,JSON.stringify(result));
 assert.ok(meanSpeed/3600>.55,JSON.stringify(result));assert.ok(ship.fieldNav.plans<=301,JSON.stringify(result));
}
for(const field of ['debris','asteroids']){const rows=results.filter(x=>x.field===field),slow=rows.reduce((n,x)=>n+x.slow,0)/rows.length;assert.ok(slow<(field==='debris'?.05:.12),JSON.stringify({field,slow}));}
const moves=new Set(results.flatMap(x=>x.moves));for(const name of ['drift-pass','boost-reversal','rolling-break'])assert.ok(moves.has(name),name);
assert.ok(results.filter(x=>x.tier!=='ace').every(x=>x.moves.length===0));
console.log('Field flight:',JSON.stringify(results.reduce((summary,row)=>{summary[row.field]??={cases:0,slow:0,impacts:0};const item=summary[row.field];item.cases++;item.slow+=row.slow;item.impacts+=row.hits;return summary;},{})));
});

test('hunters keep moving when obstacle occlusion hands combat to search and back',()=>{
 for(const field of ['debris','asteroids'])for(const tier of ['novice','veteran','ace']){
  const {s,ship}=fieldEncounter(718,field,'pirate',tier);
  s.arena=undefined;s.playerIdentityBroadcasting=()=>true;s.announceSearchStart=()=>{};
  let resolved=true,searchFrames=0,slow=0,maxTurn=0;
  s.shipTracksPlayer=()=>resolved;
  for(let i=0;i<1200;i++){
   s.save.world.time=i/60;
   if(i===300){resolved=false;ship.lastResolvedPlayer=[...s.save.player.position];}
   if(i===900)resolved=true;
   const before=new THREE.Quaternion().fromArray(ship.rotation);
   const searching=s.updateSearchAI(ship,1/60);
   if(i===300)assert.equal(searching,true);
   if(i===900){assert.equal(searching,false);assert.equal(ship.search,undefined);}
   if(searching){s.updateTravelAI(ship,1/60);searchFrames++;if(Math.hypot(...ship.velocity)<ship.speed*.2)slow++;}
   else s.updateAttackAI(ship,new THREE.Vector3(...s.save.player.position),new THREE.Vector3(),1/60);
   s.resolveNpcCollisions(ship);
   maxTurn=Math.max(maxTurn,before.angleTo(new THREE.Quaternion().fromArray(ship.rotation)));
  }
  assert.ok(searchFrames>=500,JSON.stringify({field,tier,searchFrames}));
  assert.ok(slow/searchFrames<.2,JSON.stringify({field,tier,slow,searchFrames}));
  assert.ok(maxTurn<.05,JSON.stringify({field,tier,maxTurn}));
 }
});
