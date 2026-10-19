import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out=new URL('../../output/planet-transitions/',import.meta.url);await mkdir(out,{recursive:true});
let html=await readFile(new URL('../../game.html',import.meta.url),'utf8');
html=html.replace('<head>','<head>\n<base href="/">').replace('<title>Voidrunner — Frontier Adventure</title>','<title>Voidrunner — Landing scenes</title>');
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script>
// Isolated demo: never writes to, replaces, or removes the real career save.
const memory=new Map(),getStored=Storage.prototype.getItem;
Storage.prototype.getItem=function(key){return memory.has(String(key))?memory.get(String(key)):String(key).startsWith('void-privateer-save')?null:getStored.call(this,key);};
Storage.prototype.setItem=function(key,value){memory.set(String(key),String(value));};
Storage.prototype.removeItem=function(key){memory.set(String(key),null);};Storage.prototype.clear=function(){memory.clear();};
localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));
</script>
<style>
#planet-review{position:fixed;z-index:14000;top:0;left:0;right:0;min-height:58px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap;padding:8px max(10px,env(safe-area-inset-right));background:#071426f5;border-bottom:1px solid #779ba8;transition:opacity .15s;color:#f3e6bf;font:16px var(--pixel-font)}
#planet-review select,#planet-review button{min-height:44px;border:1px solid #64889c;background:#102a3e;color:inherit;font:inherit;padding:6px 12px;max-width:32vw}#planet-review button{background:#ead081;color:#0b1c2b}#planet-review.is-playing{opacity:0;pointer-events:none}#planet-review:has(:disabled){opacity:.65}#planet-review.is-playing:has(:disabled){opacity:0}
</style>
<div id="planet-review"><select id="review-planet" aria-label="Ort"></select><select id="review-hull" aria-label="Schiff"></select><select id="review-paint" aria-label="Lackierung"></select><label style="display:flex;align-items:center;gap:6px"><input id="review-sound" type="checkbox">Sound</label><button id="review-entry">Anflug</button><button id="review-exit">Abflug</button></div>
<script type="module">
import '/src/main.js';
import {LOCATIONS,SHIPS,DOCK_LOCATION_IDS} from '/src/game/data.js';import {FLEET_PAINTS} from '/src/game/fleetPaintCatalog.js';import {createOutfittingState} from '/src/game/outfitting.js';
const bar=document.querySelector('#planet-review'),planet=document.querySelector('#review-planet'),hull=document.querySelector('#review-hull'),paint=document.querySelector('#review-paint');
const until=fn=>new Promise(resolve=>{const step=()=>fn()?resolve():setTimeout(step,40);step();});
for(const id of DOCK_LOCATION_IDS)planet.add(new Option(LOCATIONS[id].name,id));
for(const s of Object.values(SHIPS))hull.add(new Option(s.name,s.id));
const query=new URLSearchParams(location.search);planet.value=DOCK_LOCATION_IDS.includes(query.get('planet'))?query.get('planet'):'vesper';hull.value=SHIPS[query.get('hull')]?query.get('hull'):'wayfarer';
function paints(){paint.replaceChildren(...FLEET_PAINTS[hull.value].paints.map(p=>new Option(p.name,p.id)));}paints();
let busy=true;function enabled(value){for(const e of bar.querySelectorAll('button,select'))e.disabled=!value;}
enabled(false);await until(()=>window.__VOID_PRIVATEER__?.newGame);document.querySelector('[data-ui-command="new"]').click();document.querySelector('[data-ui-command="skip-new-career"]').click();
await until(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
const rt=__VOID_PRIVATEER__.getRuntime();rt.ui.actions.launch=async()=>false;document.querySelector('#review-sound').onchange=async e=>{if(e.target.checked)await rt.audio.enable();rt.audio.setVolumes(0,e.target.checked?.68:0);};
async function prepare(){const id=hull.value;rt.save.player.shipId=id;rt.save.player.outfitting=createOutfittingState([id]);rt.save.player.shipPaints??={};rt.save.player.shipPaints[id]=paint.value;rt.save.player.dockedAt=planet.value;rt.save.player.systemId=LOCATIONS[planet.value].systemId;rt.renderer.setSystem(rt.save.player.systemId);await Promise.all(rt.renderer.worldTextureLoads??[]);if(LOCATIONS[planet.value].kind==='station')await rt.renderer.ensureStationModels(rt.save.player.systemId);}
async function play(direction){
 if(busy)return;busy=true;enabled(false);
 try{
  bar.classList.add('is-playing');
  if(direction==='entry'){
   await prepare();rt.ui.showDock(rt.save,planet.value,{arrival:true});await until(()=>!rt.ui.concourseArrivalPending);
  }else{
   // The displayed hull is already prepared and landed. Reopening the dock
   // here would play another landing before the requested departure.
   rt.ui.startVesperLaunchTransition();await until(()=>!rt.ui.vesperLaunchTransition);
  }
 }finally{busy=false;enabled(true);bar.classList.remove('is-playing');}
}
document.querySelector('#review-entry').onclick=()=>play('entry');document.querySelector('#review-exit').onclick=()=>play('exit');planet.onchange=()=>play('entry');hull.onchange=()=>{paints();play('entry');};paint.onchange=()=>play('entry');
busy=false;await play('entry');
</script>`);
await writeFile(new URL('index.html',out),html);console.log('Planet and station arrival/departure review: output/planet-transitions/index.html');
