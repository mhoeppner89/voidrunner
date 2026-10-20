import {stabilizeMaterialNormals} from './materialNormals.js';
import * as THREE from 'three';
import {seededRandom} from './random.js';
import {wreckSectionDelta} from './missionWorldData.js';

// One repeating 512² plating sheet for the entire field. No per-wreck texture
// uploads, lights or animated shaders; the old atlas supplies only fine wear.
export function createGraveyardPlating() {
    const size=512, pixels=new Uint8Array(size*size*4), random=seededRandom('mourning-plating');
    // Store broad, smoothly varying damage in the unused alpha channel.
    // One shared upload supplies both plating and soot, without a noise shader.
    const noise=Array.from({length:256},()=>random()),smooth=v=>v*v*(3-2*v);
    const field=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy),at=(a,b)=>noise[((b+16)%16)*16+(a+16)%16];return (at(ix,iy)*(1-u)+at(ix+1,iy)*u)*(1-v)+(at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u)*v;};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
        const col=Math.floor(x/128), row=Math.floor(y/128), xx=x%128, yy=y%128;
        let value=184+((col*7+row*13)%23)+(random()-.5)*11;
        if(xx<2||yy<2)value=48;
        else if(xx===3||yy===3)value=225;
        const panel=(col+row*3)%5;
        if(panel===1&&xx>29&&xx<101&&yy>38&&yy<89) value=yy%8<3?42:87;
        if(panel===2&&xx>24&&xx<104&&yy>27&&yy<99) {
            if(xx<27||xx>100||yy<30||yy>95)value=65;
            else value-=13;
        }
        if((xx-9)**2+(yy-9)**2<5||(xx-118)**2+(yy-118)**2<5)value=56;
        // Tiny serial plates, shallow scratches and flaked paint, at a scale
        // below the readable panel boundaries rather than a noisy full atlas.
        if(xx>13&&xx<35&&yy>107&&yy<112)value=72;
        if(yy>18&&yy<21&&xx>72&&xx<111)value=yy===19?98:210;
        if(random()<.008)value*=.63;
        const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=Math.round(field(x/32,y/32)*255);
    }
    const texture=new THREE.DataTexture(pixels,size,size);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
    return texture;
}

