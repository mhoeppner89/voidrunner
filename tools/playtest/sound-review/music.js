// Music review: auditions every score piece through the real AudioManager
// and MusicDirector, and runs the game's own rotation for any place.
import {AudioManager} from '/src/game/audio.js';
import {MUSIC_PIECES,PIECES_BY_CONTEXT,APPROVED_PIECES,ROTATION,PIECE_BY_ID} from '/src/game/musicScore.js';
import {LOCATIONS} from '/src/game/data.js';
import {SYSTEMS} from '/src/game/galaxy.js';

const $=id=>document.getElementById(id),audio=new AudioManager(),NOTES_KEY='voidrunner-music-review-v1';
const GAME_APPROVED=new Set(APPROVED_PIECES),ALL_IDS=MUSIC_PIECES.map(piece=>piece.id);
const flight={speed:0,turn:0,yaw:0,shield:1,hyper:false,missileThreat:0,dockKind:undefined,dockId:undefined,systemId:'helios-verge',regionId:undefined};
let review={};try{review=JSON.parse(localStorage.getItem(NOTES_KEY))??{};}catch{}
let enabled=false,playing=null,last=performance.now(),frameId=0;

const placeName=id=>LOCATIONS[id]?.name??id;
const systemName=id=>SYSTEMS[id]?.name??id;
const meter=piece=>{const beats=piece.beats??4;return beats>=6?`${beats}/8 · ♪ = ${piece.tempo}`:`${beats}/4 · ♩ = ${piece.tempo}`;};
const contextOfKind={planet:'planet',field:'field',rings:'field',graveyard:'graveyard'};
function save(){try{localStorage.setItem(NOTES_KEY,JSON.stringify(review));}catch{}}

// ------------------------------------------------------------------ cards

const GROUPS=[
 ['Open space · shared pool','Plays in every system.',PIECES_BY_CONTEXT.open.filter(piece=>!piece.systems)],
 ...Object.keys(SYSTEMS).map(id=>[`Open space · ${systemName(id)}`,`Signature pieces: only heard in ${systemName(id)}, where they are favoured three to one over the shared pool.`,PIECES_BY_CONTEXT.open.filter(piece=>piece.systems?.[id])]),
 ['Near planets','Rotates while flying close to a planet.',PIECES_BY_CONTEXT.planet],
 ['Belts and rings','Rotates inside asteroid fields and the Pale Rings.',PIECES_BY_CONTEXT.field],
 ['Ship graveyard','Rotates at the Mourning Line.',PIECES_BY_CONTEXT.graveyard],
 ['Running dark','Holds while hiding from a patrol.',PIECES_BY_CONTEXT.stealth],
 ['Combat','One piece per fight, escalating with the number of hostiles.',PIECES_BY_CONTEXT.combat],
 ['Docked','Each theme belongs to its station or planet; small outposts share with a sibling.',PIECES_BY_CONTEXT.station],
];

function where(piece){
 const parts=[];
 if(piece.locations)parts.push(piece.locations.map(placeName).join(' · '));
 if(piece.systems)parts.push(...Object.entries(piece.systems).map(([id,weight])=>`${systemName(id)} ×${weight}`));
 if(piece.regions)parts.push(...Object.entries(piece.regions).map(([id,weight])=>`${placeName(id)} ×${weight}`));
 if(!piece.locations&&(piece.regions||piece.systems)&&piece.weight!==0)parts.push(`elsewhere ×${piece.weight??1}`);
 return parts;
}

