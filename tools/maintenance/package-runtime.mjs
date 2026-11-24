import {execFileSync} from 'node:child_process';
import {packWrecks,verifyWrecks} from '../assets/pack-graveyard-models.mjs';
import {cp,mkdir,rm,readFile,access,writeFile} from 'node:fs/promises';
import {GRAVEYARD_MODEL_WRECKS} from '../../src/game/graveyardLayout.js';
import {resolve,dirname,relative} from 'node:path';
const output=resolve('dist');await rm(output,{recursive:true,force:true});await mkdir(output);
const files=['index.html','game.html','favicon.svg','manifest.webmanifest','sw.js','THIRD_PARTY_NOTICES.md'];
// Retired revisions remain available to authoring tools in the checkout.
const liveWrecks=new Set(GRAVEYARD_MODEL_WRECKS.map(wreck=>resolve(wreck.file)));
const wreckDirectory=resolve('assets/models/wrecks');
const includeRuntimeAsset=path=>{
    const source=resolve(path);
    if(dirname(source)!==wreckDirectory || !/\.glb(?:\.gz)?$/.test(source))return true;
    return liveWrecks.has(source);
};
for(const path of [...files,'src','vendor','assets','art'])
    await cp(path,`${output}/${path}`,{recursive:true,filter:includeRuntimeAsset});
// Keep source GLBs available for collision/schematic authoring. The packaged
// copies retain the same URLs and mesh buffers, with lossless WebP pixels.
for (const name of ['game.html','index.html']) {
    const path = resolve(output, name);
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replace(/<html\b/, '<html data-packed-models'));
}
await packWrecks(output);
execFileSync('python3',['tools/assets/pack-hull-textures.py', resolve(output,'assets/models/ships')],{stdio:'inherit'});
// Returning players must never install a cache whose modules are absent.
const sw=await readFile('sw.js','utf8');
for(const match of sw.matchAll(/['"]\.\/([^'"\n]+)['"]/g))await access(`${output}/${match[1]}`);
// Verify the static title module graph, not only the existing cache entries.
const list=sw.slice(sw.indexOf('const CORE_ASSETS'),sw.indexOf('];',sw.indexOf('const CORE_ASSETS')));
const core=new Set([...list.matchAll(/['"]\.\/([^'"\n]+)['"]/g)].map(m=>m[1]));
const seen=new Set();
async function checkShell(file){
 if(seen.has(file))return;seen.add(file);
 const key=relative(process.cwd(),file);if(!core.has(key))throw Error(`Offline title dependency missing from CORE_ASSETS: ${key}`);
 const text=await readFile(file,'utf8');
 for(const match of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)){
  const name=match[1]??match[2],target=name==='three'?resolve('vendor/three.module.min.js'):name.startsWith('.')?resolve(dirname(file),name):null;
  if(target?.endsWith('.js'))await checkShell(target);
 }
}
await checkShell(resolve('src/main.js'));
await verifyWrecks(output);
console.log('Packaged game runtime in dist/; no tests, authoring files or development output included.');