// Prepare the six shared source scenes, then clone their geometry/materials
// for the fourteen casualties. Each shader frame stays in authored model space
// so plate scale and paint continue across the disconnected hull sections.
export function prepareGraveyardModel(root,plating) {
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(), bounds=new THREE.Box3().setFromObject(root);
    const size=bounds.getSize(new THREE.Vector3()), centre=bounds.getCenter(new THREE.Vector3());
    const normalization=new THREE.Matrix4().makeTranslation(-centre.x,-centre.y,-centre.z);
    const length=Math.max(size.x,size.y,size.z);
    const cuts=root.children.some(m=>/Frigate/.test(m.name))?[-.06,-.06]:[-.44,.56];
    const fractureX=new THREE.Vector2(...cuts.map(x=>(x-centre.x)/length));
    normalization.premultiply(new THREE.Matrix4().makeScale(1/length,1/length,1/length));
    root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        if(/hot conduit/i.test(mesh.name)||/^COLLISION /i.test(mesh.name)){mesh.visible=false;return;}
        const frame=normalization.clone().multiply(inverse).multiply(mesh.matrixWorld);
        const sectionBounds=new THREE.Box3().setFromObject(mesh);
        const cutX=new THREE.Vector2((sectionBounds.min.x-centre.x)/length,(sectionBounds.max.x-centre.x)/length);
        const prepare=original=>{
            if(!original?.isMeshStandardMaterial)return original;
            const material=original.clone();
            material.userData.graveyardSource=original.uuid;
            material.emissive.set(0);material.emissiveMap=null;material.emissiveIntensity=0;
            material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;
            material.side=THREE.DoubleSide;material.roughness=.88;material.metalness=.25;
            if(/canopy|glaz|engine cores|navigation|recessed graphite/i.test(material.name)){material.color.set(0x15232d);material.map=null;material.roughness=.65;return material;}
            if(/torn structural alloy/i.test(material.name)){material.map=null;material.color.set(0x62717b);material.roughness=.72;material.metalness=.62;return material;}
            const interior=/charred|torn hull/i.test(material.name);
            if(interior)material.map=null;
            material.color.set(0xffffff);
            material.userData.graveyardBatch={source:original.uuid,frame,cutX};
            material.onBeforeCompile=shader=>{
                shader.uniforms.gyFractureX={value:fractureX};shader.uniforms.gyInterior={value:interior?1:0};shader.uniforms.gyPlating={value:plating};shader.uniforms.gyFrame={value:frame};shader.uniforms.gyCutX={value:cutX};
                shader.vertexShader='uniform mat4 gyFrame; varying vec3 gyPosition; varying vec3 gyNormal;\n'+shader.vertexShader;
                shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
                    gyPosition=(gyFrame*vec4(position,1.)).xyz;
                    gyNormal=normalize(mat3(gyFrame)*normal);`);
                shader.fragmentShader='uniform float gyInterior; uniform sampler2D gyPlating; uniform vec2 gyCutX; uniform vec2 gyFractureX; varying vec3 gyPosition; varying vec3 gyNormal;\n'+shader.fragmentShader;
                shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
                    vec3 gn=abs(normalize(gyNormal));
                    vec2 guv=gn.y>gn.x&&gn.y>gn.z?gyPosition.xz:(gn.z>gn.x?gyPosition.xy:gyPosition.zy);
                    float plating=texture2D(gyPlating,guv*8.).r;
                    vec3 pale=vec3(.57,.64,.68), navy=vec3(.055,.105,.15), brass=vec3(.42,.31,.135);
                    float shoulder=smoothstep(.10,.12,abs(gyPosition.z))*(1.-smoothstep(.20,.22,abs(gyPosition.z)));
                    float belly=1.-smoothstep(-.08,-.04,gyPosition.y);
                    float deck=1.-smoothstep(.035,.055,abs(gyPosition.z));
                    shoulder=max(shoulder,deck*.8);
                    vec3 paint=mix(pale,navy,max(shoulder,belly));
                    float stripe=1.-smoothstep(.009,.014,abs(gyPosition.x+.23));
                    paint=mix(paint,brass,stripe*.8);
                    float fineWear=1.;
                    #ifdef USE_MAP
                        fineWear=.84+.25*dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
                    #endif
                    float cutEdge=1.-smoothstep(.003,.025,min(abs(gyPosition.x-gyCutX.x),abs(gyPosition.x-gyCutX.y)));
                    float impact=1.-smoothstep(.025,.105,length((gyPosition-vec3(.13,.015,-.105))*vec3(1.,1.6,1.)));
                    float noise=texture2D(gyPlating,guv*1.7+vec2(.13,.41)).a;
                    float breakDistance=min(abs(gyPosition.x-gyFractureX.x),abs(gyPosition.x-gyFractureX.y));
                    float breakBand=1.-smoothstep(.008,.064,breakDistance+.032*(noise-.5));
                    float blast=1.-smoothstep(.035,.15,length((gyPosition-vec3(-.08,.015,.11))*vec3(1.,1.3,1.)));
                    float soot=max(max(cutEdge*smoothstep(.30,.7,gn.x),impact*.76),max(breakBand*(.45+.55*noise),blast*noise*.85));
                    vec3 heatStain=mix(vec3(.095,.075,.055),vec3(.025,.033,.038),smoothstep(.25,.7,soot));
                    paint=mix(paint,heatStain,soot*.96);
                    paint=mix(paint,vec3(.105,.14,.16),gyInterior);
                    float backFace=gl_FrontFacing?1.:mix(.42,.8,gyInterior);
                    diffuseColor.rgb=paint*(.35+plating*.90)*fineWear*backFace;
                `);
            };
            material.customProgramCacheKey=()=> 'graveyard-plating-3';
            return material;
        };
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(prepare):prepare(mesh.material);
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])stabilizeMaterialNormals(material);
    });
    return root;
}

export function arrangeGraveyardModel(source,config) {
    const wreck=source.clone(true);
    for(const section of [...wreck.children]) {
        const delta=wreckSectionDelta(config,section.name);
        if(!delta)continue;
        const group=new THREE.Group();group.name=`${section.name} arrangement`;
        group.position.set(...delta.position);group.rotation.set(...delta.rotation);
        wreck.add(group);group.add(section);
    }
    wreck.name=config.id;wreck.rotation.set(...config.rotation);wreck.scale.setScalar(config.scale);
    return wreck;
}

