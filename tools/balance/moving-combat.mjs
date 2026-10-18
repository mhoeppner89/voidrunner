import {writeFile,readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../../tests/helpers/session.mjs';
import {balanceFit} from '../../tests/helpers/player-balance.mjs';
import {createEnemyLoadout} from '../../src/game/enemyLoadouts.js';
import {regenerateCombatResources} from '../../src/game/combatResources.js';
import {registerHitReaction} from '../../src/game/flightDynamics.js';
import {disruptWeapons} from '../../src/game/weaponDamage.js';
import {activationWeaponDamage} from '../../src/game/weaponDamage.js';
const source=await readFile('src/game/game.js','utf8'),rows=[];
const config={starter:balanceFit('wayfarer',['beam-emitter','beam-emitter'],['sustained-reactor']),stack:balanceFit('wayfarer',['mortar','mortar','mortar'],Array(3).fill('sustained-reactor')),scrapper:balanceFit('scrapper',Array(4).fill('pulse-cannon')),talon:balanceFit('talon',['pulse-cannon','pulse-cannon','ion-blaster','seeker-launcher']),legionary:balanceFit('legionary',Array(3).fill('pulse-cannon'),['sustained-reactor']),blade:balanceFit('blade',['pulse-cannon-t2','gauss-cannon','pulse-cannon-t2','gauss-cannon'],['sustained-reactor','shield-mk2']),lancer:balanceFit('lancer',['pulse-cannon-t2','gauss-cannon','pulse-cannon-t2','gauss-cannon'],['sustained-reactor'])};
config['talon-equal']=balanceFit('talon',['pulse-cannon','pulse-cannon','ion-blaster'],['sustained-reactor']);config['lancer-equal']=balanceFit('lancer',['pulse-cannon','pulse-cannon','ion-blaster'],['sustained-reactor']);
const cases=[['talon-equal','lancer-equal',1,1],['starter','scrapper',1,1],['stack','legionary',1,1],['stack','blade',1,1],['scrapper','legionary',1,1],['talon','lancer',1,1],['scrapper','legionary',2,1],['talon','blade',2,1],['scrapper','legionary',3,3]];
for(const seed of [718,1501,9007])for(const [a,b,na,nb]of cases)for(const swap of [false,true]){
 const s=fixture();s.save.world.seed=seed;s.save.player.position=[1e6,1e6,1e6];s.arena={observer:true};s.ui={pushEvent(){},pushSensor(){}};s.audio={play(){},playAtDirection(){}};
 for(const m of source.matchAll(/^    (\w+) = new THREE\.(Vector3|Quaternion|Matrix4)\(\);/gm))s[m[1]]=new THREE[m[2]]();
 s.damageShip=(ship,amount,owner,position,weapon={})=>{const shieldBefore=ship.shield,hit=activationWeaponDamage(ship,ship.maxShield,amount,weapon,s.save.world.time);ship.shield=Math.max(0,ship.shield-hit.shield);ship.hull=Math.max(0,ship.hull-hit.hull);disruptWeapons(ship,weapon,s.save.world.time,shieldBefore);if(ship.hull>0)registerHitReaction(ship,s.save.world.time,hit.shield+hit.hull);if(weapon.range)ship.observedWeaponRange=Math.max(ship.observedWeaponRange??0,weapon.range);ship.shieldDelay=4.5;};
 s.renderer.spawnExplosion=()=>{};
 const sides=[[],[]];
 for(const [side,count,id]of [[0,na,a],[1,nb,b]])for(let i=0;i<count;i++){
  const fit=config[id],sign=(side===0)!==swap?1:-1;
  const ship=s.spawnShip(side===0?'patrol':'pirate',[(i-(count-1)/2)*70,0,sign*220],undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:fit.hull});
  ship.faction=side===0?'concord':'pirates';ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,-sign)).toArray();
  ship.combatFit=createEnemyLoadout(ship,i,{guns:fit.guns,utilities:fit.utilities,turrets:[],missiles:0});ship.maxHull=fit.stats.hull;ship.maxShield=fit.stats.shield;ship.hull=ship.maxHull;ship.shield=ship.maxShield;ship.energy=fit.stats.energyCapacity;ship.noSurrender=true;ship.shieldDelay=0;ship.noSurrender=true;sides[side].push(ship);
 }
 let firstDamage,firstKill;
 for(let tick=0;tick<90*60;tick++){
  s.save.world.time=tick/60;
  for(const side of (tick%2?[1,0]:[0,1]))for(const ship of sides[side])if(ship.hull>0){
   const target=sides[1-side].filter(t=>t.hull>0).sort((a,b)=>Math.hypot(...a.position.map((v,i)=>v-ship.position[i]))-Math.hypot(...b.position.map((v,i)=>v-ship.position[i])))[0];if(!target)continue;
   ship.targetId=target.id;ship.fireCooldown=Math.max(0,ship.fireCooldown-1/60);ship.shieldDelay=Math.max(0,(ship.shieldDelay??0)-1/60);regenerateCombatResources(ship,ship.combatFit.resources,1/60,ship.shieldDelay);s.npcFlightStats(ship);s.updateAttackAI(ship,new THREE.Vector3(...target.position),new THREE.Vector3(...target.velocity),1/60);
  }
  s.updateProjectiles(1/60);
  for(let i=s.projectiles.length-1;i>=0;i--)if(s.projectiles[i].life<=0){s.projStore.free(s.projectiles[i].slot);s.projectiles.splice(i,1);}
  if(firstDamage==null&&s.ships.some(x=>x.shield<x.maxShield||x.hull<x.maxHull))firstDamage=tick/60;
  if(firstKill==null&&s.ships.some(x=>x.hull<=0))firstKill=tick/60;
  if(sides.some(side=>side.every(x=>x.hull<=0)))break;
 }
 const alive=sides.map(side=>side.filter(x=>x.hull>0).length);const row={seed,a,b,na,nb,swap,alive,winner:alive[0]&&!alive[1]?a:alive[1]&&!alive[0]?b:'unresolved',time:s.save.world.time,firstDamage,firstKill,remaining:sides.map(side=>side.map(x=>({hull:x.hull,shield:x.shield})))};
 rows.push(row);console.log(seed,a,b,na+'v'+nb,swap?'reversed':'normal',row.winner,'first kill',firstKill??'none','after',row.time.toFixed(1));
}
await writeFile('output/player-balance/moving-combat.json',JSON.stringify({method:'Moving veteran AI, real flight/aim/projectile/collider/activation/energy paths, hit reactions and ion disruption; guns only, no turret/drone/ordnance support, morale, loot or obstacles. Three seeds, normal and reversed starting sides; 90-second unresolved limit. This is a controlled combat comparison, not a complete career encounter.',rows},null,2));
