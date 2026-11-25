import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LAUNCHERS,fillLauncherMagazines} from '../../src/game/weapons.js';
import {createOutfittingState} from '../../src/game/outfitting.js';
import {updateFrigateBatteries,frigateMountPosition} from '../../src/game/capitalCombat.js';
import {FRIGATE_TORPEDO_LAYOUT} from '../../src/game/frigateMounts.js';
import {cockpitLockState} from '../../src/game/weaponFlight.js';
import {magazineLabel} from '../../src/game/equipmentStatPresentation.js';
import {t} from '../../src/game/i18n.js';

const dt=1/60;
function bomberFight(){
 const s=session(),p=s.save.player;p.position=[1000,0,0];
 function add(hullId,x,z,faction='concord'){
  const ship=s.spawnShip('patrol',[x,0,z],undefined,undefined,{tier:'ace'},{hullId,faction});
  Object.assign(ship,{rotation:[0,1,0,0],velocity:[0,0,0],holdFire:false,pendingMug:false});
  return ship;
 }
 const bomber=add('andromeda',0,0,'pirates'),fighter=add('talon',-20,-280);
 Object.assign(bomber,{targetId:fighter.id,rotation:[0,0,0,1],hostile:true,playerAwareness:1,energy:100});
 const fit=bomber.combatFit;fit.racks=[{launcher:'torpedo',missiles:2}];
 const aim=new Vector3(...fighter.position);
 function step(frames=1){
  for(let i=0;i<frames;i++){s.save.world.time+=dt;s.updateNpcOrdnance(bomber,aim,dt);}
 }
 return {s,p,bomber,fighter,fit,step,add};
}

test('a frigate holds both cells when the player or an allied ship crosses the tube-to-target line',()=>{
 for(const obstruction of ['player','escort']){
  const s=session(),p=s.save.player;p.position=[1000,0,0];
  const frigate=s.spawnCapitalShip('concord-frigate',[0,0,0],'rook','Guard');
  Object.assign(frigate,{rotation:[0,0,0,1],hostile:false,holdFire:false});
  frigate.capitalMountHull.fill(0,0,4);
  const mark=s.spawnShip('trader',[0,0,-420],undefined,undefined,undefined,{hullId:'mule',faction:'pirates'});
  Object.assign(mark,{velocity:[0,0,0],holdFire:false,pendingMug:false});frigate.targetId=mark.id;
  const goal=new Vector3(...mark.position),layout=FRIGATE_TORPEDO_LAYOUT;
  const cell=frigateMountPosition(frigate,11,new Vector3()).add(new Vector3(layout.cellX,layout.muzzleHeight,-layout.cellZ));
  const blocker=obstruction==='player'?p:s.spawnShip('escort',[0,0,0],undefined,undefined,undefined,{faction:'concord'});
  blocker.position=cell.lerp(goal,.18).toArray();
  s.save.world.time=20;updateFrigateBatteries(s,frigate,4,goal,new Vector3());
  assert.equal(frigate.capitalTorpedoes,2,obstruction);
  blocker.position=[1000,0,0];s.save.world.time+=4;updateFrigateBatteries(s,frigate,4,goal,new Vector3());
  assert.equal(frigate.capitalTorpedoes,0,'clear tube paths release both rounds');
 }
});

test('a hostile bomber targets a visible player Atlas independently of its gun target and warns the cockpit',()=>{
 const {s,p,bomber,fighter,fit,step}=bomberFight();p.shipId='atlas';p.position=[60,0,-330];
 step(15);assert.equal(fit.lockTarget,'player');assert.equal(bomber.targetId,fighter.id);
 assert.equal(cockpitLockState(s.ships,s.save.world.time,false),'acquiring');
 step(180);assert.equal(s.projectiles[0]?.targetId,'player');
 for(const unavailable of ['allied','docked','observer','hidden']){
  const fight=bomberFight();fight.p.shipId='atlas';fight.p.position=[60,0,-330];
  if(unavailable==='allied')fight.bomber.hostile=false;
  if(unavailable==='docked')fight.p.dockedAt='helix';
  if(unavailable==='observer')fight.s.arena.observer=true;
  if(unavailable==='hidden')fight.bomber.playerTrackOccluded=true;
  fight.step();assert.notEqual(fight.fit.lockTarget,'player',unavailable);
 }
});

test('bombers select the clear transport when a friendly hull screens the nearer transport',()=>{
 const {s,fit,add,step}=bomberFight();
 add('mule',-80,-260);const clear=add('atlas',80,-340);
 add('talon',-40,-130,'pirates');step(240);
 assert.equal(s.projectiles[0]?.targetId,clear.id);assert.equal(fit.racks[0].missiles,1);
});

test('a secondary transport crossing the mobility limit sheds partial lock at the normal rate',()=>{
 const {fit,add,step}=bomberFight(),mark=add('mule',0,-350);
 step(60);assert.equal(fit.lockTarget,mark.id);const initial=fit.lock;
 assert.ok(Math.abs(initial-1/3)<1e-10);mark.velocity=[0,0,61];
 step();assert.equal(fit.lockTarget,mark.id);assert.ok(Math.abs(fit.lock-(initial-dt/3))<1e-10);
 step(59);assert.ok(fit.lock<1e-10);step(2);assert.notEqual(fit.lockTarget,mark.id);
});

