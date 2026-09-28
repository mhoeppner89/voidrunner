import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './combat-variety.test.mjs';
import * as THREE from '../vendor/three.module.min.js';
import {newArenaRun,runRewardPlan,readArenaRun,writeArenaRun,arenaRecord,RUN_WAVES,ARENA_RUN_KEY,runOffers,runHullOffers,runWingmanOffers,refreshRunWingmanOffers,hireRunWingman,normalizeWingOrder,WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_HINT,WING_ORDER_GATE,chooseRunReward,fitRunItem,changeRunHull,recoverRun} from '../src/game/arenaRun.js';
import {MAX_RUN_WINGMEN,PLAYER_FLYABLE_HULLS,WINGMAN_OFFER_COUNT} from '../src/game/shipPool.js';
import {LOCATIONS,SHIPS} from '../src/game/data.js';
import {loadoutFor,createOutfittingState,validateLoadout,HULL_HARDPOINTS,LOADOUT_KEYS,OUTFIT_ITEMS,itemFitsMount} from '../src/game/outfitting.js';
import {getEffectiveShipStats} from '../src/game/shipStats.js';
import {launcherMagazineEntries} from '../src/game/weapons.js';
import {GameUI} from '../src/game/ui.js';
import {setLanguage} from '../src/game/i18n.js';
import {DE_CATALOG} from '../src/game/i18n-de.js';
// A minimal root that behaves like the one ui.js sees: selectors resolve to
// stand-in nodes, appended children land in the hud, and data-* attributes
// mirror themselves into dataset the way the DOM does.
// Stand-in nodes for a UI root: data-* attributes mirror themselves into
// dataset the way the DOM does, so the chip's markup and state can be read.
function uiNode(id){
 return {id,innerHTML:'',dataset:{},children:[],parentNode:null,
  classList:{remove(){},add(){},toggle(){}},
  setAttribute(name,value){this[name]=value;if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(match,letter)=>letter.toUpperCase());this.dataset[key]=value;}},
  appendChild(child){child.parentNode=this;this.children.push(child);return child;},
  remove(){const parent=this.parentNode;if(parent){const at=parent.children.indexOf(this);if(at>=0)parent.children.splice(at,1);}},
  insertAdjacentHTML(){}};
}
function uiRoot(){
 const nodes=new Map(),hud=uiNode('#hud');
 return {element:hud,createElement:()=>uiNode(''),
  querySelector(selector){
   if(selector==='#hud')return hud;
   if(!nodes.has(selector))nodes.set(selector,uiNode(selector));
   return nodes.get(selector);
  }};
}
function storage(){const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};return data;}
function runSession(wave=1){const s=fixture();s.save=newArenaRun(false,718);s.save.arenaRun.wave=wave;s.arena={run:true};
 s.ui={pushEvent(){},showArenaRun(){},hideArena(){},hidePause(){},showHud(){}};s.audio={setStationMode(){}};
 s.updateActiveInstance=()=>{};s.setFieldArenaPosition=()=>{};s.setFieldEntryPosition=()=>{};s.tmpEntryDirection=new THREE.Vector3();
 s.clearTransientSpace=()=>{for(const p of s.projectiles)s.projStore.free(p.slot);s.projectiles=[];s.ships=[];};
 s.selectTarget=(kind,id)=>s.save.player.currentTargetId=id;s.setupRun();return s;
}
test('ten actual waves advance once, wait for reinforcements, and unlock hard mode only on victory',()=>{
 const data=storage();data.set('void-privateer-save-v1','career sentinel');const s=runSession(0);
 for(let wave=0;wave<RUN_WAVES.length;wave++){
  const r=s.save.arenaRun;assert.equal(r.wave,wave);assert.equal(r.phase,wave===0?'combat':'prepare');
  // Wave three hires the veteran wingman; wave six takes a hull from the draw.
  if(!r.hullChosen){if(wave===3){assert.equal(r.wingmanOffers.length,WINGMAN_OFFER_COUNT,'the hull stage names veterans to choose from');s.arenaRunAction('wingman',r.wingmanOffers[0].id);}else assert.equal(changeRunHull(s.save,runHullOffers(s.save)[0]),true);}
  if(!r.rewardChosen)assert.equal(chooseRunReward(s.save,r.offers.includes('repair')?'repair':r.offers[0]),true);
  const hp=s.save.player.hull,missiles=s.save.player.missiles;s.startRunWave();s.tickArenaRun(3);assert.equal(r.phase,'combat');assert.equal(s.save.player.hull,hp);assert.equal(s.save.player.missiles,missiles);
  assert.ok(s.ships.length>0);assert.ok(s.ships.filter(x=>x.arenaRunEnemy).every(x=>x.hostile&&x.noSurrender&&x.position.every(Number.isFinite)));
  if(wave===3){assert.equal(s.ships.filter(x=>x.arenaRunWingman).length,1,'the hired wingman flies the wave');assert.equal(s.ships.find(x=>x.arenaRunWingman).hostile,false);}
  if(RUN_WAVES[wave].enemies.some(e=>e[3]>0)){s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);assert.equal(r.phase,'combat','a pending opponent must prevent early victory');}
  s.save.world.time=r.startedAt+20;s.tickArenaRun(20);assert.equal(r.nextEnemy,RUN_WAVES[wave].enemies.length);
  s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);s.save.world.time+=2;s.tickArenaRun(2);assert.equal(r.cleared,wave+1);
  const recovered=s.save.player.hull;s.tickArenaRun(1);assert.equal(s.save.player.hull,recovered,'recovery cannot repeat');
 }
 assert.equal(s.save.arenaRun.phase,'won');assert.equal(arenaRecord().unlockedHard,true);assert.equal(data.get('void-privateer-save-v1'),'career sentinel');
});
test('offers and accepted equipment survive reload; a reward cannot be taken twice',()=>{
 storage();const save=newArenaRun(false,123),r=save.arenaRun;r.wave=1;r.rewardChosen=false;r.offers=runOffers(save);
 assert.deepEqual(runOffers(save),r.offers);writeArenaRun(save);const restored=readArenaRun();assert.deepEqual(restored.arenaRun.offers,r.offers);
 const id=r.offers[0],plan=runRewardPlan(restored,id);assert.equal(chooseRunReward(restored,id),true);assert.equal(chooseRunReward(restored,id),false);for(const c of plan.changes)assert.equal(loadoutFor(restored.player)[c.key][c.index],id);
 const m=Object.values(HULL_HARDPOINTS.wayfarer.mounts).flat().find(m=>itemFitsMount(OUTFIT_ITEMS[id],m));const key=LOADOUT_KEYS.find(k=>HULL_HARDPOINTS.wayfarer[k].includes(m));
 assert.equal(fitRunItem(restored,key,HULL_HARDPOINTS.wayfarer[key].indexOf(m),id),true);writeArenaRun(restored);assert.ok(loadoutFor(readArenaRun().player)[key].includes(id));
});
test('hull changes preserve all copies, health fraction and limited ordnance; no empty forward fit',()=>{
 for(const id of PLAYER_FLYABLE_HULLS.filter(id=>id!=='wayfarer')){const s=newArenaRun(false,88);s.arenaRun.wave=3;s.arenaRun.hullChosen=false;s.arenaRun.hullOffers=[id];s.player.hull=getEffectiveShipStats(s.player).hull*.37;
  const count=p=>{const counts={...p.outfitting.locker};for(const k of LOADOUT_KEYS)for(const item of loadoutFor(p)[k])if(item)counts[item]=(counts[item]??0)+1;return Object.fromEntries(Object.entries(counts).filter(([,n])=>n));};
  const before=count(s.player),rounds=s.player.missiles;assert.equal(changeRunHull(s,id),true,id);assert.deepEqual(count(s.player),before);assert.ok(Math.abs(s.player.hull/getEffectiveShipStats(s.player).hull-.37)<1e-9);assert.ok(s.player.missiles<=rounds);assert.ok(loadoutFor(s.player).guns.some(Boolean),id);assert.equal(changeRunHull(s,'wayfarer'),false);
 }
});
test('a hull that was not offered is refused, and a swap that would strand the fit rolls back',()=>{
 storage();const save=newArenaRun(false,64),r=save.arenaRun;r.wave=3;r.hullChosen=false;r.hullOffers=['talon'];
 assert.equal(changeRunHull(save,'lancer'),false,'only an offered hull can be taken');assert.equal(r.hullChosen,false);
 // Every pool hull accepts a small forward gun, so a transfer can only strand
 // the sortie when no gun is left to install at all. Wave start refuses a
 // gunless fit, so such a swap is undone and the stage stays open.
 const fit=save.player.outfitting;
 for(const id of Object.keys(fit.loadouts))fit.loadouts[id].guns.fill(null);
 for(const id of Object.keys(fit.locker))if(OUTFIT_ITEMS[id].category==='gun')delete fit.locker[id];
 r.hullOffers=['andromeda'];const before=JSON.stringify({shipId:save.player.shipId,outfitting:save.player.outfitting,equipment:save.player.equipment,weaponId:save.player.weaponId,hull:save.player.hull});
 assert.equal(changeRunHull(save,'andromeda'),false);
 assert.equal(JSON.stringify({shipId:save.player.shipId,outfitting:save.player.outfitting,equipment:save.player.equipment,weaponId:save.player.weaponId,hull:save.player.hull}),before);assert.equal(r.hullChosen,false);
});
test('each hull stage draws five pool hulls, never the current ship, and holds them across a reload',()=>{
 storage();const save=newArenaRun(false,412),r=save.arenaRun;
 assert.equal(r.hullOffers.length,0,'a fresh run has no hull stage yet');
 for(const wave of [3,6]){
  r.wave=wave;r.hullChosen=false;r.hullOffers=runHullOffers(save);
  assert.equal(r.hullOffers.length,5);assert.equal(new Set(r.hullOffers).size,5);
  assert.ok(r.hullOffers.every(id=>PLAYER_FLYABLE_HULLS.includes(id)));assert.equal(r.hullOffers.includes(save.player.shipId),false,'staying put is the wingman option');
  assert.deepEqual(runHullOffers(save),r.hullOffers,'the same stage must not redraw a different five');
  assert.equal(changeRunHull(save,r.hullOffers[0]),true);
 }
 const staged=newArenaRun(false,412);staged.arenaRun.wave=3;staged.arenaRun.hullChosen=false;staged.arenaRun.hullOffers=runHullOffers(staged);writeArenaRun(staged);
 assert.deepEqual(readArenaRun().arenaRun.hullOffers,staged.arenaRun.hullOffers);
 const seen=new Set();for(let seed=0;seed<120;seed++){const other=newArenaRun(false,seed);other.arenaRun.wave=3;for(const id of runHullOffers(other))seen.add(id);}
 assert.equal(seen.size,PLAYER_FLYABLE_HULLS.length-1,'every other hull can be offered');
});
test('a hull stage puts three named veterans on the table: one hire per stage, two per run',()=>{
 storage();const save=newArenaRun(false,515),r=save.arenaRun,p=save.player;
 r.wave=3;r.hullChosen=false;r.rewardChosen=false;r.hullOffers=runHullOffers(save);r.offers=[];
 const roster=runWingmanOffers(save);
 assert.equal(roster.length,WINGMAN_OFFER_COUNT,'three veterans are offered');
 assert.equal(new Set(roster.map(candidate=>candidate.id)).size,WINGMAN_OFFER_COUNT);
 assert.equal(new Set(roster.map(candidate=>candidate.hullId)).size,WINGMAN_OFFER_COUNT,'each veteran brings a different hull');
 for(const candidate of roster){assert.ok(PLAYER_FLYABLE_HULLS.includes(candidate.hullId));assert.ok(SHIPS[candidate.hullId]);assert.ok(candidate.name.length>0);assert.ok(candidate.fit);}
 assert.deepEqual(runWingmanOffers(save),roster,'the same stage must not redraw a different roster');
 r.wingmanOffers=roster;writeArenaRun(save);
 const restored=readArenaRun();
 assert.deepEqual(restored.arenaRun.wingmanOffers,roster,'the roster survives a reload');
 assert.equal(hireRunWingman(restored,'wingman-3-nobody'),null,'only a name on the roster can be taken');
 const wingman=hireRunWingman(restored,roster[1].id);
 assert.ok(wingman,'the chosen veteran joins');assert.equal(wingman.name,roster[1].name);assert.equal(wingman.hullId,roster[1].hullId);
 assert.equal(wingman.role,'patrol');assert.equal(wingman.alive,true);
 assert.equal(restored.player.shipId,'wayfarer','the hull is kept');
 assert.equal(restored.arenaRun.wingmen.length,1);assert.equal(restored.arenaRun.hullChosen,true);
 assert.equal(restored.arenaRun.offers.length,3,'the reward stage still offers three choices');
 assert.deepEqual(restored.arenaRun.wingmanOffers,[],'the closed stage stops advertising pilots');
 assert.equal(hireRunWingman(restored,roster[0].id),null,'one hire per stage');
 restored.arenaRun.wave=6;restored.arenaRun.hullChosen=false;
 assert.ok(hireRunWingman(restored,runWingmanOffers(restored)[0].id),'the second hull stage hires again');
 assert.equal(restored.arenaRun.wingmen.length,MAX_RUN_WINGMEN);
 restored.arenaRun.wave=9;restored.arenaRun.hullChosen=false;
 assert.equal(hireRunWingman(restored,runWingmanOffers(restored)[0].id),null,'the wing is capped at two');
 // A stale or corrupt roster is replaced rather than trusted.
 restored.arenaRun.wave=6;restored.arenaRun.hullChosen=false;restored.arenaRun.wingmanOffers=[{id:'stale',hullId:'not-a-hull',name:'stale'}];
 refreshRunWingmanOffers(restored);
 assert.equal(restored.arenaRun.wingmanOffers.length,WINGMAN_OFFER_COUNT);assert.ok(restored.arenaRun.wingmanOffers.every(candidate=>PLAYER_FLYABLE_HULLS.includes(candidate.hullId)));
 // Every pool hull can turn up on a roster, so no hull is barred from the wing.
 const seen=new Set();for(let seed=0;seed<120;seed++){const other=newArenaRun(false,seed);other.arenaRun.wave=3;other.arenaRun.hullChosen=false;for(const candidate of runWingmanOffers(other))seen.add(candidate.hullId);}
 assert.equal(seen.size,PLAYER_FLYABLE_HULLS.length,'every hull can be offered as a wingman');
});
test('a hired wingman flies allied with role-fitting equipment and is lost for good when shot down',()=>{
 storage();const s=runSession(0),r=s.save.arenaRun;
 r.wave=3;r.phase='prepare';r.hullChosen=false;r.rewardChosen=true;r.hullOffers=runHullOffers(s.save);r.wingmanOffers=runWingmanOffers(s.save);
 s.arenaRunAction('wingman',r.wingmanOffers[0].id);const hired=r.wingmen[0];assert.ok(hired);
 s.startRunWave();s.tickArenaRun(3);
 const wing=s.ships.find(ship=>ship.arenaRunWingman);assert.ok(wing,'the wingman joins the wave');
 assert.equal(wing.arenaRunWingmanId,hired.id);assert.equal(wing.hostile,false);assert.equal(wing.faction,'free-merchants');assert.equal(wing.noSurrender,true);
 assert.equal(wing.pilot.tier,'veteran');assert.equal(wing.hullId,hired.hullId);assert.equal(wing.variant,SHIPS[hired.hullId].variant);
 assert.equal(wing.combatFit.hullId,hired.hullId);assert.ok(wing.shield>0&&wing.hull>0);
 assert.ok(wing.combatFit.weapons.length>0,'the hired veteran arrives armed');
 for(const key of ['guns','launchers','turrets','power','drive','defense','utility'])for(const[i,item]of wing.combatFit[key].entries())if(item)assert.ok(itemFitsMount(OUTFIT_ITEMS[item],HULL_HARDPOINTS[hired.hullId][key][i]),`${hired.hullId} ${key}`);
 assert.ok(s.ships.some(ship=>ship.arenaRunEnemy),'the wave still fields its opponents');
 // It joins the fight on its own: Red Talon opponents may shoot at it and it
 // answers them, while the pilot is never a legal mark for its guns and its
 // own shots never clip the pilot.
 const enemy=s.ships.find(ship=>ship.arenaRunEnemy);
 assert.equal(s.projectileCanHitShip({ownerId:wing.id,faction:wing.faction,targetId:undefined},enemy),true,'the wingman can shoot the wave');
 assert.equal(s.projectileCanHitShip({ownerId:enemy.id,faction:'red-talons',targetId:undefined},wing),true,'opponents can shoot the wingman');
 assert.equal(s.projectileCanHitShip({ownerId:'player',faction:'player',targetId:undefined},wing),false,'the pilot cannot clip their own wingman');
 // Park the wave inside the aggressive gate first: outside it the doctrine has
 // the wingman hold station, which is covered by its own test below.
 enemy.position=[s.save.player.position[0],s.save.player.position[1],s.save.player.position[2]-600];s.syncWingmanOrders();
 for(let i=0;i<240;i++){s.save.world.time+=1/60;s.resolveShipTarget(wing);assert.notEqual(wing.targetId,'player','the wingman never locks the pilot');}
 assert.ok(s.ships.some(ship=>ship.id===wing.targetId&&ship.arenaRunEnemy),'the wingman is engaging the wave');
 // Clearing the wingman does not clear the wave, and it never returns.
 s.ships=s.ships.filter(ship=>ship.id!==wing.id);s.tickArenaRun(0);
 assert.equal(r.wingmen[0].alive,false);assert.equal(r.phase,'combat');
 s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships.filter(ship=>ship.arenaRunWingman).length,0,'a lost wingman stays lost');
});
test('wing orders are range-gated against the pilot: aggressive, defensive, break off',()=>{
 storage();const s=runSession(0),r=s.save.arenaRun;
 r.wave=3;r.phase='prepare';r.hullChosen=false;r.rewardChosen=true;r.hullOffers=runHullOffers(s.save);r.wingmanOffers=runWingmanOffers(s.save);
 s.arenaRunAction('wingman',r.wingmanOffers[0].id);
 // The vocabulary, the gates, and the migration of orders saved before them.
 assert.deepEqual(WING_ORDERS,['aggressive','defensive','breakoff']);
 assert.deepEqual(WING_ORDER_GATE,{aggressive:{acquire:1000,release:1500},defensive:{acquire:600,release:1000}});
 for(const order of WING_ORDERS)assert.ok(WING_ORDER_HINT[order],order);
 assert.equal(normalizeWingOrder(r.wingOrder),'aggressive','a fresh run is aggressive by default');
 assert.equal(normalizeWingOrder('engage'),'aggressive','an order saved before the gates becomes aggressive');
 assert.equal(normalizeWingOrder('formation'),'defensive','hold formation becomes defensive');
 assert.equal(normalizeWingOrder('nonsense'),'aggressive');
 s.startRunWave();s.tickArenaRun(3);
 const wing=s.ships.find(ship=>ship.arenaRunWingman),enemy=s.ships.find(ship=>ship.arenaRunEnemy),pilot=s.save.player;
 const at=(entry,range)=>entry.position=[pilot.position[0],pilot.position[1],pilot.position[2]-range];
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 // resolveShipTarget hands the AI a firing solution, not the ship entry.
 const locked=()=>{const resolved=s.resolveShipTarget(wing);return resolved?resolved.position.distanceTo(new THREE.Vector3(...enemy.position)):undefined;};
 // Beyond the gate there is nothing to engage: every weapon held, no lock at
 // all, and station kept beside the pilot so the AI flies the travel leg.
 at(enemy,1200);s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,undefined,'a target beyond the gate is not engaged');
 assert.equal(wing.holdFire,true);assert.equal(wing.pursuitHoldFire,true);assert.equal(wing.fleeing,false);
 assert.equal(s.resolveShipTarget(wing),undefined,'and the wing takes no lock');assert.equal(wing.targetId,undefined);
 assert.equal(wing.task.kind,'hunt');assert.deepEqual(wing.task.anchor,pilot.position);
 assert.ok(Math.hypot(...wing.destination.map((value,index)=>value-pilot.position[index]))<360,'the station sits on the pilot');
 // Inside the acquire gate the aggressive wing commits and locks. Hysteresis
 // keeps a held target out to the release gate, then lets go past it.
 at(enemy,900);s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,enemy.id);assert.equal(wing.holdFire,false);assert.equal(wing.pursuitHoldFire,false);
 assert.equal(locked(),0,'aggressive engages inside 1000 km');assert.equal(wing.targetId,enemy.id,'and the doctrine lock reaches the AI');
 at(enemy,1400);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,enemy.id,'a held target is kept out to 1500 km');
 at(enemy,1600);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,undefined,'and dropped past it');
 assert.equal(wing.holdFire,true);assert.equal(s.resolveShipTarget(wing),undefined);
 s.syncWingmanOrders();assert.ok(Math.hypot(...wing.destination.map((value,index)=>value-pilot.position[index]))<360,'the wing re-forms instead of chasing');
 // Defensive engages the pilot's mark only, and only inside 600 km.
 assert.equal(s.setWingOrder('defensive'),true);assert.equal(r.wingOrder,'defensive');
 at(enemy,900);pilot.currentTargetId=undefined;s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,undefined,'defensive ignores a hostile the pilot has not marked');
 pilot.currentTargetId=enemy.id;at(enemy,700);s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,undefined,'defensive ignores the mark beyond 600 km');
 at(enemy,500);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,enemy.id,'defensive engages the mark inside 600 km');
 assert.equal(locked(),0);assert.equal(wing.holdFire,false);
 at(enemy,900);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,enemy.id,'a held mark is kept out to 1000 km');
 at(enemy,1100);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,undefined,'then re-forms past 1000 km');
 // A new order re-decides from scratch: the old lock's hysteresis must not
 // carry a defensive wing into a fight it would never have chosen.
 at(enemy,800);pilot.currentTargetId=undefined;assert.equal(s.setWingOrder('aggressive'),true);s.syncWingmanOrders();
 pilot.currentTargetId=enemy.id;s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,enemy.id,'aggressive takes the mark at 800 km');
 assert.equal(s.setWingOrder('defensive'),true);assert.equal(wing.wingmanTargetId,undefined,'defensive drops the 800 km mark it inherited');
 // Self-defence: a wingman answers fire from inside its formation band, mark or
 // no mark, and drops the attacker when it leaves the band.
 at(enemy,800);pilot.currentTargetId=undefined;enemy.targetId=wing.id;s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,enemy.id,'a defensive wing answers an attacker');assert.equal(wing.holdFire,false);
 at(enemy,1200);s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,undefined,'but never chases it past the band');
 at(enemy,800);enemy.targetId='player';wing.combatThreatId=enemy.id;wing.combatThreatUntil=s.save.world.time+2;s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,enemy.id,'a recent damage source counts as an attacker');
 wing.combatThreatUntil=-Infinity;wing.combatThreatId=undefined;s.syncWingmanOrders();assert.equal(wing.wingmanTargetId,undefined,'and the wing re-forms once the firing stops');
 // Aggressive prefers the pilot's mark over a nearer hostile, so the wing piles
 // onto whatever the player is already shooting.
 assert.equal(s.setWingOrder('aggressive'),true);
 const probe={id:'probe',hostile:true,hull:10,position:[0,0,0],targetId:undefined};s.ships.push(probe);
 at(enemy,500);at(probe,900);pilot.currentTargetId=probe.id;s.syncWingmanOrders();
 assert.equal(wing.wingmanTargetId,'probe','the pilot\'s mark outranks a nearer hostile');
 s.ships=s.ships.filter(ship=>ship.id!=='probe');
 // The live update path agrees: with nothing to engage the wing holds station
 // and never fires a shot.
 assert.equal(s.setWingOrder('defensive'),true);
 pilot.currentTargetId=undefined;at(enemy,1200);s.syncWingmanOrders();
 s.pilotLineHistory=new Map();
 const step=seconds=>{for(let index=0;index<seconds*60;index++){s.save.world.time+=1/60;s.updateShips(1/60);s.tickArenaRun(1/60);}};
 step(4);
 assert.equal(s.projectiles.filter(shot=>shot.ownerId===wing.id).length,0,'a wing with nothing legal to engage never fires');
 assert.ok(distance(wing.position,pilot.position)<420,'the wing stays on station');
 // Committed: the same live path leaves station and flies the attack when the
 // gate does hold. Only one opponent is left in play so the closing range is
 // unambiguous.
 s.ships=s.ships.filter(ship=>ship===wing||ship===enemy||!ship.hostile);
 assert.equal(s.setWingOrder('aggressive'),true);
 at(enemy,900);s.syncWingmanOrders();
 assert.ok(wing.wingmanTargetId&&wing.holdFire===false,'a hostile inside the gate commits the wing');
 assert.ok(s.resolveShipTarget(wing),'the committed wing resolves a firing solution');
 assert.equal(wing.targetId,enemy.id);
 const opening=distance(wing.position,enemy.position);
 step(6);
 assert.equal(wing.targetId,enemy.id,'the wing stays committed to its locked target');
 assert.ok(distance(wing.position,enemy.position)<opening,'a committed wing closes on its target');
 // Break off: the flee doctrine plus a long leg outward from the nearest threat.
 assert.equal(s.setWingOrder('breakoff'),true);
 assert.equal(wing.fleeing,true);assert.equal(wing.holdFire,true);assert.equal(wing.task.kind,'flee');assert.equal(wing.wingmanTargetId,undefined);
 assert.equal(s.resolveShipTarget(wing),undefined,'a wing breaking off takes no target either');
 enemy.position=[wing.position[0]+200,wing.position[1],wing.position[2]+100];
 const before=distance(wing.position,enemy.position);
 s.syncWingmanOrders();
 assert.ok(distance(wing.destination,enemy.position)>before+2000,'the break-off leg runs away from the fight');
 step(4);
 assert.ok(distance(wing.position,enemy.position)>before+100,'the wing opens the range instead of closing it');
 assert.equal(s.projectiles.filter(shot=>shot.ownerId===wing.id).length,0,'a wing breaking off holds fire too');
 // Cycling walks the three orders and returns to aggressive.
 assert.equal(s.cycleWingOrder(),true,'break off cycles back to aggressive');
 assert.equal(r.wingOrder,'aggressive');assert.equal(wing.fleeing,false);assert.equal(wing.holdFire,false);assert.equal(wing.pursuitHoldFire,false);assert.equal(wing.task.kind,'hunt');
 assert.equal(s.cycleWingOrder(),true);assert.equal(r.wingOrder,'defensive');assert.equal(s.cycleWingOrder(),true);assert.equal(r.wingOrder,'breakoff');
 // A checkpoint written before the gates keeps a sensible standing order.
 r.wingOrder='engage';writeArenaRun(s.save);assert.equal(readArenaRun().arenaRun.wingOrder,'aggressive','a legacy engage order migrates on load');
 r.wingOrder='formation';writeArenaRun(s.save);assert.equal(readArenaRun().arenaRun.wingOrder,'defensive','a legacy formation order migrates on load');
 r.wingOrder='breakoff';writeArenaRun(s.save);assert.equal(readArenaRun().arenaRun.wingOrder,'breakoff','the standing order saves with the run');
});

