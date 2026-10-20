import * as THREE from 'three';
// Filter inputs must be finite before interpolation/downsampling. One invalid
// HDR texel can otherwise poison a whole rectangular glow footprint.
export const FINITE_COLOUR_GLSL=`vec3 finiteColour(vec3 c){return vec3(
 c.r>=0.?min(c.r,65504.):0.,c.g>=0.?min(c.g,65504.):0.,c.b>=0.?min(c.b,65504.):0.);}`;
// Minify real scene detail before the final pixel output. Depth prevents
// distant scenery from smearing nearby hulls; the sky keeps its sharp stars.
export function createPixelResolveMaterial(){
 return new THREE.ShaderMaterial({
  uniforms:{tScene:{value:null},tDepth:{value:null},tBloom:{value:null},uStrength:{value:0},uExposure:{value:1.18},uResolution:{value:new THREE.Vector2(1,1)},uNearFar:{value:new THREE.Vector2(.5,1e8)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`
  uniform sampler2D tScene,tDepth,tBloom;
  uniform float uStrength,uExposure;
  uniform vec2 uResolution,uNearFar;
  varying vec2 vUv;
  ${FINITE_COLOUR_GLSL}
  float viewDistance(float d){return uNearFar.x/max(.00000001,1.0-d*(1.0-uNearFar.x/uNearFar.y));}
  vec3 sceneSample(vec2 uv,vec3 centre,float distance){
   float d=texture2D(tDepth,uv).r;
   float keep=step(distance*.85,viewDistance(d));
   return mix(centre,finiteColour(texture2D(tScene,uv).rgb),keep);
  }
  vec3 filteredScene(){
   vec3 centre=finiteColour(texture2D(tScene,vUv).rgb);
   float depth=texture2D(tDepth,vUv).r;
   if(depth>=.9999999)return centre;
   float distance=viewDistance(depth),softness=smoothstep(20000.,80000.,distance);
   if(softness<.001)return centre;
   vec2 offset=vec2(.75)/uResolution;
   vec3 neighbours=sceneSample(vUv+vec2(offset.x,0.),centre,distance)+sceneSample(vUv-vec2(offset.x,0.),centre,distance)
    +sceneSample(vUv+vec2(0.,offset.y),centre,distance)+sceneSample(vUv-vec2(0.,offset.y),centre,distance);
   return mix(centre,centre*.5+neighbours*.125,softness);
  }
  vec3 neutralToneMapping(vec3 color){
   float startCompression=.76,desaturation=.15;
   color*=uExposure;
   float x=min(color.r,min(color.g,color.b));
   float offset=x<.08?x-6.25*x*x:.01125;
   color+=offset;
   float peak=max(color.r,max(color.g,color.b));
   if(peak<startCompression)return color;
   float d=1.-startCompression,newPeak=1.-d*d/(peak+d-startCompression);
   color*=newPeak/peak;
   float g=1.-1./(desaturation*(peak-newPeak)+1.);
   return mix(color,vec3(newPeak),g);
  }
  vec3 sRGBTransferOETF(vec3 color){return mix(color*12.92,1.055*pow(max(color,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),color));}
  void main(){
   vec3 colour=filteredScene();
   if(uStrength>0.)colour+=finiteColour(texture2D(tBloom,vUv).rgb)*uStrength;
   colour=sRGBTransferOETF(neutralToneMapping(colour));
   gl_FragColor=vec4(colour,1.);
  }`,
  depthTest:false,depthWrite:false,toneMapped:false,
 });
}
export function pixelTargetSamples(renderer){
 const gl=renderer?.getContext?.();
 if(!gl?.getInternalformatParameter)return 0;
 const counts=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
 // Do not silently promote a 2x budget to 4x HDR colour/depth resolves.
 return counts?.includes(2)?2:0;
}
export function createPixelSceneTarget(width,height,samples=0){
 const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false,colorSpace:THREE.LinearSRGBColorSpace,samples});
 target.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);
 return target;
}
export function bindPixelResolve(material,texture,target,camera,exposure){
 const u=material.uniforms;u.tScene.value=texture;u.tDepth.value=target.depthTexture;
 u.uResolution.value.set(target.width,target.height);u.uNearFar.value.set(camera.near,camera.far);u.uExposure.value=exposure;
}
