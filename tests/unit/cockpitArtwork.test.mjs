import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {STARTER_COCKPIT,paintedCockpitAssets} from '../../src/game/cockpitArtwork.js';

test('live starter cockpit matches the approved review assets, openings and shaft anchors',async()=>{
 const approved=JSON.parse(await readFile(new URL('../../assets/cockpits/wayfarer-v4.json',import.meta.url),'utf8'));
 assert.ok(approved.shell.startsWith('/assets/'),'export has portable web paths');
 assert.deepEqual(STARTER_COCKPIT.monitors,approved.monitors);
 assert.deepEqual(STARTER_COCKPIT.strip.frames,approved.handStrip.frames);
 assert.equal(STARTER_COCKPIT.strip.renderWidth,approved.handStrip.renderWidth);
 assert.equal(STARTER_COCKPIT.housingTop,approved.housingTop);
 const {path,...base}=STARTER_COCKPIT.stickBase,{path:approvedPath,...approvedBase}=approved.stickBase;assert.deepEqual(base,approvedBase);assert.ok(path.endsWith(approvedPath));
 for(const [url,w,h]of [[STARTER_COCKPIT.shell,approved.width,approved.height],[STARTER_COCKPIT.hand,approved.handStrip.width,approved.handStrip.height],[STARTER_COCKPIT.stickBase.path,approved.stickBase.width,approved.stickBase.height]]){
  const png=await readFile(new URL(url));assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);assert.equal(png[25],6,'RGBA retains transparency');
 }
 assert.equal(paintedCockpitAssets('wayfarer').length,3);assert.equal(paintedCockpitAssets('talon').length,3);
});

test('Mercury ships with approved instruments and the original anchored pilot rig',async()=>{
 const {getCockpitDefinition,APPROVED_COCKPIT_LAYOUT,cockpitManifest}=await import('../../src/game/cockpitDefinitions.js');
 const mercury=getCockpitDefinition('talon',{review:true});
 assert.equal(mercury.status,'approved');assert.match(mercury.shell,/talon-paint-v4.png$/);
 assert.equal(getCockpitDefinition('talon'),mercury);assert.equal(mercury.handOffsetX,-60);assert.equal(getCockpitDefinition('unknown',{review:true}),undefined);
 assert.deepEqual(mercury.monitors.own,{x:423,y:634,width:299,height:161});assert.deepEqual(mercury.monitors.radar,{x:799,y:653,width:255,height:161});assert.deepEqual(mercury.monitors.target,{x:1129,y:634,width:294,height:161});assert.ok(!mercury.apertureClip);assert.equal(mercury.strip,STARTER_COCKPIT.strip);assert.equal(mercury.stickBase,STARTER_COCKPIT.stickBase);
 assert.ok(Object.isFrozen(APPROVED_COCKPIT_LAYOUT.monitors.own));
 assert.equal(cockpitManifest('talon').shell,'/assets/cockpits/talon-paint-v4.png');
 const png=await readFile(new URL(mercury.shell));assert.equal(png.readUInt32BE(16),mercury.artworkSize[0]);assert.equal(png.readUInt32BE(20),mercury.artworkSize[1]);assert.equal(png[25],6);
});

test('approved Loki frame is selected and warmed with the separate shared pilot rig',async()=>{
 const {getCockpitDefinition,APPROVED_COCKPIT_LAYOUT,cockpitManifest}=await import('../../src/game/cockpitDefinitions.js');
 const loki=getCockpitDefinition('speedster');
 assert.equal(loki.status,'approved');assert.match(loki.shell,/speedster-paint-v2.png$/);
 assert.deepEqual(paintedCockpitAssets('speedster'),[loki.shell,APPROVED_COCKPIT_LAYOUT.hand,APPROVED_COCKPIT_LAYOUT.stickBase.path]);
 assert.equal(loki.hand,APPROVED_COCKPIT_LAYOUT.hand);assert.equal(loki.strip,APPROVED_COCKPIT_LAYOUT.strip);assert.equal(loki.stickBase,APPROVED_COCKPIT_LAYOUT.stickBase);
 assert.equal(loki.handOffsetX,-60);assert.equal(loki.stickClearanceX,416);assert.ok(!loki.apertureClip,'approved painted rims stay intact');
 assert.equal(cockpitManifest('speedster').shell,'/assets/cockpits/speedster-paint-v2.png');
 const png=await readFile(new URL(loki.shell));assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],loki.artworkSize);assert.equal(png[25],6,'approved frame retains alpha');
});

