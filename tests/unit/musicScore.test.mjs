import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MusicDirector} from '../../src/game/audioMusic.js';
import {MUSIC_CONTEXTS,MUSIC_PIECES,PIECE_BY_ID,PIECES_BY_CONTEXT,ROTATION,APPROVED_PIECES,DOCK_THEMES,DOCK_FALLBACK,dockThemeFor,pieceWeight} from '../../src/game/musicScore.js';
import {LOCATIONS} from '../../src/game/data.js';
import {SYSTEM_IDS} from '../../src/game/galaxy.js';
import {SOUNDS} from '../../src/game/soundBank.js';
import {fakeMusicManager} from '../helpers/fake-audio.mjs';

const ORIGINAL=['open-drift','planet-wind','field-steel','graveyard-lament','stealth-heart','combat-drums','dock-lounge'];
const withApproved=(ids,run)=>{const saved=[...APPROVED_PIECES];APPROVED_PIECES.clear();for(const id of ids)APPROVED_PIECES.add(id);try{return run();}finally{APPROVED_PIECES.clear();for(const id of saved)APPROVED_PIECES.add(id);}};

// Drive a director on a fake clock: `seconds` of 60 Hz frames.
function run(director,seconds,context,place,danger=0){
 const ctx=director.context;
 for(let frame=0;frame<seconds*60;frame+=1){ctx.currentTime+=1/60;director.update(1/60,context,danger,place);}
}

test('the catalogue is complete: every context has at least two new pieces beside the original',()=>{
 const ids=new Set();
 for(const piece of MUSIC_PIECES){
  assert.ok(!ids.has(piece.id),`duplicate ${piece.id}`);ids.add(piece.id);
  assert.ok(MUSIC_CONTEXTS.includes(piece.context),`${piece.id} context`);
  assert.ok(piece.title&&piece.note?.length>40,`${piece.id} needs a title and a review note`);
  assert.ok(piece.tempo>=30&&piece.tempo<=340,`${piece.id} tempo`);
  assert.ok(Number.isInteger(piece.beats??4)&&(piece.beats??4)>=3&&(piece.beats??4)<=9,`${piece.id} meter`);
  assert.equal(typeof piece.bar,'function');
  for(const id of Object.keys(piece.systems??{}))assert.ok(SYSTEM_IDS.includes(id),`${piece.id} names unknown system ${id}`);
  for(const id of Object.keys(piece.regions??{}))assert.ok(LOCATIONS[id],`${piece.id} names unknown region ${id}`);
  if(piece.context==='combat')assert.ok(piece.resolve?.length>=3,`${piece.id} needs a resolve chord`);
 }
 for(const id of ORIGINAL)assert.ok(PIECE_BY_ID[id],`original ${id} kept`);
 for(const context of MUSIC_CONTEXTS)assert.ok(PIECES_BY_CONTEXT[context].length>=3,`${context} has ${PIECES_BY_CONTEXT[context].length} pieces`);
 for(const id of APPROVED_PIECES)assert.ok(PIECE_BY_ID[id],`approved ${id} exists`);
 // Open space: a shared pool plus two signature pieces for every system.
 const open=PIECES_BY_CONTEXT.open;
 assert.ok(open.filter(piece=>!piece.systems).length>=3,'shared open-space pool');
 for(const system of SYSTEM_IDS){
  const own=open.filter(piece=>piece.systems?.[system]>0&&piece.weight===0);
  assert.ok(own.length>=2,`${system} has ${own.length} signature pieces`);
 }
});

test('every station and planet has a docked theme; outposts share sensibly',()=>{
 const docks=Object.entries(LOCATIONS).filter(([,location])=>['station','planet'].includes(location.kind)).map(([id])=>id);
 for(const id of docks)assert.ok(DOCK_THEMES[id],`${id} has no docked theme`);
 for(const [id,piece] of Object.entries(DOCK_THEMES)){assert.ok(LOCATIONS[id],`theme for unknown dock ${id}`);assert.equal(PIECE_BY_ID[piece].context,'station');}
 const themes=new Set(Object.values(DOCK_THEMES));assert.ok(themes.size>=12,`only ${themes.size} distinct docked themes`);
 // Unapproved themes fall back to the lounge.
 withApproved(ORIGINAL,()=>{assert.equal(dockThemeFor('rook').id,DOCK_FALLBACK);assert.equal(dockThemeFor(undefined).id,DOCK_FALLBACK);});
 withApproved([...ORIGINAL,'dock-bastion'],()=>{assert.equal(dockThemeFor('rook').id,'dock-bastion');assert.equal(dockThemeFor('gatehouse-twelve').id,'dock-bastion');});
});

