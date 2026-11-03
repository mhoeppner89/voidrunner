// Relative software-rendering diagnostic in a phone-sized touch layout.
// It is not a measurement of physical Android/iPhone GPU performance.
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4210';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:932,height:430},deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
 const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto(`${base}/output/comic-style-review/capture.html?startup-probe=1`);
 await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame&&window.pixelGridCapture&&window.comicStyleReview);
 await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
 await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
 await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);await pixelGridCapture.prepare('asteroids');pixelGridCapture.setGrid(null);});
 const results={};
 for(const style of ['unmodified','outline','illustrated','comic']){
  results[style]=await page.evaluate(style=>{
   const ren=__VOID_PRIVATEER__.getRuntime().renderer,gl=ren.renderer.getContext();
   if(style!=='unmodified')comicStyleReview.setStyle(style);
   // Warm each material/program before timing; GPU completion is forced so
   // timings include the software driver's raster work as well as submission.
   for(let i=0;i<4;i++){ren.render();gl.finish();}
   const samples=[];for(let i=0;i<12;i++){const start=performance.now();ren.render();gl.finish();samples.push(performance.now()-start);}
   samples.sort((a,b)=>a-b);return{median:samples[6],p95:samples[11],samples};
  },style);
  console.log(style,JSON.stringify(results[style]));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile('output/comic-style-review/performance.json',JSON.stringify({environment:'Chromium touch layout with SwiftShader on host; not a physical phone',scene:'asteroids',results},null,2));
 await context.close();
}finally{await browser.close();}
