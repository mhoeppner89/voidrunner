import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('authoring/manifest.json','utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
for(const m of manifest.models){assert.equal(await hash(m.runtime),m.runtimeSha256,`${m.id}: installed GLB changed; update source manifest deliberately`);assert.equal(await hash(m.source),m.sourceSha256,`${m.id}: editable source changed`);}
for(const m of manifest.extraSources)assert.equal(await hash(m.path),m.sha256,m.path);
console.log(`Verified ${manifest.models.length} current model sources and ${manifest.extraSources.length} additional authoring libraries.`);
