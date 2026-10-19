import * as THREE from 'three';
import {loadPreviewGlb,disposeObject} from './shipPreview.js';
import {GLB_SHIP_CONFIG,stationOccupantScale} from './render.js';
import {createConcourseFinish} from './concourseFinish.js';
import {FrameBudget} from './frameBudget.js';
import {PlanetTransit} from './planetTransit.js';
import {StationTransit} from './stationTransit.js';
import {ConcourseReflection} from './concourseReflection.js';
import {ConcourseDeck,concourseGroundFade} from './concourseDeck.js';
import {CONCOURSE_LAYOUTS} from './concourseLayouts.js';
import {pixelRenderSize} from './retroDisplay.js';

// One bounded renderer, reused between dock screens. Composite the painted
// plate with the owned hull, exhaust, shadow and floor reflection on one grid.
export const CONCOURSE_HULL_SCALE={atlas:1.48,mule:1.3,torsas:1.28,andromeda:1.17,astra:1.08,prospector:1.08,speedster:.9};
const staging=(id,options)=>Object.freeze({key:0xcbdcef,sky:0x809bb8,ground:0x263448,rim:0x82b4df,keyIntensity:2.4,fill:.75,rimIntensity:.45,environment:.7,exposure:1,shadow:.34,reflection:.06,elevation:5,position:[-2,8,-5],rimPosition:[4,3,5],...options,...CONCOURSE_LAYOUTS[id]});
// Match the light sources and floor finish painted into each individual plate.
export const CONCOURSE_STAGING=Object.freeze({
 helix:staging('helix',{key:0xc9ddf5,sky:0x536f91,ground:0x1e3654,rim:0xffc079,keyIntensity:2.5,rimIntensity:.6,rimPosition:[5,3,-5],position:[-1,9,-5],reflection:.11}),
 rook:staging('rook',{key:0xd7e6f2,sky:0x6d88a7,ground:0x25354c,rim:0x6ca9ec,fill:.7,environment:.6,position:[2,9,-3],rimIntensity:.6}),
 vesper:staging('vesper',{key:0xffebc7,sky:0xa2c9e6,ground:0x94643e,rim:0xa5d4ed,keyIntensity:3.5,fill:1.1,rimIntensity:.25,exposure:1.04,environment:.8,reflection:0,position:[-3,10,-7],elevation:5.3}),
 azure:staging('azure',{key:0xf4f6e8,sky:0x8cc9df,ground:0x658b96,rim:0xb4e3eb,keyIntensity:3.6,fill:1.3,rimIntensity:.25,exposure:1.06,environment:.85,reflection:.025,position:[-3,11,-7],elevation:5.4}),
 haven:staging('haven',{key:0xffe4bf,sky:0xb8c8cf,ground:0x626361,rim:0xc3d4e6,keyIntensity:2.6,fill:1,environment:.75,reflection:.025}),
 'league-yard':staging('league-yard',{key:0xdde3e7,sky:0x9aaabd,ground:0x4b5054,rim:0xffd49e,fill:.95,rimIntensity:.35,reflection:.02}),
 cinderfall:staging('cinderfall',{key:0xffb575,sky:0x647e97,ground:0x48372e,rim:0xff8e4f,keyIntensity:2.2,fill:.6,rimIntensity:1.05,position:[-2,7,4],reflection:.1}),
 cairn:staging('cairn',{key:0xffd19b,sky:0x7f9ebd,ground:0x65513e,rim:0x89bae2,keyIntensity:2.8,fill:.65,rimIntensity:.65,exposure:.98,environment:.85,reflection:.12,position:[-3,7,-5]}),
 'meridian-prime':staging('meridian-prime',{key:0xe6eef1,sky:0x94bcda,ground:0x58666f,rim:0x9ccbef,keyIntensity:2.8,fill:1.05,reflection:.045,position:[-2,9,-4]}),
 argent:staging('argent',{key:0xe4e7e9,sky:0x8daac1,ground:0x414b59,rim:0xffca83,keyIntensity:2.3,fill:.8,rimIntensity:.35,reflection:.08}),
 'gatehouse-twelve':staging('gatehouse-twelve',{key:0xbfd7eb,sky:0x6989aa,ground:0x29374a,rim:0x68acdf,fill:.7,rimIntensity:.55,reflection:.07,position:[-3,7,-5]}),
 blackglass:staging('blackglass',{key:0xb6d1e8,sky:0x3e5a7b,ground:0x293447,rim:0xffc288,keyIntensity:2,fill:.45,rimIntensity:.3,environment:.5,exposure:.98,reflection:.025,position:[-2,8,-5]}),
 cinder:staging('cinder',{key:0xffcf92,sky:0x6b88a4,ground:0x5c4935,rim:0x82b2d8,keyIntensity:2.35,fill:.6,reflection:.12,position:[-1,8,-5]}),
 torchwell:staging('torchwell',{key:0xffd29b,sky:0x8b8078,ground:0x443029,rim:0xbf9274,keyIntensity:2.1,fill:.55,rimIntensity:.25,environment:.55,reflection:.035,position:[-2,7,-5]}),
 nacre:staging('nacre',{key:0xe2edf3,sky:0x9db6ce,ground:0x526276,rim:0xa4cbe2,keyIntensity:2.2,fill:1,rimIntensity:.25,environment:.8,reflection:.05}),
 boreal:staging('boreal',{key:0xa8c9ed,sky:0x426b9b,ground:0x213b62,rim:0x68acff,keyIntensity:2.4,fill:.7,rimIntensity:.7,environment:.85,reflection:.09,position:[-2,8,-5]}),
 shepherd:staging('shepherd',{key:0x9cbddd,sky:0x3d5479,ground:0x1b2b45,rim:0x6b91bf,keyIntensity:1.9,fill:.48,rimIntensity:.55,environment:.55,exposure:.98,reflection:.04}),
});
export const concourseLighting=id=>CONCOURSE_STAGING[id]??CONCOURSE_STAGING.helix;
const smooth=t=>t*t*(3-2*t);
export function concoursePose(phase,t,time=0,path){
 t=THREE.MathUtils.clamp(t,0,1);
 if(phase==='landing'){
  const settle=smooth(Math.min(1,t/.82)),end=1-settle;
  const entry=path?.entry??{x:-5,y:3,z:2.5};
  return {x:entry.x*end,y:.14+entry.y*end+Math.sin(t*Math.PI*3)*.08*(1-t),z:entry.z*end,yaw:-.55*end,pitch:.12*end,roll:-.13*end,scale:1,thrust:.15+end*.65};
 }
 if(phase==='takeoff'){
  const lift=smooth(Math.min(1,t/.4)),go=smooth(Math.max(0,(t-.25)/.75));
  const exit=path?.exit??{x:-1.8,y:3,z:-15};
  return {x:exit.x*go,y:.14+1.2*lift+exit.y*go,z:exit.z*go,yaw:.55*lift,pitch:-.18*go,roll:-.12*Math.sin(t*Math.PI),scale:1,thrust:.4+lift*.9};
 }
 return {x:0,y:.14+Math.sin(time*1.1)*.025,z:0,yaw:0,pitch:Math.sin(time*.7)*.004,roll:Math.sin(time*.9)*.006,scale:1,thrust:.08};
}
// Preserve the virtual stage's framing while expanding the visible frustum to
// the whole painted plate. Moving ships can then cross the actual screen edge.
export function frameConcourseCamera(camera,width,height,x,y,fullWidth,fullHeight,out){
 out.copy(camera);const sx=(camera.right-camera.left)/camera.zoom,sy=(camera.top-camera.bottom)/camera.zoom;
 out.left=(camera.left+camera.right-sx)/2-x/width*sx;out.right=out.left+fullWidth/width*sx;
 out.top=(camera.top+camera.bottom+sy)/2+y/height*sy;out.bottom=out.top-fullHeight/height*sy;
 out.zoom=1;out.updateProjectionMatrix();out.updateMatrixWorld();return out;
}
// Collapsed UVs can produce a zero/undefined tangent-space normal at a few
// pixels. Keep the geometric normal there instead of contaminating HDR and
// magnifying those pixels through the floor reflection filter.
const SAFE_NORMAL_MAPS=THREE.ShaderChunk.normal_fragment_maps.replace('normal = normalize( tbn * mapN );',`vec3 mappedNormal=tbn*mapN;
 float mappedLength=dot(mappedNormal,mappedNormal);
 normal=mappedLength>1e-8&&mappedLength<1e8?mappedNormal*inversesqrt(mappedLength):normal;`);
