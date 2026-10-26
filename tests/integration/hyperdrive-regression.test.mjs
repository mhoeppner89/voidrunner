import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('../../vendor/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('../../vendor/three.module.min.js');
const {GameSession}=await import('../../src/game/game.js');
const {createNewSave}=await import('../../src/game/save.js');
const {getEffectiveShipStats}=await import('../../src/game/shipStats.js');
const {LOCATIONS,hyperdriveArrivalRadius}=await import('../../src/game/data.js');
import {flight} from '../helpers/hyperdrive-flight.mjs';
const axes={pitch:0,yaw:0,roll:0,throttleDelta:0};
test('changing navigation immediately drops cruise speed and restores throttle',()=>{
 const s=flight();s.autopilot=true;s.hyperdriveFx='active';s.save.player.velocity=[0,0,-50000];s.save.player.throttle=1;s.hyperdriveEncounterAt=20;
 s.setNav('vesper');assert.equal(s.autopilot,false);assert.ok(Math.hypot(...s.save.player.velocity)<=s.playerStats().maxSpeed*1.05);assert.equal(s.save.player.throttle,.37);assert.equal(s.hyperdriveEncounterAt,null);assert.equal(s.hyperdriveFx,'drop');
});
test('destination surface beyond the arrival shell does not block engagement; intervening cover does',()=>{
 const s=flight(5000);s.activeInstanceId='helix';s.lineBlocked=GameSession.prototype.lineBlocked;s.firstObstacleHitInfo=GameSession.prototype.firstObstacleHitInfo;
 assert.equal(s.hyperdriveBlockReason(),null);
 s.activeDockObstacle=()=>({id:'cover',x:s.save.player.position[0],y:s.save.player.position[1],z:s.save.player.position[2]-500,radius:100,losRadius:100});
 assert.equal(s.hyperdriveBlockReason()?.kind,'danger');
});
test('charge completes and arrives without the renderer advancing drive state',()=>{
 const s=flight();s.toggleHyperdrive();assert.equal(s.hyperdriveFx,'spooling');
 for(let i=0;i<600&&s.autopilot;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,axes);}
 assert.equal(s.autopilot,false);assert.equal(s.hyperdriveFx,'drop');
});
test('all accepted initial headings reach small arrival zones without orbiting',()=>{
 for(const distance of [5000,20000,200000])for(const angle of [0,.45,-.45]){
  const s=flight(distance,angle);s.toggleHyperdrive();assert.equal(s.autopilot,true);const leg=s.hyperdriveDestination();
  for(let i=0;i<1800&&s.autopilot;i++){s.save.world.time+=1/60;s.hyperdriveFxState();s.updatePlayer(1/60,axes);}
  assert.equal(s.autopilot,false,JSON.stringify({distance,angle,position:s.save.player.position}));
  assert.ok(Math.abs(new THREE.Vector3(...s.save.player.position).distanceTo(new THREE.Vector3(...leg.position))-hyperdriveArrivalRadius(leg))<20);
 }
});
test('reselecting the current nav point preserves the jump; actual changes cancel drone recovery',()=>{
 const s=flight();s.toggleHyperdrive();s.setNav('helix');assert.equal(s.autopilot,true);
 s.autopilot=false;s.pendingDroneDeparture={navTargetId:'helix',throttle:.22};s.save.player.throttle=0;s.setNav('vesper');assert.equal(s.pendingDroneDeparture,null);assert.equal(s.save.player.throttle,.22);
});
test('HUD reads are pure, spool holds position, and manual input drops to normal speed',()=>{
 const s=flight();const sounds=[];s.audio.play=k=>sounds.push(k);s.toggleHyperdrive();const position=[...s.save.player.position];
 for(let i=0;i<90;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,axes);}
 assert.deepEqual(s.save.player.position,position);assert.equal(s.hyperdriveFx,'spooling');
 s.save.world.time+=2;for(let i=0;i<8;i++)s.hyperdriveFxState();assert.equal(s.hyperdriveFx,'spooling');assert.equal(sounds.filter(k=>k==='hyperActive').length,0);
 s.updatePlayer(1/60,axes);assert.equal(s.hyperdriveFx,'active');assert.equal(sounds.filter(k=>k==='hyperActive').length,1);
 s.updatePlayer(1/60,{...axes,yaw:.5});assert.equal(s.autopilot,false);assert.ok(Math.hypot(...s.save.player.velocity)<s.playerStats().maxSpeed*1.06);assert.equal(s.save.player.throttle,.37);
});

test('a hyperdrive leg schedules the distress pickup only when a call is due',()=>{
 const due=flight();
 due.save.world.distress={active:null,history:[],nextAt:0,counter:0,lastVariants:[],migrated:true};
 due.toggleHyperdrive();
 assert.equal(due.autopilot,true);
 assert.ok(Number.isFinite(due.distressPickupAt),'the leg listens on the emergency band');
 assert.ok(due.distressPickupAt>due.save.world.time,'the call arrives in flight, not at the spool');
 const quiet=flight();
 quiet.save.world.distress={active:null,history:[],nextAt:9e9,counter:0,lastVariants:[],migrated:true};
 quiet.toggleHyperdrive();
 assert.equal(quiet.distressPickupAt??null,null,'a call inside its gap is not scheduled');
 // Dropping the leg cancels whatever was pending on it.
 due.autopilot=false;
 due.updateDistress();
 assert.equal(due.distressPickupAt,null);
});

test('guided docking cannot engage hyperdrive or overwrite a safe checkpoint',()=>{const s=flight();s.playerDocking={id:'helix',launch:true};s.toggleHyperdrive();assert.notEqual(s.autopilot,true);assert.equal(s.persistSave(),true);});

test('nearby hostiles no longer block or cancel a local jump',()=>{const s=flight();s.hostilesVisibleNear=()=>true;assert.equal(s.hyperdriveBlockReason(),null);s.toggleHyperdrive();assert.equal(s.autopilot,true);for(let i=0;i<90;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,axes);}assert.equal(s.autopilot,true);});

test('Rook to Helix remains one direct leg even though it passes near the Crown',()=>{const s=flight(),p=s.save.player;p.position=[...LOCATIONS.rook.position];p.navTargetId=p.currentTargetId='helix';p.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(...LOCATIONS.helix.position).sub(new THREE.Vector3(...p.position)).normalize()).toArray();s.toggleHyperdrive();assert.equal(s.hyperdriveDestination().id,'helix');for(let i=0;i<1800&&s.autopilot;i++){s.save.world.time+=1/60;s.updatePlayer(1/60,axes);}assert.equal(s.autopilot,false);assert.equal(p.navTargetId,'helix');assert.ok(Math.abs(new THREE.Vector3(...p.position).distanceTo(new THREE.Vector3(...LOCATIONS.helix.position))-hyperdriveArrivalRadius(LOCATIONS.helix))<20);assert.match(s.hyperdriveStatus,/Helix/);});
