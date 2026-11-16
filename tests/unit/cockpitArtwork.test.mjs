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
