import * as T from 'three';
import {createAsteroidTerrain,getAsteroidTerrain} from '/src/game/asteroidTerrain.js';
import {getAsteroidBaseMeshes,generateAsteroidField} from '/src/game/worldData.js';
import {SHARDBELT_PASSAGES} from '/src/game/asteroidFieldLayout.js';
import {createAsteroidFragmentMaterials,ASTEROID_FINISH_PALETTES,configureAsteroidShadows} from '/src/game/asteroidMaterials.js';
import {LOCATIONS} from '/src/game/data.js';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x070e18);renderer.outputColorSpace=T.SRGBColorSpace;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1,.5,35000);scene.add(new T.HemisphereLight(0xc9dcf0,0x39302c,1.8));
const sun=new T.DirectionalLight(0xffe1af,3.3);sun.position.set(-4000,6000,5000);scene.add(sun);configureAsteroidShadows(renderer,sun,[0,0,0],matchMedia('(pointer: coarse)').matches?512:1024);const rim=new T.DirectionalLight(0x739bc6,.65);rim.position.set(4000,-1000,-5000);scene.add(rim);
const terrain=createAsteroidTerrain();terrain.position.set(0,0,0);scene.add(terrain);
const center=LOCATIONS.shardbelt.position,rocks=generateAsteroidField(718,{}),geometries=getAsteroidBaseMeshes(),matrix=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3(),e=new T.Euler();
const materials=createAsteroidFragmentMaterials(),color=new T.Color();
const batches=[];for(let shape=4;shape<8;shape++)for(const finish of ['iron','dark','ice']){
 const entries=rocks.filter(r=>r.shape===shape&&r.finish===finish);if(!entries.length)continue;
 const mesh=new T.InstancedMesh(geometries[shape].geometry,materials[finish],entries.length);
 entries.forEach((r,i)=>{p.fromArray(r.position).sub(new T.Vector3(...center));q.setFromEuler(e.set(...r.rotation));s.set(...r.scale).multiplyScalar(r.radius);mesh.setMatrixAt(i,matrix.compose(p,q,s));mesh.setColorAt(i,color.setHex(ASTEROID_FINISH_PALETTES[finish].base));});mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);batches.push(mesh);
}
const select=document.querySelector('#passage');for(const route of SHARDBELT_PASSAGES)select.add(new Option(route.name,route.id));
let cameraDriver=null;
let yaw=-2.4,pitch=.35,distance=5300,target=new T.Vector3(),flying=false,elapsed=0,last=0,route=SHARDBELT_PASSAGES[0];
function orbit(){camera.up.set(0,1,0);camera.position.copy(target).add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(distance));camera.lookAt(target);}
function overview(){cameraDriver=null;flying=false;target.set(0,0,0);distance=5300;yaw=-2.4;pitch=.35;orbit();}
function entrance(){flying=false;target.fromArray(route.points[8]);distance=650;yaw=Math.atan2(route.points[0][0]-target.x,route.points[0][2]-target.z);pitch=.12;orbit();}
const curves=new Map(SHARDBELT_PASSAGES.map(r=>[r.id,new T.CatmullRomCurve3(r.points.map(p=>new T.Vector3(...p)))]));
function fly(progress){const curve=curves.get(route.id);camera.position.copy(curve.getPoint(progress));camera.lookAt(curve.getPoint(Math.min(1,progress+.025)));camera.updateMatrixWorld();}
select.onchange=()=>{route=SHARDBELT_PASSAGES.find(r=>r.id===select.value);entrance();};document.querySelector('#overview').onclick=overview;document.querySelector('#orbit').onclick=entrance;document.querySelector('#fly').onclick=()=>{elapsed=0;flying=true;};document.querySelector('#game').onclick=()=>location.href=`./flight.html?passage=${route.id}&revision=0.8.2ij`;
let drag;renderer.domElement.onpointerdown=ev=>{drag=[ev.clientX,ev.clientY];renderer.domElement.setPointerCapture(ev.pointerId);};renderer.domElement.onpointerup=()=>drag=null;renderer.domElement.onpointermove=ev=>{if(!drag)return;flying=false;yaw-=(ev.clientX-drag[0])*.005;pitch=T.MathUtils.clamp(pitch+(ev.clientY-drag[1])*.005,-1.5,1.5);drag=[ev.clientX,ev.clientY];orbit();};renderer.domElement.onwheel=ev=>{ev.preventDefault();flying=false;distance*=Math.exp(ev.deltaY*.001);orbit();};
function frame(time){requestAnimationFrame(frame);const dt=Math.min(.05,(time-last)/1000);last=time;if(cameraDriver)cameraDriver(dt);else if(flying){elapsed+=dt;fly(Math.min(.999,elapsed/24));if(elapsed>=24)flying=false;}renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);}
overview();window.asteroidReview={scene,camera,renderer,terrain,rocks,batches,overview,setCameraDriver:fn=>{flying=false;cameraDriver=fn;},setOrbit:(point,range,yawValue,pitchValue)=>{cameraDriver=null;flying=false;target.copy(point);distance=range;yaw=yawValue;pitch=pitchValue;orbit();},entrance,fly,route:id=>{route=SHARDBELT_PASSAGES.find(r=>r.id===id);select.value=id;},orbit:()=>orbit(),setView:(position,look)=>{flying=false;camera.position.fromArray(position);camera.lookAt(new T.Vector3(...look));},data:getAsteroidTerrain()};window.ready=true;requestAnimationFrame(frame);
