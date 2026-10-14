import {chromium,webkit,devices} from 'playwright';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
const out='output/item-icons-review';const report=[];
for(const [name,type,device]of [['desktop',chromium,{viewport:{width:1440,height:1000}}],['android',chromium,devices['Pixel 7 landscape']],['iphone',webkit,devices['iPhone 13 landscape']]]){
 const browser=await type.launch({headless:true,...(type===chromium?{...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${process.env.VR_BASE_URL??'http://127.0.0.1:4192'}/output/item-icons-review/index.html`);
  const audit=await page.evaluate(()=>{
   const failures=[];let paths=0;for(const svg of document.querySelectorAll('svg'))for(const path of svg.querySelectorAll('path')){
    paths++;const box=path.getBBox(),m=svg.getCTM().inverse().multiply(path.getCTM()),style=getComputedStyle(path),stroke=style.stroke==='none'?0:parseFloat(style.strokeWidth)/2;
    const pts=[[box.x-stroke,box.y-stroke],[box.x+box.width+stroke,box.y-stroke],[box.x-stroke,box.y+box.height+stroke],[box.x+box.width+stroke,box.y+box.height+stroke]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
    if(pts.some(p=>p.x<.2||p.y<.2||p.x>63.8||p.y>63.8))failures.push({id:svg.dataset.icon??svg.dataset.commodityIcon,affix:path.dataset.affix,cls:path.getAttribute('class'),points:pts.map(p=>[p.x,p.y])});
   }
   return{paths,failures,icons:document.querySelectorAll('article').length,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.screenshot({path:`${out}/${name}-color.png`,fullPage:true});await page.locator('#theme').click();await page.screenshot({path:`${out}/${name}-color-light.png`,fullPage:true});
  await page.locator('#size').fill('112');await page.locator('#size').dispatchEvent('input');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await page.locator('#search').fill('shield');const filtered=await page.locator('article:visible').count();
  if(errors.length||audit.failures.length||audit.overflow||overflow||!filtered)throw Error(JSON.stringify({name,errors,audit,overflow,filtered}));
  report.push({name,errors,...audit,largeSizeOverflow:overflow,filtered});console.log(name,'PASS',audit.paths,'painted paths inside viewport');
 }finally{await browser.close();}
}
await writeFile(`${out}/color-results.json`,JSON.stringify(report,null,2));
