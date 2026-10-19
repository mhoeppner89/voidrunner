import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/pixel-style-review';await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:1100}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('void-privateer-save-v1','palette-review-sentinel'));
  await page.goto(`${base}/${out}/index.html`);await page.waitForFunction(()=>window.reviewReady);
  const manifest=await page.evaluate(()=>fetch('./manifest.json').then(r=>r.json())),checked=[];
  const primary=manifest.styles.filter(s=>!s.legacy);
  assert.equal(manifest.scenes.length,5);assert.deepEqual(primary.map(s=>s.id),['crisp']);assert.deepEqual(primary.map(s=>[s.colors,s.passes,s.radius]),[[null,0,0]]);assert.deepEqual(manifest.styles.filter(s=>s.legacy).slice(0,3).map(s=>s.colors),[256,96,48]);assert.equal(manifest.shippingChanged,true);
  assert.equal(new Set(primary.map(s=>[s.radius,s.passes,s.threshold].join(':'))).size,1,'colour comparisons use identical noise reduction');
  for(const scene of manifest.scenes){
   await page.locator(`button[data-scene="${scene.id}"]`).click();
   for(const style of primary){
    await page.locator(`.styles button[data-style="${style.id}"]`).click();await page.locator('.after').evaluate(e=>e.decode());
    assert.ok(new URL(await page.locator('#full').getAttribute('href'),page.url()).pathname.endsWith(`${scene.id}-${style.id}.png`));
    if(name==='desktop'){
     const stats=await page.locator('.after').evaluate(async e=>{
      const c=document.createElement('canvas');c.width=e.naturalWidth;c.height=e.naturalHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(e,0,0);
      const d=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<d.length;i+=4)colors.add(d[i]*65536+d[i+1]*256+d[i+2]);
      const source=new Image();source.src=e.src.replace('-crisp.png','-source.png');await source.decode();ctx.drawImage(source,0,0);const original=ctx.getImageData(0,0,c.width,c.height).data;
      return{w:c.width,h:c.height,colors:colors.size,matchesSource:d.every((v,i)=>v===original[i])};
     });
     assert.deepEqual([stats.w,stats.h],[1440,900]);assert.ok(stats.colors>4096,'source colours are not palette capped');assert.ok(stats.matchesSource,'the review adds no blur, smoothing, tint or palette mapping to the captured runtime');
     checked.push({scene:scene.id,style:style.id,...stats});
    }
   }
  }
  await page.locator('button[data-scene="concourse"]').click();await page.locator('.styles button[data-style="crisp"]').click();await page.locator('.after').evaluate(e=>e.decode());
  for(const ref of ['clean','balanced','bold','natural','rich','vivid','source','current',...(manifest.previousAvailable?['previous']:[])]){await page.selectOption('#reference',ref);await page.locator('.before').evaluate(e=>e.decode());assert.ok(new URL(await page.locator('.before').getAttribute('src'),page.url()).pathname.endsWith(`concourse-${ref}.png`));}
  await page.selectOption('#reference','clean');await page.locator('.before').evaluate(e=>e.decode());
  await page.locator('#split').focus();await page.keyboard.press('Home');assert.equal(await page.locator('.viewer').evaluate(e=>e.style.getPropertyValue('--split')),'0%');await page.keyboard.press('End');assert.equal(await page.locator('.viewer').evaluate(e=>e.style.getPropertyValue('--split')),'100%');
  await page.locator('#compare').uncheck();assert.ok(await page.locator('.viewer').evaluate(e=>e.classList.contains('solo')));await page.locator('#compare').check();
  await page.locator('#split').evaluate(e=>{e.value='50';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.screenshot({path:`${out}/${name}-gallery.png`,fullPage:true});
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
  if(name==='iphone'){
   // WebKit retains its landscape layout viewport when only automation's
   // viewport changes. Use the actual portrait device/screen configuration.
   const portrait=await browser.newPage({...devices['iPhone 13'],serviceWorkers:'block'});await portrait.goto(`${base}/${out}/index.html`);await portrait.waitForFunction(()=>window.reviewReady);await portrait.locator('.after').evaluate(e=>e.decode());await portrait.screenshot({path:`${out}/${name}-portrait.png`,fullPage:true});assert.ok(await portrait.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await portrait.close();
  }
  await page.reload();await page.waitForFunction(()=>window.reviewReady);assert.equal(await page.locator('.styles button[aria-pressed="true"]').getAttribute('data-style'),'crisp');assert.equal(await page.locator('#reference').inputValue(),'clean');assert.equal(await page.evaluate(()=>localStorage.getItem('void-privateer-save-v1')),'palette-review-sentinel');assert.deepEqual(errors,[]);
  await writeFile(`${out}/${name}-qa.json`,JSON.stringify({name,checked,errors,saveUntouched:true},null,2));console.log(name,'five actual runtime scenes, unmodified colour pixels, earlier references, controls, saved URL and career isolation passed');
 }finally{await browser.close();}
}
