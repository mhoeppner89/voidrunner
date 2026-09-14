import {equipFrigate} from './capitalCombat.js';
import * as THREE from 'three';
import {RUN_WAVES,writeArenaRun,recordArenaRun,recoverRun,runOffers,refreshRunRewardOffers,chooseRunReward,fitRunItem,changeRunHull} from './arenaRun.js';
import {createEnemyLoadout} from './enemyLoadouts.js';
import {getEffectiveShipStats} from './shipStats.js';
import {loadoutFor} from './outfitting.js';
import {t} from './i18n.js';
const clone=x=>JSON.parse(JSON.stringify(x));
export const ArenaRunMethods={
 setupRun(){
  const r=this.save.arenaRun;
  if(r.phase==='combat'){if(r.checkpoint){this.save.player=clone(r.checkpoint);delete this.save.player.prevPosition;delete this.save.player.prevRotation;}Object.assign(r,r.checkpointStats??{});this._statsDirty=true;r.phase='prepare';r.rewardChosen=true;r.hullChosen=true;}
  this.setupArena({run:true,environment:RUN_WAVES[r.wave].environment,scenario:'free-flight'},false);
  refreshRunRewardOffers(this.save);writeArenaRun(this.save);if(r.wave===0&&r.phase==='prepare')this.startRunWave();else this.showRunPreparation();
 },
 showRunPreparation(){this.ui.showArenaRun(this.save);},
 arenaRunAction(action,value,key,index){
  const r=this.save.arenaRun;if(!r||r.phase!=='prepare')return;
  if(action==='reward'&&!r.rewardChosen&&r.offers.includes(value))r.selectedReward=value;
  if((action==='accept'||action==='equip')&&!chooseRunReward(this.save,r.selectedReward))return;
  if(action==='hull'){changeRunHull(this.save,value);this.ui.setCockpitShip?.(this.save.player.shipId);}
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
  this.gunCooldown=0;this.mountFireAt={};this.missileCooldown=0;this.ui.runFitNotice='';
  this.save.player.mode='combat';this.save.player.currentTargetId=undefined;
  r.phase='combat';r.checkpoint=clone(this.save.player);delete r.checkpoint.turretRuntime;delete r.checkpoint.prevPosition;delete r.checkpoint.prevRotation;
  r.checkpointStats={elapsed:r.elapsed,damage:r.damage,missiles:r.missiles};
  r.countdown=3;r.startedAt=this.save.world.time;r.entry=null;r.nextEnemy=0;r.warned=-1;r.waveMissiles=this.save.player.missiles??0;
  writeArenaRun(this.save);this.ui.hideArena();this.ui.hidePause();this.ui.showHud();
  this.ui.pushEvent(t('Wave {wave} of {total}',{wave:r.wave+1,total:RUN_WAVES.length})+' · '+t(wave.name),'info',5000);
  this.ui.showRunCountdown?.(3,t(wave.name));
 },
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
  ship.hostile=true;ship.targetId='player';ship.arenaRunEnemy=true;ship.noSurrender=true;ship.combatFit=createEnemyLoadout(ship,fitIndex);
  ship.combatFit.launcher=ordnance?.launcher;ship.combatFit.missiles=ordnance?.missiles??0;
  if(r.wave===0&&!r.hard){ship.combatFit.guns=['beam-emitter',null,null];ship.combatFit.weapons=['beam'];ship.combatFit.attackOrder=[0];ship.combatFit.fireAt=[this.save.world.time+4];ship.combatFit.missiles=0;ship.combatFit.turrets=[];}
  ship.energy=ship.combatFit.stats.energyCapacity;
  ship.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),origin.clone().sub(point).normalize()).toArray();
  if(!this.ships.some(s=>s.id===this.save.player.currentTargetId&&s.hull>0))this.selectTarget('ship',ship.id);
  this.ui.pushEvent(ship.combatFit.missiles>0?t('Missile carrier entering ahead: {count} missiles.',{count:ship.combatFit.missiles}):t('Opponent entering ahead.'),'warning',5000);return true;
 },
 tickArenaRun(dt){
  const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;
  if(r.countdown>0){r.countdown=Math.max(0,r.countdown-dt);this.ui.showRunCountdown?.(Math.ceil(r.countdown),t(RUN_WAVES[r.wave].name));if(r.countdown>0)return;r.startedAt=this.save.world.time;}
  r.elapsed+=dt;const wave=RUN_WAVES[r.wave],elapsed=this.save.world.time-r.startedAt;
  for(const ship of this.ships)if(ship.arenaRunEnemy){ship.fleeing=false;ship.holdFire=false;ship.targetId='player';}
  while(r.nextEnemy<wave.enemies.length&&elapsed>=wave.enemies[r.nextEnemy][3]){if(!this.spawnRunEnemy(wave.enemies[r.nextEnemy],r.nextEnemy))break;r.nextEnemy++;}
  const next=wave.enemies[r.nextEnemy];if(next&&r.warned!==r.nextEnemy&&elapsed>=next[3]-4){r.warned=r.nextEnemy;r.entry=this.runEntryPosition(r.nextEnemy);this.ui.pushEvent(t('Reinforcement ahead in four seconds.'),'warning',4000);}
  if(r.entry&&next&&this.renderer.camera){this.runMarkerVector??=new THREE.Vector3();this.runMarkerVector.fromArray(r.entry).project(this.renderer.camera);this.ui.setRunInbound?.({x:this.runMarkerVector.x,y:this.runMarkerVector.y,behind:this.runMarkerVector.z>1,seconds:Math.max(0,Math.ceil(next[3]-elapsed))});}
  if(this.save.player.hull<=0)return;
  if(r.nextEnemy===wave.enemies.length&&!this.ships.some(s=>s.arenaRunEnemy&&s.hull>0&&!s.surrendered)){
   r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));r.cleared=r.wave+1;
   this.clearTransientSpace();this.save.player.velocity=[0,0,0];
   if(r.cleared===RUN_WAVES.length){r.phase='won';recordArenaRun(this.save);}
   else{recoverRun(this.save);r.wave++;if(r.wave===9){const p=this.save.player;p.hull=getEffectiveShipStats(p).hull;recoverRun(this.save,true);}r.phase='prepare';r.rewardChosen=false;r.selectedReward=null;this.ui.runFitOpen=false;r.hullChosen=![3,6].includes(r.wave);r.offers=r.hullChosen?runOffers(this.save):[];}
   delete r.checkpoint;writeArenaRun(this.save);this.showRunPreparation();
  }
 },
 loseArenaRun(){const r=this.save.arenaRun;if(!r||r.phase!=='combat')return;r.phase='lost';r.missiles+=Math.max(0,r.waveMissiles-(this.save.player.missiles??0));delete r.checkpoint;this.deathTimer=0;this.clearTransientSpace();this.ui.setRunInbound?.(null);recordArenaRun(this.save);writeArenaRun(this.save);this.showRunPreparation();},
};