// Keep every triangle, UV and authored damage sample, but submit nearby static
// sections with the same finish together. Damage coordinates are baked before
// applying the broken section's transform, so paint and torn edges do not move.
// Four longitudinal clusters retain useful close-up frustum culling.
function* graveyardBatchBuild(wreck) {
    if(wreck.userData.graveyardBatched)return wreck;
    wreck.updateMatrixWorld(true);
    const inverse=wreck.matrixWorld.clone().invert(),bounds=new THREE.Box3();
    const meshes=[],matrix=new THREE.Matrix4(),point=new THREE.Vector3();
    wreck.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.visible||Array.isArray(mesh.material)||mesh.geometry.morphAttributes.position)return;
        let visible=true;for(let p=mesh.parent;p&&p!==wreck;p=p.parent)visible&&=p.visible;
        if(!visible)return;
        mesh.geometry.computeBoundingBox();
        matrix.multiplyMatrices(inverse,mesh.matrixWorld);
        bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));meshes.push(mesh);
    });
    const size=bounds.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
    const groups=new Map();
    for(const mesh of meshes){
        const material=mesh.material,data=material.userData.graveyardBatch;
        matrix.multiplyMatrices(inverse,mesh.matrixWorld);
        const centre=mesh.geometry.boundingBox.getCenter(point).applyMatrix4(matrix);
        const cluster=Math.min(3,Math.max(0,Math.floor((centre[axis]-bounds.min[axis])/Math.max(.001,size[axis])*4)));
        // Unmodified dark glazing and structural alloy can share only their
        // original material object; the painted variants retain source IDs.
        const key=(data?.source??material.userData.graveyardSource??material.uuid)+'|'+cluster;
        const group=groups.get(key)??{material,parts:[],meshes:[]};groups.set(key,group);
        const geometry=mesh.geometry.clone();
        if(data){
            const positions=geometry.attributes.position,normals=geometry.attributes.normal;
            const local=new Float32Array(positions.count*3),normal=new Float32Array(positions.count*3),cuts=new Float32Array(positions.count*2);
            const direction=new THREE.Vector3(),linear=new THREE.Matrix3().setFromMatrix4(data.frame);
            for(let i=0;i<positions.count;i++){
                point.fromBufferAttribute(positions,i).applyMatrix4(data.frame).toArray(local,i*3);
                direction.fromBufferAttribute(normals,i).applyMatrix3(linear).normalize().toArray(normal,i*3);
                cuts[i*2]=data.cutX.x;cuts[i*2+1]=data.cutX.y;
                if(i%1024===1023)yield;
            }
            geometry.setAttribute('gyLocalPosition',new THREE.BufferAttribute(local,3));
            geometry.setAttribute('gyLocalNormal',new THREE.BufferAttribute(normal,3));
            geometry.setAttribute('gyCutBounds',new THREE.BufferAttribute(cuts,2));
        }
        geometry.applyMatrix4(matrix);group.parts.push(geometry);group.meshes.push(mesh);yield;
    }
    for(const {material,parts,meshes:originals}of groups.values()){
        if(parts.length<2){parts[0]?.dispose();continue;}
        // Loader attributes are packed arrays. Preserve index winding, normal
        // and tangent data rather than rebuilding or simplifying the surface.
        const names=Object.keys(parts[0].attributes);
        if(parts.some(p=>Object.keys(p.attributes).length!==names.length||names.some(n=>p.attributes[n]?.itemSize!==parts[0].attributes[n].itemSize))){for(const p of parts)p.dispose();continue;}
        const geometry=new THREE.BufferGeometry(),count=parts.reduce((n,p)=>n+p.attributes.position.count,0);
        for(const name of names){
            const first=parts[0].attributes[name],array=new first.array.constructor(count*first.itemSize);let offset=0;
            for(const part of parts){array.set(part.attributes[name].array,offset);offset+=part.attributes[name].array.length;}
            geometry.setAttribute(name,new THREE.BufferAttribute(array,first.itemSize,first.normalized));
        }
        const indices=[],sections=[];let offset=0;
        for(let n=0;n<parts.length;n++){const part=parts[n];sections.push({name:originals[n].name,source:originals[n].uuid,start:offset,count:part.attributes.position.count});if(part.index)for(const index of part.index.array)indices.push(index+offset);else for(let i=0;i<part.attributes.position.count;i++)indices.push(i+offset);offset+=part.attributes.position.count;part.dispose();yield;}
        geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
        let finish=material;
        if(material.userData.graveyardBatch){
            finish=material.clone();const compile=material.onBeforeCompile;
            finish.onBeforeCompile=(shader,renderer)=>{
                compile.call(material,shader,renderer);
                shader.vertexShader=shader.vertexShader.replace('uniform mat4 gyFrame;','attribute vec3 gyLocalPosition;attribute vec3 gyLocalNormal;attribute vec2 gyCutBounds;varying vec2 gyCutX;')
                    .replace('gyPosition=(gyFrame*vec4(position,1.)).xyz;','gyPosition=gyLocalPosition;')
                    .replace('gyNormal=normalize(mat3(gyFrame)*normal);','gyNormal=gyLocalNormal;gyCutX=gyCutBounds;');
                shader.fragmentShader=shader.fragmentShader.replace('uniform vec2 gyCutX;','varying vec2 gyCutX;');
            };
            finish.customProgramCacheKey=()=> 'graveyard-plating-batched-v1';
        }
        const mesh=new THREE.Mesh(geometry,finish);mesh.name='Batched wreck sections';mesh.userData.graveyardSections=sections;
        mesh.castShadow=originals[0].castShadow;mesh.receiveShadow=originals[0].receiveShadow;
        wreck.add(mesh);for(const original of originals)original.removeFromParent();
    }
    wreck.userData.graveyardBatched=true;return wreck;
}
export function batchGraveyardModel(wreck){const build=graveyardBatchBuild(wreck);let next;do{next=build.next();}while(!next.done);return next.value;}
export async function batchGraveyardModelAsync(wreck,{shouldCancel=()=>false,budgetMs=3}={}){
    const build=graveyardBatchBuild(wreck);let deadline=performance.now()+budgetMs;
    while(!shouldCancel()){
        const next=build.next();if(next.done)return next.value;
        if(performance.now()>=deadline){await(globalThis.scheduler?.yield?.()??new Promise(resolve=>setTimeout(resolve,0)));deadline=performance.now()+budgetMs;}
    }
    build.return();return null;
}
