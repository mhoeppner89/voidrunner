import {AudioManager} from '/src/game/audio.js';
import {SOUND_EVENTS} from '/src/game/soundEvents.js';
import {WEAPONS,LAUNCHERS,TRACKING_LASER} from '/src/game/weapons.js';
import {t} from '/src/game/i18n.js';
const $=id=>document.getElementById(id),audio=new AudioManager(),NOTES_KEY='voidrunner-weapon-sound-review-notes-v1';
const titles={laser:'Pulse laser / capital cannon',beam:'Beam / automatic laser turret',gauss:'Magrail / capital rail battery',pdc:'Point defence',ripper:'Scattergun',ion:'Ion projector',mortar:'Plasma mortar',missile:'Missiles / torpedoes'};
const profiles=[...Object.values(WEAPONS).filter(w=>!w.legacyOnly).map(w=>({...w,label:t(w.nameKey),gain:w.kind==='gauss'?.85:w.kind==='mortar'?.95:.72})),...Object.values(LAUNCHERS).map(w=>({...w,label:t(w.nameKey),gain:1})),{...TRACKING_LASER,label:'Automatic laser turret',audioKey:'beam',gain:.85},{...WEAPONS.pdc,id:'capital-pdc',label:'Capital point-defence turret',gain:.85}];
const catalog=Object.entries(titles).map(([event,title])=>({event,title,profiles:profiles.filter(w=>w.audioKey===event)}));
const feedback=[['impact','Metal impact'],['rock','Rock impact'],['shield','Shield hit'],['hit','Hull hit'],['shieldBreak','Own shield collapse'],['targetShieldBreak','Target shield collapse'],['explosion','Ship explosion'],['capitalExplosion','Capital ship explosion'],['whizz','Near miss'],['capacitorEmpty','Empty weapon energy'],['weaponSwitch','Weapon selection'],['targetLock','Your target lock'],['missileAlert','Incoming missile']].map(([event,title])=>({event,title}));
let notes={};try{notes=JSON.parse(localStorage.getItem(NOTES_KEY))??{};}catch{}
let queue=[],active,frameId=0,enabled=false;const history=[];
function card(entry,weapon){
 const el=document.createElement('article');el.className='sound-card';el.dataset.sound=entry.event;
 const h=document.createElement('h3');h.textContent=entry.title;el.append(h);
 if(weapon){const label=document.createElement('label');label.textContent='Weapon / firing rhythm';const select=document.createElement('select');select.dataset.profile=entry.event;select.setAttribute('aria-label',`${entry.title}: weapon and firing rhythm`);for(const p of entry.profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.label;select.append(option);}label.append(select);el.append(label);}
 const hint=document.createElement('p');hint.className='hint';hint.textContent=weapon?(entry.profiles.length>1?'These weapons share this sound. The selection changes the firing rhythm.':'One sound family; repeated shots include the game’s natural variations.'):'Played through the game mixer.';el.append(hint);
 const actions=document.createElement('div');actions.className='actions';
 for(const [action,label]of weapon?[['shot','Single shot'],['burst','Fire for 3 seconds']]:[['shot','Play sound']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.play=action;button.dataset.event=entry.event;button.disabled=true;button.onclick=()=>begin([{entry,burst:action==='burst'}]);actions.append(button);}el.append(actions);
 const label=document.createElement('label');label.textContent='Your notes';const field=document.createElement('textarea');field.value=notes[entry.event]??'';field.placeholder='What works? What should change?';field.setAttribute('aria-label',`Notes for ${entry.title}`);field.oninput=()=>{notes[entry.event]=field.value;try{localStorage.setItem(NOTES_KEY,JSON.stringify(notes));}catch{}};label.append(field);el.append(label);return el;
}
for(const entry of catalog)$('weapons').append(card(entry,true));for(const entry of feedback)$('effects').append(card(entry,false));
$('coverage').textContent=`${catalog.length} sound families · ${profiles.length} weapon and turret profiles`;
function currentProfile(entry){const id=document.querySelector(`[data-profile="${entry.event}"]`)?.value;return entry.profiles?.find(w=>w.id===id)??{id:entry.event,cooldown:1,gain:.85};}
function silence(){for(const release of [...(audio.effectReleases??[])])release();audio.effectTimes?.clear();}
function stop(){cancelAnimationFrame(frameId);frameId=0;queue=[];active=undefined;silence();for(const el of document.querySelectorAll('.is-playing'))el.classList.remove('is-playing');$('status').textContent='Stopped.';}
function begin(items){if(!enabled)return;stop();queue=items;next();}
function next(){
 for(const el of document.querySelectorAll('.is-playing'))el.classList.remove('is-playing');
 const item=queue.shift();if(!item){active=undefined;$('status').textContent='Finished. Replay a sound or add your notes.';return;}
 const now=audio.context.currentTime,profile=currentProfile(item.entry);active={...item,profile,start:now,next:now,end:now+(item.burst?3:.01),shots:0,cycleShot:0};document.querySelector(`[data-sound="${item.entry.event}"]`).classList.add('is-playing');pump();
}
function pump(){
 if(!active||!enabled)return;
 const now=audio.context.currentTime;if(now-active.next>.2)active.next=now;
 if(now>=active.next&&active.next<active.end){
  const {entry,profile}=active,perspective=$('perspective').value;
  if(perspective==='cockpit')audio.play(entry.event,profile.gain);else{const distance=perspective==='near'?100:300;audio.playAtDirection(entry.event,profile.category==='launcher'?.8:.55,distance,distance*.35,-distance*.8);}
  history.push({event:entry.event,profile:profile.id,time:now});active.shots++;active.cycleShot++;
  const round=profile.shotInterval??profile.cooldown;active.next+=round;
  if(profile.burstSize&&active.cycleShot>=profile.burstSize){active.next+=profile.burstPause??0;active.cycleShot=0;}
 }
 $('status').textContent=`${active.entry.title} · ${active.profile.label??'single sound'} · ${active.shots} shot${active.shots===1?'':'s'}${queue.length?` · ${queue.length} remaining`:''}`;
 if(now>=active.end+1.5){next();return;}
 frameId=requestAnimationFrame(pump);
}
$('enable').onclick=async()=>{
 $('enable').disabled=true;$('status').textContent='Loading game sounds…';
 try{audio.setVolumes(0,Number($('volume').value));await audio.enable();await audio.samplesReady;if(!audio.context)throw Error('This browser cannot start audio.');if(audio.bank.failed.size)throw Error('Some sound files could not load. Reload and retry.');audio.engine.silence();enabled=true;$('enable').hidden=true;for(const button of document.querySelectorAll('[data-play],#stop'))button.disabled=false;$('status').textContent='Ready. Choose a single shot, firing burst or play all.';}
 catch(error){$('status').textContent=error.message;$('enable').disabled=false;}
};
$('volume').oninput=()=>{$('volume-value').textContent=`${Math.round(Number($('volume').value)*100)}%`;audio.setVolumes(0,Number($('volume').value));};
$('play-all').onclick=()=>begin(catalog.map(entry=>({entry,burst:true})));$('stop').onclick=stop;
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({review:'Voidrunner weapon sounds',notes,profiles:Object.fromEntries(catalog.map(entry=>[entry.event,currentProfile(entry).id]))},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='voidrunner-weapon-sound-feedback.json';a.click();URL.revokeObjectURL(url);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',()=>{stop();audio.dispose();},{once:true});
window.weaponSoundReview={audio,catalog,feedback,history,stop,get active(){return active;},get enabled(){return enabled;}};
