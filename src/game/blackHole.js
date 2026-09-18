import * as THREE from 'three';
// A single sky quad: dark shadow, accretion disk and the lensed far-side disk.
// Fixed apparent orientation, no geometry/depth overlap and no full-screen pass.
export function createBlackHole() {
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
 vertexShader:`varying vec2 uvp;void main(){uvp=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`precision highp float;varying vec2 uvp;
 float band(float d,float w){return exp(-d*d/(w*w));}
 void main(){
  vec2 p=(uvp-.5)*vec2(3.7,2.25);float r=length(p);float hole=.36;
  float ellipse=length(vec2(p.x,p.y*7.));
  float disk=band(ellipse-.83,.36)*smoothstep(.36,.48,ellipse)*(1.-smoothstep(1.42,1.75,ellipse));
  float detail=1.-smoothstep(.01,.025,fwidth(ellipse));
  float lines=.86+detail*(.08*sin(ellipse*82.+p.x*4.)+.06*sin(ellipse*39.+p.x*3.));
  float arc=band(r-.43,.045)*smoothstep(.025,.15,abs(p.y));
  float arcOuter=band(r-.49,.07)*smoothstep(.04,.2,abs(p.y));
  float photon=band(r-hole,.008)*1.3;
  float glow=band(r-.4,.2)*.1;
  float front=smoothstep(.02,-.025,p.y);
  float outside=smoothstep(hole-.003,hole+.003,r);
  float light=disk*lines*mix(outside,1.,front)+arc*outside+.32*arcOuter+photon+glow*outside;
  light*=1.+.28*p.x;
  vec3 hot=mix(vec3(.82,.24,.045),vec3(1.,.88,.62),clamp(light,0.,1.));
  vec3 color=hot*(1.-exp(-light*1.65));
  float shadow=1.-smoothstep(hole-.002,hole+.002,r);
  float alpha=max(shadow,clamp(light*2.8,0.,1.));
  if(alpha<.003)discard;gl_FragColor=vec4(color,alpha);
 }`});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(630000,383108),material);
 mesh.name='Acheron black hole';mesh.renderOrder=-1;mesh.frustumCulled=false;mesh.raycast=()=>{};
 mesh.onBeforeRender=(_r,_s,camera)=>{mesh.quaternion.copy(camera.quaternion);mesh.updateMatrixWorld();};
 return mesh;
}
