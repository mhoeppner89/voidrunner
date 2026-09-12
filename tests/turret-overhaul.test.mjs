import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {session} from './weapon-overhaul.test.mjs';
import {createTurretModel} from '../src/game/turretModels.js';
import {SpaceRenderer} from '../src/game/render.js';
import {createPdcDroneController} from '../src/game/dronePdc.js';
import {createDroneFleet,createDroneUnit} from '../src/game/droneData.js';
import {getPdcDefenseChannel} from '../src/game/pdcFireControl.js';

function missile(s,id){const slot=s.projStore.alloc();s.projStore.setPos(slot,0,280,0);s.projStore.setVel(slot,0,-260,0);const m={id,slot,kind:'missile',ownerId:'enemy',targetId:'player',life:8,homingSpeed:260,homingTurn:1.8,acceleration:0,damage:42};s.projectiles.push(m);return m;}
test('physical PDC interception stops a single seeker; a close pair and a swarm penetrate',()=>{
 for(const count of [1,2,4]){
  const s=session(),p=s.save.player;s.pdcAssignments=new Map();p.mode='mining';p.outfitting.loadouts.wayfarer.turrets=['pdc'];let launches=0;const spawn=s.spawnGunProjectile.bind(s);s.spawnGunProjectile=(...a)=>{launches++;return spawn(...a);};let damage=0;s.damagePlayer=(amount)=>damage+=amount;
  for(let frame=0;frame<100;frame++){if(frame===0)missile(s,'first');if(frame===9)for(let i=1;i<count;i++)missile(s,'next'+i);s.save.world.time=frame/60;s.updateTurrets(p,'player',1/60);s.updateProjectiles(1/60);}
  assert.equal(launches,1);assert.equal(damage,42*(count-1));
 }
});
test('four escort drones share their mothership turret recovery and resume after it expires',()=>{
 const s=session(),p=s.save.player;s.pdcAssignments=new Map();p.mode='mining';p.outfitting.loadouts.wayfarer.turrets=['pdc'];missile(s,'turret-threat');s.updateTurrets(p,'player',1/60);
 const channel=getPdcDefenseChannel(s,'player');assert.ok(channel.readyAt>1);
 const fleet=createDroneFleet(),point={position:[0,0,0],velocity:[0,0,0]},units=['a','b','c','d'];for(const id of units)fleet.unitsById[id]=createDroneUnit(id,'pdc');
 const context={ownerId:'player',unitIds:units,shipPosition:[0,0,0],shipVelocity:[0,0,0],ownerRadius:2,inFlight:true,now:.02,defenseChannel:channel,assignments:s.pdcAssignments,threats:units.map(id=>({id,kind:'missile',hostile:true,ownerId:'enemy',targetId:'player',position:[200,0,0],velocity:[-260,0,0],life:8})),opponents:[],bayAnchors:Object.fromEntries(units.map(id=>[id,{launch:point,dock:point}])),escortAnchors:Object.fromEntries(units.map(id=>[id,point]))};
 const controller=createPdcDroneController();assert.equal(controller.update(fleet,1/60,context,[]).filter(e=>e.type==='fire').length,0);
 context.now=channel.readyAt+.01;assert.equal(controller.update(fleet,1/60,context,[]).filter(e=>e.type==='fire').length,1,'extra drones give coverage, not four simultaneous intercepts');
});
test('turret base follows the hull while yaw and elevation align every barrel, including underside mounts',()=>{
 const renderer=Object.create(SpaceRenderer.prototype);renderer.scene=new THREE.Scene();const position=new THREE.Vector3(4,5,6),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.3,.8));
 for(const axis of [0,1])for(const side of [1,-1])for(const kind of ['pdc','laser']){
  const direction=new THREE.Vector3(.4,side*.6,-.7).normalize().applyQuaternion(q);renderer.showTurret('test',position,direction,'M',kind,q,side,.2,1.6,axis);const model=renderer.turretMeshes.get('test');model.updateMatrixWorld(true);
  const actual=new THREE.Vector3(0,0,-1).transformDirection(model.userData.pitch.matrixWorld);assert.ok(actual.distanceTo(direction)<1e-6);
  const up=new THREE.Vector3().setComponent(axis,side).applyQuaternion(q);assert.ok(new THREE.Vector3(0,1,0).transformDirection(model.matrixWorld).distanceTo(up)<1e-6);
 }
 const a=createTurretModel('pdc','S'),b=createTurretModel('pdc','S');assert.equal(a.children[1].geometry,b.children[1].geometry,'instances share geometry');
});

test('laser tracking misses small distant targets while close supporting fire gains damage',()=>{
 function probe(distance){const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];const target={id:'target',hostile:true,hull:100,position:[0,distance,0],velocity:[0,0,0]};s.ships=[target];s.getTargetRef=()=>({kind:'ship',id:'target'});let shots=0,hits=0,damage=0;
  s.fireBeam=(owner,w,start,direction)=>{shots++;const delta=new THREE.Vector3(...target.position).sub(start);const off=delta.addScaledVector(direction,-delta.dot(direction)).length();if(off<1.5){hits++;damage+=w.damageFlat;}};
  for(let i=0;i<1800;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}return {shots,hits,dps:damage/30};}
 const near=probe(50),far=probe(299);assert.ok(near.dps>5.7);assert.ok(far.hits>0&&far.hits<far.shots*.8);console.log('Laser small-target tracking:',{near,far});
});

test('Vanguard side mounts and Lancer belly mount cover their outward hemisphere only',async()=>{
 const {loadoutFor}=await import('../src/game/outfitting.js');
 for(const [hull,index,axis,side] of [['vanguard',0,0,-1],['vanguard',1,0,1],['lancer',0,1,-1]])for(const outward of [true,false]){
  const s=session(),p=s.save.player;p.shipId=hull;p.ownedShips=[hull];const fit=loadoutFor(p);fit.turrets=fit.turrets.map((_,i)=>i===index?'tracking-turret':null);p.outfitting.loadouts[hull]=fit;
  const position=[0,0,0];position[axis]=70*side*(outward?1:-1);s.ships=[{id:'target',position,hull:100,hostile:true}];s.getTargetRef=()=>({kind:'ship',id:'target'});let shots=0;s.fireBeam=()=>shots++;
  for(let i=0;i<180;i++){s.save.world.time=i/60;p.energy=100;s.updateTurrets(p,'player',1/60);}
  assert.equal(shots>0,outward,`${hull} mount ${index}, outward=${outward}`);
 }
});
