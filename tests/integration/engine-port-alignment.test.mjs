import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../../vendor/three.module.min.js';
import {buildGlbScene} from '../../src/game/glbLoader.js';
import {FLEET_EQUIPMENT} from '../../src/game/fleetEquipmentData.js';
import {SpaceRenderer,GLB_SHIP_CONFIG,npcShipScaleForVariant} from '../../src/game/render.js';

globalThis.createImageBitmap ??= async blob => {
 const b=Buffer.from(await blob.arrayBuffer());
 return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};
};

const hulls=[
 ['andromeda','andromeda'],['astra','astra'],['atlas','atlas-freighter'],['lancer','lancer'],
 ['legionary','legionary'],['prospector','prospector'],['speedster','speedster'],['talon','talon'],
 ['torsas','torsas'],['vanguard','warden'],['wayfarer','kestrel'],
];
const load=async path=>{
 const bytes=await readFile(path);
 return buildGlbScene(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
};
const near=(a,b,tolerance=1e-7)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<=tolerance,`${a} differs from ${b}`));
const mouthsFor=async id=>JSON.parse(await readFile(`tests/fixtures/current-fleet/engine-openings/${id}.json`,'utf8'));
const vector=p=>new T.Vector3(...p);
const clearRay=(root,origin,direction,far)=>new T.Raycaster(origin,direction,1e-6,far).intersectObject(root,true);

test('every measured runtime engine flare clears its actual nozzle mouth',async()=>{
 for(const[id,variant]of hulls){
  const entry=FLEET_EQUIPMENT[id],config=GLB_SHIP_CONFIG[variant],report=await mouthsFor(id);
  assert.equal(entry.variant,variant,`${id}: installed fleet variant`);
  assert.equal(config.enginePorts.length,report.mouths.length,`${id}: one flare per physical engine`);
  const model=await load(`assets/models/ships/${id}.glb`);
  model.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])material.side=T.DoubleSide;});
  model.updateMatrixWorld(true);
  const ports=entry.config.enginePorts,unused=new Set(report.mouths.map((_,i)=>i));
  const matched=[];
  for(const port of ports){
   let chosen=-1,best=Infinity;
   for(const i of unused){
    const mouth=report.mouths[i],d=port.reduce((s,v,k)=>s+(v-mouth.center[k])**2,0);
    if(d<best){best=d;chosen=i;}
   }
   assert.notEqual(chosen,-1,`${id}: every flare maps to a different measured nozzle`);
   unused.delete(chosen);matched.push(chosen);
  }
  assert.equal(unused.size,0,`${id}: no measured engine is missing a flare`);
  for(let i=0;i<ports.length;i++){
   const port=ports[i],mouth=report.mouths[matched[i]],out=mouth.outward;
   const delta=port.map((v,k)=>v-mouth.center[k]);
   const distance=delta.reduce((s,v,k)=>s+v*out[k],0);
   const radial=Math.sqrt(delta.reduce((s,v,k)=>s+(v-distance*out[k])**2,0));
   const blocked=Math.max(0,...mouth.samples.map(sample=>sample.outwardFirstHit??0));
   const expectedOffset=Math.max(.012,blocked+.01);
   assert.ok(distance>=expectedOffset-1e-7,`${id}/${mouth.name}: flare clears the nozzle lip and any hull farther aft`);
   assert.ok(radial<1e-7,`${id}/${mouth.name}: flare is centered on the nozzle`);
   assert.equal(clearRay(model,vector(port),vector(out),10).length,0,`${id}/${mouth.name}: outward glow ray clears the hull`);
   assert.ok(clearRay(model,vector(port),vector(out).negate(),.15).length,`${id}/${mouth.name}: flare remains attached to nozzle geometry`);
  }

  const renderer=Object.create(SpaceRenderer.prototype);
  renderer.scene=new T.Scene();renderer.radialTexture=()=>new T.Texture();
  renderer.createDronePorts=()=>new T.Group();renderer.tagTargetable=()=>{};
  renderer.ensureGlbShipModel=()=>{};
  renderer.prepareGlbShip(model,config,variant);
  const actor={id:`engine-port-${id}`,variant,role:'patrol',faction:'independents',livery:'original'};
  const body=renderer.createGlbShipMesh(actor,model,config,variant);
  body.updateMatrixWorld(true);
  assert.equal(body.userData.engineFlares.length,ports.length,`${id}: renderer creates every measured flare`);
  for(let i=0;i<ports.length;i++){
   const flare=body.userData.engineFlares[i];
   near(flare.position.toArray(),ports[i]);
   assert.ok(flare.material.map&&flare.material.opacity>0,`${id}: flare uses a visible additive material`);
  }
 }
});

test('Atlas glow follows the six active engines and leaves the three shallow couplings unlit',async()=>{
 const report=await mouthsFor('atlas');
 assert.equal(report.mouths.length,6);
 assert.equal(FLEET_EQUIPMENT.atlas.config.enginePorts.length,6);
 const native=JSON.parse(await readFile('tests/fixtures/current-fleet/atlas/native-qa.json','utf8'));
 const couplings=native.volumes.map(row=>row.name).filter(name=>name.includes('central pressure coupling')&&name.endsWith('rooted engine casing'));
 assert.deepEqual(couplings.map(name=>name.match(/coupling (\d+)/)?.[1]),['0','1','2']);
});
