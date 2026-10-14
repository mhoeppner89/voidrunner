import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLB_TOP_DOWN_PROFILES} from '../../src/game/shipProfiles.js';
import {shipTopDownProfile,shipProfilePath} from '../../src/game/shipTopDownProfile.js';
import {SHIPS} from '../../src/game/data.js';
const variants=['blade','speedster','legionary','andromeda','torsas','astra','kestrel','warden','demon','mule','scrapper','talon','prospector','lancer','atlas-freighter','concord-frigate','concord-battleship','concord-carrier','concord-cruiser'];
test('all 19 current hulls have their own finite vector schematic, including Blade and capitals',()=>{
 assert.deepEqual(Object.keys(GLB_TOP_DOWN_PROFILES).sort(),[...variants].sort());
 const paths=new Set();
 for(const variant of variants){const p=shipTopDownProfile(variant);assert.notEqual(p,shipTopDownProfile('unknown'));assert.ok(p.contours.length&&p.details.length,variant);assert.ok(p.maxX>p.minX&&p.maxZ>p.minZ);for(const c of [...p.contours,...p.details]){assert.ok(c.points.length>=2);assert.ok(c.points.flat().every(Number.isFinite));}
  const path=shipProfilePath(p);assert.ok(path.startsWith('M'));assert.ok(!paths.has(path),`${variant}: a distinct hull outline`);paths.add(path);assert.ok(shipProfilePath(p,true));
 }
 for(const hull of Object.values(SHIPS))assert.ok(GLB_TOP_DOWN_PROFILES[hull.variant],`${hull.name}: no other hull's fallback`);
});
test('every hull, canopy and structural detail is exactly mirrored about its own centerline',()=>{
 for(const [variant,p]of Object.entries(GLB_TOP_DOWN_PROFILES)){
  const center=(p.bounds.minX+p.bounds.maxX)/2;assert.ok(Math.abs(center-p.cols/2)<1e-4,variant);
  const cells=new Set(p.cells.map(c=>c.join(',')));for(const[x,z]of p.cells)assert.ok(cells.has(`${p.cols-1-x},${z}`),`${variant}: centered raster`);
  for(const paths of[p.contours,p.details]){assert.equal(paths.length%2,0);for(let i=0;i<paths.length;i+=2){const a=paths[i],b=paths[i+1];assert.equal(a.closed,b.closed);assert.equal(a.points.length,b.points.length);a.points.forEach(([x,z],j)=>{assert.ok(Math.abs(x+b.points[j][0]-2*center)<1e-4,`${variant}: vector symmetry`);assert.equal(z,b.points[j][1]);});}}
 }
});
test('schematic evidence refers to the exact installed GLBs',async()=>{
 const evidence=JSON.parse(await readFile('docs/ship-schematics.json','utf8'));assert.equal(evidence.length,19);
 for(const row of evidence){const hash=createHash('sha256').update(await readFile(row.path)).digest('hex');assert.equal(hash,row.sha256,`${row.variant}: rebake after a hull update`);assert.ok(row.contourVertices<400,'simplified rather than raw raster stair steps');}
});
test('similar broad hulls retain distinct structural identification cues',()=>{
 const cases={'atlas-freighter':'six cargo frames',prospector:'central service hatch',andromeda:'four long engine pods',astra:'inner and outer engine banks','concord-carrier':'three paired hangar rows','concord-frigate':'broadside battery rows',warden:'heavy twin drive housings',legionary:'diamond wing spars'};
 for(const[v,feature]of Object.entries(cases))assert.ok(GLB_TOP_DOWN_PROFILES[v].features.includes(feature));
});
