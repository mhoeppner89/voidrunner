import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
const {PDC_TURRET}=await import('../src/game/turrets.js');
import {TURRET_LAYOUTS} from '../src/game/turretLayouts.js';
import {loadoutFor} from '../src/game/outfitting.js';
const {SpaceRenderer}=await import('../src/game/render.js');

function setup(hull='wayfarer',kind='pdc',index=0){
 const s=session(),p=s.save.player;p.shipId=hull;p.ownedShips=[hull];p.mode='combat';
 const fit=loadoutFor(p);fit.turrets=fit.turrets.map((_,i)=>i===index?kind:null);p.outfitting.loadouts[hull]=fit;
 const enemy=s.spawnShip('pirate',[0,0,-60]);enemy.hostile=true;enemy.rotation=[0,0,0,1];enemy.velocity=[0,0,0];enemy.hull=enemy.maxHull=100;enemy.shield=enemy.maxShield=100;
 s.getTargetRef=()=>({kind:'ship',id:enemy.id});return {s,p,enemy};
}
function tick(s,seconds,actor=s.save.player,id='player'){
 for(let i=0;i<Math.round(seconds*120);i++){s.save.world.time+=1/120;s.updateTurrets(actor,id,1/120);s.updateProjectiles(1/120);}
}
function missile(s,position,targetId='player'){
 const slot=s.projStore.alloc();s.projStore.setPos(slot,...position);s.projStore.setVel(slot,0,0,10);
 const m={slot,kind:'missile',acceleration:0,damage:42,ownerId:'attacker',targetId,life:10};s.projectiles.push(m);return m;
}

test('PDC fires ten timed rounds, pauses, and deals modest hull damage with a strong shield penalty',()=>{
 const {s,p,enemy}=setup(),shots=[];const fire=s.spawnGunProjectile.bind(s);
 s.spawnGunProjectile=(...args)=>{shots.push(s.save.world.time);return fire(...args);};
 for(let i=0;i<600 && shots.length<10;i++)tick(s,1/120);
 assert.equal(shots.length,10);assert.ok(shots[9]-shots[0]>=.63-1e-9);
 tick(s,.2);assert.ok(Math.abs(enemy.shield-98.8)<1e-8);assert.equal(enemy.hull,100);
 tick(s,.7);assert.equal(shots.length,10,'a visible pause separates bursts');
 enemy.shield=0;for(let i=0;i<600 && shots.length<20;i++)tick(s,1/120);
 assert.equal(shots.length,20);tick(s,.2);assert.ok(Math.abs(enemy.hull-92)<1e-8);
 assert.ok(p.energy>=s.playerStats().energyCapacity*.25+4);
});

test('missiles interrupt ship bursts and remain available during the ship burst pause',()=>{
 for(const shotCount of [3,10]){
  const {s,p}=setup();let shots=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{shots++;return spawn(...a);};
  for(let i=0;i<600 && shots<shotCount;i++)tick(s,1/120);
  const m=missile(s,[0,4,-30]);tick(s,.1);
  assert.equal(m.life,0,'one missile should be destroyed promptly despite offensive cooldown');
  const a=missile(s,[0,4,-30]),b=missile(s,[0,4,-40]);tick(s,.1);
  assert.ok(a.life>0 && b.life>0,'an interception cooldown prevents instant salvo deletion');
  tick(s,.6);assert.equal(a.life,0);assert.ok(b.life>0);
  assert.ok(p.energy>0);
 }
});

test('PDC ship fire leaves interception energy and both respect the pilot reserve',()=>{
 const {s,p}=setup();let fired=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{fired++;return spawn(...a);};
 const reserve=Math.max(12,s.playerStats().energyCapacity*.25);p.energy=reserve+4+.3;
 tick(s,1);assert.equal(fired,0);assert.equal(p.turretRuntime[0].status,'TURRETS WAITING FOR ENERGY');
 const m=missile(s,[0,4,-30]);tick(s,.2);assert.equal(m.life,0);assert.ok(Math.abs(p.energy-(reserve+.3))<1e-8);
 const next=missile(s,[0,4,-30]);tick(s,1);assert.ok(next.life>0);
});

test('both PDC targets share the 300 km range, including the boundary',()=>{
 for(const distance of [299,300,301])for(const intercept of [false,true]){
  const {s,p,enemy}=setup();tick(s,1/120);
  const point=p.turretRuntime[0].position.clone().add(new THREE.Vector3(0,0,-distance));
  enemy.position=point.toArray();let shots=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{shots++;return spawn(...a);};
  const m=intercept?missile(s,point.toArray()):undefined;
  if(intercept){s.ships=[];s.projStore.setVel(m.slot,0,0,0);}
  tick(s,1);
  assert.equal(intercept?m.life===0:shots>0,distance<=300,`${distance}u ${intercept?'missile':'ship'}`);
 }
});

