import {equipFrigate} from './capitalCombat.js';
import * as THREE from 'three';
import {RUN_WAVES,writeArenaRun,recordArenaRun,recoverRun,runOffers,runHullOffers,refreshRunRewardOffers,runWingmanOffers,refreshRunWingmanOffers,hireRunWingman,chooseRunReward,fitRunItem,changeRunHull,wingmanOrder} from './arenaRun.js';
// One wing doctrine for the whole game: the range gates, the pilot's-mark
// preference, self-defence and hysteresis all live in wingOrders.js, so the
// arena wing and the campaign companion can differ only in how they fly.
import {normalizeWingOrder,nextWingOrder,WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_GATE,wingOrderTarget,nearestWingThreat} from './wingOrders.js';
import {MAX_RUN_WINGMEN} from './shipPool.js';
import {createEnemyLoadout} from './enemyLoadouts.js';
import {getEffectiveShipStats} from './shipStats.js';
import {loadoutFor} from './outfitting.js';
import {SHIPS} from './data.js';
import {t} from './i18n.js';
const clone=x=>JSON.parse(JSON.stringify(x));
// A hired wingman flies patrol doctrine on the Free Merchants' colours. That
// faction opposes the arena's Red Talon opponents (so a wingman fights them and
// can be shot at), while the hidden player actor is never a legal target for
// it: neither guns nor missiles can pick the pilot up as a victim.
const WINGMAN_FACTION='free-merchants';
// Formation slots in the player's own frame — starboard, port, then astern —
// as [right, up, back] multiples of the base offset.
const WINGMAN_OFFSETS=[[-1,0.55,0.8],[1,0.55,0.8],[0,0.9,1.5]];
const WINGMAN_OFFSET_SCALE=110;
// How far a breaking-off wingman runs from the nearest hostile. The leg is
// recomputed from the wing's live position every tick, so it never arrives and
// simply keeps leaving the fight until the order changes.
const WINGMAN_BREAK_DISTANCE=2400;
export const ArenaRunMethods={
 setupRun(){
  const r=this.save.arenaRun;
  if(r.phase==='combat'){if(r.checkpoint){this.save.player=clone(r.checkpoint);delete this.save.player.prevPosition;delete this.save.player.prevRotation;}Object.assign(r,r.checkpointStats??{});this._statsDirty=true;r.phase='prepare';r.rewardChosen=true;r.hullChosen=true;
   // Wingman losses belong to the interrupted attempt: a resumed wave restores
   // the crew that started it, exactly like the player checkpoint above.
   if(Array.isArray(r.checkpointWingmen))r.wingmen=clone(r.checkpointWingmen);delete r.checkpointWingmen;}
  this.setupArena({run:true,environment:RUN_WAVES[r.wave].environment,scenario:'free-flight'},false);
  refreshRunWingmanOffers(this.save);refreshRunRewardOffers(this.save);writeArenaRun(this.save);if(r.wave===0&&r.phase==='prepare')this.startRunWave();else this.showRunPreparation();
 },
 showRunPreparation(){this.ui.setWingTactics?.([],0);this.ui.showArenaRun(this.save);},
 arenaRunAction(action,value,key,index){
  const r=this.save.arenaRun;if(!r)return;
  // The wing orders are the one run command that also works mid-wave: each
  // row carries the order (value) and the wingman it targets (data-run-index);
  // a row without an index addresses the whole crew.
  if(action==='order'){const wing=Number(index);this.setWingOrder(value,Number.isInteger(wing)?wing:undefined);return;}
  if(r.phase!=='prepare')return;
  if(action==='reward'&&!r.rewardChosen&&r.offers.includes(value))r.selectedReward=value;
  if((action==='accept'||action==='equip')&&!chooseRunReward(this.save,r.selectedReward))return;
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
  this._statsDirty=true;const p=this.save.player,stats=this.playerStats();p.shield=Math.min(p.shield,stats.shield);p.hull=Math.min(p.hull,stats.hull);p.energy=Math.min(p.energy,stats.energyCapacity);p.fuel=Math.min(p.fuel,stats.fuel);p.turretRuntime=[];
  this.syncWeaponProjection();writeArenaRun(this.save);if(action==='equip')this.ui.runFitOpen=true;
  if(action==='accept'){this.ui.runFitOpen=false;this.startRunWave();}else this.showRunPreparation();
 },
 startRunWave(){
  const r=this.save.arenaRun;if(!r||r.phase!=='prepare'||!r.rewardChosen||!r.hullChosen||!loadoutFor(this.save.player).guns.some(Boolean))return;
  this.clearTransientSpace();this.autopilot=false;this.deathTimer=0;this.afterburning=false;this.playerShieldDelay=0;
  const wave=RUN_WAVES[r.wave];this.arena.environment=wave.environment;
  this.setupArena({run:true,environment:wave.environment,scenario:'free-flight'},false);this.updateActiveInstance(true);
  this.spawnRunWingmen();
  this.gunCooldown=0;this.mountFireAt={};this.missileCooldown=0;this.ui.runFitNotice='';
  this.save.player.mode='combat';this.save.player.currentTargetId=undefined;
  r.phase='combat';r.checkpoint=clone(this.save.player);delete r.checkpoint.turretRuntime;delete r.checkpoint.prevPosition;delete r.checkpoint.prevRotation;
  r.checkpointStats={elapsed:r.elapsed,damage:r.damage,missiles:r.missiles};
  r.checkpointWingmen=clone(r.wingmen??[]);
  r.countdown=3;r.startedAt=this.save.world.time;r.entry=null;r.nextEnemy=0;r.warned=-1;r.waveMissiles=this.save.player.missiles??0;delete r.clearAt;
  writeArenaRun(this.save);this.ui.hideArena();this.ui.hidePause();this.ui.showHud();
  this.ui.pushEvent(t('Wave {wave} of {total}',{wave:r.wave+1,total:RUN_WAVES.length})+' · '+t(wave.name),'info',5000);
  this.ui.showRunCountdown?.(3,t(wave.name));
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
  const ship=this.spawnShip('patrol',point.toArray(),undefined,wingman.name,{tier:'veteran',temperament:'steady'},{faction:WINGMAN_FACTION});
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
  ship.maxHull=ship.hull=ship.combatFit.stats.hull;
  ship.combatFit.resources.shield=ship.maxShield;
  ship.energy=ship.combatFit.stats.energyCapacity;ship.fuel=ship.combatFit.stats.fuel;
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
 livingWingmanId(id){return Boolean(id)&&this.ships.some(ship=>ship.id===id&&ship.arenaRunWingman&&ship.hull>0);},
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
   if(ship)this.applyWingmanOrder(ship,index);
   // Live hull and shield when the wingman is flying, so the HUD card's fills
   // read the fight; a docked crew publishes its stance only.
   crew.push({index,order:wingman.order,name:wingman.name,hullId:wingman.hullId,
    hull:ship?ship.hull:0,maxHull:ship?(ship.maxHull??1):0,
    shield:ship?ship.shield:0,maxShield:ship?(ship.maxShield??1):0});
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
  const target=WING_ORDER_GATE[order]?wingOrderTarget(this,ship,order,ship.wingmanTargetId):undefined;
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
 spawnRunEnemy(spec,index){
  const r=this.save.arenaRun,[role,tier,fitIndex,,ordnance]=spec;
  const origin=new THREE.Vector3().fromArray(this.save.player.position);
  const cached=r.entry;
  const entry=cached && origin.distanceTo(new THREE.Vector3().fromArray(cached))>=1000 ? cached : this.runEntryPosition(index);if(!entry)return false;
  const point=new THREE.Vector3().fromArray(entry);r.entry=null;this.ui.setRunInbound?.(null);
  if(role==='frigate'){
   const obstacles=this.activeFieldObstacles(),facing=new THREE.Quaternion().fromArray(this.save.player.rotation);let clear=false;
   for(let attempt=0;attempt<80;attempt++){
    const angle=Math.sin(attempt*2.4)*1.1,distance=1000+Math.floor(attempt/12)*55;point.set(Math.sin(angle)*distance,Math.sin(attempt*1.7)*140,-Math.cos(angle)*distance).applyQuaternion(facing).add(origin);
    if(this.entryPositionClear(point,obstacles,140)){clear=true;break;}
   }
   if(!clear)return false;
   const ship=this.spawnCapitalShip('concord-frigate',point.toArray(),'rook',t('Arena frigate'));
   equipFrigate(ship,true);ship.hostile=true;ship.targetId='player';ship.arenaRunEnemy=true;ship.noSurrender=true;ship.faction='red-talons';
   delete ship.task;delete ship.capitalHome;ship.holdFire=false;ship.playerAwareness=1;
   ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),origin.clone().sub(point).normalize()).toArray();
   this.selectTarget('ship',ship.id);this.ui.pushEvent(t('Frigate entering. Use asteroid cover; select its batteries on the target monitor.'),'warning',6000);return true;
  }
  const ship=this.spawnShip(role,point.toArray(),undefined,undefined,{tier:r.hard?(tier==='novice'?'veteran':tier==='veteran'?'ace':tier):tier});
  ship.faction='red-talons';
  ship.hostile=true;ship.targetId='player';ship.arenaRunEnemy=true;ship.noSurrender=true;ship.combatFit=createEnemyLoadout(ship,fitIndex,ordnance);
  ship.combatFit.launcher=ordnance?.launcher;ship.combatFit.missiles=ordnance?.missiles??0;
  if(r.wave===0&&!r.hard){ship.combatFit.guns=['beam-emitter',null,null];ship.combatFit.weapons=['beam'];ship.combatFit.attackOrder=[0];ship.combatFit.fireAt=[this.save.world.time+4];ship.combatFit.missiles=0;ship.combatFit.turrets=[];}
  ship.energy=ship.combatFit.stats.energyCapacity;
  ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),origin.clone().sub(point).normalize()).toArray();
  if(!this.ships.some(s=>s.id===this.save.player.currentTargetId&&s.hull>0))this.selectTarget('ship',ship.id);
  this.ui.pushEvent(ship.combatFit.missiles>0?t('Missile carrier entering ahead: {count} missiles.',{count:ship.combatFit.missiles}):t('Opponent entering ahead.'),'warning',5000);return true;
 },
 tickArenaRun(dt){
  const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;
  this.syncWingmanOrders();
  if(r.countdown>0){r.countdown=Math.max(0,r.countdown-dt);this.ui.showRunCountdown?.(Math.ceil(r.countdown),t(RUN_WAVES[r.wave].name));if(r.countdown>0)return;r.startedAt=this.save.world.time;}
  r.elapsed+=dt;const wave=RUN_WAVES[r.wave],elapsed=this.save.world.time-r.startedAt;
  // Arena opponents never flee, surrender or hold fire, and they press the
  // player by default — but a lock onto a living wingman is left alone so the
  // hired veteran can actually draw fire.
  for(const ship of this.ships)if(ship.arenaRunEnemy){ship.fleeing=false;ship.holdFire=false;if(!this.livingWingmanId(ship.targetId))ship.targetId='player';}
  while(r.nextEnemy<wave.enemies.length&&elapsed>=wave.enemies[r.nextEnemy][3]){if(!this.spawnRunEnemy(wave.enemies[r.nextEnemy],r.nextEnemy))break;r.nextEnemy++;}
  const next=wave.enemies[r.nextEnemy];if(next&&r.warned!==r.nextEnemy&&elapsed>=next[3]-4){r.warned=r.nextEnemy;r.entry=this.runEntryPosition(r.nextEnemy);this.ui.pushEvent(t('Reinforcement ahead in four seconds.'),'warning',4000);}
  if(r.entry&&next&&this.renderer.camera){this.runMarkerVector??=new THREE.Vector3();this.runMarkerVector.fromArray(r.entry).project(this.renderer.camera);this.ui.setRunInbound?.({x:this.runMarkerVector.x,y:this.runMarkerVector.y,behind:this.runMarkerVector.z>1,seconds:Math.max(0,Math.ceil(next[3]-elapsed))});}
  if(this.save.player.hull<=0)return;
  this.syncRunWingmen();
  if(r.nextEnemy===wave.enemies.length&&!this.ships.some(s=>s.arenaRunEnemy&&s.hull>0&&!s.surrendered)){
   // The last kill deserves its moment: hold the battlefield for a couple of
   // seconds so the death bloom plays out before the round flips to prepare.
   // Pending reinforcements still gate the clear above, and the pilot's own
   // death check earlier in the tick still ends the run during the grace.
   r.clearAt??=elapsed+2;
   if(elapsed<r.clearAt)return;
   r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));r.cleared=r.wave+1;
   this.clearTransientSpace();this.save.player.velocity=[0,0,0];
   if(r.cleared===RUN_WAVES.length){r.phase='won';recordArenaRun(this.save);}
   else{recoverRun(this.save);r.wave++;if(r.wave===9){const p=this.save.player;p.hull=getEffectiveShipStats(p).hull;recoverRun(this.save,true);}r.phase='prepare';r.rewardChosen=false;r.selectedReward=null;this.ui.runFitOpen=false;r.hullChosen=![3,6].includes(r.wave);r.hullOffers=r.hullChosen?[]:runHullOffers(this.save);r.wingmanOffers=r.hullChosen?[]:runWingmanOffers(this.save);r.offers=r.hullChosen?runOffers(this.save):[];}
   delete r.checkpoint;delete r.checkpointWingmen;writeArenaRun(this.save);this.showRunPreparation();
  }
 },
 loseArenaRun(){const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;r.phase='lost';r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));delete r.checkpoint;delete r.checkpointWingmen;this.deathTimer=0;this.clearTransientSpace();this.ui.setRunInbound?.(null);recordArenaRun(this.save);writeArenaRun(this.save);this.showRunPreparation();},
};
