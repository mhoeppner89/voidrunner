import {chromium,webkit,devices} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const approved=JSON.parse(await readFile(new URL('../fixtures/landing-layout-final.json',import.meta.url),'utf8')).locations;
const placements=JSON.parse(await readFile(new URL('../fixtures/landing-placement-final.json',import.meta.url),'utf8')).locations;
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/landing-editor-test',reports=[];await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:1000}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const context=await browser.newContext({...device,serviceWorkers:'allow',acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);
  const observe=p=>{p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});p.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});};observe(page);
  await page.addInitScript(()=>{if(window===top){localStorage.removeItem('voidrunner-landing-editor-v2');localStorage.setItem('void-privateer-save-v1','career-sentinel');}const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/output/landing-editor/index.html`);const ready=()=>page.waitForFunction(()=>!document.querySelector('#controls').disabled&&document.querySelector('#loading').hidden);await ready();
  assert.equal(await page.locator('#port option').count(),17);assert.equal(await page.locator('#hull option').count(),15);assert.equal(await page.locator('[data-key=yaw]').count(),0,'approved angles are locked');
  const live=()=>page.evaluate(()=>{const v=document.querySelector('iframe').contentWindow.__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return{angles:v.pivot.rotation.toArray().slice(0,3),scale:v.profile.scale,zoom:v.camera.zoom,composite:v.outputHost.classList.contains('has-concourse-composite'),raw:v.outputHost.querySelector('img').hasAttribute('data-concourse-plate'),w:v.canvas.width,h:v.canvas.height};});
  const initial=await live();assert.ok(initial.composite&&initial.raw);assert.ok(initial.w<=960&&initial.h<=600);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(render_game_to_text()).layout.placements),placements.helix.placements,'editor starts from the approved desktop/phone placements');
  const angle=r=>[r.pitch,r.yaw,r.roll].map(n=>n*Math.PI/180);assert.deepEqual(initial.angles,angle(approved.helix.rotationDeg));
  async function position(element,x,y){await page.locator('#element').selectOption(element);await page.locator('#position-x').fill(String(x));await page.locator('#position-x').blur();await page.locator('#position-y').fill(String(y));await page.locator('#position-y').blur();await ready();}
  await position('ship',62,68);await page.locator('#size-number').fill('90');await page.locator('#size-number').blur();await ready();assert.equal((await live()).zoom,.9);
  for(const[key,x,y]of [['services',8,74],['market',8,40],['bar',62,7],['den',75,80]])await position(key,x,y);
  // Every control moves to the requested scene-relative location; automatic
  // avoidance must not pull manually placed controls back to other anchors.
  const buttonPositions=await page.evaluate(()=>{const d=document.querySelector('iframe').contentDocument,s=d.querySelector('.station-scene').getBoundingClientRect();return Object.fromEntries(['services','market','bar','den'].map(key=>{const b=d.querySelector('.concourse-pointer-'+key).getBoundingClientRect();return[key,{x:(b.x-s.x)/s.width,y:(b.y-s.y)/s.height}];}));});
  assert.ok(Math.abs(buttonPositions.market.x-.08)<.001&&Math.abs(buttonPositions.bar.y-.07)<.001);
  await page.locator('#element').selectOption('ship');const handle=page.locator('.move-handle[data-element=ship]'),b=await handle.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5-35,b.y+b.height*.5-20,{steps:4});await page.mouse.up();await ready();assert.ok(Number(await page.locator('#position-x').inputValue())<62);assert.ok(Number(await page.locator('#position-y').inputValue())<68);assert.deepEqual((await live()).angles,initial.angles,'dragging never rotates the ship');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.element),'ship','dragging retains keyboard focus');const beforeKeys=await page.evaluate(()=>JSON.parse(render_game_to_text()).layout.placements.desktop.ship.x);
  await page.keyboard.press('ArrowRight');await ready();await page.keyboard.press('ArrowRight');await ready();
  const keyDelta=await page.evaluate(()=>{const d=document.querySelector('iframe').contentDocument;return{x:JSON.parse(render_game_to_text()).layout.placements.desktop.ship.x,width:d.querySelector('.station-scene').getBoundingClientRect().width};});assert.ok(Math.abs(keyDelta.x-beforeKeys-2/keyDelta.width)<.00002,'repeated keyboard adjustments retain handle focus');
  await position('ship',62,68);
  await page.locator('[data-device=phone]').click();await ready();assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentWindow.innerWidth),844);await position('ship',50,65);await page.locator('#size-number').fill('65');await page.locator('#size-number').blur();await ready();await position('market',6,10);
  await page.locator('[data-device=desktop]').click();await ready();await page.locator('#element').selectOption('ship');assert.equal(await page.locator('#position-x').inputValue(),'62');assert.equal((await live()).zoom,.9);
  const dp=page.waitForEvent('download');await page.locator('#export').click();const download=await dp;await download.saveAs(`${out}/${name}-layout.json`);const data=JSON.parse(await readFile(`${out}/${name}-layout.json`,'utf8'));assert.equal(data.version,2);assert.equal(data.coordinateSpace,'scene-normalized');
  for(const[id,p]of Object.entries(data.locations))assert.deepEqual({scale:p.scale,rotationDeg:p.rotationDeg},approved[id]);
  for(const[id,p]of Object.entries(data.locations))if(id!=='helix')assert.deepEqual(p.placements,placements[id].placements,`unvisited ${id} retains both approved views`);
  assert.deepEqual(data.locations.helix.placements.desktop.ship,{x:.62,y:.68,zoom:.9});assert.deepEqual(data.locations.helix.placements.phone.ship,{x:.5,y:.65,zoom:.65});
  await page.locator('#reset').click();await ready();assert.notEqual(await page.locator('#position-x').inputValue(),'62');await page.locator('#undo').click();await ready();assert.equal(await page.locator('#position-x').inputValue(),'62');
  await position('ship',41,50);await page.locator('#file').setInputFiles(`${out}/${name}-layout.json`);await ready();await page.waitForFunction(()=>document.querySelector('#position-x').value==='62');
  const bad=structuredClone(data);bad.locations.helix.rotationDeg.yaw=5;await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('fixiert'));assert.deepEqual((await live()).angles,initial.angles);
  const ports=await page.locator('#port option').evaluateAll(options=>options.map(o=>o.value));for(const id of name==='desktop'?ports:['azure','league-yard','nacre']){await page.locator('#port').selectOption(id);await ready();assert.deepEqual((await live()).angles,angle(approved[id].rotationDeg));}
  await page.locator('#port').selectOption('helix');await ready();await page.locator('#hull').selectOption('atlas');await ready();await page.locator('#paint').selectOption({index:1});await ready();
  await page.screenshot({path:`${out}/${name}-desktop-preview.png`});await page.locator('[data-device=phone]').click();await ready();await page.screenshot({path:`${out}/${name}-phone-preview.png`});
  await page.locator('#toggle').click();await page.screenshot({path:`${out}/${name}-unobstructed.png`});await page.locator('#toggle').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('void-privateer-save-v1')),'career-sentinel');await page.close();
  const resumed=await context.newPage();observe(resumed);resumed.setDefaultTimeout(120000);await resumed.goto(`${base}/output/landing-editor/index.html`);await resumed.waitForFunction(()=>!document.querySelector('#controls').disabled&&document.querySelector('#loading').hidden);assert.equal(await resumed.locator('#position-x').inputValue(),'62');await resumed.close();
  assert.deepEqual(errors,[]);reports.push({name,ports:name==='desktop'?17:3,initial,placements:data.locations.helix.placements,saveUntouched:true,errors});await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(name,'shared shader, fixed angles, free placement, separate views, import/export, draft and save isolation passed');
 }finally{await browser.close();}
}
