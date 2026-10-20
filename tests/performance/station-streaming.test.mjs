import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SpaceRenderer} from '../../src/game/render.js';
import {prepareRenderScene,configureShaderDiagnostics} from '../../src/game/renderWork.js';
import {addStationActivity,updateStationActivity} from '../../src/game/stationActivity.js';

test('station film warmup uses the actual target, uploads shared textures once and restores state while awaiting',async()=>{
 const texture=new THREE.Texture(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:texture})),new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:texture})));
 const original={},shot={};let target=original,ready=false,uniforms=0,uploads=0;
 const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,initTexture:t=>{assert.equal(t,texture);uploads++;},compile:(s,c)=>{assert.equal(s,scene);assert.equal(c,camera);assert.equal(target,shot);},info:{programs:[{isReady:()=>ready,getUniforms(){uniforms++;}}]}};
 const pending=prepareRenderScene(renderer,scene,camera,shot);
 assert.equal(target,original,'a pending compile never leaves a temporary framebuffer bound');assert.equal(uploads,1);assert.equal(uniforms,0);
 ready=true;assert.ok(await pending);assert.equal(uniforms,1);
 ready=false;
 assert.equal(await prepareRenderScene(renderer,scene,camera,shot,{timeoutMs:1}),false,'a stalled driver cannot trap the player');assert.equal(target,original);
 ready=true;
 assert.equal(await prepareRenderScene(renderer,scene,camera,shot,{shouldCancel:()=>true}),false);assert.equal(uniforms,1,'cancelled views never touch disposed programs');
 scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});texture.dispose();
});

test('flight waits for streamed station assemblies before compiling their shaders',async()=>{
 let release,prepared=false;const model=new Promise(r=>release=r),r=Object.create(SpaceRenderer.prototype);
 Object.assign(r,{stationModelLoads:new Map([['helix',model]]),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),prepareCombatWarmup:()=>{prepared=true;return new THREE.Group();},isIOS:false,bloomEnabled:()=>true,bloomSceneTarget:{},renderer:{getRenderTarget:()=>null,setRenderTarget(){},compileAsync:async()=>{}}});
 const ready=r.prepareActiveScene();await Promise.resolve();assert.equal(prepared,false);release();await ready;assert.equal(prepared,true);
});

test('flight warmup still finishes when a station request never resolves',async()=>{
 const r=Object.create(SpaceRenderer.prototype);let compiled=0;
 Object.assign(r,{stationModelLoads:new Map([['helix',new Promise(()=>{})]]),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),prepareCombatWarmup:()=>new THREE.Group(),isIOS:false,bloomEnabled:()=>true,bloomSceneTarget:{},renderer:{getRenderTarget:()=>null,setRenderTarget(){},compileAsync:async()=>{compiled++;}}});
 await r.prepareActiveScene({timeoutMs:1,assetTimeoutMs:1});assert.equal(compiled,4);
});

test('docking lane colours upload only when the visible light sequence advances',()=>{
 const station=new THREE.Group(),activity=addStationActivity(station,'helix'),lights=activity.root.userData.laneLights;
 const version=lights.instanceColor.version;
 for(let i=1;i<15;i++)updateStationActivity(activity,i/60);
 assert.equal(lights.instanceColor.version,version,'unchanged lamps do not rewrite GPU buffers');
 updateStationActivity(activity,1);assert.ok(lights.instanceColor.version>version);
 station.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('shader error log synchronization is disabled in normal play and available to QA',t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'location');t.after(()=>old?Object.defineProperty(globalThis,'location',old):delete globalThis.location);
 const r={debug:{checkShaderErrors:true}};globalThis.location={search:''};configureShaderDiagnostics(r);assert.equal(r.debug.checkShaderErrors,false);
 location.search='?debug-shaders';configureShaderDiagnostics(r);assert.equal(r.debug.checkShaderErrors,true);
});