test('PDC ships require a selected hostile, combat mode and clear sight; hold and disruption stop every round',()=>{
 for(const block of ['neutral','no-selection','mining','hold','disruption','autopilot','docked','obstacle','friendly']){
  const {s,p,enemy}=setup();let shots=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{shots++;return spawn(...a);};
  if(block==='neutral')enemy.hostile=false;
  if(block==='no-selection')s.getTargetRef=()=>undefined;
  if(block==='mining')p.mode='mining';
  if(block==='hold')p.turretsHeld=true;
  if(block==='disruption')p.disruptedUntil=100;
  if(block==='autopilot')s.autopilot={};
  if(block==='docked')p.dockedAt='helix';
  if(block==='obstacle')s.obstacles=[{x:0,y:0,z:-30,radius:10,losRadius:10}];
  if(block==='friendly'){const ally=s.spawnShip('patrol',[0,4,-30]);ally.hostile=false;}
  tick(s,2);assert.equal(shots,0,block);
 }
 const {s,p}=setup();let shots=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{shots++;return spawn(...a);};tick(s,.8);assert.ok(shots>0);
 p.turretsHeld=true;const count=shots;tick(s,1);assert.equal(shots,count);
 const held=missile(s,[0,4,-30]);tick(s,1);assert.ok(held.life>0);
});

test('non-rear mounts on every hull support level forward fire with a modest depression limit, including banking',()=>{
 for(const [hull,mounts] of Object.entries(TURRET_LAYOUTS))for(const [index,mount] of mounts.entries()){
  if(!mount.forwardCone)continue;
  for(const kind of ['pdc','tracking-turret'])for(const elevation of [0]){
   const {s,p,enemy}=setup(hull,kind,index);
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.7);p.rotation=q.toArray();
   const angle=elevation*Math.PI/180;enemy.position=new THREE.Vector3(0,Math.sin(angle)*60,-Math.cos(angle)*60).applyQuaternion(q).toArray();
   let shots=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{shots++;return spawn(...a);};s.fireBeam=()=>shots++;tick(s,3);
   assert.ok(shots>0,`${hull} mount ${index} ${kind} elevation ${elevation}`);
  }
 }
});

test('rear mounts retain blind spots and forward mounts never fire through the owner hull',()=>{
 for(const [hull,index,point] of [['prospector',0,[0,-10,-60]],['atlas',0,[0,-10,-60]],['wayfarer',0,[0,0,-3]],['vanguard',1,[0,0,0]],['lancer',0,[0,0,-3]],['atlas',1,[0,0,-3]]]){
  const {s,p,enemy}=setup(hull,'pdc',index);enemy.position=point;let fired=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{fired++;return spawn(...a);};tick(s,2);assert.equal(fired,0,`${hull} ${index}`);
 }
});

test('NPC PDC uses the same shield penalty and gives missiles priority over attacking the player',()=>{
 const {s,p,enemy}=setup();p.position=[0,0,-50];enemy.position=[0,0,0];enemy.targetId='player';enemy.energy=100;enemy.combatFit.hullId='wayfarer';enemy.combatFit.turrets=['pdc'];
 p.shield=100;p.hull=100;tick(s,1,enemy,enemy.id);assert.ok(p.shield<100 && p.shield>98);assert.equal(p.hull,100);
 const m=missile(s,[0,4,-25],enemy.id);tick(s,.15,enemy,enemy.id);assert.equal(m.life,0);
});

test('PDC tracer visuals move, expire and reuse a bounded pool',()=>{
 const r=Object.create(SpaceRenderer.prototype);r.scene=new THREE.Scene();
 const start=new THREE.Vector3(0,0,0),end=new THREE.Vector3(0,0,-90);
 for(let i=0;i<80;i++)r.showPdcTracer(start,end,0xdce9ff);
 assert.equal(r.pdcTracers.length,64);const first=r.pdcTracers[0],before=first.position.z;
 start.set(100,100,100);end.set(200,200,200);r.updatePdcTracers(.04);
 assert.ok(first.position.z<before);assert.equal(first.position.x,0,'visuals must copy simulation scratch vectors');
 r.updatePdcTracers(.2);assert.ok(r.pdcTracers.every(t=>!t.visible));
 r.showPdcTracer(new THREE.Vector3(),new THREE.Vector3(0,0,-20),0xff8a5b);
 assert.equal(r.pdcTracers.length,64);assert.equal(r.pdcTracers[0],first);assert.equal(first.material.color.getHex(),0xff8a5b);
});
