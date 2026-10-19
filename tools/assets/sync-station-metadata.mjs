// Keep the offline authoring reports and runtime berths in the same coordinate frame.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {STATION_DOCKS} from '../../src/game/stationDocks.js';
const docks={},occupants={},reports={};
for(const id of Object.keys(STATION_DOCKS)){
 const r=JSON.parse(fs.readFileSync(`authoring/models/stations/${id}/model-report.json`));
 reports[id]=r;
 if(r.physicalDetachedGroups?.length!==0)throw Error(`${id}: run the physical source audit before syncing`);
 docks[id]={radius:r.sourceRadius,approachVector:[0,-1,0],cinematic:r.cinematic??STATION_DOCKS[id].cinematic??{entrySide:.12,exitSide:.10,elevation:.10,lift:.06},playerPads:r.playerPads,lanes:r.lanes};
 occupants[id]={radius:r.sourceRadius,ships:r.occupants};
}
fs.writeFileSync('src/game/stationDocks.js',`// Authored floors, aprons and shared approach lanes. Blender Z-up, front -Y.\n// Generated from current model reports by tools/assets/sync-station-metadata.mjs.\nexport const STATION_DOCKS = ${JSON.stringify(docks,null,2)};\n`);
const path='src/game/stationOccupants.js',source=fs.readFileSync(path,'utf8'),start=source.indexOf('export const STATION_OCCUPANTS = '),end=source.indexOf('\nexport async function',start);
fs.writeFileSync(path,source.slice(0,start)+`export const STATION_OCCUPANTS = ${JSON.stringify(occupants,null,2)};`+source.slice(end));
const manifestPath='authoring/manifest.json',manifest=JSON.parse(fs.readFileSync(manifestPath));
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
manifest.models=manifest.models.filter(m=>!Object.keys(docks).some(id=>m.id===`station-${id}`));
for(const id of Object.keys(docks)){
 const runtime=`assets/models/stations/${id}.glb`,source=`authoring/models/stations/${id}/${id}.blend`;
 manifest.models.push({id:`station-${id}`,kind:'station',runtime,runtimeSha256:hash(runtime),source,sourceSha256:hash(source)});
}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync('tests/fixtures/station-models.json',JSON.stringify(reports,null,2)+'\n');
console.log('Updated',Object.keys(docks).length,'station berth and occupant manifests.');