test('every piece schedules valid audio for many bars at every combat tier, inside the house rules',()=>{
 const drums=new Set(Object.keys(SOUNDS).filter(id=>SOUNDS[id].group==='music'));
 const report=[];
 for(const piece of MUSIC_PIECES){
  for(const tier of piece.context==='combat'?[0,1,2]:[0]){
   const manager=fakeMusicManager({drums}),director=new MusicDirector(manager),ctx=manager.context;
   const high=[];
   for(const name of ['bell','pluck','mallet']){
    const play=director[name].bind(director);
    director[name]=(at,midi,level,options,group)=>{if(midi>84)high.push(`${name} ${midi}`);if(name==='bell'&&(options?.attack??0.04)<0.03)high.push('hard bell attack');assert.ok(level>0&&level<0.2,`${piece.id} ${name} level ${level}`);return play(at,midi,level,options,group);};
   }
   director.audition={id:piece.id,bars:48,rest:2};
   let bars=0,ended=0;const playBar=director.playBar.bind(director),finish=director.finish.bind(director);
   director.playBar=at=>{bars+=1;playBar(at);};director.finish=at=>{ended+=1;finish(at);};
   const before=ctx.created;
   const seconds=48*(piece.beats??4)*60/piece.tempo+6;
   run(director,seconds,piece.context,{systemId:'helios-verge',dockId:piece.locations?.[0]},[0.3,0.6,0.9][tier]);
   assert.equal(director.tier,tier,`${piece.id} reached tier ${tier}`);
   assert.ok(bars>=48,`${piece.id} played ${bars} bars`);
   if(ROTATION[piece.context])assert.equal(ended,1,`${piece.id} closes once`);
   assert.deepEqual(high,[],`${piece.id} plays above the register cap or with a hard attack`);
   for(const id of manager.drumsUsed)assert.ok(drums.has(id),`${piece.id} uses unknown drum ${id}`);
   const perSecond=(ctx.created-before)/seconds;
   report.push([piece.id+(tier?`@${tier}`:''),perSecond]);
   assert.ok(perSecond<130,`${piece.id} creates ${perSecond.toFixed(0)} nodes/s`);
  }
 }
 report.sort((a,b)=>b[1]-a[1]);
 assert.ok(report.length>=MUSIC_PIECES.length);
});

test('rotating contexts close a piece with a rest and then choose a different one',()=>{
 withApproved(MUSIC_PIECES.map(piece=>piece.id),()=>{
  const manager=fakeMusicManager(),director=new MusicDirector(manager),place={systemId:'redwake'};
  run(director,1,'open',place);
  const first=director.piece;assert.ok(first);
  assert.ok(Number.isFinite(director.length)&&director.length>=8);
  const seconds=director.length*director.barSeconds;
  run(director,seconds+1,'open',place);
  assert.equal(director.piece,null,'the piece ends after its length');
  assert.ok(director.nowPlaying().resting);
  const [lo,hi]=ROTATION.open.rest;assert.ok(director.restUntil-director.context.currentTime<=hi+1&&director.restUntil-director.context.currentTime>=lo-director.barSeconds-2);
  run(director,hi+2,'open',place);
  assert.ok(director.piece,'music returns after the rest');
  assert.notEqual(director.piece.id,first.id,'never the same piece twice running');
 });
});

test('open-space choices favour the current system and never borrow another system\'s signature',()=>{
 withApproved(MUSIC_PIECES.map(piece=>piece.id),()=>{
  for(const system of SYSTEM_IDS){
   const counts={},manager=fakeMusicManager(),director=new MusicDirector(manager);
   director.systemId=system;director.current='open';
   for(let i=0;i<600;i+=1){const piece=director.choose('open');counts[piece.id]=(counts[piece.id]??0)+1;}
   for(const id of Object.keys(counts)){const piece=PIECE_BY_ID[id];assert.ok(!piece.systems||piece.systems[system],`${id} played in ${system}`);}
   const home=Object.entries(counts).filter(([id])=>PIECE_BY_ID[id].systems?.[system]).reduce((sum,[,n])=>sum+n,0);
   assert.ok(home/600>0.5,`${system} signature share ${(home/600).toFixed(2)}`);
  }
  // Regions steer the field pieces.
  assert.equal(pieceWeight(PIECE_BY_ID['field-red-shoals'],'redwake','redwake-belt'),3);
  assert.ok(pieceWeight(PIECE_BY_ID['field-red-shoals'],'helios-verge','shardbelt')<1);
 });
});

test('only approved pieces play in the game; the review page can audition any piece',()=>{
 withApproved(ORIGINAL,()=>{
  const manager=fakeMusicManager(),director=new MusicDirector(manager);
  for(const context of MUSIC_CONTEXTS)for(let i=0;i<40;i+=1)assert.ok(APPROVED_PIECES.has(director.choose(context).id),context);
  director.audition={id:'open-pale-rime'};
  run(director,1,'open',{systemId:'helios-verge'});
  assert.equal(director.piece.id,'open-pale-rime');
  // Combat still interrupts an auditioned ambient piece, and resolves afterwards.
  run(director,1,'combat',{systemId:'helios-verge'},0.6);
  assert.equal(director.current,'combat');assert.equal(director.piece.context,'combat');
  run(director,3,'open',{systemId:'helios-verge'});
  assert.equal(director.piece.id,'open-pale-rime');
 });
});

