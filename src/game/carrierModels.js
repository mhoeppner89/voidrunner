import * as THREE from 'three';
import {CARRIER_MOUNTS} from './carrierModelData.js';

// The approved GLB includes the painted guns and their exact local transforms.
// Bind its joints after cloning; generating factory guns would duplicate them
// and lose the physically calibrated armor UVs.
export function bindCarrierArmament(model){
 const guns=CARRIER_MOUNTS.map(m=>model.getObjectByName(m.label));
 if(guns.every(g=>!g))return null; // Older hulls remain available for comparison.
 if(guns.some(g=>!g))throw new Error('Incomplete carrier armament');
 const root=new THREE.Group();root.name='carrier-armament';model.add(root);
 for(const [i,gun] of guns.entries()){
  const m=CARRIER_MOUNTS[i],yaw=gun.getObjectByName(m.yawNode),pitch=gun.getObjectByName(m.pitchNode);
  if(!yaw||!pitch)throw new Error(`Missing carrier joints: ${m.label}`);
  yaw.matrixAutoUpdate=true;pitch.matrixAutoUpdate=true;
  gun.userData.yaw=yaw;gun.userData.pitch=pitch;
  gun.userData.safeYawDegrees=m.safeYawDegrees;gun.userData.safeElevationDegrees=m.safeElevationDegrees;
  root.add(gun);
 }
 return root;
}
