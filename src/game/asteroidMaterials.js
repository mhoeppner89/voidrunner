import * as THREE from 'three';
import {stoneNoise} from './asteroidFieldLayout.js';

export const ASTEROID_FINISH_PALETTES = Object.freeze({
    iron: {base:0xe4d6c3,accent:0xd0a060},
    ice: {base:0xb8cee0,accent:0xe6f4ff},
    dark: {base:0xc1b3a5,accent:0xb0483a},
});

// One field-sized sunlight map. Cache it between updates: the major chunks
// are static, while small drifting casters only need a low-frequency refresh.
export function configureAsteroidShadows(renderer,sun,center,size=1024){
    const direction=sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.fromArray(center);sun.target.updateMatrixWorld();
    sun.position.copy(sun.target.position).addScaledVector(direction,6500);
    sun.castShadow=true;
    sun.shadow.mapSize.set(size,size);
    Object.assign(sun.shadow.camera,{left:-2700,right:2700,top:2700,bottom:-2700,near:100,far:12000});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias=-.00045;sun.shadow.normalBias=7;sun.shadow.intensity=.95;
    sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
}

// Keep a soft visibility floor in tunnels, without letting the scene's strong
// ship/station fill flatten unlit rock faces. Direct sunlight is unchanged.
export function applyAsteroidLightResponse(shader){
    // Reuse Three's existing sunlight visibility sample, rather than tracing
    // a second shadow ray. Enclosed rock also receives less artificial fill.
    const lighting=THREE.ShaderChunk.lights_fragment_begin.replace(
        /directLight\.color \*= ([^;]*directionalShadowMap[^;]+);/,
        'float rockShadow=$1; rockSunVisibility=min(rockSunVisibility,rockShadow); directLight.color*=rockShadow;');
    shader.fragmentShader=shader.fragmentShader
        // Cap only long-range haze: nearby walls and tunnels retain their fog.
        .replace('#include <fog_fragment>',THREE.ShaderChunk.fog_fragment.replace(/vFogDepth/g,'min(vFogDepth,6000.0)'))
        .replace('#include <lights_fragment_begin>','float rockSunVisibility=1.0;\n'+lighting)
        .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
float rockFill=0.60*mix(0.35,1.0,rockSunVisibility);
float rockRim=mix(0.45,1.0,rockSunVisibility);
reflectedLight.indirectDiffuse *= rockFill;
reflectedLight.indirectSpecular *= rockFill;
reflectedLight.directDiffuse *= rockRim;
reflectedLight.directSpecular *= rockRim;`);
}

// A single 64px skin wraps each fragment, with matching longitude edges.
// Nearest filtering retains visible stone pixels up close; mipmaps keep tiny
// distant rocks stable. All fragment instances share these three textures.
export function createAsteroidFragmentMaterials(){
    const finishes={iron:[148,140,125],dark:[111,105,96],ice:[188,204,209]};
    return Object.fromEntries(Object.entries(finishes).map(([kind,base],variant)=>{
        const size=64,data=new Uint8Array(size*size*4),phase=variant*27+13;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const angle=x/(size-1)*Math.PI*2,u=Math.cos(angle),v=Math.sin(angle),height=y/(size-1);
            const patch=stoneNoise(u*2.8+phase,v*2.8-19,height*6+31);
            const grain=stoneNoise(u*12+phase,v*12+47,height*21);
            const seam=Math.max(0,1-Math.abs(stoneNoise(u*5+19,v*5+phase,height*10-7))*15);
            const light=.85+patch*.32+grain*.14;
            const at=(y*size+x)*4;
            data[at]=Math.min(255,base[0]*light+seam*17);
            data[at+1]=Math.min(255,base[1]*light+seam*13);
            data[at+2]=Math.min(255,base[2]*light+seam*8);data[at+3]=255;
        }
        const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
        map.name=`asteroid-${kind}-64px`;map.colorSpace=THREE.SRGBColorSpace;
        map.magFilter=THREE.NearestFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
        map.wrapS=THREE.RepeatWrapping;map.wrapT=THREE.ClampToEdgeWrapping;
        map.generateMipmaps=true;map.needsUpdate=true;
        const material=new THREE.MeshStandardMaterial({map,color:0xffffff,roughness:1,metalness:kind==='iron'?.035:.01,flatShading:true});
        material.name=`asteroid-fragment-${kind}`;
        material.onBeforeCompile=applyAsteroidLightResponse;
        material.customProgramCacheKey=()=>'asteroid-fragment-light-v3-distant-haze';
        return [kind,material];
    }));
}
