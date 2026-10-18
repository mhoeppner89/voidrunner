import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir('output/asteroid-review',{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:960}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{const page=await browser.newPage(device),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'/output/asteroid-review/races.html?revision=0.8.2ih');await page.waitForFunction(()=>window.raceReady);const rendered=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await rendered();
 assert.equal(await page.locator('#course option').count(),3);await page.screenshot({path:`output/asteroid-review/${name}-routes.png`});await page.locator('#xray').click();await rendered();assert.equal(await page.locator('#xray').getAttribute('aria-pressed'),'true');await page.screenshot({path:`output/asteroid-review/${name}-routes-xray.png`});await page.locator('#xray').click();
 for(const [index,id]of ['shard-gauntlet','shard-switchback','shard-miners-knife'].entries()){
  await page.selectOption('#course',id);await rendered();assert.match(await page.locator('#numbers').innerText(),/gates/);assert.match(await page.locator('#race').getAttribute('href'),new RegExp(id));
  const visible=await page.evaluate(()=>raceReview.routes.filter(r=>r.group.visible).map(r=>r.id));assert.deepEqual(visible,[id]);
  await page.screenshot({path:`output/asteroid-review/${name}-${id}.png`});await page.locator('#progress').fill('220');await rendered();await page.screenshot({path:`output/asteroid-review/${name}-${id}-inside.png`});
  await page.locator('#play').click();await rendered();assert.equal(await page.locator('#play').innerText(),'Pause');await page.locator('#play').click();await page.locator('#above').click();await rendered();
 }
 const fit=await page.evaluate(()=>[...document.querySelectorAll('header,nav,#facts')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));assert.ok(fit,'controls stay in the phone viewport');assert.deepEqual(errors,[]);console.log(name,'all three routes, flythrough, orbit and controls pass');
 }finally{await browser.close();}
}
