import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import * as T from '../../vendor/three.module.min.js';
import {FLEET_EQUIPMENT,droneDock} from '../../src/game/fleetEquipmentData.js';
import {FLEET_PAINTS,resolveFleetPaint,fleetPaintPath} from '../../src/game/fleetPaintCatalog.js';
import {TURRET_LAYOUTS} from '../../src/game/turretLayouts.js';import {FLEET_TURRET_CLEARANCE} from '../../src/game/fleetTurretClearance.js';
import {GLB_SHIP_CONFIG} from '../../src/game/render.js';import {clearTurretArc} from '../../src/game/turrets.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../../assets/models/fleet-manifest.json',import.meta.url)));
test('every installed hull and drone matches the approved fleet bytes and shipping model path',()=>{
 assert.equal(manifest.models.length,21);
 for(const m of manifest.models){const bytes=fs.readFileSync(m.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256,m.id);assert.equal(bytes.readUInt32LE(0),0x46546c67);if(m.category!=='drone'){const c=GLB_SHIP_CONFIG[m.variant];assert.equal(c.path??'assets/models/ships/'+c.file,m.path);}}
});
test('reviewed guns retain their physical centers, factory scale and surface normal',()=>{
 for(const[id,h]of Object.entries(FLEET_EQUIPMENT))for(const[i,t]of h.turrets.entries()){
  const m=TURRET_LAYOUTS[id][i];assert.ok(m.position.every((v,k)=>Math.abs(v*h.extents[k]-t.position[k])<1e-10),id+' center');assert.deepEqual(m.normal,t.normal);assert.ok(Math.abs(h.extents[2]/m.hullHalfLength-t.scale)<1e-10,id);
  assert.equal(FLEET_TURRET_CLEARANCE[id][i].length,73*37);
  const origin=new T.Vector3(...t.position),target=origin.clone().addScaledVector(new T.Vector3(...t.normal),100);
  const state={inverse:new T.Quaternion(),local:new T.Vector3(),scratch:new T.Vector3(),clearance:FLEET_TURRET_CLEARANCE[id][i]};
  assert.equal(clearTurretArc({position:[0,0,0]},m,h.extents,target,state),true,id+' '+i+' outward coverage');
 }
});
test('external docks face their bottoms into the hull and preserve symmetrical rows',()=>{
 for(const[id,h]of Object.entries(FLEET_EQUIPMENT))for(const[type,docks]of Object.entries(h.docks))for(const[i,d]of docks.entries()){
  const normal=new T.Vector3(...d.normal),bottom=new T.Vector3(0,-1,0).applyQuaternion(new T.Quaternion(...d.rotation));assert.ok(bottom.dot(normal)<-.9999,id);
  const delta=new T.Vector3(...d.position).sub(new T.Vector3(...d.point));assert.ok(delta.dot(normal)>0,id);assert.ok(delta.clone().cross(normal).length()<1e-8,id);
  // Mining and combat roles share the current single-drone bay mouth.
  assert.equal(droneDock(id,type,d.bay-1),h.docks.pdc?.find(port=>port.bay===d.bay));
  if(Math.abs(d.position[0])>.01)assert.ok(docks.some(o=>Math.abs(o.position[0]+d.position[0])<1e-8&&Math.abs(o.position[2]-d.position[2])<1e-8),id+' mirrored dock');
 }
});
test('paint brands preserve native capitals, diverse Independents, and faction restrictions',()=>{
 for(const m of manifest.models){const c=FLEET_PAINTS[m.id];assert.deepEqual(c.factions,m.factions);if(m.category==='flyable')assert.equal(c.paints.filter(p=>p.id.startsWith('independent-')).length,3,m.id);if(['concord-battleship','concord-carrier','concord-cruiser'].includes(m.id)){assert.equal(c.paints.length,1);assert.equal(resolveFleetPaint(m.id,{faction:'concord'}),'original');}
  for(const f of c.factions){const id=resolveFleetPaint(m.id,{faction:f,id:'npc-7'});assert.ok(c.paints.some(p=>p.id===id));}
 }
 for(const paint of ['concord','alliance','independents'])assert.ok(fs.existsSync(fleetPaintPath('scrapper',paint)));
});
