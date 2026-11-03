// Build a save-isolated visual comparison from the current game, not a new
// production rendering path. Run with a local server serving the repository.
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.VR_BASE_URL??'http://127.0.0.1:4210';
const out='output/pixel-grid-review';
const profiles=[
 {id:'desktop',name:'Desktop',width:1440,height:810,mobile:false},
 {id:'phone',name:'Phone · landscape',width:932,height:430,mobile:true},
];
const styles=[
 {id:'current',name:'Current',height:null},
 {id:'fine',name:'960 × 540',height:540},
 {id:'bold',name:'640 × 360',height:360},
];
const scenes=[
 {id:'concourse',name:'Concourse',note:'Painted background, 3D ship, shadow and interface.'},
 {id:'planet',name:'Planet',note:'A distant planet and ships at several distances.'},
 {id:'asteroids',name:'Asteroids',note:'Rock texture, silhouettes and fine details.',motion:true},
 {id:'graveyard',name:'Graveyard',note:'Wrecks, debris and small ship details.'},
 {id:'station',name:'Station',note:'Helix, fine structural details and nearby traffic.'},
 {id:'combat',name:'Combat',note:'Weapons and impact effects against the asteroid field.',motion:true},
];
const frames=12,fps=8;
await mkdir(out,{recursive:true});
let html=await readFile('game.html','utf8');
html=html.replace('<html lang="de">','<html lang="de" data-test-build="pixel-grid-review">')
 .replace('<head>','<head><base href="/">')
 .replace('<script type="module" src="./src/main.js"></script>',`<script>
 // Review never reads or writes the user's career, settings or service worker.
 const memory=new Map([['void-privateer-settings-v1',JSON.stringify({music:0,effects:0})]]);
 Storage.prototype.getItem=function(k){return memory.get(String(k))??null;};
 Storage.prototype.setItem=function(k,v){memory.set(String(k),String(v));};
 Storage.prototype.removeItem=function(k){memory.delete(String(k));};
 Storage.prototype.clear=function(){memory.clear();};
 </script><script type="module" src="/src/main.js"></script><script type="module" src="/output/pixel-grid-review/capture.js"></script>`);
await writeFile(`${out}/capture.html`,html);
await copyFile('tools/playtest/pixel-grid-review/capture.js',`${out}/capture.js`);
await copyFile('tools/playtest/pixel-grid-review/gallery.html',`${out}/index.html`);

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']});
const report={revision:'pixel-grid-1',version:(await readFile('src/game/ui.js','utf8')).match(/GAME_VERSION\s*=\s*'([^']+)'/)?.[1],profiles,styles,scenes,frames,fps,captures:{},errors:[]};
const dimensions=bytes=>({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
try{
 for(const profile of profiles){
  if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(profile.id))continue;
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:1,hasTouch:profile.mobile,isMobile:profile.mobile,serviceWorkers:'block'});
  await context.addInitScript(()=>{const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  const page=await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror',error=>report.errors.push(`${profile.id}: ${error.message}`));
  const cdp=await context.newCDPSession(page);
  await page.goto(`${base}/${out}/capture.html?startup-probe=1`);
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame&&window.pixelGridCapture);
  await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
  await page.waitForFunction(()=>{const r=__VOID_PRIVATEER__.getRuntime();return r?.flightPrepared&&!r.ui.concourseArrivalPending&&r.ui.concourseShip?.model&&document.querySelector('#loading-screen').classList.contains('is-hidden');});
  await page.evaluate(async()=>{const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);r.audio.setVolumes(0,0);await Promise.allSettled([...r.renderer.glbShipLoading.values(),...(r.renderer.stationModelLoads?.values()??[])]);await document.fonts.ready;});
  report.captures[profile.id]={};
  for(const scene of scenes){
   console.log(`${profile.id}: ${scene.id}`);
   const state=await page.evaluate(id=>pixelGridCapture.prepare(id),scene.id);
   if(scene.id!=='concourse')assert.ok(state.ships.length===4&&state.ships.every(s=>s.model&&s.visible),JSON.stringify({profile:profile.id,state}));
   report.captures[profile.id][scene.id]={state,styles:{}};
   for(const style of styles){
    // Keep the CSS layout identical. Chrome's compositor rasterizes the whole
    // interface at the selected logical size, including DOM cockpit artwork.
    const ratio=style.height?style.height/profile.height:1;
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:profile.width,height:profile.height,deviceScaleFactor:ratio,mobile:profile.mobile});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const world=await page.evaluate(height=>pixelGridCapture.setGrid(height),style.height);
    await page.evaluate(()=>pixelGridCapture.render());
    const image=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});
    const png=Buffer.from(image.data,'base64'),size=dimensions(png),id=`${profile.id}-${scene.id}-${style.id}`;
    const expectedHeight=style.height??profile.height,expectedWidth=Math.round(profile.width*expectedHeight/profile.height);
    assert.deepEqual(size,{width:expectedWidth,height:expectedHeight},JSON.stringify({id,size}));
    if(style.height)assert.deepEqual(world,size,JSON.stringify({id,world,size}));
    await writeFile(`${out}/${id}.png`,png);
    const sequence=[`${id}.png`];
    if(scene.motion){
     for(let frame=1;frame<frames;frame++){
      await page.evaluate(({frame,frames})=>pixelGridCapture.render(frame,frames),{frame,frames});
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});
      const data=Buffer.from(shot.data,'base64');assert.deepEqual(dimensions(data),size);
      const name=`${id}-${String(frame).padStart(2,'0')}.png`;
      await writeFile(`${out}/${name}`,data);sequence.push(name);
     }
    }
    report.captures[profile.id][scene.id].styles[style.id]={size,world,sequence};
   }
  }
  await context.close();
 }
 assert.deepEqual(report.errors,[]);
 await writeFile(`${out}/manifest.json`,JSON.stringify(report,null,2));
 console.log(`Ready: ${base}/${out}/index.html`);
}finally{await browser.close();}
