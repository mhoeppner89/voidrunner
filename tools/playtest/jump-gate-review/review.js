import * as T from 'three';
import {SpaceRenderer} from '/src/game/render.js';
import {loadGlb} from '/src/game/glbLoader.js';
const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new T.Scene();scene.background=new T.Color(0x07111d);scene.add(new T.HemisphereLight(0x9aadc5,0x20212a,1.1));
const sun=new T.DirectionalLight(0xffe4c2,2.6);sun.position.set(-700,850,1200);scene.add(sun);
const rim=new T.DirectionalLight(0x79a5d3,.9);rim.position.set(700,100,-900);scene.add(rim);
const camera=new T.PerspectiveCamera(45,1,.1,12000),target=new T.Vector3();let yaw=.55,pitch=.22,distance=2000,gate;
const helper=Object.create(SpaceRenderer.prototype);helper.jumpPointVisuals=[];
function build(){if(gate)scene.remove(gate);helper.jumpPointVisuals=[];const red=document.querySelector('#system').value==='red';
 gate=helper.createJumpPointVisual('review',{position:[0,0,1],radius:460},new T.Color(red?'#d26759':'#80bad0'),new T.Color('#202c38'),()=>.5);const visual=helper.jumpPointVisuals[0];visual.portal.material.opacity=.027;visual.portalGlow.material.opacity=.12;scene.add(gate);orbit();}
const ship=await loadGlb('/assets/models/ships/wayfarer.glb');ship.scale.setScalar(6.1);ship.rotation.y=Math.PI/2;ship.position.set(180,-95,125);scene.add(ship);
function orbit(){camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance).add(target);camera.lookAt(target);renderer.render(scene,camera);}
function setView(view){if(view==='overview'){target.set(0,0,0);distance=2000;yaw=.55;pitch=.22;}else if(view==='approach'){target.set(0,0,0);distance=1250;yaw=.1;pitch=.04;}else if(view==='rear'){target.set(0,0,0);distance=1800;yaw=3.7;pitch=.22;}else{target.set(310,0,0);distance=450;yaw=.6;pitch=.15;}orbit();}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>setView(button.dataset.view);document.querySelector('#system').onchange=build;
let pointer;canvas.onpointerdown=e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=()=>pointer=undefined;canvas.onpointermove=e=>{if(!pointer)return;yaw-=(e.clientX-pointer[0])*.005;pitch=T.MathUtils.clamp(pitch+(e.clientY-pointer[1])*.005,-1.45,1.45);pointer=[e.clientX,e.clientY];orbit();};canvas.onwheel=e=>{e.preventDefault();distance=T.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),150,5000);orbit();};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();orbit();}window.addEventListener('resize',resize);build();resize();
document.querySelector('#status').textContent=`${renderer.info.render.calls} draw calls`;window.gateReview={scene,camera,renderer,setView,get gate(){return gate;}};window.ready=true;
