import * as THREE from '../../vendor/three.module.min.js';
import {GameSession} from '../../src/game/game.js';
import {EntityStore} from '../../src/game/entityStore.js';
import {createNewSave} from '../../src/game/save.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
export function session(){
 const s=Object.create(GameSession.prototype);s.save=createNewSave(175,{tutorial:false});s.save.player.position=[0,0,0];s.save.player.velocity=[0,0,0];s.save.player.rotation=[0,0,0,1];s.save.player.dockedAt=undefined;
 s.ships=[];s.projectiles=[];s.projectileCounter=0;s.entityCounter=0;s.projStore=new EntityStore(1024);s.arena={};s.gunCooldown=0;
 for(const key of ['A','B','C','D','E','F','G','H','I','J','K','L','ShipAvoid','P0','P1','P2','P3','P4','P5','P6','BlastStart','BlastEnd','AudioLocal'])s['tmp'+key]=new THREE.Vector3();
 for(const key of ['tmpPlayerOrientation','tmpAudioOrientation','tmpQ','tmpQ2'])s[key]=new THREE.Quaternion();s.tmpM4=new THREE.Matrix4();
 s.ui={pushEvent(){}};s.audio={play(){},playAtDirection(){}};
 s.renderer={spawnMuzzleFlash(){},spawnExplosion(){},spawnImpact(){},spawnRockImpact(){},showCombatBeam(){}};
 s.obstacles=[];s.activeDockObstacle=()=>undefined;s.activeFieldObstacles=()=>s.obstacles;
 s.forEachObstacleAlongSegment=(a,b,fn)=>s.obstacles.forEach(fn);s.forEachObstacleInBox=(...args)=>s.obstacles.forEach(args.at(-1));
 s.playerStats=()=>getEffectiveShipStats(s.save.player);s.getTargetRef=()=>undefined;s.addPlayerEmission=()=>{};s.snapToCombatSpeed=()=>{};s.maybeHitTaunt=()=>{};
 return s;
}

export function fixture(offset=0){
    const s=Object.create(GameSession.prototype);
    s.save=createNewSave(718,{tutorial:false});s.save.player.position=[offset,0,0];s.save.player.velocity=[0,0,0];
    s.ships=[];s.projectiles=[];s.entityCounter=0;s.projectileCounter=0;s.arena={};s.projStore=new EntityStore(1024);
    for(const k of ['A','B','C','D','E','F','G','H','I','J','K','L','ShipAvoid','P0','P1','P2','P3','P4','P5','P6','BlastStart','BlastEnd'])s['tmp'+k]=new THREE.Vector3();
    s.tmpQ=new THREE.Quaternion();s.tmpQ2=new THREE.Quaternion();s.tmpM4=new THREE.Matrix4();
    s.renderer={spawnMuzzleFlash(){},showCombatBeam(){},spawnImpact(){}};s.ui={pushEvent(){}};s.activeDockObstacle=()=>undefined;s.obstacles=[];
    s.activeFieldObstacles=()=>s.obstacles;
    s.forEachObstacleInBox=(...args)=>s.obstacles.forEach(args.at(-1));
    s.forEachObstacleAlongSegment=(a,b,fn)=>s.obstacles.forEach(fn);
    return s;
}
