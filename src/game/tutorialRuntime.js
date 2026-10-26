import {shipVsObstacle,PLAYER_CONTACT_SCALE} from './shipCollision.js';
import {playerShipVariant} from './voxelModels.js';
import * as THREE from 'three';
import {LOCATIONS,COMMODITIES,hyperdriveArrivalRadius} from './data.js';
import {getTutorialQuest,isTutorialActive,isTutorialGuided,tutorialContentUnlocked,migrateTutorialCampaign,TUTORIAL_REQUIRED_SUPPLIES,TUTORIAL_MINING_CONTRACT_ID,TUTORIAL_MINING_QUANTITY,TUTORIAL_MINING_REWARD,tutorialMiningQuantity,TUTORIAL_MARA_CALL_MIN_COMBAT_VALUE} from './tutorialCampaign.js';
import {GRAVEYARD_MODEL_WRECKS,graveyardWreckInteriorAt} from './worldData.js';
import {loadoutFor,normalizeOutfitting} from './outfitting.js';
import {equipmentBaseId} from './equipmentCatalog.js';
import {createDroneUnit,DRONE_BAY_CAPACITY} from './droneData.js';
import {refreshMissionOffers} from './missions.js';
import {cargoFree} from './economy.js';
import {playerStrengthValue} from './playerStrength.js';
import {t} from './i18n.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const point=a=>new THREE.Vector3().fromArray(a);
const surveyIds=['concord-battleship-wreck','concord-frigate-beta-wreck','concord-cruiser-alpha-wreck','concord-cruiser-beta-wreck','concord-carrier-wreck'];
const rinSteps=new Set(['plot-vesper','flight-checks','fly-vesper','mine-shardbelt','return-mining','raider-standoff','defeat-raider','land-mining','salvage-black-box','black-box-fight','deliver-black-box']);
const paulSteps=new Set(['rescue-paul','talk-paul','survey-carrier','carrier-wait','hide-patrol','return-helix']);
const dockBriefings=Object.freeze({
    'launch-helix':['helix','cargo-ready'],
    'sell-supplies':['vesper','vesper-arrival'],
    'fit-upgrade':['vesper','reactor-gift'],
    'mining-contract':['vesper','reactor-ready'],
    'salvage-briefing':['vesper','mining-return'],
    'meet-cairn':[undefined,'mara-cairn'],
});
export const tutorialWreckPoint=(id,inside=false)=>{
    const wreck=GRAVEYARD_MODEL_WRECKS.find(w=>w.id===id);if(!wreck)return;
    const offset=inside&&wreck.interior?[...wreck.interior.center]:[0,0.3,0.55];
    return point(offset).multiplyScalar(wreck.scale).applyEuler(new THREE.Euler(...wreck.rotation)).add(point(wreck.local)).add(point(LOCATIONS['mourning-line'].position)).toArray();
};
const actorState=(q,ship)=>{q.flags['actor-'+ship.storyPersonId]=[ship.hull,ship.shield,Number(Boolean(ship.poweredDown))];};
const FIRST_STANDOFF_SECONDS=4;
export const SURVEY_VISIT_RADIUS=100;
export const SURVEY_JUMP_MIN_DISTANCE=2000;
const surveySteps=new Set(['survey-graveyard','survey-carrier']);
const hidingConversation=[
    ['hideRemark',0,'Good. Their sensors cannot see us through this hull.'],
    ['hideMemory',7,'The last time I came through this hangar, every berth was full. Hard to believe it is the same place.'],
    ['hideDebt',14,'Thanks for coming back for me. Most pilots would have kept flying.'],
];
export const TutorialRuntimeMethods={
    tutorialLocalWaypoint(){
        const q=getTutorialQuest(this.save),p=this.save.player;
        if(!isTutorialActive(this.save)||!surveySteps.has(q.stepId)||p.dockedAt||this.activeInstanceId!=='mourning-line')return;
        const marker=this.tutorialFieldTarget();if(!marker||p.currentTargetId!==marker.id)return;
        if(this.tutorialSurveyNav?.id!==marker.id)this.tutorialSurveyNav={...marker,shortName:marker.name,radius:0};
        this.tutorialSurveyNav.name=this.tutorialSurveyNav.shortName=marker.name;
        return this.tutorialSurveyNav;
    },
    updateTutorialSurveyProgress(){
        const q=getTutorialQuest(this.save),p=this.save.player;
        if(!isTutorialActive(this.save)||!surveySteps.has(q.stepId)||p.dockedAt||this.activeInstanceId!=='mourning-line'||this.autopilot){this.tutorialSurveyTrack=undefined;return false;}
        const marker=this.tutorialFieldTarget();if(!marker)return false;
        let track=this.tutorialSurveyTrack;
        if(!track||track.id!==marker.id)track=this.tutorialSurveyTrack={id:marker.id,position:[...p.position]};
        const a=track.position,b=p.position,c=marker.position,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
        const length=dx*dx+dy*dy+dz*dz,t=length?Math.max(0,Math.min(1,((c[0]-a[0])*dx+(c[1]-a[1])*dy+(c[2]-a[2])*dz)/length)):0;
        const near=Math.hypot(a[0]+dx*t-c[0],a[1]+dy*t-c[1],a[2]+dz*t-c[2])<SURVEY_VISIT_RADIUS;
        a[0]=b[0];a[1]=b[1];a[2]=b[2];
        if(!near)return false;
        const index=q.flags.surveyIndex??0;
        this.handleTutorialEvent('waypoint-reached',{rescue:index===2,last:index===4});
        this.tutorialSurveyTrack=undefined;this.ensureTutorialFieldTarget();return true;
    },
    tutorialMusicContext(){
        if(!isTutorialActive(this.save)||getTutorialQuest(this.save).stepId!=='hide-patrol'||this.save.player.dockedAt)return;
        return this.ships.some(s=>s.tutorialPatrol&&s.hull>0&&!s.holdFire&&(s.targetId==='player'||this.ships.some(ally=>ally.tutorialCompanion&&ally.id===s.targetId)))?'combat':'stealth';
    },
    ensureTutorialCompanion(forcePosition=false){
        const q=getTutorialQuest(this.save);if(!this.renderer||this.save.player.dockedAt||!isTutorialActive(this.save))return;
        const people=[];
        if(rinSteps.has(q.stepId))people.push('rin');
        if(paulSteps.has(q.stepId)&&!(q.stepId==='rescue-paul'&&this.activeInstanceId!=='mourning-line')||(q.flags.paulInvited&&['salvage-black-box','black-box-fight'].includes(q.stepId)))people.push('paul');
        for(const ship of this.ships)if(ship.tutorialCompanion&&!people.includes(ship.storyPersonId))ship.hull=-1;
        let first;
        for(const person of people){
            let ship=this.ships.find(s=>s.tutorialCompanion&&s.storyPersonId===person&&s.hull>0);
            const goal=this.tutorialFormationGoal();if(person==='paul')goal.addScaledVector(this.tmpTutorialRight,-96);
            if(!ship){
                const hull=person==='paul'?'torsas':'lancer';
                ship=this.spawnShip('patrol',goal.toArray(),undefined,person==='paul'?'Paul · Long Memory':'Rin Vek · Second Light',{tier:'veteran',temperament:'steady'},{hullId:hull,faction:'independents'});
                Object.assign(ship,{tutorialCompanion:true,campaignCombat:true,storyPersonId:person,task:{kind:'tutorial-wing'},destination:[...ship.position],faction:'independents',hostile:false,authorizedTarget:false,dark:false,mugCapable:false,routineInspectionDue:false,noSurrender:true,identifiedByPlayer:true,playerIdentified:true,playerSensorAwareness:1,playerAwareness:1});
                const state=q.flags['actor-'+person];if(state){ship.hull=Math.max(1,state[0]);ship.shield=Math.max(0,state[1]);if(state[2]){ship.poweredDown=true;ship.holdFire=true;ship.pursuitHoldFire=true;}}
                this.renderer.ensureGlbShipModel?.(hull);
            }
            if(person==='paul'&&ship.combatFit.droneTypes?.[0]!=='repair'){ship.combatFit.droneTypes=['repair','repair'];ship.combatFit.droneCount=2;}
            ship.repairDronesHeld=q.stepId==='hide-patrol';
            if(forcePosition&&!ship.poweredDown){ship.position.splice(0,3,...goal.toArray());ship.velocity.splice(0,3,...this.save.player.velocity);ship.rotation.splice(0,4,...this.save.player.rotation);}
            first??=ship;
        }
        return first;
    },
    updateTutorialCompanion(ship,dt){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)){ship.hull=-1;return;}
        ship.hostile=false;ship.identifiedByPlayer=true;ship.playerSensorAwareness=1;
        if(ship.poweredDown){
            // Wait for a quiet interval; lock changes and momentary occlusion do not end a fight.
            if(this.campaignOpponentsInFight().length){ship.quietSince=undefined;}else ship.quietSince??=this.save.world.time;
            if(ship.quietSince!==undefined&&this.save.world.time-ship.quietSince>=8){this.powerUpEssentialCompanion(ship);actorState(q,ship);}
            else{ship.holdFire=true;ship.pursuitHoldFire=true;ship.targetId=undefined;for(let a=0;a<3;a++){ship.velocity[a]*=Math.max(0,1-dt*.6);ship.position[a]+=ship.velocity[a]*dt;}this.publishCampaignWing();return;}
        }
        const peaceful=['raider-standoff','talk-paul','carrier-wait'].includes(q.stepId)||(q.stepId==='hide-patrol'&&!this.ships.some(s=>s.tutorialPatrol&&s.hull>0&&s.targetId==='player'&&!s.holdFire));
        const order=peaceful?{order:'defensive',target:undefined}:this.applyCampaignWingOrder(ship);
        const teaching=ship.storyPersonId==='rin'&&q.stepId==='defeat-raider';
        if(!teaching&&ship.tutorialCoverShotAt!==undefined){
            if(ship.gunBurstPauseUntil===ship.tutorialCoverShotAt)ship.gunBurstPauseUntil=0;
            delete ship.tutorialCoverShotAt;
        }
        if(order.target){
            // The first duel belongs to the player. Rin flies real attack passes
            // but offers occasional forward-gun shots, rather than emptying a
            // Lancer's guns, turrets and missile racks into one training target.
            const fit=ship.combatFit,held=ship.turretsHeld,launchAt=fit?.launchAt,lastShot=ship.lastCombatShotAt;
            if(teaching){
                ship.tutorialCoverShotAt??=this.save.world.time+3;
                ship.gunBurstPauseUntil=Math.max(ship.gunBurstPauseUntil??0,ship.tutorialCoverShotAt);
                ship.turretsHeld=true;
                if(fit)fit.launchAt=this.save.world.time+1;
            }
            try{this.updateAttackAI(ship,this.tmpTutorialGoal.fromArray(order.target.position),this.tmpTutorialForward.fromArray(order.target.velocity),dt);}
            finally{if(teaching){
                ship.turretsHeld=held;
                if(fit)fit.launchAt=launchAt;
                if(ship.lastCombatShotAt!==lastShot){
                    ship.tutorialCoverShotAt=this.save.world.time+(order.order==='aggressive'?3:5);
                    ship.gunBurstPauseUntil=Math.max(ship.gunBurstPauseUntil??0,ship.tutorialCoverShotAt);
                }
            }}
        }
        else{
            ship.holdFire=true;ship.pursuitHoldFire=true;ship.targetId=undefined;
            const goal=order.order==='breakoff'?this.campaignBreakGoal(ship,this.tmpTutorialGoal):this.tutorialFormationGoal();
            if(ship.storyPersonId==='paul')goal.addScaledVector(this.tmpTutorialRight,-96);
            this.flyTutorialWingTo(ship,goal,dt);
        }
        this.publishCampaignWing();
    },
    spawnTutorialEncounter(encounter,hulls){
        const q=getTutorialQuest(this.save),p=this.save.player;
        const origin=encounter==='mining'?p.position:(q.flags['origin-'+encounter]??=[...p.position]);
        const actors=[];
        for(let index=0;index<hulls.length;index++){
            if(q.flags[`defeated-${encounter}-${index}`])continue;
            let ship=this.ships.find(s=>s.tutorialEncounter===encounter&&s.tutorialIndex===index&&s.hull>0);
            if(!ship){
                const patrol=encounter==='patrol',range=patrol?this.playerStats().radarRange*.92:240+index*95;
                const offset=(patrol?new THREE.Vector3(range+index*55,range*.45,index*70):new THREE.Vector3(Math.cos(index*1.4)*range,60+index*12,Math.sin(index*1.4)*range)).add(point(origin));
                let position=offset.toArray();
                ship=this.spawnShip('pirate',position,undefined,encounter==='mining'?'Ash Moth':`${patrol?'Redwake patrol':'Graveyard raider'} ${index+1}`,{tier:patrol?'veteran':'novice',temperament:'steady'},{hullId:hulls[index],faction:'pirates',tutorialEncounter:encounter});
                Object.assign(ship,{tutorialEnemy:true,campaignCombat:true,tutorialEncounter:encounter,tutorialIndex:index,noSurrender:true,dark:false,mugCapable:false,targetId:patrol?undefined:encounter==='rescue'?this.ships.find(s=>s.storyPersonId==='paul')?.id:'player',playerAwareness:1,playerSensorAwareness:1,playerIdentified:true,identifiedByPlayer:true});
                if(!this.entryPositionClear(point(ship.position),this.activeFieldObstacles(),30))ship.position.splice(0,3,...this.findClearSpace(ship));
                if(encounter==='mining'&&q.stepId==='raider-standoff'){ship.holdFire=true;ship.pursuitHoldFire=true;ship.demandUntil=Number.MAX_SAFE_INTEGER;ship.destination=[...ship.position];}
                if(patrol){ship.tutorialPatrol=true;ship.hostile=true;ship.destination=ship.position.map((v,a)=>v+(a===0?-3200:a===2?1800:0));ship.task={kind:'travel'};}
            }
            actors.push(ship);
        }
        return actors;
    },
    ensureTutorialEnemy(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)||!this.renderer||this.save.player.dockedAt)return;
        const encounter=['raider-standoff','defeat-raider'].includes(q.stepId)?'mining':q.stepId==='rescue-paul'?'rescue':q.stepId==='hide-patrol'?'patrol':q.stepId==='black-box-fight'?'black-box':undefined;
        if(!encounter||encounter!=='mining'&&this.activeInstanceId!=='mourning-line')return;
        this.ensureTutorialCompanion();
        const hulls=encounter==='mining'?['scrapper']:encounter==='rescue'?['scrapper','scrapper']:encounter==='patrol'?['scrapper','scrapper','demon','demon','demon']:['scrapper','scrapper','scrapper','demon'];
        const ships=this.spawnTutorialEncounter(encounter,hulls);
        if(encounter!=='patrol'&&ships[0]&&(!this.save.player.currentTargetId||!q.flags['focused-'+encounter])){q.flags['focused-'+encounter]=true;this.applyTarget({kind:'ship',id:ships[0].id,position:ships[0].position,name:ships[0].name});}
        return ships[0];
    },
    updateTutorialPatrol(ship,dt){
        if(ship.tutorialPatrolPassed){ship.targetId=undefined;ship.holdFire=true;ship.pursuitHoldFire=true;this.updateTravelAI(ship,dt);return;}
        const p=this.save.player,from=this.tmpTutorialForward.fromArray(ship.position),to=this.tmpTutorialGoal.fromArray(p.position);
        const sees=distance(ship.position,p.position)<Math.max(130,this.playerExposureRange())&&!this.lineBlocked(from,to,ship.id);
        if(sees||ship.combatThreatUntil>this.save.world.time){ship.targetId='player';ship.holdFire=false;ship.pursuitHoldFire=false;ship.tutorialDetectedUntil=this.save.world.time+5;}
        if(ship.tutorialDetectedUntil>this.save.world.time){this.updateAttackAI(ship,to,this.tmpTutorialRight.fromArray(p.velocity),dt);return;}
        ship.targetId=undefined;ship.holdFire=true;ship.pursuitHoldFire=true;this.updateTravelAI(ship,dt);
    },
    ensureTutorialDelivery(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)||q.stepId!=='sell-supplies'||this.save.player.dockedAt!=='vesper')return;
        const missing=Math.max(0,(q.flags.deliveryRequired??16)-(q.flags.suppliesSold??0)-(this.save.player.cargo.food??0));
        const amount=Math.min(missing,Math.floor(cargoFree(this.save.player)/COMMODITIES.food.mass));
        if(amount>0){this.save.player.cargo.food=(this.save.player.cargo.food??0)+amount;this.ui.showToast(t('Rin replaced the lost delivery cargo.'),'info',5000);}
    },
    showTutorialDockBriefing(){
        if(this.ui.concourseArrivalPending)return;
        const q=getTutorialQuest(this.save),port=this.save.player.dockedAt;
        if(!isTutorialActive(this.save)||!port)return;
        if(q.stepId==='earn-standing'&&this.ui.dockLocation===port&&!this.ui.isTitleVisible
            &&this.ui.root?.querySelector('#loading-screen')?.classList.contains('is-hidden')!==false){this.queueTutorialMaraCall();return;}
        const lesson=dockBriefings[q.stepId];
        const id=lesson?.[1];
        if(!id||lesson[0]&&lesson[0]!==port||q.flags['briefingShown-'+id]||q.flags['briefingRead-'+id]
            ||this.pendingTutorialBriefings?.has(id)||q.stepId==='mining-contract'&&q.flags.miningExplained)return;
        if(this.ui.dockLocation!==port||this.ui.isTitleVisible||this.ui.isModalOpen
            ||this.save.world.missionSettlements?.length
            ||this.ui.root?.querySelector('#loading-screen')?.classList.contains('is-hidden')===false)return;
        // Dialogue introduces the next normal control, never performs its action.
        q.flags['briefingShown-'+id]=true;
        this.playTutorialBriefing(id);
        this.persistSave();
    },
    ensureTutorialEquipment(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save))return;
        normalizeOutfitting(this.save.player);
        const fit=loadoutFor(this.save.player);
        if(q.stepId==='fit-upgrade'){
            if(fit.utility.some(id=>equipmentBaseId(id)==='sustained-reactor')){this.handleTutorialEvent('outfitted',{locationId:this.save.player.dockedAt,reactorInstalled:true});return;}
            if(!q.flags.reactorProvided){this.save.player.outfitting.locker['sustained-reactor']=(this.save.player.outfitting.locker['sustained-reactor']??0)+1;q.flags.reactorProvided=true;this.persistSave();}
        }
        if(q.stepId==='fit-pdc'){
            const fleet=this.save.player.droneFleet;
            if(!q.flags.pdcProvided){for(let i=0;i<DRONE_BAY_CAPACITY.pdc;i++){const id=`drone-${fleet.nextUnitId++}`;fleet.unitsById[id]=createDroneUnit(id,'pdc');fleet.lockerIds.push(id);}q.flags.pdcProvided=true;this.persistSave();}
            const bay=fit.droneBays?.find(b=>b.mode==='pdc'&&b.unitIds.some(id=>fleet.unitsById[id]?.hull>0));
            if(bay)this.handleTutorialEvent('drone-configured',{locationId:this.save.player.dockedAt,mode:'pdc',loaded:true});
        }
    },
    ensureTutorialMiningContract(){
        const q=getTutorialQuest(this.save);if(!q||q.stepId!=='mining-contract')return;
        const active=this.save.activeMissions.find(m=>m.id===TUTORIAL_MINING_CONTRACT_ID);
        if(active)return; // Keep already accepted contracts and their progress intact.
        let node=this.asteroids.find(n=>n.id===q.flags.oreTargetId);
        if(!q.flags.miningEntryPosition||!node){
            const centre=point(LOCATIONS.shardbelt.position),direction=point(LOCATIONS.vesper.position).sub(centre).normalize();
            const entry=new THREE.Vector3();this.setFieldEntryPosition(entry,'shardbelt',direction);
            const entryPosition=entry.toArray();
            const desired=entry.clone().addScaledVector(direction,-1000).toArray();
            let score=Infinity;
            for(const candidate of this.asteroids){
                if(candidate.moving||candidate.remaining<=0)continue;
                const range=distance(entryPosition,candidate.position);
                const inward=(entry.x-candidate.position[0])*direction.x+(entry.y-candidate.position[1])*direction.y+(entry.z-candidate.position[2])*direction.z;
                if(inward<range*.35)continue;
                const fit=Math.abs(range-1000)+distance(desired,candidate.position)*.2;
                if(fit<score){score=fit;node=candidate;}
            }
            if(!node)return;
            q.flags.miningEntryPosition=entry.toArray();q.flags.oreTargetId=node.id;
            // Leave additional ore for pilots who choose to keep mining.
            node.remaining=Math.max(node.remaining,TUTORIAL_MINING_QUANTITY+6);
            this.save.world.depletedAsteroids[node.id]=node.remaining;
        }
        const offers=this.save.world.offers.vesper??=[];
        const terms={quantity:TUTORIAL_MINING_QUANTITY,reward:TUTORIAL_MINING_REWARD,claimNodeId:node.id,claimPosition:[...node.position],commodity:'ore',briefing:t('Mine six units from the marked Shardbelt deposit and bring them back to Vesper. Bought ore does not count.')};
        const offer=offers.find(m=>m.id===TUTORIAL_MINING_CONTRACT_ID);
        if(offer)Object.assign(offer,terms);
        else offers.unshift({id:TUTORIAL_MINING_CONTRACT_ID,tutorial:true,kind:'mining',title:t('Vesper starter mining claim'),issuer:'Vesper Mining Cooperative',origin:'vesper',destination:'vesper',claimName:t('Rin’s training deposit'),mined:0,deposit:0,deadline:null,status:'offered',guild:'mining',guildRep:6,faction:'independents',...terms});
    },
    ensureTutorialFieldTarget(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)||!this.renderer||this.save.player.systemId!=='helios-verge')return;
        if(q.stepId==='mine-shardbelt'){
            const node=this.asteroids.find(n=>n.id===q.flags.oreTargetId);if(node){if(node.remaining<tutorialMiningQuantity(this.save)-(q.flags.oreRecovered??0)){node.remaining=tutorialMiningQuantity(this.save)-(q.flags.oreRecovered??0);this.save.world.depletedAsteroids[node.id]=node.remaining;}this.selectTarget('asteroid',node.id);}return node;
        }
        if(q.stepId==='salvage-black-box'){
            let node=this.wreckNodes.find(n=>n.id===q.flags.blackBoxTargetId);
            node??=this.wreckNodes.find(n=>n.zone==='frigate-alpha'&&!n.insideWreckId&&n.remaining>0)??this.wreckNodes.find(n=>n.zone==='frigate-alpha');
            if(node){q.flags.blackBoxTargetId=node.id;if(node.remaining<=0){node.remaining=1;this.save.world.depletedWrecks[node.id]=1;}this.selectTarget('wreck',node.id);}return node;
        }
        const marker=this.tutorialFieldTarget();if(marker){this.applyTarget(marker);this.renderer.setMissionMarker?.(marker);}return marker;
    },
    tutorialHidingPositionClear(position,obstacles=this.activeFieldObstacles('mourning-line')){
        const rotation=new THREE.Quaternion().fromArray(this.save.player.rotation),variant=playerShipVariant(this.save.player.shipId),hit={};
        return !obstacles.some(obstacle=>shipVsObstacle(position,rotation,variant,PLAYER_CONTACT_SCALE,obstacle,hit));
    },
    ensureTutorialHidePosition(){
        const q=getTutorialQuest(this.save),wreck=GRAVEYARD_MODEL_WRECKS.find(w=>w.id==='concord-carrier-wreck');
        if(!q||!wreck?.interior||this.activeInstanceId!=='mourning-line')return;
        const obstacles=this.activeFieldObstacles();
        const bay=wreck.interior,rotation=new THREE.Euler(...wreck.rotation),origin=point(wreck.local).add(point(LOCATIONS['mourning-line'].position));
        const pirates=this.ships.filter(s=>s.tutorialPatrol&&s.hull>0);
        const visible=p=>pirates.some(ship=>!this.lineBlocked(point(ship.position),p,ship.id));
        const previous=q.flags.hidingPosition;
        if(previous&&this.tutorialHidingPositionClear(point(previous),obstacles)&&!visible(point(previous)))return previous;
        let fallback;
        // Search the real open hangar rather than assuming its model origin is empty.
        // This is a one-time mission placement, outside the per-ship flight path.
        for(const y of [-.7,-.45,0,.45,.7])for(const z of [-.7,-.45,0,.45,.7])for(const x of [0,-.2,.2,-.4,.4,-.6,.6,-.8,.8]){
            const candidate=new THREE.Vector3(bay.center[0]+bay.halfLength*x,bay.center[1]+bay.halfHeight*y,bay.center[2]+bay.halfWidth*z).multiplyScalar(wreck.scale).applyEuler(rotation).add(origin);
            if(!this.tutorialHidingPositionClear(candidate,obstacles))continue;
            fallback??=candidate.toArray();
            if(visible(candidate))continue;
            q.flags.hidingPosition=candidate.toArray();return q.flags.hidingPosition;
        }
        // The player can also move deeper into cover than the marker, or fight/escape.
        if(fallback)q.flags.hidingPosition=fallback;
        return fallback;
    },
    tutorialFieldTarget(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)||this.save.player.systemId!=='helios-verge')return;
        const s=q.stepId;
        if(['survey-graveyard','survey-carrier','carrier-wait'].includes(s)){
            const index=s==='carrier-wait'?surveyIds.length-1:Math.min(q.flags.surveyIndex??0,surveyIds.length-1),id=surveyIds[index];
            return {kind:'waypoint',id:`tutorial-survey-${index}`,position:q.flags['survey-position-'+index]??=(tutorialWreckPoint(id)),name:t('Wreck survey')+' '+(index+1)+'/5',destinationId:'mourning-line'};
        }
        if(s==='hide-patrol')return {kind:'waypoint',id:'tutorial-hide',position:q.flags.hidingPosition??tutorialWreckPoint('concord-carrier-wreck',true),name:t('CARRIER HANGAR · HIDE'),destinationId:'mourning-line'};
        const mining=s==='mine-shardbelt';if(!mining&&s!=='salvage-black-box')return;
        const node=(mining?this.asteroids:this.wreckNodes)?.find(n=>n.id===q.flags[mining?'oreTargetId':'blackBoxTargetId']&&n.remaining>0);
        return node?{kind:mining?'asteroid':'wreck',id:node.id,position:node.position,name:t(mining?'RIN’S MINING MARKER':'BLACK BOX SIGNAL'),destinationId:mining?'shardbelt':'mourning-line'}:undefined;
    },
    applyTutorialTransition(result){
        const q=getTutorialQuest(this.save),s=result.stepId;
        this.lastTutorialHint=undefined;this.tutorialNudge=undefined;this.tutorialGuidanceAt=0;this.ui.setTutorialHint?.();
        if(result.skipped)return;
        if(['fit-upgrade','fit-pdc'].includes(s))this.ensureTutorialEquipment();
        if(s==='mining-contract')this.ensureTutorialMiningContract();
        if(s==='earn-standing'){
            this.removeTutorialActors();this.save.world.localContractOffersDirty=true;refreshMissionOffers(this.save);this.save.player.transponder=true;
        }else if(s==='complete'){
            this.removeTutorialActors();this.save.world.localContractOffersDirty=true;refreshMissionOffers(this.save);
        }else if(s!=='raider-standoff'&&s!=='defeat-raider'&&s!=='earn-standing'&&s!=='return-mining'){
            const destination=this.tutorialSummary()?.destinationId;if(destination)this.setTutorialDestination(destination);
        }
        if(s==='return-mining')this.ui.showPilotLine?.('Rin Vek',t('That covers the contract. We can return to Vesper whenever you are ready.'),'ally',12000,true);
        if(s==='raider-standoff'){this.save.player.mode='combat';this.utilityActive=false;q.flags.standoffStartedAt=this.save.world.time;this.ensureTutorialEnemy();this.ui.showPilotLine?.('Ash Moth',t('Cut your drive. That ore belongs to us. Drop it and you can leave.'),'hostile',12000,true);}
        if(s==='defeat-raider'){
            const enemy=this.ensureTutorialEnemy();if(enemy){enemy.holdFire=false;enemy.pursuitHoldFire=false;enemy.demandUntil=0;enemy.targetId='player';}
            this.save.player.mode='combat';this.utilityActive=false;this.introduceCampaignWingOrders();
            this.playTutorialBriefing('combat');
        }
        if(['rescue-paul','black-box-fight','hide-patrol'].includes(s)){q.flags.encounterStartedAt=this.save.world.time;this.ensureTutorialCompanion();this.ensureTutorialEnemy();}
        if(s==='rescue-paul')this.ui.showPilotLine?.('Paul',t('Mayday! Two Scrappers on my tail by the cruiser. I could use a hand!'),'ally',12000,true);
        if(s==='talk-paul')this.playTutorialBriefing('paul-rescue');
        if(s==='land-mining'&&q.flags.tutorialLootWreckId)this.playTutorialBriefing('loot');
        if(s==='carrier-wait')q.flags.carrierWaitStartedAt=this.save.world.time;
        if(s==='return-helix')this.playTutorialBriefing('paul-clear');
        if(s==='hide-patrol'){this.ensureTutorialHidePosition();this.playTutorialBriefing('paul-hide');}
        if(s==='meet-cairn'){delete q.flags['actor-rin'];delete q.flags['actor-paul'];}
        if(s==='meet-cairn')this.playTutorialBriefing('mara-cairn');
        if(s==='deliver-black-box'&&q.flags.paulInvited)this.ui.showPilotLine?.('Paul',t('You have the recorder. Take it to Mara. We are even now — safe flying.'),'ally',10000,true);
        if(s==='salvage-black-box')this.ensureTutorialFieldTarget();
        if(s==='black-box-fight'&&!this.save.player.sealedCargo.some(c=>c.missionId==='tutorial-black-box')){const node=this.wreckNodes.find(n=>n.id===q.flags.blackBoxTargetId);if(node)this.save.player.cargo[node.salvage]=Math.max(0,(this.save.player.cargo[node.salvage]??0)-1);this.save.player.sealedCargo.push({missionId:'tutorial-black-box',label:'Encrypted flight recorder',units:1,mass:node?COMMODITIES[node.salvage].mass:1});}
        if(s==='complete'){this.ui.setTutorialHint?.();this.renderer?.setMissionMarker?.();this.ui.showPilotLine?.('Rin Vek',t('I will scout ahead. Keep your eyes open too; we will compare notes when Mara has decoded the recorder.'),'ally',15000,true);}
        if(s==='complete')this.save.player.sealedCargo=this.save.player.sealedCargo.filter(c=>c.missionId!=='tutorial-black-box');
        if(!this.save.player.dockedAt){this.ensureTutorialCompanion(s!=='return-mining');if(['survey-graveyard','survey-carrier','carrier-wait','hide-patrol'].includes(s))this.ensureTutorialFieldTarget();}
    },
    restoreTutorialRuntime(){
        migrateTutorialCampaign(this.save);const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save))return this.tutorialSummary();
        this.save.world.campaignUnlocked=tutorialContentUnlocked(this.save);
        if(isTutorialGuided(this.save)){this.hyperdriveEncounterAt=null;this.beamAmbushNextAt=0;}
        this.ensureTutorialEquipment();this.ensureTutorialDelivery();this.ensureTutorialMiningContract();
        if(!this.save.player.dockedAt){if(!['earn-standing','raider-standoff','defeat-raider','hide-patrol','talk-paul','return-mining'].includes(q.stepId))this.setTutorialDestination(this.tutorialSummary().destinationId);this.ensureTutorialCompanion();this.ensureTutorialEnemy();if(q.stepId==='hide-patrol')this.ensureTutorialHidePosition();this.ensureTutorialFieldTarget();if(q.stepId==='talk-paul')this.playTutorialBriefing('paul-rescue');if(q.stepId==='defeat-raider')this.playTutorialBriefing('combat');if(q.stepId==='land-mining'&&this.save.world.combatWrecks?.[q.flags.tutorialLootWreckId])this.playTutorialBriefing('loot');}
        if(!this.save.player.dockedAt&&['hide-patrol','return-helix'].includes(q.stepId))this.playTutorialBriefing(q.stepId==='hide-patrol'?'paul-hide':'paul-clear');
        this.queueTutorialMaraCall();return this.tutorialSummary();
    },
    queueTutorialMaraCall(){
        // Do not value a borrowed racing hull or interrupt a live race briefing.
        if(this.activeRace)return;
        const q=getTutorialQuest(this.save);if(!q||q.stepId!=='earn-standing'||!isTutorialActive(this.save)||this.deathTimer>0||this.save.player.hull<=0||this.galaxyJump||this.ui.isModalOpen||this.save.world.missionSettlements?.length||this.storyLineActive()||this.campaignOpponentsInFight().length)return;
        if(playerStrengthValue(this.save.player)>=TUTORIAL_MARA_CALL_MIN_COMBAT_VALUE)this.handleTutorialEvent('mara-call');
    },
    tutorialVesperApproach(){
        const p=this.save.player,location=LOCATIONS.vesper;
        return getTutorialQuest(this.save)?.stepId==='fly-vesper'&&!p.dockedAt&&!this.autopilot
            &&p.navTargetId==='vesper'&&(this.activeInstanceId==='vesper'||distance(p.position,location.position)<=hyperdriveArrivalRadius(location)+160);
    },
    tutorialFlightGuidance(){
        const q=getTutorialQuest(this.save),summary=this.tutorialSummary();if(!summary?.active)return;
        const s=q.stepId,p=this.save.player,stats=this.playerStats();
        const speaker=['survey-carrier','carrier-wait','hide-patrol','return-helix'].includes(s)?'Paul':s==='survey-graveyard'?'Wayfarer':'Rin Vek';
        const say=(stage,text,vars)=>({key:`${s}:${stage}`,speaker,text:t(text,vars)});
        const transit=id=>{
            const location=LOCATIONS[id],name=t(location.shortName),range=distance(p.position,location.position);
            if(this.pendingDroneDeparture)return say('recover-drones','Your drones are returning automatically. Hyperdrive will start when they are aboard.');
            if(this.autopilot)return say('cruise','Stay on course until hyperdrive drops at {destination}.',{destination:name});
            if(range<=hyperdriveArrivalRadius(location)+160||this.activeInstanceId===id)return;
            if(p.navTargetId!==id)return say('route','Select {destination} on the navigation map.',{destination:name});
            const [x,y,z,w]=p.rotation,d=p.position.map((v,i)=>location.position[i]-v);
            const facing=(-2*(x*z+w*y)*d[0]+2*(w*x-y*z)*d[1]+(-1+2*(x*x+y*y))*d[2])/Math.max(1,range);
            if(facing<.96)return say('align','Turn towards {destination}. Follow its edge marker.',{destination:name});
            return say('drive','Tap HYPERDRIVE to travel to {destination}.',{destination:name});
        };
        if(s==='plot-vesper')return this.ui.root?.querySelector('#map-panel:not(.is-hidden)')?say('select-vesper','Select Vesper on the navigation map.'):say('map','Tap the centre radar to open the navigation map.');
        if(s==='flight-checks'){
            if(summary.lessonId==='ship-monitor')return say('ship-monitor','Tap the left monitor to open your ship status.');
            return say(summary.lessonId,summary.detail);
        }
        if(s==='return-helix'&&p.transponder===false)return say('transponder','The patrol has passed. Switch your transponder ON in the left monitor.');
        if(['fly-vesper','return-mining','land-mining','return-helix','meet-cairn','deliver-black-box'].includes(s)){
            const id=summary.destinationId,travel=transit(id);if(travel)return travel;
            const location=LOCATIONS[id],surface=distance(p.position,location.position)-location.radius;
            if(p.currentTargetId!==id)return say('lock','Select {destination} as your target.',{destination:t(location.shortName)});
            if(location.kind==='planet'){
                if(s==='fly-vesper'&&this.tutorialVesperApproach()){
                    if(surface>5000)return p.throttle<.99?say('boost-thrust','Raise thrust to maximum.'):say('boost-approach','Hold the afterburner until 5,000 km: Shift on desktop, the gold button on phone.');
                    if(this.afterburning)return say('release-boost','Release the afterburner.');
                }
                if(surface>5000)return say('approach','Approach to 5,000 km above the surface. Watch the distance on your target monitor.');
                if(p.throttle>.01||Math.hypot(...p.velocity)>8)return say('brake','Set thrust to zero to slow down for landing.');
                return say('land','Hold position. Landing starts automatically below 5,000 km.');
            }
            if(!this.stationLandingClearanceGranted)return say('station-approach','Approach to 200 km from the station.');
            return say('station-dock','Set thrust to zero. Docking control will take you in.');
        }
        if(['mine-shardbelt','survey-graveyard','survey-carrier','salvage-black-box'].includes(s)){
            const travel=transit(summary.destinationId);if(travel)return travel;
            const marker=this.tutorialFieldTarget();if(!marker)return;
            const range=distance(p.position,marker.position);
            if(marker.kind==='waypoint'){
                if(this.autopilot)return say('cruise','Stay on course until hyperdrive drops at {destination}.',{destination:marker.name});
                if(range>SURVEY_JUMP_MIN_DISTANCE&&p.currentTargetId!==marker.id)return say('select-marker','Select the highlighted marker as your target.');
                return range>SURVEY_JUMP_MIN_DISTANCE?say('local-jump','Aim at the survey star and engage HYPERDRIVE.'):say('waypoint','Fly within 100 km of the survey star.');
            }
            if(range>stats.scanRange)return say('marker','Fly towards the highlighted marker.');
            if(p.currentTargetId!==marker.id)return say('select-marker','Select the highlighted marker as your target.');
            const node=this.asteroids.find(n=>n.id===marker.id)??this.wreckNodes.find(n=>n.id===marker.id);
            if(!node?.scanned)return say('scan','Keep the marker selected while the scan completes.');
            if(s==='mine-shardbelt'){
                if(p.droneFleet?.controller?.phase==='running')return say('mining','Wait for your miners to deliver the contract ore.');
                const action=this.miningDroneActionState();
                if(action.code==='out-of-range')return say('mining-range','Move within {range} km of the deposit to deploy your miners.',{range:action.range});
                return say('deploy','Deploy your miners: tap MINE, or press M on desktop.');
            }
            if(range>stats.salvageRange)return say('salvage-range','Move closer to the black box signal.');
            return say('salvage','Hold SALVAGE to recover the black box; on desktop, hold M.');
        }
        if(s==='hide-patrol'){
            if(p.transponder!==false)return say('dark','Switch your transponder OFF in the left monitor.');
            const local=p.position.map((v,i)=>v-LOCATIONS['mourning-line'].position[i]);
            if(graveyardWreckInteriorAt(local,5)!=='concord-carrier-wreck')return say('cover','Fly into the marked carrier hangar. Its hull will block their sensors.');
            if(p.throttle>.01||Math.hypot(...p.velocity)>=12)return say('stop','Set thrust to zero inside the hangar.');
            return say('hidden','Stay hidden while the patrol passes.');
        }
        const oneTask={'rescue-paul':'Help Paul defeat the two Scrappers.','defeat-raider':'Fire as the pirate crosses your sights: hold Space on desktop or FIRE on phone.','black-box-fight':'Defeat the four pirate ships.','carrier-wait':'Stay near the carrier while Paul checks the flight deck.','talk-paul':'Open Paul’s transmission.'};
        if(oneTask[s])return say(s,oneTask[s]);
    },
    updateTutorialGuidance(guidance){
        if(!guidance||this.storyLineActive()||this.ui.isModalOpen)return;
        const q=getTutorialQuest(this.save),now=this.save.world.time;
        // The first flight teaches controls. Later legs only remind a pilot who
        // has made no useful progress for a minute, once for that action.
        if(['plot-vesper','flight-checks','fly-vesper'].includes(q.stepId)){
            if(this.lastTutorialHint!==guidance.key){this.ui.setTutorialHint?.(guidance.speaker,guidance.text,guidance.key);this.lastTutorialHint=guidance.key;}
            return;
        }
        const stage=guidance.key.slice(guidance.key.indexOf(':')+1);
        if(['cruise','recover-drones','mining','scan','hidden','carrier-wait','talk-paul'].includes(stage)){this.tutorialNudge=undefined;this.ui.setTutorialHint?.();return;}
        const target=this.tutorialFieldTarget()?.position??LOCATIONS[this.tutorialSummary()?.destinationId]?.position;
        const range=target?distance(this.save.player.position,target):Infinity;
        let nudge=this.tutorialNudge;
        if(!nudge||nudge.key!==guidance.key){this.tutorialNudge={key:guidance.key,since:now,bestRange:range,ore:q.flags.oreRecovered??0};this.ui.setTutorialHint?.();return;}
        const ore=q.flags.oreRecovered??0;
        if(range<nudge.bestRange-Math.min(25,Math.max(2,nudge.bestRange*.05))||ore>nudge.ore){nudge.since=now;nudge.bestRange=range;nudge.ore=ore;return;}
        if(!nudge.shown&&now-nudge.since>=60){this.ui.setTutorialHint?.(guidance.speaker,guidance.text,guidance.key);nudge.shown=true;this.lastTutorialHint=guidance.key;}
    },
    updateTutorialCampaignRuntime(){
        const q=getTutorialQuest(this.save);if(!isTutorialActive(this.save)){this.renderer?.setMissionMarker?.();this.ui.setTutorialHint?.();return;}
        const s=q.stepId,p=this.save.player,now=this.save.world.time;
        const marker=this.tutorialFieldTarget();this.renderer?.setMissionMarker?.(marker?.kind==='waypoint'?marker:undefined);
        this.queueTutorialMaraCall();
        if(p.dockedAt){this.ui.setTutorialHint?.();return;}
        this.ensureTutorialCompanion();
        for(const ship of this.ships)if(ship.tutorialCompanion&&ship.hull>0)actorState(q,ship);
        if(s==='return-mining'&&this.autopilot&&p.navTargetId==='vesper'&&this.hyperdriveFx==='active'){
            this.disengageHyperdrive();this.handleTutorialEvent('hyperdrive-intercept');return;
        }
        if(s==='raider-standoff'&&now-(q.flags.standoffStartedAt??now)>=FIRST_STANDOFF_SECONDS)this.handleTutorialEvent('standoff-ended');
        if(s==='defeat-raider'&&!q.flags['briefingShown-combat'])this.playTutorialBriefing('combat');
        if(['rescue-paul','black-box-fight'].includes(s)){
            const encounter=s==='rescue-paul'?'rescue':'black-box',count=encounter==='rescue'?2:4;
            this.ensureTutorialEnemy();if(Array.from({length:count},(_,i)=>q.flags[`defeated-${encounter}-${i}`]).every(Boolean))this.handleTutorialEvent('encounter-cleared',{encounter});
        }
        if(s==='survey-carrier'&&(q.flags.surveyIndex??0)===4&&!q.flags.carrierRemark&&!this.autopilot){
            const marker=this.tutorialFieldTarget();
            if(marker&&distance(p.position,marker.position)<=500){q.flags.carrierRemark=true;this.ui.showPilotLine?.('Paul',t('I used to bring supplies here. The flight deck was so busy you could barely find a berth.'),'story-friend',10000,true);}
        }
        if(this.updateTutorialSurveyProgress())return;
        if(s==='return-helix'&&!q.flags['briefingShown-paul-clear'])this.playTutorialBriefing('paul-clear');
        if(s==='carrier-wait'){
            this.handleTutorialEvent('patrol-arrived');
        }
        if(s==='hide-patrol'){
            if(!q.flags['briefingShown-paul-hide'])this.playTutorialBriefing('paul-hide');
            const pirates=this.ships.filter(ship=>ship.tutorialEncounter==='patrol'&&ship.hull>0);
            const local=p.position.map((v,i)=>v-LOCATIONS['mourning-line'].position[i]);
            const hidden=p.transponder===false&&Math.hypot(...p.velocity)<12&&graveyardWreckInteriorAt(local,5)==='concord-carrier-wreck'&&pirates.every(ship=>this.lineBlocked(point(ship.position),point(p.position),ship.id))&&(this.playerEmissionHeat??0)<40&&!this.utilityActive;
            if(hidden){q.flags.hiddenSince??=now;
                for(const [flag,after,line]of hidingConversation)if(!q.flags[flag]&&now-q.flags.hiddenSince>=after){q.flags[flag]=true;this.ui.showPilotLine?.('Paul',t(line),'ally',7000,true);break;}
            }
            else q.flags.hiddenSince=undefined;
            const killed=Array.from({length:5},(_,i)=>q.flags[`defeated-patrol-${i}`]).every(Boolean);
            const escaped=now-(q.flags.encounterStartedAt??now)>25&&pirates.every(ship=>distance(ship.position,p.position)>this.playerStats().radarRange*1.3);
            if(killed||escaped||hidden&&now-q.flags.hiddenSince>=20){for(const ship of pirates){ship.hostile=false;ship.targetId=undefined;ship.tutorialPatrolPassed=true;ship.tutorialEnemy=false;ship.holdFire=true;ship.task={kind:'travel'};}this.handleTutorialEvent('patrol-passed');}
        }
        if(now<(this.tutorialGuidanceAt??0))return;
        this.tutorialGuidanceAt=now+.2;
        const guidance=this.tutorialFlightGuidance();
        this.updateTutorialGuidance(guidance);
    },
};
