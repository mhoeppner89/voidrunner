import * as THREE from 'three';

// Spatial paint masks on the approved hull. Coordinates are unscaled glTF:
// +X bow, +Y up, +Z port. Original UVs, PBR maps and geometry stay shared.
export const WAYFARER_LIVERIES=Object.freeze({
  concord:{name:'Concord · approved paint',faction:'concord',pattern:'Authored navy equipment frame, pale cabin and cowl panels, brass engine belts',original:true},
  alliance:{name:'Alliance · chevrons',faction:'alliance',pattern:'Black dorsal panels, broad gold chevrons on the bow and engine cowls, alternating service containers',main:0x20262b,neutral:0xb4bbc0,accent:0xd5ad4d,
    mask:`
      mainZone=max(step(.075,y),step(.74,x));
      mainZone=max(mainZone,step(x,-.78));
      mainZone=max(mainZone,box3(p,vec3(-.14,-.055,0.),vec3(.069,.10,.14)));
      mainZone=max(mainZone,box3(p,vec3(.18,-.055,0.),vec3(.069,.10,.14)));
      float bowV=x+abs(z)*1.40;
      accentZone=max(band(bowV,.78,.035),band(bowV,.88,.016))*step(.46,x);
      float cowlV=x+abs(z)*.80;
      accentZone=max(accentZone,band(cowlV,-.46,.026)*step(x,-.44)*step(-.65,x));
    `},
  pirates:{name:'Pirates · claw slashes',faction:'pirates',pattern:'Charcoal nose and pods, three burgundy diagonal claw slashes, pale port-side repair panel',main:0x22252a,neutral:0x696b6c,accent:0xa23432,
    mask:`
      mainZone=max(step(.30,x),step(x,-.44));
      mainZone=max(mainZone,step(-.13,y)*step(x,.25));
      float claw=x+1.70*y+.24*abs(z);
      float scratches=max(band(claw,.54,.032),max(band(claw,.41,.022),band(claw,.29,.040)));
      accentZone=scratches*step(.31,x);
      float engineClaw=x+1.45*y;
      accentZone=max(accentZone,max(band(engineClaw,-.50,.024),max(band(engineClaw,-.65,.042),band(engineClaw,-.79,.023)))*step(x,-.44));
      mainZone=max(mainZone,box3(p,vec3(-.29,-.055,0.),vec3(.068,.10,.14)));
      neutralPatch=box3(p,vec3(.31,-.12,.17),vec3(.066,.052,.05));
    `},
  'independent-bands':{name:'Independent · twin bands',faction:'independents',pattern:'Two long teal side stripes, paired transverse engine rings, one contrasting service container',main:0x287679,neutral:0xd0c6aa,accent:0x91babe,
    mask:`
      mainZone=max(band(y,.012,.022),band(y,-.115,.022))*step(.29,x);
      mainZone=max(mainZone,max(band(x,-.67,.034),band(x,-.80,.034))*step(x,-.44));
      mainZone=max(mainZone,box3(p,vec3(.023,-.055,0.),vec3(.067,.10,.14)));
      accentZone=band(y,-.052,.012)*step(.29,x);
      accentZone=max(accentZone,band(x,-.72,.009)*step(x,-.44));
    `},
  'independent-repairs':{name:'Independent · repair panels',faction:'independents',pattern:'Asymmetric replacement panels, rust orange service containers, diagonal safety hatching on fore engine cowls',main:0x414c54,neutral:0xc5bca4,accent:0xaf5c35,
    mask:`
      mainZone=max(box3(p,vec3(.64,-.12,.15),vec3(.12,.10,.05)),box3(p,vec3(-.80,.17,-.10),vec3(.12,.13,.09)));
      mainZone=max(mainZone,box3(p,vec3(-.56,-.23,.12),vec3(.066,.12,.07)));
      accentZone=max(box3(p,vec3(.36,.10,-.12),vec3(.068,.062,.10)),box3(p,vec3(.80,-.18,-.06),vec3(.085,.047,.12)));
      accentZone=max(accentZone,box3(p,vec3(-.135,-.055,0.),vec3(.067,.10,.14)));
      accentZone=max(accentZone,box3(p,vec3(.181,-.055,0.),vec3(.067,.10,.14)));
      float cowl=step(x,-.45)*step(-.58,x);
      float hazard=1.-smoothstep(.43,.48,fract((x+1.8*y+abs(z)*.5)*38.));
      mainZone=max(mainZone,cowl);accentZone=max(accentZone,cowl*hazard);
    `},
  'independent-split':{name:'Independent · split panels',faction:'independents',pattern:'Dark lower hull, staggered amber upper panels, diagonal split across each engine, paired container cap stripes',main:0x344958,neutral:0xb5b7ac,accent:0xb99855,
    mask:`
      mainZone=1.-smoothstep(-.07,-.061,y);
      float podY=y>.0?y-.133:y+.224;
      float split=step(podY+(x+.73)*.38,0.);
      mainZone=max(mainZone,step(x,-.44)*split);
      accentZone=max(box3(p,vec3(.56,.08,0.),vec3(.09,.15,.30)),box3(p,vec3(.87,-.12,0.),vec3(.042,.10,.30)));
      accentZone=max(accentZone,step(x,-.44)*band(podY+(x+.73)*.38,0.,.016));
      float caps=max(band(x,-.343,.010),max(band(x,-.027,.010),max(band(x,-.086,.010),band(x,.230,.010))));
      accentZone=max(accentZone,caps*box3(p,vec3(-.05,-.055,0.),vec3(.31,.10,.14)));
    `}
});

