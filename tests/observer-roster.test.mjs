import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {fixture} from './combat-variety.test.mjs';
import {SHIPS} from '../src/game/data.js';
import {PLAYER_FLYABLE_HULLS} from '../src/game/shipPool.js';
import {LEAGUE_HULLS} from '../src/game/leagueContent.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,itemFitsMount} from '../src/game/outfitting.js';
import {GLB_SHIP_CONFIG} from '../src/game/render.js';
import {shipVariantForRole} from '../src/game/voxelModels.js';

// The observer staging path only needs world scratch vectors and the session's
// spawn helpers; no renderer or DOM is involved.
function observerSession(){
 const s=fixture();
 s.observerMapOrigin=new THREE.Vector3();s.observerPlacementWorld=new THREE.Vector3();s.observerPlacementLocal=new THREE.Vector3();
 s.tmpObserverDirection=new THREE.Vector3();s.observerAimError=1;s.observerUnitCounter=0;
 return s;
}
const stage=(s,entry,index)=>s.spawnObserverDraftUnit({id:`observer-unit-${index}`,shipType:entry.id,team:'blue',tier:'veteran',fit:entry.defaultFit??'varied',position:[index*60,0,index*20]});

test('the observer catalog lists every flyable hull once and the frigate last',()=>{
 const s=observerSession(),catalog=s.observerCatalog();
 assert.deepEqual(catalog.map(entry=>entry.id),[...PLAYER_FLYABLE_HULLS,'frigate']);
 assert.equal(new Set(catalog.map(entry=>entry.id)).size,catalog.length);
 for(const id of PLAYER_FLYABLE_HULLS){
  assert.ok(SHIPS[id],`${id} has hull stats`);
  assert.ok(HULL_HARDPOINTS[id],`${id} has hardpoints`);
  assert.ok(GLB_SHIP_CONFIG[SHIPS[id].variant],`${id} has a render variant`);
 }
 assert.equal(catalog.filter(entry=>entry.capital).length,1);
});

test('every catalog entry stages a real, legally fitted ship',()=>{
 const s=observerSession(),catalog=s.observerCatalog();
 catalog.forEach((entry,index)=>{
  const ship=stage(s,entry,index);
  assert.ok(ship,entry.id);
  assert.equal(ship.observerShipType,entry.id);
  if(entry.capital){assert.equal(ship.capitalClass,'frigate');return;}
  assert.equal(ship.pilot.tier,'veteran');
  const hullId=ship.combatFit.hullId;
  assert.ok(HULL_HARDPOINTS[hullId],`${entry.id} resolves to a real hull`);
  assert.ok(GLB_SHIP_CONFIG[ship.variant??shipVariantForRole(ship.role)],`${entry.id} stages its own model`);
  for(const key of ['guns','launchers','turrets','power','drive','defense','utility'])for(const[i,item]of ship.combatFit[key].entries())if(item)assert.ok(itemFitsMount(OUTFIT_ITEMS[item],HULL_HARDPOINTS[hullId][key][i]),`${entry.id} ${key}[${i}]`);
  assert.ok(ship.combatFit.weapons.length>0,`${entry.id} arrives armed`);
  assert.ok(ship.maxHull>0&&ship.maxShield>0&&Number.isFinite(ship.speed));
 });
 assert.equal(s.ships.length,catalog.length);
});

test('League hulls keep their authored role fits when the observer places them',()=>{
 const s=observerSession(),catalog=s.observerCatalog();
 for(const id of Object.keys(LEAGUE_HULLS)){
  const entry=catalog.find(candidate=>candidate.id===id);assert.ok(entry,id);
  const ship=stage(s,entry,catalog.indexOf(entry));
  assert.equal(ship.variant,id);assert.equal(ship.hullId,id);assert.equal(ship.combatFit.hullId,id);
  assert.equal(ship.maxHull,SHIPS[id].hull);assert.equal(ship.speed,SHIPS[id].maxSpeed);
 }
 const andromeda=stage(s,catalog.find(entry=>entry.id==='andromeda'),catalog.length+1);
 assert.deepEqual(andromeda.combatFit.launchers,['torpedo-launcher','swarm-launcher'],'the Andromeda keeps both authored racks');
});
