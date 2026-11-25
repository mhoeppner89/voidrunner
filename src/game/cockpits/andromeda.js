// Layout and composition approved for live flight on 2026-11-17.
// Thor's layout was approved on 2026-11-16. Painted composition is approved for flight; Keep the original PNG intact.
export function createAndromedaCockpit(base){
    return {
        ...base,
        // Approved display sizes, gently centered on the original alpha holes.
        // The plates cover the twin vents beside the cowl completely.
        hardware:{xpdr:[624,576,128,34]},
        monitors:{
            own:{...base.monitors.own,x:419,y:627.5},
            radar:{...base.monitors.radar,x:793.5,y:648.5},
            target:{...base.monitors.target,x:1123.5,y:627.5},
        },
        screenInsets:{own:{x:12,y:11},radar:{x:11,y:14},target:{x:8,y:11}},
        housingTops:{radar:560},hyperdriveBottom:633,
        // Preserve the approved input geometry and complete fixed-socket rig.
        stickClearanceX:416,handOffsetX:-60,
        continuousBow:false,
        shell:new URL('../../../assets/cockpits/andromeda-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:3,
        id:'andromeda',name:'Thor',status:'approved',
    };
}
