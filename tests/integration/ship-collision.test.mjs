import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LOCATIONS} from '../../src/game/data.js';

test('fighters get the frigate-sized avoidance envelope before a contact',()=>{
 const s=session();
 s.save.player.position=[1000,1000,1000];
 s.save.player.velocity=[0,0,0];
 const frigate=s.spawnCapitalShip('concord-frigate',[0,0,0]);
 const fighter=s.spawnShip('bounty',[0,0,260],undefined,undefined,{tier:'veteran'});
 frigate.rotation=[0,0,0,1];
 fighter.rotation=[0,0,0,1];
 frigate.velocity=[0,0,0];
 fighter.velocity=[0,0,-57];
 const avoidance=s.getShipAvoidance(new THREE.Vector3(0,0,260),new THREE.Vector3(0,0,-57),fighter);
 assert.ok(avoidance&&avoidance.length()>0,'a fighter should turn before its centreline reaches the frigate hull');
});

test('a fighter ram is heavily absorbed by the frigate but not by the fighter',()=>{
 const s=session();
 s.save.player.position=[1000,1000,1000];
 s.save.player.velocity=[0,0,0];
 const frigate=s.spawnCapitalShip('concord-frigate',[0,0,0]);
 const fighter=s.spawnShip('bounty',[0,0,120],undefined,undefined,{tier:'veteran'});
 frigate.rotation=[0,0,0,1];
 fighter.rotation=[0,0,0,1];
 frigate.velocity=[0,0,0];
 fighter.velocity=[0,0,-57];
 const frigateBefore=frigate.shield+frigate.hull;
 const fighterBefore=fighter.shield+fighter.hull;
 s.resolveShipContacts();
 const frigateLoss=frigateBefore-(frigate.shield+frigate.hull);
 const fighterLoss=fighterBefore-(fighter.shield+fighter.hull);
 assert.ok(frigateLoss>0&&fighterLoss>0);
 assert.ok(frigateLoss<fighterLoss*.5,`frigate ${frigateLoss} fighter ${fighterLoss}`);
});

test('NPCs are not pushed or slowed before their actual hulls touch',()=>{
 const s=session();
 s.save.player.position=[1000,1000,1000];
 s.save.player.velocity=[0,0,0];
 const lancer=s.spawnShip('bounty',[0,0,0]);
 const talon=s.spawnShip('pirate',[0,0,30]);
 lancer.rotation=[0,0,0,1];
 talon.rotation=[0,0,0,1];
 lancer.velocity=[0,0,12];
 talon.velocity=[0,0,-12];
 const lancerBefore=lancer.shield+lancer.hull;
 const talonBefore=talon.shield+talon.hull;
 s.resolveShipContacts();
 assert.deepEqual(lancer.position,[0,0,0]);assert.deepEqual(talon.position,[0,0,30]);
 assert.deepEqual(lancer.velocity,[0,0,12]);assert.deepEqual(talon.velocity,[0,0,-12]);
 assert.equal(lancer.shield+lancer.hull,lancerBefore);
 assert.equal(talon.shield+talon.hull,talonBefore);
});

test('an actual NPC impact exchanges momentum without adding kinetic energy',()=>{
 const s=session();s.save.player.position=[1000,1000,1000];
 const a=s.spawnShip('bounty',[0,0,0],undefined,undefined,undefined,{hullId:'lancer'}),b=s.spawnShip('pirate',[-6,-3,0],undefined,undefined,undefined,{hullId:'lancer'});
 a.rotation=[0,0,0,1];b.rotation=[0,0,0,1];const speed=30/Math.sqrt(45);a.velocity=[-6*speed,-3*speed,0];b.velocity=[6*speed,3*speed,0];
 const before=[...a.velocity];s.resolveShipContacts();
 assert.notDeepEqual(a.velocity,before,'contact applies recoil');
 for(let i=0;i<3;i++)assert.ok(Math.abs(a.velocity[i]+b.velocity[i])<1e-9,'equal hulls conserve momentum');
 assert.ok(Math.hypot(...a.velocity)<30,'the impact loses rather than creates kinetic energy');
});