test('baseline service restores limited hull and one missile; loss remains lost on reload',()=>{
 storage();const s=runSession(),p=s.save.player,stats=getEffectiveShipStats(p);p.hull=stats.hull*.3;
 const magazine=launcherMagazineEntries(p)[0];p.launcherMagazines[magazine.mount.id].rounds=0;
 recoverRun(s.save);assert.ok(Math.abs(p.hull-stats.hull*.6)<1e-8);assert.equal(p.missiles,1);
 s.startRunWave();p.hull=0;s.recoverPlayer();assert.equal(s.save.arenaRun.phase,'lost');assert.equal(readArenaRun().arenaRun.phase,'lost');assert.equal(Boolean(arenaRecord().unlockedHard),false);
});
test('field repair restores a larger normal-run hull buffer',()=>{
 storage();const save=newArenaRun(false,91),stats=getEffectiveShipStats(save.player);save.arenaRun.rewardChosen=false;save.arenaRun.hullChosen=true;save.arenaRun.offers=['repair'];save.player.hull=stats.hull*.2;
 assert.equal(chooseRunReward(save,'repair'),true);assert.ok(Math.abs(save.player.hull-stats.hull*.7)<1e-8);
});
test('interrupted combat returns to its fixed preparation checkpoint without changing offers or granting repairs',()=>{
 storage();const s=runSession();s.save.player.hull=30;s.startRunWave();const before=readArenaRun();s.save.player.hull=2;s.save.arenaRun.damage=999;s.persistSave();
 assert.deepEqual(readArenaRun(),before);const retained=readArenaRun();const next=runSession();next.save=retained;next.setupRun();assert.equal(next.save.player.hull,30);assert.equal(next.save.arenaRun.damage,0);assert.equal(next.save.arenaRun.phase,'prepare');
});
test('each wingman flies its own standing order',()=>{
 storage();const s=runSession(1);const r=s.save.arenaRun;
 r.wingmen=[{id:'wingman-0',hullId:'lancer',role:'patrol',fit:'varied',name:'Vetra Skeld',alive:true},{id:'wingman-1',hullId:'speedster',role:'patrol',fit:'assault',name:'Dorn Halver',alive:true}];
 s.startRunWave();
 const wings=s.ships.filter(ship=>ship.arenaRunWingman);
 assert.equal(wings.length,2);
 s.syncWingmanOrders();
 assert.equal(r.wingOrder,'aggressive','the lead wingman carries the run default');
 assert.equal(wings[0].arenaRunWingmanOrder,'aggressive');assert.equal(wings[1].arenaRunWingmanOrder,'aggressive');
 // One card, one wingman: the defensive order lands on index 1 only.
 assert.equal(s.setWingOrder('defensive',1),true);
 assert.equal(s.save.arenaRun.wingmen[1].order,'defensive');
 assert.equal(r.wingOrder,'aggressive','the lead wingman keeps its own order');
 assert.equal(wings[0].arenaRunWingmanOrder,'aggressive');
 s.syncWingmanOrders();
 assert.equal(wings[1].arenaRunWingmanOrder,'defensive','the split survives a re-apply');
 assert.equal(wings[0].arenaRunWingmanOrder,'aggressive');
 // The run screen routes through the same per-wing path.
 s.arenaRunAction('order','breakoff','0','0');
 assert.equal(s.save.arenaRun.wingmen[0].order,'breakoff');
 assert.equal(s.save.arenaRun.wingmen[1].order,'defensive','an unnamed index never leaks across the crew');
 // A lost wingman gives its slot to the survivor, orders and all.
 wings[0].hull=0;s.syncRunWingmen();s.syncWingmanOrders();
 const survivor=s.ships.find(ship=>ship.arenaRunWingmanId==='wingman-1');
 assert.equal(survivor.arenaRunWingmanOrder,'defensive');
 assert.equal(r.wingOrder,'defensive','the run default follows the last wing standing');
});

