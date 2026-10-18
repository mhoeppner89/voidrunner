import {test} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {GameSession} from '../../src/game/game.js';
import {GRAVEYARD_MODEL_WRECKS,generateGraveyardPieces,generateWreckNodes} from '../../src/game/worldData.js';
import {LOCATIONS} from '../../src/game/data.js';
const origin=new T.Vector3(...LOCATIONS['mourning-line'].position);
function setup(){
 const s=session();s.activeInstanceId='mourning-line';s.tmpCollide=new T.Vector3();s.save.player.position=origin.clone().addScalar(15000).toArray();
 s.graveyard=generateGraveyardPieces(175);s.wreckNodes=generateWreckNodes(175,{});s.obstacles=GameSession.prototype.activeFieldObstacles.call(s);
 // Same spherical broadphase acceptance as the runtime grid, without a DOM.
 s.forEachObstacleInBox=(x0,y0,z0,x1,y1,z1,fn)=>{for(const o of s.obstacles){const r=o.radius;if(o.x+r>=x0&&o.x-r<=x1&&o.y+r>=y0&&o.y-r<=y1&&o.z+r>=z0&&o.z-r<=z1)fn(o);}};
 return s;
}
const results=[];
for(const hull of (process.env.VR_NPC_HULLS??'scrapper,wayfarer,torsas').split(','))test(`${hull} pilots both directions through the natural torn-section gaps`,()=>{
 for(const wreck of GRAVEYARD_MODEL_WRECKS.filter(w=>w.passages))for(const route of wreck.passages)for(const sign of [-1,1]){
  const s=setup(),rotation=new T.Quaternion().setFromEuler(new T.Euler(...wreck.rotation));
  const point=t=>new T.Vector3(...route.center).add(new T.Vector3(0,0,route.halfLength*t)).multiplyScalar(wreck.scale).applyQuaternion(rotation).add(new T.Vector3(...wreck.local)).add(origin);
  const from=point(-sign),to=point(sign),direction=to.clone().sub(from).normalize(),ship=s.spawnShip('patrol',from.toArray(),undefined,undefined,{tier:'veteran',temperament:'steady'},{hullId:hull});
  assert.equal(ship.hullId,hull,'the test must fly the requested hull');
  ship.instanceId='mourning-line';ship.destination=to.toArray();ship.task={kind:'patrol'};ship.rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),direction).toArray();ship.velocity=direction.clone().multiplyScalar(40).toArray();
  const health=ship.shield+ship.hull;let arrived=false,crossed=false,contacts=0,i=0,nearest=Infinity,crossing;
  const inv=rotation.clone().invert(),anchor=origin.clone().add(new T.Vector3(...wreck.local));
  for(;i<60*180;i++){
   s.save.world.time+=1/60;s.updateTravelAI(ship,1/60);const before=[...ship.position];s.resolveNpcCollisions(ship);
   if(ship.position.some((v,j)=>Math.abs(v-before[j])>.001))contacts++;
   const p=new T.Vector3(...ship.position),local=p.clone().sub(anchor).applyQuaternion(inv).multiplyScalar(1/wreck.scale).sub(new T.Vector3(...route.center));
   if(Math.abs(local.z)<nearest){nearest=Math.abs(local.z);crossing=local.toArray();}
   if(Math.abs(local.z)<.04&&Math.abs(local.x)<route.openingHalfWidth&&Math.abs(local.y)<route.openingHalfHeight)crossed=true;
   if(p.distanceTo(to)<45){arrived=true;break;}
  }
  const result={hull,wreck:wreck.id,route:route.id,sign,seconds:i/60,arrived,crossed,contacts,damage:health-(ship.shield+ship.hull),crossing,position:ship.position};results.push(result);
  // Pilots may bank within the full fracture opening; the smaller central
  // clearance rectangle reserves a straight player route through it.
  assert.ok(arrived&&crossed&&contacts===0&&result.damage===0,JSON.stringify(result));
 }
});
test.after(async()=>{await mkdir('output/graveyard-review',{recursive:true});await writeFile('output/graveyard-review/npc-routes.json',JSON.stringify(results,null,2));console.log(`${results.length} NPC traversals; ${results.reduce((n,r)=>n+r.contacts,0)} contacts; ${results.reduce((n,r)=>n+r.damage,0)} damage`);});
