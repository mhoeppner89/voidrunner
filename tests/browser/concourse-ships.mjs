import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/concourse-ships',reports=[];await mkdir(out,{recursive:true});
for(const[name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
 const page=await browser.newPage({...device,serviceWorkers:'allow'});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='warning')console.log('warning',m.text());if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.addInitScript(()=>{localStorage.setItem('void-privateer-settings-v1',JSON.stringify({music:0,effects:0}));const C=window.AudioContext??window.webkitAudioContext;if(C)C.prototype.resume=async function(){await this.suspend();};});
 await page.goto(`${base}/game.html?revision=0.8.2iu`);await page.waitForFunction(()=>window.__VOID_PRIVATEER__?.newGame);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.locator('[data-ui-command="new"]').click();await page.locator('[data-ui-command="skip-new-career"]').click();
 await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime()?.flightPrepared&&document.querySelector('#loading-screen').classList.contains('is-hidden'));
 console.log(name,'boot',await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;return{pending:u.concourseArrivalPending,phase:u.concourseShip?.phase,model:!!u.concourseShip?.model,host:u.concourseShip?.host?.className};}));
 await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.model);
 await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().ui.concourseArrivalPending);
 await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.ui.showDock(r.save,'helix',{arrival:true});});
 await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip?.phase==='landing');
 assert.ok(await page.locator('.scene-pointers').evaluate(e=>e.inert));await page.screenshot({path:`${out}/${name}-landing.png`});
 const ready=()=>page.waitForFunction(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;return !u.concourseArrivalPending&&u.concourseShip?.model&&document.querySelector('.concourse-model-stage.has-model');});await ready();
 // A rotated 3D box includes empty space around the actual hull. Check
 // rendered opaque pixels before treating an authored control as an overlap.
 const authoredOverlaps=[];
 const clearPointers=async id=>{
  const overlaps=await page.evaluate(()=>{
   const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,ship=v.button.getBoundingClientRect();
   const candidates=[...document.querySelectorAll('.scene-pointers .scene-pointer')].filter(e=>{const b=e.getBoundingClientRect();return Math.min(b.right,ship.right)-Math.max(b.left,ship.left)>1&&Math.min(b.bottom,ship.bottom)-Math.max(b.top,ship.top)>1;});
   if(!candidates.length)return [];
   v.stop();const backdrop=v.finish.uniforms.uHasBackdrop.value,ground=v.ground.visible,reflection=v.reflection.plane.visible;v.finish.uniforms.uHasBackdrop.value=0;v.ground.visible=false;v.reflection.plane.visible=false;v.render();
   const gl=v.renderer.getContext(),w=v.canvas.width,h=v.canvas.height,data=new Uint8Array(w*h*4),c=v.canvas.getBoundingClientRect();gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
   const result=candidates.map(e=>{const b=e.getBoundingClientRect(),x0=Math.max(0,Math.floor((b.left-c.left)/c.width*w)),x1=Math.min(w,Math.ceil((b.right-c.left)/c.width*w)),y0=Math.max(0,Math.floor((b.top-c.top)/c.height*h)),y1=Math.min(h,Math.ceil((b.bottom-c.top)/c.height*h));let pixels=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[((h-1-y)*w+x)*4+3]>220)pixels++;return{control:e.className,pixels};}).filter(e=>e.pixels>0);
   v.finish.uniforms.uHasBackdrop.value=backdrop;v.ground.visible=ground;v.reflection.plane.visible=reflection;v.reflection.dirty=true;v.render();v.resume();return result;
  });
  if(overlaps.length){
   await page.screenshot({path:`${out}/${name}-${id}-overlap.png`});
   const authored=await page.evaluate(()=>!!__VOID_PRIVATEER__.getRuntime().ui.concourseShip.profile.placements?.[innerWidth<=900?'phone':'desktop']);
   // Explicit author placements may overlap a larger preview hull. Preserve
   // them exactly; the old zero-overlap rule applies to automatic layout.
   if(authored)authoredOverlaps.push({id,overlaps});else assert.deepEqual(overlaps,[],`${name}/${id} automatic menu covers visible hull pixels`);
  }
 };
 const motions=[],seenMotion=new Set();
 const checkMotion=async(location,hull)=>{
  const key=location+'/'+hull;if(seenMotion.has(key))return;seenMotion.add(key);
  await page.evaluate(async()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();window.dockPose=(await import('/src/game/concourseShip.js')).concoursePose;window.motionRestore={backdrop:v.finish.uniforms.uHasBackdrop.value,ground:v.ground.visible,reflection:v.reflection.plane.visible};v.finish.uniforms.uHasBackdrop.value=0;v.ground.visible=false;v.reflection.plane.visible=false;});
  const frames=[];
  try{
   for(const phase of ['landing','takeoff'])for(const t of [0,.5,1]){
    const state=await page.evaluate(({phase,t})=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,p=dockPose(phase,t,0,v.flightPath);v.applyPose(p);v.renderer.shadowMap.needsUpdate=true;v.render();const gl=v.renderer.getContext(),data=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>220)pixels++;return{phase,t,pixels,scale:p.scale,fade:v.finish.uniforms.uFade.value};},{phase,t});frames.push(state);
    assert.equal(state.scale,1,'dock motion must not shrink the hull');assert.equal(state.fade,1,'dock motion must not fade the hull');
    if(phase==='landing'&&t===0||phase==='takeoff'&&t===1)assert.equal(state.pixels,0,`${name}/${key}/${phase} clears the actual screen edge`);else assert.ok(state.pixels>100,`${name}/${key}/${phase}/${t} ship is visible`);
   }
   if((location==='helix'&&hull==='wayfarer')||(location==='league-yard'&&hull==='wayfarer'))for(const phase of ['landing','takeoff'])for(const t of [.18,.4,.72]){
    await page.evaluate(({phase,t})=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.finish.uniforms.uHasBackdrop.value=motionRestore.backdrop;v.ground.visible=motionRestore.ground;v.reflection.plane.visible=motionRestore.reflection;v.reflection.dirty=true;v.applyPose(dockPose(phase,t,0,v.flightPath));v.renderer.shadowMap.needsUpdate=true;v.render();},{phase,t});await page.screenshot({path:`${out}/${name}-${location}-${phase}-${Math.round(t*100)}.png`});
   }
  }finally{await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.finish.uniforms.uHasBackdrop.value=motionRestore.backdrop;v.ground.visible=motionRestore.ground;v.reflection.plane.visible=motionRestore.reflection;v.resetPose();v.reflection.dirty=true;v.renderer.shadowMap.needsUpdate=true;v.render();v.resume();});}
  motions.push({location,hull,frames});
 };
 const shaderPixels=await page.evaluate(async()=>{
  const THREE=await import('three'),{createConcourseFinish}=await import('/src/game/concourseFinish.js');
  const r=new THREE.WebGLRenderer({alpha:true,antialias:false});r.setSize(8,4);r.setClearColor(0,0);
  const rgb=[102,153,204],pixels=new Float32Array(8*4*4),plate=new Uint8Array([...rgb,255]);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){const i=(y*8+x)*4;for(let k=0;k<3;k++){const c=rgb[k]/255,linear=c<=.04045?c/12.92:((c+.055)/1.055)**2.4;pixels[i+k]=-Math.log(1-linear)/1.1;}pixels[i+3]=1;}
  const scene=new THREE.DataTexture(pixels,8,4,THREE.RGBAFormat,THREE.FloatType),backdrop=new THREE.DataTexture(plate,1,1);scene.needsUpdate=backdrop.needsUpdate=true;
  const finish=createConcourseFinish();finish.uniforms.tScene.value=scene;finish.uniforms.tBackdrop.value=backdrop;finish.uniforms.uHasBackdrop.value=1;
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),finish);r.render(quad,new THREE.Camera());const data=new Uint8Array(8*4*4);r.getContext().readPixels(0,0,8,4,r.getContext().RGBA,r.getContext().UNSIGNED_BYTE,data);
  let mismatch=0,changedColour=0;for(let y=0;y<4;y++)for(let x=0;x<4;x++)for(let k=0;k<3;k++){if(Math.abs(data[(y*8+x)*4+k]-data[(y*8+x+4)*4+k])>1)mismatch++;}
  for(let i=0;i<data.length;i++)if(i%4!==3&&Math.abs(data[i]-rgb[i%4])>1)changedColour++;
  const sample=[...data.slice(0,4)];quad.geometry.dispose();finish.dispose();scene.dispose();backdrop.dispose();r.dispose();return{mismatch,changedColour,sample};
 });assert.equal(shaderPixels.mismatch,0,'ship and backdrop use the identical final shader');assert.equal(shaderPixels.changedColour,0,'the final composite preserves source colours without tint, dithering or palette reduction');assert.ok(shaderPixels.sample[0]>70&&shaderPixels.sample[2]>170,'fixture must actually render');
 assert.equal(await page.locator('.concourse-hover-ship').evaluate(e=>e.tagName),'BUTTON');assert.equal(await page.locator('.concourse-hover-preview img').count(),0);
 await page.screenshot({path:`${out}/${name}-helix-wayfarer.png`});
 const shadow=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const backdrop=v.finish.uniforms.uHasBackdrop.value;v.finish.uniforms.uHasBackdrop.value=0;v.model.visible=false;const reflect=v.reflection.plane.visible;v.reflection.plane.visible=false;v.renderer.shadowMap.needsUpdate=false;v.render();const gl=v.renderer.getContext(),bytes=new Uint8Array(v.canvas.width*v.canvas.height*4);gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let pixels=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i]>10)pixels++;v.model.visible=true;v.finish.uniforms.uHasBackdrop.value=backdrop;v.reflection.plane.visible=reflect;v.reflection.dirty=true;v.resume();return pixels;});assert.ok(shadow>100,`cast shadow visible: ${shadow}`);
 const hulls=(await page.evaluate(async()=>Object.keys((await import('/src/game/data.js')).SHIPS))).filter(id=>!process.env.VR_HULLS||process.env.VR_HULLS.split(',').includes(id)),hullReport=[];let alignment;
 for(const id of hulls){
  await page.evaluate(async id=>{const r=__VOID_PRIVATEER__.getRuntime(),{createOutfittingState}=await import('/src/game/outfitting.js');r.save.player.shipId=id;r.save.player.outfitting=createOutfittingState([id]);r.ui.refreshDock(r.save);},id);
  await page.waitForFunction(id=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return v?.loadedShipId===id&&v.host?.classList.contains('has-model');},id);
  const info=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip,b=document.querySelector('.concourse-hover-ship').getBoundingClientRect();return{id:v.loadedShipId,variant:v.loadedVariant,paint:v.model.userData.livery,width:b.width,height:b.height,x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:innerWidth,h:innerHeight,shadow:!!v.sun.shadow.map};});
  assert.ok(info.width>30&&info.height>15&&info.x>=-1&&info.right<=info.w+1&&info.y>=50&&info.bottom<=info.h+1&&info.shadow,JSON.stringify(info));
  if(id==='atlas'){
   alignment=await page.evaluate(()=>{
    const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();
    const backdrop=v.finish.uniforms.uHasBackdrop.value,ground=v.ground.visible,reflection=v.reflection.plane.visible;
    v.finish.uniforms.uHasBackdrop.value=0;v.ground.visible=false;v.reflection.plane.visible=false;
    const gl=v.renderer.getContext(),bytes=new Uint8Array(v.canvas.width*v.canvas.height*4),frames=[];
    for(const refresh of [true,false]){
     v.renderer.shadowMap.needsUpdate=refresh;v.render();gl.readPixels(0,0,v.canvas.width,v.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
     let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,count=0;
     for(let y=0;y<v.canvas.height;y++)for(let x=0;x<v.canvas.width;x++)if(bytes[(y*v.canvas.width+x)*4+3]>200){count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
     const c=v.canvas.getBoundingClientRect(),b=v.button.getBoundingClientRect();
     const rect={left:c.left+x0/v.canvas.width*c.width,right:c.left+(x1+1)/v.canvas.width*c.width,top:c.top+(1-(y1+1)/v.canvas.height)*c.height,bottom:c.top+(1-y0/v.canvas.height)*c.height};
     frames.push({refresh,count,rect,inside:rect.left>=b.left-2&&rect.right<=b.right+2&&rect.top>=b.top-2&&rect.bottom<=b.bottom+2});
    }
    v.finish.uniforms.uHasBackdrop.value=backdrop;v.ground.visible=ground;v.reflection.plane.visible=reflection;v.renderer.shadowMap.needsUpdate=true;v.render();v.resume();return frames;
   });
   for(const f of alignment)assert.ok(f.count>100&&f.inside,`${name} rendered hull matches its launch area with shadow refresh=${f.refresh}: ${JSON.stringify(f)}`);
   assert.deepEqual(alignment[0].rect,alignment[1].rect,'shadow refresh must not move or resize the rendered hull');
  }
  await clearPointers(id);await checkMotion('helix',id);await page.screenshot({path:`${out}/${name}-helix-${id}.png`});hullReport.push(info);console.log(name,id,info.paint);
 }
 const locations=(await page.evaluate(async()=>[...(await import('/src/game/data.js')).DOCK_LOCATION_IDS])).filter(id=>!process.env.VR_LOCATIONS||process.env.VR_LOCATIONS.split(',').includes(id)),locationReport=[];
 for(const id of locations){
  await page.evaluate(id=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt=id;r.save.player.shipId='wayfarer';r.ui.showDock(r.save,id);},id);await ready();await page.waitForTimeout(350); // let the action-label reveal finish
  const fit=await page.locator('.concourse-hover-ship').evaluate(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,viewport:[innerWidth,innerHeight],visible:b.x>=-1&&b.right<=innerWidth+1&&b.y>=45&&b.bottom<=innerHeight+1};});if(!fit.visible){await page.screenshot({path:`${out}/${name}-${id}-failure.png`});console.log(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return {location:v.location,zoom:v.camera.zoom,size:[v.cssWidth,v.cssHeight],origin:[v.originX,v.originY],bounds:v.restBounds,pivot:v.pivot.position,host:v.host.getBoundingClientRect().toJSON(),parent:v.host.parentElement.getBoundingClientRect().toJSON(),background:document.querySelector('.dock-backdrop img').getBoundingClientRect().toJSON()};}));}assert.ok(fit.visible,`${name}/${id} ship on screen ${JSON.stringify(fit)}`);
  const lighting=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return{scale:v.profile.scale,key:v.sun.color.getHex(),environment:v.scene.environmentIntensity,backdrop:!!v.backdropKey,reflection:v.reflection.plane.visible,opacity:v.reflection.material.uniforms.uOpacity.value,zoom:v.camera.zoom};});assert.ok(lighting.backdrop,'use the actual room for reflections');assert.equal(lighting.reflection,id!=='vesper');
  const placement=await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui,v=u.concourseShip,device=innerWidth<=900?'phone':'desktop',expected=v.profile.placements[device],s=document.querySelector('.station-scene').getBoundingClientRect(),r=v.host.getBoundingClientRect();return{expected,sceneSize:{x:s.width,y:s.height},actual:{ship:{x:(r.left+r.width/2-s.left)/s.width,y:(r.top+r.height/2-s.top)/s.height,zoom:v.camera.zoom},buttons:Object.fromEntries([...document.querySelectorAll('.scene-pointers .scene-pointer')].map(e=>{const key=['services','market','bar','den'].find(k=>e.classList.contains('concourse-pointer-'+k)),b=e.getBoundingClientRect();const style=getComputedStyle(e);return[key,{x:parseFloat(style.left)/s.width,y:parseFloat(style.top)/s.height}];}))}};});
  for(const axis of ['x','y'])assert.ok(Math.abs(placement.actual.ship[axis]-placement.expected.ship[axis])*placement.sceneSize[axis]<.6,`${id} approved ship ${axis}: ${JSON.stringify(placement)}`);assert.equal(placement.actual.ship.zoom,placement.expected.ship.zoom);
  for(const[key,p]of Object.entries(placement.actual.buttons))for(const axis of ['x','y'])assert.ok(Math.abs(p[axis]-placement.expected.buttons[key][axis])*placement.sceneSize[axis]<.6,`${id}/${key} approved ${axis}: ${JSON.stringify(placement)}`);
  await clearPointers(id);await checkMotion(id,'wayfarer');await page.screenshot({path:`${out}/${name}-${id}.png`});locationReport.push({id,...fit,...lighting});
 }
 await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');});await ready();
 const reuse=await page.evaluate(()=>{const u=__VOID_PRIVATEER__.getRuntime().ui;window.concourseBefore={view:u.concourseShip,model:u.concourseShip.model,draws:u.concourseShip.renderCount};u.switchToTerminal('market');return true;});await page.waitForTimeout(200);
 assert.ok(await page.evaluate(()=>{const v=window.concourseBefore.view;return v.paused&&!v.raf&&v.renderCount===window.concourseBefore.draws;}));
 await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.switchToTerminal('concourse'));await ready();assert.ok(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip===concourseBefore.view&&__VOID_PRIVATEER__.getRuntime().ui.concourseShip.model===concourseBefore.model));
 await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.shipPaints??={};r.save.player.shipPaints.wayfarer='independent-bands';r.ui.refreshDock(r.save);});
 await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.model?.userData.livery==='independent-bands');await page.screenshot({path:`${out}/${name}-paint-bands.png`});
 const resources=await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;v.stop();const before={...v.renderer.info.memory};for(let i=0;i<30;i++)v.render();const after={...v.renderer.info.memory};v.resume();return{before,after};});assert.deepEqual(resources.before,resources.after);
 // The live hover deliberately moves this hit area every frame. Its visibility
 // and framing were checked above; click it without waiting for a static box.
 await page.locator('.concourse-hover-ship').click({force:true});await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase==='takeoff');assert.ok(await page.locator('.scene-pointers').evaluate(e=>e.inert));await page.waitForTimeout(450);await page.screenshot({path:`${out}/${name}-takeoff.png`});await page.waitForFunction(()=>!__VOID_PRIVATEER__.getRuntime().save.player.dockedAt);
 assert.ok(await page.evaluate(()=>{const v=__VOID_PRIVATEER__.getRuntime().ui.concourseShip;return v.paused&&!v.raf;}));
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.dockedAt='helix';r.ui.showDock(r.save,'helix');});await ready();assert.equal(await page.evaluate(()=>__VOID_PRIVATEER__.getRuntime().ui.concourseShip.phase),'idle');
 assert.deepEqual(errors,[]);reports.push({name,shaderPixels,shadow,alignment,motions,authoredOverlaps,hulls:hullReport,locations:locationReport,resources,reuse,errors});await writeFile(`${out}/${name}-report.json`,JSON.stringify(reports.at(-1),null,2));await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(name,'all hulls/ports, approved placements, physical screen-edge motion, paint, shadow and lifecycle passed');
 }finally{await browser.close();}
}