test('the hidden buffer draw is one pixel and restores culling, regions, shadows and framebuffer on failure',()=>{
 const r=Object.create(SpaceRenderer.prototype),region=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 region.visible=false;region.add(mesh);const original={},scene=new THREE.Scene(),wreck=new THREE.Group();wreck.visible=false;scene.add(region,wreck);let target=original,draws=0;
 Object.assign(r,{scene,camera:new THREE.PerspectiveCamera(),instanceRoots:new Map([['shardbelt',region]]),graveyardModelMeshes:[wreck],sunLight:{castShadow:true},renderer:{shadowMap:{enabled:true},getRenderTarget:()=>target,setRenderTarget:t=>target=t,render(){draws++;assert.equal(target.width,1);assert.equal(target.height,1);assert.equal(region.visible,true);assert.equal(wreck.visible,true);assert.equal(mesh.frustumCulled,false);assert.equal(r.sunLight.castShadow,false);throw Error('lost context');}}});
 assert.throws(()=>r.prepareSceneBuffers(),/lost context/);assert.equal(draws,1);assert.equal(target,original);assert.equal(region.visible,false);assert.equal(wreck.visible,false);assert.equal(mesh.frustumCulled,true);assert.equal(r.renderer.shadowMap.enabled,true);assert.equal(r.sunLight.castShadow,true);
 r.stationWarmupTarget.dispose();mesh.geometry.dispose();mesh.material.dispose();
});

test('approach prediction prepares only the chosen station in an already dormant dock renderer',async()=>{
 const {GameUI}=await import('../../src/game/ui.js'),ui=Object.create(GameUI.prototype),ports=[];
 ui.preloadLocationAssets=()=>Promise.resolve(true);ui.concourseShip={paused:true,prepareStation:async id=>ports.push(id)};
 await ui.predictLocationAssets('helix');assert.deepEqual(ports,['helix']);
 await ui.predictLocationAssets('vesper');assert.deepEqual(ports,['helix'],'planets do not load station geometry');
 ui.concourseShip.paused=false;await ui.predictLocationAssets('rook');assert.deepEqual(ports,['helix'],'an active concourse keeps its current assembly');
});

test('independent paint programs are shared across hulls while retaining exact hull-specific placement and colours',async()=>{
 const {applyIndependentPaint,INDEPENDENT_PAINTS}=await import('../../src/game/independentPaints.js');
 for(const [paint,scheme]of Object.entries(INDEPENDENT_PAINTS)){
  let key,fragment;
  for(const hull of ['demon','legionary','talon','lancer','atlas']){
   const root=new THREE.Group(),texture=new THREE.Texture(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,5),new THREE.MeshStandardMaterial({map:texture}));root.add(mesh);
   applyIndependentPaint(root,paint,hull);const material=mesh.material,shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>'};material.onBeforeCompile(shader);
   key??=material.customProgramCacheKey();fragment??=shader.fragmentShader;
   assert.equal(material.customProgramCacheKey(),key);assert.equal(shader.fragmentShader,fragment);
   const offset=((hull.split('').reduce((n,c)=>n+c.charCodeAt(0),0)%7)-3)*.018;
   assert.equal(shader.uniforms.ipOffset.value,Number(offset.toFixed(4)));
   for(const [uniform,value]of [['ipBase',scheme.base],['ipMain',scheme.main],['ipAccent',scheme.accent]])assert.equal(shader.uniforms[uniform].value.getHex(),value);
   assert.ok(shader.uniforms.ipFrame.value.isMatrix4);assert.equal(root.userData.livery,paint);
   material.dispose();mesh.geometry.dispose();texture.dispose();
  }
 }
});

