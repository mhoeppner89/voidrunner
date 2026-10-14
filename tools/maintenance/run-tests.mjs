import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const groups=process.argv.slice(2);if(!groups.length)groups.push('unit','integration','performance');
const allowed=new Set(['unit','integration','performance']);
const files=[];for(const group of groups){if(!allowed.has(group))throw Error(`Unknown test group: ${group}`);for(const name of (await readdir(`tests/${group}`)).sort())if(name.endsWith('.test.mjs'))files.push(`tests/${group}/${name}`);}
if(!files.length)throw Error('No tests found');
const child=spawn(process.execPath,['--import','./tests/helpers/offline-imports.mjs','--test','--test-concurrency=4',...files],{stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
