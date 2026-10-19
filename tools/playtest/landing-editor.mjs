import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const out=new URL('../../output/landing-editor/',import.meta.url);
await mkdir(out,{recursive:true});
for(const file of ['index.html','editor.css','editor.js','preview.js'])await copyFile(new URL(`landing-editor/${file}`,import.meta.url),new URL(file,out));
let frame=await readFile(new URL('../../game.html',import.meta.url),'utf8');
const version=(await readFile(new URL('../../src/game/ui.js',import.meta.url),'utf8')).match(/const GAME_VERSION = '([^']+)'/)[1];
frame=frame.replace('<head>','<head>\n<base href="/">').replace('<script type="module" src="./src/main.js"></script>',`<script>
// The preview owns an in-memory save. Parent editor settings use a separate key.
const memory=new Map(),readStored=Storage.prototype.getItem;
Storage.prototype.getItem=function(key){key=String(key);return memory.has(key)?memory.get(key):key.startsWith('void-privateer-save')?null:readStored.call(this,key);};
Storage.prototype.setItem=function(key,value){memory.set(String(key),String(value));};
Storage.prototype.removeItem=function(key){memory.set(String(key),null);};Storage.prototype.clear=function(){memory.clear();};
localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));
window.LANDING_REFERENCE_VERSION=${JSON.stringify(version)};
</script>
<style>.scene-pointers{transition:none!important}#rotate-notice{display:none!important}</style>
<script type="module" src="/output/landing-editor/preview.js"></script>`);
await writeFile(new URL('preview.html',out),frame);
console.log('Landing editor: output/landing-editor/index.html');
