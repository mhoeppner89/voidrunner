import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './combat-variety.test.mjs';
import {session} from './weapon-overhaul.test.mjs';
import {combatTargetEligible} from '../src/game/combatTargeting.js';
import {disruptWeapons,disruptionFactor,weaponDamage} from '../src/game/weaponDamage.js';
import {WEAPONS} from '../src/game/weapons.js';
import {loadoutFor} from '../src/game/outfitting.js';
test('automatic engagement waits through a demand and stops at surrender or stand-down',()=>{
 const ship={hull:100,hostile:true};assert.ok(combatTargetEligible(ship));
 for(const state of ['holdFire','standingDown','surrendered','captured','poweredDown','pendingMug','pendingMugLeaderId'])assert.equal(combatTargetEligible({...ship,[state]:true}),false,state);
});
test('patrol excludes itself, remembers only seen coordinates, expires memory and respects stand-down',()=>{
 const s=fixture(),p=s.spawnShip('patrol',[0,0,0]),e=s.spawnShip('pirate',[0,0,100]);p.hostile=true;e.hostile=true;s.canSee=()=>true;
 s.resolveShipTarget(p);assert.equal(p.targetId,e.id);
 s.canSee=()=>false;s.shipTracksPlayer=()=>false;e.position=[500,400,300];s.save.world.time+=.2;
 assert.deepEqual(s.resolveShipTarget(p).position.toArray(),[0,0,100]);assert.equal(p.patrolMemoryActive,true);
 e.standingDown=true;assert.equal(s.resolveShipTarget(p),undefined);
 e.standingDown=false;s.canSee=()=>true;s.resolveShipTarget(p);s.canSee=()=>false;s.save.world.time+=4.1;assert.equal(s.resolveShipTarget(p),undefined);
});
test('ion strips shields but disruption slows mounted player guns instead of stopping them',()=>{
 assert.equal(weaponDamage(100,5,WEAPONS.ion).shield,40);
 const s=session(),p=s.save.player,fit=loadoutFor(p);fit.guns=['pulse-cannon',null];fit.fireGroups.activeGroup='ALL';p.outfitting.loadouts[p.shipId]=fit;p.energy=100;p.shield=0;s.save.world.time=1;
 assert.ok(disruptWeapons(p,WEAPONS.ion,1));assert.equal(disruptionFactor(p,1),2);
 s.fireMountedPlayerGuns();assert.ok(s.projectiles.length>0);assert.ok(Math.abs(p.energy-93.6)<1e-6);
 assert.ok(Math.abs(Object.values(s.mountFireAt)[0]-1.34)<1e-6);
 assert.equal(disruptionFactor(p,1.81),1);
});

test('ion disruption halves NPC gun cadence and doubles each shot cost',()=>{
 const s=fixture(),ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'ace'});
 ship.rotation=[0,0,0,1];ship.combatWeaponIndex=0;ship.combatFit.weapons[0]='pulse';ship.combatFit.fireAt[0]=0;ship.shield=0;ship.energy=100;s.save.world.time=1;
 disruptWeapons(ship,WEAPONS.ion,1);const direction=s.tmpP6.set(0,0,-1);
 s.fireNpcGun(ship,direction);assert.equal(s.projectiles.length,1);assert.ok(Math.abs(ship.energy-93.6)<1e-6);
 s.save.world.time=1.18;s.fireNpcGun(ship,direction);assert.equal(s.projectiles.length,1);
 s.save.world.time=1.35;s.fireNpcGun(ship,direction);assert.equal(s.projectiles.length,2);assert.ok(Math.abs(ship.energy-87.2)<1e-6);
});

test('deployed drone waits during a pirate demand, intercepts a missile, then engages after combat starts',async()=>{
 const {createPdcDroneController}=await import('../src/game/dronePdc.js');
 const {createDroneFleet,createDroneUnit}=await import('../src/game/droneData.js');
 const fleet=createDroneFleet();fleet.unitsById.a=createDroneUnit('a','pdc');
 const point={position:[0,0,0],velocity:[0,0,0]},enemy={id:'pirate',hostile:true,hull:100,pendingMug:true,position:[100,0,0],velocity:[0,0,0]};
 const context={ownerId:'player',unitIds:['a'],shipPosition:[0,0,0],shipVelocity:[0,0,0],ownerRadius:2,inFlight:true,now:0,assignments:new Map(),threats:[],opponents:[enemy],bayAnchors:{a:{launch:point,dock:point}},escortAnchors:{a:point}};
 const controller=createPdcDroneController();
 for(let i=0;i<120;i++){context.now=i/60;assert.equal(controller.update(fleet,1/60,context,[]).filter(e=>e.type==='fire').length,0);}
 context.threats=[{id:'missile',kind:'missile',hostile:true,ownerId:'pirate',targetId:'player',position:[200,0,0],velocity:[-260,0,0],life:8}];
 context.now=2;assert.equal(controller.update(fleet,1/60,context,[]).filter(e=>e.type==='fire').length,1);
 context.threats=[];enemy.pendingMug=false;let attacks=0;
 for(let i=1;i<=120;i++){context.now=2+i/60;attacks+=controller.update(fleet,1/60,context,[]).filter(e=>e.type==='fire'&&e.targetKind==='ship').length;}
 assert.ok(attacks>0);
});