test('preparation screens render in both languages and every wave briefing is translated',()=>{
 storage();for(const language of ['en','de']){setLanguage(language);const save=newArenaRun(false,77),ui=Object.create(GameUI.prototype),panel={classList:{remove(){}},innerHTML:''};ui.root={querySelector:()=>panel};ui.updateOrientationNotice=()=>{};ui.save=save;ui.runFitOpen=true;ui.showArenaRun(save);assert.match(panel.innerHTML,/run-launch/);assert.match(panel.innerHTML,/run-scroll/);
 save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.arenaRun.offers=runOffers(save);ui.showArenaRun(save);assert.equal((panel.innerHTML.match(/data-run-action="reward"/g)??[]).length,3);assert.match(panel.innerHTML,/data-run-action="accept"[^>]*disabled/);
 }
 // The hull stage and its wingman option must read as German copy, not as
 // untranslated keys, on a localized preparation screen.
 setLanguage('de');const stage=newArenaRun(false,77),stageRoot=uiRoot(),stageUi=Object.create(GameUI.prototype),stagePanel=()=>stageRoot.querySelector('#arena-panel');
 stageUi.root=stageRoot;stageUi.updateOrientationNotice=()=>{};stageUi.save=stage;
 stage.arenaRun.wave=3;stage.arenaRun.hullChosen=false;stage.arenaRun.hullOffers=runHullOffers(stage);stage.arenaRun.wingmanOffers=runWingmanOffers(stage);stageUi.showArenaRun(stage);
 assert.match(stagePanel().innerHTML,/Oder behalte/);assert.match(stagePanel().innerHTML,/Schiffe wechseln mit der Welle/);
 for(const order of WING_ORDERS){assert.ok(DE_CATALOG[WING_ORDER_LABEL[order]],WING_ORDER_LABEL[order]);assert.ok(DE_CATALOG[WING_ORDER_HINT[order]],WING_ORDER_HINT[order]);}
 // The roster is a real choice: one button per named veteran, each with a hull.
 const roster=runWingmanOffers(stage);
 assert.equal((stagePanel().innerHTML.match(/data-run-action="wingman"/g)??[]).length,WINGMAN_OFFER_COUNT);
 for(const candidate of roster)assert.ok(stagePanel().innerHTML.includes(candidate.name),candidate.name);
 // Once a veteran is on the wing the run screen offers the standing order, and
 // the closed stage stops advertising pilots.
 stage.arenaRun.wingmen=[{id:roster[0].id,hullId:roster[0].hullId,role:'patrol',fit:roster[0].fit,name:roster[0].name,alive:true}];
 stage.arenaRun.hullChosen=true;stage.arenaRun.rewardChosen=true;stage.arenaRun.wingOrder='formation';stageUi.showArenaRun(stage);
 assert.equal((stagePanel().innerHTML.match(/data-run-action="order"/g)??[]).length,WING_ORDERS.length);
 // An order saved as "formation" reads as the migrated defensive order, and the
 // row explains its range gate in the localized copy.
 assert.match(stagePanel().innerHTML,/DEFENSIV/);
 assert.match(stagePanel().innerHTML,/innerhalb von 600 km/);
 // The own-ship plaque names the crew and the order, and hides with no wing
 // left. It lives in the monitor markup, so the stand-in root resolves it by
 // selector rather than receiving a freshly created node.
 const railRoot=uiRoot(),railUi=Object.create(GameUI.prototype);railUi.root=railRoot;railUi.actions={};
 const previousDocument=globalThis.document;globalThis.document=railRoot;
 try{
  railUi.setWingTactics([{index:0,order:'formation',name:'Vetra Skeld',hull:120,maxHull:120,shield:40,maxShield:80}],1);
  const rail=railRoot.querySelector('#hud-wing-tactics');
  assert.ok(rail,'the wing rail is the HUD control');
  assert.equal(rail.children.length,1,'one card per wingman');
  const card=rail.children[0];
  assert.equal(card.dataset.wingOrder,'defensive','a legacy order is normalized for the card');
  assert.match(card.innerHTML,/DEF/);
  assert.equal(card.dataset.wingIndex,'0');
  assert.equal(card['aria-label'],'Flügelbefehl · DEFENSIV · Y drücken oder tippen');
  assert.match(card.innerHTML,/width:50%/,'the shield fill reads half');
  assert.match(card.innerHTML,/width:100%/,'the hull fill reads full');
  railUi.setWingTactics([{index:0,order:'aggressive',name:'Vetra Skeld',hull:120,maxHull:120,shield:80,maxShield:80}],1);
  assert.equal(card.dataset.wingOrder,'aggressive');assert.match(card.innerHTML,/AGG/);
  assert.equal(railUi.wingOrderCount,1,'the ship menu reads the live count');
  // Two cards when two wingmen fly; the rail empties with the crew.
  railUi.setWingTactics([{index:0,order:'aggressive',name:'Vetra Skeld',hull:120,maxHull:120,shield:80,maxShield:80},{index:1,order:'breakoff',name:'Dorn Halver',hull:60,maxHull:60,shield:10,maxShield:100}],2);
  assert.equal(rail.children.length,2,'a second wingman gets its own card');
  assert.equal(rail.children[1].dataset.wingOrder,'breakoff');
  railUi.setWingTactics([],0);
  assert.equal(rail.children.length,0,'the rail empties when no wingman is flying');
  assert.equal(railUi.wingOrderCount,0);
 }
 finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
 for(const wave of RUN_WAVES){assert.ok(DE_CATALOG[wave.name]);assert.ok(DE_CATALOG[wave.hint]);}setLanguage('en');
});

