import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const out=new URL('../../output/station-review/',import.meta.url);await mkdir(out,{recursive:true});
for(const file of ['index.html','review.js','gallery.html'])await copyFile(new URL(`./station-review/${file}`,import.meta.url),new URL(file,out));
const reports=JSON.parse(await readFile(new URL('../../tests/fixtures/station-models.json',import.meta.url),'utf8'));
await writeFile(new URL('models.json',out),JSON.stringify(reports));
console.log('Station review: /output/station-review/index.html?station=helix');