export function stabilizeConcourseNormals(material){
 if(!material.normalMap||material.userData.concourseNormals)return;
 material.userData.concourseNormals=true;
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',SAFE_NORMAL_MAPS);};
 material.customProgramCacheKey=()=>key+'-concourse-normal-v1';
}
export class ConcourseShip {
 constructor(){
  this.touchDevice=matchMedia('(pointer:coarse)').matches;
  this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');this.reducedMotion=this.motionQuery.matches;
  this.onMotion=()=>{this.reducedMotion=this.motionQuery.matches;if(!this.paused)this.resume();};this.motionQuery.addEventListener('change',this.onMotion);
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,stencil:false,powerPreference:'low-power'});
  this.renderer.setPixelRatio(1);this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;
  this.canvas=this.renderer.domElement;this.canvas.className='concourse-ship-canvas';this.canvas.setAttribute('aria-hidden','true');
  this.scene=new THREE.Scene();this.pivot=new THREE.Group();this.scene.add(this.pivot);
  this.camera=new THREE.OrthographicCamera(-6,6,4.5,-4.5,.1,80);this.camera.position.set(7,5,-9);this.camera.lookAt(0,0,0);this.renderCamera=new THREE.OrthographicCamera();
  this.hemi=new THREE.HemisphereLight(0xb6ceef,0x263443,2);this.scene.add(this.hemi);
  this.sun=new THREE.DirectionalLight(0xe6efff,3.1);this.sun.position.set(-3.5,7,-4.5);this.sun.castShadow=true;
  Object.assign(this.sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:25});this.sun.shadow.mapSize.set(512,512);this.sun.shadow.bias=-.0008;this.sun.shadow.normalBias=.025;this.sun.shadow.radius=3;
  this.scene.add(this.sun,this.sun.target);
  this.rim=new THREE.DirectionalLight(0x65bbff,1.2);this.rim.position.set(4,2,4);this.scene.add(this.rim);
  this.ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({color:0x08101b,opacity:.45}));this.ground.rotation.x=-Math.PI/2;this.ground.receiveShadow=true;this.scene.add(this.ground);
  this.finish=createConcourseFinish();this.deck=new ConcourseDeck(this.finish.uniforms.uBackdropUV);this.deck.clipShadow(this.ground.material);
  this.reflection=new ConcourseReflection(this.deck.uniforms);this.scene.add(this.reflection.plane);
  this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false,type:THREE.HalfFloatType});
  this.finish.uniforms.tScene.value=this.target.texture;
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.finish);this.quadCamera=new THREE.Camera();
  this.sceneViewport=new THREE.Vector4();this.budget=new FrameBudget();this.bounds=new THREE.Box3();this.point=new THREE.Vector3();this.phase='idle';this.elapsed=0;this.glows=[];this.generation=0;this.paused=true;
  this.resizeObserver=new ResizeObserver(()=>this.resize());
  // Mobile WebKit can report the old fixed-position box during rotation's
  // first observer delivery. Recheck after the visual viewport has settled.
  this.onViewportResize=()=>{if(this.resizeFrame)cancelAnimationFrame(this.resizeFrame);this.resizeFrame=requestAnimationFrame(()=>{this.resizeFrame=requestAnimationFrame(()=>{this.resizeFrame=0;this.resize();if(this.transit&&window.innerHeight>window.innerWidth)this.stop();else if(!this.paused)this.resume();});});};
  window.addEventListener('resize',this.onViewportResize);window.visualViewport?.addEventListener('resize',this.onViewportResize);
  this.onVisibility=()=>{if(document.hidden)this.stop();else if(!this.paused&&this.host?.isConnected)this.resume();};document.addEventListener('visibilitychange',this.onVisibility);
  this.onLost=e=>{e.preventDefault();this.contextLost=true;this.stop();this.finishAnimation(false);this.endAtmosphere();this.host?.classList.remove('has-model');this.outputHost?.classList.remove('has-concourse-composite');};
  this.onRestored=()=>{this.contextLost=false;this.host?.classList.toggle('has-model',!!this.model);this.renderer.shadowMap.needsUpdate=true;this.resize();if(!this.paused)this.resume();};
  this.canvas.addEventListener('webglcontextlost',this.onLost);this.canvas.addEventListener('webglcontextrestored',this.onRestored);
 }
 attach(host,button){
  if(this.host!==host){if(this.host)this.resizeObserver.unobserve(this.host);this.host=host;this.resizeObserver.observe(host);}
  this.outputHost=this.transit?host:host.closest('#dock-screen')?.querySelector('.dock-backdrop')??host;
  this.outputHost.append(this.canvas);this.canvas.classList.toggle('is-concourse-composite',this.outputHost!==host);
  this.button=button;host.classList.toggle('has-model',!!this.model);this.resize();
 }
 async configure(shipId,variant,options,location){
  this.setLocation(location);if(this.profile&&location&& !['vesper','azure','meridian-prime','boreal'].includes(location))void this.prepareStation(location).catch(()=>{});const key=JSON.stringify([shipId,options.paint,options.fit,options.fleet]);
  if(this.key===key)return this.ready;
  this.key=key;const generation=++this.generation;this.host?.classList.remove('has-model');
  this.ready=(async()=>{
   const model=await loadPreviewGlb(variant,options);
   if(this.disposed||generation!==this.generation){if(model)disposeObject(model);return false;}
   if(!model)return false;
   this.pivot.clear();for(const glow of this.glows)glow.material.dispose();if(this.model)disposeObject(this.model);this.model=model;
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const scale=4*(CONCOURSE_HULL_SCALE[shipId]??1)/Math.max(size.x,size.y,size.z);
   const assembly=new THREE.Group();assembly.add(model);model.position.sub(center);assembly.scale.setScalar(scale);assembly.position.y=size.y*scale*.5;
   this.modelBounds=new THREE.Box3().setFromObject(assembly);this.glows=[];
   model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
     if(m.roughness!==undefined)m.roughness=Math.max(.4,m.roughness);stabilizeConcourseNormals(m);
     for(const value of Object.values(m))if(value?.isTexture){value.magFilter=THREE.NearestFilter;value.minFilter=THREE.LinearMipmapLinearFilter;value.anisotropy=2;}
    }});
   // Exhaust belongs to the authored engine sockets, so it rotates with the hull.
   const hull=model.children[0],config=GLB_SHIP_CONFIG[variant];
   this.exhaustTexture??=this.makeGlow();
   const rear=new THREE.Vector3(-Math.sin(config?.yaw??0)*.035,0,Math.cos(config?.yaw??0)*.035);
   for(const port of config?.enginePorts??[]){const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.exhaustTexture,color:0x6bcbff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.fromArray(port).add(rear);glow.scale.setScalar(.13);hull.add(glow);this.glows.push(glow);}
   // Include socket glows in screen fitting, but use the solid hull alone
   // for deck clearance so the approved resting height stays unchanged.
   this.framingBounds=new THREE.Box3().setFromObject(assembly);this.setLayout(this.profile);this.pivot.add(assembly);
   this.loadedShipId=shipId;this.loadedVariant=variant;this.host?.classList.add('has-model');this.renderer.shadowMap.needsUpdate=true;this.reflection.dirty=true;this.resetPose();this.resize();if(!this.paused)this.resume();return true;
  })();return this.ready;
 }
 makeGlow(){const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'white');g.addColorStop(.15,'#c0f6ff');g.addColorStop(.4,'#408bdc');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);const t=new THREE.CanvasTexture(c);t.userData.shared=true;return t;}
 setLocation(id){
  if(this.location===id)return;this.location=id;this.backdropKey=undefined;this.finish.uniforms.uHasBackdrop.value=0;this.outputHost?.classList.remove('has-concourse-composite');this.profile=concourseLighting(id);this.deck.setLocation(id);const l=this.profile;
  this.hemi.color.setHex(l.sky);this.hemi.groundColor.setHex(l.ground);this.hemi.intensity=l.fill*1.2;this.sun.color.setHex(l.key);this.sun.position.fromArray(l.position);this.sun.intensity=l.keyIntensity;this.rim.color.setHex(l.rim);this.rim.position.fromArray(l.rimPosition);this.rim.intensity=l.rimIntensity;this.ground.material.opacity=l.shadow;this.finish.uniforms.uExposure.value=l.exposure;
  this.scene.environmentIntensity=l.environment*2.5;this.camera.position.set(7,l.elevation,-9);this.camera.lookAt(0,0,0);this.reflection.configure(l.reflection);this.setLayout(l);if(this.model&&!this.transit)this.resetPose();
  // Small reflected sky/deck gradient gives metallic hulls their local colour.
  this.environmentCanvas??=document.createElement('canvas');const c=this.environmentCanvas;c.width=64;c.height=32;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,32);
  g.addColorStop(0,new THREE.Color(l.sky).getStyle());g.addColorStop(.45,new THREE.Color(l.key).multiplyScalar(.65).getStyle());g.addColorStop(1,new THREE.Color(l.ground).getStyle());ctx.fillStyle=g;ctx.fillRect(0,0,64,32);
  // Three caches PMREM for image textures by identity. Dispose the old map
  // when changing ports, or the reflected light would stay at the previous dock.
  this.replaceEnvironment(c);
  this.renderer.shadowMap.needsUpdate=true;
 }
 replaceEnvironment(canvas){this.scene.environment?.dispose();const t=new THREE.CanvasTexture(canvas);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;this.scene.environment=t;this.reflection.dirty=true;}
 setBackdrop(image){
  if(!image?.complete||!image.naturalWidth)return;
  if(this.transit){this.pendingBackdrop=image;return;}
  const key=this.location+':'+(image.currentSrc||image.src);if(this.backdropKey===key)return;
  const c=document.createElement('canvas');c.width=128;c.height=64;const ctx=c.getContext('2d');
  ctx.drawImage(this.environmentCanvas,0,0,128,64);ctx.globalAlpha=.78;ctx.filter='blur(2px)';
  // Reflect the actual walls/sky above and the actual deck below. Mirror the
  // rear hemisphere to avoid an artificial panorama seam on curved metal.
  ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,64,64);
  ctx.save();ctx.translate(128,0);ctx.scale(-1,1);ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,64,64);ctx.restore();
  this.backdropKey=key;this.replaceEnvironment(c);this.backdropTexture?.dispose();
  this.backdropTexture=new THREE.Texture(image);this.backdropTexture.magFilter=THREE.NearestFilter;this.backdropTexture.minFilter=THREE.NearestFilter;this.backdropTexture.generateMipmaps=false;this.backdropTexture.needsUpdate=true;
  this.finish.uniforms.tBackdrop.value=this.backdropTexture;this.finish.uniforms.uHasBackdrop.value=1;if(!this.transit)this.render();
 }
 resize(){
  if(!this.host?.isConnected||this.disposed||!this.host.clientWidth||!this.host.clientHeight||(this.transit&&window.innerHeight>window.innerWidth))return;
  const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight),r=this.host.getBoundingClientRect(),parent=this.host.parentElement.getBoundingClientRect();
  const composite=!this.transit&&this.outputHost!==this.host,output=composite?this.outputHost.getBoundingClientRect():r;
  const maxWidth=this.transit?(this.touchDevice?640:768):(this.touchDevice?768:960),maxHeight=this.transit?480:(this.touchDevice?432:600);
  const desiredWidth=Math.min(maxWidth,output.width*maxHeight/output.height);
  const {width:w,height:h,scale}=pixelRenderSize(output.width,output.height,desiredWidth);
  this.canvas.style.width=`${w*scale}px`;this.canvas.style.height=`${h*scale}px`;this.canvas.dataset.pixelScale=String(scale);
  if(this.canvas.width!==w||this.canvas.height!==h){this.renderer.setSize(w,h,false);this.target.setSize(w,h);}
  this.sceneViewport.set(0,0,w,h);this.deck.uniforms.uDeckResolution.value.set(w,h);
  const aspect=width/height;if(this.transit)this.transit.resize(aspect);else{this.camera.left=-4.5*aspect;this.camera.right=4.5*aspect;this.camera.zoom=this.placementZoom??1;this.camera.updateProjectionMatrix();}
  this.originX=r.left-parent.left;this.originY=r.top-parent.top;this.cssWidth=width;this.cssHeight=height;this.clipWidth=parent.width;this.clipHeight=parent.height;
  if(!this.transit&&this.restBounds&&this.placementZoom===undefined){
   // Larger ships keep their hull scale, but never lose a nose/engine to the
   // viewport edge when a painted landing pad sits near a phone's bezel.
   this.camera.updateMatrixWorld();let fit=1;const cx=this.originX+width*.5,cy=this.originY+height*.5;
   for(let i=0;i<8;i++){
    const b=this.restBounds;this.point.set(i&1?b.max.x:b.min.x,(i&2?b.max.y:b.min.y)+.2,i&4?b.max.z:b.min.z).project(this.camera);
    const dx=this.point.x*width*.5,dy=-this.point.y*height*.5;
    if(dx>0)fit=Math.min(fit,(parent.width-cx-14)/dx);else if(dx<0)fit=Math.min(fit,(cx-14)/-dx);
    if(dy>0)fit=Math.min(fit,(parent.height-cy-14)/dy);else if(dy<0)fit=Math.min(fit,(cy-14)/-dy);
   }
   this.camera.zoom=THREE.MathUtils.clamp(fit,.2,1);this.camera.updateProjectionMatrix();this.reflection.dirty=true;
  }
  if(!this.transit){frameConcourseCamera(this.camera,width,height,r.left-output.left,r.top-output.top,output.width,output.height,this.renderCamera);this.reflection.dirty=true;this.refreshFlightPath();}
  if(this.model)this.render();
 }
 refreshFlightPath(){
  if(!this.framingBounds||!this.renderCamera)return;
  const camera=this.renderCamera;
  this.flightPath??={entry:new THREE.Vector3(),exit:new THREE.Vector3()};
  this.motionRight??=new THREE.Vector3();this.motionUp??=new THREE.Vector3();this.motionDirection??=new THREE.Vector3();this.motionForward??=new THREE.Vector3();
  this.motionBounds??=new THREE.Box3();this.motionMatrix??=new THREE.Matrix4();this.motionEuler??=new THREE.Euler();this.motionQuaternion??=new THREE.Quaternion();this.motionOffset??=new THREE.Vector3();this.motionUnit??=new THREE.Vector3(1,1,1);
  this.motionRight.setFromMatrixColumn(camera.matrixWorld,0);this.motionUp.setFromMatrixColumn(camera.matrixWorld,1);
  for(const phase of ['landing','takeoff']){
   const p=concoursePose(phase,phase==='landing'?0:1),r=this.dockRotation,sign=phase==='landing'?-1:1;
   this.motionForward.set(-Math.sin(r.y+p.yaw),0,-Math.cos(r.y+p.yaw));
   let dx=this.motionForward.dot(this.motionRight)*sign;if(Math.abs(dx)<.25)dx=dx<0?-.25:.25;
   const dy=Math.max(.3,this.motionForward.dot(this.motionUp)*sign+.25);
   this.motionDirection.copy(this.motionRight).multiplyScalar(dx).addScaledVector(this.motionUp,dy).normalize();
   this.motionEuler.set(r.x+p.pitch,r.y+p.yaw,r.z+p.roll);this.motionQuaternion.setFromEuler(this.motionEuler);
   this.motionMatrix.compose(this.motionOffset.set(0,.14+this.deckLift+(phase==='takeoff'?1.2:0),0),this.motionQuaternion,this.motionUnit);
   this.motionBounds.copy(this.framingBounds).applyMatrix4(this.motionMatrix);
   let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
   for(let i=0;i<8;i++){const b=this.motionBounds;this.point.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).project(camera);x0=Math.min(x0,this.point.x);x1=Math.max(x1,this.point.x);y0=Math.min(y0,this.point.y);y1=Math.max(y1,this.point.y);}
   this.point.set(0,0,0).project(camera);const ox=this.point.x,oy=this.point.y;this.point.copy(this.motionDirection).project(camera);
   const vx=this.point.x-ox,vy=this.point.y-oy,margin=.12;
   const tx=Math.abs(vx)<1e-8?Infinity:(vx>0?1+margin-x0:-1-margin-x1)/vx;
   const ty=Math.abs(vy)<1e-8?Infinity:(vy>0?1+margin-y0:-1-margin-y1)/vy;
   const distance=Math.max(.5,Math.min(tx,ty));this.motionOffset.copy(this.motionDirection).multiplyScalar(distance);
   const dest=this.flightPath[phase==='landing'?'entry':'exit'],v=this.motionOffset;
   dest.set(v.x*this.dockCos-v.z*this.dockSin,v.y,v.x*this.dockSin+v.z*this.dockCos);
  }
 }
 setBackdropFraming(x,y,w,h){this.finish.uniforms.uBackdropUV.value.set(x,y,w,h);}
 setLayout(layout){
  const r=layout.rotationDeg;this.dockRotation??=new THREE.Euler();this.dockRotation.set(r.pitch*Math.PI/180,r.yaw*Math.PI/180,r.roll*Math.PI/180);
  this.dockSin=Math.sin(this.dockRotation.y);this.dockCos=Math.cos(this.dockRotation.y);this.deckLift=0;
  if(this.modelBounds){
   this.layoutMatrix??=new THREE.Matrix4();this.layoutMatrix.makeRotationFromEuler(this.dockRotation);
   this.restBounds??=new THREE.Box3();this.restBounds.copy(this.modelBounds).applyMatrix4(this.layoutMatrix);
   this.deckLift=Math.max(0,-this.restBounds.min.y);
   this.restBounds.copy(this.framingBounds??this.modelBounds).applyMatrix4(this.layoutMatrix);this.restBounds.min.y+=this.deckLift;this.restBounds.max.y+=this.deckLift;
  }
 }
 resetPose(){this.applyPose(concoursePose('idle',0));}
 applyPose(p){
  if(this.transit){this.pivot.position.set(p.x,p.y,p.z);this.pivot.rotation.set(p.pitch,p.yaw,p.roll);}
  else{const r=this.dockRotation;this.pivot.position.set(p.x*this.dockCos+p.z*this.dockSin,p.y+this.deckLift*p.scale,p.z*this.dockCos-p.x*this.dockSin);this.pivot.rotation.set(p.pitch+r.x,p.yaw+r.y,p.roll+r.z);}
  this.pivot.scale.setScalar(p.scale);this.deckClearance=p.y;
  for(const glow of this.glows){glow.material.opacity=p.thrust*.75;glow.scale.setScalar(.1+p.thrust*.18);}}
 render(){
  if(this.disposed||this.contextLost||!this.model)return;
  const view=this.transit??this;
  const waiting=!this.transit&&this.waitingArrival;
  if(!this.transit&&!waiting){
   const fade=concourseGroundFade(this.deckClearance??.14);
   this.ground.material.opacity=this.profile.shadow*fade;
   // Wider, lighter penumbra at height; no detached floor effects in flight.
   this.sun.shadow.intensity=fade>.005?1:0;
   this.sun.shadow.radius=2+Math.max(0,(this.deckClearance??.14)-.14)*5;
   this.reflection.setHeight(fade);
   // Reflections must not consume a shadow refresh intended for the main view.
   this.renderer.shadowMap.needsUpdate=false;
   this.reflection.update(this,performance.now());
   this.renderer.shadowMap.needsUpdate=fade>.005&&this.ground.visible&&this.pivot.visible&&this.model.visible;
  }
  this.finish.uniforms.uConcourse.value=this.transit?0:1;
  // Keep scenery visible during model preparation, without flashing a settled
  // hull before its arrival starts. Atmosphere shots keep their separate poses.
  const pivotVisible=this.pivot.visible,groundVisible=this.ground.visible,reflectionVisible=this.reflection.plane.visible;
  if(waiting){this.pivot.visible=false;this.ground.visible=false;this.reflection.plane.visible=false;}
  else if(!this.transit&&this.ground.material.opacity<=.001)this.ground.visible=false;
  this.target.viewport.copy(this.sceneViewport);this.renderer.setRenderTarget(this.target);
  try{this.renderer.render(view.scene,this.transit?view.camera:this.renderCamera);}
  finally{this.pivot.visible=pivotVisible;this.ground.visible=groundVisible;this.reflection.plane.visible=reflectionVisible;}
  this.renderer.setRenderTarget(null);this.renderer.setViewport(0,0,this.canvas.width,this.canvas.height);this.renderer.render(this.quad,this.quadCamera);
  if(!this.transit&&this.outputHost!==this.host)this.outputHost.classList.toggle('has-concourse-composite',this.finish.uniforms.uHasBackdrop.value>0);this.renderCount=(this.renderCount??0)+1;
  if(!this.transit&&this.button&&this.phase!=='takeoff'){
   this.bounds.setFromObject(this.pivot);this.camera.updateMatrixWorld();let x0=1,y0=1,x1=-1,y1=-1;
   for(let i=0;i<8;i++){this.point.set(i&1?this.bounds.max.x:this.bounds.min.x,i&2?this.bounds.max.y:this.bounds.min.y,i&4?this.bounds.max.z:this.bounds.min.z).project(this.camera);x0=Math.min(x0,this.point.x);x1=Math.max(x1,this.point.x);y0=Math.min(y0,this.point.y);y1=Math.max(y1,this.point.y);}
   const rawLeft=this.originX+(x0*.5+.5)*this.cssWidth,rawTop=this.originY+(-y1*.5+.5)*this.cssHeight;
   // Authored placements can put empty corners of the projected 3D box beyond
   // the scene. Keep the launch hit area inside the usable screen without
   // changing the approved hull position or scale.
   const left=Math.max(0,Math.min(rawLeft,this.clipWidth-44)),top=Math.max(0,Math.min(rawTop,this.clipHeight-44));
   const width=Math.min(this.clipWidth-left,Math.max(44,this.originX+(x1*.5+.5)*this.cssWidth-left));
   const height=Math.min(this.clipHeight-top,Math.max(44,this.originY+(-y0*.5+.5)*this.cssHeight-top));
   Object.assign(this.button.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
  }
 }
 prepareStation(location){this.stationView??=new StationTransit(stabilizeConcourseNormals,stationOccupantScale);return this.stationView.prepare(location);}
 async playAtmosphere(host,direction,location,canStart,surface){return this.playExterior(host,direction,location,canStart,surface,false);}
 async playStation(host,direction,location,canStart,data){return this.playExterior(host,direction,location,canStart,data,true);}
 async playExterior(host,direction,location,canStart,data,station){
  this.stop();this.finishAnimation(false);this.endAtmosphere();
  const origin={host:this.host,button:this.button},generation=this.transitGeneration=(this.transitGeneration??0)+1;
  let shot;
  if(station){
   if(!await this.prepareStation(location)||this.disposed||this.contextLost||this.transitGeneration!==generation)return false;
   shot=this.stationView;
   const size=this.modelBounds.getSize(this.point);
   shot.configure(this.pivot,this.scene.environment,location,direction,{...data,hullLength:Math.max(size.x,size.y,size.z),hullHeight:size.y},this.profile);
  }else{
   shot=this.atmosphereView??=new PlanetTransit(this.pivot,this.scene.environment,location,direction,data);
   shot.configure(this.pivot,this.scene.environment,location,direction,data);
  }
  shot.origin=origin;this.transit=shot;
  this.renderer.shadowMap.enabled=false;this.finish.uniforms.uExposure.value=1.1;this.attach(host,null);
  try{return await this.animate(direction,canStart);}
  finally{if(this.transit===shot&&this.transitGeneration===generation){this.stop();this.endAtmosphere();}}
 }
 endAtmosphere(){
  const shot=this.transit;if(!shot)return;this.transit=undefined;this.transitGeneration++;
  this.scene.add(this.pivot);shot.release();this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.needsUpdate=true;
  this.finish.uniforms.uExposure.value=concourseLighting(this.location).exposure;this.finish.uniforms.uFade.value=1;
  this.resetPose();
  if(!this.disposed&&shot.origin.host?.isConnected)this.attach(shot.origin.host,shot.origin.button);
  const pending=this.pendingBackdrop;this.pendingBackdrop=undefined;if(pending?.isConnected&&!this.disposed)this.setBackdrop(pending);
 }
 skipAtmosphere(){if(this.transit){this.stop();this.finishAnimation(true);}}
 animate(phase,canStart){this.finishAnimation(false);this.phase=phase;this.phaseStart=undefined;this.elapsed=0;this.canStart=canStart;if(!this.transit){this.waitingArrival=false;this.reflection.dirty=true;this.renderer.shadowMap.needsUpdate=true;}const pose=this.transit?this.transit.update(0):concoursePose(phase,0,0,this.flightPath);this.applyPose(pose);this.finish.uniforms.uFade.value=pose.fade??1;this.render();this.resume();return new Promise(resolve=>{this.animationResolve=resolve;});}
 finishAnimation(result){this.stopAnimationSound();const resolve=this.animationResolve;this.animationResolve=undefined;if(resolve)resolve(result);this.phase='idle';this.phaseStart=undefined;}
 resume(){this.paused=false;if(this.disposed||this.contextLost||document.hidden||this.raf)return;this.budget.reset();this.raf=requestAnimationFrame(this.tick);}
 stopAnimationSound(){if(this.soundActive){this.onAnimationSound?.('stop');this.soundActive=false;}}
 stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;this.stopAnimationSound();}
 pause(){this.paused=true;this.transitGeneration=(this.transitGeneration??0)+1;this.stop();this.finishAnimation(false);this.endAtmosphere();}
 tick=now=>{
  this.raf=0;if(this.paused||this.disposed||!this.host?.isConnected||document.hidden||this.contextLost||!this.model||!this.host.classList.contains('has-model')||(this.transit&&window.innerHeight>window.innerWidth)){this.stopAnimationSound();return;}
  const fps=this.phase==='idle'?(this.touchDevice?20:24):30;
  const dt=this.budget.take(now,fps);if(dt!==null){
   if(this.phaseStart===undefined&&(!this.canStart||this.canStart()))this.phaseStart=now;
   if(this.phaseStart!==undefined)this.elapsed+=dt*1000;
   const duration=this.transit?.duration??(this.phase==='takeoff'?1650:1450),t=this.reducedMotion?1:Math.min(1,this.elapsed/duration);
   const pose=this.transit?this.transit.update(t):concoursePose(this.phase,t,this.reducedMotion?0:now/1000,this.flightPath);this.applyPose(pose);this.finish.uniforms.uFade.value=pose.fade??1;
   if(this.phase!=='idle'&&this.phaseStart!==undefined&&t<1){
    const kind=this.transit?(this.transit===this.stationView?'station':'planet'):(this.soundEnvironment==='planet'?'planet-pad':'station-pad');
    this.point.copy(this.pivot.position).project(this.transit?.camera??this.renderCamera);
    if(!this.soundActive){this.soundActive=true;this.onAnimationSound?.('start',this.phase,kind,t,this.point.x*.65);}
    this.onAnimationSound?.('update',this.phase,kind,t,this.point.x*.65);
   }
   this.render();if(this.phase!=='idle'&&t>=1){const departed=this.phase==='takeoff'||!!this.transit;this.finishAnimation(true);if(departed)return;}
   if(this.reducedMotion&&this.phase==='idle')return;
  }this.raf=requestAnimationFrame(this.tick);
 };
 dispose(){if(this.disposed)return;this.disposed=true;this.pause();this.outputHost?.classList.remove('has-concourse-composite');this.generation++;this.resizeObserver.disconnect();if(this.resizeFrame)cancelAnimationFrame(this.resizeFrame);window.removeEventListener('resize',this.onViewportResize);window.visualViewport?.removeEventListener('resize',this.onViewportResize);document.removeEventListener('visibilitychange',this.onVisibility);this.motionQuery.removeEventListener('change',this.onMotion);this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
  this.atmosphereView?.dispose();this.stationView?.dispose();this.reflection.dispose();for(const glow of this.glows)glow.material.dispose();if(this.model)disposeObject(this.model);this.ground.geometry.dispose();this.ground.material.dispose();this.sun.shadow.map?.dispose();this.scene.environment?.dispose();this.exhaustTexture?.dispose();this.backdropTexture?.dispose();this.target.dispose();this.finish.dispose();this.quad.geometry.dispose();this.renderer.dispose();this.canvas.remove();
 }
}