test('traffic warmup retains voxel fallbacks and one paint representative per material layout',()=>{
 const r=Object.create(SpaceRenderer.prototype),root=new THREE.Group(),template=new THREE.Group(),map=new THREE.Texture();
 const material=new THREE.MeshStandardMaterial({map,normalMap:map});material.name='Hull plating';const geometry=new THREE.BoxGeometry();geometry.computeTangents();template.add(new THREE.Mesh(geometry,material));
 r.glbShipModels=new Map([['demon',template],['lancer',template]]);r.prepareTrafficWarmup(root);
 const owned=[];root.traverse(o=>{if(o.userData.borrowedWarmupTextures)owned.push(o);});const paint=owned.filter(o=>o.name==='traffic-paint-warmup');
 assert.equal(paint.length,6,'hull variants share three paints in authored-tangent and derivative forms');assert.ok(paint.some(m=>m.geometry.attributes.tangent)&&paint.some(m=>!m.geometry.attributes.tangent));assert.ok(root.getObjectByName('voxel-hull'));assert.ok(root.getObjectByName('voxel-glow'));assert.ok(root.getObjectByName('hull-rim'));
 const count=root.children.length;r.prepareTrafficWarmup(root);assert.equal(root.children.length,count,'repeat preparation is bounded');
 const hulls=owned.filter(m=>m.userData.borrowedWarmupGeometry);assert.equal(hulls.length,1);assert.equal(hulls[0].geometry,geometry,'the real hull uploads without duplicating its buffers');
 let released=0,mapReleased=0;geometry.addEventListener('dispose',()=>released++);map.addEventListener('dispose',()=>mapReleased++);
 for(const mesh of owned)assert.equal(mesh.material.map,map);
 r.combatWarmupRoot=root;r.disposeCombatWarmup();assert.equal(released,0,'warmup cannot dispose the actual hull');assert.equal(mapReleased,0);assert.equal(r.combatWarmupRoot,null);
 geometry.dispose();material.dispose();map.dispose();
});

test('later hull buffer preparation draws only new off-camera geometry and restores state on failure',()=>{
 const r=Object.create(SpaceRenderer.prototype),stage=new THREE.Group(),hull=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),other=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
 hull.userData.borrowedWarmupGeometry=true;stage.add(hull,other);r.scene=new THREE.Scene();r.scene.add(stage);r.camera=new THREE.PerspectiveCamera();r.stationWarmupTarget={};let target={name:'visible'};const previous=target;
 r.renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,shadowMap:{enabled:true},render(){assert.equal(hull.frustumCulled,false);assert.equal(other.frustumCulled,true);assert.equal(this.shadowMap.enabled,false);assert.equal(target,r.stationWarmupTarget);throw Error('lost context');}};
 assert.throws(()=>r.prepareTrafficBuffers(stage),/lost context/);assert.equal(target,previous);assert.equal(r.renderer.shadowMap.enabled,true);assert.equal(hull.frustumCulled,true);assert.equal(other.frustumCulled,true);
 hull.geometry.dispose();hull.material.dispose();other.geometry.dispose();other.material.dispose();
});

test('GPU preparation waits asynchronously for queued work and releases fences on completion, cancellation and timeout',async()=>{
 const {waitForRenderWork}=await import('../../src/game/renderWork.js');let waits=0,released=0,flushed=0;
 const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,fenceSync:()=>({}),flush:()=>flushed++,clientWaitSync:()=>++waits<2?4:3,deleteSync:()=>released++};
 assert.equal(await waitForRenderWork({getContext:()=>gl}),true);assert.equal(released,1);assert.equal(flushed,1);assert.equal(waits,2);
 gl.clientWaitSync=()=>4;assert.equal(await waitForRenderWork({getContext:()=>gl},{timeoutMs:0}),false);assert.equal(released,2);
 let cancelled=false;gl.clientWaitSync=()=>{cancelled=true;return 4;};assert.equal(await waitForRenderWork({getContext:()=>gl},{shouldCancel:()=>cancelled}),false);assert.equal(released,3);
 assert.equal(await waitForRenderWork({}),true,'render mocks/unsupported contexts retain the normal fallback');
});

test('resize and attach cannot accidentally draw a cold concourse or exterior before preparation finishes',async()=>{
 const {ConcourseShip}=await import('../../src/game/concourseShip.js'),v=Object.create(ConcourseShip.prototype);v.model={};
 v.dockPreparing={};assert.doesNotThrow(()=>v.render());v.dockPreparing=undefined;
 v.transitPreparing={skipped:false};assert.doesNotThrow(()=>v.render());
});

