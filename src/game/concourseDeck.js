import * as THREE from 'three';

// Top faces of the painted landing pads, in original image UVs (top left).
// These stay fixed to the artwork when a ship flies away or an editor moves it.
export const CONCOURSE_PADS=Object.freeze({
 helix:[[.67,.615],[1,.675],[1,.84],[.86,.925],[.54,.735],[.54,.695]],
 rook:[[.37,.685],[.68,.68],[.85,.77],[.73,.865],[.27,.865],[.2,.79]],
 vesper:[[.375,.57],[.64,.57],[.79,.645],[.79,.705],[.625,.75],[.37,.75],[.21,.69],[.22,.645]],
 azure:[[.235,.57],[.48,.57],[.58,.635],[.53,.72],[.28,.805],[.165,.715],[.1,.65]],
 haven:[[.16,.68],[.75,.68],[.88,.775],[.81,.99],[.08,.99],[.055,.775]],
 'league-yard':[[.33,.75],[.74,.75],[.96,1],[.055,1]],
 cinderfall:[[.25,.79],[.77,.79],[.98,.99],[.04,.99]],
 cairn:[[.34,.595],[.67,.63],[.85,.775],[.53,.91],[.2,.795],[.17,.745]],
 'meridian-prime':[[.045,.71],[.57,.68],[.83,.81],[.63,.99],[.21,.99]],
 argent:[[.24,.665],[.75,.66],[.91,.76],[.56,.95],[.19,.8],[.12,.74]],
 'gatehouse-twelve':[[.22,.61],[.6,.615],[.75,.71],[.51,.92],[.06,.78],[.04,.72]],
 blackglass:[[.12,.69],[.49,.69],[.86,.865],[.73,.98],[.17,.98],[.035,.82]],
 cinder:[[.57,.65],[.85,.68],[.985,.84],[.785,.98],[.36,.8],[.36,.76]],
 torchwell:[[.36,.66],[.75,.68],[.945,.765],[.8,.865],[.49,.86],[.23,.755]],
 nacre:[[0,.69],[.46,.66],[.625,.76],[.6,.82],[.35,.88],[0,.9]],
 boreal:[[.48,.76],[.98,.76],[.98,.98],[.23,.98]],
 shepherd:[[.105,.69],[.33,.685],[.585,.79],[.35,.91],[.09,.81],[.025,.76]],
});
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Small hover clearance keeps a distinct contact shadow. As the hull rises,
// its penumbra spreads and its contrast fades completely before open flight.
export const concourseGroundFade=height=>Math.exp(-Math.max(0,height-.14)*1.35)*(1-smooth((height-.55)/1.65));
export const DECK_MASK_GLSL=`
uniform vec3 uDeckEdges[8];uniform int uDeckEdgeCount;uniform vec2 uDeckResolution;uniform vec4 uDeckUV;
float deckMask(){
 vec2 uv=uDeckUV.xy+(gl_FragCoord.xy/uDeckResolution)*uDeckUV.zw;
 vec2 p=vec2(uv.x*1.77777778,1.-uv.y);float distance=100.;
 for(int i=0;i<8;i++){if(i>=uDeckEdgeCount)break;distance=min(distance,dot(uDeckEdges[i].xy,p)+uDeckEdges[i].z);}
 return smoothstep(0.,.008,distance);
}`;
export class ConcourseDeck {
 constructor(backdropUV){
  this.uniforms={uDeckEdges:{value:Array.from({length:8},()=>new THREE.Vector3())},uDeckEdgeCount:{value:0},uDeckResolution:{value:new THREE.Vector2(1,1)},uDeckUV:backdropUV};
 }
 setLocation(id){
  const points=CONCOURSE_PADS[id]??CONCOURSE_PADS.helix,edges=this.uniforms.uDeckEdges.value;
  this.uniforms.uDeckEdgeCount.value=points.length;
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],dx=(b[0]-a[0])*16/9,dy=b[1]-a[1],length=Math.hypot(dx,dy);
   edges[i].set(-dy/length,dx/length,(dy*a[0]*16/9-dx*a[1])/length);
  }
 }
 clipShadow(material){
  material.depthWrite=false;
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,this.uniforms);
   shader.fragmentShader=DECK_MASK_GLSL+shader.fragmentShader.replace('void main() {','void main() {\nfloat deckCoverage=deckMask();if(deckCoverage<=0.)discard;').replace('#include <fog_fragment>','#include <fog_fragment>\ngl_FragColor.a *= deckCoverage;');
  };
  material.customProgramCacheKey=()=> 'concourse-pad-shadow-v1';
 }
}
