import * as THREE from 'three';
import {loadGlb} from './glbLoader.js';
import {disposeObject} from './shipPreview.js';
import {LOCATIONS} from './data.js';
import {playerBerth} from './playerDocking.js';
import {stationModelOffsetZ,stationVisualSurfaceRadius} from './stationTraffic.js';
import {STATION_DOCKS} from './stationDocks.js';
import {addStationOccupants} from './stationOccupants.js';
import {freezeStaticTransforms} from './renderWork.js';
import {applySpaceLighting} from './spaceLighting.js';
import {stationYaw,stationRotatePoint} from './stationOrientation.js';

export const STATION_TRANSIT_DURATION={entry:4200,exit:3600};
const ease=t=>t*t*(3-2*t),forward=new THREE.Vector3(0,0,-1);
// Real authored berth coordinates and the same normalized GLB transform as
// flight. The film owns only one station at a time and reuses the dock renderer.
export class StationTransit {
 constructor(patchMaterial,occupantScale){
  this.patchMaterial=patchMaterial;this.occupantScale=occupantScale;this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,1,.04,350);
  this.scene.matrixAutoUpdate=false;
  this.point=new THREE.Vector3();this.look=new THREE.Vector3();this.out=new THREE.Vector3();this.right=new THREE.Vector3();this.pad=new THREE.Vector3();this.gate=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.euler=new THREE.Euler();
  this.hemi=new THREE.HemisphereLight(0x809cbd,0x182636,1.5);this.key=new THREE.DirectionalLight(0xffebcf,2.6);this.key.position.set(-18,30,24);this.rim=new THREE.DirectionalLight(0x79baf5,1.8);this.rim.position.set(20,6,-20);this.scene.add(this.hemi,this.key,this.rim);
  this.fill=new THREE.AmbientLight();this.scene.add(this.fill);
  this.engineLight=new THREE.PointLight(0x70ceff,.32,2,2);this.scene.add(this.engineLight);
  this.geometry=new THREE.PlaneGeometry(2,2);
  this.background=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:`varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 cell=floor(vUv*vec2(700.,430.));float star=step(.997,hash(cell))*pow(hash(cell+19.),3.);vec3 colour=mix(vec3(.002,.004,.012),vec3(.012,.025,.045),exp(-length((vUv-vec2(.6,.4))*vec2(1.5,1.))*3.));gl_FragColor=vec4(colour+vec3(star*.7),1.);}`});
  const sky=new THREE.Mesh(this.geometry,this.background);sky.frustumCulled=false;sky.renderOrder=-100;this.scene.add(sky);
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(73.8,40,24),new THREE.MeshStandardMaterial({color:0x343947,roughness:1,metalness:0}));this.moon.position.set(0,0,-75.15);this.moon.visible=false;this.scene.add(this.moon);
 }
 prepare(id){
  if(this.id===id)return this.ready;
  this.id=id;const generation=this.generation=(this.generation??0)+1;
  this.ready=loadGlb(`assets/models/stations/${id}.glb`).then(async model=>{
   if(this.disposed||generation!==this.generation){disposeObject(model);return false;}
   try{await addStationOccupants(model,id,undefined,hull=>this.occupantScale?.(id,hull));}
   catch(error){disposeObject(model);throw error;}
   if(this.disposed||generation!==this.generation){disposeObject(model);return false;}
   if(this.model){this.scene.remove(this.model);disposeObject(this.model);}
   this.model=model;model.scale.setScalar(.18);model.name=`cinematic-station-${id}`;
   freezeStaticTransforms(model);
   model.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.fog=false;m.envMapIntensity=.3;this.patchMaterial?.(m);for(const t of Object.values(m))if(t?.isTexture){t.anisotropy=2;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.NearestFilter;}}});
   this.scene.add(model);return true;
  }).catch(error=>{if(generation===this.generation){this.id=undefined;this.ready=undefined;}throw error;});return this.ready;
 }
 configure(pivot,environment,id,direction,data={},profile){
  this.scene.add(pivot);this.scene.environment=environment;this.direction=direction;this.duration=STATION_TRANSIT_DURATION[direction];
  this.cameraLayout=STATION_DOCKS[id]?.cinematic;
  // The cliff port's inhabited caves sit above its exposed landing terrace.
  this.cameraElevation=id==='blackglass'?.25:(this.cameraLayout?.elevation??.3);
  this.cliffPort=id==='blackglass';
  const height=data.height??6,berth=data.berth??playerBerth(id,height),location=LOCATIONS[id],scale=18/stationVisualSurfaceRadius(id);
  const origin=new THREE.Vector3(...stationRotatePoint(id,[location.position[0],location.position[1],location.position[2]+stationModelOffsetZ(id)],location.position));
  if(this.model){this.model.rotation.y=stationYaw(id);this.model.updateMatrix();this.model.updateMatrixWorld(true);}
  this.pad.fromArray(berth.pad).sub(origin).multiplyScalar(scale);this.pad.y-=height*scale;
  this.gate.fromArray(berth.gate).sub(origin).multiplyScalar(scale);this.gate.y-=height*scale;
  this.out.subVectors(this.gate,this.pad).normalize();this.right.crossVectors(new THREE.Vector3(0,1,0),this.out).normalize();
  const length=Math.max(.5,Math.min(1.5,2*Math.max(...(data.extents??[8,6,12]))*scale));this.shipLength=length;this.shipScale=length/(data.hullLength??4);this.shipHeight=(data.hullHeight??1)*this.shipScale;this.engineLight.distance=length*2;
  this.rotation.setFromUnitVectors(forward,this.point.copy(this.out).multiplyScalar(direction==='entry'?-1:1));this.euler.setFromQuaternion(this.rotation);
  this.moon.visible=id==='blackglass';
  this.moon.position.fromArray(stationRotatePoint(id,[0,0,-75.15]));
  applySpaceLighting(this,location.systemId);this.scene.environmentIntensity=1;
  this.update(0);
 }
 resize(aspect){this.camera.aspect=aspect;this.camera.zoom=Math.min(1,aspect/1.35);this.camera.updateProjectionMatrix();}
 update(t){
  this.progress=t;const q=ease(THREE.MathUtils.clamp(t,0,1)),entry=this.direction==='entry';
  this.point.lerpVectors(entry?this.gate:this.pad,entry?this.pad:this.gate,q);
  // Establish the station, then reach the close three-quarter shot before
  // the final fade. Small fighters must remain readable in the larger halls.
  const close=ease(THREE.MathUtils.clamp(t/.72,0,1)),near=Math.max(1.1,this.shipLength*2.2);
  const distance=entry?THREE.MathUtils.lerp(Math.max(10,this.shipLength*9),near,close):near*1.1+q*1.6;
  const side=entry?THREE.MathUtils.lerp(this.cameraLayout?.entrySide??.1,.28,close):.28;
  this.look.copy(this.point);this.look.y+=this.shipHeight*.5;
  // Establish the cliff galleries above the pad; settle back onto the hull
  // for the close shot. The craft stays in the lower third of the wide shot.
  if(this.cliffPort&&entry)this.look.y+=2.5*(1-close);
  this.camera.position.copy(this.look).addScaledVector(this.out,distance).addScaledVector(this.right,distance*side);this.camera.position.y+=distance*this.cameraElevation+(this.cameraLayout?.lift??.2);this.camera.lookAt(this.look);this.camera.updateMatrixWorld();
  this.engineLight.position.copy(this.point).addScaledVector(this.out,(entry?1:-1)*this.shipLength*.4);this.engineLight.position.y+=this.shipHeight*.5;
  return {x:this.point.x,y:this.point.y,z:this.point.z,pitch:this.euler.x,yaw:this.euler.y,roll:this.euler.z,scale:this.shipScale,thrust:entry?.22+.25*(1-q):.5+q*.5,fade:Math.max(0,Math.min(1,t/.09,(1-t)/.12))};
 }
 release(){this.scene.environment=null;}
 dispose(){if(this.disposed)return;this.disposed=true;this.generation=(this.generation??0)+1;this.release();if(this.model)disposeObject(this.model);this.geometry.dispose();this.background.dispose();this.moon.geometry.dispose();this.moon.material.dispose();}
}
