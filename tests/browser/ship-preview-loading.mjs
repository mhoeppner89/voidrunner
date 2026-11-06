import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/ship-preview-loading';await mkdir(out,{recursive:true});
for(const [name,engine,device] of [['desktop',chromium,{viewport:{width:1280,height:720}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=metal']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__ship-preview-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/src/style.css"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/vendor/three.module.min.js"}}</script><div class="ship-silhouette" style="width:360px;height:200px"></div>'}));
  let release;const gate=new Promise(resolve=>release=resolve);let requested=false;
  await page.route('**/assets/models/ships/talon.glb',async route=>{requested=true;await gate;await route.continue();});
  await page.goto(`${base}/__ship-preview-test.html`);
  await page.evaluate(async()=>{const {ShipPreview}=await import('/src/game/shipPreview.js');window.preview=new ShipPreview(document.querySelector('.ship-silhouette'),'talon');});
  await page.waitForFunction(()=>document.querySelector('.ship-preview-status'));
  assert.equal(await page.evaluate(()=>Boolean(preview.model)),false);assert.ok(await page.locator('.ship-preview-status').isVisible());
  await page.waitForTimeout(100);assert.ok(requested);await page.screenshot({path:`${out}/${name}-loading.png`});release();
  await page.waitForFunction(()=>preview.model?.paintSources&&!document.querySelector('.ship-preview-status'));
  const state=await page.evaluate(()=>({model:preview.model.name,children:preview.pivot.children.length,loaded:!!preview.model.paintSources}));assert.equal(state.children,1);assert.ok(state.loaded);
  await page.screenshot({path:`${out}/${name}-loaded.png`});
  await page.evaluate(async()=>{preview.dispose();const {ShipPreview}=await import('/src/game/shipPreview.js');window.bad=new ShipPreview(document.querySelector('.ship-silhouette'),'missing-hull');});
  await page.waitForFunction(()=>document.querySelector('.ship-preview-status')?.textContent.includes('nicht verfügbar')||document.querySelector('.ship-preview-status')?.textContent.includes('unavailable'));
  assert.equal(await page.evaluate(()=>Boolean(bad.model)),false);await page.evaluate(()=>bad.dispose());assert.equal(await page.locator('.ship-preview-status').count(),0);assert.deepEqual(errors,[]);
  console.log(name,'delayed, loaded and unavailable previews passed');
 }finally{await browser.close();}
}
