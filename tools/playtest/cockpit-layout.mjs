import {cockpitManifest} from '../../src/game/cockpitDefinitions.js';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';

const output=new URL('../../output/cockpit-layout/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of ['index.html','review.js','host.js','flight.js','style.css','canopy.js','consoleGeometry.js','instruments.js','artwork.js'])
    await copyFile(new URL(`./cockpit-layout/${file}`,import.meta.url),new URL(file,output));
await writeFile(new URL('../../assets/cockpits/wayfarer-v4.json',import.meta.url),JSON.stringify(cockpitManifest('wayfarer'),null,2)+'\n');
console.log('Cockpit layout review: http://127.0.0.1:4212/output/cockpit-layout/index.html?hull=talon');
