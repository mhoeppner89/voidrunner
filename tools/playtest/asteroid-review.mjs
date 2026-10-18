import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
const target=new URL('../../output/asteroid-review/',import.meta.url);await mkdir(target,{recursive:true});
for(const file of ['index.html','review.js','flight.js','races.html','races.js'])await copyFile(new URL('./asteroid-review/'+file,import.meta.url),new URL(file,target));
let flight=await readFile(new URL('../../game.html',import.meta.url),'utf8');
flight=flight.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/main.js"></script>',`<script>
const fieldMemory=new Map(),originalGet=Storage.prototype.getItem;
Storage.prototype.getItem=function(key){return fieldMemory.has(String(key))?fieldMemory.get(String(key)):String(key).startsWith('void-privateer-save')?null:originalGet.call(this,key);};
Storage.prototype.setItem=function(key,value){fieldMemory.set(String(key),String(value));};
Storage.prototype.removeItem=function(key){fieldMemory.set(String(key),null);};
Storage.prototype.clear=function(){fieldMemory.clear();};
</script><script type="module" src="/output/asteroid-review/flight.js"></script>`);
await writeFile(new URL('flight.html',target),flight);
console.log('/output/asteroid-review/index.html');
