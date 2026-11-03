// Review-only shaders. The live game and its materials are not changed.
import * as THREE from 'three';

const lightStrength={value:0},lightSteps={value:5},lightContrast={value:1};
const seenMaterials=new WeakSet(),seenResolve=new WeakSet(),seenConcourse=new WeakSet();
const choices={
 current:{ink:0,crease:0,light:0,steps:5,contrast:1,width:1},
 outline:{ink:.32,crease:.05,light:0,steps:5,contrast:1,width:1},
 illustrated:{ink:.43,crease:.12,light:.58,steps:5,contrast:1.08,width:1},
 comic:{ink:.68,crease:.24,light:.9,steps:3,contrast:1.3,width:1.5},
};
// In a build with the approved finish, "current" is already illustrated.
// Replace its fixed settings below when comparing alternatives; never stack
// a second copy of the finish over the live one.
let current=choices.current;

function installLight(material){
 if(!material||seenMaterials.has(material)||!(material.isMeshStandardMaterial||material.isMeshPhongMaterial||material.isMeshLambertMaterial))return;
 seenMaterials.add(material);
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  shader.uniforms.uReviewLightStrength=lightStrength;shader.uniforms.uReviewLightSteps=lightSteps;shader.uniforms.uReviewLightContrast=lightContrast;
  const patch=chunk=>THREE.ShaderChunk[chunk].replace(/\n float illustratedBand=dotNL\*5\.0;[\s\S]*?dotNL=mix\(dotNL,illustratedStep,\.58\);/,'').replace(
   'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
   `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
    float rawBand=dotNL*uReviewLightSteps;
    float stepped=(floor(rawBand)+smoothstep(.30,.70,fract(rawBand)))/uReviewLightSteps;
    stepped=clamp((stepped-.5)*uReviewLightContrast+.5,0.,1.);
    dotNL=mix(dotNL,stepped,uReviewLightStrength);`);
  shader.fragmentShader='uniform float uReviewLightStrength,uReviewLightSteps,uReviewLightContrast;\n'+shader.fragmentShader;
  for(const chunk of ['lights_physical_pars_fragment','lights_lambert_pars_fragment','lights_phong_pars_fragment'])
   shader.fragmentShader=shader.fragmentShader.replace(`#include <${chunk}>`,patch(chunk));
 };
 material.customProgramCacheKey=()=>key+'-review-illustrated-light-v1';
 material.needsUpdate=true;
}

function patchScene(scene){
 scene.traverse(object=>{
  if(!object.isMesh&&!object.isInstancedMesh)return;
  for(const material of Array.isArray(object.material)?object.material:[object.material])installLight(material);
 });
}

const inkCode=`
uniform float uReviewInk,uReviewCrease,uReviewInkWidth;
float reviewInk(){
 float z=texture2D(tDepth,vUv).r;
 if(z>=.9999999)return 0.;
 float c=viewDistance(z);
 vec2 t=uReviewInkWidth/uResolution;
 float l=viewDistance(texture2D(tDepth,vUv-vec2(t.x,0.)).r);
 float r=viewDistance(texture2D(tDepth,vUv+vec2(t.x,0.)).r);
 float a=viewDistance(texture2D(tDepth,vUv-vec2(0.,t.y)).r);
 float b=viewDistance(texture2D(tDepth,vUv+vec2(0.,t.y)).r);
 // Mark the foreground side of a depth discontinuity, suppress distant
 // hairlines, and avoid deriving edges from painted texture noise.
 float depthScale=max(c,1.);
 float outer=max(max(l-c,r-c),max(a-c,b-c))/depthScale;
 float edge=smoothstep(.035,.17,outer);
 float bend=max(abs(l+r-2.*c),abs(a+b-2.*c))/depthScale;
 float crease=smoothstep(.025,.12,bend)*uReviewCrease;
 float fade=1.-.88*smoothstep(2400.,12000.,c);
 return max(edge,crease)*fade;
}`;

