import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {SOUNDS} from '../../src/game/soundBank.js';
import {FORGED_SOUNDS} from '../../src/game/soundBankManifest.js';
import {SOUND_EVENTS,FALLBACK_EVENT} from '../../src/game/soundEvents.js';
import {AudioManager} from '../../src/game/audio.js';

const source=name=>readFileSync(new URL(`../../src/game/${name}`,import.meta.url),'utf8');

test('every sound event layer resolves to a bank entry with shipped files',()=>{
 assert.ok(SOUND_EVENTS[FALLBACK_EVENT]);
 for(const [id,event] of Object.entries(SOUND_EVENTS)){
  assert.ok(event.layers.length>0,`${id} has no layers`);assert.ok(['cockpit','world','ui'].includes(event.bus),`${id} names a real bus`);
  for(const [layer,gain] of event.layers){assert.ok(SOUNDS[layer],`${id} uses unknown sound ${layer}`);assert.ok(gain>0&&gain<=1.2,`${id}/${layer} gain`);}
 }
 for(const [id,sound] of Object.entries(SOUNDS)){
  assert.ok(['flight','ui','dock','music'].includes(sound.group),`${id} group`);
  for(const file of sound.files)assert.ok(existsSync(new URL(`../../assets/audio/${file}`,import.meta.url)),`missing assets/audio/${file}`);
 }
});

test('forged loops carry their seamless window and stay inside the file',()=>{
 const loops=Object.entries(FORGED_SOUNDS).filter(([,sound])=>sound.loop);assert.ok(loops.length>=4);
 for(const [id,{loop}] of loops){assert.ok(loop[0]>0.05,`${id} has a pre-roll for decoder delay`);assert.ok(loop[1]>=2,`${id} period`);}
});

test('the forged set stays within its download budget and has no orphaned files',()=>{
 const directory=new URL('../../assets/audio/fx/',import.meta.url),files=readdirSync(directory);
 const listed=new Set(Object.values(FORGED_SOUNDS).flatMap(sound=>sound.files.map(file=>file.replace('fx/',''))));
 assert.deepEqual(files.filter(file=>!listed.has(file)),[],'run tools/audio/forge.mjs after removing a recipe and delete its files');
 const bytes=files.reduce((total,file)=>total+statSync(new URL(file,directory)).size,0);assert.ok(bytes<2.6*1048576,`forged audio is ${(bytes/1048576).toFixed(2)} MB`);
});

test('every effect the game triggers is a designed event, never the generic fallback',()=>{
 const work=new Set(['repair','mining']),used=new Set();
 for(const name of ['game.js','turrets.js','distressEvents.js','careerLoot.js','audio.js','audioEngine.js','audioAmbience.js']){
  const text=source(name);
  for(const call of text.matchAll(/(?:\.play(?:Cockpit|AtDirection)?|playWorldSound|\.trigger)\)?\??\.?(?:call)?\(([^)]*)/g))
   for(const name of call[1].matchAll(/'([A-Za-z]+)'/g))used.add(name[1]);
 }
 assert.ok(used.size>40,'the scan finds the call sites');
 for(const effect of used)if(!work.has(effect))assert.ok(SOUND_EVENTS[effect],`'${effect}' is triggered but has no sound event`);
 for(const weapon of ['laser','beam','gauss','pdc','ripper','ion','mortar','missile'])assert.ok(SOUND_EVENTS[weapon],weapon);
});

test('the service worker precaches every audio runtime module',()=>{
 const worker=readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
 for(const name of ['audio.js','soundBank.js','soundBankManifest.js','soundEvents.js','audioEngine.js','audioAmbience.js','audioMusic.js','transitAudio.js'])assert.ok(worker.includes(`'./src/game/${name}'`),name);
});

test('an audio manager that never received a user gesture stays inert',()=>{
 const a=new AudioManager();
 for(const id of Object.keys(SOUND_EVENTS)){assert.doesNotThrow(()=>a.play(id));assert.doesNotThrow(()=>a.playAtDirection(id,1,100,10,10));}
 assert.doesNotThrow(()=>{a.update(1/60,1,true,.9,3,'field',0,{speed:1});a.stinger('kill');a.setStationMode(false);a.setVolumes(1,1);a.playComms('timid');a.cinematicSound('stop');a.dispose();});
});


test('the retired telephone-like lock tone cannot be loaded or reached by any event',()=>{
 assert.equal(SOUND_EVENTS.lockWarning,undefined);assert.equal(SOUNDS['lock-warning'],undefined);
 assert.ok(!Object.values(SOUND_EVENTS).some(event=>event.layers.some(([id])=>id==='lock-warning')));
 assert.ok(SOUND_EVENTS.missileAlert,'the separate incoming-missile warning stays available');
 assert.ok(!source('game.js').includes("'lockWarning'"));
});
