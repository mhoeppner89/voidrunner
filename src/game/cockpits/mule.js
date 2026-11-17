// Layout and composition approved for live flight on 2026-11-17.
// Argo's layout is approved; the original painted frame is approved for flight.
export function createMuleCockpit(base){
    return {
        ...base,
        // Argo's shallow, faceted freight-cab brow stays angular. Keep the
        // approved readouts/controls and the fixed hand/base rig unchanged.
        continuousBow:false,
        // Keep the reviewed display sizes, centered on the original PNG's
        // measured alpha openings. Fit code to art; never stencil its rims.
        monitors:{
            own:{...base.monitors.own,x:418.5,y:615},
            radar:{...base.monitors.radar,x:794.2,y:643.7},
            target:{...base.monitors.target,x:1128.75,y:615.4},
        },
        screenInsets:{own:{x:22,y:15},radar:{x:20,y:17},target:{x:16,y:16}},
        housingTops:{radar:560},hyperdriveBottom:633,handOffsetX:-60,
        // Monitor fitting must not move the approved touch area or pilot rig.
        stickClearanceX:416,
        id:'mule',name:'Argo',status:'approved',
        shell:new URL('../../../assets/cockpits/mule-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:3,
    };
}
