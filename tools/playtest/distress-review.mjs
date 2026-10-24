import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../../output/distress-review/',import.meta.url);
await mkdir(out,{recursive:true});
const build=Date.now().toString(36);
let html=await readFile(new URL('../../game.html',import.meta.url),'utf8');
html=html.replace('<html lang="de">','<html lang="de" data-test-build="distress-review">').replace('<head>','<head>\n    <base href="/">').replace('<title>Voidrunner — Frontier Adventure</title>','<title>Voidrunner — Notrufe prüfen</title>');
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script>
// Quarantine every storage write in this window, including autosaves on blur.
// Career saves are never read. Other tabs keep their native Storage methods.
(()=>{const memory=new Map(),nativeGet=Storage.prototype.getItem;let settings={};try{settings=JSON.parse(nativeGet.call(localStorage,'void-privateer-settings-v1')||'{}');}catch{}
memory.set('void-privateer-settings-v1',JSON.stringify({...settings,music:0,effects:0}));
Storage.prototype.getItem=function(key){key=String(key);return memory.has(key)?memory.get(key):/^(void-privateer-save|voidrunner-.*(?:save|arena-run))/.test(key)?null:nativeGet.call(this,key);};
Storage.prototype.setItem=function(key,value){memory.set(String(key),String(value));};Storage.prototype.removeItem=function(key){memory.set(String(key),null);};Storage.prototype.clear=function(){memory.clear();};})();
</script>
<script>window.__VR_REVIEW_MODE__='distress';</script>
<link rel="stylesheet" href="/output/distress-review/review.css?v=${build}">
<div id="discovery-review" role="dialog" aria-modal="true" aria-labelledby="review-title">
 <section class="review-card">
  <header><div><p class="review-kicker">ISOLIERTER TESTFLUG · 0.8.2ld</p><h1 id="review-title">Notrufe & Folgen prüfen</h1></div><button id="review-resume" disabled>Weiterfliegen</button></header>
  <p id="review-status" role="status">Flugsysteme werden vorbereitet …</p>
  <p class="review-note">Szenen für alle acht Varianten. Jede Variante beginnt mit einer Signal-Szene auf 6.800 km: Logbuch-Kurs setzen, J springen — beim Drop öffnet sich der Kanal von selbst. Die Gruppe „Ankunft & Briefing“ setzt direkt nach dem Sprung bei 500 km an: Lageschild, Funktext und die Entscheidung, bevor die Welt weiterläuft. Die „Nahaufnahme“-Szenen setzen mitten im Szenario an und prüfen Kampf, Ressourcen, Ausgänge und Folgen. Jede Szene startet isoliert; „Speichern/Laden“ prüft den gespeicherten Zustand. „Funk“, „Logbuch“ und „Status“ liegen in der Werkzeugleiste.</p>
  <div id="review-scenarios"></div>
  <footer><span>Eigener Teststand · dein Karrierespielstand bleibt unverändert.</span><span>Werkzeugleiste: Szenen · Neustart · Laden · Funk · +10 s · Logbuch · Status · Ton</span></footer>
 </section>
</div>
<nav id="review-toolbar" aria-label="Teststeuerung" hidden>
 <button id="review-menu">Szenen</button><button id="review-restart">↻ Neustart</button><button id="review-reload">Laden</button><button id="review-comms">Funk</button><button id="review-advance">+10 s</button><button id="review-journal">Logbuch</button><button id="review-state-toggle" aria-pressed="false">Status</button><button id="review-sound" aria-pressed="false">Ton: aus</button>
</nav>
<button id="review-next" hidden>Nächster Fund</button>
<div id="feedback-controls" hidden></div>
<section id="review-state-panel" hidden aria-label="Notruf-Zustand"><pre id="review-state"></pre></section>
<script type="module" src="/output/distress-review/boot.js?v=${build}"></script>`);
await writeFile(new URL('index.html',out),html);
await copyFile(new URL('./exploration-review/boot.js',import.meta.url),new URL('boot.js',out));
let css=await readFile(new URL('./exploration-review/review.css',import.meta.url),'utf8');
css+=`
#review-scenarios{display:block}
.review-group{margin:0 0 10px}
.review-group h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7fcfd6;margin:14px 0 8px}
.review-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}
.review-row button{min-height:84px;padding:12px}
.review-row button b{font-size:15px}
.review-row button span{font-size:12px}
#review-toolbar{flex-wrap:wrap;justify-content:center;max-width:94vw}
#review-state-panel{position:fixed;z-index:25500;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));width:min(430px,42vw);max-height:56vh;overflow:auto;background:#030a15f2;border:1px solid #36546b;padding:10px 12px;color:#bfe2df}
#review-state-panel[hidden]{display:none}
#review-state-panel pre{margin:0;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
@media(max-width:900px){.review-row{grid-template-columns:repeat(2,minmax(0,1fr))}#review-state-panel{width:min(380px,48vw)}}
@media(max-width:520px){.review-row{grid-template-columns:1fr}#review-state-panel{left:8px;right:8px;width:auto;bottom:8px;max-height:40vh}#review-toolbar{gap:3px;max-width:96vw}#review-toolbar button{font-size:10px;padding:6px 8px}}
body:has(#ship-panel:not(.is-hidden),#map-panel:not(.is-hidden),#pause-panel:not(.is-hidden)) :is(#review-toolbar,#feedback-controls,#review-state-panel){visibility:hidden}
`;
await writeFile(new URL('review.css',out),css);
console.log('/output/distress-review/index.html');
