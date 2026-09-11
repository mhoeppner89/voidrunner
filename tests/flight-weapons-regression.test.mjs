import {test} from 'node:test';
import assert from 'node:assert/strict';
import {session} from './weapon-overhaul.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
const {GameSession}=await import('../src/game/game.js');
const {generateGraveyardPieces}=await import('../src/game/worldData.js');
const {loadoutFor}=await import('../src/game/outfitting.js');
const {steerToward}=await import('../src/game/npcNav.js');

test('debris route rebuilds preserve attitude and obey the per-frame turn limit',()=>{
 const s=session();s.activeInstanceId='mourning-line';s.tmpEuler=new THREE.Euler();s.graveyard=[generateGraveyardPieces(718).find(p=>p.collidable!==false)];s.graveyard[0].rotation=[0,Math.PI,0];s.wreckNodes=[];
 s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;s.obstacles=[{x:0,y:0,z:-200,radius:30,losRadius:30}];
 const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier:'veteran'});ship.rotation=[0,0,0,1];ship.destination=[0,0,-600];ship.combatFit.turrets=[];
 const before=new THREE.Quaternion().fromArray(ship.rotation);
 s.updateTravelAI(ship,1/60);
 assert.ok(before.angleTo(new THREE.Quaternion().fromArray(ship.rotation))<.01,'route rebuilding cannot replace the ship orientation');
});
test('distant elongated obstacles beyond lookahead do not trigger emergency braking',()=>{
 const s=session(),ship=s.spawnShip('pirate',[0,0,0]);ship.rotation=[0,0,0,1];s.save.player.position=[1000,0,0];
 s.obstacles=[{x:0,y:0,z:-250,radius:50,box:{hx:10,hy:50,hz:10,qx:0,qy:0,qz:0,qw:1}}];
 const brake=steerToward(s,ship,new THREE.Vector3(0,0,-500),{speed:20,horizon:1.4,brakeScale:1,synthesize:false},new THREE.Vector3());
 assert.equal(brake,0);
});
test('both Lancer beams converge on a small selected hull from their real muzzles',()=>{
 const s=session(),p=s.save.player;p.shipId='lancer';p.ownedShips=['lancer'];p.outfitting.loadouts.lancer=loadoutFor(p);p.outfitting.loadouts.lancer.guns=['beam-emitter','beam-emitter'];p.outfitting.loadouts.lancer.fireGroups.activeGroup='ALL';s.save.settings.aimAssist=true;
 const enemy=s.spawnShip('pirate',[0,0,-90]);enemy.rotation=[0,0,0,1];s.getTargetRef=()=>({kind:'ship',id:enemy.id});
 s.npcHullExtents=()=>[1,1,3];const hits=[];s.damageShip=ship=>hits.push(ship.id);s.fireMountedPlayerGuns();assert.deepEqual(hits,[enemy.id,enemy.id]);
});
test('automatic laser turret fires at a level hostile and damages the actual hull',()=>{
 const s=session(),p=s.save.player;p.mode='combat';p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];
 const enemy=s.spawnShip('pirate',[0,0,-90]);enemy.hostile=true;enemy.rotation=[0,0,0,1];s.getTargetRef=()=>({kind:'ship',id:enemy.id});
 const hits=[];s.damageShip=ship=>hits.push(ship.id);
 for(let i=0;i<180;i++){s.save.world.time=i/60;s.updateTurrets(p,'player',1/60);s.updateProjectiles(1/60);}
 assert.ok(hits.length>0,'level targets should be within the top turret firing arc');
});

test('all pilot tiers get past round rocks and long wrecks without snapping or getting stuck',()=>{
for(const kind of ['sphere','box'])for(const tier of ['novice','veteran','ace']) {
 const s=session();s.save.player.position=[0,0,-250];s.tmpCollide=new THREE.Vector3();s.damageShip=()=>{};s.fireNpcGun=()=>{};
 const ship=s.spawnShip('pirate',[0,0,0],undefined,undefined,{tier,temperament:'steady'});ship.rotation=[0,0,0,1];ship.velocity=[0,0,-40];ship.targetId='player';ship.combatFit.missiles=0;ship.combatFit.turrets=[];
 s.obstacles=[{x:0,y:0,z:-75,radius:25,collisionRadius:25,losRadius:25,...(kind==='box'?{box:{hx:12,hy:40,hz:12,qx:0,qy:0,qz:0,qw:1}}:{})}];
 let maxTurn=0,minZ=0,maxStill=0,still=0;
 for(let i=0;i<1800;i++){
  s.save.world.time=i/60;const q=new THREE.Quaternion().fromArray(ship.rotation);
  s.updateAttackAI(ship,new THREE.Vector3(...s.save.player.position),new THREE.Vector3(),1/60);s.resolveNpcCollisions(ship);
  maxTurn=Math.max(maxTurn,q.angleTo(new THREE.Quaternion().fromArray(ship.rotation)));minZ=Math.min(minZ,ship.position[2]);
  still=new THREE.Vector3(...ship.velocity).length()<1?still+1:0;maxStill=Math.max(maxStill,still);
 }
 assert.ok(maxTurn<.05,`${kind} ${tier}: rotation must remain gradual`);
 assert.ok(minZ<-150,`${kind} ${tier}: must get past the obstacle`);
 assert.ok(maxStill<180,`${kind} ${tier}: must not remain stuck`);
}
});
test('level incoming missiles can be intercepted, but the turret never shoots through its own hull',()=>{
 const s=session(),p=s.save.player;p.outfitting.loadouts.wayfarer.turrets=['pdc'];
 const slot=s.projStore.alloc();s.projStore.setPos(slot,0,0,-70);s.projStore.setVel(slot,0,0,5);
 const missile={slot,kind:'missile',acceleration:0,damage:42,ownerId:'enemy',targetId:'player',life:10};s.projectiles.push(missile);
 for(let i=0;i<100;i++){s.save.world.time=i/60;s.updateTurrets(p,'player',1/60);s.updateProjectiles(1/60);}
 assert.equal(missile.life,0);
 p.outfitting.loadouts.wayfarer.turrets=['tracking-turret'];p.mode='combat';
 const enemy=s.spawnShip('pirate',[0,0,-3]);enemy.hostile=true;s.getTargetRef=()=>({kind:'ship',id:enemy.id});
 let fired=0;s.fireBeam=()=>fired++;
 for(let i=0;i<120;i++){s.save.world.time=2+i/60;s.updateTurrets(p,'player',1/60);s.updateProjectiles(1/60);}
 assert.equal(fired,0,'the deck must block shots toward the ship centre');
});
