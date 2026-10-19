import * as THREE from 'three';
import {DECK_MASK_GLSL} from './concourseDeck.js';

// The painted deck cannot reflect a new hull. A small, softly filtered planar
// capture supplies just that reflection; it is cached between hover frames.
export class ConcourseReflection {
 constructor(deckUniforms){
  this.target=new THREE.WebGLRenderTarget(256,192,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false});
  this.camera=new THREE.OrthographicCamera();this.matrix=new THREE.Matrix4();
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
   uniforms:{...deckUniforms,tReflection:{value:this.target.texture},uMatrix:{value:this.matrix},uOpacity:{value:0},uOrigin:{value:new THREE.Vector2()}},
   vertexShader:'uniform mat4 uMatrix;varying vec4 vReflection;varying vec2 vGround;void main(){vec4 world=modelMatrix*vec4(position,1.);vReflection=uMatrix*world;vGround=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}',
   fragmentShader:`${deckUniforms?DECK_MASK_GLSL:'float deckMask(){return 1.;}'}
uniform sampler2D tReflection;uniform float uOpacity;uniform vec2 uOrigin;varying vec4 vReflection;varying vec2 vGround;
    // A rare undefined lighting sample at a degenerate hull normal must not
    // spread through the filtered HDR capture into a large black floor patch.
    vec4 reflectionSample(vec2 uv){vec4 c=texture2D(tReflection,uv);return all(greaterThanEqual(c,vec4(0.)))&&all(lessThanEqual(c,vec4(60000.)))?c:vec4(0.);}
    void main(){float coverage=deckMask();if(coverage<=0.||uOpacity<=.001)discard;vec2 uv=vReflection.xy/vReflection.w;if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
     vec2 d=vec2(1.7/256.,1.7/192.);vec4 c=reflectionSample(uv)*.4;
     c+=(reflectionSample(uv+d)+reflectionSample(uv-d)+reflectionSample(uv+vec2(d.x,-d.y))+reflectionSample(uv+vec2(-d.x,d.y)))*.15;
     float fade=exp(-length(vGround-uOrigin)*.12);gl_FragColor=vec4(c.rgb/max(c.a,.001),c.a*uOpacity*fade*coverage);
    }`});
  this.plane=new THREE.Mesh(new THREE.PlaneGeometry(60,60),this.material);this.plane.rotation.x=-Math.PI/2;this.plane.position.y=.004;this.plane.renderOrder=-1;this.plane.raycast=()=>{};this.dirty=true;
 }
 configure(opacity){this.opacity=opacity;this.setHeight(1);this.plane.visible=opacity>0;this.dirty=true;}
 setHeight(fade){this.material.uniforms.uOpacity.value=this.opacity*fade;}
 update(view,now){
  if(!this.plane.visible||this.material.uniforms.uOpacity.value<=.001||(view.phase==='idle'&&!this.dirty&&now<this.nextAt))return;
  this.dirty=false;this.nextAt=now+200;
  const {renderer,scene,ground,pivot}=view,camera=view.renderCamera??view.camera,previous=renderer.getRenderTarget(),visible=ground.visible;
  this.camera.copy(camera);this.camera.position.y=-camera.position.y;this.camera.up.set(0,-1,0);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();
  this.matrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
  this.material.uniforms.uOrigin.value.set(pivot.position.x,pivot.position.z);
  this.plane.visible=false;ground.visible=false;
  try{renderer.setRenderTarget(this.target);renderer.render(scene,this.camera);}
  finally{renderer.setRenderTarget(previous);this.plane.visible=true;ground.visible=visible;}
 }
 dispose(){this.plane.geometry.dispose();this.material.dispose();this.target.dispose();}
}
