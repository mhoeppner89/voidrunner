import * as THREE from 'three';

// Hull-specific paint layouts use local coordinates, independent of the original
// texture colors. Source shading and wear remain; separate glass is excluded.
export const SHIP_LIVERIES = {
    original: {name:"Original hull paint"},
    concord: {name:'Concord · naval blue / pale armor / brass',main:0x345a80,accent:0xd8ad56,neutral:0xd8e0df},
    'frontier-league': {name:'League · black / grey / gold',main:0x181b20,accent:0xc9a348,neutral:0x92999f},
    'free-merchants': {name:'Merchants · teal / copper / ivory',main:0x357c7c,accent:0xd99353,neutral:0xe5dfcc},
    'frontier-miners': {name:'Miners · ochre / steel',main:0xbc9140,accent:0xe0b552,neutral:0xbcc2c1},
    'salvage-union': {name:'Salvage · olive / orange / steel',main:0x637654,accent:0xc4793e,neutral:0xc3c9ba},
    'red-talons': {name:'Red Talons · blood red / charcoal',main:0x560d16,accent:0x821d25,neutral:0x979d9f},
};

// Hull-local layout: x is port/starboard, y is up, z is forward, all normalized.
const HULL_LAYOUTS = {
    wayfarer:[.42,.48,-.44], vanguard:[.28,.5,-.4], lancer:[.38,.38,-.52],
    talon:[.28,.3,-.48], prospector:[.38,.56,-.38], atlas:[.48,.5,-.56],
    speedster:[.42,.45,-.5], astra:[.28,.48,-.35], torsas:[.48,.48,-.45],
    andromeda:[.42,.52,-.42], legionary:[.42,.36,-.45],
    'concord-frigate':[.55,.5,-.55], 'concord-cruiser':[.48,.54,-.58],
    'concord-battleship':[.54,.5,-.6], 'concord-carrier':[.55,.58,-.62],
};
const hullName = name => ({kestrel:'wayfarer',warden:'vanguard','atlas-freighter':'atlas'}[name]??name);
export function shipPaintFrames(model,hull) {
    hull=hullName(hull);
    model.updateMatrixWorld(true);
    const inverse=new THREE.Matrix4().copy(model.matrixWorld).invert();
    const bounds=new THREE.Box3(),relative=new Map();
    model.traverse(n=>{if(!n.isMesh)return;n.geometry.computeBoundingBox();
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,n.matrixWorld);
        relative.set(n,matrix);bounds.union(n.geometry.boundingBox.clone().applyMatrix4(matrix));});
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const norm=new THREE.Matrix4().makeScale(2/Math.max(size.x,.001),2/Math.max(size.y,.001),2/Math.max(size.z,.001));
    norm.multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
    const axes=new THREE.Matrix4();
    if(['astra','torsas','andromeda','legionary'].includes(hull))axes.identity();
    else {
        const forward=hull==='speedster'||hull.startsWith('concord-')?-1:1;
        axes.set(0,0,1,0, 0,1,0,0, forward,0,0,0, 0,0,0,1);
    }
    const frames=new Map();
    for(const[n,m]of relative)frames.set(n,new THREE.Matrix4().multiplyMatrices(axes,norm).multiply(m));
    return frames;
}
const PATTERNS = {
    concord: `float mainZone=max(outboard,engineZone); float accentZone=band(z,-0.25,0.026)*step(0.24,abs(x));
        accentZone=max(accentZone,band(abs(x),0.19,0.017)*step(-0.42,z));`,
    'frontier-league': `float mainZone=max(noseZone,outboard*step(z,0.35));
        mainZone=max(mainZone,engineZone*step(0.08,x));
        float accentZone=band(z+abs(x)*0.46,0.27,0.038)*step(-0.15,z);
        accentZone=max(accentZone,band(x,-0.25,0.045)*step(z,-0.25));`,
    'free-merchants': `float mainZone=max(noseZone,engineZone);float accentZone=band(abs(x),0.42,0.065)*step(-0.58,z)*step(z,0.44);
        mainZone=max(mainZone,outboard*step(z,-0.1));`,
    'frontier-miners': `float mainZone=max(outboard,step(-0.15,z));
        float hazard=step(0.5,fract((z+x*.35)*11.0));
        float accentZone=band(z,-0.32,0.1)*hazard;
        mainZone*=1.0-band(z,-0.32,0.1)*(1.0-hazard);`,
    'salvage-union': `float mainZone=max(outboard,engineZone);mainZone=max(mainZone,noseZone*step(x,0.15));
        float accentZone=max(band(z,0.02,0.07)*step(0.25,abs(x)),band(x,-0.2,0.055)*step(0.25,z));`,
    'red-talons': `float mainZone=max(noseZone,engineZone);mainZone=max(mainZone,outboard*step(z,0.25));
        float slash=z+abs(x)*0.8;
        float accentZone=max(band(slash,0.05,0.055),band(slash,-0.16,0.035))*step(0.15,abs(x));`,
};
export function paintShipMaterial(material, faction, frame=new THREE.Matrix4(), hull='wayfarer') {
    const scheme=SHIP_LIVERIES[faction];
    if(faction === "original" || !scheme || !material.isMeshStandardMaterial || !material.map || /canopy|glass|window|engine|emissive/i.test(material.name))return false;
    const layout=HULL_LAYOUTS[hullName(hull)]??HULL_LAYOUTS.wayfarer;
    material.userData.livery=faction;
    material.onBeforeCompile=shader=>{
        shader.uniforms.vrPaintMain={value:new THREE.Color(scheme.main)};
        shader.uniforms.vrPaintAccent={value:new THREE.Color(scheme.accent)};
        shader.uniforms.vrPaintNeutral={value:new THREE.Color(scheme.neutral)};
        shader.uniforms.vrPaintFrame={value:frame};
        shader.uniforms.vrPaintLayout={value:new THREE.Vector3(...layout)};
        shader.vertexShader='uniform mat4 vrPaintFrame; varying vec3 vrPaintPosition; varying vec3 vrPaintNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvrPaintPosition=(vrPaintFrame*vec4(position,1.0)).xyz; vrPaintNormal=normalize(mat3(vrPaintFrame)*normal);');
        shader.fragmentShader=`uniform vec3 vrPaintMain;
            uniform vec3 vrPaintAccent;uniform vec3 vrPaintNeutral;uniform vec3 vrPaintLayout;
            varying vec3 vrPaintPosition;varying vec3 vrPaintNormal;
            float band(float value,float center,float width){float aa=max(fwidth(value),0.001);return 1.0-smoothstep(width-aa,width+aa,abs(value-center));}
            `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            vec3 originalPaint = diffuseColor.rgb;
            float paintLum = dot(originalPaint,vec3(0.2126,0.7152,0.0722));
            float x=vrPaintPosition.x;float z=vrPaintPosition.z;
            float aa=max(fwidth(z),0.002);
            float noseZone=smoothstep(vrPaintLayout.x-aa,vrPaintLayout.x+aa,z);
            float engineZone=1.0-smoothstep(vrPaintLayout.z-aa,vrPaintLayout.z+aa,z);
            float outboard=smoothstep(vrPaintLayout.y-aa,vrPaintLayout.y+aa,abs(x));
            ${PATTERNS[faction]}
            vec3 schemePaint=mix(vrPaintNeutral,vrPaintMain,mainZone);
            schemePaint=mix(schemePaint,vrPaintAccent,accentZone);
            // Leave dark machinery and grooves exposed. Compress broad old color values
            // while retaining their high-frequency wear, panel lines and shading.
            float paintHi=max(originalPaint.r,max(originalPaint.g,originalPaint.b));
            float paintLo=min(originalPaint.r,min(originalPaint.g,originalPaint.b));
            float chroma=(paintHi-paintLo)/max(paintHi,0.001);
            float coating=max(smoothstep(0.004,0.055,paintLum),smoothstep(0.2,0.5,chroma)*smoothstep(0.0005,0.004,paintLum));
            float detail=0.32+0.68*pow(clamp(paintLum*1.7,0.0,1.0),0.45);
            vec3 finish=schemePaint*detail;
            diffuseColor.rgb=mix(vec3(paintLum),finish,coating*0.97);
            float exhaustFace=(1.0-smoothstep(-0.7,-0.58,z))*smoothstep(0.55,0.8,-normalize(vrPaintNormal).z);
            diffuseColor.rgb=mix(diffuseColor.rgb,originalPaint,exhaustFace);
        `);
    };
    material.customProgramCacheKey=()=>`voidrunner-layout-v2-${faction}`;
    material.needsUpdate=true;
    return true;
}
export function applyShipLivery(model,faction,hull='wayfarer'){
    const frames=shipPaintFrames(model,hull);
    model.traverse(node=>{
        if(!node.isMesh)return;
        const repaint=source=>{const copy=source.clone();paintShipMaterial(copy,faction,frames.get(node),hull);return copy;};
        node.material=Array.isArray(node.material)?node.material.map(repaint):repaint(node.material);
    });
    model.userData.livery=faction;
}

export function stationShipFaction(station,hull){
    if(['haven','league-yard','cinderfall'].includes(station))return 'frontier-league';
    if(['rook','argent'].includes(station)||station==='gatehouse-twelve'&&hull==='vanguard')return 'concord';
    if(station==='blackglass')return 'red-talons';
    if(station==='cairn'||station==='shepherd')return 'salvage-union';
    if(station==='cinder'||station==='torchwell')return 'frontier-miners';
    return 'free-merchants';
}
