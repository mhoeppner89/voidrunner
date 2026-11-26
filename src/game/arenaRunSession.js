import {normalizeEquipmentInventory} from './equipmentInventory.js';
import {equipFrigate} from './capitalCombat.js';
import * as THREE from 'three';
import {RUN_WAVES,DECISION_WAVES,runEnemyFit,writeArenaRun,recordArenaRun,recoverRun,runOffers,runHullOffers,refreshRunHullOffers,refreshRunRewardOffers,runWingmanOffers,refreshRunWingmanOffers,hireRunWingman,skipRunReward,chooseRunReward,fitRunItem,changeRunHull,wingmanOrder} from './arenaRun.js';
// One wing doctrine for the whole game: the range gates, the pilot's-mark
// preference, self-defence and hysteresis all live in wingOrders.js, so the
// arena wing and the campaign companion can differ only in how they fly.
import {normalizeWingOrder,nextWingOrder,WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_GATE,wingOrderTarget,nearestWingThreat,wingOrderPilotDistance} from './wingOrders.js';
import {MAX_RUN_WINGMEN} from './shipPool.js';
import {createEnemyLoadout} from './enemyLoadouts.js';
import {getEffectiveShipStats} from './shipStats.js';
import {loadoutFor} from './outfitting.js';
import {SHIPS} from './data.js';
import {t} from './i18n.js';
import {arenaSite} from './arenaSites.js';
import {LAUNCHERS} from './weapons.js';
import {battleState,isRunCapital,tickBattle} from './arenaBattle.js';
const clone=x=>JSON.parse(JSON.stringify(x));
// A hired wingman flies patrol doctrine on the Free Merchants' colours. That
// faction opposes the arena's Red Talon opponents (so a wingman fights them and
// can be shot at), while the hidden player actor is never a legal target for
// it: neither guns nor missiles can pick the pilot up as a victim.
const WINGMAN_FACTION='independents';
// A wingman must be able to shoot the wave it escorts the pilot through, and
// faction opposition is what legalises NPC-on-NPC fire (see
// GameSession.projectileCanHitShip). Each act fields a different faction, so the
// hired wing flies under a flag opposed to the wave's: the Free Merchants stay
// the default, and the military acts get the other side of their own rivalry.
const WING_FACTION_OPPOSES={pirates:'independents',independents:'pirates',alliance:'concord',concord:'alliance'};
const wingFactionFor=(run)=>{
 const wave=RUN_WAVES[run?.wave];
 const faction=wave?.enemies?.find(spec=>spec.faction)?.faction;
 return WING_FACTION_OPPOSES[faction]??WINGMAN_FACTION;
};
// Formation slots in the player's own frame — starboard, port, then astern —
// as [right, up, back] multiples of the base offset.
const WINGMAN_OFFSETS=[[-1,0.55,0.8],[1,0.55,0.8],[0,0.9,1.5]];
const WINGMAN_OFFSET_SCALE=110;
// How far a breaking-off wingman runs from the nearest hostile. The leg is
// recomputed from the wing's live position every tick, so it never arrives and
// simply keeps leaving the fight until the order changes.
const WINGMAN_BREAK_DISTANCE=2400;
// Cache the best bomber for one second. A held lock still releases immediately
// when it leaves the pilot's band. New locks obey the normal acquisition gate.
function escortBomber(session,wing,transport){
 const gate=WING_ORDER_GATE.aggressive,now=session.save.world.time,pilot=session.save.player.position;
 if(now>=(wing.nextEscortScan??-Infinity)){
  wing.nextEscortScan=now+1;
  let best,armedBest=false,nearest=Infinity;
  for(const bomber of session.ships){
   if(!bomber.arenaObjectiveAttacker||bomber.hull<=0||bomber.targetId!==transport.id)continue;
   const limit=bomber.id===wing.wingmanTargetId?gate.release:gate.acquire;
   if(wingOrderPilotDistance(bomber,pilot)>limit)continue;
   let armed=false;
   for(const rack of bomber.combatFit.racks)if(rack.launcher==='torpedo'&&rack.missiles>0){armed=true;break;}
   const distance=wingOrderPilotDistance(bomber,transport.position);
   if((armed&&!armedBest)||(armed===armedBest&&distance<nearest)){best=bomber;armedBest=armed;nearest=distance;}
  }
  wing.escortBomber=best;
 }
 const held=wing.escortBomber;
 return held&&held.hull>0&&held.targetId===transport.id&&wingOrderPilotDistance(held,pilot)<=gate.release?held:undefined;
}
function selectArrival(session,ship){
 const current=session.save.player.currentTargetId;
 if(current){
  const selected=session.ships.find(other=>other.id===current);
  if(selected?selected.hull>0:session.getTargetRef(false)?.id===current)return;
 }
 session.selectTarget('ship',ship.id,'automatic');
}
export const ArenaRunMethods={
 preloadRunWaveModels(){
  const r=this.save.arenaRun,wave=RUN_WAVES[r?.wave];if(!wave)return;
  const variants=new Set();
  for(const spec of [...wave.enemies,wave.launch?.fighter,wave.support?.fighter,wave.objective?.transport].filter(Boolean)){
   const variant=isRunCapital(spec)?spec.hullId:SHIPS[spec.hullId]?.variant??spec.hullId;
   if(variant)variants.add(variant);
  }
  for(const wingman of (r.wingmen??[]).filter(entry=>entry.alive!==false)){
   const variant=SHIPS[wingman.hullId]?.variant??wingman.hullId;
   if(variant)variants.add(variant);
  }
  // Enemy hulls used to start loading only when their live wave spawn reached
  // syncShips. Start those fetches during the preparation screen/countdown so
  // the first appearance of a new model does not interrupt combat.
  for(const variant of variants)this.renderer?.ensureGlbShipModel?.(variant);
  // The Mourning Line's wreck models load on first sight; fetch them while
  // the preparation screen is up so the hulls are there when the wave starts.
  if(arenaSite(wave.site).instanceId==='mourning-line')void this.renderer?.ensureGraveyardModels?.();
 },
 setupRun(){
  const r=this.save.arenaRun;
  if(r.phase==='combat'){if(r.checkpoint){this.save.player=clone(r.checkpoint);if(r.checkpointStoredRounds)r.storedRounds=clone(r.checkpointStoredRounds);delete r.checkpointStoredRounds;normalizeEquipmentInventory(this.save.player,{disabled:true});delete this.save.player.prevPosition;delete this.save.player.prevRotation;}Object.assign(r,r.checkpointStats??{});this._statsDirty=true;r.phase='prepare';r.rewardChosen=true;r.hullChosen=true;
   // Wingman losses belong to the interrupted attempt: a resumed wave restores
   // the crew that started it, exactly like the player checkpoint above.
   if(Array.isArray(r.checkpointWingmen))r.wingmen=clone(r.checkpointWingmen);delete r.checkpointWingmen;}
  this.setupArena({run:true,site:RUN_WAVES[r.wave].site,environment:RUN_WAVES[r.wave].environment,scenario:'free-flight'},false);
  refreshRunHullOffers(this.save);refreshRunWingmanOffers(this.save);refreshRunRewardOffers(this.save);writeArenaRun(this.save);this.showRunPreparation();
 },
 showRunPreparation(){this.preloadRunWaveModels();this.ui.setWingTactics?.([],0);this.ui.showArenaRun(this.save);},
 arenaRunAction(action,value,key,index){
  const r=this.save.arenaRun;if(!r)return;
  // The wing orders are the one run command that also works mid-wave: each
  // row carries the order (value) and the wingman it targets (data-run-index);
  // a row without an index addresses the whole crew.
  if(action==='order'){const wing=Number(index);this.setWingOrder(value,Number.isInteger(wing)?wing:undefined);return;}
  if(r.phase!=='prepare')return;
  if(action==='reward'&&!r.rewardChosen&&r.offers.includes(value))r.selectedReward=value;
  if((action==='accept'||action==='equip')&&!chooseRunReward(this.save,r.selectedReward))return;
  if(action==='skip'&&!skipRunReward(this.save))return;
  if(action==='hull'){
   if(changeRunHull(this.save,value)){this.ui.setCockpitShip?.(this.save.player.shipId);this.ui.runFitNotice='';}
   else this.ui.runFitNotice=t('That hull cannot take your forward guns. Choose another.');
  }
  if(action==='wingman'){
   const wingman=hireRunWingman(this.save,value);
   if(wingman){this.ui.runFitNotice='';this.ui.pushEvent(t('Veteran wingman hired: {ship} · {name}',{ship:t(SHIPS[wingman.hullId]?.name??wingman.hullId),name:wingman.name}),'success',6000);this.syncWingmanOrders();}
   else this.ui.runFitNotice=t((r.wingmen??[]).filter(entry=>entry.alive!==false).length>=MAX_RUN_WINGMEN?'Your wing is already at full strength.':'That pilot is no longer on the roster.');
  }
  if(action==='fit')this.ui.runFitNotice=fitRunItem(this.save,key,Number(index),value)?'':t('That fitting exceeds the limits or leaves no forward gun.');
  if(action==='group'&&r.rewardChosen){const fit=this.save.player.outfitting.loadouts[this.save.player.shipId];if(Object.hasOwn(fit.fireGroups.assignments,value))fit.fireGroups.assignments[value]=fit.fireGroups.assignments[value]==='A'?'B':'A';}
  this._statsDirty=true;const p=this.save.player,stats=this.playerStats();p.shield=Math.min(p.shield,stats.shield);p.hull=Math.min(p.hull,stats.hull);p.energy=Math.min(p.energy,stats.energyCapacity);p.turretRuntime=[];
  this.syncWeaponProjection();writeArenaRun(this.save);if(action==='equip')this.ui.runFitOpen=true;
  if(action==='accept'&&r.rewardChosen){this.ui.runFitOpen=false;this.startRunWave();}else this.showRunPreparation();
 },
 startRunWave(){
  const r=this.save.arenaRun; if(!r||r.phase!=='prepare'||!r.rewardChosen||!loadoutFor(this.save.player).guns.some(Boolean))return;
  const pendingDecision=DECISION_WAVES.includes(r.wave)&&!(r.decisions??{})[r.wave];
  if(pendingDecision)return;
  this.clearTransientSpace();this.autopilot=false;this.deathTimer=0;this.afterburning=false;this.playerShieldDelay=0;
  const wave=RUN_WAVES[r.wave];this.arena.environment=wave.environment;
  this.preloadRunWaveModels();
  this.setupArena({run:true,site:wave.site,environment:wave.environment,scenario:'free-flight'},false);this.updateActiveInstance(true);
  this.spawnRunWingmen();
  this.gunCooldown=0;this.mountFireAt={};this.groupFireAt=undefined;this.groupFireHull=undefined;this.missileCooldown=0;this.ui.runFitNotice='';
  this.save.player.mode='combat';this.save.player.currentTargetId=undefined;
  r.phase='combat';r.checkpointStoredRounds=clone(r.storedRounds??{});r.checkpoint=clone(this.save.player);delete r.checkpoint.turretRuntime;delete r.checkpoint.prevPosition;delete r.checkpoint.prevRotation;
  r.checkpointStats={elapsed:r.elapsed,damage:r.damage,missiles:r.missiles};
  r.checkpointWingmen=clone(r.wingmen??[]);
  this.ui.setObjectiveStrip?.(null);this.ui.hideObjectiveBanner?.();r.countdown=3;r.startedAt=this.save.world.time;this.runBattle=battleState(wave,r.wave,r.hard);r.waveMissiles=this.save.player.missiles??0;delete r.clearAt;
  writeArenaRun(this.save);this.ui.hideArena();this.ui.hidePause();this.ui.showHud();
  this.audio.freshFight?.();
  const site=arenaSite(wave.site);
  this.ui.pushEvent(t('Wave {wave} of {total}',{wave:r.wave+1,total:RUN_WAVES.length})+' · '+t(wave.name)+' · '+t(site.name)+', '+t(site.place),'info',5000);
  this.ui.showRunCountdown?.(3,t(wave.name),`${t(site.name)} · ${t(site.place)}`);
 },
 // A hired wingman is a full allied fighter: pool hull, role-fitting equipment
 // and a veteran pilot, flying its own standing order. It stays with the run
 // until it is shot down.
 spawnRunWingmen(){
  const r=this.save.arenaRun;if(!Array.isArray(r.wingmen))return;
  r.wingmen.filter(wingman=>wingman.alive!==false).forEach((wingman,index)=>this.spawnRunWingman(wingman,index));
 },
 wingmanPosition(index,out=new THREE.Vector3()){
  const offset=WINGMAN_OFFSETS[Math.min(index,WINGMAN_OFFSETS.length-1)];
  return out.set(offset[0]*WINGMAN_OFFSET_SCALE,offset[1]*WINGMAN_OFFSET_SCALE,offset[2]*WINGMAN_OFFSET_SCALE)
   .applyQuaternion(new THREE.Quaternion().fromArray(this.save.player.rotation))
   .add(new THREE.Vector3().fromArray(this.save.player.position));
 },
 spawnRunWingman(wingman,index){
  const obstacles=this.activeFieldObstacles?.()??[];
  const point=new THREE.Vector3();
  for(let attempt=0;attempt<WINGMAN_OFFSETS.length;attempt++){
   this.wingmanPosition(index+attempt,point);
   if(attempt===WINGMAN_OFFSETS.length-1||this.entryPositionClear(point,obstacles,26))break;
  }
  const ship=this.spawnShip('patrol',point.toArray(),undefined,wingman.name,{tier:'veteran',temperament:'steady'},{faction:wingFactionFor(this.save.arenaRun)});
  // spawnShip keys the hull off the role; a hired veteran may fly any hull in
  // the pool, so patch the render variant (GLB/voxel key) and the fitting hull
  // id (hardpoint, turret-layout and mount-anchor key) before its real loadout
  // replaces the role default.
  ship.variant=SHIPS[wingman.hullId]?.variant??ship.variant;
  ship.hullId=wingman.hullId;
  ship.arenaRunWingman=true;ship.arenaRunWingmanId=wingman.id;
  ship.hostile=false;ship.authorizedTarget=false;ship.dark=false;ship.mugCapable=false;ship.routineInspectionDue=false;
  ship.noSurrender=true;ship.holdFire=false;ship.pursuitHoldFire=false;
  ship.combatFit=createEnemyLoadout(ship,this.ships.length,wingman.fit);
  ship.maxShield=ship.shield=ship.combatFit.stats.shield;
  ship.maxHull=ship.combatFit.stats.hull;
  ship.hull=Math.max(1,Math.round(ship.maxHull*Math.max(0,Math.min(1,wingman.hullFraction??1))));
  ship.combatFit.resources.shield=ship.maxShield;
  ship.energy=ship.combatFit.stats.energyCapacity;
  ship.speed=ship.combatFit.stats.maxSpeed;ship.afterburnSpeed=ship.combatFit.stats.afterburnSpeed;
  ship.velocity[0]=0;ship.velocity[1]=0;ship.velocity[2]=0;
 ship.targetId=undefined;ship.wingmanTargetId=undefined;
 ship.arenaRunWingmanOrder=wingmanOrder(wingman,this.save.arenaRun);
 ship.rotation=[...this.save.player.rotation];
  ship.prevRotation=new Float64Array(ship.rotation);
  ship.prevPosition=new Float64Array(ship.position);
  ship.task={kind:'hunt',anchor:[...ship.position],destination:undefined};
  ship.playerAwareness=1;ship.playerIdentified=true;ship.playerSensorAwareness=1;ship.identifiedByPlayer=true;
  this.renderer?.ensureGlbShipModel?.(ship.variant);
  this.applyWingmanOrder(ship,index);
  return ship;
 },
 // A wingman that is gone mid-wave is gone for the run: mark it and never
 // respawn it. Runs before the wave-clear check so clearing the field cannot
 // read as a loss.
 syncRunWingmen(){
  const r=this.save.arenaRun;if(!Array.isArray(r.wingmen)||!r.wingmen.length)return;
  for(const wingman of r.wingmen){
   if(wingman.alive===false)continue;
   const ship=this.ships.find(entry=>entry.arenaRunWingmanId===wingman.id);
   if(ship&&ship.hull>0)continue;
   wingman.alive=false;
   this.ui.pushEvent(t('Wingman lost: {ship} · {name}',{ship:t(SHIPS[wingman.hullId]?.name??wingman.hullId),name:wingman.name}),'danger',5200);
  }
 },
 livingWingmanId(id){return Boolean(id)&&this.ships.some(ship=>ship.id===id&&ship.arenaRunWingman&&ship.hull>0&&!ship.poweredDown);},
 // A wingman's hull floors at one point (damageShip); reaching it powers the
 // ship down for the rest of the level: dark, unarmed and no longer a target.
 powerDownRunWingman(ship){
  if(!ship||ship.poweredDown)return false;
  ship.poweredDown=true;ship.burning=false;ship.energy=0;ship.shield=0;
  ship.holdFire=true;ship.pursuitHoldFire=true;
  ship.targetId=undefined;ship.wingmanTargetId=undefined;ship.wingTargetId=undefined;
  ship.combatThreatId=undefined;ship.combatThreatUntil=0;ship.fieldTactic=undefined;
  ship.destination=[...ship.position];
  this.ui.showPilotLine?.(ship.name,t('Hull breach. I am out of this fight.'),'ally',8000);
  this.ui.pushEvent(t('{name} is disabled for the rest of this level.',{name:ship.name}),'danger',6000);
  return true;
 },
 // Called before the level is cleared away: the run record keeps each
 // wingman's hull so the next level starts from it (recoverRun repairs it).
 recordRunWingmanHulls(){
  const r=this.save.arenaRun;
  for(const wingman of r?.wingmen??[]){
   if(wingman.alive===false)continue;
   const ship=this.ships.find(entry=>entry.arenaRunWingmanId===wingman.id);
   if(ship&&ship.maxHull>0)wingman.hullFraction=ship.poweredDown?0:Math.max(0,Math.min(1,ship.hull/ship.maxHull));
  }
 },
 // The nearest legal mark for a wave opponent: the pilot, or a living wingman
 // that has closed closer. Squared distances only — this runs per enemy per tick.
 arenaThreatTarget(ship){
  const p=this.save.player;let best='player',bestDistance=(ship.position[0]-p.position[0])**2+(ship.position[1]-p.position[1])**2+(ship.position[2]-p.position[2])**2;
  for(const wing of this.ships){
   if(!wing.arenaRunWingman||wing.hull<=0||wing.poweredDown)continue;
   const distance=(ship.position[0]-wing.position[0])**2+(ship.position[1]-wing.position[1])**2+(ship.position[2]-wing.position[2])**2;
   if(distance<bestDistance){bestDistance=distance;best=wing.id;}
  }
  return best;
 },
 // Standing orders are keep-doing-it doctrine rather than a one-shot command:
 // they are re-applied every frame, so a wingman that drifts back into the
 // fight after an order change is pulled back to station on the next tick, and
 // a gated order re-forms the moment its fight leaves the gate. Also keeps the
 // cockpit wing chip in step with the crew that is actually flying.
 syncWingmanOrders(){
  const r=this.save.arenaRun;if(!r)return 0;
  let index=0;
  const crew=[];
  for(const wingman of (r.wingmen??[]).filter(entry=>entry.alive!==false)){
   const ship=this.ships.find(entry=>entry.arenaRunWingmanId===wingman.id&&entry.hull>0);
   // A checkpoint written before per-wingman orders existed falls back to the
   // run's default, so an old save reads as one uniform wing instead of losing
   // the order entirely.
   wingman.order=wingmanOrder(wingman,r);
   if(ship&&!ship.poweredDown)this.applyWingmanOrder(ship,index);
   // Live hull and shield when the wingman is flying, so the HUD card's fills
   // read the fight; a docked crew publishes its stance only.
   crew.push({index,order:wingman.order,name:wingman.name,hullId:wingman.hullId,
    hull:ship?ship.hull:0,maxHull:ship?(ship.maxHull??1):0,
    shield:ship?ship.shield:0,maxShield:ship?(ship.maxShield??1):0,poweredDown:Boolean(ship?.poweredDown)});
   index+=1;
  }
  // The run default follows the lead wingman: the Y key, the save migration
  // and anything still reading r.wingOrder stay coherent with the crew.
  if(crew.length)r.wingOrder=crew[0].order;
  this.ui.setWingTactics?.(crew,crew.length);
  return crew.length;
 },
 // Aggressive and defensive both commit to a fight that is close enough to the
 // pilot and both drop it to re-form once the fight leaves the gate; break off
 // flies the flee doctrine outward from the nearest threat until the order
 // changes. The chosen lock is stored on the ship (wingmanTargetId) and
 // projected by resolveShipTarget, so the weapons state and the lock can never
 // disagree within a frame.
 applyWingmanOrder(ship,index){
  const r=this.save.arenaRun;
  // The run record is the source of truth (persisted, edited by the HUD cards
  // and the run screen); the ship field is only a spawn-time cache.
  const crewEntry=(r?.wingmen??[]).find(entry=>entry.id===ship.arenaRunWingmanId);
  const order=wingmanOrder(crewEntry,r);
  ship.arenaRunWingmanOrder=order;
  // A changed order is a fresh commit decision: the previous lock's hysteresis
  // must not carry across, or a defensive order could inherit an aggressive
  // fight it had no business keeping.
  if(ship.wingOrder!==undefined&&ship.wingOrder!==order)ship.wingmanTargetId=undefined;
  const escortMark=order==='aggressive'&&this.runBattle?.target?.arenaFriendlyObjective
   ? escortBomber(this,ship,this.runBattle.target)
   : undefined;
  const target=escortMark??(WING_ORDER_GATE[order]?wingOrderTarget(this,ship,order,ship.wingmanTargetId):undefined);
  ship.wingOrder=order;
  ship.wingmanTargetId=target?.id;
  ship.holdFire=!target;ship.pursuitHoldFire=!target;
  if(!WING_ORDER_GATE[order]){
   // Break off: run out of the fight until the order changes.
   if(!ship.fleeing||ship.task?.kind!=='flee'){ship.fleeing=true;ship.task={kind:'flee',prior:{kind:'hunt',anchor:[...ship.position],destination:undefined},awayFrom:[...ship.position]};}
   // The shared flee fallback runs from the pilot when no hostile is inside its
   // threat radius, which would send a wingman across the arena instead of out
   // of it. Steer the leg at the nearest hostile (or the pilot) directly.
   const threat=nearestWingThreat(this,ship);
   const awayFrom=threat?threat.position:this.save.player.position;
   const dx=ship.position[0]-awayFrom[0],dy=ship.position[1]-awayFrom[1],dz=ship.position[2]-awayFrom[2];
   const length=Math.hypot(dx,dy,dz)||1;
   ship.destination=[ship.position[0]+dx/length*WINGMAN_BREAK_DISTANCE,ship.position[1]+dy/length*WINGMAN_BREAK_DISTANCE,ship.position[2]+dz/length*WINGMAN_BREAK_DISTANCE];
   return;
  }
  if(ship.fleeing||ship.task?.kind!=='hunt'){ship.fleeing=false;ship.task={kind:'hunt',anchor:[...this.save.player.position],destination:undefined};}
  // The hunt anchor follows the pilot so an idle wingman loiters on station
  // instead of re-rolling a point halfway across the field.
  ship.task.anchor=[...this.save.player.position];
  // Nothing legal to engage: hold station on the wing slot with every weapon
  // held. An empty lock is what keeps the AI on the travel leg instead of in a
  // fight it was told to stay out of.
  if(!target)ship.destination=this.wingmanPosition(index,this.tmpWingSlot??=new THREE.Vector3()).toArray();
 },
 // Cycle (no order) or set a named order, for one wingman (wing = its crew
 // index) or the whole wing (wing undefined). Each wingman keeps its own order
 // in the run record, so a reload preserves a mixed-tactics wing; the run
 // default follows the lead wingman for the Y key and the save migration.
 setWingOrder(order,wing=undefined){
  const r=this.save.arenaRun;if(!r||['won','lost'].includes(r.phase))return false;
  const crew=(r.wingmen??[]).filter(entry=>entry.alive!==false);
  // No crew yet: the order still lands as the run default, so a later hire
  // inherits it and the save migration keeps a coherent value.
  if(!crew.length){
   r.wingOrder=WING_ORDERS.includes(order)?order:nextWingOrder(r.wingOrder);
   this.syncWingmanOrders();writeArenaRun(this.save);return true;
  }
  const targets=Number.isInteger(wing)?crew.filter((entry,index)=>index===wing):crew;
  if(!targets.length)return false;
  for(const entry of targets){
   const current=wingmanOrder(entry,r);
   const next=WING_ORDERS.includes(order)?order:nextWingOrder(current);
   // A new order is a fresh commit decision: the previous lock's hysteresis
   // must not carry across, or a defensive order could inherit an aggressive
   // fight it had no business keeping.
   if(next!==current)for(const ship of this.ships)if(ship.arenaRunWingmanId===entry.id)ship.wingmanTargetId=undefined;
   entry.order=next;
   this.ui.pushEvent(t('{name} to {order}',{name:entry.name,order:t(WING_ORDER_LABEL[next])}),'info',3200);
  }
  this.syncWingmanOrders();
  writeArenaRun(this.save);return true;
 },
 cycleWingOrder(wing=undefined){return this.setWingOrder(undefined,wing);},
 runEntryPosition(index){
  const q=new THREE.Quaternion().fromArray(this.save.player.rotation),origin=new THREE.Vector3().fromArray(this.save.player.position);
  const obstacles=this.activeFieldObstacles();
  let point;for(let attempt=0;attempt<24;attempt++){point=new THREE.Vector3((index-1)*110+Math.sin(attempt*1.7)*180,30+Math.cos(attempt)*65,-1000-attempt*20).applyQuaternion(q).add(origin);if(this.entryPositionClear(point,obstacles,22)&&(attempt>=12||!this.lineBlocked(origin,point)))return point.toArray();}
  return null;
 },
 // A bomber holds a steadier approach than a gunfighter while its tubes have
 // rounds. The normal rack still checks nose angle, crossing speed, terrain,
 // intervening ships, energy and the uninterrupted lock time.
 flyRunBombingPass(ship,dt){
  const target=this.runBattle?.target;
  if(!target||target.hull<=0||!ship.combatFit.racks.some(r=>r.launcher==='torpedo'&&r.missiles>0))return false;
  ship.targetId=target.id;
  this.updateSensorAwareness(ship,dt);
  const point=(this.runBomberPoint??=new THREE.Vector3()).fromArray(target.position);
  const distance=point.distanceTo(this.tmpE.fromArray(ship.position));
  const standOff=LAUNCHERS.torpedo.lockRange*.6;
  const speed=Math.min(ship.speed,Math.max(0,(distance-standOff)*.45+Math.hypot(...target.velocity)));
  this.updateTravelAI(ship,dt,target.position,speed);
  this.updateNpcOrdnance(ship,point,dt);
  return true;
 },
 // Single-ship entry used by simulator probes. Group arrivals pass validated slots.
 spawnRunEnemy(spec,index){
  const planned=this.arenaSiteEntry(index,false);
  const position=this.save.arenaRun.entry??planned?.position??this.runEntryPosition(index);
  return Boolean(position&&this.spawnRunShip(spec,index,{...planned,position}));
 },
 runCapitalEntry(spec,entry){
  const radius=spec.role==='frigate'?140:spec.hullId==='caravan'||spec.hullId==='rookery'?65:42,obstacles=this.activeFieldObstacles();
  const point=new THREE.Vector3().fromArray(entry.position);
  if(this.entryPositionClear(point,obstacles,radius))return {...entry,largeClear:true};
  const origin=new THREE.Vector3().fromArray(this.save.player.position);
  const facing=new THREE.Quaternion().fromArray(this.save.player.rotation);
  for(let attempt=0;attempt<80;attempt++){
   const angle=Math.sin(attempt*2.4)*1.1,distance=1000+Math.floor(attempt/12)*55;
   point.set(Math.sin(angle)*distance,Math.sin(attempt*1.7)*140,-Math.cos(angle)*distance).applyQuaternion(facing).add(origin);
   if(this.entryPositionClear(point,obstacles,radius))return {...entry,position:point.toArray(),largeClear:true};
  }
  return null;
 },
 spawnRunShip(spec,index,entry){
  const {hullId,faction='pirates',role='pirate',tier='novice'}=spec;
  const point=new THREE.Vector3().fromArray(entry.position),origin=new THREE.Vector3().fromArray(this.save.player.position);
  if(isRunCapital(spec)){
   const variant=hullId??'concord-frigate';
   if(!entry.largeClear){
    const checked=this.runCapitalEntry(spec,entry);
    if(!checked)return null;
    point.fromArray(checked.position);
   }
   const ship=this.spawnCapitalShip(variant,point.toArray(),undefined,variant==='concord-frigate'?t('Arena frigate'):undefined,{tier,temperament:'steady'});
   if(variant==='concord-frigate')equipFrigate(ship,true);
   ship.hostile=!spec.friendly;ship.authorizedTarget=ship.hostile;ship.noSurrender=true;
   ship.targetId=ship.hostile?'player':undefined;ship.arenaRunEnemy=ship.hostile;
   ship.faction=spec.friendly?'independents':faction;
   delete ship.capitalHome;delete ship.task;ship.holdFire=false;ship.playerAwareness=1;
   ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),origin.sub(point).normalize()).toArray();
   if(ship.hostile)selectArrival(this,ship);
   if(variant==='concord-frigate')this.ui.pushEvent(t('Frigate entering. Lure it into the rocks, then torpedo its rear engines. Select systems on the target monitor.'),'warning',6000);
   return ship;
  }
  const ship=this.spawnShip(role,point.toArray(),undefined,undefined,{tier},{faction,hullId});
  ship.faction=faction;
  ship.hostile=true;ship.authorizedTarget=true;ship.dark=false;ship.mugCapable=false;ship.targetId='player';ship.arenaRunEnemy=true;ship.noSurrender=true;
  // Range control briefs an entering contact on the pilot's position: its
  // first search is fresh intel (arenaSweep.js marks it urgent).
  ship.arenaEntryIntelUntil=this.save.world.time+6;
  // The opponent flies its hull's real stock fit unless the wave overrides a
  // mount, so an Arena Run Concord Blade is the same Blade the career spawns.
  ship.combatFit=createEnemyLoadout(ship,index,{...runEnemyFit(spec),missiles:spec.missiles??0});
  ship.energy=ship.combatFit.stats.energyCapacity;
  ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),origin.clone().sub(point).normalize()).toArray();
  selectArrival(this,ship);
  const arrival=entry.label?t(entry.label):t('Opponent entering ahead.');
  this.ui.pushEvent(ship.combatFit.missiles>0?`${arrival} ${t('Missile carrier: {count} missiles.',{count:ship.combatFit.missiles})}`:arrival,'warning',5000);return ship;
 },
 tickArenaRun(dt){
  const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;
  this.syncWingmanOrders();
  if(r.countdown>0){r.countdown=Math.max(0,r.countdown-dt);const site=arenaSite(RUN_WAVES[r.wave].site);this.ui.showRunCountdown?.(Math.ceil(r.countdown),t(RUN_WAVES[r.wave].name),`${t(site.name)} · ${t(site.place)}`);if(r.countdown>0)return;r.startedAt=this.save.world.time;}
  r.elapsed+=dt;const wave=RUN_WAVES[r.wave],elapsed=this.save.world.time-r.startedAt;
  // Arena opponents never flee, surrender or hold fire, and they press the
  // player by default — but a lock onto a living wingman is left alone so the
  // hired veteran can actually draw fire.
  // An opponent keeps whatever living target it already has and otherwise
  // takes the nearest of the pilot and a live wingman. That is what lets a
  // hired veteran actually draw fire instead of the pilot tanking every shot.
  if(this.save.player.hull<=0)return;
  for(const ship of this.ships)if(ship.arenaRunEnemy&&ship.hull>0&&!ship.arenaExit){
   ship.fleeing=false;ship.holdFire=false;
   if(ship.arenaJumpPoint)continue;
   if(ship.arenaObjectiveAttacker&&this.runBattle.target?.hull>0){ship.targetId=this.runBattle.target.id;continue;}
   if(ship.targetId!=='player'&&!this.livingWingmanId(ship.targetId))ship.targetId=this.arenaThreatTarget(ship);
  }
  this.syncRunWingmen();
  if(tickBattle(this,wave,elapsed,dt)){
   // The last kill deserves its moment: hold the battlefield for a couple of
   // seconds so the death bloom plays out before the round flips to prepare.
   // Pending reinforcements still gate the clear above, and the pilot's own
   // death check earlier in the tick still ends the run during the grace.
   // An objective level times its own play-out (thanks, jumps, one second).
   r.clearAt??=elapsed+(this.runBattle?.outcome?0:2);
   // A big ship's death plays out before the round flips (CAPITAL_BLAST_HOLD).
   if(elapsed<r.clearAt||this.save.world.time<(this.capitalBlastUntil??0))return;
   r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));
   r.cleared=r.wave+1;
   const rewardForfeited=this.runBattle.outcome==='failed';
   this.recordRunWingmanHulls();this.ui.setObjectiveStrip?.(null);
   this.clearTransientSpace();this.save.player.velocity=[0,0,0];
   if(r.cleared===RUN_WAVES.length){
    r.phase='won';recordArenaRun(this.save);
   }else{
    recoverRun(this.save);r.wave++;
    if(r.wave===RUN_WAVES.length-1){
     const p=this.save.player;p.hull=getEffectiveShipStats(p).hull;recoverRun(this.save,true);
     for(const wingman of r.wingmen??[])wingman.hullFraction=1;
    }
    r.phase='prepare';
    r.rewardForfeited=rewardForfeited;r.rewardChosen=rewardForfeited;r.selectedReward=null;
    this.ui.runFitOpen=false;
    r.hullChosen=!DECISION_WAVES.includes(r.wave);
    r.hullOffers=r.hullChosen?[]:runHullOffers(this.save);
    r.wingmanOffers=r.hullChosen?[]:runWingmanOffers(this.save);
    r.offers=r.hullChosen&&!rewardForfeited?runOffers(this.save):[];
   }
   delete r.checkpoint;delete r.checkpointStoredRounds;delete r.checkpointWingmen;writeArenaRun(this.save);this.showRunPreparation();
  }
 },
 loseArenaRun(){const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;this.ui.setObjectiveStrip?.(null);r.phase='lost';r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));delete r.checkpoint;delete r.checkpointStoredRounds;delete r.checkpointWingmen;this.deathTimer=0;this.clearTransientSpace();this.ui.setRunInbound?.(null);recordArenaRun(this.save);writeArenaRun(this.save);this.showRunPreparation();},
};
