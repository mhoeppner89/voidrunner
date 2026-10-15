import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.min.js';
import {ShipPreview,previewCameraDistance} from '../../src/game/shipPreview.js';

test('the rotating showroom hull fits the smaller view angle at phone and desktop sizes',()=>{
 for(const radius of [.5,14,120])for(const aspect of [.3,.75,1,2.5,6]){
  const distance=previewCameraDistance(radius,38,aspect);
  const angularRadius=Math.asin(radius/distance);
  const vertical=THREE.MathUtils.degToRad(19),horizontal=Math.atan(Math.tan(vertical)*aspect);
  assert.ok(angularRadius<Math.min(vertical,horizontal),'hull sphere clears all four frame edges');
 }
});

test('resizing a showroom reframes the hull without recentering its rotated model',()=>{
 const preview=Object.create(ShipPreview.prototype);
 preview.camera=new THREE.PerspectiveCamera(38,1,.05,1000);
 preview.container={clientWidth:600,clientHeight:300};preview.modelRadius=20;
 preview.renderer={setSize(){}};preview.model={position:new THREE.Vector3(3,4,5)};
 preview.resize();const wide=preview.camera.position.length();
 preview.container.clientWidth=150;preview.resize();
 assert.ok(preview.camera.position.length()>wide*1.8);
 assert.ok(Math.abs(preview.camera.position.length()-previewCameraDistance(20,38,.5))<1e-9);
 assert.equal(preview.camera.aspect,.5);
 assert.deepEqual(preview.model.position.toArray(),[3,4,5]);
});

test('fixed paint views fit long and wide hulls at short phone and desktop sizes',()=>{
 for(const dims of [[20,2,4],[4,3,20],[9,8,10]])for(const aspect of [1,3,5]){
  const p=Object.create(ShipPreview.prototype);p.paintPreview=true;p.camera=new THREE.PerspectiveCamera(38,aspect,.05,1000);p.container={clientWidth:300,clientHeight:300/aspect};p.pivot=new THREE.Group();p.pivot.rotation.y=.5;p.model=new THREE.Mesh(new THREE.BoxGeometry(...dims));p.pivot.add(p.model);p.modelRadius=Math.hypot(...dims)/2;p.updateCameraFraming();p.camera.updateMatrixWorld();
  const box=new THREE.Box3().setFromObject(p.pivot),point=new THREE.Vector3();for(let c=0;c<8;c++){point.set(c&1?box.max.x:box.min.x,c&2?box.max.y:box.min.y,c&4?box.max.z:box.min.z).project(p.camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,`${dims}/${aspect}: paint preview clips`);}
 }
});
