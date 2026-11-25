import {createVanguardCockpit} from './cockpits/vanguard.js';
import {createLancerCockpit} from './cockpits/lancer.js';
import {createAtlasCockpit} from './cockpits/atlas.js';
import {createBladeCockpit} from './cockpits/blade.js';
import {createAstraCockpit} from './cockpits/astra.js';
import {createDemonCockpit} from './cockpits/demon.js';
import {createMuleCockpit} from './cockpits/mule.js';
import {createProspectorCockpit} from './cockpits/prospector.js';
import {createLegionaryCockpit} from './cockpits/legionary.js';
import {createAndromedaCockpit} from './cockpits/andromeda.js';
import {createTorsasCockpit} from './cockpits/torsas.js';
import {createScrapperCockpit} from './cockpits/scrapper.js';
import {createSpeedsterCockpit} from './cockpits/speedster.js';
// Single source for the approved glass apertures, shared pilot rig and hull approval state.
const deepFreeze=value=>{for(const item of Object.values(value))if(item&&typeof item==='object')deepFreeze(item);return Object.freeze(value);};
const asset=name=>new URL(`../../assets/cockpits/${name}`,import.meta.url).href;
export const APPROVED_COCKPIT_LAYOUT=deepFreeze({
    width:1851,height:850,housingTop:584,
    hand:asset('wayfarer-hand-pitch-v4.png'),
    // Measured transparent openings, rather than guessed border rectangles.
    monitors:{own:{x:416,y:625,width:318,height:184},radar:{x:800,y:627,width:270,height:182},target:{x:1135,y:625,width:304,height:184}},
    stickBase:{path:asset('wayfarer-stick-base-v1.png'),width:2172,height:724,bounds:{x:672,y:198,width:822,height:360},socket:[1088,280],renderWidth:80},
    strip:{width:2172,height:724,frameWidth:724,renderWidth:339.4475,frames:[{x:0,pivot:[543,413]},{x:724,pivot:[556,413]},{x:1448,pivot:[566,413]}]},
});

