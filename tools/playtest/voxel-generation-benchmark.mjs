// Compare generated placeholder hull buffers with the previous packaged
// build. Pass an archived runtime root as the first argument; default is dist.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as after from '../../src/game/voxelModels.js';
const before=await import(pathToFileURL(resolve(process.argv[2]??'dist','src/game/voxelModels.js')).href);

const variants=['blade','speedster','legionary','andromeda','torsas','astra','kestrel','talon','demon','mule','scrapper','warden','prospector','lancer','atlas-freighter'];
const run=(api,variant,faction)=>{
 const start=performance.now(),ship=api.createVoxelShipModel(variant,api.paletteForFaction(faction)),ms=performance.now()-start,hash=createHash('sha256');
 ship.group.traverse(mesh=>{if(!mesh.isMesh)return;for(const [name,a] of Object.entries(mesh.geometry.attributes).sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(mesh.geometry.index){const a=mesh.geometry.index;hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}});
 ship.group.traverse(mesh=>{if(mesh.geometry)mesh.geometry.dispose();if(mesh.material)mesh.material.dispose();});
 return {ms,hash:hash.digest('hex')};
};
const oldRuns=[],newRuns=[];
for(let round=0;round<5;round++){
 let oldTotal=0,newTotal=0,index=0;
 for(const faction of ['independents','concord','pirates'])for(const variant of variants){
  let a,b;if((round+index++)%2){b=run(after,variant,faction);a=run(before,variant,faction);}else{a=run(before,variant,faction);b=run(after,variant,faction);}
  assert.equal(b.hash,a.hash,`${variant}/${faction} geometry changed`);oldTotal+=a.ms;newTotal+=b.ms;
 }
 oldRuns.push(oldTotal);newRuns.push(newTotal);
}
const gridHash=api=>{
 const grid=new api.VoxelGrid(),palette=api.paletteForFaction('concord');
 grid.fillBox(-8,8,-4,4,-9,9,'hull');grid.fillBox(-3,3,-2,2,-3,3,'dark');grid.fillCylinderX(-11,11,3,'accent');grid.set(0,4,0,'window');
 const geometry=grid.buildGeometry(1,palette,new Set(['hull','dark','accent','window'])),hash=createHash('sha256');
 for(const [name,a] of Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b))){hash.update(name);hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 const a=geometry.index;hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));geometry.dispose();return hash.digest('hex');
};
assert.equal(gridHash(after),gridHash(before),'mixed-material voxel geometry changed');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
console.log(JSON.stringify({models:variants.length*3,rounds:oldRuns.length,beforeMs:oldRuns,afterMs:newRuns,beforeMedianMs:median(oldRuns),afterMedianMs:median(newRuns)}));