test('shared layout preserves source apertures, jump edge and stick centering at desktop and phone sizes',async()=>{
 const {getCockpitDefinition,cockpitLayout}=await import('../../src/game/cockpitDefinitions.js');
 for(const [W,H]of [[1440,900],[844,390],[667,375]]){
  const measurements={jumpHeight:32,baseline:{x:8,width:118},throttle:{y:110},corners:{bottom:70}};
  const a=cockpitLayout(STARTER_COCKPIT,W,H,measurements),b=cockpitLayout(getCockpitDefinition('talon',{review:true}),W,H,measurements);
  assert.ok(Math.abs(a.stickSize-b.stickSize)<.1);assert.ok(Math.abs(a.stickTranslate-b.stickTranslate)<.15);
  assert.ok(b.monitors.radar.y>a.monitors.radar.y);
  assert.ok(Math.abs(b.hyper.y+b.hyper.height-633/850*H)<1e-8);assert.ok(b.hyper.y>=560/850*H);assert.ok(b.hyper.y+b.hyper.height<b.monitors.radar.y);
  for(const [key,q]of Object.entries(a.monitors)){
   const r=STARTER_COCKPIT.monitors[key];assert.equal(q.x,r.x/1851*W);assert.equal(q.y,r.y/850*H);assert.equal(q.width,r.width/1851*W);assert.equal(q.height,r.height/850*H);
  }
  assert.ok(Math.abs(a.hyper.y+a.hyper.height-584/850*H)<1e-8);
  assert.ok(Math.abs(a.hyper.x+a.hyper.width/2-(a.monitors.radar.x+a.monitors.radar.width/2))<1e-8);
  assert.ok(Math.abs(measurements.baseline.x+a.stickTranslate+a.stickSize/2-(a.monitors.own.x-W*.012)/2)<1e-8);
 }
});





test('all tier-1 cockpits are approved and retain the shared pilot kit',async()=>{
 const {getCockpitDefinition,APPROVED_COCKPIT_LAYOUT,cockpitManifest}=await import('../../src/game/cockpitDefinitions.js');
 const {SHIPS}=await import('../../src/game/data.js');
 const tierOne=Object.values(SHIPS).filter(s=>s.tier===1);
 assert.deepEqual(tierOne.map(s=>s.id).sort(),['scrapper','speedster','wayfarer']);
 for(const ship of tierOne){const c=getCockpitDefinition(ship.id);
  assert.equal(c.status,'approved');assert.ok(!c.apertureClip,'original painted bezels stay intact');
  assert.equal(c.strip,APPROVED_COCKPIT_LAYOUT.strip);assert.equal(c.hand,APPROVED_COCKPIT_LAYOUT.hand);assert.equal(c.stickBase,APPROVED_COCKPIT_LAYOUT.stickBase);
  assert.deepEqual(paintedCockpitAssets(ship.id),[c.shell,c.hand,c.stickBase.path]);
 }
 const balor=getCockpitDefinition('scrapper'),png=await readFile(new URL(balor.shell));
 assert.match(balor.shell,/scrapper-paint-v2.png$/);assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],balor.artworkSize);assert.equal(png[25],6,'approved Balor frame preserves alpha');
 assert.equal(cockpitManifest('scrapper').shell,'/assets/cockpits/scrapper-paint-v2.png');
 assert.equal(balor.stickClearanceX,416);assert.equal(balor.handOffsetX,-60);
 assert.deepEqual(balor.monitors,{own:{x:418,y:616,width:318,height:184},radar:{x:792,y:641.5,width:270,height:182},target:{x:1124,y:616,width:304,height:184}},'live flight keeps the reviewed display geometry');
 assert.deepEqual(balor.screenInsets,{own:{x:18,y:14},radar:{x:14,y:14},target:{x:11,y:14}});
});