function patchResolve(material){
 if(!material||seenResolve.has(material))return;
 seenResolve.add(material);
 Object.assign(material.uniforms,{uReviewInk:{value:0},uReviewCrease:{value:0},uReviewInkWidth:{value:1}});
 if(material.fragmentShader.includes('float illustratedInk(float depth)')){
  material.fragmentShader=material.fragmentShader
   .replace('  float illustratedInk(float depth){','  uniform float uReviewInk,uReviewCrease,uReviewInkWidth;\n  float illustratedInk(float depth){')
   .replace('vec2 t=1./uResolution;','vec2 t=uReviewInkWidth/uResolution;')
   .replace('float crease=smoothstep(.025,.12,bend)*.12;','float crease=smoothstep(.025,.12,bend)*uReviewCrease;')
   .replace('colour*=1.-illustratedInk(depth)*.43;','colour*=1.-illustratedInk(depth)*uReviewInk;');
  material.needsUpdate=true;return;
 }
 material.fragmentShader=material.fragmentShader
  .replace('  vec3 filteredScene(){',`${inkCode}\n  vec3 filteredScene(){`)
  // Ink is applied after bloom and tone mapping so a bright sunlit edge does
  // not disappear into its own glow. This still affects the 3D layer only.
  .replace('   colour=sRGBTransferOETF(neutralToneMapping(colour));','   colour=sRGBTransferOETF(neutralToneMapping(colour));\n   colour*=1.-reviewInk()*uReviewInk;');
 material.needsUpdate=true;
}

function patchConcourse(view){
 const material=view?.finish;if(!material||seenConcourse.has(material))return;
 seenConcourse.add(material);
 Object.assign(material.uniforms,{uReviewInk:{value:0},uReviewInkWidth:{value:1},uReviewResolution:{value:new THREE.Vector2(1,1)}});
 if(material.fragmentShader.includes('float shipInk(float alpha)')){
  material.fragmentShader=material.fragmentShader
   .replace('  float shipInk(float alpha){','  uniform float uReviewInk,uReviewInkWidth;\n  float shipInk(float alpha){')
   .replace('vec2 t=1./uSceneResolution;','vec2 t=uReviewInkWidth/uSceneResolution;')
   .replace('colour*=1.-shipInk(alpha)*.43;','colour*=1.-shipInk(alpha)*uReviewInk;');
  material.needsUpdate=true;return;
 }
 material.fragmentShader=material.fragmentShader.replace('  void main(){',`
 uniform float uReviewInk,uReviewInkWidth;uniform vec2 uReviewResolution;
 float reviewShipInk(float alpha){
  if(alpha<.85)return 0.;vec2 t=uReviewInkWidth/uReviewResolution;
  float a=texture2D(tScene,vUv+vec2(t.x,0.)).a;
  float b=texture2D(tScene,vUv-vec2(t.x,0.)).a;
  float c=texture2D(tScene,vUv+vec2(0.,t.y)).a;
  float d=texture2D(tScene,vUv-vec2(0.,t.y)).a;
  return 1.-smoothstep(.25,.8,min(min(a,b),min(c,d)));
 }
 void main(){`)
 .replace('   vec3 colour=srgb(uConcourse>.5?vec3(1.)-exp(-radiance*uExposure):neutralToneMapping(radiance))*alpha;',
  '   vec3 colour=srgb(uConcourse>.5?vec3(1.)-exp(-radiance*uExposure):neutralToneMapping(radiance))*alpha;\n   if(uConcourse>.5)colour*=1.-reviewShipInk(alpha)*uReviewInk;');
 material.needsUpdate=true;
}

function setStyle(id){
 // This review module can load before the game's module graph finishes.
 // Detect the integrated finish only when a choice is actually made.
 if(THREE.ShaderChunk.lights_physical_pars_fragment.includes('float illustratedBand=dotNL*5.0;'))choices.current={...choices.illustrated};
 if(!choices[id])throw new Error(`Unknown illustrated style ${id}`);
 current=choices[id];lightStrength.value=current.light;lightSteps.value=current.steps;lightContrast.value=current.contrast;
 const r=window.__VOID_PRIVATEER__.getRuntime(),ren=r.renderer,view=r.ui.concourseShip;
 patchScene(ren.scene);if(view?.scene)patchScene(view.scene);
 for(const material of [ren.pixelResolveMaterial,ren.bloomCompositeMaterial]){
  patchResolve(material);if(!material)continue;
  material.uniforms.uReviewInk.value=current.ink;
  material.uniforms.uReviewCrease.value=current.crease;
  material.uniforms.uReviewInkWidth.value=current.width;
 }
 patchConcourse(view);
 if(view?.finish){
  view.finish.uniforms.uReviewInk.value=current.ink;
  view.finish.uniforms.uReviewInkWidth.value=current.width;
  view.finish.uniforms.uReviewResolution.value.set(view.sceneViewport.z,view.sceneViewport.w);
 }
 return {id,...current};
}

window.comicStyleReview={setStyle,choices};
