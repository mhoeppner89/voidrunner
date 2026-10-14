import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {fixture} from '../helpers/session.mjs';
import {SHIPS} from '../../src/game/data.js';
import {PLAYER_FLYABLE_HULLS} from '../../src/game/shipPool.js';
import {LEAGUE_HULLS} from '../../src/game/leagueContent.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,itemFitsMount} from '../../src/game/outfitting.js';
import {GLB_SHIP_CONFIG} from '../../src/game/render.js';
import {shipVariantForRole} from '../../src/game/voxelModels.js';

// The observer staging path only needs world scratch vectors and the session's
// spawn helpers; no renderer or DOM is involved.
function observerSession(){
 const s=fixture();
 s.observerMapOrigin=new THREE.Vector3();s.observerPlacementWorld=new THREE.Vector3();s.observerPlacementLocal=new THREE.Vector3();
 s.tmpObserverDirection=new THREE.Vector3();s.observerAimError=1;s.observerUnitCounter=0;
 return s;
}
const stage=(s,entry,index)=>s.spawnObserverDraftUnit({id:`observer-unit-${index}`,shipType:entry.id,team:'blue',tier:'veteran',fit:entry.defaultFit??'varied',position:[index*60,0,index*20]});

test('the observer catalog lists every flyable hull once and all four capitals',()=>{
 const s=observerSession(),catalog=s.observerCatalog();
 assert.deepEqual(catalog.map(entry=>entry.id),[...PLAYER_FLYABLE_HULLS,'frigate','cruiser','battleship','carrier']);
 assert.equal(new Set(catalog.map(entry=>entry.id)).size,catalog.length);
 for(const id of PLAYER_FLYABLE_HULLS){
  assert.ok(SHIPS[id],`${id} has hull stats`);
  assert.ok(HULL_HARDPOINTS[id],`${id} has hardpoints`);
  assert.ok(GLB_SHIP_CONFIG[SHIPS[id].variant],`${id} has a render variant`);
 }
 assert.equal(catalog.filter(entry=>entry.capital).length,4);
});

test('every catalog entry stages a real, legally fitted ship',()=>{
 const s=observerSession(),catalog=s.observerCatalog();
 catalog.forEach((entry,index)=>{
  const ship=stage(s,entry,index);
  assert.ok(ship,entry.id);
  assert.equal(ship.observerShipType,entry.id);
  if(entry.capital){assert.equal(ship.capitalClass,entry.id);return;}
  assert.equal(ship.pilot.tier,'veteran');
  const hullId=ship.combatFit.hullId;
  assert.equal(hullId,entry.id);
  assert.equal(entry.defaultFit,'varied');
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
 assert.equal(andromeda.combatFit.launchers.length,HULL_HARDPOINTS.andromeda.launchers.length,'the shared launcher bays keep stable mount positions');
 assert.deepEqual(andromeda.combatFit.launchers.filter(Boolean),['torpedo-launcher','swarm-launcher'],'the Andromeda keeps both authored racks');
 assert.deepEqual(andromeda.combatFit.launchers.slice(-2),['torpedo-launcher','swarm-launcher'],'both authored racks stay in their fitted bays');
});

test('quick matches stage symmetric teams with the selected stock hull',()=>{
 const s=observerSession();
 s.observerEditor=true;s.observerPendingShip='blade';s.observerPendingFit='varied';s.observerDifficulty='ace';
 s.observerDraft=[];s.observerCameraPan=new THREE.Vector3();
 s.renderer.syncShips=()=>{};s.ui.updateObserverView=()=>{};s.observerViewModel=()=>({});
 for(const [preset,counts] of Object.entries({'1v1':[1,1],'2v1':[2,1],'3v3':[3,3]})){
  assert.equal(s.observerPreset(preset),true);
  assert.deepEqual(['blue','red'].map(team=>s.ships.filter(ship=>ship.observerTeam===team).length),counts);
  assert.equal(s.observerDraft.length,counts[0]+counts[1]);
  for(const ship of s.ships){assert.equal(ship.combatFit.hullId,'blade');assert.equal(ship.pilot.tier,'ace');assert.equal(ship.shield,ship.maxShield);}
 }
 s.observerPendingShip='carrier';s.observerPreset('3v3');
 assert.ok(s.ships.every(ship=>ship.capitalClass==='carrier'));
 assert.equal(s.observerZoom,3800);
 const before=s.ships.length;s.observerEditor=false;
 assert.equal(s.observerPreset('1v1'),false);assert.equal(s.ships.length,before);
});
