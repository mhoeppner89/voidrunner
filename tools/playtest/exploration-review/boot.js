import * as THREE from '/vendor/three.module.min.js';
import {hydrateSave} from '/src/game/save.js';
import {combatWreckNode} from '/src/game/careerLoot.js';
import {forgetEquipmentDefinition} from '/src/game/equipmentCatalog.js';
import {shipVsObstacle} from '/src/game/shipCollision.js';
import {FREIGHTER_LOGS,GRAVEYARD_CACHES,FREIGHTER_POSITION,FREIGHTER_WRECK_ID,explorationLootId} from '/src/game/explorationData.js';
import {distressEnding,distressSetup,distressText,distressObjective} from '/src/game/distressData.js';
import {formatCredits} from '/src/game/random.js';
import {cargoFree} from '/src/game/economy.js';
const panel=document.querySelector('#discovery-review'),status=document.querySelector('#review-status'),grid=document.querySelector('#review-scenarios'),toolbar=document.querySelector('#review-toolbar'),resume=document.querySelector('#review-resume'),nextButton=document.querySelector('#review-next'),feedbackControls=document.querySelector('#feedback-controls'),soundButton=document.querySelector('#review-sound');
const statePanel=document.querySelector('#review-state-panel'),statePre=document.querySelector('#review-state'),stateButton=document.querySelector('#review-state-toggle'),commsButton=document.querySelector('#review-comms'),advanceButton=document.querySelector('#review-advance'),journalButton=document.querySelector('#review-journal');
const mode=window.__VR_REVIEW_MODE__==='distress'||new URLSearchParams(location.search).get('mode')==='distress'?'distress':'exploration';
const scenes=[
 ['distress-convoy-arrival','Notruf · Konvoi-Ankunft','Sprung bei 500 km: Der Kanal öffnet sich mit Lage und der Wahl „Ich gehe rein / Nicht meine Schlacht“.'],
 ['distress-wreck-offer','Notruf · Wrack-Ankunft','Sprung bei 500 km: Das Wrack meldet sich, dann die Wahl über Fracht und Rettungskapsel.'],
 ['distress-trap-arrival','Notruf · Täuschung-Ankunft','Sprung bei 500 km: Ein sauberer Notruf. Scannen, anfliegen oder weiterfliegen — die Raider warten auf die Antwort.'],
 ['distress-fuel-arrival','Notruf · Treibstoff-Ankunft','Sprung bei 500 km: Transferbetrag und Restreserve stehen vor der Entscheidung, 8 Einheiten gegen 1.200 cr.'],
 ['distress-disabled-arrival','Notruf · Havarie-Ankunft','Sprung bei 500 km: Ersatzteile, Drohne oder selbst rüber — die Wahl steht im Funk.'],
 ['distress-debris-offer','Notruf · Geleit-Ankunft','Sprung bei 500 km: Aufgabe, Sturmfenster, Risiko und Bezahlung — annehmen oder ablehnen.'],
 ['distress-jettison-arrival','Notruf · Fracht-Ankunft','Sprung bei 500 km: Drei Container treiben im Feld, zurückgeben oder behalten.'],
 ['distress-dispute-arrival','Notruf · Streit-Ankunft','Sprung bei 500 km: Zwei Crews, ein Wrack — verhandeln, teilen oder Partei ergreifen.'],
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
 ['distress-voice-a','Funkaufnahme · echter Konvoi','Ein echter Ruf nennt seinen Notfall beim Namen: zwei Piraten hängen an den Frachtern.'],
 ['distress-voice-b','Funkaufnahme · Täuschung (geliehener Ruf)','Nur die Falle greift in den gemeinsamen Pool — und nennt nie eine Ursache. Jede dieser Zeilen könnte auch ein echter Havarist senden.'],
 ['distress-voice-c','Funkaufnahme · echte Treibstoffnot','Eigener Text, wie bei jedem echten Ruf: Es fehlt Sprit. Niemand greift an.'],
 ['distress-voice-d','Funkaufnahme · echter Streit','Eigener Text: zwei Bergungscrews am selben Wrack, jede mit ihrer Version.'],
 ['distress-convoy-signal','Notruf · Konvoi · Funkaufnahme','Im Hyperdrive aufgefangen: Karte hält den Flug an. Signal verfolgen oder weiterfliegen — danach der Konvoi unter Beschuss.'],
 ['distress-convoy-alt-signal','Notruf · Konvoi · zweiter Anrufer','Ash Gambit statt Lantern: eigener Ruf, eigene Ankunft. Dieselbe Kategorie, ein anderer Sprecher.'],
 ['distress-fuel-alt-signal','Notruf · Treibstoff · zweiter Anrufer','Nettle statt Tallow. Der Ruf gehört zum Schiff, nicht zur Kategorie.'],
 ['distress-trap-alt-signal','Notruf · Täuschung · zweiter Anrufer','Vela statt Bright Mercy: ein getarnter Prospektor, wieder mit geliehenen Worten.'],
 ['distress-convoy-alt-arrival','Notruf · Konvoi-Ankunft · zweiter Anrufer','Ash Gambit empfängt dich mit seinem eigenen Satz — nicht mit Lanterns.'],
 ['distress-trap-alt-arrival','Notruf · Täuschung-Ankunft · zweiter Anrufer','Vela, der getarnte Prospektor: anderer Anrufer, dieselbe kalte Begrüßung.'],
 ['distress-convoy','Notruf · Konvoi (Nahaufnahme)','Nach dem Sprung: Zwei Prospektoren werden bereits beschossen. Greife ein oder fliege weiter.'],
 ['distress-convoy-partial','Notruf · Teilrettung (Nahaufnahme)','Ein Schiff ist verloren. Prüfe Zahlung und die verbleibenden Ziele.'],
 ['distress-convoy-rescued','Notruf · Konvoi gerettet','Raider ausgeschaltet. Zahlung, Logbuch und Folgen prüfen.'],
 ['distress-convoy-retaliation','Notruf · Gegenangriff (Nahaufnahme)','Ein Raider wird beschossen und bricht aus dem Konvoi aus. Prüfe Zielwechsel und Rückkehr.'],
 ['distress-wreck-signal','Notruf · Wrack · Funkaufnahme','Im Hyperdrive aufgefangen. Signal verfolgen oder weiterfliegen — danach meldet sich das Wrack.'],
 ['distress-wreck','Notruf · Wrack (Nahaufnahme)','Nach dem Sprung: Fracht und Rettungskapsel im zerstörten Frachter bergen.'],
 ['distress-wreck-ambush','Notruf · Rückkehrer (Nahaufnahme)','Die Angreifer sind zurück. Wrack bergen und Kampf bestehen.'],
 ['distress-trap-signal','Notruf · Täuschung · Funkaufnahme','Im Hyperdrive aufgefangen: ein sauberer Notruf. Verfolgen, anfliegen — und die Signatur prüfen.'],
 ['distress-trap','Notruf · Täuschung (Nahaufnahme)','Nach dem Sprung: Scan oder Annäherung deckt die Falle auf.'],
 ['distress-trap-exposed','Notruf · Falle offen','Die Raider sind enttarnt und greifen an.'],
 ['distress-fuel-signal','Notruf · Treibstoff · Funkaufnahme','Im Hyperdrive aufgefangen: Treibstoffnot. Verfolgen und die Reserve prüfen.'],
 ['distress-fuel-prepared','Notruf · Treibstoff (Nahaufnahme)','Nach dem Sprung: Genug Reserve für den Transfer. Betrag und Rest werden vorher angezeigt.'],
 ['distress-fuel-unprepared','Notruf · Ohne Reserve (Nahaufnahme)','Zu wenig Treibstoff: die Alternative wird klar erklärt.'],
 ['distress-disabled-signal','Notruf · Havarie · Funkaufnahme','Im Hyperdrive aufgefangen: Havarie. Verfolgen, dann mit Ersatzteilen helfen.'],
 ['distress-disabled-parts','Notruf · Ersatzteile (Nahaufnahme)','Nach dem Sprung: Zwei Maschinenteile an Bord. Übergabe prüfen.'],
 ['distress-disabled-crew','Notruf · Crew-Hilfe (Nahaufnahme)','Keine Teile und keine Drohne: langsame Crew-Reparatur anbieten.'],
 ['distress-debris-signal','Notruf · Geleit · Funkaufnahme','Im Hyperdrive aufgefangen: Crew im Trümmerfeld. Verfolgen, dann den Bojenkurs legen.'],
 ['distress-debris','Notruf · Eingeschlossen (Nahaufnahme)','Nach dem Sprung: Der Frachter steckt im Feld, sein Nav ist tot.'],
 ['distress-debris-route','Notruf · Bojenkurs','Angenommen: Die Bojen liegen voraus, der Frachter folgt deiner Spur.'],
 ['distress-debris-closing','Notruf · Aus der Ferne angenommen','Außerhalb der Übergabe angenommen: Der Frachter hält Position, die Sturm-Uhr steht bei 3:30 ab Übergabe.'],
 ['distress-debris-stray','Notruf · Kurs verlassen','Zu weit raus: Warnung, Treffer und der Schaden am Frachter.'],
 ['distress-debris-hit','Notruf · Frachter getroffen','Der Frachter hat Metall berührt; Hülle und Auszahlung prüfen.'],
 ['distress-debris-jump','Notruf · Sprungkurs','Am Sprungpunkt: acht Sekunden Spulen, der Sturm läuft.'],
 ['distress-debris-lost','Notruf · Verloren','Die Sonnenfront war schneller; Wrack und Logbuch prüfen.'],
 ['distress-jettison-signal','Notruf · Fracht · Funkaufnahme','Im Hyperdrive aufgefangen: drei ausgesetzte Container. Verfolgen und bergen.'],
 ['distress-jettison','Notruf · Fracht (Nahaufnahme)','Nach dem Sprung: Drei Container bergen: zurückgeben oder behalten.'],
 ['distress-jettison-full','Notruf · Voller Laderaum (Nahaufnahme)','Der Laderaum ist voll; die Bergung muss warten.'],
 ['distress-dispute-signal','Notruf · Streit · Funkaufnahme','Im Hyperdrive aufgefangen: zwei Crews am selben Wrack. Verfolgen und verhandeln.'],
 ['distress-dispute','Notruf · Streit (Nahaufnahme)','Nach dem Sprung: Zwei Crews, ein Wrack. Verhandeln oder Partei ergreifen.'],
 ['distress-wreck-stripped','Notruf · Wrack geplündert','Frachtraum leer, die Rettungskapsel bleibt bergbar.'],
 ['distress-wreck-survivor','Notruf · Kapsel geborgen','Überlebende als Missionsfracht; Andocken zahlt aus.'],
 ['distress-wreck-delivered','Notruf · Überlebende bezahlt','Kapsel abgeliefert und Wrack geschlossen. Auszahlung prüfen.'],
 ['distress-trap-scanned','Notruf · Falle gescannt','Scan-Hinweis sichtbar, die Raider bleiben noch getarnt.'],
 ['distress-trap-cleared','Notruf · Falle geklärt','Raider ausgeschaltet. Folgen und Beute prüfen.'],
 ['distress-fuel-supplied','Notruf · Treibstoff geliefert','Transfer abgeschlossen. Resttreibstoff und Zahlung prüfen.'],
 ['distress-disabled-repaired','Notruf · Havarie repariert','Zielhülle wiederhergestellt. Abschluss und Zahlung prüfen.'],
 ['distress-debris-enroute','Notruf · Kurs gesetzt','Der Frachter folgt dem freigegebenen Fluchtvektor.'],
 ['distress-debris-escaped','Notruf · Entkommen','Der Frachter hat das Feld verlassen. Abschluss prüfen.'],
 ['distress-jettison-ready','Notruf · Fracht an Bord','Container geborgen. Übergabe oder Behalten wählen.'],
 ['distress-jettison-returned','Notruf · Fracht zurück','Container übergeben. Zahlung und Laderaum prüfen.'],
 ['distress-jettison-kept','Notruf · Fracht behalten','Behalten gewählt. Bergungsrecht und Folgen prüfen.'],
 ['distress-dispute-negotiated','Notruf · Verhandelt','Split vereinbart. Zahlung und Wrackfreigabe prüfen.'],
 ['distress-convoy-rescued-alt','Notruf · Konvoi gerettet · zweiter Anrufer','Ash Gambit allein: Rettung, Zahlung und Abspann aus seinem Funk.'],
 ['distress-fuel-supplied-alt','Notruf · Treibstoff geliefert · zweiter Anrufer','Nettle statt Tallow: eigener Abschluss, eigene Dankesworte.'],
 ['distress-disabled-repaired-alt','Notruf · Havarie repariert · zweiter Anrufer','Calder statt Orchard Star: der Abschluss gehört dem Anrufer.'],
 ['distress-jettison-returned-alt','Notruf · Fracht zurück · zweiter Anrufer','Ember bekommt ihre zwei Kisten: andere Fracht, andere Worte.'],
 ['distress-dispute-negotiated-alt','Notruf · Verhandelt · zweiter Anrufer','Blue Hour und Rook einigen sich: eigener Split, eigener Abgang.'],
 ['distress-dispute-side-a','Notruf · Partei A','Eine Crew unterstützt, die andere ist jetzt feindlich.'],
 ['distress-dispute-resolved','Notruf · Streit geklärt','Gegner ausgeschaltet. Ausgang und Logbuch prüfen.'],
 ['distress-history','Folgen · Gemischtes Logbuch','Vier abgeschlossene Notrufe mit unterschiedlichen Ausgängen.'],
 ['distress-declined','Folgen · Abgelehnt','Ein abgelehnter Notruf bleibt als Eintrag im Bordlogbuch.'],
 ['distress-abandoned','Folgen · Abgebrochen','Ein abgebrochener Kontakt bleibt als Eintrag im Bordlogbuch.'],
 ['feedback','Kampf-Rückmeldung','Schild- und Hüllentreffer, Schildausfall und leere Waffenenergie direkt auslösen.'],
];
const wait=async test=>{const until=Date.now()+120000;while(!test()){if(Date.now()>until)throw Error('Das Laden dauert zu lange. Bitte neu laden.');await new Promise(resolve=>setTimeout(resolve,70));}};
let rt,baseline,normalNodes,asteroidState,currentScene,sound=false,busy=true,targetShip;
const reloadButton=document.querySelector('#review-reload');
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
function openMenu(){panel.hidden=false;toolbar.hidden=true;rt?.input.onBlur();rt?.ui.hidePause();if(feedbackControls)feedbackControls.hidden=true;if(statePanel)statePanel.hidden=true;stateButton?.setAttribute('aria-pressed','false');resume.disabled=!currentScene||busy;}
function leaveMenu(){if(busy||!currentScene)return;panel.hidden=true;toolbar.hidden=false;feedbackControls.hidden=currentScene!=='feedback';rt.input.onBlur();rt.simAccumulator=0;}
function fail(error){busy=false;status.textContent=error.message;for(const b of grid.querySelectorAll('button'))b.disabled=false;resume.disabled=!currentScene;window.discoveryReview.ready=false;window.discoveryReview.error=error.message;console.error(error);openMenu();}
const distressScenes={
 'distress-convoy-arrival':['convoy',0,{phase:'discovered',distance:500}],
 'distress-trap-arrival':['trap',0,{phase:'discovered',distance:500}],
 'distress-fuel-arrival':['fuel',0,{phase:'discovered',distance:500,fuel:80}],
 'distress-disabled-arrival':['disabled',0,{phase:'discovered',distance:500,parts:2}],
 'distress-jettison-arrival':['jettison',0,{phase:'discovered',distance:500}],
 'distress-dispute-arrival':['dispute',0,{phase:'discovered',distance:500}],
 'distress-voice-a':['convoy',0,{phase:'signal',distance:6800,pickup:true,intercept:7}],
 'distress-voice-b':['trap',0,{phase:'signal',distance:6800,pickup:true,intercept:7}],
 'distress-voice-c':['fuel',0,{phase:'signal',distance:6800,pickup:true,intercept:7}],
 'distress-voice-d':['dispute',0,{phase:'signal',distance:6800,pickup:true,intercept:12}],
 'distress-convoy-signal':['convoy',0,{phase:'signal',distance:6800,pickup:true,intercept:0}],
 'distress-convoy-alt-signal':['convoy',1,{phase:'signal',distance:6800,pickup:true,intercept:0}],
 'distress-fuel-alt-signal':['fuel',1,{phase:'signal',distance:6800,pickup:true,intercept:3}],
 'distress-trap-alt-signal':['trap',1,{phase:'signal',distance:6800,pickup:true,intercept:3}],
 'distress-convoy-alt-arrival':['convoy',1,{phase:'discovered',distance:500}],
 'distress-trap-alt-arrival':['trap',1,{phase:'discovered',distance:500}],
 'distress-convoy':['convoy',0,{phase:'discovered',distance:620}],
 'distress-convoy-partial':['convoy',0,{phase:'involved',distance:620}],
 'distress-convoy-rescued':['convoy',0,{phase:'discovered',distance:620}],
 'distress-convoy-rescued-alt':['convoy',1,{phase:'discovered',distance:620}],
 'distress-convoy-retaliation':['convoy',0,{phase:'involved',distance:620}],
 'distress-wreck-signal':['wreck',0,{phase:'signal',distance:6800,pickup:true,intercept:3}],
 'distress-wreck':['wreck',0,{phase:'discovered',distance:620}],
 'distress-wreck-offer':['wreck',0,{phase:'discovered',distance:320}],
 'distress-wreck-ambush':['wreck',1,{phase:'involved',distance:620}],
 'distress-wreck-stripped':['wreck',0,{phase:'discovered',distance:620}],
 'distress-wreck-survivor':['wreck',0,{phase:'discovered',distance:620}],
 'distress-wreck-delivered':['wreck',0,{phase:'discovered',distance:620}],
 'distress-trap-signal':['trap',0,{phase:'signal',distance:6800,pickup:true,intercept:7}],
 'distress-trap':['trap',0,{phase:'discovered',distance:420}],
 'distress-trap-scanned':['trap',0,{phase:'discovered',distance:420}],
 'distress-trap-exposed':['trap',0,{phase:'discovered',distance:420,exposed:true}],
 'distress-trap-cleared':['trap',0,{phase:'discovered',distance:420,exposed:true}],
 'distress-fuel-signal':['fuel',0,{phase:'signal',distance:6800,pickup:true,intercept:10}],
 'distress-fuel-prepared':['fuel',0,{phase:'discovered',distance:320,fuel:80}],
 'distress-fuel-unprepared':['fuel',0,{phase:'discovered',distance:320,fuel:5}],
 'distress-fuel-supplied':['fuel',0,{phase:'discovered',distance:320,fuel:80}],
 'distress-fuel-supplied-alt':['fuel',1,{phase:'discovered',distance:320,fuel:80}],
 'distress-disabled-signal':['disabled',0,{phase:'signal',distance:6800,pickup:true,intercept:12}],
 'distress-disabled-parts':['disabled',0,{phase:'discovered',distance:320,parts:2}],
 'distress-disabled-crew':['disabled',0,{phase:'discovered',distance:320,parts:0}],
 'distress-disabled-repaired':['disabled',0,{phase:'discovered',distance:320,parts:0}],
 'distress-disabled-repaired-alt':['disabled',1,{phase:'discovered',distance:320,parts:1}],
 'distress-debris-signal':['debris',0,{phase:'signal',distance:6800,pickup:true,intercept:5}],
 'distress-debris':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-offer':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-closing':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-enroute':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-escaped':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-route':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-stray':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-hit':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-jump':['debris',0,{phase:'discovered',distance:380}],
 'distress-debris-lost':['debris',0,{phase:'discovered',distance:380}],
 'distress-jettison-signal':['jettison',0,{phase:'signal',distance:6800,pickup:true,intercept:9}],
 'distress-jettison':['jettison',0,{phase:'discovered',distance:520}],
 'distress-jettison-full':['jettison',0,{phase:'discovered',distance:520,cargo:{water:999}}],
 'distress-jettison-ready':['jettison',0,{phase:'discovered',distance:520}],
 'distress-jettison-returned':['jettison',0,{phase:'discovered',distance:520}],
 'distress-jettison-returned-alt':['jettison',1,{phase:'discovered',distance:520}],
 'distress-jettison-kept':['jettison',0,{phase:'discovered',distance:520}],
 'distress-dispute-signal':['dispute',0,{phase:'signal',distance:6800,pickup:true,intercept:14}],
 'distress-dispute':['dispute',0,{phase:'discovered',distance:520}],
 'distress-dispute-negotiated':['dispute',0,{phase:'discovered',distance:520}],
 'distress-dispute-negotiated-alt':['dispute',1,{phase:'discovered',distance:520}],
 'distress-dispute-side-a':['dispute',0,{phase:'discovered',distance:520}],
 'distress-dispute-resolved':['dispute',0,{phase:'discovered',distance:520}],
};
const noComms=new Set([
 'distress-convoy-arrival','distress-trap-arrival','distress-fuel-arrival','distress-disabled-arrival','distress-jettison-arrival','distress-dispute-arrival',
 'distress-voice-a','distress-voice-b','distress-voice-c','distress-voice-d',
 'distress-convoy-alt-signal','distress-fuel-alt-signal','distress-trap-alt-signal',
 'distress-convoy-signal','distress-disabled-signal','distress-wreck-signal','distress-trap-signal',
 'distress-debris-offer','distress-wreck-offer',
 'distress-fuel-signal','distress-debris-signal','distress-jettison-signal','distress-dispute-signal',
 'distress-convoy','distress-convoy-partial','distress-convoy-rescued','distress-convoy-retaliation',
 'distress-wreck-ambush','distress-wreck-delivered','distress-trap-exposed','distress-trap-cleared',
 'distress-fuel-supplied','distress-disabled-repaired', 'distress-debris-enroute','distress-debris-escaped','distress-debris-route','distress-debris-closing','distress-debris-stray','distress-debris-hit','distress-debris-jump','distress-debris-lost',
 'distress-jettison-returned','distress-jettison-kept','distress-dispute-negotiated','distress-dispute-side-a',
 'distress-convoy-rescued-alt','distress-fuel-supplied-alt','distress-disabled-repaired-alt',
 'distress-jettison-returned-alt','distress-dispute-negotiated-alt',
 'distress-dispute-resolved','distress-declined','distress-abandoned','distress-history',
]);
const eventActors=(active,role)=>rt.ships.filter(ship=>ship.distressEventId===active.id&&ship.hull>0&&(!role||ship.distressRole===role));
const eventWreckRecords=active=>Object.values(rt.save.world.combatWrecks??{}).filter(wreck=>wreck.distressEventId===active.id);
function emptyEventWrecks(active){
 for(const wreck of eventWreckRecords(active)){
  wreck.contents=[];
  const node=rt.wreckNodes.find(entry=>entry.id===wreck.id);
  if(node)node.remaining=0;
 }
}
function killEventRaiders(active){
 for(const ship of eventActors(active,'pirate')){ship.hull=0;rt.onDistressActorDefeated(ship);}
}
function killHostileEventActors(active){
 for(const ship of rt.ships.filter(entry=>entry.distressEventId===active.id&&entry.hull>0&&entry.hostile)){
  ship.hull=0;rt.onDistressActorDefeated(ship);
 }
}
function addContainerCargo(active){
 const setupData=distressSetup(active.variant,active.setup),cargo={...(rt.save.player.cargo??{})};
 for(const entry of setupData.containers??[])cargo[entry.commodity]=(cargo[entry.commodity]??0)+entry.quantity;
 rt.save.player.cargo=cargo;
}
function prepareDistressScene(id){
 if(id==='distress-history'){
  const now=rt.save.world.time;
  rt.save.world.distress.active=null;
  rt.save.world.distress.nextAt=now+420;
  rt.save.world.distress.history=[
   {id:'review-convoy',variant:'convoy',setup:0,outcome:'rescued',at:now-90,reward:4000},
   {id:'review-trap',variant:'trap',setup:0,outcome:'fought-off',at:now-210,reward:0},
   {id:'review-wreck',variant:'wreck',setup:1,outcome:'salvaged',at:now-330,reward:0},
   {id:'review-fuel',variant:'fuel',setup:0,outcome:'supplied',at:now-450,reward:900},
  ];
  rt.ui.shipMenuTab='journal';rt.ui.showShipMenu();
  return 'history';
 }
 if(id==='distress-declined'||id==='distress-abandoned'){
  rt.save.world.distress.active=null;
  rt.save.world.distress.nextAt=rt.save.world.time+420;
  rt.save.world.distress.history=[{id:'distress-review-history',variant:id==='distress-declined'?'fuel':'debris',setup:0,outcome:id==='distress-declined'?'declined':'withdrawn',at:rt.save.world.time-120,reward:0}];
  rt.ui.shipMenuTab='journal';rt.ui.showShipMenu();
  return 'open';
 }
 const [variant,setup,options]=distressScenes[id]??[];
 if(!variant)return undefined;
 // Pickup scenes are the real entry point now: the call is caught on a
 // hyperdrive leg in open space, never beside a station. Put the ship far out
 // along a clear vector and run the drive before the card opens.
 const pickup=Boolean(options?.pickup);
 if(pickup){
  place([0,2400,-360000],[0,2400,-360001]);
  rt.autopilot=true;rt.hyperdriveFx='active';rt.hyperdriveSpoolStartedAt=rt.save.world.time-3;
  rt.save.player.throttle=1;rt.save.player.navTargetId='shardbelt';
 }
 const created=rt.debugStartDistress(variant,setup,options);
 if(!created)throw Error('Notruf konnte nicht gestartet werden.'); const active=rt.save.world.distress.active;
 // The offer panel opens itself when the pilot is in comms range. Every other
 // scene wants the world view, not the card, so stamp the offer as taken.
 // Arrival scenes keep the stamp clear: their whole point is that the briefing
 // opens on its own the moment the drop lands in comms range. They also mark
 // the call as followed, because that is the only way a pilot ever arrives at
 // one: the pickup card already carried the transmission.
 if(!/-(?:arrival|offer)$/.test(id)&&!pickup)active.progress.briefedAt=rt.save.world.time+1e-6;
 if(/-(?:arrival|offer)$/.test(id))active.progress.pickupFollowed=true;

 if(id==='distress-disabled-crew'){
  for(const unit of Object.values(rt.save.player.droneFleet?.unitsById??{}))if(unit.type==='repair'){unit.state='destroyed';unit.hull=0;}
 }
 if(options?.phase!=='signal')place([active.position[0],active.position[1],active.position[2]+(/(?:arrival|offer)$/.test(id)?500:320)],active.position);
 rt.save.player.currentTargetId=active.id;
 rt.distressTickAt=0;rt.updateDistress();
 if(id==='distress-convoy-retaliation'){
  const raider=rt.ships.find(ship=>ship.distressEventId===active.id&&ship.distressRole==='pirate');
  if(raider){rt.damageShip(raider,6,'player',raider.position,{id:'pulse'});rt.distressTickAt=0;rt.updateDistress();}
 }
 if(id==='distress-convoy-partial'){
  const victim=rt.ships.find(ship=>ship.distressEventId===active.id&&ship.distressRole!=='pirate');
  if(victim){victim.hull=0;rt.onDistressActorDefeated(victim);rt.distressTickAt=0;rt.updateDistress();}
 }
 if(id==='distress-convoy-rescued'||id==='distress-convoy-rescued-alt'){
  rt.chooseDistress('help');killEventRaiders(active);rt.distressTickAt=0;rt.updateDistress();
 }
 if(id==='distress-wreck-ambush'){
  const current=rt.save.world.distress.active;
  // ambushAt=0 is the "not scheduled" sentinel; a zero here never spawns.
  // Review scenes start at world time 0, so keep the deadline truthy.
  if(current){current.progress.ambushAt=rt.save.world.time-1;rt.distressTickAt=0;rt.updateDistress();}
 }
 if(id==='distress-wreck-stripped')emptyEventWrecks(active);
 if(id==='distress-wreck-survivor'||id==='distress-wreck-delivered'){
  const pod=rt.pickups.find(pickup=>pickup.life>0&&pickup.distressEventId===active.id&&pickup.distressSurvivor);
  if(pod)rt.collectPickup(pod);
  if(id==='distress-wreck-delivered'){
   rt.settleDistressSurvivors?.();
   emptyEventWrecks(active);rt.distressTickAt=0;rt.updateDistress();
  }
 }
 if(id==='distress-trap-scanned'){
  active.progress.scanRevealed=true;
  rt.ui.pushSensor?.(distressText(distressSetup('trap',setup).clue),'danger',6200);
 }
 if(id==='distress-trap-cleared'){
  killEventRaiders(active);rt.distressTickAt=0;rt.updateDistress();
 }
 if(id==='distress-fuel-supplied'||id==='distress-fuel-supplied-alt')rt.chooseDistress('transfer');
 if(id==='distress-disabled-repaired'||id==='distress-disabled-repaired-alt'){
  const setupData=distressSetup(active.variant,active.setup);
  // Same closure the game uses, so the stand cannot drift from the caller voice.
  rt.finishDistress(active,'repaired',{reward:setupData.payment,...distressEnding(active,'repaired',{reward:formatCredits(setupData.payment)})});
 }
 const escortShip=()=>eventActors(active).find(entry=>entry.distressRole!=='pirate');
 const placeBehindRoute=()=>{
  const route=active.progress.route??[];if(route.length<2)return;
  const a=route[0],b=route[1];
  place([a[0]-(b[0]-a[0])*.16,a[1]+24,a[2]-(b[2]-a[2])*.16],b);
 };
 // The escort only starts on handover (within 700 of the transport) and the
 // corridor only arms once the pilot has flown the line, so every scene that
 // shows a running escort has to take those steps for real.
 const closeAndJoin=()=>{
  placeBehindRoute();
  if(active.progress.joinedAt)return;
  for(let step=0;step<90;step++)rt.updateSimulation(1/60,{});
 };
 const flyOnLine=point=>{place(point,[point[0],point[1],point[2]-1]);rt.updateDistressEscort(1/60);};
 if(id==='distress-debris-enroute'){
  rt.chooseDistress('escape');closeAndJoin();
 }
 if(id==='distress-debris-route'){
  rt.chooseDistress('escape');closeAndJoin();
 }
 if(id==='distress-debris-closing'){
  const ship=escortShip();
  // Signing from beyond the handover radius holds the transport where it is:
  // the storm clock stays at 3:30" after handover" and only starts once the
  // pilot actually comes alongside.
  if(ship)place([ship.position[0]-860,ship.position[1]+40,ship.position[2]-860],ship.position);
  rt.chooseDistress('escape');
  rt.updateDistressEscort(1/60);
 }
 if(id==='distress-debris-stray'){
  rt.chooseDistress('escape');
  const route=active.progress.route??[],a=route[1],b=route[2],mid=b??route.at(-1);
  closeAndJoin();
  // Fly the line once so the corridor is armed, then leave it.
  if(a)flyOnLine(a);
  if(mid&&a&&b){
   const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1;
   place([mid[0]-dz/len*420,mid[1]+60,mid[2]+dx/len*420],mid);
  }
  // Let the grace pass and the delayed transport hit land, so the scene shows
  // the consequence rather than only the warning copy.
  for(let step=0;step<200;step++)rt.updateSimulation(1/60,{});
  const ship=escortShip();
  if(ship){
   ship.position.splice(0,3,rt.save.player.position[0]+20,rt.save.player.position[1],rt.save.player.position[2]+20);
   // The transport's shield would soak the first hits; drop it so the review
   // shows the hull consequence on the monitor.
   ship.shield=0;ship.shieldDelay=6;
  }
  for(let step=0;step<200;step++)rt.updateSimulation(1/60,{});
 }
 if(id==='distress-debris-hit'){
  rt.chooseDistress('escape');closeAndJoin();
  const ship=escortShip();
  if(ship){ship.hull=Math.max(1,Math.round(ship.maxHull*.32));active.progress.escortHull=ship.hull/ship.maxHull;}
  active.progress.transportLine=true;
  rt.ui.pushSensor?.(distressText(['Wir haben Metall berührt. Halt die Linie!','We clipped metal. Hold the line!']),'danger',6200);
  rt.setDistressMonitor(active);
 }
 if(id==='distress-debris-jump'){
  rt.chooseDistress('escape');
  const route=active.progress.route??[],jump=route.at(-1),ship=escortShip();
  if(jump&&ship){
   ship.position.splice(0,3,...jump);
   if(ship.prevPosition?.length===3)ship.prevPosition.splice(0,3,...jump);
   place([jump[0]+220,jump[1]+40,jump[2]+220],jump);
   active.progress.burstAt=rt.save.world.time+26;
   rt.updateDistressEscort(1/60);
  }
 }
 if(id==='distress-debris-lost'){
  rt.chooseDistress('escape');
  const ship=escortShip();
  if(ship){
   place([ship.position[0]+140,ship.position[1]+40,ship.position[2]+300],ship.position);
   active.progress.burstAt=rt.save.world.time-1;
   rt.updateDistressEscort(1/60);
  }
 }
 if(id==='distress-debris-escaped'){
  rt.chooseDistress('escape');
  const jump=active.progress.route?.at(-1),ship=escortShip();
  if(jump&&ship){
   ship.position.splice(0,3,...jump);
   if(ship.prevPosition?.length===3)ship.prevPosition.splice(0,3,...jump);
   place([jump[0]+220,jump[1]+40,jump[2]+220],jump);
   active.progress.jumpAt=rt.save.world.time-9;
   rt.updateDistressEscort(1/60);
  }
 }
 if(id==='distress-jettison-ready'){
  rt.chooseDistress('recover');addContainerCargo(active);emptyEventWrecks(active);
 }
 if(id==='distress-jettison-returned'||id==='distress-jettison-returned-alt'){
  addContainerCargo(active);rt.chooseDistress('handover');
 }
 if(id==='distress-jettison-kept'){
  addContainerCargo(active);rt.chooseDistress('keep');emptyEventWrecks(active);rt.distressTickAt=0;rt.updateDistress();
 }
 if(id==='distress-dispute-negotiated'||id==='distress-dispute-negotiated-alt')rt.chooseDistress('negotiate');
 if(id==='distress-dispute-side-a')rt.chooseDistress('side-a');
 if(id==='distress-dispute-resolved'){
  rt.chooseDistress('side-a');killHostileEventActors(active);rt.distressTickAt=0;rt.updateDistress();
 }
 if(!noComms.has(id))rt.distressJournalAction('answer');
 return 'open';
}
async function reloadScene(){
 if(busy||!currentScene)return;
 busy=true;window.discoveryReview.ready=false;status.textContent='Gespeichert und neu geladen …';
 try{
  closeWindows();
  for(const pickup of rt.pickups)pickup.life=0;
  for(const projectile of rt.projectiles)projectile.life=0;
  rt.cleanupEntities?.();
  rt.renderer.syncProjectiles([],rt.projStore);rt.renderer.syncPickups([],rt.pickupStore);
  const loaded=hydrateSave(copy(rt.save));delete loaded.player.prevPosition;delete loaded.player.prevRotation;
  rt.save=loaded;rt.ui.attachSave(loaded);
  rt.ships=[];rt.pickups=[];rt.projectiles=[];rt.entityCounter=0;rt.projectileCounter=0;rt.pickupCounter=0;
  rt.renderer.syncShips([]);
  for(const id of [...rt.renderer.combatLootMeshes.keys()])rt.renderer.removeCombatLootNode(id);
  rt.wreckNodes.splice(0,rt.wreckNodes.length,...normalNodes.map(n=>n.node));
  for(const wreck of Object.values(loaded.world.combatWrecks??{}))if(wreck.distressEventId){const node=combatWreckNode(wreck);rt.wreckNodes.push(node);rt.renderer.addCombatLootNode(node);}
  rt.explorationSupplied=false;rt.distressTickAt=0;rt.explorationTickAt=0;rt.nextEncounterAt=Infinity;
  rt.updateDistress();rt.updateExploration();
  rt.renderer.syncShips(rt.ships);rt.renderer.updateCombatLootNodes?.();rt.ui.showHud();rt.syncRender(0,performance.now());rt.ui.updateHud(rt.buildHudModel());
  status.textContent='Gespeichert und neu geladen. Die Szene kann weiter geprüft werden.';
 }catch(error){fail(error);return;}
 busy=false;window.discoveryReview.ready=true;
}
const sceneAliases={'distress-signal':'distress-convoy-signal','distress-signal-disabled':'distress-disabled-signal'};
async function loadScene(requested){
 const id=sceneAliases[requested]??requested;
 if(busy||!visibleScenes.some(s=>s[0]===id))return;
 busy=true;window.discoveryReview.ready=false;window.discoveryReview.error=undefined;openMenu();status.textContent='Testszene wird vorbereitet …';for(const b of grid.querySelectorAll('button'))b.disabled=true;
 reset();currentScene=id;const index=id.startsWith('pod-')?Number(id.slice(4)):0;
 seedLogs(id==='approach'||id==='claim'||id==='salvage'?3:id.startsWith('pod-')?index:0);if(id==='salvage')rt.save.world.exploration.finale='won';restoreCrates();
 if(id==='trail'||id.startsWith('pod-'))approachCrate(FREIGHTER_LOGS[index],index===1?[-1,0,0]:index===2?[0,-1,0]:[0,0,1]);
 else if(id.startsWith('cache-'))approachCrate(GRAVEYARD_CACHES[Number(id.slice(6))],[0,1,0]);
 else if(id==='approach'||id==='claim'||id==='salvage'){
  place(FREIGHTER_POSITION.map((v,i)=>v+(i===2?(id==='claim'?340:id==='salvage'?75:5000):0)),FREIGHTER_POSITION);setLootTarget(FREIGHTER_WRECK_ID);rt.renderer.preloadGlbShips(['atlas-freighter','wayfarer','talon']);
 } else if(id.startsWith('distress-'))prepareDistressScene(id);
 else{
  const center=FREIGHTER_POSITION.map((v,i)=>v+(i===0?16000:0));place(center,center.map((v,i)=>v-(i===2?300:0)));
  targetShip=rt.spawnShip('bounty',center.map((v,i)=>v-(i===2?300:0)),'review-training','Testziel',{tier:'rookie'},{hullId:'talon',faction:'pirates'});targetShip.poweredDown=true;targetShip.dark=false;targetShip.velocity.fill(0);targetShip.playerIdentified=true;targetShip.identifiedByPlayer=true;targetShip.scanned=true;targetShip.playerAwareness=targetShip.playerSensorAwareness=1;targetShip.nextLineAt=Infinity;rt.applyTarget({kind:'ship',id:targetShip.id,position:targetShip.position,name:targetShip.name});
 }
 if(id.startsWith('cache-')||id.startsWith('distress-'))await rt.renderer.ensureGraveyardModels();
 rt.renderer.syncShips(rt.ships);await Promise.allSettled([...rt.renderer.glbShipLoading.values()]);rt.renderer.syncShips(rt.ships);
 rt.ui.showHud();rt.syncRender(0,performance.now());rt.renderer.updateCombatLootNodes();const warmKey=id.startsWith('cache-')||id.startsWith('distress-')?'graveyard':id==='trail'||id.startsWith('pod-')?'shardbelt':'open';if(!warmedScenes.has(warmKey)){await rt.renderer.prepareActiveScene({timeoutMs:20000});warmedScenes.add(warmKey);}
 if(id.startsWith('distress-')&&!rt.ui.adventure)rt.ui.showHud();
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
function reviewState(){
 if(!rt)return {ready:false};
 const data=rt.save.world.distress??{},active=data.active??null,p=rt.save.player;
 let objective=null;
 if(active){try{objective=distressText(distressObjective(active,rt.save));}catch{}}
 return {
  scene:currentScene,
  phase:active?.phase??'—',
  variant:active?.variant??null,
  setup:active?.setup??null,
  caller:active?.caller??null,
  objective,
  credits:Math.round(p.credits??0),
  fuel:Math.round((p.fuel??0)*10)/10,
  hold:cargoFree(p),
  cargo:{...(p.cargo??{})},
  sealed:(p.sealedCargo??[]).map(item=>({label:item.label,units:item.units})),
  actors:active?rt.ships.filter(ship=>ship.distressEventId===active.id).map(ship=>({role:ship.distressRole,key:ship.distressActor,hull:Math.round(ship.hull),maxHull:Math.round(ship.maxHull),hostile:Boolean(ship.hostile),standingDown:Boolean(ship.standingDown),target:ship.distressTargetId??null,aggro:ship.distressAggroTargetId??null,aggroUntil:ship.distressAggroUntil?Math.round(ship.distressAggroUntil):null})):[],
  wrecks:active?Object.values(rt.save.world.combatWrecks??{}).filter(wreck=>wreck.distressEventId===active.id).map(wreck=>({name:wreck.name,contents:(wreck.contents??[]).reduce((total,entry)=>total+(entry.quantity??1),0)})):[],
  settlement:active?.settlement??null,
  history:(data.history??[]).slice(0,4).map(entry=>({variant:entry.variant,outcome:entry.outcome,reward:entry.reward})),
  distance:active?Math.round(Math.hypot(active.position[0]-p.position[0],active.position[1]-p.position[1],active.position[2]-p.position[2])):null,
  paused:!panel.hidden,
 };
}
function updateReviewState(){if(!statePre)return;try{statePre.textContent=JSON.stringify(reviewState(),null,2);}catch(error){statePre.textContent=String(error);}}
function openComms(){
 if(!rt||busy)return;
 if(!rt.save.world.distress?.active){status.textContent='Kein aktiver Notruf.';return;}
 const opened=rt.distressJournalAction('answer');
 status.textContent=opened?'Funk geöffnet.':'Funk nicht möglich: kein aktiver Notruf oder außerhalb der Antwortreichweite.';
 if(!opened)rt.ui.pushSensor?.(distressText(['Notruf zu schwach. Folge dem Signal im Logbuch.','Signal too weak. Follow it from the journal.']),'info',4200);
 updateReviewState();
}
function openJournal(){if(!rt||busy)return;closeWindows();rt.ui.shipMenuTab='journal';rt.ui.showShipMenu();rt.input.onBlur();}
function advanceReview(){
 if(!rt||busy)return;
 const before=rt.save.world.time;
 for(let index=0;index<600;index++)rt.updateSimulation(1/60,{});
 rt.simAccumulator=0;rt.syncRender(0,performance.now());rt.ui.updateHud(rt.buildHudModel());
 status.textContent=`10 s simuliert · Weltzeit +${Math.round(rt.save.world.time-before)} s`;
 updateReviewState();
}
function toggleReviewState(){if(!statePanel)return;statePanel.hidden=!statePanel.hidden;stateButton?.setAttribute('aria-pressed',String(!statePanel.hidden));if(!statePanel.hidden)updateReviewState();}
const distressOnly=new Set([
 'distress-convoy-arrival','distress-trap-arrival','distress-fuel-arrival','distress-disabled-arrival','distress-jettison-arrival','distress-dispute-arrival',
 'distress-convoy-rescued','distress-convoy-retaliation','distress-wreck-stripped','distress-wreck-survivor','distress-wreck-delivered',
 'distress-convoy-alt-signal','distress-fuel-alt-signal','distress-trap-alt-signal',
 'distress-convoy-alt-arrival','distress-trap-alt-arrival',
 'distress-disabled-signal','distress-wreck-signal','distress-wreck-offer','distress-trap-signal','distress-trap-scanned','distress-trap-cleared','distress-fuel-signal',
 'distress-fuel-supplied','distress-disabled-repaired','distress-debris-signal','distress-debris-enroute','distress-debris-offer','distress-debris-closing',
 'distress-debris-escaped','distress-debris-route','distress-debris-stray','distress-debris-hit',
 'distress-debris-jump','distress-debris-lost','distress-jettison-signal','distress-jettison-ready','distress-jettison-returned',
 'distress-jettison-kept','distress-dispute-signal','distress-dispute-negotiated','distress-dispute-side-a',
 'distress-convoy-rescued-alt','distress-fuel-supplied-alt','distress-disabled-repaired-alt',
 'distress-jettison-returned-alt','distress-dispute-negotiated-alt',
 'distress-dispute-resolved','distress-history',
]);
const visibleScenes=mode==='distress'?scenes.filter(([id])=>id.startsWith('distress-')):scenes.filter(([id])=>!distressOnly.has(id));
const sceneGroups={
 pickup:'Funkaufnahme im Hyperdrive',
 arrival:'Ankunft & Briefing',
 convoy:'Konvoi unter Beschuss',wreck:'Zerstörter Frachter',trap:'Getarnte Raider',fuel:'Treibstoffnot',
 disabled:'Havarie',debris:'Trümmerfeld',jettison:'Ausgesetzte Fracht',dispute:'Streit um Bergung',history:'Folgen & Journal',
};
const sceneGroup=id=>/-signal$|-voice-/.test(id)?sceneGroups.pickup:/-arrival$|-offer$/.test(id)?sceneGroups.arrival:sceneGroups[id.split('-')[1]]??sceneGroups.history;
const sceneButton=([id,title,description])=>`<button data-scene="${id}" disabled><b>${title}</b><span>${description}</span></button>`;
if(mode==='distress'){
 grid.innerHTML=Object.entries(sceneGroups).map(([,group])=>{
  const entries=visibleScenes.filter(([id])=>sceneGroup(id)===group);
  return entries.length?`<section class="review-group"><h2>${group}</h2><div class="review-row">${entries.map(sceneButton).join('')}</div></section>`:'';
 }).join('');
}else grid.innerHTML=visibleScenes.map(sceneButton).join('');window.discoveryReview={ready:false,scene:null,mode,select:id=>loadScene(id).catch(fail),next:()=>nextDiscovery().catch(fail),feedback,reload:()=>void reloadScene(),snapshot:()=>rt?{scene:currentScene,recovered:[...rt.save.world.exploration.recovered],finale:rt.save.world.exploration.finale,convoy:rt.save.world.exploration.convoy,distress:rt.save.world.distress?{active:rt.save.world.distress.active?{id:rt.save.world.distress.active.id,variant:rt.save.world.distress.active.variant,phase:rt.save.world.distress.active.phase}:null,history:rt.save.world.distress.history?.length??0}:null,muted:!sound,paused:!panel.hidden}:null,state:()=>reviewState()};
window.distressReview=window.discoveryReview;
document.querySelector('#review-menu').onclick=openMenu;resume.onclick=leaveMenu;document.querySelector('#review-restart').onclick=()=>void loadScene(currentScene).catch(fail);reloadButton.onclick=()=>void reloadScene();nextButton.onclick=()=>void nextDiscovery().catch(fail);
grid.onclick=e=>{const b=e.target.closest('[data-scene]');if(b&&!b.disabled)void loadScene(b.dataset.scene).catch(fail);};
feedbackControls.onclick=e=>{const b=e.target.closest('[data-feedback]');if(b)feedback(b.dataset.feedback);};
soundButton.onclick=async()=>{sound=!sound;rt.audio.setVolumes(sound ? 0.34 : 0,sound ? 0.68 : 0);rt.save.settings.music=sound ? 0.34 : 0;rt.save.settings.effects=sound ? 0.68 : 0;if(sound)await rt.audio.enable();soundButton.textContent=sound?'Ton: an':'Ton: aus';soundButton.setAttribute('aria-pressed',String(sound));};
window.addEventListener('keydown',e=>{if(e.code!=='Escape'||rt?.ui.adventure)return;e.preventDefault();e.stopImmediatePropagation();if(panel.hidden)openMenu();else leaveMenu();},true);
commsButton?.addEventListener('click',openComms);
advanceButton?.addEventListener('click',advanceReview);
journalButton?.addEventListener('click',openJournal);
stateButton?.addEventListener('click',toggleReviewState);
setInterval(()=>{if(rt&&!nextButton.hidden)nextButton.textContent=FREIGHTER_LOGS.every(p=>rt.save.world.exploration.recovered.includes(p.id))?'Zum Wrack':'Nächster Fund';},750);
setInterval(()=>{if(rt&&statePanel&&!statePanel.hidden)updateReviewState();},500);
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
 const requested=new URLSearchParams(location.search).get('scene'),initial=sceneAliases[requested]??requested;if(visibleScenes.some(s=>s[0]===initial))await loadScene(initial);
}catch(error){fail(error);}
