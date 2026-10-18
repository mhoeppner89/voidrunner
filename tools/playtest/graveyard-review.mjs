// Rebuild the lightweight review pages; model and course data load from runtime.
import {mkdir,copyFile} from 'node:fs/promises';
const directory=new URL('../../output/graveyard-review/',import.meta.url);
await mkdir(directory,{recursive:true});
for(const name of ['index.html','review.js','races.html','race-routes.js'])
 await copyFile(new URL(`./graveyard-review/${name}`,import.meta.url),new URL(name,directory));
console.log('Graveyard: /output/graveyard-review/index.html');
console.log('Race routes: /output/graveyard-review/races.html');
