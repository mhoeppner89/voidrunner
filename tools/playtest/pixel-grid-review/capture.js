// Review-only access to a quarantined real game session. Rendering and camera
// changes here never enter the shipped runtime or a player's saved career.
import * as THREE from 'three';
import {LOCATIONS} from '/src/game/data.js';
import {GRAVEYARD_MODEL_WRECKS} from '/src/game/worldData.js';

const v = values => new THREE.Vector3(...values);
let baseHeading, eye, movingTarget, sceneId;

async function prepare(id) {
 const r=window.__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,p=r.save.player;
 cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);r.save.world.time=240;
 sceneId=id;
 if(id==='concourse'){
  const view=r.ui.concourseShip;
  view.stop();
  view.applyPose({x:0,y:.14,z:0,yaw:0,pitch:0,roll:0,scale:1,thrust:.08});
  view.render();
  return {id,dockedAt:p.dockedAt};
 }
 if(p.dockedAt)await r.launch();
 cancelAnimationFrame(r.frameId);r.ui.concourseShip.pause();
 for(const object of window.reviewCombatObjects??[])ren.scene.remove(object);
 window.reviewCombatObjects=[];
 for(const fx of ren.effects??[])if(fx.object)ren.scene.remove(fx.object);
 if(ren.effects)ren.effects.length=0;
 r.ships=[];p.velocity.fill(0);p.angularVelocity.fill(0);p.throttle=0;
 p.currentTargetId=undefined;p.navTargetId='shardbelt';r.autopilot=false;r.afterburning=false;
 let target,location;
 if(id==='planet'){
  location='azure';target=v(LOCATIONS.azure.position);
  eye=target.clone().add(new THREE.Vector3(85000,40000,110000));
 }else if(id==='asteroids'){
  location='shardbelt';target=v(LOCATIONS.shardbelt.position).add(new THREE.Vector3(0,-70,0));
  eye=v(LOCATIONS.shardbelt.position).add(new THREE.Vector3(-1700,580,2050));
 }else if(id==='graveyard'){
  location='mourning-line';const wreck=GRAVEYARD_MODEL_WRECKS.find(w=>w.class==='battleship');
  target=v(LOCATIONS[location].position).add(v(wreck.local));
  eye=target.clone().add(new THREE.Vector3(1700,1000,1850));target.y-=500;
  await ren.ensureGraveyardModels();
 }else if(id==='station'||id==='ship'){
  location='helix';target=v(LOCATIONS.helix.position);
  eye=target.clone().add(new THREE.Vector3(1500,450,1700));target.y-=220;
  await ren.ensureStationModels(p.systemId);
 }else if(id==='combat'){
  location='shardbelt';target=v(LOCATIONS.shardbelt.position);
  eye=target.clone().add(new THREE.Vector3(-1700,580,2050));target.y-=70;
 }else throw new Error(`Unknown scene ${id}`);
 p.position.splice(0,3,...eye.toArray());r.resetPlayerInterpolation(true);r.updateActiveInstance(true);
 if(location==='shardbelt'||location==='mourning-line'){r.activeInstanceId=location;ren.setActiveInstance(location);}
 ren.camera.position.copy(eye);ren.camera.lookAt(target);
 if(id==='planet'){ren.camera.rotateY(.23);ren.camera.rotateX(-.10);}
 ren.camera.updateMatrixWorld();baseHeading=ren.camera.quaternion.clone();baseHeading.toArray(p.rotation);
 const traffic=[['wayfarer',id==='ship'?30:85,id==='ship'?0:-.24,id==='ship'?0:.10,'independent-bands'],['talon',240,.24,.18,'concord'],['atlas',620,-.08,.27,'independent-surveyor'],['lancer',1200,.36,.28,'alliance']];
 for(const [hull,d,x,y,livery] of traffic){
  const pos=new THREE.Vector3(x*d,y*d,-d).applyQuaternion(baseHeading).add(eye);
  const ship=r.spawnShip('patrol',pos.toArray(),undefined,`Review ${hull}`,{tier:'veteran',temperament:'steady'},{hullId:hull,faction:hull==='lancer'?'alliance':hull==='talon'?'concord':'independents',livery});
  ship.rotation=new THREE.Quaternion().copy(baseHeading).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.10,.45+hull.length*.09,-.12))).toArray();
  ship.velocity.fill(0);ship.throttle=.24;ship.hostile=false;ship.instanceId=location;
  ship.playerSensorAwareness=1;ship.identifiedByPlayer=true;ship.playerIdentified=true;ship.scanned=true;
 }
 ren.syncShips(r.ships);await Promise.allSettled([...ren.glbShipLoading.values()]);ren.syncShips(r.ships);
 p.currentTargetId=r.ships[0].id;movingTarget=r.ships[0];r.resetPlayerInterpolation(true);
 r.syncRender(0,performance.now());ren.camera.position.copy(eye);ren.camera.quaternion.copy(baseHeading);ren.camera.updateMatrixWorld();
 if(id==='combat'){
  // Real game effects, kept in the same positions for each candidate grid.
  const fromView=(x,y,z)=>new THREE.Vector3(x,y,z).applyQuaternion(baseHeading).add(eye);
  for(const [i,[x,y,d]] of [[-.36,.09,105],[-.23,.03,145],[-.12,-.02,185],[.18,.1,100],[.10,.07,150]].entries()){
   const bolt=ren.createProjectileMesh({kind:'laser',faction:i<3?'player':'pirates'});
   bolt.position.copy(fromView(x*d,y*d,-d));
   bolt.quaternion.copy(baseHeading).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.18,i<3?.8:-.8,.1)));
   bolt.scale.setScalar(2);
   ren.scene.add(bolt);window.reviewCombatObjects.push(bolt);
  }
  ren.spawnImpact(fromView(-24,12,-100).toArray(),0xffc36a,true);
 }
 ren.render();
 return {id,location,ships:r.ships.map(s=>({hull:s.hullId,model:!!ren.shipMeshes.get(s.id)?.userData?.glb,visible:ren.projectToScreen(s.position).visible}))};
}

