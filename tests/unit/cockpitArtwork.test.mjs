import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {STARTER_COCKPIT,paintedCockpitAssets} from '../../src/game/cockpitArtwork.js';

test('live starter cockpit matches the approved review assets, openings and shaft anchors',async()=>{
 const approved=JSON.parse(await readFile(new URL('../../assets/cockpits/wayfarer-v4.json',import.meta.url),'utf8'));
 assert.deepEqual(STARTER_COCKPIT.monitors,approved.monitors);
 assert.deepEqual(STARTER_COCKPIT.strip.frames,approved.handStrip.frames);
 assert.equal(STARTER_COCKPIT.strip.renderWidth,approved.handStrip.renderWidth);
 assert.equal(STARTER_COCKPIT.housingTop,approved.housingTop);
 const {path,...base}=STARTER_COCKPIT.stickBase,{path:approvedPath,...approvedBase}=approved.stickBase;assert.deepEqual(base,approvedBase);assert.ok(path.endsWith(approvedPath));
 for(const [url,w,h]of [[STARTER_COCKPIT.shell,approved.width,approved.height],[STARTER_COCKPIT.hand,approved.handStrip.width,approved.handStrip.height],[STARTER_COCKPIT.stickBase.path,approved.stickBase.width,approved.stickBase.height]]){
  const png=await readFile(new URL(url));assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);assert.equal(png[25],6,'RGBA retains transparency');
 }
 assert.equal(paintedCockpitAssets('wayfarer').length,3);assert.deepEqual(paintedCockpitAssets('talon'),[]);
});