test('all tier-2 cockpits activate and preload their approved original frames and shared pilot rig',async()=>{
 const {getCockpitDefinition,APPROVED_COCKPIT_LAYOUT}=await import('../../src/game/cockpitDefinitions.js');
 const {SHIPS}=await import('../../src/game/data.js');
 const hulls=Object.values(SHIPS).filter(s=>s.tier===2&&s.id!=='talon');
 assert.equal(hulls.length,6);
 for(const {id,name}of hulls){
  const c=getCockpitDefinition(id,{review:true});assert.equal(c.name,name);assert.equal(c.status,'approved');assert.match(c.shell,/\.png$/);assert.ok(!c.apertureClip,'preserve the original painted bezels');
  const png=await readFile(new URL(c.shell));assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],c.artworkSize);assert.equal(png[25],6,'original painting keeps RGBA transparency');
  assert.equal(getCockpitDefinition(id),c);assert.deepEqual(paintedCockpitAssets(id),[c.shell,c.hand,c.stickBase.path,...(c.forwardHull?[c.forwardHull]:[])]);
  for(const key of ['hand','strip','stickBase'])assert.equal(c[key],APPROVED_COCKPIT_LAYOUT[key]);
  for(const r of Object.values(c.monitors)){assert.ok(r.width>250&&r.height>150,'measured openings retain readable displays');assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=c.width&&r.y+r.height<=c.height);}
 }
});


test('Morrigan warms its approved exterior overlay without changing the original cockpit or rig',async()=>{
 const {getCockpitDefinition,cockpitManifest}=await import('../../src/game/cockpitDefinitions.js');
 const c=getCockpitDefinition('demon'),png=await readFile(new URL(c.forwardHull));
 assert.equal(png[25],6);assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1851,850]);
 assert.deepEqual(c.forwardHullPlacement,{forward:13,outward:18,width:1851,height:850});
 assert.match(c.shell,/demon-paint-v1.png$/);assert.equal(c.hand,STARTER_COCKPIT.hand);assert.equal(c.stickBase,STARTER_COCKPIT.stickBase);
 assert.ok(paintedCockpitAssets('demon').includes(c.forwardHull));
 assert.equal(cockpitManifest('demon').forwardHull.path,'/assets/cockpits/demon-forward-hull-v1.png');
 for(const id of ['talon','legionary','wayfarer'])assert.equal(getCockpitDefinition(id).forwardHull,undefined);
});


test('all tier-III paintings activate and warm the approved instruments and pilot rig',async()=>{
 const {COCKPITS,getCockpitDefinition,APPROVED_COCKPIT_LAYOUT}=await import('../../src/game/cockpitDefinitions.js');
 const {SHIPS}=await import('../../src/game/data.js');
 const hulls=Object.values(SHIPS).filter(s=>s.tier===3);
 assert.deepEqual(hulls.map(s=>s.id).sort(),['astra','atlas','blade','lancer','vanguard']);
 for(const {id}of hulls){const c=COCKPITS[id];assert.equal(c.status,'approved');assert.equal(c.fixedInstruments,true);assert.match(c.shell,/paint-v[12]\.png$/);const png=await readFile(new URL(c.shell));assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],c.artworkSize);assert.equal(png[25],6);assert.ok(!c.apertureClip);assert.equal(getCockpitDefinition(id),c);assert.equal(getCockpitDefinition(id,{review:true}),c);assert.deepEqual(paintedCockpitAssets(id),[c.shell,c.hand,c.stickBase.path]);
  assert.equal(c.hand,APPROVED_COCKPIT_LAYOUT.hand);assert.equal(c.stickBase,APPROVED_COCKPIT_LAYOUT.stickBase);assert.equal(c.strip,APPROVED_COCKPIT_LAYOUT.strip);
  assert.deepEqual(c.monitors.own,APPROVED_COCKPIT_LAYOUT.monitors.own);assert.deepEqual(c.monitors.target,APPROVED_COCKPIT_LAYOUT.monitors.target);assert.deepEqual(c.monitors.radar,{...APPROVED_COCKPIT_LAYOUT.monitors.radar,y:647});
 }
});
