import {mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../../output/jump-gate-review/',import.meta.url);
await mkdir(out,{recursive:true});
for(const file of ['index.html','review.js'])await copyFile(new URL(`./jump-gate-review/${file}`,import.meta.url),new URL(file,out));
console.log('Jump gate review: /output/jump-gate-review/index.html');
