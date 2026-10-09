import * as THREE from 'three';
import {BATTLESHIP_MOUNTS} from './battleshipModelData.js';
import {createCruiserTurret,createCruiserPdc} from './cruiserModels.js';
import {paintFrigateTurret} from './turretModels.js';

// The approved visual batteries retain their measured, clear rest poses.
// Combat balance continues to use the battleship's existing weapon profile.
export function createBattleshipArmament(paint){
 const root=new THREE.Group();root.name='battleship-armament';
 for(const m of BATTLESHIP_MOUNTS){
  const gun=m.kind==='battery'?createCruiserTurret():createCruiserPdc();
  gun.position.fromArray(m.position);gun.scale.setScalar(m.size);
  gun.rotation.z=m.axis===0?-m.side*Math.PI/2:m.side<0?Math.PI:0;
  gun.userData.yaw.rotation.y=m.yawRadians;gun.userData.pitch.rotation.x=m.pitchRadians;
  paintFrigateTurret(gun,paint);gun.name=m.label;root.add(gun);
 }
 return root;
}
