import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {customPaintFrames} from '../../src/game/customShipPaint.js';
import {applyFleetPaint} from '../../src/game/fleetPaint.js';
import {SHIPS} from '../../src/game/data.js';
import {PAINT_LAYOUTS,PAINT_PATTERNS,normalizePaintDesign,samePaint} from '../../src/game/paintDesign.js';
import {SHIP_PAINT_MASKS} from '../../src/game/shipPaintMaskCatalog.js';
import {resolveFleetPaint,fleetPaintPath} from '../../src/game/fleetPaintCatalog.js';
const design={pattern:'stripes',colors:['#FF2211','#121aBC','#abcdef']};
test('every playable hull has four authored patterns and shipping UV masks',()=>{
 assert.equal(PAINT_PATTERNS.length,4);
 for(const id of Object.keys(SHIPS)){
  assert.ok(PAINT_LAYOUTS[id]);const masks=SHIP_PAINT_MASKS[id];assert.ok(masks&&Object.keys(masks.surfaces).length);
  for(const file of [masks.patterns,...Object.values(masks.surfaces)])assert.ok(fs.existsSync(`assets/paint/${file}`));
 }
});
test('paint values are validated, copied and canonicalized before charging or saving',()=>{
 const normalized=normalizePaintDesign(design,'wayfarer');assert.deepEqual(normalized,{pattern:'stripes',colors:['#ff2211','#121abc','#abcdef']});
 assert.notEqual(normalized.colors,design.colors);assert.ok(samePaint(normalized,normalizePaintDesign(design,'wayfarer')));
 for(const bad of [null,[],{},'stripes',{...design,pattern:'missing'},{...design,colors:['red','blue','green']},{...design,colors:['#ff0000','#121212']},{...design,colors:['#ff0000','#121212','#112233;bad']}])assert.equal(normalizePaintDesign(bad,'wayfarer'),null);
 assert.equal(normalizePaintDesign(design,'concord-carrier'),null);
 assert.equal(resolveFleetPaint('wayfarer',{livery:design}),'custom');assert.equal(fleetPaintPath('scrapper','custom'),null);
});
test('paint coordinates agree in a direct flight hull and a yawed preview assembly',()=>{
 const flight=new THREE.Group();flight.userData.paintHullRoot=true;flight.rotation.y=Math.PI/2;flight.scale.setScalar(3);
 const body=new THREE.Mesh(new THREE.BoxGeometry(4,1,2));flight.add(body);
 const preview=new THREE.Group(),copy=flight.clone(true);preview.add(copy);preview.rotation.x=.3;preview.position.set(13,2,8);
 const other=copy.children[0],a=customPaintFrames(flight,'wayfarer').get(body),b=customPaintFrames(preview,'wayfarer').get(other);
 for(const vertex of [[2,0,0],[0,0,1],[-1,.4,-1]]){
  const pa=new THREE.Vector3(...vertex).applyMatrix4(a),pb=new THREE.Vector3(...vertex).applyMatrix4(b);assert.ok(pa.distanceTo(pb)<1e-6);
 }
 assert.ok(new THREE.Vector3(2,0,0).applyMatrix4(a).distanceTo(new THREE.Vector3(0,0,1))<1e-6);
});
test('custom paint preserves source geometry, glass and PBR maps and restores the exact factory material',()=>{
 const root=new THREE.Group(),map=new THREE.Texture(),normalMap=new THREE.Texture(),source=new THREE.MeshStandardMaterial({map,normalMap,roughness:.63,metalness:.38});source.name='Wayfarer Concord authored PBR';
 const geometry=new THREE.BoxGeometry(4,1,2),body=new THREE.Mesh(geometry,source),glass=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({name:'VR_Canopy_wayfarer'})),originalGlass=glass.material;root.add(body,glass);
 applyFleetPaint(root,'wayfarer',{id:'player',livery:design});const painted=body.material;
 assert.notEqual(painted,source);assert.equal(body.geometry,geometry);assert.equal(glass.material,originalGlass);assert.equal(painted.normalMap,normalMap);assert.equal(painted.roughness,.63);assert.equal(painted.metalness,.38);
 applyFleetPaint(root,'wayfarer',{id:'player',livery:{pattern:'blocks',colors:['#222222','#bbbbbb','#ff8800']}});assert.equal(body.material,painted);
 applyFleetPaint(root,'wayfarer',{id:'player',livery:'original'});assert.equal(body.material,source);assert.equal(glass.material,originalGlass);assert.equal(root.userData.livery,'original');
 geometry.dispose();source.dispose();originalGlass.dispose();map.dispose();normalMap.dispose();
});
