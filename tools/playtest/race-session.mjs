import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../../output/race-session/',import.meta.url);
await mkdir(out,{recursive:true});
let html=await readFile(new URL('../../game.html',import.meta.url),'utf8');
html=html.replace('<head>','<head>\n    <base href="/">').replace('<title>Voidrunner — Frontier Adventure</title>','<title>Breach Crossing — Rennklasse R</title>');
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script>
// This page keeps every write in memory. It never replaces the career save.
const raceMemory=new Map(),storageGet=Storage.prototype.getItem;
Storage.prototype.getItem=function(key){return raceMemory.has(String(key))?raceMemory.get(String(key)):String(key).startsWith('void-privateer-save')?null:storageGet.call(this,key);};
Storage.prototype.setItem=function(key,value){raceMemory.set(String(key),String(value));};
Storage.prototype.removeItem=function(key){raceMemory.set(String(key),null);};
Storage.prototype.clear=function(){raceMemory.clear();};
</script>
<link rel="stylesheet" href="/output/race-session/race.css">
<div id="race-ready" role="dialog" aria-modal="true" aria-labelledby="race-heading"><section>
<p class="eyebrow">RENNKLASSE R</p><h1 id="race-heading">Breach Crossing</h1>
<label class="track-picker" for="race-course">Strecke <select id="race-course"></select></label>
<div id="race-hulls"></div><p id="race-specs">Lädt …</p><button id="race-go" disabled>Start</button>
<p class="controls">WASD drehen · Shift Schub · Leertaste bremsen · loslassen = gleiten</p>
</section></div>
<button id="race-restart" aria-label="Rennen neu starten" title="Neustart" hidden>↻</button>
<script type="module" src="/output/race-session/boot.js"></script>`);
await writeFile(new URL('index.html',out),html);
for(const name of ['boot.js','race.css'])await copyFile(new URL(`./race-session/${name}`,import.meta.url),new URL(name,out));
console.log('/output/race-session/index.html');
