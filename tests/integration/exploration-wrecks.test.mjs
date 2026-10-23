import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../../vendor/three.module.min.js';
import {session} from '../helpers/session.mjs';
import {GameSession} from '../../src/game/game.js';
import {SpaceRenderer,GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';
import {ShipWreckFactory} from '../../src/game/shipWreckFx.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {derelictSurfaceObstacles,createDerelictVents} from '../../src/game/derelictFx.js';
import {shipVsObstacle} from '../../src/game/shipCollision.js';
import {segmentMeshHit} from '../../src/game/meshQueries.js';
import {GRAVEYARD_MODEL_COLLIDERS} from '../../src/game/worldData.js';
import {LOCATIONS} from '../../src/game/data.js';
import {FREIGHTER_POSITION,FREIGHTER_WRECK_ID,GRAVEYARD_CACHES} from '../../src/game/explorationData.js';
const q=new T.Quaternion();
const carrier=GRAVEYARD_MODEL_COLLIDERS.filter(o=>o.modelClass==='carrier').map(o=>({id:o.id,x:o.position[0],y:o.position[1],z:o.position[2],radius:o.collisionRadius,losRadius:o.collisionRadius,meshVerts:o.meshVerts,meshIndices:o.meshIndices,minReach:o.minReach,surfaceOnly:o.surfaceOnly,box:{qx:o.quaternion[0],qy:o.quaternion[1],qz:o.quaternion[2],qw:o.quaternion[3]}}));
test('carrier plating collides at the former embedded crate; relocated cargo has an unobstructed outside approach',()=>{
 const old=new T.Vector3(...LOCATIONS['mourning-line'].position).add(new T.Vector3(-961,857,-2262));
 assert.ok(carrier.some(ob=>shipVsObstacle(old,q,'kestrel',.96,ob,{})),'the old decimated deck missed this visible skin');
 const p=new T.Vector3(...GRAVEYARD_CACHES.find(c=>c.id==='carrier').position),axis=new T.Vector3(0,1,0).applyEuler(new T.Euler(.04,-1.21,.05));
 for(let d=0;d<=100;d+=2){const point=p.clone().addScaledVector(axis,d);assert.ok(!carrier.some(ob=>shipVsObstacle(point,q,'kestrel',.96,ob,{})),`carrier approach at ${d} km`);}
 assert.ok(!carrier.some(ob=>segmentMeshHit(p.clone().addScaledVector(axis,100),p,ob)!==undefined));
});
test('posed freighter fragments stop ships and shots while the nearby cargo remains accessible',async()=>{
 const bitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:1,height:1});
 const factory=new ShipWreckFactory();let effect,vents;
 try{
  const config=GLB_SHIP_CONFIG['atlas-freighter'],bytes=await readFile(config.path??`assets/models/ships/${config.file}`),model=await buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  model.rotation.y=config.yaw;model.scale.setScalar(config.scale*npcShipScaleForVariant('atlas-freighter'));
  const root=new T.Group();root.userData.glb=true;root.add(model);root.scale.setScalar(config.baseScale??.92);root.position.fromArray(FREIGHTER_POSITION);root.position.z-=65;root.rotation.set(.18,.6,-.28);root.updateMatrixWorld(true);
  effect=factory.create(root,{id:FREIGHTER_WRECK_ID,position:FREIGHTER_POSITION,velocity:[0,0,0]});effect.update(5);
  const obstacles=derelictSurfaceObstacles(effect.object,FREIGHTER_WRECK_ID);assert.ok(obstacles.length>=7);
  const ob=obstacles[0],v=ob.meshVerts,ix=ob.meshIndices,a=new T.Vector3().fromArray(v,ix[0]*3),b=new T.Vector3().fromArray(v,ix[1]*3),c=new T.Vector3().fromArray(v,ix[2]*3);
  const point=a.clone().add(b).add(c).multiplyScalar(1/3).add(new T.Vector3(ob.x,ob.y,ob.z)),normal=b.sub(a).cross(c.sub(a)).normalize();
  assert.ok(shipVsObstacle(point,q,'kestrel',.96,ob,{}));assert.notEqual(segmentMeshHit(point.clone().addScaledVector(normal,10),point.clone().addScaledVector(normal,-10),ob),undefined);
  const s=session();s.tmpCollide=new T.Vector3();s.damagePlayer=()=>{};s.obstacles=obstacles;const before=point.clone();s.resolvePlayerCollisions(point,new T.Vector3(0,0,-30));assert.ok(point.distanceTo(before)>.001,'actual flight collision must push the hull away');
  const loot=new T.Vector3(...FREIGHTER_POSITION);assert.ok(!obstacles.some(o=>shipVsObstacle(loot,q,'kestrel',.96,o,{})));
  assert.ok(!obstacles.some(o=>segmentMeshHit(loot.clone().add(new T.Vector3(0,0,100)),loot,o)!==undefined));
  vents=createDerelictVents(effect.object,effect.sections);assert.equal(vents.anchors.length,3);assert.equal(vents.object.geometry.instanceCount,18);vents.update(1);assert.equal(vents.object.material.uniforms.time.value,1);assert.ok(vents.anchors.every(a=>a.position.toArray().every(Number.isFinite)));
 }finally{vents?.dispose();effect?.dispose();factory.dispose();globalThis.createImageBitmap=bitmap;}
});
test('new derelict surfaces invalidate the open-space obstacle grid immediately and remain system scoped',()=>{
 const s=session(),ob={id:'derelict:test',x:100,y:100,z:100,radius:10,losRadius:10};
 s.renderer.derelictCollisionObstacles=new Map([['test',{systemId:s.save.player.systemId,obstacles:[ob]}]]);s.renderer.staticObstacleRevision=1;
 s.activeFieldObstacles=GameSession.prototype.activeFieldObstacles;s.obstacleGrid=new Map();s.obstacleGridRevision=0;s.obstacleGridBuiltAt=s.save.world.time;s.obstacleCellSize=256;
 s.ensureObstacleGrid();assert.equal(s.obstacleGridRevision,1);assert.ok([...s.obstacleGrid.values()].flat().includes(ob));
 s.save.player.systemId='meridian-reach';assert.deepEqual(s.activeFieldObstacles(),[]);
});
