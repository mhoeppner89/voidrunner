import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameUI} from '../../src/game/ui.js';

test('original image bundles share a decode, retain active art and release old images',async()=>{
 const saved=globalThis.Image,images=[];
 try{
  globalThis.Image=class{
   constructor(){this.listeners={};images.push(this);}
   addEventListener(name,fn){this.listeners[name]=fn;}
   set src(url){this.url=url;this.naturalWidth=100;queueMicrotask(()=>this.listeners.load());}
   get src(){return this.url;}
   async decode(){this.decodes=(this.decodes??0)+1;}
  };
  const ui=Object.create(GameUI.prototype);ui.warmImageRecords=new Map();ui.warmImageSlots=new Map();
  assert.ok(await ui.preloadImageSet('active',['/cockpit.webp'],{priority:'high'}));
  assert.ok(await ui.preloadImageSet('predicted',['/cockpit.webp']));
  assert.equal(images.length,1);assert.equal(images[0].decodes,1);assert.equal(images[0].src,'/cockpit.webp');
  assert.equal(ui.warmImageRecords.get('/cockpit.webp').refs,2);
  assert.ok(await ui.preloadImageSet('active',['/new-cockpit.webp'],{priority:'high'}));
  assert.equal(ui.warmImageRecords.get('/cockpit.webp').refs,1);
  ui.clearWarmImageSlot('predicted');await new Promise(setImmediate);
  assert.ok(!ui.warmImageRecords.has('/cockpit.webp'));assert.ok(ui.warmImageRecords.has('/new-cockpit.webp'));
  ui.clearWarmImageSlot('active');await new Promise(setImmediate);assert.equal(ui.warmImageRecords.size,0);
 }finally{if(saved===undefined)delete globalThis.Image;else globalThis.Image=saved;}
});
