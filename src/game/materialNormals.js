import * as THREE from 'three';

// A collapsed tangent frame must retain the geometric normal. Undefined
// lighting values otherwise enter HDR and spread through the bloom filter.
const stableMaterials=new WeakMap();
const SAFE_NORMAL_MAPS=THREE.ShaderChunk.normal_fragment_maps.replace('normal = normalize( tbn * mapN );',`vec3 mappedNormal=tbn*mapN;
 float mappedLength=dot(mappedNormal,mappedNormal);
 normal=mappedLength>1e-8&&mappedLength<1e8?mappedNormal*inversesqrt(mappedLength):normal;`);
export function stabilizeMaterialNormals(material){
 if(!material?.normalMap||stableMaterials.get(material)===material.onBeforeCompile)return;
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',SAFE_NORMAL_MAPS);};
 material.customProgramCacheKey=()=>key+'-stable-normal-v1';
 stableMaterials.set(material,material.onBeforeCompile);
}
