// Layout and composition approved for live flight on 2026-11-17.
// Morrigan's layout is approved; painted composition is approved for flight. Preserve the original generated PNG and the shared pilot rig.
export function createDemonCockpit(base){
    return {
        ...base,
        // Keep approved live display sizes, centered on measured alpha holes.
        // Insets protect the original dimensional bezels without a stencil.
        hardware:{xpdr:[670,582,104,30]},
        monitors:{
            own:{...base.monitors.own,x:415.36,y:617.48},
            radar:{...base.monitors.radar,x:790.48,y:638.51},
            target:{...base.monitors.target,x:1126.18,y:617.69},
        },
        screenInsets:{own:{x:14,y:20},radar:{x:18,y:23},target:{x:8,y:20}},
        housingTops:{radar:560},hyperdriveBottom:633,
        // Preserve the approved touch area, hand/base assets, scale and socket.
        stickClearanceX:416,handOffsetX:-60,
        continuousBow:false,
        shell:new URL('../../../assets/cockpits/demon-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:3,
        // Separate exterior layer; placement approved at 13% forward / 18% outward.
        forwardHull:new URL('../../../assets/cockpits/demon-forward-hull-v1.png',import.meta.url).href,
        forwardHullPlacement:{forward:13,outward:18,width:1851,height:850},
        id:'demon',name:'Morrigan',status:'approved',
    };
}
