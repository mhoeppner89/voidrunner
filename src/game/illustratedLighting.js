import * as THREE from 'three';

// The approved illustrated finish modifies only the direct-light response:
// existing textures, paints, emissives and indirect light keep their colours.
// Install once in Three's shared shader chunks so existing material hooks,
// instanced geometry and newly loaded ships need no per-frame traversal or
// extra geometry pass. The three chunks are used by the game's lit materials.
const DIRECT_LIGHT='float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const STYLISED_LIGHT=`${DIRECT_LIGHT}
 float illustratedBand=dotNL*5.0;
 float illustratedStep=(floor(illustratedBand)+smoothstep(.30,.70,fract(illustratedBand)))*.2;
 illustratedStep=clamp((illustratedStep-.5)*1.08+.5,0.,1.);
 dotNL=mix(dotNL,illustratedStep,.58);`;
const MARKER='float illustratedBand=dotNL*5.0;';

export function installIllustratedLighting(){
 for(const key of ['lights_physical_pars_fragment','lights_lambert_pars_fragment','lights_phong_pars_fragment']){
  const source=THREE.ShaderChunk[key];
  if(source.includes(MARKER))continue;
  // Three is bundled with the game. Fail visibly during development if an
  // engine update changes the shader contract instead of silently losing it.
  if(!source.includes(DIRECT_LIGHT))throw new Error(`Illustrated lighting: unsupported Three shader chunk ${key}`);
  THREE.ShaderChunk[key]=source.replace(DIRECT_LIGHT,STYLISED_LIGHT);
 }
}

installIllustratedLighting();
