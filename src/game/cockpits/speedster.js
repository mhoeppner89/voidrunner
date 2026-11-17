// Loki's approved three-pane needle canopy, with separate shared instruments
// and pilot art. Layout and painted composition approved on 2026-11-16.
export function createSpeedsterCockpit(base){
    return {
        ...base,
        id:'speedster',name:'Loki',status:'approved',
        // Fit the live glass to the original generated alpha openings. Keep
        // the detailed PNG intact; content insets clear its chamfered corners.
        width:1850,
        monitors:{own:{x:429,y:627,width:298,height:166},radar:{x:793,y:655,width:263,height:155},target:{x:1123,y:627,width:297,height:166}},
        screenInsets:{own:{x:4,y:10},radar:{x:10,y:6},target:{x:14,y:6}},
        housingTops:{radar:560},hyperdriveBottom:622,stickClearanceX:416,
        shell:new URL('../../../assets/cockpits/speedster-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:3,
        // Move the complete fixed-socket rig onto the projected side deck.
        // Input geometry and the approved hand/base scales remain inherited.
        handOffsetX:-60,
    };
}
