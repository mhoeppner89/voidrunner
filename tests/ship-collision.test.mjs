import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {session} from './weapon-overhaul.test.mjs';

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
 const avoidance=s.getShipAvoidance(new THREE.Vector3(0,0,260),new THREE.Vector3(0,0,-57),fighter.id);
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

test('NPCs receive a damage-free clearance shell before their hulls touch',()=>{
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
 const distance=Math.hypot(...lancer.position.map((value,index)=>value-talon.position[index]));
 assert.ok(distance>30,`clearance distance ${distance}`);
 assert.equal(lancer.shield+lancer.hull,lancerBefore);
 assert.equal(talon.shield+talon.hull,talonBefore);
});
