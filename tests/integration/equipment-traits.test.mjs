import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {GameSession} from '../../src/game/game.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {createEquipmentRecord} from '../../src/game/equipmentInventory.js';
import {weaponForOutfit} from '../../src/game/weapons.js';
import {weaponDamage} from '../../src/game/weaponDamage.js';
import {createNewSave} from '../../src/game/save.js';

const session=()=>{
 const s=Object.create(GameSession.prototype);
 s.save=createNewSave(41,{tutorial:false});s.projectiles=[];s.projStore=new EntityStore(64);s.projectileCounter=0;s.ships=[];
 s.renderer={spawnRailPlume(){}};for(let i=0;i<7;i++)s['tmpP'+i]=new THREE.Vector3();
 return s;
};
const fire=(s,weapon,owner='player',mount='m0')=>s.spawnGunProjectile(owner,weapon,new THREE.Vector3(),new THREE.Vector3(0,0,-1),[0,0,0],undefined,mount);

test('Needle Array crits every fourth bolt per mount, and only that bolt',()=>{
 const s=session(),weapon=weaponForOutfit(createEquipmentRecord('pulse-cannon',{rarity:'named'}).id);
 const shots=Array.from({length:8},()=>fire(s,weapon));
 assert.deepEqual(shots.map(p=>p.crit),[false,false,false,true,false,false,false,true]);
 assert.ok(Math.abs(shots[3].damage-shots[0].damage*2.5)<1e-9);
 const other=fire(s,weapon,'player','m1');assert.equal(other.crit,false,'each mount keeps its own cadence');
});

test('rolled shield and hull multipliers reach the hit through the projectile',()=>{
 const s=session(),record=createEquipmentRecord('pulse-cannon',{rarity:'rare',affixes:['disruptive','piercing'],rolls:[1,1]}),weapon=weaponForOutfit(record.id);
 const shot=fire(s,weapon);assert.equal(shot.hitWeapon,weapon);
 assert.ok(weapon.shieldMul>1.3&&weapon.hullMul>1.3);
 const plain=weaponDamage(100,10,weaponForOutfit('pulse-cannon')),rolled=weaponDamage(100,10,shot.hitWeapon);
 assert.ok(rolled.shield>plain.shield*1.3);assert.ok(weaponDamage(0,10,shot.hitWeapon).hull>weaponDamage(0,10,weaponForOutfit('pulse-cannon')).hull*1.3);
});

test('siphoning returns a share of each landed shot to the shooter, capped at capacity',()=>{
 const s=session(),record=createEquipmentRecord('ripper',{rarity:'uncommon',affixes:['siphoning'],rolls:[1]}),weapon=weaponForOutfit(record.id);
 const pellet=fire(s,weapon);assert.ok(Math.abs(pellet.siphonEnergy-weapon.energyCost*weapon.siphon/weapon.pellets)<1e-9,'pellets split the refund');
 s.playerStats=()=>({energyCapacity:50});s.save.player.energy=10;
 s.siphonWeaponEnergy('player',pellet.siphonEnergy*7);assert.ok(Math.abs(s.save.player.energy-10-weapon.energyCost*weapon.siphon)<1e-9);
 s.siphonWeaponEnergy('player',1000);assert.equal(s.save.player.energy,50);
 const npc={id:'npc',energy:5,combatFit:{stats:{energyCapacity:20}}};s.ships=[npc];s.siphonWeaponEnergy('npc',100);assert.equal(npc.energy,20);
});

test('signature weapons fire tinted projectiles that pool separately',()=>{
 const s=session(),record=createEquipmentRecord('pulse-cannon',{rarity:'uncommon',affixes:['overcharged'],rolls:[.5]}),weapon=weaponForOutfit(record.id);
 const shot=fire(s,weapon),plain=fire(s,weaponForOutfit('pulse-cannon'));
 assert.equal(shot.tint,0xff5ad6);assert.equal(plain.tint,undefined);
});

test('player-fired Scatter Cannon retains legendary pellets, siphon, multipliers, snapshot and signature tint',()=>{
 const s=session(),flashes=[];
 s.save.player.shipId='wayfarer';
 s.save.player.energy=100;
 s.save.player.outfitting.loadouts.wayfarer.guns=[createEquipmentRecord('ripper',{rarity:'named',affixes:['siphoning','piercing'],rolls:[1,1]}).id,null];
 s.syncWeaponProjection=()=>{};
 s.activeFireGroup=()=>'ALL';
 s.getTargetRef=()=>undefined;
 s.playerStats=()=>({energyCapacity:100});
 s.addPlayerEmission=()=>{};
 s.setOwnMonitorStatus=()=>{};
 s.audio={play(){}};
 s.tmpPlayerOrientation=new THREE.Quaternion();
 s.renderer={spawnRailPlume(){},spawnMuzzleFlash(_x,_y,_z,color){flashes.push(color);}};
 s.fireMountedPlayerGuns();
 assert.equal(s.projectiles.length,10,'Hailstorm fires ten pellets through the player mount path');
 assert.deepEqual(flashes,[0xa8e6ff]);
 const directions=new Set();
 for(const p of s.projectiles){
  assert.equal(p.tint,0xa8e6ff);
  assert.equal(p.hitWeapon?.id,'ripper');
  assert.ok(p.hitWeapon.hullMul>1.35*1.3,'rolled hull multiplier reaches the pellet');
  assert.ok(p.siphonEnergy>0,'siphoning refund reaches the pellet');
  const i=p.slot*3;
  assert.deepEqual([...s.projStore.prevPos.slice(i,i+3)],[...s.projStore.pos.slice(i,i+3)],'interpolation prevPos is snapshotted');
  directions.add(s.projStore.vel.slice(i,i+3).map(v=>v.toFixed(3)).join(','));
 }
 assert.equal(directions.size,10,'spread directions stay distinct across all pellets');
});
