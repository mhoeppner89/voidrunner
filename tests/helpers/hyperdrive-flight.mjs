import * as THREE from '../../vendor/three.module.min.js';
import {GameSession} from '../../src/game/game.js';
import {createNewSave} from '../../src/game/save.js';
import {getEffectiveShipStats} from '../../src/game/shipStats.js';
import {LOCATIONS,hyperdriveArrivalRadius} from '../../src/game/data.js';
export function flight(distance=20000,angle=0){
 const s=Object.create(GameSession.prototype);s.save=createNewSave(175,{tutorial:false});
 const p=s.save.player,n=LOCATIONS.helix;p.dockedAt=undefined;p.navTargetId=n.id;p.position=[n.position[0],n.position[1],n.position[2]+distance];p.rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle).toArray();p.velocity=[0,0,0];p.angularVelocity=[0,0,0];p.throttle=.37;
 for(const k of ['A','B','C','D','E','F','G','Avoidance'])s['tmp'+k]=new THREE.Vector3();s.tmpPlayerOrientation=new THREE.Quaternion();s.tmpQ2=new THREE.Quaternion();s.tmpM4=new THREE.Matrix4();
 s.playerStats=()=>getEffectiveShipStats(p);s.flightLoadScale=()=>1;s.ships=[];s.ui={pushSensor(){}};s.audio={play(){}};s.renderer={};s.hyperdriveEncounterAt=null;s.hyperdriveReturnThrottle=.37;s.hyperdriveFx='none';s.playerEmissionHeat=0;
 s.hostilesVisibleNear=()=>false;s.readyJumpPoint=()=>undefined;s.resolvePlayerCollisions=()=>{};s.setFieldEntryPosition=(p,id,out)=>p.fromArray(LOCATIONS[id].position).addScaledVector(out,hyperdriveArrivalRadius(LOCATIONS[id]));s.ensurePlayerEntryClearance=()=>{};s.resetPlayerInterpolation=()=>{};s.updateAssetWarmup=()=>{};s.getAvoidanceVector=()=>s.tmpAvoidance.set(0,0,0);s.setHyperdriveStatus=(message)=>s.hyperdriveStatus=message;s.requestDroneDeparture=()=>true;s.recallMiningDrones=()=>{};s.playerExposureRange=()=>0;s.combatEncounterScale=()=>0;s.hyperdriveCooldownRemaining=()=>0;s.jumpCounter=0;s.lineBlocked=()=>false;
 return s;
}
