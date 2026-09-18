import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './combat-variety.test.mjs';
import {SHIPS,LOCATIONS} from '../src/game/data.js';
import {LEAGUE_HULLS,leagueTrafficChance,factionsOpposed} from '../src/game/leagueContent.js';
import {SYSTEMS,planRoute} from '../src/game/galaxy.js';
import {HULL_HARDPOINTS,OUTFIT_ITEMS,itemFitsMount,defaultLoadoutFor,itemAvailable} from '../src/game/outfitting.js';
import {quoteShipTrade} from '../src/game/shipTrade.js';
import {normalizeDroneBays,validateDroneBays} from '../src/game/droneData.js';
import {GLB_SHIP_CONFIG} from '../src/game/render.js';
import {GLB_TOP_DOWN_PROFILES} from '../src/game/shipProfiles.js';
test('League hulls use their own flight stats and legal NPC fittings',()=>{
 const s=fixture();for(const id of Object.keys(LEAGUE_HULLS)){
  const ship=s.spawnShip('patrol',[0,0,800],undefined,undefined,{tier:'veteran'},{faction:'frontier-league',hullId:id});
  assert.equal(ship.variant,id);assert.equal(ship.combatFit.hullId,id);assert.equal(ship.maxHull,SHIPS[id].hull);assert.equal(ship.speed,SHIPS[id].maxSpeed);assert.equal(ship.hostile,false);
  for(const key of ['guns','launchers','turrets','power','drive','defense'])for(const[i,item]of ship.combatFit[key].entries())if(item)assert.ok(itemFitsMount(OUTFIT_ITEMS[item],HULL_HARDPOINTS[id][key][i]),`${id} ${key}`);
  assert.ok(GLB_SHIP_CONFIG[id]);assert.ok(GLB_TOP_DOWN_PROFILES[id].cells.length>30);assert.ok(s.npcHullExtents(ship).every(v=>v>0));
 }
});
test('Acheron has valid dock services and a reachable two-way route',()=>{
 assert.ok(planRoute('helios-verge','acheron'));assert.ok(planRoute('acheron','helios-verge'));
 for(const id of SYSTEMS.acheron.locationIds){const l=LOCATIONS[id];assert.ok(l);assert.equal(l.systemId,'acheron');assert.ok(l.position.every(Number.isFinite));}
 for(const id of LOCATIONS['league-yard'].shipsForSale)assert.ok(SHIPS[id]);
 assert.ok(itemAvailable({},'torpedo-launcher','league-yard'));
});
test('civilian hulls are purchasable and military hulls require standing',()=>{
 const s=fixture(),p=s.save.player;p.dockedAt='league-yard';p.credits=200000;p.cargo={};p.cargoMass=0;p.sealedCargo=[];
 assert.equal(quoteShipTrade(p,'legionary').code,'reputation-required');assert.ok(quoteShipTrade(p,'astra').ok);
 p.reputation['frontier-league']=20;assert.ok(quoteShipTrade(p,'andromeda').ok);
});
test('League opposes Concord and pirates, remains neutral to civilian factions and player',()=>{
 const s=fixture(),league=s.spawnShip('patrol',[0,0,0],undefined,undefined,undefined,{faction:'frontier-league',hullId:'legionary'});
 for(const f of ['concord','red-talons']){assert.ok(factionsOpposed('frontier-league',f));assert.ok(factionsOpposed(f,'frontier-league'));}
 for(const f of ['free-merchants','frontier-miners','salvage-union','frontier-league'])assert.equal(factionsOpposed('frontier-league',f),false);
 assert.equal(league.hostile,false);assert.equal(league.mugCapable,false);assert.equal(league.routineInspectionDue,false);
});
test('Astra and Torsas have PDC bays only; old mining units cannot migrate into them',()=>{
 for(const id of ['astra','torsas']){const bays=normalizeDroneBays(id,[{bayId:'drone-1',mode:'mining',unitIds:['old']}]);assert.equal(bays[0].mode,'pdc');assert.equal(defaultLoadoutFor(id).droneBays[0].mode,'pdc');assert.ok(validateDroneBays(id,[{bayId:'drone-1',mode:'mining',unitIds:[null,null]}],{}).length);}
});
test('League spillover is confined to frontier locations and Andromeda carries both rack types',()=>{
 assert.equal(leagueTrafficChance('acheron','haven'),1);assert.equal(leagueTrafficChance('meridian','argent'),0);assert.equal(leagueTrafficChance('helios-verge','helix'),0);assert.ok(leagueTrafficChance('pale-ring','shepherd')>leagueTrafficChance('helios-verge','cairn'));
 const s=fixture(),ship=s.spawnShip('patrol',[0,0,800],undefined,undefined,undefined,{faction:'frontier-league',hullId:'andromeda'});assert.deepEqual(ship.combatFit.racks.map(r=>r.launcher),['torpedo','swarm']);
});
test('League patrol acquires Concord, never an unprovoking trader or player',()=>{
 const s=fixture();s.arena=null;s.canSee=()=>true;s.shipTracksPlayer=()=>false;s.deferentialPilot=()=>false;s.save.player.dockedAt=undefined;
 const league=s.spawnShip('patrol',[0,0,0],undefined,undefined,undefined,{faction:'frontier-league',hullId:'legionary'}),trader=s.spawnShip('trader',[0,0,100]),patrol=s.spawnShip('patrol',[0,0,500]);
 s.resolveShipTarget(league);assert.equal(league.targetId,patrol.id);assert.ok(s.projectileCanHitShip({faction:league.faction},patrol));assert.equal(s.projectileCanHitShip({faction:league.faction},trader),false);
});
test('new deck turrets have unobstructed outward arcs and reject shots through their hull',async()=>{
 const {clearTurretArc}=await import('../src/game/turrets.js'),{TURRET_LAYOUTS}=await import('../src/game/turretLayouts.js'),{TURRET_CLEARANCE}=await import('../src/game/turretClearance.js'),T=await import('../vendor/three.module.min.js');
 const s=fixture();for(const id of ['andromeda','torsas']){
  const ship=s.spawnShip('patrol',[0,0,0],undefined,undefined,undefined,{faction:'frontier-league',hullId:id});ship.rotation=[0,0,0,1];
  const state={local:new T.Vector3(),scratch:new T.Vector3(),inverse:new T.Quaternion(),clearance:TURRET_CLEARANCE[id][0]},ext=s.npcHullExtents(ship),mount=TURRET_LAYOUTS[id][0];
  assert.ok(clearTurretArc(ship,mount,ext,new T.Vector3(0,150,1),state));assert.equal(clearTurretArc(ship,mount,ext,new T.Vector3(0,-150,1),state),false);
 }
});
test('new hulls and Acheron survive a save reload',async()=>{
 const {createNewSave,hydrateSave}=await import('../src/game/save.js'),{createOutfittingState}=await import('../src/game/outfitting.js');
 for(const id of Object.keys(LEAGUE_HULLS)){
  const save=createNewSave(123,{tutorial:false});Object.assign(save.player,{shipId:id,ownedShips:[id],outfitting:createOutfittingState([id]),systemId:'acheron',dockedAt:'haven',lastDockedAt:'haven',navTargetId:'acheron-belt'});
  const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));assert.equal(loaded.player.shipId,id);assert.equal(loaded.player.systemId,'acheron');assert.equal(loaded.player.dockedAt,'haven');assert.ok(Number.isFinite(loaded.player.reputation['frontier-league']));
 }
});
