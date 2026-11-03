// Run each build in a fresh Node process: the terrain is cached per session.
// Supply two roots containing src/game/asteroidTerrain.js; the first is the
// baseline, the second the candidate. The hash covers visual and collision data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const roots=[process.argv[2]??'dist',process.argv[3]??'.'].map(root=>resolve(root));
const trials=Number(process.env.VR_TRIALS??3),results=[[],[]];
const code=`import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const m=await import(pathToFileURL(process.argv[1]).href),t=performance.now(),r=m.getAsteroidTerrain(),ms=performance.now()-t,h=createHash('sha256');
for(const f of r.fragments){h.update(f.id);for(const a of [f.geometry.attributes.position,f.geometry.attributes.normal,f.geometry.attributes.color,f.geometry.attributes.uv,f.geometry.index])h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
for(const o of r.obstacles){h.update(o.id+JSON.stringify([o.x,o.y,o.z,o.radius,o.box]));h.update(new Uint8Array(o.meshVerts.buffer));h.update(new Uint8Array(o.meshIndices.buffer));}
console.log(JSON.stringify({ms,fragments:r.fragments.length,obstacles:r.obstacles.length,triangles:r.triangles,sha256:h.digest('hex')}));`;
for(let i=0;i<trials;i++)for(const j of i%2?[1,0]:[0,1]){
 const child=spawnSync(process.execPath,['--import','./tests/helpers/offline-imports.mjs','--input-type=module','-e',code,`${roots[j]}/src/game/asteroidTerrain.js`],{encoding:'utf8'});
 if(child.status!==0)throw new Error(child.stderr||child.stdout);
 results[j].push(JSON.parse(child.stdout.trim()));
}
const hash=results[0][0].sha256;for(const run of results.flat())assert.equal(run.sha256,hash,'visual and collision data must match exactly');
const median=xs=>xs.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(xs.length/2)];
console.log(JSON.stringify({baseline:roots[0],candidate:roots[1],trials:results,medianMs:results.map(median),improvementPercent:(1-median(results[1])/median(results[0]))*100,sha256:hash},null,2));
