import {chromium,webkit,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolateBrowserProfiles} from '../helpers/browser-profiles.mjs';
await isolateBrowserProfiles(import.meta.url,['desktop','iphone']);
const base=process.env.VR_BASE_URL??'http://127.0.0.1:4192',out='output/wreck-collision';await mkdir(out,{recursive:true});
for(const [name,engine,device]of [['desktop',chromium,{viewport:{width:1440,height:900}}],['iphone',webkit,devices['iPhone 13 landscape']]]){
 if(!process.env.VR_PROFILES?.split(',').includes(name))continue;
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--disable-gpu-sandbox','--mute-audio','--use-gl=angle','--use-angle=swiftshader']}:{})});let page;const errors=[];
 try{
  const context=await browser.newContext({...device,serviceWorkers:'block'});await context.addInitScript(()=>{const A=window.AudioContext??window.webkitAudioContext;if(A)A.prototype.resume=async function(){await this.suspend();};});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(base+'/output/exploration-review/index.html?scene=salvage');await page.waitForFunction(()=>window.discoveryReview?.ready&&discoveryReview.scene==='salvage');
  await page.waitForFunction(()=>__VOID_PRIVATEER__.getRuntime().renderer.combatLootMeshes.get('wreck-exploration-kestrel-nine')?.userData.derelictVents);
  const freighter=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);const T=await import('/vendor/three.module.min.js'),{shipVsObstacle}=await import('/src/game/shipCollision.js');
   const data=r.renderer.combatLootMeshes.get('wreck-exploration-kestrel-nine').userData,obs=r.renderer.derelictCollisionObstacles.get('wreck-exploration-kestrel-nine').obstacles,ob=obs[0],v=ob.meshVerts,ix=ob.meshIndices;
   const a=new T.Vector3().fromArray(v,ix[0]*3),b=new T.Vector3().fromArray(v,ix[1]*3),c=new T.Vector3().fromArray(v,ix[2]*3),point=a.clone().add(b).add(c).multiplyScalar(1/3).add(new T.Vector3(ob.x,ob.y,ob.z)),normal=b.sub(a).cross(c.sub(a)).normalize(),q=new T.Quaternion().fromArray(r.save.player.rotation);
   const overlaps=shipVsObstacle(point,q,'kestrel',r.playerHullScale(),ob,{}),before=point.clone();r.resolvePlayerCollisions(point,new T.Vector3());
   const blocked=r.lineBlocked(before.clone().addScaledVector(normal,10),before.clone().addScaledVector(normal,-10));
   const poses=data.derelictEffect.sections.map(p=>p.group.position.toArray());
   const initial=data.derelictVents.object.material.uniforms.time.value;
   r.renderer.updateWorld(1);r.syncRender(0,performance.now());
   return{surfaces:obs.length,overlaps,blocked,pushed:point.distanceTo(before),vents:data.derelictVents.anchors.length,timeAdvanced:data.derelictVents.object.material.uniforms.time.value>initial,stable:JSON.stringify(poses)===JSON.stringify(data.derelictEffect.sections.map(p=>p.group.position.toArray()))};
  });assert.ok(freighter.surfaces>=7&&freighter.overlaps&&freighter.blocked&&freighter.pushed>.001&&freighter.vents===3&&freighter.timeAdvanced&&freighter.stable,JSON.stringify(freighter));
  await page.screenshot({path:`${out}/${name}-freighter.png`});
  await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.renderer.updateWorld(.3);r.syncRender(0,performance.now());});
  await page.screenshot({path:`${out}/${name}-freighter-vents.png`});
  const loot=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime();r.save.player.throttle=.7;for(let i=0;i<900&&!r.save.world.exploration.recovered.includes('finale');i++)r.updateSimulation(1/60,{});r.save.player.throttle=0;r.save.player.velocity.fill(0);r.resetPlayerInterpolation(true);r.syncRender(0,performance.now());const data=r.renderer.combatLootMeshes.get('wreck-exploration-kestrel-nine')?.userData;return{recovered:r.save.world.exploration.recovered.includes('finale'),solid:r.renderer.derelictCollisionObstacles.has('wreck-exploration-kestrel-nine'),visible:data?.derelictEffect.object.visible};});assert.ok(loot.recovered&&loot.solid&&loot.visible,JSON.stringify(loot));
  const menu=page.locator('#review-menu');if(device.isMobile)await menu.tap();else await menu.click();const preset=page.locator('[data-scene="cache-0"]');if(device.isMobile)await preset.tap();else await preset.click();await page.waitForFunction(()=>discoveryReview.ready&&discoveryReview.scene==='cache-0');
  const carrier=await page.evaluate(async()=>{
   const r=__VOID_PRIVATEER__.getRuntime();cancelAnimationFrame(r.frameId);const T=await import('/vendor/three.module.min.js'),{GRAVEYARD_CACHES}=await import('/src/game/explorationData.js'),{shipVsObstacle}=await import('/src/game/shipCollision.js');
   const def=GRAVEYARD_CACHES[0],to=new T.Vector3(...def.position),from=new T.Vector3(...r.save.player.position),distance=from.distanceTo(to),ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,distance-3);
   for(const wreck of r.renderer.graveyardModelMeshes)wreck.updateWorldMatrix(true,true);
   const hits=ray.intersectObjects(r.renderer.graveyardModelMeshes,true).filter(h=>h.object.visible),visible=hits.length===0;
   const clear=!r.activeFieldObstacles().some(ob=>shipVsObstacle(to,new T.Quaternion().fromArray(r.save.player.rotation),'kestrel',r.playerHullScale(),ob,{}));
   return{clear,visible,drawnObstructions:hits.slice(0,2).map(h=>({distance:h.distance,name:h.object.name})),freighterCleared:r.renderer.derelictCollisionObstacles.size===0};
  });assert.ok(carrier.clear&&carrier.visible&&carrier.freighterCleared,JSON.stringify(carrier));await page.screenshot({path:`${out}/${name}-carrier.png`});
  const collected=await page.evaluate(()=>{const r=__VOID_PRIVATEER__.getRuntime(),before=r.save.player.hull;r.save.player.throttle=.7;for(let i=0;i<900&&!r.save.world.exploration.recovered.includes('carrier');i++)r.updateSimulation(1/60,{});return{recovered:r.save.world.exploration.recovered.includes('carrier'),damage:before-r.save.player.hull};});assert.ok(collected.recovered&&collected.damage===0,JSON.stringify(collected));
  assert.deepEqual(errors,[]);await writeFile(`${out}/${name}.json`,JSON.stringify({freighter,loot,carrier,collected,errors},null,2));console.log(name,'solid freighter, animated vents, visible carrier cache and normal collection passed');
 }catch(error){console.error(name,error);if(page)await page.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});await writeFile(`${out}/${name}-failure.json`,JSON.stringify({error:String(error),errors},null,2));throw error;}finally{await browser.close();}
}