test('docking changes the theme with the dock, and music off releases everything',()=>{
 withApproved(MUSIC_PIECES.map(piece=>piece.id),()=>{
  const manager=fakeMusicManager(),director=new MusicDirector(manager);
  run(director,1,'station',{dockId:'blackglass'});assert.equal(director.piece.id,'dock-blackglass');
  run(director,1,'station',{dockId:'nacre'});assert.equal(director.piece.id,'dock-nacre');
  assert.equal(director.length,Infinity,'docked themes hold');
  manager.musicVolume=0;run(director,0.5,'station',{dockId:'nacre'});
  assert.equal(director.group,null);assert.equal(director.piece,null);
 });
});

test('the service worker precaches every score module',async()=>{
 const {readFileSync}=await import('node:fs');
 const worker=readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
 for(const name of ['audioMusic.js','musicKit.js','musicScore.js','musicSpace.js','musicFlight.js','musicDocked.js'])assert.ok(worker.includes(`'./src/game/${name}'`),name);
});

test('one fight keeps one piece; calm places settle before the score follows; handovers breathe',()=>{
 const manager=fakeMusicManager(),director=new MusicDirector(manager),ctx=manager.context,place={systemId:'helios-verge'};
 run(director,2,'open',place);
 run(director,5,'combat',place,0.6);
 const fight=director.piece;assert.equal(director.current,'combat');
 run(director,8,'open',place);assert.equal(director.current,'open');
 // The resolve chord rings before the calm piece swells in.
 run(director,20,'combat',place,0.6);assert.equal(director.piece,fight,'a re-engagement resumes the same combat piece');
 run(director,1,'open',place);
 const open=director.piece;
 run(director,3,'planet',place);assert.equal(director.current,'open','a brief excursion does not switch pieces');assert.equal(director.piece,open);
 run(director,4,'planet',place);assert.equal(director.current,'planet','a held place takes over after it settles');
 assert.ok(director.nextBar-ctx.currentTime>1.5,'the new piece waits for the outgoing one to thin out');
});

test('Arena waves are fresh fights: each wave lands on a new combat piece, never one of the last three',()=>{
 const manager=fakeMusicManager(),director=new MusicDirector(manager),place={systemId:'helios-verge'};
 run(director,2,'open',place);
 const played=[];
 for(let wave=0;wave<10;wave+=1){
  director.freshFight();
  run(director,20,'combat',place,0.6);
  played.push(director.piece.id);
  // Odd waves: the score still holds from the last fight when the next wave
  // starts; even waves: a short calm stretch between them.
  if(wave%2)run(director,8,'open',place);
 }
 for(let i=1;i<played.length;i+=1)assert.ok(!played.slice(Math.max(0,i-3),i).includes(played[i]),`wave ${i+1} repeats a recent piece: ${played.join(', ')}`);
 assert.ok(new Set(played).size>=5,`a ten-wave run hears at least five pieces: ${played.join(', ')}`);
});

test('a new fight after the memory has passed avoids the previous combat piece',()=>{
 const manager=fakeMusicManager(),director=new MusicDirector(manager),place={systemId:'helios-verge'};
 for(let round=0;round<6;round+=1){
  run(director,2,'open',place);
  run(director,5,'combat',place,0.6);
  const fight=director.piece.id;
  run(director,100,'open',place);
  run(director,5,'combat',place,0.6);
  assert.notEqual(director.piece.id,fight,'a fight after COMBAT_MEMORY is not the previous one again');
  run(director,100,'open',place);
 }
});

test('the combat score holds through a strafing run out of range',async()=>{
 const {AudioManager}=await import('../../src/game/audio.js');
 const audio=Object.create(AudioManager.prototype),contexts=[];
 Object.assign(audio,{context:{currentTime:0},enabled:true,stationMode:false,dangerLevel:0,musicContext:'open',engine:{update(){}},ambience:{update(){}},music:{update:(dt,context)=>contexts.push(context)},sweepWork(){},updateCockpit(){}});
 const frames=(seconds,enemies)=>{for(let i=0;i<seconds*60;i+=1){audio.context.currentTime+=1/60;audio.update(1/60,0.5,false,0,enemies,'open');}};
 frames(1,0);frames(3,2);assert.equal(audio.currentContext,'combat');
 frames(10,0);assert.equal(audio.currentContext,'combat','ten seconds out of range is still the same fight');
 frames(3,1);frames(16,0);assert.equal(audio.currentContext,'open','the fight ends after the hold');
 assert.equal(contexts.filter((c,i)=>i&&c!==contexts[i-1]).length,2,'exactly one switch into combat and one out');
});