test('hard mode raises pilot tiers and reduces automatic repairs',()=>{
 storage();const s=runSession();s.save.arenaRun.hard=true;s.save.player.hull=20;const max=getEffectiveShipStats(s.save.player).hull;recoverRun(s.save);assert.equal(s.save.player.hull,20+max*.1);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships[0].pilot.tier,'veteran');assert.ok(s.ships[0].combatFit.weapons.length>1);
});

test('repair is offered at 80% or below, replaced above it, including saved offers without rerolling the others',()=>{
 storage();for(const fraction of [.79,.8,.80001,1]){const save=newArenaRun(false,73);save.player.hull=getEffectiveShipStats(save.player).hull*fraction;save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;
 const offers=runOffers(save);assert.equal(offers.length,3);assert.equal(new Set(offers).size,3);assert.equal(offers.includes('repair'),fraction<=.8);
 }
 const save=newArenaRun(false,73);save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.player.hull=getEffectiveShipStats(save.player).hull*.8;
 save.arenaRun.offers=runOffers(save);const first=save.arenaRun.offers.slice(0,2);save.player.hull=getEffectiveShipStats(save.player).hull;writeArenaRun(save);
 const restored=readArenaRun();assert.deepEqual(restored.arenaRun.offers.slice(0,2),first);assert.equal(restored.arenaRun.offers.includes('repair'),false);assert.equal(chooseRunReward(restored,'repair'),false);
});

