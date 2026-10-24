import * as THREE from '../../vendor/three.module.min.js';
import {combatWreckNode} from './careerLoot.js';
import {createEquipmentRecord} from './equipmentInventory.js';
import {isTutorialGuided} from './tutorialCampaign.js';
import {FREIGHTER_LOGS,GRAVEYARD_CACHES,FREIGHTER_POSITION,FREIGHTER_WRECK_ID,explorationLootId,normalizeExploration,explorationText as text} from './explorationData.js';
const SYSTEM='helios-verge';
const near=(a,b,r)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<r;
const offset=(p,x,y,z)=>[p[0]+x,p[1]+y,p[2]+z];
const state=s=>s.save.world.exploration??normalizeExploration(s.save.world);
const cargo=(id,commodity,quantity)=>({id:'exploration-cargo-'+id,kind:'cargo',commodity,quantity});
const clearBattle=s=>!s.ships.some(a=>a.hull>0&&a.hostile&&near(a.position,s.save.player.position,7000)&&!a.explorationActor);
const eligible=s=>!s.arena&&!s.activeRace&&!s.save.player.raceReturn&&!isTutorialGuided(s.save);
const serialise=ship=>({key:ship.explorationActor,hull:ship.hull,shield:ship.shield,position:[...ship.position],rotation:[...ship.rotation],velocity:[...ship.velocity],surrendered:Boolean(ship.surrendered)});
// The recurring Lantern convoy now lives in distressEvents.js. Only the
// authored Kestrel Nine salvage claim remains an exploration discovery.
const groups={
 salvagers:[['sera','trader','wayfarer','Driftglass · Sera',[-170,55,90]],['escort','bounty','talon','Driftglass · Vale',[190,-35,-110]]],
};
function addWreck(s,record){
 s.save.world.combatWrecks??={};s.save.world.combatWrecks[record.id]=record;
 if(!s.wreckNodes)return;
 const node=combatWreckNode(record);s.wreckNodes.push(node);s.renderer?.addCombatLootNode?.(node);
}
function supply(s){
 const q=state(s);s.save.world.combatWrecks??={};
 for(const def of [...FREIGHTER_LOGS,...GRAVEYARD_CACHES]){
  const id=explorationLootId(def.id);
  if(q.recovered.includes(def.id))continue;
  const existing=s.save.world.combatWrecks[id];
  if(existing){
   // Authored crates are stationary. Move older saves to the fitted sites
   // without replacing their remaining cargo or discovery state.
   existing.position=[...def.position];
   const node=s.wreckNodes?.find(n=>n.id===id);
   if(node)node.position.splice(0,3,...def.position);
   continue;
  }
  const log=FREIGHTER_LOGS.includes(def);
  addWreck(s,{id,explorationId:def.id,name:log?'Kestrel Nine · '+text(['Frachtbehälter','cargo pod']):text(['Verborgene Fracht','Hidden cargo']),
   position:[...def.position],radius:3,velocity:[0,0,0],systemId:SYSTEM,instanceId:log?'shardbelt':'mourning-line',sensorRange:650,scanned:false,
   contents:[cargo(def.id,def.commodity,def.quantity)]});
 }
 if(q.finale!=='locked'&&!q.recovered.includes('finale')&&!s.save.world.combatWrecks[FREIGHTER_WRECK_ID]){
  const full=q.finale==='won',open=full||q.finale==='shared';
  const reactor=createEquipmentRecord('sustained-reactor',{id:'eq-exploration-kestrel-reactor',tier:1,rarity:'uncommon',affixes:['efficient']});
  const contents=[cargo('finale','gold',full?4:2),{id:reactor.id,kind:'equipment',item:reactor}];
  if(full){const engine=createEquipmentRecord('engine-mk2',{id:'eq-exploration-kestrel-engine',tier:2,rarity:'uncommon'});contents.push({id:engine.id,kind:'equipment',item:engine});}
  addWreck(s,{id:FREIGHTER_WRECK_ID,explorationId:'finale',name:'Kestrel Nine',position:[...FREIGHTER_POSITION],radius:7,systemId:SYSTEM,instanceId:'open',scanned:true,locked:!open,derelict:'atlas-freighter',contents});
 }
}
function actors(s,group){
 const q=state(s),snapshots=q.actors[group]??[],center=FREIGHTER_POSITION;
 for(const [key,role,hull,name,delta]of groups[group]){
  const old=snapshots.find(a=>a.key===key);
  if(old&&(old.hull<=0||old.surrendered))continue;
  if(s.ships.some(ship=>ship.explorationActor===key&&ship.hull>=0))continue;
  const hostile=q.finale==='fighting';
  const ship=s.spawnShip(role,old?.position??offset(center,...delta),'exploration-'+group,name,{tier:'regular',temperament:'steady'},{hullId:hull,faction:hostile?'pirates':'independents'});
  ship.explorationActor=key;ship.explorationGroup=group;ship.dark=false;ship.mugCapable=false;ship.playerIdentified=true;ship.playerAwareness=1;ship.playerSensorAwareness=1;
  ship.authorizedTarget=hostile;ship.hostile=hostile;ship.cargo={};ship.nextLineAt=Infinity;
  if(old){ship.hull=Math.min(ship.maxHull,old.hull);ship.shield=Math.min(ship.maxShield,old.shield??0);if(old.rotation?.length===4)ship.rotation=[...old.rotation];if(old.velocity?.length===3)ship.velocity=[...old.velocity];}
  if(group==='salvagers'&&!hostile){ship.poweredDown=true;ship.standingDown=true;ship.velocity.fill(0);}
 }
 retarget(s,group);
}
function retarget(s,group){
 const all=s.ships.filter(a=>a.explorationGroup===group&&a.hull>0&&!a.surrendered);
 for(const ship of all){
  if(state(s).finale==='fighting')ship.explorationTargetId='player';
  else ship.explorationTargetId=undefined;
 }
}
function offer(s){
 if(s.ui.adventure||s.ui.isShipMenuOpen?.()||s.ui.mapOpen||s.autopilot)return false;
 const id='exploration-salvagers';
 const portrait=s.encounterPortraitForSpeaker?.('Sera',id);
 s.ui.showStoryLine?.('Sera',text(['Lass uns die Fracht teilen.','Let us split the cargo.']),'neutral',id,portrait?.faction,portrait?.portraitIndex);
 s.storyLineUntil=Infinity;return true;
}
function unlockFinalLoot(s,full){
 const q=state(s);q.finale=full?'won':'shared';
 // A resolved manifest is authored once. Partial recovery must never refill it.
 const wreck=s.save.world.combatWrecks[FREIGHTER_WRECK_ID];
 if(wreck){wreck.locked=false;
  if(full){wreck.contents.find(e=>e.kind==='cargo').quantity=4;const engine=createEquipmentRecord('engine-mk2',{id:'eq-exploration-kestrel-engine',tier:2,rarity:'uncommon'});wreck.contents.push({id:engine.id,kind:'equipment',item:engine});}
  const node=s.wreckNodes.find(n=>n.id===wreck.id);if(node){node.locked=false;node.remaining=wreck.contents.reduce((n,e)=>n+(e.quantity??1),0);}
 }
 s.persistSave();
 s.playStoryLine?.(full?'Kestrel Nine':'Sera',text(full?['Der Frachtraum ist frei. Die Bergungscrew ist ausgeschaltet.','The hold is clear. The salvage crew has been defeated.']:['Abgemacht. Dein Anteil liegt am Wrack. Wir nehmen den Rest und verschwinden.','Agreed. Your share is at the wreck. We will take the rest and leave.']),'neutral',6500);
}
function startSalvageFight(s){
 const q=state(s);q.finale='fighting';
 for(const ship of s.ships)if(ship.explorationGroup==='salvagers'&&ship.hull>0){ship.poweredDown=false;ship.standingDown=false;ship.hostile=true;ship.authorizedTarget=true;ship.faction='pirates';ship.explorationTargetId='player';}
}
export const ExplorationMethods={
 onExplorationActorHit(ship,attackerId,amount){
  if(amount>0&&attackerId==='player'&&ship.explorationGroup==='salvagers'&&state(this).finale==='available')startSalvageFight(this);
 },
 onExplorationActorDefeated(ship){
  if(!ship.explorationGroup)return;
  const saved=state(this).actors[ship.explorationGroup]??=[],index=saved.findIndex(a=>a.key===ship.explorationActor),snap=serialise(ship);
  if(index<0)saved.push(snap);else saved[index]=snap;
 },
 explorationLootAllowed(){return eligible(this);},
 explorationCombatTarget(ship){
  if(ship.distressActor)return this.distressCombatTarget(ship);
  if(!ship.explorationGroup)return undefined;
  const id=ship.explorationTargetId;
  const actor=id==='player'?this.save.player:this.ships.find(a=>a.id===id&&a.hull>0&&!a.surrendered);
  if(!actor||actor.dockedAt){ship.targetId=undefined;return null;}
  ship.targetId=id;ship.npcTargetReason='exploration';
  this.explorationTargetScratch??={position:new THREE.Vector3(),velocity:new THREE.Vector3()};
  const target=this.explorationTargetScratch;target.position.fromArray(actor.position);target.velocity.fromArray(actor.velocity);return target;
 },
 initializeExploration(){if(this.arena)return;normalizeExploration(this.save.world);if(eligible(this)){supply(this);this.explorationSupplied=true;}},
 onExplorationLoot(wreck){
  if(!wreck.explorationId||wreck.contents.length)return;
  const q=state(this),id=wreck.explorationId;if(q.recovered.includes(id))return;q.recovered.push(id);
  const log=FREIGHTER_LOGS.find(p=>p.id===id);
  if(log){
   if(FREIGHTER_LOGS.every(p=>q.recovered.includes(p.id))){q.finale='available';supply(this);}
   this.ui.showStoryLine?.(text(log.title),text(log.text),'neutral','exploration-log-'+id);
   this.storyLineUntil=Infinity;
   if(q.finale==='available')this.ui.pushEvent?.(text(['Kestrel Nine geortet · Koordinaten im Logbuch.','Kestrel Nine located · coordinates in the journal.']));
  }
  this.persistSave();
 },
 explorationWaypoint(){
  if(this.save.player.currentTargetId!==FREIGHTER_WRECK_ID||this.save.player.systemId!==SYSTEM||this.save.player.dockedAt||this.arena||this.activeRace)return;
  const node=this.wreckNodes?.find(n=>n.id===FREIGHTER_WRECK_ID&&n.remaining>0);
  if(this.save.player.currentTargetId===FREIGHTER_WRECK_ID&&node&&state(this).finale!=='locked')return {id:node.id,kind:'waypoint',exploration:true,position:node.position,name:node.name,shortName:node.name,radius:0};
 },
 chooseExploration(choice){
  const q=state(this),p=this.save.player;if(!eligible(this)||p.systemId!==SYSTEM||p.dockedAt)return {ok:false};
  if(['share','fight'].includes(choice)){
   if(q.finale!=='available'||!near(p.position,FREIGHTER_POSITION,650))return {ok:false};
   actors(this,'salvagers');
   if(choice==='share'){unlockFinalLoot(this,false);for(const ship of this.ships.filter(a=>a.explorationGroup==='salvagers')){ship.poweredDown=false;ship.standingDown=true;ship.task={kind:'exploration'};ship.destination=offset(FREIGHTER_POSITION,0,180,4000);}}
   else{startSalvageFight(this);this.persistSave();}
  }else return {ok:false};
  return {ok:true};
 },
 explorationJournalAction(action){
  if(this.save.player.dockedAt)return false;
  if(action==='navigate'&&state(this).finale!=='locked'){
   if(this.save.player.systemId!==SYSTEM){const plotted=this.plotSystemRoute?.(SYSTEM,'shardbelt');if(plotted)this.ui.hideShipMenu?.();return Boolean(plotted);}
   supply(this);if(!this.wreckNodes.some(n=>n.id===FREIGHTER_WRECK_ID))return false;
   this.save.player.currentTargetId=FREIGHTER_WRECK_ID;this.ui.hideShipMenu?.();return true;
  }
  return false;
 },
 updateExploration(){
  if(!eligible(this)||this.save.player.dockedAt||this.save.player.systemId!==SYSTEM)return;
  if(!this.explorationSupplied){supply(this);this.explorationSupplied=true;}
  const q=state(this),now=this.save.world.time,p=this.save.player;
  if(q.finale!=='locked'&&!this.freighterModelWarmed){this.renderer?.preloadGlbShips?.(['atlas-freighter']);this.freighterModelWarmed=true;}
  // Small fixed roster; half-second checks avoid adding work to flight AI.
  if(now<(this.explorationTickAt??0))return;this.explorationTickAt=now+.5;
  const live=this.ships.filter(a=>a.explorationGroup==='salvagers');
  if(live.length){const saved=q.actors.salvagers??=[];for(const ship of live){const i=saved.findIndex(a=>a.key===ship.explorationActor),snap=serialise(ship);if(i<0)saved.push(snap);else saved[i]=snap;}}
  if(q.finale==='fighting'){
   if(near(p.position,FREIGHTER_POSITION,7000)){actors(this,'salvagers');if((q.actors.salvagers?.length??0)===2&&q.actors.salvagers.every(a=>a.hull<=0||a.surrendered))unlockFinalLoot(this,true);}
   if(near(p.position,FREIGHTER_POSITION,7000))this.nextEncounterAt=Math.max(this.nextEncounterAt??0,now+20);
   else this.ships=this.ships.filter(a=>a.explorationGroup!=='salvagers');
  }else if(q.finale==='available'&&near(p.position,FREIGHTER_POSITION,1100)&&clearBattle(this)){
   actors(this,'salvagers');
   if(this.ships.some(a=>a.explorationGroup==='salvagers'&&(a.hostile||a.playerDamageTaken>0))){startSalvageFight(this);this.persistSave();}
   else if(near(p.position,FREIGHTER_POSITION,450)&&now>=(this.explorationOfferAt??0)&&offer(this))this.explorationOfferAt=now+60;
   this.nextEncounterAt=Math.max(this.nextEncounterAt??0,now+20);
  }
  // Finished encounter actors leave normally, then retire beyond sensor range.
  const terminal=ship=>ship.explorationGroup==='salvagers'&&(q.finale==='shared'||q.finale==='won');
  if(this.ships.some(ship=>terminal(ship)&&!near(ship.position,p.position,5000)))this.ships=this.ships.filter(ship=>!terminal(ship)||near(ship.position,p.position,5000));
 },
};
