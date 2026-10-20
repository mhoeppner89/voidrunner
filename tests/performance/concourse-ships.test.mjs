import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DOCK_LOCATION_IDS} from '../../src/game/data.js';
import {concoursePose,concourseLighting,ConcourseShip,CONCOURSE_STAGING,frameConcourseCamera,stabilizeConcourseNormals} from '../../src/game/concourseShip.js';
import {ConcourseReflection} from '../../src/game/concourseReflection.js';
import {CONCOURSE_PADS,ConcourseDeck,concourseGroundFade} from '../../src/game/concourseDeck.js';
import {readFile} from 'node:fs/promises';

test('landing settles into the hover pose without crossing the pad; departure climbs and clears the frame',()=>{
 const idle=concoursePose('idle',0,0),landed=concoursePose('landing',1);
 for(const key of ['x','y','z','yaw','pitch','roll','scale'])assert.ok(Math.abs(landed[key]-idle[key])<1e-12,key);
 let previousZ=0;
 for(let i=0;i<=100;i++){
  const t=i/100,landing=concoursePose('landing',t),leaving=concoursePose('takeoff',t);
  assert.ok(Object.values(landing).every(Number.isFinite)&&Object.values(leaving).every(Number.isFinite));
  assert.ok(landing.y>.1&&leaving.y>=idle.y);assert.ok(leaving.z<=previousZ);previousZ=leaving.z;
 }
 assert.ok(concoursePose('takeoff',1).z<-12);
 assert.ok(Math.abs(concoursePose('idle',0,2).y-idle.y)<.1,'hover stays subtle');
});
test('ports provide warm/cool reflected light and physically consistent key directions',()=>{
 const hangar=concourseLighting('helix'),desert=concourseLighting('vesper'),ocean=concourseLighting('azure');
 assert.notEqual(hangar.key,desert.key);assert.notEqual(ocean.sky,hangar.sky);
 for(const l of [hangar,desert,ocean])assert.ok(l.position[1]>0&&l.shadow>0&&l.shadow<1);
});
test('every landing plate has calibrated light, scale and a floor-appropriate reflection',()=>{
 assert.deepEqual(Object.keys(CONCOURSE_STAGING).sort(),[...DOCK_LOCATION_IDS].sort());
 for(const id of DOCK_LOCATION_IDS){const l=concourseLighting(id);assert.ok(l.position[1]>0&&l.scale>0&&l.environment>0&&l.keyIntensity>0);assert.ok(l.reflection>=0&&l.reflection<.25);}
 assert.equal(concourseLighting('vesper').reflection,0,'dry concrete does not become a mirror');
 assert.ok(concourseLighting('cairn').reflection>concourseLighting('azure').reflection,'polished metal reflects more than a dry apron');
 assert.notEqual(concourseLighting('cairn').key,concourseLighting('boreal').key);
});
test('all final port angles and scales exactly match the approved editor export',async()=>{
 const approved=JSON.parse(await readFile(new URL('../fixtures/landing-layout-final.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(approved.locations).sort(),[...DOCK_LOCATION_IDS].sort());
 for(const id of DOCK_LOCATION_IDS){const profile=concourseLighting(id);assert.deepEqual({scale:profile.scale,rotationDeg:profile.rotationDeg},approved.locations[id],id);}
});
test('all desktop and phone placements exactly match the approved version 2 export',async()=>{
 const approved=JSON.parse(await readFile(new URL('../fixtures/landing-placement-final.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(approved.locations).sort(),[...DOCK_LOCATION_IDS].sort());
 for(const id of DOCK_LOCATION_IDS){const p=concourseLighting(id);assert.deepEqual({scale:p.scale,rotationDeg:p.rotationDeg,placements:p.placements},approved.locations[id],id);}
});
test('full-plate camera preserves the exact stage framing without clipping at the stage edge',()=>{
 const stage=new THREE.OrthographicCamera(-6,6,4.5,-4.5,.1,80),full=new THREE.OrthographicCamera();stage.position.set(7,5,-9);stage.lookAt(0,0,0);stage.updateMatrixWorld();
 for(const zoom of [.5,1,1.37])for(const[x,y,w,h,fw,fh]of [[800,300,800,600,1440,900],[-100,-75,1000,750,844,390],[50,50,400,300,750,342]]){
  stage.zoom=zoom;stage.updateProjectionMatrix();frameConcourseCamera(stage,w,h,x,y,fw,fh,full);
  for(const point of [[0,0,0],[3,2,-1],[-7,4,2]]){const a=new THREE.Vector3(...point).project(stage),b=new THREE.Vector3(...point).project(full);assert.ok(Math.abs(x+(a.x+1)*w/2-(b.x+1)*fw/2)<1e-9);assert.ok(Math.abs(y+(1-a.y)*h/2-(1-b.y)*fh/2)<1e-9);}
 }
});
test('every port and hull footprint enters and leaves fully off-screen at constant size, without near-plane clipping',()=>{
 for(const id of DOCK_LOCATION_IDS)for(const device of ['desktop','phone'])for(const dimensions of [[1,1.5,4],[3,2,6],[5,1,3]]){
  const profile=concourseLighting(id),[fw,fh]=device==='desktop'?[1440,900]:[844,390],placement=profile.placements[device].ship,scale=Math.max(fw/1672,fh/941),w=800*scale*profile.scale,h=600*scale*profile.scale;
  const v=Object.create(ConcourseShip.prototype);v.pivot=new THREE.Group();v.glows=[];v.point=new THREE.Vector3();v.camera=new THREE.OrthographicCamera(-4.5*w/h,4.5*w/h,4.5,-4.5,.1,80);v.camera.position.set(7,profile.elevation,-9);v.camera.lookAt(0,0,0);v.camera.zoom=placement.zoom;v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();
  v.modelBounds=new THREE.Box3(new THREE.Vector3(-dimensions[0]/2,0,-dimensions[2]/2),new THREE.Vector3(dimensions[0]/2,dimensions[1],dimensions[2]/2));v.framingBounds=v.modelBounds.clone();v.setLayout(profile);
  v.renderCamera=frameConcourseCamera(v.camera,w,h,placement.x*fw-w/2,60+placement.y*(fh-60)-h/2,fw,fh,new THREE.OrthographicCamera());v.refreshFlightPath();
  for(const[phase,t]of [['landing',0],['takeoff',1]]){
   const p=concoursePose(phase,t,0,v.flightPath);assert.equal(p.scale,1);v.applyPose(p);v.pivot.updateMatrixWorld();const bounds=v.framingBounds.clone().applyMatrix4(v.pivot.matrixWorld);let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
   for(let i=0;i<8;i++){const q=new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).project(v.renderCamera);x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);assert.ok(q.z>-1&&q.z<1,`${id}/${device}/${phase} stays inside camera depth`);}
   assert.ok(x0>1.05||x1< -1.05||y0>1.05||y1< -1.05,`${id}/${device}/${phase} clears the whole plate`);
  }
  for(let i=0;i<=20;i++)for(const phase of ['landing','takeoff'])assert.equal(concoursePose(phase,i/20,0,v.flightPath).scale,1);
 }
});
test('tilted dock hulls clear the deck, animate from their approved heading and leave atmosphere poses alone',()=>{
 const view=Object.create(ConcourseShip.prototype);view.pivot=new THREE.Group();view.glows=[];
 for(const id of DOCK_LOCATION_IDS)for(const dimensions of [[1,1.5,4],[3,2,6],[5,1,3]]){
  view.modelBounds=new THREE.Box3(new THREE.Vector3(-dimensions[0]/2,0,-dimensions[2]/2),new THREE.Vector3(dimensions[0]/2,dimensions[1],dimensions[2]/2));
  view.setLayout(concourseLighting(id));view.resetPose();view.pivot.updateMatrixWorld(true);
  const resting=view.modelBounds.clone().applyMatrix4(view.pivot.matrixWorld);assert.ok(resting.min.y>=.139999,`${id} clears the deck`);
  const start=view.pivot.matrix.clone();view.applyPose(concoursePose('landing',1));view.pivot.updateMatrix();assert.ok(view.pivot.matrix.elements.every((n,i)=>Math.abs(n-start.elements[i])<1e-12),'landing settles into the approved pose');
  view.applyPose(concoursePose('takeoff',1));assert.ok(-view.pivot.position.x*view.dockSin-view.pivot.position.z*view.dockCos>12,'departure follows the hull heading');
  view.transit={};const shot={x:2,y:3,z:4,pitch:.1,yaw:.2,roll:.3,scale:.9,thrust:.2};view.applyPose(shot);assert.deepEqual(view.pivot.position.toArray(),[2,3,4]);assert.deepEqual(view.pivot.rotation.toArray().slice(0,3),[.1,.2,.3]);view.transit=undefined;
 }
});
test('floor reflections reuse a bounded target, refresh sparsely and restore renderer state',()=>{
 const reflection=new ConcourseReflection();reflection.configure(.1);
 const camera=new THREE.OrthographicCamera(-6,6,4.5,-4.5,.1,80);camera.position.set(7,5,-9);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const mainTarget={},ground={visible:true},pivot={position:new THREE.Vector3(0,.14,0)};let target=mainTarget,draws=0,fail=false;
 const renderer={getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},render:()=>{draws++;if(fail)throw Error('context failure');}};
 const view={renderer,scene:new THREE.Scene(),camera,ground,pivot,phase:'idle'};
 reflection.update(view,0);reflection.update(view,100);assert.equal(draws,1,'idle hover reuses its capture');assert.equal(target,mainTarget);assert.ok(ground.visible&&reflection.plane.visible);
 assert.ok(reflection.target.width*reflection.target.height<=65536);
 assert.equal(reflection.camera.position.y,-camera.position.y);
 // A hull point and its reflected camera ray's deck intersection must use
 // the same sample. That places the mirror image on the actual floor.
 const hullPoint=new THREE.Vector3(1,1.5,-1),deckPoint=hullPoint.clone();deckPoint.y*=-1;
 const ray=camera.getWorldDirection(new THREE.Vector3());deckPoint.addScaledVector(ray,-deckPoint.y/ray.y);
 const hullUV=hullPoint.clone().applyMatrix4(reflection.matrix),deckUV=deckPoint.applyMatrix4(reflection.matrix);
 assert.ok(Math.abs(hullUV.x-deckUV.x)<1e-10&&Math.abs(hullUV.y-deckUV.y)<1e-10);
 reflection.dirty=true;fail=true;assert.throws(()=>reflection.update(view,700),/context failure/);assert.equal(target,mainTarget);assert.ok(ground.visible&&reflection.plane.visible);
 let disposed=0;for(const r of [reflection.target,reflection.material,reflection.plane.geometry])r.addEventListener('dispose',()=>disposed++);reflection.dispose();assert.equal(disposed,3);
});
test('pausing the concourse stops its frame loop and cancels its animation callback',()=>{
 const old=globalThis.cancelAnimationFrame;let cancelled,finished;
 globalThis.cancelAnimationFrame=id=>{cancelled=id;};
 try{const view=Object.create(ConcourseShip.prototype);view.raf=73;view.animationResolve=result=>{finished=result;};view.pause();assert.equal(cancelled,73);assert.equal(view.raf,0);assert.equal(view.paused,true);assert.equal(finished,false);assert.equal(view.phase,'idle');}
 finally{if(old===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=old;}
});

test('painted pad masks cover every port and remain convex with a feathered inside edge',()=>{
 assert.deepEqual(Object.keys(CONCOURSE_PADS).sort(),[...DOCK_LOCATION_IDS].sort());
 const uv={value:new THREE.Vector4()},deck=new ConcourseDeck(uv),edges=deck.uniforms.uDeckEdges.value;
 for(const[id,points]of Object.entries(CONCOURSE_PADS)){
  deck.setLocation(id);assert.ok(points.length>=3&&points.length<=8);assert.equal(deck.uniforms.uDeckUV,uv);
  for(const[x,y]of points){assert.ok(x>=0&&x<=1&&y>=0&&y<=1);for(let i=0;i<points.length;i++){const e=edges[i];assert.ok(Math.abs(Math.hypot(e.x,e.y)-1)<1e-9);assert.ok(e.x*x*16/9+e.y*y+e.z>=-1e-9,id);}}
 }
 assert.equal(deck.uniforms.uDeckEdges.value,edges,'resize/location changes reuse shader storage');
});
test('ground contrast fades continuously with height and distant ships skip reflection captures',()=>{
 assert.equal(concourseGroundFade(.14),1);let previous=1;
 for(let i=0;i<=300;i++){const fade=concourseGroundFade(i/100);assert.ok(fade>=0&&fade<=previous&&previous-fade<.02);previous=fade;}
 assert.equal(concourseGroundFade(2.2),0);assert.ok(concourseGroundFade(1)<.3);
 const reflection=new ConcourseReflection();reflection.configure(.12);let draws=0;
 const camera=new THREE.OrthographicCamera(-6,6,4.5,-4.5,.1,80);camera.position.set(7,5,-9);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const view={phase:'landing',renderer:{getRenderTarget:()=>null,setRenderTarget:()=>{},render:()=>draws++},camera,scene:new THREE.Scene(),ground:{visible:true},pivot:{position:new THREE.Vector3()}};
 reflection.setHeight(0);reflection.update(view,0);assert.equal(draws,0);
 reflection.setHeight(1);for(let t=0;t<100;t+=1000/30)reflection.update(view,t);
 assert.equal(draws,3,'moving reflection follows each rendered frame rather than stepping at 7Hz');reflection.dispose();
});

test('normal-mapped dock materials keep authored detail and use geometric normals for collapsed UVs',()=>{
 const material=new THREE.MeshStandardMaterial({normalMap:new THREE.Texture()});let called=0;material.onBeforeCompile=()=>called++;
 stabilizeConcourseNormals(material);const hook=material.onBeforeCompile;stabilizeConcourseNormals(material);assert.equal(hook,material.onBeforeCompile,'shared materials are patched once');
 const shader={fragmentShader:'#include <normal_fragment_maps>'};hook(shader,{});assert.equal(called,1);assert.ok(shader.fragmentShader.includes('texture2D( normalMap'));assert.ok(shader.fragmentShader.includes('mappedLength>1e-8'));assert.ok(!shader.fragmentShader.includes('normal = normalize( tbn * mapN );'));
 material.normalMap.dispose();material.dispose();
});

test('dock and film outputs reuse one bounded drawing buffer with the same pixel coordinates',()=>{
 for(const touchDevice of [false,true]){
  const v=Object.create(ConcourseShip.prototype),canvas={width:1,height:1,style:{},dataset:{}};let allocations=0;
  Object.assign(v,{touchDevice,canvas,renderer:{setSize(w,h){allocations++;canvas.width=w;canvas.height=h;}},target:new THREE.WebGLRenderTarget(1,1)});
  for(const [width,height,scale]of [[458,238,2],[420,270,2],[640,360,1],[458,238,2],[320,480,2],[458,238,2]]){
   v.resizeOutput(width,height,scale);assert.equal(allocations,1,'view switches and rotation retain the default framebuffer');
   assert.equal(v.target.width,width);assert.equal(v.target.height,height);
   assert.equal(canvas.width,touchDevice?768:960);assert.equal(canvas.height,touchDevice?480:600);
   const offset=Number(canvas.style.transform.match(/-?[\d.]+/)[0]);
   for(const [x,y]of [[0,0],[width*.5,height*.5],[width,height]]){
    // WebGL's origin is bottom-left; DOM coordinates start at the top-left.
    const cssX=x*scale,cssY=(canvas.height-y)*scale+offset;
    assert.equal(cssX,x*scale);assert.equal(cssY,(height-y)*scale,'no scene shift or change of pixel size');
   }
  }
  v.target.dispose();
 }
});