test('later NPC models keep their placeholder until material preparation completes',async t=>{
 const {readFile}=await import('node:fs/promises'),bytes=await readFile(new URL('../../assets/models/ships/talon.glb',import.meta.url));
 const names=['fetch','createImageBitmap'],previous=names.map(n=>Object.getOwnPropertyDescriptor(globalThis,n));
 t.after(()=>names.forEach((n,i)=>previous[i]?Object.defineProperty(globalThis,n,previous[i]):delete globalThis[n]));
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 globalThis.createImageBitmap=async()=>({width:1024,height:1024});
 const r=Object.create(SpaceRenderer.prototype);r.glbShipModels=new Map();r.glbShipLoading=new Map();let release,started;
 const preparing=new Promise(resolve=>started=resolve);
 r.prepareNewTrafficModel=async()=>{started();await new Promise(resolve=>release=resolve);};
 r.ensureGlbShipModel('talon');await preparing;
 assert.equal(r.glbShipModels.has('talon'),false,'unprepared detail is never published to the next live frame');
 release();await r.glbShipLoading.get('talon');assert.ok(r.glbShipModels.get('talon'));r.disposeObject(r.glbShipModels.get('talon'));
});

test('Wayfarer traffic prepares its three existing authored independent finishes',()=>{
 const r=Object.create(SpaceRenderer.prototype),root=new THREE.Group(),template=new THREE.Group(),map=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map});
 material.name='Hull plating';template.add(new THREE.Mesh(new THREE.BoxGeometry(),material));r.glbShipModels=new Map([['kestrel',template]]);r.prepareTrafficWarmup(root);
 const own=[];root.traverse(o=>{if(o.userData.borrowedWarmupTextures)own.push(o);});
 assert.equal(own.filter(o=>o.name==='traffic-wayfarer-warmup').length,3);
 for(const mesh of own){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}r.disposeObject(root);template.children[0].geometry.dispose();material.dispose();map.dispose();
});

test('career preparation waits for nearby wreck geometry without requesting it in arena/default warmup',async()=>{
 const r=Object.create(SpaceRenderer.prototype);let loads=0,release,compiled=0;
 Object.assign(r,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),ensureGraveyardModels:()=>{loads++;return new Promise(resolve=>release=resolve);},prepareCombatWarmup:()=>new THREE.Group(),isIOS:false,bloomEnabled:()=>true,bloomSceneTarget:{},renderer:{getRenderTarget:()=>null,setRenderTarget(){},compileAsync:async()=>{compiled++;}}});
 await r.prepareActiveScene();assert.equal(loads,0);compiled=0;
 const ready=r.prepareActiveScene({prepareNearbyWrecks:true});await Promise.resolve();assert.equal(loads,1);assert.equal(compiled,0);
 release();await ready;assert.equal(compiled,4);
});

test('completed departures avoid a hidden dock resize, but a refused launch can restore the dock',async t=>{
 const {ConcourseShip}=await import('../../src/game/concourseShip.js');
 const names=['document','requestAnimationFrame'],old=names.map(n=>Object.getOwnPropertyDescriptor(globalThis,n));t.after(()=>names.forEach((n,i)=>old[i]?Object.defineProperty(globalThis,n,old[i]):delete globalThis[n]));
 globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>1;
 const v=Object.create(ConcourseShip.prototype),origin={host:{isConnected:true},button:{}};let attaches=0,backdrops=0;
 Object.assign(v,{scene:new THREE.Scene(),pivot:new THREE.Group(),location:'helix',renderer:{shadowMap:{}},finish:{uniforms:{uExposure:{},uFade:{}}},resetPose(){},attach(){attaches++;},setBackdrop(){backdrops++;},budget:{reset(){}},transit:{origin,release(){}}});
 v.pendingBackdrop={isConnected:true};v.endAtmosphere({deferDock:true});assert.equal(attaches,0);assert.equal(backdrops,0);assert.ok(v.pendingDockAttach);
 v.resume();assert.equal(attaches,1);assert.equal(backdrops,1);assert.equal(v.pendingDockAttach,undefined);
 v.raf=0;v.transit={origin,release(){}};v.endAtmosphere();assert.equal(attaches,2,'cancelled arrivals/departures restore their original dock immediately');
});