test('frigate tubes reserve their salvo when a parked fighter is the only enemy',()=>{
 const s=session(),p=s.save.player;p.shipId='talon';p.position=[0,0,-300];
 const frigate=s.spawnCapitalShip('concord-frigate',[0,0,0],'rook','Guard');
 Object.assign(frigate,{rotation:[0,0,0,1],hostile:true,holdFire:false,targetId:'player',playerAwareness:1});
 frigate.capitalMountHull.fill(0,0,4);s.save.world.time=20;
 updateFrigateBatteries(s,frigate,4,new Vector3(...p.position),new Vector3());
 assert.equal(frigate.capitalTorpedoes,2);assert.equal(frigate.capitalTorpedoWarning,false);
});

test('torpedo splash applies shield piercing to the struck capital hull and leaves small-craft shields effective',()=>{
 for(const capitalClass of [undefined,'corvette','frigate']){
  const s=session();s.save.player.position=[500,0,0];
  const bystander=s.spawnShip('patrol',[0,0,0]);bystander.capitalClass=capitalClass;
  Object.assign(bystander,{rotation:[0,0,0,1],hull:1000,maxHull:1000,shield:500});
  s.obstacles=[{id:'rock',x:0,y:0,z:-80,radius:5,losRadius:5}];
  bystander.position=[s.npcHullExtents(bystander)[0]+5,0,-75];
  const rack=LAUNCHERS.torpedo,slot=s.projStore.alloc();
  s.projStore.setPos(slot,0,0,0);s.projStore.setVel(slot,0,0,-200);
  s.projectiles.push({slot,kind:'missile',ownerId:'player',launcherId:'torpedo',hitWeapon:rack,
   damage:rack.damage,life:2,acceleration:0,splashMin:rack.splashMin,splashRadius:rack.splashRadius});
  s.updateProjectiles(.5);
  if(capitalClass){assert.equal(bystander.shield,500);assert.ok(bystander.hull<1000);}
  else{assert.ok(bystander.shield<500);assert.equal(bystander.hull,1000);}
 }
});

test('secondary target scans reuse faction-check arguments across simulation steps',()=>{
 const {s,fit,add,step}=bomberFight(),mark=add('mule',0,-350),queries=new Set();
 const canHit=s.projectileCanHitShip;
 s.projectileCanHitShip=function(projectile,target){queries.add(projectile);return canHit.call(this,projectile,target);};
 step(20);assert.equal(fit.lockTarget,mark.id);assert.ok(queries.size<=1,`${queries.size} transient queries`);
});

function cockpitFight(){
 const {session:s,save}=tutorialFixture();const p=save.player;
 p.dockedAt=undefined;p.shipId='andromeda';p.ownedShips=[p.shipId];p.outfitting=createOutfittingState(p.ownedShips);
 p.position=[0,0,0];p.velocity=[0,0,0];p.rotation=[0,0,0,1];
 p.outfitting.loadouts[p.shipId].launchers=['seeker-launcher','torpedo-launcher',null];
 const [seeker,tube]=fillLauncherMagazines(p);
 const enemy=s.spawnShip('pirate',[0,0,-300]);enemy.velocity=[0,0,70];p.currentTargetId=enemy.id;
 s.renderer.projectTargetToScreen=()=>({visible:false,x:0,y:0});s.targetEdge=()=>undefined;
 s.getTargetRef=()=>({kind:'ship',id:enemy.id,position:enemy.position});
 return {s,p,seeker,tube,enemy,read:()=>s.buildHudModel().monitorStatus};
}
test('Together shows a motion-blocked torpedo with the seeker selected and skips an empty or cooling tube',()=>{
 const {s,p,seeker,tube,enemy,read}=cockpitFight();p.activeLauncherMountId=seeker.mount.id;p.launcherFireMode='together';
 s.updatePlayerRackLocks(3);assert.equal(read(),t('TOO FAST'));
 s.launcherReadyAt={[`${p.shipId}:${tube.mount.id}`]:s.save.world.time+1};
 assert.notEqual(read(),t('TOO FAST'));s.save.world.time+=2;
 p.launcherMagazines[tube.mount.id].rounds=0;assert.notEqual(read(),t('TOO FAST'));
 p.launcherMagazines[tube.mount.id].rounds=1;enemy.velocity=[0,0,30];s.updatePlayerRackLocks(dt);
 assert.notEqual(read(),t('TOO FAST'));
});
test('a denied Single torpedo shot clears TOO FAST as soon as the pilot selects a seeker',()=>{
 const {s,p,seeker,tube,read}=cockpitFight();p.activeLauncherMountId=tube.mount.id;p.launcherFireMode='single';
 s.updatePlayerRackLocks(3);s.fireMissile();assert.equal(read(),t('TOO FAST'));
 s.cycleLauncher();assert.equal(p.activeLauncherMountId,seeker.mount.id);assert.notEqual(read(),t('TOO FAST'));
});

test('release text identifies the shield exception and the fitting card rates torpedoes against small craft',()=>{
 assert.equal(magazineLabel(LAUNCHERS.torpedo,'shield'),'360 × 2');
 assert.equal(magazineLabel(LAUNCHERS.torpedo,'hull'),'360 × 2');
 for(const name of ['README.md','CHANGELOG.md']){
  const lines=readFileSync(new URL('../../'+name,import.meta.url),'utf8').split('\n');
  const entry=lines.find(line=>/torpedoes deal 360/i.test(line));
  assert.match(entry??'',/pierce (?:corvette and capital-ship shields|the shields of corvettes and capital ships)/i,name);
 }
});
