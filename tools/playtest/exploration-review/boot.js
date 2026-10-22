import * as THREE from '/vendor/three.module.min.js';
import {hydrateSave} from '/src/game/save.js';
import {combatWreckNode} from '/src/game/careerLoot.js';
import {forgetEquipmentDefinition} from '/src/game/equipmentCatalog.js';
import {shipVsObstacle} from '/src/game/shipCollision.js';
import {FREIGHTER_LOGS,GRAVEYARD_CACHES,FREIGHTER_POSITION,FREIGHTER_WRECK_ID,CONVOY_POSITION,explorationLootId} from '/src/game/explorationData.js';
const panel=document.querySelector('#discovery-review'),status=document.querySelector('#review-status'),grid=document.querySelector('#review-scenarios'),toolbar=document.querySelector('#review-toolbar'),resume=document.querySelector('#review-resume'),nextButton=document.querySelector('#review-next'),feedbackControls=document.querySelector('#feedback-controls'),soundButton=document.querySelector('#review-sound');
const scenes=[
 ['trail','Die ganze Spur','Alle drei Pakete selbst einsammeln. „Nächster Fund“ verkürzt die Wege.'],
 ['pod-0','Paket 1 · Die Verfolgung','Kurzer Anflug auf den ersten Behälter im Tunnel.'],
 ['pod-1','Paket 2 · Funkstille','Das erste Log ist bereits geborgen. Fliege über den zweiten Behälter.'],
 ['pod-2','Paket 3 · Letztes Licht','Sammle das letzte Log und prüfe die Peilung im Bordlogbuch.'],
 ['approach','Trianguliertes Wrack','Alle drei Logs sind geborgen. 5.000 km Anflug: J aktiviert den Hyperdrive.'],
 ['claim','Die Bergungscrew','Sera meldet sich beim Wrack. Teile die Fracht oder kämpfe darum.'],
 ['salvage','Nach dem Kampf','Die volle Fracht ist freigegeben. Fliege darüber und prüfe die Beute.'],
 ['cache-0','Verborgene Fracht · Träger','Ein versteckter Behälter am Trägerwrack.'],
 ['cache-1','Verborgene Fracht · Schlachtschiff','Ein versteckter Behälter zwischen den Bruchstücken.'],
 ['cache-2','Verborgene Fracht · Kreuzer','Ein versteckter Behälter am Kreuzerwrack.'],
 ['convoy','Notruf · Lantern','Entscheide, ob du den Prospektoren gegen zwei Piraten hilfst.'],
 ['feedback','Kampf-Rückmeldung','Schild- und Hüllentreffer, Schildausfall und leere Waffenenergie direkt auslösen.'],
];
const wait=async test=>{const until=Date.now()+120000;while(!test()){if(Date.now()>until)throw Error('Das Laden dauert zu lange. Bitte neu laden.');await new Promise(resolve=>setTimeout(resolve,70));}};
let rt,baseline,normalNodes,asteroidState,currentScene,sound=false,busy=true,targetShip;
const warmedScenes=new Set();
const copy=value=>JSON.parse(JSON.stringify(value));
const closeWindows=()=>{
 rt.ui.adventureQueue=[];rt.ui.closeAdventure(false);rt.ui.hidePause();rt.ui.hideMap();rt.ui.hideShipMenu();rt.ui.hideStory(false);rt.ui.dismissStory();rt.ui.clearPilotLine();rt.ui.clearStatusMessages();
 rt.storyLineUntil=undefined;rt.pendingStoryConversations=[];rt.ui.storyDismissed=false;
};
function reset(){
 closeWindows();rt.ui.hideDock();rt.ui.showHud();rt.renderer.setCockpitVisible(true);rt.audio.setStationMode(false);rt.input.onBlur();
 for(const ship of rt.ships)for(const {item}of ship.equipmentRecords??[])forgetEquipmentDefinition(item.id);
 rt.ships=[];targetShip=undefined;rt.renderer.syncShips([]);
 for(const p of rt.projectiles)p.life=0;for(const p of rt.pickups)p.life=0;rt.cleanupEntities();rt.renderer.syncProjectiles([],rt.projStore);rt.renderer.syncPickups([],rt.pickupStore);rt.renderer.clearDrones();
 rt.renderer.clearEffects();rt.ui.clearSpacePickups();
 for(const id of [...rt.renderer.combatLootMeshes.keys()])rt.renderer.removeCombatLootNode(id);
 rt.save=hydrateSave(copy(baseline));delete rt.save.player.prevPosition;delete rt.save.player.prevRotation;rt.save.settings.easyMode=false;rt.save.settings.music=sound ? 0.34 : 0;rt.save.settings.effects=sound ? 0.68 : 0;rt.ui.attachSave(rt.save);rt.audio.setVolumes(sound ? 0.34 : 0,sound ? 0.68 : 0);
 rt.wreckNodes.splice(0,rt.wreckNodes.length,...normalNodes.map(n=>n.node));for(const n of normalNodes){n.node.remaining=n.remaining;n.node.scanned=n.scanned;}
 for(const n of asteroidState){n.node.remaining=n.remaining;n.node.scanned=n.scanned;}
 rt.explorationSupplied=false;rt.explorationTickAt=0;rt.explorationOfferAt=0;rt.convoyOfferAt=0;rt.freighterModelWarmed=false;rt.lootRetryAt=new WeakMap();
 rt.deathTimer=0;rt.autopilot=false;rt.galaxyJump=null;rt.hyperdriveWaypoint=undefined;rt.hyperdriveFx='none';rt.pendingDroneDeparture=null;rt.playerDocking=undefined;rt.departureClearance=undefined;rt.armedJumpPointId=null;rt.afterburning=false;rt.playerShieldDelay=0;rt.shieldBreakFeedbackAt=undefined;rt.targetShieldFeedbackAt=undefined;
 rt.mountFireAt={};rt.groupFireAt=undefined;rt.groupFireHull=undefined;rt.gunCooldown=0;rt.launcherReadyAt={};rt.capacitorFeedbackAt=undefined;rt.ownMonitorStatus=undefined;rt.monitorStatus=undefined;rt.ownMonitorStatusUntil=rt.monitorStatusUntil=0;
 rt._statsDirty=true;rt.save.player.dockedAt=undefined;rt.save.player.cargo={};rt.save.player.credits=20000;rt.save.player.fuel=100;rt.save.player.throttle=0;rt.save.player.currentTargetId=undefined;rt.save.player.navTargetId='shardbelt';rt.save.player.mode='combat';
 rt.save.player.velocity.fill(0);rt.save.player.angularVelocity.fill(0);const stats=rt.playerStats();rt.save.player.hull=stats.hull;rt.save.player.shield=stats.shield;rt.save.player.energy=stats.energyCapacity;
 rt.nextEncounterAt=Infinity;rt.obstacleGridBuiltAt=-Infinity;rt.simAccumulator=0;
}
function seedLogs(count){
 const q=rt.save.world.exploration;q.recovered=FREIGHTER_LOGS.slice(0,count).map(log=>log.id);q.finale=count===3?'available':'locked';
 for(const id of q.recovered)delete rt.save.world.combatWrecks[explorationLootId(id)];
}
function restoreCrates(){
 rt.initializeExploration();
 for(const wreck of Object.values(rt.save.world.combatWrecks))if(!rt.wreckNodes.some(n=>n.id===wreck.id)){
  const node=combatWreckNode(wreck);rt.wreckNodes.push(node);rt.renderer.addCombatLootNode(node);
 }
}
function place(position,target){
 const p=rt.save.player;p.position.splice(0,3,...position);p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;
 const direction=new THREE.Vector3(...target).sub(new THREE.Vector3(...position)).normalize();p.rotation.splice(0,4,...new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction).toArray());
 rt.resetPlayerInterpolation(true);rt.updateActiveInstance(true);rt.obstacleGridBuiltAt=-Infinity;
}
function setLootTarget(id){const node=rt.wreckNodes.find(n=>n.id===id);if(node)rt.applyTarget({kind:'wreck',id,name:node.name,position:node.position,combatLoot:true});}
function approachCrate(def,preferred){
 place(def.position,def.position.map((v,i)=>v+(i===2?-1:0)));
 const obstacles=rt.activeFieldObstacles(),center=new THREE.Vector3(...def.position),directions=[preferred,[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[1,1,1],[-1,1,-1],[1,-1,-1],[-1,-1,1]],contact={};
 for(const offset of directions){const from=center.clone().add(new THREE.Vector3(...offset).normalize().multiplyScalar(75));const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),center.clone().sub(from).normalize());
  if(obstacles.some(ob=>shipVsObstacle(from,rotation,'wayfarer',rt.playerHullScale(),ob,contact))||rt.lineBlocked(from,center,explorationLootId(def.id)))continue;
  place(from.toArray(),def.position);setLootTarget(explorationLootId(def.id));return;
 }
 throw Error('Kein freier Anflug auf diesen Behälter gefunden. Bitte einen anderen Fund wählen.');
}
function openMenu(){panel.hidden=false;toolbar.hidden=true;rt?.input.onBlur();rt?.ui.hidePause();feedbackControls.hidden=true;resume.disabled=!currentScene||busy;}
function leaveMenu(){if(busy||!currentScene)return;panel.hidden=true;toolbar.hidden=false;feedbackControls.hidden=currentScene!=='feedback';rt.input.onBlur();rt.simAccumulator=0;}
function fail(error){busy=false;status.textContent=error.message;for(const b of grid.querySelectorAll('button'))b.disabled=false;resume.disabled=!currentScene;window.discoveryReview.ready=false;window.discoveryReview.error=error.message;console.error(error);openMenu();}
async function loadScene(id){
 if(busy||!scenes.some(s=>s[0]===id))return;
 busy=true;window.discoveryReview.ready=false;window.discoveryReview.error=undefined;openMenu();status.textContent='Testszene wird vorbereitet …';for(const b of grid.querySelectorAll('button'))b.disabled=true;
 reset();currentScene=id;const index=id.startsWith('pod-')?Number(id.slice(4)):0;
 seedLogs(id==='approach'||id==='claim'||id==='salvage'?3:id.startsWith('pod-')?index:0);if(id==='salvage')rt.save.world.exploration.finale='won';restoreCrates();
 if(id==='trail'||id.startsWith('pod-'))approachCrate(FREIGHTER_LOGS[index],index===1?[-1,0,0]:index===2?[0,-1,0]:[0,0,1]);
 else if(id.startsWith('cache-'))approachCrate(GRAVEYARD_CACHES[Number(id.slice(6))],[0,1,0]);
 else if(id==='approach'||id==='claim'||id==='salvage'){
  place(FREIGHTER_POSITION.map((v,i)=>v+(i===2?(id==='claim'?340:id==='salvage'?75:5000):0)),FREIGHTER_POSITION);setLootTarget(FREIGHTER_WRECK_ID);rt.renderer.preloadGlbShips(['atlas-freighter','wayfarer','talon']);
 }else if(id==='convoy')place(CONVOY_POSITION.map((v,i)=>v+(i===2?900:0)),CONVOY_POSITION);
 else{
  const center=FREIGHTER_POSITION.map((v,i)=>v+(i===0?16000:0));place(center,center.map((v,i)=>v-(i===2?300:0)));
  targetShip=rt.spawnShip('bounty',center.map((v,i)=>v-(i===2?300:0)),'review-training','Testziel',{tier:'rookie'},{hullId:'talon',faction:'pirates'});targetShip.poweredDown=true;targetShip.dark=false;targetShip.velocity.fill(0);targetShip.playerIdentified=true;targetShip.identifiedByPlayer=true;targetShip.scanned=true;targetShip.playerAwareness=targetShip.playerSensorAwareness=1;targetShip.nextLineAt=Infinity;rt.applyTarget({kind:'ship',id:targetShip.id,position:targetShip.position,name:targetShip.name});
 }
 if(id.startsWith('cache-')||id==='convoy')await rt.renderer.ensureGraveyardModels();
 rt.renderer.syncShips(rt.ships);await Promise.allSettled([...rt.renderer.glbShipLoading.values()]);rt.renderer.syncShips(rt.ships);
 rt.ui.showHud();rt.syncRender(0,performance.now());rt.renderer.updateCombatLootNodes();const warmKey=id.startsWith('cache-')||id==='convoy'?'graveyard':id==='trail'||id.startsWith('pod-')?'shardbelt':'open';if(!warmedScenes.has(warmKey)){await rt.renderer.prepareActiveScene({timeoutMs:20000});warmedScenes.add(warmKey);}
 status.textContent=scenes.find(s=>s[0]===id)[2];nextButton.hidden=!(id==='trail'||id.startsWith('pod-'));nextButton.textContent='Nächster Fund';toolbar.hidden=false;
 for(const b of grid.querySelectorAll('button'))b.disabled=false;
 const params=new URLSearchParams(location.search);params.set('scene',id);history.replaceState(null,'',`${location.pathname}?${params}`);
 busy=false;resume.disabled=false;window.discoveryReview.ready=true;window.discoveryReview.scene=id;leaveMenu();rt.explorationTickAt=0;rt.updateExploration();rt.ui.updateHud(rt.buildHudModel());
}
async function nextDiscovery(){
 if(busy)return;closeWindows();const log=FREIGHTER_LOGS.find(log=>!rt.save.world.exploration.recovered.includes(log.id));
 if(log){const index=FREIGHTER_LOGS.indexOf(log);approachCrate(log,index===1?[-1,0,0]:index===2?[0,-1,0]:[0,0,1]);}
 else{place(FREIGHTER_POSITION.map((v,i)=>v+(i===2?5000:0)),FREIGHTER_POSITION);setLootTarget(FREIGHTER_WRECK_ID);nextButton.hidden=true;}
 rt.explorationTickAt=0;rt.syncRender(0,performance.now());rt.ui.updateHud(rt.buildHudModel());
}
function feedback(kind){
 if(busy||currentScene!=='feedback')return;
 rt.ownMonitorStatus=undefined;rt.monitorStatus=undefined;rt.ownMonitorStatusUntil=rt.monitorStatusUntil=0;rt.ui.clearStatusMessages();
 const p=rt.save.player,stats=rt.playerStats();p.hull=stats.hull;p.shield=stats.shield;p.energy=stats.energyCapacity;rt.deathTimer=0;rt.shieldBreakFeedbackAt=undefined;rt.targetShieldFeedbackAt=undefined;rt.capacitorFeedbackAt=undefined;
 if(kind==='shield')rt.damagePlayer(8,'test',false);
 if(kind==='hull'){p.shield=0;rt.damagePlayer(8,'test',false);}
 if(kind==='collapse'){p.shield=5;rt.damagePlayer(8,'test',false);}
 if(kind==='target'&&targetShip?.hull>0){targetShip.hull=targetShip.maxHull;targetShip.shield=5;rt.damageShip(targetShip,6,'player');}
 if(kind==='empty'){p.energy=0;rt.gunCooldown=0;rt.mountFireAt={};rt.fireMountedPlayerGuns();}
 rt.ui.updateHud(rt.buildHudModel());
}
grid.innerHTML=scenes.map(([id,title,description])=>`<button data-scene="${id}" disabled><b>${title}</b><span>${description}</span></button>`).join('');
window.discoveryReview={ready:false,scene:null,select:id=>loadScene(id).catch(fail),next:()=>nextDiscovery().catch(fail),feedback,snapshot:()=>rt?{scene:currentScene,recovered:[...rt.save.world.exploration.recovered],finale:rt.save.world.exploration.finale,convoy:rt.save.world.exploration.convoy,muted:!sound,paused:!panel.hidden}:null};
document.querySelector('#review-menu').onclick=openMenu;resume.onclick=leaveMenu;document.querySelector('#review-restart').onclick=()=>void loadScene(currentScene).catch(fail);nextButton.onclick=()=>void nextDiscovery().catch(fail);
grid.onclick=e=>{const b=e.target.closest('[data-scene]');if(b&&!b.disabled)void loadScene(b.dataset.scene).catch(fail);};
feedbackControls.onclick=e=>{const b=e.target.closest('[data-feedback]');if(b)feedback(b.dataset.feedback);};
soundButton.onclick=async()=>{sound=!sound;rt.audio.setVolumes(sound ? 0.34 : 0,sound ? 0.68 : 0);rt.save.settings.music=sound ? 0.34 : 0;rt.save.settings.effects=sound ? 0.68 : 0;if(sound)await rt.audio.enable();soundButton.textContent=sound?'Ton: an':'Ton: aus';soundButton.setAttribute('aria-pressed',String(sound));};
window.addEventListener('keydown',e=>{if(e.code!=='Escape'||rt?.ui.adventure)return;e.preventDefault();e.stopImmediatePropagation();if(panel.hidden)openMenu();else leaveMenu();},true);
setInterval(()=>{if(rt&&!nextButton.hidden)nextButton.textContent=FREIGHTER_LOGS.every(p=>rt.save.world.exploration.recovered.includes(p.id))?'Zum Wrack':'Nächster Fund';},750);
try{
 await import('/src/main.js');await wait(()=>window.__VOID_PRIVATEER__&&document.querySelector('[data-ui-command="new"]'));
 document.querySelector('[data-ui-command="new"]').click();await wait(()=>document.querySelector('[data-ui-command="skip-new-career"]'));document.querySelector('[data-ui-command="skip-new-career"]').click();
 await wait(()=>window.__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 rt=window.__VOID_PRIVATEER__.getRuntime();rt.audio.setVolumes(0,0);rt.persistSave=()=>true;
 rt.ui.actions.quitToTitle=openMenu;
 rt.recoverPlayer=()=>{rt.deathTimer=0;openMenu();resume.disabled=true;status.textContent='Schiff zerstört. Wähle dieselbe Szene für einen neuen Versuch oder einen anderen Test.';};
 const modal=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(rt.ui),'isModalOpen').get;Object.defineProperty(rt.ui,'isModalOpen',{get(){return !panel.hidden||modal.call(this);}});
 for(const name of ['updateDynamicEncounters','updateBountySpawns','updateStationTraffic','updateCapitalTraffic','spawnInitialTraffic'])rt[name]=()=>{};
 await rt.launch();rt.ships=[];baseline=copy(rt.save);normalNodes=rt.wreckNodes.filter(n=>!n.combatLoot).map(node=>({node,remaining:node.remaining,scanned:node.scanned}));asteroidState=rt.asteroids.map(node=>({node,remaining:node.remaining,scanned:node.scanned}));
 busy=false;window.discoveryReview.ready=true;status.textContent='Wähle eine Testszene. Jeder Einstieg kann beliebig neu gestartet werden.';for(const b of grid.querySelectorAll('button'))b.disabled=false;
 const initial=new URLSearchParams(location.search).get('scene');if(scenes.some(s=>s[0]===initial))await loadScene(initial);
}catch(error){fail(error);}
