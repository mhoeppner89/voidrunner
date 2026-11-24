import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {session} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {SpaceRenderer} from '../../src/game/render.js';
import {WEAPONS,LAUNCHERS} from '../../src/game/weapons.js';
import {BASE_OUTFIT_ITEMS,HULL_HARDPOINTS} from '../../src/game/outfitting.js';
import {setLanguage} from '../../src/game/i18n.js';
import {equipmentName,resolveEquipmentDefinition,registerEquipmentDefinition,forgetEquipmentDefinition} from '../../src/game/equipmentCatalog.js';
const V=(...args)=>new THREE.Vector3(...args);

function sight(){
 const s=session(),p=s.save.player,ship=s.spawnShip('pirate',[55,0,-220]),fit=p.outfitting.loadouts[p.shipId];
 p.currentTargetId=ship.id;p.mode='combat';fit.guns=['gauss-cannon','pulse-cannon'];fit.fireGroups.activeGroup='ALL';
 const camera=new THREE.PerspectiveCamera(70,16/9,.1,10000);camera.updateMatrixWorld();
 s.renderer=Object.assign(Object.create(SpaceRenderer.prototype),{camera,shipMeshes:new Map([[ship.id,{position:V(0,0,-200),visible:true}]]),tmpPosition:V(),viewportWidth:1280,viewportHeight:720});
 s.ui.cockpitPointVisible=()=>true;
 Object.assign(s,{leadPoint:V(),leadForward:V(),leadScreen:{},leadTargetScreen:{},leadTuple:new Float64Array(3)});
 return {s,p,ship,fit};
}
test('sight projects the slowest selected round from the rendered pose into reusable storage',()=>{
 const {s,p,ship,fit}=sight();ship.velocity=[80,0,0];p.velocity=[20,0,0];
 const lead=s.leadSolution(),time=200/Math.sqrt(WEAPONS.pulse.speed**2-60**2);
 const expected=s.renderer.projectToScreen(V(60*time,0,-200));
 assert.equal(lead,s.leadScreen);assert.ok(Math.abs(expected.x-lead.x)<1e-7);assert.equal(s.leadSolution(),lead);assert.equal(lead.solution,false);
 ship.velocity=[20,0,0];assert.equal(s.leadSolution().close,true);
 const point=s.renderer.shipMeshes.get(ship.id).position;point.z=-500;assert.equal(s.leadSolution().inRange,false);
 point.z=-700;assert.equal(s.leadSolution(),undefined);point.set(400,0,-200);assert.equal(s.leadSolution(),undefined);
 point.set(0,0,-200);fit.guns=['beam-emitter',null];assert.equal(s.leadSolution(),undefined);
 fit.guns=['beam-emitter','pulse-cannon'];
 const mounts=HULL_HARDPOINTS[p.shipId].guns;
 fit.fireGroups.assignments[mounts[0].id]='A';fit.fireGroups.assignments[mounts[1].id]='B';
 fit.fireGroups.activeGroup='A';assert.equal(s.leadSolution(),undefined);
 fit.fireGroups.activeGroup='B';assert.ok(s.leadSolution());
});
test('fire control scales with hardware, widens the assist cone, and works with assistance off',()=>{
 const {s,p,ship}=sight(),out=V(),nose=V(0,0,-1);ship.position=[45,0,-200];ship.velocity=[0,0,0];
 const target={kind:'ship',id:ship.id};s.renderer.shipMeshes.get(ship.id).position.fromArray(ship.position);
 const aim=()=>s.weaponAimDirection(V(),p.velocity,WEAPONS.pulse,target,nose,out).x;
 let strength=1;s.playerStats=()=>({assistMultiplier:strength});s.save.settings.aimAssist=true;
 assert.equal(aim(),0);assert.equal(s.leadSolution().solution,false);
 const base=BASE_OUTFIT_ITEMS['fire-control'];
 for(const tier of [1,2,3]){
  const def=resolveEquipmentDefinition(base,{tier,rarity:'common'});strength=def.effects.assistMultiplier;
  assert.ok(Math.abs(strength-(1+.45*[1,1.4,1.8][tier-1]))<1e-10);
  s.save.settings.aimAssist=true;const on=aim();assert.ok(on>0);s.save.settings.aimAssist=false;
  assert.equal(aim(),on);assert.equal(s.leadSolution().solution,false);
 }
 strength=1;assert.equal(aim(),0);
});
test('a fitted rare computer resolves its utility affixes and only the best computer guides fire',()=>{
 const {s,fit}=sight(),base=BASE_OUTFIT_ITEMS['fire-control'];
 const rare=resolveEquipmentDefinition(base,{id:'eq-test-computer',baseId:base.id,tier:2,rarity:'rare',affixes:['tuned','warded'],rolls:[.9,.8]});
 registerEquipmentDefinition(rare.id,rare);
 try {
  fit.utility=['fire-control'];const common=s.playerStats();
  fit.utility=['fire-control',rare.id];const combined=s.playerStats();
  assert.ok(combined.assistMultiplier>1.63);
  assert.equal(combined.assistMultiplier,rare.effects.assistMultiplier);
  assert.ok(combined.shield>common.shield);
 } finally {forgetEquipmentDefinition(rare.id);}
});
function battle(arena){
 const {session:s}=tutorialFixture();s.save.player.dockedAt=undefined;s.save.settings.reducedDamageEffects=false;
 const ship=s.spawnShip('pirate',[0,0,-40],undefined,undefined,{tier:'novice',temperament:'steady'},{hullId:'scrapper'});
 Object.assign(ship,{shield:0,rotation:[0,0,0,1],hostile:true,aiRng:()=>.49});s.arena=arena;
 const hit=(origin,amount=ship.maxHull*.2)=>s.damageShip(ship,amount,'player',[0,0,-40],WEAPONS.pulse,origin);
 return {s,ship,hit};
}
test('only exposed rear hull wears the drive, in both modes, and only career pilots yield and board',()=>{
 for(const mode of [undefined,{run:true}]){
  const {s,ship,hit}=battle(mode),base=ship.combatFit.stats;ship.shield=1;
  hit([0,0,0]);assert.ok(!ship.driveWear,'shield overflow');
  hit([0,0,-70],3);hit([30,0,-40],3);assert.ok(!ship.driveWear,'nose and flank');assert.ok(!ship.surrendered);
  hit([0,0,0]);assert.ok(ship.crippled);
  const stats=s.npcFlightStats(ship);assert.ok(stats.acceleration<base.acceleration*.5);assert.equal(stats.maxSpeed,base.maxSpeed*.5);
  assert.equal(stats.maxSpeed,stats.afterburnSpeed);const credits=s.save.player.credits;
  if(mode){
   assert.ok(!ship.surrendered&&!ship.fleeing&&!ship.poweredDown);assert.ok(!s.boardable(ship));
   s.updateBoarding(2.1);assert.ok(!ship.captured);continue;
  }
  assert.ok(ship.surrendered&&ship.poweredDown&&s.boardable(ship));
  s.save.player.position=[0,0,0];s.updateBoarding(2.1);assert.ok(ship.captured);assert.equal(s.save.player.credits-credits,Math.round(1.2*ship.bountyValue));assert.equal(s.monitorStatus,'CAPTURED');
 }
});
test('reduced damage effects suppress camera impulses and rapid clips share a cooldown',()=>{
 const {s,ship,hit}=battle();s.save.settings.reducedDamageEffects=true;s.damagePlayer(18,'weapons fire');assert.ok(!s.shakeStrength);
 s.save.settings.reducedDamageEffects=false;s.damagePlayer(18,'weapons fire');assert.ok(s.shakeStrength>0);
 const cues=[];s.audio.playCockpit=id=>cues.push(id);ship.shield=40;hit([0,0,0],2);hit([0,0,0],2);
 assert.deepEqual(cues,['confirmShield']);s.save.world.time+=.25;ship.shield=0;hit([0,0,0],1);assert.deepEqual(cues,['confirmShield','confirmHull']);
});

