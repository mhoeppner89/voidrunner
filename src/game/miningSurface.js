import * as THREE from 'three';
import {asteroidCollisionMesh,asteroidCollisionRadius} from './worldData.js';
const up=new THREE.Vector3(0,1,0);
// Pick contacts on the actual rock triangles once, then keep them fixed to
// the rotating rock rather than sliding the miners around with the player.
export function createMiningContacts(node, shipPosition, count) {
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(node.rotation??[0,0,0]))),inv=q.clone().invert();
 const facing=new THREE.Vector3().fromArray(shipPosition).sub(new THREE.Vector3().fromArray(node.position)).normalize().applyQuaternion(inv);
 const tangent=new THREE.Vector3().crossVectors(up,facing).normalize();if(tangent.lengthSq()<.01)tangent.set(1,0,0);
 const vertical=new THREE.Vector3().crossVectors(facing,tangent).normalize();
 const radius=asteroidCollisionRadius(node),mesh=asteroidCollisionMesh(node),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3(),ray=new THREE.Ray();
 const contacts=[];
 for(let i=0;contacts.length<count&&i<count*32;i++){
  const columns=Math.min(3,count),rows=Math.ceil(count/columns);
  const angle=i*2.399963, ring=4+Math.sqrt(i)*2;
  const u=i<count?(i%columns-(columns-1)/2)*4:Math.cos(angle)*ring;
  const v=i<count?(Math.floor(i/columns)-(rows-1)/2)*4:Math.sin(angle)*ring;
  const direction=facing.clone().multiplyScalar(Math.max(2,radius*.65)).addScaledVector(tangent,u).addScaledVector(vertical,v).normalize();
  ray.origin.copy(direction).multiplyScalar(radius*4);ray.direction.copy(direction).negate();
  let nearest=Infinity;const position=direction.clone().multiplyScalar(radius),normal=direction.clone(),centre=new THREE.Vector3(),candidate=new THREE.Vector3();
  const indices=mesh.indices;
  for(let j=0;j<(indices?.length??mesh.verts.length/3);j+=3){
   a.fromArray(mesh.verts,(indices?indices[j]:j)*3);b.fromArray(mesh.verts,(indices?indices[j+1]:j+1)*3);c.fromArray(mesh.verts,(indices?indices[j+2]:j+2)*3);
   if(ray.intersectTriangle(a,b,c,false,hit)){const d=hit.distanceToSquared(ray.origin);if(d<nearest){nearest=d;position.copy(hit);centre.copy(a).add(b).add(c).multiplyScalar(1/3);
    // Prefer the middle of a facet so a long cutter arm does not enter the
    // adjacent ridge, but preserve room for the other miners on that facet.
    for(const blend of [.65,.4,.2,0]){candidate.copy(hit).lerp(centre,blend);if(contacts.every(contact=>contact.position.distanceToSquared(candidate)>9)){position.copy(candidate);break;}}
    normal.crossVectors(b.sub(a),c.sub(a)).normalize();if(normal.dot(direction)<0)normal.negate();}}
  }
  if(i>=count*31||contacts.every(contact=>contact.position.distanceToSquared(position)> (i<count*24?9:.1)))contacts.push({position,normal});
 }
 return {node,count,contacts,q,normal:new THREE.Vector3(),position:new THREE.Vector3(),rotation:new THREE.Quaternion(),euler:new THREE.Euler()};
}
export function updateMiningContacts(cache,points,ids,dt) {
 const {node,q,normal,position,rotation}=cache;
 q.setFromEuler(cache.euler.set(...(node.rotation??[0,0,0])));
 for(let i=0;i<ids.length;i++){
  const target=points[ids[i]],contact=cache.contacts[i];if(!target||!contact)continue;
  normal.copy(contact.normal).applyQuaternion(q);
  position.copy(contact.position).applyQuaternion(q).addScaledVector(normal,.43);
  target.rotation??=[0,0,0,1];target.normal??=[0,1,0];target.lift??={position:[0,0,0],velocity:target.velocity};
  rotation.setFromUnitVectors(up,normal).toArray(target.rotation);normal.toArray(target.normal);
  for(let k=0;k<3;k++){
   const value=position.getComponent(k)+node.position[k];
   target.velocity[k]=target.contactReady&&dt>0?(value-target.position[k])/dt:(node.moving?node.velocity?.[k]??0:0);
   target.position[k]=value;target.lift.position[k]=value+normal.getComponent(k)*3;
  }
  target.contactReady=true;
 }
}
