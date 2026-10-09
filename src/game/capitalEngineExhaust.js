import * as THREE from 'three';
import {CRUISER_MOUNTS} from './cruiserModelData.js';
import {FRIGATE_MOUNTS,FRIGATE_ENGINE_MOUNTS} from './frigateMounts.js';
import {BATTLESHIP_ENGINE_GLOWS} from './battleshipModelData.js';
import {CARRIER_ENGINE_GLOWS} from './carrierModelData.js';

const quad=new THREE.PlaneGeometry(1,1);quad.userData.shared=true;
const haloPixels=new Uint8Array(64*64*4);
for(let y=0;y<64;y++)for(let x=0;x<64;x++){
 const r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),i=(y*64+x)*4;
 haloPixels.set([100,195,255,Math.round(255*Math.exp(-r*r*5)*Math.max(0,1-r))],i);
}
const haloMap=new THREE.DataTexture(haloPixels,64,64);haloMap.colorSpace=THREE.SRGBColorSpace;haloMap.needsUpdate=true;haloMap.userData.shared=true;
const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const fragmentShader=`varying vec2 vUv;uniform float uTime,uOutput,uDrive,uJet,uInnerRadius;
void main(){
 vec2 p=(vUv-.5)*2.;float r=length(p);vec3 color;float alpha;
 if(uJet>.5){
  float q=vUv.y,width=mix(.78,.12,q),crossSection=abs(p.x)/width;
  float density=exp(-crossSection*crossSection*4.5);
  alpha=density*(1.-smoothstep(.0,1.,q))*(1.-smoothstep(.7,1.,crossSection))*smoothstep(.02,.24,q)*(.11+.15*uDrive);
  color=mix(vec3(.05,.30,.8),vec3(.24,.69,1.),exp(-q*3.));
 }else{
  float edge=1.-smoothstep(.83,1.,r),core=exp(-r*r*7.);
  float rings=.055*pow(.5+.5*cos(r*38.-uTime*.9),4.)*smoothstep(.2,.6,r);
  color=mix(vec3(.015,.22,.58),vec3(.18,.72,1.),exp(-r*r*2.));
  color=mix(color,vec3(.82,.97,1.),core)+rings;
  alpha=edge*(.82+.12*sin(uTime*2.)*sin(uTime*1.3));
  if(uInnerRadius>0.)alpha*=smoothstep(uInnerRadius,uInnerRadius+.03,r);
 }
 gl_FragColor=vec4(color,alpha*uOutput);
 #include <colorspace_fragment>
}`;
function shader(jet,phase,innerRadius=0){return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{uTime:{value:phase},uOutput:{value:1},uDrive:{value:.35},uJet:{value:jet},uInnerRadius:{value:innerRadius}},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,toneMapped:false});}
function renderOnly(o){o.raycast=()=>{};return o;}
export function capitalExhaustLayout(variant){
 if(variant==='concord-battleship')return BATTLESHIP_ENGINE_GLOWS;
 if(variant==='concord-carrier')return CARRIER_ENGINE_GLOWS;
 if(variant==='concord-cruiser')return CRUISER_MOUNTS.filter(m=>m.kind==='engine').map(m=>({index:m.index,maxHull:m.hull,radius:m.radius*.77,position:[m.position[0],m.position[1],564.0942*1.001]}));
 if(variant==='concord-frigate')return FRIGATE_ENGINE_MOUNTS.map(index=>{const m=FRIGATE_MOUNTS[index];return {index,maxHull:m.hull,radius:m.radius*.68,position:[m.position[0]*37.46,m.position[1]*44.92,m.position[2]*112.9+.46]};});
 return [];
}
export function createCapitalEngineExhaust(variant){
 const root=new THREE.Group();root.name='capital-engine-exhaust';
 for(const [i,m] of capitalExhaustLayout(variant).entries()){
  const drive=new THREE.Group();drive.position.fromArray(m.position);drive.userData.layout=m;
  const face=renderOnly(new THREE.Mesh(quad,shader(0,i*.8,m.innerRadius??0)));face.name='exhaust-core';face.scale.set(m.radius*2,m.radius*2,1);drive.add(face);
  const halo=renderOnly(new THREE.Mesh(quad,new THREE.MeshBasicMaterial({map:haloMap,color:0x8cdcff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.22,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,toneMapped:false})));
  halo.name='exhaust-halo';halo.position.z=.08;halo.scale.set(m.radius*3.3,m.radius*3.3,1);halo.visible=m.halo!==false;drive.add(halo);
  const jets=[];
  for(let k=0;k<(m.jets===false?0:2);k++){
   const jet=renderOnly(new THREE.Mesh(quad,shader(1,i*.8)));jet.name='exhaust-plume';jet.rotation.x=Math.PI/2;
   if(k)jet.rotateOnWorldAxis(new THREE.Vector3(0,0,1),Math.PI/2);
   drive.add(jet);jets.push(jet);
  }
  drive.userData.face=face;drive.userData.halo=halo;drive.userData.jets=jets;root.add(drive);
 }
 return root;
}
export function updateCapitalEngineExhaust(root,ship,time=0){
 const v=ship.velocity??[0,0,0],drive=ship.stationDock?.phase==='docked'?0:ship.burning?1:Math.min(1,Math.hypot(v[0],v[1],v[2])/Math.max(1,ship.capitalBaseSpeed??ship.speed??1))*.7+.15;
 for(let i=0;i<root.children.length;i++){
  const engine=root.children[i],{layout:m,face,halo,jets}=engine.userData;
  const health=Math.max(0,Math.min(1,(ship.capitalMountHull?.[m.index]??m.maxHull)/m.maxHull));engine.visible=health>0&&ship.stationDock?.phase!=='docked';
  face.material.uniforms.uTime.value=time+i*.8;face.material.uniforms.uOutput.value=health;face.material.uniforms.uDrive.value=drive;
  halo.material.opacity=health*(.13+.1*drive);
  const length=m.radius*(.65+drive*1.4);
  for(const jet of jets){jet.scale.set(m.radius*1.65,length,1);jet.position.z=length/2+.1;jet.material.uniforms.uTime.value=time+i*.8;jet.material.uniforms.uOutput.value=health;jet.material.uniforms.uDrive.value=drive;}
 }
}
