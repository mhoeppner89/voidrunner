// Review-only UI and capture checks. Sound stays muted in every profile.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4210',out='output/comic-style-review';
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(`${out}/manifest.json`,'utf8'));
assert.deepEqual(manifest.errors,[]);
for(const profile of manifest.profiles){
 for(const scene of manifest.scenes){
  const styles=manifest.captures[profile.id][scene.id].styles;
  const original=styles.current;
  const hash=async file=>createHash('sha256').update(await readFile(`${out}/${file}`)).digest('hex');
  const originalHash=await hash(original.sequence[0]);
  for(const style of manifest.styles){
   const capture=styles[style.id];
   assert.equal(capture.sequence.length,scene.motion?manifest.frames:1);
   assert.deepEqual(capture.size,original.size,'all options retain the same output resolution');
   assert.deepEqual(capture.world,original.world,'the 3D render resolution stays unchanged');
   if(style.id!=='current'&&!(manifest.integrated&&style.id==='illustrated'))assert.notEqual(await hash(capture.sequence[0]),originalHash,`${profile.id} ${scene.id} ${style.id} visibly changes the frame`);
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
  if(name==='desktop'){
   // The review changes the 3D layer. Representative monitor text and
   // unoccupied painted concourse must remain byte-identical to the original.
   for(const [profile,scene,rect] of [
    ['desktop','asteroids',[248,588,245,32]],
    ['phone','asteroids',[150,310,160,30]],
    ['desktop','concourse',[10,80,490,170]],
    ['phone','concourse',[10,50,290,90]],
   ]){
    const result=await page.evaluate(async({profile,scene,rect})=>{
     const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
     const a=await load(`./${profile}-${scene}-current.png`),b=await load(`./${profile}-${scene}-comic.png`);
     const canvas=document.createElement('canvas');canvas.width=a.naturalWidth;canvas.height=a.naturalHeight;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(a,0,0);
     const one=ctx.getImageData(...rect).data;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(b,0,0);
     const two=ctx.getImageData(...rect).data;let different=0;for(let i=0;i<one.length;i++)if(one[i]!==two[i])different++;
     return{different};
    },{profile,scene,rect});
    assert.equal(result.different,0,`${profile} ${scene} painted UI must stay unchanged`);
   }
  }
  for(const scene of manifest.scenes){
   await page.locator(`[data-scene="${scene.id}"]`).click();
   await page.locator('.after').evaluate(e=>e.decode());
   assert.equal(await page.locator('#motion').isVisible(),!!scene.motion);
   for(const style of ['outline','illustrated','comic']){
    await page.locator(`[data-style="${style}"]`).click();
    assert.equal(await page.locator(`[data-style="${style}"]`).getAttribute('aria-pressed'),'true');
    await page.locator('.after').evaluate(e=>e.decode());
    assert.ok((await page.locator('.after').getAttribute('src')).includes(`-${style}.png`));
   }
  }
  await page.locator('[data-profile="phone"]').click();
  await page.locator('[data-scene="asteroids"]').click();
  await page.locator('[data-style="illustrated"]').click();
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
  assert.deepEqual(errors,[]);console.log(name,'all scenes, styles, phone layout, motion and comparison controls passed');
 }finally{await browser.close();}
}
