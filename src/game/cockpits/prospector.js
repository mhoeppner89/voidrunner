// Layout and composition approved for live flight on 2026-11-17.
// Approved layout; painted composition approved for flight.
// Gaia's short roof and raked posts stay angular, unlike Mercury's curved bow.
export function createProspectorCockpit(base){
    return {
        ...base,
        // Measure the generated alpha openings; preserve the original PNG.
        monitors:{own:{x:408,y:630,width:329,height:179},radar:{x:792,y:656,width:268,height:160},target:{x:1115,y:630,width:327,height:179}},
        screenInsets:{own:{x:8,y:0},radar:{x:5,y:0},target:{x:8,y:0}},
        housingTops:{radar:560},hyperdriveBottom:610,handOffsetX:-60,
        id:'prospector',name:'Gaia',status:'approved',continuousBow:false,
        width:1850,artworkSize:[1850,850],stickClearanceX:416,
        shell:new URL('../../../assets/cockpits/prospector-paint-v2.png',import.meta.url).href,
    };
}