test('actual undocked preparation fits earned thrusters and preserves inventory through swaps and reloads',()=>{
 storage();const s=runSession(),p=s.save.player;assert.equal(p.dockedAt,undefined);p.outfitting.locker['thrusters-mk2']=1;
 const before=getEffectiveShipStats(p);s.arenaRunAction('fit','thrusters-mk2','drive','0');assert.equal(loadoutFor(p).drive[0],'thrusters-mk2');assert.ok(getEffectiveShipStats(p).angularAcceleration>before.angularAcceleration);assert.equal(p.dockedAt,undefined);assert.equal(p.credits,0);
 assert.equal(loadoutFor(readArenaRun().player).drive[0],'thrusters-mk2');
 assert.equal(fitRunItem(s.save,'drive',0,'engine-mk2'),false,'unearned equipment is not available');
 assert.equal(fitRunItem(s.save,'guns',0,'thrusters-mk2'),false,'mount rules still apply');
 assert.equal(fitRunItem(s.save,'drive',0,''),true);assert.equal(p.outfitting.locker['thrusters-mk2'],1);
 assert.equal(fitRunItem(s.save,'guns',0,''),true);assert.equal(fitRunItem(s.save,'guns',1,''),false,'at least one gun must remain');
 assert.equal(fitRunItem(s.save,'guns',0,'beam-emitter'),true);writeArenaRun(s.save);assert.equal(loadoutFor(readArenaRun().player).guns.filter(x=>x==='beam-emitter').length,2);
 s.startRunWave();assert.equal(fitRunItem(s.save,'drive',0,'thrusters-mk2'),false,'combat fitting remains blocked');
});
test('normal and hard runs introduce finite ordnance only at wave four',()=>{
 for(const hard of [false,true])for(let wave=0;wave<RUN_WAVES.length;wave++){
  storage();const s=runSession();s.save.arenaRun.hard=hard;s.save.arenaRun.wave=wave;
  const notices=[];s.ui.pushEvent=message=>notices.push(message);
  RUN_WAVES[wave].enemies.forEach((spec,index)=>{s.save.arenaRun.entry=[index*50,0,-200];assert.equal(s.spawnRunEnemy(spec,index),true);});
  const stocks=s.ships.map(ship=>ship.combatFit.missiles);
  assert.deepEqual(stocks,[[0],[0,0],[0],[2,0,0],[2,0],[0],[0,3],[2,2],[0,2],[0]][wave]);
  assert.equal(notices.filter(message=>/Raketenträger|Missile carrier/.test(message)).length,stocks.filter(n=>n>0).length);
 }
});
test('new runs enter a frozen countdown directly, preserving throttle at every wave and resume',()=>{
 storage();const s=runSession(0),r=s.save.arenaRun,p=s.save.player;
 assert.equal(r.phase,'combat');assert.equal(r.countdown,3);assert.equal(s.ships.length,0);
 const position=[...p.position];p.throttle=.83;s.updateSimulation(1,{});
 assert.deepEqual(p.position,position);assert.equal(p.throttle,.83);assert.equal(r.countdown,2);assert.equal(s.ships.length,0);
 s.tickArenaRun(2);assert.equal(s.ships.length,1);s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);s.save.world.time+=2;s.tickArenaRun(2);
 assert.equal(r.phase,'prepare');assert.equal(p.throttle,.83);
 const id=r.offers.find(x=>x!=='repair');s.arenaRunAction('reward',id);assert.equal(r.rewardChosen,false);
 s.arenaRunAction('accept');assert.equal(r.phase,'combat');assert.equal(r.countdown,3);assert.equal(p.throttle,.83);
 const saved=readArenaRun();const resumed=runSession();resumed.save=saved;resumed.setupRun();assert.equal(resumed.save.player.throttle,.83);
 resumed.startRunWave();assert.equal(resumed.save.player.throttle,.83);
});
test('weapon sets fit matching mounts atomically and preserve replaced equipment',()=>{
 for(const hull of ['wayfarer','lancer','talon']){
  storage();const save=newArenaRun(false,70);save.player.shipId=hull;save.player.ownedShips=[hull];
  save.player.outfitting=createOutfittingState([hull]);save.arenaRun.wave=1;save.arenaRun.rewardChosen=false;save.arenaRun.offers=['pulse-cannon'];
  const fit=loadoutFor(save.player),plan=runRewardPlan(save,'pulse-cannon'),centre=fit.guns[2];
  assert.equal(plan.count,2);assert.equal(chooseRunReward(save,'pulse-cannon'),true);
  const after=loadoutFor(save.player);assert.equal(after.guns[0],'pulse-cannon');assert.equal(after.guns[1],'pulse-cannon');
  if(hull==='talon')assert.equal(after.guns[2],centre);
  assert.ok(validateLoadout(save.player,hull,after).ok);
  for(const id of plan.replaced)assert.ok(save.player.outfitting.locker[id]>=plan.replaced.filter(x=>x===id).length);
  const before=JSON.stringify(save.player.outfitting);assert.equal(chooseRunReward(save,'pulse-cannon'),false);assert.equal(JSON.stringify(save.player.outfitting),before);
  writeArenaRun(save);assert.equal(loadoutFor(readArenaRun().player).guns.filter(x=>x==='pulse-cannon').length,after.guns.filter(x=>x==='pulse-cannon').length);
 }
});
test('legacy completed runs stay completed and active checkpoints extend to ten waves',()=>{
 const data=storage();for(const phase of ['prepare','combat','won','lost']){const save=newArenaRun();Object.assign(save.arenaRun,{version:1,wave:7,phase,cleared:phase==='won'?8:7});delete save.arenaRun.totalWaves;data.set(ARENA_RUN_KEY,JSON.stringify(save));const r=readArenaRun().arenaRun;assert.equal(r.phase,phase);assert.equal(r.totalWaves,['won','lost'].includes(phase)?8:10);assert.equal(r.version,2);}
});
test('Vanguard wave stages the ace before a fully serviced frigate boss',()=>{storage();const s=runSession(8);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships.length,1);assert.equal(s.ships[0].combatFit.hullId,'vanguard');s.save.world.time=s.save.arenaRun.startedAt+12;s.tickArenaRun(9);assert.equal(s.ships.length,2);assert.ok(s.ships.every(x=>x.combatFit.hullId==='vanguard'));s.save.player.hull=5;s.ships.forEach(x=>x.hull=0);s.tickArenaRun(0);s.save.world.time+=2;s.tickArenaRun(2);assert.equal(s.save.arenaRun.wave,9);assert.equal(s.save.player.hull,getEffectiveShipStats(s.save.player).hull);chooseRunReward(s.save,s.save.arenaRun.offers[0]);s.startRunWave();s.tickArenaRun(3);assert.equal(s.ships.length,1);assert.equal(s.ships[0].capitalBoss,true);assert.equal(s.ships[0].combatFit.turrets.filter(Boolean).length,4);});

