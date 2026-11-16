// Conservative local housekeeping. Source, saves and Git history are untouched.
import {readdir,lstat,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const execFile=promisify(execFileCallback);
const disposable=/\.(?:png|jpe?g|webp|gif|mp4|webm|cpuprofile|log|pyc)$/i;
async function stat(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function files(path){
 const entries=await readdir(path,{withFileTypes:true}),result=[];
 for(const e of entries){const p=join(path,e.name);if(e.isDirectory())result.push(...await files(p));else result.push(p);}
 return result;
}
export async function planCleanup(root){
 root=resolve(root);
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(pkg.name!=='voidrunner'||!await stat(join(root,'src/main.js')))throw Error('Expected the Voidrunner project root');
 const tracked=(await execFile('git',['ls-files','-z','--','output','dist'],{cwd:root})).stdout;
 if(tracked)throw Error('Generated folders contain tracked files; review them before cleaning');
 const roots=[];
 for(const name of ['output','dist']){
  const p=join(root,name),s=await stat(p);if(!s)continue;
  if(s.isSymbolicLink()||!s.isDirectory())throw Error(`Refusing non-directory or linked generated root: ${name}`);
  roots.push(p);
 }
 async function caches(path){
  if(!await stat(path))return;
  for(const e of await readdir(path,{withFileTypes:true}))if(e.isDirectory()){
   const p=join(path,e.name);if(e.name==='__pycache__')roots.push(p);else await caches(p);
  }
 }
 await caches(join(root,'tools'));
 const retained=[];let bytes=0,count=0;
 for(const dir of roots)for(const p of await files(dir)){
  const s=await lstat(p);bytes+=s.size;count++;
  // Text exports, source snapshots, native drafts and GLBs may be unique.
  // Archive them before deleting output; raster captures and logs regenerate.
  if(relative(root,p).startsWith('output/')&&!disposable.test(p)&&!p.endsWith('.DS_Store'))retained.push(relative(root,p));
 }
 return {root,roots:roots.map(p=>relative(root,p)),files:count,bytes,retained};
}
export async function cleanGenerated(root,{apply=false}={}){
 const plan=await planCleanup(root);if(!apply)return {...plan,applied:false};
 let archive=null,archiveBytes=0;
 if(plan.retained.length){
  for(const part of ['.workbench','.workbench/generated-archives']){
   const s=await stat(join(plan.root,part));if(s?.isSymbolicLink()||(s&&!s.isDirectory()))throw Error('Refusing a linked archive destination');
  }
  const archiveDir=join(plan.root,'.workbench/generated-archives');await mkdir(archiveDir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');archive=join(archiveDir,`output-${stamp}-${process.pid}.tar.gz`);
  const list=archive+'.files';await writeFile(list,plan.retained.join('\0')+'\0');
  try{
   await execFile('tar',['-czf',archive,'--null','-T',list],{cwd:plan.root,maxBuffer:4*1024*1024});
   await execFile('tar',['-tzf',archive],{maxBuffer:8*1024*1024});
   archiveBytes=(await lstat(archive)).size;
  }finally{await rm(list,{force:true});}
 }
 // No removals occur until the retained material has a verified archive.
 for(const dir of plan.roots)await rm(join(plan.root,dir),{recursive:true,force:true});
 return {...plan,applied:true,archive:archive&&relative(plan.root,archive),archiveBytes,netBytesFreed:plan.bytes-archiveBytes};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>a!=='--apply'))throw Error('Usage: npm run clean:generated -- [--apply] (default: dry run)');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const {retained,...summary}=await cleanGenerated(root,{apply:args.includes('--apply')});
 console.log(JSON.stringify({...summary,retainedFiles:retained.length},null,2));
}