test('veteran forward guns reacquire stationary and crossing targets on later passes',async()=>{
 const THREE=await import('../vendor/three.module.min.js');
 const {regenerateCombatResources}=await import('../src/game/combatResources.js');
 for(const crossing of [false,true]) {
  const s=fixture(),ship=s.spawnShip('pirate',[0,0,280],undefined,undefined,{tier:'veteran',temperament:'steady'});
  ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.targetId='player';ship.noSurrender=true;ship.combatFit.missiles=0;ship.combatFit.turrets=[];
  ship.combatFit.weapons=['pulse'];ship.combatFit.attackOrder=[0];ship.combatFit.fireAt=[0];
  const target=new THREE.Vector3(),velocity=new THREE.Vector3(crossing?8:0,0,0);let lastShot=0,shots=0;
  const fire=s.spawnGunProjectile;s.spawnGunProjectile=function(...args){shots++;lastShot=this.save.world.time;return fire.apply(this,args);};
  for(let i=0;i<2400;i++) {s.save.world.time=i/60;target.addScaledVector(velocity,1/60);s.save.player.position=target.toArray();s.save.player.velocity=velocity.toArray();ship.fireCooldown-=1/60;regenerateCombatResources(ship,ship.combatFit.resources,1/60,100);s.updateAttackAI(ship,target,velocity,1/60);}
  assert.ok(shots>10,`${crossing}: ${shots} rounds`);assert.ok(lastShot>20,`${crossing}: last shot ${lastShot}`);
 }
});

test('mounted automatic turret respects a demand and resumes against the hostile after it ends',()=>{
 const s=session(),p=s.save.player;p.mode='combat';p.outfitting.loadouts[p.shipId].turrets=['tracking-turret'];
 const enemy={id:'pirate',hostile:true,hull:100,pendingMug:true,position:[0,80,0],velocity:[0,0,0]};s.ships=[enemy];s.getTargetRef=()=>({kind:'ship',id:enemy.id});let shots=0;s.fireBeam=()=>shots++;
 for(let i=0;i<120;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}assert.equal(shots,0);
 enemy.pendingMug=false;
 for(let i=120;i<240;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}assert.ok(shots>0);
});

test('patrol suppression lasts only the short last-seen window, even with a clear ray to stale coordinates',async()=>{
 const THREE=await import('../vendor/three.module.min.js');
 for(const blocked of [false,true]){
  const s=fixture(),ship=s.spawnShip('patrol',[0,0,200],undefined,undefined,{tier:'veteran'});
  ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];ship.combatFit.weapons=['pulse'];ship.combatFit.attackOrder=[0];ship.combatFit.fireAt=[0];ship.combatFit.missiles=0;ship.combatFit.turrets=[];
  ship.patrolMemoryActive=true;ship.patrolMemory={seenAt:0,id:'hidden',position:[0,0,0]};s.lineBlocked=()=>blocked;
  let early=0,late=0;s.fireNpcGun=()=>{if(s.save.world.time<.8)early++;else late++;};
  for(let i=0;i<120;i++){s.save.world.time=i/60;ship.fireCooldown=0;s.updateAttackAI(ship,new THREE.Vector3(),new THREE.Vector3(),1/60);}
  assert.ok(early>0);assert.equal(late,0);
 }
});

test('ion disruption requires shields down before the hit, for player and NPC',()=>{
 for(const player of [false,true])for(const shield of [0,1,40]) {
  const s=session(),actor=player?s.save.player:{tutorialCompanion:true,hull:100,shield,position:[0,0,0]};actor.shield=shield;actor.hull=100;
  const hit=(weapon,amount=5)=>player?s.damagePlayer(amount,'test',false,weapon):s.damageShip(actor,amount,'enemy',undefined,weapon);
  hit(WEAPONS.ion);assert.equal(Boolean(actor.disruptedUntil),shield===0);
  if(shield>0){assert.equal(actor.shield,0);hit(WEAPONS.pulse);assert.equal(actor.disruptedUntil,undefined);hit(WEAPONS.ion);assert.ok(actor.disruptedUntil>0);}
 }
});

test('slower PDC rounds retain nominal anti-ship DPS',async()=>{
 const {PDC_TURRET}=await import('../src/game/turrets.js');const {DRONE_TYPES}=await import('../src/game/droneData.js');
 assert.ok(Math.abs(PDC_TURRET.damageFlat*10/(9*PDC_TURRET.shotInterval+PDC_TURRET.burstPause)-11/(9*.07+1))<1e-9);
 const s=fixture();s.initializePdcDrones();assert.ok(Math.abs(s.pdcDroneWeapon.damageFlat/DRONE_TYPES.pdc.shotInterval-.8/.2)<1e-9);
});