test('gold predicts a live mounted pulse hit with manual, assisted and computer fire control',()=>{
 for(const control of ['manual','assisted','computer']){
  for(const x of [0,7,10,35]){
   const {s,p,ship,fit}=sight();
   ship.hullId=ship.variant='scrapper';ship.position=[x,0,-300];ship.rotation=[0,0,0,1];ship.velocity=[0,0,0];
   fit.guns=['pulse-cannon',null];fit.utility=[control==='computer'?'fire-control':null];
   s.save.settings.aimAssist=control==='assisted';s.getTargetRef=()=>({kind:'ship',id:ship.id});
   s.renderer.shipMeshes.get(ship.id).position.fromArray(ship.position);
   const gold=s.leadSolution().solution;
   s.renderer.camera.rotateY(.012);s.renderer.camera.updateMatrixWorld();
   assert.equal(s.leadSolution().solution,gold,'camera shake cannot change the firing solution');
   let hit=false;s.damageShip=()=>{hit=true;};s.renderer.spawnMuzzleFlash=()=>{};s.renderer.weaponImpact=()=>{};
   s.fireMountedPlayerGuns();
   const shot=s.projectiles[0];assert.ok(shot);
   while(shot.life>0&&!hit)s.updateProjectiles(1/60);
   assert.equal(gold,hit,control+' at '+x);
   if(x===0||x===35)assert.equal(hit,x===0);
  }
 }
});
test('equal-speed mounts share the longest reach, but gold requires a ready barrel',()=>{
 for(const pair of [['ripper','pulse-cannon'],['pulse-cannon','ripper']]){
  const {s,p,ship,fit}=sight();fit.guns=pair;ship.position=[0,0,-400];ship.velocity=[0,0,0];
  s.renderer.shipMeshes.get(ship.id).position.fromArray(ship.position);
  assert.equal(s.leadSolution().inRange,true);
  p.energy=0;assert.equal(s.leadSolution().solution,false);
 }
});
test('dead, dying, docked, modal and hyperdrive states hide the sight',()=>{
 const {s,p}=sight();
 for(const [obj,key,value] of [[p,'hull',0],[s,'deathTimer',2],[p,'dockedAt','helix'],[s.ui,'isModalOpen',true],[s,'autopilot',true]]){
  const saved=obj[key];obj[key]=value;assert.equal(s.leadSolution(),undefined);obj[key]=saved;
 }
});
test('shield bypass and shield overflow both confirm hull damage',()=>{
 for(const [weapon,shield] of [[LAUNCHERS.torpedo,60],[WEAPONS.pulse,2]]){
  const {s,ship}=battle();ship.shield=shield;const sounds=[];s.audio.playCockpit=id=>sounds.push(id);
  s.damageShip(ship,12,'player',ship.position,weapon,[0,0,0],true);
  assert.equal(s.hitTick,'hull');assert.ok(sounds.includes('confirmHull'));
 }
});
test('only selected veteran and ace fighter fits carry the recoverable computer',()=>{
 for(const tier of ['novice','regular','veteran','ace']){
  const ship={hullId:'talon',pilot:{tier}};
  const fit=createEnemyLoadout(ship,0),plain=createEnemyLoadout(ship,1);
  assert.equal(fit.utility.includes('fire-control'),tier==='ace'||tier==='veteran');
  assert.equal(plain.utility.includes('fire-control'),false);
  assert.deepEqual(fit.profile,plain.profile);assert.deepEqual(fit.weaponDefinitions,plain.weaponDefinitions);
 }
});

test('shop and inventory use the tiered Fire Control name in both languages',()=>{
 const base=BASE_OUTFIT_ITEMS['fire-control'];
 try{
  for(const [lang,label] of [['en','Fire Control'],['de','Feuerleitung']]){
   setLanguage(lang);
   for(const [i,tier] of ['I','II','III'].entries()){
    const item=resolveEquipmentDefinition(base,{tier:i+1,rarity:'common'});
    assert.equal(equipmentName(item).replace(/\s+/g,' '),label+' '+tier);
   }
  }
 }finally{setLanguage('en');}
});
