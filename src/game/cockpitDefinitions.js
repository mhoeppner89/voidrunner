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
    wayfarer:{...APPROVED_COCKPIT_LAYOUT,id:'wayfarer',name:'Hestia / Wanderer',status:'approved',shell:asset('wayfarer-paint-atlas-v2.png')},
    // Mercury retains the approved instrument slots and shared pilot rig.
    talon:{...APPROVED_COCKPIT_LAYOUT,monitors:{...APPROVED_COCKPIT_LAYOUT.monitors,radar:{...APPROVED_COCKPIT_LAYOUT.monitors.radar,y:641}},housingTops:{radar:560},hyperdriveBottom:633,id:'talon',name:'Mercury',status:'approved',shell:asset('talon-paint-v8.png'),artworkSize:[1850,850],apertureClip:true,glassUnderlap:3,handOffsetX:-60},
});
export const STARTER_COCKPIT=COCKPITS.wayfarer;
export const getCockpitDefinition=(id,{review=false}={})=>{
    const cockpit=Object.hasOwn(COCKPITS,id)?COCKPITS[id]:undefined;
    return cockpit&&(review||cockpit.status==='approved')?cockpit:undefined;
};
export const hasPaintedCockpit=id=>Boolean(getCockpitDefinition(id));
export const paintedCockpitAssets=id=>{
    const c=getCockpitDefinition(id);
    return c?[c.shell,c.hand,c.stickBase.path]:[];
};
// Export metadata for external art tools; the JSON is generated, not another layout authority.
export const cockpitManifest=id=>{
    const c=getCockpitDefinition(id,{review:true});if(!c)throw new Error(`Unknown cockpit: ${id}`);
    const path=url=>'/assets/'+new URL(url).pathname.split('/assets/').at(-1);
    return {version:4,width:c.width,height:c.height,shell:c.shell?path(c.shell):null,monitors:c.monitors,housingTop:c.housingTop,...(c.housingTops?{housingTops:c.housingTops,hyperdriveBottom:c.hyperdriveBottom}:{}),
        handStrip:{path:path(c.hand),...c.strip},stickBase:{...c.stickBase,path:path(c.stickBase.path)}};
};
// Geometry shared by live flight and the authoring view. Measurements are the
// shipping DOM controls in local HUD pixels, after removing previous stick sizing.
export function cockpitLayout(c,W,H,{jumpHeight,baseline,throttle,corners}){
    const monitors=Object.fromEntries(Object.entries(c.monitors).map(([id,a])=>[id,{x:a.x/c.width*W,y:a.y/c.height*H,width:a.width/c.width*W,height:a.height/c.height*H}]));
    const hyperWidth=Math.max(104,Math.min(monitors.radar.width*.96,200));
    const hyper={x:monitors.radar.x+(monitors.radar.width-hyperWidth)/2,y:H*(c.hyperdriveBottom??c.housingTop)/c.height-jumpHeight,width:hyperWidth,height:jumpHeight};
    const edge=monitors.own.x-W*.012,stickSize=Math.max(baseline.width,Math.min(230,edge-24,baseline.width+Math.max(0,throttle.y-corners.bottom-8)));
    return {monitors,hyper,stickSize,stickTranslate:(edge-stickSize)/2-baseline.x,bleed:Math.max(1.5,(c.glassUnderlap??3)*Math.max(W/c.width,H/c.height))};
}

// A single intact image is clipped only at the locked live glass openings.
// Never resize/move a monitor to accommodate small generative edge errors.
export const cockpitApertureClip=c=>'M0,0 H1 V1 H0 Z '+Object.values(c.monitors).map(r=>
    `M${r.x/c.width},${r.y/c.height} h${r.width/c.width} v${r.height/c.height} h${-r.width/c.width} Z`).join(' ');