test('pilots open the predicted passing gap, even when the other ship starts on the opposite side',()=>{
 const s=session();
 s.save.player.position=[4000,4000,4000];
 const a=s.spawnShip('patrol',[0,0,0]), b=s.spawnShip('pirate',[25,0,-100]);
 a.velocity=[0,0,-90];b.velocity=[-40,0,0];
 const dodge=()=>s.getShipAvoidance(new THREE.Vector3(...a.position),new THREE.Vector3(...a.velocity),a);
 // The contact is to starboard now, but will pass to port if both coast.
 assert.ok(dodge().x>0);
 b.position=[160,0,-100];assert.equal(dodge(),undefined,'a safe crossing does not interrupt the attack');
 b.position=[25,0,100];assert.equal(dodge(),undefined,'diverging traffic needs no correction');
});

test('fast head-on, crossing and overtaking Talons fly apart before their hulls touch',()=>{
 const cases=[
  [[0,0,-100],[0,0,95],[0,0,100],[0,0,-95]],
  [[0,-100,0],[0,95,0],[0,100,0],[0,-95,0]],
  [[0,0,0],[0,0,-90],[80,0,-68],[-70,0,-30]],
  [[0,0,0],[0,0,-100],[5,0,-80],[-5,0,-30]],
 ];
 const nose=new THREE.Vector3(0,0,-1),p=new THREE.Vector3(),v=new THREE.Vector3();
 for(const [pa,va,pb,vb] of cases){
  const s=session();s.save.player.position=[4000,4000,4000];
  const pilot={tier:'veteran',temperament:'steady'},hull={hullId:'talon'};
  const a=s.spawnShip('patrol',pa,undefined,undefined,pilot,hull),b=s.spawnShip('pirate',pb,undefined,undefined,pilot,hull);
  const pair=[[a,va,b],[b,vb,a]],steering=[];
  for(const [ship,velocity,target] of pair){
   ship.velocity=velocity.slice();
   ship.rotation=new THREE.Quaternion().setFromUnitVectors(nose,v.fromArray(velocity).normalize()).toArray();
   ship.targetId=target.id;ship.holdFire=true;ship.combatFit.turrets=[];ship.combatFit.missiles=0;
  }
  for(const [ship] of pair)steering.push(s.getShipAvoidance(p.fromArray(ship.position),v.fromArray(ship.velocity),ship).clone().normalize());
  assert.ok(steering[0].dot(steering[1])<-.99,'both pilots choose complementary sides');
  let closest=Infinity;
  for(let i=0;i<480;i++){
   s.save.world.time+=1/60;
   for(const [ship,,target] of pair)s.updateAttackAI(ship,p.fromArray(target.position),v.fromArray(target.velocity),1/60);
   closest=Math.min(closest,p.fromArray(a.position).distanceTo(v.fromArray(b.position)));
   p.fromArray(a.position);s.resolveShipContacts();
   assert.ok(p.equals(v.fromArray(a.position)),'pilots avoid an actual hull impact');
  }
  assert.ok(closest<45,'pilots still make a close pass');
 }
});

test('Rin and the tutorial pirate keep flying through a close-range duel',()=>{
 const {session:s,save}=tutorialFixture('defeat-raider');
 delete s.updateTravelAI;delete s.updateAttackAI;
 save.player.position=[...LOCATIONS.shardbelt.position];save.player.rotation=[0,0,0,1];save.player.velocity=[0,0,0];save.player.dockedAt=undefined;
 s.activeInstanceId='shardbelt';s.arena=null;s.ui.setWingTactics=()=>{};s.renderer.showCombatBeam=()=>{};
 const rin=s.ensureTutorialCompanion(true),pirate=s.ensureTutorialEnemy();
 pirate.targetId=rin.id;save.player.currentTargetId=pirate.id;save.wingOrder='aggressive';
 let min=Infinity,max=0,contacts=0;
 for(let i=0;i<3600;i++){
  save.world.time+=1/60;s.updateShips(1/60);
  const before=[...rin.position,...pirate.position];s.resolveShipContacts();
  if(before.some((v,j)=>v!==(j<3?rin.position[j]:pirate.position[j-3])))contacts++;
  const d=Math.hypot(...rin.position.map((v,j)=>v-pirate.position[j]));min=Math.min(min,d);max=Math.max(max,d);
 }
 assert.ok(min<40&&max>200,'the pilots engage, pass close and separate again');
 assert.ok(contacts<=1,`repeated hull impacts in the tutorial duel: ${contacts}`);
 assert.equal(rin.targetId,pirate.id);assert.equal(pirate.targetId,rin.id);
});
