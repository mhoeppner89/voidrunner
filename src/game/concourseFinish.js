import * as THREE from 'three';
import {NEUTRAL_TONE_GLSL,FINITE_COLOUR_GLSL} from './pixelResolve.js';

// One bounded final pass for the raw painted plate and linear HDR ship pass.
// Both layers share one pixel grid. Painted colours pass through unchanged.
export function createConcourseFinish(){
 return new THREE.ShaderMaterial({uniforms:{tScene:{value:null},tBackdrop:{value:null},uBackdropUV:{value:new THREE.Vector4(0,0,1,1)},uHasBackdrop:{value:0},uConcourse:{value:1},uExposure:{value:1.1},uFade:{value:1}},depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D tScene,tBackdrop;uniform vec4 uBackdropUV;uniform float uHasBackdrop,uConcourse,uExposure,uFade;varying vec2 vUv;
  ${NEUTRAL_TONE_GLSL}
  ${FINITE_COLOUR_GLSL}
  vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
  void main(){
   vec4 ship=texture2D(tScene,vUv);float alpha=ship.a;
   vec3 radiance=finiteColour(ship.rgb/max(alpha,.001));
   vec3 colour=srgb(uConcourse>.5?vec3(1.)-exp(-radiance*uExposure):neutralToneMapping(radiance))*alpha;
   if(uConcourse*uHasBackdrop>.5){vec3 plate=texture2D(tBackdrop,uBackdropUV.xy+vUv*uBackdropUV.zw).rgb;colour+=plate*(1.-alpha);alpha=1.;}
   if(alpha<.001){gl_FragColor=vec4(0.);return;}
   colour/=alpha;
   gl_FragColor=vec4(clamp(colour,0.,1.)*alpha*uFade,alpha);
  }`});
}
