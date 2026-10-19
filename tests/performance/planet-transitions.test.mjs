import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LOCATIONS} from '../../src/game/data.js';
import {PlanetTransit,planetTransitPalette,planetTransitPose,PLANET_TRANSIT_DURATION} from '../../src/game/planetTransit.js';

test('entry and ascent are short, continuous camera shots with opposite altitude progression',()=>{
 for(const direction of ['entry','exit']){
  assert.ok(PLANET_TRANSIT_DURATION[direction]>=3000&&PLANET_TRANSIT_DURATION[direction]<=4500);
  let previous=planetTransitPose(direction,0);
  for(let i=0;i<=200;i++){
   const p=planetTransitPose(direction,i/200);assert.ok(Object.values(p).every(Number.isFinite));
   assert.ok(p.fade>=0&&p.fade<=1&&p.scale>.8);
   assert.ok(direction==='entry'?p.altitude<=previous.altitude:p.altitude>=previous.altitude);
   assert.ok(Math.abs(p.x-previous.x)<.02&&Math.abs(p.y-previous.y)<.02,'no position discontinuities');previous=p;
  }
  assert.equal(planetTransitPose(direction,0).fade,0);assert.equal(planetTransitPose(direction,1).fade,0);
 }
});
test('each landable planet has a distinct, stable atmosphere palette',()=>{
 const planets=Object.values(LOCATIONS).filter(l=>l.kind==='planet'),seeds=new Set();
 for(const p of planets){const style=planetTransitPalette(p.id);seeds.add(style.seed);assert.ok(style.sky&&style.land&&style.haze&&style.cloud);}
 assert.equal(seeds.size,planets.length);assert.equal(planetTransitPalette('vesper').water,0);assert.equal(planetTransitPalette('azure').water,1);
});
test('the shot borrows the current hull and reflection map, and releases only its own scenery',()=>{
 const original=new THREE.Scene(),hull=new THREE.Group(),environment=new THREE.Texture();original.add(hull);
 let hullDisposed=false,environmentDisposed=false,geometryDisposed=false,materialsDisposed=0;
 environment.addEventListener('dispose',()=>{environmentDisposed=true;});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.geometry.addEventListener('dispose',()=>{hullDisposed=true;});hull.add(mesh);
 const shot=new PlanetTransit(hull,environment,'vesper','entry');
 assert.equal(hull.parent,shot.scene);assert.equal(shot.scene.environment,environment);
 shot.geometry.addEventListener('dispose',()=>{geometryDisposed=true;});for(const m of [shot.background,shot.clouds])m.addEventListener('dispose',()=>materialsDisposed++);
 shot.resize(.46);shot.update(.5);assert.ok(shot.camera.zoom<1,'portrait keeps the hull framed');
 shot.resize(2.16);shot.update(1);assert.equal(shot.camera.zoom,1);
 original.add(hull);shot.dispose();assert.ok(geometryDisposed);assert.equal(materialsDisposed,2);assert.equal(hullDisposed,false);assert.equal(environmentDisposed,false);
});

test('outbound camera tracks ahead of the hull while the fixed planet recedes aft',()=>{
 const hull=new THREE.Group(),environment=new THREE.Texture(),shot=new PlanetTransit(hull,environment,'vesper','exit');
 try{
  for(const aspect of [1.6,2.16,.46]){
   shot.resize(aspect);let previousDistance=0,previousRadius=Infinity;
   for(let i=0;i<=100;i++){
    const p=shot.update(i/100),position=new THREE.Vector3(p.x,p.y,p.z),orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch,p.yaw,p.roll)),forward=new THREE.Vector3(0,0,-1).applyQuaternion(orientation),toPlanet=shot.departurePlanet.clone().sub(position);
    assert.ok(toPlanet.dot(forward)<0,'planet stays behind the tail');
    assert.ok(shot.camera.position.clone().sub(position).dot(forward)>0,'departure is filmed from ahead rather than from the arrival camera');
    assert.ok(p.pitch>0&&p.scale===1,'outbound hull pitches into its climb without artificial shrinking');
    const radius=shot.uniforms.uPlanetRadius.value,distance=toPlanet.length();assert.ok(radius>0&&radius<=previousRadius&&distance>=previousDistance);previousRadius=radius;previousDistance=distance;
    const center=position.clone().project(shot.camera),nose=position.clone().add(forward).project(shot.camera),screenNose=new THREE.Vector2((nose.x-center.x)*aspect/2,(nose.y-center.y)/2),planetOffset=shot.uniforms.uPlanetCenter.value.clone().sub(new THREE.Vector2(center.x*aspect/2,center.y/2));
    assert.ok(planetOffset.dot(screenNose)<0,'on screen the planet sits behind the engines, not ahead of the nose');
   }
  }
  shot.configure(hull,environment,'azure','entry');const p=shot.update(.5),position=new THREE.Vector3(p.x,p.y,p.z),forward=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(p.pitch,p.yaw,p.roll));
  assert.equal(shot.uniforms.uDeparture.value,0);assert.ok(shot.camera.position.clone().sub(position).dot(forward)<0,'arrival retains the existing rear-quarter camera');
 }finally{shot.dispose();environment.dispose();}
});
