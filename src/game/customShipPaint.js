import * as THREE from 'three';
import {normalizePaintDesign,PAINT_PATTERNS,paintHullId} from './paintDesign.js';
import {SHIP_PAINT_MASKS} from './shipPaintMaskCatalog.js';
import {shipPaintFrames} from './shipLivery.js';

// Only selected custom hulls load masks. Color/pattern changes reuse textures,
// geometry and compiled materials; NPC faction paints keep their existing path.
const textures=new Map(),ready=new Map();
const protectedSurface=new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1);protectedSurface.needsUpdate=true;
const mainPattern=new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1);mainPattern.needsUpdate=true;
function texture(file){
 if(!ready.has(file))ready.set(file,new Promise((resolve,reject)=>{
  new THREE.TextureLoader().load(new URL(`../../assets/paint/${file}`,import.meta.url).href,t=>{
   t.flipY=false;t.colorSpace=THREE.NoColorSpace;t.magFilter=THREE.LinearFilter;
   t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
   textures.set(file,t);resolve(t);
  },undefined,reject);
 }));
 return ready.get(file);
}
export const warmCustomPaint = hull => {
 const masks=SHIP_PAINT_MASKS[paintHullId(hull)];
 return masks?Promise.all([masks.patterns,...Object.values(masks.surfaces)].map(texture)):Promise.resolve([]);
};
export function capturePaintSources(root){
 if(root.paintSources)return;
 root.paintSources=new Map();root.traverse(n=>{if(n.isMesh)root.paintSources.set(n,n.material);});
}
export function restorePaintSources(root){
 if(!root.paintSources)return;
 const sources=new Set([...root.paintSources.values()].flat()),disposed=new Set();
 for(const[n,source]of root.paintSources){
  for(const m of Array.isArray(n.material)?n.material:[n.material])if(!sources.has(m)&&!disposed.has(m)){m.dispose();disposed.add(m);}
  n.material=source;
 }
 root.customPaintState=null;
}
export function customPaintFrames(root,hull){
 let hullRoot=root;
 if(!root.userData.paintHullRoot)root.traverse(n=>{if(n.userData.paintHullRoot)hullRoot=n;});
 const frames=shipPaintFrames(hullRoot,hull);
 // Scrapper's native model already has +Z along its nose. Keep this custom
 // correction local so existing NPC faction finishes remain unchanged.
 if(paintHullId(hull)==='scrapper'){
  const axes=new THREE.Matrix4().set(0,0,1,0,0,1,0,0,1,0,0,0,0,0,0,1);
  for(const frame of frames.values())frame.premultiply(axes);
 }
 // Choose the projection using physical surface normals. Using the normalized
 // position frame here would turn a thin wing's shallow camber into a side.
 const axes=new THREE.Matrix4(),id=paintHullId(hull);
 if(!['astra','torsas','andromeda','legionary','blade','demon','mule','scrapper'].includes(id))axes.set(0,0,1,0,0,1,0,0,id==='speedster'?-1:1,0,0,0,0,0,0,1);
 const inverse=new THREE.Matrix4().copy(hullRoot.matrixWorld).invert();
 frames.normals=new Map();
 for(const node of frames.keys()){
  const physical=new THREE.Matrix4().multiplyMatrices(axes,inverse).multiply(node.matrixWorld);
  frames.normals.set(node,new THREE.Matrix3().getNormalMatrix(physical));
 }
 return frames;
}
export function applyCustomShipPaint(root,hull,value){
 hull=paintHullId(hull);const design=normalizePaintDesign(value,hull),masks=SHIP_PAINT_MASKS[hull];
 if(!design||!masks)return false;
 if(root.customPaintState){
  const state=root.customPaintState;state.design=design;
  for(const uniforms of state.uniforms)updateUniforms(uniforms,design);
  root.userData.paintDesign=design;return true;
 }
 capturePaintSources(root);restorePaintSources(root);
 const state={design,uniforms:[]};root.customPaintState=state;
 // Previews wrap the yawed hull in an equipment assembly; flight clones the
 // yawed hull itself. Normalize in the original hull frame in both cases.
 const frames=customPaintFrames(root,hull);
 root.traverse(node=>{
  if(!node.isMesh)return;
  const coat=source=>{
   const file=masks.surfaces[source?.name];if(!file||!frames.has(node)||!source.isMeshStandardMaterial||!source.map)return source;
   const material=source.clone();material.color.set(0xffffff);
   material.userData.customPaint=true;
   material.onBeforeCompile=shader=>{
    const uniforms={cpMain:{value:new THREE.Color()},cpSecond:{value:new THREE.Color()},cpAccent:{value:new THREE.Color()},
     cpPattern:{value:0},cpFrame:{value:frames.get(node)},cpNormalFrame:{value:frames.normals.get(node)},cpSurface:{value:textures.get(file)??protectedSurface},cpAtlas:{value:textures.get(masks.patterns)??mainPattern}};
    updateUniforms(uniforms,state.design);Object.assign(shader.uniforms,uniforms);state.uniforms.push(uniforms);
    if(!textures.has(file)||!textures.has(masks.patterns))void warmCustomPaint(hull).then(()=>{
     if(root.customPaintState!==state)return;
     uniforms.cpSurface.value=textures.get(file);uniforms.cpAtlas.value=textures.get(masks.patterns);
    }).catch(error=>console.warn('Hull paint masks failed to load',error));
    shader.vertexShader='uniform mat4 cpFrame;uniform mat3 cpNormalFrame;varying vec3 cpPosition,cpNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncpPosition=(cpFrame*vec4(position,1.)).xyz;cpNormal=normalize(cpNormalFrame*normal);');
    shader.fragmentShader='uniform vec3 cpMain,cpSecond,cpAccent;uniform float cpPattern;uniform sampler2D cpSurface,cpAtlas;varying vec3 cpPosition,cpNormal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec4 coat=texture2D(cpSurface,vMapUv);
     vec3 facing=abs(cpNormal);
     float profile=step(max(facing.y,facing.z),facing.x);
     float pane=profile*(cpNormal.x<0.?1.:2.);
     vec2 plan=vec2(cpPosition.x*.5+.5,.5-cpPosition.z*.5);
     vec2 side=vec2(cpPosition.z*.5+.5,.5-cpPosition.y*.5);
     vec2 local=(clamp(mix(plan,side,profile),0.,1.)*191.+.5)/192.;
     vec2 patternUv=(local+vec2(cpPattern,pane))/vec2(4.,3.);
     vec3 weights=texture2D(cpAtlas,patternUv).rgb;
     weights/=max(dot(weights,vec3(1.)),.001);
     vec3 pigment=weights.r*cpMain+weights.g*cpSecond+weights.b*cpAccent;
     float sourceLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
     float detail=clamp(sourceLum/max(coat.r*coat.r,.0004),.03,1.35);
     diffuseColor.rgb=mix(diffuseColor.rgb,pigment*detail,coat.g);
    `);
   };
   material.customProgramCacheKey=()=> 'voidrunner-custom-hull-paint-v2';material.needsUpdate=true;return material;
  };
  node.material=Array.isArray(node.material)?node.material.map(coat):coat(node.material);
 });
 root.userData.paintDesign=design;return true;
}
function updateUniforms(uniforms,design){
 uniforms.cpMain.value.set(design.colors[0]);uniforms.cpSecond.value.set(design.colors[1]);uniforms.cpAccent.value.set(design.colors[2]);
 uniforms.cpPattern.value=PAINT_PATTERNS.findIndex(p=>p.id===design.pattern);
}