export const WAYFARER_INDEPENDENT_LIVERIES=Object.freeze([
  'independent-bands','independent-repairs','independent-split'
]);

// An entity's stable ID keeps its independent paint consistent between loads.
export function resolveWayfarerLivery(faction='concord',seed=''){
  if(WAYFARER_LIVERIES[faction])return faction;
  if(faction!=='independents')return 'concord';
  let hash=2166136261;const key=String(seed);
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
  return WAYFARER_INDEPENDENT_LIVERIES[hash%WAYFARER_INDEPENDENT_LIVERIES.length];
}

const declarations=`
  uniform vec3 wfMain,wfNeutral,wfAccent;
  uniform float wfPatternContrast;
  varying vec3 wfPaintPosition;
  float band(float value,float center,float width){
    float aa=max(fwidth(value),.0008);
    return 1.-smoothstep(width-aa,width+aa,abs(value-center));
  }
  float box3(vec3 p,vec3 center,vec3 halfSize){
    vec3 aa=max(fwidth(p),vec3(.0008));
    vec3 edge=1.-smoothstep(halfSize-aa,halfSize+aa,abs(p-center));
    return edge.x*edge.y*edge.z;
  }
`;

function paintMaterial(source,frame,id,contrast){
  const scheme=WAYFARER_LIVERIES[id];
  if(!source.isMeshStandardMaterial||!source.map||/^VR_Canopy_|glass|window|emissive/i.test(source.name))return source;
  if(scheme.original&&!contrast)return source;
  const material=source.clone();
  material.userData.wayfarerPaintOwned=true;material.userData.wayfarerLivery=id;
  material.onBeforeCompile=shader=>{
    shader.uniforms.wfMain={value:new THREE.Color(scheme.main??0x23394e)};
    shader.uniforms.wfNeutral={value:new THREE.Color(scheme.neutral??0xbdbaa5)};
    shader.uniforms.wfAccent={value:new THREE.Color(scheme.accent??0xc6a048)};
    shader.uniforms.wfPatternContrast={value:contrast?1:0};
    shader.uniforms.wfPaintFrame={value:frame};
    shader.vertexShader='uniform mat4 wfPaintFrame; varying vec3 wfPaintPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwfPaintPosition=(wfPaintFrame*vec4(position,1.)).xyz;');
    shader.fragmentShader=declarations+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 p=wfPaintPosition;float x=p.x,y=p.y,z=p.z;
      float mainZone=0.,accentZone=0.,neutralPatch=0.;
      float sourceRow=floor(clamp(1.-vMapUv.y,0.,.9999)*8.);
      ${scheme.original?'mainZone=band(sourceRow,6.,.10);accentZone=max(band(sourceRow,5.,.10),band(sourceRow,4.,.10));':scheme.mask}
      mainZone=clamp(mainZone,0.,1.);accentZone=clamp(accentZone,0.,1.);
      vec3 paint=mix(wfNeutral,wfMain,mainZone);
      paint=mix(paint,wfAccent,accentZone);paint=mix(paint,wfNeutral,neutralPatch);
      // Normalize the old atlas color by its measured row luminance while
      // preserving its fine wear, seams and fasteners beneath the new layout.
      float lum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      float ref=sourceRow>6.5?.514262:sourceRow>5.5?.040971:sourceRow>4.5?.269705:.095220;
      float detail=clamp(lum/ref,.08,1.18);
      float coating=step(3.5,sourceRow);
      vec3 finish=paint*detail;
      if(wfPatternContrast>.5){
        float grey=mix(.48,.08,mainZone);grey=mix(grey,.90,accentZone);grey=mix(grey,.48,neutralPatch);
        finish=vec3(grey);coating=step(3.5,sourceRow);
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,finish,coating);
    `);
  };
  material.customProgramCacheKey=()=>`wayfarer-paint-pattern-v1-${id}-${contrast?1:0}`;
  material.needsUpdate=true;return material;
}

export function applyWayfarerLivery(model,id='concord',{patternContrast=false}={}){
  if(!WAYFARER_LIVERIES[id])throw new Error('Unknown Wayfarer paint: '+id);
  model.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(model.matrixWorld).invert();
  model.traverse(node=>{
    if(!node.isMesh)return;
    const frame=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld);
    const apply=source=>paintMaterial(source,frame,id,patternContrast);
    node.material=Array.isArray(node.material)?node.material.map(apply):apply(node.material);
  });
  model.userData.wayfarerLivery=id;model.userData.patternContrast=patternContrast;
}

export function disposeWayfarerPaint(model){
  const disposed=new Set();model.traverse(o=>{if(!o.isMesh)return;const source=o.userData.originalMaterial??o.material;for(const m of Array.isArray(source)?source:[source]){
    if(m.userData.wayfarerPaintOwned&&!disposed.has(m)){m.dispose();disposed.add(m);}
  }});
}