export const COCKPITS=deepFreeze({
    vanguard:createVanguardCockpit(APPROVED_COCKPIT_LAYOUT),
    lancer:createLancerCockpit(APPROVED_COCKPIT_LAYOUT),
    atlas:createAtlasCockpit(APPROVED_COCKPIT_LAYOUT),
    blade:createBladeCockpit(APPROVED_COCKPIT_LAYOUT),
    astra:createAstraCockpit(APPROVED_COCKPIT_LAYOUT),

    scrapper:createScrapperCockpit(APPROVED_COCKPIT_LAYOUT),
    speedster:createSpeedsterCockpit(APPROVED_COCKPIT_LAYOUT),
    wayfarer:{...APPROVED_COCKPIT_LAYOUT,
        hardware:{xpdr:[664,590,92,24]},hardwareSeat:'top',
        id:'wayfarer',name:'Hestia / Wanderer',status:'approved',shell:asset('wayfarer-paint-atlas-v2.png')},
    // Fit live glass to the approved v4 painting. Never repaint it to chase a
    // subpixel DOM alignment error. Insets keep readouts clear of bevel corners.
    talon:{...APPROVED_COCKPIT_LAYOUT,width:1850,
        hardware:{xpdr:[620,586,104,28]},
        monitors:{own:{x:423,y:634,width:299,height:161},radar:{x:799,y:653,width:255,height:161},target:{x:1129,y:634,width:294,height:161}},
        screenInsets:{own:{x:10,y:6},radar:{x:5,y:5},target:{x:20,y:6}},
        housingTops:{radar:560},hyperdriveBottom:633,stickClearanceX:416,
        id:'talon',name:'Mercury',status:'approved',shell:asset('talon-paint-v4.png'),
        artworkSize:[1850,850],glassUnderlap:3,handOffsetX:-60},
    demon:createDemonCockpit(APPROVED_COCKPIT_LAYOUT),
    mule:createMuleCockpit(APPROVED_COCKPIT_LAYOUT),
    prospector:createProspectorCockpit(APPROVED_COCKPIT_LAYOUT),
    legionary:createLegionaryCockpit(APPROVED_COCKPIT_LAYOUT),
    andromeda:createAndromedaCockpit(APPROVED_COCKPIT_LAYOUT),
    torsas:createTorsasCockpit(APPROVED_COCKPIT_LAYOUT),
});
export const STARTER_COCKPIT=COCKPITS.wayfarer;
export const getCockpitDefinition=(id,{review=false}={})=>{
    const cockpit=Object.hasOwn(COCKPITS,id)?COCKPITS[id]:undefined;
    return cockpit&&(review||cockpit.status==='approved')?cockpit:undefined;
};
export const hasPaintedCockpit=id=>Boolean(getCockpitDefinition(id));
export const paintedCockpitAssets=id=>{
    const c=getCockpitDefinition(id);
    return c?[c.shell,c.hand,c.stickBase.path,...(c.forwardHull?[c.forwardHull]:[])]:[];
};
// Export metadata for external art tools; the JSON is generated, not another layout authority.
export const cockpitManifest=id=>{
    const c=getCockpitDefinition(id,{review:true});if(!c)throw new Error(`Unknown cockpit: ${id}`);
    const path=url=>'/assets/'+new URL(url).pathname.split('/assets/').at(-1);
    return {version:4,width:c.width,height:c.height,shell:c.shell?path(c.shell):null,...(c.structure?{structure:c.structure}:{}),...(c.forwardHull?{forwardHull:{path:path(c.forwardHull),...c.forwardHullPlacement}}:{}),monitors:c.monitors,housingTop:c.housingTop,...(c.housingTops?{housingTops:c.housingTops,hyperdriveBottom:c.hyperdriveBottom}:{}),
        handStrip:{path:path(c.hand),...c.strip},stickBase:{...c.stickBase,path:path(c.stickBase.path)}};
};
// Geometry shared by live flight and the authoring view. Measurements are the
// shipping DOM controls in local HUD pixels, after removing previous stick sizing.
export function cockpitLayout(c,W,H,{jumpHeight,baseline,throttle,corners}){
    const monitors=Object.fromEntries(Object.entries(c.monitors).map(([id,a])=>[id,{x:a.x/c.width*W,y:a.y/c.height*H,width:a.width/c.width*W,height:a.height/c.height*H}]));
    // Hardware faces are measured in the original painting. The XPDR touch
    // extension grows upwards from the bezel, away from the monitor glass.
    // LOCK mirrors XPDR across the radar axis, so the pair always flanks the
    // centre stack symmetrically (user request).
    const [fx, fy, fw, fh] = c.hardware.xpdr, axis = c.hardwareAxis ?? c.monitors.radar.x + c.monitors.radar.width/2;
    const scaled = x => ({x:x/c.width*W, y:fy/c.height*H, width:fw/c.width*W, height:fh/c.height*H});
    // Phones shrink the painting; like the hyperdrive plate, the faces keep a
    // readable minimum, growing vertically about their centre and outboard.
    // A plate seated on a housing's top edge keeps its foot and grows upwards.
    const readable = (r, outboard) => {
        const width = Math.max(r.width, 46), height = Math.max(r.height, 15);
        const y = c.hardwareSeat === 'top' ? r.y+r.height-height : r.y-(height-r.height)/2;
        return {x:r.x-(outboard < 0 ? width-r.width : 0), y, width, height};
    };
    const left = fx+fw/2 < axis;
    const hardware = {xpdr:readable(scaled(fx), left ? -1 : 1), lock:readable(scaled(2*axis-fx-fw), left ? 1 : -1)};
    const face = hardware.xpdr;
    const strip = c.xpdrHitStrip;
    const width = strip ? strip.width/c.width*W : Math.max(44, face.width+12);
    const height = Math.max(strip ? 56 : 44, face.height+8);
    const hyperWidth=Math.max(104,Math.min(monitors.radar.width*.96,200));
    const hyper={x:monitors.radar.x+(monitors.radar.width-hyperWidth)/2,y:H*(c.hyperdriveBottom??c.housingTop)/c.height-jumpHeight,width:hyperWidth,height:jumpHeight};
    // Beside the hyperdrive plate, the extra width grows outboard so the two
    // touch areas never share a pixel.
    const centred = face.x+(face.width-width)/2;
    const hitX = strip ? strip.x/c.width*W : face.x < hyper.x ? Math.min(centred, hyper.x-width) : Math.max(centred, hyper.x+hyper.width);
    hardware.hit = {x:hitX, y:face.y+face.height-height, width, height};
    const edge=(c.stickClearanceX??c.monitors.own.x)/c.width*W-W*.012,stickSize=Math.max(baseline.width,Math.min(230,edge-24,baseline.width+Math.max(0,throttle.y-corners.bottom-8)));
    return {monitors,hardware,hyper,stickSize,stickTranslate:(edge-stickSize)/2-baseline.x,bleed:Math.max(1.5,(c.glassUnderlap??3)*Math.max(W/c.width,H/c.height))};
}

// Optional stencil for code-only layout guides. Approved painted frames keep
// their original pixels; fit each live monitor to its measured opening instead.
export const cockpitApertureClip=c=>'M0,0 H1 V1 H0 Z '+Object.values(c.monitors).map(r=>
    `M${r.x/c.width},${r.y/c.height} h${r.width/c.width} v${r.height/c.height} h${-r.width/c.width} Z`).join(' ');