function setGrid(height){
 const r=window.__VOID_PRIVATEER__.getRuntime(),ren=r.renderer;
 const width=window.innerWidth,screenHeight=window.innerHeight;
 if(sceneId==='concourse'){
  const view=r.ui.concourseShip;view.resize();
  if(height){
   const logicalWidth=Math.round(width*height/screenHeight),scale=width/logicalWidth;
   view.resizeOutput(logicalWidth,height,scale);
   view.sceneViewport.set(0,0,logicalWidth,height);
   view.deck.uniforms.uDeckResolution.value.set(logicalWidth,height);
  }
  view.render();
  return {width:view.sceneViewport.z,height:view.sceneViewport.w};
 }
 ren.resize();
 if(height){
  const logicalWidth=Math.round(width*height/screenHeight);
  ren.renderer.setSize(logicalWidth,height,false);
  ren.renderer.domElement.style.width=`${width}px`;
  ren.renderer.domElement.style.height=`${screenHeight}px`;
  if(ren.bloomSceneTarget)ren.resizeBloomTargets();
  if(ren.pixelSceneTarget)ren.ensurePixelPipeline();
 }
 ren.render();
 return {width:ren.renderer.domElement.width,height:ren.renderer.domElement.height};
}

function render(frame=0,total=1){
 const r=window.__VOID_PRIVATEER__.getRuntime(),ren=r.renderer;
 if(sceneId==='concourse'){r.ui.concourseShip.render();return;}
 // A slow, repeatable head turn reveals edge shimmer without changing the
 // game simulation, camera path, lighting or ship positions between options.
 const phase=frame/total*Math.PI*2;
 const offset=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(phase)*.009,Math.sin(phase)*.028,0));
 ren.camera.position.copy(eye);ren.camera.quaternion.copy(baseHeading).multiply(offset);ren.camera.updateMatrixWorld();
 if(movingTarget){
  const point=ren.projectToScreen(movingTarget.position),bracket=document.querySelector('#target-bracket');
  if(bracket&&point.visible)bracket.style.transform=`translate(${point.x}px, ${point.y}px)`;
 }
 ren.render();
}
window.pixelGridCapture={prepare,setGrid,render};
