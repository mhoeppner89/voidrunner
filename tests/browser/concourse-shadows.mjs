import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/concourse-shadows',reports=[];await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
  await page.goto(`${base}/output/planet-transitions/index.html?planet=helix&hull=wayfarer&revision=0.8.2iu`);
  await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.getRuntime()?.ui.concourseShip?.model&&document.querySelector('#review-exit')?.disabled===false);
  await page.evaluate(async()=>{
   window.shadowPose=(await import('/src/game/concourseShip.js')).concoursePose;
   window.shadowShips=(await import('/src/game/data.js')).SHIPS;
   window.shadowLocations=(await import('/src/game/data.js')).DOCK_LOCATION_IDS;
   window.shadowFit=(await import('/src/game/outfitting.js')).createOutfittingState;
   const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();
   const original=v.renderer.shadowMap.render;window.shadowDraws=0;v.renderer.shadowMap.render=function(...args){if(this.enabled&&this.needsUpdate)shadowDraws++;return original.apply(this,args);};
   window.shadowRead=()=>{
    const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,gl=v.renderer.getContext(),w=v.canvas.width,h=v.canvas.height,bytes=new Uint8Array(w*h*4),uv=v.deck.uniforms.uDeckUV.value,edges=v.deck.uniforms.uDeckEdges.value,count=v.deck.uniforms.uDeckEdgeCount.value;
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let pixels=0,outside=0,alpha=0,cx=0,cy=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=bytes[(y*w+x)*4+3];if(a<=3)continue;const px=(uv.x+(x+.5)/w*uv.z)*16/9,py=1-(uv.y+(y+.5)/h*uv.w);let d=100;for(let i=0;i<count;i++)d=Math.min(d,edges[i].x*px+edges[i].y*py+edges[i].z);if(d<-.000001)outside++;pixels++;alpha+=a;cx+=x*a;cy+=y*a;}
    return{pixels,outside,alpha,cx:alpha?cx/alpha:0,cy:alpha?cy/alpha:0};
   };
  });
  const ready=()=>page.waitForFunction(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return !__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending&&v?.model&&v.host.classList.contains('has-model');});
  const ports=[];
  for(const id of await page.evaluate(()=>shadowLocations)){
   await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt=id;r.ui.showDock(r.save,id);},id);await ready();
   const probe=await page.evaluate(()=>{
    const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();v.resetPose();v.reflection.dirty=true;v.render();
    const backdrop=v.finish.uniforms.uHasBackdrop.value,reflect=v.reflection.plane.visible;v.finish.uniforms.uHasBackdrop.value=0;v.pivot.visible=false;v.reflection.plane.visible=false;v.render();const shadow=shadowRead();
    v.pivot.visible=true;v.reflection.plane.visible=reflect;v.finish.uniforms.uHasBackdrop.value=backdrop;v.reflection.dirty=true;v.render();
    const hdr=new Uint16Array(v.target.width*v.target.height*4);v.renderer.readRenderTargetPixels(v.target,0,0,v.target.width,v.target.height,hdr);let invalid=0;for(const word of hdr)if((word&0x7c00)===0x7c00)invalid++;
    return{...shadow,invalid,opacity:v.ground.material.opacity};
   });
   assert.equal(probe.invalid,0,`${name}/${id} no invalid HDR pixels or black reflection patches`);
   assert.ok(probe.pixels>20,`${name}/${id} contact shadow exists: ${JSON.stringify(probe)}`);assert.equal(probe.outside,0,`${name}/${id} shadow stays on pad`);ports.push({id,...probe});
   await page.screenshot({path:`${out}/${name}-${id}.png`});console.log(name,id,probe.pixels);
  }
  const motion=[];
  for(const[location,hull]of [['helix','wayfarer'],['shepherd','speedster'],['azure','atlas']]){
   await page.evaluate(({location,hull})=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipId=hull;r.save.player.outfitting=shadowFit([hull]);r.save.player.dockedAt=location;r.ui.showDock(r.save,location);},{location,hull});await ready();await page.waitForFunction(id=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.loadedShipId===id,hull);
   await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();v.reflection.plane.visible=false;});
   const heights=[];
   for(const height of [.14,.35,.7,1,1.5,2.5]){
    const probe=await page.evaluate(height=>{
     const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.phase='takeoff';v.pivot.visible=true;v.applyPose({x:0,y:height,z:0,pitch:0,yaw:0,roll:0,scale:1,thrust:0});v.render();const full=v.finish.uniforms.uHasBackdrop.value;
     v.finish.uniforms.uHasBackdrop.value=0;v.pivot.visible=false;v.render();const shadow=shadowRead();v.pivot.visible=true;v.finish.uniforms.uHasBackdrop.value=full;v.render();return{height,...shadow,opacity:v.ground.material.opacity,radius:v.sun.shadow.radius};
    },height);heights.push(probe);assert.equal(probe.outside,0);
    if(location==='helix')await page.screenshot({path:`${out}/${name}-${location}-height-${height}.png`});
   }
   for(let i=1;i<heights.length;i++){assert.ok(heights[i].opacity<heights[i-1].opacity);assert.ok(heights[i].radius>heights[i-1].radius);}assert.equal(heights.at(-1).pixels,0,'no floating shadow once clear of pad');
   const cadence=await page.evaluate(()=>{
    const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,frames=[];v.phase='landing';v.finish.uniforms.uHasBackdrop.value=0;
    for(let i=0;i<12;i++){v.pivot.visible=true;v.applyPose({x:-.3+i*.05,y:.2+i*.01,z:0,pitch:0,yaw:0,roll:0,scale:1,thrust:0});const before=shadowDraws;v.render();v.pivot.visible=false;v.render();frames.push({...shadowRead(),updates:shadowDraws-before});}
    v.pivot.visible=true;v.applyPose({x:8,y:4,z:8,pitch:0,yaw:0,roll:0,scale:1,thrust:0});const before=shadowDraws;v.render();const distantUpdates=shadowDraws-before;
    v.finish.uniforms.uHasBackdrop.value=1;v.phase='idle';v.resetPose();v.reflection.plane.visible=v.profile.reflection>0;v.reflection.dirty=true;v.render();return{frames,distantUpdates};
   });assert.ok(cadence.frames.every(f=>f.updates===1),'one fresh shadow per visible frame');assert.equal(cadence.distantUpdates,0,'skip distant shadow-map passes');assert.ok(new Set(cadence.frames.map(f=>`${f.cx.toFixed(2)},${f.cy.toFixed(2)}`)).size>=10,'shadow moves every frame');
   motion.push({location,hull,heights,cadence});
  }
  const resources=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;const before={...v.renderer.info.memory};for(let i=0;i<30;i++){v.applyPose(shadowPose('idle',0,i/30));v.render();}const after={...v.renderer.info.memory};return{before,after};});assert.deepEqual(resources.before,resources.after,'no per-frame GPU resources');
  assert.deepEqual(errors,[]);reports.push({name,ports,motion,resources,errors});await writeFile(`${out}/${name}-report.json`,JSON.stringify(reports.at(-1),null,2));await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(name,'pad clipping, lift fade/softness, continuous motion, distant work and resources passed');
 }finally{await browser.close();}
}
