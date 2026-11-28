import {chromium,webkit,devices} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createOfflineTestOrigin} from '../helpers/offline-origin.mjs';
import {paintedCockpitAssets} from '../../src/game/cockpitDefinitions.js';
import {isolateBrowserProfiles,isolateBrowserHulls} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','android','iphone']);
await isolateBrowserHulls(import.meta.url);
import {fleetPaintPath} from '../../src/game/fleetPaintCatalog.js';

const base=(process.env.VR_BASE_URL??'http://127.0.0.1:4192').replace(/\/$/,'');
const worker=await fetch(base+'/sw.js');
assert.ok(worker.ok, 'The game server must serve its service worker');
const currentCache=(await worker.text()).match(/const CACHE = '([^']+)'/)?.[1];
assert.ok(currentCache, 'The served worker must declare a release cache');
const hulls=(process.env.VR_COCKPIT_HULLS??process.env.VR_COCKPIT_HULL??'wayfarer').split(',');
for(const hull of hulls){
const sourceCockpitAssets=paintedCockpitAssets(hull).map(url=>'assets/'+new URL(url).pathname.split('/assets/').at(-1));
const modelAssets=[`assets/models/ships/${hull}.glb`,...(hull==='scrapper'?['concord','alliance','independents'].map(paint=>fleetPaintPath(hull,paint)):[])];
const out=`output/offline-startup/${hull}`;await mkdir(out,{recursive:true});
const reportPath=`/${out}/report-fixture.html`;
const fixtures=new Map([[reportPath,'<!doctype html><title>Cached QA report</title><h1>Cached QA report</h1>']]);
const profiles=[['desktop',chromium,{viewport:{width:1440,height:900}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]].filter(([name])=>!process.env.VR_PROFILES||process.env.VR_PROFILES.split(',').includes(name));
const report=[];
for(const [name,engine,device] of profiles){
 const origin=await createOfflineTestOrigin(base,fixtures);
 const browser=await engine.launch({headless:true,...(engine===chromium?{...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  // Intentionally allow service workers and omit startup-probe. The other
  // gameplay harnesses isolate the simulation; this checks the shipped path.
  const context=await browser.newContext({...device,serviceWorkers:'allow'}),page=await context.newPage();page.setDefaultTimeout(60000);const errors=[],failedRequests=[];let phase='online startup';
  page.on('pageerror',e=>errors.push({phase,message:e.message}));
  page.on('requestfailed',request=>{const entry={phase,url:request.url(),error:request.failure()?.errorText};failedRequests.push(entry);console.error(name,'request failed',JSON.stringify(entry));});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${origin.url}/game.html`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  const packed=await page.evaluate(()=>document.documentElement.hasAttribute('data-packed-models'));
  const cockpitAssets=packed?sourceCockpitAssets.map(file=>file.replace(/\.png$/,'.webp')):sourceCockpitAssets;
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="confirm-new-career"]').click();
  // The opening card is shown only after the flight scene is prepared. A cold
  // proxied/software-rendered startup can exceed the normal click timeout.
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen')?.classList.contains('is-hidden'),null,{timeout:120000});
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.getRuntime()?.save.player.dockedAt==='helix');
  if(hull!=='wayfarer')await page.evaluate(async hull=>{
   const r=__VOID_PRIVATEER__.getRuntime();r.save.player.credits=10000000;const {LOCATIONS}=await import('/src/game/data.js'),home=r.save.player.dockedAt;
   const yard=Object.values(LOCATIONS).find(l=>l.id===home&&l.shipsForSale?.includes(hull))??Object.values(LOCATIONS).find(l=>l.services?.shipyard&&l.shipsForSale?.includes(hull));
   if(!yard)throw Error(`No shipyard stocks ${hull}`);if(yard.id!==home)r.dockAt(yard.id,true);
   const result=r.buyShip(hull);if(!result.ok)throw Error(JSON.stringify(result));if(yard.id!==home)r.dockAt(home,true);
  },hull);
  const imagesReady=async()=>{
   await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen')?.classList.contains('is-hidden'));
   // The shader-ready veil can finish before lazy ship textures. Let their
   // decoders settle before deliberately unloading the document: otherwise
   // WebKit reports aborted blob images as access-control page errors.
   await page.evaluate(async()=>{const renderer=__VOID_PRIVATEER__.getRuntime().renderer;await Promise.allSettled([...renderer.glbShipLoading.values(),...(renderer.stationModelLoads?.values()??[])]);});
   // The old tutorial banner's portrait now lives in the Story card. Check
   // the real card, decoded background and live 3D hull.
   if(!await page.locator('#story-panel').isVisible())await page.locator('[data-ui-command="story"]').click();
   const portrait=page.locator('#story-panel img');await portrait.evaluate(async image=>{await image.decode();if(!image.naturalWidth)throw Error('Story portrait did not decode');});
   await page.locator('[data-ui-command="close-story"]').click();
   await page.waitForFunction(()=>{const i=document.querySelector('#dock-screen .dock-backdrop img'),ship=__VOID_PRIVATEER__.getRuntime()?.ui.concourseShip;return i?.complete&&i.naturalWidth>0&&document.querySelector('.concourse-model-stage.has-model')&&ship?.model&&!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending;});
   assert.ok(await page.evaluate(()=>{const ship=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;let textures=0;ship.model.traverse(o=>{if(o.material?.map?.image?.width>0)textures++;});return textures>0&&ship.renderCount>0;}),'Docked GLB and embedded textures render online and offline');
   await page.evaluate(()=>document.fonts.ready);
   const warmed=await page.evaluate(async()=>{const ui=__VOID_PRIVATEER__.getRuntime().ui,urls=[...ui.warmImageSlots.get('flight-core')];await Promise.all(urls.map(url=>ui.warmImageRecords.get(url).promise));return urls.map(url=>{const r=ui.warmImageRecords.get(url);return{ready:r.ready,original:r.image.src===new URL(url,document.baseURI).href,src:r.image.src};});});
   assert.ok(warmed.every(image=>image.ready&&image.original),'Original flight sprites must decode before launch: '+JSON.stringify(warmed));
   assert.ok(cockpitAssets.every(path=>warmed.some(image=>new URL(image.src).pathname.endsWith('/'+path))),'Selected approved frame, hand and fixed base must be warmed online and offline');
   assert.ok(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Void VGA Text'&&f.status==='loaded')),'Current bundled text font must load online and offline');
   return page.evaluate(()=>[...document.querySelectorAll('#dock-screen img')].filter(i=>i.getClientRects().length).map(i=>({src:i.dataset.retroSource??i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight})));
  };
  const online=await imagesReady();
  assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().save.player.shipId),hull);await page.screenshot({path:`${out}/${name}-online-helix.png`});
  // A request that never finishes must still use this release's cached flight
  // module, rather than holding a mobile career on its loading screen forever.
  await page.waitForFunction(async()=>Boolean(await(await caches.open((await caches.keys()).find(n=>n.startsWith('voidrunner-')))).match(new URL('src/game/game.js',document.baseURI))));
  origin.stallGameModule(true);
  const recovered=await page.evaluate(async()=>{const start=performance.now(),response=await fetch('src/game/game.js');return{ok:response.ok,elapsed:performance.now()-start,text:(await response.text()).slice(0,80)};});
  origin.stallGameModule(false);assert.ok(recovered.ok&&recovered.elapsed<10000&&recovered.text.includes('import'),JSON.stringify(recovered));
  const chapterCount=await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().tutorialSummary().chapterCount);assert.equal(chapterCount,6);
  await page.waitForFunction(async ({name,modelAssets,cockpitAssets})=>{if(!(await caches.keys()).includes(name))return false;const c=await caches.open(name);return(await Promise.all(['art/locations/simplified/helix-hd-v1.webp','art/portraits/simplified/rin-vek-hd-v1.webp',...modelAssets,'assets/fonts/void-vga-text.ttf',...cockpitAssets,'src/game/cockpitArtwork.js','src/game/cockpitDefinitions.js','src/game/retroDisplay.js','src/game/pixelResolve.js','src/game/illustratedLighting.js'].map(p=>c.match(new URL(p,document.baseURI))))).every(Boolean);},{name:currentCache,modelAssets,cockpitAssets});
  // Cache a real report, then prove an unvisited report is not the game.
  phase='report navigation';await page.goto(origin.url+reportPath);await page.locator('h1').filter({hasText:'Cached QA report'}).waitFor();
  await page.waitForFunction(async name=>Boolean(await(await caches.open(name)).match(location.href)),currentCache);
  phase='offline reports';await origin.disconnect();await page.reload();assert.equal(await page.title(),'Cached QA report');
  const unavailable=await page.goto(`${origin.url}/${out}/never-visited/index.html`);assert.equal(unavailable.status(),503);assert.equal(await page.title(),'Page unavailable offline');assert.equal(await page.locator('#app').count(),0);await page.screenshot({path:`${out}/${name}-uncached-report.png`});
  phase='offline resume';await page.goto(`${origin.url}/game.html?offline-reload=1`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.resume);await page.locator('[data-ui-command="resume"]').click();
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.getRuntime()?.save.player.dockedAt==='helix');const offline=await imagesReady();await page.screenshot({path:`${out}/${name}-offline-helix.png`});
  const artPaths=online.map(i=>i.src);assert.deepEqual(offline.map(i=>i.src),artPaths);
  // Existing saved careers survive reconnecting and returning to the title.
  phase='reconnected resume';await origin.reconnect();await page.reload();await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.resume);await page.locator('[data-ui-command="resume"]').click();await imagesReady();
  if(errors.length)await writeFile(`${out}/${name}-errors.json`,JSON.stringify({errors,failedRequests},null,2));
  assert.deepEqual(errors,[]);report.push({name,chapterCount,online,offline,cachedReport:true,uncachedReportStatus:503,reconnected:true,errors});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,hull,'normal startup, decoded images, offline resume, report fallback and reconnect passed');
 }finally{await browser.close();await origin.disconnect();}
}

}
