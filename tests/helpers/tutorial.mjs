import {setLanguage} from '../../src/game/i18n.js';
import * as THREE from '../../vendor/three.module.min.js';
import {GameSession} from '../../src/game/game.js';
import {createNewSave} from '../../src/game/save.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {generateAsteroidField,generateWreckNodes} from '../../src/game/worldData.js';
import {getTutorialQuest} from '../../src/game/tutorialCampaign.js';
import {readFileSync} from 'node:fs';
export function tutorialFixture(step='meet-family',existing){
    setLanguage('en');
    const save=existing??createNewSave(73201,{tutorial:true}),quest=getTutorialQuest(save);quest.stepId=step;
    const session=Object.create(GameSession.prototype);session.save=save;session.ships=[];session.pickups=[];session.projectiles=[];session.entityCounter=0;session.pickupCounter=0;session.projectileCounter=0;
    session.pickupStore=new EntityStore();session.projStore=new EntityStore();session.extractionCarry=new Map();session.pilotLineHistory=new Map();session.hyperdriveInterceptIds=new Set();session.npcDroneUnits={};session.initialTrafficSpawned=false;
    for(const match of readFileSync(new URL('../../src/game/game.js',import.meta.url),'utf8').matchAll(/^    (\w+) = new THREE\.(Vector3|Quaternion|Matrix4)\(\);/gm))session[match[1]]=new THREE[match[2]]();
    session.asteroids=generateAsteroidField(save.world.seed,save.world.depletedAsteroids,save.world.scannedNodes);session.wreckNodes=generateWreckNodes(save.world.seed,save.world.depletedWrecks,save.world.scannedNodes);
    const lines=[],events=[];
    session.renderer={setTarget(){},setUtilityBeam(){},syncShips(){},setMissionMarker(){},spawnImpact(){},spawnMuzzleFlash(){},spawnExplosion(){},flashShield(){},ensureGlbShipModel(){}};
    session.ui={isModalOpen:false,showLaunchBlocked(){},showToast(){},pushEvent(...a){events.push(a);},pushSensor(){},refreshDock(){},setWingTactics(){},setTutorialHint(...a){lines.push(a);},showPilotLine(...a){lines.push(a);},showStoryLine(){},clearPilotLine(){}};
    session.audio={play(){},playAtDirection(){}};session.persistSave=()=>{};session.updateAssetWarmup=()=>{};session.activeFieldObstacles=()=>[];session.activeDockObstacle=()=>undefined;session.lineBlocked=()=>false;session.forEachObstacleAlongSegment=()=>{};session.forEachObstacleInBox=()=>{};session.storyLineActive=()=>false;session.deathTimer=0;session.activeInstanceId=['rescue-paul','talk-paul','survey-carrier','carrier-wait','hide-patrol','black-box-fight'].includes(step)?'mourning-line':undefined;
    session.playTutorialBriefing=()=>{};session.updateTravelAI=()=>{};session.updateAttackAI=()=>{};
    return {save,quest,session,lines,events};
}
