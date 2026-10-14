import {cp,mkdir,rm,readFile,access} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
const output=resolve('dist');await rm(output,{recursive:true,force:true});await mkdir(output);
const files=['index.html','game.html','favicon.svg','manifest.webmanifest','sw.js','THIRD_PARTY_NOTICES.md'];
for(const path of [...files,'src','vendor','assets','art'])await cp(path,`${output}/${path}`,{recursive:true});
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
console.log('Packaged game runtime in dist/; no tests, authoring files or development output included.');
