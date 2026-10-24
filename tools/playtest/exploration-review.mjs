import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../../output/exploration-review/',import.meta.url);await mkdir(out,{recursive:true});
let html=await readFile(new URL('../../game.html',import.meta.url),'utf8');
html=html.replace('<html lang="de">','<html lang="de" data-test-build="exploration-review">').replace('<head>','<head>\n    <base href="/">').replace('<title>Voidrunner — Frontier Adventure</title>','<title>Voidrunner — Entdeckungen testen</title>');
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script>
// Quarantine every storage write in this window, including autosaves on blur.
// Career saves are never read. Other tabs keep their native Storage methods.
(()=>{const memory=new Map(),nativeGet=Storage.prototype.getItem;let settings={};try{settings=JSON.parse(nativeGet.call(localStorage,'void-privateer-settings-v1')||'{}');}catch{}
memory.set('void-privateer-settings-v1',JSON.stringify({...settings,music:0,effects:0}));
Storage.prototype.getItem=function(key){key=String(key);return memory.has(key)?memory.get(key):/^(void-privateer-save|voidrunner-.*(?:save|arena-run))/.test(key)?null:nativeGet.call(this,key);};
Storage.prototype.setItem=function(key,value){memory.set(String(key),String(value));};Storage.prototype.removeItem=function(key){memory.set(String(key),null);};Storage.prototype.clear=function(){memory.clear();};})();
</script>
<link rel="stylesheet" href="/output/exploration-review/review.css">
<div id="discovery-review" role="dialog" aria-modal="true" aria-labelledby="review-title">
 <section class="review-card">
  <header><div><p class="review-kicker">ISOLIERTER TESTFLUG · 0.8.2ky</p><h1 id="review-title">Entdeckungen, Notrufe & Kampfgefühl</h1></div><button id="review-resume" disabled>Weiterfliegen</button></header>
  <p id="review-status" role="status">Flugsysteme werden vorbereitet …</p>
  <p class="review-note">Entdeckungen, wiederkehrende Notrufe, Ressourcen und Folgen. Jede Szene startet isoliert; „Speichern/Laden“ prüft den gespeicherten Zustand.</p>
  <div id="review-scenarios"></div>
  <footer><span>Eigener Teststand · dein Karrierespielstand bleibt unverändert.</span><span>WASD drehen · R/F Schub · Shift Nachbrenner · Leertaste feuern · J Hyperdrive</span></footer>
 </section>
</div>
<nav id="review-toolbar" aria-label="Teststeuerung" hidden>
 <button id="review-menu">Testauswahl</button><button id="review-restart">↻ Neustart</button><button id="review-reload">Speichern/Laden</button><button id="review-next" hidden>Nächster Fund</button><button id="review-sound" aria-pressed="false">Ton: aus</button>
</nav>
<div id="feedback-controls" hidden aria-label="Kampf-Rückmeldung testen">
 <button data-feedback="shield">Schildtreffer</button><button data-feedback="hull">Hüllentreffer</button><button data-feedback="collapse">Schildausfall</button><button data-feedback="target">Zielschildausfall</button><button data-feedback="empty">Energie leer</button>
</div>
<script type="module" src="/output/exploration-review/boot.js"></script>`);
await writeFile(new URL('index.html',out),html);
for(const name of ['boot.js','review.css'])await copyFile(new URL(`./exploration-review/${name}`,import.meta.url),new URL(name,out));
console.log('/output/exploration-review/index.html');