test('frigate spawn search stays ahead even when early positions are obstructed',()=>{storage();const s=runSession(9);s.startRunWave();let attempts=0;s.entryPositionClear=()=>++attempts>18;s.save.arenaRun.entry=[0,0,-200];assert.equal(s.spawnRunEnemy(RUN_WAVES[9].enemies[0],0),true);const delta=new THREE.Vector3(...s.ships[0].position).sub(new THREE.Vector3(...s.save.player.position)),ahead=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...s.save.player.rotation));assert.ok(delta.dot(ahead)>0);});


test('hull changes retain equipped guns and groups ahead of stored beams, including save reload',()=>{
 storage();const save=newArenaRun(false,903),p=save.player,fit=p.outfitting.loadouts[p.shipId];
 fit.guns=['pulse-cannon','ripper'];fit.fireGroups.activeGroup='B';
 const mounts=HULL_HARDPOINTS[p.shipId].guns;fit.fireGroups.assignments[mounts[0].id]='A';fit.fireGroups.assignments[mounts[1].id]='B';
 p.outfitting.locker={'beam-emitter':4,...p.outfitting.locker};
 Object.assign(save.arenaRun,{wave:3,hullChosen:false,hullOffers:['lancer']});assert.equal(changeRunHull(save,'lancer'),true);
 assert.deepEqual(loadoutFor(p).guns,['pulse-cannon','ripper']);
 const after=loadoutFor(p);assert.equal(after.fireGroups.activeGroup,'B');assert.equal(after.fireGroups.assignments[HULL_HARDPOINTS.lancer.guns[1].id],'B');
 writeArenaRun(save);assert.deepEqual(loadoutFor(readArenaRun().player).guns,after.guns);
});
test('staged rewards include Mk II and compatible missile upgrades with ammunition',()=>{
 storage();const seen=new Set();
 for(let seed=0;seed<80;seed++){
  const save=newArenaRun(false,seed);save.player.shipId='lancer';save.player.ownedShips=['lancer'];save.player.outfitting=createOutfittingState(['lancer']);
  Object.assign(save.arenaRun,{wave:6,rewardChosen:false});
  for(const id of runOffers(save))seen.add(id);
 }
 for(const id of ['pulse-mk2','swarm-launcher','torpedo-launcher'])assert.ok(seen.has(id),id);
 const save=newArenaRun(false,903);save.player.shipId='lancer';save.player.ownedShips=['lancer'];save.player.outfitting=createOutfittingState(['lancer']);
 Object.assign(save.arenaRun,{wave:6,rewardChosen:false,offers:['torpedo-launcher']});
 assert.equal(chooseRunReward(save,'torpedo-launcher'),true);
 const entry=launcherMagazineEntries(save.player).find(e=>e.launcherId==='torpedo');assert.ok(entry);assert.equal(entry.rounds,entry.capacity);
 save.player.launcherMagazines[entry.mount.id].rounds=0;recoverRun(save);assert.equal(launcherMagazineEntries(save.player).find(e=>e.mount.id===entry.mount.id).rounds,1);
});
test('all hulls receive a usable boss counter and damaged ships retain a repair choice',()=>{
 storage();for(const hull of ['wayfarer','talon','vanguard','lancer','prospector','atlas']){
  const save=newArenaRun(false,8);save.player.shipId=hull;save.player.ownedShips=[hull];save.player.outfitting=createOutfittingState([hull]);
  Object.assign(save.arenaRun,{wave:9,rewardChosen:false});save.player.hull=getEffectiveShipStats(save.player).hull*.5;
  save.arenaRun.offers=runOffers(save);assert.ok(save.arenaRun.offers.includes('repair'));
  const id=save.arenaRun.offers.find(id=>id==='mortar'||id==='torpedo-launcher'||id==='ripper');assert.ok(id,hull);assert.equal(chooseRunReward(save,id),true);assert.ok(validateLoadout(save.player,hull,loadoutFor(save.player)).ok);
 }
});
test('arena equipment matches authored guns and wave nine uses debris cover',()=>{
 assert.equal(RUN_WAVES[8].environment,'debris-field');storage();
 for(let wave=1;wave<9;wave++){const s=runSession(wave);for(const [i,spec] of RUN_WAVES[wave].enemies.entries()){
  assert.ok(s.spawnRunEnemy(spec,i));const fit=s.ships.at(-1).combatFit;
  assert.deepEqual(fit.guns,spec[4].guns);assert.ok(fit.attackOrder.every(i=>fit.weapons[i]));
 }}
 const save=newArenaRun();save.player.shipId='lancer';save.player.ownedShips=['lancer'];save.player.outfitting=createOutfittingState(['lancer']);assert.equal(runRewardPlan(save,'ion-blaster').count,1,'ion reward retains a hull-damage gun');
});
test('the last kill gets a two-second beat before the run flips to prepare',()=>{
 storage();const s=runSession(0),r=s.save.arenaRun;
 s.startRunWave();s.tickArenaRun(3);assert.ok(s.ships.some(ship=>ship.arenaRunEnemy));
 s.ships.forEach(ship=>{if(ship.arenaRunEnemy)ship.hull=0;});
 s.tickArenaRun(0);assert.equal(r.phase,'combat','the kill beat holds the battlefield');
 s.save.world.time+=1.9;s.tickArenaRun(1.9);assert.equal(r.phase,'combat');
 s.save.world.time+=0.2;s.tickArenaRun(0.2);assert.equal(r.phase,'prepare','the beat ends after two seconds');
 // Pending reinforcements still gate the clear during the beat.
 const s2=runSession(1),r2=s2.save.arenaRun;
 s2.startRunWave();s2.tickArenaRun(3);
 s2.ships.forEach(ship=>{if(ship.arenaRunEnemy)ship.hull=0;});
 s2.tickArenaRun(0);assert.equal(r2.phase,'combat','a pending opponent prevents early victory');
 s2.save.world.time+=3;s2.tickArenaRun(3);assert.equal(r2.phase,'combat','the beat does not open the gate for a pending opponent');
});
test('the target monitor never offers a docking prompt inside an arena run',()=>{
 storage();const s=runSession(4);
 // The asteroid-field waves park the pilot inside the Shardbelt's approach
 // radius with no current target — exactly the recipe that leaked
 // "LOCK SHARDBELT · DOCK" onto the monitor before the guard existed.
 assert.equal(s.save.player.navTargetId,'shardbelt');
 s.tmpRadarPos=new THREE.Vector3();s.tmpShipPlayer=new THREE.Vector3();
 s.tmpRadarPlayer=new THREE.Vector3();s.tmpRadarInv=new THREE.Quaternion();s.tmpRadarRel=new THREE.Vector3();
 s.pickups=[];s.wreckNodes=[];s.asteroids=[];
 s.startRunWave();
 assert.equal(s.arena.run,true,'starting a run wave retains the run mode');
 s.save.player.position=[...LOCATIONS.helix.position];s.activeInstanceId='helix';
 s.save.player.currentTargetId='helix';
 s.renderer.projectTargetToScreen=()=>({x:0,y:0,visible:true,behind:false});
 const model=s.buildHudModel();
 assert.equal(model.dockPrompt,undefined,'no dock prompt during a run');
});
test('arena run clears landing systems and preloads the next wave hulls before combat',()=>{
 storage();const s=runSession(4),predicted=[],preloaded=[];
 s.renderer.setLandingGuide=guide=>assert.equal(guide,null,'run entry clears any prior career guidance');
 s.renderer.ensureGlbShipModel=variant=>preloaded.push(variant);
 s.ui.predictLocationAssets=id=>predicted.push(id);
 const r=s.save.arenaRun;
 r.wingmen=[{id:'probe-wing',name:'Probe Wing',hullId:'speedster',alive:true,fit:'balanced'}];
 s.save.player.position=[...LOCATIONS.helix.position];s.save.player.currentTargetId='helix';s.activeInstanceId='helix';
 s.stationLandingBeaconId='helix';s.stationLandingClearanceId='helix';s.stationLandingGuideId='helix';
 s.stationLandingClearanceGranted=true;s.stationLandingBerth={pad:[0,0,0]};
 s.updateStationLandingGuidance();
 assert.equal(s.stationLandingBerth,undefined,'the run removes the prior landing berth');
 assert.equal(s.dockCandidate(),undefined,'a station near the run player is not a dock candidate');
 let landed=false;s.dockAt=()=>{landed=true;};s.dockCandidate=()=>'helix';s.autoDockCheck();
 assert.equal(landed,false,'Arena Run cannot auto-dock');
 s.updateAssetWarmup(true);
 assert.deepEqual(predicted,[],'Arena Run does not fetch station market and outfitting art');
 s.showRunPreparation();
 assert.deepEqual([...new Set(preloaded)].sort(),['lancer','speedster','talon'],'preparation loads the next enemies and hired wing hull');
 preloaded.length=0;
 s.startRunWave();
 assert.equal(r.countdown,3,'hull loading starts before the combat countdown');
 assert.deepEqual([...new Set(preloaded)].sort(),['lancer','speedster','talon']);

 const boss=runSession(9),bossPreloads=[];boss.renderer.ensureGlbShipModel=variant=>bossPreloads.push(variant);
 boss.showRunPreparation();
 assert.deepEqual(bossPreloads,['concord-frigate'],'the final-wave model starts loading in preparation');
});
test('ordinary arena flights suppress landing guidance, docking, and station art warm-up',()=>{
 const s=fixture();
 s.arena={environment:'asteroid-field',scenario:'1v3'};
 s.save.player.position=[...LOCATIONS.helix.position];s.save.player.navTargetId='helix';
 s.save.player.currentTargetId='helix';s.activeInstanceId='helix';
 s.tmpRadarPos=new THREE.Vector3();s.tmpShipPlayer=new THREE.Vector3();
 s.tmpRadarPlayer=new THREE.Vector3();s.tmpRadarInv=new THREE.Quaternion();s.tmpRadarRel=new THREE.Vector3();
 s.pickups=[];s.wreckNodes=[];s.asteroids=[];
 let guideCleared=false,landed=false;const predicted=[];
 s.renderer.setLandingGuide=guide=>{assert.equal(guide,null);guideCleared=true;};
 s.stationLandingBeaconId='helix';s.stationLandingClearanceId='helix';s.stationLandingGuideId='helix';
 s.stationLandingClearanceGranted=true;s.stationLandingBerth={pad:[0,0,0]};
 s.updateStationLandingGuidance();
 assert.equal(guideCleared,true,'stale career landing lights are removed');
 assert.equal(s.stationLandingBerth,undefined);
 s.save.player.currentTargetId=undefined;
 assert.equal(s.dockCandidate(),undefined,'arena locations never become docking candidates');
 const hud=s.buildHudModel();
 assert.equal(hud.dockPrompt,undefined,'the normal arena target monitor has no landing prompt');
 const careerDockCandidate=s.dockCandidate.bind(s);
 s.dockAt=()=>{landed=true;};s.dockCandidate=()=> 'helix';
 s.autoDockCheck();
 assert.equal(landed,false,'the arena cannot auto-dock even if a candidate is injected');
 s.ui.predictLocationAssets=id=>predicted.push(id);
 s.updateAssetWarmup(true);
 assert.deepEqual(predicted,[],'arena combat does not warm station market/outfitting art');

 // The career path retains its ordinary prompt at the same station berth.
 s.arena=null;s.save.player.dockedAt=undefined;s.dockCandidate=careerDockCandidate;
 assert.equal(s.dockCandidate(),'helix');
 assert.equal(s.buildHudModel().dockPrompt,'LOCK HELIX · DOCK');
 s.updateAssetWarmup(true);
 assert.deepEqual(predicted,['helix'],'career flights still warm the intended station art');
});
