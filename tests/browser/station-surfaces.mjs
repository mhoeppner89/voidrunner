// Tiny camera movements expose depth fighting without confounding normal motion.
import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url);
const out='output/station-polish',base=process.env.VR_BASE_URL??'http://127.0.0.1:4192';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1280,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(process.env.VR_PROFILES&&!process.env.VR_PROFILES.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});
 try{
  const page=await browser.newPage({...device,serviceWorkers:'block'}),errors=[],report=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/output/station-review/index.html');await page.waitForFunction(()=>window.ready);
  const ids=await page.locator('#station option').evaluateAll(ns=>ns.map(n=>n.value));
  for(const id of ids){
   if(process.env.VR_STATIONS&&!process.env.VR_STATIONS.split(',').includes(id))continue;
   await page.locator('#station').selectOption(id);await page.waitForFunction(()=>window.ready);
   const result=await page.evaluate(async id=>{
    const T=await import('three'),{loadGlb}=await import('/src/game/glbLoader.js'),{LOCATIONS}=await import('/src/game/data.js'),{disposeObject}=await import('/src/game/shipPreview.js');
    const r=stationReview,root=r.model,parked=root.getObjectByName('station-docked-ships');if(parked)parked.visible=false;
    const previousUrl=`/output/station-polish/${id}-before.glb`,old=await fetch(previousUrl,{method:'HEAD'}).then(response=>response.ok?loadGlb(previousUrl):null),target=new T.WebGLRenderTarget(640,360,{samples:4}),previous=new Uint8Array(640*360*4),pixels=new Uint8Array(previous.length),runs=[];
    const projection={near:r.camera.near,far:r.camera.far,aspect:r.camera.aspect};
    const scale=LOCATIONS[id].radius*(id==='blackglass'?.2:.95)/100;let maps=0,colors=0;
    root.traverse(o=>{if(!o.isMesh)return;if(o.geometry.attributes.color&&o.material.vertexColors)colors++;if(o.material.map){maps++;if(o.material.map.minFilter!==T.LinearMipmapLinearFilter||!o.material.map.generateMipmaps)throw Error('Missing mip filtering');}});
    for(const view of ['concourse','terminal','overview','habitat','engineering','underside','rear']){
     r.setView(view);r.camera.near=.08/scale;r.camera.far=2000000/scale;r.camera.aspect=640/360;r.camera.updateProjectionMatrix();const start=r.camera.position.clone(),focus=start.clone().add(r.camera.getWorldDirection(new T.Vector3()).multiplyScalar(40));
     for(const [build,model]of [...(old?[['previous',old]]:[]),['current',root]]){
      r.scene.remove(root,old);r.scene.add(model);let worst=0;
      for(let step=0;step<4;step++){
       r.camera.position.copy(start);r.camera.position.x+=(step%2?1:-1)*.0005;r.camera.position.y+=(step>1?1:-1)*.0003;r.camera.lookAt(focus);r.camera.updateMatrixWorld();
       r.renderer.setRenderTarget(target);r.renderer.render(r.scene,r.camera);r.renderer.readRenderTargetPixels(target,0,0,640,360,pixels);r.renderer.setRenderTarget(null);
       if(step){let changed=0;for(let j=0;j<pixels.length;j+=4)if(Math.max(Math.abs(pixels[j]-previous[j]),Math.abs(pixels[j+1]-previous[j+1]),Math.abs(pixels[j+2]-previous[j+2]))>40)changed++;worst=Math.max(worst,changed/(640*360));}previous.set(pixels);
      }
      runs.push({view,build,changedFraction:worst});
     }
    }
    r.scene.remove(old);r.scene.add(root);if(parked)parked.visible=true;if(old)disposeObject(old);target.dispose();Object.assign(r.camera,projection);r.camera.updateProjectionMatrix();r.setView('concourse');r.renderer.setRenderTarget(null);r.renderer.render(r.scene,r.camera);
    return {maps,colors,runs};
   },id);
   assert.ok(result.maps>0&&result.colors>=8,`${id}: atlas and contact shading loaded`);
   for(const run of result.runs.filter(r=>r.build==='current'))assert.ok(run.changedFraction<.002,`${name}/${id}/${run.view}: depth instability ${run.changedFraction}`);
   await page.screenshot({path:`${out}/${name}-${id}-detail.png`});report.push({id,...result});console.log(name,id,JSON.stringify(result.runs.filter(r=>r.build==='current')));
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}-surfaces.json`,JSON.stringify({report,errors},null,2));
 }finally{await browser.close();}
}
