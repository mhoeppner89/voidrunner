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
            material.emissive.set(0);material.emissiveMap=null;material.emissiveIntensity=0;
            material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;
            material.side=THREE.DoubleSide;material.roughness=.88;material.metalness=.25;
            if(/canopy|glaz|engine cores|navigation|recessed graphite/i.test(material.name)){material.color.set(0x15232d);material.map=null;material.roughness=.65;return material;}
            if(/torn structural alloy/i.test(material.name)){material.map=null;material.color.set(0x62717b);material.roughness=.72;material.metalness=.62;return material;}
            const interior=/charred|torn hull/i.test(material.name);
            if(interior)material.map=null;
            material.color.set(0xffffff);
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
