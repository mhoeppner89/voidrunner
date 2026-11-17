// Layout and composition approved for live flight on 2026-11-17.
// Tyr's faceted Alliance fighter bow is surveyed in hull-native +Z space.
// Layout approved; painted composition is approved for live flight.
export function createLegionaryCockpit(base){
    return {
        ...base,
        // Preserve approved glass sizes; center them over the original PNG's
        // measured holes. Insets keep content inside its dimensional gaskets.
        monitors:{
            own:{...base.monitors.own,x:418.71,y:605.89},
            radar:{...base.monitors.radar,x:790.52,y:623.47},
            target:{...base.monitors.target,x:1122.39,y:605.94},
        },
        screenInsets:{own:{x:24,y:17},radar:{x:18,y:20},target:{x:17,y:17}},
        // Fit the original hyperdrive control into the painted cowl face.
        housingTops:{radar:560},hyperdriveBottom:599,handOffsetX:-60,
        stickClearanceX:416,
        continuousBow:false,
        shell:new URL('../../../assets/cockpits/legionary-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],
        id:'legionary',name:'Tyr',status:'approved',
    };
}
