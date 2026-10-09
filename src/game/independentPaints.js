import * as THREE from 'three';
import {shipPaintFrames} from './shipLivery.js';
export const INDEPENDENT_PAINTS={
 'independent-surveyor':{name:'Independent · Surveyor / teal stripes',base:0xe3ded1,main:0x18777f,accent:0xf5bb55},
 'independent-hauler':{name:'Independent · Industrial / safety blocks',base:0x748a96,main:0x273a49,accent:0xe78938},
 'independent-courier':{name:'Independent · Courier / plum chevrons',base:0xd9d9cf,main:0x65364e,accent:0xc28960},
};
const patterns={
 'independent-surveyor':`float mainZone=band(abs(x),.32+offset,.11)*step(-.72,z);mainZone=max(mainZone,step(.6,z)*step(abs(x),.19));float accentZone=band(abs(x),.46+offset,.023)*step(-.4,z);`,
 'independent-hauler':`float mainZone=max(step(.57+offset,abs(x)),step(z,-.46)*step(.2,abs(x)));mainZone=max(mainZone,step(y,-.5));float accentZone=band(z,-.21+offset,.07)*step(.28,abs(x));accentZone=max(accentZone,band(z+abs(x)*.3,.67,.032)*step(.42,z));`,
 'independent-courier':`float mainZone=max(step(.42+offset,z)*step(abs(x),.58),step(z,-.52)*step(abs(x),.38));mainZone=max(mainZone,band(abs(x),.7,.15)*step(z,-.15));float accentZone=band(z+abs(x)*.72,.38+offset,.045)*step(.16,z);`,
};
export function applyIndependentPaint(root,id,hull){
 const scheme=INDEPENDENT_PAINTS[id];if(!scheme)return;
 const frames=shipPaintFrames(root,hull==='scrapper'?'blade':hull),offset=((hull.split('').reduce((n,c)=>n+c.charCodeAt(0),0)%7)-3)*.018;
 root.traverse(o=>{if(!o.isMesh)return;const paint=source=>{
  if(!source.isMeshStandardMaterial||!source.map||/glass|canopy|window|emissive|exhaust/i.test(source.name)||(/engine/i.test(source.name)&&!/plating/i.test(source.name)))return source;
  const m=source.clone();m.userData.livery=id;m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{ipFrame:{value:frames.get(o)},ipBase:{value:new THREE.Color(scheme.base)},ipMain:{value:new THREE.Color(scheme.main)},ipAccent:{value:new THREE.Color(scheme.accent)}});
   shader.vertexShader='uniform mat4 ipFrame;varying vec3 ipPosition;varying vec3 ipNormal;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nipPosition=(ipFrame*vec4(position,1.)).xyz;ipNormal=normalize(mat3(ipFrame)*normal);');
   shader.fragmentShader='uniform vec3 ipBase,ipMain,ipAccent;varying vec3 ipPosition,ipNormal;float band(float v,float c,float w){float aa=max(fwidth(v),.001);return 1.-smoothstep(w-aa,w+aa,abs(v-c));}\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    vec3 source=diffuseColor.rgb;float lum=dot(source,vec3(.2126,.7152,.0722));float x=ipPosition.x,y=ipPosition.y,z=ipPosition.z,offset=${offset.toFixed(4)};
    ${patterns[id]}
    vec3 finish=mix(ipBase,ipMain,mainZone);finish=mix(finish,ipAccent,accentZone);float coat=smoothstep(.005,.065,lum);float detail=.42+.58*pow(clamp(lum*1.8,0.,1.),.4);
    float exhaust=(1.-smoothstep(-.8,-.57,z))*smoothstep(.5,.85,-normalize(ipNormal).z);diffuseColor.rgb=mix(source,finish*detail,coat*(1.-exhaust));`);
  };m.customProgramCacheKey=()=>`independent-${id}-${hull}`;m.needsUpdate=true;return m;
 };o.material=Array.isArray(o.material)?o.material.map(paint):paint(o.material);});
 root.userData.livery=id;
}