function card(piece){
 const el=document.createElement('article');el.className='sound-card';el.dataset.piece=piece.id;
 const approved=GAME_APPROVED.has(piece.id);
 el.innerHTML=`<h3></h3><div class="chips"><span class="chip ${approved?'approved':'pending'}">${approved?'In the game':'Awaiting review'}</span><span class="chip">${meter(piece)}</span></div><p class="note"></p><p class="hint"></p><div class="actions"></div><div class="verdict" role="group"></div><label>Your notes<textarea placeholder="What works? What should change?"></textarea></label><p class="render" hidden></p>`;
 el.querySelector('h3').textContent=piece.title;
 el.querySelector('.note').textContent=piece.note;
 el.querySelector('.hint').textContent=[...where(piece),piece.id].join(' · ');
 const actions=el.querySelector('.actions');
 const button=(label,run)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=true;b.dataset.needsAudio='';b.onclick=run;actions.append(b);return b;};
 button('Play',()=>audition(piece));
 if(ROTATION[piece.context])button('Hear the ending',()=>audition(piece,{bars:8,rest:5}));
 if(piece.context==='combat'){button('Three hostiles',()=>{audition(piece,{keep:true});playing.enemies=4;});button('End the fight',()=>{if(playing)playing.enemies=0;});}
 else if(piece.context!=='station')button('Fight over it',()=>{if(playing?.piece===piece)playing.enemies=playing.enemies?0:2;else{audition(piece);playing.enemies=2;}});
 const verdict=el.querySelector('.verdict');verdict.setAttribute('aria-label',`Verdict for ${piece.title}`);
 for(const [value,label] of [['approve','Approve'],['change','Needs changes'],['reject','Reject']]){
  const b=document.createElement('button');b.type='button';b.dataset.verdict=value;b.textContent=label;
  b.setAttribute('aria-pressed',String(review[piece.id]?.verdict===value));
  b.onclick=()=>{const entry=review[piece.id]??={};entry.verdict=entry.verdict===value?undefined:value;save();for(const other of verdict.children)other.setAttribute('aria-pressed',String(other.dataset.verdict===entry.verdict));updateCount();};
  verdict.append(b);
 }
 const notes=el.querySelector('textarea');notes.value=review[piece.id]?.notes??'';notes.setAttribute('aria-label',`Notes for ${piece.title}`);
 notes.oninput=()=>{(review[piece.id]??={}).notes=notes.value;save();};
 // Offline renders from `npm run audio:mix -- --pieces`, when present.
 fetch(`/output/audio-mix/music/${piece.id}.wav`,{method:'HEAD'}).then(response=>{if(!response.ok)return;const p=el.querySelector('.render');p.hidden=false;p.innerHTML=`<a href="/output/audio-mix/music/${piece.id}.wav">Offline render (wav)</a> · <a href="/output/audio-mix/music/${piece.id}.png">spectrum</a>`;}).catch(()=>{});
 return el;
}

for(const [title,detail,pieces] of GROUPS){
 if(!pieces.length)continue;
 const section=document.createElement('section'),heading=document.createElement('h2');
 heading.className='group-title';heading.innerHTML=`<b></b><span></span>`;heading.firstChild.textContent=title;heading.lastChild.textContent=`${pieces.length} pieces · ${detail}`;
 const cards=document.createElement('div');cards.className='cards';
 for(const piece of pieces)cards.append(card(piece));
 section.append(heading,cards);$('catalog').append(section);
}
function updateCount(){
 const pending=MUSIC_PIECES.filter(piece=>!GAME_APPROVED.has(piece.id)),judged=pending.filter(piece=>review[piece.id]?.verdict).length;
 if(!enabled)$('status').textContent=`${MUSIC_PIECES.length} pieces · ${pending.length} awaiting review · ${judged} judged in this browser. Nothing plays until you enable audio.`;
}
updateCount();

// --------------------------------------------------------------- playback

function placeFor(piece){
 const location=piece.locations?.[0];
 const region=piece.regions?Object.keys(piece.regions)[0]:undefined;
 const system=piece.systems?Object.keys(piece.systems)[0]:LOCATIONS[location??region]?.systemId??'helios-verge';
 return {context:piece.context==='combat'||piece.context==='station'?'open':piece.context,docked:piece.context==='station',dockId:location,systemId:system,regionId:region,enemies:piece.context==='combat'?1:0};
}
function setApproved(ids){APPROVED_PIECES.clear();for(const id of ids)APPROVED_PIECES.add(id);}
function audition(piece,{bars,rest,keep}={}){
 if(!enabled)return;
 if(keep&&playing?.piece===piece)return;
 setApproved(GAME_APPROVED);
 audio.music.pace=null;audio.music.audition={id:piece.id,bars,rest};
 // Restart cleanly even when the same piece is already playing.
 audio.music.slot='';
 playing={piece,...placeFor(piece)};start();
}
function playRotation(){
 if(!enabled)return;
 const [kind,id]=$('rot-place').value.split(':');
 setApproved($('rot-pending').checked?ALL_IDS:GAME_APPROVED);
 audio.music.audition=null;audio.music.pace=$('rot-short').checked?{bars:16,rest:6}:null;audio.music.slot='';
 const location=LOCATIONS[id];
 playing={piece:null,context:kind==='dock'?'open':kind==='open'?'open':contextOfKind[location.kind],docked:kind==='dock',dockId:kind==='dock'?id:undefined,systemId:$('rot-system').value,regionId:kind==='near'?id:undefined,enemies:0};
 start();
}
function start(){
 audio.setVolumes(Number($('volume').value),0);
 for(const el of document.querySelectorAll('.is-playing'))el.classList.remove('is-playing');
 if(playing.piece)document.querySelector(`[data-piece="${playing.piece.id}"]`)?.classList.add('is-playing');
 $('now').hidden=false;
}
function stop(){
 playing=null;audio.music.audition=null;audio.music.pace=null;setApproved(GAME_APPROVED);
 audio.setVolumes(0,0);
 for(const el of document.querySelectorAll('.is-playing'))el.classList.remove('is-playing');
 $('now').hidden=true;$('status').textContent='Stopped.';
}

