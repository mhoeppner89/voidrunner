// Layout and composition approved for live flight on 2026-11-17.
// Freya's approved layout, now approved for live flight.
// Keep the shared instruments and touch areas. Move only the complete hand/base
// rig onto the projected left deck, as in the approved Mercury composition.
export function createTorsasCockpit(base){
    return {
        ...base,
        // Original PNG remains intact. Fit glass to its measured alpha holes;
        // x dimensions account for its 1850px image on the 1851px guide grid.
        monitors:{
            own:{x:428*1851/1850,y:628,width:293*1851/1850,height:168},
            radar:{x:797*1851/1850,y:658,width:258*1851/1850,height:157},
            target:{x:1131*1851/1850,y:628,width:293*1851/1850,height:168},
        },
        screenInsets:{own:{x:8,y:9},radar:{x:10,y:9},target:{x:8,y:9}},
        stickClearanceX:416,
        housingTops:{radar:560},hyperdriveBottom:633,handOffsetX:-60,
        continuousBow:false,
        id:'torsas',name:'Freya',status:'approved',
        shell:new URL('../../../assets/cockpits/torsas-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:3,
    };
}
