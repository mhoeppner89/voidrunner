import * as THREE from '../../vendor/three.module.min.js';
import {session} from './session.mjs';
import {GameSession} from '../../src/game/game.js';
import {generateGraveyardPieces,generateAsteroidField,generateRegionalAsteroidField,REGIONAL_ASTEROID_FIELD_IDS} from '../../src/game/worldData.js';

// A headless session with the career's real field geometry and broadphase:
// Shardbelt terrain and rocks, the Mourning Line wrecks and the regional belts.
export function fieldWorld(seed=718){
 const s=session(),P=GameSession.prototype;
 s.save.world.seed=seed;s.asteroids=generateAsteroidField(seed,[]);s.graveyard=generateGraveyardPieces(seed);s.wreckNodes=[];
 s.regionalFields=new Map(REGIONAL_ASTEROID_FIELD_IDS.map(id=>[id,generateRegionalAsteroidField(seed,id)]));
 for(const name of ['activeFieldObstacles','forEachObstacleInBox','forEachObstacleAlongSegment','updateActiveInstance','currentNavLocationIds','lineBlocked'])s[name]=P[name];
 s.obstacleCellSize=180;s.obstacleQueryStamp=0;s.obstacleGrid=undefined;s.obstacleGridInstance=undefined;
 for(const k of ['tmpEntryAnchor','tmpEntryCandidate','tmpEntryPreferredDirection','tmpEntryDirection','tmpEntryNormal','tmpEntryLocal'])s[k]=new THREE.Vector3();
 s.renderer={setActiveInstance(){},setSystem(id){this.systemId=id;}};s.getTargetRef=()=>undefined;s.tutorialFieldTarget=()=>undefined;s.tutorialSummary=()=>undefined;
 return s;
}