function frame(now){
 const dt=Math.max(0,Math.min(0.1,(now-last)/1000));last=now;
 if(playing){
  if(audio.stationMode!==playing.docked)audio.setStationMode(playing.docked);
  Object.assign(flight,{dockKind:playing.docked?LOCATIONS[playing.dockId]?.kind:undefined,dockId:playing.dockId,systemId:playing.systemId,regionId:playing.regionId});
  audio.update(dt,0,false,0,playing.enemies,playing.context,0,flight);
  const state=audio.music.nowPlaying(),piece=PIECE_BY_ID[state.id];
  const label=state.resting?`Resting · next piece in ${Math.ceil(state.restLeft)} s`:piece?`${piece.title} · ${state.context}${state.context==='combat'?` · tier ${audio.music.tier}`:''}`:'…';
  $('now-title').textContent=label;
  $('now-progress').textContent=piece&&Number.isFinite(state.length)?`bar ${state.bar} / ${state.length}`:piece?`bar ${state.bar}`:'';
  $('now-bar').style.width=piece&&Number.isFinite(state.length)?`${Math.min(100,state.bar/state.length*100)}%`:'0%';
  $('status').textContent=playing.piece?`Auditioning ${playing.piece.title}${GAME_APPROVED.has(playing.piece.id)?'':' (awaiting review)'}`:`The game’s choice · ${systemName(playing.systemId)} · ${$('rot-place').selectedOptions[0].textContent}`;
 }
 else if(enabled)audio.update(dt,0,false,0,0,'open',0,flight);
 frameId=requestAnimationFrame(frame);
}

// --------------------------------------------------------------- controls

function fillPlaces(){
 const system=$('rot-system').value,select=$('rot-place');select.innerHTML='';
 const add=(value,label)=>select.append(new Option(label,value));
 add('open:','Open space');
 for(const [id,location] of Object.entries(LOCATIONS)){
  if(location.systemId!==system)continue;
  if(contextOfKind[location.kind])add(`near:${id}`,`Near ${location.name}`);
 }
 for(const [id,location] of Object.entries(LOCATIONS)){
  if(location.systemId!==system||!['station','planet'].includes(location.kind))continue;
  add(`dock:${id}`,`Docked at ${location.name}`);
 }
}
for(const [id,system] of Object.entries(SYSTEMS))$('rot-system').append(new Option(system.name,id));
$('rot-system').onchange=fillPlaces;fillPlaces();
$('rot-play').onclick=playRotation;
$('rot-combat').onclick=()=>{if(playing)playing.enemies=2;};
$('rot-calm').onclick=()=>{if(playing)playing.enemies=0;};
$('enable').onclick=async()=>{
 $('enable').disabled=true;$('status').textContent='Loading the music kit…';
 try{
  audio.setVolumes(0,0);await audio.enable();if(!audio.context)throw Error('This browser cannot start audio.');
  await Promise.all([audio.samplesReady,audio.bank.load('music')]);audio.engine?.silence?.();
  enabled=true;$('enable').hidden=true;for(const b of document.querySelectorAll('[data-needs-audio],#stop'))b.disabled=false;
  $('status').textContent='Ready. Play any piece, or let the game choose for a place.';
  last=performance.now();frameId=requestAnimationFrame(frame);
 }catch(error){$('status').textContent=error.message;$('enable').disabled=false;}
};
$('volume').oninput=()=>{$('volume-value').textContent=`${Math.round(Number($('volume').value)*100)}%`;if(playing)audio.setVolumes(Number($('volume').value),0);};
$('stop').onclick=stop;
$('export').onclick=()=>{
 const verdicts=Object.fromEntries(MUSIC_PIECES.filter(piece=>review[piece.id]?.verdict||review[piece.id]?.notes).map(piece=>[piece.id,{title:piece.title,context:piece.context,...review[piece.id]}]));
 const blob=new Blob([JSON.stringify({review:'Voidrunner music',exported:new Date().toISOString(),verdicts},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='voidrunner-music-review.json';a.click();URL.revokeObjectURL(url);
};
$('copy-approved').onclick=async()=>{
 const ids=MUSIC_PIECES.filter(piece=>review[piece.id]?.verdict==='approve').map(piece=>piece.id).join(' ');
 try{await navigator.clipboard.writeText(ids);$('status').textContent=ids?`Copied ${ids.split(' ').length} approved ids.`:'No pieces approved yet.';}catch{$('status').textContent=ids||'No pieces approved yet.';}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop();});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);audio.dispose();},{once:true});
// Exposed for the automated check.
window.musicReview={audio,audition,playRotation,stop,get playing(){return playing;},get enabled(){return enabled;}};
