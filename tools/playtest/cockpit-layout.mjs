import {mkdir,copyFile} from 'node:fs/promises';

const output=new URL('../../output/cockpit-layout/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of ['index.html','review.js','style.css','canopy.js','instruments.js','artwork.js'])
    await copyFile(new URL(`./cockpit-layout/${file}`,import.meta.url),new URL(file,output));
console.log('Cockpit layout review: http://127.0.0.1:4212/output/cockpit-layout/index.html');