test('leaving a dock cannot restart the dock renderer through launch cleanup',async()=>{
 const {GameUI}=await import('../../src/game/ui.js'),ui=Object.create(GameUI.prototype);let hidden=false,resumed=0;
 ui.root={querySelector:()=>({classList:{add:()=>hidden=true,remove(){}}})};
 ui.hideStory=ui.cancelPlanetTransit=ui.disposeShipPreviews=ui.resetOutfittingDrafts=()=>{};
 ui.cancelVesperLaunchTransition=()=>{if(!hidden)resumed++;};ui.concourseShip={pause(){}};
 ui.hideDock();assert.equal(resumed,0);assert.equal(hidden,true);assert.equal(ui.dockLocation,undefined);
});

test('cutscene canvas resize waits for prior GPU work and can be skipped before attaching',async()=>{
 const {ConcourseShip}=await import('../../src/game/concourseShip.js');
 for(const cancel of [false,true]){
  const v=Object.create(ConcourseShip.prototype);let ready=false,attached=0,animated=0,deleted=0;
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,WAIT_FAILED:4,
   fenceSync:()=>({}),flush(){},clientWaitSync:()=>ready?2:0,deleteSync:()=>deleted++};
  Object.assign(v,{host:{},modelBounds:new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),point:new THREE.Vector3(),pivot:new THREE.Group(),scene:new THREE.Scene(),target:{},finish:{uniforms:{uExposure:{value:1}}},renderer:{getContext:()=>gl,shadowMap:{},getRenderTarget:()=>null,setRenderTarget(){},compile(){},info:{programs:[]}},stationView:{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),configure(){}},stop(){},finishAnimation(){},endAtmosphere(){this.transit=undefined;},prepareStation:async()=>true,attach:()=>attached++,animate:async()=>{animated++;return true;}});
  const pending=v.playExterior({},'entry','helix',undefined,{},true);await Promise.resolve();await Promise.resolve();
  assert.equal(attached,0,'resizing is not allowed while the preceding frame is pending');
  if(cancel)v.skipAtmosphere();else ready=true;
  assert.equal(await pending,true);assert.equal(attached,cancel?0:1);assert.equal(animated,cancel?0:1);assert.ok(deleted>=1,'GPU fence is released');v.transitWarmupTarget?.dispose();
 }
});

test('completed arrival waits for its last GPU frame before restoring the dock canvas',async()=>{
 const {ConcourseShip}=await import('../../src/game/concourseShip.js'),v=Object.create(ConcourseShip.prototype);
 let ready=true,ended=false,animated=false;
 const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,WAIT_FAILED:4,fenceSync:()=>({}),flush(){},clientWaitSync:()=>ready?2:0,deleteSync(){}};
 Object.assign(v,{host:{},modelBounds:new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1)),point:new THREE.Vector3(),pivot:new THREE.Group(),scene:new THREE.Scene(),target:{},finish:{uniforms:{uExposure:{value:1}}},renderer:{getContext:()=>gl,shadowMap:{},getRenderTarget:()=>null,setRenderTarget(){},compile(){},info:{programs:[]}},stationView:{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),configure(){}},stop(){},finishAnimation(){},endAtmosphere(){if(this.transit)ended=true;this.transit=undefined;},prepareStation:async()=>true,attach(){},animate:async()=>{animated=true;ready=false;return true;}});
 const pending=v.playExterior({},'entry','helix',undefined,{},true);
 while(!animated)await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(ended,false);assert.ok(v.transitPreparing,'skip remains available while finishing the last frame');
 ready=true;assert.equal(await pending,true);assert.equal(ended,true);v.transitWarmupTarget.dispose();
});
