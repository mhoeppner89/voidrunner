// Review-only UI and capture checks. Sound stays muted in every profile.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4210',out='output/pixel-grid-review';
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(`${out}/manifest.json`,'utf8'));
assert.deepEqual(manifest.errors,[]);
for(const profile of manifest.profiles){
 for(const scene of manifest.scenes){
  const styles=manifest.captures[profile.id][scene.id].styles;
  for(const style of manifest.styles){
   const capture=styles[style.id];
   assert.equal(capture.sequence.length,scene.motion?manifest.frames:1);
   if(style.height){assert.equal(capture.size.height,style.height);assert.deepEqual(capture.world,capture.size);}
  }
 }
}
for(const [name,engine,options] of [
 ['desktop',chromium,{viewport:{width:1440,height:900}}],
 ['iphone',webkit,devices['iPhone 13 landscape']],
]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...options,serviceWorkers:'block'});page.setDefaultTimeout(45000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/${out}/index.html`);await page.waitForFunction(()=>window.reviewReady);
  for(const scene of manifest.scenes){
   await page.locator(`[data-scene="${scene.id}"]`).click();
   await page.locator('.after').evaluate(e=>e.decode());
   assert.equal(await page.locator('#motion').isVisible(),!!scene.motion);
   for(const style of ['fine','bold']){
    await page.locator(`[data-style="${style}"]`).click();
    assert.equal(await page.locator(`[data-style="${style}"]`).getAttribute('aria-pressed'),'true');
    await page.locator('.after').evaluate(e=>e.decode());
    assert.ok((await page.locator('.after').getAttribute('src')).includes(`-${style}.png`));
   }
  }
  await page.locator('[data-profile="phone"]').click();
  await page.locator('[data-scene="asteroids"]').click();
  await page.locator('[data-style="fine"]').click();
  await page.locator('#motion').click();
  await page.waitForFunction(()=>document.querySelector('#motion').getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>/-0[1-9]\.png/.test(document.querySelector('.after').getAttribute('src')));
  await page.locator('#motion').click();assert.equal(await page.locator('#motion').getAttribute('aria-pressed'),'false');
  await page.locator('#compare').click();assert.equal(await page.locator('.viewer').evaluate(e=>e.classList.contains('solo')),true);
  await page.locator('#compare').click();
  await page.locator('#split').evaluate(e=>{e.value='25';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('.viewer').evaluate(e=>e.style.getPropertyValue('--split')),'25%');
  await page.screenshot({path:`${out}/${name}-review.png`,fullPage:true});
  const fit=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(fit.scroll<=fit.viewport+1,JSON.stringify({name,fit}));
  assert.deepEqual(errors,[]);console.log(name,'all scenes, grids, phone layout, motion and comparison controls passed');
 }finally{await browser.close();}
}
